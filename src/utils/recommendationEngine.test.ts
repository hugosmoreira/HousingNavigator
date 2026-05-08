import { describe, expect, it } from 'vitest';
import {
  getRecommendations,
  resolveRule,
} from './recommendationEngine';
import type {
  DecisionRule,
  IntakeState,
  Program,
} from '../types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const RULES: DecisionRule[] = [
  {
    intake_state: 'homeless',
    goal: 'shelter',
    primary_action: 'Call coordinated entry',
    priority_categories: ['emergency_shelter', 'comprehensive_support'],
    secondary_categories: ['transitional_housing', 'long_term_housing_waitlist'],
    caution_notes: ['Capacity changes daily'],
    recommended_documents: ['Photo ID'],
  },
  {
    intake_state: 'eviction_notice',
    goal: 'stay_housed',
    primary_action: 'Call legal aid today',
    priority_categories: ['legal_aid', 'eviction_prevention', 'rental_assistance'],
    secondary_categories: ['comprehensive_support', 'emergency_shelter'],
    caution_notes: ['Do not ignore the notice'],
    recommended_documents: ['Eviction notice'],
  },
  {
    intake_state: 'at_risk',
    goal: 'stay_housed',
    primary_action: 'Apply for short-term rent assistance',
    priority_categories: ['rental_assistance', 'eviction_prevention'],
    secondary_categories: ['legal_aid', 'comprehensive_support'],
    caution_notes: [],
    recommended_documents: [],
  },
  {
    intake_state: 'at_risk',
    goal: 'long_term_housing',
    primary_action: 'Get on every open housing authority waitlist',
    priority_categories: ['long_term_housing_waitlist', 'transitional_housing'],
    secondary_categories: ['rental_assistance', 'comprehensive_support'],
    caution_notes: [],
    recommended_documents: [],
  },
];

function program(overrides: Partial<Program>): Program {
  return {
    id: 'p',
    program_name: 'Test Program',
    county: 'Multnomah',
    category: 'emergency_shelter',
    who_it_helps: ['single_adult'],
    application_method: 'phone',
    referral_required: false,
    phone: '555',
    website: 'https://example.org',
    status: 'open',
    status_confidence: 'high',
    priority_score: 50,
    notes: '',
    last_verified: '2026-01-01',
    ...overrides,
  };
}

const HOMELESS_INTAKE: IntakeState = {
  county: 'Multnomah',
  situation: 'homeless',
  goal: 'shelter',
  householdType: 'single_adult',
  urgentHelp: false,
};

// ---------------------------------------------------------------------------
// resolveRule
// ---------------------------------------------------------------------------

describe('resolveRule', () => {
  it('finds the rule for each (situation, goal) pair', () => {
    expect(resolveRule(HOMELESS_INTAKE, RULES).intake_state).toBe('homeless');
    expect(
      resolveRule(
        { ...HOMELESS_INTAKE, situation: 'at_risk', goal: 'long_term_housing' },
        RULES,
      ).goal,
    ).toBe('long_term_housing');
  });

  it('throws when situation or goal is missing', () => {
    expect(() =>
      resolveRule({ ...HOMELESS_INTAKE, situation: null }, RULES),
    ).toThrowError(/situation and intake.goal/);
  });

  it('throws when no rule matches', () => {
    expect(() =>
      resolveRule(
        // @ts-expect-error — deliberately invalid combo
        { ...HOMELESS_INTAKE, goal: 'unknown_goal' },
        RULES,
      ),
    ).toThrowError(/no decision rule/);
  });
});

// ---------------------------------------------------------------------------
// getRecommendations
// ---------------------------------------------------------------------------

