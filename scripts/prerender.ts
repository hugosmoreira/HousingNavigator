import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface PageMetadata {
  title: string;
  description: string;
  index: boolean;
  canonicalUrl: string | null;
  openGraphType: 'website';
  socialImageUrl: string;
  socialImageAlt: string;
}

interface StructuredDataDocument {
  '@context': 'https://schema.org';
  '@graph': Array<Record<string, unknown>>;
}

interface ServerEntry {
  prerenderRoutes: string[];
  render(url: string): string;
  metadataFor(url: string): PageMetadata;
  structuredDataFor(url: string): StructuredDataDocument | null;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
const serverEntryPath = join(repoRoot, '.prerender', 'entry-server.js');
const clientTemplate = readFileSync(join(distDir, 'index.html'), 'utf8');

if (!clientTemplate.includes('<!--ssr-outlet-->')) {
  throw new Error('The Vite client template is missing <!--ssr-outlet-->.');
}

const serverEntry = (await import(pathToFileURL(serverEntryPath).href)) as ServerEntry;
const routes = [...new Set(serverEntry.prerenderRoutes)];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceMeta(html: string, selector: string, content: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\s+${escaped}\\s+content="[^"]*"\\s*\\/?>`, 'i');
  const replacement = `<meta ${selector} content="${escapeHtml(content)}" />`;
  if (!pattern.test(html)) {
    return html.replace('</head>', `    ${replacement}\n  </head>`);
  }
  return html.replace(pattern, replacement);
}

function applyMetadata(html: string, metadata: PageMetadata): string {
  const robots = metadata.index
    ? 'index,follow,max-image-preview:large'
    : 'noindex,nofollow';
  let output = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(metadata.title)}</title>`,
  );
  output = replaceMeta(output, 'name="description"', metadata.description);
  output = replaceMeta(output, 'name="robots"', robots);
  output = replaceMeta(output, 'property="og:title"', metadata.title);
  output = replaceMeta(output, 'property="og:description"', metadata.description);
  output = replaceMeta(output, 'property="og:url"', metadata.canonicalUrl ?? '');
  output = replaceMeta(output, 'property="og:type"', metadata.openGraphType);
  output = replaceMeta(output, 'property="og:image"', metadata.socialImageUrl);
  output = replaceMeta(output, 'property="og:image:secure_url"', metadata.socialImageUrl);
  output = replaceMeta(output, 'property="og:image:type"', 'image/png');
  output = replaceMeta(output, 'property="og:image:width"', '1200');
  output = replaceMeta(output, 'property="og:image:height"', '630');
  output = replaceMeta(output, 'property="og:image:alt"', metadata.socialImageAlt);
  output = replaceMeta(output, 'name="twitter:card"', 'summary_large_image');
  output = replaceMeta(output, 'name="twitter:title"', metadata.title);
  output = replaceMeta(output, 'name="twitter:description"', metadata.description);
  output = replaceMeta(output, 'name="twitter:image"', metadata.socialImageUrl);
  output = replaceMeta(output, 'name="twitter:image:alt"', metadata.socialImageAlt);
  output = output.replace(/\s*<link\s+rel="canonical"[^>]*>/gi, '');
  if (metadata.canonicalUrl) {
    output = output.replace(
      '</head>',
      `    <link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}" />\n  </head>`,
    );
  }
  return output;
}

function injectStructuredData(
  html: string,
  structuredData: StructuredDataDocument,
): string {
  const serialized = JSON.stringify(structuredData).replace(/</g, '\\u003c');
  return html.replace(
    '</head>',
    `    <script type="application/ld+json" data-housing-navigator-schema="true">${serialized}</script>\n  </head>`,
  );
}

function outputPathFor(route: string): string {
  if (route === '/') return join(distDir, 'index.html');
  const relative = route.replace(/^\/+|\/+$/g, '');
  const outputPath = resolve(distDir, relative, 'index.html');
  if (!outputPath.startsWith(`${resolve(distDir)}${sep}`)) {
    throw new Error(`Refusing to write prerendered route outside dist: ${route}`);
  }
  return outputPath;
}

// Private/admin routes still need a clean SPA shell. Netlify rewrites those
// routes to this file while public routes are shadowed by their generated HTML.
// Give non-JavaScript crawlers truthful noindex metadata and a semantic heading;
// createRoot replaces this fallback as soon as the client application starts.
const loginMetadata = serverEntry.metadataFor('/login');
const spaMetadata: PageMetadata = {
  ...loginMetadata,
  title: 'Housing Navigator account',
  description: 'Sign in or create an account to save resources and follow housing waitlists.',
  index: false,
  canonicalUrl: null,
};
const spaHtml = applyMetadata(
  clientTemplate.replace(
    '<div id="root"><!--ssr-outlet--></div>',
    '<div id="root"><h1 class="sr-only">Housing Navigator account</h1></div>',
  ),
  spaMetadata,
);
writeFileSync(join(distDir, 'spa.html'), spaHtml, 'utf8');

// Netlify exposes COMMIT_REF during production builds. The IndexNow workflow
// polls this uncached marker so it never notifies search engines before the
// matching deployment is live. Local builds use a non-production sentinel.
const deployReferenceCandidate = (
  process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? ''
).trim();
const deployReference = /^[0-9a-f]{40}$/i.test(deployReferenceCandidate)
  ? deployReferenceCandidate
  : 'local';
const deployMarkerDir = join(distDir, '.well-known');
mkdirSync(deployMarkerDir, { recursive: true });
writeFileSync(
  join(deployMarkerDir, 'housing-navigator-deploy.txt'),
  `${deployReference}\n`,
  'utf8',
);

for (const route of routes) {
  const appHtml = serverEntry.render(route);
  const metadata = serverEntry.metadataFor(route);
  const structuredData = serverEntry.structuredDataFor(route);
  if (!metadata.index || !metadata.canonicalUrl) {
    throw new Error(`Prerender route is not indexable: ${route}`);
  }
  if (!structuredData) {
    throw new Error(`Prerender route is missing structured data: ${route}`);
  }

  let pageHtml = clientTemplate.replace(
    '<div id="root"><!--ssr-outlet--></div>',
    `<div id="root" data-ssr="true">${appHtml}</div>`,
  );
  pageHtml = applyMetadata(pageHtml, metadata);
  pageHtml = injectStructuredData(pageHtml, structuredData);

  const outputPath = outputPathFor(route);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, pageHtml, 'utf8');
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map((route) => {
    const metadata = serverEntry.metadataFor(route);
    return `  <url><loc>${escapeHtml(metadata.canonicalUrl ?? '')}</loc></url>`;
  }),
  '</urlset>',
  '',
].join('\n');
writeFileSync(join(distDir, 'sitemap.xml'), sitemap, 'utf8');

console.log(`Prerendered ${routes.length} indexable routes and generated sitemap.xml.`);
