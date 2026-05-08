-- Fix recursive RLS on admin_users.
--
-- The policy created in 0002_admin_catalog.sql referenced admin_users from
-- inside its own SELECT policy:
--
--   using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
--
-- PostgreSQL re-applies RLS to that inner reference, which triggers the same
-- policy again on the subquery, and so on. Postgres errors with 42P17
-- "infinite recursion detected in policy for relation admin_users" — the
-- browser-side admin check then silently fails, leaving the login form
-- stuck after `signInWithPassword` succeeds.
--
-- Replace it with a self-only read: an authenticated user can read the
-- single admin_users row that matches their own auth.uid(). That is all
-- the client needs to confirm `isAdmin`. Cross-admin reads (managing other
-- admins) stay in the Supabase dashboard for now.

drop policy if exists "admin_users_self_read" on public.admin_users;

create policy "admin_users_self_read"
  on public.admin_users for select
  to authenticated
  using (user_id = auth.uid());
