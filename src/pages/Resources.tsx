import { useMemo, useState } from 'react';
import { Info, ListFilter, Search, X } from 'lucide-react';
import { usePrograms } from '../hooks/usePrograms';
import {
  DIRECTORY_CATEGORIES,
  DIRECTORY_CATEGORY_DESCRIPTIONS,
  DIRECTORY_CATEGORY_LABELS,
  legacyToDirectoryCategory,
} from '../data/categoryMap';
import { searchPrograms } from '../utils/resourceSearch';
import DirectoryCard from '../components/DirectoryCard';
import type {
  County,
  DirectoryCategory,
  HouseholdType,
  Program,
} from '../types';

// NOTE: program.status is intentionally not surfaced or filtered on the
// public directory — we cannot reliably confirm whether each program is
// currently open or funded. The field stays on the data model for
// internal use (waitlist tracker, future admin tools, analytics). The
// sort selector deliberately omits an "Open now" option for the same
// reason.

const PRIMARY_COUNTIES: County[] = ['Multnomah', 'Clark'];
const SECONDARY_COUNTIES: County[] = ['Washington', 'Clackamas'];

type SortKey = 'relevance' | 'recent' | 'alpha';

interface Situation {
  key: string;
  label: string;
  // Each situation translates into either a DirectoryCategory chip or a
  // HouseholdType filter. The chip surface is intentionally conversational
  // ("Senior housing") while the underlying state stays in the existing
  // taxonomy so the search pipeline does not need to change.
  category?: DirectoryCategory;
  household?: HouseholdType;
}

const SITUATIONS: Situation[] = [
  { key: 'rent_help', label: 'Rent help', category: 'rent_assistance' },
  { key: 'eviction', label: 'Eviction notice', category: 'eviction_prevention' },
  { key: 'shelter_tonight', label: 'Shelter tonight', category: 'emergency_shelter' },
  { key: 'affordable', label: 'Affordable housing', category: 'public_housing' },
  { key: 'section8', label: 'Section 8', category: 'section8_waitlist' },
  { key: 'senior', label: 'Senior housing', household: 'senior' },
  { key: 'disability', label: 'Disability housing', household: 'disability' },
  { key: 'veteran', label: 'Veteran help', household: 'veteran' },
];

const SITUATION_CATEGORIES = new Set<DirectoryCategory>(
  SITUATIONS.filter((s) => s.category).map((s) => s.category as DirectoryCategory),
);
const EXTRA_CATEGORIES: DirectoryCategory[] = DIRECTORY_CATEGORIES.filter(
  (c) => !SITUATION_CATEGORIES.has(c),
);

const POPULAR_SUGGESTIONS = [
  'Rent help',
  'Section 8',
  'Eviction notice',
  'Shelter tonight',
];

function programDirectoryCategory(p: Program): DirectoryCategory {
  return p.directory_category ?? legacyToDirectoryCategory(p.category);
}

