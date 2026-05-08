-- Housing Navigator — admin CMS schema
--
-- Adds the canonical `resources` table (replacing the legacy `programs`
-- table for application use), extends `waitlists` with publish + notes
-- columns, introduces `admin_users` for simple authorization, and wires
-- RLS so:
--
--   * anon  → read only `published = true` rows on resources / waitlists
--   * admin → full read/write on resources / waitlists (drafts included)
--
-- The legacy `programs` table from 0001_init is left in place so the
-- existing seed pipeline keeps working; it is no longer read by the app
-- once `supabaseDataService` is wired against `resources`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- resources (canonical)
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  category            text not null,
  county              text not null,
  city                text,
  state               text,
  description         text,
  who_qualifies       text,
  -- Internal-only legacy taxonomy used by the deterministic recommendation
  -- engine; never surfaced on the public directory.
  who_it_helps        text[] not null default '{}',
  application_method  text not null default 'walk_in',
  referral_required   boolean not null default false,
  phone               text,
  website             text,
  address             text,
  source_url          text,
  source_type         text,
  last_verified       date,
  public_notes        text,
  internal_notes      text,
  priority_score      integer not null default 0,
  published           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists resources_county_idx     on public.resources (county);
create index if not exists resources_category_idx   on public.resources (category);
create index if not exists resources_published_idx  on public.resources (published);

-- ---------------------------------------------------------------------------
-- waitlists — extend existing table
-- ---------------------------------------------------------------------------
alter table public.waitlists
  add column if not exists city           text,
  add column if not exists state          text,
  add column if not exists public_notes   text,
  add column if not exists internal_notes text,
  add column if not exists published      boolean not null default false;

-- Backfill public_notes from the legacy `notes` column the first time the
-- migration runs so existing rows surface their copy on the public site.
update public.waitlists
   set public_notes = notes
 where public_notes is null
   and notes is not null;

create index if not exists waitlists_published_idx on public.waitlists (published);

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Each signed-in user may read only their own row. Do NOT use a subquery
-- that scans admin_users again — Postgres RLS would recurse (42P17).
drop policy if exists "admin_users_self_read" on public.admin_users;
create policy "admin_users_self_read"
  on public.admin_users for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- updated_at trigger on resources (waitlists trigger created in 0001)
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.resources;
create trigger set_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: is_admin()
--
-- Wraps the admin lookup so policies stay readable. SECURITY DEFINER avoids
-- a recursive RLS check against admin_users when used inside a policy.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security — resources
-- ---------------------------------------------------------------------------
alter table public.resources enable row level security;

drop policy if exists "resources_public_read"  on public.resources;
drop policy if exists "resources_admin_read"   on public.resources;
drop policy if exists "resources_admin_insert" on public.resources;
drop policy if exists "resources_admin_update" on public.resources;
drop policy if exists "resources_admin_delete" on public.resources;

create policy "resources_public_read"
  on public.resources for select
  to anon, authenticated
  using (published = true);

create policy "resources_admin_read"
  on public.resources for select
  to authenticated
  using (public.is_admin());

create policy "resources_admin_insert"
  on public.resources for insert
  to authenticated
  with check (public.is_admin());

create policy "resources_admin_update"
  on public.resources for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "resources_admin_delete"
  on public.resources for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Row level security — waitlists
--
-- 0001 created a permissive public-read policy; tighten it to published-only
-- and add admin policies so drafts only flow to authenticated admins.
-- ---------------------------------------------------------------------------
drop policy if exists "waitlists_public_read"  on public.waitlists;
drop policy if exists "waitlists_admin_read"   on public.waitlists;
drop policy if exists "waitlists_admin_insert" on public.waitlists;
drop policy if exists "waitlists_admin_update" on public.waitlists;
drop policy if exists "waitlists_admin_delete" on public.waitlists;

create policy "waitlists_public_read"
  on public.waitlists for select
  to anon, authenticated
  using (published = true);

create policy "waitlists_admin_read"
  on public.waitlists for select
  to authenticated
  using (public.is_admin());

create policy "waitlists_admin_insert"
  on public.waitlists for insert
  to authenticated
  with check (public.is_admin());

create policy "waitlists_admin_update"
  on public.waitlists for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "waitlists_admin_delete"
  on public.waitlists for delete
  to authenticated
  using (public.is_admin());
