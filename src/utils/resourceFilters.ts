import { legacyToDirectoryCategory } from '../data/categoryMap';
import { normalizeResourceServiceTags } from '../data/resourceServiceTags';
import { programServesArea } from '../data/serviceAreas';
import type { DirectoryCategory, HouseholdType, Program, ResourceServiceTag, SupportedState } from '../types';

export interface ResourceFilters {
  categories: DirectoryCategory[];
  serviceTags: ResourceServiceTag[];
  household: HouseholdType | null;
  state: SupportedState | 'All';
  county: string;
}

/** OR within each group, AND between groups. Never infer a service from prose. */
export function matchesResourceFilters(program: Program, filters: ResourceFilters): boolean {
  const category = program.directory_category ?? legacyToDirectoryCategory(program.category);
  if (filters.categories.length && !filters.categories.includes(category)) return false;
  const tags = normalizeResourceServiceTags(program.service_tags);
  if (filters.serviceTags.length && !filters.serviceTags.some((tag) => tags.includes(tag))) return false;
  if (filters.household && !program.who_it_helps.includes(filters.household)) return false;
  return filters.state === 'All' || programServesArea(
    program, filters.state, filters.county === 'All' ? null : filters.county,
  );
}
