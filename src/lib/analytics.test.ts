import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ANALYTICS_PAGES,
  sanitizeAnalyticsProperties,
} from './analytics';

describe('privacy-limited analytics', () => {
  it('drops URLs, referrers, searches, and account data', () => {
    const result = sanitizeAnalyticsProperties({
      token: 'public-project-token',
      distinct_id: 'anonymous-id',
      page: 'resources',
      $current_url: 'https://housingnavigator.us/resources?q=eviction',
      $pathname: '/resources',
      $referrer: 'https://example.test/private',
      search: 'eviction assistance',
      email: 'person@example.test',
      county: 'Multnomah',
      resource_id: 'private-selection',
    });

    expect(result).toEqual({
      token: 'public-project-token',
      distinct_id: 'anonymous-id',
      page: 'resources',
    });
  });

  it('has no analytics route for auth, dashboard, admin, or unknown pages', () => {
    const routes: Record<string, string> = PUBLIC_ANALYTICS_PAGES;

    expect(routes['/login']).toBeUndefined();
    expect(routes['/signup']).toBeUndefined();
    expect(routes['/forgot-password']).toBeUndefined();
    expect(routes['/dashboard']).toBeUndefined();
    expect(routes['/admin/login']).toBeUndefined();
    expect(routes['/resources/private-id']).toBeUndefined();
  });
});
