import { describe, it, expect } from 'vitest';
import { publicationDigest, publicationStatus, resourceDigests, type PublicationManifest, type PublicationRequest } from './resourcePublication';
import { STATIC_PROGRAMS } from '../services/data/staticDataService';
import { createPublicationHandler, validBuildHook } from '../../netlify/functions/resource-publication';
import { programFromResourceRow } from '../services/data/mappers';
import type { ResourceRow } from '../services/data/dbTypes';

const current = { one: 'a', two: 'b' };
const manifest: PublicationManifest = {
  version: 1, generated_at: '2026-09-04T00:00:00Z', digest: 'current',
  resources: { one: { digest: 'a', path: '/resources/one/' }, two: { digest: 'b', path: '/resources/two/' } },
};
const now = Date.parse('2026-09-04T01:00:00Z');
const pending: PublicationRequest = { request_id: 'id', content_digest: 'current', requested_at: new Date(now).toISOString(), outcome: 'accepted' };
describe('truthful publication status', () => {
  it('requires deployed content, not a build receipt, to show Live', () => {
    expect(publicationStatus(current, 'current', null, pending, now).state).toBe('publishing');
    expect(publicationStatus(current, 'current', manifest, pending, now).state).toBe('live');
  });
  it('times out without claiming success', () => {
    expect(publicationStatus(current, 'current', null, pending, now + 16 * 60_000).state).toBe('needs_attention');
  });
  it('does not attach later edits to a build for older content', () => {
    expect(publicationStatus({ one: 'edited' }, 'new', manifest, pending, now).state).toBe('needs_attention');
  });
  it('reports removal pending even when remaining resource pages match', () => {
    const result = publicationStatus({ one: 'a' }, 'removed', manifest, null, now);
    expect(result.state).toBe('needs_attention'); expect(result.removed_count).toBe(1);
    expect(result.resources.one).toBe('live');
  });
  it('retains Live evidence even if an unnecessary subsequent refresh fails', () => {
    expect(publicationStatus(current, 'current', manifest, { ...pending, outcome: 'failed' }, now).state).toBe('live');
  });
  it('hashes stable objects but detects actual changes and area order', async () => {
    expect(await publicationDigest({ a: 1, b: 2 })).toBe(await publicationDigest({ b: 2, a: 1 }));
    expect(await publicationDigest(['OR', 'WA'])).not.toBe(await publicationDigest(['WA', 'OR']));
    const program = STATIC_PROGRAMS[0];
    expect(await resourceDigests([program])).toEqual(await resourceDigests([{ ...program, route_id: 'old-alias' }]));
    expect(await resourceDigests([program])).not.toEqual(await resourceDigests([{ ...program, phone: '211' }]));
  });
});

