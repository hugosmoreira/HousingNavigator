// Supabase Edge Function — `geocode-address`
//
// Admin-only address lookup behind the property form's "Find on map" button.
// The Census Bureau geocoder sends no CORS headers, so the browser cannot call
// it directly. Each click sends one request to that fixed host. The function
// writes nothing: the administrator reviews the match and saves the form,
// where RLS and the 0029 location check apply as usual.
//
// Deploy with JWT verification disabled because this function validates the
// administrator's JWT itself (the same pattern as admin-users):
//   supabase functions deploy geocode-address --no-verify-jwt

/// <reference lib="deno.ns" />
// @ts-expect-error Deno resolves npm specifiers.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  censusLookupUrl,
  firstCensusMatch,
  insideLocationBounds,
  oneLineAddress,
  parseAddressLookup,
  type AddressLookupResponse,
} from '../_shared/addressGeocoding.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: AddressLookupResponse | { error: string }, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Address lookup is not configured.' }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in required.' }, 401);
  const { data: user, error: userError } = await admin.auth.getUser(token);
  if (userError || !user?.user) return json({ error: 'Sign in required.' }, 401);
  const { data: member, error: memberError } = await admin.from('admin_users').select('user_id')
    .eq('user_id', user.user.id).maybeSingle();
  if (memberError) return json({ error: 'Admin access could not be checked.' }, 503);
  if (!member) return json({ error: 'Admin access required.' }, 403);

  let lookup = null;
  try {
    lookup = parseAddressLookup(await request.json());
  } catch {
    // Not JSON; answered below.
  }
  if (!lookup) {
    return json({ error: 'Supply a street address, city, state (OR or WA) and, optionally, a ZIP code.' }, 400);
  }

  let body: unknown;
  try {
    const response = await fetch(censusLookupUrl(lookup), {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HousingNavigatorGeocoder/1.0 (+https://housingnavigator.us; admin-requested)',
      },
    });
    if (!response.ok) throw new Error(`Census geocoder returned ${response.status}.`);
    body = await response.json();
  } catch {
    return json({ error: 'The Census geocoder did not answer. Try again, or enter the coordinates by hand.' }, 502);
  }

  let match;
  try {
    match = firstCensusMatch(body, oneLineAddress(lookup));
  } catch {
    return json({ error: 'The Census geocoder sent an unexpected answer. Enter the coordinates by hand.' }, 502);
  }
  if (!match) {
    return json({
      match: null,
      message: 'The Census geocoder found no match. Check the address, or enter the coordinates by hand.',
    });
  }
  if (!insideLocationBounds(match.latitude, match.longitude)) {
    return json({
      match: null,
      message: `The Census match (${match.matched_address}) is outside Oregon and Washington.`,
    });
  }
  return json({ match });
});
