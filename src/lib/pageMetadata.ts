export const SITE_URL = 'https://housingnavigator.us';

export interface PageMetadata {
  title: string;
  description: string;
  index: boolean;
}

export interface ResolvedPageMetadata extends PageMetadata {
  canonicalUrl: string | null;
  path: string;
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

export function normalizePagePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function resolvePageMetadata(pathname: string): ResolvedPageMetadata {
  const path = normalizePagePath(pathname);
  const metadata = INDEXABLE_PAGE_METADATA[path] ?? PRIVATE_PAGE_METADATA[path] ?? NOT_FOUND_METADATA;

  return {
    ...metadata,
    path,
    canonicalUrl: metadata.index ? `${SITE_URL}${path === '/' ? '/' : path}` : null,
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
  const pageUrl = `${SITE_URL}${metadata.path === '/' ? '/' : metadata.path}`;
  const robots = metadata.index
    ? 'index,follow,max-image-preview:large'
    : 'noindex,nofollow';

  documentRef.title = metadata.title;
  upsertMeta(documentRef, 'name', 'description', metadata.description);
  upsertMeta(documentRef, 'name', 'robots', robots);
  upsertMeta(documentRef, 'property', 'og:title', metadata.title);
  upsertMeta(documentRef, 'property', 'og:description', metadata.description);
  upsertMeta(documentRef, 'property', 'og:url', pageUrl);
  upsertMeta(documentRef, 'name', 'twitter:title', metadata.title);
  upsertMeta(documentRef, 'name', 'twitter:description', metadata.description);
  updateCanonical(documentRef, metadata.canonicalUrl);
}
