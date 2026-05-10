/**
 * Public visitor auth state.
 *
 * Mirrors `AdminAuthContext` in shape but lives at a different URL surface
 * (`/login`, `/signup`, `/dashboard`) and is gated by a row in
 * `public.profiles` rather than `public.admin_users`.
 *
 * Supabase has one auth session per browser tab — both this context and
 * `AdminAuthContext` subscribe to the same `supabase.auth` events. They do
 * not interfere: the admin context derives `isAdmin` from `admin_users`
 * and this context derives `profile` / `isAuthed` from `profiles`. A user
 * who is both will simply have rows in both tables.
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

export interface PublicProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  home_county: string | null;
  email_notifications_enabled: boolean;
}

interface PublicAuthValue {
  session: Session | null;
  profile: PublicProfile | null;
  /** True when there is a session AND a `profiles` row for it. */
  isAuthed: boolean;
  loading: boolean;
  configured: boolean;
  /** Sign in with email + password. Throws on auth failure. */
  signIn(email: string, password: string): Promise<void>;
  /**
   * Create an account. Resolves once Supabase Auth has accepted the
   * credentials; the `profiles` row is auto-created by an `on auth.users
   * insert` trigger (see migration 0004). When email confirmation is
   * required, `session` will stay null until the user confirms — the
   * caller should surface that.
   */
  signUp(
    email: string,
    password: string,
    metadata?: { display_name?: string; home_county?: string },
  ): Promise<{ requiresConfirmation: boolean }>;
  signOut(): Promise<void>;
  /** Re-fetch the profile row (after dashboard updates, etc). */
  refreshProfile(): Promise<void>;
}

const PublicAuthContext = createContext<PublicAuthValue | null>(null);

const SIGN_IN_TIMEOUT_MS = 12_000;
const SIGN_UP_TIMEOUT_MS = 15_000;
const PROFILE_TIMEOUT_MS = 8_000;
const SIGN_OUT_TIMEOUT_MS = 6_000;

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function fetchProfile(userId: string): Promise<PublicProfile | null> {
  if (!supabase) return null;
  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .select('id, email, display_name, home_county, email_notifications_enabled')
      .eq('id', userId)
      .maybeSingle(),
    PROFILE_TIMEOUT_MS,
    'profile lookup',
  );
  if (error) {
    // RLS or transient — surface to the caller via console; don't crash
    // the app. Treat as "no profile" so the dashboard can redirect.
    // eslint-disable-next-line no-console
    console.warn('[public-auth] profile fetch failed', error);
    return null;
  }
  return (data ?? null) as PublicProfile | null;
}

export function PublicAuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(configured);

  const refreshProfile = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) {
      setProfile(null);
      return;
    }
    setProfile(await fetchProfile(uid));
  }, [session]);

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
          setProfile(await fetchProfile(data.session.user.id));
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[public-auth] getSession failed', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession) {
          setProfile(await fetchProfile(nextSession.user.id));
        } else {
          setProfile(null);
        }
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      SIGN_IN_TIMEOUT_MS,
      'signInWithPassword',
    );
    if (error) throw error;
  }, []);

  const signUp = useCallback<PublicAuthValue['signUp']>(
    async (email, password, metadata) => {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: metadata ? { data: metadata } : undefined,
        }),
        SIGN_UP_TIMEOUT_MS,
        'signUp',
      );
      if (error) throw error;
      // Email-confirmation projects: signUp returns a user but no session
      // until the link is clicked. UI uses this to show a "check your inbox"
      // message instead of redirecting to /dashboard.
      const requiresConfirmation = !data.session;
      return { requiresConfirmation };
    },
    [],
  );

  const signOut = useCallback(async () => {
    setProfile(null);
    setSession(null);
    if (!supabase) return;
    try {
      await withTimeout(supabase.auth.signOut(), SIGN_OUT_TIMEOUT_MS, 'signOut');
    } catch (err) {
      // Local state is already cleared; surface the failure but don't
      // strand the UI in a half-signed-out state.
      // eslint-disable-next-line no-console
      console.warn('[public-auth] signOut error', err);
      throw err;
    }
  }, []);

  const value = useMemo<PublicAuthValue>(
    () => ({
      session,
      profile,
      isAuthed: !!session && !!profile,
      loading,
      configured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, configured, signIn, signUp, signOut, refreshProfile],
  );

  return <PublicAuthContext.Provider value={value}>{children}</PublicAuthContext.Provider>;
}

export function usePublicAuth(): PublicAuthValue {
  const ctx = useContext(PublicAuthContext);
  if (!ctx) {
    throw new Error('usePublicAuth must be used inside <PublicAuthProvider>');
  }
  return ctx;
}
