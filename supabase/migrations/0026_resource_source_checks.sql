-- Manual source-change checks. No schedules, discovery, or automatic publication.
begin;

alter table public.resources add column if not exists cost_details text;
alter table public.resources drop constraint resources_service_tags_valid;
alter table public.resources add constraint resources_service_tags_valid check (
  cardinality(service_tags) <= 7 and array_position(service_tags, null) is null and
  service_tags <@ array['financial_education','internet_assistance','health_support',
    'moving_help','move_in_costs','furniture','utility_help']::text[]
);
grant select (cost_details) on public.resources to anon, authenticated;

create or replace view public.resources_public with (security_invoker = true) as
select r.id,r.name,r.category,r.county,r.city,r.state,r.description,r.who_qualifies,
  r.who_it_helps,r.application_method,r.referral_required,r.phone,r.website,r.address,
  r.source_url,r.source_type,r.last_verified,r.public_notes,r.priority_score,
  r.published,r.created_at,r.updated_at,
  coalesce((select jsonb_agg(jsonb_build_object('state',a.state,'county',a.county)
    order by a.sort_order,a.state,a.county) from public.resource_service_areas a
    where a.resource_id=r.id),'[]'::jsonb) as service_areas,
  r.service_tags,r.cost_details
from public.resources r;

create or replace view public.resources_admin with (security_invoker = true, security_barrier = true) as
select r.id,r.name,r.category,r.county,r.city,r.state,r.description,r.who_qualifies,
  r.who_it_helps,r.application_method,r.referral_required,r.phone,r.website,r.address,
  r.source_url,r.source_type,r.last_verified,r.public_notes,r.internal_notes,r.priority_score,
  r.published,r.created_at,r.updated_at,
  coalesce((select jsonb_agg(jsonb_build_object('state',a.state,'county',a.county)
    order by a.sort_order,a.state,a.county) from public.resource_service_areas a
    where a.resource_id=r.id),'[]'::jsonb) as service_areas,
  r.service_tags,r.cost_details
from app_private.resources_admin_rows() r;

create table public.resource_source_states (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  last_attempted_at timestamptz,
  last_success_at timestamptz,
  last_confirmed_at timestamptz,
  source_hash text,
  resource_signature text,
  last_status text not null default 'not_checked' check (last_status in
    ('not_checked','unchanged','changed','uncertain','unreadable','edit_conflict')),
  failure_count integer not null default 0,
  retry_after timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  last_error text
);
create table public.resource_source_findings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  resource_name text not null,
  fingerprint text not null,
  kind text not null check (kind in ('changes','closure','uncertain')),
  resolution text not null default 'pending' check (resolution in
    ('pending','accepted','dismissed','reviewed','superseded')),
  review_only boolean not null default true,
  source_url text not null,
  base_updated_at timestamptz not null,
  before_fields jsonb not null,
  proposed_fields jsonb not null,
  evidence jsonb not null,
  summary text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique(resource_id,fingerprint)
);
create index resource_source_findings_pending_idx on public.resource_source_findings(resolution,created_at desc);
create table public.resource_source_attempts (
  id bigint generated always as identity primary key,
  resource_id uuid references public.resources(id) on delete set null,
  checked_at timestamptz not null default now(),
  outcome text not null,
  source_hash text,
  error text
);
alter table public.resource_source_states enable row level security;
alter table public.resource_source_findings enable row level security;
alter table public.resource_source_attempts enable row level security;
create policy source_states_admin_read on public.resource_source_states for select to authenticated using(public.is_admin());
create policy source_findings_admin_read on public.resource_source_findings for select to authenticated using(public.is_admin());
create policy source_attempts_admin_read on public.resource_source_attempts for select to authenticated using(public.is_admin());
revoke all on public.resource_source_states,public.resource_source_findings,public.resource_source_attempts from public,anon,authenticated;
grant select on public.resource_source_states,public.resource_source_findings,public.resource_source_attempts to authenticated;
grant all on public.resource_source_states,public.resource_source_findings,public.resource_source_attempts to service_role;
grant usage,select on sequence public.resource_source_attempts_id_seq to service_role;

