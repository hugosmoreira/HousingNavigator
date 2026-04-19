import { Link, Outlet, useLocation } from 'react-router-dom';
import { Home, LogIn } from 'lucide-react';

export default function Layout() {
  const location = useLocation();

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Resources', path: '/resources' },
    { name: 'Waitlist', path: '/waitlist' },
    { name: 'Mission', path: '/mission' },
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
          <div className="flex items-center gap-4">
            <Link 
              to="/staff" 
              className={`transition-colors px-6 py-2.5 rounded-full font-bold text-sm shadow-sm hover:shadow flex items-center gap-2 ${
                location.pathname.startsWith('/staff') 
                  ? 'bg-primary text-on-primary' 
                  : 'bg-surface-container-highest text-primary hover:bg-surface-variant'
              }`}
            >
              {location.pathname.startsWith('/staff') ? 'Staff Mode' : 'Staff Login'}
              {!location.pathname.startsWith('/staff') && <LogIn className="w-4 h-4" />}
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
              © 2024 Housing Navigator. Empowering communities through stable housing.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" href="#">Privacy Policy</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" href="#">Terms of Service</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" href="#">Help Center</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors font-body text-sm tracking-wide font-medium" href="#">Accessibility</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
