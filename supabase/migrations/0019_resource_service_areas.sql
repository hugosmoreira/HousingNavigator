-- Housing Navigator -- normalized Oregon/Washington resource service areas
--
-- A provider's office location is not necessarily the same as the counties it
-- serves. This relation lets one resource cover several counties (or an entire
-- state) without duplicating the resource. The legacy resources.state/county
-- columns remain as a primary-area compatibility surface for older clients.

begin;

create table if not exists public.resource_service_areas (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  state       text not null check (state in ('OR', 'WA')),
  -- NULL means the resource serves the whole state.
  county      text check (county is null or btrim(county) <> ''),
  sort_order  smallint not null default 0 check (sort_order >= 0),
  created_at  timestamptz not null default now()
);

create unique index if not exists resource_service_areas_unique_idx
  on public.resource_service_areas (resource_id, state, coalesce(county, ''));
create index if not exists resource_service_areas_lookup_idx
  on public.resource_service_areas (state, county, resource_id);

alter table public.resource_service_areas enable row level security;

drop policy if exists "resource_service_areas_public_read"
  on public.resource_service_areas;
create policy "resource_service_areas_public_read"
  on public.resource_service_areas for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.resources r
       where r.id = resource_id
         and r.published = true
    )
  );

drop policy if exists "resource_service_areas_admin_read"
  on public.resource_service_areas;
create policy "resource_service_areas_admin_read"
  on public.resource_service_areas for select
  to authenticated
  using (public.is_admin());

drop policy if exists "resource_service_areas_admin_insert"
  on public.resource_service_areas;
create policy "resource_service_areas_admin_insert"
  on public.resource_service_areas for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "resource_service_areas_admin_update"
  on public.resource_service_areas;
create policy "resource_service_areas_admin_update"
  on public.resource_service_areas for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "resource_service_areas_admin_delete"
  on public.resource_service_areas;
create policy "resource_service_areas_admin_delete"
  on public.resource_service_areas for delete
  to authenticated
  using (public.is_admin());

revoke all on public.resource_service_areas from public, anon, authenticated;
grant select on public.resource_service_areas to anon, authenticated;
grant insert, update, delete on public.resource_service_areas to authenticated;

-- Validate county names at the database boundary. A null county represents a
-- statewide service and is valid for either supported state.
create or replace function public.is_supported_resource_service_area(
  p_state text,
  p_county text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.upper(pg_catalog.btrim(p_state))
    when 'OR' then p_county is null or pg_catalog.btrim(p_county) = any (array[
      'Baker', 'Benton', 'Clackamas', 'Clatsop', 'Columbia', 'Coos',
      'Crook', 'Curry', 'Deschutes', 'Douglas', 'Gilliam', 'Grant',
      'Harney', 'Hood River', 'Jackson', 'Jefferson', 'Josephine',
      'Klamath', 'Lake', 'Lane', 'Lincoln', 'Linn', 'Malheur', 'Marion',
      'Morrow', 'Multnomah', 'Polk', 'Sherman', 'Tillamook', 'Umatilla',
      'Union', 'Wallowa', 'Wasco', 'Washington', 'Wheeler', 'Yamhill'
    ])
    when 'WA' then p_county is null or pg_catalog.btrim(p_county) = any (array[
      'Adams', 'Asotin', 'Benton', 'Chelan', 'Clallam', 'Clark',
      'Columbia', 'Cowlitz', 'Douglas', 'Ferry', 'Franklin', 'Garfield',
      'Grant', 'Grays Harbor', 'Island', 'Jefferson', 'King', 'Kitsap',
      'Kittitas', 'Klickitat', 'Lewis', 'Lincoln', 'Mason', 'Okanogan',
      'Pacific', 'Pend Oreille', 'Pierce', 'San Juan', 'Skagit',
      'Skamania', 'Snohomish', 'Spokane', 'Stevens', 'Thurston',
      'Wahkiakum', 'Walla Walla', 'Whatcom', 'Whitman', 'Yakima'
    ])
    else false
  end;
$$;

revoke all on function public.is_supported_resource_service_area(text, text)
  from public, anon;
grant execute on function public.is_supported_resource_service_area(text, text)
  to authenticated, service_role;

alter table public.resource_service_areas
  drop constraint if exists resource_service_areas_supported_area_check;
alter table public.resource_service_areas
  add constraint resource_service_areas_supported_area_check
  check (public.is_supported_resource_service_area(state, county));

-- Correct the known legacy rows whose state was blank before backfilling.
update public.resources
   set state = case when county = 'Clark' then 'WA' else 'OR' end
 where nullif(btrim(state), '') is null
   and county in ('Multnomah', 'Clark', 'Washington', 'Clackamas', 'Other');

insert into public.resource_service_areas (resource_id, state, county, sort_order)
select
  r.id,
  upper(btrim(r.state)),
  case when r.county = 'Other' then null else btrim(r.county) end,
  0
from public.resources r
where upper(btrim(r.state)) in ('OR', 'WA')
  and public.is_supported_resource_service_area(
    upper(btrim(r.state)),
    case when r.county = 'Other' then null else btrim(r.county) end
  )
on conflict do nothing;

-- Atomic admin operation used by the editor. It validates the complete list
-- before replacing anything, so a malformed request cannot leave a resource
-- with a partially saved service area.
create or replace function public.replace_resource_service_areas(
  p_resource_id uuid,
  p_service_areas jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_state text;
  v_county text;
begin
  if not public.is_admin() then
    raise exception 'administrator access required';
  end if;

  if not exists (select 1 from public.resources r where r.id = p_resource_id) then
    raise exception 'resource not found';
  end if;

  if p_service_areas is null
     or pg_catalog.jsonb_typeof(p_service_areas) <> 'array'
     or pg_catalog.jsonb_array_length(p_service_areas) = 0
     or pg_catalog.jsonb_array_length(p_service_areas) > 80 then
    raise exception 'service areas must contain between 1 and 80 entries';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_service_areas) area(value)
     where not public.is_supported_resource_service_area(
       pg_catalog.upper(pg_catalog.btrim(area.value->>'state')),
       nullif(pg_catalog.btrim(area.value->>'county'), '')
     )
  ) then
    raise exception 'unsupported Oregon or Washington service area';
  end if;

  select
    pg_catalog.upper(pg_catalog.btrim(area.value->>'state')),
    nullif(pg_catalog.btrim(area.value->>'county'), '')
    into v_state, v_county
    from pg_catalog.jsonb_array_elements(p_service_areas)
         with ordinality as area(value, position)
   order by area.position
   limit 1;

  delete from public.resource_service_areas
   where resource_id = p_resource_id;

  insert into public.resource_service_areas (
    resource_id,
    state,
    county,
    sort_order
  )
  select
    p_resource_id,
    pg_catalog.upper(pg_catalog.btrim(area.value->>'state')),
    nullif(pg_catalog.btrim(area.value->>'county'), ''),
    (area.position - 1)::smallint
  from pg_catalog.jsonb_array_elements(p_service_areas)
       with ordinality as area(value, position)
  on conflict do nothing;

  -- Compatibility for code paths that have not adopted service_areas yet.
  update public.resources
     set state = v_state,
         county = coalesce(v_county, 'Other')
   where id = p_resource_id;
