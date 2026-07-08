// Supabase Edge Function — `check-waitlist-status`
//
// The automated half of the waitlist tracker (migration 0012). On a cron
// tick (or an admin's "check now"), it re-verifies waitlist statuses against
// each row's own source URL:
//
//   1. Pick the rows most overdue for a check (auto_check_enabled, published,
//      has a URL, last attempt > CHECK_INTERVAL_HOURS ago).
//   2. Fetch the page politely (honest User-Agent, 15s timeout, size cap).
//   3. Classify the text with Claude (structured output: status, confidence
//      0..1, and a verbatim evidence quote from the page).
//   4. SUGGEST MODE — never auto-publish:
//        * detected == recorded  -> bump last_checked (freshness for free),
//          reset failure counter, supersede any stale pending suggestion.
//        * detected != recorded  -> upsert ONE pending row in
//          waitlist_status_suggestions for a human to approve in
//          /admin/review. Approval (RPC in 0012) applies the status change,
//          which fires the existing alert pipeline (0009/0010) untouched.
//        * unsure / unreadable   -> log only.
//   5. Every attempt is recorded in waitlist_status_checks; consecutive
//      fetch failures increment waitlists.check_failures so broken URLs
//      surface in the admin UI.
//   6. If new suggestions appeared, email the admins a review nudge.
//
// Security:
//   * Two callers: the DB cron function (x-internal-secret, compared in
//     constant time) or an admin JWT re-validated against admin_users.
//     Deployed with --no-verify-jwt, so this block is the only gate.
//   * The classifier only ever reads PUBLIC web pages the admin already
//     entered as source_url; nothing user-generated reaches the model.
//
// Failure modes:
//   * Missing ANTHROPIC_API_KEY -> every row logs classify_failed; nothing
//     is suggested and nothing breaks.
//   * Fetch/model errors affect only that row's log entry.
//   * The function never edits waitlists.status directly — only last_checked
//     and health counters. Status changes go through human review.
//
// Deploy:
//   supabase functions deploy check-waitlist-status --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=...
//   supabase secrets set CLAUDE_MODEL=claude-opus-4-8        # optional
//   (INTERNAL_TRIGGER_SECRET, APP_URL, RESEND_* are shared with
//   send-waitlist-alert; see migration 0012 header for the Vault URL.)

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="deno.ns" />

// @ts-expect-error — `npm:` imports are Deno-only; bundled by supabase CLI.
import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-expect-error — `npm:` imports are Deno-only; bundled by supabase CLI.
import Anthropic from 'npm:@anthropic-ai/sdk';
// @ts-expect-error — Deno std http
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import type { WaitlistStatus } from '../_shared/waitlistTransitions.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckableWaitlist {
  id: string;
  housing_authority: string;
  program_name: string | null;
  status: WaitlistStatus;
  source_url: string | null;
  application_link: string | null;
  check_failures: number;
}

interface Classification {
  status: WaitlistStatus;
  confidence: number;
  evidence: string;
}

type CheckAction =
  | 'confirmed'
  | 'suggested'
  | 'uncertain'
  | 'insufficient_content'
  | 'fetch_failed'
  | 'classify_failed';

// Tunables. Confidence gates are deliberately conservative: a wrong "open"
// suggestion wastes admin attention, so unsure results are logged, not queued.
const CHECK_INTERVAL_HOURS = 20; // each row re-checked roughly daily
const BATCH_SIZE = Number(Deno.env.get('CHECK_BATCH_SIZE') ?? '10');
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_CHARS = 12_000; // ~3k tokens of page text for the classifier
const MIN_PAGE_CHARS = 300; // below this the page is likely JS-rendered
const CONFIRM_MIN_CONFIDENCE = 0.6;
const SUGGEST_MIN_CONFIDENCE = 0.5;
const CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Helpers
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

// Constant-time secret comparison (same rationale as send-waitlist-alert).
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

function safeHttpUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

// Crude but dependency-free HTML -> text. Good enough for classification:
// the model tolerates leftover noise far better than a fetch tolerates a
// heavyweight parser dependency in an edge runtime.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

