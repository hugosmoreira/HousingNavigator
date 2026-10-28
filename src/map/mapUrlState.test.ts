import { describe, expect, it } from 'vitest';
import { parseMapUrlState, serializeMapUrlState } from './mapUrlState';

describe('map URL state', () => {
  it('keeps a plain /map link clean', () => {
    const state = parseMapUrlState(new URLSearchParams(''));
    expect(serializeMapUrlState(state).toString()).toBe('');
    expect(state.mode).toBe('housing');
    expect(state.camera).toBeNull();
    expect(state.showCity).toBe(true);
  });

  it('round-trips a shared link', () => {
    const input = new URLSearchParams({
      mode: 'data',
      view: '3d',
      property: '73foster--4690b230',
      city: 'R128889',
      focus: 'neighborhood:Lents',
      q: 'foster',
      beds: '2,3',
      ami: '30,60',
      types: 'mixed',
      open: '1',
      hide: 'city',
      cam: '45.48582,-122.58741,16.50,60,-20',
    });
    const state = parseMapUrlState(input);
    expect(state.focus).toEqual({ kind: 'neighborhood', value: 'Lents' });
    expect(state.filters.bedrooms).toEqual(['2', '3']);
    expect(state.filters.amiLevels).toEqual([30, 60]);
    expect(serializeMapUrlState(state).toString()).toBe(input.toString());
  });

  it('drops values the map cannot honor', () => {
    const state = parseMapUrlState(
      new URLSearchParams({
        mode: 'admin',
        view: '4d',
        beds: '9,studio,studio',
        ami: '55,30',
        types: 'castle',
        focus: 'owner:Somebody',
        cam: '0,0,12',
      }),
    );
    expect(state.mode).toBe('housing');
    expect(state.view).toBeNull();
    expect(state.filters.bedrooms).toEqual(['studio']);
    expect(state.filters.amiLevels).toEqual([30]);
    expect(state.filters.types).toEqual([]);
    expect(state.focus).toBeNull();
    expect(state.camera).toBeNull();
  });

  it('clamps camera values from hand-edited links', () => {
    const state = parseMapUrlState(new URLSearchParams({ cam: '45.5,-122.6,30,95,540' }));
    expect(state.camera).toEqual({ lat: 45.5, lng: -122.6, zoom: 19, pitch: 70, bearing: -180 });
  });
});
