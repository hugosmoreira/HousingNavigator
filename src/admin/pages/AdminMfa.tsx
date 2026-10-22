import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { requireSupabase } from '../../lib/supabaseClient';
import { useAdminAuth } from '../AdminAuthContext';
import {
  MFA_SETUP_NAME_PREFIX,
  REQUIRE_ADMIN_MFA,
  adminReturnPath,
  mfaPageFor,
  planFactors,
  type FactorPlan,
} from '../adminAccess';
import AdminAccessRetry from '../components/AdminAccessRetry';

/**
 * /admin/verify: set up an authenticator app, or enter its code.
 *
 * Members arrive here from RequireAdmin when their session still needs the
 * code, or from the setup banner. When verification succeeds, auth-js emits
 * a new AAL2 session, AdminAuthContext recomputes access, and this page
 * forwards to the page the admin was trying to open.
 */
export default function AdminMfa() {
  const auth = useAdminAuth();
  const location = useLocation();
  const from = adminReturnPath((location.state as { from?: string } | null)?.from);

  const page = mfaPageFor({
    loading: auth.loading,
    hasSession: Boolean(auth.session),
    isAdminMember: auth.isAdminMember,
    adminCheckFailed: auth.adminCheckFailed,
    mfaEnrolled: auth.mfaEnrolled,
    mfaVerified: auth.mfaVerified,
  });

  switch (page) {
    case 'loading':
      return (
        <p className="p-8 text-center text-on-surface-variant" role="status">
          Checking admin access…
        </p>
      );
    case 'login':
      return <Navigate to="/admin/login" replace state={{ from }} />;
    case 'not-admin':
      return <Navigate to="/admin/login" replace state={{ from, error: 'not-admin' }} />;
    case 'retry':
      return <AdminAccessRetry />;
    case 'done':
      return <Navigate to={from} replace />;
    case 'verify':
    case 'enroll':
      // A different account gets a fresh form, dropping any setup secret or code.
      return (
        <AdminMfaForm
          key={auth.session!.user.id}
          optional={page === 'enroll' && !REQUIRE_ADMIN_MFA}
          from={from}
        />
      );
  }
}

interface Setup {
  id: string;
  qr: string;
  secret: string;
}

