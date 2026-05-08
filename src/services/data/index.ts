/**
 * Single entry point for application data.
 *
 * Pages import `dataService` from here and never reach into `src/data`
 * or Supabase directly. The active adapter is picked at module load:
 *
 *   - `VITE_USE_SUPABASE=true` + Supabase env vars → `supabaseDataService`
 *   - otherwise (default)                          → `staticDataService`
 *
 * Defaulting to static keeps fresh clones working without secrets.
 */

import { isSupabaseConfigured } from '../../lib/supabaseClient';
import { staticDataService } from './staticDataService';
import { supabaseDataService } from './supabaseDataService';
import type { DataService } from './types';

const useSupabase =
  (import.meta.env.VITE_USE_SUPABASE as string | undefined) === 'true' &&
  isSupabaseConfigured();

export const dataService: DataService = useSupabase
  ? supabaseDataService
  : staticDataService;

export type { DataService } from './types';
