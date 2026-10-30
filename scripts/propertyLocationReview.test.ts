import { describe, expect, it } from 'vitest';
import type { AddressMatch } from '../supabase/functions/_shared/addressGeocoding.ts';
import {
  addressLookupFor,
  reviewPropertyLocation,
  type ReviewedProperty,
} from './propertyLocationReview';

const property = (overrides: Partial<ReviewedProperty>): ReviewedProperty => ({
  id: 'p1',
  name: 'Example Commons',
  address: '1240 SW Columbia Street',
  city: 'Portland',
  state: 'OR',
  postal_code: '97201',
  ...overrides,
});

const match = (overrides: Partial<AddressMatch> = {}): AddressMatch => ({
  latitude: 45.515915,
  longitude: -122.686984,
  matched_address: '1240 SW COLUMBIA ST, PORTLAND, OR, 97201',
  differences: [],
  ...overrides,
});

describe('addressLookupFor', () => {
  it('skips listings without a street address', () => {
    expect(addressLookupFor(property({ address: undefined }))).toBeNull();
    expect(addressLookupFor(property({ address: '  ' }))).toBeNull();
  });

  it('builds the lookup the admin form sends', () => {
    expect(addressLookupFor(property({ postal_code: undefined }))).toEqual({
      address: '1240 SW Columbia Street',
      city: 'Portland',
      state: 'OR',
      postal_code: null,
    });
  });
});

describe('reviewPropertyLocation', () => {
  const census = { latitude: 45.515915, longitude: -122.686984, location_source: 'census_geocoder' as const };

  it('passes a Census pin that sits on the Census match', () => {
    expect(reviewPropertyLocation(property(census), match())).toEqual([]);
  });

  it('asks for a pin when the address has a match but no pin', () => {
    expect(reviewPropertyLocation(property({}), match())).toEqual([
      'Not on the map. The Census geocoder places it at 45.515915, -122.686984: use "Find on map" in the admin property form.',
    ]);
  });

  it('reports an address that differs from the Census match, as for Dolores Apartments', () => {
    const problems = reviewPropertyLocation(
      property({ address: '9965 NE Walker Road', city: 'Hillsboro', postal_code: '97223' }),
      match({ matched_address: '9965 NW WALKER RD, HILLSBORO, OR, 97006', differences: ['NW', '97006'] }),
    );
    expect(problems[0]).toMatch(/differs from the published address in: NW, 97006/);
    expect(problems[1]).toMatch(/^Not on the map/);
  });

  it('flags a Census pin about 100 m off but allows a hand-placed pin there', () => {
    const moved = { latitude: 45.516815, longitude: -122.686984 };
    expect(reviewPropertyLocation(property({ ...census, ...moved }), match())).toEqual([
      'The Census pin is 100 m from the Census match. Find it again, or check the pin.',
    ]);
    expect(reviewPropertyLocation(property({ ...moved, location_source: 'manual' }), match())).toEqual([]);
  });

  it('flags a hand-placed pin far from the address', () => {
    const far = { latitude: 45.52, longitude: -122.686984, location_source: 'manual' as const };
    expect(reviewPropertyLocation(property(far), match())[0]).toMatch(/^The hand-placed pin is \d+ m from/);
  });

  it('reports addresses the Census geocoder cannot find', () => {
    expect(reviewPropertyLocation(property(census), null)[0]).toMatch(/finds no match.*Check the address and the pin/);
    expect(reviewPropertyLocation(property({}), null)[0]).toMatch(/^Not on the map, and the Census geocoder finds no match/);
  });
});
