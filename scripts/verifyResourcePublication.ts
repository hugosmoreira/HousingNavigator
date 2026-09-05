// Read-only release check: public data only; never triggers a build or edits rows.
import assert from 'node:assert/strict';
import { resourceDigests, publicationDigest, type PublicationManifest } from '../src/lib/resourcePublication';
import { programFromResourceRow } from '../src/services/data/mappers';
import type { ResourceRow } from '../src/services/data/dbTypes';
const base = process.argv[2] || 'https://housingnavigator.us';
if (!/^https:\/\/(housingnavigator\.us|deploy-preview-\d+--housingnavigatorus\.netlify\.app)$/.test(base)) {
  throw new Error('Use this project production or deploy-preview origin.');
}
const response = await fetch(base + '/.well-known/resource-publication.json?t=' + Date.now(), { cache: 'no-store' });
assert.equal(response.status, 200);
assert.match(response.headers.get('cache-control') ?? '', /no-store/);
const manifest = await response.json() as PublicationManifest;
assert.equal(manifest.version, 1);
const supabase = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_ANON_KEY!;
assert.ok(supabase && key, 'Load the explicit local public Supabase environment.');
const rows: ResourceRow[] = [];
for (let offset = 0; ; offset += 500) {
  const publicResponse = await fetch(supabase + '/rest/v1/resources_public?select=*&published=eq.true&order=id&limit=500&offset=' + offset, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  assert.equal(publicResponse.status, 200);
  const page = await publicResponse.json() as ResourceRow[];
  rows.push(...page); if (page.length < 500) break;
}
const expected = await resourceDigests(rows.map(programFromResourceRow));
assert.equal(manifest.digest, await publicationDigest(expected), 'Deployed resources differ from current public data.');
assert.deepEqual(Object.keys(manifest.resources).sort(), Object.keys(expected).sort());
const sitemapResponse = await fetch(base + '/sitemap.xml');
assert.equal(sitemapResponse.status, 200);
const sitemap = await sitemapResponse.text();
let verified = 0;
const entries = Object.entries(manifest.resources);
for (let offset = 0; offset < entries.length; offset += 4) {
  await Promise.all(entries.slice(offset, offset + 4).map(async ([id, item]) => {
    assert.equal(item.digest, expected[id]);
    assert.match(item.path, /^\/resources\/[a-z0-9-]+\/$/);
    assert.ok(sitemap.includes(item.path), 'Missing sitemap path: ' + item.path);
    const page = await fetch(base + item.path);
    assert.equal(page.status, 200, item.path);
    const html = await page.text();
    assert.ok(html.includes('data-ssr="true"'), 'Resource has no prerendered content: ' + item.path);
    verified++;
  }));
}
const unauthenticated = await fetch(base + '/.netlify/functions/resource-publication', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"refresh"}',
});
assert.equal(unauthenticated.status, 401, 'Unauthenticated refresh must be rejected.');
console.log(JSON.stringify({ base, generatedAt: manifest.generated_at, resourcesAndSitemapVerified: verified,
  currentPublicContentMatches: true, unauthenticatedRefreshRejected: true }));
