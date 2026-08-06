import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, MailCheck } from 'lucide-react';
import { usePublicAuth } from '../auth/PublicAuthContext';
import TurnstileChallenge, {
  isTurnstileConfigured,
} from '../components/TurnstileChallenge';

export default function Signup() {
  const { signUp, isAuthed, configured } = usePublicAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [homeCounty, setHomeCounty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaGeneration, setCaptchaGeneration] = useState(0);

  // Already signed in (e.g. opened /signup with an active session) → go
  // straight to the dashboard.
  useEffect(() => {
    if (isAuthed) navigate('/dashboard', { replace: true });
  }, [isAuthed, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }
    setSubmitting(true);
    try {
      const { requiresConfirmation } = await signUp(email.trim(), password, {
        display_name: displayName.trim() || undefined,
        home_county: homeCounty.trim() || undefined,
      }, captchaToken ?? undefined);
      if (requiresConfirmation) {
        setConfirmationSent(true);
      }
      // Otherwise the auth listener flips isAuthed and the effect above
      // routes to /dashboard.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
    } finally {
      setSubmitting(false);
      if (isTurnstileConfigured) {
        setCaptchaToken(null);
        setCaptchaGeneration((value) => value + 1);
      }
    }
  }

  if (confirmationSent) {
    return (
      <div className="bg-surface min-h-screen py-16">
        <div className="max-w-md mx-auto px-6 lg:px-12 text-center">
          <span className="inline-flex w-12 h-12 rounded-2xl bg-primary/10 text-primary items-center justify-center mb-4">
            <MailCheck className="w-6 h-6" />
          </span>
          <h1 className="text-2xl font-headline font-bold text-on-surface mb-3 tracking-tight">
            Check your inbox
          </h1>
          <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
            We sent a confirmation link to <span className="font-semibold text-on-surface">{email}</span>.
            Click it to finish creating your account, then sign in.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-md mx-auto px-6 lg:px-12">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Create account
          </p>
          <h1 className="text-3xl lg:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">
            Save resources and follow waitlists
          </h1>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            Free, takes about a minute. We only ask for what we need.
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
            <span className="text-sm font-medium text-on-surface">
              Display name <span className="text-on-surface-variant font-normal">(optional)</span>
            </span>
            <input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </label>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <span className="text-xs text-on-surface-variant mt-1 block">
              At least 8 characters.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-on-surface">
              Home county <span className="text-on-surface-variant font-normal">(optional)</span>
            </span>
            <input
              type="text"
              placeholder="e.g. Multnomah"
              value={homeCounty}
              onChange={(e) => setHomeCounty(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <span className="text-xs text-on-surface-variant mt-1 block">
              Helps us surface relevant waitlists. You can change this later.
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
              {error}
            </div>
          )}

          <TurnstileChallenge
            key={captchaGeneration}
            action="public_signup"
            onTokenChange={setCaptchaToken}
            onProblem={() => setError('The security check could not load. Please try again.')}
          />

          <button
            type="submit"
            disabled={submitting || !configured || (isTurnstileConfigured && !captchaToken)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-4 h-4" />
            {submitting ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-xs text-on-surface-variant leading-relaxed">
            By creating an account you agree to our{' '}
              <Link to="/terms/" className="text-primary font-medium hover:underline">
              Terms
            </Link>{' '}
            and{' '}
              <Link to="/privacy/" className="text-primary font-medium hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </form>

        <p className="text-sm text-on-surface-variant mt-6 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
