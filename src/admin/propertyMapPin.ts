import {
  LOCATION_BOUNDS,
  insideLocationBounds,
} from '../../supabase/functions/_shared/addressGeocoding.ts';
import type { PropertyLocationSource, SupportedState } from '../types';

/** The four 0029 columns. A saved pin is all four or none. */
export interface PropertyPin {
  latitude: number | null;
  longitude: number | null;
  location_source: PropertyLocationSource | null;
  location_checked_on: string | null;
}

export interface PinAddress {
  address: string | null;
  city: string;
  state: SupportedState;
  postal_code: string | null;
}

export const NO_PIN: PropertyPin = {
  latitude: null,
  longitude: null,
  location_source: null,
  location_checked_on: null,
};

/** Compared with the address a pin was placed for, to flag later edits. */
export function pinAddressKey(address: PinAddress): string {
  return [address.address, address.city, address.state, address.postal_code]
    .map((part) => (part ?? '').trim().replace(/\s+/g, ' ').toLowerCase())
    .join('|');
}

/** The form's message for a pin the database would reject, or null. */
export function pinProblem(pin: PropertyPin): string | null {
  const { latitude, longitude } = pin;
  if (latitude === null && longitude === null) return null;
  if (latitude === null || longitude === null) {
    return 'Enter both latitude and longitude for the map pin, or remove it.';
  }
  if (!insideLocationBounds(latitude, longitude)) {
    return `The map pin must be in Oregon or Washington: latitude ${LOCATION_BOUNDS.south} to ${LOCATION_BOUNDS.north}, longitude ${LOCATION_BOUNDS.west} to ${LOCATION_BOUNDS.east}.`;
  }
  return null;
}

/** What to save: a complete pin, or four nulls when no coordinates are left. */
export function savedPin(pin: PropertyPin, today: string): PropertyPin {
  if (pin.latitude === null || pin.longitude === null) return NO_PIN;
  return {
    latitude: pin.latitude,
    longitude: pin.longitude,
    location_source: pin.location_source ?? 'manual',
    location_checked_on: pin.location_checked_on ?? today,
  };
}

/** Today's date where the administrator is, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function openStreetMapUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}
