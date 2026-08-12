-- Housing Navigator -- affordable apartment/property directory
--
-- Properties are intentionally separate from resources (services) and
-- waitlists (time-sensitive application status). A property may link to one
-- published waitlist, allowing the public UI to display current status without
-- duplicating it on the property record.

begin;

create table if not exists public.affordable_properties (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (btrim(name) <> ''),
  owner_organization    text,
  management_company    text,
  property_type         text not null default 'affordable_apartments'
    check (property_type in (
      'affordable_apartments',
      'public_housing',
      'project_based_section8',
      'tax_credit',
      'senior_housing',
      'supportive_housing',
      'mixed'
    )),
  address               text,
  city                  text not null check (btrim(city) <> ''),
  county                text not null check (btrim(county) <> ''),
  state                 text not null check (state in ('OR', 'WA')),
  postal_code           text,
  description           text,
  eligibility_summary   text,
  ami_levels            smallint[] not null default '{}',
  bedroom_types         text[] not null default '{}',
  audiences             text[] not null default '{}',
  total_units           integer check (total_units is null or total_units > 0),
  accessibility_notes   text,
  phone                 text,
  website               text,
  application_url       text,
  source_url            text,
  source_type           text,
  last_verified         date,
  public_notes          text,
  internal_notes        text,
  priority_score        integer not null default 0,
  published             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint affordable_properties_ami_levels_check check (
    ami_levels <@ array[20, 30, 40, 50, 60, 70, 80, 100]::smallint[]
  ),
  constraint affordable_properties_bedroom_types_check check (
    bedroom_types <@ array['studio', 'sro', '1', '2', '3', '4_plus']::text[]
  ),
  constraint affordable_properties_audiences_check check (
    audiences <@ array[
      'general', 'families', 'seniors', 'veterans', 'disabilities',
      'farmworkers', 'formerly_homeless', 'recovery'
    ]::text[]
  )
);

create index if not exists affordable_properties_location_idx
  on public.affordable_properties (state, county, city);
create index if not exists affordable_properties_published_idx
  on public.affordable_properties (published);
create index if not exists affordable_properties_type_idx
  on public.affordable_properties (property_type);

drop trigger if exists set_updated_at on public.affordable_properties;
create trigger set_updated_at
  before update on public.affordable_properties
  for each row execute function public.set_updated_at();

alter table public.affordable_properties enable row level security;

drop policy if exists "affordable_properties_public_read"
  on public.affordable_properties;
create policy "affordable_properties_public_read"
  on public.affordable_properties for select
  to anon, authenticated
  using (published = true);

drop policy if exists "affordable_properties_admin_read"
  on public.affordable_properties;
create policy "affordable_properties_admin_read"
  on public.affordable_properties for select
  to authenticated
  using (public.is_admin());

drop policy if exists "affordable_properties_admin_insert"
  on public.affordable_properties;
create policy "affordable_properties_admin_insert"
  on public.affordable_properties for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "affordable_properties_admin_update"
  on public.affordable_properties;
create policy "affordable_properties_admin_update"
  on public.affordable_properties for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "affordable_properties_admin_delete"
  on public.affordable_properties;
create policy "affordable_properties_admin_delete"
  on public.affordable_properties for delete
  to authenticated
  using (public.is_admin());

revoke all on public.affordable_properties from public, anon, authenticated;
grant select (
  id, name, owner_organization, management_company, property_type,
  address, city, county, state, postal_code, description,
  eligibility_summary, ami_levels, bedroom_types, audiences, total_units,
  accessibility_notes, phone, website, application_url, source_url,
  source_type, last_verified, public_notes, priority_score, published,
  created_at, updated_at
) on public.affordable_properties to anon, authenticated;
grant insert, update, delete on public.affordable_properties to authenticated;

-- Classify existing waitlists and optionally connect a property-specific
-- waitlist to its property. The foreign key is nullable because voucher and
-- portfolio-wide waitlists do not represent one apartment building.
alter table public.waitlists
  add column if not exists waitlist_type text not null default 'other',
  add column if not exists affordable_property_id uuid
    references public.affordable_properties(id) on delete set null;

alter table public.waitlists
  drop constraint if exists waitlists_waitlist_type_check;
