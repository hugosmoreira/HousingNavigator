-- Housing Navigator — administrator user-management audit trail
--
-- Auth users remain private inside Supabase Auth. The admin browser calls the
-- `admin-users` Edge Function, which validates the caller's JWT and membership
-- in public.admin_users before using the service-role Auth Admin API.

begin;

create table if not exists public.admin_user_actions (
  id                uuid primary key default gen_random_uuid(),
  actor_user_id     uuid references auth.users(id) on delete set null,
  target_user_id    uuid not null,
  target_email      text not null,
  action            text not null check (action in ('invite', 'block', 'unblock', 'delete')),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists admin_user_actions_created_idx
  on public.admin_user_actions (created_at desc);
create index if not exists admin_user_actions_target_idx
  on public.admin_user_actions (target_user_id, created_at desc);

alter table public.admin_user_actions enable row level security;

drop policy if exists "admin_user_actions_admin_read" on public.admin_user_actions;
create policy "admin_user_actions_admin_read"
  on public.admin_user_actions for select
  to authenticated
  using (public.is_admin());

revoke all on public.admin_user_actions from public, anon, authenticated;
grant select on public.admin_user_actions to authenticated;
grant select, insert on public.admin_user_actions to service_role;

-- The Edge Function enriches an Auth page with only the public application
-- data required by the dashboard. Explicit grants keep its access narrow.
grant select on public.profiles to service_role;
grant select on public.saved_resources to service_role;
grant select on public.waitlist_alerts to service_role;
grant select on public.admin_users to service_role;

comment on table public.admin_user_actions is
  'Append-only audit trail for successful administrator account actions.';

commit;
