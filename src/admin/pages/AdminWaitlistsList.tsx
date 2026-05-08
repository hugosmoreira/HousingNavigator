import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { requireSupabase } from '../../lib/supabaseClient';
import type { WaitlistRow } from '../../services/data/dbTypes';

const STATUS_PRESENTATION: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  open: {
    label: 'Open',
    className: 'bg-green-50 text-green-800 border-green-200',
    dot: 'bg-green-500',
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
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = requireSupabase();
        const { data, error: err } = await client
          .from('waitlists')
          .select('*')
          .order('updated_at', { ascending: false });
        if (err) throw err;
        if (active) setRows((data ?? []) as WaitlistRow[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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

      <div className="relative max-w-sm mb-5">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="search"
          placeholder="Filter by authority, program, county"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-full border border-surface-container-highest bg-surface-container-lowest pl-9 pr-4 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
        />
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
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Published</th>
              <th className="px-4 py-3 font-semibold">Last checked</th>
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-highest bg-surface-container-lowest">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">
                  No waitlists yet.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const status = STATUS_PRESENTATION[row.status] ?? STATUS_PRESENTATION.unknown;
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-on-surface">
                      <div className="font-medium">{row.housing_authority}</div>
                      {row.program_name && (
                        <div className="text-xs text-on-surface-variant">
                          {row.program_name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{row.county}</td>
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
    </div>
  );
}
