import { describe, expect, it } from 'vitest';
import {
  NO_PIN,
  localToday,
  openStreetMapUrl,
  pinAddressKey,
  pinProblem,
  savedPin,
} from './propertyMapPin';

const pin = (latitude: number | null, longitude: number | null) => ({
  latitude,
  longitude,
  location_source: 'manual' as const,
  location_checked_on: '2026-10-28',
});

describe('pinProblem', () => {
  it('accepts no pin or a pin inside Oregon and Washington', () => {
    expect(pinProblem(NO_PIN)).toBeNull();
    expect(pinProblem(pin(45.515915, -122.686984))).toBeNull();
    expect(pinProblem(pin(47.6, -122.3))).toBeNull();
  });

  it('explains half a pin and a pin outside the area', () => {
    expect(pinProblem(pin(45.5, null))).toMatch(/both latitude and longitude/);
    expect(pinProblem(pin(null, -122.6))).toMatch(/both latitude and longitude/);
    expect(pinProblem(pin(-122.6, 45.5))).toMatch(/Oregon or Washington/);
    expect(pinProblem(pin(37.77, -122.42))).toMatch(/Oregon or Washington/);
  });
});

describe('savedPin', () => {
  it('saves four nulls once the coordinates are cleared', () => {
    expect(savedPin(pin(null, null), '2026-10-28')).toEqual(NO_PIN);
  });

  it('fills a missing source and date so the database check passes', () => {
    expect(savedPin({ ...NO_PIN, latitude: 45.5, longitude: -122.6 }, '2026-10-28')).toEqual({
      latitude: 45.5,
      longitude: -122.6,
      location_source: 'manual',
      location_checked_on: '2026-10-28',
    });
  });

  it('keeps a Census pin as it is', () => {
    const census = { latitude: 45.5, longitude: -122.6, location_source: 'census_geocoder' as const, location_checked_on: '2026-10-27' };
    expect(savedPin(census, '2026-10-28')).toEqual(census);
  });
});

describe('pinAddressKey', () => {
  it('ignores case and spacing but not a changed street', () => {
    const base = { address: '9965 NE Walker Road', city: 'Hillsboro', state: 'OR' as const, postal_code: '97223' };
    expect(pinAddressKey({ ...base, address: ' 9965  ne walker road ' })).toBe(pinAddressKey(base));
    expect(pinAddressKey({ ...base, address: '9965 NW Walker Road' })).not.toBe(pinAddressKey(base));
    expect(pinAddressKey({ ...base, postal_code: '97006' })).not.toBe(pinAddressKey(base));
  });
});

describe('localToday', () => {
  it('uses the local calendar date', () => {
    expect(localToday(new Date(2026, 9, 28, 23, 30))).toBe('2026-10-28');
    expect(localToday(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});

describe('openStreetMapUrl', () => {
  it('centres the map on the pin', () => {
    expect(openStreetMapUrl(45.515915, -122.686984)).toBe(
      'https://www.openstreetmap.org/?mlat=45.515915&mlon=-122.686984#map=18/45.515915/-122.686984',
    );
  });
});
