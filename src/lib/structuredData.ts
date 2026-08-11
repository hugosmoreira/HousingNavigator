import {
  DIRECTORY_CATEGORY_LABELS,
  legacyToDirectoryCategory,
} from '../data/categoryMap';
import {
  countyLandingPage,
  findLocalLandingPage,
  localLandingPrograms,
} from '../data/localLandingPages';
import { STATE_NAMES, serviceAreaSummary, serviceAreasForProgram } from '../data/serviceAreas';
import { resourcePath, waitlistPath } from './entityRoutes';
import { resolvePageMetadata, SITE_URL } from './pageMetadata';
import {
  STATIC_PROGRAMS,
  STATIC_WAITLISTS,
} from '../services/data/staticDataService';
import type { Program, WaitlistEntry } from '../types';

export type StructuredDataNode = Record<string, unknown>;

export interface StructuredDataDocument {
  '@context': 'https://schema.org';
  '@graph': StructuredDataNode[];
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const LOGO_URL = `${SITE_URL}/apple-touch-icon.png`;
const SOCIAL_IMAGE_URL = `${SITE_URL}/social-card.png`;

const PAGE_LABELS: Record<string, string> = {
  '/resources': 'Housing resources',
  '/waitlist': 'Housing waitlists',
  '/mission': 'About Housing Navigator',
  '/help': 'Housing search help',
  '/accessibility': 'Accessibility',
  '/privacy': 'Privacy policy',
  '/terms': 'Terms of service',
};

const HOUSEHOLD_LABELS: Record<Program['who_it_helps'][number], string> = {
  single_adult: 'Single adults',
  family: 'Families',
  senior: 'Seniors',
  veteran: 'Veterans',
  disability: 'People with disabilities',
};

function pageId(canonicalUrl: string): string {
  return `${canonicalUrl}#webpage`;
}

function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

function compact<T extends StructuredDataNode>(node: T): T {
  return Object.fromEntries(
    Object.entries(node).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }),
  ) as T;
}

function organizationNode(): StructuredDataNode {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Housing Navigator',
    url: `${SITE_URL}/`,
    description:
      'A public-interest directory of housing resources and affordable housing waitlist information for Oregon and Washington.',
    logo: {
      '@type': 'ImageObject',
      '@id': `${SITE_URL}/#logo`,
      url: LOGO_URL,
      contentUrl: LOGO_URL,
      width: 180,
      height: 180,
      caption: 'Housing Navigator',
    },
    areaServed: [
      { '@type': 'State', name: 'Oregon' },
      { '@type': 'State', name: 'Washington' },
    ],
  };
}

function websiteNode(): StructuredDataNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: 'Housing Navigator',
    alternateName: 'HousingNavigator.us',
    description:
      'Find housing help and track affordable housing waitlists in Oregon and Washington.',
    publisher: { '@id': ORGANIZATION_ID },
    inLanguage: 'en-US',
  };
}

