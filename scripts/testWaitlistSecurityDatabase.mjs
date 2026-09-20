// Isolated PostgreSQL tests of the full, unmodified 0023 migration.
// PGlite is in-memory: no Supabase, .env, network, notification triggers or email.
// A single PGlite instance cannot prove multi-session race safety. Test the
// installed advisory-lock invariant separately from sequential quota behavior.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const migration = readFileSync(new URL('../supabase/migrations/0023_security_fix_handoff.sql', import.meta.url), 'utf8');
const adminId = '10000000-0000-4000-8000-000000000001';
const otherAdminId = '10000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000003';
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
let passed = 0;
let reviewNumber = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log('PASS ' + name);
}
async function asRole(role, user, fn) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec('set role ' + role);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || '']);
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
const claim = (id = adminId) => scalar('select public.claim_admin_alert_invocation($1)', [id]);
const countClaims = id => scalar('select count(*)::int from public.alert_invocations where admin_user_id = $1', [id]);
async function newSuggestion() {
  const waitlistId = 'review-' + ++reviewNumber;
  await db.query("insert into public.waitlists(id, status, last_checked, check_failures) values($1, 'closed', '2020-01-01', 3)", [waitlistId]);
  return (await db.query(`
    insert into public.waitlist_status_suggestions(waitlist_id, previous_status, suggested_status)
    values($1, 'closed', 'open')
    returning id, waitlist_id, updated_at::text, previous_status, suggested_status
  `, [waitlistId])).rows[0];
}
const review = (s, approve = true, user = adminId) => asRole('authenticated', user, () => scalar(`
  select to_jsonb(public.review_waitlist_suggestion($1, $2, $3, $4, $5))
`, [s.id, approve, s.updated_at, s.previous_status, s.suggested_status]));
const suggestionState = id => scalar('select to_jsonb(s) from public.waitlist_status_suggestions s where id = $1', [id]);
const waitlistState = id => scalar('select to_jsonb(w) from public.waitlists w where id = $1', [id]);

