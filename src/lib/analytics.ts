type PostHogClient =
  (typeof import('posthog-js/dist/module.slim.no-external'))['default'];

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY?.trim();
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST?.trim();

export const PUBLIC_ANALYTICS_PAGES = {
  '/': 'home',
  '/resources': 'resources',
  '/waitlist': 'waitlist',
  '/mission': 'mission',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/help': 'help',
  '/accessibility': 'accessibility',
} as const;

export type PublicAnalyticsPage =
  (typeof PUBLIC_ANALYTICS_PAGES)[keyof typeof PUBLIC_ANALYTICS_PAGES];

let client: PostHogClient | null = null;
let clientPromise: Promise<PostHogClient | null> | null = null;

const POSTHOG_TECHNICAL_PROPERTIES = [
  'token',
  'distinct_id',
  '$device_id',
  '$session_id',
  '$window_id',
  '$lib',
  '$lib_version',
  '$geoip_disable',
  '$cookieless_mode',
] as const;

const PUBLIC_PAGE_PROPERTIES = [
  ...POSTHOG_TECHNICAL_PROPERTIES,
  'page',
] as const;

const APPLICATION_ERROR_PROPERTIES = [
  ...POSTHOG_TECHNICAL_PROPERTIES,
  'error_name',
  'error_source',
  'surface',
] as const;

export type ApplicationErrorSource =
  | 'window_error'
  | 'unhandled_rejection';

export type ApplicationSurface =
  | PublicAnalyticsPage
  | 'auth'
  | 'dashboard'
  | 'admin'
  | 'unknown';

let globalErrorMonitoringInitialized = false;

function pickAnalyticsProperties(
  source: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in source) properties[key] = source[key];
  }
  return properties;
}

export function sanitizeAnalyticsProperties(
  source: Record<string, unknown>,
): Record<string, unknown> {
  return pickAnalyticsProperties(source, PUBLIC_PAGE_PROPERTIES);
}

export function sanitizeApplicationErrorProperties(
  source: Record<string, unknown>,
): Record<string, unknown> {
  return pickAnalyticsProperties(source, APPLICATION_ERROR_PROPERTIES);
}

export function classifyApplicationSurface(pathname: string): ApplicationSurface {
  const publicPage =
    PUBLIC_ANALYTICS_PAGES[pathname as keyof typeof PUBLIC_ANALYTICS_PAGES];
  if (publicPage) return publicPage;
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'
  ) {
    return 'auth';
  }
  return 'unknown';
}

const SAFE_ERROR_NAMES = new Set([
  'AbortError',
  'AggregateError',
  'ChunkLoadError',
  'DOMException',
  'Error',
  'EvalError',
  'NetworkError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);

export function normalizeApplicationErrorName(error: unknown): string {
  if (!(error instanceof Error)) return 'NonErrorRejection';
  return SAFE_ERROR_NAMES.has(error.name) ? error.name : 'OtherError';
}

/**
 * Analytics is deliberately optional. A missing key, blocked request, vendor
 * outage, or initialization error must never affect application rendering.
 */
async function loadAnalytics(): Promise<PostHogClient | null> {
  if (client) return client;
  if (!POSTHOG_KEY || !POSTHOG_HOST) return null;
  if (clientPromise) return clientPromise;

  clientPromise = import('posthog-js/dist/module.slim.no-external')
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_flags: true,
        person_profiles: 'never',
        cookieless_mode: 'always',
        respect_dnt: true,
        before_send: (event) => {
          if (!event) return null;

          let properties: Record<string, unknown>;
          if (event.event === 'public_page_view') {
            properties = sanitizeAnalyticsProperties(event.properties ?? {});
          } else if (event.event === 'application_error') {
            properties = sanitizeApplicationErrorProperties(event.properties ?? {});
          } else {
            return null;
          }

          // PostHog adds URL/referrer properties to manual events by default.
          // Retain only the small technical set needed to ingest anonymous
          // page and redacted error events; never send paths, queries, raw
          // error messages/stacks, form values, account data, or search terms.
          return {
            ...event,
            properties,
          };
        },
      });
      client = posthog;
      return client;
    })
    .catch(() => null);

  return clientPromise;
}

export function capturePublicPageView(page: PublicAnalyticsPage): void {
  void loadAnalytics()
    .then((posthog) =>
      posthog?.capture('public_page_view', { page, $geoip_disable: true }),
    )
    .catch(() => {
      // Analytics must be fail-open.
    });
}

export function captureApplicationError(
  error: unknown,
  source: ApplicationErrorSource,
  pathname?: string,
): void {
  const currentPath =
    pathname ?? (typeof window === 'undefined' ? '' : window.location.pathname);

  void loadAnalytics()
    .then((posthog) =>
      posthog?.capture('application_error', {
        error_name: normalizeApplicationErrorName(error),
        error_source: source,
        surface: classifyApplicationSurface(currentPath),
        $geoip_disable: true,
      }),
    )
    .catch(() => {
      // Monitoring must be fail-open.
    });
}

/**
 * Report browser-level crashes without collecting URLs, messages, stack
 * traces, form values, or account identifiers. Initialization is idempotent
 * so Vite hot reload cannot attach duplicate listeners.
 */
export function setupGlobalErrorMonitoring(): void {
  if (globalErrorMonitoringInitialized || typeof window === 'undefined') return;
  globalErrorMonitoringInitialized = true;

  window.addEventListener('error', (event) => {
    captureApplicationError(event.error, 'window_error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureApplicationError(event.reason, 'unhandled_rejection');
  });
}

export function resetAnalytics(): void {
  if (!clientPromise) return;
  void clientPromise
    .then((posthog) => posthog?.reset())
    .catch(() => {
      // Signing out must never fail because analytics is unavailable.
    });
}
