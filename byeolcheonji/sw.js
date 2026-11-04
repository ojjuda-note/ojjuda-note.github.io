/* This worker only receives visible alerts. It never caches member pages or API data. */
const ENTRY = '/byeolcheonji/';
function destination(value) {
  try {
    if (typeof value !== 'string' || value.includes('\\')) return new URL(ENTRY, self.location.origin).href;
    const input = new URL(value, self.location.origin);
    if (input.origin !== self.location.origin || !['/byeolcheonji/', '/byeolcheonji', '/byeolcheonji/index.html'].includes(input.pathname)
      || input.username || input.password) return new URL(ENTRY, self.location.origin).href;
    const output = new URL(ENTRY, self.location.origin);
    const params = input.searchParams;
    if (['date', 'room', 'guests'].some(key => params.getAll(key).length > 1)) return output.href;
    const date = params.get('date'), room = params.get('room'), guests = params.get('guests');
    const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? Date.parse(`${date}T00:00:00Z`) : NaN;
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date) output.searchParams.set('date', date);
    if (/^[1-9]\d{0,19}$/.test(room || '')) output.searchParams.set('room', room);
    if (/^(all|2|4|6|8)$/.test(guests || '')) output.searchParams.set('guests', guests);
    return output.href;
  } catch { return new URL(ENTRY, self.location.origin).href; }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload = {};
  try { const value = event.data?.json(); if (value && typeof value === 'object' && !Array.isArray(value)) payload = value; } catch { /* Every push must still display an alert. */ }
  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.slice(0, 120) : '별천지에 빈방이 생겼어요';
  const body = typeof payload.body === 'string' && payload.body.trim() ? payload.body.slice(0, 300) : '눌러서 날짜와 객실을 확인하고 예약하세요.';
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icon-192.png?v=20261022-agit-logo2', badge: '/icon-192.png?v=20261022-agit-logo2',
    tag: payload.tag === 'byeolcheonji-test' ? 'byeolcheonji-test' : 'byeolcheonji-vacancy',
    renotify: true, vibrate: [180, 80, 180], data: { url: destination(payload.url) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = destination(event.notification.data?.url);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      let existing;
      try { existing = new URL(client.url); } catch { continue; }
      if (existing.origin === self.location.origin && ['/byeolcheonji/', '/byeolcheonji', '/byeolcheonji/index.html'].includes(existing.pathname)) {
        try { const navigated = await client.navigate(url); if (navigated) return await navigated.focus(); } catch { /* Open a fresh, member-gated page below. */ }
      }
    }
    return await self.clients.openWindow(url);
  })());
});
