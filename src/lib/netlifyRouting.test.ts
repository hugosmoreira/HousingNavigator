import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const netlifyConfig = readFileSync(resolve(process.cwd(), 'netlify.toml'), 'utf8');
const notFoundPage = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8');
const indexNowKey = 'e060bb774e804994906a00517eb1de56';

const applicationRoutes = [
  '/resources',
  '/waitlist',
  '/mission',
  '/privacy',
  '/terms',
  '/help',
  '/accessibility',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/dashboard',
  '/admin',
  '/admin/login',
  '/admin/dashboard',
  '/admin/resources',
  '/admin/resources/new',
  '/admin/resources/:id/edit',
  '/admin/properties',
  '/admin/properties/new',
  '/admin/properties/:id/edit',
  '/admin/waitlists',
  '/admin/waitlists/new',
  '/admin/waitlists/:id/edit',
  '/admin/alerts',
  '/admin/review',
  '/admin/users',
];

function redirectBlockFor(route: string): string | undefined {
  return netlifyConfig
    .split('[[redirects]]')
    .find((block) => block.includes(`from = "${route}"`));
}

function headerBlockFor(route: string): string | undefined {
  return netlifyConfig
    .split('[[headers]]')
    .find((block) => block.includes(`for = "${route}"`));
}

describe('Netlify application routing', () => {
  it.each(applicationRoutes)('rewrites %s to the clean SPA shell with HTTP 200', (route) => {
    const block = redirectBlockFor(route);

    expect(block).toBeDefined();
    expect(block).toContain('to = "/spa.html"');
    expect(block).toContain('status = 200');
  });

  it('does not turn every unknown path into a soft 404', () => {
    expect(redirectBlockFor('/*')).toBeUndefined();
  });

  it('provides a non-indexable custom 404 document', () => {
    expect(notFoundPage).toContain('<title>Page not found | Housing Navigator</title>');
    expect(notFoundPage).toContain('name="robots" content="noindex,nofollow"');
    expect(notFoundPage).toContain('href="/resources/"');
    expect(notFoundPage).toContain('href="/waitlist/"');
  });

  it('serves an uncached deployment marker for post-deploy notifications', () => {
    const block = headerBlockFor('/.well-known/housing-navigator-deploy.txt');
    expect(block).toContain('Cache-Control = "no-store, max-age=0"');
    expect(block).toContain('X-Robots-Tag = "noindex, nofollow"');
  });

  it('hosts the public IndexNow ownership key at the site root', () => {
    const key = readFileSync(resolve(process.cwd(), `public/${indexNowKey}.txt`), 'utf8').trim();
    expect(key).toBe(indexNowKey);
    expect(headerBlockFor(`/${indexNowKey}.txt`)).toContain(
      'Cache-Control = "public, max-age=86400"',
    );
  });
});
