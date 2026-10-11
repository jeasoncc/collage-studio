import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import { createPartialResponse, RangeRequestsPlugin } from 'workbox-range-requests';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;
declare const __COLLAGE_PWA_BUILD_ID__: string;

const scopeUrl = new URL(self.registration.scope);
if (scopeUrl.origin !== self.location.origin || scopeUrl.pathname !== '/' || !['collage.szlh.top', 'localhost', '127.0.0.1', '[::1]'].includes(scopeUrl.hostname)) {
  throw new Error('拼图离线服务只能注册在独立域名根目录或本机预览环境。');
}
const cachePrefix = 'collage-studio-pwa:/';
const precacheName = `${cachePrefix}:precache`;
const previousName = `${cachePrefix}:previous-assets`;
const runtimeName = `${cachePrefix}:runtime`;
const ownsUrl = (url: URL) => url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);
const entries = self.__WB_MANIFEST;
for (const entry of entries) {
  const url = new URL(typeof entry === 'string' ? entry : entry.url, self.location.href);
  if (!ownsUrl(url) || url.pathname.endsWith('.wasm')) throw new Error('离线资源超出拼图范围。');
}

const precache = new PrecacheController({ cacheName: precacheName, plugins: [new RangeRequestsPlugin()] });
precache.addToCacheList(entries);
self.addEventListener('install', event => { void precache.install(event); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const current = await caches.open(precacheName);
    const required = new Set(precache.getURLsToCacheKeys().values());
    const obsolete = (await current.keys()).filter(request => !required.has(request.url));
    if (obsolete.length) {
      // Keep the immediately previous assets for other tabs; never touch another app's caches.
      await caches.delete(previousName);
      const previous = await caches.open(previousName);
      for (const request of obsolete) {
        const response = await current.match(request);
        if (response) await previous.put(request, response);
      }
    }
    await precache.activate(event);
    await self.clients.claim();
  })());
});

registerRoute(
  ({ request, url }) => request.mode === 'navigate' && ownsUrl(url) &&
    (url.pathname === scopeUrl.pathname || url.pathname === `${scopeUrl.pathname}index.html`),
  precache.createHandlerBoundToURL(`${scopeUrl.href}index.html`),
);
registerRoute(new PrecacheRoute(precache, { cleanURLs: false }));
const runtime = new CacheFirst({
  cacheName: runtimeName,
  plugins: [new CacheableResponsePlugin({ statuses: [200] }), new RangeRequestsPlugin(), {
    async cacheDidUpdate() {
      const cache = await caches.open(runtimeName);
      const requests = await cache.keys();
      // Only ONNX runtime files enter this cache; retain at most two runtime versions.
      for (const request of requests.slice(0, Math.max(0, requests.length - 2))) await cache.delete(request);
    },
  }],
});
registerRoute(
  ({ url }) => ownsUrl(url) && url.pathname.startsWith(`${scopeUrl.pathname}assets/`),
  async context => {
    if (await caches.has(previousName)) {
      const previous = await caches.open(previousName);
      const response = await previous.match(context.request, { ignoreSearch: true });
      if (response) return context.request.headers.has('range') ? createPartialResponse(context.request, response) : response;
    }
    // AI weights keep Transformers.js's own on-demand cache; never route external requests here.
    if (context.url.pathname.endsWith('.wasm')) return runtime.handle(context);
    return fetch(context.request);
  },
);

async function offlineStatus() {
  let offlineReady = false;
  if (await caches.has(precacheName)) {
    const cache = await caches.open(precacheName);
    const present = new Set((await cache.keys()).map(request => request.url));
    offlineReady = [...precache.getURLsToCacheKeys().values()].every(key => present.has(key));
  }
  return { version: __COLLAGE_PWA_BUILD_ID__, offlineReady };
}
let preparation: Promise<void> | undefined;
async function repairOfflineResources() {
  const cache = await caches.open(precacheName);
  const present = new Set((await cache.keys()).map(request => request.url));
  const missing = [...precache.getURLsToCacheKeys()].filter(([, key]) => !present.has(key));
  let next = 0;
  const downloads = await Promise.allSettled(Array.from({ length: Math.min(6, missing.length) }, async () => {
    while (next < missing.length) {
      const [url, key] = missing[next++]!;
      const integrity = precache.getIntegrityForCacheKey(key);
      if (!integrity) throw new Error('此版本缺少资源校验信息，请联网更新应用。');
      // SRI prevents a newer HTML/assets revision from being written under an older cache key.
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin', integrity });
      if (response.status !== 200) throw new Error('离线资源下载失败，请检查网络后重试。');
      await cache.put(key, response);
    }
  }));
  const failed = downloads.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
self.addEventListener('message', event => {
  if (!event.source || !('url' in event.source) || !ownsUrl(new URL(event.source.url))) return;
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  const port = event.ports[0];
  if (!port || (event.data?.type !== 'PWA_STATUS' && event.data?.type !== 'PWA_PREPARE')) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'PWA_PREPARE') {
        preparation ??= repairOfflineResources().finally(() => { preparation = undefined; });
        await preparation;
      }
      port.postMessage(await offlineStatus());
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      port.postMessage({ version: __COLLAGE_PWA_BUILD_ID__, offlineReady: false, error: `离线资源准备失败：${detail}。请联网重试；如有新版本，请返回首页更新。` });
    } finally { port.close(); }
  })());
});
