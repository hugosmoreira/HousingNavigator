// Isolated PostgreSQL tests of migration 0029 (property map coordinates) on top
// of the unmodified 0020; no network, credentials or production records.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const db = new PGlite();

// Just enough of the earlier schema for 0020 to install.
await db.exec(`
  create role anon; create role authenticated;
  create function public.is_admin() returns boolean language sql as $$
    select coalesce(current_setting('test.admin', true),'false') = 'true' $$;
  grant usage on schema public to anon, authenticated;
  create schema app_private;
  grant usage on schema app_private to authenticated;
  create function public.set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at = now(); return new; end $$;
  create table public.waitlists (
    id text primary key, housing_authority text, program_name text, county text, city text,
    state text, status text, application_link text, source_url text, last_checked date,
    notes text, public_notes text, published boolean not null default false,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table public.waitlist_status_history (waitlist_id text, new_status text, changed_at timestamptz);
  create function app_private.waitlists_admin_rows() returns setof public.waitlists
    language sql stable as $$ select * from public.waitlists where public.is_admin() $$;
`);
await db.exec(migration('0020_affordable_properties.sql'));

const FOSTER = '4690b230-5abd-498f-89c1-5eb968c26812';
const DOLORES = 'dd2cd8f6-6bd1-46be-b3ad-a20c3725f155';
const DRAFT = '00000000-0000-4000-8000-000000000001';
await db.exec(`
  insert into public.affordable_properties (id, name, city, county, state, published, internal_notes) values
    ('${FOSTER}', '73Foster', 'Portland', 'Multnomah', 'OR', true, 'staff only'),
    ('${DOLORES}', 'Dolores Apartments', 'Portland', 'Washington', 'OR', true, null),
    ('${DRAFT}', 'Unpublished draft', 'Portland', 'Multnomah', 'OR', false, null);
`);
await db.exec(migration('0029_affordable_property_locations.sql'));

const rows = async (sql, values = []) => (await db.query(sql, values)).rows;
const scalar = async (sql, values = []) => Object.values((await rows(sql, values))[0])[0];
const as = async (role, admin, fn) => {
  await db.exec(`set role ${role}; select set_config('test.admin', '${admin}', false)`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('test.admin', 'false', false)");
  }
};
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };

await test('existing map coordinates are copied in, except the unconfirmed Dolores address', async () => {
  const [foster] = await rows(`select latitude, longitude, location_source, location_checked_on::text as checked
                                 from public.affordable_properties where id = $1`, [FOSTER]);
  assert.deepEqual(foster, { latitude: 45.48582, longitude: -122.587409, location_source: 'census_geocoder', checked: '2026-10-27' });
  assert.equal(await scalar('select latitude from public.affordable_properties where id = $1', [DOLORES]), null);
  assert.equal(await scalar('select latitude from public.affordable_properties where id = $1', [DRAFT]), null);
});

await test('the public view keeps its 0020 columns in order and appends the location', async () => {
  const columns = (await rows(`select column_name from information_schema.columns
                                where table_schema = 'public' and table_name = 'affordable_properties_public'
                                order by ordinal_position`)).map((row) => row.column_name);
  assert.deepEqual(columns.slice(-5), ['waitlist_application_link', 'latitude', 'longitude', 'location_source', 'location_checked_on']);
  assert.equal(columns.includes('internal_notes'), false);
});

await test('visitors read coordinates for published properties only', async () => {
  const visible = await as('anon', false, () =>
    rows('select id, latitude, longitude, location_source from public.affordable_properties_public order by name'));
  assert.deepEqual(visible.map((row) => row.id), [FOSTER, DOLORES]);
  assert.equal(visible[0].latitude, 45.48582);
});

await test('visitors still cannot read internal notes, the admin view, or write', async () => {
  await as('anon', false, async () => {
    await assert.rejects(() => db.query('select internal_notes from public.affordable_properties'), /permission denied/);
    await assert.rejects(() => db.query('select * from public.affordable_properties_admin'), /permission denied/);
    await assert.rejects(
      () => db.query('update public.affordable_properties set latitude = 45.5, longitude = -122.6 where id = $1', [DOLORES]),
      /permission denied/,
    );
  });
});

await test('signed-in non-admins cannot change a location', async () => {
  const result = await as('authenticated', false, () =>
    db.query(`update public.affordable_properties
                 set latitude = 45.5, longitude = -122.6, location_source = 'manual', location_checked_on = current_date
               where id = $1`, [DOLORES]));
  assert.equal(result.affectedRows, 0);
  assert.equal(await scalar('select latitude from public.affordable_properties where id = $1', [DOLORES]), null);
});

await test('admins set a location and see it, with internal notes, in the admin view', async () => {
  const updated = await as('authenticated', true, async () => {
    await db.query(`update public.affordable_properties
                       set latitude = 45.5317, longitude = -122.8774, location_source = 'manual', location_checked_on = date '2026-10-28'
                     where id = $1`, [DOLORES]);
    return rows('select latitude, location_source, internal_notes, linked_waitlist_id from public.affordable_properties_admin where id in ($1, $2) order by name', [FOSTER, DOLORES]);
  });
  assert.deepEqual(updated, [
    { latitude: 45.48582, location_source: 'census_geocoder', internal_notes: 'staff only', linked_waitlist_id: null },
    { latitude: 45.5317, location_source: 'manual', internal_notes: null, linked_waitlist_id: null },
  ]);
});

await test('incomplete, out-of-region and unknown-source locations are refused', async () => {
  await as('authenticated', true, async () => {
    const set = (assignments) => db.query(`update public.affordable_properties set ${assignments} where id = $1`, [DRAFT]);
    const refused = /affordable_properties_location_check/;
    await assert.rejects(() => set("latitude = 45.5, location_source = 'manual', location_checked_on = current_date"), refused);
    await assert.rejects(() => set("longitude = -122.6, location_source = 'manual', location_checked_on = current_date"), refused);
    await assert.rejects(() => set("latitude = 45.5, longitude = -122.6, location_checked_on = current_date"), refused);
    await assert.rejects(() => set("latitude = 45.5, longitude = 122.6, location_source = 'manual', location_checked_on = current_date"), refused);
    await assert.rejects(() => set("latitude = -122.6, longitude = 45.5, location_source = 'manual', location_checked_on = current_date"), refused);
    await assert.rejects(() => set("latitude = 45.5, longitude = -122.6, location_source = 'guess', location_checked_on = current_date"), refused);
    await assert.rejects(() => set("latitude = 45.5, longitude = -122.6, location_source = 'manual'"), refused);
  });
});

await test('admins can clear a location', async () => {
  await as('authenticated', true, () =>
    db.query(`update public.affordable_properties
                 set latitude = null, longitude = null, location_source = null, location_checked_on = null
               where id = $1`, [DOLORES]));
  assert.equal(await scalar('select latitude from public.affordable_properties where id = $1', [DOLORES]), null);
});

await test('running the migration again keeps locations an admin has changed', async () => {
  await db.exec(`update public.affordable_properties
                    set latitude = 45.4859, longitude = -122.5875, location_source = 'manual', location_checked_on = date '2026-10-28'
                  where id = '${FOSTER}'`);
  await db.exec(migration('0029_affordable_property_locations.sql'));
  const [foster] = await rows('select latitude, location_source from public.affordable_properties where id = $1', [FOSTER]);
  assert.deepEqual(foster, { latitude: 45.4859, location_source: 'manual' });
});

await db.close();
console.log(passed + ' affordable property location checks passed; no external database used.');
