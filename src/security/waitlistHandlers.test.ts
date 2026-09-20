import { describe, expect, it, vi } from 'vitest';
import { fakeDatabase, loadEdgeHandler } from './edgeHandlerHarness';

const OLD_TOKEN = '11111111-1111-4111-8111-111111111111';
const OTHER_TOKEN = '22222222-2222-4222-8222-222222222222';
const PUBLIC_URL = 'https://housing.example/status';
const INTERNAL_SECRET = 'fake-internal-secret-for-handler-tests';
const waitlist = {
  id: 'waitlist-1', housing_authority: 'Example Housing', program_name: 'Housing Choice Voucher',
  county: 'Example', city: null, state: 'CA', status: 'closed', published: true,
  source_url: PUBLIC_URL, application_link: null, check_failures: 0,
  auto_check_enabled: true, last_auto_check_at: null,
  last_checked: '2020-01-01', public_notes: null,
};
const alertBody = { waitlist_id: waitlist.id, previous_status: 'closed', new_status: 'open' };
const publicDns = async (_host: string, type: 'A' | 'AAAA') => type === 'A' ? ['93.184.216.34'] : [];
const page = (status = 'closed') => `<html><body><p>Applications are ${status}.</p><p>${
  'Please contact the housing authority for information about this waiting list and application requirements. '.repeat(5)
}</p></body></html>`;

function post(body: unknown, auth: 'admin' | 'internal' | 'none' = 'admin') {
  return new Request('https://edge.example/function', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth === 'admin' ? { authorization: 'Bearer fake-admin-jwt' } : {}),
      ...(auth === 'internal' ? { 'x-internal-secret': INTERNAL_SECRET } : {}),
    },
    body: JSON.stringify(body),
  });
}

function checker(options: {
  row?: Partial<typeof waitlist>;
  fetch?: typeof fetch;
  resolveDns?: typeof publicDns;
  classification?: { status: string; confidence: number; evidence: string };
  mail?: boolean;
  batchSize?: number;
} = {}) {
  const database = fakeDatabase({
    admin_users: [{ user_id: 'admin-1' }],
    waitlists: [{ ...waitlist, ...options.row }],
    waitlist_status_suggestions: [], waitlist_status_checks: [], profiles: [],
  });
  const harness = loadEdgeHandler('check-waitlist-status', {
    database, fetch: options.fetch, resolveDns: options.resolveDns ?? publicDns,
    env: {
      ...(options.mail ? { RESEND_API_KEY: 'fake-resend-key' } : {}),
      ...(options.batchSize ? { CHECK_BATCH_SIZE: String(options.batchSize) } : {}),
    },
  });
  harness.model.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(options.classification ?? {
      status: 'closed', confidence: 0.95, evidence: 'Applications are closed.',
    }) }],
  });
  return harness;
}

function sender() {
  const database = fakeDatabase({
    admin_users: [{ user_id: 'admin-1' }], waitlists: [{ ...waitlist, status: 'open' }],
    waitlist_alerts: [{ waitlist_id: waitlist.id, user_id: 'subscriber-1', notify_on_open: true, notify_on_status_change: false }],
    profiles: [{ id: 'subscriber-1', email: 'subscriber@example.com', display_name: null, email_notifications_enabled: true, unsubscribe_token: OLD_TOKEN }],
    notification_events: [],
  });
  return loadEdgeHandler('send-waitlist-alert', {
    database,
    env: { RESEND_API_KEY: 'fake-resend-key' },
    fetch: async (input) => {
      if (String(input) !== 'https://api.resend.com/emails') throw new Error('Unexpected mail endpoint');
      return new Response('{}', { status: 200 });
    },
  });
}

function writes(harness: ReturnType<typeof loadEdgeHandler>, table?: string) {
  return harness.database.queries.filter((q) => q.operation !== 'select' && (!table || q.table === table));
}

function expectNoFreshnessOrStatusChange(harness: ReturnType<typeof loadEdgeHandler>) {
  for (const query of writes(harness, 'waitlists')) {
    expect(query.values).not.toHaveProperty('status');
    expect(query.values).not.toHaveProperty('last_checked');
  }
  expect(harness.database.tables.waitlists[0]).toMatchObject({ status: 'closed', last_checked: '2020-01-01' });
}

