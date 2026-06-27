/* PWA Service Worker (cache seguro de assets estáticos)
   - Não intercepta chamadas para domínios externos (ex: supabase.co)
   - Evita cache de requests não-GET
*/

const CACHE_VERSION = "v9";
const STATIC_CACHE = `cardapios-static-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./pwa/icon.svg",
  "./admin/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("cardapios-static-") && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isCacheableRequest(request) {
  if (!request || request.method !== "GET") return false;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isSupabase = url.hostname.includes("supabase.co");
  const isExternalImage = url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i);

  if (!isSameOrigin && !isSupabase && !isExternalImage) return false;

  // Evita cache de URLs "sensíveis"
  if (url.pathname.includes("/api/")) return false;

  return true;
}


function isStaticAsset(url) {
  return (
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webmanifest")
  );
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached || (await fetchPromise) || Response.error();
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isCacheableRequest(request)) return;

  const url = new URL(request.url);

  // Navegação (HTML) ou dados do Supabase: network-first
  const isNav = request.mode === "navigate";
  const isData = url.hostname.includes("supabase.co") && !url.pathname.includes("/storage/");

  if (isNav || isData) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Assets estáticos e imagens: stale-while-revalidate
  if (isStaticAsset(url) || url.pathname.includes("/storage/") || !url.hostname.includes(self.location.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

