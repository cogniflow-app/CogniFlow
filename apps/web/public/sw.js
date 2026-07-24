/* Lumen Phase 06 service worker. Private projections belong in IndexedDB. */
const VERSION = "phase06-v1";
const STATIC_CACHE = `lumen-static-${VERSION}`;
const PUBLIC_CACHE = `lumen-public-${VERSION}`;
const OFFLINE_SHELL = "/offline";
const PRECACHE = [
  OFFLINE_SHELL,
  "/brand-mark.svg",
  "/pwa/icons/icon-192.png",
  "/pwa/icons/icon-512.png",
  "/pwa/icons/icon-maskable-512.png",
];
const NEVER_CACHE_PATHS = [
  "/api/",
  "/auth/",
  "/onboarding",
  "/app/settings",
  "/app/parent",
  "/app/portability",
  "/api/portability",
  "/portability/upload",
  "/portability/artifact",
  "/portability/diagnostic",
  "/portability/backup",
  "/portability/restore",
  "/privacy/export",
  "/account/delete",
];

function cacheable(response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  const policy = (response.headers.get("cache-control") || "").toLowerCase();
  return (
    !policy.includes("no-store") &&
    !policy.includes("private") &&
    !response.headers.has("set-cookie")
  );
}

function isNeverCache(url) {
  return NEVER_CACHE_PATHS.some((path) => url.pathname.startsWith(path));
}

async function staticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) await cache.put(request, response.clone());
  return response;
}

async function publicResource(request) {
  const cache = await caches.open(PUBLIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (cacheable(response)) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function navigation(request) {
  try {
    return await fetch(request, { cache: "no-store" });
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    return (
      (await cache.match(OFFLINE_SHELL)) ||
      new Response("This page is unavailable offline.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        status: 503,
      })
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await cache.addAll(PRECACHE);
      const shell = await cache.match(OFFLINE_SHELL);
      if (!shell) return;
      const markup = await shell.text();
      const assets = [...markup.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/gu)].map(
        (match) => match[1],
      );
      await Promise.allSettled([...new Set(assets)].map((asset) => cache.add(asset)));
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                (name.startsWith("lumen-static-") || name.startsWith("lumen-public-")) &&
                name !== STATIC_CACHE &&
                name !== PUBLIC_CACHE,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isNeverCache(url)) return;
  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa/icons/") ||
    url.pathname === "/brand-mark.svg"
  ) {
    event.respondWith(staticAsset(request));
    return;
  }
  if (url.pathname.startsWith("/api/public/v1/decks/")) {
    event.respondWith(publicResource(request));
  }
});

self.addEventListener("message", (event) => {
  const sourceOrigin =
    event.source && "url" in event.source && event.source.url
      ? new URL(event.source.url).origin
      : event.origin;
  if (sourceOrigin !== self.location.origin || !event.data || typeof event.data !== "object")
    return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (event.data.type === "CLEAR_PRIVATE_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter(
                (name) => name.startsWith("lumen-private-") || name.startsWith("lumen-learner-"),
              )
              .map((name) => caches.delete(name)),
          ),
        ),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "lumen-sync-v1") return;
  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((clients) =>
        Promise.all(clients.map((client) => client.postMessage({ type: "SYNC_REQUESTED" }))),
      ),
  );
});
