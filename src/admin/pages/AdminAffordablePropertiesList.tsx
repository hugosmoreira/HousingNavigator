import { useMemo, useState } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AFFORDABLE_PROPERTY_TYPE_LABELS } from '../../data/affordableHousing';
import type { AffordablePropertyRow } from '../../services/data/dbTypes';
import { usePagedAdminRows } from '../usePagedAdminRows';

export default function AdminAffordablePropertiesList() {
  const { rows, totalCount, loading, loadingMore, error, loadMore, hasMore } = usePagedAdminRows<AffordablePropertyRow>('affordable_properties_admin');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter((row) => [row.name, row.owner_organization, row.management_company, row.city, row.county].some((field) => field?.toLowerCase().includes(value)));
  }, [query, rows]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="font-headline text-2xl font-bold tracking-tight">Affordable housing</h1><p className="mt-1 text-sm text-on-surface-variant">Manage physical income-restricted apartment properties.</p></div>
        <Link to="/admin/properties/new" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-dim"><Plus className="h-4 w-4" /> New property</Link>
      </div>
      <div className="relative mb-5 max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by property, city, or manager" className="w-full rounded-full border border-surface-container-highest bg-surface-container-lowest py-2 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
      {error && <div className="mb-5 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{error}</div>}
      <div className="overflow-x-auto rounded-2xl border border-surface-container-highest">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface-container-low text-left text-xs uppercase tracking-wider text-on-surface-variant"><tr><th className="px-4 py-3">Property</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Waitlist</th><th className="px-4 py-3">Published</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-surface-container-highest bg-surface-container-lowest">
            {loading ? <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">Loading…</td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant"><Building2 className="mx-auto mb-3 h-6 w-6 text-primary" />{rows.length === 0 ? 'No affordable properties yet.' : 'No properties match this search.'}</td></tr> : filtered.map((row) => <tr key={row.id}><td className="px-4 py-3"><div className="font-semibold text-on-surface">{row.name}</div><div className="mt-0.5 text-xs text-on-surface-variant">{row.management_company || row.owner_organization || 'Manager not listed'}</div></td><td className="px-4 py-3 text-on-surface-variant">{AFFORDABLE_PROPERTY_TYPE_LABELS[row.property_type]}</td><td className="px-4 py-3 text-on-surface-variant">{row.city}, {row.state}<div className="text-xs">{row.county} County</div></td><td className="px-4 py-3 text-on-surface-variant">{row.linked_waitlist_id ? 'Linked' : 'None'}</td><td className="px-4 py-3 text-on-surface-variant">{row.published ? 'Yes' : 'Draft'}</td><td className="px-4 py-3 text-right"><Link to={`/admin/properties/${row.id}/edit`} className="font-semibold text-primary hover:underline">Edit</Link></td></tr>)}
          </tbody>
        </table>
      </div>
      {!loading && hasMore && <div className="mt-4 flex items-center justify-center gap-3 text-sm text-on-surface-variant"><span>Showing {rows.length} of {totalCount}</span><button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-full border border-surface-container-highest px-4 py-1.5 font-semibold text-on-surface disabled:opacity-60">{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
    </div>
  );
}
