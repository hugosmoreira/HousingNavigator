import type {
  ExpressionSpecification,
  LightSpecification,
  Map as MapLibreMap,
  SkySpecification,
} from 'maplibre-gl';

/**
 * Basemap: OpenFreeMap's free, key-less vector tiles of OpenStreetMap data
 * (https://openfreemap.org). The style is recolored at runtime instead of
 * forked, so upstream fixes keep flowing in. The approach follows BUILD416's
 * MIT-licensed themeBaseLayers() (Copyright (c) 2026 Nelson Lee); the palettes
 * here are Housing Navigator's own.
 */
export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export type MapTheme = 'day' | 'night';

/** Layer and source ids owned by Housing Navigator start with this prefix. */
export const HN_PREFIX = 'hn-';

export interface MapPalette {
  background: string;
  land: string;
  park: string;
  water: string;
  waterLine: string;
  buildingFlat: string;
  extrusion: Array<[number, string]>;
  extrusionOpacity: number;
  roadMajor: string;
  roadMajorOpacity: number;
  roadMinor: string;
  roadMinorOpacity: number;
  /** Null hides casings for a flatter, blueprint-like street grid. */
  roadCasing: string | null;
  rail: string;
  boundary: string;
  label: string;
  labelHalo: string;
  waterLabel: string;
  sky: SkySpecification;
  light: LightSpecification;
  /** Housing Navigator data colors. */
  property: string;
  /** City-financed records that Housing Navigator does not list. */
  city: string;
  /** Points outside a group picked in the data view. */
  muted: string;
  /** Neighborhood shading, light to dark by income-restricted homes. */
  hoodLow: string;
  hoodHigh: string;
  hoodLine: string;
  hoodOpacity: number;
  propertyOpen: string;
  propertyStroke: string;
  propertyLabel: string;
  propertyLabelHalo: string;
  buildingHighlight: string;
  buildingSelected: string;
}

export const PALETTES: Record<MapTheme, MapPalette> = {
  day: {
    background: '#eef2f6',
    land: '#e9eef3',
    park: '#dde9df',
    water: '#bad1eb',
    waterLine: '#a6c1e2',
    buildingFlat: '#dbe2ea',
    extrusion: [
      [0, '#e6ebf1'],
      [20, '#d8e0ea'],
      [60, '#c5d1e0'],
      [150, '#adbfd6'],
      [300, '#95abc9'],
    ],
    extrusionOpacity: 0.94,
    roadMajor: '#ffffff',
    roadMajorOpacity: 1,
    roadMinor: '#ffffff',
    roadMinorOpacity: 0.95,
    roadCasing: '#d3dbe5',
    rail: '#c6ced8',
    boundary: '#aab4bf',
    label: '#4a5560',
    labelHalo: '#f8f9fb',
    waterLabel: '#5a7fae',
    sky: {
      'sky-color': '#cfe0f5',
      'horizon-color': '#eef3f9',
      'fog-color': '#eef2f6',
      'sky-horizon-blend': 0.55,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.65,
      'atmosphere-blend': 0,
    },
    light: { anchor: 'viewport', color: '#ffffff', intensity: 0.34, position: [1.3, 200, 40] },
    property: '#0053dd',
    city: '#7486b0',
    muted: '#c4ccd6',
    hoodLow: '#e6edf8',
    hoodHigh: '#2457c5',
    hoodLine: '#9db0d3',
    hoodOpacity: 0.3,
    propertyOpen: '#059669',
    propertyStroke: '#ffffff',
    propertyLabel: '#1f2a37',
    propertyLabelHalo: '#ffffff',
    buildingHighlight: '#5b8def',
    buildingSelected: '#0053dd',
  },
  night: {
    background: '#0b1220',
    land: '#0d1526',
    park: '#0e1b22',
    water: '#09182f',
    waterLine: '#16305a',
    buildingFlat: '#141e33',
    extrusion: [
      [0, '#19233b'],
      [20, '#1f2b48'],
      [60, '#27375d'],
      [150, '#314775'],
      [300, '#3c5791'],
    ],
    extrusionOpacity: 0.96,
    roadMajor: '#3f74e0',
    roadMajorOpacity: 0.5,
    roadMinor: '#1c2943',
    roadMinorOpacity: 0.95,
    roadCasing: null,
    rail: '#19243b',
    boundary: '#24324f',
    label: '#8d9bb4',
    labelHalo: '#0b1220',
    waterLabel: '#4f6e9f',
    sky: {
      'sky-color': '#0b1220',
      'horizon-color': '#15233f',
      'fog-color': '#0b1220',
      'sky-horizon-blend': 0.5,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.55,
      'atmosphere-blend': 0,
    },
    light: { anchor: 'viewport', color: '#dfe8ff', intensity: 0.45, position: [1.3, 200, 40] },
    property: '#6b97ff',
    city: '#8b9cc4',
    muted: '#2c3853',
    hoodLow: '#16233d',
    hoodHigh: '#4f7fe8',
    hoodLine: '#2d4270',
    hoodOpacity: 0.42,
    propertyOpen: '#34d399',
    propertyStroke: '#0b1220',
    propertyLabel: '#e7edf8',
    propertyLabelHalo: '#0b1220',
    buildingHighlight: '#3f6fe0',
    buildingSelected: '#7aa2ff',
  },
};

