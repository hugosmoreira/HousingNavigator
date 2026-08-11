export const ADMIN_LOGIN_DESTINATION = '/admin/dashboard';
export const DEFAULT_PUBLIC_LOGIN_DESTINATION = '/dashboard';

export function resolvePublicLoginTarget(from?: string): string {
  if (
    from &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.startsWith('/admin')
  ) {
    return from;
  }
  return DEFAULT_PUBLIC_LOGIN_DESTINATION;
}

export function resolvePostLoginDestination({
  hasSession,
  isAdmin,
  publicTarget,
}: {
  hasSession: boolean;
  isAdmin: boolean;
  publicTarget: string;
}): string | null {
  if (!hasSession) return null;
  return isAdmin ? ADMIN_LOGIN_DESTINATION : publicTarget;
}
