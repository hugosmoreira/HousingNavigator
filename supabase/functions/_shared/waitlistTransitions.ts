/**
 * Waitlist status transition rules — the single source of truth.
 *
 * Consumed by BOTH sides of the alert pipeline:
 *   * Frontend: src/admin/notifyWaitlistAlert.ts (skips the round-trip for
 *     ineligible transitions and re-exports for UI labels)
 *   * Edge Fn:  supabase/functions/send-waitlist-alert/index.ts (the final
 *     server-side gate before any email goes out)
 *
 * This file must stay pure TypeScript — no Deno or browser imports — so it
 * can be bundled by `supabase functions deploy` and Vite alike.
 *
 * The SQL twin lives in the `on_waitlist_status_change` trigger (migration
 * 0009). The trigger is only a pre-filter; the Edge Function re-validates
 * with THIS rule, so this definition is authoritative for what sends email.
 */

export type WaitlistStatus = 'open' | 'limited' | 'closed' | 'unknown';

/** Statuses a waitlist can leave for the change to count as an upgrade. */
export const UPGRADE_FROM: ReadonlySet<WaitlistStatus> = new Set([
  'closed',
  'unknown',
  'limited',
]);

/** Statuses a waitlist can enter for the change to count as an upgrade. */
export const UPGRADE_TO: ReadonlySet<WaitlistStatus> = new Set([
  'open',
  'limited',
]);

/**
 * True when a status change is worth notifying subscribers about:
 * movement from a less-open state into a more-open state.
 * Downgrades (open → closed) and no-ops never alert.
 */
export function isMeaningfulUpgrade(
  previous: WaitlistStatus,
  next: WaitlistStatus,
): boolean {
  return previous !== next && UPGRADE_FROM.has(previous) && UPGRADE_TO.has(next);
}

export const WAITLIST_STATUS_LABEL: Record<WaitlistStatus, string> = {
  open: 'Open',
  limited: 'Limited',
  closed: 'Closed',
  unknown: 'Unknown',
};
