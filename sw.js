// sw.js — NotionTODO PWA Service Worker
// 方針:
//  ・HTML(ページ本体)は常にネットワーク優先(network-first)で取得 → 更新が必ず反映される
//  ・オフライン時のみキャッシュを使う
//  ・その他の静的ファイルは cache-first
//  ・Web Push(バックグラウンド通知)に対応
//  ・新しい版が出たら即時切り替え(skipWaiting)

const CACHE = 'notiontodo-v2026-06-30a';   // ← デプロイのたびにこの文字列を変えると確実です

self.addEventListener('install', (event) => {
  // 新SWをすぐ有効化できるよう待機しない
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 古いキャッシュを掃除
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html');

  if (isHTML) {
    // ページ本体は常に最新を取りに行く。失敗時のみキャッシュ。
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // その他GET: キャッシュ優先、無ければ取得してキャッシュ
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});

// アプリ本体からの「すぐ更新して」指示
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

// ===== Web Push（バックグラウンド通知）=====
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: '通知', body: event.data ? event.data.text() : '' }; }
  const title = data.title || '通知';
  const options = {
    body: data.body || '',
    tag: data.tag || 'mztimer',
    renotify: true,
    data: data,
    // アイコン画像があれば指定可:
    // icon: './icon-192.png', badge: './icon-192.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('./');
  })());
});
