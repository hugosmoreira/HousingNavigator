/**
 * Safe CSV → Supabase merge for `public.resources`.
 *
 * Mirrors the shape of `importWaitlistsCsv.ts` (parse → normalize →
 * dedupe → plan → upsert) but adapts to the resources table's different
 * key strategy: `resources.id` is a DB-generated UUID, so we cannot
 * UPSERT on a deterministic key. Instead we:
 *
 *   1. Fetch the live `resources` rows and build a normalized-key index
 *      (`slug(name) + '__' + slug(host+path of website|source_url)`).
 *   2. For each CSV row, decide INSERT vs. UPDATE against that index.
 *   3. On UPDATE, fill only fields that are currently NULL/empty —
 *      never overwrite an admin's edits. UUID is preserved, so every
 *      `saved_resources.resource_id` FK stays valid.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run import:resources -- \
 *       --csv "/path/navigator_resources.csv"
 *
 * Defaults to **dry run**. Pass `--apply` to actually write.
 *
 * Never DELETEs anything.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

import { csvToDirectoryCategory } from '../src/data/categoryMap.ts';
import type {
  ApplicationMethod,
  County,
  DirectoryCategory,
  HouseholdType,
} from '../src/types/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResourceInsert {
  name: string;
  category: DirectoryCategory;
  county: County;
  city: string | null;
  state: string | null;
  description: string | null;
  who_qualifies: string | null;
  who_it_helps: HouseholdType[];
  application_method: ApplicationMethod;
  referral_required: boolean;
  phone: string | null;
  website: string | null;
  address: string | null;
  source_url: string | null;
  source_type: string | null;
  last_verified: string | null;
  public_notes: string | null;
  internal_notes: string | null;
  priority_score: number;
  published: boolean;
}

interface ExistingResource {
  id: string;
  name: string;
  category: string;
  county: string;
  city: string | null;
  state: string | null;
  description: string | null;
  who_qualifies: string | null;
  application_method: string;
  referral_required: boolean;
  phone: string | null;
  website: string | null;
  address: string | null;
  source_url: string | null;
  source_type: string | null;
  last_verified: string | null;
  public_notes: string | null;
  internal_notes: string | null;
  priority_score: number;
  published: boolean;
}

interface SourceRow {
  raw: Record<string, string>;
  source: string;
}

// ---------------------------------------------------------------------------
// Tiny CSV parser (quote-aware, no runtime dep). Same shape as the
// waitlists importer.
// ---------------------------------------------------------------------------

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      cur.push(cell);
      cell = '';
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      cur.push(cell);
      rows.push(cur);
      cur = [];
      cell = '';
      continue;
    }
    cell += c;
  }
  if (cell.length > 0 || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) {
        obj[header[i]] = (r[i] ?? '').trim();
      }
      return obj;
    });
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v.trim() !== '') return v.trim();
  }
  return '';
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === null || v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function urlKey(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.replace(/\/+$/, '');
    return slug(`${u.host}${path}`);
  } catch {
    return slug(rawUrl);
  }
}

function normKey(name: string, websiteOrSource: string): string {
  const parts = [slug(name), urlKey(websiteOrSource)].filter(Boolean);
  return parts.join('__');
}

const PRIMARY_COUNTIES: County[] = ['Multnomah', 'Clark', 'Washington', 'Clackamas'];

function normalizeCounty(raw: string): { county: County; original: string | null } {
  const trimmed = raw.trim();
  const match = PRIMARY_COUNTIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (match) return { county: match, original: null };
  return { county: 'Other', original: trimmed === '' ? null : trimmed };
}

function parseBool(v: string, fallback = false): boolean {
  const s = v.trim().toLowerCase();
  if (s === 'yes' || s === 'true' || s === '1' || s === 'y') return true;
  if (s === 'no' || s === 'false' || s === '0' || s === 'n' || s === '') return false;
  return fallback;
}

function parseInteger(v: string, fallback = 0): number {
  const n = Number.parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function classifyApplicationMethod(raw: string): ApplicationMethod {
  const v = raw.trim().toLowerCase();
  // Order matters. When a row mentions multiple methods ("Call X or visit Y"),
  // we want the primary action: online > referral > phone > walk_in.
  if (/(apply online|website|online application|apply.*\.(com|org|gov|net))/i.test(v))
    return 'online';
  if (v.includes('referral')) return 'referral';
  if (v.includes('call') || v.includes('phone')) return 'phone';
  if (v.includes('walk') || v.includes('drop') || v.includes('visit')) return 'walk_in';
  return v === '' ? 'walk_in' : 'phone';
}

function joinNotes(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);
  if (cleaned.length === 0) return null;
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const c of cleaned) {
    if (seen.has(c)) continue;
    seen.add(c);
    ordered.push(c);
  }
  return ordered.join(' · ');
}

// ---------------------------------------------------------------------------
// Row → DB shape
// ---------------------------------------------------------------------------

function csvRowToResource(src: SourceRow): ResourceInsert | null {
  const row = src.raw;
  const name = pick(row, 'name');
  if (!name) {
    console.warn(`[skip] missing name in ${src.source}`);
    return null;
  }

  const rawCategory = pick(row, 'category');
  const category = csvToDirectoryCategory(rawCategory || 'supportive services');
  const { county, original: originalCounty } = normalizeCounty(pick(row, 'county'));

  const website = pick(row, 'website');
  const sourceUrl = pick(row, 'source_url');
  const dedupeUrl = website || sourceUrl;

  const rawAppMethod = pick(row, 'application_method');
  const applicationMethod = classifyApplicationMethod(rawAppMethod);

  const lastVerifiedRaw = pick(row, 'last_verified');
  const lastVerified = isIsoDate(lastVerifiedRaw) ? lastVerifiedRaw : null;

  const searchKeywords = pick(row, 'search_keywords');

  // Preserve the original free-text application instruction in
  // public_notes so the heuristic enum collapse doesn't lose info.
  const publicNotes = joinNotes([
    pick(row, 'public_notes'),
    rawAppMethod ? `How to apply: ${rawAppMethod}` : '',
  ]);

  const internalNotes = joinNotes([
    pick(row, 'internal_notes'),
    searchKeywords ? `Keywords: ${searchKeywords}` : '',
    originalCounty ? `Original county: ${originalCounty}` : '',
    `Source CSV: ${src.source}`,
  ]);

  // Same publishability bar as waitlists: source + last_verified + primary
  // county + reasonable category mapping. Brand-new rows only.
  const categoryFellBack =
    rawCategory.trim() !== '' && csvToDirectoryCategory(rawCategory) === 'supportive_services' &&
    !/(supportive|wraparound|comprehensive|case management|coordinated)/i.test(rawCategory);
  const published =
    !!sourceUrl &&
    !!lastVerified &&
    county !== 'Other' &&
    !categoryFellBack;

  return {
    name,
    category,
    county,
    city: emptyToNull(pick(row, 'city')),
    state: emptyToNull(pick(row, 'state')),
    description: emptyToNull(pick(row, 'description')),
    who_qualifies: emptyToNull(pick(row, 'who_qualifies')),
    who_it_helps: [],
    application_method: applicationMethod,
    referral_required: parseBool(pick(row, 'referral_required')),
    phone: emptyToNull(pick(row, 'phone')),
    website: emptyToNull(website),
    address: emptyToNull(pick(row, 'address')),
    source_url: emptyToNull(sourceUrl),
    source_type: emptyToNull(pick(row, 'source_type')),
    last_verified: lastVerified,
    public_notes: publicNotes,
    internal_notes: internalNotes,
    priority_score: parseInteger(pick(row, 'priority_score')),
    published,
  };
}

// Intra-CSV merge for rows that hash to the same key in the same file.
// First-seen wins on non-null fields; booleans OR; ints take max.
function mergeIntra(a: ResourceInsert, b: ResourceInsert): ResourceInsert {
  const pickStr = (x: string | null, y: string | null): string | null => x ?? y;
  return {
    name: a.name || b.name,
    category: a.category !== 'supportive_services' ? a.category : b.category,
    county: a.county !== 'Other' ? a.county : b.county,
    city: pickStr(a.city, b.city),
    state: pickStr(a.state, b.state),
    description: pickStr(a.description, b.description),
    who_qualifies: pickStr(a.who_qualifies, b.who_qualifies),
    who_it_helps: a.who_it_helps.length > 0 ? a.who_it_helps : b.who_it_helps,
    application_method: a.application_method,
    referral_required: a.referral_required || b.referral_required,
    phone: pickStr(a.phone, b.phone),
    website: pickStr(a.website, b.website),
    address: pickStr(a.address, b.address),
    source_url: pickStr(a.source_url, b.source_url),
    source_type: pickStr(a.source_type, b.source_type),
    last_verified: pickStr(a.last_verified, b.last_verified),
    public_notes: joinNotes([a.public_notes, b.public_notes]),
    internal_notes: joinNotes([a.internal_notes, b.internal_notes]),
    priority_score: Math.max(a.priority_score, b.priority_score),
    published: a.published || b.published,
  };
}

// Build a patch that only fills NULL/empty fields on the existing row.
// Returns null when there is nothing to update — caller treats that as
// a SKIP. Never touches: id, name, category, county, application_method,
// referral_required, priority_score, published, who_it_helps.
function fillNullsOnlyPatch(
  existing: ExistingResource,
  incoming: ResourceInsert,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  const fields = [
    'city',
    'state',
    'description',
    'who_qualifies',
    'phone',
    'website',
    'address',
    'source_url',
    'source_type',
    'last_verified',
    'public_notes',
    'internal_notes',
  ] as const;
  for (const f of fields) {
    const existingValue = existing[f];
    const incomingValue = incoming[f];
    const existingEmpty = existingValue === null || existingValue === '';
    const incomingHasValue = incomingValue !== null && incomingValue !== '';
    if (existingEmpty && incomingHasValue) {
      patch[f] = incomingValue;
    }
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

interface CliOptions {
  csvPaths: string[];
  apply: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { csvPaths: [], apply: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--csv') {
      const next = argv[++i];
      if (!next) throw new Error('--csv requires a path');
      opts.csvPaths.push(next);
    } else if (a.startsWith('--csv=')) {
      opts.csvPaths.push(a.slice('--csv='.length));
    } else if (!a.startsWith('--')) {
      opts.csvPaths.push(a);
    } else {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  if (opts.csvPaths.length === 0) {
    throw new Error(
      'No CSV paths supplied. Use --csv <path> at least once (may be repeated).',
    );
  }
  return opts;
}

async function main() {
  const { csvPaths, apply } = parseArgs(process.argv);

  // Load + parse every CSV; tag rows with source filename for traceability.
  const allRows: SourceRow[] = [];
  for (const path of csvPaths) {
    const text = readFileSync(path, 'utf8');
    const parsed = parseCsv(text);
    const source = basename(path);
    for (const raw of parsed) allRows.push({ raw, source });
    console.log(`Loaded ${parsed.length} rows from ${source}`);
  }

  // Map CSV → DB shape, dedupe intra-CSV by normalized name+url key.
  const byKey = new Map<string, { key: string; row: ResourceInsert }>();
  let skippedParse = 0;
  for (const src of allRows) {
    const row = csvRowToResource(src);
    if (!row) {
      skippedParse++;
      continue;
    }
    const key = normKey(row.name, row.website ?? row.source_url ?? '');
    if (!key) {
      skippedParse++;
      console.warn(`[skip] could not derive dedupe key for "${row.name}"`);
      continue;
    }
    const existing = byKey.get(key);
    byKey.set(key, {
      key,
      row: existing ? mergeIntra(existing.row, row) : row,
    });
  }
  const merged = Array.from(byKey.values());
  console.log(
    `Merged ${allRows.length} CSV rows → ${merged.length} unique resources ` +
      `(${skippedParse} skipped during parse).`,
  );

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const haveCreds = !!url && !!serviceKey;

  if (!haveCreds && apply) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars. Service-role key is required to bypass RLS for --apply.',
    );
  }

  if (!haveCreds) {
    console.log('(no Supabase credentials — dry run will skip live-table compare)');
    console.log('Plan: would insert up to', merged.length, 'rows (no DB lookup).');
    console.log(`Sample row: ${JSON.stringify(merged[0]?.row ?? null, null, 2)}`);
    console.log('\nDry run — no changes written. Re-run with --apply to upsert.');
    return;
  }

  const client = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pull every existing row so we can build the normalized-key index in
  // memory. Resources is a small table (hundreds of rows at most); this
  // is simpler than per-row lookups and gives us accurate plan counts.
  const { data: existingRows, error: existErr } = await client
    .from('resources')
    .select(
      'id, name, category, county, city, state, description, who_qualifies, application_method, referral_required, phone, website, address, source_url, source_type, last_verified, public_notes, internal_notes, priority_score, published',
    );
  if (existErr) throw existErr;

  const existing: ExistingResource[] = (existingRows ?? []) as ExistingResource[];
  const existingByKey = new Map<string, ExistingResource>();
  for (const r of existing) {
    const k = normKey(r.name, r.website ?? r.source_url ?? '');
    if (k && !existingByKey.has(k)) existingByKey.set(k, r);
  }

  interface PlanInsert {
    kind: 'insert';
    row: ResourceInsert;
  }
  interface PlanUpdate {
    kind: 'update';
    id: string;
    name: string;
    patch: Record<string, unknown>;
  }
  interface PlanSkip {
    kind: 'skip';
    name: string;
    reason: string;
  }
  type PlanEntry = PlanInsert | PlanUpdate | PlanSkip;

  const plan: PlanEntry[] = [];
  for (const { key, row } of merged) {
    const match = existingByKey.get(key);
    if (!match) {
      plan.push({ kind: 'insert', row });
      continue;
    }
    const patch = fillNullsOnlyPatch(match, row);
    if (!patch) {
      plan.push({
        kind: 'skip',
        name: row.name,
        reason: 'existing row already has values for every field this CSV would fill',
      });
      continue;
    }
    plan.push({ kind: 'update', id: match.id, name: row.name, patch });
  }

  const inserts = plan.filter((p): p is PlanInsert => p.kind === 'insert');
  const updates = plan.filter((p): p is PlanUpdate => p.kind === 'update');
  const skips = plan.filter((p): p is PlanSkip => p.kind === 'skip');

  console.log(
    `\nPlan: ${inserts.length} insert, ${updates.length} update (fill nulls only), ` +
      `${skips.length} skip, 0 delete (deletes are not allowed).`,
  );

  if (inserts.length > 0) {
    console.log('\nFirst INSERT preview:');
    console.log(JSON.stringify(inserts[0]!.row, null, 2));
  }
  if (updates.length > 0) {
    console.log('\nFirst UPDATE preview:');
    console.log(
      JSON.stringify(
        { id: updates[0]!.id, name: updates[0]!.name, patch: updates[0]!.patch },
        null,
        2,
      ),
    );
  }
  if (skips.length > 0) {
    console.log(`\nSkipped rows (${skips.length}):`);
    for (const s of skips) console.log(`  - ${s.name}: ${s.reason}`);
  }

  if (!apply) {
    console.log('\nDry run — no changes written. Re-run with --apply to write.');
    return;
  }

  // Execute updates one row at a time (each has a distinct patch shape),
  // then insert the new rows in a single batch.
  let updatedCount = 0;
  for (const u of updates) {
    const { error } = await client
      .from('resources')
      .update(u.patch)
      .eq('id', u.id);
    if (error) {
      console.error(`[update failed] ${u.name} (${u.id}):`, error.message);
      throw error;
    }
    updatedCount++;
  }

  let insertedCount = 0;
  if (inserts.length > 0) {
    const { error } = await client
      .from('resources')
      .insert(inserts.map((p) => p.row));
    if (error) throw error;
    insertedCount = inserts.length;
  }

  console.log(
    `\nApplied: ${insertedCount} inserted, ${updatedCount} updated, ${skips.length} skipped.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
