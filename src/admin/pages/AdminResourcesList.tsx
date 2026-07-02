import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Plus, Search } from 'lucide-react';
import { requireSupabase } from '../../lib/supabaseClient';
import { DIRECTORY_CATEGORY_LABELS } from '../../data/categoryMap';
import type { ResourceRow } from '../../services/data/dbTypes';
import type { DirectoryCategory } from '../../types';
import {
  BUNDLED_RESOURCE_COUNT,
  seedResourcesFromCatalog,
} from '../seedFromCatalog';

function categoryLabel(category: string): string {
  if (category in DIRECTORY_CATEGORY_LABELS) {
    return DIRECTORY_CATEGORY_LABELS[category as DirectoryCategory];
  }
  return category;
}

export default function AdminResourcesList() {
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [seeding, setSeeding] = useState(false);

  async function loadRows() {
    setError(null);
    const client = requireSupabase();
    // resources_admin (migration 0010) is the only read surface that still
    // includes internal_notes; base-table selects lost that column for the
    // authenticated role. The view returns zero rows for non-admins.
    const { data, error: err } = await client
      .from('resources_admin')
      .select('*')
      .order('updated_at', { ascending: false });
    if (err) throw err;
    setRows((data ?? []) as ResourceRow[]);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadRows();
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

  async function handleSeed() {
    if (
      !window.confirm(
        `Insert ${BUNDLED_RESOURCE_COUNT} rows from the bundled catalog into Supabase? You can edit or unpublish them after.`,
      )
    ) {
      return;
    }
    setSeeding(true);
    setError(null);
    try {
      const { inserted } = await seedResourcesFromCatalog();
      await loadRows();
      // eslint-disable-next-line no-console
      console.log(`[admin] seeded ${inserted} resources from bundled catalog`);
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
        r.name.toLowerCase().includes(q) ||
        r.county.toLowerCase().includes(q) ||
        (r.city ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-headline font-bold tracking-tight">Resources</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Manage the public resource directory. Drafts stay hidden until you publish them.
          </p>
        </div>
        <Link
          to="/admin/resources/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary font-semibold text-sm px-4 py-2 hover:bg-primary-dim"
        >
          <Plus className="w-4 h-4" /> New resource
        </Link>
      </div>

      <div className="relative max-w-sm mb-5">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="search"
          placeholder="Filter by name, city, county"
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
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
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
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="font-medium text-on-surface">
                        Supabase <code>resources</code> table is empty.
                      </div>
                      <div className="text-xs max-w-md">
                        Import the {BUNDLED_RESOURCE_COUNT} resources currently
                        powering the public directory, or add them one at a time.
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
                            : `Seed ${BUNDLED_RESOURCE_COUNT} from bundled catalog`}
                        </button>
                        <Link
                          to="/admin/resources/new"
                          className="inline-flex items-center gap-1.5 rounded-full border border-surface-container-highest text-on-surface font-semibold text-sm px-4 py-2 hover:bg-surface-container-low"
                        >
                          <Plus className="w-4 h-4" /> Add manually
                        </Link>
                      </div>
                    </div>
                  ) : (
                    'No resources match that filter.'
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-on-surface">{row.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {categoryLabel(row.category)}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {[row.city, row.county].filter(Boolean).join(', ')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        row.published
                          ? 'bg-green-50 text-green-800 border border-green-200'
                          : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          row.published ? 'bg-green-500' : 'bg-on-surface-variant/50'
                        }`}
                      />
                      {row.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                    {row.updated_at
                      ? new Date(row.updated_at).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/resources/${row.id}/edit`}
                      className="text-primary font-semibold hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
