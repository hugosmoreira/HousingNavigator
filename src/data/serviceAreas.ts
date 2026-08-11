import type { Program, ServiceArea, SupportedState } from '../types';

export const SUPPORTED_STATES: SupportedState[] = ['OR', 'WA'];

export const STATE_NAMES: Record<SupportedState, string> = {
  OR: 'Oregon',
  WA: 'Washington',
};

export const COUNTIES_BY_STATE: Record<SupportedState, readonly string[]> = {
  OR: [
    'Baker', 'Benton', 'Clackamas', 'Clatsop', 'Columbia', 'Coos',
    'Crook', 'Curry', 'Deschutes', 'Douglas', 'Gilliam', 'Grant',
    'Harney', 'Hood River', 'Jackson', 'Jefferson', 'Josephine',
    'Klamath', 'Lake', 'Lane', 'Lincoln', 'Linn', 'Malheur', 'Marion',
    'Morrow', 'Multnomah', 'Polk', 'Sherman', 'Tillamook', 'Umatilla',
    'Union', 'Wallowa', 'Wasco', 'Washington', 'Wheeler', 'Yamhill',
  ],
  WA: [
    'Adams', 'Asotin', 'Benton', 'Chelan', 'Clallam', 'Clark',
    'Columbia', 'Cowlitz', 'Douglas', 'Ferry', 'Franklin', 'Garfield',
    'Grant', 'Grays Harbor', 'Island', 'Jefferson', 'King', 'Kitsap',
    'Kittitas', 'Klickitat', 'Lewis', 'Lincoln', 'Mason', 'Okanogan',
    'Pacific', 'Pend Oreille', 'Pierce', 'San Juan', 'Skagit',
    'Skamania', 'Snohomish', 'Spokane', 'Stevens', 'Thurston',
    'Wahkiakum', 'Walla Walla', 'Whatcom', 'Whitman', 'Yakima',
  ],
};

export function isSupportedState(value: unknown): value is SupportedState {
  return value === 'OR' || value === 'WA';
}

export function isSupportedServiceArea(value: unknown): value is ServiceArea {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ServiceArea>;
  if (!isSupportedState(candidate.state)) return false;
  return (
    candidate.county === null ||
    (typeof candidate.county === 'string' &&
      COUNTIES_BY_STATE[candidate.state].includes(candidate.county))
  );
}

export function inferStateFromCounty(county: string): SupportedState | null {
  if (county === 'Clark') return 'WA';
  if (COUNTIES_BY_STATE.OR.includes(county)) return 'OR';
  if (COUNTIES_BY_STATE.WA.includes(county)) return 'WA';
  return null;
}

export function normalizeServiceAreas(
  areas: unknown,
  fallback?: { state?: string | null; county?: string | null },
): ServiceArea[] {
  const normalized: ServiceArea[] = [];
  const seen = new Set<string>();

  if (Array.isArray(areas)) {
    for (const value of areas) {
      if (!isSupportedServiceArea(value)) continue;
      const key = `${value.state}:${value.county ?? '*'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({ state: value.state, county: value.county });
    }
  }

  if (normalized.length > 0) return normalized;

  const fallbackCounty = fallback?.county === 'Other' ? null : fallback?.county ?? null;
  const fallbackState = isSupportedState(fallback?.state)
    ? fallback.state
    : fallbackCounty
      ? inferStateFromCounty(fallbackCounty)
      : null;
  if (!fallbackState) return [];
  const candidate: ServiceArea = { state: fallbackState, county: fallbackCounty };
  return isSupportedServiceArea(candidate) ? [candidate] : [];
}

export function serviceAreasForProgram(program: Program): ServiceArea[] {
  return normalizeServiceAreas(program.service_areas, {
    state: program.state,
    county: program.county,
  });
}

export function programServesArea(
  program: Program,
  state: SupportedState,
  county?: string | null,
): boolean {
  return serviceAreasForProgram(program).some(
    (area) => area.state === state && (!county || area.county === null || area.county === county),
  );
}

export function serviceAreaLabel(area: ServiceArea): string {
  return area.county
    ? `${area.county} County, ${area.state}`
    : `All ${STATE_NAMES[area.state]}`;
}

export function serviceAreaSummary(areas: ServiceArea[]): string {
  if (areas.length === 0) return 'Service area not listed';
  if (areas.length === 1) return serviceAreaLabel(areas[0]);

  const statewide = areas.filter((area) => area.county === null);
  if (statewide.length > 0) {
    return statewide.map((area) => STATE_NAMES[area.state]).join(' and ');
  }

  const states = [...new Set(areas.map((area) => area.state))];
  if (states.length === 1 && areas.length <= 3) {
    const countyNames = areas
      .map((area) => area.county)
      .filter((county): county is string => Boolean(county));
    const counties = countyNames.length === 2
      ? countyNames.join(' and ')
      : countyNames.length === 3
        ? `${countyNames[0]}, ${countyNames[1]}, and ${countyNames[2]}`
        : countyNames[0];
    return `${counties} counties, ${states[0]}`;
  }
  if (states.length === 1) return `${areas.length} counties in ${STATE_NAMES[states[0]]}`;
  return `${areas.length} counties across Oregon and Washington`;
}

export function availableCounties(
  programs: Program[],
  state: SupportedState,
): string[] {
  const counties = new Set<string>();
  for (const program of programs) {
    for (const area of serviceAreasForProgram(program)) {
      if (area.state === state && area.county) counties.add(area.county);
    }
  }
  return [...counties].sort((a, b) => a.localeCompare(b));
}
