import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { usePublicAuth } from '../auth/PublicAuthContext';

export default function ForgotPassword() {
  const { requestPasswordReset, configured } = usePublicAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      // Always show the same confirmation, whether or not the address has an
      // account — never reveal which emails are registered.
      setSent(true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setError(
        /timed out/i.test(raw)
          ? 'This is taking longer than expected. Check your connection and try again.'
          : 'We could not send the reset email right now. Please try again.',
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
            Forgot your password?
          </h1>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            Enter the email you used to sign up and we'll send you a link to set
            a new password.
          </p>
        </header>

        {!configured && (
          <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            Accounts are unavailable — Supabase is not configured.
          </div>
        )}

        {sent ? (
          <div className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6 lg:p-8">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Mail className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-headline font-bold text-on-surface mb-2">
              Check your inbox
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              If an account exists for <span className="font-semibold text-on-surface">{email.trim()}</span>,
              we've sent a link to reset your password. It may take a few minutes
              to arrive — check your spam folder too.
            </p>
          </div>
        ) : (
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
              <Mail className="w-4 h-4" aria-hidden="true" />
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-sm text-on-surface-variant mt-6 text-center">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
