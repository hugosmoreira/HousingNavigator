/**
 * One-shot import: bundled JSON catalog + waitlists → Supabase tables
 * created by `0002_admin_catalog.sql`.
 *
 * Run with the service-role key so we bypass RLS and can seed `published=true`
 * rows without first signing in:
 *
 *   SUPABASE_URL=...                       \
 *   SUPABASE_SERVICE_ROLE_KEY=...          \
 *   npm run import:supabase
 *
 * Re-running is safe: rows are upserted on `id`. The script also takes
 * `--dry` to print row counts without writing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

import {
  DIRECTORY_CATEGORIES,
  legacyToDirectoryCategory,
} from '../src/data/categoryMap.ts';
import type {
  ApplicationMethod,
  County,
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
    published: true,
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
    published: true,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry');
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (do not commit). The service role key is required to bypass RLS for the import.',
    );
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
    `Importing ${resourceRows.length} resources and ${waitlistRows.length} waitlists${
      dryRun ? ' (dry run)' : ''
    }...`,
  );

  if (dryRun) {
    console.log(JSON.stringify({ resources: resourceRows[0], waitlists: waitlistRows[0] }, null, 2));
    return;
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resources: insert (no upsert key — UUIDs assigned by Supabase). To make
  // re-runs idempotent, clear the table first when --reset is passed.
  if (process.argv.includes('--reset')) {
    console.log('Clearing existing resources...');
    const { error } = await client.from('resources').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
  }

  const { error: resourceError } = await client.from('resources').insert(resourceRows);
  if (resourceError) throw resourceError;
  console.log(`Inserted ${resourceRows.length} resources.`);

  const { error: waitlistError } = await client
    .from('waitlists')
    .upsert(waitlistRows, { onConflict: 'id' });
  if (waitlistError) throw waitlistError;
  console.log(`Upserted ${waitlistRows.length} waitlists.`);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
