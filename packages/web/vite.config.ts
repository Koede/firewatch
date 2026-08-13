import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Consume the shared package straight from source: no build step between
      // editing a type and seeing it in the client.
      '@firewatch/shared': path.resolve(here, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    // The client calls /api on its own origin; in dev that is proxied to the
    // API server, so no CORS configuration is needed for local work.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // MapLibre is by far the largest dependency; splitting it lets the
          // app shell paint while the map engine is still downloading.
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
});
