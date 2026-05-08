import { useMemo, useState } from 'react';
import { Info, Search, X } from 'lucide-react';
import { usePrograms } from '../hooks/usePrograms';
import {
  DIRECTORY_CATEGORIES,
  DIRECTORY_CATEGORY_DESCRIPTIONS,
  DIRECTORY_CATEGORY_LABELS,
  legacyToDirectoryCategory,
} from '../data/categoryMap';
import { searchPrograms } from '../utils/resourceSearch';
import DirectoryCard from '../components/DirectoryCard';
import type { County, DirectoryCategory, Program } from '../types';

// NOTE: program.status is intentionally not surfaced or filtered on the
// public directory — we cannot reliably confirm whether each program is
// currently open or funded. The field stays on the data model for
// internal use (waitlist tracker, future admin tools, analytics).

const PRIMARY_COUNTIES: County[] = ['Multnomah', 'Clark'];
const SECONDARY_COUNTIES: County[] = ['Washington', 'Clackamas'];

function programDirectoryCategory(p: Program): DirectoryCategory {
  return p.directory_category ?? legacyToDirectoryCategory(p.category);
}

export default function Resources() {
  const { programs, loading, error } = usePrograms();
  const [selectedCategories, setSelectedCategories] = useState<DirectoryCategory[]>([]);
  const [county, setCounty] = useState<County | 'All'>('All');
  const [showAllCounties, setShowAllCounties] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    county !== 'All' ||
    searchQuery.trim().length > 0;

  function toggleCategory(cat: DirectoryCategory) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function resetFilters() {
    setSelectedCategories([]);
    setCounty('All');
    setSearchQuery('');
  }

  const filtered = useMemo(() => {
    const ranked = searchPrograms(programs, searchQuery);
    return ranked.filter(({ program }) => {
      if (selectedCategories.length > 0) {
        const directory = programDirectoryCategory(program);
        if (!selectedCategories.includes(directory)) return false;
      }
      if (county !== 'All' && program.county !== county) return false;
      return true;
    });
  }, [programs, selectedCategories, county, searchQuery]);

  const visibleCounties: Array<County | 'All'> = [
    'All',
    ...PRIMARY_COUNTIES,
    ...(showAllCounties ? SECONDARY_COUNTIES : []),
  ];

  return (
    <div className="bg-surface min-h-[calc(100vh-80px)]">
      {/* Search-first hero */}
      <section className="bg-surface-container-low border-b border-surface-container-highest">
        <div className="max-w-6xl mx-auto px-6 lg:px-12 py-12 lg:py-16">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-3">
            Resource directory
          </p>
          <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface tracking-tight mb-3">
            Find housing help in Portland and Vancouver.
          </h1>
          <p className="text-on-surface-variant text-base lg:text-lg max-w-2xl mb-8">
            Search by need, neighborhood, or program name. Every listing shows when it was last verified so you know what is current.
          </p>

          <div className="relative max-w-3xl">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-on-surface-variant" />
            </div>
            <input
              type="text"
              placeholder="Try ‘rent help in Multnomah’, ‘section 8’, ‘eviction notice’"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container-lowest rounded-2xl pl-12 pr-12 py-4 shadow-sm border border-surface-container-highest focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-base"
              aria-label="Search resources"
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

      {/* Category chips */}
      <section className="bg-surface border-b border-surface-container-highest sticky top-20 z-40 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="max-w-6xl mx-auto px-6 lg:px-12 py-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
            <button
              type="button"
              onClick={() => setSelectedCategories([])}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedCategories.length === 0
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant border-surface-container-highest hover:border-primary/40 hover:text-on-surface'
              }`}
            >
              All types
            </button>
            {DIRECTORY_CATEGORIES.map((cat) => {
              const active = selectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  title={DIRECTORY_CATEGORY_DESCRIPTIONS[cat]}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-lowest text-on-surface-variant border-surface-container-highest hover:border-primary/40 hover:text-on-surface'
                  }`}
                  aria-pressed={active}
                >
                  {DIRECTORY_CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="max-w-6xl mx-auto px-6 lg:px-12 py-10 grid lg:grid-cols-[220px_1fr] gap-10">
        {/* Secondary filters */}
        <aside className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-3">
              County
            </h3>
            <div className="flex flex-col gap-1.5">
              {visibleCounties.map((c) => {
                const active = county === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCounty(c)}
                    className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
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
                className="mt-2 text-xs text-primary font-semibold hover:underline"
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
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-sm text-on-surface-variant">
              {loading
                ? 'Loading resources…'
                : `${filtered.length} ${filtered.length === 1 ? 'resource' : 'resources'}${
                    searchQuery.trim() ? ` for “${searchQuery.trim()}”` : ''
                  }`}
            </p>
          </div>

          <div
            role="note"
            className="flex items-start gap-2 mb-6 px-4 py-3 rounded-xl border border-surface-container-highest bg-surface-container-low text-on-surface-variant text-sm"
          >
            <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" aria-hidden />
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
            <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-10 text-center">
              <p className="text-on-surface-variant mb-3">
                No resources match these filters yet.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="text-primary font-semibold text-sm hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
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
