-- Housing Navigator — Codex security scan fixes
--
-- Closes the database-side findings from CODEX_SECURITY_SCAN_REPORT.md:
--
--   Findings 1+2 (high)  internal_notes readable by authenticated non-admins
--   Finding  3   (med)   trigger hardcodes the Edge Function URL next to the secret
--   Finding  6   (low)   waitlist_alerts INSERT can target unpublished waitlists
--   Finding  7   (low)   waitlist_alerts UPDATE can retarget to unpublished waitlists
--   Findings 5+8 (low)   non-atomic / fail-open notification dedupe
--   Finding  9   (low)   user-writable notification_events metadata forges dedupe
--
-- The Edge Function side of findings 5/6/7/8 lands in
-- supabase/functions/send-waitlist-alert/index.ts in the same change.
--
-- Idempotent: every statement is drop-if-exists / create-or-replace / revoke +
-- re-grant, safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. internal_notes: hide from authenticated non-admins (findings 1+2)
--
-- 0007 removed the column from `anon` only. Column grants cannot distinguish
-- an admin from any other signed-in user (both are `authenticated`), so the
-- base tables lose the column for the whole role and admins get dedicated
-- `*_admin` views instead:
--
--   * base tables: authenticated keeps SELECT on the same public column list
--     as anon (which is exactly what the `*_public` security-invoker views
--     need), and internal_notes disappears from direct reads.
--   * `resources_admin` / `waitlists_admin`: owner views (NOT
--     security_invoker) gated on public.is_admin(). They run with the view
--     owner's privileges, so they can see every column, but return zero rows
--     unless the caller is in admin_users. The admin CMS reads through them.
--   * writes are untouched: INSERT/UPDATE/DELETE on the base tables keep
--     their existing grants and is_admin() RLS policies, so the CMS forms
--     still write internal_notes directly.
--
-- Same deny-by-default caveat as 0007: a future public column must be added
-- to the authenticated grant list AND the *_public view, or signed-in users
-- won't see it.
-- ---------------------------------------------------------------------------

revoke select on public.resources from authenticated;

grant select (
  id, name, category, county, city, state, description, who_qualifies,
  who_it_helps, application_method, referral_required, phone, website,
  address, source_url, source_type, last_verified, public_notes,
  priority_score, published, created_at, updated_at
) on public.resources to authenticated;

revoke select on public.waitlists from authenticated;

grant select (
  id, housing_authority, program_name, county, city, state, status,
  application_link, source_url, last_checked, notes, public_notes,
  published, created_at, updated_at
) on public.waitlists to authenticated;

-- Admin read surface. No security_invoker: these intentionally run as the
-- view owner (postgres) to reach internal_notes; the is_admin() predicate is
-- the sole gate, and it is SECURITY DEFINER itself so it evaluates the
-- caller's auth.uid() without RLS recursion.
create or replace view public.resources_admin as
  select * from public.resources where public.is_admin();

create or replace view public.waitlists_admin as
  select * from public.waitlists where public.is_admin();

-- Supabase default privileges auto-grant new relations to anon too; scope
-- these to signed-in users (non-admins simply get zero rows).
revoke all on public.resources_admin from anon, authenticated;
revoke all on public.waitlists_admin from anon, authenticated;
grant select on public.resources_admin to authenticated;
grant select on public.waitlists_admin to authenticated;

-- ---------------------------------------------------------------------------
-- 2. waitlist_alerts: only published waitlists can be followed (finding 6)
--    and subscriptions cannot be retargeted (finding 7)
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the check does not depend on the caller's read access
-- to waitlists (and cannot be confused by future RLS changes there).
create or replace function public.waitlist_is_published(p_waitlist_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.waitlists w
     where w.id = p_waitlist_id
       and w.published = true
  );
$$;

revoke all on function public.waitlist_is_published(text) from public, anon;
grant execute on function public.waitlist_is_published(text) to authenticated;

drop policy if exists "waitlist_alerts_self_insert" on public.waitlist_alerts;
create policy "waitlist_alerts_self_insert"
  on public.waitlist_alerts for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.waitlist_is_published(waitlist_id)
  );

drop policy if exists "waitlist_alerts_self_update" on public.waitlist_alerts;
create policy "waitlist_alerts_self_update"
  on public.waitlist_alerts for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.waitlist_is_published(waitlist_id)
  );

