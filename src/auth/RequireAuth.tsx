import { Fragment } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePublicAuth } from './PublicAuthContext';

/**
 * Route guard for visitor-only pages (`/dashboard`). Sends signed-out
 * visitors to `/login` and remembers where they came from so the login
 * form can bounce them back after a successful sign-in.
 *
 * Distinct from `<RequireAdmin>` (which guards `/admin/*`). Public auth
 * does not check `admin_users` and admin auth does not check `profiles`.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, isAuthed, loading, configured } = usePublicAuth();
  const location = useLocation();

  if (!configured) {
    return (
      <div className="bg-surface min-h-screen py-16">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 text-center">
          <h2 className="text-xl font-headline font-bold mb-2">Accounts unavailable</h2>
          <p className="text-on-surface-variant text-sm">
            The signup / dashboard area needs Supabase configured. Browsing the
            directory still works — head to <a className="text-primary font-semibold" href="/resources">Find resources</a>.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-surface min-h-screen py-16 text-center text-on-surface-variant text-sm">
        Loading your dashboard…
      </div>
    );
  }

  if (!session || !isAuthed) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // Keyed on the user, so an account switch in another tab remounts the
  // dashboard and every panel reloads for the new user instead of keeping
  // the previous user's alert history on screen.
  return <Fragment key={session.user.id}>{children}</Fragment>;
}
