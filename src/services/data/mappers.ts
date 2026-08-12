/**
 * Bidirectional mappers between Supabase row types (`./dbTypes`) and the
 * UI-facing types in `src/types/index.ts`.
 *
 * Pages keep using the existing `Program` / `WaitlistEntry` shape; only
 * the data service layer touches `*Row` shapes. Swapping the static
 * adapter for a Supabase adapter therefore does not ripple into JSX.
 */

import type {
  AffordableProperty,
  DecisionRule,
  DirectoryCategory,
  Program,
  ProgramCategory,
  WaitlistEntry,
} from '../../types';
import {
  DIRECTORY_CATEGORIES,
  legacyToDirectoryCategory,
} from '../../data/categoryMap';
import { normalizeServiceAreas } from '../../data/serviceAreas';
import type {
  AffordablePropertyRow,
  DecisionRuleRow,
  ProgramRow,
  ResourceRow,
  WaitlistRow,
} from './dbTypes';

const DIRECTORY_TO_LEGACY: Record<DirectoryCategory, ProgramCategory> = {
  rent_assistance: 'rental_assistance',
  eviction_prevention: 'eviction_prevention',
  emergency_shelter: 'emergency_shelter',
  outreach: 'comprehensive_support',
  rapid_rehousing: 'transitional_housing',
  public_housing: 'long_term_housing_waitlist',
  section8_waitlist: 'long_term_housing_waitlist',
  legal_aid: 'legal_aid',
  supportive_services: 'comprehensive_support',
};

function isDirectoryCategory(value: string): value is DirectoryCategory {
  return (DIRECTORY_CATEGORIES as readonly string[]).includes(value);
}

export function programFromRow(row: ProgramRow): Program {
  return {
    id: row.id,
    program_name: row.name,
    county: row.county,
    category: row.category,
    who_it_helps: row.who_it_helps,
    application_method: row.application_method,
    referral_required: row.referral_required,
    phone: row.phone ?? '',
    website: row.website ?? '',
    status: row.status,
    status_confidence: row.status_confidence,
    priority_score: row.priority_score,
    notes: row.notes ?? '',
    last_verified: row.last_verified ?? '',
    description: row.description ?? undefined,
    eligibility_summary: row.eligibility_summary ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    address: row.address ?? undefined,
    source_url: row.source_url ?? undefined,
    source_type: row.source_type ?? undefined,
    service_areas: normalizeServiceAreas(undefined, {
      state: row.state,
      county: row.county,
    }),
  };
}

export function programToRow(program: Program): ProgramRow {
  return {
    id: program.id,
    name: program.program_name,
    category: program.category,
    county: program.county,
    city: program.city ?? null,
    state: program.state ?? null,
    description: program.description ?? null,
    who_it_helps: program.who_it_helps,
    eligibility_summary: program.eligibility_summary ?? null,
    application_method: program.application_method,
    referral_required: program.referral_required,
    phone: program.phone || null,
    website: program.website || null,
    address: program.address ?? null,
    status: program.status,
    status_confidence: program.status_confidence,
    source_url: program.source_url ?? null,
    source_type: (program.source_type ?? null) as ProgramRow['source_type'],
    last_verified: program.last_verified || null,
    notes: program.notes || null,
    priority_score: program.priority_score,
  };
}

export function decisionRuleFromRow(row: DecisionRuleRow): DecisionRule {
  return {
    intake_state: row.intake_state,
    goal: row.goal,
    primary_action: row.primary_action,
    priority_categories: row.priority_categories,
    secondary_categories: row.secondary_categories,
    recommended_documents: row.recommended_documents,
    caution_notes: row.caution_notes,
  };
}

export function waitlistFromRow(row: WaitlistRow): WaitlistEntry {
  const agency = row.program_name
    ? `${row.housing_authority} — ${row.program_name}`
    : row.housing_authority;
  return {
    id: row.id,
    agency,
    county: row.county,
    status: row.status,
    last_checked: row.last_checked ?? '',
    website: row.application_link ?? row.source_url ?? '',
    notes: row.public_notes ?? row.notes ?? undefined,
    housing_authority: row.housing_authority,
    program_name: row.program_name ?? undefined,
    application_link: row.application_link ?? undefined,
    source_url: row.source_url ?? undefined,
    last_opened_at: row.last_opened_at ?? undefined,
    waitlist_type: row.waitlist_type ?? 'other',
    affordable_property_id: row.affordable_property_id ?? undefined,
  };
}

export function affordablePropertyFromRow(
  row: AffordablePropertyRow,
): AffordableProperty {
  return {
    id: row.id,
    name: row.name,
    owner_organization: row.owner_organization ?? undefined,
    management_company: row.management_company ?? undefined,
    property_type: row.property_type,
    address: row.address ?? undefined,
    city: row.city,
    county: row.county,
    state: row.state,
    postal_code: row.postal_code ?? undefined,
    description: row.description ?? undefined,
    eligibility_summary: row.eligibility_summary ?? undefined,
    ami_levels: row.ami_levels ?? [],
    bedroom_types: row.bedroom_types ?? [],
    audiences: row.audiences ?? [],
    total_units: row.total_units ?? undefined,
    accessibility_notes: row.accessibility_notes ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    application_url: row.application_url ?? undefined,
    source_url: row.source_url ?? undefined,
    source_type: row.source_type ?? undefined,
    last_verified: row.last_verified ?? '',
    public_notes: row.public_notes ?? undefined,
    priority_score: row.priority_score,
    waitlist_id: row.waitlist_id ?? undefined,
    waitlist_status: row.waitlist_status ?? undefined,
    waitlist_last_checked: row.waitlist_last_checked ?? undefined,
    waitlist_application_link: row.waitlist_application_link ?? undefined,
  };
}

/**
 * Translate a `resources` row (admin CMS shape) into the UI `Program`
 * type so the existing Resources / Results pages keep working without
 * changes. The `category` column on `resources` stores a directory
 * taxonomy value; the legacy `Program.category` is back-derived for the
 * deterministic recommendation engine.
 *
 * Public availability is intentionally collapsed to `unknown` /
 * confidence `low` — the directory does not surface live status.
 */
export function programFromResourceRow(row: ResourceRow): Program {
  const directory: DirectoryCategory = isDirectoryCategory(row.category)
    ? row.category
    : legacyToDirectoryCategory(row.category as ProgramCategory) ?? 'supportive_services';
  const legacy: ProgramCategory = DIRECTORY_TO_LEGACY[directory];
  return {
    id: row.id,
    program_name: row.name,
    county: row.county,
    category: legacy,
    who_it_helps: row.who_it_helps,
    application_method: row.application_method,
    referral_required: row.referral_required,
    phone: row.phone ?? '',
    website: row.website ?? '',
    status: 'unknown',
    status_confidence: 'low',
    priority_score: row.priority_score,
    notes: row.public_notes ?? '',
    last_verified: row.last_verified ?? '',
    description: row.description ?? undefined,
    eligibility_summary: row.who_qualifies ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    address: row.address ?? undefined,
    source_url: row.source_url ?? undefined,
    source_type: row.source_type ?? undefined,
    directory_category: directory,
    raw_category: row.category,
    service_areas: normalizeServiceAreas(row.service_areas, {
      state: row.state,
      county: row.county,
    }),
  };
}
