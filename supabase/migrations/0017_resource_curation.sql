-- Housing Navigator — on-demand resource curation audit trail
--
-- The curation Edge Function is admin-triggered only. There is intentionally
-- no pg_cron schedule, trigger, or automatic resource-discovery mechanism in
-- this migration. Each run records its fixed target set and one result per
-- resource so progress can be resumed and every applied change is auditable.

begin;

create table if not exists public.resource_curation_runs (
  id                    uuid primary key default gen_random_uuid(),
  status                text not null default 'running'
                        check (status in ('running', 'completed', 'failed')),
  target_resource_ids   uuid[] not null default '{}',
  target_count          integer not null default 0 check (target_count >= 0),
  processed_count       integer not null default 0 check (processed_count >= 0),
  updated_count         integer not null default 0 check (updated_count >= 0),
  needs_review_count    integer not null default 0 check (needs_review_count >= 0),
  failed_count          integer not null default 0 check (failed_count >= 0),
  created_by            uuid references auth.users(id) on delete set null,
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  error                 text
);

create table if not exists public.resource_curation_checks (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references public.resource_curation_runs(id) on delete cascade,
  -- Deliberately not a foreign key: the audit record must survive even if an
  -- administrator later deletes the curated resource.
  resource_id           uuid not null,
  resource_name         text not null,
  checked_url           text,
  action                text not null check (action in (
                          'updated',
                          'needs_review',
                          'fetch_failed',
                          'insufficient_content',
                          'extract_failed',
                          'internal_error',
                          'edit_conflict'
                        )),
  confidence            numeric(4,3),
  proposed_fields       jsonb not null default '{}'::jsonb,
  applied_fields        text[] not null default '{}',
  evidence              jsonb not null default '{}'::jsonb,
  notes                 text,
  error                 text,
  checked_at            timestamptz not null default now(),
  unique (run_id, resource_id)
);

create index if not exists resource_curation_runs_started_idx
  on public.resource_curation_runs (started_at desc);
create index if not exists resource_curation_checks_run_idx
  on public.resource_curation_checks (run_id, checked_at);

alter table public.resource_curation_runs enable row level security;
alter table public.resource_curation_checks enable row level security;

drop policy if exists "resource_curation_runs_admin_read"
  on public.resource_curation_runs;
create policy "resource_curation_runs_admin_read"
  on public.resource_curation_runs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "resource_curation_checks_admin_read"
  on public.resource_curation_checks;
create policy "resource_curation_checks_admin_read"
  on public.resource_curation_checks for select
  to authenticated
  using (public.is_admin());

revoke all on public.resource_curation_runs
  from public, anon, authenticated;
revoke all on public.resource_curation_checks
  from public, anon, authenticated;

grant select on public.resource_curation_runs to authenticated;
grant select on public.resource_curation_checks to authenticated;

grant select, insert, update on public.resource_curation_runs to service_role;
grant select, insert on public.resource_curation_checks to service_role;

-- Apply a generated fill-only patch and write its audit row in the same
-- transaction. The function is service-role-only; browser administrators can
-- read the audit trail but cannot invoke this mutation directly.
create or replace function public.apply_resource_curation_update(
  p_run_id uuid,
  p_resource_id uuid,
  p_expected_updated_at timestamptz,
  p_resource_name text,
  p_checked_url text,
  p_confidence numeric,
  p_proposed_fields jsonb,
  p_patch jsonb,
  p_applied_fields text[],
  p_evidence jsonb,
  p_notes text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_resource_id uuid;
begin
  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'curation patch must not be empty';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_object_keys(p_patch) as keys(key_name)
     where keys.key_name not in (
       'description',
       'who_qualifies',
       'who_it_helps',
       'source_url',
       'source_type',
       'last_verified'
     )
  ) then
    raise exception 'curation patch contains a forbidden field';
  end if;

  update public.resources as r
     set description = case
           when p_patch ? 'description'
            and nullif(pg_catalog.btrim(r.description), '') is null
             then nullif(pg_catalog.btrim(p_patch->>'description'), '')
           else r.description
         end,
         who_qualifies = case
           when p_patch ? 'who_qualifies'
            and nullif(pg_catalog.btrim(r.who_qualifies), '') is null
             then nullif(pg_catalog.btrim(p_patch->>'who_qualifies'), '')
           else r.who_qualifies
         end,
         who_it_helps = case
           when p_patch ? 'who_it_helps'
            and pg_catalog.cardinality(r.who_it_helps) = 0
             then array(
               select pg_catalog.jsonb_array_elements_text(p_patch->'who_it_helps')
             )
           else r.who_it_helps
         end,
         source_url = case
           when p_patch ? 'source_url'
            and nullif(pg_catalog.btrim(r.source_url), '') is null
             then nullif(pg_catalog.btrim(p_patch->>'source_url'), '')
           else r.source_url
         end,
         source_type = case
           when p_patch ? 'source_type'
            and nullif(pg_catalog.btrim(r.source_type), '') is null
             then nullif(pg_catalog.btrim(p_patch->>'source_type'), '')
           else r.source_type
         end,
         last_verified = case
           when p_patch ? 'last_verified'
             then (p_patch->>'last_verified')::date
           else r.last_verified
         end
   where r.id = p_resource_id
     and r.updated_at = p_expected_updated_at
  returning r.id into v_resource_id;

  if v_resource_id is null then
    insert into public.resource_curation_checks (
      run_id,
      resource_id,
      resource_name,
      checked_url,
      action,
      confidence,
      proposed_fields,
      evidence,
      notes,
      error
    ) values (
      p_run_id,
      p_resource_id,
      p_resource_name,
      p_checked_url,
      'edit_conflict',
      p_confidence,
      coalesce(p_proposed_fields, '{}'::jsonb),
      coalesce(p_evidence, '{}'::jsonb),
      p_notes,
      'Resource changed during curation; no generated values were applied.'
    );
    return 'edit_conflict';
  end if;

  insert into public.resource_curation_checks (
    run_id,
    resource_id,
    resource_name,
    checked_url,
    action,
    confidence,
    proposed_fields,
    applied_fields,
    evidence,
    notes
  ) values (
    p_run_id,
    p_resource_id,
    p_resource_name,
    p_checked_url,
    'updated',
    p_confidence,
    coalesce(p_proposed_fields, '{}'::jsonb),
    coalesce(p_applied_fields, '{}'::text[]),
    coalesce(p_evidence, '{}'::jsonb),
    p_notes
  );
  return 'updated';
end;
$$;

revoke all on function public.apply_resource_curation_update(
  uuid, uuid, timestamptz, text, text, numeric, jsonb, jsonb, text[], jsonb, text
) from public, anon, authenticated;
grant execute on function public.apply_resource_curation_update(
  uuid, uuid, timestamptz, text, text, numeric, jsonb, jsonb, text[], jsonb, text
) to service_role;

comment on table public.resource_curation_runs is
  'Admin-triggered resource curation runs; no schedule or discovery job.';
comment on table public.resource_curation_checks is
  'Evidence, proposals, and applied fields for each resource in a curation run.';
comment on function public.apply_resource_curation_update(
  uuid, uuid, timestamptz, text, text, numeric, jsonb, jsonb, text[], jsonb, text
) is 'Service-role-only atomic fill-only resource update plus curation audit insert.';

commit;