describe.each(['check-waitlist-status', 'send-waitlist-alert'] as const)('%s authorization boundary', (name) => {
  it.each(['missing', 'invalid', 'non-admin'] as const)('denies %s credentials before work', async (kind) => {
    const harness = loadEdgeHandler(name, { database: fakeDatabase({ admin_users: [] }) });
    if (kind === 'invalid') {
      harness.database.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
    }
    const response = await harness.handler(post(alertBody, kind === 'missing' ? 'none' : 'admin'));
    expect(response.status).toBe(kind === 'non-admin' ? 403 : 401);
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.resolveDns).not.toHaveBeenCalled();
    expect(harness.model).not.toHaveBeenCalled();
    expect(harness.database.client.rpc).not.toHaveBeenCalled();
    expect(writes(harness)).toEqual([]);
    expect(harness.database.queries.every((q) => q.table === 'admin_users')).toBe(true);
    if (kind !== 'missing') expect(harness.database.client.auth.getUser).toHaveBeenCalledWith('fake-admin-jwt');
  });

  it('does not accept an incorrect internal secret as authorization', async () => {
    const harness = loadEdgeHandler(name);
    const request = post(alertBody, 'none');
    request.headers.set('x-internal-secret', `${INTERNAL_SECRET}-wrong`);
    expect((await harness.handler(request)).status).toBe(401);
    expect(writes(harness)).toEqual([]);
    expect(harness.fetch).not.toHaveBeenCalled();
  });
});

