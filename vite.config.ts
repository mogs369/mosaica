import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Mosaica',
        short_name: 'Mosaica',
        description: 'Photo mosaics from your own photo folders. Works offline.',
        theme_color: '#1f1b16',
        background_color: '#17140f',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,wasm}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
