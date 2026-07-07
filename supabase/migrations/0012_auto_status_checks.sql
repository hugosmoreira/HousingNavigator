-- Housing Navigator — automated waitlist status checking (suggest mode)
--
-- Problem this solves
-- -------------------
-- Waitlist statuses were verified by hand: an admin visits each housing
-- authority's website, reads it, and edits the row. Statuses go stale, the
-- public "last checked" dates age, and reopenings are noticed late — exactly
-- when being early matters most to applicants.
--
-- Fix
-- ---
-- A scheduled checker re-verifies each waitlist against its own source_url:
--
--   pg_cron (every 15 min)
--     -> public.invoke_waitlist_status_check()          [this migration]
--     -> Edge Function `check-waitlist-status`          [supabase/functions]
--          fetches the page, classifies open/closed/limited/unknown with a
--          confidence score + evidence quote, then:
--            * same status  -> bumps waitlists.last_checked (data stays fresh)
--            * changed      -> writes a PENDING row in
--                              waitlist_status_suggestions (suggest mode:
--                              nothing is published and no subscriber email
--                              is sent until an admin approves)
--     -> Admin approves in /admin/review
--     -> public.review_waitlist_suggestion() applies the status change,
--        which fires the existing on_waitlist_status_change trigger (0009/
--        0010) -> send-waitlist-alert -> subscriber emails, with the same
--        dedupe + published gates as a manual edit.
--
-- Suggest mode is deliberate: a wrong "open" email damages trust with
-- vulnerable users, so every automated detection is reviewed by a human
-- before anything user-facing happens.
--
-- Idempotent + additive: new tables/columns/functions only; deletes nothing.
--
-- OPERATIONAL NOTES (one-time, out-of-band — they carry secrets/URLs):
--   * Deploy the function:  supabase functions deploy check-waitlist-status --no-verify-jwt
--   * Edge Function secrets (supabase secrets set ...):
--       ANTHROPIC_API_KEY=<key>            -- classifier
--       CLAUDE_MODEL=claude-opus-4-8       -- optional override
--       INTERNAL_TRIGGER_SECRET=<random>   -- same one 0009 already uses
--       APP_URL=https://<prod host>        -- for the admin review link
--   * Vault secret with the checker's URL (mirrors internal_trigger_fn_url):
--       select vault.create_secret(
--         'https://<project-ref>.supabase.co/functions/v1/check-waitlist-status',
--         'internal_check_fn_url',
--         'destination for the scheduled waitlist status checker');
-- If Vault config or pg_cron is missing, everything below degrades to a
-- logged warning — no write path is ever blocked.

-- ---------------------------------------------------------------------------
-- 1. Waitlists: per-row automation controls + health counters
-- ---------------------------------------------------------------------------

alter table public.waitlists
  add column if not exists auto_check_enabled boolean not null default true;

-- Consecutive fetch failures for the row's URL. Reset to 0 on any successful
-- check; >= 3 is surfaced in the admin UI as "this URL needs a human look".
alter table public.waitlists
  add column if not exists check_failures integer not null default 0;

-- When the checker last ATTEMPTED this row (success or not). Distinct from
-- last_checked, which is the user-facing "status verified on" date and only
-- moves on confirmation/approval.
alter table public.waitlists
  add column if not exists last_auto_check_at timestamptz;

-- Hide the new operational columns from the public read surface: the public
-- views (0010/0011) enumerate their columns, so nothing changes there; the
-- column grants for anon/authenticated on the base table are already
-- column-scoped (0007/0010) and new columns are not added to them.

-- ---------------------------------------------------------------------------
-- 2. Check log: one row per automated check attempt (audit + health)
-- ---------------------------------------------------------------------------

create table if not exists public.waitlist_status_checks (
  id               bigint generated always as identity primary key,
  waitlist_id      text not null references public.waitlists(id) on delete cascade,
  checked_at       timestamptz not null default now(),
  checked_url      text,
  detected_status  text check (detected_status in ('open', 'closed', 'limited', 'unknown')),
  confidence       numeric(3, 2),
  evidence         text,
  -- What the checker did with the result:
  --   confirmed            same status, last_checked bumped
  --   suggested            different status, pending suggestion written
  --   uncertain            classifier unsure; logged only
  --   insufficient_content page had too little text (likely JS-rendered)
  --   fetch_failed         network/HTTP error; check_failures incremented
  --   classify_failed      model call failed or was refused
  action           text not null check (action in (
                     'confirmed', 'suggested', 'uncertain',
                     'insufficient_content', 'fetch_failed', 'classify_failed'
                   )),
  error            text
);

