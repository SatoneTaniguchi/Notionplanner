/* NotionTODO Service Worker
   方針:
   - HTML（ページ遷移）は「ネットワーク優先」。オンライン中は常に最新を取得するので、
     ホーム画面PWAでも全機能（TODO/ルーチン/プロジェクト/グラフ/AI）が最新版で表示される。
     オフライン時のみ直近キャッシュにフォールバック。
   - 同一オリジンの静的ファイルは stale-while-revalidate（表示は速く、裏で更新）。
   - 他オリジン（Notionプロキシ workers.dev、Google認証/カレンダーなど）は一切インターセプトしない。
   - 起動時に古いキャッシュを破棄し、即座に制御を奪って最新へ更新する。
*/
const CACHE = 'notiontodo-2026-06-24-1';

self.addEventListener('install', (event) => {
  // 新しいSWを待たせず即アクティブ化
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 古いバージョンのキャッシュを全削除（旧シェルの残留を防ぐ）
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ページ側から SKIP_WAITING を受けたら即時切替
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 他オリジン（API/認証/プロキシ等）はそのまま通す＝触らない
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get('accept') || '';
  const isNavigation = req.mode === 'navigate' || accept.includes('text/html');

  if (isNavigation) {
    // HTMLはネットワーク優先（最新の全機能版を常に取得）
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 同一オリジンの静的アセット: stale-while-revalidate
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
