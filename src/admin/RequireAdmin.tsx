import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';

/**
 * Route guard for `/admin/*` pages other than the login screen. Sends
 * unauthenticated users to `/admin/login` and signed-in non-admins
 * back too (with a hint that their account lacks access).
 *
 * When the admin lookup itself failed (network, timeout), the answer is
 * unknown, so the guard offers a retry instead of claiming "not an admin".
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, isAdmin, loading, configured, adminCheckFailed, refreshAdminFlag } =
    useAdminAuth();
  const location = useLocation();
  const [retrying, setRetrying] = useState(false);

  if (!configured) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="text-xl font-headline font-bold mb-2">Supabase not configured</h2>
        <p className="text-on-surface-variant text-sm">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
          <code>.env</code> to enable the admin area.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center text-on-surface-variant">
        Loading admin session…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin && adminCheckFailed) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center" role="alert">
        <h2 className="text-xl font-headline font-bold mb-2">
          We couldn&apos;t confirm your admin access
        </h2>
        <p className="text-on-surface-variant text-sm mb-6">
          This is usually a connection problem, not a permissions change. Check
          your connection and try again.
        </p>
        <button
          type="button"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void refreshAdminFlag()
              .catch(() => {})
              .finally(() => setRetrying(false));
          }}
          className="inline-flex items-center justify-center rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim disabled:opacity-60"
        >
          {retrying ? 'Checking…' : 'Try again'}
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location.pathname, error: 'not-admin' }}
      />
    );
  }

  return <>{children}</>;
}
