import catalogData from '../data/catalog.json';
import waitlistsData from '../data/waitlists.json';
import {
  findResourceBySlug,
  findWaitlistBySlug,
  resourcePath,
  waitlistPath,
} from './entityRoutes';
import type { Program, WaitlistEntry } from '../types';

export const SITE_URL = 'https://housingnavigator.us';
export const SOCIAL_IMAGE_URL = `${SITE_URL}/social-card.png`;
export const SOCIAL_IMAGE_ALT =
  'Housing Navigator — find housing help and track waitlists';

const STATIC_PROGRAMS = catalogData as unknown as Program[];
const STATIC_WAITLISTS = waitlistsData as unknown as WaitlistEntry[];

export interface PageMetadata {
  title: string;
  description: string;
  index: boolean;
}

export interface ResolvedPageMetadata extends PageMetadata {
  canonicalUrl: string | null;
  path: string;
  openGraphType: 'website';
  socialImageUrl: string;
  socialImageAlt: string;
}

export const INDEXABLE_PAGE_METADATA: Record<string, PageMetadata> = {
  '/': {
    title: 'Housing Navigator — Find housing help & track waitlists in Portland & Vancouver',
    description:
      'Search a verified directory of rent assistance, shelter, legal aid, and housing waitlists across the Portland–Vancouver metro.',
    index: true,
  },
  '/resources': {
    title: 'Find housing resources | Housing Navigator',
    description:
      'Search local rent assistance, shelter, eviction prevention, legal aid, and affordable housing resources.',
    index: true,
  },
  '/waitlist': {
    title: 'Track affordable housing waitlists | Housing Navigator',
    description:
      'Check affordable housing and voucher waitlist statuses and follow local openings across the Portland–Vancouver metro.',
    index: true,
  },
  '/mission': {
    title: 'Why Housing Navigator exists | Housing Navigator',
    description:
      'Learn why Housing Navigator is making local housing resources and waitlist information easier to find and understand.',
    index: true,
  },
  '/help': {
    title: 'Housing search help | Housing Navigator',
    description:
      'Learn how to use the directory, follow waitlists, save resources, and understand common housing terms.',
    index: true,
  },
  '/accessibility': {
    title: 'Accessibility | Housing Navigator',
    description: 'Read Housing Navigator\'s accessibility commitment and supported features.',
    index: true,
  },
  '/privacy': {
    title: 'Privacy policy | Housing Navigator',
    description: 'Learn what Housing Navigator collects and how information is handled.',
    index: true,
  },
  '/terms': {
    title: 'Terms of service | Housing Navigator',
    description: 'Read the plain-language terms for using Housing Navigator.',
    index: true,
  },
};

const PRIVATE_PAGE_METADATA: Record<string, PageMetadata> = {
  '/login': {
    title: 'Sign in | Housing Navigator',
    description: 'Sign in to manage saved housing resources and waitlist alerts.',
    index: false,
  },
  '/signup': {
    title: 'Create an account | Housing Navigator',
    description: 'Create an account to manage saved housing resources and waitlist alerts.',
    index: false,
  },
  '/forgot-password': {
    title: 'Reset your password | Housing Navigator',
    description: 'Request a Housing Navigator password reset link.',
    index: false,
  },
  '/reset-password': {
    title: 'Choose a new password | Housing Navigator',
    description: 'Choose a new password for your Housing Navigator account.',
    index: false,
  },
  '/dashboard': {
    title: 'Your dashboard | Housing Navigator',
    description: 'Manage saved housing resources and waitlist alerts.',
    index: false,
  },
};

const NOT_FOUND_METADATA: PageMetadata = {
  title: 'Page not found | Housing Navigator',
  description: 'The requested Housing Navigator page could not be found.',
  index: false,
};

