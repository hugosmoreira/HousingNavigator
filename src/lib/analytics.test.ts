import { describe, expect, it } from 'vitest';
import {
  analyticsPageForPath,
  PUBLIC_ANALYTICS_PAGES,
  classifyApplicationSurface,
  normalizeApplicationErrorName,
  sanitizeApplicationErrorProperties,
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

  it('tracks canonical trailing-slash and local SEO pages without query data', () => {
    expect(analyticsPageForPath('/resources/')).toBe('resources');
    expect(analyticsPageForPath('/housing-help/clark-county/rent-assistance/')).toBe(
      'housing_help_clark_rent_assistance',
    );
    expect(analyticsPageForPath('/resources/private-id/')).toBeNull();
  });

  it('reports only coarse, redacted application error details', () => {
    const result = sanitizeApplicationErrorProperties({
      token: 'public-project-token',
      distinct_id: 'anonymous-id',
      error_name: 'TypeError',
      error_source: 'window_error',
      surface: 'auth',
      message: 'Failed for person@example.test',
      stack: 'https://housingnavigator.us/login?token=private',
      $current_url: 'https://housingnavigator.us/login',
      email: 'person@example.test',
    });

    expect(result).toEqual({
      token: 'public-project-token',
      distinct_id: 'anonymous-id',
      error_name: 'TypeError',
      error_source: 'window_error',
      surface: 'auth',
    });
  });

  it('uses coarse page groups and an allowlist of error names', () => {
    expect(classifyApplicationSurface('/resources')).toBe('resources');
    expect(classifyApplicationSurface('/login')).toBe('auth');
    expect(classifyApplicationSurface('/admin/resources')).toBe('admin');
    expect(classifyApplicationSurface('/private/value')).toBe('unknown');

    expect(normalizeApplicationErrorName(new TypeError('private value'))).toBe(
      'TypeError',
    );
    const customError = new Error('private value');
    customError.name = 'ContainsPrivateDetails';
    expect(normalizeApplicationErrorName(customError)).toBe('OtherError');
    expect(normalizeApplicationErrorName('private rejection')).toBe(
      'NonErrorRejection',
    );
  });
});
