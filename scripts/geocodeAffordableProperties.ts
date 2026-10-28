/**
 * Add map coordinates for published affordable properties.
 *
 * Input:
 *   - src/data/affordableProperties.json   (public snapshot)
 *   - src/data/affordablePropertyLocations.json (previous results, if any)
 *
 * Output:
 *   - src/data/affordablePropertyLocations.json, keyed by property id
 *
 * Run with: `npm run geocode:properties`
 *
 * Coordinates come from the U.S. Census Bureau geocoder, a public-domain
 * federal service that needs no key. A property is looked up again only when
 * it has no saved location or its published address changed, so reruns send
 * one request per new or edited property. Properties without a street address
 * stay off the map rather than being placed at a city centroid.
 *
 * The script never edits property records. When the Census match differs from
 * the published address (a different ZIP, street type, or direction) it prints
 * a warning so a curator can correct the source record.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AffordableProperty } from '../src/types';
import type { AffordablePropertyLocationFile } from '../src/data/affordablePropertyLocations';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const propertiesPath = join(repoRoot, 'src', 'data', 'affordableProperties.json');
const locationsPath = join(repoRoot, 'src', 'data', 'affordablePropertyLocations.json');

const CENSUS_ENDPOINT =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const REQUEST_GAP_MS = 400;

interface CensusMatch {
  matchedAddress: string;
  coordinates: { x: number; y: number };
}

function oneLineAddress(property: AffordableProperty): string | null {
  if (!property.address?.trim()) return null;
  const zip = property.postal_code ? ` ${property.postal_code}` : '';
  return `${property.address.trim()}, ${property.city}, ${property.state}${zip}`;
}

function normalize(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(STREET)\b/g, 'ST')
    .replace(/\b(AVENUE)\b/g, 'AVE')
    .replace(/\b(ROAD)\b/g, 'RD')
    .replace(/\b(BOULEVARD)\b/g, 'BLVD')
    .replace(/\s+/g, ' ')
    .trim();
}

function differences(input: string, matched: string): string[] {
  const inputTokens = new Set(normalize(input).split(' '));
  const inputHasZip = [...inputTokens].some((token) => /^\d{5}$/.test(token));
  const matchedTokens = normalize(matched).split(' ');
  // A ZIP the record never published is extra detail, not a conflict.
  return matchedTokens.filter(
    (token) => !inputTokens.has(token) && (inputHasZip || !/^\d{5}$/.test(token)),
  );
}

async function geocode(address: string): Promise<CensusMatch | null> {
  const url = new URL(CENSUS_ENDPOINT);
  url.searchParams.set('address', address);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Census geocoder returned ${response.status}.`);
    const body = (await response.json()) as {
      result?: { addressMatches?: CensusMatch[] };
    };
    return body.result?.addressMatches?.[0] ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

function readLocations(): AffordablePropertyLocationFile {
  if (!existsSync(locationsPath)) {
    return {
      source: 'U.S. Census Bureau Geocoder (Public_AR_Current benchmark)',
      source_url: 'https://geocoding.geo.census.gov/geocoder/',
      locations: {},
    };
  }
  return JSON.parse(readFileSync(locationsPath, 'utf8')) as AffordablePropertyLocationFile;
}

async function main(): Promise<void> {
  const properties = JSON.parse(readFileSync(propertiesPath, 'utf8')) as AffordableProperty[];
  const file = readLocations();
  const today = new Date().toISOString().slice(0, 10);
  const liveIds = new Set(properties.map((property) => property.id));
  let looked = 0;

  for (const property of properties) {
    const address = oneLineAddress(property);
    if (!address) {
      console.log(`- ${property.name}: no street address published; left off the map.`);
      delete file.locations[property.id];
      continue;
    }

    const saved = file.locations[property.id];
    if (saved && saved.input_address === address) continue;

    if (looked > 0) await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
    looked += 1;

    const match = await geocode(address);
    if (!match) {
      console.warn(`! ${property.name}: no Census match for "${address}"; left off the map.`);
      delete file.locations[property.id];
      continue;
    }

    file.locations[property.id] = {
      lat: Number(match.coordinates.y.toFixed(6)),
      lng: Number(match.coordinates.x.toFixed(6)),
      input_address: address,
      matched_address: match.matchedAddress,
      geocoded_on: today,
    };

    const changed = differences(address, match.matchedAddress);
    if (changed.length) {
      console.warn(
        `! ${property.name}: matched "${match.matchedAddress}" (differs from published address in: ${changed.join(', ')}). Check the source record.`,
      );
    } else {
      console.log(`+ ${property.name}`);
    }
  }

  for (const id of Object.keys(file.locations)) {
    if (!liveIds.has(id)) delete file.locations[id];
  }

  const ordered = Object.fromEntries(
    Object.entries(file.locations).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    locationsPath,
    `${JSON.stringify({ ...file, locations: ordered }, null, 2)}\n`,
    'utf8',
  );
  console.log(`Saved ${Object.keys(ordered).length} property locations (${looked} looked up).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
