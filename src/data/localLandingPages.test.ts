import { describe, expect, it } from 'vitest';
import type { Program } from '../types';
import {
  findLocalLandingPage,
  LOCAL_LANDING_PAGES,
  localLandingPrograms,
} from './localLandingPages';
import { programServesArea } from './serviceAreas';

describe('local housing landing pages', () => {
  it('uses unique, stable paths with concise search metadata', () => {
    const paths = LOCAL_LANDING_PAGES.map((page) => page.path);

    expect(new Set(paths).size).toBe(paths.length);
    for (const page of LOCAL_LANDING_PAGES) {
      expect(page.path).toMatch(/^\/housing-help\/[a-z0-9-/]+$/);
      expect(page.title.length).toBeLessThanOrEqual(65);
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(findLocalLandingPage(`${page.path}/`)).toBe(page);
    }
  });

  // Curation and the offline build both change catalog size. Test matching
  // behavior against controlled records, not a quota of live providers that
  // could prevent a legitimate removal or make a second build fail.
  it.each(LOCAL_LANDING_PAGES)('filters actual coverage/category and ranks $path', (page) => {
    const state = page.stateName === 'Oregon' ? 'OR' : 'WA';
    const base: Program = {
      id: 'local-a', program_name: 'A local provider', county: page.county, state,
      service_areas: [{ state, county: page.county }],
      category: 'comprehensive_support',
      directory_category: page.service ?? 'supportive_services',
      who_it_helps: [], application_method: 'phone', referral_required: false,
      phone: '', website: '', status: 'unknown', status_confidence: 'low',
      priority_score: 5, notes: '', last_verified: '',
    };
    const fixtures: Program[] = [
      { ...base, id: 'local-b', program_name: 'B local provider' },
      { ...base, id: 'wrong-state', priority_score: 100, service_areas: [
        state === 'OR' ? { state: 'WA', county: 'Clark' } : { state: 'OR', county: 'Multnomah' },
      ] },
      { ...base, id: 'statewide', priority_score: 10, service_areas: [{ state, county: null }] },
      { ...base, id: 'wrong-county', priority_score: 100,
        service_areas: [{ state, county: state === 'OR' ? 'Jackson' : 'King' }] },
      { ...base, id: 'different-service', priority_score: 0,
        directory_category: base.directory_category === 'rent_assistance' ? 'legal_aid' : 'rent_assistance' },
      base,
    ];
    const programs = localLandingPrograms(page, fixtures);
    const expected = ['statewide', 'local-a', 'local-b'];
    if (!page.service) expected.push('different-service');
    expect(programs.map((program) => program.id)).toEqual(expected);
    expect(programs.every((program) => programServesArea(program, state, page.county))).toBe(true);
  });

  it('does not manufacture matches for an empty curated catalog', () => {
    for (const page of LOCAL_LANDING_PAGES) expect(localLandingPrograms(page, [])).toEqual([]);
  });

  it('keeps unsupported thin county combinations out of the indexable set', () => {
    expect(findLocalLandingPage('/housing-help/washington-county')).toBeNull();
    expect(findLocalLandingPage('/housing-help/clackamas-county')).toBeNull();
  });
});