async function fetchPageText(url: string, appUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': `HousingNavigatorStatusBot/1.0 (+${appUrl}; automated waitlist status verification)`,
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const length = Number(res.headers.get('content-length') ?? '0');
    if (length > 3_000_000) {
      throw new Error(`page too large (${length} bytes)`);
    }
    const html = await res.text();
    return htmlToText(html).slice(0, MAX_PAGE_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Classification via the Claude API (structured output)
// ---------------------------------------------------------------------------

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['open', 'closed', 'limited', 'unknown'],
      description:
        'open = actively accepting applications; closed = not accepting; ' +
        'limited = accepting only for specific groups, preferences, or a lottery; ' +
        'unknown = the page does not say.',
    },
    confidence: {
      type: 'number',
      description:
        'How certain the page supports the status, from 0 (guess) to 1 ' +
        '(the page states it explicitly).',
    },
    evidence: {
      type: 'string',
      description:
        'Verbatim quote from the page text that supports the status. ' +
        'Empty string if there is no supporting text.',
    },
  },
  required: ['status', 'confidence', 'evidence'],
  additionalProperties: false,
} as const;

async function classifyPage(
  anthropic: Anthropic,
  model: string,
  wl: CheckableWaitlist,
  pageText: string,
): Promise<Classification> {
  const program = wl.program_name ? ` — program: "${wl.program_name}"` : '';
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system:
      'You verify housing waitlist statuses for a housing-assistance directory. ' +
      'You are given the text of a housing authority web page and the name of one ' +
      'waiting list. Decide, from the page text alone, whether THAT waiting list is ' +
      'currently open, closed, limited, or unknown. If the page covers multiple ' +
      'programs, judge only the named one. Dates matter: an announcement that a ' +
      'list "will open" on a future date means it is not open yet; a past opening ' +
      'window that has ended means closed. Never infer beyond what the page says — ' +
      'when the page gives no clear signal, answer unknown with low confidence.',
    messages: [
      {
        role: 'user',
        content: `Waiting list to verify: "${wl.housing_authority}"${program}\n\nPage text:\n${pageText}`,
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: CLASSIFICATION_SCHEMA },
    },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('classifier refused the request');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('classifier output truncated');
  }
  const textBlock = response.content.find(
    (b: { type: string }) => b.type === 'text',
  ) as { text: string } | undefined;
  if (!textBlock) {
    throw new Error('classifier returned no text block');
  }
  const parsed = JSON.parse(textBlock.text) as Classification;
  return {
    status: parsed.status,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    evidence: String(parsed.evidence ?? '').slice(0, 1000),
  };
}

// ---------------------------------------------------------------------------
// Per-waitlist check
// ---------------------------------------------------------------------------

interface CheckOutcome {
  waitlistId: string;
  action: CheckAction;
  newSuggestion: boolean;
}

