/**
 * Safe CSV → Supabase merge for `public.waitlists`.
 *
 * Reads one or more CSV files, dedupes across them by a deterministic id
 * derived from (housing_authority, program_name, source_url), normalizes
 * fields, and plans changes against the live table. Never deletes.
 *
 *   - New ids are inserted.
 *   - Existing ids keep every admin edit: the CSV only fills columns that
 *     are empty live. `internal_notes`, `published` and identity columns are
 *     never changed. `status` changes only with `--overwrite-status`,
 *     because moving a published list to open emails its followers.
 *
 * Usage (credentials from the shell, `.env.local` or `.env`):
 *   npm run import:waitlists -- \
 *     --csv "/path/navigator_waitlists.csv" \
 *     --csv "/path/comprehensive_waitlists.csv"
 *
 * Defaults to **dry run**, which reads the live table (when credentials are
 * set) and prints every insert and every changed field. To write:
 *   ... --apply --expected-project-ref <ref> --confirm APPLY:<ref>
 * An intentional replacement of a live row's exact source identity also
 * requires `--allow-identity-change <id>`.
 *
 * The CSV `published` column is ignored. A new row is published only when
 * it has a known status, a source URL, a check date and a primary county.
 *
 * Supported CSV column shapes:
 *   1. navigator_waitlists.csv:
 *      housing_authority, program_name, county, city, state, status,
 *      application_link, source_url, last_checked, public_notes,
 *      internal_notes, published
 *   2. comprehensive_waitlists.csv:
 *      provider_name, program_name, county, city, state, waitlist_type,
 *      target_population, status, application_url, source_url, phone,
 *      notes, last_checked, published
 *
 * Other column orderings are accepted as long as the header row uses one
 * of the recognized names per field.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import './loadScriptEnv.ts';
import { createClient } from '@supabase/supabase-js';

import type { County, WaitlistStatus } from '../src/types/index.ts';
import {
  assertApplyTarget,
  assertCompatibleIdentity,
  deterministicWaitlistId,
  exactWaitlistIdentity,
} from './importIdentity.ts';
import {
  planWaitlistPatch,
  type LiveWaitlistRow,
  type WaitlistPatchPlan,
} from './importPlans.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WaitlistRowInsert {
  id: string;
  housing_authority: string;
  program_name: string | null;
  county: County;
  city: string | null;
  state: string | null;
  status: WaitlistStatus;
  application_link: string | null;
  source_url: string | null;
  last_checked: string | null;
  notes: string | null;
  public_notes: string | null;
  internal_notes: string | null;
  published: boolean;
}

interface SourceRow {
  /** Raw header → cell map. */
  raw: Record<string, string>;
  /** Source file basename for traceability. */
  source: string;
}

// ---------------------------------------------------------------------------
// Tiny CSV parser (handles quoted fields with embedded commas / newlines).
// Avoids pulling in a runtime dep for ~30 rows.
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

const PRIMARY_COUNTIES: County[] = ['Multnomah', 'Clark', 'Washington', 'Clackamas'];

function normalizeCounty(raw: string): { county: County; original: string | null } {
  const trimmed = raw.trim();
  const match = PRIMARY_COUNTIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (match) return { county: match, original: null };
  return { county: 'Other', original: trimmed === '' ? null : trimmed };
}

function normalizeStatus(raw: string): WaitlistStatus {
  const v = raw.trim().toLowerCase();
  if (v === 'open' || v === 'closed' || v === 'limited' || v === 'unknown') return v;
  // Common aliases.
  if (v === 'waitlist' || v === 'wait list') return 'limited';
  if (v === 'opening soon' || v === 'coming soon') return 'limited';
  return 'unknown';
}

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function joinNotes(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);
  if (cleaned.length === 0) return null;
  // Dedupe identical fragments and concatenate with a separator.
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

function csvRowToWaitlist(src: SourceRow): WaitlistRowInsert | null {
  const row = src.raw;
  const authority = pick(row, 'housing_authority', 'provider_name', 'agency');
  const program = pick(row, 'program_name');
  const sourceUrl = pick(row, 'source_url');
  const applicationLink = pick(row, 'application_link', 'application_url') || sourceUrl;

  if (!authority) {
    console.warn(`[skip] missing housing_authority/provider_name in ${src.source}`);
    return null;
  }

  const id = deterministicWaitlistId(authority, program, sourceUrl || applicationLink);
  if (!id) {
    console.warn(`[skip] could not derive id for "${authority}" / "${program}" in ${src.source}`);
    return null;
  }

  const { county, original: originalCounty } = normalizeCounty(pick(row, 'county'));
  const status = normalizeStatus(pick(row, 'status'));

  const lastCheckedRaw = pick(row, 'last_checked');
  const lastChecked = isIsoDate(lastCheckedRaw) ? lastCheckedRaw : null;

  // Extra editorial fields from comprehensive_waitlists.csv that have no
  // dedicated DB column. Fold into notes so the data isn't lost.
  const phone = pick(row, 'phone');
  const target = pick(row, 'target_population');
  const waitlistType = pick(row, 'waitlist_type');

  const publicNotes = joinNotes([
    pick(row, 'public_notes', 'notes'),
    target ? `Eligibility: ${target}` : '',
    phone ? `Phone: ${phone}` : '',
  ]);

  const internalNotes = joinNotes([
    pick(row, 'internal_notes'),
    waitlistType ? `Type: ${waitlistType}` : '',
    originalCounty ? `Original county: ${originalCounty}` : '',
    `Source CSV: ${src.source}`,
  ]);

  // Publish only if the row is editorially useful AND sourceable.
  const published =
    status !== 'unknown' &&
    !!sourceUrl &&
    !!lastChecked &&
    county !== 'Other';

  const insert: WaitlistRowInsert = {
    id,
    housing_authority: authority,
    program_name: emptyToNull(program),
    county,
    city: emptyToNull(pick(row, 'city')),
    state: emptyToNull(pick(row, 'state')),
    status,
    application_link: emptyToNull(applicationLink),
    source_url: emptyToNull(sourceUrl),
    last_checked: lastChecked,
    // Mirror public_notes into the legacy `notes` column so older queries
    // that still read it surface the same copy. Keep them in sync on
    // every upsert.
    notes: publicNotes,
    public_notes: publicNotes,
    internal_notes: internalNotes,
    published,
  };
  return insert;
}

