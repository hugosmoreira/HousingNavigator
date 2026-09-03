import { describe, expect, it } from 'vitest';
import {
  buildAutomationHealth,
  type AutomationCheck,
  type AutomationWaitlist,
} from './automationHealth';

const NOW = new Date('2026-09-03T20:00:00-07:00');

function waitlist(
  id: string,
  overrides: Partial<AutomationWaitlist> = {},
): AutomationWaitlist {
  return {
    id,
    housing_authority: `Authority ${id}`,
    program_name: 'Housing program',
    status: 'open',
    published: true,
    auto_check_enabled: true,
    check_failures: 0,
    last_auto_check_at: '2026-09-03T18:00:00-07:00',
    last_checked: '2026-09-03',
    source_url: `https://example.com/${id}`,
    ...overrides,
  };
}

function check(
  id: number,
  waitlistId: string,
  overrides: Partial<AutomationCheck> = {},
): AutomationCheck {
  return {
    id,
    waitlist_id: waitlistId,
    checked_at: '2026-09-03T19:00:00-07:00',
    action: 'confirmed',
    error: null,
    evidence_verified: true,
    ...overrides,
  };
}

describe('buildAutomationHealth', () => {
  it('counts verified, overdue, and current manual-review records', () => {
    const snapshot = buildAutomationHealth(
      [
        waitlist('verified'),
        waitlist('overdue', { last_auto_check_at: '2026-09-01T10:00:00-07:00' }),
        waitlist('protected', { last_checked: '2026-09-02' }),
        waitlist('manually-fixed', { last_checked: '2026-09-03' }),
        waitlist('draft', { published: false, last_auto_check_at: null }),
      ],
      [
        check(1, 'verified'),
        check(2, 'protected', {
          checked_at: '2026-09-03T12:00:00-07:00',
          action: 'fetch_failed',
          error: 'HTTP 403',
          evidence_verified: false,
        }),
        check(3, 'manually-fixed', {
          checked_at: '2026-09-02T12:00:00-07:00',
          action: 'classify_failed',
          evidence_verified: false,
        }),
      ],
      2,
      NOW,
    );

    expect(snapshot.verifiedToday).toBe(1);
    expect(snapshot.pendingSuggestions).toBe(2);
    expect(snapshot.manualReview).toBe(1);
    expect(snapshot.overdue).toBe(1);
    expect(snapshot.attentionItems.map((item) => item.waitlist.id)).toEqual([
      'protected',
      'overdue',
    ]);
    expect(snapshot.waitlists).toHaveLength(4);
  });

  it('uses only the latest check when deciding whether manual review is needed', () => {
    const snapshot = buildAutomationHealth(
      [waitlist('recovered')],
      [
        check(1, 'recovered', { checked_at: '2026-09-03T10:00:00-07:00' }),
        check(2, 'recovered', {
          checked_at: '2026-09-03T09:00:00-07:00',
          action: 'fetch_failed',
          evidence_verified: false,
        }),
      ],
      0,
      NOW,
    );

    expect(snapshot.manualReview).toBe(0);
  });
});
