import { COUNTIES_BY_STATE, STATE_NAMES, SUPPORTED_STATES } from './serviceAreas';
import type { ServiceArea } from '../types';

// Explicit geography, never inferred from a provider's office or description.
// City/county references and expansion rules: docs/LOCATION_SEARCH.md.
const CITY_COUNTIES: Array<[string, ServiceArea['state'], string[]]> = [
  ['Bend', 'OR', ['Deschutes']],
  ['La Pine', 'OR', ['Deschutes']],
  ['Sisters', 'OR', ['Deschutes']],
  ['Redmond', 'OR', ['Deschutes']],
  ['Redmond', 'WA', ['King']],
  ['Spokane', 'WA', ['Spokane']],
  ['Spokane Valley', 'WA', ['Spokane']],
  ['Seattle', 'WA', ['King']],
  ['Tacoma', 'WA', ['Pierce']],
  ['Vancouver', 'WA', ['Clark']],
  ['Portland', 'OR', ['Multnomah', 'Clackamas', 'Washington']],
  ['PDX', 'OR', ['Multnomah', 'Clackamas', 'Washington']],
];

export function normalizePlace(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export const SEARCH_LOCATIONS = (() => {
  const locations = new Map<string, ServiceArea[]>();
  function add(alias: string, area: ServiceArea) {
    const key = normalizePlace(alias);
    const existing = locations.get(key) ?? [];
    if (!existing.some(item => item.state === area.state && item.county === area.county)) {
      locations.set(key, [...existing, area]);
    }
  }
  function addQualified(alias: string, area: ServiceArea) {
    add(alias, area);
    for (const state of [area.state, STATE_NAMES[area.state]]) {
      add(`${alias} ${state}`, area);
      add(`${state} ${alias}`, area);
    }
  }
  for (const state of SUPPORTED_STATES) {
    const area = { state, county: null };
    for (const alias of [state, STATE_NAMES[state], `${STATE_NAMES[state]} state`]) add(alias, area);
    for (const county of COUNTIES_BY_STATE[state]) {
      addQualified(county, { state, county });
      addQualified(`${county} County`, { state, county });
    }
  }
  for (const [city, state, counties] of CITY_COUNTIES) {
    for (const county of counties) addQualified(city, { state, county });
  }
  return locations;
})();
