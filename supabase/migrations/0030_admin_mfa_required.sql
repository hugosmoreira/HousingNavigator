-- Housing Navigator — admin authority requires two-factor sign-in (AAL2)
--
-- Admin MFA rollout stage 2. public.is_admin() now requires both:
--   * a row in public.admin_users for auth.uid(), as before, and
--   * a session that passed a second factor. Supabase Auth sets the JWT
--     `aal` claim to 'aal2' only after an MFA challenge succeeds.
--
-- Every admin RLS policy, admin view and admin RPC goes through is_admin(),
-- so a password-only (AAL1) admin session now gets what any signed-in
-- visitor gets: published rows only, no drafts, no internal notes, no
-- writes, and "not authorized" from the admin RPCs. The admin Edge Functions
-- apply the same rule in supabase/functions/_shared/adminAuthorization.ts.
--
-- Deliberately unchanged:
--   * admin_users_self_read (0003) does not use is_admin(), so an AAL1
--     session can still read its own admin_users row. The admin UI uses that
--     to recognise a member and send them to /admin/verify to set up or enter
--     a code, instead of locking them out.
--   * Public browsing and seeker features never depended on is_admin().
--   * service_role (import scripts, Edge Functions) bypasses RLS and does not
--     call is_admin().
--
-- coalesce() keeps the result a strict true/false. A NULL from a missing
-- claim would otherwise slip past `if not public.is_admin() then raise`
-- checks in the admin RPCs, because `not NULL` is NULL, not true.
--
-- Apply only after every admin has a verified authenticator.
-- Rollback: supabase/rollback/0030_admin_mfa_required_rollback.sql

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.admin_users a where a.user_id = auth.uid()
     );
$$;

-- Same execution grants as migration 0014.
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  'Authenticated-only RLS helper; true when auth.uid() is an administrator and the session passed two-factor sign-in (aal2).';

commit;
