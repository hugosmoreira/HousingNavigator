/**
 * Imperative MapLibre controller for the /map page.
 *
 * React owns the data and the UI; this module owns one MapLibre instance and
 * turns state changes into style, source and camera updates. It is loaded with
 * a dynamic import, so the ~1 MB map engine never touches the prerendered
 * pages, the server bundle, or visitors who do not open the map.
 */
import {
  GPUInitializationError,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type PaddingOptions,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { MapBounds } from './mapData';
import type { CameraState, MapView } from './mapUrlState';
import {
  BASE_STYLE_URL,
  PALETTES,
  firstSymbolLayerId,
  themeBaseLayers,
  type MapPalette,
  type MapTheme,
} from './mapStyle';
import { easeOutCubic } from './motion';

// Same-origin module worker: allowed by the site's script-src 'self' policy,
// so no blob: worker exception is needed.
setWorkerUrl(workerUrl);

export { GPUInitializationError };

export interface MapPoint {
  /** Stable item key, e.g. "listing:<slug>" or "city:<R-number>". */
  key: string;
  kind: 'listing' | 'city';
  name: string;
  lng: number;
  lat: number;
  /** Override color for the point; null uses the theme color for its kind. */
  color: string | null;
  open: boolean;
  /** Published number of homes, or 0 when the source does not say. */
  units: number;
}

export interface HousingMapOptions {
  container: HTMLElement;
  theme: MapTheme;
  view: MapView;
  camera: CameraState;
  /** Optional opening camera; the map flies from here to `camera` once tiles load. */
  introFrom: CameraState | null;
  reducedMotion: boolean;
  lowPower: boolean;
  padding: () => PaddingOptions;
  onSelect: (key: string | null) => void;
  /** Called with a neighborhood name when the shading is clicked away from any point. */
  onNeighborhood: (name: string) => void;
  onViewport: (bounds: MapBounds, camera: CameraState) => void;
  onReady: () => void;
  onError: (kind: 'tiles' | 'webgl') => void;
}

export interface HousingMap {
  setPoints(points: MapPoint[]): void;
  setSelected(key: string | null): void;
  /** Emphasize a set of properties (a group picked in the data view) and dim the rest. */
  setEmphasis(keys: string[] | null): void;
  /** Neighborhood shading for the data view; `homes` drives the shade. */
  setNeighborhoods(data: FeatureCollection | null, visible: boolean, focus: string | null): void;
  setTheme(theme: MapTheme): void;
  setView(view: MapView): void;
  setReducedMotion(reduced: boolean): void;
  flyTo(target: { lng: number; lat: number; zoom?: number }): void;
  fitPoints(points: Array<{ lng: number; lat: number }>, maxZoom?: number): void;
  zoomBy(delta: number): void;
  resetNorth(): void;
  getCamera(): CameraState;
  resize(): void;
  destroy(): void;
}

const SOURCE_POINTS = 'hn-properties';
const SOURCE_COLUMNS = 'hn-columns';
const LAYER_COLUMNS = 'hn-columns';
const LAYER_HALO = 'hn-property-halo';
const LAYER_DOT = 'hn-property-dot';
const LAYER_LABEL = 'hn-property-label';
const LAYER_LABEL_CITY = 'hn-city-label';
const BUILDING_LAYER = 'building-3d';
const BUILDING_SOURCE = 'openmaptiles';
const SOURCE_BUILDINGS = 'hn-buildings';
const LAYER_BUILDINGS = 'hn-building-highlight';
const SOURCE_HOODS = 'hn-neighborhoods';
const LAYER_HOOD_FILL = 'hn-neighborhood-fill';
const LAYER_HOOD_LINE = 'hn-neighborhood-line';
const HIT_LAYERS = [LAYER_DOT, LAYER_HALO, LAYER_LABEL, LAYER_LABEL_CITY, LAYER_COLUMNS, LAYER_BUILDINGS];

const VIEW_CAMERA: Record<MapView, { pitch: number; bearing: number }> = {
  '2d': { pitch: 0, bearing: 0 },
  '3d': { pitch: 58, bearing: -20 },
};

/** Column height is linear in published homes; unknown counts get a short stub. */
export const METERS_PER_HOME = 9;
const STUB_HEIGHT = 90;
const COLUMN_RADIUS_M = { listing: 120, city: 80 } as const;
const MAX_BUILDING_QUERIES = 60;
/** How far a geocoded point may sit from a footprint and still claim it. */
const NEAREST_BUILDING_M = 30;

function circlePolygon(lng: number, lat: number, radiusMeters: number, steps = 20): Polygon {
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    ring.push([lng + Math.cos(angle) * dLng, lat + Math.sin(angle) * dLat]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

function pointCollection(points: MapPoint[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
      properties: {
        key: point.key,
        kind: point.kind,
        name: point.name,
        color: point.color ?? '',
        open: point.open,
      },
    })),
  };
}

