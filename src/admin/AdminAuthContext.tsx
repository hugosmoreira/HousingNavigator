/**
 * Admin auth state.
 *
 * Tracks the Supabase session for the current browser tab and a derived
 * `isAdmin` flag (true when the user has a row in `public.admin_users`,
 * confirmed via an RLS-gated lookup). All admin pages depend on
 * `isAdmin` being true; non-admin authenticated users get bounced to
 * the login page with an error.
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
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

interface AdminAuthValue {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  configured: boolean;
  /**
   * Sign in with email + password and refresh the admin flag.
   * Resolves to `true` when the signed-in user is in `admin_users`,
   * `false` otherwise. Throws on auth failure (bad password, network,
   * timeout, etc.) with the original Supabase error preserved.
   */
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
  refreshAdminFlag(): Promise<boolean>;
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
const SIGN_OUT_TIMEOUT_MS = 6_000;

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

async function checkIsAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const start = performance.now();
  debug('checkIsAdmin: querying admin_users');
  const { data, error } = await withTimeout(
    supabase.from('admin_users').select('user_id').limit(1),
    ADMIN_CHECK_TIMEOUT_MS,
    'admin_users lookup',
  );
  const elapsed = Math.round(performance.now() - start);
  if (error) {
    debug('checkIsAdmin: error', { elapsed, code: error.code, message: error.message });
    // Surface the failure instead of silently returning false. The login
    // path treats a thrown error as "could not verify admin status" and
    // shows it to the user, which is much more debuggable than a stuck
    // spinner.
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
  const [loading, setLoading] = useState(configured);

  const refreshAdminFlag = useCallback(async (): Promise<boolean> => {
    if (!supabase) {
      setIsAdmin(false);
      return false;
    }
    try {
      const ok = await checkIsAdmin();
      setIsAdmin(ok);
      return ok;
    } catch (err) {
      // Bubble up so the login form can display the reason. Local state
      // stays consistent (not admin) until the next successful check.
      setIsAdmin(false);
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        if (data.session) {
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
      async (event, nextSession) => {
        debug('auth state change', event, { hasSession: !!nextSession });
        setSession(nextSession);
        if (nextSession) {
          try {
            await refreshAdminFlag();
          } catch (err) {
            debug('refreshAdminFlag (listener) failed', err);
          }
        } else {
          setIsAdmin(false);
        }
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshAdminFlag]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!supabase) throw new Error('Supabase not configured');
      const start = performance.now();
      debug('signIn: signInWithPassword start', { email });
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
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
      return refreshAdminFlag();
    },
    [refreshAdminFlag],
  );

  const signOut = useCallback(async () => {
    debug('signOut: start');
    // Always clear local state first so the UI updates even if the
    // remote call hangs or fails. Supabase's listener will fire later
    // and reaffirm.
    setIsAdmin(false);
    setSession(null);
    if (!supabase) return;
    try {
      await withTimeout(supabase.auth.signOut(), SIGN_OUT_TIMEOUT_MS, 'signOut');
      debug('signOut: success');
    } catch (err) {
      debug('signOut: error (local state already cleared)', err);
      // Re-throw so the layout can surface a toast, but local session
      // is already gone — the user will land on /admin/login either way.
      throw err;
    }
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({ session, isAdmin, loading, configured, signIn, signOut, refreshAdminFlag }),
    [session, isAdmin, loading, configured, signIn, signOut, refreshAdminFlag],
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
