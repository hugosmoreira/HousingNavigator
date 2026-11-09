/**
 * Plain links into Google Maps. They need no key, load no Google code on our
 * pages and send nothing until a visitor opens one.
 * https://developers.google.com/maps/documentation/urls/get-started
 */

export interface LinkPlace {
  /** Full street address with city and state, when one is published. */
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

function coordinates(place: LinkPlace): string | null {
  const { latitude, longitude } = place;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/** Transit directions to the place; the visitor's own start is chosen in Google Maps. */
export function transitDirectionsUrl(place: LinkPlace): string | null {
  const destination = place.address?.trim() || coordinates(place);
  if (!destination) return null;
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'transit' });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Street View at the place. Needs coordinates: an address alone cannot open a panorama. */
export function streetViewUrl(place: LinkPlace): string | null {
  const viewpoint = coordinates(place);
  if (!viewpoint) return null;
  const params = new URLSearchParams({ api: '1', map_action: 'pano', viewpoint });
  return `https://www.google.com/maps/@?${params.toString()}`;
}
