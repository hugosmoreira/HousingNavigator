import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_ORIGIN = 'https://housingnavigator.us';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_KEY = 'e060bb774e804994906a00517eb1de56';
export const INDEXNOW_KEY_LOCATION = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;
export const DEPLOY_MARKER_URL = `${SITE_ORIGIN}/.well-known/housing-navigator-deploy.txt`;

const MAX_URLS_PER_REQUEST = 10_000;
const DEFAULT_DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_DEPLOY_POLL_MS = 15 * 1000;

const exactPageRoutes = new Map([
  ['src/pages/Home.tsx', '/'],
  ['src/pages/Mission.tsx', '/mission'],
  ['src/pages/Privacy.tsx', '/privacy'],
  ['src/pages/Terms.tsx', '/terms'],
  ['src/pages/Help.tsx', '/help'],
  ['src/pages/Accessibility.tsx', '/accessibility'],
]);

const ignoredPatterns = [
  /(^|\/)\.[^/]+$/,
  /(^|\/)(README|SECURITY|MARKETING|SOCIAL_MEDIA)[^/]*\.md$/i,
  /(^|\/).+\.(test|spec)\.[cm]?[jt]sx?$/,
  /^\.github\/workflows\/indexnow\.yml$/,
  /^scripts\/indexNow\.mjs$/,
  /^public\/e060bb774e804994906a00517eb1de56\.txt$/,
  /^supabase\//,
  /^videos\//,
];

const globalPublicPatterns = [
  /^index\.html$/,
  /^netlify\.toml$/,
  /^vite\.config\.ts$/,
  /^public\/(robots\.txt|sitemap\.xml|social-card\.png|404\.html)$/,
  /^scripts\/prerender\.ts$/,
  /^src\/(App|AppRoutes|AppServer|entry-server)\.tsx$/,
  /^src\/index\.css$/,
  /^src\/components\/Layout\.tsx$/,
  /^src\/lib\/(pageMetadata|structuredData)\.ts$/,
];

const resourcePatterns = [
  /^src\/pages\/(Resources|ResourceDetail)\.tsx$/,
  /^src\/components\/DirectoryCard\.tsx$/,
  /^src\/hooks\/usePrograms\.ts$/,
  /^src\/data\/(catalog|programs)\.(json|csv)$/,
  /^src\/services\/data\/(staticDataService|supabaseDataService)\.ts$/,
];

const waitlistPatterns = [
  /^src\/pages\/(Waitlist|WaitlistDetail)\.tsx$/,
  /^src\/hooks\/useWaitlists\.ts$/,
  /^src\/data\/waitlists\.(json|csv)$/,
];

const localHousingPatterns = [
  /^src\/pages\/LocalHousingLanding\.tsx$/,
  /^src\/data\/localLandingPages\.ts$/,
];

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function parseSitemap(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) =>
    decodeXml(match[1].trim()),
  );
}

export function normalizeIndexNowUrls(values) {
  const urls = new Set();
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;

    const url = new URL(value);
    if (url.origin !== SITE_ORIGIN) {
      throw new Error(`IndexNow URL must belong to ${SITE_ORIGIN}: ${value}`);
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error(`IndexNow URL must be a canonical public URL: ${value}`);
    }
    urls.add(url.href);
  }

  if (urls.size > MAX_URLS_PER_REQUEST) {
    throw new Error(`IndexNow accepts at most ${MAX_URLS_PER_REQUEST} URLs per request.`);
  }
  return [...urls].sort();
}

function canonicalPath(value) {
  const pathname = new URL(value).pathname.replace(/\/+$/, '');
  return pathname || '/';
}

export function selectChangedUrls(changedFiles, sitemapUrls) {
  const normalizedSitemap = normalizeIndexNowUrls(sitemapUrls);
  const selected = new Set();

  const addAll = () => normalizedSitemap.forEach((url) => selected.add(url));
  const addPrefix = (prefix) => {
    for (const url of normalizedSitemap) {
      const pathname = canonicalPath(url);
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) selected.add(url);
    }
  };
  const addExact = (pathname) => {
    for (const url of normalizedSitemap) {
      if (canonicalPath(url) === pathname) selected.add(url);
    }
  };

  for (const rawFile of changedFiles) {
    const file = rawFile.trim().replace(/\\/g, '/');
    if (!file || ignoredPatterns.some((pattern) => pattern.test(file))) continue;

    if (globalPublicPatterns.some((pattern) => pattern.test(file))) {
      addAll();
      continue;
    }
    if (resourcePatterns.some((pattern) => pattern.test(file))) {
      addPrefix('/resources');
      continue;
    }
    if (waitlistPatterns.some((pattern) => pattern.test(file))) {
      addPrefix('/waitlist');
      continue;
    }
    if (localHousingPatterns.some((pattern) => pattern.test(file))) {
      addPrefix('/housing-help');
      continue;
    }
    if (exactPageRoutes.has(file)) {
      addExact(exactPageRoutes.get(file));
      continue;
    }

    // Account, dashboard, admin, and server-only changes are intentionally
    // excluded because those URLs are noindex or do not change public HTML.
    if (
      /^src\/(admin|auth|security)\//.test(file) ||
      /^src\/pages\/(Login|LoginRoute|Signup|ForgotPassword|ResetPassword|Dashboard)/.test(file) ||
      /^src\/pages\/dashboard\//.test(file) ||
      /^scripts\/(import|verifyRls|generateSeed)/.test(file)
    ) {
      continue;
    }

    // Unknown application or public-asset changes may affect shared output.
    // Submitting the current sitemap is safer than silently missing an update.
    if (/^(src|public)\//.test(file)) addAll();
  }

  return [...selected].sort();
}

