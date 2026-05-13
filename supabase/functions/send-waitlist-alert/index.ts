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
// Failure modes (intentional graceful degradation — see plan):
//   * RESEND_API_KEY missing → returns sent_count=0, failed_count=N,
//     reason 'resend_not_configured'. DB state is not corrupted.
//   * Duplicate within 24h → returns { skipped: true } without sending.
//   * Zero eligible recipients → returns counts of zero, no Resend call.
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WaitlistStatus = 'open' | 'limited' | 'closed' | 'unknown';

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
}

// ---------------------------------------------------------------------------
// Transition rule (must match src/admin/notifyWaitlistAlert.ts).
// ---------------------------------------------------------------------------

const UPGRADE_FROM = new Set<WaitlistStatus>(['closed', 'unknown', 'limited']);
const UPGRADE_TO = new Set<WaitlistStatus>(['open', 'limited']);

function isMeaningfulUpgrade(prev: WaitlistStatus, next: WaitlistStatus): boolean {
  return prev !== next && UPGRADE_FROM.has(prev) && UPGRADE_TO.has(next);
}

const STATUS_LABEL: Record<WaitlistStatus, string> = {
  open: 'Open',
  limited: 'Limited',
  closed: 'Closed',
  unknown: 'Unknown',
};

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

function buildEmail(
  wl: WaitlistRow,
  prev: WaitlistStatus,
  next: WaitlistStatus,
  appUrl: string,
): { subject: string; html: string; text: string } {
  const subject = 'Housing Navigator Alert: A waitlist you follow was updated';
  const name = [wl.housing_authority, wl.program_name].filter(Boolean).join(' — ');
  const sourceLink = wl.application_link ?? wl.source_url ?? null;
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
): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
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

  // ---- AuthN: bearer token belongs to a real Supabase auth user --------
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
  const callerId = userData.user.id;

  // ---- AuthZ: caller must be in public.admin_users --------------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: adminRow, error: adminErr } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', callerId)
    .maybeSingle();
  if (adminErr) {
    return json({ error: 'admin lookup failed' }, 500);
  }
  if (!adminRow) {
    return json({ error: 'not admin' }, 403);
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

  // ---- Dedupe: skip if we already sent for this waitlist+status -----
  //              in the last 24 hours (covers re-saves & retries). The
  //              dry-run path skips this check so the modal can still
  //              show the subscriber count.
  if (!dry_run) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dupes } = await admin
      .from('notification_events')
      .select('id')
      .eq('event_type', 'waitlist_status_change')
      .gt('created_at', cutoff)
      .filter('metadata->>waitlist_id', 'eq', waitlist_id)
      .filter('metadata->>new_status', 'eq', new_status)
      .limit(1);
    if (dupes && dupes.length > 0) {
      return json({ skipped: true, reason: 'duplicate within 24h' });
    }
  }

  // ---- Load waitlist ---------------------------------------------------
  const { data: wlData, error: wlErr } = await admin
    .from('waitlists')
    .select(
      'id, housing_authority, program_name, county, city, state, status, application_link, source_url, last_checked, public_notes',
    )
    .eq('id', waitlist_id)
    .maybeSingle();
  if (wlErr) return json({ error: 'waitlist lookup failed' }, 500);
  if (!wlData) return json({ error: 'waitlist not found' }, 404);
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
    .select('id, email, display_name, email_notifications_enabled')
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

  // ---- Send + log ------------------------------------------------------
  const email = buildEmail(wl, previous_status, new_status, APP_URL);
  let sent = 0;
  let failed = 0;
  const successfulRecipientIds: string[] = [];

  for (const p of recipients) {
    try {
      const ok = await sendViaResend(
        RESEND_API_KEY,
        RESEND_FROM,
        p.email!,
        email.subject,
        email.html,
        email.text,
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

  // Log notification_events ONLY for successful sends. Failures stay out
  // so a future retry isn't blocked by the dedupe window.
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
    await admin.from('notification_events').insert(eventRows);
  }

  return json({
    subscriber_count: recipients.length,
    sent_count: sent,
    failed_count: failed,
    skipped: false,
  });
});
