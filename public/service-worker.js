const DEEPSIGNAL_CACHE_MARKER = "deepsignal";

async function pruneDeepSignalCaches() {
  if (!("caches" in self)) {
    return;
  }
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.toLowerCase().includes(DEEPSIGNAL_CACHE_MARKER))
      .map((cacheName) => caches.delete(cacheName)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    pruneDeepSignalCaches()
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});
