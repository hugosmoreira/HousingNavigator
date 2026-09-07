import { DIRECTORY_CATEGORIES, DIRECTORY_CATEGORY_LABELS } from '../data/categoryMap';
import { findLocalLandingPage } from '../data/localLandingPages';
import { RESOURCE_SERVICE_TAGS, RESOURCE_SERVICE_LABELS } from '../data/resourceServiceTags';
import { COUNTIES_BY_STATE } from '../data/serviceAreas';
import type { DirectoryCategory, HouseholdType, ResourceServiceTag, ServiceArea } from '../types';

export type ResourceNeed = 'all' | `category:${DirectoryCategory}` | `service:${ResourceServiceTag}`;
export type ResourceSort = 'relevance' | 'recent' | 'alpha';
export interface DirectoryReturn { url: string; query: string }
export interface DirectoryState {
  query: string;
  need: ResourceNeed;
  area: ServiceArea | null | undefined;
  household: HouseholdType | null;
  sort: ResourceSort;
  invalidLink: boolean;
}

// One public need maps to the existing category OR service-tag model. Switching
// needs cannot leave an invisible category/tag intersection behind.
export const RESOURCE_NEEDS: Array<{ value: ResourceNeed; label: string }> = [
  ...DIRECTORY_CATEGORIES.slice(0, 3).map(value => ({ value: `category:${value}` as ResourceNeed, label: DIRECTORY_CATEGORY_LABELS[value] })),
  ...(['moving_help', 'move_in_costs', 'furniture', 'utility_help'] as const).map(value => ({ value: `service:${value}` as ResourceNeed, label: RESOURCE_SERVICE_LABELS[value] })),
  ...DIRECTORY_CATEGORIES.slice(3).map(value => ({ value: `category:${value}` as ResourceNeed, label: DIRECTORY_CATEGORY_LABELS[value] })),
  ...RESOURCE_SERVICE_TAGS.filter(value => !['moving_help', 'move_in_costs', 'furniture', 'utility_help'].includes(value))
    .map(value => ({ value: `service:${value}` as ResourceNeed, label: RESOURCE_SERVICE_LABELS[value] })),
];

export const RESOURCE_HOUSEHOLDS: Array<{ value: HouseholdType; label: string }> = [
  { value: 'single_adult', label: 'Single adults' },
  { value: 'family', label: 'Families' },
  { value: 'senior', label: 'Older adults' },
  { value: 'disability', label: 'People with disabilities' },
  { value: 'veteran', label: 'Veterans' },
];

export function areaValue(area: ServiceArea | null | undefined): string {
  return area ? [area.state, area.county].filter(Boolean).join(':') : 'all';
}

export function parseDirectoryArea(value: string): ServiceArea | null | undefined {
  if (value === 'all') return null;
  const [state, county, extra] = value.split(':');
  if (extra !== undefined || (state !== 'OR' && state !== 'WA')) return undefined;
  if (county === undefined) return { state, county: null };
  return COUNTIES_BY_STATE[state].includes(county) ? { state, county } : undefined;
}

export function needFilters(need: ResourceNeed): { categories: DirectoryCategory[]; serviceTags: ResourceServiceTag[] } {
  return {
    categories: need.startsWith('category:') ? [need.slice(9) as DirectoryCategory] : [],
    serviceTags: need.startsWith('service:') ? [need.slice(8) as ResourceServiceTag] : [],
  };
}

/** Old county URLs initialize the same directory, including SSR. Only explicit
 * filters go in URLs. Free-form search stays in browser history state, not
 * query strings, analytics URLs or server request logs.
 */
export function readDirectoryState(pathname: string, search: string, historyState?: unknown): DirectoryState {
  const page = findLocalLandingPage(pathname);
  const params = new URLSearchParams(search);
  const rawArea = params.get('area');
  const rawNeed = params.get('need');
  const rawHousehold = params.get('household');
  const rawSort = params.get('sort');
  const area = rawArea !== null ? parseDirectoryArea(rawArea)
    : page ? { state: page.stateName === 'Oregon' ? 'OR' as const : 'WA' as const, county: page.county } : undefined;
  const need = rawNeed === 'all' ? 'all' : RESOURCE_NEEDS.find(option => option.value === rawNeed)?.value;
  const household = RESOURCE_HOUSEHOLDS.find(option => option.value === rawHousehold)?.value ?? null;
  const sort = rawSort === 'alpha' || rawSort === 'recent' ? rawSort : 'relevance';
  const query = historyState && typeof historyState === 'object' && 'resourceQuery' in historyState
    && typeof historyState.resourceQuery === 'string' ? historyState.resourceQuery : '';
  return {
    query, area, need: need ?? (page?.service ? `category:${page.service}` : 'all'), household, sort,
    invalidLink: (rawArea !== null && area === undefined) || (rawNeed !== null && need === undefined)
      || (rawHousehold !== null && household === null) || (rawSort !== null && !['alpha', 'recent', 'relevance'].includes(rawSort)),
  };
}

export function directoryUrl(state: DirectoryState): string {
  const params = new URLSearchParams();
  if (state.area !== undefined) params.set('area', areaValue(state.area));
  if (state.need !== 'all') params.set('need', state.need);
  if (state.household) params.set('household', state.household);
  if (state.sort !== 'relevance') params.set('sort', state.sort);
  const suffix = params.toString();
  return '/resources/' + (suffix ? '?' + suffix : '');
}

/** Only return to this directory; never turn history state into an open redirect. */
export function readDirectoryReturn(value: unknown): DirectoryReturn | undefined {
  if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string'
    || !/^\/resources\/(?:\?[^#]*)?$/.test(value.url)) return undefined;
  const query = 'query' in value && typeof value.query === 'string' ? value.query : '';
  const state = readDirectoryState('/resources/', value.url.slice('/resources/'.length), { resourceQuery: query });
  if (state.invalidLink) return undefined;
  return { url: directoryUrl(state), query };
}
