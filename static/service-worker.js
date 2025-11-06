const CACHE = "portify-v5";

const ASSETS = [
  "/",
  "/static/style.css",
  "/static/app.js",
  "/static/assets/logo192.png",
  "/static/assets/logo512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // ✅ Skip socket.io (fixes websocket failure)
  if (url.pathname.startsWith("/socket.io/")) {
    return;
  }

  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((res) => res || fetch(e.request))
    );
  }
});
