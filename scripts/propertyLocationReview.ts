/**
 * The checks behind `npm run geocode:properties`, kept apart from the
 * script's network and file access so they can be tested.
 */

import type {
  AddressLookup,
  AddressMatch,
} from '../supabase/functions/_shared/addressGeocoding.ts';
import { metersBetween } from '../src/map/regulatedHousing';
import type { AffordableProperty } from '../src/types';

export type ReviewedProperty = Pick<
  AffordableProperty,
  'id' | 'name' | 'address' | 'city' | 'state' | 'postal_code' | 'latitude' | 'longitude' | 'location_source'
>;

/** A Census pin should sit on the Census match; more means the address or the geocoder changed. */
export const CENSUS_PIN_TOLERANCE_M = 50;
/** A hand-placed pin marks the building, which can be a block from the street address. */
export const MANUAL_PIN_TOLERANCE_M = 250;

export function addressLookupFor(property: ReviewedProperty): AddressLookup | null {
  const address = property.address?.trim();
  if (!address) return null;
  return {
    address,
    city: property.city.trim(),
    state: property.state,
    postal_code: property.postal_code?.trim() || null,
  };
}

/** What needs a curator's attention for one listing with a street address; empty when nothing does. */
export function reviewPropertyLocation(
  property: ReviewedProperty,
  match: AddressMatch | null,
): string[] {
  const pinned = property.latitude !== undefined && property.longitude !== undefined;
  if (!match) {
    return [
      pinned
        ? 'The Census geocoder finds no match for the published address. Check the address and the pin.'
        : 'Not on the map, and the Census geocoder finds no match. Check the address, or pin it by hand.',
    ];
  }

  const problems: string[] = [];
  if (match.differences.length) {
    problems.push(
      `The Census match "${match.matched_address}" differs from the published address in: ${match.differences.join(', ')}.`,
    );
  }
  if (!pinned) {
    problems.push(
      `Not on the map. The Census geocoder places it at ${match.latitude}, ${match.longitude}: use "Find on map" in the admin property form.`,
    );
    return problems;
  }

  const distance = metersBetween(
    { lat: property.latitude!, lng: property.longitude! },
    { lat: match.latitude, lng: match.longitude },
  );
  const manual = property.location_source === 'manual';
  if (distance > (manual ? MANUAL_PIN_TOLERANCE_M : CENSUS_PIN_TOLERANCE_M)) {
    problems.push(
      `The ${manual ? 'hand-placed' : 'Census'} pin is ${Math.round(distance)} m from the Census match. Find it again, or check the pin.`,
    );
  }
  return problems;
}