create index if not exists waitlist_status_checks_waitlist_idx
  on public.waitlist_status_checks (waitlist_id, checked_at desc);

-- Service role writes; admins read; the public gets nothing.
alter table public.waitlist_status_checks enable row level security;
revoke all on public.waitlist_status_checks from anon, authenticated;
grant select on public.waitlist_status_checks to authenticated;

drop policy if exists "status_checks_admin_read" on public.waitlist_status_checks;
create policy "status_checks_admin_read"
  on public.waitlist_status_checks for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Review queue: at most one PENDING suggestion per waitlist
-- ---------------------------------------------------------------------------

create table if not exists public.waitlist_status_suggestions (
  id               uuid primary key default gen_random_uuid(),
  waitlist_id      text not null references public.waitlists(id) on delete cascade,
  -- Status recorded in the DB at detection time (context for the reviewer).
  previous_status  text not null,
  suggested_status text not null check (suggested_status in ('open', 'closed', 'limited', 'unknown')),
  confidence       numeric(3, 2),
  evidence         text,
  checked_url      text,
  status           text not null default 'pending' check (status in (
                     'pending', 'approved', 'rejected', 'superseded'
                   )),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid references auth.users(id) on delete set null
);

-- One live suggestion per waitlist: re-detections update the pending row
-- instead of stacking duplicates in the queue.
create unique index if not exists waitlist_status_suggestions_pending_uniq
  on public.waitlist_status_suggestions (waitlist_id)
  where status = 'pending';

create index if not exists waitlist_status_suggestions_status_idx
  on public.waitlist_status_suggestions (status, created_at desc);

-- Service role writes; admins read; review happens ONLY through the RPC
-- below (no direct client UPDATE, so the queue can't be tampered with).
alter table public.waitlist_status_suggestions enable row level security;
revoke all on public.waitlist_status_suggestions from anon, authenticated;
grant select on public.waitlist_status_suggestions to authenticated;

drop policy if exists "status_suggestions_admin_read" on public.waitlist_status_suggestions;
create policy "status_suggestions_admin_read"
  on public.waitlist_status_suggestions for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Review RPC: approve/reject a pending suggestion atomically
--
-- Approving updates waitlists.status, which fires the EXISTING
-- on_waitlist_status_change trigger (0009/0010) — so subscriber emails,
-- 24h dedupe, published gating, and status history (0011) all behave
-- exactly as if an admin had edited the row by hand.
-- ---------------------------------------------------------------------------

create or replace function public.review_waitlist_suggestion(
  p_suggestion_id uuid,
  p_approve       boolean
)
returns public.waitlist_status_suggestions
language plpgsql
security definer
set search_path = public
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
    raise exception 'suggestion not found or already reviewed';
  end if;

  if p_approve then
    update public.waitlists
       set status = s.suggested_status,
           last_checked = current_date,
           check_failures = 0
     where id = s.waitlist_id;
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

revoke all on function public.review_waitlist_suggestion(uuid, boolean)
  from public, anon;
grant execute on function public.review_waitlist_suggestion(uuid, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cron: poke the checker Edge Function every 15 minutes
--
-- The function itself decides which rows are due (oldest last_auto_check_at
-- first, ~once per day each), so frequent ticks stay cheap: a tick with
-- nothing due does one small SELECT and exits.
-- ---------------------------------------------------------------------------

create or replace function public.invoke_waitlist_status_check()
returns void
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  secret text;
  fn_url text;
begin
  select decrypted_secret into secret
    from vault.decrypted_secrets
   where name = 'internal_trigger_secret'
   limit 1;

  select decrypted_secret into fn_url
    from vault.decrypted_secrets
   where name = 'internal_check_fn_url'
   limit 1;

  if secret is null or fn_url is null then
    raise warning 'invoke_waitlist_status_check: Vault config missing (need internal_trigger_secret + internal_check_fn_url); skipping';
    return;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', secret
    ),
    body    := jsonb_build_object('source', 'cron')
  );
end;
$$;

revoke all on function public.invoke_waitlist_status_check()
  from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise warning '0012: could not enable pg_cron (%). Enable it in the dashboard and schedule check-waitlist-status manually.', sqlerrm;
end $$;

do $$
declare
  jid int;
begin
  select jobid into jid from cron.job where jobname = 'check-waitlist-status' limit 1;
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
  perform cron.schedule(
    'check-waitlist-status',
    '*/15 * * * *',
    'select public.invoke_waitlist_status_check()'
  );
exception when others then
  raise warning '0012: could not schedule cron job (%). Schedule it manually: select cron.schedule(''check-waitlist-status'', ''*/15 * * * *'', ''select public.invoke_waitlist_status_check()'');', sqlerrm;
end $$;
