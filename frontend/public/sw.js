// ChipIn service worker — runtime caching + offline fallback
const CACHE = 'chipin-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, cross-origin, and API requests.
  // API responses are user-specific and must always come from the network.
  if (request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Images: cache-first
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then(
        cached => cached || fetch(request).then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
          return res
        })
      )
    )
    return
  }

  // Navigation: network-first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/offline.html')
        return cached || new Response('You are offline', { headers: { 'Content-Type': 'text/plain' } })
      })
    )
  }
})
