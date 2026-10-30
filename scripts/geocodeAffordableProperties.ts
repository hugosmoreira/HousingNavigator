/**
 * Check the map pins of published affordable properties. Read-only.
 *
 * Pins live on the property records (migration 0029) and are set in the admin
 * property form, with "Find on map" or by hand. This script looks up every
 * published street address in the U.S. Census Bureau geocoder, a public-domain
 * federal service that needs no key, and reports:
 *   - listings with a street address but no pin;
 *   - published addresses that differ from the Census match (another
 *     direction, street or ZIP), which usually means a typo in the record;
 *   - pins far from the Census match, which usually means the address changed
 *     after the pin was placed (see ./propertyLocationReview.ts for the limits).
 *
 * Input: production's public view when VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set (as in .env), otherwise the committed
 * snapshot in src/data/affordableProperties.json.
 *
 * It never writes anything. It exits with status 1 when a listing needs
 * attention, so it can gate a release later.
 *
 * Run with: `npm run geocode:properties`
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import {
  censusLookupUrl,
  firstCensusMatch,
  oneLineAddress,
} from '../supabase/functions/_shared/addressGeocoding.ts';
import {
  addressLookupFor,
  reviewPropertyLocation,
  type ReviewedProperty,
} from './propertyLocationReview';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = join(repoRoot, 'src', 'data', 'affordableProperties.json');
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();

const COLUMNS = 'id,name,address,city,state,postal_code,latitude,longitude,location_source';
const REQUEST_GAP_MS = 400;

type PublicRow = Omit<ReviewedProperty, 'latitude' | 'longitude' | 'location_source'> & {
  latitude: number | null;
  longitude: number | null;
  location_source: ReviewedProperty['location_source'] | null;
};

async function loadProperties(): Promise<{ from: string; properties: ReviewedProperty[] }> {
  if (!supabaseUrl || !anonKey) {
    return {
      from: 'the committed snapshot (src/data/affordableProperties.json)',
      properties: JSON.parse(readFileSync(snapshotPath, 'utf8')) as ReviewedProperty[],
    };
  }
  if (new URL(supabaseUrl).protocol !== 'https:') {
    throw new Error('VITE_SUPABASE_URL must use HTTPS.');
  }
  const response = await fetch(
    `${supabaseUrl}/rest/v1/affordable_properties_public?select=${encodeURIComponent(COLUMNS)}&published=eq.true&order=name`,
    {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error(`The public property view returned ${response.status}.`);
  const rows = (await response.json()) as PublicRow[];
  return {
    from: 'the live public property view',
    properties: rows.map((row) => ({
      ...row,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      location_source: row.location_source ?? undefined,
    })),
  };
}

async function main(): Promise<void> {
  const { from, properties } = await loadProperties();
  console.log(`Checking ${properties.length} published properties from ${from}.\n`);
  let looked = 0;
  let needsAttention = 0;

  for (const property of properties) {
    const lookup = addressLookupFor(property);
    if (!lookup) {
      console.log(`- ${property.name}: no street address published; stays off the map.`);
      continue;
    }

    if (looked > 0) await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
    looked += 1;
    const response = await fetch(censusLookupUrl(lookup), { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Census geocoder returned ${response.status}.`);
    const match = firstCensusMatch(await response.json(), oneLineAddress(lookup));

    const problems = reviewPropertyLocation(property, match);
    if (problems.length) {
      needsAttention += 1;
      console.warn(`! ${property.name} (${oneLineAddress(lookup)})`);
      for (const problem of problems) console.warn(`    ${problem}`);
    } else {
      console.log(`+ ${property.name}`);
    }
  }

  console.log(`\nLooked up ${looked} addresses; ${needsAttention} listing(s) need attention. Nothing was changed.`);
  if (needsAttention) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
