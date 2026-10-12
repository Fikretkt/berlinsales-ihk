// itmart Service Worker.
// Strategien:
//   - OSM-Tiles            → cache-first, max 30 Tage
//   - Static (Next.js)     → cache-first
//   - API GET (markets)    → network-first mit Stale-Cache-Fallback
//   - API mutations + auth → network-only (Offline-Queue läuft im Frontend)
//   - HTML-Navigation      → network-first mit App-Shell-Fallback

const VERSION = "zalsosales-v1.0.0";
const STATIC_CACHE = `${VERSION}-static`;
const TILE_CACHE = `${VERSION}-tiles`;
const API_CACHE = `${VERSION}-api`;

const TILE_HOSTS = [
  "tile.openstreetmap.org",
  "a.tile.openstreetmap.org",
  "b.tile.openstreetmap.org",
  "c.tile.openstreetmap.org",
];

const APP_SHELL = ["/", "/auth/login", "/manifest.json", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => null))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Tiles
  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, TILE_CACHE));
    return;
  }
  // Next.js static assets use their own content-hashed browser cache. Do not
  // keep an app-controlled copy: it can retain incompatible Server Action
  // bundles across a deployment.
  // Icons
  if (
    url.pathname === "/manifest.json" ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/favicon.png"
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
  // API GET — network-first, fallback auf Cache
  if (url.pathname.startsWith("/api/v1/markets") && req.method === "GET") {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }
  // SSE-Stream und Auth-Routen: nicht cachen
  if (
    url.pathname.startsWith("/api/v1/events") ||
    url.pathname.startsWith("/api/v1/auth") ||
    url.pathname.startsWith("/api/auth")
  ) {
    return; // default
  }
  // HTML-Navigation
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, STATIC_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}
