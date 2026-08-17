/* =========================================================================
 * sw.js — NotionTODO 用 Service Worker
 *  1) push を受け取って通知を表示（title / body / tag / url を反映）
 *  2) 通知タップ時に、その通知の url へアプリを遷移
 *     - アプリは通知に「絶対URL＋#ハッシュ」を埋めているので、開いていなければ
 *       その絶対URL（= アプリ本体のファイル）を開く → GitHub Pages でも404にならない
 *     - 既に開いていればフォーカスして postMessage({route}) でアプリ内遷移
 * ========================================================================= */

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

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

// ---- 通知タップ → 該当箇所へ ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const d = (event.notification && event.notification.data) || {};
  const url = (d.url || '').toString();
  // '#challenge' / '#task=123' / '#tomorrow' などのハッシュ部分 → ルート名
  const route = (url.split('#')[1] || '').replace(/^\/*/, '');

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 既に開いていればフォーカスして、アプリ内でルート遷移
    for (const client of clientList) {
      if ('focus' in client) {
        try { await client.focus(); } catch (e) {}
        if (route && client.postMessage) client.postMessage({ route: route });
        else if (route && 'navigate' in client && url) { try { client.navigate(url); } catch (e) {} }
        return;
      }
    }

    // 開いていなければ新規に開く
    let target = url;
    if (!target) {
      target = self.registration.scope;                         // 遷移先不明ならトップ
    } else if (target.charAt(0) === '#') {
      // 万一ハッシュのみだった場合はスコープに付ける（フォールバック）
      target = self.registration.scope.replace(/\/$/, '') + '/' + target;
    }
    // それ以外（http… の絶対URL）はそのまま開く → アプリ本体のファイルが開く
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
