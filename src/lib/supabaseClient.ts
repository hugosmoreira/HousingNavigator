/**
 * Browser Supabase client.
 *
 * Used by both the public site (anon reads of `published = true` rows)
 * and the admin SPA (authenticated reads/writes via RLS). The same anon
 * key is safe in both cases — admin policies are gated on `auth.uid()`
 * matching `public.admin_users`, never on the key itself.
 *
 * Returns `null` when env vars are missing so the static fallback path
 * in `services/data/index.ts` keeps working for contributors without a
 * Supabase project.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

if (url && anonKey) {
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = client;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase client not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
