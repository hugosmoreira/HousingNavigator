-- Housing Navigator — stop `internal_notes` leaking to anonymous clients
--
-- Problem
-- -------
-- `resources_public_read` / `waitlists_public_read` (0002_admin_catalog.sql)
-- gate ROWS (`published = true`) for the `anon` + `authenticated` roles, but
-- Supabase grants the `anon` role table-level SELECT, which covers EVERY
-- column. So an anonymous client can read the admin-only `internal_notes`
-- column straight off the PostgREST REST API — e.g.
--   GET /rest/v1/resources?select=internal_notes&published=eq.true
-- — even though the app's own queries never display it. Changing the app's
-- `select('*')` alone does not close this: the privilege has to be removed at
-- the database.
--
-- Fix
-- ---
-- Column-level privilege hardening on the `anon` role, plus internal-notes-free
-- views as the public read surface:
--   1. Revoke the blanket table SELECT from `anon`.
--   2. Re-grant SELECT to `anon` on every column EXCEPT `internal_notes`, so
--      both `?select=internal_notes` and `?select=*` return "permission denied
--      for column internal_notes" for anon.
--   3. Expose `<table>_public` views (security_invoker) selecting only the
--      public columns; the app reads from these.
--
-- RLS policies are NOT modified — rows are still gated to `published = true`.
-- The `authenticated` role is NOT modified, so the admin CMS (is_admin() RLS)
-- keeps full read/write of `internal_notes` and all admin write paths are
-- unchanged.
--
-- security_invoker = true is essential on the views: it makes them run with the
-- querying role's RLS (published-only for anon) instead of the view owner's
-- (which would bypass RLS and expose drafts).
--
-- NOTE: because the `anon` grant is now column-scoped, any future PUBLIC column
-- added to these tables must be added to BOTH the grant list and the matching
-- view below, or anon will not be able to read it (deny-by-default for new
-- columns). `internal_notes` (and any future internal column) is intentionally
-- left off both lists.
--
-- Idempotent: revoke / column grant / `create or replace view` / grant are all
-- safe to re-run.

-- ---------------------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------------------
revoke select on public.resources from anon;

grant select (
  id, name, category, county, city, state, description, who_qualifies,
  who_it_helps, application_method, referral_required, phone, website,
  address, source_url, source_type, last_verified, public_notes,
  priority_score, published, created_at, updated_at
) on public.resources to anon;

create or replace view public.resources_public
  with (security_invoker = true) as
  select
    id, name, category, county, city, state, description, who_qualifies,
    who_it_helps, application_method, referral_required, phone, website,
    address, source_url, source_type, last_verified, public_notes,
    priority_score, published, created_at, updated_at
  from public.resources;

grant select on public.resources_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- waitlists
-- ---------------------------------------------------------------------------
revoke select on public.waitlists from anon;

grant select (
  id, housing_authority, program_name, county, city, state, status,
  application_link, source_url, last_checked, notes, public_notes,
  published, created_at, updated_at
) on public.waitlists to anon;

create or replace view public.waitlists_public
  with (security_invoker = true) as
  select
    id, housing_authority, program_name, county, city, state, status,
    application_link, source_url, last_checked, notes, public_notes,
    published, created_at, updated_at
  from public.waitlists;

grant select on public.waitlists_public to anon, authenticated;
