import { describe, expect, it } from 'vitest';
import { searchPrograms, tokenize } from './resourceSearch';
import type { Program } from '../types';

function program(overrides: Partial<Program>): Program {
  return {
    id: overrides.id ?? 'p',
    program_name: overrides.program_name ?? 'Test Program',
    county: overrides.county ?? 'Multnomah',
    category: overrides.category ?? 'rental_assistance',
    who_it_helps: overrides.who_it_helps ?? ['single_adult'],
    application_method: overrides.application_method ?? 'phone',
    referral_required: overrides.referral_required ?? false,
    phone: overrides.phone ?? '',
    website: overrides.website ?? '',
    status: overrides.status ?? 'open',
    status_confidence: overrides.status_confidence ?? 'high',
    priority_score: overrides.priority_score ?? 50,
    notes: overrides.notes ?? '',
    last_verified: overrides.last_verified ?? '2026-01-01',
    description: overrides.description,
    eligibility_summary: overrides.eligibility_summary,
    city: overrides.city,
    state: overrides.state,
    address: overrides.address,
    source_url: overrides.source_url,
    source_type: overrides.source_type,
    directory_category: overrides.directory_category,
    raw_category: overrides.raw_category,
    service_areas: overrides.service_areas,
    service_tags: overrides.service_tags,
  };
}

describe('tokenize', () => {
  it('lowercases, strips punctuation, and splits on whitespace', () => {
    expect(tokenize('Section 8 / HCV')).toEqual(['section', '8', 'hcv']);
  });
});

