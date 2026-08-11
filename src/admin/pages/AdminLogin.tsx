import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../AdminAuthContext';
import { getSupabaseClient } from '../../lib/supabaseClient';
import TurnstileChallenge, {
  isTurnstileConfigured,
} from '../../components/TurnstileChallenge';

interface LocationState {
  from?: string;
  error?: 'not-admin';
}

interface DiagnosticsReport {
  env: { hasUrl: boolean; hasAnonKey: boolean };
  steps: Array<{
    label: string;
    elapsedMs: number;
    ok: boolean;
    detail: unknown;
  }>;
}

const NOT_ADMIN_MESSAGE = 'This account does not have admin access.';

// Diagnostics + verbose auth errors are only useful while wiring up a new
// Supabase project. In production we surface a generic message and skip
// the diagnostics panel entirely.
const IS_DEV = import.meta.env.DEV;

export default function AdminLogin() {
  const { signIn, signOut, session, isAdmin, configured } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    state.error === 'not-admin' ? NOT_ADMIN_MESSAGE : null,
  );
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaGeneration, setCaptchaGeneration] = useState(0);

  // If the page mounts while a valid admin session is already cached
  // (returning visit, magic link, etc.), bounce straight to the dashboard.
  useEffect(() => {
    if (session && isAdmin) {
      navigate(
        state.from && state.from.startsWith('/admin') ? state.from : '/admin/dashboard',
        { replace: true },
      );
    }
  }, [session, isAdmin, navigate, state.from]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }
    setSubmitting(true);
    try {
      const ok = await signIn(email.trim(), password, captchaToken ?? undefined);
      if (ok) {
        navigate(
          state.from && state.from.startsWith('/admin') ? state.from : '/admin/dashboard',
          { replace: true },
        );
      } else {
        // Auth succeeded but the user is not authorized. Sign them back
        // out so the session does not linger, then surface a safe
        // production message (no internal table names, no SQL).
        await signOut().catch(() => {});
        setError(NOT_ADMIN_MESSAGE);
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
      if (isTurnstileConfigured) {
        setCaptchaToken(null);
        setCaptchaGeneration((value) => value + 1);
      }
    }
  }

  async function runDiagnostics() {
    setDiagRunning(true);
    setDiagnostics(null);
    const report: DiagnosticsReport = {
      env: {
        hasUrl: Boolean(import.meta.env.VITE_SUPABASE_URL),
        hasAnonKey: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
      },
      steps: [],
    };

    const supabase = await getSupabaseClient();
    if (!supabase) {
      report.steps.push({
        label: 'supabase client',
        elapsedMs: 0,
        ok: false,
        detail: 'client is null — env vars missing or dev server not restarted',
      });
      setDiagnostics(report);
      setDiagRunning(false);
      return;
    }

    // 1. getSession — does the cached session round-trip succeed?
    {
      const start = performance.now();
      try {
        const { data, error } = await supabase.auth.getSession();
        report.steps.push({
          label: 'auth.getSession()',
          elapsedMs: Math.round(performance.now() - start),
          ok: !error,
          detail: error
            ? { code: (error as { code?: string }).code, message: error.message }
            : { hasSession: !!data.session, userId: data.session?.user.id ?? null },
        });
      } catch (err) {
        report.steps.push({
          label: 'auth.getSession()',
          elapsedMs: Math.round(performance.now() - start),
          ok: false,
          detail: serializeError(err),
        });
      }
    }

    // 2. Do not perform a second credential exchange here: Turnstile tokens
    // are single-use, and the real form submission is the protected path.
    {
      report.steps.push({
        label: 'auth.signInWithPassword()',
        elapsedMs: 0,
        ok: false,
        detail: 'skipped - use the protected sign-in form above to test credentials',
      });
    }

    // 3. admin_users select — RLS-gated, requires an authed session and a
    //    matching admin_users row. This is what gates the spinner.
    {
      const start = performance.now();
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('user_id')
          .limit(1);
        report.steps.push({
          label: "from('admin_users').select('user_id').limit(1)",
          elapsedMs: Math.round(performance.now() - start),
          ok: !error,
          detail: error
            ? {
                code: error.code,
                message: error.message,
                hint: error.hint,
                details: error.details,
              }
            : { rows: data?.length ?? 0, sample: data?.[0] ?? null },
        });
      } catch (err) {
        report.steps.push({
          label: "from('admin_users').select(...)",
          elapsedMs: Math.round(performance.now() - start),
          ok: false,
          detail: serializeError(err),
        });
      }
    }

    setDiagnostics(report);
    setDiagRunning(false);
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
          <div className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error whitespace-pre-wrap">
            {error}
          </div>
        )}

        <TurnstileChallenge
          key={captchaGeneration}
          action="admin_login"
          onTokenChange={setCaptchaToken}
          onProblem={() => setError('The security check could not load. Please try again.')}
        />

        <button
          type="submit"
          disabled={submitting || !configured || (isTurnstileConfigured && !captchaToken)}
          className="w-full rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {IS_DEV && (
        <div className="mt-8 border-t border-surface-container-highest pt-6">
          <button
            type="button"
            onClick={runDiagnostics}
            disabled={diagRunning || !configured}
            className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            {diagRunning ? 'Running diagnostics…' : 'Run auth diagnostics (dev only)'}
          </button>
          {diagnostics && (
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-surface-container-low p-3 text-[11px] leading-relaxed text-on-surface-variant">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function formatAuthError(err: unknown): string {
  if (!IS_DEV) {
    // Production: never echo Supabase status codes, timeouts, or internal
    // identifiers back to the visitor. Invalid credentials and missing
    // accounts are not distinguished here on purpose.
    return 'Sign in failed. Please check your email and password.';
  }
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    const code = (err as { code?: string }).code;
    const parts = [err.message];
    if (status) parts.push(`status=${status}`);
    if (code) parts.push(`code=${code}`);
    if (/timed out/i.test(err.message)) {
      parts.push(
        '— the auth endpoint did not respond. Check network, browser extensions, or Supabase status.',
      );
    }
    return parts.join(' · ');
  }
  return 'Sign in failed';
}

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      status: (err as { status?: number }).status,
      code: (err as { code?: string }).code,
    };
  }
  return err;
}
