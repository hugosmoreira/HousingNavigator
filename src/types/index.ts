/**
 * Canonical domain types for Housing Navigator.
 *
 * These are the shapes used by the recommendation engine and the UI layer
 * once intake answers have been mapped from raw button labels into
 * stable, serializable enums.
 */

export type County = 'Multnomah' | 'Clark' | 'Washington' | 'Clackamas' | 'Other';

export type IntakeSituation = 'homeless' | 'eviction_notice' | 'at_risk';

export type Goal = 'shelter' | 'stay_housed' | 'long_term_housing';

export type HouseholdType =
  | 'single_adult'
  | 'family'
  | 'senior'
  | 'veteran'
  | 'disability';

export type ProgramCategory =
  | 'emergency_shelter'
  | 'transitional_housing'
  | 'rental_assistance'
  | 'legal_aid'
  | 'long_term_housing_waitlist'
  | 'eviction_prevention'
  | 'comprehensive_support';

/**
 * Directory taxonomy used by the public Resource Directory.
 *
 * Aligned to the nine resource types in the product spec. Distinct from
 * the legacy `ProgramCategory` (which the deterministic recommendation
 * engine still consumes) so the directory can evolve independently.
 *
 * `categoryMap.ts` translates raw CSV strings and legacy `ProgramCategory`
 * values into one of these.
 */
export type DirectoryCategory =
  | 'rent_assistance'
  | 'eviction_prevention'
  | 'emergency_shelter'
  | 'outreach'
  | 'rapid_rehousing'
  | 'public_housing'
  | 'section8_waitlist'
  | 'legal_aid'
  | 'supportive_services';

export type ApplicationMethod = 'walk_in' | 'phone' | 'online' | 'referral';

export type ProgramStatus = 'open' | 'limited' | 'waitlist' | 'closed' | 'unknown';

export type StatusConfidence = 'high' | 'medium' | 'low';

export type WaitlistStatus = 'open' | 'closed' | 'unknown';

export interface IntakeState {
  county: County | null;
  situation: IntakeSituation | null;
  /** Always populated alongside `situation` via `intakeMapping`; never null once the intake is submitted. */
  goal: Goal | null;
  householdType: HouseholdType | null;
  urgentHelp: boolean;
}

export interface Program {
  id: string;
  program_name: string;
  county: County;
  category: ProgramCategory;
  who_it_helps: HouseholdType[];
  application_method: ApplicationMethod;
  referral_required: boolean;
  phone: string;
  website: string;
  status: ProgramStatus;
  status_confidence: StatusConfidence;
  priority_score: number;
  notes: string;
  last_verified: string;
  /** Optional fields populated as the catalog is enriched (Supabase parity). */
  description?: string;
  eligibility_summary?: string;
  city?: string;
  state?: string;
  address?: string;
  source_url?: string;
  source_type?: string;
  /** Directory-facing taxonomy (set by the merge pipeline). */
  directory_category?: DirectoryCategory;
  /** Free-text category from the source dataset, kept for transparency / search. */
  raw_category?: string;
}

export interface DecisionRule {
  intake_state: IntakeSituation;
  goal: Goal;
  primary_action: string;
  priority_categories: ProgramCategory[];
  secondary_categories: ProgramCategory[];
  caution_notes: string[];
  recommended_documents: string[];
}

export interface Recommendation {
  program: Program;
  score: number;
  matchedCategory: 'primary' | 'secondary' | 'none';
}

export interface RecommendationResult {
  rule: DecisionRule;
  recommendations: Recommendation[];
  secondaryRecommendations: Recommendation[];
}

export interface WaitlistEntry {
  id: string;
  agency: string;
  county: County;
  status: WaitlistStatus;
  last_checked: string;
  website: string;
  notes?: string;
  /** Optional fields populated as the catalog is enriched (Supabase parity). */
  housing_authority?: string;
  program_name?: string;
  application_link?: string;
  source_url?: string;
}
