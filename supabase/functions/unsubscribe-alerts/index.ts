// Supabase Edge Function — `unsubscribe-alerts`
//
// One-click email unsubscribe target. Every alert email carries
//   * a footer link:            GET  /unsubscribe-alerts?token=<uuid>
//   * List-Unsubscribe headers: POST /unsubscribe-alerts?token=<uuid>
//     (RFC 8058 one-click, sent by mail clients on the user's behalf)
//
// The token is profiles.unsubscribe_token (migration 0011): a per-user
// random uuid that grants exactly one capability — turning that user's own
// email_notifications_enabled off. It cannot read data, re-enable alerts,
// or touch any other account, so a leaked link is at worst a self-DoS on
// one inbox. Re-enabling is done signed-in from the dashboard.
//
// Security:
//   * Deployed with --no-verify-jwt: mail clients and email links carry no
//     Authorization header. The token IS the authorization.
//   * Responses are identical for unknown vs. known tokens (no account
//     enumeration); only a malformed token gets a 400.
//   * Service-role key stays server-side; errors are logged without it.
//
// Deploy:
//   supabase functions deploy unsubscribe-alerts --no-verify-jwt

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="deno.ns" />

// @ts-expect-error — `npm:` imports are Deno-only; bundled by supabase CLI.
import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-expect-error — Deno std http
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function htmlPage(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Housing Navigator</title></head>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 15vh auto 0; padding: 0 24px; color: #1c1b1f; text-align: center;">
  <h2 style="margin: 0 0 12px;">${title}</h2>
  <p style="color: #545458; line-height: 1.5;">${body}</p>
</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

serve(async (req: Request) => {
  // GET = human clicking the footer link; POST = RFC 8058 one-click from
  // the mail client. Both do the same thing.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // @ts-expect-error — Deno-only global
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  // @ts-expect-error — Deno-only global
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return htmlPage('Something went wrong', 'The server is misconfigured. Please try again later.', 500);
  }

  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!UUID_RE.test(token)) {
    return htmlPage(
      'Invalid link',
      'This unsubscribe link is malformed. Use the link from a recent Housing Navigator email, or manage alerts from your dashboard.',
      400,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin
    .from('profiles')
    .update({ email_notifications_enabled: false })
    .eq('unsubscribe_token', token);

  if (error) {
    console.error(`[unsubscribe-alerts] profile update failed: ${error.message}`);
    return htmlPage('Something went wrong', 'We could not process this right now. Please try again later.', 500);
  }

  // Deliberately identical whether or not the token matched a profile.
  if (req.method === 'POST') {
    return new Response(null, { status: 200 });
  }
  return htmlPage(
    'Email alerts turned off',
    'You will no longer receive waitlist alert emails from Housing Navigator. You can turn alerts back on any time from your dashboard notification settings.',
  );
});
