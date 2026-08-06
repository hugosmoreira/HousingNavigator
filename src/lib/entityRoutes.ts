import type { Program, WaitlistEntry } from '../types';

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export function createEntitySlug(label: string, id: string): string {
  const labelSlug = slugify(label) || 'listing';
  const idSlug = slugify(id) || 'item';
  return `${labelSlug}--${idSlug}`;
}

export function resourceSlug(program: Program): string {
  return createEntitySlug(program.program_name, program.id);
}

export function resourcePath(program: Program): string {
  return `/resources/${resourceSlug(program)}/`;
}

export function waitlistSlug(waitlist: WaitlistEntry): string {
  return createEntitySlug(waitlist.agency, waitlist.id);
}

export function waitlistPath(waitlist: WaitlistEntry): string {
  return `/waitlist/${waitlistSlug(waitlist)}/`;
}

export function findResourceBySlug(
  programs: readonly Program[],
  slug: string,
): Program | undefined {
  return programs.find((program) => resourceSlug(program) === slug);
}

export function findWaitlistBySlug(
  waitlists: readonly WaitlistEntry[],
  slug: string,
): WaitlistEntry | undefined {
  return waitlists.find((waitlist) => waitlistSlug(waitlist) === slug);
}
