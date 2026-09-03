-- Housing Navigator -- finish the security handoff after production migration
-- 0015 was used by the legacy-profile backfill.

begin;

-- DBR-001: bind review actions to the exact suggestion version shown.
-- The legacy two-argument function may not exist in every environment, so
-- make this repair safe to apply to both fresh and established projects.
drop function if exists public.review_waitlist_suggestion(uuid, boolean);

create or replace function public.review_waitlist_suggestion(
  p_suggestion_id             uuid,
  p_approve                   boolean,
  p_expected_updated_at       timestamptz,
  p_expected_previous_status  text,
  p_expected_suggested_status text
)
returns public.waitlist_status_suggestions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.waitlist_status_suggestions;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select * into s
    from public.waitlist_status_suggestions
   where id = p_suggestion_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'stale review: suggestion was already reviewed or removed';
  end if;

  if s.updated_at is distinct from p_expected_updated_at
     or s.previous_status is distinct from p_expected_previous_status
     or s.suggested_status is distinct from p_expected_suggested_status then
    raise exception 'stale review: suggestion changed; refresh the review queue';
  end if;

  if p_approve then
    update public.waitlists
       set status = s.suggested_status,
           last_checked = current_date,
           check_failures = 0
     where id = s.waitlist_id
       and status = s.previous_status;
    if not found then
      raise exception 'stale review: waitlist status changed; refresh the review queue';
    end if;
  end if;

  update public.waitlist_status_suggestions
     set status      = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         updated_at  = now()
   where id = p_suggestion_id
   returning * into s;

  return s;
end;
$$;

revoke all on function public.review_waitlist_suggestion(uuid, boolean, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.review_waitlist_suggestion(uuid, boolean, timestamptz, text, text)
  to authenticated;

comment on function public.review_waitlist_suggestion(uuid, boolean, timestamptz, text, text) is
  'Authenticated admin compare-and-swap review RPC; rejects stale suggestion or waitlist state.';

-- EDGE-003: the deployed checker writes this field to both audit tables.
-- Without these columns, every audit-log insert fails and any detected status
-- change also fails before it can reach the admin review queue.
alter table public.waitlist_status_checks
  add column if not exists evidence_verified boolean not null default false;
alter table public.waitlist_status_suggestions
  add column if not exists evidence_verified boolean not null default false;

-- DBV-001: serialize a rolling-window quota decision and ledger insert.
create or replace function public.claim_admin_alert_invocation(
  p_admin_user_id uuid,
  p_limit integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  invocation_count integer;
begin
  if p_admin_user_id is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid alert quota claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_admin_user_id::text, 0)
  );

  select count(*) into invocation_count
    from public.alert_invocations
   where admin_user_id = p_admin_user_id
     and invoked_at > now() - interval '1 hour';

  if invocation_count >= p_limit then
    return false;
  end if;

  insert into public.alert_invocations (admin_user_id)
  values (p_admin_user_id);
  return true;
end;
$$;

revoke all on function public.claim_admin_alert_invocation(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_admin_alert_invocation(uuid, integer)
  to service_role;

comment on function public.claim_admin_alert_invocation(uuid, integer) is
  'Service-role-only atomic rolling-hour quota claim for admin alert fan-outs.';

-- EDGE-005: re-enabling email gets a fresh unsubscribe capability. The Edge
-- Function separately rotates it in the same update that turns email off.
create or replace function public.rotate_unsubscribe_token_on_reenable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.email_notifications_enabled = false
     and new.email_notifications_enabled = true then
    new.unsubscribe_token = gen_random_uuid();
  end if;
  return new;
end;
$$;

drop trigger if exists rotate_unsubscribe_token_on_reenable on public.profiles;
create trigger rotate_unsubscribe_token_on_reenable
  before update of email_notifications_enabled on public.profiles
  for each row
  execute function public.rotate_unsubscribe_token_on_reenable();

revoke all on function public.rotate_unsubscribe_token_on_reenable()
  from public, anon, authenticated;

commit;
