import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ResourceLocationNotice from './ResourceLocationNotice';
import { resourceSearchContext } from '../utils/resourceSearchLocation';
import type { ServiceArea } from '../types';

const render = (query: string, override?: ServiceArea | null) => renderToStaticMarkup(
  <ResourceLocationNotice context={resourceSearchContext(query, override)} onSelect={() => {}} onUseQuery={() => {}} />,
);

describe('visible location feedback', () => {
  it('announces the applied county without a duplicate visible location control', () => {
    const html = render('rent in Spokane');
    expect(html).toContain('Spokane County, WA, including statewide services');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="sr-only"');
    expect(html).not.toContain('Change area');
    expect(html).not.toContain('<a ');
  });
  it('provides separately labeled state choices for shared county names', () => {
    const html = render('rent in Benton County');
    expect(html).toContain('Benton County, OR</button>');
    expect(html).toContain('Benton County, WA</button>');
    expect(html).toContain('Which area did you mean');
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
    expect(html).toContain('Choose an area above');
    expect(html).not.toContain('No resources');
  });
  it('keeps arbitrary query text escaped', () => {
    const html = render('rent in <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('does not add visual guidance before the visitor starts searching', () => {
    const html = render('');
    expect(html).toContain('class="sr-only"');
    expect(html).not.toContain('<button');
  });
  it('does not ask again after the visitor confirms a suggested or ambiguous area', () => {
    for (const query of ['rent in Spokne', 'rent in Benton County']) {
      const choice = resourceSearchContext(query).choices[0];
      const html = render(query, choice);
      expect(html).toContain('class="sr-only"');
      expect(html).not.toContain('Use location from search');
    }
  });
});
