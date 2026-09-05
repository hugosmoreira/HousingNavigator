-- Additional service filters; existing housing categories and RLS stay intact.
begin;

alter table public.resources
  add column if not exists service_tags text[] not null default '{}';

alter table public.resources add constraint resources_service_tags_valid check (
  cardinality(service_tags) <= 3
  and array_position(service_tags, null) is null
  and service_tags <@ array['financial_education', 'internet_assistance', 'health_support']::text[]
);

-- Base-table SELECT uses column grants to keep internal_notes private.
grant select (service_tags) on public.resources to anon, authenticated;

create or replace view public.resources_public
  with (security_invoker = true) as
  select
    r.id, r.name, r.category, r.county, r.city, r.state, r.description,
    r.who_qualifies, r.who_it_helps, r.application_method,
    r.referral_required, r.phone, r.website, r.address, r.source_url,
    r.source_type, r.last_verified, r.public_notes, r.priority_score,
    r.published, r.created_at, r.updated_at,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('state', a.state, 'county', a.county)
        order by a.sort_order, a.state, a.county
      ) from public.resource_service_areas a where a.resource_id = r.id
    ), '[]'::jsonb) as service_areas,
    r.service_tags
  from public.resources r;

-- Preserve the existing view's column order: service_tags must be appended
-- AFTER service_areas, not inserted by expanding r.* ahead of that column.
create or replace view public.resources_admin
  with (security_invoker = true, security_barrier = true) as
  select
    r.id, r.name, r.category, r.county, r.city, r.state, r.description,
    r.who_qualifies, r.who_it_helps, r.application_method,
    r.referral_required, r.phone, r.website, r.address, r.source_url,
    r.source_type, r.last_verified, r.public_notes, r.internal_notes,
    r.priority_score, r.published, r.created_at, r.updated_at,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('state', a.state, 'county', a.county)
        order by a.sort_order, a.state, a.county
      ) from public.resource_service_areas a where a.resource_id = r.id
    ), '[]'::jsonb) as service_areas,
    r.service_tags
  from app_private.resources_admin_rows() r;

comment on column public.resources.service_tags is
  'Admin-curated, source-supported service labels for secondary resource filters. Never inferred by automated curation.';

notify pgrst, 'reload schema';
commit;
