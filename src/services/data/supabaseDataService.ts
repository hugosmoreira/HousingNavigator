/**
 * Supabase-backed implementation of `DataService`.
 *
 * Reads only `published = true` rows — RLS enforces this even if a bug
 * here forgets the filter. `getDecisionRules` still returns the static
 * JSON: rules are not edited from the admin CMS in this phase.
 *
 * Reads go through the `resources_public` / `waitlists_public` views
 * (migration 0007), which expose only public columns — never the
 * admin-only `internal_notes`. The anon role is additionally column-grant
 * restricted at the DB so it cannot select `internal_notes` even via a
 * hand-crafted PostgREST request against the base tables.
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
      .from('resources_public')
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
      .from('waitlists_public')
      .select('*')
      .eq('published', true);
    if (error) throw error;
    return ((data ?? []) as WaitlistRow[]).map(waitlistFromRow);
  },
};
