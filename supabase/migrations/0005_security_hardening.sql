-- Housing Navigator — security hardening pass
--
-- This migration is verification + tightening only. It does NOT change
-- any policy currently load-bearing for the running app. The goal is to
-- close a leftover permissive policy on the legacy `programs` table and
-- restate every other policy below as a comment so reviewers can confirm
-- they still match the intended access model.
--
-- ---------------------------------------------------------------------------
-- 1. legacy `programs` table — remove anon read, restrict to admins
--
-- `programs` was the original catalog table (migration 0001). The app now
-- reads from `public.resources` (0002), so the wide-open public SELECT
-- policy on `programs` is unused at runtime but still grants anon clients
-- read access to every row. Drop it and replace with admin-only access so
-- the legacy data remains queryable for tooling but never to anonymous
-- clients.
-- ---------------------------------------------------------------------------

drop policy if exists "programs_public_read"   on public.programs;
drop policy if exists "programs_admin_read"    on public.programs;
drop policy if exists "programs_admin_insert"  on public.programs;
drop policy if exists "programs_admin_update"  on public.programs;
drop policy if exists "programs_admin_delete"  on public.programs;

create policy "programs_admin_read"
  on public.programs for select
  to authenticated
  using (public.is_admin());

create policy "programs_admin_insert"
  on public.programs for insert
  to authenticated
  with check (public.is_admin());

create policy "programs_admin_update"
  on public.programs for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "programs_admin_delete"
  on public.programs for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. RLS posture audit (no-op statements — kept here as a reviewable list)
--
-- The following policies are LOAD-BEARING for the running app and must not
-- change without an explicit migration. Listed here so future reviewers can
-- confirm the policy surface from one place.
--
--   public.resources
--     resources_public_read   anon, authenticated  select where published = true
--     resources_admin_*       authenticated        public.is_admin()
--
--   public.waitlists
--     waitlists_public_read   anon, authenticated  select where published = true
--     waitlists_admin_*       authenticated        public.is_admin()
--
--   public.admin_users
--     admin_users_self_read   authenticated        user_id = auth.uid()
--       (self-only — non-recursive. Cross-admin lookups go through
--        public.is_admin(), a SECURITY DEFINER function that bypasses RLS.)
--
--   public.profiles
--     profiles_self_read      authenticated        id = auth.uid()
--     profiles_self_update    authenticated        id = auth.uid()
--       (no insert policy — rows are inserted by the on-auth-user-created
--        trigger which runs SECURITY DEFINER.)
--
--   public.saved_resources
--     saved_resources_self_read/insert/delete  user_id = auth.uid()
--
--   public.waitlist_alerts
--     waitlist_alerts_self_read/insert/update/delete  user_id = auth.uid()
--
--   public.notification_events
--     notification_events_self_read   user_id = auth.uid()
--     notification_events_self_update user_id = auth.uid()
--       (insert is server-only via the service-role key in the future Edge
--        Function dispatcher.)
--
--   public.resource_submissions
--     RLS enabled, no policies → deny-by-default for anon/authenticated.
--     Service role bypasses, which is what server-side ingestion uses.
--
--   public.decision_rules
--     decision_rules_public_read  anon, authenticated  select using (true)
--       (non-sensitive rule data consumed by the recommendation engine.)
-- ---------------------------------------------------------------------------

-- TODO(notifications): when the Edge Function dispatcher lands, it will
-- need an insert path on public.notification_events. Add it as a
-- service-role-only grant (no client policy) when that ships.
