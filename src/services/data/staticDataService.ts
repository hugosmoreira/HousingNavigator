/**
 * Static (bundled-JSON) implementation of `DataService`.
 *
 * Reads the merged `src/data/catalog.json` produced by
 * `scripts/mergeCatalog.ts`. The merge step runs as `predev` and
 * `prebuild` so the catalog is always fresh.
 *
 * `programs.json` is intentionally kept as a fallback so a brand-new
 * clone (before `npm run catalog:build` has been executed) still
 * serves data instead of crashing.
 *
 * Returns resolved promises so call sites are written as if data is
 * always async — that way we can swap in `supabaseDataService` later
 * without touching pages.
 */

import catalogData from '../../data/catalog.json';
import fallbackPrograms from '../../data/programs.json';
import rulesData from '../../data/decisionRules.json';
import waitlistsData from '../../data/waitlists.json';
import { legacyToDirectoryCategory } from '../../data/categoryMap';
import type { DecisionRule, Program, WaitlistEntry } from '../../types';
import type { DataService } from './types';

const RAW_CATALOG = catalogData as unknown as Program[];
const FALLBACK = fallbackPrograms as unknown as Program[];

function ensureDirectoryCategory(programs: Program[]): Program[] {
  return programs.map((p) =>
    p.directory_category
      ? p
      : {
          ...p,
          directory_category: legacyToDirectoryCategory(p.category),
          raw_category: p.raw_category ?? p.category,
        },
  );
}

export const STATIC_PROGRAMS = ensureDirectoryCategory(
  Array.isArray(RAW_CATALOG) && RAW_CATALOG.length > 0 ? RAW_CATALOG : FALLBACK,
);
const RULES = rulesData as unknown as DecisionRule[];
export const STATIC_WAITLISTS = waitlistsData as unknown as WaitlistEntry[];

export const staticDataService: DataService = {
  async getPrograms() {
    return STATIC_PROGRAMS;
  },
  async getDecisionRules() {
    return RULES;
  },
  async getWaitlists() {
    return STATIC_WAITLISTS;
  },
};
