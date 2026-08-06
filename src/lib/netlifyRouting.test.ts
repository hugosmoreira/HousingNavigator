import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const netlifyConfig = readFileSync(resolve(process.cwd(), 'netlify.toml'), 'utf8');
const notFoundPage = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8');

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
  '/admin/resources',
  '/admin/resources/new',
  '/admin/resources/:id/edit',
  '/admin/waitlists',
  '/admin/waitlists/new',
  '/admin/waitlists/:id/edit',
  '/admin/alerts',
  '/admin/review',
];

function redirectBlockFor(route: string): string | undefined {
  return netlifyConfig
    .split('[[redirects]]')
    .find((block) => block.includes(`from = "${route}"`));
}

describe('Netlify application routing', () => {
  it.each(applicationRoutes)('rewrites %s to the SPA with HTTP 200', (route) => {
    const block = redirectBlockFor(route);

    expect(block).toBeDefined();
    expect(block).toContain('to = "/index.html"');
    expect(block).toContain('status = 200');
  });

  it('does not turn every unknown path into a soft 404', () => {
    expect(redirectBlockFor('/*')).toBeUndefined();
  });

  it('provides a non-indexable custom 404 document', () => {
    expect(notFoundPage).toContain('<title>Page not found | Housing Navigator</title>');
    expect(notFoundPage).toContain('name="robots" content="noindex,nofollow"');
    expect(notFoundPage).toContain('href="/resources"');
    expect(notFoundPage).toContain('href="/waitlist"');
  });
});
