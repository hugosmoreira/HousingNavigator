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

import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Load the browser client only when an authenticated/data feature needs it.
 * Public prerendered pages can hydrate without downloading Supabase first.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (import.meta.env.SSR || !url || !anonKey) return null;
  if (client) return client;
  if (clientPromise) return clientPromise;

  clientPromise = import('@supabase/supabase-js')
    .then(({ createClient }) => {
      client = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // PKCE instead of the implicit flow: auth links carry a one-time
          // ?code= that only completes with the code_verifier this browser
          // stored when the flow started. A crafted URL pasted to a victim can
          // no longer install an attacker's session (login-CSRF / session
          // fixation). Email links must be opened in the requesting browser.
          flowType: 'pkce',
        },
      });
      return client;
    })
    .catch((error) => {
      // Permit a later retry after a transient chunk/network failure.
      clientPromise = null;
      throw error;
    });

  return clientPromise;
}

export async function requireSupabase(): Promise<SupabaseClient> {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error(
      'Supabase client not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  // Configuration state must be identical during prerendering and the first
  // browser render so auth-aware navigation hydrates without changing shape.
  // The actual client remains browser-only above.
  return Boolean(url && anonKey);
}