try {
  // Minimal pre-0023 schema fixtures, not copies of the functions under test.
  // Omitting the production HTTP/email triggers keeps approvals wholly local.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.admin_users(user_id uuid primary key references auth.users(id));
    create function public.is_admin() returns boolean language sql security definer set search_path = '' as $$
      select exists(select 1 from public.admin_users where user_id = auth.uid()) $$;
    create table public.waitlists(
      id text primary key, status text not null, last_checked date,
      check_failures integer not null default 0
    );
    create table public.waitlist_status_checks(
      id bigint generated always as identity primary key,
      waitlist_id text not null references public.waitlists(id)
    );
    create table public.waitlist_status_suggestions(
      id uuid primary key default gen_random_uuid(),
      waitlist_id text not null references public.waitlists(id),
      previous_status text not null, suggested_status text not null,
      status text not null default 'pending',
      updated_at timestamptz not null default now(),
      reviewed_at timestamptz, reviewed_by uuid references auth.users(id)
    );
    create unique index one_pending_suggestion on public.waitlist_status_suggestions(waitlist_id)
      where status = 'pending';
    create table public.alert_invocations(
      id bigint generated always as identity primary key,
      admin_user_id uuid not null references auth.users(id),
      invoked_at timestamptz not null default now()
    );
    create table public.profiles(
      id uuid primary key references auth.users(id),
      email_notifications_enabled boolean not null default true,
      unsubscribe_token uuid not null default gen_random_uuid()
    );
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant select on public.profiles to authenticated;
    grant update(email_notifications_enabled) on public.profiles to authenticated;
    -- An established project has the old RPC; the migration must remove it.
    create function public.review_waitlist_suggestion(uuid, boolean)
      returns public.waitlist_status_suggestions language sql as $$
      select null::public.waitlist_status_suggestions $$;
  `);
  await db.query('insert into auth.users values($1), ($2), ($3)', [adminId, otherAdminId, userId]);
  await db.query('insert into public.admin_users values($1), ($2)', [adminId, otherAdminId]);
  await db.query('insert into public.profiles(id) values($1)', [userId]);
  const existing = await newSuggestion();
  await db.query('insert into public.waitlist_status_checks(waitlist_id) values($1)', [existing.waitlist_id]);

  await test('full migration applies and removes the legacy review RPC', async () => {
    await db.exec(migration);
    assert.equal(await scalar("select to_regprocedure('public.review_waitlist_suggestion(uuid,boolean)')"), null);
    assert.ok(await scalar("select to_regprocedure('public.review_waitlist_suggestion(uuid,boolean,timestamptz,text,text)')"));
  });
  await test('migration safely reapplies without the legacy RPC', () => db.exec(migration));
  await test('both audit tables backfill false and accept verified evidence with non-null defaults', async () => {
    for (const table of ['waitlist_status_checks', 'waitlist_status_suggestions']) {
      const column = (await db.query(`
        select data_type, is_nullable, column_default from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = 'evidence_verified'
      `, [table])).rows[0];
      assert.deepEqual(column, { data_type: 'boolean', is_nullable: 'NO', column_default: 'false' });
      assert.equal(await scalar('select evidence_verified from public.' + table), false);
      await asRole('service_role', null, () => db.exec('update public.' + table + ' set evidence_verified = true'));
      assert.equal(await scalar('select evidence_verified from public.' + table), true);
      await assert.rejects(() => db.exec('update public.' + table + ' set evidence_verified = null'), /not-null constraint/);
    }
    const fresh = await newSuggestion();
    assert.equal((await suggestionState(fresh.id)).evidence_verified, false);
    assert.equal(await scalar('insert into public.waitlist_status_checks(waitlist_id) values($1) returning evidence_verified', [fresh.waitlist_id]), false);
  });

  await test('anonymous and authenticated callers, including admins, cannot claim alert quota', async () => {
    for (const [role, user] of [['anon', null], ['authenticated', userId], ['authenticated', adminId]]) {
      await asRole(role, user, () => assert.rejects(() => claim(), /permission denied for function claim_admin_alert_invocation/));
    }
    assert.equal(await countClaims(adminId), 0);
  });
  await test('service role accepts exactly ten default claims and denial writes no extra row', async () => {
    await asRole('service_role', null, async () => {
      for (let i = 0; i < 10; i++) assert.equal(await claim(), true);
      assert.equal(await claim(), false);
      assert.equal(await claim(), false);
    });
    assert.equal(await countClaims(adminId), 10);
  });
  await test('one admin cannot exhaust another admin quota', async () => {
    await asRole('service_role', null, async () => {
      for (let i = 0; i < 10; i++) assert.equal(await claim(otherAdminId), true);
      assert.equal(await claim(otherAdminId), false);
      assert.equal(await claim(adminId), false);
    });
    assert.equal(await countClaims(adminId), 10);
    assert.equal(await countClaims(otherAdminId), 10);
  });
  await test('the rolling hour expires claims at the boundary, but retains recent claims', async () => {
    // Pin now() in a transaction so the exact one-hour boundary is deterministic.
    await db.exec('begin');
    try {
      await db.query("update public.alert_invocations set invoked_at = now() - interval '59 minutes' where admin_user_id = $1", [adminId]);
      assert.equal(await asRole('service_role', null, () => claim()), false);
      await db.query(`
        update public.alert_invocations set invoked_at = now() - interval '1 hour'
        where id = (select min(id) from public.alert_invocations where admin_user_id = $1)
      `, [adminId]);
      assert.equal(await asRole('service_role', null, () => claim()), true);
      assert.equal(await asRole('service_role', null, () => claim()), false);
      assert.equal(await countClaims(adminId), 11);
    } finally {
      await db.exec('rollback');
    }
  });
  await test('invalid quota bounds and missing admin IDs cannot write ledger rows', async () => {
    const before = await scalar('select count(*)::int from public.alert_invocations');
    await asRole('service_role', null, async () => {
      for (const [id, limit] of [[null, 10], [adminId, 0], [adminId, 101]]) {
        await assert.rejects(() => db.query('select public.claim_admin_alert_invocation($1, $2)', [id, limit]), /invalid alert quota claim/);
      }
    });
    assert.equal(await scalar('select count(*)::int from public.alert_invocations'), before);
  });
  await test('installed quota function takes an admin-keyed transaction lock before count and insert', async () => {
    const definition = await scalar("select pg_get_functiondef('public.claim_admin_alert_invocation(uuid,integer)'::regprocedure)");
    assert.match(definition, /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(p_admin_user_id::text, 0\)/);
    const lock = definition.indexOf('pg_catalog.pg_advisory_xact_lock');
    const count = definition.indexOf('select count(*)');
    const insert = definition.indexOf('insert into public.alert_invocations');
    assert.ok(lock >= 0 && count > lock && insert > count);
    assert.match(definition, /SECURITY DEFINER/);
    assert.match(definition, /SET search_path TO ''/);
  });

  await test('re-enabling notifications rotates the token; unchanged opt-in does not', async () => {
    const token = () => scalar('select unsubscribe_token::text from public.profiles where id = $1', [userId]);
    const optIn = enabled => asRole('authenticated', userId, () => db.query('update public.profiles set email_notifications_enabled = $1 where id = $2', [enabled, userId]));
    const original = await token();
    await optIn(true);
    assert.equal(await token(), original);
    await optIn(false);
    assert.equal(await token(), original); // The unsubscribe handler owns disable-time rotation.
    await optIn(false);
    assert.equal(await token(), original);
    await optIn(true);
    const rotated = await token();
    assert.notEqual(rotated, original);
    await optIn(true);
    assert.equal(await token(), rotated);
    await optIn(false);
    await optIn(true);
    assert.notEqual(await token(), rotated);
  });

  await test('review RPC denies anonymous callers and authenticated non-admins without edits', async () => {
    const s = await newSuggestion();
    const before = await suggestionState(s.id);
    await asRole('anon', null, () => assert.rejects(() => db.query(
      'select public.review_waitlist_suggestion($1, $2, $3, $4, $5)',
      [s.id, true, s.updated_at, s.previous_status, s.suggested_status],
    ), /permission denied/));
    await assert.rejects(() => review(s, true, userId), /not authorized/);
    assert.deepEqual(await suggestionState(s.id), before);
    assert.equal((await waitlistState(s.waitlist_id)).status, 'closed');
  });
  await test('review compare-and-swap rejects changed or missing expected fields for approval and rejection', async () => {
    const s = await newSuggestion();
    const before = await suggestionState(s.id);
    for (const change of [
      { updated_at: '2000-01-01T00:00:00Z' }, { previous_status: 'limited' },
      { suggested_status: 'limited' }, { updated_at: null },
      { previous_status: null }, { suggested_status: null },
    ]) {
      for (const approve of [true, false]) {
        await assert.rejects(() => review({ ...s, ...change }, approve), /stale review: suggestion changed/);
      }
    }
    assert.deepEqual(await suggestionState(s.id), before);
    assert.equal((await waitlistState(s.waitlist_id)).status, 'closed');
  });
  await test('approval cannot overwrite a manually changed waitlist and leaves the review pending', async () => {
    const s = await newSuggestion();
    const before = await suggestionState(s.id);
    await db.query("update public.waitlists set status = 'limited' where id = $1", [s.waitlist_id]);
    await assert.rejects(() => review(s), /stale review: waitlist status changed/);
    assert.deepEqual(await suggestionState(s.id), before);
    assert.equal((await waitlistState(s.waitlist_id)).status, 'limited');
  });
  await test('an exact admin approval updates the waitlist and review metadata once', async () => {
    const s = await newSuggestion();
    const approved = await review(s);
    assert.equal(approved.status, 'approved');
    assert.equal(approved.reviewed_by, adminId);
    assert.ok(approved.reviewed_at);
    assert.deepEqual(await waitlistState(s.waitlist_id), {
      id: s.waitlist_id, status: 'open', check_failures: 0,
      last_checked: await scalar('select current_date::text'),
    });
    await assert.rejects(() => review(s), /stale review: suggestion was already reviewed or removed/);
    assert.deepEqual(await suggestionState(s.id), approved);
  });
  await test('an exact admin rejection records the reviewer without changing the waitlist', async () => {
    const s = await newSuggestion();
    const before = await waitlistState(s.waitlist_id);
    const rejected = await review(s, false, otherAdminId);
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.reviewed_by, otherAdminId);
    assert.ok(rejected.reviewed_at);
    assert.deepEqual(await waitlistState(s.waitlist_id), before);
    await assert.rejects(() => review(s), /stale review: suggestion was already reviewed or removed/);
  });
  console.log(passed + ' waitlist security PostgreSQL checks passed; no external database used.');
  console.log('Concurrency coverage is structural only; independent concurrent sessions are not exercised by PGlite.');
} finally {
  await db.close();
}
