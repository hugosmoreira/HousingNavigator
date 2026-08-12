import { describe, expect, it } from 'vitest';
import { STATIC_AFFORDABLE_PROPERTIES, STATIC_PROGRAMS, STATIC_WAITLISTS } from '../services/data/staticDataService';
import {
  affordablePropertyPath,
  affordablePropertySlug,
  findAffordablePropertyBySlug,
  findResourceBySlug,
  findWaitlistBySlug,
  resourcePath,
  resourceSlug,
  waitlistPath,
  waitlistSlug,
} from './entityRoutes';
import { resolvePageMetadata, SITE_URL } from './pageMetadata';

describe('indexable entity routes', () => {
  it('keeps a stable public slug without replacing the database id', () => {
    const liveProgram = {
      ...STATIC_PROGRAMS[0],
      id: '55333fb9-7b50-42bd-b755-6a921c0673bd',
      route_id: STATIC_PROGRAMS[0].route_id ?? STATIC_PROGRAMS[0].id,
    };

    expect(resourceSlug(liveProgram)).toBe(resourceSlug(STATIC_PROGRAMS[0]));
    expect(liveProgram.id).toBe('55333fb9-7b50-42bd-b755-6a921c0673bd');
  });

  it('creates unique, reversible resource slugs', () => {
    const slugs = STATIC_PROGRAMS.map(resourceSlug);
    expect(new Set(slugs).size).toBe(STATIC_PROGRAMS.length);
    for (const program of STATIC_PROGRAMS) {
      expect(findResourceBySlug(STATIC_PROGRAMS, resourceSlug(program))).toEqual(program);
    }
  });

  it('creates unique, reversible waitlist slugs', () => {
    const slugs = STATIC_WAITLISTS.map(waitlistSlug);
    expect(new Set(slugs).size).toBe(STATIC_WAITLISTS.length);
    for (const waitlist of STATIC_WAITLISTS) {
      expect(findWaitlistBySlug(STATIC_WAITLISTS, waitlistSlug(waitlist))).toEqual(waitlist);
    }
  });

  it('creates unique, reversible affordable-property slugs', () => {
    const slugs = STATIC_AFFORDABLE_PROPERTIES.map(affordablePropertySlug);
    expect(new Set(slugs).size).toBe(STATIC_AFFORDABLE_PROPERTIES.length);
    for (const property of STATIC_AFFORDABLE_PROPERTIES) {
      expect(findAffordablePropertyBySlug(STATIC_AFFORDABLE_PROPERTIES, affordablePropertySlug(property))).toEqual(property);
    }
  });

  it('returns indexable metadata and canonicals for every generated detail page', () => {
    const paths = [
      ...STATIC_PROGRAMS.map(resourcePath),
      ...STATIC_WAITLISTS.map(waitlistPath),
      ...STATIC_AFFORDABLE_PROPERTIES.map(affordablePropertyPath),
    ];
    for (const path of paths) {
      const metadata = resolvePageMetadata(path);
      expect(metadata.index).toBe(true);
      expect(metadata.canonicalUrl).toBe(`${SITE_URL}${path}`);
      expect(metadata.title).not.toBe('Page not found | Housing Navigator');
      expect(metadata.description.length).toBeGreaterThan(20);
      expect(metadata.description.length).toBeLessThanOrEqual(155);
    }
  });

  it('keeps invented detail slugs non-indexable', () => {
    expect(resolvePageMetadata('/resources/not-a-real-resource')).toMatchObject({
      index: false,
      canonicalUrl: null,
    });
    expect(resolvePageMetadata('/waitlist/not-a-real-waitlist')).toMatchObject({
      index: false,
      canonicalUrl: null,
    });
    expect(resolvePageMetadata('/affordable-housing/not-a-real-property')).toMatchObject({
      index: false,
      canonicalUrl: null,
    });
  });
});