function AdminMfaForm({ optional, from }: { optional: boolean; from: string }) {
  const { refreshAdminFlag, signOut } = useAdminAuth();
  const [plan, setPlan] = useState<FactorPlan | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedButUnconfirmed, setAcceptedButUnconfirmed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const supabase = await requireSupabase();
        const { data, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;
        if (mounted.current) setPlan(planFactors(data.all));
      } catch {
        if (mounted.current) setError('Your security methods could not load. Reload to try again.');
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  async function startSetup() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = await requireSupabase();
      // Re-read from the server: never add a factor while a verified one exists.
      const { data: listed, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const current = planFactors(listed.all);
      if (current.mode !== 'enroll') {
        if (mounted.current) setPlan(current);
        return;
      }
      // Remove only abandoned setups this page created, never a verified factor.
      for (const factorId of current.abandonedSetupIds) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId });
        if (removeError) throw removeError;
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `${MFA_SETUP_NAME_PREFIX}${crypto.randomUUID().slice(0, 8)}`,
        issuer: 'Housing Navigator',
      });
      if (enrollError) throw enrollError;
      if (mounted.current) setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      if (mounted.current) setError('Setup could not start. Check your connection and try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function confirmAccess() {
    try {
      await refreshAdminFlag();
      if (mounted.current) setAcceptedButUnconfirmed(false);
    } catch {
      if (mounted.current) setAcceptedButUnconfirmed(true);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const factorId = setup?.id ?? (plan?.mode === 'verify' ? plan.factorId : null);
    if (busy || !factorId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = await requireSupabase();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) {
        if (mounted.current) {
          setError("That code didn't work. Codes change every 30 seconds, so enter the one showing now.");
        }
        return;
      }
      if (!mounted.current) return;
      setCode('');
      setSetup(null);
      // The code is accepted and the session is now AAL2. A failed membership
      // re-check here is a connection problem, not a wrong code (A-107).
      await confirmAccess();
    } catch {
      if (mounted.current) setError('The code could not be checked. Check your connection and try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      // This browser is already signed out; only other devices may remain.
    }
  }

  const enrolling = plan?.mode === 'enroll';
  const showCodeForm = Boolean(setup) || plan?.mode === 'verify';
  const buttonClass =
    'inline-flex items-center justify-center rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim disabled:opacity-60';

  if (acceptedButUnconfirmed) {
    return (
      <div className="max-w-md mx-auto px-6 py-12 text-center" role="alert">
        <h1 className="text-2xl font-headline font-bold mb-3">Code accepted</h1>
        <p className="text-sm text-on-surface-variant mb-6">
          Your code was accepted, but we couldn&apos;t confirm your admin access. This is
          usually a connection problem.
        </p>
        <button type="button" className={buttonClass} onClick={() => void confirmAccess()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-12">
      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
        <ShieldCheck className="w-6 h-6" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-headline font-bold mb-3">
        {enrolling ? 'Set up two-factor sign-in' : 'Enter your security code'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {enrolling
          ? 'Admin accounts can change public housing information. An authenticator app adds a second check, so a stolen password alone is not enough.'
          : 'Open your authenticator app and enter the 6-digit code for Housing Navigator.'}
      </p>

      {!plan && !error && (
        <p className="text-sm text-on-surface-variant" role="status">
          Loading your security methods…
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}

      {plan?.mode === 'unsupported' && (
        <p className="text-sm">
          This account uses a security method this page does not support. Ask the
          Supabase project owner for help.
        </p>
      )}

      {enrolling && !setup && (
        <button type="button" onClick={() => void startSetup()} disabled={busy} className={buttonClass}>
          {busy ? 'Preparing…' : 'Set up an authenticator app'}
        </button>
      )}

      {setup && (
        <div className="mb-6">
          <p className="text-sm">
            Scan this QR code with an authenticator app (for example Google
            Authenticator, Microsoft Authenticator or 1Password), then enter the code it
            shows.
          </p>
          <img
            className="my-4 h-52 w-52 rounded-lg border border-surface-container-highest bg-white p-2"
            alt="QR code for setting up your authenticator app"
            src={setup.qr}
          />
          <details className="text-sm">
            <summary className="cursor-pointer">Can&apos;t scan? Enter the setup key instead</summary>
            <code className="mt-2 block break-all select-all rounded bg-surface-container-low px-2 py-1">
              {setup.secret}
            </code>
            <p className="mt-2 text-xs text-on-surface-variant">
              Save this key in your password manager. It lets you add the account to a new
              phone if you lose this one.
            </p>
          </details>
        </div>
      )}

      {showCodeForm && (
        <form onSubmit={(event) => void verify(event)} className="space-y-4">
          <label className="block text-sm font-medium">
            6-digit code
            <input
              className="mt-1 w-full rounded-xl border border-surface-container-highest bg-surface-container-lowest px-3 py-2.5 text-lg tracking-widest focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              value={code}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              disabled={busy}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <button className={buttonClass} type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>
        </form>
      )}

      <div className="mt-8 space-y-3 text-sm">
        {optional && (
          <p>
            <Link to={from} className="font-semibold text-primary hover:underline">
              Not now, continue to the admin area
            </Link>
          </p>
        )}
        <p className="text-xs text-on-surface-variant">
          Lost access to your authenticator app? The Supabase project owner can remove it
          for your account, and you can then set up a new one.
        </p>
        <button type="button" className="text-sm underline" onClick={() => void leave()} disabled={busy}>
          Sign out
        </button>
      </div>
    </div>
  );
}
