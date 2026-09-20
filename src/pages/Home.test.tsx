import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './Home';
import Help from './Help';
import Terms from './Terms';
import type { Program, WaitlistEntry, WaitlistStatus } from '../types';

const data = vi.hoisted(() => ({
  programs: [] as Program[], waitlists: [] as WaitlistEntry[],
  programsLoading: false, waitlistsLoading: false,
  programsError: null as Error | null, waitlistsError: null as Error | null,
}));
vi.mock('../hooks/usePrograms', () => ({ usePrograms: () => ({ programs: data.programs, loading: data.programsLoading, error: data.programsError }) }));
vi.mock('../hooks/useWaitlists', () => ({ useWaitlists: () => ({ waitlists: data.waitlists, loading: data.waitlistsLoading, error: data.waitlistsError }) }));

const resource: Program = {
  id: 'resource-database-uuid', route_id: 'tenant-clinic', program_name: 'Tenant rights clinic',
  county: 'Multnomah', state: 'OR', category: 'legal_aid', directory_category: 'legal_aid',
  service_areas: [{ state: 'WA', county: 'King' }], who_it_helps: [], application_method: 'phone',
  referral_required: false, phone: '', website: 'https://example.org/clinic', status: 'limited',
  status_confidence: 'medium', priority_score: 1, notes: 'Fallback clinic notes',
  description: 'Advice for tenants facing eviction.', last_verified: '2026-09-12',
};
const waitlist: WaitlistEntry = {
  id: 'waitlist-database-uuid', route_id: 'cedar-homes', agency: 'Cedar Housing',
  program_name: 'Cedar public housing applications', county: 'King', status: 'closed',
  last_checked: '2026-09-11', website: 'https://example.org/cedar', waitlist_type: 'public_housing',
};

function render() {
  return renderToStaticMarkup(<MemoryRouter><Home /></MemoryRouter>);
}
function plainText(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function waitlistLinks(html: string) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .filter(match => match[1].startsWith('/waitlist/') && match[1] !== '/waitlist/')
    .map(match => ({ href: match[1], text: plainText(match[2]) }));
}

beforeEach(() => {
  data.programs = [{ ...resource }];
  data.waitlists = [{ ...waitlist }];
  data.programsLoading = false;
  data.waitlistsLoading = false;
  data.programsError = null;
  data.waitlistsError = null;
});

