export function normalizeIdentityText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

/**
 * `label` names the row being processed (for example `waitlists.csv: "VHA"`)
 * so one malformed URL aborts the import with a message that says where.
 */
export function canonicalUrlIdentity(rawUrl: string | null | undefined, label?: string): string {
  const value = (rawUrl ?? '').trim();
  if (!value) return '';
  const where = label ? ` for ${label}` : '';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid identity URL${where}: ${value}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Identity URL must use http(s)${where}: ${value}`);
  }
  parsed.hash = '';
  return parsed.toString();
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function lossyUrlKey(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname.replace(/\/+$/, '');
    return slug(`${parsed.host}${path}`);
  } catch {
    return slug(rawUrl);
  }
}

export function lossyResourceKey(name: string, websiteOrSource: string): string {
  return [slug(name), lossyUrlKey(websiteOrSource)].filter(Boolean).join('__');
}

export function exactResourceIdentity(
  name: string,
  websiteOrSource: string,
  label?: string,
): string {
  return JSON.stringify([
    normalizeIdentityText(name),
    canonicalUrlIdentity(websiteOrSource, label),
  ]);
}

export function deterministicWaitlistId(
  authority: string,
  program: string,
  sourceUrl: string,
): string {
  return [slug(authority), slug(program), lossyUrlKey(sourceUrl)]
    .filter(Boolean)
    .join('__')
    .slice(0, 200);
}

export function exactWaitlistIdentity(
  authority: string,
  program: string | null | undefined,
  sourceUrl: string,
  label?: string,
): string {
  return JSON.stringify([
    normalizeIdentityText(authority),
    normalizeIdentityText(program),
    canonicalUrlIdentity(sourceUrl, label),
  ]);
}

export function assertCompatibleIdentity(
  key: string,
  firstIdentity: string,
  nextIdentity: string,
  firstLabel: string,
  nextLabel: string,
): void {
  if (firstIdentity === nextIdentity) return;
  throw new Error(
    `Ambiguous normalized key "${key}" maps to distinct identities: ${firstLabel} and ${nextLabel}`,
  );
}

/** Reads `--name value` or `--name=value` from a CLI argument list. */
export function cliOption(argv: readonly string[], name: string): string | undefined {
  const directIndex = argv.indexOf(name);
  if (directIndex >= 0) {
    const next = argv[directIndex + 1];
    return next && !next.startsWith('--') ? next : undefined;
  }
  const prefix = `${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function projectRefFromSupabaseUrl(rawUrl: string): string {
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  if (hostname.endsWith('.supabase.co')) return hostname.slice(0, -'.supabase.co'.length);
  return hostname;
}

export function assertApplyTarget(
  rawUrl: string,
  expectedProjectRef: string | undefined,
  confirmation: string | undefined,
): string {
  const actual = projectRefFromSupabaseUrl(rawUrl);
  if (!expectedProjectRef) throw new Error('--expected-project-ref is required with --apply');
  if (normalizeIdentityText(expectedProjectRef) !== normalizeIdentityText(actual)) {
    throw new Error(`Target project mismatch: expected ${expectedProjectRef}, URL resolves to ${actual}`);
  }
  const required = `APPLY:${actual}`;
  if (confirmation !== required) {
    throw new Error(`--confirm must exactly equal ${required}`);
  }
  return actual;
}