-- One active request per resource. Respect retry backoff even on another button click.
create function public.claim_resource_source_check(p_resource_id uuid)
returns uuid language plpgsql set search_path='' as $$
declare v_token uuid := gen_random_uuid();
begin
  insert into public.resource_source_states(resource_id) values(p_resource_id) on conflict do nothing;
  update public.resource_source_states set lease_token=v_token,lease_until=now()+interval '3 minutes',last_attempted_at=now()
  where resource_id=p_resource_id and (lease_until is null or lease_until<now())
    and (retry_after is null or retry_after<=now());
  if not found then return null; end if;
  return v_token;
end; $$;

-- Atomically record evidence and comparison state; never edit public resources.
create function public.complete_resource_source_check(
  p_resource_id uuid,p_lease_token uuid,p_expected_updated_at timestamptz,p_result jsonb
) returns text language plpgsql set search_path='' as $$
declare
  v_row public.resources;
  v_state public.resource_source_states;
  v_status text := p_result->>'status';
  v_fingerprint text := p_result->>'fingerprint';
begin
  select * into v_row from public.resources where id=p_resource_id for update;
  if not found then return 'deleted'; end if;
  select * into v_state from public.resource_source_states where resource_id=p_resource_id for update;
  if v_state.lease_token is distinct from p_lease_token then return 'superseded_request'; end if;
  if v_row.updated_at is distinct from p_expected_updated_at then v_status := 'edit_conflict'; end if;
  if v_status not in ('unchanged','changed','uncertain','unreadable','edit_conflict') then
    raise exception 'Invalid source check outcome';
  end if;
  insert into public.resource_source_attempts(resource_id,outcome,source_hash,error)
    values(p_resource_id,v_status,p_result->>'source_hash',p_result->>'error');
  if v_status in ('changed','uncertain') and v_fingerprint is not null then
    update public.resource_source_findings set resolution='superseded',resolved_at=now()
      where resource_id=p_resource_id and resolution='pending' and fingerprint<>v_fingerprint;
    insert into public.resource_source_findings(
      resource_id,resource_name,fingerprint,kind,review_only,source_url,base_updated_at,
      before_fields,proposed_fields,evidence,summary
    ) values (
      p_resource_id,v_row.name,v_fingerprint,p_result->>'kind',
      coalesce((p_result->>'review_only')::boolean,true),p_result->>'source_url',v_row.updated_at,
      p_result->'before_fields',p_result->'proposed_fields',p_result->'evidence',p_result->>'summary'
    ) on conflict(resource_id,fingerprint) do update set
      last_seen_at=now(),
      base_updated_at=case when resource_source_findings.resolution='pending' then excluded.base_updated_at else resource_source_findings.base_updated_at end,
      before_fields=case when resource_source_findings.resolution='pending' then excluded.before_fields else resource_source_findings.before_fields end,
      proposed_fields=case when resource_source_findings.resolution='pending' then excluded.proposed_fields else resource_source_findings.proposed_fields end,
      evidence=case when resource_source_findings.resolution='pending' then excluded.evidence else resource_source_findings.evidence end;
    -- Accepted/dismissed findings stay resolved when the same evidence returns.
  elsif v_status='unchanged' then
    update public.resource_source_findings set resolution='superseded',resolved_at=now()
      where resource_id=p_resource_id and resolution='pending';
  end if;
  update public.resource_source_states set
    last_attempted_at=now(),
    last_success_at=case when v_status in ('unchanged','changed','uncertain') then now() else last_success_at end,
    last_status=v_status,
    source_hash=case when v_status in ('unchanged','changed','uncertain') then p_result->>'source_hash' else source_hash end,
    resource_signature=case when v_status in ('unchanged','changed','uncertain') then p_result->>'resource_signature' else resource_signature end,
    failure_count=case when v_status='unreadable' then failure_count+1 else 0 end,
    retry_after=case when v_status='unreadable' then (p_result->>'retry_after')::timestamptz
      else now()+interval '1 minute' end,
    last_error=p_result->>'error',lease_until=null,lease_token=null
  where resource_id=p_resource_id;
  if v_status in ('changed','uncertain') then
    if exists(select 1 from public.resource_source_findings where resource_id=p_resource_id and resolution='pending') then
      return 'needs_review';
    end if;
    return 'already_reviewed';
  end if;
  return v_status;
