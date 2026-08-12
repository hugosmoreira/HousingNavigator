import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { createEntitySlug } from '../src/lib/entityRoutes';
import {
  affordablePropertyFromRow,
  programFromResourceRow,
  waitlistFromRow,
} from '../src/services/data/mappers';
import type {
  AffordablePropertyRow,
  ResourceRow,
  WaitlistRow,
} from '../src/services/data/dbTypes';
import type { AffordableProperty, Program, WaitlistEntry } from '../src/types';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(repoRoot, 'src', 'data', 'catalog.json');
const waitlistsPath = join(repoRoot, 'src', 'data', 'waitlists.json');
const affordablePropertiesPath = join(
  repoRoot,
  'src',
  'data',
  'affordableProperties.json',
);
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();

const RESOURCE_COLUMNS = [
  'id',
  'name',
  'category',
  'county',
  'city',
  'state',
  'description',
  'who_qualifies',
  'who_it_helps',
  'application_method',
  'referral_required',
  'phone',
  'website',
  'address',
  'source_url',
  'source_type',
  'last_verified',
  'public_notes',
  'priority_score',
  'published',
  'service_areas',
].join(',');

const WAITLIST_COLUMNS = [
  'id',
  'housing_authority',
  'program_name',
  'county',
  'city',
  'state',
  'status',
  'application_link',
  'source_url',
  'last_checked',
  'notes',
  'public_notes',
  'published',
  'last_opened_at',
  'waitlist_type',
  'affordable_property_id',
].join(',');

const AFFORDABLE_PROPERTY_COLUMNS = [
  'id',
  'name',
  'owner_organization',
  'management_company',
  'property_type',
  'address',
  'city',
  'county',
  'state',
  'postal_code',
  'description',
  'eligibility_summary',
  'ami_levels',
  'bedroom_types',
  'audiences',
  'total_units',
  'accessibility_notes',
  'phone',
  'website',
  'application_url',
  'source_url',
  'source_type',
  'last_verified',
  'public_notes',
  'priority_score',
  'published',
  'waitlist_id',
  'waitlist_status',
  'waitlist_last_checked',
  'waitlist_application_link',
].join(',');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function validateSupabaseUrl(value: string): void {
  const parsed = new URL(value);
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
    throw new Error('Public snapshot sync requires an HTTPS Supabase URL.');
  }
}

async function fetchPublicRows<T>(view: string, columns: string): Promise<T[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${view}?select=${encodeURIComponent(columns)}&published=eq.true`,
      {
        headers: {
          apikey: anonKey!,
          Authorization: `Bearer ${anonKey}`,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Public snapshot request failed for ${view} (${response.status}).`);
    }
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) {
      throw new Error(`Public snapshot response for ${view} was not an array.`);
    }
    return rows as T[];
  } finally {
    clearTimeout(timeout);
  }
}

function attachExistingResourceRoutes(
  rows: ResourceRow[],
  existing: Program[],
): Program[] {
  const routeIds = new Map(
    existing.map((program) => [
      createEntitySlug(program.program_name, program.county),
      program.route_id ?? program.id,
    ]),
  );

  return rows
    .map((row) => {
      const program = programFromResourceRow(row);
      const routeId = routeIds.get(
        createEntitySlug(program.program_name, program.county),
      );
      return routeId ? { ...program, route_id: routeId } : program;
    })
    .sort((a, b) =>
      a.county === b.county
        ? a.program_name.localeCompare(b.program_name)
        : a.county.localeCompare(b.county),
    );
}

async function main(): Promise<void> {
  if (!supabaseUrl || !anonKey) {
    console.log('Skipped public snapshot sync; public Supabase credentials are unavailable.');
    return;
  }

  validateSupabaseUrl(supabaseUrl);
  const [resourceRows, waitlistRows, affordablePropertyRows] = await Promise.all([
    fetchPublicRows<ResourceRow>('resources_public', RESOURCE_COLUMNS),
    fetchPublicRows<WaitlistRow>('waitlists_public', WAITLIST_COLUMNS),
    fetchPublicRows<AffordablePropertyRow>(
      'affordable_properties_public',
      AFFORDABLE_PROPERTY_COLUMNS,
    ),
  ]);
  if (
    resourceRows.length === 0 ||
    waitlistRows.length === 0 ||
    affordablePropertyRows.length === 0
  ) {
    throw new Error('Refusing to replace the public snapshot with an empty dataset.');
  }

  const existingPrograms = readJson<Program[]>(catalogPath);
  const programs = attachExistingResourceRoutes(resourceRows, existingPrograms);
  const waitlists = waitlistRows
    .map(waitlistFromRow)
    .sort((a: WaitlistEntry, b: WaitlistEntry) =>
      a.county === b.county
        ? a.agency.localeCompare(b.agency)
        : a.county.localeCompare(b.county),
    );
  const affordableProperties = affordablePropertyRows
    .map(affordablePropertyFromRow)
    .sort((a: AffordableProperty, b: AffordableProperty) => {
      if (b.priority_score !== a.priority_score) {
        return b.priority_score - a.priority_score;
      }
      return a.name.localeCompare(b.name);
    });

  writeJson(catalogPath, programs);
  writeJson(waitlistsPath, waitlists);
  writeJson(affordablePropertiesPath, affordableProperties);
  console.log(
    `Refreshed the public build snapshot (${programs.length} resources, ${affordableProperties.length} affordable properties, ${waitlists.length} waitlists).`,
  );
}

await main();
