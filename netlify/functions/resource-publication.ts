import { programFromResourceRow } from '../../src/services/data/mappers';
import type { ResourceRow } from '../../src/services/data/dbTypes';
import {
  PUBLICATION_MANIFEST_PATH, publicationDigest, publicationStatus, resourceDigests,
  type PublicationManifest, type PublicationRequest,
} from '../../src/lib/resourcePublication';

const productionOrigin = 'https://housingnavigator.us';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export function validBuildHook(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://api.netlify.com' &&
      /^\/build_hooks\/[a-f0-9]{24}$/.test(url.pathname) &&
      !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

export function createPublicationHandler(
  env: Record<string, string | undefined>, fetcher: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in as an administrator.' }, 401);
    const supabase = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
    const apikey = env.VITE_SUPABASE_ANON_KEY;
    if (!supabase || !apikey) return json({ error: 'Publication service is not configured.' }, 503);
    const hook = env.RESOURCE_PUBLISH_BUILD_HOOK;
    // The hook is configured only for production. CONTEXT is build-time only;
    // additionally refuse refresh requests served from preview/local origins.
    const configured = [productionOrigin, 'https://www.housingnavigator.us'].includes(new URL(request.url).origin) && validBuildHook(hook);
    const api = async (path: string, body?: unknown, publicRead = false) => {
      const response = await fetcher(supabase + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { apikey, Authorization: publicRead ? 'Bearer ' + apikey : authorization,
          'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      if (!response.ok) throw new RequestError('Could not access publication data. Check your admin session and database setup.', response.status === 401 ? 401 : 503);
      return response.status === 204 ? null : response.json();
    };
    try {
      const bodyText = await request.text();
      if (bodyText.length > 100) throw new RequestError('Invalid publication request.', 400);
      let body: { action?: string };
      try { body = JSON.parse(bodyText); } catch { throw new RequestError('Invalid publication request.', 400); }
      if (!body || typeof body !== 'object' || Object.keys(body).some(k => k !== 'action') ||
        !['status', 'refresh'].includes(body.action ?? '')) throw new RequestError('Invalid publication request.', 400);
      await api('/auth/v1/user');
      if (await api('/rest/v1/rpc/is_admin', {}) !== true) throw new RequestError('Admin access required.', 403);
      if (body.action === 'refresh' && !configured) {
        throw new RequestError('Refresh is only configured on the production website. Your saved data is unchanged.', 503);
      }
      // Read only the anonymous public view, including every page, never drafts or internal notes.
      const rows: ResourceRow[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await api('/rest/v1/resources_public?select=*&published=eq.true&order=id&limit=500&offset=' + offset, undefined, true);
        if (!Array.isArray(page)) throw new Error('Invalid resource response');
        rows.push(...page);
        if (page.length < 500) break;
        if (offset >= 49_500) throw new Error('Resource snapshot limit reached');
      }
      const current = await resourceDigests(rows.map(programFromResourceRow));
      const digest = await publicationDigest(current);
      let manifest: PublicationManifest | null = null;
      try {
        const response = await fetcher(productionOrigin + PUBLICATION_MANIFEST_PATH + '?check=' + Date.now(), {
          signal: AbortSignal.timeout(10_000), cache: 'no-store',
        });
        if (response.ok) {
          const value = await response.json();
          if (value.version === 1 && typeof value.digest === 'string' && value.resources &&
            typeof value.resources === 'object') manifest = value;
        }
      } catch { /* Fail closed: missing evidence must never mean Live. */ }
      if (body.action === 'refresh') {
        const claim = await api('/rest/v1/rpc/claim_resource_publication_refresh', { p_digest: digest });
        if (claim.claimed) {
          let accepted = false;
          try {
            const url = new URL(hook!);
            url.searchParams.set('trigger_branch', 'main');
            url.searchParams.set('trigger_title', 'Admin resource publication');
            const response = await fetcher(url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ publication_request_id: claim.request_id }),
              signal: AbortSignal.timeout(10_000), redirect: 'error',
            });
            accepted = response.ok;
          } catch { /* Do not expose secret hook URLs or transport error details. */ }
          await api('/rest/v1/rpc/finish_resource_publication_refresh', {
            p_request_id: claim.request_id, p_outcome: accepted ? 'accepted' : 'failed',
          });
          if (!accepted) throw new RequestError('Your data is saved, but the website refresh failed. Retry in one minute.', 502);
        } else if (claim.reason === 'cooldown') {
          throw new RequestError('Your data is saved. Another refresh was just requested; retry in one minute to include these changes.', 429);
        }
      }
      const states = await api('/rest/v1/resource_publication_refresh?select=request_id,content_digest,requested_at,outcome&singleton=eq.true');
      const state = (states[0] ?? null) as PublicationRequest | null;
      return json({ ...publicationStatus(current, digest, manifest, state), configured });
    } catch (error) {
      return json({
        error: error instanceof RequestError ? error.message : 'Publication could not be checked. Your saved data is unchanged; retry from Resources.',
      }, error instanceof RequestError ? error.status : 503);
    }
  };
}
export default (request: Request) => createPublicationHandler(process.env)(request);
