import { describe, expect, it } from 'vitest';
import {
  adminDeleteConfirmationMatches,
  countAdminRowsByUser,
  normalizeAdminEmail,
  normalizeAdminUserPage,
  validAdminEmail,
  validAdminUserId,
} from '../../supabase/functions/_shared/adminUserManagement.ts';

describe('admin user-management request policy', () => {
  it('normalizes and validates account emails', () => {
    expect(normalizeAdminEmail('  Person@Example.COM ')).toBe('person@example.com');
    expect(validAdminEmail('person@example.com')).toBe(true);
    expect(validAdminEmail('not-an-email')).toBe(false);
    expect(validAdminEmail('')).toBe(false);
  });

  it('rejects malformed user identifiers', () => {
    expect(validAdminUserId('715ed5db-f090-4b8c-a067-640ecee36aa0')).toBe(true);
    expect(validAdminUserId('../auth/users')).toBe(false);
  });

  it('caps pagination requested by the browser', () => {
    expect(normalizeAdminUserPage(-5, 5_000)).toEqual({ page: 1, perPage: 50 });
    expect(normalizeAdminUserPage(2, 10)).toEqual({ page: 2, perPage: 10 });
  });

  it('requires an exact normalized email before deletion', () => {
    expect(adminDeleteConfirmationMatches('Person@Example.com', ' person@example.COM ')).toBe(true);
    expect(adminDeleteConfirmationMatches('person@example.com', 'other@example.com')).toBe(false);
    expect(adminDeleteConfirmationMatches('', '')).toBe(false);
  });

  it('aggregates only the activity counts needed by the directory', () => {
    expect(
      countAdminRowsByUser([
        { user_id: 'a' },
        { user_id: 'a' },
        { user_id: 'b' },
      ]),
    ).toEqual(new Map([['a', 2], ['b', 1]]));
  });
});
