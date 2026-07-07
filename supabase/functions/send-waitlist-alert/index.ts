// Supabase Edge Function — `send-waitlist-alert`
//
// Trigger path:
//   1. Admin saves a waitlist whose status moved into a "more open" state
//      (e.g. closed → open).
//   2. The frontend (src/admin/notifyWaitlistAlert.ts) POSTs here with
//      { waitlist_id, previous_status, new_status, dry_run? }.
//   3. This function verifies the caller is an admin, fans out emails via
//      Resend, and logs one notification_events row per recipient.
//
// Security:
//   * Resend API key + service-role key are read from env (never ship to
//     the browser bundle).
//   * Admin verification re-validates the caller's JWT against
//     public.admin_users. The service-role client is only used AFTER
//     that gate passes.
//
// Failure modes:
//   * RESEND_API_KEY missing → returns sent_count=0, failed_count=N,
//     reason 'resend_not_configured'. DB state is not corrupted.
//   * Duplicate within 24h → returns { skipped: true } without sending.
//     Dedupe is an ATOMIC claim (public.claim_waitlist_alert_send upsert on
//     a unique key, migration 0010) taken BEFORE any email goes out, so
//     concurrent invocations can never both send. If the claim RPC errors,
//     the function FAILS CLOSED (500, nothing sent) — never "assume no
//     duplicate and send anyway".
//   * Zero eligible recipients → returns counts of zero, no Resend call.
//   * Unpublished / unknown waitlist → 404, nothing sent (draft rows must
//     never leak by email, even if a stale subscription row points at them).
//
// Deploy:
//   supabase functions deploy send-waitlist-alert
//   supabase secrets set RESEND_API_KEY=...
//   supabase secrets set RESEND_FROM='Housing Navigator <noreply@your-domain>'
//   supabase secrets set APP_URL=https://your-prod-host

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="deno.ns" />

// @ts-expect-error — `npm:` and `https:` imports are Deno-only; tsc in
// the repo would otherwise complain. The function is bundled by
// `supabase functions deploy`, not by Vite.
import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-expect-error — Deno std http
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  isMeaningfulUpgrade,
  WAITLIST_STATUS_LABEL as STATUS_LABEL,
} from '../_shared/waitlistTransitions.ts';
import type { WaitlistStatus } from '../_shared/waitlistTransitions.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertPayload {
  waitlist_id: string;
  previous_status: WaitlistStatus;
  new_status: WaitlistStatus;
  dry_run?: boolean;
}

interface WaitlistRow {
  id: string;
  housing_authority: string;
  program_name: string | null;
  county: string;
  city: string | null;
  state: string | null;
  status: WaitlistStatus;
  application_link: string | null;
  source_url: string | null;
  last_checked: string | null;
  public_notes: string | null;
}

interface AlertRow {
  user_id: string;
  notify_on_open: boolean;
  notify_on_status_change: boolean;
}

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  email_notifications_enabled: boolean;
  unsubscribe_token: string | null;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// Email rendering
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only http(s) URLs may become clickable hrefs in emails — escaping alone
// would still let an admin-entered javascript: or data: URL through.
function safeHttpUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

// Constant-time secret comparison: hash both sides so neither length nor
// prefix matches leak through response timing.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

