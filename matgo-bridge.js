/* Ojjuda World arcade → member-only Matgo. Gold balances and refills are server-managed. */
(function () {
  'use strict';
  let overlay = null, frame = null, opening = false, unsubscribe = null, previousFocus = null;
  let generation = 0, onlineReady=false;
  function requestClose(){
    if(onlineReady&&frame)frame.contentWindow.postMessage({type:'ojjuda:matgo:request-close'},location.origin);
    else closeMatgo();
  }
  function showMessage(message) {
    const target = document.getElementById('toast');
    if (target) {
      target.textContent = message;
      target.classList.add('show');
      clearTimeout(showMessage.timer);
      showMessage.timer = setTimeout(() => target.classList.remove('show'), 4500);
    } else window.alert(message);
  }
  function closeMatgo() {
    generation++;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    if (overlay) overlay.remove();
    overlay = frame = null;
    onlineReady=false;
    document.body.classList.remove('matgo-open');
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  async function openMatgo() {
    if (opening || overlay) return;
    opening = true;
    const attempt = generation;
    try {
      const access = window.OjjudaMatgoAccess;
      if (!access) throw new Error('맞고를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
      await access.check();
      if (attempt !== generation) return;
      previousFocus = document.activeElement;
      overlay = document.createElement('div');
      overlay.id = 'matgo-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', '맞고 · 만 19세 이상');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1c1730;display:flex;flex-direction:column';
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;color:#fff;padding:calc(6px + env(safe-area-inset-top,0px)) 10px 6px';
      const label = document.createElement('span');
      label.textContent = '🎴 맞고 · 만 19세 이상';
      label.style.fontSize = '13px';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '닫기 ✕';
      close.setAttribute('aria-label', '맞고 닫기');
      close.style.cssText = 'min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #ffffff33;background:#ffffff14;color:#fff;font:inherit';
      close.onclick = requestClose;
      bar.append(label, close);
      frame = document.createElement('iframe');
      frame.src = 'games/matgo-online.html?v=20261003-online1';
      frame.title = '오쭈다 맞고';
      frame.style.cssText = 'flex:1;min-height:0;width:100%;border:0';
      overlay.append(bar, frame);
      document.body.appendChild(overlay);
      document.body.classList.add('matgo-open');
      unsubscribe = access.subscribe(error => { closeMatgo(); showMessage(error.message); });
      close.focus();
    } catch (error) { showMessage(error.message); }
    finally { opening = false; }
  }
  window.openMatgo = openMatgo;
  window.closeMatgo = closeMatgo;
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay) requestClose(); });
  window.addEventListener('message', event => {
    if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'ojjuda:matgo:close') closeMatgo();
    if (event.data?.type === 'ojjuda:matgo:online-ready') onlineReady=true;
    if (event.data?.type === 'ojjuda:matgo:ready') onlineReady=false;
    if (event.data?.type === 'ojjuda:matgo:wallet') window.OjjudaMatgoWalletChanged?.();
    // Only the server refill endpoint can charge 쭈.
  });
})();
