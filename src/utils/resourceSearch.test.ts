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
      program_name: 'Home Forward Section 8 / Public Housing',
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
    const cityHit = searchPrograms([target], 'portland');
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
