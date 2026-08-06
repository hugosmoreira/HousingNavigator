import { describe, expect, it } from 'vitest';
import {
  STATIC_PROGRAMS,
  STATIC_WAITLISTS,
} from '../services/data/staticDataService';
import { resourcePath, waitlistPath } from './entityRoutes';
import {
  resolveStructuredData,
  serializeStructuredData,
  type StructuredDataDocument,
  type StructuredDataNode,
} from './structuredData';

function nodeByType(
  document: StructuredDataDocument,
  type: string,
): StructuredDataNode {
  const node = document['@graph'].find((candidate) => candidate['@type'] === type);
  expect(node, `Expected a ${type} node`).toBeDefined();
  return node!;
}

describe('structured data', () => {
  it('publishes stable site identity and organization information', () => {
    const document = resolveStructuredData('/');
    expect(document?.['@context']).toBe('https://schema.org');

    const website = nodeByType(document!, 'WebSite');
    expect(website).toMatchObject({
      name: 'Housing Navigator',
      alternateName: 'HousingNavigator.us',
      url: 'https://housingnavigator.us/',
      publisher: { '@id': 'https://housingnavigator.us/#organization' },
    });

    const organization = nodeByType(document!, 'Organization');
    expect(organization.logo).toMatchObject({
      url: 'https://housingnavigator.us/apple-touch-icon.png',
      width: 180,
      height: 180,
    });
  });

  it('describes the resource directory as a complete item list', () => {
    const document = resolveStructuredData('/resources/');
    const page = nodeByType(document!, 'CollectionPage');
    const list = nodeByType(document!, 'ItemList');

    expect(page.mainEntity).toEqual({
      '@id': 'https://housingnavigator.us/resources/#item-list',
    });
    expect(list.numberOfItems).toBe(STATIC_PROGRAMS.length);
    expect(list.itemListElement).toHaveLength(STATIC_PROGRAMS.length);
    expect((list.itemListElement as StructuredDataNode[])[0]).toMatchObject({
      position: 1,
      name: STATIC_PROGRAMS[0].program_name,
      url: `https://housingnavigator.us${resourcePath(STATIC_PROGRAMS[0])}`,
    });
  });

  it('links a resource page to its third-party service and review source', () => {
    const program = STATIC_PROGRAMS[0];
    const document = resolveStructuredData(resourcePath(program));
    const page = nodeByType(document!, 'ItemPage');
    const service = nodeByType(document!, 'Service');
    const breadcrumb = nodeByType(document!, 'BreadcrumbList');

    expect(page).toMatchObject({
      dateModified: program.last_verified,
      citation: program.source_url || program.website,
      reviewedBy: { '@id': 'https://housingnavigator.us/#organization' },
      mainEntity: {
        '@id': `https://housingnavigator.us${resourcePath(program)}#service`,
      },
    });
    expect(service).toMatchObject({
      name: program.program_name,
      url: program.website,
      areaServed: { name: `${program.county} County` },
    });
    expect(breadcrumb.itemListElement).toHaveLength(3);
    expect((breadcrumb.itemListElement as StructuredDataNode[])[1]).toMatchObject({
      name: 'Housing resources',
      item: 'https://housingnavigator.us/resources/',
    });
  });

  it('describes a waitlist page with its source review date and hierarchy', () => {
    const waitlist = STATIC_WAITLISTS[0];
    const document = resolveStructuredData(waitlistPath(waitlist));
    const page = nodeByType(document!, 'ItemPage');
    const service = nodeByType(document!, 'Service');

    expect(page).toMatchObject({
      dateModified: waitlist.last_checked,
      citation: waitlist.website,
      reviewedBy: { '@id': 'https://housingnavigator.us/#organization' },
    });
    expect(service).toMatchObject({
      name: waitlist.agency,
      serviceType: 'Affordable housing waitlist',
      url: waitlist.website,
    });
  });

  it('does not publish schema for private or unknown routes', () => {
    expect(resolveStructuredData('/login')).toBeNull();
    expect(resolveStructuredData('/not-a-real-page')).toBeNull();
    expect(resolveStructuredData('/resources/not-a-real-resource/')).toBeNull();
  });

  it('serializes data without allowing a closing script tag', () => {
    const document: StructuredDataDocument = {
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'Thing', name: '</script><script>alert(1)</script>' }],
    };
    const serialized = serializeStructuredData(document);

    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)['@graph'][0].name).toBe(
      '</script><script>alert(1)</script>',
    );
  });
});
