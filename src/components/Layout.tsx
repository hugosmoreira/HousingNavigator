import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, LayoutDashboard, LogIn, LogOut, Menu, X } from 'lucide-react';
import { usePublicAuth } from '../auth/PublicAuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthed, signOut, configured: publicAuthConfigured } = usePublicAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const skipInitialHeadUpdate = useRef(
    typeof document !== 'undefined' &&
      document.getElementById('root')?.dataset.ssr === 'true',
  );

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (skipInitialHeadUpdate.current) {
      skipInitialHeadUpdate.current = false;
      return;
    }

    let active = true;

    // Prerendering already places the correct metadata and JSON-LD in the
    // document. Load the catalog-backed resolvers only when the browser needs
    // to maintain the head during client-side navigation.
    void Promise.all([
      import('../lib/pageMetadata'),
      import('../lib/structuredData'),
    ])
      .then(([metadata, structuredData]) => {
        if (!active) return;
        metadata.applyPageMetadata(location.pathname);
        structuredData.applyStructuredData(location.pathname);
      })
      .catch(() => {
        // A blocked route chunk must not break navigation or hydration.
      });

    return () => {
      active = false;
    };
  }, [location.pathname]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Local state already cleared inside signOut(); fall through.
    }
    setMobileOpen(false);
    navigate('/', { replace: true });
  }

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Find resources', path: '/resources/' },
    { name: 'Affordable housing', path: '/affordable-housing/' },
    { name: 'Waitlists', path: '/waitlist/' },
    { name: 'About', path: '/mission/' },
  ];

  function isActive(path: string) {
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
  }

  return (
    <div className="bg-background text-on-background font-body antialiased min-h-screen flex flex-col">
      {/* Skip link for keyboard / screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-3 focus:left-3 focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded-full focus:font-semibold focus:text-sm"
      >
        Skip to content
      </a>

      {/* TopNavBar */}
      <nav className="sticky top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-surface-container-highest transition-all duration-300">
        <div className="flex justify-between items-center h-20 px-6 lg:px-12 max-w-7xl mx-auto">
          <Link to="/" className="text-[1.35rem] font-extrabold font-headline text-on-surface tracking-tight flex items-center gap-2">
            <Home className="w-[1.125rem] h-[1.125rem] text-primary" fill="currentColor" />
            Housing Navigator
          </Link>
          <div className="hidden lg:flex items-center gap-6 lg:gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.path}
                className={`font-semibold py-[26px] text-sm tracking-wide transition-all ${
                  isActive(link.path)
                    ? 'text-primary border-b-[2.5px] border-primary translate-y-[1px]'
                    : 'text-on-surface-variant hover:text-on-surface border-b-[2.5px] border-transparent hover:border-surface-variant'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {publicAuthConfigured && (isAuthed ? (
              <>
                <Link
                  to="/dashboard"
                  className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign in</span>
              </Link>
            ))}
            <Link
              to="/resources/"
              className="hidden sm:inline-flex transition-colors px-5 py-2.5 rounded-full font-semibold text-sm shadow-sm hover:shadow bg-primary text-on-primary hover:bg-primary-dim"
            >
              Find resources
            </Link>

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile slide-down panel */}
        {mobileOpen && (
          <div
            id="mobile-menu"
            className="lg:hidden border-t border-surface-container-highest bg-surface/95 backdrop-blur-xl"
          >
            <div className="px-6 py-4 flex flex-col gap-1 max-w-7xl mx-auto">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.path}
                  className={`px-3 py-2.5 rounded-xl text-base font-semibold transition-colors ${
                    isActive(link.path)
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                  }`}
                >
                  {link.name}
                </Link>
              ))}

              <div className="h-px bg-surface-container-highest my-2" />

              {publicAuthConfigured && (isAuthed ? (
                <>
                  <Link
                    to="/dashboard"
                    className="px-3 py-2.5 rounded-xl text-base font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors inline-flex items-center gap-2"
                  >
                    <LayoutDashboard className="w-4 h-4" /> Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-left px-3 py-2.5 rounded-xl text-base font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors inline-flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="px-3 py-2.5 rounded-xl text-base font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors inline-flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" /> Sign in
                </Link>
              ))}

              <Link
                to="/resources/"
                className="mt-2 px-3 py-3 rounded-full font-semibold text-sm text-center bg-primary text-on-primary hover:bg-primary-dim transition-colors"
              >
                Find resources
              </Link>
            </div>
          </div>
        )}
      </nav>

      <main id="main-content" className="flex-grow flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-surface w-full py-16 border-t border-surface-container-highest mt-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 px-6 lg:px-12 max-w-7xl mx-auto">
          <div className="flex flex-col items-center md:items-start gap-2">
            <span className="font-headline font-bold text-on-surface text-lg tracking-tight">Housing Navigator</span>
            <p className="text-on-surface-variant font-body text-sm leading-relaxed text-center md:text-left">
              © {new Date().getFullYear()} Housing Navigator. Empowering communities through stable housing.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" to="/privacy/">Privacy Policy</Link>
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" to="/terms/">Terms of Service</Link>
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" to="/help/">Help Center</Link>
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" to="/accessibility/">Accessibility</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
