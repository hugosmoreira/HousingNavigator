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

const ALLOWED_ANALYTICS_PROPERTIES = [
  'token',
  'distinct_id',
  '$device_id',
  '$session_id',
  '$window_id',
  '$lib',
  '$lib_version',
  '$geoip_disable',
  '$cookieless_mode',
  'page',
] as const;

export function sanitizeAnalyticsProperties(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const key of ALLOWED_ANALYTICS_PROPERTIES) {
    if (key in source) properties[key] = source[key];
  }
  return properties;
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
          if (!event || event.event !== 'public_page_view') return null;

          // PostHog adds URL/referrer properties to manual events by default.
          // Retain only the small technical set needed to ingest an anonymous
          // event plus our approved page enum; never send paths, queries, form
          // values, resource IDs, account data, or search terms.
          return {
            ...event,
            properties: sanitizeAnalyticsProperties(event.properties ?? {}),
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

export function resetAnalytics(): void {
  if (!clientPromise) return;
  void clientPromise
    .then((posthog) => posthog?.reset())
    .catch(() => {
      // Signing out must never fail because analytics is unavailable.
    });
}