function safely(action: () => void): void {
  try {
    action();
  } catch {
    // Upstream may rename a layer; a missed recolor must not break the map.
  }
}

// Building ids in the OpenMapTiles building layer are not unique, so property
// buildings are highlighted with their own layer (housingMap.ts), not by
// feature-state on this one.
function extrusionColor(palette: MapPalette): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'render_height'], 6],
    ...palette.extrusion.flat(),
  ] as unknown as ExpressionSpecification;
}

const MAJOR_ROAD = /motorway|trunk|primary|secondary/;
const PARKLIKE = /park|wood|forest|grass|garden|pitch|golf|recreation|cemetery|meadow|landcover|wetland/;

/** Recolor every basemap layer for the theme. Housing Navigator layers are skipped. */
export function themeBaseLayers(map: MapLibreMap, palette: MapPalette): void {
  const layers = map.getStyle()?.layers ?? [];
  type PaintName = Parameters<MapLibreMap['setPaintProperty']>[1];
  type LayoutName = Parameters<MapLibreMap['setLayoutProperty']>[1];
  const paint = (id: string, property: PaintName, value: unknown) =>
    safely(() => map.setPaintProperty(id, property, value));
  const layout = (id: string, property: LayoutName, value: Parameters<MapLibreMap['setLayoutProperty']>[2]) =>
    safely(() => map.setLayoutProperty(id, property, value));

  for (const layer of layers) {
    const id = layer.id;
    const name = id.toLowerCase();
    if (id.startsWith(HN_PREFIX)) continue;
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;

    switch (layer.type) {
      case 'background':
        paint(id, 'background-color', palette.background);
        break;
      case 'raster':
        // Natural Earth relief only shows below zoom 7, which the map never uses.
        layout(id, 'visibility', 'none');
        break;
      case 'fill':
        if (name === 'road_area_pattern') {
          layout(id, 'visibility', 'none');
        } else if (/water/.test(name)) {
          paint(id, 'fill-color', palette.water);
        } else if (name === 'building') {
          paint(id, 'fill-color', palette.buildingFlat);
          paint(id, 'fill-outline-color', palette.buildingFlat);
        } else if (PARKLIKE.test(name)) {
          paint(id, 'fill-color', palette.park);
          paint(id, 'fill-opacity', 1);
        } else {
          paint(id, 'fill-color', palette.land);
          paint(id, 'fill-opacity', 1);
        }
        break;
      case 'line':
        if (/water/.test(name)) {
          paint(id, 'line-color', palette.waterLine);
        } else if (name === 'park_outline') {
          layout(id, 'visibility', 'none');
        } else if (/casing|outline/.test(name)) {
          if (palette.roadCasing) {
            paint(id, 'line-color', palette.roadCasing);
            paint(id, 'line-opacity', 1);
          } else {
            paint(id, 'line-opacity', 0);
          }
        } else if (/rail|transit|hatching/.test(name)) {
          paint(id, 'line-color', palette.rail);
        } else if (/boundary|admin/.test(name)) {
          paint(id, 'line-color', palette.boundary);
          paint(id, 'line-opacity', 0.5);
        } else if (MAJOR_ROAD.test(name)) {
          paint(id, 'line-color', palette.roadMajor);
          paint(id, 'line-opacity', palette.roadMajorOpacity);
        } else {
          paint(id, 'line-color', palette.roadMinor);
          paint(id, 'line-opacity', palette.roadMinorOpacity);
        }
        break;
      case 'symbol':
        if (sourceLayer === 'poi' || /poi|housenumber|shield|one_way|airport/.test(name)) {
          layout(id, 'visibility', 'none');
        } else {
          const isWater = /water/.test(name);
          paint(id, 'text-color', isWater ? palette.waterLabel : palette.label);
          paint(id, 'text-halo-color', palette.labelHalo);
          paint(id, 'text-halo-width', 1.4);
          if (sourceLayer === 'place') layout(id, 'text-letter-spacing', 0.04);
        }
        break;
      case 'fill-extrusion':
        // Show city blocks from zoom 13 so the overview already has depth.
        safely(() => map.setLayerZoomRange(id, 13, 24));
        paint(id, 'fill-extrusion-color', extrusionColor(palette));
        // Some OSM buildings carry no height; give them a low default instead
        // of a null that MapLibre warns about.
        paint(id, 'fill-extrusion-height', ['coalesce', ['get', 'render_height'], 6]);
        paint(id, 'fill-extrusion-base', ['coalesce', ['get', 'render_min_height'], 0]);
        paint(id, 'fill-extrusion-opacity', palette.extrusionOpacity);
        paint(id, 'fill-extrusion-vertical-gradient', true);
        break;
      default:
        break;
    }
  }

  safely(() => map.setSky(palette.sky));
  safely(() => map.setLight(palette.light));
}

export function firstSymbolLayerId(map: MapLibreMap): string | undefined {
  return map.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id;
}
