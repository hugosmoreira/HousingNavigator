import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INDEXABLE_PAGE_METADATA,
  resolvePageMetadata,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_URL,
  SITE_URL,
} from './pageMetadata';

describe('page metadata', () => {
  it('normalizes trailing slashes and returns the route canonical', () => {
    expect(resolvePageMetadata('/resources/')).toMatchObject({
      path: '/resources',
      index: true,
      canonicalUrl: `${SITE_URL}/resources/`,
      title: 'Find housing resources | Housing Navigator',
      openGraphType: 'website',
      socialImageUrl: SOCIAL_IMAGE_URL,
      socialImageAlt: SOCIAL_IMAGE_ALT,
    });
  });

  it('keeps the root canonical trailing slash', () => {
    expect(resolvePageMetadata('/').canonicalUrl).toBe(`${SITE_URL}/`);
  });

  it('keeps indexable titles within Bing\'s 70-character recommendation', () => {
    for (const metadata of Object.values(INDEXABLE_PAGE_METADATA)) {
      expect(metadata.title.length).toBeLessThanOrEqual(70);
    }
  });

  it('keeps the non-JavaScript shell title within the same limit', () => {
    const source = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const title = source.match(/<title>(.*?)<\/title>/)?.[1];
    expect(title).toBeTruthy();
    expect(title?.length).toBeLessThanOrEqual(70);
  });

  it('publishes canonical metadata for supported local housing pages', () => {
    expect(resolvePageMetadata('/housing-help/multnomah-county/rent-assistance/')).toMatchObject({
      title: 'Rent assistance in Multnomah County | Housing Navigator',
      index: true,
      canonicalUrl: `${SITE_URL}/housing-help/multnomah-county/rent-assistance/`,
    });
    expect(resolvePageMetadata('/housing-help/clark-county/rent-assistance')).toMatchObject({
      index: false,
      canonicalUrl: null,
    });
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
      const url = `${SITE_URL}${path === '/' ? '/' : `${path}/`}`;
      expect(sitemap).toContain(`<loc>${url}</loc>`);
    }
  });
});
