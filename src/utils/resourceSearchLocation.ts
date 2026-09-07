import { normalizePlace, SEARCH_LOCATIONS } from '../data/searchLocations';
import type { ServiceArea } from '../types';

export interface ResourceSearchLocation {
  text: string;
  mention: string | null;
  choices: ServiceArea[];
  status: 'none' | 'resolved' | 'ambiguous' | 'suggestion' | 'unrecognized';
}

const NEED_WORDS = new Set(('rent rental assistance help housing affordable shelter eviction utility utilities ' +
  'moving movers truck furniture internet legal voucher vouchers section 8 senior seniors veteran veterans ' +
  'disability disabled family families children with for need i me my').split(' '));
function isNeedPhrase(text: string): boolean {
  return !!text && text.split(' ').every(word => NEED_WORDS.has(word));
}

// Longest boundary alias first: "Spokane Valley" must not become "Spokane".
const BOUNDARY_PLACES = [...SEARCH_LOCATIONS.keys()].filter(alias => alias.length > 2)
  .sort((a, b) => b.length - a.length);

// Suggestions only: never silently correct geography. Includes transpositions.
function oneEditAway(a: string, b: string): boolean {
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}

function suggestions(place: string): ServiceArea[] {
  const choices: ServiceArea[] = [];
  for (const [alias, areas] of SEARCH_LOCATIONS) {
    if (!oneEditAway(place, alias)) continue;
    for (const area of areas) {
      if (!choices.some(item => item.state === area.state && item.county === area.county)) choices.push(area);
    }
  }
  return choices;
}

/** Recognize an explicit location clause or a query consisting only of a place.
 * Do not mine arbitrary words in provider names (Washington Tenants Union, etc.).
 * Unknown locations require a selection, not unfiltered "local" results.
 */
export function parseResourceLocation(query: string): ResourceSearchLocation {
  const none: ResourceSearchLocation = { text: query.trim(), mention: null, choices: [], status: 'none' };
  const normalized = normalizePlace(query);
  if (!normalized) return none;
  let mention = query.trim();
  let text = '';
  const clauses = [...query.matchAll(/\b(?:in|near|around)\s+/gi)].filter(match => {
    const prefix = query.slice(0, match.index).trim();
    const tail = query.slice(match.index + match[0].length);
    // Preserve move-in/drop-in services, Outside In, and "Just in Case".
    return !/\b(?:move|sign|walk|drop|outside)[ -]?$/i.test(prefix) &&
      !/^(?:person|crisis|need|advance|place|case)\b/i.test(tail);
  });
  if (clauses.length > 1) return {
    ...none, text: query.slice(0, clauses[0].index).trim(),
    mention: query.slice(clauses[0].index).trim(), status: 'unrecognized',
  };
  const clause = clauses.at(-1);
  if (clause) {
    const prefix = query.slice(0, clause.index).trim();
    const tail = query.slice(clause.index + clause[0].length);
    // Keep household/service qualifiers after the place in keyword ranking.
    const [place, ...qualifiers] = tail.split(/\s+(?=for\s|with\s)/i);
    mention = place.trim();
    text = [prefix, ...qualifiers].join(' ').trim();
  } else if (!SEARCH_LOCATIONS.has(normalized)) {
    const boundary = BOUNDARY_PLACES.find(alias =>
      (normalized.startsWith(alias + ' ') && isNeedPhrase(normalized.slice(alias.length + 1))) ||
      (normalized.endsWith(' ' + alias) && isNeedPhrase(normalized.slice(0, -alias.length - 1))),
    );
    if (boundary) {
      mention = boundary;
      text = normalized.startsWith(boundary + ' ')
        ? normalized.slice(boundary.length + 1) : normalized.slice(0, -boundary.length - 1);
    } else {
      // Only a bare county, not an arbitrary organization name, gets spelling suggestions.
      if (!/^[\p{L}\s]+\s+county(?:\s*,?\s*(?:or|wa|oregon|washington))?[.!?]?$/iu.test(query.trim())) return none;
    }
  }
  const key = normalizePlace(mention);
  const exact = SEARCH_LOCATIONS.get(key);
  if (exact) return { text, mention, choices: exact, status: exact.length === 1 ? 'resolved' : 'ambiguous' };
  const choices = suggestions(key);
  return { text, mention, choices, status: choices.length ? 'suggestion' : 'unrecognized' };
}

/** undefined = follow the query; null = explicitly search all areas. */
export function resourceSearchContext(query: string, override?: ServiceArea | null) {
  const parsed = parseResourceLocation(query);
  const manual = override !== undefined;
  const location = manual ? override : parsed.status === 'resolved' ? parsed.choices[0] : null;
  return {
    ...parsed, location, manual,
    needsChoice: !manual && parsed.status !== 'none' && parsed.status !== 'resolved',
  };
}