function columnCollection(points: MapPoint[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: points.map(
      (point): Feature<Polygon> => ({
        type: 'Feature',
        geometry: circlePolygon(point.lng, point.lat, COLUMN_RADIUS_M[point.kind]),
        properties: {
          key: point.key,
          kind: point.kind,
          color: point.color ?? '',
          open: point.open,
          height: point.units ? point.units * METERS_PER_HOME : STUB_HEIGHT,
        },
      }),
    ),
  };
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function outerRings(feature: MapGeoJSONFeature): number[][][] {
  const geometry = feature.geometry;
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function ringCentroid(ring: number[][]): [number, number] {
  let lng = 0;
  let lat = 0;
  const count = Math.max(ring.length - 1, 1);
  for (let i = 0; i < count; i += 1) {
    lng += ring[i][0];
    lat += ring[i][1];
  }
  return [lng / count, lat / count];
}

function metersApart(a: [number, number], b: { lng: number; lat: number }): number {
  const dLat = (a[1] - b.lat) * 111_320;
  const dLng = (a[0] - b.lng) * 111_320 * Math.cos((b.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * The tiles merge neighboring buildings into one multipolygon, so pick the
 * single footprint that contains the point, or the closest one within reach.
 */
function footprintAt(
  candidates: MapGeoJSONFeature[],
  point: { lng: number; lat: number },
  maxMeters: number,
): { ring: number[][]; feature: MapGeoJSONFeature } | null {
  let nearest: { ring: number[][]; feature: MapGeoJSONFeature } | null = null;
  let nearestDistance = maxMeters;
  for (const feature of candidates) {
    for (const ring of outerRings(feature)) {
      if (pointInRing(point.lng, point.lat, ring)) return { ring, feature };
      const distance = metersApart(ringCentroid(ring), point);
      if (distance < nearestDistance) {
        nearest = { ring, feature };
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

/** Push a footprint outward by roughly `meters` from its centroid. */
function grow(ring: number[][], meters: number): number[][] {
  const [cx, cy] = ringCentroid(ring);
  const cosLat = Math.cos((cy * Math.PI) / 180);
  return ring.map(([x, y]) => {
    const dx = (x - cx) * 111_320 * cosLat;
    const dy = (y - cy) * 111_320;
    const length = Math.hypot(dx, dy) || 1;
    const scale = (length + meters) / length;
    return [cx + (x - cx) * scale, cy + (y - cy) * scale];
  });
}

export function createHousingMap(options: HousingMapOptions): HousingMap {
  let palette: MapPalette = PALETTES[options.theme];
  let reducedMotion = options.reducedMotion;
  let points: MapPoint[] = [];
  let selected: string | null = null;
  let emphasis: string[] | null = null;
  let styleReady = false;
  let destroyed = false;
  let hovered: string | null = null;
  let columnScale = options.view === '3d' ? 1 : 0;
  let columnFrame = 0;
  let highlightTimer = 0;
  let tileErrors = 0;
  let currentView = options.view;
  // Set by any camera move the visitor or the page asks for, so the opening
  // flight never drags the camera away from something they chose.
  let userMoved = false;
  let highlightSignature = '';
  let contextLossTimer = 0;
  let hoods: FeatureCollection | null = null;
  let hoodsVisible = false;
  let hoodFocus: string | null = null;
  const startCamera = options.introFrom ?? options.camera;

  const map = new MapLibreMap({
    container: options.container,
    style: BASE_STYLE_URL,
    center: [startCamera.lng, startCamera.lat],
    zoom: startCamera.zoom,
    pitch: startCamera.pitch,
    bearing: startCamera.bearing,
    minZoom: 8,
    maxPitch: 70,
    canvasContextAttributes: { antialias: !options.lowPower },
    pixelRatio: Math.min(window.devicePixelRatio || 1, options.lowPower ? 1.5 : 2),
    attributionControl: { compact: true },
    fadeDuration: options.lowPower ? 0 : 300,
  });

  if (import.meta.env.DEV) (window as Window & { __hnMap?: MapLibreMap }).__hnMap = map;
  // Center the camera in the part of the map the side panel or sheet leaves open.
  map.setPadding(options.padding());

  const pulseElement = document.createElement('div');
  pulseElement.innerHTML =
    '<div class="hn-map-pulse" aria-hidden="true"><span></span><span></span></div>';
  const pulseMarker = new Marker({ element: pulseElement, anchor: 'center' });

  const animationDuration = (ms: number) => (reducedMotion ? 0 : ms);

  function currentCamera(): CameraState {
    const center = map.getCenter();
    return {
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
  }

  function emitViewport(): void {
    const bounds = map.getBounds();
    options.onViewport(
      {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
      currentCamera(),
    );
  }

  /** Point and column fill: open listings green, else organization or kind color. */
  function fillColor(): ExpressionSpecification {
    return [
      'case',
      ['==', ['get', 'open'], true],
      palette.propertyOpen,
      ['!=', ['get', 'color'], ''],
      ['get', 'color'],
      ['==', ['get', 'kind'], 'city'],
      palette.city,
      palette.property,
    ];
  }

  function dimmed(full: number, faded: number): ExpressionSpecification | number {
    if (!emphasis) return full;
    return ['case', ['in', ['get', 'key'], ['literal', emphasis]], full, faded];
  }

  function applyDataPaint(): void {
    if (!styleReady) return;
    const color = fillColor();
    const isCity: ExpressionSpecification = ['==', ['get', 'kind'], 'city'];
    map.setPaintProperty(LAYER_DOT, 'circle-color', color);
    map.setPaintProperty(LAYER_DOT, 'circle-stroke-color', palette.propertyStroke);
    map.setPaintProperty(LAYER_DOT, 'circle-opacity', dimmed(1, 0.15));
    map.setPaintProperty(LAYER_DOT, 'circle-stroke-opacity', dimmed(1, 0.15));
    map.setPaintProperty(LAYER_HALO, 'circle-color', color);
    map.setPaintProperty(
      LAYER_HALO,
      'circle-opacity',
      emphasis
        ? ['case', ['in', ['get', 'key'], ['literal', emphasis]], 0.3, 0]
        : ['case', isCity, 0, 0.26],
    );
    for (const layer of [LAYER_LABEL, LAYER_LABEL_CITY]) {
      map.setPaintProperty(layer, 'text-color', palette.propertyLabel);
      map.setPaintProperty(layer, 'text-halo-color', palette.propertyLabelHalo);
      map.setPaintProperty(layer, 'text-opacity', dimmed(1, 0.2));
    }
    map.setPaintProperty(LAYER_BUILDINGS, 'fill-extrusion-color', [
      'case',
      ['==', ['get', 'key'], selected ?? ''],
      palette.buildingSelected,
      emphasis ? ['in', ['get', 'key'], ['literal', emphasis]] : true,
      palette.buildingHighlight,
      palette.muted,
    ]);
    map.setPaintProperty(LAYER_COLUMNS, 'fill-extrusion-color', [
      'case',
      ['==', ['get', 'key'], selected ?? ''],
      palette.buildingSelected,
      color,
    ]);
  }

  function addDataLayers(): void {
    const beforeSymbols = firstSymbolLayerId(map);
    // Our extrusions go directly above the city's buildings, whatever the
    // basemap's layer order around them.
    const styleLayers = map.getStyle().layers ?? [];
    const buildingIndex = styleLayers.findIndex((layer) => layer.id === BUILDING_LAYER);
    const afterBuildings = buildingIndex >= 0 ? styleLayers[buildingIndex + 1]?.id : beforeSymbols;
    // Neighborhood shading sits under the roads so streets stay readable.
    const firstRoad = styleLayers.find((layer) => /^(tunnel|road|bridge)_/.test(layer.id))?.id;
    map.addSource(SOURCE_HOODS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer(
      { id: LAYER_HOOD_FILL, type: 'fill', source: SOURCE_HOODS, layout: { visibility: 'none' } },
      firstRoad,
    );
    map.addLayer(
      { id: LAYER_HOOD_LINE, type: 'line', source: SOURCE_HOODS, layout: { visibility: 'none' } },
      firstRoad,
    );
    map.addSource(SOURCE_POINTS, { type: 'geojson', data: pointCollection(points), promoteId: 'key' });
    map.addSource(SOURCE_COLUMNS, { type: 'geojson', data: columnCollection(points), promoteId: 'key' });

    // 3D columns: height is the published number of homes. They read at city
    // scale and fade out as the real buildings take over close in.
    map.addLayer(
      {
        id: LAYER_COLUMNS,
        type: 'fill-extrusion',
        source: SOURCE_COLUMNS,
        maxzoom: 14,
        paint: {
          'fill-extrusion-color': palette.property,
          'fill-extrusion-height': ['*', ['get', 'height'], ['global-state', 'hnColumnScale']],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 12.6, 0.88, 13.9, 0],
          'fill-extrusion-vertical-gradient': true,
        },
      },
      afterBuildings,
    );

    map.addSource(SOURCE_BUILDINGS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer(
      {
        id: LAYER_BUILDINGS,
        type: 'fill-extrusion',
        source: SOURCE_BUILDINGS,
        minzoom: 14,
        paint: {
          'fill-extrusion-color': palette.buildingHighlight,
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.96,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      afterBuildings,
    );

    map.addLayer({
      id: LAYER_HALO,
      type: 'circle',
      source: SOURCE_POINTS,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 11, 14, 19, 17, 27],
        'circle-blur': 0.9,
        'circle-pitch-alignment': 'viewport',
      },
    });

    // Zoom must drive the top-level interpolate; state and kind pick each stop.
    const radiusAt = (selectedPx: number, hoverPx: number, cityPx: number, listingPx: number): ExpressionSpecification => [
      'case',
      ['boolean', ['feature-state', 'selected'], false],
      selectedPx,
      ['boolean', ['feature-state', 'hover'], false],
      hoverPx,
      ['==', ['get', 'kind'], 'city'],
      cityPx,
      listingPx,
    ];
    map.addLayer({
      id: LAYER_DOT,
      type: 'circle',
      source: SOURCE_POINTS,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          9,
          radiusAt(8, 7, 2.6, 5.5),
          13,
          radiusAt(10, 9, 4, 7),
          16,
          radiusAt(12, 11, 7, 9),
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          3,
          ['==', ['get', 'kind'], 'city'],
          1.2,
          2,
        ],
        'circle-pitch-alignment': 'viewport',
      },
    });

    const label = (id: string, kind: 'listing' | 'city', minzoom: number) =>
      map.addLayer({
        id,
        type: 'symbol',
        source: SOURCE_POINTS,
        minzoom,
        filter: ['==', ['get', 'kind'], kind],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': [kind === 'listing' ? 'Noto Sans Bold' : 'Noto Sans Regular'],
          'text-size':
            kind === 'listing'
              ? ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 13.5]
              : ['interpolate', ['linear'], ['zoom'], 14, 10.5, 17, 12],
          'text-offset': [0, kind === 'listing' ? 1.3 : 1],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-padding': 3,
          'text-optional': true,
        },
        paint: { 'text-halo-width': 1.6, 'text-halo-blur': 0.4 },
      });
    label(LAYER_LABEL_CITY, 'city', 14.2);
    label(LAYER_LABEL, 'listing', 11);
  }

  function setColumnScale(target: number): void {
    cancelAnimationFrame(columnFrame);
    const from = columnScale;
    if (reducedMotion || from === target) {
      columnScale = target;
      map.setGlobalStateProperty('hnColumnScale', target);
      return;
    }
    const start = performance.now();
    const duration = 1000;
    const tick = (now: number) => {
      if (destroyed) return;
      const progress = Math.min((now - start) / duration, 1);
      columnScale = from + (target - from) * easeOutCubic(progress);
      map.setGlobalStateProperty('hnColumnScale', columnScale);
      if (progress < 1) columnFrame = requestAnimationFrame(tick);
    };
    columnFrame = requestAnimationFrame(tick);
  }

  /**
   * Outline the OpenStreetMap building under each property in brand color.
   * Building ids in the tiles are not unique, so instead of feature-state the
   * matched footprint is copied into its own extrusion layer, grown slightly
   * so its walls never z-fight with the original.
   */
  function refreshBuildingHighlights(): void {
    if (!styleReady || destroyed || !map.getLayer(BUILDING_LAYER)) return;
    const features: Array<Feature<Polygon>> = [];
    if (map.getZoom() >= 14) {
      const canvas = map.getCanvas();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const radius = Math.max(10, Math.min(40, 2 ** (map.getZoom() - 14) * 8));
      const visible = points
        .map((point) => ({ point, at: map.project([point.lng, point.lat]) }))
        .filter(({ at }) => at.x >= 0 && at.y >= 0 && at.x <= width && at.y <= height)
        .sort((a, b) => Number(b.point.key === selected) - Number(a.point.key === selected))
        .slice(0, MAX_BUILDING_QUERIES);
      for (const { point, at } of visible) {
        const candidates = map.queryRenderedFeatures(
          [
            [at.x - radius, at.y - radius],
            [at.x + radius, at.y + radius],
          ],
          { layers: [BUILDING_LAYER] },
        );
        const hit = footprintAt(candidates, point, NEAREST_BUILDING_M);
        if (!hit) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [grow(hit.ring, 0.8)] },
          properties: {
            key: point.key,
            height: Number(hit.feature.properties?.render_height ?? 6) + 0.8,
            base: Number(hit.feature.properties?.render_min_height ?? 0),
          },
        });
      }
    }
    // setData makes MapLibre repaint and go idle again, so skip it when
    // nothing changed; otherwise refreshes would never stop.
    const signature = features
      .map((feature) => `${feature.properties?.key}:${feature.geometry.coordinates[0].length}:${feature.properties?.height}`)
      .join('|');
    if (signature === highlightSignature) return;
    highlightSignature = signature;
    (map.getSource(SOURCE_BUILDINGS) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    });
  }

  function applyNeighborhoods(): void {
    if (!styleReady || !map.getSource(SOURCE_HOODS)) return;
    (map.getSource(SOURCE_HOODS) as GeoJSONSource).setData(hoods ?? { type: 'FeatureCollection', features: [] });
    const visibility = hoodsVisible && hoods ? 'visible' : 'none';
    map.setLayoutProperty(LAYER_HOOD_FILL, 'visibility', visibility);
    map.setLayoutProperty(LAYER_HOOD_LINE, 'visibility', visibility);
    const maxHomes = Math.max(1, ...(hoods?.features ?? []).map((feature) => Number(feature.properties?.homes ?? 0)));
    const isFocus: ExpressionSpecification = ['==', ['get', 'name'], hoodFocus ?? ''];
    // Square root spreads the shades: downtown has ten times most neighborhoods.
    map.setPaintProperty(LAYER_HOOD_FILL, 'fill-color', [
      'case',
      isFocus,
      palette.property,
      ['interpolate', ['linear'], ['sqrt', ['get', 'homes']], 0, palette.hoodLow, Math.sqrt(maxHomes), palette.hoodHigh],
    ]);
    // Neighborhoods with no City-financed homes stay clear rather than pale.
    map.setPaintProperty(LAYER_HOOD_FILL, 'fill-opacity', [
      'case',
      isFocus,
      0.4,
      ['==', ['get', 'homes'], 0],
      0,
      hoodFocus ? palette.hoodOpacity * 0.45 : palette.hoodOpacity,
    ]);
    map.setPaintProperty(LAYER_HOOD_LINE, 'line-color', ['case', isFocus, palette.property, palette.hoodLine]);
    map.setPaintProperty(LAYER_HOOD_LINE, 'line-width', ['case', isFocus, 2.5, 0.8]);
  }

  function scheduleHighlights(): void {
    window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(refreshBuildingHighlights, 120);
  }

  function keyAt(at: { x: number; y: number }, slop = 6): string | null {
    const hit = map.queryRenderedFeatures(
      [
        [at.x - slop, at.y - slop],
        [at.x + slop, at.y + slop],
      ],
      { layers: HIT_LAYERS },
    )[0];
    const key = hit?.properties?.key;
    return typeof key === 'string' ? key : null;
  }

  function setHovered(key: string | null): void {
    if (hovered === key) return;
    if (hovered) map.setFeatureState({ source: SOURCE_POINTS, id: hovered }, { hover: false });
    hovered = key;
    if (key) map.setFeatureState({ source: SOURCE_POINTS, id: key }, { hover: true });
    map.getCanvas().style.cursor = key ? 'pointer' : '';
  }

  function placePulse(): void {
    const point = selected ? points.find((item) => item.key === selected) : undefined;
    if (!point) {
      pulseMarker.remove();
      return;
    }
    const color = point.open
      ? palette.propertyOpen
      : point.color || (point.kind === 'city' ? palette.city : palette.property);
    pulseElement.style.setProperty('--hn-pulse', color);
    pulseMarker.setLngLat([point.lng, point.lat]).addTo(map);
  }

  function flyTo(target: { lng: number; lat: number; zoom?: number }): void {
    userMoved = true;
    // Follow the chosen view rather than the live pitch, so a flight that
    // starts during the 2D/3D ease lands in the right view.
    const pitched = currentView === '3d';
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: target.zoom ?? Math.max(map.getZoom(), 16.2),
      pitch: pitched ? Math.max(map.getPitch(), 55) : 0,
      // A small turn while flying reads as camera movement, not a jump cut.
      bearing: pitched ? map.getBearing() - 12 : map.getBearing(),
      padding: options.padding(),
      speed: 1.1,
      curve: 1.42,
      maxDuration: reducedMotion ? 0 : 3200,
      essential: false,
    });
  }

  // Recolor and add data as soon as the style is parsed, before tiles draw, so
  // visitors never see the stock basemap colors flash. MapLibre rebuilds the
  // style after it recovers a lost WebGL context, which drops runtime global
  // state, so this runs again then and must not add anything twice.
  function setupStyle(): void {
    if (destroyed) return;
    themeBaseLayers(map, palette);
    map.setGlobalStateProperty('hnColumnScale', columnScale);
    if (!map.getSource(SOURCE_POINTS)) addDataLayers();
    styleReady = true;
    applyDataPaint();
    applyNeighborhoods();
    if (selected) map.setFeatureState({ source: SOURCE_POINTS, id: selected }, { selected: true });
    placePulse();
    highlightSignature = '';
    scheduleHighlights();
  }
  map.on('style.load', setupStyle);

  map.on('load', () => {
    if (destroyed) return;
    emitViewport();
    options.onReady();

    if (options.introFrom && !reducedMotion) {
      map.once('idle', () => {
        if (destroyed || userMoved) return;
        const target = options.camera;
        map.flyTo({
          center: [target.lng, target.lat],
          zoom: target.zoom,
          pitch: target.pitch,
          bearing: target.bearing,
          padding: options.padding(),
          duration: 4200,
          curve: 1.2,
          essential: false,
        });
      });
    } else if (options.introFrom && !userMoved) {
      const target = options.camera;
      map.jumpTo({
        center: [target.lng, target.lat],
        zoom: target.zoom,
        pitch: target.pitch,
        bearing: target.bearing,
      });
    }
  });

  map.on('movestart', (event) => {
    if (event.originalEvent) userMoved = true;
  });
  map.on('moveend', () => {
    emitViewport();
    scheduleHighlights();
  });
  // Building footprints can only be queried once their tiles have drawn, so
  // look again whenever the map settles. The signature check above stops this
  // from looping: an unchanged result never calls setData, so the map stays idle.
  map.on('idle', scheduleHighlights);

  map.on('mousemove', (event) => {
    if (styleReady) setHovered(keyAt(event.point));
  });
  map.on('mouseout', () => setHovered(null));
  map.on('click', (event) => {
    if (!styleReady) return;
    // Touch needs a larger target than a mouse pointer.
    const touch = event.originalEvent instanceof PointerEvent && event.originalEvent.pointerType === 'touch';
    const key = keyAt(event.point, touch ? 14 : 6);
    options.onSelect(key);
    if (!key && hoodsVisible && map.getLayer(LAYER_HOOD_FILL)) {
      const name = map.queryRenderedFeatures(event.point, { layers: [LAYER_HOOD_FILL] })[0]?.properties?.name;
      if (typeof name === 'string') options.onNeighborhood(name);
    }
  });

  map.on('error', (event) => {
    const sourceId = (event as { sourceId?: string }).sourceId;
    if (!styleReady) {
      options.onError('tiles');
      return;
    }
    if (sourceId === BUILDING_SOURCE) {
      tileErrors += 1;
      if (tileErrors === 3) options.onError('tiles');
    }
  });
  // MapLibre restores a lost context on its own (and simulates a loss when a
  // phone kills its workers in the background), so only a loss that never
  // recovers is an error.
  map.on('webglcontextlost', () => {
    styleReady = false;
    window.clearTimeout(contextLossTimer);
    contextLossTimer = window.setTimeout(() => options.onError('webgl'), 8000);
  });
  map.on('webglcontextrestored', () => {
    window.clearTimeout(contextLossTimer);
    const restore = () => {
      if (destroyed) return;
      if (map.isStyleLoaded()) setupStyle();
      else map.once('styledata', restore);
    };
    restore();
  });

  return {
    setPoints(next) {
      points = next;
      if (!styleReady) return;
      (map.getSource(SOURCE_POINTS) as GeoJSONSource | undefined)?.setData(pointCollection(points));
      (map.getSource(SOURCE_COLUMNS) as GeoJSONSource | undefined)?.setData(columnCollection(points));
      if (selected) map.setFeatureState({ source: SOURCE_POINTS, id: selected }, { selected: true });
      placePulse();
      scheduleHighlights();
    },
    setSelected(key) {
      if (selected === key) return;
      if (styleReady && selected) {
        map.setFeatureState({ source: SOURCE_POINTS, id: selected }, { selected: false });
      }
      selected = key;
      if (!styleReady) return;
      if (key) map.setFeatureState({ source: SOURCE_POINTS, id: key }, { selected: true });
      applyDataPaint();
      placePulse();
      refreshBuildingHighlights();
    },
    setEmphasis(keys) {
      emphasis = keys;
      applyDataPaint();
    },
    setNeighborhoods(data, visible, focus) {
      hoods = data;
      hoodsVisible = visible;
      hoodFocus = focus;
      applyNeighborhoods();
    },
    setTheme(theme) {
      palette = PALETTES[theme];
      if (!styleReady) return;
      themeBaseLayers(map, palette);
      applyDataPaint();
      placePulse();
    },
    setView(view) {
      userMoved = true;
      currentView = view;
      const target = VIEW_CAMERA[view];
      map.easeTo({
        pitch: target.pitch,
        bearing: view === '2d' ? 0 : map.getBearing() || target.bearing,
        duration: animationDuration(1100),
        easing: easeOutCubic,
        essential: false,
      });
      if (styleReady) setColumnScale(view === '3d' ? 1 : 0);
      else columnScale = view === '3d' ? 1 : 0;
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
    flyTo,
    fitPoints(targets, maxZoom = 15.5) {
      if (targets.length === 0) return;
      userMoved = true;
      if (targets.length === 1) {
        flyTo({ ...targets[0], zoom: Math.min(16.2, maxZoom + 0.7) });
        return;
      }
      const bounds = new LngLatBounds();
      for (const target of targets) bounds.extend([target.lng, target.lat]);
      // MapLibre adds the map's own padding (the panel or sheet) to this one,
      // so refresh it and ask only for a margin around the points.
      map.setPadding(options.padding());
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom,
        pitch: currentView === '3d' ? Math.max(map.getPitch(), 50) : 0,
        bearing: map.getBearing(),
        duration: animationDuration(1800),
        essential: false,
      });
    },
    zoomBy(delta) {
      userMoved = true;
      map.easeTo({ zoom: map.getZoom() + delta, duration: animationDuration(350) });
    },
    resetNorth() {
      userMoved = true;
      map.easeTo({ bearing: 0, duration: animationDuration(600) });
    },
    getCamera: currentCamera,
    resize() {
      map.resize();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(columnFrame);
      window.clearTimeout(highlightTimer);
      window.clearTimeout(contextLossTimer);
      pulseMarker.remove();
      map.remove();
    },
  };
}
