-- Housing Navigator -- map coordinates for affordable properties
--
-- /map places each published property from coordinates that were kept in a
-- JSON file (src/data/affordablePropertyLocations.json) and refreshed by hand
-- with `npm run geocode:properties`. Storing them on the property record lets
-- a new listing reach the map without that step, and lets an administrator
-- correct a pin the geocoder got wrong.
--
-- Everything here is additive. Code that does not know these columns keeps
-- working: the public and admin views gain columns, and the admin form only
-- writes the fields it sends.

begin;

alter table public.affordable_properties
  add column if not exists latitude            double precision,
  add column if not exists longitude           double precision,
  add column if not exists location_source     text,
  add column if not exists location_checked_on date;

-- A location is all four fields or none. Coordinates must fall inside the
-- Oregon/Washington box that matches the table's state check, which catches
-- swapped or sign-flipped values; widen it if the state list ever grows.
-- A check passes when it evaluates to null, so every field of a location is
-- required explicitly rather than through the range tests.
alter table public.affordable_properties
  drop constraint if exists affordable_properties_location_check;
alter table public.affordable_properties
  add constraint affordable_properties_location_check check (
    (
      latitude is null
      and longitude is null
      and location_source is null
      and location_checked_on is null
    )
    or (
      latitude is not null
      and longitude is not null
      and location_source is not null
      and location_checked_on is not null
      and latitude between 41.9 and 49.1
      and longitude between -125.0 and -116.4
      and location_source in ('census_geocoder', 'manual')
    )
  );

-- Published street addresses are already public, so their coordinates are
-- too. Column grants stay explicit: internal_notes is still never granted.
grant select (latitude, longitude, location_source, location_checked_on)
  on public.affordable_properties to anon, authenticated;

-- Same columns in the same order as 0020, with the location appended, so the
-- view can be replaced in place.
create or replace view public.affordable_properties_public
  with (security_invoker = true) as
  select
    p.id, p.name, p.owner_organization, p.management_company,
    p.property_type, p.address, p.city, p.county, p.state, p.postal_code,
    p.description, p.eligibility_summary, p.ami_levels, p.bedroom_types,
    p.audiences, p.total_units, p.accessibility_notes, p.phone, p.website,
    p.application_url, p.source_url, p.source_type, p.last_verified,
    p.public_notes, p.priority_score, p.published, p.created_at, p.updated_at,
    w.id as waitlist_id,
    w.status as waitlist_status,
    w.last_checked as waitlist_last_checked,
    w.application_link as waitlist_application_link,
    p.latitude, p.longitude, p.location_source, p.location_checked_on
  from public.affordable_properties p
  left join lateral (
    select linked.id, linked.status, linked.last_checked, linked.application_link
      from public.waitlists linked
     where linked.affordable_property_id = p.id
       and linked.published = true
     order by linked.updated_at desc
     limit 1
  ) w on true;

-- The admin view selects p.*, which Postgres expanded when 0020 created it, so
-- it is rebuilt to pick up the new columns. A replace cannot insert columns
-- before linked_waitlist_id; the drop and create run in this transaction, and
-- anything depending on the view would make the drop fail and roll back.
drop view public.affordable_properties_admin;
create view public.affordable_properties_admin
  with (security_invoker = true, security_barrier = true) as
  select
    p.*,
    (
      select w.id
        from public.waitlists w
       where w.affordable_property_id = p.id
       order by w.updated_at desc
       limit 1
    ) as linked_waitlist_id
  from app_private.affordable_properties_admin_rows() p;

revoke all on public.affordable_properties_public from public, anon, authenticated;
revoke all on public.affordable_properties_admin from public, anon, authenticated;
grant select on public.affordable_properties_public to anon, authenticated;
grant select on public.affordable_properties_admin to authenticated;

comment on column public.affordable_properties.latitude is
  'Map position (WGS 84). Set together with longitude, location_source and location_checked_on.';
comment on column public.affordable_properties.location_source is
  'census_geocoder when matched from the street address by the U.S. Census Bureau geocoder; manual when placed by an administrator.';
comment on column public.affordable_properties.location_checked_on is
  'Date the location was matched or placed. A later address change should prompt a new lookup.';

-- Move the coordinates /map already uses into the records. They are Census
-- geocoder matches from 2026-10-27 (src/data/affordablePropertyLocations.json).
-- Dolores Apartments is left out until its published address is confirmed:
-- the geocoder matched it to a different street direction, city and ZIP.
-- Rows that already have a location are not touched, so running this again
-- changes nothing.
update public.affordable_properties p
   set latitude = v.latitude,
       longitude = v.longitude,
       location_source = 'census_geocoder',
       location_checked_on = v.checked_on
  from (values
    ('4690b230-5abd-498f-89c1-5eb968c26812'::uuid, 45.485820, -122.587409, date '2026-10-27'),  -- 73Foster
    ('31fb31fe-3f97-42a0-b61e-a387ef89eb27'::uuid, 45.522673, -122.539018, date '2026-10-27'),  -- Blackburn Center Apartments
    ('5c852f4a-8127-4928-aacf-74d7db60235f'::uuid, 45.495403, -122.494893, date '2026-10-27'),  -- Centennial Place Apartments
    ('c637a33c-3023-4d30-98d8-37fafcc76944'::uuid, 45.434592, -122.747071, date '2026-10-27'),  -- Dartmouth Crossing North
    ('916d2d04-33b4-44d1-aabf-eaa45c42f295'::uuid, 45.529324, -122.680499, date '2026-10-27'),  -- Pearl Court Apartments
    ('e1474334-8f03-40f6-a2b1-8941128ccc94'::uuid, 45.522668, -122.513134, date '2026-10-27'),  -- The Bria Apartments
    ('2ccca6b9-c566-4e59-b61f-01c96998112b'::uuid, 45.515915, -122.686984, date '2026-10-27'),  -- Gretchen Kafoury Commons
    ('e9da3e2a-5a6d-4145-b418-c04f732e1305'::uuid, 45.484470, -122.584719, date '2026-10-27'),  -- Jim and Salle's Place
    ('fed56e42-885b-46a7-bf70-60daea4120f8'::uuid, 45.489844, -122.556751, date '2026-10-27'),  -- Lents Village Apartments
    ('a220868e-a7aa-4565-b685-a73dd8f008df'::uuid, 47.036796, -122.928682, date '2026-10-27'),  -- Evergreen Vista I
    ('d4f04f09-624f-417e-a030-0405240a534b'::uuid, 47.506341, -122.344727, date '2026-10-27')   -- Canopy White Center
  ) as v(id, latitude, longitude, checked_on)
 where p.id = v.id
   and p.latitude is null;

commit;
