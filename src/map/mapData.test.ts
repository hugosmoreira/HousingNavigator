import { describe, expect, it } from 'vitest';
import type { AffordableProperty } from '../types';
import type { RegulatedProperty } from './regulatedHousing';
import {
  EMPTY_FILTERS,
  boundsOf,
  buildMapItems,
  OUTSIDE_NEIGHBORHOODS,
  cityBreakdowns,
  filterItems,
  matchesFilters,
  toFeatureCollection,
  toMapProperties,
  viewportStats,
} from './mapData';

function property(overrides: Partial<AffordableProperty>): AffordableProperty {
  return {
    id: 'p1',
    name: 'Example Commons',
    property_type: 'tax_credit',
    city: 'Portland',
    county: 'Multnomah',
    state: 'OR',
    ami_levels: [60],
    bedroom_types: ['1', '2'],
    audiences: ['general'],
    last_verified: '2026-08-27',
    priority_score: 0,
    ...overrides,
  };
}

const location = (lat: number, lng: number) => ({
  lat,
  lng,
  input_address: 'x',
  matched_address: 'x',
  geocoded_on: '2026-10-27',
});

describe('toMapProperties', () => {
  it('leaves properties without a geocoded address off the map', () => {
    const items = toMapProperties(
      [property({ id: 'a' }), property({ id: 'b', name: 'No Address' })],
      { a: location(45.5, -122.6) },
    );
    expect(items.map((item) => item.location !== null)).toEqual([true, false]);
    expect(toFeatureCollection(items).features).toHaveLength(1);
  });
});

describe('matchesFilters', () => {
  const base = property({
    address: '7330 SE Foster Road',
    postal_code: '97206',
    management_company: 'Guardian Management LLC',
    waitlist_status: 'open',
  });

  it('searches address, ZIP and organizations, ignoring accents and case', () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, query: 'foster' })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, query: '97206' })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, query: 'guardian portland' })).toBe(true);
    expect(matchesFilters(property({ name: 'Armonía' }), { ...EMPTY_FILTERS, query: 'armonia' })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, query: 'seattle' })).toBe(false);
  });

  it('matches any selected unit size and AMI level', () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, bedrooms: ['3', '2'] })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, bedrooms: ['studio'] })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, amiLevels: [30, 60] })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, amiLevels: [30] })).toBe(false);
  });

  it('treats a missing waitlist status as not open', () => {
    expect(matchesFilters(property({}), { ...EMPTY_FILTERS, openOnly: true })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, openOnly: true })).toBe(true);
  });
});

describe('viewportStats', () => {
  it('flags unit totals as partial when a property omits its unit count', () => {
    const items = toMapProperties(
      [
        property({ id: 'a', total_units: 64, ami_levels: [30, 60], waitlist_status: 'open' }),
        property({ id: 'b', ami_levels: [50] }),
      ],
      {},
    );
    expect(viewportStats(items)).toEqual({
      properties: 2,
      homes: 64,
      homesPartial: true,
      accepting: 1,
      lowestAmi: 30,
    });
  });
});

describe('boundsOf', () => {
  it('returns null when nothing is mapped', () => {
    expect(boundsOf(toMapProperties([property({})], {}))).toBeNull();
  });
});

const cityRecord = (overrides: Partial<RegulatedProperty>): RegulatedProperty => ({
  id: 'R1',
  name: 'City Commons',
  address: '1 SE Main St',
  lat: 45.51,
  lng: -122.65,
  total_units: 40,
  regulated_units: 40,
  ami_units: { '60': 40 },
  sponsor: null,
  building_type: null,
  year_built: null,
  year_completed: null,
  neighborhood: null,
  ...overrides,
});

describe('buildMapItems', () => {
  it('shows a listing and its City record for the same building as one point', () => {
    const listings = toMapProperties(
      [property({ id: 'a', total_units: undefined })],
      { a: location(45.5, -122.6) },
    );
    const shared = cityRecord({ id: 'R1', total_units: 51 });
    const other = cityRecord({ id: 'R2', name: 'Other' });
    const items = buildMapItems(listings, [shared, other], new Map([[listings[0].slug, shared]]));
    // The listing keeps its own (missing) unit count rather than borrowing the City's.
    expect(items.map((item) => [item.kind, item.units, item.city?.id ?? null])).toEqual([
      ['listing', 0, 'R1'],
      ['city', 40, 'R2'],
    ]);
  });
});

describe('filterItems', () => {
  const listings = toMapProperties([property({ id: 'a', waitlist_status: 'open' })], {
    a: location(45.5, -122.6),
  });
  const items = buildMapItems(
    listings,
    [cityRecord({ sponsor: 'Home Forward', neighborhood: 'Lents' })],
    new Map(),
  );

  it('hides City records for filters only listings can answer', () => {
    expect(filterItems(items, { ...EMPTY_FILTERS, openOnly: true }, true)).toHaveLength(1);
    expect(filterItems(items, EMPTY_FILTERS, true)).toHaveLength(2);
    expect(filterItems(items, EMPTY_FILTERS, false)).toHaveLength(1);
  });

  it('searches City sponsors and neighborhoods', () => {
    expect(filterItems(items, { ...EMPTY_FILTERS, query: 'lents' }, true).map((i) => i.kind)).toEqual(['city']);
    expect(filterItems(items, { ...EMPTY_FILTERS, amiLevels: [30] }, true)).toHaveLength(0);
  });
});

describe('filterItems with shared buildings', () => {
  const listings = toMapProperties([property({ id: 'a', ami_levels: [] })], { a: location(45.5, -122.6) });
  const shared = cityRecord({ id: 'R9', ami_units: { '50': 12 }, sponsor: 'Rose CDC' });
  const items = buildMapItems(listings, [shared], new Map([[listings[0].slug, shared]]));

  it('keeps a listing whose City record matches the City facts', () => {
    expect(filterItems(items, { ...EMPTY_FILTERS, amiLevels: [50] }, true)).toHaveLength(1);
    expect(filterItems(items, { ...EMPTY_FILTERS, query: 'rose cdc' }, true)).toHaveLength(1);
  });

  it('does not use City facts when the City layer is hidden', () => {
    expect(filterItems(items, { ...EMPTY_FILTERS, amiLevels: [50] }, false)).toHaveLength(0);
  });
});

describe('cityBreakdowns', () => {
  it('groups City records by neighborhood, tier and published sponsor only', () => {
    const listings = toMapProperties([property({ id: 'a' })], { a: location(45.5, -122.6) });
    const shared = cityRecord({ id: 'R1', regulated_units: 50, ami_units: { '30': 10, '60': 40 }, neighborhood: 'Lents', sponsor: 'Rose CDC' });
    const other = cityRecord({ id: 'R2', regulated_units: 20, ami_units: { '60': 20 }, neighborhood: null, sponsor: null });
    const items = buildMapItems(listings, [shared, other], new Map([[listings[0].slug, shared]]));
    const result = cityBreakdowns(items);
    expect(result.neighborhoods.map((entry) => [entry.label, entry.homes])).toEqual([
      ['Lents', 50],
      [OUTSIDE_NEIGHBORHOODS, 20],
    ]);
    expect(result.tiers.map((entry) => [entry.value, entry.homes, entry.buildings])).toEqual([
      ['30', 10, 1],
      ['60', 60, 2],
    ]);
    expect(result.sponsors.map((entry) => entry.label)).toEqual(['Rose CDC']);
    expect(result.unnamedSponsorBuildings).toBe(1);
    // The shared building is counted once, through its City record, under the listing's key.
    expect(result.neighborhoods[0].keys).toEqual([items[0].key]);
  });
});
