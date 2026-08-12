import type {
  AffordablePropertyType,
  BedroomType,
  PropertyAudience,
  WaitlistType,
} from '../types';

export const AFFORDABLE_PROPERTY_TYPES: AffordablePropertyType[] = [
  'affordable_apartments',
  'public_housing',
  'project_based_section8',
  'tax_credit',
  'senior_housing',
  'supportive_housing',
  'mixed',
];

export const AFFORDABLE_PROPERTY_TYPE_LABELS: Record<AffordablePropertyType, string> = {
  affordable_apartments: 'Affordable apartments',
  public_housing: 'Public housing',
  project_based_section8: 'Project-based Section 8',
  tax_credit: 'Income-restricted / tax credit',
  senior_housing: 'Senior housing',
  supportive_housing: 'Supportive housing',
  mixed: 'Mixed affordable housing',
};

export const BEDROOM_TYPES: BedroomType[] = ['studio', 'sro', '1', '2', '3', '4_plus'];

export const BEDROOM_LABELS: Record<BedroomType, string> = {
  studio: 'Studio',
  sro: 'SRO',
  '1': '1 bedroom',
  '2': '2 bedrooms',
  '3': '3 bedrooms',
  '4_plus': '4+ bedrooms',
};

export const PROPERTY_AUDIENCES: PropertyAudience[] = [
  'general',
  'families',
  'seniors',
  'veterans',
  'disabilities',
  'farmworkers',
  'formerly_homeless',
  'recovery',
];

export const PROPERTY_AUDIENCE_LABELS: Record<PropertyAudience, string> = {
  general: 'General eligibility',
  families: 'Families',
  seniors: 'Seniors',
  veterans: 'Veterans',
  disabilities: 'People with disabilities',
  farmworkers: 'Farmworkers',
  formerly_homeless: 'People exiting homelessness',
  recovery: 'People in recovery',
};

export const WAITLIST_TYPES: WaitlistType[] = [
  'affordable_property',
  'housing_choice_voucher',
  'public_housing',
  'mixed',
  'other',
];

export const WAITLIST_TYPE_LABELS: Record<WaitlistType, string> = {
  affordable_property: 'Apartment/property',
  housing_choice_voucher: 'Housing Choice Voucher',
  public_housing: 'Public or subsidized housing',
  mixed: 'Mixed housing programs',
  other: 'Other waitlist',
};

export const AMI_LEVELS = [20, 30, 40, 50, 60, 70, 80, 100] as const;
