/* =========================================================================
 * sw.js — NotionTODO 用 Service Worker
 *  役割:
 *   1) push を受け取って通知を表示（title / body / tag / url を反映）
 *   2) 通知タップ時に、その通知の url（#challenge / #tomorrow / #task=... など）へ
 *      アプリを遷移させる（開いていればフォーカスしてルート通知、なければ新規に開く）
 *
 *  ※ アプリ側は次を実装済み:
 *     - 起動時に location.hash を読んで画面遷移（routeFromHash / applyAppRoute）
 *     - navigator.serviceWorker の 'message' を受けて applyAppRoute({route}) 実行
 *  なので、この sw.js が url を通知の data に載せて、タップ時に開く/postMessage すれば
 *  「通知 → 該当箇所」で開くようになります。
 *
 *  前提: サーバー（Cloudflare Worker）が push 送信時に、ジョブの
 *        { title, body, tag, url } を JSON ペイロードとしてそのまま送っていること。
 *        （このアプリの /schedule はこの4項目を送っています）
 * ========================================================================= */

// 即時有効化（更新をすぐ反映）
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ---- push 受信 → 通知表示 ----
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // JSON でなければテキストとして本文に
    data = { title: '通知', body: (event.data && event.data.text && event.data.text()) || '' };
  }

  const title = data.title || '通知';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,          // 同じ tag でも都度アラート（連続通知向け）
    icon: data.icon || undefined,  // あれば
    badge: data.badge || undefined,
    data: {
      url: data.url || '',         // ← タップ時の遷移先（例: '#challenge'）
      raw: data                    // 念のため元データも保持
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ---- 通知タップ → 該当箇所へ ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const d = (event.notification && event.notification.data) || {};
  const url = (d.url || '').toString();               // '#challenge' / '#task=123' / '' など
  const route = url.replace(/^\/*#?/, '');             // 先頭の / と # を除去 → 'challenge' 等

  // 新規に開くときの URL（スコープ直下にハッシュを付ける）
  const scope = self.registration.scope.replace(/\/$/, '');
  const target = url
    ? scope + '/' + (url.charAt(0) === '#' ? url : ('#' + route))
    : self.registration.scope;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 既にアプリを開いているタブがあればフォーカスして、ルートを通知
    for (const client of clientList) {
      if ('focus' in client) {
        try { await client.focus(); } catch (e) {}
        if (route && client.postMessage) {
          client.postMessage({ route: route });
        } else if (route && 'navigate' in client) {
          try { client.navigate(target); } catch (e) {}
        }
        return;
      }
    }

    // 開いていなければ新規に開く（ハッシュ付き → アプリ起動時に routeFromHash が拾う）
    if (self.clients.openWindow) {
      await self.clients.openWindow(target);
    }
  })());
});
