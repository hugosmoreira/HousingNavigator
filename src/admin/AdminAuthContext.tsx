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
   * `false` otherwise. Throws on auth failure (bad password, etc.).
   */
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
  refreshAdminFlag(): Promise<boolean>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

async function checkIsAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .limit(1);
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
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
    const ok = await checkIsAdmin();
    setIsAdmin(ok);
    return ok;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await refreshAdminFlag();
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession) {
          await refreshAdminFlag();
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return refreshAdminFlag();
    },
    [refreshAdminFlag],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setIsAdmin(false);
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