describe('homepage published-record previews', () => {
  it('renders resource fields, actual service area, verification date, and stable public URL', () => {
    const html = render();
    for (const text of ['Tenant rights clinic', 'Advice for tenants facing eviction.', 'Legal aid', 'King County, WA', 'Last verified Sep 12, 2026']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="/resources/tenant-rights-clinic--tenant-clinic/"');
    expect(html).not.toContain('resource-database-uuid');
    expect(html).not.toContain('Fallback clinic notes');
    expect(html).not.toContain('Multnomah County');
    const text = plainText(html);
    for (const fabricated of ['Emergency Rent Assistance', 'NOW OPEN', 'Saved', 'Verified weekly', 'Instant alerts']) {
      expect(text).not.toContain(fabricated);
    }
    expect(text).not.toMatch(/\b(?:May|Apr) \d{1,2}\b/);
  });

  it.each([
    ['open', 'Listed open'], ['limited', 'Limited applications'],
    ['closed', 'Listed closed'], ['unknown', 'Status unknown'],
    ['unexpected', 'Status unknown'],
  ])('shows the same %s status, record date, and detail route in hero and list', (status, label) => {
    data.waitlists = [{ ...waitlist, status: status as WaitlistStatus }];
    const links = waitlistLinks(render());
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.href).toBe('/waitlist/cedar-housing--cedar-homes/');
      expect(link.text).toContain('Cedar Housing');
      expect(link.text).toContain(label);
      expect(link.text).toContain('Last checked Sep 11, 2026');
    }
    expect(links[0].text).toContain('Recorded waitlist status');
    expect(links[0].text).toContain('Confirm with provider.');
    expect(links[1].text).toContain('Cedar public housing applications');
  });

  it('qualifies an open mixed waitlist in both locations', () => {
    data.waitlists = [{ ...waitlist, status: 'open', waitlist_type: 'mixed' }];
    const links = waitlistLinks(render());
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.text).toContain('Some lists open');
      expect(link.text).not.toContain('Listed open');
    }
  });

  it('selects the newest resource of any category and the three newest checked waitlists', () => {
    data.programs = [
      { ...resource, id: 'older-rent', program_name: 'Older rent listing', category: 'rental_assistance', directory_category: 'rent_assistance', last_verified: '2026-09-01' },
      resource,
      { ...resource, id: 'shelter', route_id: 'shelter-public-id', program_name: 'New community shelter', category: 'emergency_shelter', directory_category: 'emergency_shelter', last_verified: '2026-09-18' },
    ];
    data.waitlists = [
      { ...waitlist, id: 'old', route_id: 'old', agency: 'Old Housing', last_checked: '2026-09-01', status: 'open' },
      { ...waitlist, id: 'second', route_id: 'second', agency: 'Second Housing', last_checked: '2026-09-16' },
      { ...waitlist, id: 'third', route_id: 'third', agency: 'Third Housing', last_checked: '2026-09-15' },
      { ...waitlist, id: 'newest', route_id: 'newest', agency: 'Newest Housing', last_checked: '2026-09-18', status: 'unknown' },
    ];
    const html = render();
    expect(html).toContain('New community shelter');
    expect(html).toContain('Emergency shelter');
    expect(html).toContain('href="/resources/new-community-shelter--shelter-public-id/"');
    expect(html).not.toContain('Older rent listing');
    expect(html).not.toContain('Tenant rights clinic');
    expect(html).not.toContain('Old Housing');
    expect(waitlistLinks(html).map(link => link.href)).toEqual([
      '/waitlist/newest-housing--newest/',
      '/waitlist/newest-housing--newest/',
      '/waitlist/second-housing--second/',
      '/waitlist/third-housing--third/',
    ]);
  });

  it('reflects replacement record data instead of preserving example content', () => {
    const original = render();
    data.programs = [{ ...resource, program_name: 'Family shelter', description: 'Overnight shelter intake.', directory_category: 'emergency_shelter', last_verified: '2026-09-19' }];
    data.waitlists = [{ ...waitlist, agency: 'Pine Housing', program_name: 'Pine vouchers', status: 'limited', last_checked: '2026-09-19' }];
    const updated = render();
    expect(updated).not.toBe(original);
    for (const text of ['Family shelter', 'Overnight shelter intake.', 'Last verified Sep 19, 2026', 'Pine Housing', 'Pine vouchers', 'Limited applications', 'Last checked Sep 19, 2026']) {
      expect(updated).toContain(text);
    }
    for (const text of ['Tenant rights clinic', 'Advice for tenants facing eviction.', 'Cedar Housing', 'Listed closed', 'Sep 11, 2026']) {
      expect(updated).not.toContain(text);
    }
    expect(updated).toContain('href="/resources/family-shelter--tenant-clinic/"');
    expect(waitlistLinks(updated).every(link => link.href === '/waitlist/pine-housing--cedar-homes/')).toBe(true);
  });

  it('uses record notes, legacy category, waitlist type, and ID routes when optional fields are absent', () => {
    data.programs = [{ ...resource, route_id: undefined, description: undefined, directory_category: undefined }];
    data.waitlists = [{ ...waitlist, route_id: undefined, program_name: undefined }];
    const html = render();
    expect(html).toContain('Fallback clinic notes');
    expect(html).toContain('Legal aid');
    expect(html).toContain('href="/resources/tenant-rights-clinic--resource-database-uuid/"');
    expect(waitlistLinks(html)[1].text).toContain('Public or subsidized housing');
    expect(waitlistLinks(html)[1].href).toBe('/waitlist/cedar-housing--waitlist-database-uuid/');
  });

  it.each(['', 'not a date', '2026-02-30'])('shows explicit unavailable dates for %s', date => {
    data.programs = [{ ...resource, last_verified: date }];
    data.waitlists = [{ ...waitlist, last_checked: date }];
    const html = render();
    expect(html).toContain('Verification date unavailable');
    const links = waitlistLinks(html);
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.text).toContain('Check date unavailable');
    expect(html).not.toContain('Invalid Date');
    expect(html).not.toContain('Last verified Sep');
    expect(html).not.toContain('Last checked Sep');
  });
});