describe('check-waitlist-status real handler', () => {
  it.each([
    'http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.4/private', 'http://2130706433/admin', 'http://0x7f000001/admin',
    'http://127.1/admin', 'http://[::1]/admin', 'http://[::ffff:127.0.0.1]/admin',
    'http://localhost/admin', 'http://metadata.google.internal/computeMetadata/v1/',
  ])('rejects %s without target fetch or model invocation', async (url) => {
    const harness = checker({ row: { source_url: url } });
    const response = await harness.handler(post({ waitlist_id: waitlist.id }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checked: 1, failed: 1, confirmed: 0, suggested: 0 });
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.model).not.toHaveBeenCalled();
    expect(harness.database.tables.waitlist_status_checks).toEqual([expect.objectContaining({ action: 'fetch_failed' })]);
    expect(writes(harness, 'waitlist_status_suggestions')).toEqual([]);
    expectNoFreshnessOrStatusChange(harness);
  });

  it('rejects a hostname with mixed public A and private AAAA answers', async () => {
    const harness = checker({ resolveDns: async (_host, type) => type === 'A' ? ['93.184.216.34'] : ['fd00::1'] });
    expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ failed: 1 });
    expect(harness.resolveDns).toHaveBeenCalledWith('housing.example', 'A');
    expect(harness.resolveDns).toHaveBeenCalledWith('housing.example', 'AAAA');
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.model).not.toHaveBeenCalled();
  });

  it.each(['http://169.254.169.254/latest/meta-data/', 'https://private-dns.example/status'])(
    'revalidates redirect destination %s before a second fetch', async (target) => {
      const harness = checker({
        resolveDns: async (host, type) => host === 'private-dns.example' ? ['10.1.2.3'] : publicDns(host, type),
        fetch: async () => new Response(null, { status: 302, headers: { location: target } }),
      });
      expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ failed: 1 });
      expect(harness.fetch).toHaveBeenCalledTimes(1);
      expect(harness.fetch).toHaveBeenCalledWith(PUBLIC_URL, expect.objectContaining({ redirect: 'manual' }));
      expect(harness.model).not.toHaveBeenCalled();
      expectNoFreshnessOrStatusChange(harness);
    },
  );

  it('rejects declared oversized pages before reading their body', async () => {
    const oversized = new Response(page(), { headers: { 'content-length': '3000001' } });
    const getReader = vi.spyOn(oversized.body!, 'getReader');
    const readText = vi.spyOn(oversized, 'text');
    const harness = checker({ fetch: async () => oversized });
    expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ failed: 1 });
    expect(getReader).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
    expect(harness.model).not.toHaveBeenCalled();
    expect(harness.database.tables.waitlist_status_checks[0]).toMatchObject({ action: 'fetch_failed', error: expect.stringContaining('page too large') });
  });

  it('cancels an oversized streamed body without invoking the model', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_500_001));
        controller.enqueue(new Uint8Array(1_500_001));
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
      cancel,
    });
    const harness = checker({ fetch: async () => new Response(stream) });
    expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ failed: 1 });
    expect(cancel).toHaveBeenCalledWith('response byte limit exceeded');
    expect(harness.model).not.toHaveBeenCalled();
    expectNoFreshnessOrStatusChange(harness);
  });

  it('follows a public redirect and confirms the same status without republishing it', async () => {
    const harness = checker({
      row: { check_failures: 2 },
      fetch: async (input) => String(input) === PUBLIC_URL
        ? new Response(null, { status: 302, headers: { location: 'https://official.example/waitlist' } })
        : new Response(page()),
    });
    harness.database.tables.waitlist_status_suggestions.push({ id: 'pending-1', waitlist_id: waitlist.id, status: 'pending' });
    const response = await harness.handler(post({ waitlist_id: waitlist.id }));
    expect(await response.json()).toMatchObject({ checked: 1, confirmed: 1, suggested: 0, failed: 0 });
    expect(harness.fetch.mock.calls.map(([url]) => String(url))).toEqual([PUBLIC_URL, 'https://official.example/waitlist']);
    expect(harness.resolveDns).toHaveBeenCalledWith('official.example', 'A');
    expect(harness.fetch.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true);
    expect(harness.model).toHaveBeenCalledOnce();
    expect(harness.database.tables.waitlists[0]).toMatchObject({ status: 'closed', check_failures: 0, last_checked: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(harness.database.tables.waitlists[0].last_checked).not.toBe('2020-01-01');
    expect(writes(harness, 'waitlists').every((q) => !Object.hasOwn(q.values!, 'status'))).toBe(true);
    expect(harness.database.tables.waitlist_status_suggestions[0].status).toBe('superseded');
    expect(harness.database.tables.waitlist_status_checks[0]).toMatchObject({ action: 'confirmed', evidence_verified: true, evidence: 'Applications are closed.' });
  });

  it.each(['closed', 'open'])('treats fabricated evidence for %s as uncertain without freshness or suggestion writes', async (status) => {
    const harness = checker({
      fetch: async () => new Response(page()),
      classification: { status, confidence: 0.99, evidence: 'The fabricated quote does not occur on this page.' },
    });
    expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ uncertain: 1, confirmed: 0, suggested: 0 });
    expect(harness.model).toHaveBeenCalledOnce();
    expectNoFreshnessOrStatusChange(harness);
    expect(writes(harness, 'waitlist_status_suggestions')).toEqual([]);
    expect(harness.database.tables.waitlist_status_checks[0]).toMatchObject({ action: 'uncertain', detected_status: 'unknown', confidence: 0, evidence: '', evidence_verified: false });
  });

  it('queues a verified change for review and sends each admin a separate visible recipient', async () => {
    const harness = checker({
      mail: true,
      fetch: async (input) => new Response(String(input) === PUBLIC_URL ? page('open') : '{}'),
      classification: { status: 'open', confidence: 0.95, evidence: 'Applications are open.' },
    });
    harness.database.tables.admin_users.push({ user_id: 'admin-2' }, { user_id: 'admin-3' });
    harness.database.tables.profiles.push(
      { id: 'admin-1', email: 'first-admin@example.com' },
      { id: 'admin-2', email: 'second-admin@example.com' },
      { id: 'admin-3', email: 'first-admin@example.com' },
    );
    expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ suggested: 1, confirmed: 0 });
    expectNoFreshnessOrStatusChange(harness);
    expect(harness.database.tables.waitlist_status_suggestions).toEqual([expect.objectContaining({
      waitlist_id: waitlist.id, previous_status: 'closed', suggested_status: 'open', evidence_verified: true,
    })]);
    const mail = harness.fetch.mock.calls.filter(([url]) => String(url) === 'https://api.resend.com/emails')
      .map(([, init]) => JSON.parse(String(init!.body)));
    expect(mail.map((payload) => payload.to).sort()).toEqual(['first-admin@example.com', 'second-admin@example.com']);
    for (const payload of mail) {
      expect(typeof payload.to).toBe('string');
      expect(payload).not.toHaveProperty('cc');
      expect(payload).not.toHaveProperty('bcc');
      const other = payload.to === 'first-admin@example.com' ? 'second-admin@example.com' : 'first-admin@example.com';
      expect(JSON.stringify(payload)).not.toContain(other);
    }
  });

  it('falls back to application_link only when source_url is null', async () => {
    const harness = checker({ row: { source_url: null, application_link: PUBLIC_URL }, fetch: async () => new Response(page()) });
    expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ confirmed: 1 });
    expect(harness.fetch).toHaveBeenCalledWith(PUBLIC_URL, expect.anything());
  });

  it('does not bypass an invalid non-null source_url using application_link', async () => {
    const harness = checker({ row: { source_url: 'javascript:invalid', application_link: PUBLIC_URL } });
    expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ failed: 1 });
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it('scheduled internal calls select only published, enabled, overdue rows in bounded oldest-first order', async () => {
    const harness = checker({ row: { last_auto_check_at: '2000-01-01T00:00:00.000Z' }, batchSize: 2, fetch: async () => new Response(page()) });
    harness.database.tables.waitlists.push(
      { ...waitlist, id: 'never-checked' },
      { ...waitlist, id: 'oldest-check', last_auto_check_at: '1999-01-01T00:00:00.000Z' },
      { ...waitlist, id: 'unpublished', published: false },
      { ...waitlist, id: 'disabled', auto_check_enabled: false },
      { ...waitlist, id: 'recent', last_auto_check_at: '2999-01-01T00:00:00.000Z' },
    );
    const body = await (await harness.handler(post({ source: 'cron' }, 'internal'))).json();
    expect(body).toMatchObject({ checked: 2, confirmed: 2, failed: 0 });
    expect(body.outcomes.map((outcome: { waitlistId: string }) => outcome.waitlistId)).toEqual(['never-checked', 'oldest-check']);
    expect(harness.fetch).toHaveBeenCalledTimes(2);
    expect(harness.database.client.auth.getUser).not.toHaveBeenCalled();
    expect(harness.database.tables.waitlists.filter((row) => row.last_checked !== '2020-01-01').map((row) => row.id).sort())
      .toEqual(['never-checked', 'oldest-check'].sort());
  });

  it('preserves the deployed unknown-to-unknown confirmation behavior without claiming verified evidence', async () => {
    const harness = checker({
      row: { status: 'unknown' }, fetch: async () => new Response(page()),
      classification: { status: 'unknown', confidence: 0.8, evidence: '' },
    });
    expect(await (await harness.handler(post({ waitlist_id: waitlist.id }))).json()).toMatchObject({ confirmed: 1 });
    expect(harness.database.tables.waitlist_status_checks[0]).toMatchObject({ action: 'confirmed', detected_status: 'unknown', evidence_verified: false });
    expect(harness.database.tables.waitlists[0].status).toBe('unknown');
  });
});

