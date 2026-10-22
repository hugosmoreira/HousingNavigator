import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
  DEFAULT_ADMIN_PATH,
  MFA_SETUP_NAME_PREFIX,
  REQUIRE_ADMIN_MFA,
  adminReturnPath,
  adminRouteFor,
  decideAdminAccess,
  decodeJwtPayload,
  mfaPageFor,
  planFactors,
  readAssurance,
} from './adminAccess';

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

function session(aal: string, factors: Array<{ status: string }> = []): Session {
  return {
    access_token: jwt({ sub: 'user-1', aal }),
    user: { id: 'user-1', factors },
  } as unknown as Session;
}

describe('decodeJwtPayload', () => {
  it('reads base64url claims, including UTF-8 text', () => {
    expect(decodeJwtPayload(jwt({ aal: 'aal2', name: 'Señora Ñ' }))).toMatchObject({
      aal: 'aal2',
      name: 'Señora Ñ',
    });
  });

  it('returns null for malformed tokens instead of throwing', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.%%%.c')).toBeNull();
    expect(decodeJwtPayload(null)).toBeNull();
  });
});

describe('readAssurance', () => {
  it('reports nothing without a session', () => {
    expect(readAssurance(null)).toEqual({ currentLevel: null, nextLevel: null });
  });

  it('stays at aal1 for a password session with no verified factor', () => {
    expect(readAssurance(session('aal1', [{ status: 'unverified' }]))).toEqual({
      currentLevel: 'aal1',
      nextLevel: 'aal1',
    });
  });

  it('can reach aal2 once a verified factor exists', () => {
    expect(readAssurance(session('aal1', [{ status: 'verified' }]))).toEqual({
      currentLevel: 'aal1',
      nextLevel: 'aal2',
    });
    expect(readAssurance(session('aal2', [{ status: 'verified' }])).currentLevel).toBe('aal2');
  });
});

describe('decideAdminAccess (rollout stage 1)', () => {
  const aal1 = { currentLevel: 'aal1', nextLevel: 'aal1' } as const;
  const aal1Enrolled = { currentLevel: 'aal1', nextLevel: 'aal2' } as const;
  const aal2 = { currentLevel: 'aal2', nextLevel: 'aal2' } as const;

  it('does not yet require MFA in this release', () => {
    expect(REQUIRE_ADMIN_MFA).toBe(false);
  });

  it('lets a member without an authenticator in, and invites setup', () => {
    expect(decideAdminAccess(true, aal1)).toEqual({
      isAdmin: true,
      mfaEnrolled: false,
      mfaVerified: false,
      needsMfaVerification: false,
    });
  });

  it('requires the code once the member has a verified authenticator', () => {
    expect(decideAdminAccess(true, aal1Enrolled)).toMatchObject({
      isAdmin: false,
      needsMfaVerification: true,
    });
    expect(decideAdminAccess(true, aal2)).toMatchObject({ isAdmin: true, mfaVerified: true });
  });

  it('never grants access to a non-member', () => {
    for (const assurance of [aal1, aal1Enrolled, aal2]) {
      expect(decideAdminAccess(false, assurance)).toMatchObject({
        isAdmin: false,
        needsMfaVerification: false,
      });
    }
  });

  it('requires AAL2 for everyone once enforcement is switched on (stage 2)', () => {
    expect(decideAdminAccess(true, aal1, true)).toMatchObject({
      isAdmin: false,
      needsMfaVerification: true,
    });
    expect(decideAdminAccess(true, aal2, true).isAdmin).toBe(true);
  });
});

describe('adminRouteFor', () => {
  const base = { loading: false, hasSession: true, isAdmin: false };

  it('waits, then sends signed-out visitors to login', () => {
    expect(adminRouteFor({ ...base, loading: true, isAdmin: true })).toBe('loading');
    expect(adminRouteFor({ ...base, hasSession: false })).toBe('login');
  });

  it('allows admins and sends members who need a code to verify', () => {
    expect(adminRouteFor({ ...base, isAdmin: true })).toBe('allow');
    expect(
      adminRouteFor({ ...base, isAdminMember: true, needsMfaVerification: true }),
    ).toBe('verify');
  });

  it('offers a retry when the answer is unknown, and rejects confirmed non-members', () => {
    expect(adminRouteFor({ ...base, adminCheckFailed: true })).toBe('retry');
    expect(adminRouteFor(base)).toBe('not-admin');
  });
});

describe('mfaPageFor', () => {
  const member = {
    loading: false,
    hasSession: true,
    isAdminMember: true,
    adminCheckFailed: false,
    mfaEnrolled: false,
    mfaVerified: false,
  };

  it('offers setup, then code entry, then continues', () => {
    expect(mfaPageFor(member)).toBe('enroll');
    expect(mfaPageFor({ ...member, mfaEnrolled: true })).toBe('verify');
    expect(mfaPageFor({ ...member, mfaEnrolled: true, mfaVerified: true })).toBe('done');
  });

  it('keeps non-members and signed-out visitors out', () => {
    expect(mfaPageFor({ ...member, hasSession: false })).toBe('login');
    expect(mfaPageFor({ ...member, isAdminMember: false })).toBe('not-admin');
    expect(mfaPageFor({ ...member, isAdminMember: false, adminCheckFailed: true })).toBe('retry');
  });
});

describe('planFactors', () => {
  it('challenges an existing verified authenticator instead of adding one', () => {
    expect(
      planFactors([
        { id: 'old', factor_type: 'totp', status: 'unverified', friendly_name: `${MFA_SETUP_NAME_PREFIX}x` },
        { id: 'app', factor_type: 'totp', status: 'verified' },
      ]),
    ).toEqual({ mode: 'verify', factorId: 'app' });
  });

  it('reports a verified non-TOTP factor as unsupported rather than enrolling around it', () => {
    expect(planFactors([{ id: 'sms', factor_type: 'phone', status: 'verified' }])).toEqual({
      mode: 'unsupported',
    });
  });

  it('cleans up only abandoned setups created by this page', () => {
    expect(
      planFactors([
        { id: 'mine', factor_type: 'totp', status: 'unverified', friendly_name: `${MFA_SETUP_NAME_PREFIX}abc` },
        { id: 'other', factor_type: 'totp', status: 'unverified', friendly_name: 'Personal phone' },
        { id: 'phone', factor_type: 'phone', status: 'unverified', friendly_name: `${MFA_SETUP_NAME_PREFIX}p` },
      ]),
    ).toEqual({ mode: 'enroll', abandonedSetupIds: ['mine'] });
  });
});

describe('adminReturnPath', () => {
  it('returns to known admin pages, including edit pages', () => {
    for (const path of [
      '/admin/dashboard',
      '/admin/review',
      '/admin/users',
      '/admin/resources/new',
      '/admin/resources/6fbdb565-05f5-4696-9b58-aea8ab765bf6/edit',
      '/admin/waitlists/ha__program__foo-bar-com/edit',
    ]) {
      expect(adminReturnPath(path), path).toBe(path);
    }
  });

  it('never returns to login, verify, or anything off the admin area', () => {
    for (const path of [
      '/admin/login',
      '/admin/verify',
      '//evil.example/admin/dashboard',
      '/admin/resources/../users',
      'https://evil.example/admin/dashboard',
      '/dashboard',
      undefined,
    ]) {
      expect(adminReturnPath(path), String(path)).toBe(DEFAULT_ADMIN_PATH);
    }
  });
});
