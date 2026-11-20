const RELEASE = "3";
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `tcm-mastery:${new URL(SCOPE).pathname}:`;
const CACHE = `${CACHE_PREFIX}${RELEASE}`;
const SHELL = new URL("index.html", SCOPE).href;
const ASSETS = new Set([
  "index.html",
  "app.css",
  "tcm-study.css",
  "tcm-atlas.css",
  "tcm-cases.css",
  "study-desk.webp",
  "tcm-offline.css",
  "conditions.js",
  "points.js",
  "herbs.js",
  "formulas.js",
  "app-core.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
].map((path) => new URL(path, SCOPE).href));

function isLegacyCache(key) {
  return /^tcm-mastery-v\d+$/.test(key);
}

function releaseUrl(url) {
  const versioned = new URL(url);
  versioned.searchParams.set("tcm-release", RELEASE);
  return versioned.href;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...ASSETS].map((url) => new Request(releaseUrl(url), { cache: "reload" })));

    // The pre-3 app cannot offer the update button yet. Existing tabs keep their DOM.
    const cacheNames = await caches.keys();
    if (cacheNames.some(isLegacyCache)) await self.skipWaiting();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const previousVersions = keys.filter((key) =>
      key !== CACHE && (key.startsWith(CACHE_PREFIX) || isLegacyCache(key))
    );
    await Promise.all(previousVersions.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function serveRelease(cachedUrl) {
  const cache = await caches.open(CACHE);
  const versionedUrl = releaseUrl(cachedUrl);
  const cached = await cache.match(versionedUrl);
  if (cached) return cached;

  try {
    const fresh = await fetch(versionedUrl, { cache: "reload" });
    if (fresh.ok) return fresh;
  } catch (error) {
    // If the device cleared the cache while offline, provide a response the browser can display.
  }

  return new Response("Mästaren behöver en internetanslutning för att förbereda offlineläget.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(SCOPE)) return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    const scopePath = new URL(SCOPE).pathname;
    if (url.pathname === scopePath || url.pathname === `${scopePath}index.html`) {
      event.respondWith(serveRelease(SHELL));
    }
    return;
  }

  if (url.searchParams.get("tcm-release") === RELEASE) {
    url.searchParams.delete("tcm-release");
  }
  if (ASSETS.has(url.href)) event.respondWith(serveRelease(url.href));
});
