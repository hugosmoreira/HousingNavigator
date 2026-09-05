import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeResourceServiceTags, RESOURCE_SERVICE_TAGS, resourceServiceLabels } from './resourceServiceTags';
import { matchesResourceFilters, type ResourceFilters } from '../utils/resourceFilters';
import { searchPrograms } from '../utils/resourceSearch';
import { programFromResourceRow } from '../services/data/mappers';
import type { ResourceRow } from '../services/data/dbTypes';
import type { Program } from '../types';

const schema = readFileSync(new URL('../../supabase/migrations/0024_resource_service_tags.sql', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../../supabase/migrations/0025_seed_ongoing_support_resources.sql', import.meta.url), 'utf8');
const candidates = JSON.parse(seed.split('$resources$')[1]) as ResourceRow[];
const programs = candidates.map((candidate) => programFromResourceRow({
  ...candidate, category: 'supportive_services', application_method: 'online',
  referral_required: false, priority_score: 3, published: true,
  address: null, internal_notes: null, source_type: 'Provider website', last_verified: '2026-09-04',
}));
const [saveFirst, communityAction, internet, health] = programs;
const rent: Program = {
  ...saveFirst, id: 'existing-rent', program_name: 'Existing Rent Assistance',
  category: 'rental_assistance', directory_category: 'rent_assistance',
  service_tags: undefined, description: 'Help paying overdue rent.',
  notes: '', eligibility_summary: '', service_areas: [{ state: 'OR', county: 'Multnomah' }],
  priority_score: 9,
};
const filters: ResourceFilters = { categories: [], serviceTags: [], household: null, state: 'All', county: 'All' };

describe('optional, structured resource service tags', () => {
  it.each([undefined, null, 'financial_education', {}, 10])('handles older or malformed data: %s', (value) => {
    expect(normalizeResourceServiceTags(value)).toEqual([]);
  });
  it('deduplicates known tags and ignores unsupported values', () => {
    expect(normalizeResourceServiceTags(['health_support', 'unknown', 'health_support', null])).toEqual(['health_support']);
    expect(resourceServiceLabels(['internet_assistance'])).toEqual(['Internet assistance']);
  });
  it('maps database labels without changing the existing category', () => {
    expect(internet.service_tags).toEqual(['internet_assistance']);
    expect(internet.directory_category).toBe('supportive_services');
  });
  it('allows one record to match multiple secondary filters without duplication', () => {
    const combined = { ...internet, service_tags: [...RESOURCE_SERVICE_TAGS] };
    const result = [combined].filter((program) => matchesResourceFilters(program, {
      ...filters, serviceTags: ['internet_assistance', 'health_support'],
    }));
    expect(result).toEqual([combined]);
  });
  it('does not tag legacy services by guessing from their descriptions', () => {
    expect(matchesResourceFilters({ ...rent, description: 'Internet and financial education referrals.' }, {
      ...filters, serviceTags: ['financial_education'],
    })).toBe(false);
  });
  it('preserves existing housing-category filtering', () => {
    expect([...programs, rent].filter((program) => matchesResourceFilters(program, {
      ...filters, categories: ['rent_assistance'],
    }))).toEqual([rent]);
  });
  it('clears all tag restrictions when filters reset', () => {
    expect([...programs, rent].filter((program) => matchesResourceFilters(program, filters))).toHaveLength(5);
  });
  it('combines category, service and household filters', () => {
    expect(matchesResourceFilters(internet, { ...filters, categories: ['rent_assistance'], serviceTags: ['internet_assistance'] })).toBe(false);
    expect(matchesResourceFilters(internet, { ...filters, household: 'family', serviceTags: ['internet_assistance'] })).toBe(true);
    expect(matchesResourceFilters(internet, { ...filters, household: 'single_adult', serviceTags: ['internet_assistance'] })).toBe(false);
  });
});

describe('verified coverage and search regression checks', () => {
  it('restricts Community Action to Washington County, Oregon', () => {
    expect(matchesResourceFilters(communityAction, { ...filters, state: 'OR', county: 'Washington' })).toBe(true);
    expect(matchesResourceFilters(communityAction, { ...filters, state: 'OR', county: 'Multnomah' })).toBe(false);
    expect(matchesResourceFilters(communityAction, { ...filters, state: 'WA', county: 'All' })).toBe(false);
  });
  it('includes internet and online classes across Oregon and Washington', () => {
    for (const program of [saveFirst, internet]) {
      expect(matchesResourceFilters(program, { ...filters, state: 'OR', county: 'Lane' })).toBe(true);
      expect(matchesResourceFilters(program, { ...filters, state: 'WA', county: 'King' })).toBe(true);
    }
  });
  it('does not show the Oregon-only naloxone program for Washington', () => {
    expect(matchesResourceFilters(health, { ...filters, state: 'OR', county: 'Jackson' })).toBe(true);
    expect(matchesResourceFilters(health, { ...filters, state: 'WA', county: 'Clark' })).toBe(false);
  });
  it.each(['wifi', 'wi-fi', 'Wi Fi', 'hotspot', 'broadband', 'internet assistance'])('finds internet assistance for %s', (query) => {
    expect(searchPrograms([...programs, rent], query)[0].program.id).toBe(internet.id);
  });
  it.each(['naloxone', 'narcan', 'health support'])('finds the verified health resource for %s', (query) => {
    expect(searchPrograms([...programs, rent], query)[0].program.id).toBe(health.id);
  });
  it('finds financial services and preserves rent-search ranking', () => {
    expect(searchPrograms([...programs, rent], 'financial education').slice(0, 2).map((item) => item.program.id).sort())
      .toEqual([saveFirst.id, communityAction.id].sort());
    expect(searchPrograms([...programs, rent], 'rent help')[0].program.id).toBe(rent.id);
  });
});

describe('additive database and publication contract', () => {
  it('contains exactly the four approved services, each with evidence and supported coverage', () => {
    expect(programs).toHaveLength(4);
    expect(new Set(programs.map((program) => program.id)).size).toBe(4);
    for (const program of programs) {
      expect(program.source_url).toMatch(/^https:\/\//);
      expect(program.eligibility_summary).toBeTruthy();
      expect(program.service_areas?.length).toBeGreaterThan(0);
      expect(normalizeResourceServiceTags(program.service_tags)).toEqual(program.service_tags);
      expect(program.program_name).not.toMatch(/home\s*forward|hiring event|career fair/i);
    }
  });
  it('retains material eligibility, cost and access limitations', () => {
    expect(internet.description).toContain('200GB');
    expect(internet.description).toContain('per year');
    expect(internet.description).toContain('not unlimited');
    expect(saveFirst.notes).toContain('may have fees');
    expect(health.eligibility_summary).toContain('mailing address');
    expect(health.notes).toContain('not an emergency response');
  });
  it('uses a transaction and never updates or deletes existing listings', () => {
    expect(seed).toContain('begin;');
    expect(seed).toContain('commit;');
    expect(seed).toContain('on conflict (id) do nothing');
    expect(seed).not.toMatch(/\b(update|delete from)\s+public\./i);
    expect(seed).not.toMatch(/insert into public\.(waitlists|affordable_properties)/i);
    expect(seed.indexOf('Existing resource matches')).toBeLessThan(seed.indexOf('insert into public.resources'));
  });
  it('preserves public/internal separation and the admin access gate', () => {
    const publicView = schema.split('create or replace view public.resources_public')[1]
      .split('create or replace view public.resources_admin')[0];
    expect(publicView).not.toContain('r.internal_notes');
    expect(publicView).toContain('security_invoker = true');
    expect(schema).toContain('app_private.resources_admin_rows()');
    expect(schema).toContain('grant select (service_tags)');
    expect(schema).not.toMatch(/grant select\s+on public.resources\s/);
    expect(schema).not.toContain('disable row level security');
  });
});
