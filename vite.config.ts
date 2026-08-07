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
    },
    server: {
      // HMR can be disabled via the DISABLE_HMR env var (used by some
      // hosted editors to prevent flicker during automated edits).
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
