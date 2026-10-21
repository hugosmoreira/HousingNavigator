/**
 * Pure planning helpers shared by the privileged import scripts.
 *
 * They decide what an import would change without touching the network,
 * so the rules that protect curated production data can be unit tested.
 */

import { exactResourceIdentity, lossyResourceKey } from './importIdentity.ts';

// ---------------------------------------------------------------------------
// Bundled catalog -> resources (scripts/importToSupabase.ts)
// ---------------------------------------------------------------------------

export interface ResourceIdentityFields {
  name: string;
  website: string | null;
  source_url: string | null;
}

export interface LiveResourceIdentity extends ResourceIdentityFields {
  id: string;
}

export interface CatalogResourcePlan<T extends ResourceIdentityFields> {
  /** Bundled rows with no live counterpart. They are inserted unpublished. */
  inserts: T[];
  /** Bundled rows that already exist live. They are never written. */
  skips: Array<{ row: T; liveId: string; match: 'exact' | 'similar' }>;
}

/**
 * Matches bundled catalog rows to live resources. A row counts as existing
 * when its exact identity (name + canonical URL) matches, or when its lossy
 * key matches (same slugged name and host/path). The lossy match catches
 * curated rows whose URL gained a trailing slash, `www.` or `https`, so a
 * rerun does not insert a duplicate of a resource admins already edited.
 */
export function planCatalogResources<T extends ResourceIdentityFields>(
  bundled: readonly T[],
  live: readonly LiveResourceIdentity[],
): CatalogResourcePlan<T> {
  const liveByIdentity = new Map<string, string>();
  const liveByLossyKey = new Map<string, string>();
  for (const row of live) {
    const url = row.website ?? row.source_url ?? '';
    const identity = exactResourceIdentity(row.name, url, `live resource ${row.id}`);
    if (!liveByIdentity.has(identity)) liveByIdentity.set(identity, row.id);
    const key = lossyResourceKey(row.name, url);
    if (key && !liveByLossyKey.has(key)) liveByLossyKey.set(key, row.id);
  }

  const plan: CatalogResourcePlan<T> = { inserts: [], skips: [] };
  const seen = new Set<string>();
  for (const row of bundled) {
    const url = row.website ?? row.source_url ?? '';
    const identity = exactResourceIdentity(row.name, url, `bundled resource "${row.name}"`);
    if (seen.has(identity)) {
      throw new Error(`Duplicate bundled resource identity for "${row.name}"`);
    }
    seen.add(identity);

    const exactId = liveByIdentity.get(identity);
    if (exactId) {
      plan.skips.push({ row, liveId: exactId, match: 'exact' });
      continue;
    }
    const key = lossyResourceKey(row.name, url);
    const similarId = key ? liveByLossyKey.get(key) : undefined;
    if (similarId) {
      plan.skips.push({ row, liveId: similarId, match: 'similar' });
      continue;
    }
    plan.inserts.push(row);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Waitlist CSV -> existing waitlists (scripts/importWaitlistsCsv.ts)
// ---------------------------------------------------------------------------

export interface WaitlistPatchFields {
  program_name: string | null;
  county: string;
  city: string | null;
  state: string | null;
  status: string;
  application_link: string | null;
  source_url: string | null;
  last_checked: string | null;
  notes: string | null;
  public_notes: string | null;
}

export interface LiveWaitlistRow extends WaitlistPatchFields {
  id: string;
  published: boolean;
}

export interface FieldChange {
  field: keyof WaitlistPatchFields;
  from: unknown;
  to: unknown;
}

export interface WaitlistPatchPlan {
  patch: Partial<WaitlistPatchFields>;
  changes: FieldChange[];
  /** True when the patch changes `status` on a published row (may email followers). */
  publishedStatusChange: boolean;
}

/** Columns a CSV may fill, and only when the live value is empty. */
const FILL_ONLY_FIELDS = [
  'program_name',
  'city',
  'state',
  'application_link',
  'source_url',
  'last_checked',
  'notes',
  'public_notes',
] as const satisfies ReadonlyArray<keyof WaitlistPatchFields>;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/**
 * Builds the update for a waitlist that already exists live. Admin edits
 * always win: a CSV fills empty columns only. It never touches identity,
 * `internal_notes` or `published`. It changes `status` only when the
 * operator passes `--overwrite-status`, because a status change on a
 * published list can email its followers. Returns null when nothing changes.
 */
export function planWaitlistPatch(
  live: LiveWaitlistRow,
  incoming: WaitlistPatchFields,
  options: { overwriteStatus: boolean },
): WaitlistPatchPlan | null {
  const patch: Partial<WaitlistPatchFields> = {};
  const changes: FieldChange[] = [];
  const set = <K extends keyof WaitlistPatchFields>(field: K, to: WaitlistPatchFields[K]) => {
    patch[field] = to;
    changes.push({ field, from: live[field], to });
  };

  for (const field of FILL_ONLY_FIELDS) {
    if (isEmpty(live[field]) && !isEmpty(incoming[field])) set(field, incoming[field]);
  }
  // 'Other' is the importer's placeholder county, so a real county may replace it.
  if ((isEmpty(live.county) || live.county === 'Other') && !isEmpty(incoming.county) && incoming.county !== 'Other') {
    set('county', incoming.county);
  }

  let publishedStatusChange = false;
  if (
    options.overwriteStatus &&
    incoming.status !== 'unknown' &&
    incoming.status !== live.status
  ) {
    set('status', incoming.status);
    publishedStatusChange = live.published;
    // A status from the CSV is only as fresh as the CSV's own check date.
    if (!isEmpty(incoming.last_checked) && incoming.last_checked !== live.last_checked && !('last_checked' in patch)) {
      set('last_checked', incoming.last_checked);
    }
  }

  return changes.length === 0 ? null : { patch, changes, publishedStatusChange };
}
