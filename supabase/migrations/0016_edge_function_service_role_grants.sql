-- Edge Functions authenticate with the service-role JWT, which bypasses RLS
-- but still needs ordinary PostgreSQL object privileges. This migration is
-- intentionally separate from 0015 because 0015 had already reached the
-- linked project before integration testing exposed the missing ACLs.

begin;

grant select on public.admin_users to service_role;
grant select, update on public.waitlists to service_role;
grant insert on public.waitlist_status_checks to service_role;
grant select, insert, update on public.waitlist_status_suggestions to service_role;
grant select, update on public.profiles to service_role;
grant select on public.waitlist_alerts to service_role;
grant delete on public.waitlist_alert_sends to service_role;
grant insert on public.notification_events to service_role;

commit;
