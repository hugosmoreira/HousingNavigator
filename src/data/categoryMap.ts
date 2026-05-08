/**
 * Directory category taxonomy + lookup tables.
 *
 * Two normalisation paths feed `DirectoryCategory`:
 *   1. CSV `category` strings (free-text written by data curators) →
 *      `csvToDirectoryCategory(raw)`
 *   2. Legacy `ProgramCategory` enum used by the deterministic engine →
 *      `legacyToDirectoryCategory(legacy)`
 *
 * Add new CSV strings to `CSV_CATEGORY_MAP` rather than to a switch statement
 * so future CSV uploads only need a one-line edit here.
 */

import type { DirectoryCategory, ProgramCategory } from '../types';

export const DIRECTORY_CATEGORIES: DirectoryCategory[] = [
  'rent_assistance',
  'eviction_prevention',
  'emergency_shelter',
  'outreach',
  'rapid_rehousing',
  'public_housing',
  'section8_waitlist',
  'legal_aid',
  'supportive_services',
];

export const DIRECTORY_CATEGORY_LABELS: Record<DirectoryCategory, string> = {
  rent_assistance: 'Rent assistance',
  eviction_prevention: 'Eviction prevention',
  emergency_shelter: 'Emergency shelter',
  outreach: 'Outreach',
  rapid_rehousing: 'Rapid rehousing',
  public_housing: 'Public housing',
  section8_waitlist: 'Section 8 waitlists',
  legal_aid: 'Legal aid',
  supportive_services: 'Supportive services',
};

export const DIRECTORY_CATEGORY_DESCRIPTIONS: Record<DirectoryCategory, string> = {
  rent_assistance: 'Help paying rent, utilities, or move-in costs.',
  eviction_prevention: 'Stay in your home: mediation, back-rent, hardship support.',
  emergency_shelter: 'A bed tonight or short-term shelter.',
  outreach: 'Mobile teams that meet people where they are.',
  rapid_rehousing: 'Short-term subsidies to move quickly into stable housing.',
  public_housing: 'Local housing authority units and affordable properties.',
  section8_waitlist: 'Housing Choice Voucher and other waitlists.',
  legal_aid: 'Free or low-cost lawyers for eviction and tenant issues.',
  supportive_services: 'Wraparound support, case management, navigation help.',
};

const CSV_CATEGORY_MAP: Record<string, DirectoryCategory> = {
  // Direct matches
  'rent assistance': 'rent_assistance',
  'rental assistance': 'rent_assistance',
  'deposit/move-in assistance': 'rent_assistance',
  'deposit assistance': 'rent_assistance',
  'move-in assistance': 'rent_assistance',
  'eviction prevention': 'eviction_prevention',
  'emergency shelter': 'emergency_shelter',
  'family shelter': 'emergency_shelter',
  'youth shelter': 'emergency_shelter',
  'domestic violence shelter': 'emergency_shelter',
  shelter: 'emergency_shelter',
  outreach: 'outreach',
  'outreach teams': 'outreach',
  'street outreach': 'outreach',
  'rapid rehousing': 'rapid_rehousing',
  'rapid re-housing': 'rapid_rehousing',
  'public housing': 'public_housing',
  'affordable housing': 'public_housing',
  'affordable housing waitlists': 'public_housing',
  'section 8': 'section8_waitlist',
  'section 8 waitlist': 'section8_waitlist',
  'section 8 waitlists': 'section8_waitlist',
  'housing choice voucher': 'section8_waitlist',
  voucher: 'section8_waitlist',
  'long-term housing waitlist': 'section8_waitlist',
  'long term housing waitlist': 'section8_waitlist',
  'legal aid': 'legal_aid',
  'tenant legal help': 'legal_aid',
  'tenant rights': 'legal_aid',
  'supportive services': 'supportive_services',
  'comprehensive support': 'supportive_services',
  'transitional housing': 'supportive_services',
  'coordinated entry': 'supportive_services',
  'veteran housing support': 'supportive_services',
  'senior housing support': 'supportive_services',
  'disability housing support': 'supportive_services',
};

const LEGACY_CATEGORY_MAP: Record<ProgramCategory, DirectoryCategory> = {
  emergency_shelter: 'emergency_shelter',
  transitional_housing: 'supportive_services',
  rental_assistance: 'rent_assistance',
  legal_aid: 'legal_aid',
  long_term_housing_waitlist: 'section8_waitlist',
  eviction_prevention: 'eviction_prevention',
  comprehensive_support: 'supportive_services',
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function csvToDirectoryCategory(raw: string): DirectoryCategory {
  const key = normalize(raw);
  if (CSV_CATEGORY_MAP[key]) return CSV_CATEGORY_MAP[key];

  // Loose fallback: substring contains. Prefer the most specific keyword.
  if (key.includes('eviction')) return 'eviction_prevention';
  if (key.includes('legal') || key.includes('tenant')) return 'legal_aid';
  if (key.includes('outreach')) return 'outreach';
  if (key.includes('voucher') || key.includes('section 8')) return 'section8_waitlist';
  if (key.includes('public housing') || key.includes('affordable housing')) {
    return 'public_housing';
  }
  if (key.includes('rapid')) return 'rapid_rehousing';
  if (key.includes('shelter')) return 'emergency_shelter';
  if (key.includes('rent') || key.includes('deposit')) return 'rent_assistance';
  return 'supportive_services';
}

export function legacyToDirectoryCategory(category: ProgramCategory): DirectoryCategory {
  return LEGACY_CATEGORY_MAP[category];
}

export function directoryCategoryLabel(category: DirectoryCategory): string {
  return DIRECTORY_CATEGORY_LABELS[category];
}
