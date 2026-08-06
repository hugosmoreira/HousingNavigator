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

// The prerender bundle runs in Node and must stay deterministic: it renders
// the public bundled snapshot and never needs auth, realtime, or a WebSocket.
// Vite replaces import.meta.env.SSR at build time, so the browser bundle keeps
// the existing Supabase behavior while the server bundle avoids initializing
// browser-only transports.
if (!import.meta.env.SSR && url && anonKey) {
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // PKCE instead of the implicit flow: auth links carry a one-time
      // ?code= that only completes with the code_verifier this browser
      // stored when the flow started. A crafted URL pasted to a victim can
      // no longer install an attacker's session (login-CSRF / session
      // fixation — Codex finding 4). Trade-off: email links (confirm,
      // recovery) must be opened in the browser that requested them.
      flowType: 'pkce',
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
  // Configuration state must be identical during prerendering and the first
  // browser render so auth-aware navigation hydrates without changing shape.
  // The actual client remains browser-only above.
  return Boolean(url && anonKey);
}
