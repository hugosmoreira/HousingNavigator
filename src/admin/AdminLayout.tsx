import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BellRing, ClipboardCheck, Home, ListChecks, LogOut, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAdminAuth } from './AdminAuthContext';

export default function AdminLayout() {
  const { session, isAdmin, signOut, configured } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingReviews, setPendingReviews] = useState(0);

  // Pending-suggestion count for the Review badge. Cheap head request,
  // refreshed on navigation so approvals/rejections update it promptly.
  useEffect(() => {
    if (!session || !isAdmin) return;
    const client = supabase;
    if (!client) return;
    let active = true;
    (async () => {
      try {
        const { count } = await client
          .from('waitlist_status_suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (active) setPendingReviews(count ?? 0);
      } catch {
        // Badge is informational only — never surface an error for it.
      }
    })();
    return () => {
      active = false;
    };
  }, [session, isAdmin, location.pathname]);

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      // Local session was already cleared inside signOut(); we still want
      // the user off the admin pages, but surface the failure so they
      // know the remote token may not have been revoked.
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setSignOutError(message);
      // eslint-disable-next-line no-console
      console.warn('[admin-layout] sign out error', err);
    } finally {
      setSigningOut(false);
      navigate('/admin/login', { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      <header className="border-b border-surface-container-highest bg-surface-container-low">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-headline font-bold tracking-tight">
              Housing Navigator{' '}
              <span className="text-on-surface-variant font-medium">· Admin</span>
            </span>
          </div>

          {session && isAdmin && (
            <nav className="flex items-center gap-1 sm:gap-2 text-sm">
              <AdminNavLink to="/admin/resources" icon={<ListChecks className="w-4 h-4" />}>
                Resources
              </AdminNavLink>
              <AdminNavLink to="/admin/waitlists" icon={<ListChecks className="w-4 h-4" />}>
                Waitlists
              </AdminNavLink>
              <AdminNavLink to="/admin/alerts" icon={<BellRing className="w-4 h-4" />}>
                Alerts
              </AdminNavLink>
              <AdminNavLink
                to="/admin/review"
                icon={<ClipboardCheck className="w-4 h-4" />}
                badge={pendingReviews}
              >
                Review
              </AdminNavLink>
            </nav>
          )}

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
            >
              <Home className="w-4 h-4" /> Public site
            </Link>
            {session && (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </div>
        </div>
      </header>

      {signOutError && (
        <div className="bg-error/10 border-b border-error/30 text-sm text-error">
          <div className="max-w-6xl mx-auto px-6 lg:px-10 py-2">
            Sign out had trouble: {signOutError}. Local session cleared anyway.
          </div>
        </div>
      )}

      {!configured && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-900 text-sm">
          <div className="max-w-6xl mx-auto px-6 lg:px-10 py-3">
            Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> to use the
            admin tools.
          </div>
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function AdminNavLink({
  to,
  icon,
  badge,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-on-surface-variant hover:text-on-surface'
        }`
      }
    >
      {icon}
      {children}
      {badge != null && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full bg-primary text-on-primary text-[11px] font-semibold leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}
