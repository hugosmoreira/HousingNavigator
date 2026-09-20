import { describe, expect, it } from 'vitest';
import { formatPreviewDate, homeResourcePreview, homeWaitlistPreviews, previewStatus } from './homePreviews';
import type { Program, WaitlistEntry, WaitlistStatus } from '../types';

function program(overrides: Partial<Program> = {}): Program {
  return {
    id: 'resource', program_name: 'Community services', county: 'Multnomah', state: 'OR',
    category: 'comprehensive_support', who_it_helps: [], application_method: 'phone',
    referral_required: false, phone: '', website: 'https://example.org/services',
    status: 'unknown', status_confidence: 'low', priority_score: 3, notes: '',
    last_verified: '2026-09-04', ...overrides,
  };
}

function waitlist(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'waitlist', agency: 'Community housing', county: 'Multnomah', status: 'closed',
    last_checked: '2026-09-04', website: 'https://example.org/housing', ...overrides,
  };
}

describe('homepage recorded dates', () => {
  it.each([
    ['2026-09-04', 'Sep 4, 2026'],
    ['2026-09-04T00:15:00.000Z', 'Sep 4, 2026'],
    ['2026-09-04T23:30:00-07:00', 'Sep 5, 2026'],
    ['2026-09-04T00:30:00+03:00', 'Sep 3, 2026'],
    ['2024-02-29', 'Feb 29, 2024'],
  ])('formats %s using the recorded date in UTC', (input, expected) => {
    expect(formatPreviewDate(input)).toBe(expected);
  });

  it.each([
    '', 'not a date', 'September 4, 2026', '2026-9-4', '2026-09-04junk',
    '2026-13-01', '2026-00-01', '2026-09-00', '2026-02-30', '2026-02-29',
    '2026-04-31T12:00:00Z', '2026-09-04T25:00:00Z',
    undefined, null,
  ])('does not invent a date for missing or malformed input %s', input => {
    expect(formatPreviewDate(input as string)).toBeNull();
  });
});

describe('homepage resource selection', () => {
  it('selects the latest reviewed record regardless of category, status, or priority', () => {
    const rent = program({ id: 'rent', category: 'rental_assistance', priority_score: 100, last_verified: '2026-09-01' });
    const legal = program({ id: 'legal', category: 'legal_aid', priority_score: 1, status: 'closed', last_verified: '2026-09-10' });
    expect(homeResourcePreview([rent, legal])).toBe(legal);
    expect(homeResourcePreview([legal, rent])).toBe(legal);
    const shelter = program({ id: 'shelter', category: 'emergency_shelter', last_verified: '2026-09-11' });
    expect(homeResourcePreview([legal, shelter, rent])).toBe(shelter);
  });

  it('skips unnamed records and places invalid or missing dates after valid dates', () => {
    const valid = program({ id: 'z-valid', last_verified: '2026-01-01' });
    expect(homeResourcePreview([
      program({ id: 'a-missing', last_verified: '' }),
      program({ id: 'b-rollover', last_verified: '2026-02-30' }),
      program({ id: 'c-blank', program_name: '  ', last_verified: '2026-09-19' }),
      valid,
    ])).toBe(valid);
    expect(homeResourcePreview([])).toBeUndefined();
    expect(homeResourcePreview([program({ program_name: '\t ' })])).toBeUndefined();
  });

  it('uses a deterministic ID tie-break without modifying the input or records', () => {
    const z = Object.freeze(program({ id: 'z' }));
    const a = Object.freeze(program({ id: 'a' }));
    const records = Object.freeze([z, a]);
    expect(homeResourcePreview(records)).toBe(a);
    expect(homeResourcePreview([a, z])).toBe(a);
    expect(records).toEqual([z, a]);
    expect(z.last_verified).toBe('2026-09-04');
  });
});

describe('homepage waitlist selection', () => {
  it('returns only the three newest checked records, not a favored agency or open status', () => {
    const olderOpen = waitlist({ id: 'older-open', status: 'open', last_checked: '2026-09-01', last_opened_at: '2026-09-19' });
    const newestClosed = waitlist({ id: 'newest-closed', status: 'closed', last_checked: '2026-09-18' });
    const secondUnknown = waitlist({ id: 'second-unknown', status: 'unknown', last_checked: '2026-09-16' });
    const thirdLimited = waitlist({ id: 'third-limited', status: 'limited', last_checked: '2026-09-15' });
    expect(homeWaitlistPreviews([olderOpen, thirdLimited, newestClosed, secondUnknown])).toEqual([
      newestClosed, secondUnknown, thirdLimited,
    ]);
  });

  it('orders timestamps by actual time and resolves equal timestamps by ID', () => {
    const a = waitlist({ id: 'a', last_checked: '2026-09-04T12:00:00Z' });
    const b = waitlist({ id: 'b', last_checked: '2026-09-04T05:00:00-07:00' });
    const c = waitlist({ id: 'c', last_checked: '2026-09-04T12:01:00Z' });
    expect(homeWaitlistPreviews([b, a, c]).map(record => record.id)).toEqual(['c', 'a', 'b']);
    expect(homeWaitlistPreviews([c, b, a]).map(record => record.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps unavailable dates last with a stable tie-break and excludes unnamed agencies', () => {
    const a = waitlist({ id: 'a', last_checked: '' });
    const b = waitlist({ id: 'b', last_checked: '2026-02-30' });
    const valid = waitlist({ id: 'z', last_checked: '2026-01-01' });
    const unnamed = waitlist({ id: 'unnamed', agency: '  ', last_checked: '2026-09-19' });
    expect(homeWaitlistPreviews([b, unnamed, a, valid])).toEqual([valid, a, b]);
    expect(homeWaitlistPreviews([])).toEqual([]);
    expect(homeWaitlistPreviews([unnamed])).toEqual([]);
  });

  it('does not mutate its input array or the selected records', () => {
    const older = Object.freeze(waitlist({ id: 'older', last_checked: '2026-09-01' }));
    const newer = Object.freeze(waitlist({ id: 'newer', last_checked: '2026-09-02' }));
    const records = Object.freeze([older, newer]);
    const result = homeWaitlistPreviews(records);
    expect(result).toEqual([newer, older]);
    expect(result).not.toBe(records);
    expect(result[0]).toBe(newer);
    expect(records).toEqual([older, newer]);
  });
});

describe('recorded waitlist status labels', () => {
  it.each([
    ['open', 'Listed open'],
    ['limited', 'Limited applications'],
    ['closed', 'Listed closed'],
    ['unknown', 'Status unknown'],
  ] as const)('describes %s without claiming real-time availability', (status, label) => {
    expect(previewStatus(waitlist({ status, waitlist_type: 'housing_choice_voucher' }))).toEqual({ status, label });
  });

  it('does not imply every list in an open mixed record is open', () => {
    expect(previewStatus(waitlist({ status: 'open', waitlist_type: 'mixed' }))).toEqual({ status: 'open', label: 'Some lists open' });
    expect(previewStatus(waitlist({ status: 'closed', waitlist_type: 'mixed' }))).toEqual({ status: 'closed', label: 'Listed closed' });
  });

  it('uses unknown for unexpected runtime statuses', () => {
    expect(previewStatus(waitlist({ status: 'unexpected' as WaitlistStatus }))).toEqual({ status: 'unknown', label: 'Status unknown' });
  });
});
