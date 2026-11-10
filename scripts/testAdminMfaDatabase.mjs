// Isolated PostgreSQL tests of the unmodified 0030 migration and its rollback.
// PGlite is in-memory: no Supabase, .env, network or production records.
// auth.uid() and auth.jwt() mirror Supabase's definitions, which read the
// PostgREST request.jwt.claims setting that each check sets below.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/0030_admin_mfa_required.sql');
const rollback = read('../supabase/rollback/0030_admin_mfa_required_rollback.sql');
const adminId = '30000000-0000-4000-8000-000000000001';
const userId = '30000000-0000-4000-8000-000000000002';
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log('PASS ' + name);
}
/** Run fn as a PostgREST role with the given JWT claims (null: no claims at all). */
async function as(role, claims, fn) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims ? JSON.stringify(claims) : '']);
  await db.exec('set role ' + role);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}
const isAdmin = (claims) => as('authenticated', claims, () => scalar('select public.is_admin()'));
const admin = (aal) => ({ sub: adminId, role: 'authenticated', ...(aal ? { aal } : {}) });
const visibleWaitlists = (claims) => as('authenticated', claims, async () =>
  (await db.query('select id from public.waitlists order by id')).rows.map(row => row.id));

// Minimal pre-0030 fixtures shaped like 0002/0003/0014, not copies of 0030.
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                    nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;

  create table public.admin_users(user_id uuid primary key references auth.users(id));
  alter table public.admin_users enable row level security;
  create policy admin_users_self_read on public.admin_users for select to authenticated
    using (user_id = auth.uid());
  grant select on public.admin_users to authenticated;

  create function public.is_admin() returns boolean language sql stable security definer
    set search_path = '' as $$
    select exists (select 1 from public.admin_users a where a.user_id = auth.uid()) $$;
  revoke all on function public.is_admin() from public, anon, authenticated;
  grant execute on function public.is_admin() to authenticated;

  create table public.waitlists(id text primary key, published boolean not null, note text);
  alter table public.waitlists enable row level security;
  create policy waitlists_public_read on public.waitlists for select to anon, authenticated
    using (published);
  create policy waitlists_admin_read on public.waitlists for select to authenticated
    using (public.is_admin());
  create policy waitlists_admin_update on public.waitlists for update to authenticated
    using (public.is_admin()) with check (public.is_admin());
  grant select, update on public.waitlists to anon, authenticated;

  -- The guard every admin RPC uses (0012, 0019, 0020, 0023, 0026, 0028).
  create function public.admin_rpc() returns text language plpgsql security definer
    set search_path = '' as $$
  begin
    if not public.is_admin() then raise exception 'Admin access required'; end if;
    return 'ran';
  end $$;
  grant execute on function public.admin_rpc() to authenticated;
`);
await db.query('insert into auth.users values ($1), ($2)', [adminId, userId]);
await db.query('insert into public.admin_users values ($1)', [adminId]);
await db.exec(`insert into public.waitlists values ('published', true, 'public'), ('draft', false, 'staff only')`);

await test('before 0030, a password-only admin session is an admin (fixture baseline)', async () => {
  assert.equal(await isAdmin(admin('aal1')), true);
});

await test('the full 0030 migration applies', async () => {
  await db.exec(migration);
});

await test('is_admin() is true only for a member whose session passed two-factor sign-in', async () => {
  assert.equal(await isAdmin(admin('aal2')), true);
  assert.equal(await isAdmin(admin('aal1')), false);
  assert.equal(await isAdmin({ sub: userId, role: 'authenticated', aal: 'aal2' }), false);
  for (const aal of ['AAL2', 'aal3', ' aal2', '']) assert.equal(await isAdmin(admin(aal)), false, aal);
});

await test('a missing aal claim or no claims at all yields false, never NULL', async () => {
  assert.equal(await isAdmin(admin(null)), false);
  assert.equal(await isAdmin(null), false);
  await assert.rejects(() => as('authenticated', admin(null), () => scalar('select public.admin_rpc()')),
    /Admin access required/);
});

await test('admin RPC guards refuse AAL1 and run for AAL2', async () => {
  await assert.rejects(() => as('authenticated', admin('aal1'), () => scalar('select public.admin_rpc()')),
    /Admin access required/);
  assert.equal(await as('authenticated', admin('aal2'), () => scalar('select public.admin_rpc()')), 'ran');
});

await test('an AAL1 admin session sees and changes only what a visitor can', async () => {
  assert.deepEqual(await visibleWaitlists(admin('aal1')), ['published']);
  const updated = await as('authenticated', admin('aal1'), async () =>
    (await db.query("update public.waitlists set note = 'changed' where id = 'draft'")).affectedRows);
  assert.equal(updated, 0);
  assert.equal(await scalar("select note from public.waitlists where id = 'draft'"), 'staff only');
});

await test('an AAL2 admin session keeps full admin access', async () => {
  assert.deepEqual(await visibleWaitlists(admin('aal2')), ['draft', 'published']);
  const updated = await as('authenticated', admin('aal2'), async () =>
    (await db.query("update public.waitlists set note = 'reviewed' where id = 'draft'")).affectedRows);
  assert.equal(updated, 1);
});

await test('public browsing and other signed-in users are unchanged', async () => {
  assert.deepEqual(await as('anon', null, async () =>
    (await db.query('select id from public.waitlists')).rows.map(row => row.id)), ['published']);
  assert.deepEqual(await visibleWaitlists({ sub: userId, role: 'authenticated', aal: 'aal1' }), ['published']);
});

await test('an AAL1 admin session can still read its own admin_users row, to reach /admin/verify', async () => {
  const rows = await as('authenticated', admin('aal1'), async () =>
    (await db.query('select user_id from public.admin_users')).rows);
  assert.deepEqual(rows, [{ user_id: adminId }]);
});

await test('0030 keeps the hardened function settings and authenticated-only EXECUTE', async () => {
  const fn = (await db.query(`
    select p.prosecdef, p.proconfig,
           has_function_privilege('anon', p.oid, 'execute') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'execute') as authed_exec
      from pg_proc p where p.oid = 'public.is_admin()'::regprocedure`)).rows[0];
  assert.equal(fn.prosecdef, true);
  assert.deepEqual(fn.proconfig, ['search_path=""']);
  assert.equal(fn.anon_exec, false);
  assert.equal(fn.authed_exec, true);
  await assert.rejects(() => as('anon', null, () => scalar('select public.is_admin()')), /permission denied/);
});

await test('the rollback script restores membership-only is_admin() with the same grants', async () => {
  await db.exec(rollback);
  assert.equal(await isAdmin(admin('aal1')), true);
  assert.equal(await isAdmin(admin('aal2')), true);
  assert.equal(await isAdmin({ sub: userId, role: 'authenticated', aal: 'aal2' }), false);
  assert.equal(await isAdmin(null), false);
  assert.equal(await scalar(`select has_function_privilege('anon', 'public.is_admin()', 'execute')`), false);
  assert.match(await scalar(`select obj_description('public.is_admin()'::regprocedure)`), /returns whether auth\.uid\(\) is an administrator/);
});

await test('0030 can be applied again after a rollback', async () => {
  await db.exec(migration);
  assert.equal(await isAdmin(admin('aal1')), false);
  assert.equal(await isAdmin(admin('aal2')), true);
});

console.log(`${passed} admin MFA database checks passed`);
