import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ isAuthed: false, configured: true, signOut: vi.fn() }));
vi.mock('../auth/PublicAuthContext', () => ({ usePublicAuth: () => auth }));

import Layout from './Layout';

function render(path = '/resources/'): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="*" element={<p>page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function section(html: string, tag: 'nav' | 'footer'): string {
  return html.slice(html.indexOf(`<${tag}`), html.indexOf(`</${tag}>`));
}

/** [href, visible text] for every link, icons stripped. */
function links(html: string): Array<[string, string]> {
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map(([, href, inner]) => [
    href,
    inner.replace(/<[^>]+>/g, '').replace(/<!-- -->/g, '').trim(),
  ]);
}

describe('top navigation', () => {
  beforeEach(() => {
    auth.isAuthed = false;
    auth.configured = true;
  });

  it('shows the four sections and one account action when signed out', () => {
    expect(links(section(render(), 'nav'))).toEqual([
      ['/', 'Housing Navigator'],
      ['/resources/', 'Find resources'],
      ['/waitlist/', 'Waitlists'],
      ['/affordable-housing/', 'Affordable housing'],
      ['/map/', 'Map'],
      ['/signup', 'Get alerts'],
    ]);
  });

  it('puts Dashboard and Sign out behind a closed account button when signed in', () => {
    auth.isAuthed = true;
    const nav = section(render(), 'nav');
    expect(nav).toMatch(/<button[^>]*aria-expanded="false"[^>]*>.*Your account/);
    const panel = nav.slice(nav.indexOf('Your account'));
    expect(panel).toMatch(/<div id="[^"]+" hidden=""/);
    expect(links(panel)).toEqual([['/dashboard', 'Dashboard']]);
    expect(panel).toContain('Sign out');
    expect(nav).not.toContain('Get alerts');
    expect(nav).not.toContain('href="/login"');
  });

  it('shows no account action when public sign-in is not configured', () => {
    auth.configured = false;
    const nav = section(render(), 'nav');
    expect(nav).not.toContain('Get alerts');
    expect(nav).not.toContain('Your account');
  });

  it('marks the current section', () => {
    const tags = section(render('/waitlist/some-list/'), 'nav').match(/<a [^>]*>/g) ?? [];
    const current = tags.filter((tag) => /\btext-primary\b/.test(tag) && !/bg-primary/.test(tag));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/waitlist/"');
  });

  it('links About from the footer', () => {
    expect(links(section(render(), 'footer'))[0]).toEqual(['/mission/', 'About']);
  });
});
