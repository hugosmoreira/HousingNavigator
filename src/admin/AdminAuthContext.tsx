/**
 * Admin auth state.
 *
 * Tracks the Supabase session for the current browser tab and a derived
 * `isAdmin` flag (true when the user has a row in `public.admin_users`,
 * confirmed via an RLS-gated lookup). All admin pages depend on
 * `isAdmin` being true; non-admin authenticated users get bounced to
 * the login page with an error.
 *
 * The flag is bound to the user it was verified for. A different user in
 * the same tab (another tab signed in, or a sign-out and sign-in) resets it
 * at once, and a slow lookup started for the previous user is discarded.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  isSupabaseConfigured,
  requireSupabase,
  supabaseUrl,
} from '../lib/supabaseClient';
import { resetAnalytics } from '../lib/analytics';
import {
  RemoteSignOutError,
  remoteRevokeIncomplete,
  signOutSafely,
} from '../lib/authSession';
import { AdminAccessTracker } from './adminAccessTracker';

interface AdminAuthValue {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  configured: boolean;
  /**
   * True when the signed-in user has not been verified yet and the last
   * admin lookup failed (network, timeout, server error). Guards show a
   * retry instead of "not an admin", because the answer is unknown.
   */
  adminCheckFailed: boolean;
  /**
   * Sign in with email + password and refresh the admin flag.
   * Resolves to `true` when the signed-in user is in `admin_users`,
   * `false` otherwise. Throws on auth failure (bad password, network,
   * timeout, etc.) with the original Supabase error preserved, or
   * `AdminVerificationError` when sign-in worked but the lookup failed.
   */
  signIn(email: string, password: string, captchaToken?: string): Promise<boolean>;
  signOut(): Promise<void>;
  refreshAdminFlag(): Promise<boolean>;
}

/** Sign-in succeeded, but admin membership could not be checked. */
export class AdminVerificationError extends Error {
  constructor(cause: unknown) {
    super('Signed in, but admin access could not be verified.');
    this.name = 'AdminVerificationError';
    (this as { cause?: unknown }).cause = cause;
  }
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

// Verbose `[admin-auth]` traces are useful while wiring up a new
// Supabase project but should not ship to production where they would
// leak email addresses and timing data into the browser console.
const IS_DEV = import.meta.env.DEV;
function debug(...args: unknown[]) {
  if (!IS_DEV) return;
  // eslint-disable-next-line no-console
  console.log('[admin-auth]', ...args);
}

const SIGN_IN_TIMEOUT_MS = 12_000;
const ADMIN_CHECK_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function checkIsAdmin(userId: string): Promise<boolean> {
  const supabase = await getSupabaseClient();
  if (!supabase) return false;
  const start = performance.now();
  debug('checkIsAdmin: querying admin_users');
  // RLS already limits admin_users to the caller's own row; filtering by the
  // user id as well ties the answer to the user we are asking about.
  const { data, error } = await withTimeout(
    supabase.from('admin_users').select('user_id').eq('user_id', userId).limit(1),
    ADMIN_CHECK_TIMEOUT_MS,
    'admin_users lookup',
  );
  const elapsed = Math.round(performance.now() - start);
  if (error) {
    debug('checkIsAdmin: error', { elapsed, code: error.code, message: error.message });
    throw new Error(
      `Admin lookup failed (${error.code ?? 'no-code'}): ${error.message}`,
    );
  }
  const ok = Array.isArray(data) && data.length > 0;
  debug('checkIsAdmin: ok', { elapsed, isAdmin: ok, rows: data?.length ?? 0 });
  return ok;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckFailed, setAdminCheckFailed] = useState(false);
  const [loading, setLoading] = useState(configured);
  const [tracker] = useState(() => new AdminAccessTracker());

  const applySession = useCallback((next: Session | null) => {
    // A different user resets the flag at once; a lookup still running for
    // the previous user is then ignored when it finishes.
    const reset = tracker.setUser(next?.user.id ?? null);
    if (reset) {
      setIsAdmin(reset.isAdmin);
      setAdminCheckFailed(reset.adminCheckFailed);
    }
    setSession(next);
  }, [tracker]);

