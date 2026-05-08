/**
 * Translates the raw UI button labels from the Assessment screen into
 * canonical enum values used by the recommendation engine.
 *
 * Keeping this in a dedicated file means the UI layer never needs to
 * know the internal enum shape, and the engine never sees display text.
 */

import type {
  County,
  Goal,
  HouseholdType,
  IntakeSituation,
} from '../types';

/** UI labels exactly as rendered on the Assessment screen. */
export type SituationLabel =
  | 'Homeless'
  | 'Eviction Notice'
  | 'Behind on Rent'
  | 'Need Long-Term Housing';

export type HouseholdLabel =
  | 'Single Adult'
  | 'Family'
  | 'Senior'
  | 'Veteran'
  | 'Disability';

export type CountyLabel = 'Multnomah' | 'Clark' | 'Washington' | 'Clackamas' | 'Other';

interface SituationMapping {
  situation: IntakeSituation;
  goal: Goal;
}

/**
 * Canonical mapping from UI situation button to (situation, goal).
 *
 * This is intentionally exhaustive: every UI label maps to exactly one
 * (situation, goal) pair, and every pair matches a rule in
 * `decisionRules.json`.
 */
export const SITUATION_MAPPING: Record<SituationLabel, SituationMapping> = {
  Homeless: { situation: 'homeless', goal: 'shelter' },
  'Eviction Notice': { situation: 'eviction_notice', goal: 'stay_housed' },
  'Behind on Rent': { situation: 'at_risk', goal: 'stay_housed' },
  'Need Long-Term Housing': { situation: 'at_risk', goal: 'long_term_housing' },
};

export const HOUSEHOLD_MAPPING: Record<HouseholdLabel, HouseholdType> = {
  'Single Adult': 'single_adult',
  Family: 'family',
  Senior: 'senior',
  Veteran: 'veteran',
  Disability: 'disability',
};

export const COUNTY_MAPPING: Record<CountyLabel, County> = {
  Multnomah: 'Multnomah',
  Clark: 'Clark',
  Washington: 'Washington',
  Clackamas: 'Clackamas',
  Other: 'Other',
};

export const SITUATION_LABELS: SituationLabel[] = [
  'Homeless',
  'Eviction Notice',
  'Behind on Rent',
  'Need Long-Term Housing',
];

export const HOUSEHOLD_LABELS: HouseholdLabel[] = [
  'Single Adult',
  'Family',
  'Senior',
  'Veteran',
  'Disability',
];

export const COUNTY_LABELS: CountyLabel[] = [
  'Multnomah',
  'Clark',
  'Washington',
  'Clackamas',
  'Other',
];

export function mapSituation(label: SituationLabel): SituationMapping {
  return SITUATION_MAPPING[label];
}

export function mapHousehold(label: HouseholdLabel): HouseholdType {
  return HOUSEHOLD_MAPPING[label];
}

export function mapCounty(label: CountyLabel): County {
  return COUNTY_MAPPING[label];
}
