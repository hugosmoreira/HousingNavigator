import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INDEXABLE_PAGE_METADATA,
  resolvePageMetadata,
  SITE_URL,
} from './pageMetadata';

describe('page metadata', () => {
  it('normalizes trailing slashes and returns the route canonical', () => {
    expect(resolvePageMetadata('/resources/')).toMatchObject({
      path: '/resources',
      index: true,
      canonicalUrl: `${SITE_URL}/resources`,
      title: 'Find housing resources | Housing Navigator',
    });
  });

  it('keeps the root canonical trailing slash', () => {
    expect(resolvePageMetadata('/').canonicalUrl).toBe(`${SITE_URL}/`);
  });

  it('marks private and unknown routes noindex without a canonical', () => {
    expect(resolvePageMetadata('/dashboard')).toMatchObject({
      index: false,
      canonicalUrl: null,
    });
    expect(resolvePageMetadata('/not-a-real-route')).toMatchObject({
      index: false,
      canonicalUrl: null,
      title: 'Page not found | Housing Navigator',
    });
  });

  it('lists every indexable route in the sitemap', () => {
    const sitemap = readFileSync(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
    for (const path of Object.keys(INDEXABLE_PAGE_METADATA)) {
      const url = `${SITE_URL}${path === '/' ? '/' : path}`;
      expect(sitemap).toContain(`<loc>${url}</loc>`);
    }
  });
});