end;
$$;

revoke all on function public.replace_resource_service_areas(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_resource_service_areas(uuid, jsonb)
  to authenticated;

-- Keep imports and other direct inserts compatible by creating their primary
-- service area automatically. The admin RPC replaces this with the full list.
create or replace function public.seed_primary_resource_service_area()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_county text;
begin
  v_state := pg_catalog.upper(pg_catalog.btrim(new.state));
  v_county := case
    when new.county = 'Other' then null
    else nullif(pg_catalog.btrim(new.county), '')
  end;

  if public.is_supported_resource_service_area(v_state, v_county) then
    insert into public.resource_service_areas (resource_id, state, county, sort_order)
    values (new.id, v_state, v_county, 0)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.seed_primary_resource_service_area()
  from public, anon, authenticated;

drop trigger if exists seed_primary_service_area on public.resources;
create trigger seed_primary_service_area
  after insert on public.resources
  for each row execute function public.seed_primary_resource_service_area();

-- Append the normalized area list to both read surfaces. Internal notes remain
-- excluded from resources_public and available only through resources_admin.
create or replace view public.resources_public
  with (security_invoker = true) as
  select
    r.id, r.name, r.category, r.county, r.city, r.state, r.description,
    r.who_qualifies, r.who_it_helps, r.application_method,
    r.referral_required, r.phone, r.website, r.address, r.source_url,
    r.source_type, r.last_verified, r.public_notes, r.priority_score,
    r.published, r.created_at, r.updated_at,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('state', a.state, 'county', a.county)
          order by a.sort_order, a.state, a.county
        )
        from public.resource_service_areas a
        where a.resource_id = r.id
      ),
      '[]'::jsonb
    ) as service_areas
  from public.resources r;

create or replace view public.resources_admin
  with (security_invoker = true, security_barrier = true) as
  select
    r.*,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('state', a.state, 'county', a.county)
          order by a.sort_order, a.state, a.county
        )
        from public.resource_service_areas a
        where a.resource_id = r.id
      ),
      '[]'::jsonb
    ) as service_areas
  from app_private.resources_admin_rows() r;

revoke all on public.resources_public from public, anon, authenticated;
revoke all on public.resources_admin from public, anon, authenticated;
grant select on public.resources_public to anon, authenticated;
grant select on public.resources_admin to authenticated;

comment on table public.resource_service_areas is
  'Normalized Oregon/Washington counties served by each resource; null county means statewide.';
comment on function public.replace_resource_service_areas(uuid, jsonb) is
  'Atomically validates and replaces an admin-managed resource service-area list.';

commit;
