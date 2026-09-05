import { requireSupabase } from '../lib/supabaseClient';
import type { PublicationStatus } from '../lib/resourcePublication';

export async function checkResourcePublication(action: 'status' | 'refresh' = 'status'): Promise<PublicationStatus> {
  const client = await requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error('Sign in again to check publication.');
  const response = await fetch('/.netlify/functions/resource-publication', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
    signal: AbortSignal.timeout(55_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.state) {
    throw new Error(result?.error ?? 'Website refresh could not be confirmed. Retry from Resources.');
  }
  return result;
}

// Deployment failure must not tell the admin to re-save or duplicate a record.
export async function refreshAfterResourceSave(): Promise<string> {
  try {
    const status = await checkResourcePublication('refresh');
    return 'Resource saved. ' + status.message;
  } catch (error) {
    return 'Resource saved. Needs attention: ' + (error instanceof Error ? error.message : 'Retry the website refresh from Resources.');
  }
}
