/* =========================================================================
 * sw.js — NotionTODO 用 Service Worker
 *  1) push を受け取って通知を表示（title / body / tag / url を反映）
 *  2) 通知タップ時に「アプリ本体」を開く（GitHub Pages でも404にならない）
 *     - アプリが起動時に自分のURLを SW に伝える → SW はそれを永続保存
 *     - 通知タップ時: 既に開いていればフォーカス＋postMessage、
 *       開いていなければ「保存したアプリURL＋#ハッシュ」を開く
 *     - 通知に絶対URL(http…)が入っていればそれを優先
 * ========================================================================= */

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

let APP_URL = '';

// アプリ本体URLの保存（メモリ＋Cacheに永続化）
async function saveAppUrl(url) {
  APP_URL = url;
  try { const c = await caches.open('app-meta'); await c.put('app-url', new Response(url)); } catch (e) {}
}
async function getAppUrl() {
  if (APP_URL) return APP_URL;
  try { const c = await caches.open('app-meta'); const r = await c.match('app-url'); if (r) { APP_URL = await r.text(); return APP_URL; } } catch (e) {}
  return '';
}

// ---- アプリからのメッセージ（自身のURL通知） ----
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'app-url' && d.url) {
    event.waitUntil(saveAppUrl(String(d.url).split('#')[0]));
  }
});

// ---- push 受信 → 通知表示 ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: '通知', body: (event.data && event.data.text && event.data.text()) || '' }; }

  const title = data.title || '通知';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    data: { url: data.url || '', raw: data }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ---- 通知タップ → アプリを開く ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const d = (event.notification && event.notification.data) || {};
  const url = (d.url || '').toString();
  const hash = url.indexOf('#') >= 0 ? url.slice(url.indexOf('#')) : '';   // '#challenge' など
  const route = (hash.replace(/^#\/*/, '') || '');

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 既に開いていればフォーカスして、アプリ内でルート遷移
    for (const client of clientList) {
      if ('focus' in client) {
        try { await client.focus(); } catch (e) {}
        if (route && client.postMessage) client.postMessage({ route: route });
        return;
      }
    }

    // 開いていなければ開く先を決める
    let target = '';
    if (/^https?:\/\//i.test(url)) {
      target = url;                                  // 絶対URLならそれを最優先
    } else {
      const appUrl = await getAppUrl();              // アプリが教えてくれた本体URL
      if (appUrl) target = appUrl + hash;            // 本体URL＋#ハッシュ
    }
    if (!target) {
      // 最後の手段（本体URL未保存）: スコープ直下の index.html を試す
      target = self.registration.scope + (hash || '');
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