const row = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Public example',
  category: 'rent_assistance', county: 'Multnomah', state: 'OR',
  who_it_helps: [], service_tags: [], service_areas: [{ state: 'OR', county: 'Multnomah' }],
  priority_score: 0, published: true,
} as ResourceRow;
const env = {
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'public-anon',
  RESOURCE_PUBLISH_BUILD_HOOK: 'https://api.netlify.com/build_hooks/000000000000000000000000',
};
function fixture(options: { admin?: boolean; hookFail?: boolean; duplicate?: boolean; cooldown?: boolean; live?: boolean; missingHook?: boolean; invalidToken?: boolean } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let state: PublicationRequest | null = null;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.endsWith('/auth/v1/user')) return response({ id: 'admin' }, options.invalidToken ? 401 : 200);
    if (url.endsWith('/rpc/is_admin')) return response(options.admin !== false);
    if (url.includes('/resources_public?')) return response([row]);
    if (url.includes('/.well-known/')) {
      if (!options.live) return response({}, 404);
      const digests = await resourceDigests([programFromResourceRow(row)]);
      return response({ version: 1, digest: await publicationDigest(digests),
        resources: { [row.id]: { digest: digests[row.id], path: '/resources/example/' } } });
    }
    if (url.includes('claim_resource_publication_refresh')) {
      if (options.cooldown) return response({ claimed: false, reason: 'cooldown' });
      if (options.duplicate) return response({ claimed: false, reason: 'already_requested' });
      state = { request_id: 'claimed-id', content_digest: JSON.parse(String(init?.body)).p_digest,
        requested_at: new Date().toISOString(), outcome: 'requested' };
      return response({ claimed: true, request_id: 'claimed-id' });
    }
    if (url.includes('/build_hooks/')) {
      if (options.hookFail) throw new Error('SECRET URL: ' + env.RESOURCE_PUBLISH_BUILD_HOOK);
      return response({}); // Acceptance is NOT deployed success.
    }
    if (url.includes('finish_resource_publication_refresh')) {
      if (state) state.outcome = JSON.parse(String(init?.body)).p_outcome;
      return new Response(null, { status: 204 });
    }
    if (url.includes('/resource_publication_refresh?')) return response(state ? [state] : []);
    throw new Error('Unexpected request ' + url);
  };
  const handler = createPublicationHandler({ ...env, RESOURCE_PUBLISH_BUILD_HOOK: options.missingHook ? '' : env.RESOURCE_PUBLISH_BUILD_HOOK }, fetcher as typeof fetch);
  const run = (action = 'status', authorization = 'Bearer test-token', origin = 'https://housingnavigator.us') =>
    handler(new Request(origin + '/.netlify/functions/resource-publication', {
      method: 'POST', headers: authorization ? { authorization } : {}, body: JSON.stringify({ action }),
    }));
  return { run, calls, handler };
}
describe('admin publication endpoint', () => {
  it.each([{ admin: false }, { invalidToken: true }])('rejects invalid/non-admin sessions before public data or hook access %j', async options => {
    const f = fixture(options); const result = await f.run('refresh');
    expect([401, 403]).toContain(result.status);
    expect(f.calls.some(c => c.url.includes('/resources_public?') || c.url.includes('build_hooks'))).toBe(false);
  });
  it('requires a bearer token and POST', async () => {
    const f = fixture();
    expect((await f.run('refresh', '')).status).toBe(401);
    expect((await f.handler(new Request('https://housingnavigator.us/'))).status).toBe(405);
    expect(f.calls).toHaveLength(0);
  });
  it('status is read-only, live evidence includes exact current public content', async () => {
    const f = fixture({ live: true });
    expect((await (await f.run()).json()).state).toBe('live');
    expect(f.calls.some(c => c.url.includes('claim_') || c.url.includes('build_hooks'))).toBe(false);
    const read = f.calls.find(c => c.url.includes('/resources_public?'));
    expect((read?.init?.headers as Record<string, string>).Authorization).toBe('Bearer public-anon');
  });
  it('starts one server-side build and shows Publishing, never Live on acceptance', async () => {
    const f = fixture();
    expect((await (await f.run('refresh')).json()).state).toBe('publishing');
    expect(f.calls.filter(c => c.url.includes('build_hooks'))).toHaveLength(1);
    expect(f.calls.find(c => c.url.includes('build_hooks'))?.url).toContain('trigger_branch=main');
  });
  it('does not re-trigger a claimed duplicate', async () => {
    const f = fixture({ duplicate: true }); await f.run('refresh');
    expect(f.calls.some(c => c.url.includes('build_hooks'))).toBe(false);
  });
  it('tells the admin to retry later edits blocked by cooldown', async () => {
    const f = fixture({ cooldown: true }); expect((await f.run('refresh')).status).toBe(429);
    expect(f.calls.some(c => c.url.includes('build_hooks'))).toBe(false);
  });
  it('reports hook failure without leaking its URL or editing any resource', async () => {
    const f = fixture({ hookFail: true }); const result = await f.run('refresh');
    expect(result.status).toBe(502); expect(await result.text()).not.toContain('build_hooks');
    expect(f.calls.some(c => ['PATCH', 'DELETE', 'PUT'].includes(c.init?.method ?? ''))).toBe(false);
  });
  it('refuses unconfigured hooks and preview deployments', async () => {
    const f = fixture({ missingHook: true }); expect((await f.run('refresh')).status).toBe(503);
    const preview = fixture(); expect((await preview.run('refresh', 'Bearer test', 'https://deploy-preview-38--housingnavigatorus.netlify.app')).status).toBe(503);
    expect([...f.calls, ...preview.calls].some(c => c.url.includes('build_hooks'))).toBe(false);
  });
  it('rejects caller-supplied URLs and invalid actions', async () => {
    const f = fixture();
    const response = await f.handler(new Request('https://housingnavigator.us/', {
      method: 'POST', headers: { authorization: 'Bearer test' },
      body: JSON.stringify({ action: 'refresh', url: 'http://localhost' }),
    }));
    expect(response.status).toBe(400); expect((await f.run('delete')).status).toBe(400);
  });
  it.each(['http://api.netlify.com/build_hooks/000000000000000000000000',
    'https://api.netlify.com.attacker.test/build_hooks/000000000000000000000000',
    env.RESOURCE_PUBLISH_BUILD_HOOK + '?trigger_branch=other',
    'https://user:password@api.netlify.com/build_hooks/000000000000000000000000',
  ])('rejects unsafe hook config %s', value => expect(validBuildHook(value)).toBe(false));
});
