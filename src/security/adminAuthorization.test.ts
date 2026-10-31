import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADMIN_DENIALS,
  authorizeAdmin,
  authorizeAdminRequest,
  bearerToken,
  type AdminAuthorizationClient,
  type ServiceRoleClient,
} from '../../supabase/functions/_shared/adminAuthorization.ts';
import { ADMIN_EDGE_FUNCTIONS, fakeDatabase, loadEdgeHandler } from './edgeHandlerHarness';

// Compile-time check that the real SDK auth client fits the helper, so
// getUser and getClaims keep the shapes the helper relies on.
const sdkAuth = (client: SupabaseClient): AdminAuthorizationClient['auth'] => client.auth;
void sdkAuth;

function client() {
  const getUser = vi.fn(async (_token: string) => ({
    data: { user: { id: 'admin-a' } as { id: string } | null },
    error: null as unknown,
  }));
  const getClaims = vi.fn(async (_token: string) => ({
    data: { claims: { sub: 'admin-a', aal: 'aal2' as unknown } } as
      { claims: { sub?: string; aal?: unknown } } | null,
    error: null as unknown,
  }));
  const findAdmin = vi.fn(async (userId: string) => ({
    data: { user_id: userId } as { user_id: string } | null,
    error: null as unknown,
  }));
  return { auth: { getUser, getClaims }, findAdmin };
}

const denial = (reason: keyof typeof ADMIN_DENIALS) => ({ authorized: false, reason, ...ADMIN_DENIALS[reason] });

describe('authorizeAdmin', () => {
  it('requires an accepted token, a matching subject, AAL2 and membership', async () => {
    const c = client();
    expect(await authorizeAdmin(c, 'exact-token')).toEqual({ authorized: true, userId: 'admin-a' });
    expect(c.auth.getUser).toHaveBeenCalledWith('exact-token');
    expect(c.auth.getClaims).toHaveBeenCalledWith('exact-token');
    expect(c.findAdmin).toHaveBeenCalledWith('admin-a');
  });

  it.each([undefined, null, '', 'aal1', 'AAL2', 'aal3', ['aal2'], { aal: 'aal2' }])(
    'asks for two-factor sign-in, before any database lookup, when aal is %j',
    async (aal) => {
      const c = client();
      c.auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'admin-a', aal } }, error: null });
      expect(await authorizeAdmin(c, 'token')).toEqual(denial('mfa'));
      expect(c.findAdmin).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty token without contacting any service', async () => {
    const c = client();
    expect(await authorizeAdmin(c, '')).toEqual(denial('sign-in'));
    expect(c.auth.getUser).not.toHaveBeenCalled();
  });

  it('does not trust a token Auth rejects', async () => {
    const c = client();
    c.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid JWT') });
    expect(await authorizeAdmin(c, 'forged')).toEqual(denial('sign-in'));
    expect(c.auth.getClaims).not.toHaveBeenCalled();
    expect(c.findAdmin).not.toHaveBeenCalled();
  });

  it('rejects failed claim verification and a subject that names someone else', async () => {
    const failed = client();
    failed.auth.getClaims.mockResolvedValue({ data: null, error: new Error('signature rejected') });
    expect(await authorizeAdmin(failed, 'token')).toEqual(denial('sign-in'));
    expect(failed.findAdmin).not.toHaveBeenCalled();

    const mismatch = client();
    mismatch.auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'other-user', aal: 'aal2' } }, error: null });
    expect(await authorizeAdmin(mismatch, 'token')).toEqual(denial('sign-in'));
    expect(mismatch.findAdmin).not.toHaveBeenCalled();
  });

  it('gives a two-factor session no authority without an admin_users row', async () => {
    const c = client();
    c.findAdmin.mockResolvedValue({ data: null, error: null });
    expect(await authorizeAdmin(c, 'token')).toEqual(denial('not-admin'));
    c.findAdmin.mockResolvedValue({ data: { user_id: 'someone-else' }, error: null });
    expect(await authorizeAdmin(c, 'token')).toEqual(denial('not-admin'));
  });

  it('fails closed when the lookup fails, a service throws, or getClaims is missing', async () => {
    const lookup = client();
    lookup.findAdmin.mockResolvedValue({ data: null, error: new Error('database unavailable') });
    expect(await authorizeAdmin(lookup, 'token')).toEqual(denial('unavailable'));

    const network = client();
    network.auth.getUser.mockRejectedValue(new Error('network failure'));
    expect(await authorizeAdmin(network, 'token')).toEqual(denial('unavailable'));

    const oldSdk = client();
    const auth = { getUser: oldSdk.auth.getUser } as unknown as AdminAuthorizationClient['auth'];
    expect(await authorizeAdmin({ auth, findAdmin: oldSdk.findAdmin }, 'token')).toEqual(denial('unavailable'));
    expect(oldSdk.findAdmin).not.toHaveBeenCalled();
  });
});

