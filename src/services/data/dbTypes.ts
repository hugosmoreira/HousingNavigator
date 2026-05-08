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
  County,
  Goal,
  HouseholdType,
  IntakeSituation,
  ProgramCategory,
  ProgramStatus,
  StatusConfidence,
  WaitlistStatus,
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
  county: County;
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
  county: County;
  status: WaitlistStatus;
  application_link: string | null;
  source_url: string | null;
  last_checked: string | null;
  notes: string | null;
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
