-- Housing Navigator — least-privilege function execution hardening
--
-- Supabase's Security Advisor flags SECURITY DEFINER functions whenever
-- anonymous or signed-in clients can invoke them directly. Four of the
-- flagged functions are trigger-only implementation details; clients never
-- need EXECUTE on them. The remaining helpers are intentionally callable by
-- the narrow roles documented below.

begin;

-- Every function resolves object names from an immutable search path. The
-- function bodies already schema-qualify application, Auth, Vault, and pg_net
-- objects; pg_catalog remains implicitly available to PostgreSQL.
alter function public.set_updated_at() set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.sync_profile_email() set search_path = '';
alter function public.on_waitlist_status_change() set search_path = '';
alter function public.record_waitlist_status_change() set search_path = '';
alter function public.is_admin() set search_path = '';
alter function public.waitlist_is_published(text) set search_path = '';
alter function public.review_waitlist_suggestion(uuid, boolean) set search_path = '';

-- Trigger functions are invoked by their existing triggers, never through the
-- public API. PostgreSQL checks the trigger function when CREATE TRIGGER runs;
-- callers do not need direct EXECUTE privileges for the trigger to fire.
revoke all on function public.set_updated_at()
  from public, anon, authenticated;
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.sync_profile_email()
  from public, anon, authenticated;
revoke all on function public.on_waitlist_status_change()
  from public, anon, authenticated;
revoke all on function public.record_waitlist_status_change()
  from public, anon, authenticated;

-- RLS policies and the admin review RPC need these helper grants. Anonymous
-- callers do not use is_admin(); authenticated policies do. Published-status
-- checks intentionally support both public status history and signed-in alert
-- subscriptions. The review RPC stays authenticated-only and performs its own
-- is_admin() authorization check before touching data.
revoke all on function public.is_admin()
  from public, anon, authenticated;
grant execute on function public.is_admin()
  to authenticated;

revoke all on function public.waitlist_is_published(text)
  from public, anon, authenticated;
grant execute on function public.waitlist_is_published(text)
  to anon, authenticated;

revoke all on function public.review_waitlist_suggestion(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.review_waitlist_suggestion(uuid, boolean)
  to authenticated;

comment on function public.is_admin() is
  'Authenticated-only RLS helper; returns whether auth.uid() is an administrator.';
comment on function public.waitlist_is_published(text) is
  'Public RLS helper exposing only whether a waitlist is published.';
comment on function public.review_waitlist_suggestion(uuid, boolean) is
  'Authenticated admin RPC; authorization is enforced inside the function.';

commit;