export default function Resources() {
  const { programs, loading, error } = usePrograms();
  const [selectedCategories, setSelectedCategories] = useState<DirectoryCategory[]>([]);
  const [householdFilter, setHouseholdFilter] = useState<HouseholdType | null>(null);
  const [county, setCounty] = useState<County | 'All'>('All');
  const [showAllCounties, setShowAllCounties] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [showMoreCategories, setShowMoreCategories] = useState(false);

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    householdFilter !== null ||
    county !== 'All' ||
    searchQuery.trim().length > 0;

  function toggleCategory(cat: DirectoryCategory) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function toggleHousehold(h: HouseholdType) {
    setHouseholdFilter((prev) => (prev === h ? null : h));
  }

  function clearTaxonomyFilters() {
    setSelectedCategories([]);
    setHouseholdFilter(null);
  }

  function resetFilters() {
    clearTaxonomyFilters();
    setCounty('All');
    setSearchQuery('');
  }

  const filtered = useMemo(() => {
    let ranked = searchPrograms(programs, searchQuery);
    ranked = ranked.filter(({ program }) => {
      if (selectedCategories.length > 0) {
        const directory = programDirectoryCategory(program);
        if (!selectedCategories.includes(directory)) return false;
      }
      if (householdFilter && !program.who_it_helps.includes(householdFilter)) {
        return false;
      }
      if (county !== 'All' && program.county !== county) return false;
      return true;
    });
    if (sort === 'recent') {
      // Empty dates sort last by using a min sentinel.
      ranked = [...ranked].sort((a, b) => {
        const da = a.program.last_verified || '';
        const db = b.program.last_verified || '';
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da);
      });
    } else if (sort === 'alpha') {
      ranked = [...ranked].sort((a, b) =>
        a.program.program_name.localeCompare(b.program.program_name),
      );
    } else if (sort === 'relevance' && !searchQuery.trim()) {
      // No query → searchPrograms preserves catalog order (all score 0).
      // Give the default view a deterministic, curated-first order instead
      // of whatever order the data source happened to return.
      ranked = [...ranked].sort((a, b) => {
        if (b.program.priority_score !== a.program.priority_score) {
          return b.program.priority_score - a.program.priority_score;
        }
        return a.program.program_name.localeCompare(b.program.program_name);
      });
    }
    return ranked;
  }, [programs, selectedCategories, householdFilter, county, searchQuery, sort]);

  const visibleCounties: Array<County | 'All'> = [
    'All',
    ...PRIMARY_COUNTIES,
    ...(showAllCounties ? SECONDARY_COUNTIES : []),
  ];

  const noTaxonomyActive =
    selectedCategories.length === 0 && householdFilter === null;

  return (
    <div className="bg-surface min-h-[calc(100vh-80px)]">
      {/* Compact search-first hero */}
      <section className="bg-surface-container-low border-b border-surface-container-highest">
        <div className="max-w-6xl mx-auto px-6 lg:px-12 py-6 lg:py-8">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-2">
            Resource directory
          </p>
          <h1 className="text-2xl lg:text-3xl font-headline font-bold text-on-surface tracking-tight mb-2">
            Find housing help in Portland and Vancouver.
          </h1>
          <p className="text-on-surface-variant text-sm lg:text-base max-w-2xl mb-5">
            Search by need or program. Every listing shows when it was last verified.
          </p>

          <div className="relative max-w-3xl">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-on-surface-variant" />
            </div>
            <input
              type="text"
              placeholder="Try “rent help in Multnomah”, “section 8”, or “eviction notice”"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container-lowest rounded-2xl pl-12 pr-12 py-3 shadow-sm border border-surface-container-highest focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-base"
              aria-label="Search resources"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute inset-y-0 right-3 flex items-center text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Situation chips (sticky, scrollable on mobile) */}
      <section className="bg-surface border-b border-surface-container-highest sticky top-20 z-40 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="max-w-6xl mx-auto px-6 lg:px-12 py-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
            <button
              type="button"
              onClick={clearTaxonomyFilters}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                noTaxonomyActive
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border-surface-container-highest hover:border-primary/40 hover:text-on-surface'
              }`}
              aria-pressed={noTaxonomyActive}
            >
              All
            </button>

            {SITUATIONS.map((s) => {
              const active = s.category
                ? selectedCategories.includes(s.category)
                : s.household === householdFilter;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    if (s.category) toggleCategory(s.category);
                    else if (s.household) toggleHousehold(s.household);
                  }}
                  aria-pressed={active}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-lowest text-on-surface-variant border-surface-container-highest hover:border-primary/40 hover:text-on-surface'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowMoreCategories((v) => !v)}
              className="shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border border-surface-container-highest text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
              aria-expanded={showMoreCategories}
            >
              {showMoreCategories ? 'Fewer −' : 'More +'}
            </button>

            {showMoreCategories &&
              EXTRA_CATEGORIES.map((cat) => {
                const active = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    aria-pressed={active}
                    title={DIRECTORY_CATEGORY_DESCRIPTIONS[cat]}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-lowest text-on-surface-variant border-surface-container-highest hover:border-primary/40 hover:text-on-surface'
                    }`}
                  >
                    {DIRECTORY_CATEGORY_LABELS[cat]}
                  </button>
                );
              })}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="max-w-6xl mx-auto px-6 lg:px-12 py-6 lg:py-8 grid lg:grid-cols-[220px_1fr] gap-8 lg:gap-10">
        <aside className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
              County
            </h3>
            <div className="flex flex-col gap-1">
              {visibleCounties.map((c) => {
                const active = county === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCounty(c)}
                    aria-pressed={active}
                    className={`text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                    }`}
                  >
                    {c === 'All' ? 'All counties' : `${c} County`}
                  </button>
                );
              })}
            </div>
            {!showAllCounties && (
              <button
                type="button"
                onClick={() => setShowAllCounties(true)}
                className="mt-1 text-xs text-primary font-semibold hover:underline"
              >
                Show more counties
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm text-primary font-semibold hover:underline"
            >
              Reset filters
            </button>
          )}
        </aside>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-sm text-on-surface-variant">
              {loading
                ? 'Loading resources…'
                : `${filtered.length} ${filtered.length === 1 ? 'resource' : 'resources'}${
                    searchQuery.trim() ? ` for “${searchQuery.trim()}”` : ''
                  }`}
            </p>
            <label className="inline-flex items-center gap-2 text-sm text-on-surface-variant">
              <ListFilter className="w-4 h-4" aria-hidden />
              <span className="sr-only">Sort by</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="bg-surface-container-lowest border border-surface-container-highest rounded-full px-3 py-1.5 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="relevance">Most relevant</option>
                <option value="recent">Recently verified</option>
                <option value="alpha">Alphabetical</option>
              </select>
            </label>
          </div>

          <div
            role="note"
            className="flex items-start gap-2 mb-5 px-3 py-2 rounded-lg border border-surface-container-highest bg-surface-container-low text-on-surface-variant text-xs"
          >
            <Info className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" aria-hidden />
            <p>
              Availability can change. Contact the provider to confirm current access.
            </p>
          </div>

          {error ? (
            <div className="bg-surface-container-lowest border border-error/30 rounded-2xl p-10 text-center">
              <p className="text-error font-medium">Couldn't load resources right now.</p>
              <p className="text-on-surface-variant text-sm mt-2">{error.message}</p>
            </div>
          ) : !loading && filtered.length === 0 ? (
            <EmptyState
              query={searchQuery}
              hasFilters={hasActiveFilters}
              onResetFilters={resetFilters}
              onApplySuggestion={(text) => setSearchQuery(text)}
            />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5">
              {filtered.map(({ program }) => (
                <DirectoryCard key={program.id} program={program} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

interface EmptyStateProps {
  query: string;
  hasFilters: boolean;
  onResetFilters: () => void;
  onApplySuggestion: (text: string) => void;
}

function EmptyState({
  query,
  hasFilters,
  onResetFilters,
  onApplySuggestion,
}: EmptyStateProps) {
  const headline = query
    ? `No results for “${query.trim()}”.`
    : 'No resources match these filters yet.';
  const lead = hasFilters
    ? 'Try removing a filter, or pick one of these starting points:'
    : 'Try one of these popular searches:';

  return (
    <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-8 text-center">
      <p className="text-on-surface font-headline font-bold text-lg mb-2">
        {headline}
      </p>
      <p className="text-on-surface-variant text-sm mb-4">{lead}</p>
      <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
        {POPULAR_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onApplySuggestion(s)}
            className="px-3.5 py-1.5 rounded-full text-sm font-medium border border-surface-container-highest text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
          >
            {s}
          </button>
        ))}
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          className="text-primary font-semibold text-sm hover:underline"
        >
          Reset all filters
        </button>
      )}
    </div>
  );
}
