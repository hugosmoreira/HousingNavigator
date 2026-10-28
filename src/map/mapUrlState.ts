import { AFFORDABLE_PROPERTY_TYPES, AMI_LEVELS, BEDROOM_TYPES } from '../data/affordableHousing';
import type { AffordablePropertyType, BedroomType } from '../types';
import { EMPTY_FILTERS, type FocusKind, type MapFilters } from './mapData';

export type MapMode = 'housing' | 'data';
export type MapView = '2d' | '3d';

export interface CameraState {
  lat: number;
  lng: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

/** A group picked in the data view, e.g. one neighborhood or income tier. */
export interface FocusRef {
  kind: FocusKind;
  value: string;
}

const FOCUS_KINDS: FocusKind[] = ['neighborhood', 'tier', 'sponsor'];

export interface MapUrlState {
  mode: MapMode;
  view: MapView | null;
  /** Selected Housing Navigator listing, by its detail-page slug. */
  property: string | null;
  /** Selected City-financed record, by its county property id. */
  city: string | null;
  focus: FocusRef | null;
  filters: MapFilters;
  showCity: boolean;
  camera: CameraState | null;
}

// Generous box around the Portland–Vancouver region and the other OR/WA
// cities the directory covers, so shared links cannot point the camera at
// nonsense coordinates.
const CAMERA_LIMITS = { south: 42, north: 49.1, west: -124.8, east: -116.4 };

function list<T extends string | number>(
  raw: string | null,
  allowed: readonly T[],
  parse: (value: string) => T,
): T[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map((value) => parse(value.trim()))
    .filter((value) => allowed.includes(value));
  return [...new Set(values)];
}

function parseCamera(raw: string | null): CameraState | null {
  if (!raw) return null;
  const [lat, lng, zoom, pitch = 0, bearing = 0] = raw.split(',').map(Number);
  if (![lat, lng, zoom, pitch, bearing].every(Number.isFinite)) return null;
  if (lat < CAMERA_LIMITS.south || lat > CAMERA_LIMITS.north) return null;
  if (lng < CAMERA_LIMITS.west || lng > CAMERA_LIMITS.east) return null;
  return {
    lat,
    lng,
    zoom: Math.min(Math.max(zoom, 8), 19),
    pitch: Math.min(Math.max(pitch, 0), 70),
    bearing: ((((bearing + 180) % 360) + 360) % 360) - 180,
  };
}

function parseFocus(raw: string | null): FocusRef | null {
  if (!raw) return null;
  const separator = raw.indexOf(':');
  if (separator < 0) return null;
  const kind = raw.slice(0, separator) as FocusKind;
  const value = raw.slice(separator + 1).trim();
  if (!FOCUS_KINDS.includes(kind) || !value) return null;
  return { kind, value: value.slice(0, 160) };
}

export function parseMapUrlState(params: URLSearchParams): MapUrlState {
  const view = params.get('view');
  return {
    mode: params.get('mode') === 'data' ? 'data' : 'housing',
    view: view === '2d' || view === '3d' ? view : null,
    property: params.get('property')?.slice(0, 200) || null,
    city: params.get('city')?.slice(0, 40) || null,
    focus: parseFocus(params.get('focus')),
    filters: {
      ...EMPTY_FILTERS,
      query: (params.get('q') ?? '').slice(0, 120),
      bedrooms: list<BedroomType>(params.get('beds'), BEDROOM_TYPES, (value) => value as BedroomType),
      amiLevels: list<number>(params.get('ami'), AMI_LEVELS, Number),
      types: list<AffordablePropertyType>(
        params.get('types'),
        AFFORDABLE_PROPERTY_TYPES,
        (value) => value as AffordablePropertyType,
      ),
      openOnly: params.get('open') === '1',
    },
    showCity: params.get('hide') !== 'city',
    camera: parseCamera(params.get('cam')),
  };
}

export function formatCamera(camera: CameraState): string {
  return [
    camera.lat.toFixed(5),
    camera.lng.toFixed(5),
    camera.zoom.toFixed(2),
    Math.round(camera.pitch),
    Math.round(camera.bearing),
  ].join(',');
}

/** Only non-default values are written, so a plain /map link stays clean. */
export function serializeMapUrlState(state: MapUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.mode === 'data') params.set('mode', 'data');
  if (state.view) params.set('view', state.view);
  if (state.property) params.set('property', state.property);
  if (state.city) params.set('city', state.city);
  if (state.focus) params.set('focus', `${state.focus.kind}:${state.focus.value}`);
  const { filters } = state;
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.bedrooms.length) params.set('beds', filters.bedrooms.join(','));
  if (filters.amiLevels.length) params.set('ami', filters.amiLevels.join(','));
  if (filters.types.length) params.set('types', filters.types.join(','));
  if (filters.openOnly) params.set('open', '1');
  if (!state.showCity) params.set('hide', 'city');
  if (state.camera) params.set('cam', formatCamera(state.camera));
  return params;
}