describe('bearerToken and authorizeAdminRequest', () => {
  const request = (authorization?: string) =>
    new Request('https://edge.example/fn', { headers: authorization ? { authorization } : {} });

  it('reads only a bearer token', () => {
    expect(bearerToken(request('Bearer  abc.def.ghi '))).toBe('abc.def.ghi');
    expect(bearerToken(request('bearer abc'))).toBe('abc');
    expect(bearerToken(request())).toBe('');
  });

  it('looks up membership for the verified user only', async () => {
    const database = fakeDatabase({ admin_users: [{ user_id: 'admin-1' }, { user_id: 'admin-2' }] });
    const result = await authorizeAdminRequest(
      database.client as unknown as ServiceRoleClient,
      request('Bearer token'),
    );
    expect(result).toEqual({ authorized: true, userId: 'admin-1' });
    expect(database.queries).toEqual([
      expect.objectContaining({
        table: 'admin_users',
        operation: 'select',
        columns: 'user_id',
        filters: [{ method: 'eq', column: 'user_id', value: 'admin-1' }],
      }),
    ]);
  });
});

// One request per function that passes authorization and then stops at input
// validation, so the gate is exercised without any outbound work.
const AFTER_GATE: Record<(typeof ADMIN_EDGE_FUNCTIONS)[number], { body: unknown; status: number }> = {
  'admin-users': { body: { action: 'not-an-action' }, status: 400 },
  'check-resource-sources': { body: {}, status: 400 },
  'check-waitlist-status': { body: { waitlist_id: 'no-such-waitlist' }, status: 404 },
  'curate-resources': { body: { run_id: 'not-a-uuid' }, status: 400 },
  'geocode-address': { body: {}, status: 400 },
  'send-waitlist-alert': { body: {}, status: 400 },
};

function adminRequest(body: unknown) {
  return new Request('https://edge.example/function', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer fake-admin-jwt' },
    body: JSON.stringify(body),
  });
}

describe.each(ADMIN_EDGE_FUNCTIONS)('%s requires two-factor sign-in', (name) => {
  const admins = () => fakeDatabase({ admin_users: [{ user_id: 'admin-1' }], waitlists: [] });

  it('refuses a password-only (AAL1) admin session before any database or outbound work', async () => {
    const harness = loadEdgeHandler(name, { database: admins() });
    harness.database.client.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: 'admin-1', aal: 'aal1' } },
      error: null,
    });
    const response = await harness.handler(adminRequest(AFTER_GATE[name].body));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ADMIN_DENIALS.mfa.message });
    expect(harness.database.client.auth.getClaims).toHaveBeenCalledWith('fake-admin-jwt');
    expect(harness.database.queries).toEqual([]);
    expect(harness.database.client.rpc).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.model).not.toHaveBeenCalled();
  });

  it('lets an AAL2 admin past the gate', async () => {
    const harness = loadEdgeHandler(name, { database: admins() });
    const response = await harness.handler(adminRequest(AFTER_GATE[name].body));
    expect(response.status).toBe(AFTER_GATE[name].status);
    expect(harness.database.queries[0]).toMatchObject({ table: 'admin_users', operation: 'select' });
    expect(harness.fetch).not.toHaveBeenCalled();
  });
});

describe('admin Edge Function sources', () => {
  // Normalized because Windows checkouts may use CRLF line endings.
  const source = (name: string) =>
    readFileSync(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8')
      .replace(/\r\n/g, '\n');

  it.each(ADMIN_EDGE_FUNCTIONS)('%s authorizes people only through the shared helper', (name) => {
    const code = source(name);
    expect(code).toContain("from '../_shared/adminAuthorization.ts'");
    expect(code).toMatch(/await authorizeAdminRequest\(admin, ?(req|request)\);\n\s*if \(!access\.authorized\)/);
    expect(code).not.toContain('auth.getUser(');
  });
});
