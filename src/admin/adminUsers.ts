import { requireSupabase } from '../lib/supabaseClient';

export interface AdminUserSummary {
  id: string;
  email: string;
  display_name: string | null;
  home_county: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
  saved_resource_count: number;
  waitlist_alert_count: number;
}

export interface AdminUserPage {
  users: AdminUserSummary[];
  page: number;
  perPage: number;
  total: number;
}

export type AdminUserStatus = 'administrator' | 'blocked' | 'active' | 'invited';

export function isUserBlocked(
  bannedUntil: string | null,
  now = new Date(),
): boolean {
  if (!bannedUntil) return false;
  const timestamp = Date.parse(bannedUntil);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function adminUserStatus(
  user: Pick<AdminUserSummary, 'is_admin' | 'banned_until' | 'email_confirmed_at'>,
  now = new Date(),
): AdminUserStatus {
  if (user.is_admin) return 'administrator';
  if (isUserBlocked(user.banned_until, now)) return 'blocked';
  if (!user.email_confirmed_at) return 'invited';
  return 'active';
}

async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const client = await requireSupabase();
  const { data, error } = await client.functions.invoke('admin-users', { body });
  if (!error) return data as T;

  let detail = error.message || 'User administration request failed';
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const payload = (await context.clone().json()) as { error?: string };
      if (payload.error) detail = payload.error;
    } catch {
      detail = `User administration request failed (HTTP ${context.status})`;
    }
  }
  throw new Error(detail);
}

export function listAdminUsers(page = 1, perPage = 25): Promise<AdminUserPage> {
  return invokeAdminUsers<AdminUserPage>({ action: 'list', page, perPage });
}

export function inviteAdminUser(email: string): Promise<{ message: string }> {
  return invokeAdminUsers({ action: 'invite', email });
}

export function setAdminUserBlocked(
  userId: string,
  blocked: boolean,
): Promise<{ message: string }> {
  return invokeAdminUsers({ action: blocked ? 'block' : 'unblock', userId });
}

export function deleteAdminUser(
  userId: string,
  confirmEmail: string,
): Promise<{ message: string }> {
  return invokeAdminUsers({ action: 'delete', userId, confirmEmail });
}
