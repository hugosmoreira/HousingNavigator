/**
 * Supabase-backed implementation of `DataService`.
 *
 * Reads only `published = true` rows — RLS enforces this even if a bug
 * here forgets the filter. `getDecisionRules` still returns the static
 * JSON: rules are not edited from the admin CMS in this phase.
 *
 * Activated by setting `VITE_USE_SUPABASE=true` along with
 * `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. See
 * `services/data/index.ts` for the env-gated switch.
 */

import rulesData from '../../data/decisionRules.json';
import { requireSupabase } from '../../lib/supabaseClient';
import {
  programFromResourceRow,
  waitlistFromRow,
} from './mappers';
import type { ResourceRow, WaitlistRow } from './dbTypes';
import type { DataService } from './types';
import type { DecisionRule } from '../../types';

const RULES = rulesData as unknown as DecisionRule[];

export const supabaseDataService: DataService = {
  async getPrograms() {
    const client = requireSupabase();
    const { data, error } = await client
      .from('resources')
      .select('*')
      .eq('published', true);
    if (error) throw error;
    return ((data ?? []) as ResourceRow[]).map(programFromResourceRow);
  },

  async getDecisionRules() {
    return RULES;
  },

  async getWaitlists() {
    const client = requireSupabase();
    const { data, error } = await client
      .from('waitlists')
      .select('*')
      .eq('published', true);
    if (error) throw error;
    return ((data ?? []) as WaitlistRow[]).map(waitlistFromRow);
  },
};
