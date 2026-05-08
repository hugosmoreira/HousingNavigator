import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';

/**
 * Route guard for `/admin/*` pages other than the login screen. Sends
 * unauthenticated users to `/admin/login` and signed-in non-admins
 * back too (with a hint that their account lacks access).
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, isAdmin, loading, configured } = useAdminAuth();
  const location = useLocation();

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