describe('searchPrograms', () => {
  it('returns all programs unscored when query is empty', () => {
    const programs = [program({ id: 'a' }), program({ id: 'b' })];
    const results = searchPrograms(programs, '   ');
    expect(results.map((r) => r.program.id)).toEqual(['a', 'b']);
    expect(results.every((r) => r.score === 0)).toBe(true);
  });

  it('matches on program name with the highest weight', () => {
    const direct = program({
      id: 'direct',
      program_name: 'Oregon Law Center Eviction Defense',
    });
    const tangential = program({
      id: 'tangential',
      program_name: 'Generic Help Hotline',
      notes: 'Sometimes refers callers to eviction support.',
    });
    const results = searchPrograms([tangential, direct], 'eviction');
    expect(results[0].program.id).toBe('direct');
  });

  it('expands synonyms (section 8 ↔ voucher ↔ hud-vash)', () => {
    const sec8 = program({
      id: 'sec8',
      program_name: 'County Housing Authority Section 8 / Public Housing',
      directory_category: 'section8_waitlist',
    });
    const unrelated = program({
      id: 'unrelated',
      program_name: 'Family Shelter',
      directory_category: 'emergency_shelter',
    });
    const results = searchPrograms([unrelated, sec8], 'voucher');
    expect(results.map((r) => r.program.id)).toContain('sec8');
    expect(results[0].program.id).toBe('sec8');
  });

  it('tolerates a single-character typo on tokens of length >= 4', () => {
    const target = program({
      id: 'target',
      program_name: 'Eviction Defense Clinic',
    });
    const results = searchPrograms([target], 'evicton');
    expect(results).toHaveLength(1);
    expect(results[0].program.id).toBe('target');
  });

  it('searches across description, eligibility, and location fields', () => {
    const target = program({
      id: 'target',
      program_name: 'Bradley Angle',
      description: 'Confidential emergency shelter for survivors of domestic violence.',
      city: 'Portland',
    });
    const dvHit = searchPrograms([target], 'domestic violence');
    expect(dvHit[0]?.program.id).toBe('target');
    const cityHit = searchPrograms([target], 'portland', { location: { state: 'OR', county: 'Multnomah' } });
    expect(cityHit[0]?.program.id).toBe('target');
  });

  it('ignores filler/stopwords so a real match outranks a wordy description', () => {
    const target = program({
      id: 'target',
      program_name: 'Multnomah Rent Assistance',
      county: 'Multnomah',
    });
    const wordy = program({
      id: 'wordy',
      program_name: 'Community Resource Line',
      description:
        'We are here to help with whatever you need, in person or by phone, for any situation.',
    });
    const results = searchPrograms([wordy, target], 'rent help in Multnomah');
    expect(results[0].program.id).toBe('target');
  });

  it('still returns results when the query is entirely stopwords', () => {
    const target = program({
      id: 'target',
      program_name: 'Generic Help Hotline',
    });
    const results = searchPrograms([target], 'help');
    expect(results.map((r) => r.program.id)).toContain('target');
  });

  it('expands a single-token entry point (section → voucher programs)', () => {
    const voucher = program({
      id: 'voucher',
      program_name: 'Housing Choice Voucher Program',
      directory_category: 'section8_waitlist',
    });
    const unrelated = program({
      id: 'unrelated',
      program_name: 'Family Shelter',
      directory_category: 'emergency_shelter',
    });
    const results = searchPrograms([unrelated, voucher], 'section');
    expect(results[0].program.id).toBe('voucher');
  });

  it('matches on a prefix for tokens of length >= 4', () => {
    const target = program({ id: 'target', program_name: 'Eviction Defense Clinic' });
    const results = searchPrograms([target], 'evict');
    expect(results.map((r) => r.program.id)).toContain('target');
  });

  it('returns no results for a query that matches nothing', () => {
    const target = program({ id: 'target', program_name: 'Rent Assistance' });
    const results = searchPrograms([target], 'zzzznotarealword');
    expect(results).toHaveLength(0);
  });

  it('breaks ties on priority_score desc, then name asc', () => {
    const a = program({
      id: 'a',
      program_name: 'Rent Assistance Alpha',
      priority_score: 50,
    });
    const b = program({
      id: 'b',
      program_name: 'Rent Assistance Beta',
      priority_score: 90,
    });
    const c = program({
      id: 'c',
      program_name: 'Rent Assistance Charlie',
      priority_score: 90,
    });
    const results = searchPrograms([a, b, c], 'rent assistance');
    expect(results.map((r) => r.program.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('location-aware catalog regressions', () => {
  // Public names and coverage observed September 6, 2026. Controlled fixtures
  // isolate retrieval behavior; this is not a live availability assertion.
  const access = program({ id: 'access', program_name: 'ACCESS - Rental and Utility Assistance',
    notes: 'Rent help and utility help.', service_areas: [{ state: 'OR', county: 'Jackson' }] });
  const clark = program({ id: 'clark', program_name: 'Clark Public Utilities - Operation Warm Heart',
    description: 'Utilities, utility help, heating and electric bill assistance.',
    service_areas: [{ state: 'WA', county: 'Clark' }] });
  const neighborLink = program({ id: 'neighbor', program_name: 'NeighborLink PDX - Volunteer Moving Help',
    description: 'Moving truck and movers.', service_areas: [{ state: 'OR', county: 'Multnomah' }] });
  const spokane = program({ id: 'spokane', program_name: 'Spokane rent assistance',
    service_areas: [{ state: 'WA', county: 'Spokane' }] });
  const programs = [access, clark, neighborLink, spokane];

  it('rent help in Spokane excludes ACCESS and Clark-only resources', () => {
    expect(searchPrograms(programs, 'rent help in Spokane').map(r => r.program.id)).toEqual(['spokane']);
  });

  it('moving truck in Bend does not substitute a Portland moving provider', () => {
    expect(searchPrograms(programs, 'moving truck in Bend')).toEqual([]);
  });

  it('utility help in Jackson County does not rank Clark Public Utilities as local', () => {
    expect(searchPrograms(programs, 'utility help in Jackson County').map(r => r.program.id)).toEqual(['access']);
  });

  it('includes statewide coverage despite an out-of-area office and excludes an office-only match', () => {
    const statewide = program({ id: 'statewide', program_name: 'Rent assistance', city: 'Vancouver', state: 'WA', county: 'Clark',
      service_areas: [{ state: 'WA', county: null }] });
    const officeOnly = program({ id: 'office', program_name: 'Spokane rent rent assistance', city: 'Spokane', county: 'Spokane', state: 'WA',
      service_areas: [{ state: 'WA', county: 'Clark' }] });
    expect(searchPrograms([officeOnly, statewide], 'rent in Spokane').map(r => r.program.id)).toEqual(['statewide']);
  });

  it('does not infer coverage from city/address fields when coverage is unknown', () => {
    const unknown = program({ id: 'unknown', program_name: 'Spokane rent assistance', county: 'Other', city: 'Spokane' });
    expect(searchPrograms([unknown], 'rent in Spokane')).toEqual([]);
  });

  it.each(['rent in Benton County', 'rent in Spokne', 'rent in Boston'])('does not return unfiltered results while %s needs clarification', query => {
    expect(searchPrograms(programs, query)).toEqual([]);
  });

  it('an explicit manual filter takes precedence and removes the conflicting place from scoring', () => {
    expect(searchPrograms(programs, 'utility in Spokane', { location: { state: 'OR', county: 'Jackson' } })
      .map(r => r.program.id)).toEqual(['access']);
    expect(searchPrograms(programs, 'utility in Spokane', { location: null }).map(r => r.program.id)).toContain('clark');
  });

  it('preserves service typo matching inside the selected area', () => {
    expect(searchPrograms([access, spokane], 'rnet assistance in Spokane').map(r => r.program.id)).toEqual(['spokane']);
  });

  it('a place alone or with generic help browses that area without requiring a city keyword hit', () => {
    const regional = program({ id: 'regional', program_name: 'Community Action', notes: '',
      service_areas: [{ state: 'WA', county: 'Spokane' }] });
    for (const query of ['Spokane', 'help in Spokane']) {
      expect(searchPrograms([access, regional], query).map(r => r.program.id)).toEqual(['regional']);
    }
  });
});
