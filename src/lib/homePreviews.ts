import type { Program, WaitlistEntry, WaitlistStatus } from '../types';

function recordedTime(value: string): number | null {
  // Reject malformed dates (including calendar rollovers such as February 30).
  const day = value?.match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0];
  if (!day) return null;
  const time = Date.parse(value);
  const calendarDay = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(time) || Number.isNaN(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== day) return null;
  return time;
}

export function formatPreviewDate(value: string): string | null {
  const time = recordedTime(value);
  return time === null ? null : new Date(time).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function newestFirst<T extends { id: string }>(records: readonly T[], date: (record: T) => string): T[] {
  return [...records].sort((a, b) => {
    const difference = (recordedTime(date(b)) ?? -Infinity) - (recordedTime(date(a)) ?? -Infinity);
    if (difference && !Number.isNaN(difference)) return difference;
    // Stable tie-breaker keeps server and client previews consistent.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Same published records as the directory, not a second example catalog. */
export function homeResourcePreview(programs: readonly Program[]): Program | undefined {
  return newestFirst(programs.filter(program => program.program_name.trim()), program => program.last_verified)[0];
}

export function homeWaitlistPreviews(waitlists: readonly WaitlistEntry[]): WaitlistEntry[] {
  return newestFirst(waitlists.filter(waitlist => waitlist.agency.trim()), waitlist => waitlist.last_checked).slice(0, 3);
}

export function previewStatus(waitlist: WaitlistEntry): { status: WaitlistStatus; label: string } {
  switch (waitlist.status) {
    case 'open': return { status: 'open', label: waitlist.waitlist_type === 'mixed' ? 'Some lists open' : 'Listed open' };
    case 'limited': return { status: 'limited', label: 'Limited applications' };
    case 'closed': return { status: 'closed', label: 'Listed closed' };
    default: return { status: 'unknown', label: 'Status unknown' };
  }
}
