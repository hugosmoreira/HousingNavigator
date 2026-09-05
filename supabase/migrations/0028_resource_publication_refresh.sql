-- Explicit admin publication only: no scheduler, content edits or auto-publishing.
begin;
create table public.resource_publication_refresh (
  singleton boolean primary key default true check (singleton),
  request_id uuid not null default gen_random_uuid(),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null default now(),
  outcome text not null check (outcome in ('requested', 'accepted', 'failed'))
);
alter table public.resource_publication_refresh enable row level security;
revoke all on public.resource_publication_refresh from public, anon, authenticated;
grant select on public.resource_publication_refresh to authenticated;
create policy publication_admin_read on public.resource_publication_refresh
  for select to authenticated using (public.is_admin());

create function public.claim_resource_publication_refresh(p_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.resource_publication_refresh; v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid content digest';
  end if;
  -- Serialize first insert as well as subsequent requests across admin sessions.
  perform pg_catalog.pg_advisory_xact_lock(628028);
  select * into v from public.resource_publication_refresh where singleton;
  if found then
    if v.content_digest = p_digest and v.outcome <> 'failed'
       and v.requested_at > now() - interval '15 minutes' then
      return pg_catalog.jsonb_build_object('claimed', false, 'reason', 'already_requested');
    end if;
    if v.requested_at > now() - interval '60 seconds' then
      return pg_catalog.jsonb_build_object('claimed', false, 'reason', 'cooldown');
    end if;
  end if;
  v_id := gen_random_uuid();
  insert into public.resource_publication_refresh
    (singleton, request_id, content_digest, requested_at, outcome)
    values (true, v_id, p_digest, now(), 'requested')
    on conflict (singleton) do update set request_id = excluded.request_id,
      content_digest = excluded.content_digest, requested_at = excluded.requested_at,
      outcome = excluded.outcome;
  return pg_catalog.jsonb_build_object('claimed', true, 'request_id', v_id);
end;
$$;
create function public.finish_resource_publication_refresh(p_request_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_outcome is null or p_outcome not in ('accepted', 'failed') then
    raise exception 'Invalid refresh outcome';
  end if;
  update public.resource_publication_refresh set outcome = p_outcome
    where singleton and request_id = p_request_id and outcome = 'requested';
end;
$$;
revoke all on function public.claim_resource_publication_refresh(text) from public, anon, authenticated;
revoke all on function public.finish_resource_publication_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_resource_publication_refresh(text) to authenticated;
grant execute on function public.finish_resource_publication_refresh(uuid, text) to authenticated;
comment on table public.resource_publication_refresh is
  'Private last explicit admin build request. Live state is proven by the deployed public-content manifest, not this request receipt.';
commit;
