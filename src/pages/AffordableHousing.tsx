import { useMemo, useState } from 'react';
import { Building2, Info, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import AffordablePropertyCard from '../components/AffordablePropertyCard';
import { BEDROOM_LABELS, BEDROOM_TYPES } from '../data/affordableHousing';
import { useAffordableProperties } from '../hooks/useAffordableProperties';
import type { BedroomType } from '../types';

export default function AffordableHousing() {
  const { properties, loading, error } = useAffordableProperties();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('all');
  const [bedroom, setBedroom] = useState<BedroomType | 'all'>('all');
  const [openOnly, setOpenOnly] = useState(false);

  const locations = useMemo(() => {
    const values = new Map<string, string>();
    for (const property of properties) {
      values.set(
        `${property.state}:${property.county}`,
        `${property.county} County, ${property.state}`,
      );
    }
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [properties]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return properties
      .filter((property) => {
        if (location !== 'all' && `${property.state}:${property.county}` !== location) {
          return false;
        }
        if (bedroom !== 'all' && !property.bedroom_types.includes(bedroom)) return false;
        if (openOnly && property.waitlist_status !== 'open') return false;
        if (!normalizedQuery) return true;
        return [
          property.name,
          property.owner_organization,
          property.management_company,
          property.city,
          property.county,
          property.description,
          property.eligibility_summary,
        ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        const statusScore = (value: typeof a) =>
          value.waitlist_status === 'open' ? 0 : value.waitlist_status === 'limited' ? 1 : 2;
        const statusDifference = statusScore(a) - statusScore(b);
        if (statusDifference !== 0) return statusDifference;
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
        return a.name.localeCompare(b.name);
      });
  }, [properties, query, location, bedroom, openOnly]);

  const hasFilters = query.trim() || location !== 'all' || bedroom !== 'all' || openOnly;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-surface">
      <section className="border-b border-surface-container-highest bg-surface-container-low">
        <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12 lg:py-14">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Affordable housing
          </p>
          <h1 className="max-w-4xl font-headline text-3xl font-bold tracking-tight text-on-surface lg:text-5xl">
            Find income-restricted apartments.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-on-surface-variant lg:text-lg">
            Search physical apartment properties—not rental assistance programs or voucher lists.
            Review bedrooms, income limits, eligibility, and the latest linked waitlist status.
          </p>

          <div className="relative mt-7 max-w-3xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by property, city, county, or management company"
              aria-label="Search affordable apartment properties"
              className="w-full rounded-2xl border border-surface-container-highest bg-surface-container-lowest py-3 pl-12 pr-12 text-base shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-12 lg:py-10">
        <div className="mb-7 rounded-2xl border border-surface-container-highest bg-surface-container-lowest p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Location</span>
              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="w-full rounded-xl border border-surface-container-highest bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All locations</option>
                {locations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Bedrooms</span>
              <select
                value={bedroom}
                onChange={(event) => setBedroom(event.target.value as BedroomType | 'all')}
                className="w-full rounded-xl border border-surface-container-highest bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">Any unit size</option>
                {BEDROOM_TYPES.map((value) => <option key={value} value={value}>{BEDROOM_LABELS[value]}</option>)}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-surface-container-highest px-3 py-2.5 text-sm font-semibold text-on-surface">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(event) => setOpenOnly(event.target.checked)}
                className="h-4 w-4 rounded border-surface-container-highest text-primary focus:ring-primary/20"
              />
              Accepting applications
            </label>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-on-surface-variant">
            {loading && properties.length === 0
              ? 'Loading properties…'
              : `${filtered.length} ${filtered.length === 1 ? 'property' : 'properties'}`}
          </p>
          <Link to="/waitlist/" className="text-sm font-semibold text-primary hover:text-primary-dim">
            Looking for voucher or housing-authority waitlists?
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Live updates are temporarily unavailable. Showing the most recent verified snapshot.
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-3xl border border-surface-container-highest bg-surface-container-lowest px-6 py-14 text-center">
            <Building2 className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
            <h2 className="mt-4 font-headline text-xl font-bold text-on-surface">No properties match those filters.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">Try another location or unit size. Availability and published inventory will grow over time.</p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => { setQuery(''); setLocation('all'); setBedroom('all'); setOpenOnly(false); }}
                className="mt-5 text-sm font-semibold text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {filtered.map((property) => <AffordablePropertyCard key={property.id} property={property} />)}
        </div>

        {filtered.length > 0 && (
          <div role="note" className="mt-8 flex items-start gap-2 rounded-xl border border-surface-container-highest bg-surface-container-low px-4 py-3 text-xs leading-relaxed text-on-surface-variant">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Income limits, rents, unit availability, and application rules can change. Always confirm details with the property before submitting personal documents.
          </div>
        )}
      </div>
    </div>
  );
}
