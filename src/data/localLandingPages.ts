import { legacyToDirectoryCategory } from './categoryMap';
import { programServesArea } from './serviceAreas';
import type { County, DirectoryCategory, Program } from '../types';

export interface LocalLandingPage {
  path: string;
  county: Extract<County, 'Multnomah' | 'Clark'>;
  stateName: 'Oregon' | 'Washington';
  service?: DirectoryCategory;
  serviceLabel?: string;
  title: string;
  heading: string;
  description: string;
}

export const LOCAL_LANDING_PAGES: LocalLandingPage[] = [
  {
    path: '/housing-help/multnomah-county',
    county: 'Multnomah',
    stateName: 'Oregon',
    title: 'Housing help in Multnomah County | Housing Navigator',
    heading: 'Housing help in Multnomah County',
    description:
      'Compare rent help, shelter, affordable housing, and navigation programs serving Multnomah County, Oregon.',
  },
  {
    path: '/housing-help/multnomah-county/rent-assistance',
    county: 'Multnomah',
    stateName: 'Oregon',
    service: 'rent_assistance',
    serviceLabel: 'Rent assistance',
    title: 'Rent assistance in Multnomah County | Housing Navigator',
    heading: 'Rent assistance in Multnomah County',
    description:
      'Find Multnomah County programs for rent, deposits, utilities, and move-in costs, with direct contact information.',
  },
  {
    path: '/housing-help/multnomah-county/emergency-shelter',
    county: 'Multnomah',
    stateName: 'Oregon',
    service: 'emergency_shelter',
    serviceLabel: 'Emergency shelter',
    title: 'Emergency shelter in Multnomah County | Housing Navigator',
    heading: 'Emergency shelter in Multnomah County',
    description:
      'Find emergency and short-term shelter programs serving Multnomah County, with intake details and direct contact options.',
  },
  {
    path: '/housing-help/multnomah-county/housing-navigation',
    county: 'Multnomah',
    stateName: 'Oregon',
    service: 'supportive_services',
    serviceLabel: 'Housing navigation and support',
    title: 'Housing navigation in Multnomah County | Housing Navigator',
    heading: 'Housing navigation in Multnomah County',
    description:
      'Find Multnomah County housing navigation, coordinated entry, advocacy, and supportive-service programs.',
  },
  {
    path: '/housing-help/multnomah-county/affordable-housing',
    county: 'Multnomah',
    stateName: 'Oregon',
    service: 'public_housing',
    serviceLabel: 'Affordable housing and Section 8',
    title: 'Affordable housing in Multnomah County | Housing Navigator',
    heading: 'Affordable housing in Multnomah County',
    description:
      'Explore affordable housing and Section 8 pathways serving Multnomah County and confirm current application status.',
  },
  {
    path: '/housing-help/clark-county',
    county: 'Clark',
    stateName: 'Washington',
    title: 'Housing help in Clark County, WA | Housing Navigator',
    heading: 'Housing help in Clark County, Washington',
    description:
      'Compare rent help, shelter, legal aid, and housing navigation programs serving Clark County and Vancouver, Washington.',
  },
  {
    path: '/housing-help/clark-county/rent-assistance',
    county: 'Clark',
    stateName: 'Washington',
    service: 'rent_assistance',
    serviceLabel: 'Rent assistance',
    title: 'Rent assistance in Clark County, WA | Housing Navigator',
    heading: 'Rent assistance in Clark County, Washington',
    description:
      'Find Clark County rent, utility, and housing-stability assistance with current application and service-area guidance.',
  },
  {
    path: '/housing-help/clark-county/emergency-shelter',
    county: 'Clark',
    stateName: 'Washington',
    service: 'emergency_shelter',
    serviceLabel: 'Emergency shelter',
    title: 'Emergency shelter in Clark County, WA | Housing Navigator',
    heading: 'Emergency shelter in Clark County, Washington',
    description:
      'Find emergency and short-term shelter programs serving Clark County and Vancouver, with direct intake contact information.',
  },
  {
    path: '/housing-help/clark-county/housing-navigation',
    county: 'Clark',
    stateName: 'Washington',
    service: 'supportive_services',
    serviceLabel: 'Housing navigation and support',
    title: 'Housing navigation in Clark County, WA | Housing Navigator',
    heading: 'Housing navigation in Clark County, Washington',
    description:
      'Find Clark County housing navigation, coordinated entry, advocacy, and supportive-service programs serving Vancouver-area households.',
  },
];

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

export function findLocalLandingPage(pathname: string): LocalLandingPage | null {
  const path = normalizePath(pathname);
  return LOCAL_LANDING_PAGES.find((page) => page.path === path) ?? null;
}

export function localLandingPrograms(
  page: LocalLandingPage,
  programs: Program[],
): Program[] {
  return programs
    .filter((program) => {
      const state = page.stateName === 'Oregon' ? 'OR' : 'WA';
      if (!programServesArea(program, state, page.county)) return false;
      if (!page.service) return true;
      const category =
        program.directory_category ?? legacyToDirectoryCategory(program.category);
      return category === page.service;
    })
    .sort((a, b) => {
      if (b.priority_score !== a.priority_score) {
        return b.priority_score - a.priority_score;
      }
      return a.program_name.localeCompare(b.program_name);
    });
}

export function countyLandingPage(county: LocalLandingPage['county']): LocalLandingPage {
  const page = LOCAL_LANDING_PAGES.find(
    (candidate) => candidate.county === county && !candidate.service,
  );
  if (!page) throw new Error(`Missing county landing page for ${county}.`);
  return page;
}
