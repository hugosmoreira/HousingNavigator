// Release preservation audit. Credentials are read only from an explicit local env file.
// Generated baselines belong in ignored storage, never in the repository.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';

const [mode, envPath, baselinePath] = process.argv.slice(2);
if (!['before', 'after', 'results'].includes(mode) || !envPath || !baselinePath) {
  throw new Error('Usage: node scripts/auditResourceSourceRelease.mjs before|after|results ENV_FILE BASELINE_FILE');
}
const env = parse(readFileSync(envPath));
const base = env.VITE_SUPABASE_URL.replace(/\/$/, '');
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.VITE_SUPABASE_ANON_KEY;
const pilotIds = Array.from({ length: 6 }, (_, i) =>
  `66060904-000${i + 1}-4000-8000-00000000000${i + 1}`);
const tables = ['resources', 'resource_service_areas', 'affordable_properties', 'waitlists'];
async function request(path, key = service) {
  return fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}
async function rows(table, query = 'select=*&order=id.asc', key = service) {
  const response = await request(`${table}?${query}`, key);
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
  return response.json();
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().filter(k => !(k === 'cost_details' && value[k] === null))
      .map(k => [k, canonical(value[k])]),
  );
  return value;
}
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const counts = data => Object.fromEntries(Object.entries(data).map(([table, items]) => [table, items.length]));

if (mode === 'before') {
  const data = {};
  for (const table of tables) data[table] = await rows(table);
  if (data.resources.some(row => pilotIds.includes(row.id))) throw new Error('Pilot already exists: preserve the original baseline.');
  writeFileSync(baselinePath, JSON.stringify({ capturedAt: new Date().toISOString(), data }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ baselineSaved: true, counts: counts(data) }));
} else if (mode === 'after') {
  const { data: previous } = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const current = {};
  for (const table of tables) current[table] = await rows(table);
  for (const table of tables) {
    const now = new Map(current[table].map(row => [row.id, row]));
    const changed = previous[table].filter(row => !now.has(row.id) || digest(row) !== digest(now.get(row.id)));
    if (changed.length) throw new Error(`${table}: ${changed.length} existing rows changed or missing: ${changed.map(r => r.id).join(',')}`);
    const oldIds = new Set(previous[table].map(row => row.id));
    const extra = current[table].filter(row => !oldIds.has(row.id));
    if (extra.some(row => table === 'resources' ? !pilotIds.includes(row.id) :
      table === 'resource_service_areas' ? !pilotIds.includes(row.resource_id) : true)) {
      throw new Error(`${table}: unexpected added records`);
    }
  }
  const pilot = current.resources.filter(row => pilotIds.includes(row.id));
  if (pilot.length !== 6 || pilot.some(row => row.published)) throw new Error('Pilot must be exactly six unpublished drafts.');
  const publicPilot = await rows('resources_public', `select=id&id=in.(${pilotIds.join(',')})`, anon);
  const publicAreas = await rows('resource_service_areas', `select=id&resource_id=in.(${pilotIds.join(',')})`, anon);
  if (publicPilot.length || publicAreas.length) throw new Error('Draft content visible anonymously.');
  for (const table of ['resource_source_states', 'resource_source_findings', 'resource_source_attempts']) {
    const response = await request(`${table}?select=*&limit=1`, anon);
    if (response.ok && (await response.json()).length) throw new Error(`${table}: private records visible anonymously`);
    if (!response.ok && ![401, 403].includes(response.status)) throw new Error(`${table}: unexpected HTTP ${response.status}`);
  }
  console.log(JSON.stringify({ preserved: counts(previous), current: counts(current), pilotDrafts: 6, anonymousDrafts: 0, anonymousPrivateData: 0 }));
} else {
  const filter = `resource_id=in.(${pilotIds.join(',')})`;
  console.log(JSON.stringify({
    states: await rows('resource_source_states', `select=resource_id,last_attempted_at,last_success_at,last_status,last_confirmed_at,failure_count,retry_after&${filter}`),
    findings: await rows('resource_source_findings', `select=id,resource_id,resource_name,kind,resolution,review_only,source_url,proposed_fields,evidence,summary&${filter}`),
    attempts: await rows('resource_source_attempts', `select=resource_id,checked_at,outcome,error&${filter}&order=checked_at.asc`),
  }, null, 2));
}
