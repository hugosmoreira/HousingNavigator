-- Housing Navigator — make profiles.email immutable from clients
--
-- Security fix. Closes an email-spoofing / harassment vector:
--
--   * profiles.email is the address the send-waitlist-alert Edge Function
--     mails directly (supabase/functions/send-waitlist-alert/index.ts,
--     ~lines 326-334 + 358-367), in messages signed "Housing Navigator".
--   * Until now profiles.email was a plain user-writable column. The
--     profiles_self_update policy (0004, ~lines 136-140) gates by ROW
--     (id = auth.uid()) but NOT by column, and the `authenticated` role
--     inherits a blanket UPDATE grant from Supabase's default privileges.
--     So any signed-in user could
--         PATCH /profiles?id=eq.<self>  { "email": "victim@example.com" }
--     straight through PostgREST — the app's ProfilePatch
--     (src/services/userData.ts) omits email, but that is a client
--     convention, not an enforced boundary — and later have a
--     "Housing Navigator"-signed email delivered to that unverified
--     third-party address: low-volume spam / harassment.
--
-- Fix (defense in depth, two independent layers):
--   1. Column-level privilege — revoke UPDATE on profiles and re-grant it
--      only on the columns the dashboard legitimately edits. A PATCH that
--      touches `email` (or id / created_at / updated_at) now fails with
--      "permission denied for column email" at the SQL privilege layer,
--      before any policy runs.
--   2. Keep profiles.email authoritative by syncing it FROM auth.users —
--      the only place an email is ever verified. handle_new_user (0004)
--      already seeds it on signup; this adds propagation on email change.
--
-- This migration does NOT alter the profiles_self_update RLS policy, so
-- legitimate self-updates (display_name, home_county,
-- email_notifications_enabled) keep working, and the admin CMS / Edge
-- Function paths (service role — bypasses RLS and column grants) are
-- unaffected. Reads of profiles.email (PublicAuthContext, the dispatcher)
-- are untouched.

-- ---------------------------------------------------------------------------
-- 1. Column-level UPDATE privilege on profiles
-- ---------------------------------------------------------------------------
-- Supabase grants `all` on public tables to anon/authenticated by default,
-- which includes UPDATE on every column. Narrow that to the editable set.
-- anon never updates profiles (profiles_self_update is authenticated-only),
-- so it intentionally gets no UPDATE grant back.
revoke update on public.profiles from anon, authenticated;

grant update (display_name, home_county, email_notifications_enabled)
  on public.profiles
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sync profiles.email from auth.users (the verified source of truth)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the write bypasses the column grant above and RLS,
-- exactly like handle_new_user (0004). Supabase only updates
-- auth.users.email AFTER the user confirms an email-change link, so
-- propagating from here means profiles.email always tracks a confirmed
-- address — never an arbitrary value a client tried to inject.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    -- Guard the sync so an unforeseen failure here can never roll back a
    -- user's confirmed auth email change (this trigger runs inside that
    -- transaction). Worst case profiles.email goes briefly stale and the
    -- warning is logged; auth stays intact.
    begin
      update public.profiles
         set email = new.email
       where id = new.id;
    exception when others then
      raise warning 'sync_profile_email: could not sync profiles.email for % (%)', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email();
