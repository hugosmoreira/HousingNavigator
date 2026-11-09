import { describe, expect, it } from 'vitest';
import { streetViewUrl, transitDirectionsUrl } from './mapLinks';

describe('transitDirectionsUrl', () => {
  it('uses the published address and asks for transit', () => {
    const url = new URL(transitDirectionsUrl({ address: '123 SW Main St, Portland, OR 97204', latitude: 45.5, longitude: -122.6 })!);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('destination')).toBe('123 SW Main St, Portland, OR 97204');
    expect(url.searchParams.get('travelmode')).toBe('transit');
  });

  it('falls back to coordinates when no address is published', () => {
    const url = new URL(transitDirectionsUrl({ address: ' ', latitude: 45.51234567, longitude: -122.6 })!);
    expect(url.searchParams.get('destination')).toBe('45.512346,-122.600000');
  });

  it('returns null when there is nothing to navigate to', () => {
    expect(transitDirectionsUrl({})).toBeNull();
    expect(transitDirectionsUrl({ latitude: Number.NaN, longitude: -122.6 })).toBeNull();
  });
});

describe('streetViewUrl', () => {
  it('opens a panorama at the coordinates', () => {
    const url = new URL(streetViewUrl({ latitude: 45.5, longitude: -122.6 })!);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/@');
    expect(url.searchParams.get('map_action')).toBe('pano');
    expect(url.searchParams.get('viewpoint')).toBe('45.500000,-122.600000');
  });

  it('needs coordinates', () => {
    expect(streetViewUrl({ address: '123 SW Main St' })).toBeNull();
  });
});
