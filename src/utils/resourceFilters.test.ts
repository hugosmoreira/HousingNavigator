import { describe, expect, it } from 'vitest';
import { matchesResourceFilters, type ResourceFilters } from './resourceFilters';
import type { HouseholdType, Program } from '../types';

function program(whoItHelps: HouseholdType[] | undefined): Program {
  return {
    id: 'p',
    program_name: 'Coordinated Housing Access',
    county: 'Clackamas',
    category: 'rental_assistance',
    who_it_helps: whoItHelps as HouseholdType[],
    application_method: 'phone',
    referral_required: false,
    phone: '',
    website: '',
    status: 'open',
    status_confidence: 'high',
    priority_score: 50,
    notes: '',
    last_verified: '2026-01-01',
  };
}

const ALL: ResourceFilters = {
  categories: [],
  serviceTags: [],
  household: null,
  state: 'All',
  county: 'All',
};

describe('matchesResourceFilters household filter', () => {
  it('keeps a resource with no household restriction under every household filter', () => {
    for (const household of ['family', 'single_adult', 'senior', 'veteran', 'disability'] as const) {
      expect(matchesResourceFilters(program([]), { ...ALL, household })).toBe(true);
    }
  });

  it('treats a missing who_it_helps the same as an empty one', () => {
    expect(matchesResourceFilters(program(undefined), { ...ALL, household: 'family' })).toBe(true);
  });

  it('still hides resources restricted to other households', () => {
    expect(matchesResourceFilters(program(['senior']), { ...ALL, household: 'family' })).toBe(false);
    expect(matchesResourceFilters(program(['senior', 'family']), { ...ALL, household: 'family' })).toBe(true);
  });

  it('does not filter by household when none is selected', () => {
    expect(matchesResourceFilters(program(['senior']), ALL)).toBe(true);
  });
});
