import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, LayoutDashboard, LogIn, LogOut } from 'lucide-react';
import { usePublicAuth } from '../auth/PublicAuthContext';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthed, signOut, configured: publicAuthConfigured } = usePublicAuth();

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Local state already cleared inside signOut(); fall through.
    }
    navigate('/', { replace: true });
  }

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Find resources', path: '/resources' },
    { name: 'Waitlists', path: '/waitlist' },
    { name: 'About', path: '/mission' },
  ];

  return (
    <div className="bg-background text-on-background font-body antialiased min-h-screen flex flex-col">
      {/* TopNavBar */}
      <nav className="sticky top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-surface-container-highest transition-all duration-300">
        <div className="flex justify-between items-center h-20 px-6 lg:px-12 max-w-7xl mx-auto">
          <Link to="/" className="text-[1.35rem] font-extrabold font-headline text-on-surface tracking-tight flex items-center gap-2">
            <Home className="w-[1.125rem] h-[1.125rem] text-primary" fill="currentColor" />
            Housing Navigator
          </Link>
          <div className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
              return (
                <Link 
                  key={link.name}
                  to={link.path}
                  className={`font-semibold py-[26px] text-sm tracking-wide transition-all ${
                    isActive 
                      ? 'text-primary border-b-[2.5px] border-primary translate-y-[1px]' 
                      : 'text-on-surface-variant hover:text-on-surface border-b-[2.5px] border-transparent hover:border-surface-variant'
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
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
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Sign in</span>
              </Link>
            ))}
            <Link
              to="/resources"
              className="transition-colors px-5 py-2.5 rounded-full font-semibold text-sm shadow-sm hover:shadow bg-primary text-on-primary hover:bg-primary-dim"
            >
              Find resources
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-grow flex flex-col">
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
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" to="/privacy">Privacy Policy</Link>
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" to="/terms">Terms of Service</Link>
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" to="/help">Help Center</Link>
            <Link className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" to="/accessibility">Accessibility</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
