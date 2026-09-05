// Isolated PostgreSQL tests; no network, credentials or production records.
import { PGlite } from '../tmp/source-check-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create function public.is_admin() returns boolean language sql as $$
    select coalesce(current_setting('test.admin', true),'false') = 'true' $$;
  grant usage on schema public to anon, authenticated;
`);
await db.exec(readFileSync(new URL('../supabase/migrations/0028_resource_publication_refresh.sql', import.meta.url), 'utf8'));
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
const claim = hash => scalar('select claim_resource_publication_refresh($1)', [hash.repeat(64)]);
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
await db.exec('set role anon');
await test('anonymous users cannot read or claim publication requests', async () => {
  await assert.rejects(() => db.query('select * from resource_publication_refresh'), /permission denied/);
  await assert.rejects(() => claim('a'), /permission denied/);
});
await db.exec('set role authenticated');
await test('non-admin accounts cannot claim or finish a refresh', async () => {
  await assert.rejects(() => claim('a'), /Admin access required/);
  await assert.rejects(() => db.query("select finish_resource_publication_refresh(gen_random_uuid(),'accepted')"), /Admin access required/);
  assert.equal(await scalar('select count(*)::int from resource_publication_refresh'), 0);
});
await db.exec("select set_config('test.admin','true',false)");
let first;
await test('admin claims once; duplicate and different rapid clicks cannot create extra builds', async () => {
  first = await claim('a'); assert.equal(first.claimed, true);
  assert.deepEqual(await claim('a'), { claimed: false, reason: 'already_requested' });
  assert.deepEqual(await claim('b'), { claimed: false, reason: 'cooldown' });
});
await test('admins cannot directly bypass the claim throttle', async () => {
  await assert.rejects(() => db.query('delete from resource_publication_refresh'), /permission denied/);
});
await test('invalid digest and outcome are refused', async () => {
  await assert.rejects(() => scalar("select claim_resource_publication_refresh('invalid')"), /Invalid content digest/);
  await assert.rejects(() => db.query("select finish_resource_publication_refresh($1,'live')", [first.request_id]), /Invalid refresh outcome/);
});
await test('an old receipt cannot complete a newer request', async () => {
  await db.exec('reset role');
  await db.exec("update resource_publication_refresh set requested_at=now()-interval '2 minutes'");
  await db.exec('set role authenticated');
  const next = await claim('b'); assert.equal(next.claimed, true);
  await db.query("select finish_resource_publication_refresh($1,'accepted')", [first.request_id]);
  assert.equal(await scalar('select outcome from resource_publication_refresh'), 'requested');
  await db.query("select finish_resource_publication_refresh($1,'failed')", [next.request_id]);
  assert.equal(await scalar('select outcome from resource_publication_refresh'), 'failed');
});
await test('failed requests can be retried after one minute; accepted receipts stay private', async () => {
  assert.deepEqual(await claim('b'), { claimed: false, reason: 'cooldown' });
  await db.exec('reset role');
  await db.exec("update resource_publication_refresh set requested_at=now()-interval '2 minutes'");
  await db.exec('set role authenticated');
  const retry = await claim('b'); assert.equal(retry.claimed, true);
  await db.query("select finish_resource_publication_refresh($1,'accepted')", [retry.request_id]);
  assert.equal(await scalar('select outcome from resource_publication_refresh'), 'accepted');
  await db.exec("select set_config('test.admin','false',false)");
  assert.equal(await scalar('select count(*)::int from resource_publication_refresh'), 0);
});
await test('accepted but unconfirmed builds can be retried after timeout', async () => {
  await db.exec('reset role');
  await db.exec("update resource_publication_refresh set requested_at=now()-interval '16 minutes'");
  await db.exec("set role authenticated; select set_config('test.admin','true',false)");
  assert.equal((await claim('b')).claimed, true);
});
await db.close();
console.log(passed + ' publication database checks passed.');
