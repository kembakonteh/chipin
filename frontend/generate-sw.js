import { generateSW } from 'workbox-build'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const result = await generateSW({
  swDest: resolve(__dirname, 'dist/sw.js'),
  globDirectory: resolve(__dirname, 'dist'),
  globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      urlPattern: /^\/api\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        cacheableResponse: { statuses: [0, 200] },
        expiration: { maxEntries: 50, maxAgeSeconds: 300 },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === 'image',
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        cacheableResponse: { statuses: [0, 200] },
        expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
  ],
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/api\//, /^\/offline\.html$/],
})

console.log(`SW generated: ${result.count} files precached, ${result.size} bytes`)
