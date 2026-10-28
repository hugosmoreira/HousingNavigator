import { describe, expect, it } from 'vitest';
import { collectInitialAssets, isMapEngineChunk, type ViteManifest } from './bundleBudget';

describe('bundle budget manifest traversal', () => {
  it('counts synchronous imports and excludes deferred route chunks', () => {
    const manifest: ViteManifest = {
      'index.html': {
        file: 'assets/index.js',
        isEntry: true,
        imports: ['_vendor.js'],
        dynamicImports: ['src/pages/Dashboard.tsx'],
        css: ['assets/index.css'],
      },
      '_vendor.js': {
        file: 'assets/vendor.js',
        css: ['assets/index.css', 'assets/vendor.css'],
      },
      'src/pages/Dashboard.tsx': {
        file: 'assets/dashboard.js',
        imports: ['_vendor.js'],
      },
    };

    expect(collectInitialAssets(manifest)).toEqual({
      entryKey: 'index.html',
      javascript: ['assets/index.js', 'assets/vendor.js'],
      css: ['assets/index.css', 'assets/vendor.css'],
    });
  });

  it('fails closed when the manifest has no entry', () => {
    expect(() => collectInitialAssets({})).toThrow(/entry chunk/);
  });

  it('identifies only the MapLibre chunk and worker as the map engine', () => {
    expect(isMapEngineChunk({ file: 'assets/maplibre-a1.js', name: 'maplibre' })).toBe(true);
    expect(
      isMapEngineChunk({
        file: 'assets/maplibre-gl-worker-b2.js',
        src: 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
      }),
    ).toBe(true);
    expect(isMapEngineChunk({ file: 'assets/MapExplorer-c3.js', src: 'src/pages/MapExplorer.tsx' })).toBe(false);
    expect(isMapEngineChunk({ file: 'assets/module.slim-d4.js', name: 'module.slim.no-external' })).toBe(false);
  });

  it('keeps the map engine out of the first page load', () => {
    const manifest: ViteManifest = {
      'index.html': { file: 'assets/index.js', isEntry: true, dynamicImports: ['src/pages/MapExplorer.tsx'] },
      'src/pages/MapExplorer.tsx': {
        file: 'assets/MapExplorer.js',
        isDynamicEntry: true,
        dynamicImports: ['src/map/housingMap.ts'],
      },
      'src/map/housingMap.ts': { file: 'assets/housingMap.js', imports: ['_maplibre.js'] },
      '_maplibre.js': { file: 'assets/maplibre.js', name: 'maplibre' },
    };
    expect(collectInitialAssets(manifest).javascript).toEqual(['assets/index.js']);
  });
});
