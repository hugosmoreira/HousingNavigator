/**
 * Single entry point for application data.
 *
 * Pages import `dataService` from here and never reach into `src/data`
 * or Supabase directly. Swap the export below to switch adapters.
 */

import { staticDataService } from './staticDataService';
import type { DataService } from './types';

export const dataService: DataService = staticDataService;

export type { DataService } from './types';