function option(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
}

function changedFilesBetween(before, after) {
  if (!after) return [];
  const safeBefore = before && !/^0+$/.test(before) ? before : `${after}^`;
  const output = execFileSync('git', ['diff', '--name-only', `${safeBefore}..${after}`], {
    encoding: 'utf8',
  });
  return output.split(/\r?\n/).filter(Boolean);
}

function sitemapAtRef(ref, sitemapPath) {
  if (!ref || /^0+$/.test(ref)) return [];
  try {
    const relativePath = sitemapPath.replace(/\\/g, '/');
    const xml = execFileSync('git', ['show', `${ref}:${relativePath}`], { encoding: 'utf8' });
    return parseSitemap(xml);
  } catch {
    return [];
  }
}

export async function waitForProductionDeploy(
  expectedSha,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_DEPLOY_TIMEOUT_MS,
    pollMs = DEFAULT_DEPLOY_POLL_MS,
  } = {},
) {
  if (!/^[0-9a-f]{40}$/i.test(expectedSha)) {
    throw new Error('Expected a full 40-character deployment commit SHA.');
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`${DEPLOY_MARKER_URL}?expected=${expectedSha}&t=${Date.now()}`, {
        headers: { Accept: 'text/plain', 'User-Agent': 'HousingNavigator-IndexNow/1.0' },
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok && (await response.text()).trim() === expectedSha) return;
    } catch {
      // Netlify may briefly be unavailable while the new deployment activates.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
  }
  throw new Error(`Production did not expose deployment ${expectedSha} within ${timeoutMs}ms.`);
}

export async function submitIndexNow(urls, { fetchImpl = fetch } = {}) {
  const normalizedUrls = normalizeIndexNowUrls(urls);
  if (normalizedUrls.length === 0) return { status: 0, submitted: 0 };

  const keyResponse = await fetchImpl(INDEXNOW_KEY_LOCATION, {
    headers: { Accept: 'text/plain', 'User-Agent': 'HousingNavigator-IndexNow/1.0' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const hostedKey = keyResponse.ok ? (await keyResponse.text()).trim() : '';
  if (hostedKey !== INDEXNOW_KEY) {
    throw new Error(`IndexNow key is not available at ${INDEXNOW_KEY_LOCATION}.`);
  }

  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'HousingNavigator-IndexNow/1.0',
    },
    body: JSON.stringify({
      host: new URL(SITE_ORIGIN).host,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: normalizedUrls,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status !== 200 && response.status !== 202) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`IndexNow returned HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }
  return { status: response.status, submitted: normalizedUrls.length };
}

async function collectCommand(args) {
  const sitemapPath = option(args, '--sitemap', 'public/sitemap.xml');
  const outputPath = option(args, '--output');
  const previousSitemapPath = option(args, '--previous-sitemap');
  const before = option(args, '--before');
  const after = option(args, '--after');
  const manual = option(args, '--manual');
  if (!outputPath) throw new Error('collect requires --output <path>.');

  const currentSitemap = parseSitemap(readFileSync(resolve(sitemapPath), 'utf8'));
  const previousSitemap = sitemapAtRef(before, sitemapPath);
  const deployedSitemap =
    previousSitemapPath && existsSync(resolve(previousSitemapPath))
      ? parseSitemap(readFileSync(resolve(previousSitemapPath), 'utf8'))
      : [];
  const sitemapUrls = [
    ...new Set([...currentSitemap, ...previousSitemap, ...deployedSitemap]),
  ];
  const urls = manual.trim()
    ? normalizeIndexNowUrls(manual.split(/\r?\n/))
    : selectChangedUrls(changedFilesBetween(before, after), sitemapUrls);

  writeFileSync(resolve(outputPath), urls.length ? `${urls.join('\n')}\n` : '', 'utf8');
  console.log(`Selected ${urls.length} canonical URL(s) for IndexNow.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'collect') {
    await collectCommand(args);
    return;
  }
  if (command === 'wait') {
    const sha = option(args, '--sha');
    await waitForProductionDeploy(sha);
    console.log(`Production deployment ${sha} is live.`);
    return;
  }
  if (command === 'submit') {
    const file = option(args, '--file');
    if (!file) throw new Error('submit requires --file <path>.');
    const urls = readFileSync(resolve(file), 'utf8').split(/\r?\n/);
    const result = await submitIndexNow(urls);
    console.log(`IndexNow accepted ${result.submitted} URL(s) with HTTP ${result.status}.`);
    return;
  }
  throw new Error('Usage: node scripts/indexNow.mjs <collect|wait|submit> [options]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
