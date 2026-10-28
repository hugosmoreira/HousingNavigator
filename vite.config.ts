import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Only a PostHog public project token (phc_) may be bundled. This supports
  // the legacy names already used by this deployment without ever exposing a
  // PostHog personal API key (phx_) to browser code.
  const candidateKey = env.VITE_POSTHOG_KEY || env.POSTHOG_API_KEY || '';
  const posthogKey = candidateKey.startsWith('phc_') ? candidateKey : '';
  const candidateHost = env.VITE_POSTHOG_HOST || env.POSTHOG_HOST || '';
  let posthogHost = '';
  try {
    const parsed = new URL(candidateHost);
    if (parsed.protocol === 'https:') posthogHost = parsed.origin;
  } catch {
    // Invalid/missing analytics config intentionally produces a no-op client.
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Same value in the prerendered HTML and the hydrated client, so the
      // footer year never causes a hydration mismatch after New Year.
      __BUILD_YEAR__: JSON.stringify(new Date().getUTCFullYear()),
      'import.meta.env.VITE_POSTHOG_KEY': JSON.stringify(posthogKey),
      'import.meta.env.VITE_POSTHOG_HOST': JSON.stringify(posthogHost),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // The manifest lets the budget check distinguish render-blocking entry
      // imports from account/admin chunks that are loaded only on demand.
      manifest: true,
      rollupOptions: {
        output: {
          // Keep the map engine in one named chunk so the budget check can
          // hold it to its own limit. It loads only on /map.
          manualChunks(id) {
            if (id.includes('/node_modules/maplibre-gl/')) return 'maplibre';
            return undefined;
          },
          // MapLibre's worker ships as .mjs. Hosts do not all serve .mjs as
          // JavaScript, and nosniff would then block it, so emit it as .js.
          assetFileNames(assetInfo) {
            const name = assetInfo.names?.[0] ?? '';
            return name.endsWith('.mjs')
              ? 'assets/[name]-[hash].js'
              : 'assets/[name]-[hash][extname]';
          },
        },
      },
    },
    server: {
      // HMR can be disabled via the DISABLE_HMR env var (used by some
      // hosted editors to prevent flicker during automated edits).
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
