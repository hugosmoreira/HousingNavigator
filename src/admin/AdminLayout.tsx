import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BellRing,
  Building2,
  ClipboardCheck,
  ExternalLink,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useAdminAuth } from './AdminAuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

export default function AdminLayout() {
  const { session, isAdmin, signOut, configured } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    let active = true;
    void getSupabaseClient().then((client) => {
      if (!client || !active) return;
      void client
        .from('waitlist_status_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }) => {
          if (active) setPendingReviews(count ?? 0);
        });
    });
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
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setSignOutError(message);
      // eslint-disable-next-line no-console
      console.warn('[admin-layout] sign out error', err);
    } finally {
      setSigningOut(false);
      navigate('/admin/login', { replace: true });
    }
  }

  const sidebar = session && isAdmin ? (
    <Sidebar
      email={session.user.email ?? 'Administrator'}
      pendingReviews={pendingReviews}
      signingOut={signingOut}
      onSignOut={handleSignOut}
    />
  ) : null;

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {sidebar && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-surface-container-highest bg-surface-container-lowest lg:block">
          {sidebar}
        </aside>
      )}

      {sidebar && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-inverse-surface/45"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative h-full w-[min(19rem,88vw)] border-r border-surface-container-highest bg-surface-container-lowest shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className={sidebar ? 'lg:pl-64' : ''}>
        {sidebar && (
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-surface-container-highest bg-surface/95 px-5 backdrop-blur lg:px-8">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold text-on-surface">
                {currentPageTitle(location.pathname)}
              </p>
              <p className="text-xs text-on-surface-variant">Housing Navigator administration</p>
            </div>
            <Link
              to="/"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-surface-container-highest px-3 py-1.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            >
              Public site <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </header>
        )}

        {signOutError && (
          <div className="border-b border-error/30 bg-error/10 px-6 py-2 text-sm text-error lg:px-10">
            Sign out had trouble: {signOutError}. Your local session was cleared.
          </div>
        )}

        {!configured && (
          <div className="border-b border-yellow-200 bg-yellow-50 px-6 py-3 text-sm text-yellow-900 lg:px-10">
            Supabase is not configured. Add the Supabase URL and anonymous key to use the
            admin tools.
          </div>
        )}

        <main className="min-h-[calc(100vh-4rem)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  email,
  pendingReviews,
  signingOut,
  onSignOut,
}: {
  email: string;
  pendingReviews: number;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const sections: Array<{ label: string; items: NavItem[] }> = [
    {
      label: 'Workspace',
      items: [
        {
          to: '/admin/dashboard',
          label: 'Overview',
          icon: <LayoutDashboard className="h-4.5 w-4.5" />,
        },
      ],
    },
    {
      label: 'Content',
      items: [
        {
          to: '/admin/resources',
          label: 'Resources',
          icon: <ListChecks className="h-4.5 w-4.5" />,
        },
        {
          to: '/admin/properties',
          label: 'Affordable housing',
          icon: <Building2 className="h-4.5 w-4.5" />,
        },
        {
          to: '/admin/waitlists',
          label: 'Waitlists',
          icon: <PanelLeftClose className="h-4.5 w-4.5" />,
        },
      ],
    },
    {
      label: 'Operations',
      items: [
        {
          to: '/admin/review',
          label: 'Review queue',
          icon: <ClipboardCheck className="h-4.5 w-4.5" />,
          badge: pendingReviews,
        },
        {
          to: '/admin/alerts',
          label: 'Alert history',
          icon: <BellRing className="h-4.5 w-4.5" />,
        },
      ],
    },
    {
      label: 'People',
      items: [
        {
          to: '/admin/users',
          label: 'Users',
          icon: <Users className="h-4.5 w-4.5" />,
        },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-surface-container-highest px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-headline text-sm font-bold tracking-tight">Housing Navigator</p>
          <p className="text-xs text-on-surface-variant">Admin workspace</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant/80">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <SidebarLink key={item.to} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-surface-container-highest p-3">
        <div className="mb-2 rounded-xl bg-surface-container-low px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Signed in
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-on-surface" title={email}>
            {email}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

function SidebarLink({ to, label, icon, badge }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
          isActive
            ? 'bg-primary text-on-primary shadow-sm'
            : 'font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
        }`
      }
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 py-0.5 text-[11px] font-bold text-on-error">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

function currentPageTitle(pathname: string): string {
  if (pathname.startsWith('/admin/properties')) return 'Affordable housing';
  if (pathname.startsWith('/admin/resources')) return 'Resources';
  if (pathname.startsWith('/admin/waitlists')) return 'Waitlists';
  if (pathname.startsWith('/admin/review')) return 'Review queue';
  if (pathname.startsWith('/admin/alerts')) return 'Alert history';
  if (pathname.startsWith('/admin/users')) return 'Users';
  return 'Overview';
}
