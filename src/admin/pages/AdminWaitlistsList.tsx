import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Plus, Search } from 'lucide-react';
import { WAITLIST_TYPE_LABELS } from '../../data/affordableHousing';
import type { WaitlistRow } from '../../services/data/dbTypes';
import { usePagedAdminRows } from '../usePagedAdminRows';
import {
  BUNDLED_WAITLIST_COUNT,
  seedWaitlistsFromCatalog,
} from '../seedFromCatalog';

const STATUS_PRESENTATION: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  open: {
    label: 'Open',
    className: 'bg-green-50 text-green-800 border-green-200',
    dot: 'bg-green-500',
  },
  limited: {
    label: 'Limited',
    className: 'bg-amber-50 text-amber-900 border-amber-200',
    dot: 'bg-amber-500',
  },
  closed: {
    label: 'Closed',
    className: 'bg-surface-container-high text-on-surface-variant border-outline-variant/30',
    dot: 'bg-on-surface-variant',
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-yellow-50 text-yellow-900 border-yellow-200',
    dot: 'bg-yellow-500',
  },
};

export default function AdminWaitlistsList() {
  const {
    rows,
    totalCount,
    loading,
    loadingMore,
    error,
    setError,
    reload,
    loadMore,
    hasMore,
  } = usePagedAdminRows<WaitlistRow>('waitlists_admin');
  const [query, setQuery] = useState('');
  const [seeding, setSeeding] = useState(false);

  async function handleSeed() {
    if (
      !window.confirm(
        `Insert ${BUNDLED_WAITLIST_COUNT} waitlists from the bundled JSON into Supabase? Re-runs upsert by id, so this is safe to repeat.`,
      )
    ) {
      return;
    }
    setSeeding(true);
    setError(null);
    try {
      const { inserted } = await seedWaitlistsFromCatalog();
      await reload();
      // eslint-disable-next-line no-console
      console.log(`[admin] seeded ${inserted} waitlists from bundled JSON`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.housing_authority.toLowerCase().includes(q) ||
        (r.program_name ?? '').toLowerCase().includes(q) ||
        r.county.toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Authorities that have more than one waitlist (e.g. "Vancouver Housing
  // Authority" has both Public Housing and Owned & Managed Housing). For
  // these, the program name is the only thing that tells the rows apart, so
  // we surface it as a highlighted chip below.
  const duplicateAuthorities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.housing_authority, (counts.get(r.housing_authority) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([authority]) => authority),
    );
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-headline font-bold tracking-tight">Waitlists</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Track open / closed status for housing authority waitlists.
          </p>
        </div>
        <Link
          to="/admin/waitlists/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary font-semibold text-sm px-4 py-2 hover:bg-primary-dim"
        >
          <Plus className="w-4 h-4" /> New waitlist
        </Link>
      </div>

      <div className="max-w-sm mb-5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="search"
            placeholder="Filter by authority, program, county"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border border-surface-container-highest bg-surface-container-lowest pl-9 pr-4 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>
        {query.trim() && hasMore && (
          <p className="mt-1.5 px-1 text-xs text-on-surface-variant">
            Searching the {rows.length} loaded rows — use “Load more” below to
            include older entries.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-surface-container-highest">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-left text-xs uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="px-4 py-3 font-semibold">Authority / program</th>
              <th className="px-4 py-3 font-semibold">County</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Published</th>
              <th className="px-4 py-3 font-semibold">Last checked</th>
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-highest bg-surface-container-lowest">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="font-medium text-on-surface">
                        Supabase <code>waitlists</code> table is empty.
                      </div>
                      <div className="text-xs max-w-md">
                        Import the {BUNDLED_WAITLIST_COUNT} waitlists currently
                        powering the public tracker, or add them one at a time.
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={handleSeed}
                          disabled={seeding}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary font-semibold text-sm px-4 py-2 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <Database className="w-4 h-4" />
                          {seeding
                            ? 'Seeding…'
                            : `Seed ${BUNDLED_WAITLIST_COUNT} from bundled JSON`}
                        </button>
                        <Link
                          to="/admin/waitlists/new"
                          className="inline-flex items-center gap-1.5 rounded-full border border-surface-container-highest text-on-surface font-semibold text-sm px-4 py-2 hover:bg-surface-container-low"
                        >
                          <Plus className="w-4 h-4" /> Add manually
                        </Link>
                      </div>
                    </div>
                  ) : (
                    'No waitlists match that filter.'
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const status = STATUS_PRESENTATION[row.status] ?? STATUS_PRESENTATION.unknown;
                const sharesAuthority = duplicateAuthorities.has(row.housing_authority);
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-on-surface">
                      <div className="font-medium">{row.housing_authority}</div>
                      {row.program_name ? (
                        <div className="mt-1">
                          <span
                            className={
                              sharesAuthority
                                ? 'inline-block rounded bg-primary/10 text-primary text-xs font-semibold px-1.5 py-0.5'
                                : 'text-xs text-on-surface-variant'
                            }
                          >
                            {row.program_name}
                          </span>
                        </div>
                      ) : (
                        sharesAuthority && (
                          <div className="mt-1 text-xs italic text-on-surface-variant">
                            No program name
                          </div>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{row.county}</td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {row.waitlist_type ? WAITLIST_TYPE_LABELS[row.waitlist_type] : 'Other waitlist'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${status.className}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {row.published ? 'Yes' : 'Draft'}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                      {row.last_checked ?? '—'}
                      {(row.check_failures ?? 0) >= 3 && (
                        <div className="mt-0.5 text-xs font-semibold text-error">
                          URL check failing
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/waitlists/${row.id}/edit`}
                        className="text-primary font-semibold hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && hasMore && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-on-surface-variant">
          <span>
            Showing {rows.length} of {totalCount}
          </span>
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full border border-surface-container-highest px-4 py-1.5 font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
