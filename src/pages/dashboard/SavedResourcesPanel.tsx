import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Phone, MapPin, ArrowUpRight, Trash2 } from 'lucide-react';
import { useUserData } from '../../auth/UserDataContext';
import { fetchResourcesByIds } from '../../services/userData';
import {
  DIRECTORY_CATEGORY_LABELS,
  csvToDirectoryCategory,
} from '../../data/categoryMap';
import type { ResourceRow } from '../../services/data/dbTypes';
import type { DirectoryCategory } from '../../types';

function categoryLabel(category: string): string {
  if (category in DIRECTORY_CATEGORY_LABELS) {
    return DIRECTORY_CATEGORY_LABELS[category as DirectoryCategory];
  }
  // Resources rows store the directory taxonomy already, but be defensive
  // if an older row slipped through with a free-text label.
  return DIRECTORY_CATEGORY_LABELS[csvToDirectoryCategory(category)];
}

function formatLocation(row: ResourceRow): string {
  const cityState = [row.city, row.state].filter(Boolean).join(', ');
  return cityState ? `${cityState} · ${row.county} County` : `${row.county} County`;
}

export default function SavedResourcesPanel() {
  const { savedResourceIds, toggleResource, loading: userDataLoading } = useUserData();
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const ids = useMemo(() => Array.from(savedResourceIds), [savedResourceIds]);

  useEffect(() => {
    let active = true;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const fetched = await fetchResourcesByIds(ids);
        if (active) setRows(fetched);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load saved resources');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [ids]);

  async function handleRemove(id: string) {
    setPendingId(id);
    try {
      await toggleResource(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this resource');
    } finally {
      setPendingId(null);
    }
  }

  const isInitialLoad = (loading || userDataLoading) && rows.length === 0;

  return (
    <section className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 lg:p-8">
      <header className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Bookmark className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-lg font-headline font-bold text-on-surface tracking-tight">
            Saved resources
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {ids.length} saved
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </div>
      )}

      {isInitialLoad ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : ids.length === 0 ? (
        <EmptyState
          message="You haven't saved any resources yet."
          ctaLabel="Browse the directory"
          ctaTo="/resources/"
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          Your saved resources are no longer published. They may have been
          removed by an admin.
        </p>
      ) : (
        <>
          {rows.length < ids.length && (
            <p className="mb-4 text-xs text-on-surface-variant">
              {ids.length - rows.length} saved{' '}
              {ids.length - rows.length === 1 ? 'resource is' : 'resources are'} no
              longer published and not shown here.
            </p>
          )}
          <ul className="divide-y divide-surface-container-highest">
          {rows.map((row) => (
            <li key={row.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                      {categoryLabel(row.category)}
                    </span>
                  </div>
                  <h3 className="text-base font-headline font-bold text-on-surface tracking-tight">
                    {row.name}
                  </h3>
                  <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-on-surface-variant">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      {formatLocation(row)}
                    </div>
                    {row.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                        <a
                          href={`tel:${row.phone.replace(/[^0-9+]/g, '')}`}
                          className="hover:text-primary"
                        >
                          {row.phone}
                        </a>
                      </div>
                    )}
                  </dl>
                  {row.website && (
                    <a
                      href={row.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dim"
                    >
                      Visit site <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(row.id)}
                  disabled={pendingId === row.id}
                  aria-label={`Remove ${row.name} from saved resources`}
                  title="Remove from saved"
                  className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
          </ul>
        </>
      )}
    </section>
  );
}

function EmptyState({
  message,
  ctaLabel,
  ctaTo,
}: {
  message: string;
  ctaLabel: string;
  ctaTo: string;
}) {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-on-surface-variant mb-3">{message}</p>
      <Link
        to={ctaTo}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dim"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
