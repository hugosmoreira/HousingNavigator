export const MAX_CHECKER_RESPONSE_BYTES = 3_000_000;
export const MAX_CHECKER_REDIRECTS = 5;

type DnsRecordType = 'A' | 'AAAA';
export type DnsResolver = (hostname: string, recordType: DnsRecordType) => Promise<string[]>;

interface PublicFetchOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  resolveDns?: DnsResolver;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function parseIpv6(hostname: string): number[] | null {
  let value = hostname.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!value.includes(':')) return null;

  const dotted = value.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const ipv4 = parseIpv4(dotted[2]);
    if (!ipv4) return null;
    value = `${dotted[1]}${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  if ((value.match(/::/g) ?? []).length > 1) return null;
  const [leftRaw, rightRaw = ''] = value.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const missing = value.includes('::') ? 8 - left.length - right.length : 0;
  if (missing < 0 || (!value.includes('::') && left.length !== 8)) return null;
  const parts = [...left, ...Array(missing).fill('0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

export function isBlockedNetworkAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4) {
    const [a, b] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  const ipv6 = parseIpv6(address);
  if (!ipv6) return false;
  const [first] = ipv6;
  const allZero = ipv6.every((part) => part === 0);
  const loopback = ipv6.slice(0, 7).every((part) => part === 0) && ipv6[7] === 1;
  const uniqueLocal = (first & 0xfe00) === 0xfc00;
  const linkLocal = (first & 0xffc0) === 0xfe80;
  const siteLocal = (first & 0xffc0) === 0xfec0;
  const multicast = (first & 0xff00) === 0xff00;
  const ipv4Mapped = ipv6.slice(0, 5).every((part) => part === 0) && ipv6[5] === 0xffff;
  const ipv4Compatible = ipv6.slice(0, 6).every((part) => part === 0);
  if (ipv4Mapped || ipv4Compatible) {
    const mapped = `${ipv6[6] >> 8}.${ipv6[6] & 0xff}.${ipv6[7] >> 8}.${ipv6[7] & 0xff}`;
    return isBlockedNetworkAddress(mapped);
  }
  return allZero || loopback || uniqueLocal || linkLocal || siteLocal || multicast;
}

export function validateOutboundHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('invalid outbound URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('unsupported outbound URL scheme');
  }
  if (parsed.username || parsed.password) {
    throw new Error('outbound URL credentials are not allowed');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home.arpa') ||
    isBlockedNetworkAddress(hostname)
  ) {
    throw new Error('private or local outbound destination is not allowed');
  }
  return parsed;
}

const defaultDnsResolver: DnsResolver = async (hostname, recordType) => {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { resolveDns?: DnsResolver };
  };
  const resolveDns = runtime.Deno?.resolveDns;
  if (!resolveDns) {
    throw new Error('DNS validation is unavailable');
  }
  return await resolveDns(hostname, recordType);
};

export async function assertPublicDestination(
  rawUrl: string,
  resolveDns: DnsResolver = defaultDnsResolver,
): Promise<URL> {
  const parsed = validateOutboundHttpUrl(rawUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (parseIpv4(hostname) || parseIpv6(hostname)) return parsed;

  const results = await Promise.allSettled([
    resolveDns(hostname, 'A'),
    resolveDns(hostname, 'AAAA'),
  ]);
  const addresses = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  );
  if (addresses.length === 0) throw new Error('outbound destination DNS lookup failed');
  if (addresses.some(isBlockedNetworkAddress)) {
    throw new Error('outbound destination resolves to a private or local address');
  }
  return parsed;
}

export async function readResponseTextLimited(
  response: Response,
  maxBytes = MAX_CHECKER_RESPONSE_BYTES,
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`page too large (${declaredLength} bytes)`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel('response byte limit exceeded').catch(() => undefined);
        throw new Error(`page too large (more than ${maxBytes} bytes)`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function fetchPublicHttpText(
  rawUrl: string,
  options: PublicFetchOptions = {},
): Promise<{ text: string; finalUrl: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveDns = options.resolveDns ?? defaultDnsResolver;
  const maxRedirects = options.maxRedirects ?? MAX_CHECKER_REDIRECTS;
  let currentUrl = rawUrl;

  for (let redirects = 0; ; redirects += 1) {
    const parsed = await assertPublicDestination(currentUrl, resolveDns);
    const response = await fetchImpl(parsed.toString(), {
      signal: options.signal,
      redirect: 'manual',
      headers: options.headers,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      if (redirects >= maxRedirects) throw new Error('too many redirects');
      const location = response.headers.get('location');
      if (!location) throw new Error(`HTTP ${response.status} redirect missing location`);
      currentUrl = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return {
      text: await readResponseTextLimited(
        response,
        options.maxBytes ?? MAX_CHECKER_RESPONSE_BYTES,
      ),
      finalUrl: parsed.toString(),
    };
  }
}

function normalizeEvidence(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
}

export function verifyEvidenceQuote(pageText: string, candidate: string): string | null {
  const trimmed = candidate.trim();
  const normalizedCandidate = normalizeEvidence(trimmed);
  if (!normalizedCandidate || !normalizeEvidence(pageText).includes(normalizedCandidate)) {
    return null;
  }
  return trimmed.slice(0, 1000);
}

export function buildAdminNudgePayloads<T extends Record<string, unknown>>(
  emails: string[],
  sharedPayload: T,
): Array<T & { to: string }> {
  return [...new Set(emails)].map((to) => ({ ...sharedPayload, to }));
}