describe('send-waitlist-alert real handler', () => {
  it('atomically claims admin quota and dedupe before a legitimate send', async () => {
    const harness = sender();
    expect(await (await harness.handler(post(alertBody))).json()).toMatchObject({ sent_count: 1, failed_count: 0, audit_logged: true });
    expect(harness.database.client.rpc.mock.calls).toEqual([
      ['claim_admin_alert_invocation', { p_admin_user_id: 'admin-1', p_limit: 10 }],
      ['claim_waitlist_alert_send', { p_waitlist_id: waitlist.id, p_new_status: 'open' }],
    ]);
    expect(harness.database.client.rpc.mock.invocationCallOrder[1]).toBeLessThan(harness.fetch.mock.invocationCallOrder[0]);
    expect(harness.database.client.from).not.toHaveBeenCalledWith('alert_invocations');
    const payload = JSON.parse(String(harness.fetch.mock.calls[0][1]!.body));
    expect(payload).toMatchObject({ to: 'subscriber@example.com', headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
    expect(payload.headers['List-Unsubscribe']).toBe(`<https://database.example/functions/v1/unsubscribe-alerts?token=${OLD_TOKEN}>`);
    expect(harness.database.tables.notification_events).toEqual([expect.objectContaining({ user_id: 'subscriber-1', event_type: 'waitlist_status_change' })]);
  });

  it.each([
    { label: 'denied', data: false, error: null, status: 429 },
    { label: 'missing decision', data: null, error: null, status: 429 },
    { label: 'database failure', data: null, error: { message: 'quota unavailable' }, status: 500 },
  ])('fails closed on quota $label without a count/insert fallback', async ({ data, error, status }) => {
    const harness = sender();
    harness.database.rpcResults.claim_admin_alert_invocation = { data, error };
    const response = await harness.handler(post(alertBody));
    expect(response.status).toBe(status);
    expect(harness.database.client.rpc.mock.calls.map(([name]) => name)).toEqual(['claim_admin_alert_invocation']);
    expect(harness.database.client.from).not.toHaveBeenCalledWith('alert_invocations');
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(writes(harness)).toEqual([]);
  });

  it('exempts dry-runs and internal calls from admin quota without bypassing real-send dedupe', async () => {
    const harness = sender();
    expect(await (await harness.handler(post({ ...alertBody, dry_run: true }))).json()).toMatchObject({ subscriber_count: 1, would_send: 1 });
    expect(harness.database.client.rpc).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(writes(harness)).toEqual([]);

    harness.database.client.auth.getUser.mockClear();
    expect(await (await harness.handler(post(alertBody, 'internal'))).json()).toMatchObject({ sent_count: 1 });
    expect(harness.database.client.auth.getUser).not.toHaveBeenCalled();
    harness.database.rpcResults.claim_waitlist_alert_send = { data: false, error: null };
    expect(await (await harness.handler(post(alertBody, 'internal'))).json()).toEqual({ skipped: true, reason: 'duplicate within 24h' });
    expect(harness.database.client.rpc.mock.calls.map(([name]) => name)).toEqual(['claim_waitlist_alert_send', 'claim_waitlist_alert_send']);
    expect(harness.fetch).toHaveBeenCalledOnce();
    expect(harness.database.tables.notification_events).toHaveLength(1);
    expect(harness.database.client.from).not.toHaveBeenCalledWith('alert_invocations');
  });

  it.each(['admin', 'internal'] as const)('fails closed on dedupe errors for %s calls', async (auth) => {
    const harness = sender();
    harness.database.rpcResults.claim_waitlist_alert_send = { data: null, error: { message: 'claim unavailable' } };
    expect((await harness.handler(post(alertBody, auth))).status).toBe(500);
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(writes(harness)).toEqual([]);
  });

  it('honors per-waitlist preferences and master email opt-outs', async () => {
    const harness = sender();
    const extra = [
      { id: 'master-off', email: 'master-off@example.com', enabled: false, onOpen: true, onChange: true },
      { id: 'pref-off', email: 'pref-off@example.com', enabled: true, onOpen: false, onChange: false },
      { id: 'no-email', email: null, enabled: true, onOpen: true, onChange: true },
      { id: 'changes', email: 'changes@example.com', enabled: true, onOpen: false, onChange: true },
    ];
    for (const p of extra) {
      harness.database.tables.waitlist_alerts.push({ waitlist_id: waitlist.id, user_id: p.id, notify_on_open: p.onOpen, notify_on_status_change: p.onChange });
      harness.database.tables.profiles.push({ id: p.id, email: p.email, email_notifications_enabled: p.enabled, unsubscribe_token: OTHER_TOKEN });
    }
    expect(await (await harness.handler(post(alertBody))).json()).toMatchObject({ subscriber_count: 2, sent_count: 2, failed_count: 0 });
    const mail = harness.fetch.mock.calls.map(([, init]) => JSON.parse(String(init!.body)));
    expect(mail.map((payload) => payload.to).sort()).toEqual(['changes@example.com', 'subscriber@example.com']);
    expect(mail.find((payload) => payload.to === 'changes@example.com').headers['List-Unsubscribe']).toContain(OTHER_TOKEN);
    expect(harness.database.tables.notification_events.map((event) => event.user_id).sort()).toEqual(['changes', 'subscriber-1']);
  });

  it('denies unpublished waitlists even with existing subscriptions', async () => {
    const harness = sender();
    harness.database.tables.waitlists[0].published = false;
    const response = await harness.handler(post(alertBody));
    expect(response.status).toBe(404);
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.database.client.rpc).not.toHaveBeenCalledWith('claim_waitlist_alert_send', expect.anything());
    expect(harness.database.client.from).not.toHaveBeenCalledWith('waitlist_alerts');
    expect(writes(harness)).toEqual([]);
  });
});

describe('unsubscribe-alerts real handler', () => {
  const unsubscribe = () => loadEdgeHandler('unsubscribe-alerts', { database: fakeDatabase({
    profiles: [{ id: 'subscriber-1', unsubscribe_token: OLD_TOKEN, email_notifications_enabled: true }],
  }) });
  const request = (method: string, token: string = OLD_TOKEN) => new Request(`https://edge.example/unsubscribe-alerts?token=${encodeURIComponent(token)}`, {
    method,
    ...(method === 'POST' ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' } : {}),
  });

  it('GET only shows confirmation, identically for known and unknown tokens, without database access', async () => {
    const harness = unsubscribe();
    const known = await harness.handler(request('GET'));
    const unknown = await harness.handler(request('GET', OTHER_TOKEN));
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    const html = await known.text();
    expect(html).toContain('<form method="post">');
    expect(html).toContain('No settings have changed yet.');
    expect(await unknown.text()).toBe(html);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.randomUUID).not.toHaveBeenCalled();
    expect(harness.database.queries).toEqual([]);
    expect(harness.database.tables.profiles[0]).toMatchObject({ unsubscribe_token: OLD_TOKEN, email_notifications_enabled: true });
  });

  it('POST disables notifications and rotates the token in one token-matched update', async () => {
    const harness = unsubscribe();
    const response = await harness.handler(request('POST'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(harness.database.queries).toEqual([{
      table: 'profiles', operation: 'update',
      values: { email_notifications_enabled: false, unsubscribe_token: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      filters: [{ method: 'eq', column: 'unsubscribe_token', value: OLD_TOKEN }],
    }]);
    expect(harness.database.tables.profiles[0].unsubscribe_token).not.toBe(OLD_TOKEN);
    expect(harness.database.tables.profiles[0].email_notifications_enabled).toBe(false);
    expect(harness.randomUUID).toHaveBeenCalledOnce();
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it('makes successful, replayed, and unknown tokens indistinguishable and cannot reuse a consumed token', async () => {
    const harness = unsubscribe();
    const success = await harness.handler(request('POST'));
    // Simulate the signed-in user re-enabling mail after the initial unsubscribe.
    harness.database.tables.profiles[0].email_notifications_enabled = true;
    const tokenAfterUse = harness.database.tables.profiles[0].unsubscribe_token;
    const replay = await harness.handler(request('POST'));
    const unknown = await harness.handler(request('POST', OTHER_TOKEN));
    const signatures = await Promise.all([success, replay, unknown].map(async (response) => ({
      status: response.status, headers: [...response.headers.entries()], body: await response.text(),
    })));
    expect(signatures[1]).toEqual(signatures[0]);
    expect(signatures[2]).toEqual(signatures[0]);
    expect(harness.database.tables.profiles[0]).toMatchObject({ email_notifications_enabled: true, unsubscribe_token: tokenAfterUse });
    expect(harness.database.queries.every((query) => query.operation === 'update')).toBe(true);
  });

  it.each(['DELETE', 'PUT', 'PATCH', 'HEAD', 'OPTIONS'])('rejects unsupported %s without touching the database', async (method) => {
    const harness = unsubscribe();
    expect((await harness.handler(request(method))).status).toBe(405);
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.database.queries).toEqual([]);
  });

  it.each(['GET', 'POST'])('rejects malformed tokens for %s before database access', async (method) => {
    const harness = unsubscribe();
    for (const token of ['', 'not-a-uuid', '<script>alert(1)</script>', `${OLD_TOKEN}extra`]) {
      expect((await harness.handler(request(method, token))).status).toBe(400);
    }
    expect(harness.createClient).not.toHaveBeenCalled();
    expect(harness.database.queries).toEqual([]);
  });

  it('returns a retryable server error when the atomic update fails', async () => {
    const harness = unsubscribe();
    harness.database.errors['profiles.update'] = { message: 'database unavailable' };
    expect((await harness.handler(request('POST'))).status).toBe(500);
    expect(harness.database.tables.profiles[0]).toMatchObject({ email_notifications_enabled: true, unsubscribe_token: OLD_TOKEN });
  });
});
