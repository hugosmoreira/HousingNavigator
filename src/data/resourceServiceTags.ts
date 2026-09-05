import type { ResourceServiceTag } from '../types';

export const RESOURCE_SERVICE_TAGS: ResourceServiceTag[] = [
  'financial_education',
  'internet_assistance',
  'health_support',
  'moving_help',
  'move_in_costs',
  'furniture',
  'utility_help',
];

export const RESOURCE_SERVICE_LABELS: Record<ResourceServiceTag, string> = {
  financial_education: 'Financial education',
  internet_assistance: 'Internet assistance',
  health_support: 'Health support',
  moving_help: 'Moving help',
  move_in_costs: 'Move-in costs',
  furniture: 'Furniture',
  utility_help: 'Utility help',
};

/** Old snapshots and unknown values must not break public or admin pages. */
export function normalizeResourceServiceTags(value: unknown): ResourceServiceTag[] {
  if (!Array.isArray(value)) return [];
  return RESOURCE_SERVICE_TAGS.filter((tag) => value.includes(tag));
}

export function resourceServiceLabels(value: unknown): string[] {
  return normalizeResourceServiceTags(value).map((tag) => RESOURCE_SERVICE_LABELS[tag]);
}