function buildEmail(
  wl: WaitlistRow,
  prev: WaitlistStatus,
  next: WaitlistStatus,
  appUrl: string,
  unsubscribeUrl: string | null,
): { subject: string; html: string; text: string } {
  const subject = 'Housing Navigator Alert: A waitlist you follow was updated';
  const name = [wl.housing_authority, wl.program_name].filter(Boolean).join(' — ');
  const sourceLink = safeHttpUrl(wl.application_link) ?? safeHttpUrl(wl.source_url);
  const lastChecked = wl.last_checked ?? 'not recorded';
  const dashboardUrl = `${appUrl.replace(/\/+$/, '')}/dashboard`;

  const text = [
    `Housing Navigator alert`,
    ``,
    `${name}`,
    `Status changed from ${STATUS_LABEL[prev]} to ${STATUS_LABEL[next]}.`,
    `Last checked: ${lastChecked}`,
    sourceLink ? `Apply / source: ${sourceLink}` : null,
    ``,
    `Please confirm current availability directly with the provider — listings can change without notice.`,
    ``,
    `Manage your alerts: ${dashboardUrl}`,
    unsubscribeUrl ? `Unsubscribe from all alert emails: ${unsubscribeUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1c1b1f;">
  <h2 style="margin: 0 0 12px;">Housing Navigator alert</h2>
  <p style="margin: 0 0 8px;"><strong>${escapeHtml(name)}</strong></p>
  <p style="margin: 0 0 16px;">Status changed from <strong>${STATUS_LABEL[prev]}</strong> to <strong style="color:#1d4ed8;">${STATUS_LABEL[next]}</strong>.</p>
  <p style="margin: 0 0 8px; color: #545458;">Last checked: ${escapeHtml(lastChecked)}</p>
  ${sourceLink ? `<p style="margin: 0 0 16px;"><a href="${escapeHtml(sourceLink)}" style="color:#1d4ed8;">Apply / view official source →</a></p>` : ''}
  <p style="margin: 16px 0; padding: 12px; background:#f4f4f6; border-radius:8px; font-size: 13px; color:#545458;">
    Availability can change without notice. Please confirm current access with the provider before traveling or submitting an application.
  </p>
  <p style="margin: 0; font-size: 13px;">
    <a href="${escapeHtml(dashboardUrl)}" style="color:#1d4ed8;">Manage your alerts on Housing Navigator</a>
  </p>
  ${unsubscribeUrl ? `<p style="margin: 12px 0 0; font-size: 12px; color:#8a8a8f;">
    <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8a8a8f;">Unsubscribe from all alert emails</a>
  </p>` : ''}
</body></html>`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Resend HTTP send (no SDK dependency). Returns true on 2xx.
// ---------------------------------------------------------------------------

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string,
  unsubscribeUrl: string | null,
): Promise<boolean> {
  // RFC 8058 one-click unsubscribe headers — Gmail/Yahoo bulk-sender
  // requirements; also protects the sending domain's reputation.
  const headers = unsubscribeUrl
    ? {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
    : undefined;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text, headers }),
  });
  if (!res.ok) {
    // Drain the body to free the connection but don't fail the whole batch.
    await res.text().catch(() => '');
  }
  return res.ok;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  // @ts-expect-error — Deno-only global
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  // @ts-expect-error — Deno-only global
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // @ts-expect-error — Deno-only global
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  // @ts-expect-error — Deno-only global
  const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Housing Navigator <onboarding@resend.dev>';
  // @ts-expect-error — Deno-only global
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://housing-navigator.local';

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'server misconfigured (missing supabase env)' }, 500);
  }

  // ---- AuthN / AuthZ ---------------------------------------------------
  // Two callers are allowed:
  //   1. An admin from the CMS — verified via their JWT against
  //      public.admin_users (the user-facing path).
  //   2. An internal server-to-server call from the DB status-change
  //      trigger (migration 0009 `on_waitlist_status_change`), which carries
  //      a shared secret in the `x-internal-secret` header. The secret lives
  //      only in the function env (INTERNAL_TRIGGER_SECRET) + Vault, never in
  //      the browser. It is checked FIRST so the trigger needs no user JWT.
  //      The function is deployed with --no-verify-jwt, so THIS block is the
  //      sole authorization gate.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // @ts-expect-error — Deno-only global
  const INTERNAL_TRIGGER_SECRET = Deno.env.get('INTERNAL_TRIGGER_SECRET');
  const headerSecret = req.headers.get('x-internal-secret');
  const isInternal =
    !!INTERNAL_TRIGGER_SECRET &&
    !!headerSecret &&
    (await timingSafeEqual(headerSecret, INTERNAL_TRIGGER_SECRET));

  let adminUserId: string | null = null;
  if (!isInternal) {
    const authz = req.headers.get('authorization') ?? '';
    const token = authz.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'missing bearer token' }, 401);

    const userClient = createClient(SUPABASE_URL, token, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: 'unauthorized' }, 401);
    }
    const { data: adminRow, error: adminErr } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (adminErr) {
      return json({ error: 'admin lookup failed' }, 500);
    }
    if (!adminRow) {
      return json({ error: 'not admin' }, 403);
    }
    adminUserId = userData.user.id;
  }

  // ---- Parse + validate body ------------------------------------------
  let body: AlertPayload;
  try {
    body = (await req.json()) as AlertPayload;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  const { waitlist_id, previous_status, new_status, dry_run } = body;
  if (!waitlist_id || !previous_status || !new_status) {
    return json({ error: 'waitlist_id, previous_status, new_status are required' }, 400);
  }
  if (!isMeaningfulUpgrade(previous_status, new_status)) {
    return json({ error: 'transition is not eligible for notification' }, 400);
  }

  // ---- Rate limit the admin-JWT path (migration 0011) -------------------
  // Caps real (non-dry-run) fan-outs per admin per hour so a compromised
  // admin token can't blast subscribers. Internal trigger calls are exempt:
  // they're gated by the shared secret + the atomic dedupe claim. Fails
  // CLOSED — if the ledger can't be read or written, nothing is sent.
  const ADMIN_SENDS_PER_HOUR = 10;
  if (adminUserId && !dry_run) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: rateErr } = await admin
      .from('alert_invocations')
      .select('id', { count: 'exact', head: true })
      .eq('admin_user_id', adminUserId)
      .gt('invoked_at', hourAgo);
    if (rateErr) {
      console.error(`[send-waitlist-alert] rate-limit lookup failed: ${rateErr.message}`);
      return json({ error: 'rate limit check failed; nothing sent' }, 500);
    }
    if ((count ?? 0) >= ADMIN_SENDS_PER_HOUR) {
      return json({ error: 'rate limit exceeded; try again later' }, 429);
    }
    const { error: recordErr } = await admin
      .from('alert_invocations')
      .insert({ admin_user_id: adminUserId });
    if (recordErr) {
      console.error(`[send-waitlist-alert] rate-limit record failed: ${recordErr.message}`);
      return json({ error: 'rate limit check failed; nothing sent' }, 500);
    }
  }

  // ---- Load waitlist ---------------------------------------------------
  // published = true is REQUIRED: subscriptions are RLS-gated to published
  // waitlists (migration 0010), but a row could have been unpublished after
  // someone followed it, and this function must never email draft details.
  const { data: wlData, error: wlErr } = await admin
    .from('waitlists')
    .select(
      'id, housing_authority, program_name, county, city, state, status, application_link, source_url, last_checked, public_notes',
    )
    .eq('id', waitlist_id)
    .eq('published', true)
    .maybeSingle();
  if (wlErr) return json({ error: 'waitlist lookup failed' }, 500);
  if (!wlData) return json({ error: 'waitlist not found or not published' }, 404);
  const wl = wlData as WaitlistRow;

  // ---- Load subscribers + their prefs ----------------------------------
  const { data: alertsData, error: alertsErr } = await admin
    .from('waitlist_alerts')
    .select('user_id, notify_on_open, notify_on_status_change')
    .eq('waitlist_id', waitlist_id);
  if (alertsErr) return json({ error: 'alerts lookup failed' }, 500);
  const alerts = (alertsData ?? []) as AlertRow[];

  // Route per pref: any alert receives email if EITHER
  //   (a) new_status === 'open' AND notify_on_open
  //   (b) notify_on_status_change (covers all meaningful transitions).
  const candidateIds = new Set<string>();
  for (const a of alerts) {
    if (new_status === 'open' && a.notify_on_open) candidateIds.add(a.user_id);
    if (a.notify_on_status_change) candidateIds.add(a.user_id);
  }

  if (candidateIds.size === 0) {
    return json({ subscriber_count: 0, sent_count: 0, failed_count: 0 });
  }

  // ---- Load profiles (email + master opt-out) --------------------------
  const { data: profilesData, error: profilesErr } = await admin
    .from('profiles')
    .select('id, email, display_name, email_notifications_enabled, unsubscribe_token')
    .in('id', Array.from(candidateIds));
  if (profilesErr) return json({ error: 'profile lookup failed' }, 500);
  const profiles = (profilesData ?? []) as ProfileRow[];

  const recipients = profiles.filter(
    (p) => !!p.email && p.email_notifications_enabled !== false,
  );

  if (dry_run) {
    return json({ subscriber_count: recipients.length, would_send: recipients.length });
  }

  if (!RESEND_API_KEY) {
    // Be honest with the operator instead of silently logging events for
    // emails that never went out.
    return json({
      subscriber_count: recipients.length,
      sent_count: 0,
      failed_count: recipients.length,
      reason: 'resend_not_configured',
    });
  }

  // ---- Dedupe: atomically claim this (waitlist, new_status) send --------
  // claim_waitlist_alert_send (migration 0010) upserts into a unique-keyed
  // server-only table: exactly one caller per 24h window gets `true`.
  // Claimed AFTER the cheap read-only checks (so a dry run / zero-recipient
  // call never burns the window) but BEFORE any email, so two overlapping
  // invocations — admin double-click, trigger + manual, retries — can never
  // both fan out. If the database can't confirm the claim, FAIL CLOSED:
  // better a delayed alert than a duplicate blast.
  const { data: claimed, error: claimErr } = await admin.rpc(
    'claim_waitlist_alert_send',
    { p_waitlist_id: waitlist_id, p_new_status: new_status },
  );
  if (claimErr) {
    console.error(
      `[send-waitlist-alert] dedupe claim failed for waitlist=${waitlist_id} status=${new_status}: ${claimErr.message}`,
    );
    return json({ error: 'dedupe check failed; nothing sent' }, 500);
  }
  if (claimed !== true) {
    return json({ skipped: true, reason: 'duplicate within 24h' });
  }

  // ---- Send + log ------------------------------------------------------
  // Emails are built per recipient: each carries that user's own one-click
  // unsubscribe link (profiles.unsubscribe_token → unsubscribe-alerts fn).
  let sent = 0;
  let failed = 0;
  const successfulRecipientIds: string[] = [];

  for (const p of recipients) {
    try {
      const unsubscribeUrl = p.unsubscribe_token
        ? `${SUPABASE_URL}/functions/v1/unsubscribe-alerts?token=${p.unsubscribe_token}`
        : null;
      const email = buildEmail(wl, previous_status, new_status, APP_URL, unsubscribeUrl);
      const ok = await sendViaResend(
        RESEND_API_KEY,
        RESEND_FROM,
        p.email!,
        email.subject,
        email.html,
        email.text,
        unsubscribeUrl,
      );
      if (ok) {
        sent += 1;
        successfulRecipientIds.push(p.id);
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  // If EVERY send failed (Resend outage etc.), release the claim so a retry
  // can go out once the outage clears — nothing was delivered, so there is
  // no duplicate risk. Best effort: if the delete itself fails the claim
  // simply expires after 24h.
  if (sent === 0 && failed > 0) {
    const { error: releaseErr } = await admin
      .from('waitlist_alert_sends')
      .delete()
      .eq('waitlist_id', waitlist_id)
      .eq('new_status', new_status);
    if (releaseErr) {
      console.error(
        `[send-waitlist-alert] could not release claim after total send failure for waitlist=${waitlist_id}: ${releaseErr.message}`,
      );
    }
    return json({
      subscriber_count: recipients.length,
      sent_count: 0,
      failed_count: failed,
      skipped: false,
      reason: 'all_sends_failed',
    });
  }

  // Log notification_events ONLY for successful sends (in-app history).
  // Dedupe no longer depends on this table — the claim above already
  // guards the window — so an insert failure here can't cause a duplicate
  // blast, but it must not pass silently either: log it and tell the
  // caller the audit trail is incomplete.
  let auditLogged = true;
  if (successfulRecipientIds.length > 0) {
    const eventRows = successfulRecipientIds.map((uid) => ({
      user_id: uid,
      event_type: 'waitlist_status_change',
      title: `Housing Navigator alert: ${wl.housing_authority}`,
      body: `Status changed from ${STATUS_LABEL[previous_status]} to ${STATUS_LABEL[new_status]}.`,
      metadata: {
        waitlist_id,
        previous_status,
        new_status,
      },
    }));
    const { error: auditErr } = await admin
      .from('notification_events')
      .insert(eventRows);
    if (auditErr) {
      auditLogged = false;
      console.error(
        `[send-waitlist-alert] notification_events insert failed for waitlist=${waitlist_id} (${eventRows.length} rows): ${auditErr.message}`,
      );
    }
  }

  return json({
    subscriber_count: recipients.length,
    sent_count: sent,
    failed_count: failed,
    skipped: false,
    audit_logged: auditLogged,
  });
});
