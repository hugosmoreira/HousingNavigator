// Read-only production preservation audit. Snapshots stay in ignored local storage.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';
const [mode, envPath, snapshotPath] = process.argv.slice(2);
if (!['before', 'after'].includes(mode) || !envPath || !snapshotPath)
  throw new Error('Usage: before|after ENV_FILE IGNORED_SNAPSHOT_PATH');
const env = parse(readFileSync(envPath));
const data = {};
for (const table of ['resources', 'resource_service_areas', 'affordable_properties', 'waitlists']) {
  const response = await fetch(env.VITE_SUPABASE_URL + '/rest/v1/' + table + '?select=*&order=id', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!response.ok) throw new Error(table + ': HTTP ' + response.status);
  data[table] = await response.json();
}
if (mode === 'before') writeFileSync(snapshotPath, JSON.stringify(data), { flag: 'wx' });
else assert.deepEqual(data, JSON.parse(readFileSync(snapshotPath, 'utf8')), 'Existing data changed during release. Inspect differences; never reset records.');
console.log(JSON.stringify({
  mode, preserved: mode === 'after',
  counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length])),
  published: data.resources.filter(row => row.published).length,
  drafts: data.resources.filter(row => !row.published).length,
}));
