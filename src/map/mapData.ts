import type { FeatureCollection, Point } from 'geojson';
import { affordablePropertySlug } from '../lib/entityRoutes';
import type { RegulatedProperty } from './regulatedHousing';
import type {
  AffordableProperty,
  AffordablePropertyType,
  BedroomType,
  PropertyAudience,
  WaitlistStatus,
} from '../types';

export interface MapLocation {
  lat: number;
  lng: number;
}

export interface MapProperty {
  slug: string;
  property: AffordableProperty;
  /** Null when the record has no stored coordinates yet. */
  location: MapLocation | null;
}

export interface MapFilters {
  query: string;
  bedrooms: BedroomType[];
  amiLevels: number[];
  types: AffordablePropertyType[];
  openOnly: boolean;
}

export const EMPTY_FILTERS: MapFilters = {
  query: '',
  bedrooms: [],
  amiLevels: [],
  types: [],
  openOnly: false,
};

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ViewportStats {
  properties: number;
  homes: number;
  /** True when some properties in view do not publish a unit count. */
  homesPartial: boolean;
  accepting: number;
  lowestAmi: number | null;
}

export interface PropertyFeatureProps {
  slug: string;
  name: string;
  status: WaitlistStatus;
  type: AffordablePropertyType;
  units: number;
  owner: string;
  manager: string;
}

/**
 * Places each listing at the coordinates stored on its record (migration
 * 0029). A listing without them stays off the map rather than being guessed
 * at a city centre; administrators pin it from the property form.
 */
export function toMapProperties(properties: readonly AffordableProperty[]): MapProperty[] {
  return properties.map((property) => ({
    slug: affordablePropertySlug(property),
    property,
    location:
      property.latitude !== undefined && property.longitude !== undefined
        ? { lat: property.latitude, lng: property.longitude }
        : null,
  }));
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Text a visitor might type: name, address, city, county, ZIP or organization. */
export function searchableText(property: AffordableProperty): string {
  return normalize(
    [
      property.name,
      property.address,
      property.city,
      property.county,
      property.postal_code,
      property.owner_organization,
      property.management_company,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

export function matchesQuery(property: AffordableProperty, query: string): boolean {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchableText(property);
  return terms.every((term) => haystack.includes(term));
}

export function matchesFilters(property: AffordableProperty, filters: MapFilters): boolean {
  if (filters.openOnly && property.waitlist_status !== 'open') return false;
  if (filters.types.length && !filters.types.includes(property.property_type)) return false;
  if (
    filters.bedrooms.length &&
    !filters.bedrooms.some((bedroom) => property.bedroom_types.includes(bedroom))
  ) {
    return false;
  }
  if (
    filters.amiLevels.length &&
    !filters.amiLevels.some((level) => property.ami_levels.includes(level))
  ) {
    return false;
  }
  return matchesQuery(property, filters.query);
}

export function hasActiveFilters(filters: MapFilters): boolean {
  return Boolean(
    filters.query.trim() ||
      filters.bedrooms.length ||
      filters.amiLevels.length ||
      filters.types.length ||
      filters.openOnly,
  );
}

export function statusOf(property: AffordableProperty): WaitlistStatus {
  return property.waitlist_status ?? 'unknown';
}

export function toFeatureCollection(
  items: readonly MapProperty[],
): FeatureCollection<Point, PropertyFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: items.flatMap(({ slug, property, location }) =>
      location
        ? [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [location.lng, location.lat] },
              properties: {
                slug,
                name: property.name,
                status: statusOf(property),
                type: property.property_type,
                units: property.total_units ?? 0,
                owner: property.owner_organization ?? '',
                manager: property.management_company ?? '',
              },
            },
          ]
        : [],
    ),
  };
}

export function isInBounds(location: { lat: number; lng: number }, bounds: MapBounds): boolean {
  return (
    location.lat >= bounds.south &&
    location.lat <= bounds.north &&
    location.lng >= bounds.west &&
    location.lng <= bounds.east
  );
}

export function viewportStats(items: readonly MapProperty[]): ViewportStats {
  let homes = 0;
  let homesPartial = false;
  let accepting = 0;
  let lowestAmi: number | null = null;
  for (const { property } of items) {
    if (property.total_units) homes += property.total_units;
    else homesPartial = true;
    if (property.waitlist_status === 'open') accepting += 1;
    for (const level of property.ami_levels) {
      if (lowestAmi === null || level < lowestAmi) lowestAmi = level;
    }
  }
  return { properties: items.length, homes, homesPartial, accepting, lowestAmi };
}

export function boundsOf(items: readonly MapProperty[]): MapBounds | null {
  let bounds: MapBounds | null = null;
  for (const { location } of items) {
    if (!location) continue;
    bounds = bounds
      ? {
          west: Math.min(bounds.west, location.lng),
          south: Math.min(bounds.south, location.lat),
          east: Math.max(bounds.east, location.lng),
          north: Math.max(bounds.north, location.lat),
        }
      : { west: location.lng, south: location.lat, east: location.lng, north: location.lat };
  }
  return bounds;
}

export type MapItemKind = 'listing' | 'city';

/**
 * One point on the map: a Housing Navigator listing (with any City record for
 * the same building attached) or a City-financed property that Housing
 * Navigator does not list yet.
 */
export interface MapItem {
  key: string;
  kind: MapItemKind;
  name: string;
  lat: number;
  lng: number;
  /** Published number of homes, or 0 when unknown. */
  units: number;
  open: boolean;
  listing: MapProperty | null;
  city: RegulatedProperty | null;
}

export const listingKey = (slug: string) => `listing:${slug}`;
export const cityKey = (id: string) => `city:${id}`;