alter table public.waitlists
  add constraint waitlists_waitlist_type_check check (waitlist_type in (
    'affordable_property',
    'housing_choice_voucher',
    'public_housing',
    'mixed',
    'other'
  ));

create index if not exists waitlists_type_idx on public.waitlists (waitlist_type);
create unique index if not exists waitlists_affordable_property_unique_idx
  on public.waitlists (affordable_property_id)
  where affordable_property_id is not null;

revoke select on public.waitlists from anon, authenticated;
grant select (
  id, housing_authority, program_name, county, city, state, status,
  application_link, source_url, last_checked, notes, public_notes,
  published, created_at, updated_at, waitlist_type, affordable_property_id
) on public.waitlists to anon, authenticated;

-- Atomic link replacement for the property editor. It guarantees that one
-- property cannot accidentally point at two competing status records.
create or replace function public.replace_affordable_property_waitlist(
  p_property_id uuid,
  p_waitlist_id text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator access required';
  end if;

  if not exists (
    select 1 from public.affordable_properties p where p.id = p_property_id
  ) then
    raise exception 'affordable property not found';
  end if;

  if p_waitlist_id is not null and not exists (
    select 1 from public.waitlists w where w.id = p_waitlist_id
  ) then
    raise exception 'waitlist not found';
  end if;

  update public.waitlists
     set affordable_property_id = null
   where affordable_property_id = p_property_id;

  if p_waitlist_id is not null then
    update public.waitlists
       set affordable_property_id = p_property_id,
           waitlist_type = 'affordable_property'
     where id = p_waitlist_id;
  end if;
end;
$$;

revoke all on function public.replace_affordable_property_waitlist(uuid, text)
  from public, anon, authenticated;
grant execute on function public.replace_affordable_property_waitlist(uuid, text)
  to authenticated;

-- Private admin row provider follows the same least-privilege pattern as the
-- resource and waitlist admin views from migration 0013.
create or replace function app_private.affordable_properties_admin_rows()
returns setof public.affordable_properties
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
    from public.affordable_properties p
   where public.is_admin();
$$;

revoke all on function app_private.affordable_properties_admin_rows()
  from public, anon, authenticated;
grant execute on function app_private.affordable_properties_admin_rows()
  to authenticated;

create or replace view public.waitlists_public
  with (security_invoker = true) as
  select
    w.id, w.housing_authority, w.program_name, w.county, w.city, w.state,
    w.status, w.application_link, w.source_url, w.last_checked, w.notes,
    w.public_notes, w.published, w.created_at, w.updated_at,
    (
      select max(h.changed_at)
        from public.waitlist_status_history h
       where h.waitlist_id = w.id
         and h.new_status = 'open'
    ) as last_opened_at,
    w.waitlist_type,
    w.affordable_property_id
  from public.waitlists w;

create or replace view public.waitlists_admin
  with (security_invoker = true, security_barrier = true) as
  select * from app_private.waitlists_admin_rows();

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
    w.application_link as waitlist_application_link
  from public.affordable_properties p
  left join lateral (
    select linked.id, linked.status, linked.last_checked, linked.application_link
      from public.waitlists linked
     where linked.affordable_property_id = p.id
       and linked.published = true
     order by linked.updated_at desc
     limit 1
  ) w on true;

create or replace view public.affordable_properties_admin
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

revoke all on public.waitlists_public from public, anon, authenticated;
revoke all on public.waitlists_admin from public, anon, authenticated;
revoke all on public.affordable_properties_public from public, anon, authenticated;
revoke all on public.affordable_properties_admin from public, anon, authenticated;

grant select on public.waitlists_public to anon, authenticated;
grant select on public.waitlists_admin to authenticated;
grant select on public.affordable_properties_public to anon, authenticated;
grant select on public.affordable_properties_admin to authenticated;

comment on table public.affordable_properties is
  'Physical affordable apartment properties; services stay in resources and application status stays in waitlists.';
comment on column public.waitlists.waitlist_type is
  'Distinguishes apartment/property, voucher, public-housing, mixed, and other waitlists.';
comment on function public.replace_affordable_property_waitlist(uuid, text) is
  'Atomically replaces the single waitlist linked to an affordable property.';

commit;