-- Column-level immutability (same pattern as 0008 for profiles.email):
-- clients may only flip their two notification prefs. id / user_id /
-- waitlist_id / created_at / updated_at are rejected at the privilege layer,
-- so a PATCH can never retarget a subscription even if a future policy edit
-- loosens the WITH CHECK above. updated_at keeps working via the
-- set_updated_at trigger (trigger writes are not privilege-checked).
revoke update on public.waitlist_alerts from anon, authenticated;
grant update (notify_on_open, notify_on_status_change)
  on public.waitlist_alerts
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. notification_events: clients may only mark rows read (finding 9)
--
-- The self-update policy gated the ROW but not the columns, so a user could
-- rewrite metadata/event_type/created_at on their own row and forge the
-- Edge Function's 24h dedupe signal, suppressing everyone's alerts. The
-- dashboard only ever sets read = true (markNotificationRead in
-- src/services/userData.ts), so that is all the role keeps. Dedupe also
-- stops trusting this table entirely — see waitlist_alert_sends below.
-- ---------------------------------------------------------------------------

revoke update on public.notification_events from anon, authenticated;
grant update (read) on public.notification_events to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Atomic, fail-closed notification dedupe (findings 5+8)
--
-- Server-only claim table. One row per (waitlist_id, new_status); the unique
-- key makes the claim atomic — two concurrent function invocations both
-- upsert, Postgres serializes them on the index, and exactly one sees
-- claimed = true within the 24h window. The Edge Function claims BEFORE
-- sending and stops (fail closed) if the RPC errors.
-- ---------------------------------------------------------------------------

create table if not exists public.waitlist_alert_sends (
  waitlist_id text        not null references public.waitlists(id) on delete cascade,
  new_status  text        not null,
  claimed_at  timestamptz not null default now(),
  primary key (waitlist_id, new_status)
);

-- No client access at all: RLS on with zero policies, plus grants revoked
-- (Supabase default privileges would otherwise hand `all` to anon +
-- authenticated). The service role bypasses both.
alter table public.waitlist_alert_sends enable row level security;
revoke all on public.waitlist_alert_sends from anon, authenticated;

-- Returns true when this caller wins the right to send for
-- (waitlist_id, new_status): either no claim exists yet, or the previous
-- claim is older than the 24h dedupe window (a stale claim is re-armed
-- atomically by the conditional DO UPDATE). Returns false when a fresh
-- claim already exists — i.e. duplicate, do not send.
create or replace function public.claim_waitlist_alert_send(
  p_waitlist_id text,
  p_new_status  text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.waitlist_alert_sends as s (waitlist_id, new_status, claimed_at)
  values (p_waitlist_id, p_new_status, now())
  on conflict (waitlist_id, new_status) do update
    set claimed_at = now()
    where s.claimed_at <= now() - interval '24 hours';
  return found;
end;
$$;

-- Service-role only: this is a server-side primitive, never a client API.
revoke all on function public.claim_waitlist_alert_send(text, text)
  from public, anon, authenticated;
grant execute on function public.claim_waitlist_alert_send(text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Trigger: Edge Function URL comes from Vault, not source (finding 3)
--
-- 0009 hardcoded one project's function URL, so applying the migration to
-- any other environment would POST that environment's Vault secret to the
-- original project. Both the destination and the secret now live in Vault:
--
--   select vault.create_secret('<random>', 'internal_trigger_secret', ...);
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-waitlist-alert',
--     'internal_trigger_fn_url',
--     'destination for the waitlist auto-notify trigger');
--
-- If either is missing the trigger logs a warning and skips — it never
-- blocks the waitlist write and never falls back to a baked-in URL.
-- Also skips unpublished waitlists: the Edge Function refuses them anyway
-- (finding 6/7 defense in depth), so don't even queue the request.
-- ---------------------------------------------------------------------------

create or replace function public.on_waitlist_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  secret text;
  fn_url text;
begin
  if new.status is distinct from old.status
     and old.status in ('closed', 'unknown', 'limited')
     and new.status in ('open', 'limited')
     and new.published = true then

    select decrypted_secret into secret
      from vault.decrypted_secrets
     where name = 'internal_trigger_secret'
     limit 1;

    select decrypted_secret into fn_url
      from vault.decrypted_secrets
     where name = 'internal_trigger_fn_url'
     limit 1;

    if secret is null or fn_url is null then
      raise warning 'on_waitlist_status_change: Vault config missing (need internal_trigger_secret + internal_trigger_fn_url); skipping notify for waitlist %', new.id;
      return new;
    end if;

    -- pg_net is async: this queues the POST and returns immediately, so the
    -- waitlist write is never blocked on the network call.
    perform net.http_post(
      url     := fn_url,
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'x-internal-secret', secret
      ),
      body    := jsonb_build_object(
        'waitlist_id',     new.id,
        'previous_status', old.status,
        'new_status',      new.status
      )
    );
  end if;

  return new;
end;
$$;
