-- Housing Navigator — clear Security Definer View advisor findings without
-- reopening admin-only columns or bypassing row security for normal users.
--
-- The public views are SECURITY INVOKER. Their narrowly scoped row providers
-- are SECURITY DEFINER functions in a non-exposed schema, explicitly gated by
-- public.is_admin(), locked to an empty search_path, and executable only by
-- authenticated users. Non-admin callers receive zero rows.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create or replace function app_private.resources_admin_rows()
returns setof public.resources
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
    from public.resources r
   where public.is_admin();
$$;

create or replace function app_private.waitlists_admin_rows()
returns setof public.waitlists
language sql
stable
security definer
set search_path = ''
as $$
  select w.*
    from public.waitlists w
   where public.is_admin();
$$;

create or replace function app_private.alert_send_log_admin_rows()
returns table (
  waitlist_id text,
  waitlist_name text,
  previous_status text,
  new_status text,
  recipient_count bigint,
  sent_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.metadata->>'waitlist_id' as waitlist_id,
    coalesce(
      w.housing_authority || coalesce(' - ' || w.program_name, ''),
      e.metadata->>'waitlist_id'
    ) as waitlist_name,
    e.metadata->>'previous_status' as previous_status,
    e.metadata->>'new_status' as new_status,
    count(*) as recipient_count,
    min(e.created_at) as sent_at
  from public.notification_events e
  left join public.waitlists w on w.id = e.metadata->>'waitlist_id'
  where e.event_type = 'waitlist_status_change'
    and public.is_admin()
  group by
    e.metadata->>'waitlist_id',
    w.housing_authority,
    w.program_name,
    e.metadata->>'previous_status',
    e.metadata->>'new_status',
    date_trunc('day', e.created_at);
$$;

revoke all on function app_private.resources_admin_rows()
  from public, anon, authenticated;
revoke all on function app_private.waitlists_admin_rows()
  from public, anon, authenticated;
revoke all on function app_private.alert_send_log_admin_rows()
  from public, anon, authenticated;

grant execute on function app_private.resources_admin_rows()
  to authenticated;
grant execute on function app_private.waitlists_admin_rows()
  to authenticated;
grant execute on function app_private.alert_send_log_admin_rows()
  to authenticated;

create or replace view public.resources_admin
  with (security_invoker = true, security_barrier = true) as
  select * from app_private.resources_admin_rows();

-- Recreating this view after 0012 also exposes its three admin-only automation
-- columns, which were added after the original SELECT * view was created.
create or replace view public.waitlists_admin
  with (security_invoker = true, security_barrier = true) as
  select * from app_private.waitlists_admin_rows();

create or replace view public.alert_send_log_admin
  with (security_invoker = true, security_barrier = true) as
  select * from app_private.alert_send_log_admin_rows();

revoke all on public.resources_admin from public, anon, authenticated;
revoke all on public.waitlists_admin from public, anon, authenticated;
revoke all on public.alert_send_log_admin from public, anon, authenticated;

grant select on public.resources_admin to authenticated;
grant select on public.waitlists_admin to authenticated;
grant select on public.alert_send_log_admin to authenticated;

comment on schema app_private is
  'Non-exposed helpers for least-privilege public API views.';
