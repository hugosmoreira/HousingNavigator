import { describe, expect, it } from 'vitest';
import type { Program, ServiceArea } from '../types';
import {
  COUNTIES_BY_STATE,
  availableCounties,
  normalizeServiceAreas,
  programServesArea,
  serviceAreaSummary,
} from './serviceAreas';

function program(serviceAreas: ServiceArea[]): Program {
  return {
    id: 'resource-1',
    program_name: 'Regional Housing Help',
    county: serviceAreas[0]?.county ?? 'Other',
    state: serviceAreas[0]?.state,
    service_areas: serviceAreas,
    category: 'comprehensive_support',
    who_it_helps: [],
    application_method: 'phone',
    referral_required: false,
    phone: '',
    website: '',
    status: 'unknown',
    status_confidence: 'low',
    priority_score: 0,
    notes: '',
    last_verified: '',
  };
}

describe('resource service areas', () => {
  it('contains every Oregon and Washington county once', () => {
    expect(COUNTIES_BY_STATE.OR).toHaveLength(36);
    expect(COUNTIES_BY_STATE.WA).toHaveLength(39);
    expect(new Set(COUNTIES_BY_STATE.OR).size).toBe(36);
    expect(new Set(COUNTIES_BY_STATE.WA).size).toBe(39);
  });

  it('normalizes, validates, and deduplicates database values', () => {
    expect(
      normalizeServiceAreas([
        { state: 'OR', county: 'Multnomah' },
        { state: 'OR', county: 'Multnomah' },
        { state: 'WA', county: 'King' },
        { state: 'CA', county: 'Los Angeles' },
      ]),
    ).toEqual([
      { state: 'OR', county: 'Multnomah' },
      { state: 'WA', county: 'King' },
    ]);
  });

  it('backfills legacy rows and infers missing legacy states', () => {
    expect(normalizeServiceAreas(undefined, { state: null, county: 'Clark' })).toEqual([
      { state: 'WA', county: 'Clark' },
    ]);
    expect(normalizeServiceAreas(undefined, { state: 'OR', county: 'Other' })).toEqual([
      { state: 'OR', county: null },
    ]);
  });

  it('matches individual and statewide coverage without duplicating resources', () => {
    const regional = program([
      { state: 'OR', county: 'Deschutes' },
      { state: 'OR', county: 'Crook' },
    ]);
    expect(programServesArea(regional, 'OR', 'Crook')).toBe(true);
    expect(programServesArea(regional, 'OR', 'Jackson')).toBe(false);

    const statewide = program([{ state: 'WA', county: null }]);
    expect(programServesArea(statewide, 'WA', 'Spokane')).toBe(true);
    expect(programServesArea(statewide, 'OR', 'Multnomah')).toBe(false);
  });

  it('derives filter options and readable summaries from actual coverage', () => {
    const programs = [
      program([{ state: 'WA', county: 'King' }]),
      program([{ state: 'WA', county: 'Pierce' }]),
      program([{ state: 'WA', county: 'King' }]),
    ];
    expect(availableCounties(programs, 'WA')).toEqual(['King', 'Pierce']);
    expect(
      serviceAreaSummary([
        { state: 'OR', county: 'Crook' },
        { state: 'OR', county: 'Deschutes' },
      ]),
    ).toBe('Crook and Deschutes counties, OR');
  });
});
