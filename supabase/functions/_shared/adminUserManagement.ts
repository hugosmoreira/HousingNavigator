const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_ADMIN_USER_PAGE_SIZE = 50;

export function normalizeAdminEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : '';
}

export function validAdminEmail(value: unknown): boolean {
  const email = normalizeAdminEmail(value);
  return Boolean(email && email.length <= 320 && EMAIL_PATTERN.test(email));
}

export function validAdminUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function normalizeAdminUserPage(
  pageValue: unknown,
  perPageValue: unknown,
): { page: number; perPage: number } {
  return {
    page: Math.max(1, Math.floor(Number(pageValue) || 1)),
    perPage: Math.min(
      MAX_ADMIN_USER_PAGE_SIZE,
      Math.max(1, Math.floor(Number(perPageValue) || 25)),
    ),
  };
}

export function countAdminRowsByUser(
  rows: Array<{ user_id: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  return counts;
}

export function adminDeleteConfirmationMatches(
  expectedEmail: unknown,
  confirmation: unknown,
): boolean {
  const expected = normalizeAdminEmail(expectedEmail);
  return Boolean(expected && normalizeAdminEmail(confirmation) === expected);
}
