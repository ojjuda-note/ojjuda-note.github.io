/* One anonymous browser visit per Korean calendar day. No account identifier is sent. */
(() => {
  'use strict';
  const KEY = 'ojjuda.guest-visit.v1';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const allowedHosts = new Set(['ojjuda.kr', 'www.ojjuda.kr', 'ojjuda.com', 'www.ojjuda.com', 'ojjuda-note.github.io']);
  let client, isGuest = () => false, pending = false, retryAfter = 0, clockOffset = 0, timer;
  const day = () => new Date(Date.now() + clockOffset + 9 * 3600000).toISOString().slice(0, 10);
  const enabled = () => allowedHosts.has(location.hostname) && !document.hidden && isGuest()
    && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl;
  function recordForToday() {
    let record;
    try {
      record = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (Number.isFinite(record?.clockOffset)) clockOffset = record.clockOffset;
      const today = day();
      if (!record || record.day !== today || !UUID.test(record.id)) {
        if (!crypto.randomUUID) return null;
        localStorage.setItem(KEY, JSON.stringify({ day: today, id: crypto.randomUUID(), sent: false, clockOffset }));
        record = JSON.parse(localStorage.getItem(KEY));
      }
    } catch { return null; } // Without persistent storage, skip instead of counting every reload.
    return record;
  }
  async function send() {
    if (!client || !enabled() || Date.now() < retryAfter) return;
    const record = recordForToday();
    if (!record || record.sent || !enabled()) return;
    try {
      const result = await client.rpc('record_guest_visit', { p_visit_id: record.id });
      if (result.error || result.data?.ok !== true) throw new Error('visit_unavailable');
      const data = result.data;
      const serverNow = Date.parse(data.server_now);
      if (Number.isFinite(serverNow)) clockOffset = serverNow - Date.now();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.day)) return;
      // A different tab may have already created the next day's record.
      const latest = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (latest?.id === record.id) localStorage.setItem(KEY, JSON.stringify({ day: data.day, id: record.id, sent: true, clockOffset }));
      retryAfter = 0;
    } catch { retryAfter = Date.now() + 60000; } // Analytics never interrupts browsing or login.
  }
  async function record() {
    if (pending || !enabled()) return;
    pending = true;
    try {
      if (navigator.locks?.request) await navigator.locks.request(KEY, send);
      else await send();
    } catch {} finally { pending = false; }
  }
  function configure(options) {
    client = options.client; isGuest = options.isGuest;
    clearInterval(timer);
    timer = setInterval(() => void record(), 60000);
  }
  addEventListener('pageshow', () => void record());
  addEventListener('online', () => void record());
  document.addEventListener('visibilitychange', () => void record());
  window.OjjudaGuestVisits = Object.freeze({ configure, record });
})();