  const refreshAdminFlag = useCallback(async (): Promise<boolean> => {
    const ticket = tracker.begin();
    if (!configured || !ticket) {
      setIsAdmin(false);
      return false;
    }
    try {
      const ok = await checkIsAdmin(ticket.userId);
      const snapshot = tracker.succeed(ticket, ok);
      if (!snapshot) return false;
      setIsAdmin(snapshot.isAdmin);
      setAdminCheckFailed(snapshot.adminCheckFailed);
      return snapshot.isAdmin;
    } catch (err) {
      // A user already verified keeps their last answer on a transient
      // failure (token refresh races, network blips). A user never verified
      // gets "could not verify", not "not an admin".
      const failure = tracker.fail(ticket);
      if (failure) setAdminCheckFailed(failure.adminCheckFailed);
      debug('refreshAdminFlag error', err);
      throw new AdminVerificationError(err);
    }
  }, [configured, tracker]);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | null = null;
    let eventSeen = false;

    const initialize = async () => {
      try {
        const supabase = await getSupabaseClient();
        if (!active || !supabase) return;

        supabase.auth
          .getSession()
          .then(async ({ data }) => {
            if (!active) return;
            // An auth event that already arrived is newer than this snapshot.
            if (!eventSeen) applySession(data.session);
            if (tracker.userId) {
              try {
                await refreshAdminFlag();
              } catch (err) {
                debug('initial refreshAdminFlag failed', err);
              }
            }
          })
          .catch((err) => {
            debug('getSession failed', err);
          })
          .finally(() => {
            if (active) setLoading(false);
          });

        const { data: subscription } = supabase.auth.onAuthStateChange(
          (event, nextSession) => {
            debug('auth state change', event, { hasSession: !!nextSession });
            if (!active) return;
            eventSeen = true;
            applySession(nextSession);
            if (event === 'SIGNED_OUT' || !nextSession) return;
            // Defer the RLS query until Supabase releases its auth lock.
            setTimeout(() => {
              void refreshAdminFlag().catch((err) => {
                debug('refreshAdminFlag (listener) failed', err);
              });
            }, 0);
          },
        );
        unsubscribe = () => subscription.subscription.unsubscribe();
      } catch (err) {
        debug('client initialization failed', err);
        if (active) setLoading(false);
      }
    };

    void initialize();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [configured, applySession, refreshAdminFlag, tracker]);

  const signIn = useCallback(
    async (email: string, password: string, captchaToken?: string): Promise<boolean> => {
      const supabase = await requireSupabase();
      const start = performance.now();
      debug('signIn: signInWithPassword start', { email });
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password,
          options: captchaToken ? { captchaToken } : undefined,
        }),
        SIGN_IN_TIMEOUT_MS,
        'signInWithPassword',
      );
      const elapsed = Math.round(performance.now() - start);
      if (error) {
        debug('signIn: error', {
          elapsed,
          status: (error as { status?: number }).status,
          code: (error as { code?: string }).code,
          message: error.message,
        });
        throw error;
      }
      debug('signIn: success', { elapsed, userId: data.session?.user.id });
      // The SIGNED_IN listener normally ran already; this is idempotent.
      applySession(data.session);
      return refreshAdminFlag();
    },
    [applySession, refreshAdminFlag],
  );

  const signOut = useCallback(async () => {
    debug('signOut: start');
    const accessToken = session?.access_token ?? null;
    // Clear local state first so the UI updates at once.
    applySession(null);
    resetAnalytics();
    const supabase = await getSupabaseClient().catch(() => null);
    if (!supabase || !supabaseUrl) return;
    // Removes the stored session before any network call (handoff AUTH-001),
    // so a failed request can no longer leave this browser signed in.
    const result = await signOutSafely(supabase, supabaseUrl, { accessToken });
    debug('signOut: done', result.remote);
    if (remoteRevokeIncomplete(result)) {
      throw new RemoteSignOutError(result.remote, result.error);
    }
  }, [applySession, session]);

  const value = useMemo<AdminAuthValue>(
    () => ({
      session,
      isAdmin,
      loading,
      configured,
      adminCheckFailed,
      signIn,
      signOut,
      refreshAdminFlag,
    }),
    [session, isAdmin, loading, configured, adminCheckFailed, signIn, signOut, refreshAdminFlag],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used inside <AdminAuthProvider>');
  }
  return ctx;
}