function imageNode(): StructuredDataNode {
  return {
    '@type': 'ImageObject',
    '@id': `${SITE_URL}/#social-image`,
    url: SOCIAL_IMAGE_URL,
    contentUrl: SOCIAL_IMAGE_URL,
    width: 1200,
    height: 630,
    caption: 'Housing Navigator — find housing help and track waitlists',
  };
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

function breadcrumbNode(
  canonicalUrl: string,
  items: BreadcrumbItem[],
): StructuredDataNode | null {
  if (items.length < 2) return null;
  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function basePageNode(
  canonicalUrl: string,
  title: string,
  description: string,
  pageType: 'WebPage' | 'CollectionPage' | 'ItemPage',
  breadcrumb: StructuredDataNode | null,
): StructuredDataNode {
  return compact({
    '@type': pageType,
    '@id': pageId(canonicalUrl),
    url: canonicalUrl,
    name: title,
    description,
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORGANIZATION_ID },
    primaryImageOfPage: { '@id': `${SITE_URL}/#social-image` },
    breadcrumb: breadcrumb ? { '@id': `${canonicalUrl}#breadcrumb` } : undefined,
    inLanguage: 'en-US',
  });
}

function sourceUrlForProgram(program: Program): string | undefined {
  return program.source_url || program.website || undefined;
}

function sourceUrlForWaitlist(waitlist: WaitlistEntry): string | undefined {
  return waitlist.source_url || waitlist.application_link || waitlist.website || undefined;
}

function programServiceNode(
  program: Program,
  canonicalUrl: string,
): StructuredDataNode {
  const directoryCategory =
    program.directory_category ?? legacyToDirectoryCategory(program.category);
  const sourceUrl = sourceUrlForProgram(program);
  const audiences = program.who_it_helps.map((group) => ({
    '@type': 'Audience',
    audienceType: HOUSEHOLD_LABELS[group],
  }));
  const serviceChannel = compact({
    '@type': 'ServiceChannel',
    serviceUrl: program.website || sourceUrl,
    servicePhone: program.phone
      ? {
          '@type': 'ContactPoint',
          telephone: program.phone,
          contactType: 'housing assistance',
        }
      : undefined,
  });
  const serviceAreas = serviceAreasForProgram(program);
  const servedAreas = serviceAreas.map((area) => ({
    '@type': 'AdministrativeArea',
    name: area.county
      ? `${area.county} County, ${STATE_NAMES[area.state]}`
      : STATE_NAMES[area.state],
  }));

  return compact({
    '@type': 'Service',
    '@id': `${canonicalUrl}#service`,
    name: program.program_name,
    description:
      program.description ||
      program.eligibility_summary ||
      program.notes ||
      `Housing assistance information for ${serviceAreaSummary(serviceAreas)}.`,
    serviceType: DIRECTORY_CATEGORY_LABELS[directoryCategory],
    url: program.website || canonicalUrl,
    mainEntityOfPage: { '@id': pageId(canonicalUrl) },
    areaServed:
      servedAreas.length === 1
        ? servedAreas[0]
        : servedAreas.length > 1
          ? servedAreas
          : undefined,
    audience: audiences,
    availableChannel:
      serviceChannel.serviceUrl || serviceChannel.servicePhone
        ? serviceChannel
        : undefined,
  });
}

function waitlistServiceNode(
  waitlist: WaitlistEntry,
  canonicalUrl: string,
): StructuredDataNode {
  const sourceUrl = sourceUrlForWaitlist(waitlist);
  return compact({
    '@type': 'Service',
    '@id': `${canonicalUrl}#service`,
    name: waitlist.program_name || waitlist.agency,
    description:
      waitlist.notes ||
      `Affordable housing waitlist information for ${waitlist.county} County.`,
    serviceType: 'Affordable housing waitlist',
    url: sourceUrl || canonicalUrl,
    mainEntityOfPage: { '@id': pageId(canonicalUrl) },
    areaServed: {
      '@type': 'AdministrativeArea',
      name: `${waitlist.county} County`,
    },
  });
}

function collectionItemList(
  canonicalUrl: string,
  items: Array<{ name: string; path: string }>,
): StructuredDataNode {
  return {
    '@type': 'ItemList',
    '@id': `${canonicalUrl}#item-list`,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

function genericBreadcrumbs(path: string, canonicalUrl: string): BreadcrumbItem[] {
  const label = PAGE_LABELS[path];
  if (!label) return [];
  return [
    { name: 'Home', url: `${SITE_URL}/` },
    { name: label, url: canonicalUrl },
  ];
}

export function resolveStructuredData(
  pathname: string,
): StructuredDataDocument | null {
  const metadata = resolvePageMetadata(pathname);
  if (!metadata.index || !metadata.canonicalUrl) return null;

  const canonicalUrl = metadata.canonicalUrl;
  const graph: StructuredDataNode[] = [
    organizationNode(),
    websiteNode(),
    imageNode(),
  ];
  let breadcrumb: StructuredDataNode | null = null;
  let pageType: 'WebPage' | 'CollectionPage' | 'ItemPage' = 'WebPage';
  let mainEntity: StructuredDataNode | null = null;
  let dateModified: string | undefined;
  let citation: string | undefined;

  const resourcePathMatch = metadata.path.match(/^\/resources\/([^/]+)$/);
  const waitlistPathMatch = metadata.path.match(/^\/waitlist\/([^/]+)$/);
  const localLandingPage = findLocalLandingPage(metadata.path);

  if (localLandingPage) {
    const programs = localLandingPrograms(localLandingPage, STATIC_PROGRAMS);
    const countyPage = countyLandingPage(localLandingPage.county);
    pageType = 'CollectionPage';
    dateModified = programs
      .map((program) => program.last_verified)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];
    breadcrumb = breadcrumbNode(canonicalUrl, [
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Housing resources', url: `${SITE_URL}/resources/` },
      ...(localLandingPage.service
        ? [{
            name: `${localLandingPage.county} County`,
            url: `${SITE_URL}${countyPage.path}/`,
          }]
        : []),
      { name: localLandingPage.heading, url: canonicalUrl },
    ]);
    mainEntity = collectionItemList(
      canonicalUrl,
      programs.map((program) => ({
        name: program.program_name,
        path: resourcePath(program),
      })),
    );
  } else if (resourcePathMatch) {
    const program = STATIC_PROGRAMS.find(
      (candidate) => resourcePath(candidate) === `${metadata.path}/`,
    );
    if (!program) return null;
    pageType = 'ItemPage';
    dateModified = program.last_verified || undefined;
    citation = sourceUrlForProgram(program);
    breadcrumb = breadcrumbNode(canonicalUrl, [
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Housing resources', url: `${SITE_URL}/resources/` },
      { name: program.program_name, url: canonicalUrl },
    ]);
    mainEntity = programServiceNode(program, canonicalUrl);
  } else if (waitlistPathMatch) {
    const waitlist = STATIC_WAITLISTS.find(
      (candidate) => waitlistPath(candidate) === `${metadata.path}/`,
    );
    if (!waitlist) return null;
    pageType = 'ItemPage';
    dateModified = waitlist.last_checked || undefined;
    citation = sourceUrlForWaitlist(waitlist);
    breadcrumb = breadcrumbNode(canonicalUrl, [
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Housing waitlists', url: `${SITE_URL}/waitlist/` },
      { name: waitlist.agency, url: canonicalUrl },
    ]);
    mainEntity = waitlistServiceNode(waitlist, canonicalUrl);
  } else if (metadata.path === '/resources') {
    pageType = 'CollectionPage';
    breadcrumb = breadcrumbNode(
      canonicalUrl,
      genericBreadcrumbs(metadata.path, canonicalUrl),
    );
    mainEntity = collectionItemList(
      canonicalUrl,
      STATIC_PROGRAMS.map((program) => ({
        name: program.program_name,
        path: resourcePath(program),
      })),
    );
  } else if (metadata.path === '/waitlist') {
    pageType = 'CollectionPage';
    breadcrumb = breadcrumbNode(
      canonicalUrl,
      genericBreadcrumbs(metadata.path, canonicalUrl),
    );
    mainEntity = collectionItemList(
      canonicalUrl,
      STATIC_WAITLISTS.map((waitlist) => ({
        name: waitlist.agency,
        path: waitlistPath(waitlist),
      })),
    );
  } else {
    breadcrumb = breadcrumbNode(
      canonicalUrl,
      genericBreadcrumbs(metadata.path, canonicalUrl),
    );
  }

  const page = compact({
    ...basePageNode(
      canonicalUrl,
      metadata.title,
      metadata.description,
      pageType,
      breadcrumb,
    ),
    dateModified,
    citation,
    reviewedBy: dateModified ? { '@id': ORGANIZATION_ID } : undefined,
    mainEntity: mainEntity
      ? { '@id': mainEntity['@id'] as string }
      : metadata.path === '/'
        ? { '@id': WEBSITE_ID }
        : undefined,
  });

  graph.push(page);
  if (breadcrumb) graph.push(breadcrumb);
  if (mainEntity) graph.push(mainEntity);

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

export function serializeStructuredData(
  document: StructuredDataDocument,
): string {
  return JSON.stringify(document).replace(/</g, '\\u003c');
}

export function applyStructuredData(
  pathname: string,
  documentRef: Document = document,
): void {
  const selector = 'script[data-housing-navigator-schema]';
  const existing = Array.from(
    documentRef.querySelectorAll<HTMLScriptElement>(selector),
  );
  const structuredData = resolveStructuredData(pathname);

  if (!structuredData) {
    existing.forEach((script) => script.remove());
    return;
  }

  const script = existing.shift() ?? documentRef.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.housingNavigatorSchema = 'true';
  script.textContent = serializeStructuredData(structuredData);
  if (!script.isConnected) documentRef.head.appendChild(script);
  existing.forEach((duplicate) => duplicate.remove());
}
