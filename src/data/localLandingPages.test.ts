import { describe, expect, it } from 'vitest';
import { STATIC_PROGRAMS } from '../services/data/staticDataService';
import {
  findLocalLandingPage,
  LOCAL_LANDING_PAGES,
  localLandingPrograms,
} from './localLandingPages';

describe('local housing landing pages', () => {
  it('uses unique, stable paths with concise search metadata', () => {
    const paths = LOCAL_LANDING_PAGES.map((page) => page.path);

    expect(new Set(paths).size).toBe(paths.length);
    for (const page of LOCAL_LANDING_PAGES) {
      expect(page.path).toMatch(/^\/housing-help\/[a-z0-9-/]+$/);
      expect(page.title.length).toBeLessThanOrEqual(65);
      expect(page.description.length).toBeLessThanOrEqual(160);
      expect(findLocalLandingPage(`${page.path}/`)).toBe(page);
    }
  });

  it('publishes only landing pages backed by at least three real listings', () => {
    for (const page of LOCAL_LANDING_PAGES) {
      const programs = localLandingPrograms(page, STATIC_PROGRAMS);

      expect(programs.length, page.path).toBeGreaterThanOrEqual(3);
      expect(programs.every((program) => program.county === page.county)).toBe(true);
    }
  });

  it('keeps unsupported thin county combinations out of the indexable set', () => {
    expect(findLocalLandingPage('/housing-help/washington-county')).toBeNull();
    expect(findLocalLandingPage('/housing-help/clackamas-county')).toBeNull();
    expect(findLocalLandingPage('/housing-help/clark-county/rent-assistance')).toBeNull();
  });
});