function shorten(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function resolveDetailMetadata(path: string): PageMetadata | null {
  const resourceMatch = path.match(/^\/resources\/([^/]+)$/);
  if (resourceMatch) {
    const program = findResourceBySlug(STATIC_PROGRAMS, resourceMatch[1]);
    if (!program || normalizePagePath(resourcePath(program)) !== path) return null;
    const summary =
      program.description ||
      program.eligibility_summary ||
      program.notes ||
      `Housing assistance information for ${program.county} County.`;
    return {
      title: shorten(`${program.program_name} | Housing Navigator`, 65),
      description: shorten(summary, 155),
      index: true,
    };
  }

  const waitlistMatch = path.match(/^\/waitlist\/([^/]+)$/);
  if (waitlistMatch) {
    const waitlist = findWaitlistBySlug(STATIC_WAITLISTS, waitlistMatch[1]);
    if (!waitlist || normalizePagePath(waitlistPath(waitlist)) !== path) return null;
    const summary = waitlist.notes ||
      `Check the latest reported housing waitlist status for ${waitlist.agency} in ${waitlist.county} County.`;
    return {
      title: shorten(`${waitlist.agency} waitlist | Housing Navigator`, 65),
      description: shorten(summary, 155),
      index: true,
    };
  }

  return null;
}

export function normalizePagePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function resolvePageMetadata(pathname: string): ResolvedPageMetadata {
  const path = normalizePagePath(pathname);
  const metadata =
    INDEXABLE_PAGE_METADATA[path] ??
    resolveDetailMetadata(path) ??
    PRIVATE_PAGE_METADATA[path] ??
    NOT_FOUND_METADATA;

  return {
    ...metadata,
    path,
    openGraphType: 'website',
    socialImageUrl: SOCIAL_IMAGE_URL,
    socialImageAlt: SOCIAL_IMAGE_ALT,
    canonicalUrl: metadata.index
      ? `${SITE_URL}${path === '/' ? '/' : `${path}/`}`
      : null,
  };
}

function upsertMeta(
  documentRef: Document,
  attribute: 'name' | 'property',
  key: string,
  content: string,
) {
  let element = documentRef.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = documentRef.createElement('meta');
    element.setAttribute(attribute, key);
    documentRef.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function updateCanonical(documentRef: Document, canonicalUrl: string | null) {
  const canonicalLinks = Array.from(
    documentRef.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'),
  );

  if (!canonicalUrl) {
    canonicalLinks.forEach((link) => link.remove());
    return;
  }

  const canonical = canonicalLinks.shift() ?? documentRef.createElement('link');
  canonical.setAttribute('rel', 'canonical');
  canonical.setAttribute('href', canonicalUrl);
  if (!canonical.isConnected) documentRef.head.appendChild(canonical);
  canonicalLinks.forEach((link) => link.remove());
}

export function applyPageMetadata(pathname: string, documentRef: Document = document) {
  const metadata = resolvePageMetadata(pathname);
  const pageUrl =
    metadata.canonicalUrl ??
    `${SITE_URL}${metadata.path === '/' ? '/' : metadata.path}`;
  const robots = metadata.index
    ? 'index,follow,max-image-preview:large'
    : 'noindex,nofollow';

  documentRef.title = metadata.title;
  upsertMeta(documentRef, 'name', 'description', metadata.description);
  upsertMeta(documentRef, 'name', 'robots', robots);
  upsertMeta(documentRef, 'property', 'og:title', metadata.title);
  upsertMeta(documentRef, 'property', 'og:description', metadata.description);
  upsertMeta(documentRef, 'property', 'og:url', pageUrl);
  upsertMeta(documentRef, 'property', 'og:type', metadata.openGraphType);
  upsertMeta(documentRef, 'property', 'og:image', metadata.socialImageUrl);
  upsertMeta(documentRef, 'property', 'og:image:secure_url', metadata.socialImageUrl);
  upsertMeta(documentRef, 'property', 'og:image:type', 'image/png');
  upsertMeta(documentRef, 'property', 'og:image:width', '1200');
  upsertMeta(documentRef, 'property', 'og:image:height', '630');
  upsertMeta(documentRef, 'property', 'og:image:alt', metadata.socialImageAlt);
  upsertMeta(documentRef, 'name', 'twitter:card', 'summary_large_image');
  upsertMeta(documentRef, 'name', 'twitter:title', metadata.title);
  upsertMeta(documentRef, 'name', 'twitter:description', metadata.description);
  upsertMeta(documentRef, 'name', 'twitter:image', metadata.socialImageUrl);
  upsertMeta(documentRef, 'name', 'twitter:image:alt', metadata.socialImageAlt);
  updateCanonical(documentRef, metadata.canonicalUrl);
}