describe('getRecommendations — category matching', () => {
  it('promotes primary-category programs above secondary ones', () => {
    const programs: Program[] = [
      program({ id: 'shelter', category: 'emergency_shelter', priority_score: 10 }),
      program({ id: 'transitional', category: 'transitional_housing', priority_score: 10 }),
    ];
    const { recommendations, secondaryRecommendations } = getRecommendations(
      HOMELESS_INTAKE,
      programs,
      RULES,
    );
    expect(recommendations[0].program.id).toBe('shelter');
    expect(secondaryRecommendations[0].program.id).toBe('transitional');
  });

  it('caps primary results at 5 and secondary at 4', () => {
    const programs: Program[] = [
      ...Array.from({ length: 7 }, (_, i) =>
        program({ id: `pri-${i}`, category: 'emergency_shelter', priority_score: 100 - i }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        program({
          id: `sec-${i}`,
          category: 'transitional_housing',
          priority_score: 80 - i,
        }),
      ),
    ];
    const result = getRecommendations(HOMELESS_INTAKE, programs, RULES);
    expect(result.recommendations).toHaveLength(5);
    expect(result.secondaryRecommendations).toHaveLength(4);
  });
});

describe('getRecommendations — county filter', () => {
  it('filters by intake.county when not "Other"', () => {
    const programs: Program[] = [
      program({ id: 'mult', county: 'Multnomah' }),
      program({ id: 'clark', county: 'Clark' }),
    ];
    const result = getRecommendations(HOMELESS_INTAKE, programs, RULES);
    expect(result.recommendations.map((r) => r.program.id)).toEqual(['mult']);
  });

  it('does not filter by county when intake.county is "Other"', () => {
    const programs: Program[] = [
      program({ id: 'mult', county: 'Multnomah' }),
      program({ id: 'clark', county: 'Clark' }),
    ];
    const result = getRecommendations(
      { ...HOMELESS_INTAKE, county: 'Other' },
      programs,
      RULES,
    );
    expect(result.recommendations).toHaveLength(2);
  });
});

describe('getRecommendations — fallback', () => {
  it('falls back to highest scoring overall when no primary match in county', () => {
    const programs: Program[] = [
      program({ id: 'unrelated', county: 'Multnomah', category: 'legal_aid', priority_score: 60 }),
    ];
    const result = getRecommendations(HOMELESS_INTAKE, programs, RULES);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].program.id).toBe('unrelated');
  });
});

describe('getRecommendations — household + goal nudges', () => {
  it('boosts programs whose who_it_helps matches the household type', () => {
    const matching = program({
      id: 'match',
      who_it_helps: ['single_adult'],
      priority_score: 50,
    });
    const nonMatching = program({
      id: 'no-match',
      who_it_helps: ['family'],
      priority_score: 50,
    });
    const result = getRecommendations(
      HOMELESS_INTAKE,
      [matching, nonMatching],
      RULES,
    );
    expect(result.recommendations[0].program.id).toBe('match');
  });

  it('boosts long-term housing waitlists when the goal is long_term_housing', () => {
    const intake: IntakeState = {
      ...HOMELESS_INTAKE,
      situation: 'at_risk',
      goal: 'long_term_housing',
    };
    const programs: Program[] = [
      program({ id: 'wait', category: 'long_term_housing_waitlist', priority_score: 50 }),
      program({ id: 'rent', category: 'rental_assistance', priority_score: 80 }),
    ];
    const result = getRecommendations(intake, programs, RULES);
    expect(result.recommendations[0].program.id).toBe('wait');
  });
});

describe('getRecommendations — urgentHelp', () => {
  it('boosts open emergency_shelter programs above otherwise-equal closed ones', () => {
    const intake: IntakeState = { ...HOMELESS_INTAKE, urgentHelp: true };
    const open = program({ id: 'open', status: 'open', priority_score: 50 });
    const closed = program({ id: 'closed', status: 'closed', priority_score: 80 });
    const result = getRecommendations(intake, [open, closed], RULES);
    expect(result.recommendations[0].program.id).toBe('open');
  });

  it('penalises closed and waitlist programs more aggressively when urgent', () => {
    const intake: IntakeState = { ...HOMELESS_INTAKE, urgentHelp: true };
    const wait = program({ id: 'wait', status: 'waitlist', priority_score: 100 });
    const open = program({ id: 'open', status: 'open', priority_score: 60 });
    const result = getRecommendations(intake, [wait, open], RULES);
    expect(result.recommendations[0].program.id).toBe('open');
  });

  it('does not penalise non-urgent intakes the same way', () => {
    const open = program({ id: 'open', status: 'open', priority_score: 60 });
    const wait = program({ id: 'wait', status: 'waitlist', priority_score: 100 });
    const nonUrgent = getRecommendations(
      { ...HOMELESS_INTAKE, urgentHelp: false },
      [open, wait],
      RULES,
    );
    expect(nonUrgent.recommendations[0].program.id).toBe('wait');
  });
});

describe('getRecommendations — status penalties', () => {
  it('penalises unknown status more than closed', () => {
    const unknown = program({ id: 'unknown', status: 'unknown', priority_score: 100 });
    const closed = program({ id: 'closed', status: 'closed', priority_score: 100 });
    const result = getRecommendations(HOMELESS_INTAKE, [unknown, closed], RULES);
    expect(result.recommendations[0].program.id).toBe('closed');
  });
});
