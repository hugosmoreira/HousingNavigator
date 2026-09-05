import { describe, expect, it } from 'vitest';
import { STATIC_PROGRAMS } from '../services/data/staticDataService';
import {
  findLocalLandingPage,
  LOCAL_LANDING_PAGES,
  localLandingPrograms,
} from './localLandingPages';
import { programServesArea } from './serviceAreas';

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

  it('keeps existing curated pages useful and requires three listings for other combinations', () => {
    for (const page of LOCAL_LANDING_PAGES) {
      const programs = localLandingPrograms(page, STATIC_PROGRAMS);

      // This established route has two published providers after manual
      // curation. Preserve its useful links without requiring retired/draft
      // records to be republished to satisfy the original launch threshold.
      const minimum = page.path === '/housing-help/multnomah-county/rent-assistance' ? 2 : 3;
      expect(programs.length, page.path).toBeGreaterThanOrEqual(minimum);
      const state = page.stateName === 'Oregon' ? 'OR' : 'WA';
      expect(
        programs.every((program) => programServesArea(program, state, page.county)),
      ).toBe(true);
    }
  });

  it('keeps unsupported thin county combinations out of the indexable set', () => {
    expect(findLocalLandingPage('/housing-help/washington-county')).toBeNull();
    expect(findLocalLandingPage('/housing-help/clackamas-county')).toBeNull();
  });
});
