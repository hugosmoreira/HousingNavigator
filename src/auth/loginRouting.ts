export const ADMIN_LOGIN_DESTINATION = '/admin/dashboard';
export const DEFAULT_PUBLIC_LOGIN_DESTINATION = '/dashboard';

// A placeholder origin for parsing; only paths that stay on it are accepted.
const SAME_ORIGIN_BASE = 'https://housing-navigator.invalid';

/**
 * Where to send a visitor after public sign-in. Only same-site paths are
 * allowed. Browsers treat `/\host` like `//host` and drop tabs and
 * newlines inside URLs, so those are rejected before parsing, and the
 * parsed result must still be on the same origin and outside /admin.
 */
export function resolvePublicLoginTarget(from?: string): string {
  if (
    !from ||
    !from.startsWith('/') ||
    from.startsWith('//') ||
    from.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(from)
  ) {
    return DEFAULT_PUBLIC_LOGIN_DESTINATION;
  }
  let parsed: URL;
  try {
    parsed = new URL(from, SAME_ORIGIN_BASE);
  } catch {
    return DEFAULT_PUBLIC_LOGIN_DESTINATION;
  }
  if (parsed.origin !== SAME_ORIGIN_BASE || parsed.pathname.startsWith('/admin')) {
    return DEFAULT_PUBLIC_LOGIN_DESTINATION;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
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
