import { requireSupabase } from '../lib/supabaseClient';

export type AutomationAction =
  | 'confirmed'
  | 'suggested'
  | 'uncertain'
  | 'insufficient_content'
  | 'fetch_failed'
  | 'classify_failed';

export interface AutomationWaitlist {
  id: string;
  housing_authority: string;
  program_name: string | null;
  status: string;
  published: boolean;
  auto_check_enabled: boolean;
  check_failures: number;
  last_auto_check_at: string | null;
  last_checked: string | null;
  source_url: string | null;
}

export interface AutomationCheck {
  id: number;
  waitlist_id: string;
  checked_at: string;
  action: AutomationAction;
  error: string | null;
  evidence_verified: boolean;
}

export interface AutomationAttentionItem {
  waitlist: AutomationWaitlist;
  reason: 'manual_review' | 'overdue';
  latestCheck: AutomationCheck | null;
}

export interface AutomationHealthSnapshot {
  waitlists: AutomationWaitlist[];
  verifiedToday: number;
  pendingSuggestions: number;
  manualReview: number;
  overdue: number;
  lastActivityAt: string | null;
  attentionItems: AutomationAttentionItem[];
}

export interface CheckerResponse {
  checked?: number;
  confirmed?: number;
  suggested?: number;
  uncertain?: number;
  failed?: number;
  insufficient_content?: number;
  message?: string;
  outcomes?: Array<{
    waitlistId: string;
    action: AutomationAction;
    newSuggestion: boolean;
  }>;
}

const MANUAL_ACTIONS = new Set<AutomationAction>([
  'uncertain',
  'insufficient_content',
  'fetch_failed',
  'classify_failed',
]);
const VERIFIED_ACTIONS = new Set<AutomationAction>(['confirmed', 'suggested']);
const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

export function buildAutomationHealth(
  waitlists: AutomationWaitlist[],
  checks: AutomationCheck[],
  pendingSuggestions: number,
  now = new Date(),
): AutomationHealthSnapshot {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const latestByWaitlist = new Map<string, AutomationCheck>();
  for (const check of checks) {
    const current = latestByWaitlist.get(check.waitlist_id);
    if (!current || Date.parse(check.checked_at) > Date.parse(current.checked_at)) {
      latestByWaitlist.set(check.waitlist_id, check);
    }
  }

  const verifiedTodayIds = new Set(
    checks
      .filter(
        (check) =>
          Date.parse(check.checked_at) >= startOfToday.getTime() &&
          VERIFIED_ACTIONS.has(check.action) &&
          check.evidence_verified,
      )
      .map((check) => check.waitlist_id),
  );

  const monitored = waitlists.filter((row) => row.published && row.auto_check_enabled);
  const attentionItems: AutomationAttentionItem[] = [];

  for (const waitlist of monitored) {
    const latestCheck = latestByWaitlist.get(waitlist.id) ?? null;
    const lastManualVerification = waitlist.last_checked
      ? Date.parse(`${waitlist.last_checked}T00:00:00`)
      : Number.NEGATIVE_INFINITY;
    const needsManualReview =
      latestCheck !== null &&
      MANUAL_ACTIONS.has(latestCheck.action) &&
      Date.parse(latestCheck.checked_at) >= lastManualVerification;

    if (needsManualReview) {
      attentionItems.push({ waitlist, reason: 'manual_review', latestCheck });
      continue;
    }

    const lastAttempt = waitlist.last_auto_check_at
      ? Date.parse(waitlist.last_auto_check_at)
      : Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(lastAttempt) || now.getTime() - lastAttempt > OVERDUE_AFTER_MS) {
      attentionItems.push({ waitlist, reason: 'overdue', latestCheck });
    }
  }

  attentionItems.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === 'manual_review' ? -1 : 1;
    const aTime = a.waitlist.last_auto_check_at
      ? Date.parse(a.waitlist.last_auto_check_at)
      : Number.NEGATIVE_INFINITY;
    const bTime = b.waitlist.last_auto_check_at
      ? Date.parse(b.waitlist.last_auto_check_at)
      : Number.NEGATIVE_INFINITY;
    return aTime - bTime;
  });

  const activityTimes = checks
    .map((check) => Date.parse(check.checked_at))
    .filter(Number.isFinite);
  const lastActivityAt = activityTimes.length
    ? new Date(Math.max(...activityTimes)).toISOString()
    : null;

  return {
    waitlists: [...monitored].sort((a, b) =>
      waitlistLabel(a).localeCompare(waitlistLabel(b)),
    ),
    verifiedToday: verifiedTodayIds.size,
    pendingSuggestions,
    manualReview: attentionItems.filter((item) => item.reason === 'manual_review').length,
    overdue: attentionItems.filter((item) => item.reason === 'overdue').length,
    lastActivityAt,
    attentionItems,
  };
}

export async function loadAutomationHealth(): Promise<AutomationHealthSnapshot> {
  const client = await requireSupabase();
  const [waitlistsResult, checksResult, suggestionsResult] = await Promise.all([
    client
      .from('waitlists_admin')
      .select(
        'id,housing_authority,program_name,status,published,auto_check_enabled,check_failures,last_auto_check_at,last_checked,source_url',
      )
      .eq('published', true),
    client
      .from('waitlist_status_checks')
      .select('id,waitlist_id,checked_at,action,error,evidence_verified')
      .order('checked_at', { ascending: false })
      .limit(250),
    client
      .from('waitlist_status_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const error = [waitlistsResult.error, checksResult.error, suggestionsResult.error].find(Boolean);
  if (error) throw error;

  return buildAutomationHealth(
    (waitlistsResult.data ?? []) as AutomationWaitlist[],
    (checksResult.data ?? []) as AutomationCheck[],
    suggestionsResult.count ?? 0,
  );
}

export async function runWaitlistCheck(waitlistId: string): Promise<CheckerResponse> {
  const client = await requireSupabase();
  const { data, error } = await client.functions.invoke<CheckerResponse>('check-waitlist-status', {
    body: { waitlist_id: waitlistId },
  });
  if (error) throw error;
  return data ?? {};
}

export function waitlistLabel(waitlist: AutomationWaitlist): string {
  return [waitlist.housing_authority, waitlist.program_name].filter(Boolean).join(' — ');
}