// Later rows fill in nulls from earlier rows but never overwrite a
// non-null field. Booleans use OR for `published` so a single trusted
// source can flip the row to publishable.
function merge(a: WaitlistRowInsert, b: WaitlistRowInsert): WaitlistRowInsert {
  return {
    id: a.id,
    housing_authority: a.housing_authority || b.housing_authority,
    program_name: a.program_name ?? b.program_name,
    county: a.county !== 'Other' ? a.county : b.county,
    city: a.city ?? b.city,
    state: a.state ?? b.state,
    status: a.status !== 'unknown' ? a.status : b.status,
    application_link: a.application_link ?? b.application_link,
    source_url: a.source_url ?? b.source_url,
    last_checked: a.last_checked ?? b.last_checked,
    notes: joinNotes([a.notes, b.notes]),
    public_notes: joinNotes([a.public_notes, b.public_notes]),
    internal_notes: joinNotes([a.internal_notes, b.internal_notes]),
    published: a.published || b.published,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

interface CliOptions {
  csvPaths: string[];
  apply: boolean;
  allowIdentityChanges: string[];
  overwriteStatus: boolean;
  expectedProjectRef: string | undefined;
  confirm: string | undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    csvPaths: [],
    apply: false,
    allowIdentityChanges: [],
    overwriteStatus: false,
    expectedProjectRef: undefined,
    confirm: undefined,
  };
  const valueOf = (flag: string, i: number): string => {
    const next = argv[i];
    if (!next || next.startsWith('--')) throw new Error(`${flag} requires a value`);
    return next;
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--overwrite-status') opts.overwriteStatus = true;
    else if (a === '--allow-identity-change') {
      opts.allowIdentityChanges.push(valueOf(a, ++i));
    } else if (a.startsWith('--allow-identity-change=')) {
      opts.allowIdentityChanges.push(a.slice('--allow-identity-change='.length));
    } else if (a === '--expected-project-ref') {
      opts.expectedProjectRef = valueOf(a, ++i);
    } else if (a.startsWith('--expected-project-ref=')) {
      opts.expectedProjectRef = a.slice('--expected-project-ref='.length);
    } else if (a === '--confirm') {
      opts.confirm = valueOf(a, ++i);
    } else if (a.startsWith('--confirm=')) {
      opts.confirm = a.slice('--confirm='.length);
    } else if (a === '--csv') {
      opts.csvPaths.push(valueOf(a, ++i));
    } else if (a.startsWith('--csv=')) {
      opts.csvPaths.push(a.slice('--csv='.length));
    } else if (!a.startsWith('--')) {
      // Bare positional path.
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

const LIVE_COLUMNS =
  'id, housing_authority, program_name, county, city, state, status, application_link, source_url, last_checked, notes, public_notes, published';

type LiveWaitlist = LiveWaitlistRow & { housing_authority: string };

async function main() {
  const {
    csvPaths,
    apply,
    allowIdentityChanges,
    overwriteStatus,
    expectedProjectRef,
    confirm,
  } = parseArgs(process.argv);

  // Load + parse each CSV; flag-tag every row with its source filename.
  const allRows: SourceRow[] = [];
  for (const path of csvPaths) {
    const text = readFileSync(path, 'utf8');
    const parsed = parseCsv(text);
    const source = basename(path);
    for (const raw of parsed) allRows.push({ raw, source });
    console.log(`Loaded ${parsed.length} rows from ${source}`);
  }

  // Map CSV rows to DB inserts, dedupe + merge by deterministic id.
  const byId = new Map<
    string,
    { row: WaitlistRowInsert; identity: string; label: string }
  >();
  let skipped = 0;
  for (const src of allRows) {
    const row = csvRowToWaitlist(src);
    if (!row) {
      skipped++;
      continue;
    }
    const label = `${src.source}: "${row.housing_authority}"`;
    const identity = exactWaitlistIdentity(
      row.housing_authority,
      row.program_name,
      row.source_url ?? row.application_link ?? '',
      label,
    );
    const existing = byId.get(row.id);
    if (existing) {
      assertCompatibleIdentity(row.id, existing.identity, identity, existing.label, label);
    }
    byId.set(row.id, {
      row: existing ? merge(existing.row, row) : row,
      identity,
      label: existing?.label ?? label,
    });
  }

  const mergedEntries = Array.from(byId.values());
  const merged = mergedEntries.map((entry) => entry.row);
  const publishCount = merged.filter((r) => r.published).length;
  console.log(
    `Merged ${allRows.length} CSV rows → ${merged.length} unique waitlists ` +
      `(${publishCount} publishable, ${merged.length - publishCount} drafts, ${skipped} skipped)`,
  );

  // Compare against the live table so the operator sees the exact plan.
  // Without credentials (dry run only) the mapping can still be reviewed
  // offline, but insert vs. update cannot be decided.
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const haveCreds = !!url && !!serviceKey;

  if (!haveCreds && apply) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars. Service-role key is required to bypass RLS for --apply.',
    );
  }
  if (apply) assertApplyTarget(url!, expectedProjectRef, confirm);

  if (!haveCreds) {
    console.log('(no Supabase credentials, so the live table was not read)');
    console.log(
      `Offline summary: ${merged.length} waitlists would be inserted if new; existing ids ` +
        'would only have empty columns filled. 0 deletes.',
    );
    console.log(`Sample row: ${JSON.stringify(merged[0] ?? null, null, 2)}`);
    console.log('\nDry run: no changes written.');
    return;
  }

  console.log(`Target: ${new URL(url!).host}`);
  const client = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingRows, error: existErr } = await client
    .from('waitlists')
    .select(LIVE_COLUMNS)
    .in('id', merged.map((r) => r.id));
  if (existErr) throw existErr;
  const existingById = new Map(
    ((existingRows ?? []) as LiveWaitlist[]).map((r) => [r.id, r]),
  );

  const willInsert: WaitlistRowInsert[] = [];
  const willUpdate: Array<{ id: string; label: string; plan: WaitlistPatchPlan }> = [];
  let unchanged = 0;
  for (const entry of mergedEntries) {
    const live = existingById.get(entry.row.id);
    if (!live) {
      willInsert.push(entry.row);
      continue;
    }
    const liveIdentity = exactWaitlistIdentity(
      live.housing_authority,
      live.program_name,
      live.source_url ?? live.application_link ?? '',
      `live waitlist ${live.id}`,
    );
    if (liveIdentity !== entry.identity) {
      if (!allowIdentityChanges.includes(entry.row.id)) {
        assertCompatibleIdentity(
          entry.row.id,
          liveIdentity,
          entry.identity,
          `live waitlist ${entry.row.id}`,
          entry.label,
        );
      }
      console.warn(
        `[override] intentional identity change allowed for waitlist ${entry.row.id}`,
      );
    }
    const plan = planWaitlistPatch(live, entry.row, { overwriteStatus });
    if (plan) willUpdate.push({ id: live.id, label: entry.label, plan });
    else unchanged++;
  }

  console.log(
    `Plan: ${willInsert.length} insert, ${willUpdate.length} update (empty columns` +
      `${overwriteStatus ? ' + status' : ''} only), ${unchanged} unchanged, 0 delete.`,
  );
  if (!overwriteStatus) {
    console.log(
      'Live statuses, internal_notes and published are never changed. ' +
        'Pass --overwrite-status to also apply CSV statuses.',
    );
  }
  for (const row of willInsert) {
    console.log(JSON.stringify({ action: 'insert', row }, null, 2));
  }
  for (const update of willUpdate) {
    console.log(`update ${update.id} (${update.label})`);
    for (const change of update.plan.changes) {
      console.log(`  ${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
    }
  }
  const alerting = willUpdate.filter((update) => update.plan.publishedStatusChange);
  if (alerting.length > 0) {
    console.warn(
      `\nWARNING: ${alerting.length} published waitlist(s) change status. A move to ` +
        'open or limited emails their followers as soon as it is written:',
    );
    for (const update of alerting) console.warn(`  - ${update.id}`);
  }

  if (!apply) {
    console.log(
      '\nDry run: no changes written. To write, re-run with --apply ' +
        '--expected-project-ref <ref> --confirm APPLY:<ref>.',
    );
    return;
  }

  if (willInsert.length > 0) {
    // Plain insert: if a row with the same id appeared since the plan was
    // read, the insert fails instead of overwriting it.
    const { error } = await client.from('waitlists').insert(willInsert);
    if (error) throw error;
  }
  let updatedCount = 0;
  for (const update of willUpdate) {
    const { error } = await client
      .from('waitlists')
      .update(update.plan.patch)
      .eq('id', update.id);
    if (error) {
      console.error(`[update failed] ${update.id}: ${error.message}`);
      throw error;
    }
    updatedCount++;
  }

  console.log(
    `\nApplied: ${willInsert.length} inserted, ${updatedCount} updated, ${unchanged} unchanged.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
