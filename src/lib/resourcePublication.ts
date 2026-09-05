import type { Program } from '../types';

export const PUBLICATION_MANIFEST_PATH = '/.well-known/resource-publication.json';
export const PUBLICATION_TIMEOUT_MS = 15 * 60_000;
export interface PublicationManifest {
  version: 1;
  generated_at: string;
  digest: string;
  resources: Record<string, { digest: string; path: string }>;
}
export interface PublicationRequest {
  request_id: string;
  content_digest: string;
  requested_at: string;
  outcome: 'requested' | 'accepted' | 'failed';
}
export interface PublicationStatus {
  state: 'live' | 'publishing' | 'needs_attention';
  message: string;
  resources: Record<string, 'live' | 'publishing' | 'needs_attention'>;
  changed_count: number;
  removed_count: number;
  requested_at: string | null;
  configured: boolean;
}

// Object order, route aliases and database audit fields must not cause rebuilds.
// Array order is retained because it can affect presentation (primary area).
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}
export async function publicationDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function resourceDigests(programs: Program[]): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(programs.map(async program => {
    const { route_id: _route, ...content } = program;
    return [program.id, await publicationDigest(content)];
  })));
}
export function publicationStatus(
  current: Record<string, string>, currentDigest: string,
  manifest: PublicationManifest | null, request: PublicationRequest | null,
  now = Date.now(),
): Omit<PublicationStatus, 'configured'> {
  const pending = !!request && request.content_digest === currentDigest &&
    request.outcome !== 'failed' &&
    now - Date.parse(request.requested_at) < PUBLICATION_TIMEOUT_MS;
  const resources: PublicationStatus['resources'] = {};
  let changed = 0;
  for (const [id, digest] of Object.entries(current)) {
    const live = manifest?.resources[id]?.digest === digest;
    if (!live) changed++;
    resources[id] = live ? 'live' : pending ? 'publishing' : 'needs_attention';
  }
  const removed = Object.keys(manifest?.resources ?? {}).filter(id => !(id in current)).length;
  const live = !!manifest && manifest.digest === currentDigest && !changed && !removed;
  const state = live ? 'live' : pending ? 'publishing' : 'needs_attention';
  return {
    state, resources, changed_count: changed, removed_count: removed,
    requested_at: request?.requested_at ?? null,
    message: live
      ? 'Published resource content matches the deployed pages and sitemap.'
      : pending
        ? 'Publishing saved changes. Detail pages and the sitemap are being refreshed; this can take several minutes.'
        : request?.outcome === 'failed'
          ? 'Your data is saved, but the website refresh could not be started. Retry the refresh.'
          : 'Saved content is not confirmed on the deployed pages. Refresh the public pages, or retry if the previous build did not finish.',
  };
}
