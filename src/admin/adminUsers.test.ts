import { describe, expect, it } from 'vitest';
import { adminUserStatus, isUserBlocked } from './adminUsers';

const now = new Date('2026-08-10T20:00:00Z');

describe('admin user status', () => {
  it('protects administrators as a distinct status', () => {
    expect(
      adminUserStatus(
        { is_admin: true, banned_until: null, email_confirmed_at: '2026-01-01T00:00:00Z' },
        now,
      ),
    ).toBe('administrator');
  });

  it('reports only future bans as blocked', () => {
    expect(isUserBlocked('2026-08-11T00:00:00Z', now)).toBe(true);
    expect(isUserBlocked('2026-08-09T00:00:00Z', now)).toBe(false);
    expect(isUserBlocked(null, now)).toBe(false);
  });

  it('distinguishes invited and active accounts', () => {
    expect(
      adminUserStatus(
        { is_admin: false, banned_until: null, email_confirmed_at: null },
        now,
      ),
    ).toBe('invited');
    expect(
      adminUserStatus(
        {
          is_admin: false,
          banned_until: null,
          email_confirmed_at: '2026-08-01T00:00:00Z',
        },
        now,
      ),
    ).toBe('active');
  });
});
