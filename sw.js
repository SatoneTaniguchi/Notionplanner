/* Any Planner - Service Worker */
const CACHE_NAME = 'any-planner-v1';

// オフラインでも開けるよう最低限キャッシュするファイル
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg',
];

// インストール時に基本ファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// 旧キャッシュの掃除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET以外（POST/PATCH等のAPI書き込み）はそのままネットワークへ
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 外部API（Notion / Google など）は絶対にキャッシュせず素通し
  // ※同期データが古くならないようにするため
  const isApi =
    url.hostname.includes('api.notion.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('script.google.com');
  if (isApi) return; // fetchイベントに介入しない＝通常のネットワーク通信

  // 自分のオリジン以外（CDN等）はネットワーク優先・失敗時キャッシュ
  const sameOrigin = url.origin === self.location.origin;

  // HTML本体（ナビゲーション）はネットワーク優先（常に最新を取得、オフライン時のみキャッシュ）
  if (req.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('.html'))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 静的アセット（アイコン・manifest等）はキャッシュ優先
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // 取得できたものはキャッシュに保存（同一オリジンのみ）
        if (sameOrigin && res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
