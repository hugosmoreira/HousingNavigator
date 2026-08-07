/**
 * Typed wrapper around the `send-waitlist-alert` Supabase Edge Function.
 *
 * The function lives in `supabase/functions/send-waitlist-alert/`. This
 * module is the ONLY place the frontend should touch when triggering
 * waitlist emails — never call Resend directly from a component.
 *
 * Graceful degradation:
 *   * If the function isn't deployed yet, every call rejects with a
 *     descriptive error and the caller (WaitlistForm) treats that as
 *     "skip notifications", leaving the DB save flow intact.
 *   * The transition rule is shared with the Edge Function via
 *     supabase/functions/_shared/waitlistTransitions.ts so the frontend
 *     can skip the round-trip entirely when the change is not meaningful.
 */

import { requireSupabase } from '../lib/supabaseClient';
import type { WaitlistStatus } from '../types';

export {
  isMeaningfulUpgrade,
  WAITLIST_STATUS_LABEL,
} from '../../supabase/functions/_shared/waitlistTransitions.ts';

export interface NotifyAlertRequest {
  waitlist_id: string;
  previous_status: WaitlistStatus;
  new_status: WaitlistStatus;
  dry_run?: boolean;
}

export interface NotifyAlertSuccess {
  subscriber_count: number;
  sent_count: number;
  failed_count: number;
  skipped: false;
}

export interface NotifyAlertDryRun {
  subscriber_count: number;
  would_send: number;
}

export interface NotifyAlertSkipped {
  skipped: true;
  reason: string;
}

export interface NotifyAlertPartial {
  subscriber_count: number;
  sent_count: number;
  failed_count: number;
  reason: string;
}

export type NotifyAlertResponse =
  | NotifyAlertSuccess
  | NotifyAlertDryRun
  | NotifyAlertSkipped
  | NotifyAlertPartial;

export function isDryRun(r: NotifyAlertResponse): r is NotifyAlertDryRun {
  return 'would_send' in r;
}

export function isSkipped(r: NotifyAlertResponse): r is NotifyAlertSkipped {
  return 'skipped' in r && r.skipped === true;
}

/**
 * Invoke the Edge Function. Uses the signed-in user's JWT for admin
 * verification on the function side. Throws on transport or non-2xx.
 */
export async function notifyWaitlistAlert(
  body: NotifyAlertRequest,
): Promise<NotifyAlertResponse> {
  const client = await requireSupabase();
  const { data, error } = await client.functions.invoke<NotifyAlertResponse>(
    'send-waitlist-alert',
    { body },
  );
  if (error) {
    // supabase-js wraps non-2xx responses here. Surface the original
    // message so the modal can show "not admin", "transition not
    // eligible", etc.
    throw new Error(error.message || 'send-waitlist-alert failed');
  }
  if (!data) {
    throw new Error('send-waitlist-alert returned no body');
  }
  return data;
}
