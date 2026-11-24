import { defineConfig } from 'vite';

// GitHub Pages serves the app from https://<user>.github.io/fueltrip/,
// so all asset URLs must be prefixed with the repository name.
export default defineConfig({
  base: '/fueltrip/',
  build: {
    // maplibre-gl alone is ~1 MB minified (~290 kB gzip); that's expected.
    chunkSizeWarningLimit: 1200,
  },
});
