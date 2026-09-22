const CACHE_VERSION = "cnation-book-v4";
const CORE_CACHE = `${CACHE_VERSION}-core`;
const BOOK_CACHE = `${CACHE_VERSION}-books`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./data/library.json",
  "./data/catalog.json",
  "./data/books/park-jaehyun/catalog.json",
  "./fonts/noto-serif-kr-400.woff2",
  "./fonts/noto-serif-kr-700.woff2",
  "./fonts/noto-sans-kr-400.woff2",
  "./fonts/noto-sans-kr-700.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CORE_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const activeCaches = new Set([CORE_CACHE, BOOK_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !activeCaches.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.includes("/volumes/")) {
    event.respondWith(cacheFirst(request, BOOK_CACHE));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.includes("/fonts/")) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CORE_CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, CORE_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
