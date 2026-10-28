// Address lookup for the admin property form's "Find on map" button.
//
// Pure helpers shared by the `geocode-address` Edge Function, the admin form
// and their tests. The Census Bureau geocoder is a public-domain federal
// service that needs no key; it sends no CORS headers, so only the Edge
// Function calls it.

export const CENSUS_GEOCODER_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

/** The same box as `affordable_properties_location_check` (migration 0029). */
export const LOCATION_BOUNDS = {
  south: 41.9,
  north: 49.1,
  west: -125.0,
  east: -116.4,
} as const;

const MAX_FIELD_LENGTH = 200;
const LOOKUP_KEYS = new Set(['address', 'city', 'state', 'postal_code']);

export interface AddressLookup {
  address: string;
  city: string;
  state: 'OR' | 'WA';
  postal_code: string | null;
}

export interface AddressMatch {
  latitude: number;
  longitude: number;
  matched_address: string;
  /** Words in the Census match that the entered address lacks, such as another direction or ZIP. */
  differences: string[];
}

export interface AddressLookupResponse {
  match: AddressMatch | null;
  message?: string;
}

function boundedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_FIELD_LENGTH ? trimmed : null;
}

/** Accepts exactly the four form fields; anything else is rejected, not ignored. */
export function parseAddressLookup(body: unknown): AddressLookup | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !LOOKUP_KEYS.has(key))) return null;

  const address = boundedText(record.address);
  const city = boundedText(record.city);
  if (!address || !city) return null;
  if (record.state !== 'OR' && record.state !== 'WA') return null;

  let postalCode: string | null = null;
  if (record.postal_code !== undefined && record.postal_code !== null && record.postal_code !== '') {
    postalCode = boundedText(record.postal_code);
    if (!postalCode || !/^\d{5}(-\d{4})?$/.test(postalCode)) return null;
  }
  return { address, city, state: record.state, postal_code: postalCode };
}

/** The one-line form `npm run geocode:properties` uses, so results agree. */
export function oneLineAddress(lookup: AddressLookup): string {
  const zip = lookup.postal_code ? ` ${lookup.postal_code}` : '';
  return `${lookup.address}, ${lookup.city}, ${lookup.state}${zip}`;
}

export function censusLookupUrl(lookup: AddressLookup): URL {
  const url = new URL(CENSUS_GEOCODER_URL);
  url.searchParams.set('address', oneLineAddress(lookup));
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');
  return url;
}

function normalizeAddress(value: string): string {
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

export function addressDifferences(entered: string, matched: string): string[] {
  const normalized = normalizeAddress(entered);
  const enteredTokens = new Set(normalized.split(' '));
  // Only a ZIP at the end counts: house numbers can have five digits too.
  const enteredHasZip = /\b\d{5}( \d{4})?$/.test(normalized);
  // A ZIP the record never published is extra detail, not a conflict.
  return normalizeAddress(matched)
    .split(' ')
    .filter((token) => !enteredTokens.has(token) && (enteredHasZip || !/^\d{5}$/.test(token)));
}

/**
 * The first Census match, rounded to six decimals (about 10 cm), or null when
 * there is none. Throws on a response that is not the documented shape.
 */
export function firstCensusMatch(body: unknown, entered: string): AddressMatch | null {
  const matches = (body as { result?: { addressMatches?: unknown } } | null)?.result?.addressMatches;
  if (!Array.isArray(matches)) throw new Error('Unexpected Census geocoder response.');
  if (matches.length === 0) return null;

  const first = matches[0] as { matchedAddress?: unknown; coordinates?: { x?: unknown; y?: unknown } };
  const x = first?.coordinates?.x;
  const y = first?.coordinates?.y;
  if (
    typeof first?.matchedAddress !== 'string' ||
    typeof x !== 'number' || !Number.isFinite(x) ||
    typeof y !== 'number' || !Number.isFinite(y)
  ) {
    throw new Error('Unexpected Census geocoder response.');
  }
  return {
    latitude: Number(y.toFixed(6)),
    longitude: Number(x.toFixed(6)),
    matched_address: first.matchedAddress,
    differences: addressDifferences(entered, first.matchedAddress),
  };
}

export function insideLocationBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= LOCATION_BOUNDS.south &&
    latitude <= LOCATION_BOUNDS.north &&
    longitude >= LOCATION_BOUNDS.west &&
    longitude <= LOCATION_BOUNDS.east
  );
}
