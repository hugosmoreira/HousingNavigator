/**
 * Browser-side one-click seeding from the bundled JSON catalog into
 * Supabase, run with the signed-in admin user's session.
 *
 * Mirrors `scripts/importToSupabase.ts` but uses the anon key + RLS
 * (admin insert policies in `0002_admin_catalog.sql`) instead of the
 * service-role key. Wired to the empty-state on `AdminResourcesList`
 * and `AdminWaitlistsList` so first-time setup does not require a
 * shell or the service-role key.
 *
 * Re-running will create duplicate `resources` rows (no upsert key).
 * The button is therefore only shown when the table is empty.
 */

import catalogData from '../data/catalog.json';
import fallbackPrograms from '../data/programs.json';
import waitlistsData from '../data/waitlists.json';
import {
  DIRECTORY_CATEGORIES,
  legacyToDirectoryCategory,
} from '../data/categoryMap';
import { requireSupabase } from '../lib/supabaseClient';
import type {
  DirectoryCategory,
  Program,
  ProgramCategory,
  WaitlistEntry,
} from '../types';

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function programToResource(program: Program) {
  const directory: DirectoryCategory =
    program.directory_category &&
    DIRECTORY_CATEGORIES.includes(program.directory_category)
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

function waitlistToInsert(entry: WaitlistEntry) {
  return {
    id: entry.id,
    housing_authority: entry.housing_authority ?? entry.agency,
    program_name: entry.program_name ?? null,
    county: entry.county,
    city: null as string | null,
    state: null as string | null,
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

const RAW_CATALOG = catalogData as unknown as Program[];
const FALLBACK = fallbackPrograms as unknown as Program[];
const WAITLISTS = waitlistsData as unknown as WaitlistEntry[];

function bundledPrograms(): Program[] {
  return Array.isArray(RAW_CATALOG) && RAW_CATALOG.length > 0
    ? RAW_CATALOG
    : FALLBACK;
}

export interface SeedResult {
  inserted: number;
}

export async function seedResourcesFromCatalog(): Promise<SeedResult> {
  const client = requireSupabase();
  const rows = bundledPrograms().map(programToResource);
  if (rows.length === 0) return { inserted: 0 };
  const { error } = await client.from('resources').insert(rows);
  if (error) throw error;
  return { inserted: rows.length };
}

export async function seedWaitlistsFromCatalog(): Promise<SeedResult> {
  const client = requireSupabase();
  const rows = WAITLISTS.map(waitlistToInsert);
  if (rows.length === 0) return { inserted: 0 };
  // Upsert on `id` so re-runs won't duplicate the seeded waitlists.
  const { error } = await client
    .from('waitlists')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw error;
  return { inserted: rows.length };
}

export const BUNDLED_RESOURCE_COUNT = bundledPrograms().length;
export const BUNDLED_WAITLIST_COUNT = WAITLISTS.length;
