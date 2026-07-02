-- Housing Navigator — RLS / grant regression suite
--
-- Run with `npm run verify:rls` (scripts/verifyRls.ts) after applying any
-- migration. Simulates the `authenticated` and `anon` PostgREST roles with
-- `set local role` + a fake JWT claim, exercises every security invariant
-- from migrations 0004-0011, and prints one PASS/FAIL row per check.
--
-- Self-contained: creates a throwaway auth user + two test waitlists, and
-- deletes them at the end (cascades clean up profiles, alerts, events,
-- history, and dedupe claims). Each check runs in its own DO block with an
-- exception handler, so an expected denial never aborts the suite.

create temp table results (n serial, test text, outcome text);

-- ---- fixtures (as postgres) ----
insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
values ('11111111-1111-1111-1111-111111111111', 'rls-test@example.com', 'authenticated', 'authenticated', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000');

insert into public.waitlists (id, housing_authority, county, status, published, internal_notes)
values ('test-wl-pub',   'Test HA Published', 'Multnomah', 'closed', true,  'secret staff note pub'),
       ('test-wl-draft', 'Test HA Draft',     'Multnomah', 'closed', false, 'secret staff note draft');

insert into public.notification_events (user_id, event_type, title, body, metadata)
values ('11111111-1111-1111-1111-111111111111', 'waitlist_status_change', 't', 'b',
        '{"waitlist_id":"real-wl","new_status":"open"}'::jsonb);

insert into public.waitlist_status_history (waitlist_id, old_status, new_status)
values ('test-wl-pub', 'closed', 'open'),
       ('test-wl-draft', 'closed', 'open');

-- ---- 1. user cannot follow an UNPUBLISHED waitlist ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.waitlist_alerts (user_id, waitlist_id)
  values ('11111111-1111-1111-1111-111111111111', 'test-wl-draft');
  reset role;
  insert into results (test, outcome) values ('1 insert alert -> unpublished waitlist', 'FAIL: insert allowed');
exception when others then
  insert into results (test, outcome) values ('1 insert alert -> unpublished waitlist', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 2. user CAN follow a PUBLISHED waitlist ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.waitlist_alerts (user_id, waitlist_id)
  values ('11111111-1111-1111-1111-111111111111', 'test-wl-pub');
  reset role;
  insert into results (test, outcome) values ('2 insert alert -> published waitlist', 'PASS: allowed');
exception when others then
  insert into results (test, outcome) values ('2 insert alert -> published waitlist', 'FAIL: blocked (' || sqlerrm || ')');
end $$;

-- ---- 3. user can toggle their own prefs ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  update public.waitlist_alerts set notify_on_status_change = true
   where waitlist_id = 'test-wl-pub';
  reset role;
  insert into results (test, outcome) values ('3 update own prefs', 'PASS: allowed');
exception when others then
  insert into results (test, outcome) values ('3 update own prefs', 'FAIL: blocked (' || sqlerrm || ')');
end $$;

-- ---- 4. user cannot RETARGET a subscription ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  update public.waitlist_alerts set waitlist_id = 'test-wl-draft'
   where waitlist_id = 'test-wl-pub';
  reset role;
  insert into results (test, outcome) values ('4 retarget alert -> unpublished', 'FAIL: update allowed');
exception when others then
  insert into results (test, outcome) values ('4 retarget alert -> unpublished', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 5. user cannot forge notification metadata ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  update public.notification_events
     set metadata = '{"waitlist_id":"victim-wl","new_status":"open"}'::jsonb
   where user_id = '11111111-1111-1111-1111-111111111111';
  reset role;
  insert into results (test, outcome) values ('5 forge notification metadata', 'FAIL: update allowed');
exception when others then
  insert into results (test, outcome) values ('5 forge notification metadata', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 6. user CAN mark notifications read ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  update public.notification_events set read = true
   where user_id = '11111111-1111-1111-1111-111111111111';
  reset role;
  insert into results (test, outcome) values ('6 mark notification read', 'PASS: allowed');
exception when others then
  insert into results (test, outcome) values ('6 mark notification read', 'FAIL: blocked (' || sqlerrm || ')');
end $$;

-- ---- 7. user cannot INSERT notification events ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.notification_events (user_id, event_type, title)
  values ('11111111-1111-1111-1111-111111111111', 'waitlist_status_change', 'forged');
  reset role;
  insert into results (test, outcome) values ('7 insert notification event', 'FAIL: insert allowed');
exception when others then
  insert into results (test, outcome) values ('7 insert notification event', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 8. dedupe claim is atomic/idempotent (service-side) ----
do $$
declare a boolean; b boolean; c boolean;
begin
  a := public.claim_waitlist_alert_send('test-wl-pub', 'open');   -- expect true
  b := public.claim_waitlist_alert_send('test-wl-pub', 'open');   -- expect false (fresh claim)
  update public.waitlist_alert_sends set claimed_at = now() - interval '25 hours'
   where waitlist_id = 'test-wl-pub';
  c := public.claim_waitlist_alert_send('test-wl-pub', 'open');   -- expect true (stale re-arm)
  insert into results (test, outcome) values ('8 claim semantics (t,f,t)',
    case when a and not b and c then 'PASS: ' else 'FAIL: ' end || a || ',' || b || ',' || c);
end $$;

-- ---- 9. clients cannot touch the dedupe machinery ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  perform public.claim_waitlist_alert_send('test-wl-pub', 'limited');
  reset role;
  insert into results (test, outcome) values ('9 client exec claim rpc', 'FAIL: exec allowed');
exception when others then
  insert into results (test, outcome) values ('9 client exec claim rpc', 'PASS: blocked (' || sqlerrm || ')');
end $$;

do $$
declare cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into cnt from public.waitlist_alert_sends;
  reset role;
  insert into results (test, outcome) values ('9b client read claim table', 'FAIL: select allowed (' || cnt || ' rows)');
exception when others then
  insert into results (test, outcome) values ('9b client read claim table', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 10. RLS does not leak unpublished waitlists ----
do $$
declare cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into cnt from public.waitlists where id like 'test-wl-%';
  reset role;
  insert into results (test, outcome) values ('10 authed sees only published',
    case when cnt = 1 then 'PASS: 1 of 2 visible' else 'FAIL: ' || cnt || ' visible' end);
end $$;

do $$
declare cnt int;
begin
  set local role anon;
  select count(*) into cnt from public.waitlists_public where id like 'test-wl-%';
  reset role;
  insert into results (test, outcome) values ('10b anon view sees only published',
    case when cnt = 1 then 'PASS: 1 of 2 visible' else 'FAIL: ' || cnt || ' visible' end);
end $$;

-- ---- 11. internal_notes hidden from authenticated non-admins ----
do $$
declare v text;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select internal_notes into v from public.waitlists where id = 'test-wl-pub';
  reset role;
  insert into results (test, outcome) values ('11 authed reads waitlists.internal_notes', 'FAIL: readable (' || coalesce(v,'null') || ')');
exception when others then
  insert into results (test, outcome) values ('11 authed reads waitlists.internal_notes', 'PASS: blocked (' || sqlerrm || ')');
end $$;

do $$
declare v text;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select internal_notes into v from public.resources limit 1;
  reset role;
  insert into results (test, outcome) values ('11b authed reads resources.internal_notes', 'FAIL: readable');
exception when others then
  insert into results (test, outcome) values ('11b authed reads resources.internal_notes', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 12. non-admin gets zero rows from admin views ----
do $$
declare cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into cnt from public.waitlists_admin;
  reset role;
  insert into results (test, outcome) values ('12 non-admin waitlists_admin view',
    case when cnt = 0 then 'PASS: 0 rows' else 'FAIL: ' || cnt || ' rows' end);
exception when others then
  insert into results (test, outcome) values ('12 non-admin waitlists_admin view', 'FAIL: error (' || sqlerrm || ')');
end $$;

do $$
declare cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into cnt from public.alert_send_log_admin;
  reset role;
  insert into results (test, outcome) values ('12b non-admin alert_send_log_admin view',
    case when cnt = 0 then 'PASS: 0 rows' else 'FAIL: ' || cnt || ' rows' end);
exception when others then
  insert into results (test, outcome) values ('12b non-admin alert_send_log_admin view', 'FAIL: error (' || sqlerrm || ')');
end $$;

-- ---- 13. status history: published-only reads, no client writes ----
do $$
declare cnt int;
begin
  set local role anon;
  select count(*) into cnt from public.waitlist_status_history where waitlist_id like 'test-wl-%';
  reset role;
  insert into results (test, outcome) values ('13 anon history sees only published',
    case when cnt = 1 then 'PASS: 1 of 2 visible' else 'FAIL: ' || cnt || ' visible' end);
exception when others then
  insert into results (test, outcome) values ('13 anon history sees only published', 'FAIL: error (' || sqlerrm || ')');
end $$;

do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.waitlist_status_history (waitlist_id, old_status, new_status)
  values ('test-wl-pub', 'closed', 'open');
  reset role;
  insert into results (test, outcome) values ('13b client insert history', 'FAIL: insert allowed');
exception when others then
  insert into results (test, outcome) values ('13b client insert history', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 14. rate-limit ledger is server-only ----
do $$
declare cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into cnt from public.alert_invocations;
  reset role;
  insert into results (test, outcome) values ('14 client read alert_invocations', 'FAIL: select allowed (' || cnt || ' rows)');
exception when others then
  insert into results (test, outcome) values ('14 client read alert_invocations', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 15. unsubscribe token: readable (self), never client-writable ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  update public.profiles set unsubscribe_token = gen_random_uuid()
   where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  insert into results (test, outcome) values ('15 client rewrite unsubscribe_token', 'FAIL: update allowed');
exception when others then
  insert into results (test, outcome) values ('15 client rewrite unsubscribe_token', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 16. profiles.email immutable from clients (0008 regression) ----
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  update public.profiles set email = 'victim@example.com'
   where id = '11111111-1111-1111-1111-111111111111';
  reset role;
  insert into results (test, outcome) values ('16 client rewrite profiles.email', 'FAIL: update allowed');
exception when others then
  insert into results (test, outcome) values ('16 client rewrite profiles.email', 'PASS: blocked (' || sqlerrm || ')');
end $$;

-- ---- 17. admin reads drafts + internal_notes via admin view ----
insert into public.admin_users (user_id) values ('11111111-1111-1111-1111-111111111111');
do $$
declare cnt int; v text;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into cnt from public.waitlists_admin where id like 'test-wl-%';
  select internal_notes into v from public.waitlists_admin where id = 'test-wl-draft';
  reset role;
  insert into results (test, outcome) values ('17 admin reads drafts + internal_notes via view',
    case when cnt = 2 and v = 'secret staff note draft' then 'PASS: 2 rows, notes readable' else 'FAIL: cnt=' || cnt || ' notes=' || coalesce(v,'null') end);
exception when others then
  insert into results (test, outcome) values ('17 admin reads drafts + internal_notes via view', 'FAIL: error (' || sqlerrm || ')');
end $$;

-- ---- 18. regression: public read surfaces still work ----
do $$
declare cnt int; ts timestamptz;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into cnt from public.waitlists_public;
  select count(*) into cnt from public.resources_public;
  select last_opened_at into ts from public.waitlists_public where id = 'test-wl-pub';
  reset role;
  insert into results (test, outcome) values ('18 authed reads *_public views + last_opened_at',
    case when ts is not null then 'PASS: allowed, last_opened_at populated' else 'FAIL: last_opened_at null' end);
exception when others then
  insert into results (test, outcome) values ('18 authed reads *_public views + last_opened_at', 'FAIL: blocked (' || sqlerrm || ')');
end $$;

-- ---- cleanup: cascades remove profiles, alerts, events, history, claims ----
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
delete from public.waitlists where id in ('test-wl-pub', 'test-wl-draft');

select test, outcome from results order by n;
