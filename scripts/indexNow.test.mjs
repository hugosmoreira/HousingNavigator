import { describe, expect, it, vi } from 'vitest';
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  parseSitemap,
  selectChangedUrls,
  submitIndexNow,
} from './indexNow.mjs';

const sitemap = [
  'https://housingnavigator.us/',
  'https://housingnavigator.us/resources/',
  'https://housingnavigator.us/resources/example/',
  'https://housingnavigator.us/waitlist/',
  'https://housingnavigator.us/waitlist/example/',
  'https://housingnavigator.us/housing-help/multnomah-county/',
  'https://housingnavigator.us/privacy/',
];

describe('IndexNow integration', () => {
  it('parses and decodes canonical sitemap locations', () => {
    expect(parseSitemap('<urlset><url><loc>https://housingnavigator.us/?a=1&amp;b=2</loc></url></urlset>'))
      .toEqual(['https://housingnavigator.us/?a=1&b=2']);
  });

  it('selects only the public URL family affected by a data change', () => {
    expect(selectChangedUrls(['src/data/catalog.json'], sitemap)).toEqual([
      'https://housingnavigator.us/resources/',
      'https://housingnavigator.us/resources/example/',
    ]);
    expect(selectChangedUrls(['src/data/localLandingPages.ts'], sitemap)).toEqual([
      'https://housingnavigator.us/housing-help/multnomah-county/',
    ]);
  });

  it('selects an exact public page and ignores private or operational changes', () => {
    expect(selectChangedUrls(['src/pages/Privacy.tsx'], sitemap)).toEqual([
      'https://housingnavigator.us/privacy/',
    ]);
    expect(
      selectChangedUrls(
        ['src/pages/Login.tsx', 'supabase/migrations/example.sql', '.github/workflows/indexnow.yml'],
        sitemap,
      ),
    ).toEqual([]);
  });

  it('selects the full sitemap for shared public-shell changes', () => {
    expect(selectChangedUrls(['src/components/Layout.tsx'], sitemap)).toEqual([...sitemap].sort());
  });

  it('verifies the hosted key and submits the documented bulk payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(`${INDEXNOW_KEY}\n`, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 202 }));

    await expect(submitIndexNow([sitemap[0]], { fetchImpl: fetchMock })).resolves.toEqual({
      status: 202,
      submitted: 1,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(INDEXNOW_KEY_LOCATION);
    expect(fetchMock.mock.calls[1][0]).toBe(INDEXNOW_ENDPOINT);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      host: 'housingnavigator.us',
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: [sitemap[0]],
    });
  });
});
