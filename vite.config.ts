import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json';

// Shown in the settings: which build is running on this device.
const buildCommit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // recharts and @zxing are pulled in via dynamic import(), so Rollup
          // splits them automatically — forcing them here would be redundant.
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  plugins: [
    react(),
    VitePWA({
      // A new version activates immediately (skipWaiting + clientsClaim).
      // Registration and the reload onto the new version are handled in
      // src/lib/appUpdate.ts, so no register script is injected.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Vorrat & Ernährung',
        short_name: 'Vorrat',
        description:
          'Lokale App zur Verwaltung von Lebensmittel-Vorrat und Ernährung.',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f3ef',
        theme_color: '#247a4e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Stated explicitly: without the injected register script the plugin
        // would otherwise build a worker that waits to be told to activate –
        // and installed apps on iOS may then never pick up a new version.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Only precache Latin font subsets; others download on demand.
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        runtimeCaching: [
          {
            // External API calls: network-first with a cache fallback so the
            // app keeps working offline for already-seen data.
            urlPattern: ({ url }) =>
              url.hostname.includes('openfoodfacts.org') ||
              url.hostname.includes('spoonacular.com'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
