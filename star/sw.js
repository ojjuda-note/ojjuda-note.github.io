/* Push only: never cache reservation pages or intercept other Ojjuda requests. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { /* Always show a visible notification. */ }
  event.waitUntil(self.registration.showNotification(message.title || '별천지 빈자리 알림', {
    body: message.body || '예약 가능한 날짜를 확인해 주세요.',
    icon: 'https://hanusan-booking-helper.mj830417686850.chatgpt.site/icons/star-192.png',
    badge: 'https://hanusan-booking-helper.mj830417686850.chatgpt.site/icons/star-192.png',
    tag: message.tag === 'hanusan-test' ? 'hanusan-test' : 'hanusan-opening',
    renotify: true, vibrate: [200, 100, 200],
    data: { url: message.url || 'https://ojjuda.kr/star/' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  let url = 'https://ojjuda.kr/star/';
  try {
    const target = new URL(event.notification.data?.url);
    if ((target.origin === 'https://ojjuda.kr' && target.pathname.startsWith('/star/'))
      || (target.origin === 'https://booking.naver.com' && (target.pathname === '/booking/3/bizes/1627625'
        || target.pathname.startsWith('/booking/3/bizes/1627625/')))) url = target.href;
  } catch { /* Fall back to the public helper. */ }
  event.waitUntil(self.clients.openWindow(url));
});
