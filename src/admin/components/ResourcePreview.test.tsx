import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ResourcePreview from './ResourcePreview';
import DirectoryCardView from '../../components/DirectoryCardView';
import ResourceDetailView from '../../components/ResourceDetailView';
import DirectoryCard from '../../components/DirectoryCard';
import ResourceDetail from '../../pages/ResourceDetail';
import RequireAdmin from '../RequireAdmin';
import { programFromResourceRow } from '../../services/data/mappers';
import type { ResourceRow } from '../../services/data/dbTypes';

const state = vi.hoisted(() => ({
  auth: { session: null as object | null, isAdmin: false, loading: false, configured: true },
  toggle: vi.fn(),
}));
vi.mock('../AdminAuthContext', () => ({ useAdminAuth: () => state.auth }));
vi.mock('../../auth/UserDataContext', () => ({ useUserData: () => ({isResourceSaved: () => false, toggleResource: state.toggle}) }));
vi.mock('../../hooks/usePrograms', () => ({ usePrograms: () => ({programs: [], loading: false, error: null}) }));

const resource: ResourceRow = {
  id: 'preview-only-id', name: 'Preview housing support', category: 'supportive_services',
  county: 'Spokane', city: 'Spokane', state: 'WA', description: 'Public summary.',
  who_qualifies: 'Eligibility for families.', who_it_helps: ['family'],
  application_method: 'phone', referral_required: false, phone: '509-325-5005',
  website: 'https://example.org/help', address: null, source_url: 'https://example.org/source',
  source_type: 'Official provider', last_verified: '2026-08-12',
  public_notes: 'Assessment does not guarantee housing.', internal_notes: 'PRIVATE-SENTINEL-DO-NOT-RENDER',
  priority_score: 1, published: false,
  service_areas: [{state: 'WA', county: 'Spokane'}], service_tags: [],
};
const program = programFromResourceRow(resource);
const render = (element: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

describe('private resource preview', () => {
  it('uses the canonical mapping without admin-only fields', () => {
    expect(program).toMatchObject({program_name: resource.name, eligibility_summary: resource.who_qualifies, notes: resource.public_notes});
    expect(program).not.toHaveProperty('internal_notes');
    expect(program).not.toHaveProperty('published');
    expect(program.last_verified).toBe('2026-08-12');
  });
  it('renders without public auth/data providers and never displays internal notes', () => {
    const html = render(<ResourcePreview resource={resource} />);
    expect(html).toContain('Private resource preview');
    expect(html).toContain('including unsaved changes');
    expect(html).not.toContain(resource.internal_notes);
    expect(html).not.toContain('type="submit"');
    expect(html).not.toMatch(/<dialog[^>]*\bopen(?:[\s=>])/);
    expect(state.toggle).not.toHaveBeenCalled();
  });
  it('shows unsaved values instead of a stale public record', () => {
    const html = render(<ResourcePreview resource={{...resource, description: 'Unsaved current summary'}} />);
    expect(html).toContain('Unsaved current summary');
    expect(html).not.toContain('Public summary.');
  });
  it('disables the opener during save/loading', () => {
    expect(render(<ResourcePreview resource={resource} disabled />)).toMatch(/<button[^>]*disabled=""/);
  });
  it('has no writable save action or public draft detail link', () => {
    const html = render(<DirectoryCardView program={program} onViewDetails={() => {}} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Save resource"/);
    expect(html).toContain('View details');
    expect(html).not.toMatch(/href="\/resources\//);
    expect(html).toContain('href="tel:+15093255005"');
  });
  it('uses the full detail presentation for notes and verification', () => {
    const html = render(<ResourceDetailView program={program} onBack={() => {}} />);
    for (const text of ['Additional information', resource.public_notes!, 'August 12, 2026', 'Who may qualify', 'Back to card preview']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain(resource.internal_notes);
    expect(html).toContain('href="https://example.org/source"');
  });
  it('preserves card truncation and the public notes fallback', () => {
    const html = render(<DirectoryCardView program={program} />);
    expect(html).toContain('line-clamp-3');
    expect(html).not.toContain(resource.public_notes);
    expect(render(<DirectoryCardView program={{...program, description: ''}} />)).toContain(resource.public_notes);
  });
  it('escapes source text rather than treating it as HTML', () => {
    const html = render(<ResourceDetailView program={{...program, notes: '<script>alert(1)</script>'}} />);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('public behavior and admin boundary stay intact', () => {
  it('preserves the public card links and enabled save action', () => {
    const html = render(<DirectoryCard program={program} />);
    expect(html).toMatch(/href="\/resources\//);
    expect(html).not.toContain('disabled=""');
    expect(state.toggle).not.toHaveBeenCalled();
  });
  it('preserves public detail back navigation and stale-data warning', () => {
    const html = render(<ResourceDetailView program={program} error={new Error('offline')} />);
    expect(html).toContain('Back to all resources');
    expect(html).toContain('Live updates are temporarily unavailable');
  });
  it('does not introduce draft lookup into the public detail page', () => {
    const html = render(<ResourceDetail />);
    expect(html).not.toContain(resource.name);
    expect(html).not.toContain('Private resource preview');
  });
  it.each([
    {session: null, isAdmin: false, loading: false},
    {session: {}, isAdmin: false, loading: false},
    {session: {}, isAdmin: true, loading: true},
  ])('does not mount preview for unauthorized/unresolved sessions: %j', auth => {
    state.auth = {...auth, configured: true};
    const html = render(<RequireAdmin><ResourcePreview resource={resource} /></RequireAdmin>);
    expect(html).not.toContain(resource.name);
    expect(html).not.toContain('Private resource preview');
  });
  it('allows the preview within the existing authorized admin guard', () => {
    state.auth = {session: {}, isAdmin: true, loading: false, configured: true};
    expect(render(<RequireAdmin><ResourcePreview resource={resource} /></RequireAdmin>)).toContain(resource.name);
  });
});
