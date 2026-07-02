-- Housing Navigator — alert operations improvements
--
-- Follow-ups recommended after the Codex scan fixes (0010):
--
--   1. profiles.unsubscribe_token   — one-click email unsubscribe (List-Unsubscribe)
--   2. waitlist_status_history      — record every status transition; powers a
--                                     public "Last opened <date>" hint per waitlist
--   3. alert_invocations            — rate-limit ledger for the Edge Function's
--                                     admin-JWT path (service-role only)
--   4. alert_send_log_admin         — admin CMS view of alert batches actually sent
--
-- Idempotent: add-if-not-exists / create-or-replace / revoke + re-grant.

-- ---------------------------------------------------------------------------
-- 1. profiles.unsubscribe_token
--
-- Mailed in every alert as a one-click unsubscribe link + List-Unsubscribe
-- header (handled by the `unsubscribe-alerts` Edge Function, which flips
-- email_notifications_enabled off via the service role). The token is only a
-- self-opt-out capability: a user reading their own row (RLS self-read) can
-- only unsubscribe themselves. It is NOT client-writable — the 0008
-- column-scoped UPDATE grant on profiles doesn't include it.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_unsubscribe_token_idx
  on public.profiles (unsubscribe_token);

-- ---------------------------------------------------------------------------
-- 2. waitlist_status_history
--
-- One row per status transition (any direction, however it happened: CMS
-- form, CSV import, SQL). Recorded by a SECURITY DEFINER trigger so the
-- write succeeds no matter which role performed the update; clients get
-- read-only access gated to published waitlists.
-- ---------------------------------------------------------------------------

create table if not exists public.waitlist_status_history (
  id          bigint generated always as identity primary key,
  waitlist_id text not null references public.waitlists(id) on delete cascade,
  old_status  text,
  new_status  text not null,
  changed_at  timestamptz not null default now()
);

create index if not exists waitlist_status_history_wl_idx
  on public.waitlist_status_history (waitlist_id, new_status, changed_at desc);

alter table public.waitlist_status_history enable row level security;

-- Read-only for clients (drop the default blanket grant first), and only
-- for waitlists the public can already see. waitlist_is_published (0010)
-- needs anon execute for the policy to work for anonymous visitors.
revoke all on public.waitlist_status_history from anon, authenticated;
grant select on public.waitlist_status_history to anon, authenticated;
grant execute on function public.waitlist_is_published(text) to anon;

drop policy if exists "waitlist_status_history_public_read" on public.waitlist_status_history;
create policy "waitlist_status_history_public_read"
  on public.waitlist_status_history for select
  to anon, authenticated
  using (public.waitlist_is_published(waitlist_id));

create or replace function public.record_waitlist_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.waitlist_status_history (waitlist_id, old_status, new_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists record_waitlist_status_change on public.waitlists;
create trigger record_waitlist_status_change
  after update of status on public.waitlists
  for each row
  execute function public.record_waitlist_status_change();

-- Surface "when did this last open" on the public read view. Appending a
-- column to the end of waitlists_public is safe for create-or-replace.
-- No backfill: history starts accruing from this migration on, so the field
-- stays null until a waitlist actually reopens.
create or replace view public.waitlists_public
  with (security_invoker = true) as
  select
    id, housing_authority, program_name, county, city, state, status,
    application_link, source_url, last_checked, notes, public_notes,
    published, created_at, updated_at,
    (
      select max(h.changed_at)
        from public.waitlist_status_history h
       where h.waitlist_id = w.id
         and h.new_status = 'open'
    ) as last_opened_at
  from public.waitlists w;

-- ---------------------------------------------------------------------------
-- 3. alert_invocations — rate-limit ledger (server-only)
--
-- The send-waitlist-alert Edge Function records one row per non-dry-run
-- admin-JWT invocation and refuses to fan out past a per-hour cap, so a
-- compromised admin token can't turn the notifier into a spam cannon.
-- Internal (DB trigger) calls are not rate limited — they're already gated
-- by the shared secret and the atomic dedupe claim.
-- ---------------------------------------------------------------------------

create table if not exists public.alert_invocations (
  id            bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  invoked_at    timestamptz not null default now()
);

create index if not exists alert_invocations_user_time_idx
  on public.alert_invocations (admin_user_id, invoked_at desc);

alter table public.alert_invocations enable row level security;
revoke all on public.alert_invocations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. alert_send_log_admin — what actually went out, for the admin CMS
--
-- Aggregates notification_events into one row per alert batch. Same owner-
-- view pattern as resources_admin/waitlists_admin (0010): runs with owner
-- privileges, is_admin() is the gate, non-admins get zero rows. Batches are
-- bucketed by day — the 24h dedupe claim guarantees at most one batch per
-- (waitlist, status) per window, so day-bucketing can't merge real batches.
-- ---------------------------------------------------------------------------

create or replace view public.alert_send_log_admin as
  select
    e.metadata->>'waitlist_id' as waitlist_id,
    coalesce(
      w.housing_authority || coalesce(' - ' || w.program_name, ''),
      e.metadata->>'waitlist_id'
    ) as waitlist_name,
    e.metadata->>'previous_status' as previous_status,
    e.metadata->>'new_status'      as new_status,
    count(*)                       as recipient_count,
    min(e.created_at)              as sent_at
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

revoke all on public.alert_send_log_admin from anon, authenticated;
grant select on public.alert_send_log_admin to authenticated;
