-- Housing Navigator — automatic waitlist-open notifications
--
-- Problem this solves
-- -------------------
-- Until now, a waitlist alert email only went out if an admin edited the
-- exact followed waitlist through the CMS form AND clicked a confirmation
-- modal (src/admin/components/WaitlistForm.tsx). That meant: no email when
-- the status changed via CSV import or a direct edit, and no email if the
-- admin didn't click through. The whole point of the app — "tell me when a
-- waitlist I follow opens" — was effectively manual and fragile.
--
-- Fix
-- ---
-- A database trigger on `waitlists`: whenever a row's `status` moves into a
-- more-open state (closed/unknown/limited -> open/limited), it calls the
-- `send-waitlist-alert` Edge Function automatically, which fans out to the
-- followers of THAT waitlist (respecting their notify prefs + master
-- email_notifications_enabled, and the function's own 24h dedupe). This
-- fires no matter HOW the status changed (admin form, CSV, SQL).
--
-- Auth: the trigger calls the function with a shared secret in the
-- `x-internal-secret` header. The function (index.ts), deployed with
-- --no-verify-jwt, treats a matching secret as an internal call and skips
-- the per-user admin check. The secret is read from Vault, never hardcoded
-- here, so this migration is safe to commit.
--
-- Idempotent + additive: enables pg_net, (re)creates one function + one
-- trigger. Deletes nothing.
--
-- OPERATIONAL NOTE (one-time, NOT in this file because it carries a secret):
-- two things must exist out-of-band for the trigger to send, set via the
-- Supabase CLI + Management API:
--   * Edge Function secret  INTERNAL_TRIGGER_SECRET=<random>
--   * Vault secret          internal_trigger_secret = <same random value>
--       select vault.create_secret('<random>', 'internal_trigger_secret',
--         'shared secret for the waitlist auto-notify trigger');
-- If the Vault secret is missing, the trigger logs a warning and skips
-- (it never blocks the status write).

create extension if not exists pg_net;

create or replace function public.on_waitlist_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  secret text;
  fn_url text := 'https://tlazsywswoapcrzxbqnu.supabase.co/functions/v1/send-waitlist-alert';
begin
  -- Only on a meaningful "more open" transition (mirrors the function's own
  -- isMeaningfulUpgrade rule, so we don't fire pointless requests).
  if new.status is distinct from old.status
     and old.status in ('closed', 'unknown', 'limited')
     and new.status in ('open', 'limited') then

    select decrypted_secret into secret
      from vault.decrypted_secrets
     where name = 'internal_trigger_secret'
     limit 1;

    if secret is null then
      raise warning 'on_waitlist_status_change: Vault secret internal_trigger_secret missing; skipping notify for waitlist %', new.id;
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

drop trigger if exists on_waitlist_status_change on public.waitlists;
create trigger on_waitlist_status_change
  after update of status on public.waitlists
  for each row
  execute function public.on_waitlist_status_change();
