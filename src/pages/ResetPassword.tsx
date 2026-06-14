import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { usePublicAuth } from '../auth/PublicAuthContext';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPassword() {
  const { updatePassword, session, loading, configured } = usePublicAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The emailed link carries a recovery token that supabaseClient
  // (detectSessionInUrl) exchanges for a session on load. If there's no
  // session once loading settles, the link was invalid or expired.
  const noRecoverySession = configured && !loading && !session;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(
        /timed out/i.test(raw)
          ? 'This is taking longer than expected. Check your connection and try again.'
          : /session|auth|jwt|expired/i.test(raw)
            ? 'Your reset link has expired. Request a new one and try again.'
            : 'We could not update your password. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-md mx-auto px-6 lg:px-12">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Reset password
          </p>
          <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">
            Choose a new password
          </h1>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            Pick a password you don't use anywhere else. It needs to be at least
            {' '}{MIN_PASSWORD_LENGTH} characters.
          </p>
        </header>

        {!configured && (
          <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            Accounts are unavailable — Supabase is not configured.
          </div>
        )}

        {done ? (
          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 lg:p-8">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-headline font-bold text-on-surface mb-2">
              Password updated
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-5">
              You're all set. You can now use your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim"
            >
              Go to your dashboard
            </button>
          </div>
        ) : noRecoverySession ? (
          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 lg:p-8">
            <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
              This password-reset link is invalid or has expired. Reset links are
              single-use and time-limited.
            </p>
            <Link
              to="/forgot-password"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim"
            >
              Request a new link
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 lg:p-8 space-y-4"
          >
            <label className="block">
              <span className="text-sm font-medium text-on-surface">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-on-surface">Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
