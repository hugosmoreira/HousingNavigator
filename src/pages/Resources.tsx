import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePrograms } from '../hooks/usePrograms';
import { useClientReady } from '../hooks/useClientReady';
import DirectoryCard from '../components/DirectoryCard';
import ResourceLocationNotice from '../components/ResourceLocationNotice';
import { findLocalLandingPage } from '../data/localLandingPages';
import { COUNTIES_BY_STATE, STATE_NAMES, SUPPORTED_STATES, serviceAreaLabel } from '../data/serviceAreas';
import { matchesResourceFilters } from '../utils/resourceFilters';
import { searchPrograms } from '../utils/resourceSearch';
import { resourceSearchContext } from '../utils/resourceSearchLocation';
import {
  areaValue, directoryUrl, needFilters, parseDirectoryArea, readDirectoryState,
  RESOURCE_HOUSEHOLDS, RESOURCE_NEEDS, type DirectoryState, type ResourceNeed, type ResourceSort,
} from '../utils/resourceDirectoryState';
import type { HouseholdType } from '../types';
import NotFound from './NotFound';

const controlClass = 'w-full min-w-0 h-12 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-base text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

export default function Resources() {
  const { programs, loading, error } = usePrograms();
  const location = useLocation();
  const navigate = useNavigate();
  const clientReady = useClientReady();
  const filters = readDirectoryState(location.pathname, clientReady ? location.search : '', clientReady ? location.state : null);
  const { query, need, area, household, sort, invalidLink } = filters;
  const page = findLocalLandingPage(location.pathname);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const context = useMemo(() => resourceSearchContext(query, area), [query, area?.state, area?.county, area === undefined]);
  const needsChoice = invalidLink || context.needsChoice;
  const hasFilters = !!(query || need !== 'all' || context.location || household || invalidLink);

  function update(patch: Partial<DirectoryState>, replace = false) {
    const next = { ...filters, ...patch, invalidLink: false };
    navigate(directoryUrl(next), { replace, state: { resourceQuery: next.query }, preventScrollReset: true });
  }

  function reset() {
    update({ query: '', need: 'all', area: undefined, household: null, sort: 'relevance' });
    setOptionsOpen(false);
  }

  const results = useMemo(() => {
    if (needsChoice) return [];
    const taxonomy = needFilters(need);
    const ranked = searchPrograms(programs, query, { location: area }).filter(({ program }) =>
      matchesResourceFilters(program, { ...taxonomy, household, state: 'All', county: 'All' }));
    if (sort === 'alpha') ranked.sort((a, b) => a.program.program_name.localeCompare(b.program.program_name));
    else if (sort === 'recent') ranked.sort((a, b) => (b.program.last_verified || '').localeCompare(a.program.last_verified || ''));
    else if (ranked.every(item => item.score === 0)) ranked.sort((a, b) =>
      b.program.priority_score - a.program.priority_score || a.program.program_name.localeCompare(b.program.program_name));
    return ranked;
  }, [programs, query, need, area?.state, area?.county, area === undefined, household, sort, needsChoice]);

  if (location.pathname.startsWith('/housing-help/') && !page) return <NotFound />;

  return <div className="bg-surface min-h-[calc(100vh-80px)]">
    <section aria-labelledby="resource-heading" className="border-b border-surface-container-highest bg-surface-container-lowest">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-12 pt-6 pb-5 lg:pt-8">
        <h1 id="resource-heading" className="text-2xl lg:text-3xl font-headline font-bold text-on-surface tracking-tight mb-5">
          {page?.heading ?? 'Find resources'}
        </h1>

        <form role="search" aria-label="Find resources" onSubmit={event => event.preventDefault()}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.15fr)] gap-3">
            <div className="sm:col-span-2 lg:col-span-1 min-w-0">
              <label htmlFor="resource-query" className="block text-sm font-semibold mb-1.5">Search</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 w-5 h-5 text-on-surface-variant pointer-events-none" aria-hidden />
                <input id="resource-query" type="search" aria-label="Search resources" aria-describedby="resource-location-notice"
                  enterKeyHint="search" autoComplete="off" placeholder="Name or keyword"
                  value={query} onChange={event => update({ query: event.target.value }, true)}
                  className={`${controlClass} pl-11 pr-11 [&::-webkit-search-cancel-button]:appearance-none`} />
                {query && <button type="button" aria-label="Clear search" onClick={() => update({ query: '' }, true)}
                  className="absolute right-0 top-0 h-12 w-11 flex items-center justify-center text-on-surface-variant hover:text-primary">
                  <X className="w-4 h-4" aria-hidden />
                </button>}
              </div>
            </div>

            <label className="min-w-0">
              <span className="block text-sm font-semibold mb-1.5">Help needed</span>
              <select value={need} onChange={event => update({ need: event.target.value as ResourceNeed })} className={controlClass}>
                <option value="all">All resources</option>
                {RESOURCE_NEEDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label className="min-w-0" id="resource-area-filter">
              <span className="block text-sm font-semibold mb-1.5">Area</span>
              <select value={needsChoice ? 'choose' : areaValue(context.location)}
                onChange={event => update({ area: parseDirectoryArea(event.target.value) })} className={controlClass}>
                {needsChoice && <option value="choose" disabled>Choose an area</option>}
                <option value="all">Oregon &amp; Washington</option>
                {SUPPORTED_STATES.map(state => <optgroup key={state} label={STATE_NAMES[state]}>
                  <option value={state}>All {STATE_NAMES[state]} counties</option>
                  {COUNTIES_BY_STATE[state].map(county => <option key={county} value={`${state}:${county}`}>
                    {county} County, {state}
                  </option>)}
                </optgroup>)}
              </select>
            </label>
          </div>

          <ResourceLocationNotice context={context} onSelect={value => update({ area: value })}
            onUseQuery={() => update({ area: undefined })} />
          {invalidLink && <p role="alert" className="mt-3 text-sm text-error">
            This link contains an unrecognized filter. Choose your filters above or clear them to continue.
          </p>}

          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <button type="button" onClick={() => setOptionsOpen(!optionsOpen)} aria-expanded={optionsOpen}
              aria-controls="resource-household-options" className="inline-flex items-center gap-2 min-h-11 text-sm font-semibold text-on-surface-variant hover:text-primary">
              <SlidersHorizontal className="w-4 h-4" aria-hidden />
              {household ? `Who it's for: ${RESOURCE_HOUSEHOLDS.find(option => option.value === household)?.label}` : 'Who it’s for (optional)'}
            </button>
            {hasFilters && <button type="button" onClick={reset} className="text-sm font-semibold text-primary min-h-11 px-2">Clear all</button>}
          </div>
          {optionsOpen && <div id="resource-household-options" className="pt-2 max-w-sm">
            <label className="block text-sm font-semibold">
              Who it’s for
              <select value={household ?? 'all'} onChange={event => update({ household: event.target.value === 'all' ? null : event.target.value as HouseholdType })}
                className={`${controlClass} mt-1.5`}>
                <option value="all">All households</option>
                {RESOURCE_HOUSEHOLDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>}
        </form>
      </div>
    </section>

    <section aria-labelledby="resource-results-heading" className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-12 py-5 lg:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 id="resource-results-heading" role="status" aria-live="polite" className="text-sm font-semibold text-on-surface">
          {needsChoice ? 'Choose filters to see resources' : loading ? 'Loading resources…' : `${results.length} ${results.length === 1 ? 'resource' : 'resources'}`}
        </h2>
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="sr-only">Sort by</span>
          <select value={sort} onChange={event => update({ sort: event.target.value as ResourceSort })}
            className="min-h-11 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm focus:ring-2 focus:ring-primary/20">
            <option value="relevance">Most relevant</option>
            <option value="recent">Recently verified</option>
            <option value="alpha">Alphabetical</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-error/30 p-4 text-sm text-error">
        We couldn’t refresh the directory. Showing the last available listings; confirm details with the provider.
      </p>}
      {needsChoice ? <p className="text-sm text-on-surface-variant py-4">Select an area or clear the filters above to continue.</p>
        : !loading && !results.length ? <div className="rounded-xl border border-surface-container-highest bg-surface-container-lowest p-6">
          <h3 className="font-semibold text-lg mb-2">No matching resources{context.location ? ` for ${serviceAreaLabel(context.location)}` : ''}</h3>
          <p className="text-sm text-on-surface-variant mb-4">Try another search or help type. No match in this directory does not mean help is unavailable.</p>
          {query && <button type="button" onClick={() => update({ query: '', area: context.location ?? area })}
            className="min-h-11 text-sm text-primary font-semibold mr-5">Clear search words</button>}
          <button type="button" onClick={reset} className="min-h-11 text-sm text-primary font-semibold">Clear all filters</button>
        </div>
        : <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
          {results.map(({ program }) => <DirectoryCard key={program.id} program={program}
            returnTo={{ url: directoryUrl(filters), query }} />)}
        </div>}
      {!needsChoice && results.length > 0 && <p className="text-xs text-on-surface-variant mt-5">
        Availability can change. Contact the provider to confirm current access.
      </p>}
    </section>
  </div>;
}
