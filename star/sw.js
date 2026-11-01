/* Push only: never cache reservation pages or intercept other Ojjuda requests. */
const HELPER_URL = 'https://ojjuda.kr/star/';
function notificationUrl(value) {
  try {
    if (typeof value !== 'string' || /\\|(?:\/|%2f)(?:\.|%2e){1,2}(?:\/|%2f|[?#]|$)/i.test(value)) return HELPER_URL;
    const target = new URL(value);
    const helper = ['https://ojjuda.kr', 'https://www.ojjuda.kr'].includes(target.origin)
      && ['/star', '/star/', '/star/index.html'].includes(target.pathname);
    const standalone = target.origin === 'https://hanusan-booking-helper.mj830417686850.chatgpt.site'
      && ['/', '/index.html'].includes(target.pathname);
    // Convert notifications already delivered with the old direct Naver link too.
    const legacy = target.origin === 'https://booking.naver.com'
      && /^\/booking\/3\/bizes\/1627625(?:\/items)?\/?$/.test(target.pathname);
    if ((!helper && !standalone && !legacy) || target.username || target.password) return HELPER_URL;
    const params = target.searchParams;
    if (['startDate', 'endDate', 'guests', 'room'].some(key => params.getAll(key).length > 1)) return HELPER_URL;
    const startDate = params.get('startDate'), endDate = params.get('endDate');
    const dateValue = value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
      const time = Date.parse(value + 'T00:00:00Z');
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
    };
    const nights = (dateValue(endDate) - dateValue(startDate)) / 86400000;
    if (!Number.isInteger(nights) || nights < 1 || nights > 5) return HELPER_URL;
    const guests = params.get('guests'), room = params.get('room');
    if ((guests !== null && !/^[1-8]$/.test(guests)) || (room !== null && !/^[1-9]\d{0,19}$/.test(room))) return HELPER_URL;
    const url = new URL(HELPER_URL);
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate', endDate);
    if (guests !== null) url.searchParams.set('guests', guests);
    if (room !== null) url.searchParams.set('room', room);
    return url.href;
  } catch { return HELPER_URL; }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let message = {};
  try {
    const payload = event.data?.json();
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) message = payload;
  } catch { /* Always show a visible notification. */ }
  event.waitUntil(self.registration.showNotification(message.title || '별천지 빈자리 알림', {
    body: message.body || '예약 가능한 날짜를 확인해 주세요.',
    icon: 'https://hanusan-booking-helper.mj830417686850.chatgpt.site/icons/star-192.png',
    badge: 'https://hanusan-booking-helper.mj830417686850.chatgpt.site/icons/star-192.png',
    tag: message.tag === 'hanusan-test' ? 'hanusan-test' : 'hanusan-opening',
    renotify: true, vibrate: [200, 100, 200],
    data: { url: notificationUrl(message.url) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(notificationUrl(event.notification.data?.url)));
});
