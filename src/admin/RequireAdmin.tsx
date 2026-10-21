import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';
import { adminRouteFor } from './adminAccess';
import AdminAccessRetry from './components/AdminAccessRetry';

/**
 * Route guard for `/admin/*` pages other than login and verify. Sends
 * unauthenticated users to `/admin/login`, members who still need their
 * two-factor code to `/admin/verify`, and signed-in non-admins back to
 * login with a hint that their account lacks access.
 *
 * When the admin lookup itself failed (network, timeout), the answer is
 * unknown, so the guard offers a retry instead of claiming "not an admin".
 */
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const auth = useAdminAuth();
  const location = useLocation();

  if (!auth.configured) {
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

  const route = adminRouteFor({
    loading: auth.loading,
    hasSession: Boolean(auth.session),
    isAdmin: auth.isAdmin,
    isAdminMember: auth.isAdminMember,
    needsMfaVerification: auth.needsMfaVerification,
    adminCheckFailed: auth.adminCheckFailed,
  });

  switch (route) {
    case 'loading':
      return (
        <div className="max-w-3xl mx-auto px-6 py-16 text-center text-on-surface-variant">
          Loading admin session…
        </div>
      );
    case 'login':
      return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
    case 'verify':
      return <Navigate to="/admin/verify" replace state={{ from: location.pathname }} />;
    case 'retry':
      return <AdminAccessRetry />;
    case 'not-admin':
      return (
        <Navigate
          to="/admin/login"
          replace
          state={{ from: location.pathname, error: 'not-admin' }}
        />
      );
    case 'allow':
      return <>{children}</>;
  }
}
