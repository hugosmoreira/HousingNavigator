/**
 * Database row types — mirror the Supabase schema in
 * `supabase/migrations/0001_init.sql`. These are intentionally separate
 * from the UI-facing types in `src/types/index.ts` so the wire format
 * can evolve independently of components.
 *
 * Mappers in `./mappers.ts` translate between the two shapes.
 */

import type {
  ApplicationMethod,
  AffordablePropertyType,
  BedroomType,
  County,
  Goal,
  HouseholdType,
  IntakeSituation,
  ProgramCategory,
  ProgramStatus,
  PropertyAudience,
  ResourceServiceTag,
  ServiceArea,
  StatusConfidence,
  WaitlistStatus,
  WaitlistType,
} from '../../types';

export type SourceType =
  | 'manual_entry'
  | 'agency_website'
  | 'email'
  | 'social_post'
  | 'pasted_text';

export type VerificationStatus =
  | 'pending'
  | 'in_review'
  | 'verified'
  | 'rejected';

export interface ProgramRow {
  id: string;
  name: string;
  category: ProgramCategory;
  county: string;
  city: string | null;
  state: string | null;
  description: string | null;
  who_it_helps: HouseholdType[];
  eligibility_summary: string | null;
  application_method: ApplicationMethod;
  referral_required: boolean;
  phone: string | null;
  website: string | null;
  address: string | null;
  status: ProgramStatus;
  status_confidence: StatusConfidence;
  source_url: string | null;
  source_type: SourceType | null;
  last_verified: string | null;
  notes: string | null;
  priority_score: number;
}

export interface DecisionRuleRow {
  id?: string;
  intake_state: IntakeSituation;
  goal: Goal;
  primary_action: string;
  priority_categories: ProgramCategory[];
  secondary_categories: ProgramCategory[];
  recommended_documents: string[];
  caution_notes: string[];
}

export interface WaitlistRow {
  id: string;
  housing_authority: string;
  program_name: string | null;
  county: string;
  city: string | null;
  state: string | null;
  status: WaitlistStatus;
  application_link: string | null;
  source_url: string | null;
  last_checked: string | null;
  notes: string | null;
  public_notes: string | null;
  internal_notes: string | null;
  published: boolean;
  /**
   * Only present on `waitlists_public` (migration 0011): most recent
   * transition to `open` from `waitlist_status_history`. Null until the
   * waitlist reopens at least once after history recording began.
   */
  last_opened_at?: string | null;
  /**
   * Automation columns (migration 0012). Present on the base table and
   * `waitlists_admin`, never on the public views.
   */
  auto_check_enabled?: boolean;
  check_failures?: number;
  last_auto_check_at?: string | null;
  waitlist_type?: WaitlistType;
  affordable_property_id?: string | null;
}

export interface AffordablePropertyRow {
  id: string;
  name: string;
  owner_organization: string | null;
  management_company: string | null;
  property_type: AffordablePropertyType;
  address: string | null;
  city: string;
  county: string;
  state: 'OR' | 'WA';
  postal_code: string | null;
  description: string | null;
  eligibility_summary: string | null;
  ami_levels: number[];
  bedroom_types: BedroomType[];
  audiences: PropertyAudience[];
  total_units: number | null;
  accessibility_notes: string | null;
  phone: string | null;
  website: string | null;
  application_url: string | null;
  source_url: string | null;
  source_type: string | null;
  last_verified: string | null;
  public_notes: string | null;
  internal_notes: string | null;
  priority_score: number;
  published: boolean;
  created_at?: string;
  updated_at?: string;
  waitlist_id?: string | null;
  waitlist_status?: WaitlistStatus | null;
  waitlist_last_checked?: string | null;
  waitlist_application_link?: string | null;
  linked_waitlist_id?: string | null;
}

/**
 * `resources` is the canonical catalog table introduced by migration
 * 0002. The legacy `programs` table from 0001 is kept around for the
 * existing seed pipeline but is not read by the app.
 */
export interface ResourceRow {
  cost_details?: string | null;
  id: string;
  name: string;
  category: string;
  county: string;
  city: string | null;
  state: string | null;
  description: string | null;
  who_qualifies: string | null;
  who_it_helps: HouseholdType[];
  application_method: ApplicationMethod;
  referral_required: boolean;
  phone: string | null;
  website: string | null;
  address: string | null;
  source_url: string | null;
  source_type: string | null;
  last_verified: string | null;
  public_notes: string | null;
  internal_notes: string | null;
  priority_score: number;
  published: boolean;
  created_at?: string;
  updated_at?: string;
  /** Aggregated by resources_public/resources_admin in migration 0019. */
  service_areas?: ServiceArea[];
  /** Optional for compatibility with snapshots created before migration 0024. */
  service_tags?: ResourceServiceTag[];
}

export interface ResourceSubmissionRow {
  id?: string;
  source_text: string | null;
  source_url: string | null;
  source_type: SourceType | null;
  extracted_title: string | null;
  extracted_category: ProgramCategory | null;
  extracted_summary: string | null;
  confidence_score: number | null;
  verification_status: VerificationStatus;
}