describe('homepage unavailable and retained data', () => {
  it('keeps directory links but does not fabricate records for empty data', () => {
    data.programs = [];
    data.waitlists = [];
    const html = render();
    expect(html).toContain('Find housing resources');
    expect(html).toContain('Browse housing waitlists');
    expect(html).toContain('No waitlist information to preview. Check the tracker for updates.');
    expect(html).toContain('href="/resources/"');
    expect(html).toContain('href="/waitlist/"');
    expect(waitlistLinks(html)).toEqual([]);
    expect(html).not.toContain('View resource');
    expect(html).not.toContain('Cedar Housing');
    expect(html).not.toContain('Emergency Rent Assistance');
    expect(html).not.toContain('Listed open');
  });

  it('distinguishes pending initial loads from an empty result', () => {
    data.programs = [];
    data.waitlists = [];
    data.programsLoading = true;
    data.waitlistsLoading = true;
    const html = render();
    expect(html).toContain('Loading resources…');
    expect(html).toContain('Loading waitlists…');
    expect(html).toContain('Loading waitlist information…');
    expect(html).not.toContain('No waitlist information to preview.');
    expect(waitlistLinks(html)).toEqual([]);
  });

  it('explains failed refreshes with no records and does not leak internal errors', () => {
    data.programs = [];
    data.waitlists = [];
    data.programsError = new Error('private resource backend error');
    data.waitlistsError = new Error('private waitlist backend error');
    const html = render();
    expect(html).toContain('Could not refresh resources. Please try the directory again later.');
    expect(html).toContain('Could not refresh waitlists.');
    expect(waitlistLinks(html)).toEqual([]);
    expect(html).not.toContain('private resource backend error');
    expect(html).not.toContain('private waitlist backend error');
  });

  it('retains snapshot records and their dates with a refresh-error warning', () => {
    data.programsError = new Error('private resource backend error');
    data.waitlistsError = new Error('private waitlist backend error');
    const html = render();
    expect(html).toContain('Tenant rights clinic');
    expect(html).toContain('Last verified Sep 12, 2026');
    expect(html).toContain('Could not refresh resources. Showing previously loaded information.');
    expect(html).toContain('Could not refresh waitlists. Confirm any previously loaded information with the provider.');
    const links = waitlistLinks(html);
    expect(links).toHaveLength(2);
    expect(links[0].text).toContain('Could not refresh. Confirm with provider.');
    for (const link of links) {
      expect(link.text).toContain('Listed closed');
      expect(link.text).toContain('Last checked Sep 11, 2026');
    }
    expect(html).not.toContain('private resource backend error');
    expect(html).not.toContain('private waitlist backend error');
  });

  it('continues showing retained records during a refresh', () => {
    data.programsLoading = true;
    data.waitlistsLoading = true;
    const html = render();
    expect(html).toContain('Tenant rights clinic');
    expect(waitlistLinks(html)).toHaveLength(2);
    expect(html).not.toContain('Loading resources…');
    expect(html).not.toContain('Loading waitlist information…');
  });
});

describe('supporting accuracy explanations', () => {
  it.each([['Help', Help], ['Terms', Terms]] as const)('%s describes recorded checks without a freshness or manual-review guarantee', (_name, Page) => {
    const text = plainText(renderToStaticMarkup(<Page />));
    expect(text).toContain('recorded check');
    expect(text).toContain('manual or automated');
    expect(text).toContain('accuracy or availability');
    expect(text).toContain('Oregon and Washington');
    expect(text).toMatch(/Coverage varies|Coverage varies by|coverage varies/i);
    expect(text).not.toMatch(/verified weekly|human.verified|checked every (?:week|day)|instant alerts/i);
  });
});
