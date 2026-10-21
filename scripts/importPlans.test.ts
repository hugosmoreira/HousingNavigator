import { describe, expect, it } from 'vitest';
import {
  planCatalogResources,
  planWaitlistPatch,
  type LiveWaitlistRow,
  type WaitlistPatchFields,
} from './importPlans';

const resource = (name: string, website: string | null, source_url: string | null = null) => ({
  name,
  website,
  source_url,
});

describe('planCatalogResources', () => {
  const live = [
    { id: 'uuid-exact', ...resource('Rent Help', 'https://example.org/rent') },
    { id: 'uuid-similar', ...resource('Legal Aid', 'https://www.legal.example/help/') },
  ];

  it('skips exact matches and keeps their live UUID', () => {
    const plan = planCatalogResources([resource('Rent Help', 'https://example.org/rent')], live);
    expect(plan.inserts).toEqual([]);
    expect(plan.skips).toEqual([
      expect.objectContaining({ liveId: 'uuid-exact', match: 'exact' }),
    ]);
  });

  it('skips near-identical rows instead of inserting a duplicate', () => {
    // Curated row gained www. and a trailing slash; the bundled copy did not.
    const plan = planCatalogResources(
      [resource('legal aid', 'https://www.legal.example/help')],
      live,
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.skips[0]).toMatchObject({ liveId: 'uuid-similar', match: 'similar' });
  });

  it('inserts only rows with no live counterpart', () => {
    const fresh = resource('New Program', 'https://new.example/');
    const plan = planCatalogResources([fresh], live);
    expect(plan.inserts).toEqual([fresh]);
    expect(plan.skips).toEqual([]);
  });

  it('falls back to source_url when a row has no website', () => {
    const plan = planCatalogResources(
      [resource('Rent Help', null, 'https://example.org/rent')],
      live,
    );
    expect(plan.skips[0]).toMatchObject({ liveId: 'uuid-exact', match: 'exact' });
  });

  it('rejects duplicate bundled identities', () => {
    const row = resource('Twice', 'https://twice.example/');
    expect(() => planCatalogResources([row, { ...row }], live)).toThrow('Duplicate bundled resource');
  });

  it('names the row when a URL is malformed', () => {
    expect(() => planCatalogResources([resource('Broken', 'not a url')], live))
      .toThrow('bundled resource "Broken"');
  });
});

describe('planWaitlistPatch', () => {
  const live: LiveWaitlistRow = {
    id: 'vha',
    published: true,
    program_name: 'Section 8',
    county: 'Clark',
    city: null,
    state: 'WA',
    status: 'closed',
    application_link: 'https://live.example/apply',
    source_url: 'https://live.example/',
    last_checked: '2026-09-01',
    notes: '',
    public_notes: 'Curated by an admin',
  };
  const incoming: WaitlistPatchFields = {
    program_name: 'Section 8 Housing Choice Voucher',
    county: 'Clark',
    city: 'Vancouver',
    state: 'OR',
    status: 'open',
    application_link: 'https://csv.example/apply',
    source_url: 'https://csv.example/',
    last_checked: '2026-10-01',
    notes: 'CSV note',
    public_notes: 'CSV public note',
  };

  it('fills empty columns only and never overwrites admin edits', () => {
    const plan = planWaitlistPatch(live, incoming, { overwriteStatus: false });
    expect(plan?.patch).toEqual({ city: 'Vancouver', notes: 'CSV note' });
    expect(plan?.publishedStatusChange).toBe(false);
  });

  it('leaves status alone unless --overwrite-status is passed', () => {
    const plan = planWaitlistPatch(live, incoming, { overwriteStatus: false });
    expect(plan?.patch).not.toHaveProperty('status');
    expect(plan?.patch).not.toHaveProperty('last_checked');
  });

  it('with --overwrite-status, changes status with its check date and flags follower emails', () => {
    const plan = planWaitlistPatch(live, incoming, { overwriteStatus: true });
    expect(plan?.patch).toMatchObject({ status: 'open', last_checked: '2026-10-01' });
    expect(plan?.publishedStatusChange).toBe(true);
    expect(plan?.changes).toContainEqual({ field: 'status', from: 'closed', to: 'open' });
  });

  it('does not flag follower emails for an unpublished row', () => {
    const plan = planWaitlistPatch({ ...live, published: false }, incoming, { overwriteStatus: true });
    expect(plan?.publishedStatusChange).toBe(false);
  });

  it('never applies an unknown CSV status', () => {
    const plan = planWaitlistPatch(live, { ...incoming, status: 'unknown' }, { overwriteStatus: true });
    expect(plan?.patch).not.toHaveProperty('status');
  });

  it('never produces internal_notes, published or identity columns', () => {
    const plan = planWaitlistPatch(
      { ...live, program_name: null, source_url: null, application_link: null },
      incoming,
      { overwriteStatus: true },
    );
    const keys = Object.keys(plan?.patch ?? {});
    expect(keys).not.toContain('internal_notes');
    expect(keys).not.toContain('published');
    expect(keys).not.toContain('housing_authority');
    expect(keys).not.toContain('id');
  });

  it('replaces only the placeholder county', () => {
    expect(planWaitlistPatch({ ...live, county: 'Other' }, incoming, { overwriteStatus: false })?.patch)
      .toMatchObject({ county: 'Clark' });
    expect(planWaitlistPatch(live, { ...incoming, county: 'Multnomah' }, { overwriteStatus: false })?.patch)
      .not.toHaveProperty('county');
  });

  it('returns null when the CSV adds nothing', () => {
    const complete: LiveWaitlistRow = { ...live, city: 'Vancouver', notes: 'kept' };
    expect(planWaitlistPatch(complete, incoming, { overwriteStatus: false })).toBeNull();
  });
});
