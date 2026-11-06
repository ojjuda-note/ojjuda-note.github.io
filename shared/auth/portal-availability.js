/* Keep a usable entrance when account scripts or the connection are unavailable. */
(() => {
  'use strict';
  const panel = document.getElementById('entry-status');
  const message = document.getElementById('entry-message');
  if (!panel || !message) return;
  let timer;
  function fail(text = '연결을 확인하지 못했어요. 다시 시도하거나 손님으로 둘러보세요.') {
    clearTimeout(timer);
    message.textContent = text;
    panel.hidden = false;
    const loading = document.getElementById('account-loading');
    if (loading) loading.hidden = true;
  }
  function ready() { clearTimeout(timer); panel.hidden = true; }
  document.getElementById('entry-retry').addEventListener('click', () => location.reload());
  window.addEventListener('error', event => {
    if (/\/(portal|signup-identity)\.js/.test(event.filename || event.target?.src || '')) fail();
  }, true);
  timer = setTimeout(fail, 8000);
  window.OjjudaPortalAvailability = { ready, fail };
})();
