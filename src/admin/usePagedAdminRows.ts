import { useCallback, useEffect, useState } from 'react';
import { requireSupabase } from '../lib/supabaseClient';

export const ADMIN_PAGE_SIZE = 100;

/**
 * Paged reads for the admin list views (`resources_admin` /
 * `waitlists_admin`). The lists used to fetch every row in one
 * unbounded select; this caps each request at ADMIN_PAGE_SIZE and
 * exposes `loadMore` so the catalog can grow past a few hundred rows
 * without the admin pages degrading.
 *
 * The client-side text filter on those pages only searches loaded rows —
 * callers surface a hint when `hasMore` is true so that stays visible.
 */
export function usePagedAdminRows<T>(view: 'resources_admin' | 'waitlists_admin') {
  const [rows, setRows] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number) => {
      const client = requireSupabase();
      // The *_admin views (migration 0010) are the only read surface that
      // still includes internal_notes; they return zero rows for non-admins.
      const { data, error: err, count } = await client
        .from(view)
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(offset, offset + ADMIN_PAGE_SIZE - 1);
      if (err) throw err;
      return { page: (data ?? []) as T[], count: count ?? 0 };
    },
    [view],
  );

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { page, count } = await fetchPage(0);
      setRows(page);
      setTotalCount(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    setError(null);
    setLoadingMore(true);
    try {
      const { page, count } = await fetchPage(rows.length);
      setRows((prev) => [...prev, ...page]);
      setTotalCount(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, rows.length]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const hasMore = totalCount !== null && rows.length < totalCount;

  return {
    rows,
    totalCount,
    loading,
    loadingMore,
    error,
    setError,
    reload,
    loadMore,
    hasMore,
  };
}
