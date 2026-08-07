import { describe, expect, it } from 'vitest';
import { collectInitialAssets, type ViteManifest } from './bundleBudget';

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
});
