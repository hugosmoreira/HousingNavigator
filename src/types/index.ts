/**
 * Canonical domain types for Housing Navigator.
 *
 * These are the shapes used by the recommendation engine and the UI layer
 * once intake answers have been mapped from raw button labels into
 * stable, serializable enums.
 */

export type County = 'Multnomah' | 'Clark' | 'Washington' | 'Clackamas' | 'Other';

export type SupportedState = 'OR' | 'WA';

/** A null county means the resource serves the entire state. */
export interface ServiceArea {
  state: SupportedState;
  county: string | null;
}

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

export type WaitlistStatus = 'open' | 'closed' | 'limited' | 'unknown';

export type WaitlistType =
  | 'affordable_property'
  | 'housing_choice_voucher'
  | 'public_housing'
  | 'mixed'
  | 'other';

export type AffordablePropertyType =
  | 'affordable_apartments'
  | 'public_housing'
  | 'project_based_section8'
  | 'tax_credit'
  | 'senior_housing'
  | 'supportive_housing'
  | 'mixed';

export type BedroomType = 'studio' | 'sro' | '1' | '2' | '3' | '4_plus';

export type PropertyAudience =
  | 'general'
  | 'families'
  | 'seniors'
  | 'veterans'
  | 'disabilities'
  | 'farmworkers'
  | 'formerly_homeless'
  | 'recovery';

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
  /** Stable catalog identity used in public URLs when the backing row has a database UUID. */
  route_id?: string;
  program_name: string;
  /** Primary compatibility county. Use service_areas for coverage decisions. */
  county: string;
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
  /** Counties actually served; a null county represents statewide coverage. */
  service_areas?: ServiceArea[];
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
  /** Stable catalog identity used in public URLs when the backing row has a database UUID. */
  route_id?: string;
  agency: string;
  county: string;
  status: WaitlistStatus;
  last_checked: string;
  website: string;
  notes?: string;
  /** Optional fields populated as the catalog is enriched (Supabase parity). */
  housing_authority?: string;
  program_name?: string;
  application_link?: string;
  source_url?: string;
  /** ISO timestamp of the most recent transition to `open`, when known. */
  last_opened_at?: string;
  waitlist_type?: WaitlistType;
  affordable_property_id?: string;
}

/** A physical apartment property, separate from services and waitlists. */
export interface AffordableProperty {
  id: string;
  route_id?: string;
  name: string;
  owner_organization?: string;
  management_company?: string;
  property_type: AffordablePropertyType;
  address?: string;
  city: string;
  county: string;
  state: SupportedState;
  postal_code?: string;
  description?: string;
  eligibility_summary?: string;
  ami_levels: number[];
  bedroom_types: BedroomType[];
  audiences: PropertyAudience[];
  total_units?: number;
  accessibility_notes?: string;
  phone?: string;
  website?: string;
  application_url?: string;
  source_url?: string;
  source_type?: string;
  last_verified: string;
  public_notes?: string;
  priority_score: number;
  waitlist_id?: string;
  waitlist_status?: WaitlistStatus;
  waitlist_last_checked?: string;
  waitlist_application_link?: string;
}
