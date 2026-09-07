import { describe, expect, it } from 'vitest';
import { DIRECTORY_CATEGORIES } from '../data/categoryMap';
import { LOCAL_LANDING_PAGES } from '../data/localLandingPages';
import { RESOURCE_SERVICE_TAGS } from '../data/resourceServiceTags';
import { COUNTIES_BY_STATE, SUPPORTED_STATES } from '../data/serviceAreas';
import { resourceSearchContext } from './resourceSearchLocation';
import { areaValue, directoryUrl, needFilters, parseDirectoryArea, readDirectoryReturn, readDirectoryState, RESOURCE_HOUSEHOLDS, RESOURCE_NEEDS } from './resourceDirectoryState';

describe('one resource directory state', () => {
  it('validates and normalizes the return link while preserving private query state', () => {
    expect(readDirectoryReturn({ url: '/resources/?area=OR:Multnomah&need=service:moving_help', query: 'moving' }))
      .toEqual({ url: '/resources/?area=OR%3AMultnomah&need=service%3Amoving_help', query: 'moving' });
  });
  it.each([null, 'https://example.org', { url: '//example.org' }, { url: '/resources/../../admin' },
    { url: '/resources/?area=WA:Multnomah' }, { url: '/admin/resources/' }, { url: 'https://example.org/resources/' }])
    ('refuses invalid or external return destinations %j', value => {
      expect(readDirectoryReturn(value)).toBeUndefined();
    });
  it('starts without a forced need or area', () => {
    expect(readDirectoryState('/resources/', '')).toEqual({ query: '', need: 'all', area: undefined, household: null, sort: 'relevance', invalidLink: false });
  });
  it.each(LOCAL_LANDING_PAGES)('preserves old entry $path without another directory', page => {
    const state = readDirectoryState(page.path, '');
    expect(state.area).toEqual({ state: page.stateName === 'Oregon' ? 'OR' : 'WA', county: page.county });
    expect(state.need).toBe(page.service ? `category:${page.service}` : 'all');
    const url = directoryUrl(state);
    expect(url).toMatch(/^\/resources\/\?/);
    expect(readDirectoryState('/resources/', url.slice(url.indexOf('?')))).toEqual(state);
  });
  it('exposes every existing category and service exactly once', () => {
    const values = RESOURCE_NEEDS.map(option => option.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.slice().sort()).toEqual([
      ...DIRECTORY_CATEGORIES.map(value => `category:${value}`), ...RESOURCE_SERVICE_TAGS.map(value => `service:${value}`),
    ].sort());
  });
  it.each(RESOURCE_NEEDS)('maps $value without a hidden cross-group filter', option => {
    const filters = needFilters(option.value);
    expect(filters.categories.length + filters.serviceTags.length).toBe(1);
    expect(filters.categories.length && filters.serviceTags.length).toBe(0);
    expect(readDirectoryState('/resources/', '?need=' + encodeURIComponent(option.value)).need).toBe(option.value);
  });
  it('supports every state/county and roundtrips a specific county', () => {
    for (const state of SUPPORTED_STATES) {
      expect(parseDirectoryArea(state)).toEqual({ state, county: null });
      for (const county of COUNTIES_BY_STATE[state]) {
        expect(parseDirectoryArea(areaValue({ state, county }))).toEqual({ state, county });
      }
    }
  });
  it.each(['?area=OR:King', '?area=WA:Jackson', '?area=OR:Jackson:extra', '?area=CA', '?area=', '?need=unknown', '?household=unknown', '?sort=random'])('does not silently broaden a malformed filter link %s', search => {
    expect(readDirectoryState('/resources/', search).invalidLink).toBe(true);
  });
  it('lets explicit filters override an old county entry', () => {
    expect(readDirectoryState('/housing-help/multnomah-county/rent-assistance/', '?area=WA:King&need=service:moving_help')).toMatchObject({
      area: { state: 'WA', county: 'King' }, need: 'service:moving_help', invalidLink: false,
    });
  });
  it.each(RESOURCE_HOUSEHOLDS)('preserves $label when changing area or returning with Back', option => {
    const state = readDirectoryState('/resources/', `?household=${option.value}&area=OR:Multnomah&sort=alpha`, { resourceQuery: 'moving' });
    const url = directoryUrl(state);
    expect(readDirectoryState('/resources/', url.slice(url.indexOf('?')), { resourceQuery: state.query })).toEqual(state);
  });
  it('keeps free-form words out of the URL and restores them only from history state', () => {
    const state = readDirectoryState('/resources/', '?q=not-read', { resourceQuery: 'sensitive search words' });
    expect(state.query).toBe('sensitive search words');
    expect(directoryUrl(state)).toBe('/resources/');
    expect(readDirectoryState('/resources/', '', { resourceQuery: 42 }).query).toBe('');
  });
  it('keeps explicit all-areas different from automatically following query location', () => {
    const manual = readDirectoryState('/resources/', '?area=all', { resourceQuery: 'rent in Spokane' });
    expect(resourceSearchContext(manual.query, manual.area).location).toBeNull();
    const automatic = readDirectoryState('/resources/', '', { resourceQuery: 'rent in Spokane' });
    expect(resourceSearchContext(automatic.query, automatic.area).location).toEqual({ state: 'WA', county: 'Spokane' });
  });
  it('clear-all cannot resurrect an old county/service default', () => {
    const state = readDirectoryState('/housing-help/clark-county/rent-assistance/', '');
    expect(directoryUrl({ ...state, query: '', area: undefined, need: 'all', household: null, sort: 'relevance' })).toBe('/resources/');
    expect(needFilters('all')).toEqual({ categories: [], serviceTags: [] });
  });
});
