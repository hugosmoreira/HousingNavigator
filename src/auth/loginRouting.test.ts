import { describe, expect, it } from 'vitest';
import {
  ADMIN_LOGIN_DESTINATION,
  DEFAULT_PUBLIC_LOGIN_DESTINATION,
  resolvePostLoginDestination,
  resolvePublicLoginTarget,
} from './loginRouting';

describe('post-login routing', () => {
  it('does not route until Supabase has established a session', () => {
    expect(
      resolvePostLoginDestination({
        hasSession: false,
        isAdmin: true,
        publicTarget: '/dashboard',
      }),
    ).toBeNull();
  });

  it('routes an authenticated admin to the admin area without requiring a public profile', () => {
    expect(
      resolvePostLoginDestination({
        hasSession: true,
        isAdmin: true,
        publicTarget: '/dashboard',
      }),
    ).toBe(ADMIN_LOGIN_DESTINATION);
    expect(ADMIN_LOGIN_DESTINATION).toBe('/admin/dashboard');
  });

  it('preserves the requested public destination for a non-admin session', () => {
    expect(
      resolvePostLoginDestination({
        hasSession: true,
        isAdmin: false,
        publicTarget: '/resources?saved=true',
      }),
    ).toBe('/resources?saved=true');
  });

  it('keeps admin and external destinations out of public redirect state', () => {
    expect(resolvePublicLoginTarget('/resources')).toBe('/resources');
    expect(resolvePublicLoginTarget('/admin/review')).toBe(
      DEFAULT_PUBLIC_LOGIN_DESTINATION,
    );
    expect(resolvePublicLoginTarget('//example.test')).toBe(
      DEFAULT_PUBLIC_LOGIN_DESTINATION,
    );
    expect(resolvePublicLoginTarget('https://example.test')).toBe(
      DEFAULT_PUBLIC_LOGIN_DESTINATION,
    );
  });
});
