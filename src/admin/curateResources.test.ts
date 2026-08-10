import { describe, expect, it } from 'vitest';
import {
  partitionResourceCurationChecks,
  type ResourceCurationCheck,
} from './curateResources';

function check(
  id: string,
  action: ResourceCurationCheck['action'],
  notes: string | null = null,
): ResourceCurationCheck {
  return {
    id,
    resource_id: `resource-${id}`,
    resource_name: `Resource ${id}`,
    action,
    applied_fields: action === 'updated' ? ['last_verified'] : [],
    notes,
    error: null,
    checked_at: '2026-08-10T00:00:00Z',
  };
}

describe('resource curation result display', () => {
  it('shows partial updates with unresolved required information only in the review list', () => {
    const result = partitionResourceCurationChecks([
      check('1', 'updated', 'the page did not state who qualifies'),
      check('2', 'needs_review'),
      check('3', 'fetch_failed'),
      check('4', 'updated'),
    ]);

    expect(result.updated.map((item) => item.id)).toEqual(['4']);
    expect(result.unresolved.map((item) => item.id)).toEqual(['1', '2', '3']);
  });

  it('returns every unresolved result instead of truncating the review list', () => {
    const checks = Array.from({ length: 12 }, (_, index) =>
      check(String(index), 'needs_review'),
    );

    expect(partitionResourceCurationChecks(checks).unresolved).toHaveLength(12);
  });
});
