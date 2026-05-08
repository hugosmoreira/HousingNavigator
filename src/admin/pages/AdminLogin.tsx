import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../AdminAuthContext';

interface LocationState {
  from?: string;
  error?: 'not-admin';
}

export default function AdminLogin() {
  const { signIn, signOut, session, isAdmin, configured } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    state.error === 'not-admin'
      ? 'Your account is signed in but is not in admin_users. Ask the project owner to add you.'
      : null,
  );

  // If the page mounts while a valid admin session is already cached
  // (returning visit, magic link, etc.), bounce straight to the dashboard.
  useEffect(() => {
    if (session && isAdmin) {
      navigate(
        state.from && state.from.startsWith('/admin') ? state.from : '/admin/resources',
        { replace: true },
      );
    }
  }, [session, isAdmin, navigate, state.from]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const ok = await signIn(email.trim(), password);
      if (ok) {
        navigate(
          state.from && state.from.startsWith('/admin') ? state.from : '/admin/resources',
          { replace: true },
        );
      } else {
        // Auth succeeded but the user is not in admin_users. Sign them
        // back out so the session does not linger, and surface a clear
        // message explaining the next step.
        await signOut();
        setError(
          'Signed in, but this account is not an admin yet. Run `insert into public.admin_users (user_id) values (\'<your auth user uuid>\');` in the Supabase SQL editor and try again.',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-headline font-bold tracking-tight mb-1">Admin sign in</h1>
      <p className="text-sm text-on-surface-variant mb-8">
        Manage the public resource directory and waitlist tracker.
      </p>

      {!configured && (
        <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          Supabase is not configured yet. Set the env vars in <code>.env</code> first.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          className="w-full rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
