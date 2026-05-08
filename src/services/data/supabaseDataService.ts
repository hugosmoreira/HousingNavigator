/**
 * Supabase implementation of `DataService` — *scaffold only*.
 *
 * Intentionally not wired yet:
 *   - `@supabase/supabase-js` is not a runtime dependency
 *   - no live URL or anon key is shipped in the repo
 *
 * To activate later:
 *   1. `npm install @supabase/supabase-js`
 *   2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`
 *   3. Uncomment the implementation below
 *   4. Switch the export in `./index.ts` from `staticDataService` to
 *      `supabaseDataService`
 *
 * Mappers in `./mappers.ts` are already wired so DB rows translate to
 * the UI-facing `Program` / `WaitlistEntry` types without UI changes.
 */

import {
  decisionRuleFromRow,
  programFromRow,
  waitlistFromRow,
} from './mappers';
import type {
  DecisionRuleRow,
  ProgramRow,
  WaitlistRow,
} from './dbTypes';
import type { DataService } from './types';

// import { createClient, type SupabaseClient } from '@supabase/supabase-js';
//
// const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// const client: SupabaseClient | null =
//   url && anonKey ? createClient(url, anonKey) : null;

export const supabaseDataService: DataService = {
  async getPrograms() {
    throw new Error('supabaseDataService is not configured yet');
    // if (!client) throw new Error('Supabase client not initialised');
    // const { data, error } = await client.from('programs').select('*');
    // if (error) throw error;
    // return (data as ProgramRow[]).map(programFromRow);
  },
  async getDecisionRules() {
    throw new Error('supabaseDataService is not configured yet');
    // if (!client) throw new Error('Supabase client not initialised');
    // const { data, error } = await client.from('decision_rules').select('*');
    // if (error) throw error;
    // return (data as DecisionRuleRow[]).map(decisionRuleFromRow);
  },
  async getWaitlists() {
    throw new Error('supabaseDataService is not configured yet');
    // if (!client) throw new Error('Supabase client not initialised');
    // const { data, error } = await client.from('waitlists').select('*');
    // if (error) throw error;
    // return (data as WaitlistRow[]).map(waitlistFromRow);
  },
};

// Reference imports so the file type-checks even while the implementation
// is commented out. Safe to remove once the live client is wired.
void programFromRow;
void decisionRuleFromRow;
void waitlistFromRow;
export type { ProgramRow, DecisionRuleRow, WaitlistRow };
