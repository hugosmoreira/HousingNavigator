/**
 * Admin access policy: membership plus the session's MFA assurance level.
 *
 * Pure functions only, so the rules are unit tested without rendering
 * AdminAuthContext, RequireAdmin or AdminMfa.
 *
 * Rollout stage 1 (this file, REQUIRE_ADMIN_MFA = false): an admin without
 * a verified authenticator still gets in with a password and is invited to
 * set one up. Once a verified factor exists, a password-only (AAL1) session
 * must enter the code first. Stage 2 flips REQUIRE_ADMIN_MFA together with
 * the database migration that makes `is_admin()` require AAL2, after every
 * admin has enrolled.
 */

import type { Session } from '@supabase/supabase-js';

export const REQUIRE_ADMIN_MFA = false;

export type AssuranceLevel = 'aal1' | 'aal2' | null;

export interface Assurance {
  /** Level of the current session token (`aal` claim). */
  currentLevel: AssuranceLevel;
  /** Level the user can reach: aal2 once they have a verified factor. */
  nextLevel: AssuranceLevel;
}

/** Decode a JWT payload without verifying it (the server verifies; this only reads claims). */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    // atob yields Latin-1 code units; re-encode them so UTF-8 claims survive.
    const json = decodeURIComponent(
      Array.from(atob(padded), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    const payload: unknown = JSON.parse(json);
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The same computation auth-js `getAuthenticatorAssuranceLevel()` does
 * locally, read from a session we already hold, so it needs no auth lock
 * and updates as soon as a new session arrives (for example after MFA).
 */
export function readAssurance(session: Session | null): Assurance {
  if (!session) return { currentLevel: null, nextLevel: null };
  const aal = decodeJwtPayload(session.access_token)?.aal;
  const currentLevel: AssuranceLevel = aal === 'aal1' || aal === 'aal2' ? aal : null;
  const hasVerifiedFactor = (session.user.factors ?? []).some((factor) => factor.status === 'verified');
  return { currentLevel, nextLevel: hasVerifiedFactor ? 'aal2' : currentLevel };
}

export interface AdminAccessDecision {
  /** Allowed into the admin pages now. */
  isAdmin: boolean;
  /** Has a verified second factor. */
  mfaEnrolled: boolean;
  /** This session passed the second factor (AAL2). */
  mfaVerified: boolean;
  /** A member who must enter a code before using the admin pages. */
  needsMfaVerification: boolean;
}

export function decideAdminAccess(
  isMember: boolean,
  assurance: Assurance,
  requireMfa: boolean = REQUIRE_ADMIN_MFA,
): AdminAccessDecision {
  const mfaEnrolled = assurance.nextLevel === 'aal2';
  const mfaVerified = assurance.currentLevel === 'aal2';
  const needsMfaVerification = isMember && !mfaVerified && (requireMfa || mfaEnrolled);
  return {
    isAdmin: isMember && !needsMfaVerification,
    mfaEnrolled,
    mfaVerified,
    needsMfaVerification,
  };
}

export type AdminRoute = 'loading' | 'login' | 'allow' | 'verify' | 'retry' | 'not-admin';

/** What RequireAdmin renders for a protected admin page. */
export function adminRouteFor(state: {
  loading: boolean;
  hasSession: boolean;
  isAdmin: boolean;
  isAdminMember?: boolean;
  needsMfaVerification?: boolean;
  adminCheckFailed?: boolean;
}): AdminRoute {
  if (state.loading) return 'loading';
  if (!state.hasSession) return 'login';
  if (state.isAdmin) return 'allow';
  if (state.isAdminMember && state.needsMfaVerification) return 'verify';
  if (state.adminCheckFailed) return 'retry';
  return 'not-admin';
}

export type MfaPage = 'loading' | 'login' | 'retry' | 'not-admin' | 'verify' | 'enroll' | 'done';

/** What the /admin/verify page shows. */
export function mfaPageFor(state: {
  loading: boolean;
  hasSession: boolean;
  isAdminMember: boolean;
  adminCheckFailed: boolean;
  mfaEnrolled: boolean;
  mfaVerified: boolean;
}): MfaPage {
  if (state.loading) return 'loading';
  if (!state.hasSession) return 'login';
  if (!state.isAdminMember) return state.adminCheckFailed ? 'retry' : 'not-admin';
  if (state.mfaVerified) return 'done';
  return state.mfaEnrolled ? 'verify' : 'enroll';
}

/** Prefix for factors this page creates, so only its own abandoned setups are cleaned up. */
export const MFA_SETUP_NAME_PREFIX = 'Housing Navigator admin ';

export interface FactorLike {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string;
}

export type FactorPlan =
  | { mode: 'verify'; factorId: string }
  | { mode: 'enroll'; abandonedSetupIds: string[] }
  | { mode: 'unsupported' };

/**
 * Which factor to challenge, or what to clean up before a new setup. A new
 * factor is never added while a verified one exists, so setup cannot be
 * used to sidestep an existing authenticator.
 */
export function planFactors(factors: readonly FactorLike[]): FactorPlan {
  const verified = factors.filter((factor) => factor.status === 'verified');
  const verifiedTotp = verified.find((factor) => factor.factor_type === 'totp');
  if (verifiedTotp) return { mode: 'verify', factorId: verifiedTotp.id };
  if (verified.length > 0) return { mode: 'unsupported' };
  return {
    mode: 'enroll',
    abandonedSetupIds: factors
      .filter(
        (factor) =>
          factor.status === 'unverified' &&
          factor.factor_type === 'totp' &&
          (factor.friendly_name ?? '').startsWith(MFA_SETUP_NAME_PREFIX),
      )
      .map((factor) => factor.id),
  };
}

export const DEFAULT_ADMIN_PATH = '/admin/dashboard';

const ADMIN_RETURN_PATH =
  /^\/admin\/(dashboard|alerts|review|users|(resources|properties|waitlists)(\/new|\/[A-Za-z0-9_-]+\/edit)?)$/;

/** Where to continue after sign-in or verification: a known admin page, never login or verify. */
export function adminReturnPath(from?: string | null): string {
  return from && ADMIN_RETURN_PATH.test(from) ? from : DEFAULT_ADMIN_PATH;
}