export function buildMapItems(
  listings: readonly MapProperty[],
  records: readonly RegulatedProperty[],
  matches: ReadonlyMap<string, RegulatedProperty>,
): MapItem[] {
  const matched = new Set([...matches.values()].map((record) => record.id));
  const items: MapItem[] = [];
  for (const listing of listings) {
    if (!listing.location) continue;
    const city = matches.get(listing.slug) ?? null;
    items.push({
      key: listingKey(listing.slug),
      kind: 'listing',
      name: listing.property.name,
      lat: listing.location.lat,
      lng: listing.location.lng,
      // Listing facts come only from the listing (docs/AFFORDABLE_HOUSING.md);
      // City figures for the same building are shown separately with their source.
      units: listing.property.total_units ?? 0,
      open: listing.property.waitlist_status === 'open',
      listing,
      city,
    });
  }
  for (const record of records) {
    if (matched.has(record.id)) continue;
    items.push({
      key: cityKey(record.id),
      kind: 'city',
      name: record.name,
      lat: record.lat,
      lng: record.lng,
      units: record.total_units ?? 0,
      open: false,
      listing: null,
      city: record,
    });
  }
  return items;
}

/** Filters that only Housing Navigator listings can answer. */
export function usesListingOnlyFilters(filters: MapFilters): boolean {
  return Boolean(filters.bedrooms.length || filters.types.length || filters.openOnly);
}

function cityMatchesQuery(record: RegulatedProperty, query: string): boolean {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(
    [record.name, record.address, record.sponsor, record.neighborhood]
      .filter(Boolean)
      .join(' '),
  );
  return terms.every((term) => haystack.includes(term));
}

function cityMatchesFilters(record: RegulatedProperty, filters: MapFilters): boolean {
  if (usesListingOnlyFilters(filters)) return false;
  if (
    filters.amiLevels.length &&
    !filters.amiLevels.some((level) => record.ami_units[String(level)])
  ) {
    return false;
  }
  return cityMatchesQuery(record, filters.query);
}

/**
 * A listing shows when its own facts match. When it shares a building with a
 * City record, it also shows when the City record matches on the City's own
 * facts (its income tiers, sponsor or neighborhood), so turning on a filter
 * never hides a City-financed building just because a listing is attached.
 */
export function filterItems(
  items: readonly MapItem[],
  filters: MapFilters,
  showCity: boolean,
): MapItem[] {
  return items.filter((item) => {
    if (item.listing && matchesFilters(item.listing.property, filters)) return true;
    return showCity && item.city !== null && cityMatchesFilters(item.city, filters);
  });
}

export function itemsInBounds(items: readonly MapItem[], bounds: MapBounds): MapItem[] {
  return items.filter((item) => isInBounds(item, bounds));
}

export type FocusKind = 'neighborhood' | 'tier' | 'sponsor';

export interface Breakdown {
  /** Stable id within its kind: a neighborhood or sponsor name, or a tier. */
  value: string;
  label: string;
  buildings: number;
  /** Income-restricted homes (or homes at this tier) the City records. */
  homes: number;
  keys: string[];
}

export interface CityBreakdowns {
  neighborhoods: Breakdown[];
  tiers: Breakdown[];
  sponsors: Breakdown[];
  /** Buildings whose sponsor is not published (individuals, unreviewed). */
  unnamedSponsorBuildings: number;
}

export const OUTSIDE_NEIGHBORHOODS = 'Outside Portland neighborhoods';

export function tierLabel(tier: string): string {
  return tier === '81' ? 'Above 80% AMI' : `${tier}% AMI`;
}

function addTo(groups: Map<string, Breakdown>, value: string, label: string, key: string, homes: number) {
  const group = groups.get(value) ?? { value, label, buildings: 0, homes: 0, keys: [] };
  group.buildings += 1;
  group.homes += homes;
  group.keys.push(key);
  groups.set(value, group);
}

const byHomes = (a: Breakdown, b: Breakdown) => b.homes - a.homes || a.label.localeCompare(b.label);

/**
 * City-financed housing grouped three ways, from City records only, so every
 * number traces to one source. A listing that shares a building with a City
 * record is counted through that record.
 */
export function cityBreakdowns(items: readonly MapItem[]): CityBreakdowns {
  const neighborhoods = new Map<string, Breakdown>();
  const tiers = new Map<string, Breakdown>();
  const sponsors = new Map<string, Breakdown>();
  let unnamedSponsorBuildings = 0;
  for (const item of items) {
    const record = item.city;
    if (!record) continue;
    const homes = record.regulated_units ?? 0;
    const hood = record.neighborhood ?? OUTSIDE_NEIGHBORHOODS;
    addTo(neighborhoods, hood, hood, item.key, homes);
    if (record.sponsor) addTo(sponsors, record.sponsor, record.sponsor, item.key, homes);
    else unnamedSponsorBuildings += 1;
    for (const [tier, units] of Object.entries(record.ami_units)) {
      addTo(tiers, tier, tierLabel(tier), item.key, units);
    }
  }
  return {
    neighborhoods: [...neighborhoods.values()].sort(byHomes),
    tiers: [...tiers.values()].sort((a, b) => Number(a.value) - Number(b.value)),
    sponsors: [...sponsors.values()].sort(byHomes),
    unnamedSponsorBuildings,
  };
}

export function findBreakdown(
  breakdowns: CityBreakdowns,
  kind: FocusKind,
  value: string,
): Breakdown | null {
  const list =
    kind === 'neighborhood' ? breakdowns.neighborhoods : kind === 'tier' ? breakdowns.tiers : breakdowns.sponsors;
  return list.find((entry) => entry.value === value) ?? null;
}
