// Human-admin authorization shared by the admin Edge Functions.
//
// A caller is an administrator only when all of these hold, checked in this
// order so a session without a second factor never reaches the database:
//   1. Supabase Auth accepts the bearer token. getUser asks the Auth server,
//      so a signed-out session or a blocked user is rejected too.
//   2. The token's verified claims name the same user and show the session
//      passed two-factor sign-in (`aal` is 'aal2'). This matches
//      public.is_admin() from migration 0030.
//   3. The user has a row in public.admin_users.
//
// Internal-secret automation (the cron checker, the status-change trigger) is
// authorized separately by the functions that accept it; this gate is for
// people.

export interface AdminAuthorizationClient {
  auth: {
    getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
    getClaims(token: string): PromiseLike<{
      data: { claims: { sub?: string; aal?: unknown } } | null;
      error: unknown;
    }>;
  };
  findAdmin(userId: string): PromiseLike<{ data: { user_id: string } | null; error: unknown }>;
}

/** The service-role client each function already holds (the parts used here). */
export interface ServiceRoleClient {
  auth: AdminAuthorizationClient['auth'];
  from(table: 'admin_users'): {
    select(columns: 'user_id'): {
      eq(column: 'user_id', value: string): {
        maybeSingle(): PromiseLike<{ data: { user_id: string } | null; error: unknown }>;
      };
    };
  };
}

export type AdminDenial = 'sign-in' | 'mfa' | 'not-admin' | 'unavailable';

export const ADMIN_DENIALS: Record<AdminDenial, { status: 401 | 403 | 503; message: string }> = {
  'sign-in': { status: 401, message: 'Sign in required.' },
  mfa: {
    status: 403,
    message: 'Two-factor sign-in required. Enter your authenticator code at /admin/verify, then try again.',
  },
  'not-admin': { status: 403, message: 'Admin access required.' },
  unavailable: { status: 503, message: 'Admin access could not be checked. Try again.' },
};

export type AdminAuthorization =
  | { authorized: true; userId: string }
  | { authorized: false; reason: AdminDenial; status: 401 | 403 | 503; message: string };

const deny = (reason: AdminDenial): AdminAuthorization => ({
  authorized: false,
  reason,
  ...ADMIN_DENIALS[reason],
});

/** The bearer token from the Authorization header, or '' when there is none. */
export function bearerToken(request: Request): string {
  return (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

export async function authorizeAdmin(
  client: AdminAuthorizationClient,
  token: string,
): Promise<AdminAuthorization> {
  if (!token) return deny('sign-in');
  try {
    // Always pass the token: an Edge Function has no stored session, so
    // getUser() without one fails before it ever asks the Auth server.
    const { data: userData, error: userError } = await client.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) return deny('sign-in');
    // getClaims verifies the token itself rather than trusting decoded metadata.
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data || data.claims.sub !== userId) return deny('sign-in');
    if (data.claims.aal !== 'aal2') return deny('mfa');
    const { data: member, error: memberError } = await client.findAdmin(userId);
    if (memberError) return deny('unavailable');
    if (!member || member.user_id !== userId) return deny('not-admin');
    return { authorized: true, userId };
  } catch {
    // Network failures, or an SDK without getClaims: fail closed.
    return deny('unavailable');
  }
}

/** authorizeAdmin for an incoming request, using the function's service-role client. */
export function authorizeAdminRequest(admin: ServiceRoleClient, request: Request): Promise<AdminAuthorization> {
  return authorizeAdmin(
    {
      auth: admin.auth,
      findAdmin: (userId) => admin.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
    },
    bearerToken(request),
  );
}
