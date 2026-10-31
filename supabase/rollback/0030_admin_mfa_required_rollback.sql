-- Housing Navigator — roll back migration 0030 (admin authority requires AAL2)
--
-- Restores public.is_admin() exactly as migrations 0002 + 0014 left it:
-- admin_users membership only, empty search_path, authenticated-only EXECUTE.
-- Every policy, view and RPC that calls is_admin() follows automatically;
-- nothing else in 0030 needs undoing.
--
-- This folder is outside supabase/migrations on purpose, so no migration
-- tool ever applies it by accident. Run it by hand (SQL editor or the
-- Management API) only to undo 0030. If 0030 was recorded in
-- supabase_migrations.schema_migrations, delete that row as well so the
-- recorded history matches the database.
--
-- The admin Edge Functions check AAL2 on their own. Rolling back the
-- database does not change them; redeploy the previous function code if
-- that step needs undoing too.

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  'Authenticated-only RLS helper; returns whether auth.uid() is an administrator.';

commit;
