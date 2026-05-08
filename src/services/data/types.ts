/**
 * Data access contract for Housing Navigator.
 *
 * The static implementation in `./staticDataService` reads from bundled
 * JSON; the future Supabase implementation in `./supabaseDataService`
 * will hit the tables defined in `supabase/migrations/0001_init.sql`.
 *
 * All methods are async by design so the call sites do not have to
 * change when we swap adapters.
 */

import type { DecisionRule, Program, WaitlistEntry } from '../../types';

export interface DataService {
  getPrograms(): Promise<Program[]>;
  getDecisionRules(): Promise<DecisionRule[]>;
  getWaitlists(): Promise<WaitlistEntry[]>;
}