async function checkOne(
  admin: ReturnType<typeof createClient>,
  anthropic: Anthropic | null,
  model: string,
  appUrl: string,
  wl: CheckableWaitlist,
): Promise<CheckOutcome> {
  const url = safeHttpUrl(wl.source_url) ?? safeHttpUrl(wl.application_link);
  const now = new Date().toISOString();

  // Every attempt moves the scheduling cursor, so a failing row cannot
  // monopolize the batch day after day.
  await admin.from('waitlists').update({ last_auto_check_at: now }).eq('id', wl.id);

  async function log(
    action: CheckAction,
    extra: Partial<{
      detected_status: WaitlistStatus;
      confidence: number;
      evidence: string;
      error: string;
    }> = {},
  ) {
    const { error } = await admin.from('waitlist_status_checks').insert({
      waitlist_id: wl.id,
      checked_url: url,
      action,
      ...extra,
    });
    if (error) {
      console.error(`[check-waitlist-status] log insert failed for ${wl.id}: ${error.message}`);
    }
  }

  if (!url) {
    await log('fetch_failed', { error: 'no usable http(s) source_url or application_link' });
    return { waitlistId: wl.id, action: 'fetch_failed', newSuggestion: false };
  }

  // ---- Fetch --------------------------------------------------------------
  let pageText: string;
  try {
    pageText = await fetchPageText(url, appUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log('fetch_failed', { error: message });
    await admin
      .from('waitlists')
      .update({ check_failures: wl.check_failures + 1 })
      .eq('id', wl.id);
    return { waitlistId: wl.id, action: 'fetch_failed', newSuggestion: false };
  }

  if (pageText.length < MIN_PAGE_CHARS) {
    await log('insufficient_content', {
      error: `page text too short (${pageText.length} chars); likely rendered client-side`,
    });
    return { waitlistId: wl.id, action: 'insufficient_content', newSuggestion: false };
  }

  // ---- Classify -----------------------------------------------------------
  if (!anthropic) {
    await log('classify_failed', { error: 'ANTHROPIC_API_KEY not configured' });
    return { waitlistId: wl.id, action: 'classify_failed', newSuggestion: false };
  }

  let result: Classification;
  try {
    result = await classifyPage(anthropic, model, wl, pageText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log('classify_failed', { error: message });
    return { waitlistId: wl.id, action: 'classify_failed', newSuggestion: false };
  }

  const detected = result.status;
  const shared = {
    detected_status: detected,
    confidence: result.confidence,
    evidence: result.evidence,
  };

  // The URL works and the page was readable — clear the failure counter.
  const clearFailures = wl.check_failures > 0 ? { check_failures: 0 } : {};

  const { data: pending } = await admin
    .from('waitlist_status_suggestions')
    .select('id')
    .eq('waitlist_id', wl.id)
    .eq('status', 'pending')
    .maybeSingle();

  // ---- Same status: confirm freshness ---------------------------------
  if (detected === wl.status && result.confidence >= CONFIRM_MIN_CONFIDENCE) {
    await admin
      .from('waitlists')
      .update({ last_checked: now.slice(0, 10), ...clearFailures })
      .eq('id', wl.id);
    if (pending) {
      // A previous detection is stale — the page reads as the recorded
      // status again, so pull it out of the review queue.
      await admin
        .from('waitlist_status_suggestions')
        .update({ status: 'superseded', updated_at: now })
        .eq('id', pending.id);
    }
    await log('confirmed', shared);
    return { waitlistId: wl.id, action: 'confirmed', newSuggestion: false };
  }

  // ---- Different status: queue for review ------------------------------
  // 'unknown' is never suggested: replacing a real status with "we could
  // not tell" is not an actionable review item.
  if (
    detected !== wl.status &&
    detected !== 'unknown' &&
    result.confidence >= SUGGEST_MIN_CONFIDENCE
  ) {
    if (pending) {
      await admin
        .from('waitlist_status_suggestions')
        .update({
          previous_status: wl.status,
          suggested_status: detected,
          confidence: result.confidence,
          evidence: result.evidence,
          checked_url: url,
          updated_at: now,
        })
        .eq('id', pending.id);
    } else {
      const { error } = await admin.from('waitlist_status_suggestions').insert({
        waitlist_id: wl.id,
        previous_status: wl.status,
        suggested_status: detected,
        confidence: result.confidence,
        evidence: result.evidence,
        checked_url: url,
      });
      if (error) {
        console.error(
          `[check-waitlist-status] suggestion insert failed for ${wl.id}: ${error.message}`,
        );
      }
    }
    if (Object.keys(clearFailures).length > 0) {
      await admin.from('waitlists').update(clearFailures).eq('id', wl.id);
    }
    await log('suggested', shared);
    return { waitlistId: wl.id, action: 'suggested', newSuggestion: !pending };
  }

  // ---- Unsure: log only -------------------------------------------------
  if (Object.keys(clearFailures).length > 0) {
    await admin.from('waitlists').update(clearFailures).eq('id', wl.id);
  }
  await log('uncertain', shared);
  return { waitlistId: wl.id, action: 'uncertain', newSuggestion: false };
}

// ---------------------------------------------------------------------------
// Admin nudge email (best effort — a failure here never fails the run)
// ---------------------------------------------------------------------------

async function notifyAdmins(
  admin: ReturnType<typeof createClient>,
  appUrl: string,
  newSuggestionCount: number,
): Promise<void> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Housing Navigator <onboarding@resend.dev>';
  if (!RESEND_API_KEY) return;

  const { data: adminRows } = await admin.from('admin_users').select('user_id');
  const ids = (adminRows ?? []).map((r: { user_id: string }) => r.user_id);
  if (ids.length === 0) return;
  const { data: profiles } = await admin
    .from('profiles')
    .select('email')
    .in('id', ids);
  const emails = (profiles ?? [])
    .map((p: { email: string | null }) => p.email)
    .filter((e: string | null): e is string => !!e);
  if (emails.length === 0) return;

  const reviewUrl = `${appUrl.replace(/\/+$/, '')}/admin/review`;
  const noun = newSuggestionCount === 1 ? 'change' : 'changes';
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: emails,
        subject: `Housing Navigator: ${newSuggestionCount} waitlist status ${noun} detected`,
        text: [
          `The automated status checker detected ${newSuggestionCount} possible waitlist status ${noun}.`,
          '',
          'Nothing has been published and no subscriber has been emailed —',
          'each change is waiting for your one-click review:',
          '',
          reviewUrl,
        ].join('\n'),
      }),
    });
  } catch (err) {
    console.error(
      `[check-waitlist-status] admin nudge email failed: ${err instanceof Error ? err.message : err}`,
    );
  }
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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const APP_URL = Deno.env.get('APP_URL') ?? 'https://housing-navigator.local';
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const CLAUDE_MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-4-8';

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'server misconfigured (missing supabase env)' }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- AuthN / AuthZ: internal secret (cron) or admin JWT (check now) ----
  const INTERNAL_TRIGGER_SECRET = Deno.env.get('INTERNAL_TRIGGER_SECRET');
  const headerSecret = req.headers.get('x-internal-secret');
  const isInternal =
    !!INTERNAL_TRIGGER_SECRET &&
    !!headerSecret &&
    (await timingSafeEqual(headerSecret, INTERNAL_TRIGGER_SECRET));

  if (!isInternal) {
    const authz = req.headers.get('authorization') ?? '';
    const token = authz.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'missing bearer token' }, 401);

    // Validate the JWT explicitly. `getUser()` without an argument resolves
    // the session from client-side storage — an edge function has none, so
    // supabase-js rejects with "Auth session missing" before ever asking the
    // auth server. Passing the token forces a real server-side check.
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: 'unauthorized' }, 401);
    }
    const { data: adminRow, error: adminErr } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (adminErr) return json({ error: 'admin lookup failed' }, 500);
    if (!adminRow) return json({ error: 'not admin' }, 403);
  }

  // ---- Pick the work ------------------------------------------------------
  let body: { waitlist_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — cron sends {source: 'cron'}
  }

  const columns =
    'id, housing_authority, program_name, status, source_url, application_link, check_failures';

  let targets: CheckableWaitlist[] = [];
  if (body.waitlist_id) {
    // Admin "check now": one row, due-window ignored.
    const { data, error } = await admin
      .from('waitlists')
      .select(columns)
      .eq('id', body.waitlist_id)
      .maybeSingle();
    if (error) return json({ error: 'waitlist lookup failed' }, 500);
    if (!data) return json({ error: 'waitlist not found' }, 404);
    targets = [data as CheckableWaitlist];
  } else {
    const cutoff = new Date(Date.now() - CHECK_INTERVAL_HOURS * 3600 * 1000).toISOString();
    const { data, error } = await admin
      .from('waitlists')
      .select(columns)
      .eq('auto_check_enabled', true)
      .eq('published', true)
      .or(`last_auto_check_at.is.null,last_auto_check_at.lt.${cutoff}`)
      .order('last_auto_check_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);
    if (error) return json({ error: 'waitlist batch lookup failed' }, 500);
    targets = (data ?? []) as CheckableWaitlist[];
  }

  if (targets.length === 0) {
    return json({ checked: 0, message: 'nothing due' });
  }

  const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

  // ---- Run with small concurrency so one slow site can't eat the batch ----
  const outcomes: CheckOutcome[] = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((wl) =>
        checkOne(admin, anthropic, CLAUDE_MODEL, APP_URL, wl).catch((err) => {
          console.error(
            `[check-waitlist-status] unexpected failure for ${wl.id}: ${err instanceof Error ? err.message : err}`,
          );
          return { waitlistId: wl.id, action: 'classify_failed' as CheckAction, newSuggestion: false };
        }),
      ),
    );
    outcomes.push(...results);
  }

  const summary = {
    checked: outcomes.length,
    confirmed: outcomes.filter((o) => o.action === 'confirmed').length,
    suggested: outcomes.filter((o) => o.action === 'suggested').length,
    uncertain: outcomes.filter((o) => o.action === 'uncertain').length,
    failed: outcomes.filter(
      (o) => o.action === 'fetch_failed' || o.action === 'classify_failed',
    ).length,
    insufficient_content: outcomes.filter((o) => o.action === 'insufficient_content').length,
    outcomes,
  };

  const newSuggestions = outcomes.filter((o) => o.newSuggestion).length;
  if (newSuggestions > 0) {
    await notifyAdmins(admin, APP_URL, newSuggestions);
  }

  return json(summary);
});
