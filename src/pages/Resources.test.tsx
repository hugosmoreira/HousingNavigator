import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Resources from './Resources';
import ResourceDetailView from '../components/ResourceDetailView';
import { LOCAL_LANDING_PAGES, localLandingPrograms } from '../data/localLandingPages';
import type { Program } from '../types';

const data = vi.hoisted(() => ({ programs: [] as Program[], error: null as Error | null, clientReady: true }));
vi.mock('../hooks/usePrograms', () => ({ usePrograms: () => ({ ...data, loading: false }) }));
vi.mock('../hooks/useClientReady', () => ({ useClientReady: () => data.clientReady }));
vi.mock('../auth/UserDataContext', () => ({ useUserData: () => ({ isResourceSaved: () => false, toggleResource: async () => {} }) }));

const base: Program = {
  id: 'test', program_name: 'Example provider', county: 'Multnomah', state: 'OR',
  category: 'comprehensive_support', directory_category: 'supportive_services', who_it_helps: [],
  application_method: 'phone', referral_required: false, phone: '503-555-0100', website: 'https://example.org/help',
  status: 'unknown', status_confidence: 'low', priority_score: 3, notes: '', last_verified: '2026-09-04',
};
function render(path = '/resources/', query = '') {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? '?' + path.split('?')[1] : '', state: { resourceQuery: query } }]}><Resources /></MemoryRouter>);
}
function titles(html: string) {
  return [...html.matchAll(/<h3[^>]*><a[^>]*>(.*?)<\/a><\/h3>/g)].map(match => match[1]);
}
beforeEach(() => {
  data.error = null;
  data.clientReady = true;
  data.programs = [
    { ...base, id: 'or-mover', program_name: 'Local moving crew', service_tags: ['moving_help'], service_areas: [{ state: 'OR', county: 'Multnomah' }] },
    { ...base, id: 'wa-mover', program_name: 'Washington moving crew', service_tags: ['moving_help'], service_areas: [{ state: 'WA', county: 'King' }] },
    { ...base, id: 'or-rent', program_name: 'Oregon rent program', directory_category: 'rent_assistance', service_areas: [{ state: 'OR', county: null }] },
    { ...base, id: 'internet', program_name: 'Student internet program', service_tags: ['internet_assistance'], service_areas: [{ state: 'OR', county: null }, { state: 'WA', county: null }] },
  ];
});
describe('resource-first directory rendering', () => {
  it('matches the prerendered HTML before applying browser-only filters and saved query', () => {
    data.clientReady = false;
    expect(render('/resources/?area=WA:King&need=service:moving_help', 'moving')).toBe(render('/resources/'));
    expect(render('/housing-help/clark-county/?area=OR:Multnomah', 'moving')).toBe(render('/housing-help/clark-county/'));
  });
  it('offers a filtered return link without putting private search words in its URL', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ResourceDetailView program={base}
      returnTo={{ url: '/resources/?area=OR%3AMultnomah&need=service%3Amoving_help', query: 'private words' }} /></MemoryRouter>);
    expect(html).toContain('Back to results');
    expect(html).toContain('href="/resources/?area=OR%3AMultnomah&amp;need=service%3Amoving_help"');
    expect(html).not.toContain('private words');
    const direct = renderToStaticMarkup(<MemoryRouter><ResourceDetailView program={base} /></MemoryRouter>);
    expect(direct).toContain('Back to all resources');
  });
  it('puts search, need, area and real cards on one page without a county detour or instruction panels', () => {
    const html = render();
    for (const text of ['Search resources', 'Help needed', 'Area', 'Moving help', 'Internet assistance', 'Local moving crew']) expect(html).toContain(text);
    for (const text of ['Browse by area', 'How to use this page', 'Before you contact a program', 'verified listings', 'Latest review', 'More filters', 'overflow-x-auto']) expect(html).not.toContain(text);
    expect(html.indexOf('Help needed')).toBeLessThan(html.indexOf('<article'));
    expect(titles(html)).toHaveLength(4);
    expect(html).toContain('tel:+15035550100');
    expect(html).toContain('Last verified Sep 4, 2026');
  });
  it('selects a need directly without requiring an additional category selection', () => {
    expect(titles(render('/resources/?need=service:moving_help&area=OR:Multnomah'))).toEqual(['Local moving crew']);
    expect(titles(render('/resources/?need=service:internet_assistance&area=WA:King'))).toEqual(['Student internet program']);
  });
  it.each(LOCAL_LANDING_PAGES)('renders the same filters and expected county/service listings at $path', page => {
    const html = render(page.path);
    expect(html).toContain(page.heading);
    expect(html).toContain('Help needed');
    expect(titles(html)).toEqual(localLandingPrograms(page, data.programs).map(program => program.program_name));
    expect(html).not.toContain('How to use this page');
  });
  it('leaves unknown county links on the not-found page', () => {
    expect(titles(render('/housing-help/not-a-county/'))).toEqual([]);
    expect(render('/housing-help/not-a-county/')).not.toContain('Help needed');
  });
  it('asks for location clarification without suggesting there is no assistance', () => {
    const html = render('/resources/', 'moving in Benton County');
    expect(html).toContain('Which area did you mean');
    expect(html).toContain('Benton County, OR</button>');
    expect(html).toContain('Benton County, WA</button>');
    expect(titles(html)).toEqual([]);
    expect(html).not.toContain('No matching resources');
  });
  it('does not show unrelated results for malformed area links', () => {
    const html = render('/resources/?area=WA:Multnomah');
    expect(titles(html)).toEqual([]);
    expect(html).toContain('unrecognized filter');
  });
  it('keeps statewide support and distinguishes an empty directory result from no available help', () => {
    expect(titles(render('/resources/?area=OR:Jackson&need=category:rent_assistance'))).toEqual(['Oregon rent program']);
    const html = render('/resources/?area=WA:Clark&need=service:moving_help');
    expect(html).toContain('No matching resources');
    expect(html).toContain('does not mean help is unavailable');
  });
  it('shows the safe cached cards when a refresh fails', () => {
    data.error = new Error('network unavailable');
    const html = render();
    expect(html).toContain('couldn’t refresh');
    expect(titles(html)).toHaveLength(4);
    expect(html).not.toContain('network unavailable');
  });
  it('keeps a selected household visible even with its selector collapsed', () => {
    const html = render('/resources/?household=family');
    expect(html).toContain('Families');
    expect(html).toContain('aria-expanded="false"');
  });
});
