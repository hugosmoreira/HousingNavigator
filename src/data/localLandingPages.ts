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
  introduction: string;
  checklist: string[];
}

const GENERIC_CHECKLIST = [
  'Confirm that the program serves your current county and household type.',
  'Ask which documents are required before starting an application.',
  'Contact the provider directly because funding and availability can change.',
];

const RENT_CHECKLIST = [
  'Have your lease, rent statement, or move-in estimate available if you have one.',
  'Ask whether the program covers current rent, past-due rent, deposits, or utilities.',
  'Confirm current funding and eligibility with the provider before submitting documents.',
];

const SHELTER_CHECKLIST = [
  'Tell the provider how many adults and children need a place to stay.',
  'Ask about accessibility, pets, transportation, and check-in requirements.',
  'Call before traveling because bed availability and intake hours can change quickly.',
];

const NAVIGATION_CHECKLIST = [
  'Describe the immediate housing problem and any deadline you are facing.',
  'Ask whether an assessment, referral, or coordinated-entry appointment is required.',
  'Write down the contact name, next step, and any documents you were asked to provide.',
];

const WAITLIST_CHECKLIST = [
  'Confirm that the waitlist or application period is currently open.',
  'Use the provider or housing authority website linked from the listing.',
  'Keep confirmation numbers and update the provider if your contact information changes.',
];

export const LOCAL_LANDING_PAGES: LocalLandingPage[] = [
  {
    path: '/housing-help/multnomah-county',
    county: 'Multnomah',
    stateName: 'Oregon',
    title: 'Housing help in Multnomah County | Housing Navigator',
    heading: 'Housing help in Multnomah County',
    description:
      'Compare verified rent help, shelter, affordable housing, and navigation programs serving Multnomah County, Oregon.',
    introduction:
      'Compare housing programs serving Multnomah County, including rent help, emergency shelter, affordable-housing pathways, and navigation support. Each listing shows contact options and when Housing Navigator last verified it.',
    checklist: GENERIC_CHECKLIST,
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
      'Find verified Multnomah County programs for rent, deposits, utilities, and move-in costs, with direct contact information.',
    introduction:
      'These Multnomah County programs may help with current rent, past-due rent, utilities, deposits, or move-in costs. Funding and eligibility can change, so use the details below to contact each provider directly.',
    checklist: RENT_CHECKLIST,
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
    introduction:
      'If you need a place to stay in Multnomah County, start with these emergency and short-term shelter programs. Availability and intake hours can change quickly, so call the provider before traveling whenever possible.',
    checklist: SHELTER_CHECKLIST,
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
    introduction:
      'Start here if you are not sure which housing program fits your situation. These Multnomah County organizations provide navigation, coordinated entry, advocacy, case management, or other support connected to housing stability.',
    checklist: NAVIGATION_CHECKLIST,
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
      'Explore verified affordable housing and Section 8 pathways serving Multnomah County and confirm current application status.',
    introduction:
      'Explore affordable-housing and voucher pathways listed for Multnomah County. A directory listing does not guarantee that applications are open, so confirm current status with the provider and check the Housing Navigator waitlist tracker.',
    checklist: WAITLIST_CHECKLIST,
  },
  {
    path: '/housing-help/clark-county',
    county: 'Clark',
    stateName: 'Washington',
    title: 'Housing help in Clark County, WA | Housing Navigator',
    heading: 'Housing help in Clark County, Washington',
    description:
      'Compare verified rent help, shelter, legal aid, and housing navigation programs serving Clark County and Vancouver, Washington.',
    introduction:
      'Find housing programs serving Clark County and the Vancouver area, including emergency shelter, rent help, legal aid, and housing navigation. Each listing includes direct contact options and its latest Housing Navigator verification date.',
    checklist: GENERIC_CHECKLIST,
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
      'Find verified Clark County rent, utility, and housing-stability assistance with current application and service-area guidance.',
    introduction:
      'These Clark County programs may help with rent, utilities, or short-term housing stability. Some programs accept applications only on specific days or within geographic service areas, and funding can run out quickly. Review each listing and call before traveling or submitting documents.',
    checklist: RENT_CHECKLIST,
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
    introduction:
      'These emergency and short-term shelter programs serve people in Clark County and the Vancouver area. Contact the provider before traveling to confirm current availability, intake hours, and household requirements.',
    checklist: SHELTER_CHECKLIST,
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
    introduction:
      'Use these Clark County programs when you need help identifying the right housing pathway or completing the next step. Services include navigation, coordinated entry, advocacy, case management, and housing-stability support.',
    checklist: NAVIGATION_CHECKLIST,
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

export function serviceLandingPages(
  county: LocalLandingPage['county'],
): LocalLandingPage[] {
  return LOCAL_LANDING_PAGES.filter(
    (page) => page.county === county && Boolean(page.service),
  );
}
