import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { usePublicAuth } from '../auth/PublicAuthContext';

interface LocationState {
  from?: string;
}

export default function Login() {
  const { signIn, isAuthed, configured } = usePublicAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const target =
    state.from && state.from.startsWith('/') && !state.from.startsWith('/admin')
      ? state.from
      : '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → bounce to wherever they were going.
  useEffect(() => {
    if (isAuthed) navigate(target, { replace: true });
  }, [isAuthed, navigate, target]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // The auth listener will populate session/profile; the effect above
      // does the redirect once `isAuthed` flips true.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-md mx-auto px-6 lg:px-12">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Welcome back
          </p>
          <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">
            Sign in to your account
          </h1>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            Save resources, follow waitlists, and get notified when openings
            change. Browsing the directory does not require an account.
          </p>
        </header>

        {!configured && (
          <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            Accounts are unavailable — Supabase is not configured.
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 lg:p-8 space-y-4"
        >
          <label className="block">
            <span className="text-sm font-medium text-on-surface">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-on-surface">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </label>

          {error && (
            <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !configured}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-on-surface-variant mt-6 text-center">
          New to Housing Navigator?{' '}
          <Link to="/signup" className="text-primary font-semibold hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
