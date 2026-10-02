/* NotionTODO Service Worker
 * - Web Push受信 → 通知表示
 * - 通知タップでアプリを開く
 * - HTMLは「ネット優先・失敗時のみキャッシュ」（常に最新版を優先）
 */
const CACHE = 'notiontodo-v2';
let APP_URL = null;   // アプリ側から postMessage({type:'app-url'}) で受け取る

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    } catch (err) {}
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  const d = e.data;
  if (d === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (d && d.type === 'app-url' && d.url) APP_URL = d.url;
});

// ページ本体（ナビゲーション）だけ、ネット優先＋オフライン時キャッシュ
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode !== 'navigate') return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      try { const c = await caches.open(CACHE); c.put(req, res.clone()); } catch (err) {}
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});

// ---- Push受信 ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { try { d = { body: e.data.text() }; } catch (e2) { d = {}; } }
  const n = d.notification || {};
  const title = d.title || n.title || 'NotionTODO';
  const body  = d.body  || n.body  || '';
  const url   = d.url   || (d.data && d.data.url) || n.url || APP_URL || self.registration.scope;
  const tag   = d.tag   || n.tag || undefined;
  e.waitUntil(self.registration.showNotification(title, {
    body: body,
    tag: tag,
    renotify: !!tag,
    data: { url: url }
  }));
});

// ---- 通知タップ ----
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || APP_URL || self.registration.scope;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      try {
        if ('focus' in c) {
          await c.focus();
          if ('navigate' in c && url) { try { await c.navigate(url); } catch (err) {} }
          return;
        }
      } catch (err) {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
