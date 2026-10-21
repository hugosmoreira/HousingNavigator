/**
 * Bootstrap import: bundled JSON catalog + waitlists → Supabase tables
 * created by `0002_admin_catalog.sql`.
 *
 * Intended for seeding an EMPTY or staging project. Against a live project it
 * only adds rows that do not exist yet; it never updates or deletes anything.
 *
 *   # Dry run (default). With credentials it reads the live tables and prints
 *   # the complete plan; without credentials it prints an offline summary.
 *   npm run import:supabase
 *
 *   # Write, after reviewing the dry-run plan:
 *   npm run import:supabase -- --apply \
 *     --expected-project-ref <project-ref> \
 *     --confirm APPLY:<project-ref>
 *
 * Credentials come from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (shell,
 * `.env.local`, or `.env`). Never commit them.
 *
 * Safety rules:
 *   - Resources that already exist (exact or near-identical name + URL) are
 *     skipped, so curated rows and their UUIDs (and users' saved bookmarks)
 *     are untouched.
 *   - Waitlists are insert-only: an existing id is never overwritten, so a
 *     rerun cannot revert a curated status or trigger subscriber alerts.
 *   - Every inserted row starts unpublished. Review and publish it in the CMS.
 *   - `--reset` is not supported.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './loadScriptEnv.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertApplyTarget, cliOption } from './importIdentity.ts';
import { planCatalogResources, type LiveResourceIdentity } from './importPlans.ts';

import {
  DIRECTORY_CATEGORIES,
  legacyToDirectoryCategory,
} from '../src/data/categoryMap.ts';
import type {
  ApplicationMethod,
  DirectoryCategory,
  HouseholdType,
  Program,
  ProgramCategory,
  WaitlistEntry,
  WaitlistStatus,
} from '../src/types/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

interface ResourceInsert {
  id?: string;
  name: string;
  category: DirectoryCategory;
  county: string;
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

interface WaitlistInsert {
  id: string;
  housing_authority: string;
  program_name: string | null;
  county: string;
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

function read<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8')) as T;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function programToResource(program: Program): ResourceInsert {
  const directory: DirectoryCategory =
    program.directory_category && DIRECTORY_CATEGORIES.includes(program.directory_category)
      ? program.directory_category
      : legacyToDirectoryCategory(program.category as ProgramCategory);
  return {
    name: program.program_name,
    category: directory,
    county: program.county,
    city: emptyToNull(program.city),
    state: emptyToNull(program.state),
    description: emptyToNull(program.description),
    who_qualifies: emptyToNull(program.eligibility_summary),
    who_it_helps: program.who_it_helps ?? [],
    application_method: program.application_method,
    referral_required: program.referral_required,
    phone: emptyToNull(program.phone),
    website: emptyToNull(program.website),
    address: emptyToNull(program.address),
    source_url: emptyToNull(program.source_url),
    source_type: emptyToNull(program.source_type),
    last_verified: program.last_verified || null,
    public_notes: emptyToNull(program.notes),
    internal_notes: null,
    priority_score: program.priority_score ?? 0,
    published: false,
  };
}

function waitlistToInsert(entry: WaitlistEntry): WaitlistInsert {
  return {
    id: entry.id,
    housing_authority: entry.housing_authority ?? entry.agency,
    program_name: entry.program_name ?? null,
    county: entry.county,
    city: null,
    state: null,
    status: entry.status,
    application_link: emptyToNull(entry.application_link ?? entry.website),
    source_url: emptyToNull(entry.source_url),
    last_checked: entry.last_checked || null,
    notes: emptyToNull(entry.notes),
    public_notes: emptyToNull(entry.notes),
    internal_notes: null,
    published: false,
  };
}

/** Reads every row (PostgREST caps a single response), so the plan is never built on a partial table. */
async function fetchAll<T>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  if (argv.includes('--reset')) {
    throw new Error(
      '--reset is not supported: deleting resources cascades into users\' saved bookmarks. ' +
        'Existing rows are skipped instead.',
    );
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const haveCreds = !!url && !!serviceKey;
  if (apply && !haveCreds) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (do not commit). The service role key is required to bypass RLS for the import.',
    );
  }
  if (apply) {
    assertApplyTarget(url!, cliOption(argv, '--expected-project-ref'), cliOption(argv, '--confirm'));
  }

  let programs: Program[];
  try {
    programs = read<Program[]>('src/data/catalog.json');
  } catch {
    programs = read<Program[]>('src/data/programs.json');
  }
  const waitlists = read<WaitlistEntry[]>('src/data/waitlists.json');
  const resourceRows = programs.map(programToResource);
  const waitlistRows = waitlists.map(waitlistToInsert);

  console.log(
    `Bundled: ${resourceRows.length} resources and ${waitlistRows.length} waitlists${
      apply ? '' : ' (dry run, nothing will be written)'
    }.`,
  );

  if (!haveCreds) {
    console.log(
      'No Supabase credentials, so the live tables were not read. Offline summary: at most ' +
        `${resourceRows.length} resource inserts and ${waitlistRows.length} waitlist inserts, ` +
        'all unpublished; existing rows are skipped; 0 updates; 0 deletes.',
    );
    console.log('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to see the exact plan.');
    return;
  }

  const target = new URL(url!).host;
  console.log(`Target: ${target}`);
  const client = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const liveResources = await fetchAll<LiveResourceIdentity>(client, 'resources', 'id, name, website, source_url');
  const liveWaitlistIds = new Set(
    (await fetchAll<{ id: string }>(client, 'waitlists', 'id')).map((row) => row.id),
  );

  const resourcePlan = planCatalogResources(resourceRows, liveResources);
  const newWaitlists = waitlistRows.filter((row) => !liveWaitlistIds.has(row.id));
  const exactSkips = resourcePlan.skips.filter((skip) => skip.match === 'exact').length;
  const similarSkips = resourcePlan.skips.filter((skip) => skip.match === 'similar');

  console.log(
    `Plan: ${resourcePlan.inserts.length} resource insert (unpublished), ` +
      `${resourcePlan.skips.length} resource skip (${exactSkips} exact, ${similarSkips.length} similar), ` +
      `${newWaitlists.length} waitlist insert (unpublished), ` +
      `${waitlistRows.length - newWaitlists.length} waitlist skip, 0 update, 0 delete.`,
  );
  for (const skip of similarSkips) {
    console.log(`  similar match, skipped: "${skip.row.name}" ~ live resource ${skip.liveId}`);
  }
  for (const row of resourcePlan.inserts) {
    console.log(JSON.stringify({ action: 'insert resource', row }, null, 2));
  }
  for (const row of newWaitlists) {
    console.log(JSON.stringify({ action: 'insert waitlist', row }, null, 2));
  }

  if (!apply) {
    console.log(
      '\nDry run: no changes written. To write, re-run with --apply ' +
        '--expected-project-ref <ref> --confirm APPLY:<ref>.',
    );
    return;
  }

  if (resourcePlan.inserts.length > 0) {
    const { error } = await client.from('resources').insert(resourcePlan.inserts);
    if (error) throw error;
  }
  if (newWaitlists.length > 0) {
    // ignoreDuplicates = INSERT ... ON CONFLICT DO NOTHING: a row created
    // since the plan was read is left exactly as it is.
    const { error } = await client
      .from('waitlists')
      .upsert(newWaitlists, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  }
  console.log(
    `Applied: inserted ${resourcePlan.inserts.length} resources and ${newWaitlists.length} waitlists, ` +
      'all unpublished. Review and publish them in the admin CMS.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
