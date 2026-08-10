import { requireSupabase } from '../lib/supabaseClient';

export type ResourceCurationAction =
  | 'updated'
  | 'needs_review'
  | 'fetch_failed'
  | 'insufficient_content'
  | 'extract_failed'
  | 'internal_error'
  | 'edit_conflict';

export interface ResourceCurationRun {
  id: string;
  status: 'running' | 'completed' | 'failed';
  target_count: number;
  processed_count: number;
  updated_count: number;
  needs_review_count: number;
  failed_count: number;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

export interface ResourceCurationCheck {
  id: string;
  resource_id: string;
  resource_name: string;
  action: ResourceCurationAction;
  applied_fields: string[];
  notes: string | null;
  error: string | null;
  checked_at: string;
}

export interface ResourceCurationOutcome {
  resourceId: string;
  resourceName: string;
  action: ResourceCurationAction;
  appliedFields: string[];
  message?: string;
}

export interface ResourceCurationResponse {
  run: ResourceCurationRun;
  remaining: number;
  outcomes: ResourceCurationOutcome[];
}

function edgeFunctionError(error: unknown): Promise<Error> | Error {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    return context
      .clone()
      .json()
      .then((body: { error?: string }) =>
        new Error(body?.error || `Resource curation failed (HTTP ${context.status})`),
      )
      .catch(() => new Error(`Resource curation failed (HTTP ${context.status})`));
  }
  return new Error(error instanceof Error ? error.message : 'Resource curation failed');
}

/**
 * Invoke one bounded server batch. The UI deliberately calls this repeatedly
 * instead of starting a background job, so leaving the page stops new work.
 */
export async function curateResourceBatch(
  runId?: string,
): Promise<ResourceCurationResponse> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<ResourceCurationResponse>(
    'curate-resources',
    { body: { run_id: runId, batch_size: 3 } },
  );
  if (error) throw await edgeFunctionError(error);
  if (!data) throw new Error('Resource curation returned no response.');
  return data;
}