end; $$;

-- Human approval only. The row lock/version guard preserves edits made after checking.
create function public.resolve_resource_source_finding(p_finding_id uuid,p_action text,p_expected_proposed_fields jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_finding public.resource_source_findings;
  v_resource public.resources;
  v_id uuid;
  v_key text;
  v_value jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_action not in ('accept','dismiss','reviewed') then raise exception 'Invalid resolution'; end if;
  select resource_id into v_id from public.resource_source_findings where id=p_finding_id;
  select * into v_resource from public.resources where id=v_id for update;
  select * into v_finding from public.resource_source_findings where id=p_finding_id for update;
  if not found then raise exception 'Finding not found'; end if;
  if v_finding.resolution<>'pending' then return 'already_resolved'; end if;
  if p_action='accept' then
    if v_finding.proposed_fields is distinct from p_expected_proposed_fields then
      raise exception 'Proposal changed since it was displayed. Reload and review the latest proposal.';
    end if;
    if v_finding.review_only or v_finding.kind<>'changes' or v_finding.proposed_fields='{}'::jsonb then
      raise exception 'This finding requires a manual edit';
    end if;
    if v_resource.updated_at is distinct from v_finding.base_updated_at then
      raise exception 'Resource changed since this check. Recheck or review the current record.';
    end if;
    for v_key,v_value in select * from jsonb_each(v_finding.proposed_fields) loop
      if v_key not in ('description','who_qualifies','cost_details','public_notes','phone','application_method','referral_required') then
        raise exception 'Forbidden proposal field';
      end if;
      if v_key='referral_required' then
        if jsonb_typeof(v_value)<>'boolean' then raise exception 'Invalid referral value'; end if;
      elsif jsonb_typeof(v_value)<>'string' or length(v_value#>>'{}')>2000 or length(btrim(v_value#>>'{}'))=0 then
        raise exception 'Invalid proposed text';
      end if;
      if v_key='application_method' and (v_value#>>'{}') not in ('walk_in','phone','online','referral') then
        raise exception 'Invalid application method';
      end if;
      if nullif(v_finding.evidence->>v_key,'') is null then raise exception 'Missing evidence'; end if;
    end loop;
    update public.resources set
      description=coalesce(v_finding.proposed_fields->>'description',description),
      who_qualifies=coalesce(v_finding.proposed_fields->>'who_qualifies',who_qualifies),
      cost_details=coalesce(v_finding.proposed_fields->>'cost_details',cost_details),
      public_notes=coalesce(v_finding.proposed_fields->>'public_notes',public_notes),
      phone=coalesce(v_finding.proposed_fields->>'phone',phone),
      application_method=coalesce(v_finding.proposed_fields->>'application_method',application_method),
      referral_required=coalesce((v_finding.proposed_fields->>'referral_required')::boolean,referral_required)
      where id=v_id;
    -- A partial-field approval does NOT refresh the whole listing's last_verified date.
  end if;
  update public.resource_source_findings set
    resolution=case p_action when 'accept' then 'accepted' when 'dismiss' then 'dismissed' else 'reviewed' end,
    resolved_at=now(),resolved_by=auth.uid() where id=p_finding_id;
  if p_action in ('accept','reviewed') then
    update public.resource_source_states set last_confirmed_at=now(),resource_signature=null,retry_after=null
      where resource_id=v_id;
  end if;
  return 'resolved';
end; $$;

revoke all on function public.claim_resource_source_check(uuid) from public,anon,authenticated;
revoke all on function public.complete_resource_source_check(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.claim_resource_source_check(uuid) to service_role;
grant execute on function public.complete_resource_source_check(uuid,uuid,timestamptz,jsonb) to service_role;
revoke all on function public.resolve_resource_source_finding(uuid,text,jsonb) from public,anon;
grant execute on function public.resolve_resource_source_finding(uuid,text,jsonb) to authenticated;
comment on table public.resource_source_states is 'Private source-check metadata. Fetch success is not funding availability or public verification.';
comment on column public.resources.cost_details is 'Source-supported cost or fee conditions. Null means unknown, never free.';
notify pgrst,'reload schema';
commit;
