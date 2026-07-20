-- Housing Navigator - backfill public profiles for pre-dashboard Auth users
--
-- The two original administrator accounts predate migration 0004, which
-- introduced public.profiles and the on_auth_user_created trigger. The trigger
-- protects future signups but does not run retroactively. Populate only
-- missing rows so existing profile preferences are never overwritten.

begin;

insert into public.profiles (id, email)
select users.id, users.email
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;

commit;
