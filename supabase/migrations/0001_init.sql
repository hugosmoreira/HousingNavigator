-- Housing Navigator — initial schema
--
-- Postgres / Supabase migration. Designed so the existing JSON seeds in
-- src/data/*.json can be loaded into these tables without changing the UI
-- layer (mappers in src/services/data/mappers.ts handle naming).
--
-- Conventions:
--   * snake_case columns matching the product spec
--   * text-typed enums (instead of Postgres ENUM) so values can evolve
--     without migrations
--   * timestamptz for audit columns; date for last_verified / last_checked
--   * RLS is *enabled* with public read policies for the three reference
--     tables and a deny-by-default policy on resource_submissions

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- programs
-- ---------------------------------------------------------------------------
create table if not exists public.programs (
  id                  text primary key,
  name                text not null,
  category            text not null,
  county              text not null,
  city                text,
  state               text,
  description         text,
  who_it_helps        text[] not null default '{}',
  eligibility_summary text,
  application_method  text not null,
  referral_required   boolean not null default false,
  phone               text,
  website             text,
  address             text,
  status              text not null default 'unknown',
  status_confidence   text not null default 'low',
  source_url          text,
  source_type         text,
  last_verified       date,
  notes               text,
  priority_score      integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists programs_county_idx on public.programs (county);
create index if not exists programs_category_idx on public.programs (category);
create index if not exists programs_status_idx on public.programs (status);

-- ---------------------------------------------------------------------------
-- decision_rules
-- ---------------------------------------------------------------------------
create table if not exists public.decision_rules (
  id                    uuid primary key default gen_random_uuid(),
  intake_state          text not null,
  goal                  text not null,
  primary_action        text not null,
  priority_categories   text[] not null default '{}',
  secondary_categories  text[] not null default '{}',
  recommended_documents text[] not null default '{}',
  caution_notes         text[] not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (intake_state, goal)
);

-- ---------------------------------------------------------------------------
-- waitlists
-- ---------------------------------------------------------------------------
create table if not exists public.waitlists (
  id                text primary key,
  housing_authority text not null,
  program_name      text,
  county            text not null,
  status            text not null default 'unknown',
  application_link  text,
  source_url        text,
  last_checked      date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists waitlists_county_idx on public.waitlists (county);
create index if not exists waitlists_status_idx on public.waitlists (status);

-- ---------------------------------------------------------------------------
-- resource_submissions
--
-- Holds raw text/URLs pasted by admins or pulled by future ingestion jobs,
-- alongside the AI-extracted draft fields. Promotion to `programs` happens
-- only after a human review (verification_status='verified').
-- ---------------------------------------------------------------------------
create table if not exists public.resource_submissions (
  id                   uuid primary key default gen_random_uuid(),
  source_text          text,
  source_url           text,
  source_type          text,
  extracted_title      text,
  extracted_category   text,
  extracted_summary    text,
  confidence_score     numeric(4, 3),
  verification_status  text not null default 'pending',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists resource_submissions_status_idx
  on public.resource_submissions (verification_status);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'programs', 'decision_rules', 'waitlists', 'resource_submissions'
  ]) loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Reference data is intentionally world-readable (anon key) since the app
-- is anonymous-by-design at MVP. Writes require the service role until an
-- admin auth flow is added.
-- ---------------------------------------------------------------------------
alter table public.programs             enable row level security;
alter table public.decision_rules       enable row level security;
alter table public.waitlists            enable row level security;
alter table public.resource_submissions enable row level security;

drop policy if exists "programs_public_read"       on public.programs;
drop policy if exists "decision_rules_public_read" on public.decision_rules;
drop policy if exists "waitlists_public_read"      on public.waitlists;

create policy "programs_public_read"
  on public.programs for select
  to anon, authenticated
  using (true);

create policy "decision_rules_public_read"
  on public.decision_rules for select
  to anon, authenticated
  using (true);

create policy "waitlists_public_read"
  on public.waitlists for select
  to anon, authenticated
  using (true);

-- resource_submissions: no public policy by default. Service role bypasses
-- RLS, so server-side ingestion / admin tools work without further changes.
