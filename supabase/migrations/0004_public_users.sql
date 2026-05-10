-- Housing Navigator — public user accounts
--
-- Adds the four tables that back the public dashboard:
--   * profiles            — one row per signed-up visitor (1:1 with auth.users)
--   * saved_resources     — visitor bookmarks of public resources
--   * waitlist_alerts     — visitor follow + notification preferences for a waitlist
--   * notification_events — outbox queue for future email/SMS dispatch
--
-- Public auth is intentionally separate from admin auth at the *UX* layer
-- (different sign-in pages, different gating contexts) but shares the same
-- Supabase auth.users table — Supabase has one session per browser tab. A
-- visitor is "an admin" when they appear in public.admin_users (existing
-- 0002 logic, unchanged) and "a public user" when they appear in profiles.
-- Most accounts will be one or the other; both is harmless.
--
-- TODO(notifications): notification_events is a write-only outbox in this
-- migration. A Supabase Edge Function (planned) will read pending rows and
-- dispatch via Resend / Twilio, then mark them sent. Schema kept minimal
-- so we can add a `sent_at`/`channel` column later without churn.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                            uuid primary key references auth.users(id) on delete cascade,
  email                         text,
  display_name                  text,
  home_county                   text,
  email_notifications_enabled   boolean not null default true,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- saved_resources
-- ---------------------------------------------------------------------------
create table if not exists public.saved_resources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, resource_id)
);

create index if not exists saved_resources_user_idx on public.saved_resources (user_id);

-- ---------------------------------------------------------------------------
-- waitlist_alerts
-- ---------------------------------------------------------------------------
-- waitlists.id is text in 0001_init.sql, so this FK is text-typed too.
create table if not exists public.waitlist_alerts (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  waitlist_id               text not null references public.waitlists(id) on delete cascade,
  notify_on_open            boolean not null default true,
  notify_on_status_change   boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (user_id, waitlist_id)
);

create index if not exists waitlist_alerts_user_idx     on public.waitlist_alerts (user_id);
create index if not exists waitlist_alerts_waitlist_idx on public.waitlist_alerts (waitlist_id);

drop trigger if exists set_updated_at on public.waitlist_alerts;
create trigger set_updated_at
  before update on public.waitlist_alerts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_events
-- ---------------------------------------------------------------------------
create table if not exists public.notification_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null,
  title       text not null,
  body        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notification_events_user_idx on public.notification_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
--
-- security definer so the trigger bypasses RLS when inserting the profile
-- row that the new auth.users id needs. The function is owned by the
-- migration author (postgres) which is exactly what we want.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.saved_resources     enable row level security;
alter table public.waitlist_alerts     enable row level security;
alter table public.notification_events enable row level security;

-- profiles: read + update your own row only. Insert is handled by the
-- security-definer trigger above, so no insert policy is needed.
drop policy if exists "profiles_self_read"   on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;

create policy "profiles_self_read"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_self_update"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- saved_resources: full CRUD on your own bookmarks.
drop policy if exists "saved_resources_self_read"   on public.saved_resources;
drop policy if exists "saved_resources_self_insert" on public.saved_resources;
drop policy if exists "saved_resources_self_delete" on public.saved_resources;

create policy "saved_resources_self_read"
  on public.saved_resources for select
  to authenticated
  using (user_id = auth.uid());

create policy "saved_resources_self_insert"
  on public.saved_resources for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "saved_resources_self_delete"
  on public.saved_resources for delete
  to authenticated
  using (user_id = auth.uid());

-- waitlist_alerts: full CRUD on your own follows + notification prefs.
drop policy if exists "waitlist_alerts_self_read"   on public.waitlist_alerts;
drop policy if exists "waitlist_alerts_self_insert" on public.waitlist_alerts;
drop policy if exists "waitlist_alerts_self_update" on public.waitlist_alerts;
drop policy if exists "waitlist_alerts_self_delete" on public.waitlist_alerts;

create policy "waitlist_alerts_self_read"
  on public.waitlist_alerts for select
  to authenticated
  using (user_id = auth.uid());

create policy "waitlist_alerts_self_insert"
  on public.waitlist_alerts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "waitlist_alerts_self_update"
  on public.waitlist_alerts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "waitlist_alerts_self_delete"
  on public.waitlist_alerts for delete
  to authenticated
  using (user_id = auth.uid());

-- notification_events: read your own + mark them read. Inserts come from
-- a future server-side worker (Edge Function with the service-role key),
-- so no insert policy is exposed to clients.
drop policy if exists "notification_events_self_read"   on public.notification_events;
drop policy if exists "notification_events_self_update" on public.notification_events;

create policy "notification_events_self_read"
  on public.notification_events for select
  to authenticated
  using (user_id = auth.uid());

create policy "notification_events_self_update"
  on public.notification_events for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
