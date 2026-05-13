/**
 * Safe CSV → Supabase merge for `public.waitlists`.
 *
 * Reads one or more CSV files, dedupes across them by a deterministic id
 * derived from (housing_authority, program_name, source_url), normalizes
 * fields, and UPSERTs into Supabase. Never deletes; preserves existing
 * rows (and therefore preserves every `waitlist_alerts` row pointing at
 * them via FK cascade).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/importWaitlistsCsv.ts \
 *       --csv "/path/navigator_waitlists.csv" \
 *       --csv "/path/comprehensive_waitlists.csv"
 *
 * Defaults to **dry run**. Pass `--apply` to actually write to Supabase.
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
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

import type { County, WaitlistStatus } from '../src/types/index.ts';

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

function deterministicId(authority: string, program: string, sourceUrl: string): string {
  const parts = [slug(authority), slug(program), urlKey(sourceUrl)].filter(Boolean);
  return parts.join('__').slice(0, 200);
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

  const id = deterministicId(authority, program, sourceUrl || applicationLink);
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

async function main() {
  const { csvPaths, apply } = parseArgs(process.argv);

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
  const byId = new Map<string, WaitlistRowInsert>();
  let skipped = 0;
  for (const src of allRows) {
    const row = csvRowToWaitlist(src);
    if (!row) {
      skipped++;
      continue;
    }
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? merge(existing, row) : row);
  }

  const merged = Array.from(byId.values());
  const publishCount = merged.filter((r) => r.published).length;
  console.log(
    `Merged ${allRows.length} CSV rows → ${merged.length} unique waitlists ` +
      `(${publishCount} publishable, ${merged.length - publishCount} drafts, ${skipped} skipped)`,
  );

  // Compare against the live table so the operator sees insert vs. update.
  // Skipped if credentials are missing or invalid in dry-run mode so the
  // mapping can be reviewed without any network round-trip.
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const haveCreds = !!url && !!serviceKey;

  if (!haveCreds && apply) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars. Service-role key is required to bypass RLS for --apply.',
    );
  }

  const client = haveCreds
    ? createClient(url!, serviceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  let willInsert: WaitlistRowInsert[] = merged;
  let willUpdate: WaitlistRowInsert[] = [];

  if (client) {
    const ids = merged.map((r) => r.id);
    const { data: existingRows, error: existErr } = await client
      .from('waitlists')
      .select('id')
      .in('id', ids);
    if (existErr) {
      console.warn(
        `Could not query existing rows (${existErr.message}). Plan will not split insert vs. update.`,
      );
    } else {
      const existingIds = new Set((existingRows ?? []).map((r) => r.id as string));
      willInsert = merged.filter((r) => !existingIds.has(r.id));
      willUpdate = merged.filter((r) => existingIds.has(r.id));
    }
  } else {
    console.log('(no Supabase credentials — skipping insert/update breakdown)');
  }

  console.log(
    `Plan: ${willInsert.length} insert, ${willUpdate.length} update, 0 delete (deletes are not allowed).`,
  );
  console.log(`Sample row: ${JSON.stringify(merged[0] ?? null, null, 2)}`);

  if (!apply) {
    console.log('\nDry run — no changes written. Re-run with --apply to upsert.');
    return;
  }

  // Single batch upsert. onConflict='id' makes existing rows UPDATE rather
  // than fail, preserving any waitlist_alerts FK references.
  const { error } = await client!
    .from('waitlists')
    .upsert(merged, { onConflict: 'id' });
  if (error) throw error;

  console.log(
    `\nApplied: upserted ${merged.length} waitlists (${willInsert.length} new, ${willUpdate.length} updated).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
