import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CENSUS_GEOCODER_URL,
  LOCATION_BOUNDS,
  addressDifferences,
  censusLookupUrl,
  firstCensusMatch,
  insideLocationBounds,
  oneLineAddress,
  parseAddressLookup,
} from '../../supabase/functions/_shared/addressGeocoding.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Trimmed from a real Census geocoder answer (2026-10-28).
const COLUMBIA_RESPONSE = {
  result: {
    input: { address: { address: '1240 SW Columbia Street, Portland, OR 97201' } },
    addressMatches: [
      {
        coordinates: { x: -122.686983543029, y: 45.515914534496 },
        matchedAddress: '1240 SW COLUMBIA ST, PORTLAND, OR, 97201',
      },
    ],
  },
};

describe('parseAddressLookup', () => {
  const valid = { address: ' 1240 SW Columbia Street ', city: 'Portland', state: 'OR', postal_code: '97201' };

  it('accepts the four form fields and trims them', () => {
    expect(parseAddressLookup(valid)).toEqual({
      address: '1240 SW Columbia Street',
      city: 'Portland',
      state: 'OR',
      postal_code: '97201',
    });
    expect(parseAddressLookup({ ...valid, postal_code: '' })?.postal_code).toBeNull();
    expect(parseAddressLookup({ ...valid, postal_code: null })?.postal_code).toBeNull();
  });

  it('rejects anything else instead of ignoring it', () => {
    expect(parseAddressLookup(null)).toBeNull();
    expect(parseAddressLookup([valid])).toBeNull();
    expect(parseAddressLookup({ ...valid, url: 'https://example.com' })).toBeNull();
    expect(parseAddressLookup({ ...valid, state: 'CA' })).toBeNull();
    expect(parseAddressLookup({ ...valid, address: '   ' })).toBeNull();
    expect(parseAddressLookup({ ...valid, city: 7 })).toBeNull();
    expect(parseAddressLookup({ ...valid, postal_code: 'OR 97201' })).toBeNull();
    expect(parseAddressLookup({ ...valid, address: 'x'.repeat(201) })).toBeNull();
  });
});

describe('censusLookupUrl', () => {
  it('only ever asks the Census geocoder, with the address as a parameter', () => {
    const lookup = parseAddressLookup({
      address: '1 Main St/../../admin?x=1',
      city: 'Portland',
      state: 'OR',
      postal_code: null,
    })!;
    const url = censusLookupUrl(lookup);
    expect(`${url.origin}${url.pathname}`).toBe(CENSUS_GEOCODER_URL);
    expect(url.searchParams.get('address')).toBe(oneLineAddress(lookup));
    expect(url.searchParams.get('benchmark')).toBe('Public_AR_Current');
    expect(url.searchParams.get('format')).toBe('json');
  });

  it('builds the same one-line address as the geocode script', () => {
    expect(oneLineAddress({ address: '1240 SW Columbia Street', city: 'Portland', state: 'OR', postal_code: '97201' }))
      .toBe('1240 SW Columbia Street, Portland, OR 97201');
    expect(oneLineAddress({ address: '1 Main St', city: 'Vancouver', state: 'WA', postal_code: null }))
      .toBe('1 Main St, Vancouver, WA');
  });
});

describe('firstCensusMatch', () => {
  it('rounds to the six decimals stored for the listings', () => {
    expect(firstCensusMatch(COLUMBIA_RESPONSE, '1240 SW Columbia Street, Portland, OR 97201')).toEqual({
      latitude: 45.515915,
      longitude: -122.686984,
      matched_address: '1240 SW COLUMBIA ST, PORTLAND, OR, 97201',
      differences: [],
    });
  });

  it('returns null when there is no match', () => {
    expect(firstCensusMatch({ result: { addressMatches: [] } }, 'x')).toBeNull();
  });

  it('throws on an answer that is not the documented shape', () => {
    expect(() => firstCensusMatch({}, 'x')).toThrow();
    expect(() => firstCensusMatch({ result: { addressMatches: [{ matchedAddress: 'x' }] } }, 'x')).toThrow();
    expect(() => firstCensusMatch(
      { result: { addressMatches: [{ matchedAddress: 'x', coordinates: { x: 'a', y: 1 } }] } },
      'x',
    )).toThrow();
  });
});

describe('addressDifferences', () => {
  it('flags a direction or ZIP the published address gets wrong', () => {
    expect(addressDifferences(
      '9965 NE Walker Road, Hillsboro, OR 97223',
      '9965 NW WALKER RD, HILLSBORO, OR, 97006',
    )).toEqual(['NW', '97006']);
  });

  it('ignores street-type spelling and a ZIP the record never published', () => {
    // The five-digit house number is not a ZIP.
    expect(addressDifferences('12015 E Burnside Street, Portland, OR', '12015 E BURNSIDE ST, PORTLAND, OR, 97216'))
      .toEqual([]);
    expect(addressDifferences('12015 E Burnside Street, Portland, OR 97216-1234', '12015 E BURNSIDE ST, PORTLAND, OR, 97216'))
      .toEqual([]);
  });
});

describe('location bounds', () => {
  it('match the database check in migration 0029', () => {
    const sql = read('supabase/migrations/0029_affordable_property_locations.sql');
    const { south, north, west, east } = LOCATION_BOUNDS;
    expect(sql).toContain(`latitude between ${south} and ${north}`);
    expect(sql).toContain(`longitude between ${west.toFixed(1)} and ${east}`);
    expect(insideLocationBounds(45.5, -122.6)).toBe(true);
    expect(insideLocationBounds(40.0, -122.6)).toBe(false);
    expect(insideLocationBounds(45.5, -110.0)).toBe(false);
  });
});

describe('geocode-address function', () => {
  const source = read('supabase/functions/geocode-address/index.ts');

  it('checks the caller is an administrator before reading the request', () => {
    const getUser = source.indexOf('admin.auth.getUser(token)');
    const membership = source.indexOf(".from('admin_users')");
    const forbidden = source.indexOf("'Admin access required.' }, 403");
    const body = source.indexOf('request.json()');
    expect(getUser).toBeGreaterThan(0);
    expect(membership).toBeGreaterThan(getUser);
    expect(forbidden).toBeGreaterThan(membership);
    expect(body).toBeGreaterThan(forbidden);
  });

  it('sends one request, to the Census geocoder only, and writes nothing', () => {
    expect(source.match(/\bfetch\(/g)).toHaveLength(1);
    expect(source).toContain('fetch(censusLookupUrl(lookup)');
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });
});
