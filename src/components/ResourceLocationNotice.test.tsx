import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ResourceLocationNotice from './ResourceLocationNotice';
import { resourceSearchContext } from '../utils/resourceSearchLocation';
import type { ServiceArea } from '../types';

const render = (query: string, override?: ServiceArea | null) => renderToStaticMarkup(
  <ResourceLocationNotice context={resourceSearchContext(query, override)} onSelect={() => {}} onUseQuery={() => {}} />,
);

describe('visible location feedback', () => {
  it('announces the applied county and links to editable filters', () => {
    const html = render('rent in Spokane');
    expect(html).toContain('Spokane County, WA, including statewide services');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('href="#resource-area-filter"');
    expect(html).toContain('Change area');
  });
  it('provides separately labeled state choices for shared county names', () => {
    const html = render('rent in Benton County');
    expect(html).toContain('Benton County, OR</button>');
    expect(html).toContain('Benton County, WA</button>');
    expect(html).toContain('Choose a state or county');
    expect(html).not.toContain('Searching services covering');
  });
  it('clearly announces manual overrides, including intentionally unfiltered results', () => {
    const html = render('rent in Spokane', null);
    expect(html).toContain('Searching across Oregon and Washington');
    expect(html).toContain('Your selected area is used instead of');
    expect(html).toContain('Use location from search');
  });
  it('does not report an unrecognized location as having no services', () => {
    const html = render('rent in Boston');
    expect(html).toContain('Choose a state and county below');
    expect(html).not.toContain('No resources');
  });
  it('keeps arbitrary query text escaped', () => {
    const html = render('rent in <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
