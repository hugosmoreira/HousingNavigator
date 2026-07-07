import { describe, expect, it } from 'vitest';
import {
  isMeaningfulUpgrade,
  WAITLIST_STATUS_LABEL,
  type WaitlistStatus,
} from '../../supabase/functions/_shared/waitlistTransitions.ts';

describe('isMeaningfulUpgrade', () => {
  const upgrades: Array<[WaitlistStatus, WaitlistStatus]> = [
    ['closed', 'open'],
    ['unknown', 'open'],
    ['limited', 'open'],
    ['closed', 'limited'],
    ['unknown', 'limited'],
  ];
  it.each(upgrades)('alerts on %s → %s', (prev, next) => {
    expect(isMeaningfulUpgrade(prev, next)).toBe(true);
  });

  const nonUpgrades: Array<[WaitlistStatus, WaitlistStatus]> = [
    ['open', 'closed'],
    ['open', 'limited'],
    ['open', 'unknown'],
    ['limited', 'closed'],
    ['closed', 'unknown'],
    ['open', 'open'],
    ['closed', 'closed'],
    ['limited', 'limited'],
    ['unknown', 'unknown'],
  ];
  it.each(nonUpgrades)('stays quiet on %s → %s', (prev, next) => {
    expect(isMeaningfulUpgrade(prev, next)).toBe(false);
  });
});

describe('WAITLIST_STATUS_LABEL', () => {
  it('covers every status with a human label', () => {
    const statuses: WaitlistStatus[] = ['open', 'limited', 'closed', 'unknown'];
    for (const s of statuses) {
      expect(WAITLIST_STATUS_LABEL[s]).toBeTruthy();
    }
  });
});
