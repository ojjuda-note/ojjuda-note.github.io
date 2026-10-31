/* Shared entrance presentation. Existing game handlers own starts, joins and exits. */
(() => {
  'use strict';
  const paths = new Set(['/games/roulette/index.html','/games/bang/index.html','/games/poker/index.html','/games/tank/index.html','/games/ojjuda-tour/index.html','/games/ttang.html','/games/matgo-online.html','/games/matgo.html']);
  const game = paths.has(location.pathname), embedded = parent !== window, frames = new Map();
  let queued = false, previous;
  const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  function toolbar(close) {
    const bar = document.createElement('header'); bar.className = 'mp-entry-bar';
    const back = document.createElement('button'); back.type = 'button'; back.className = 'mp-entry-back';
    back.textContent = '← 게임 목록'; back.onclick = close;
    const brand = document.createElement('span'); brand.textContent = '오쭈다 오락실';
    bar.append(back, brand); return bar;
  }
  function decorate(card) {
    if (card.classList.contains('mp-entry')) return;
    card.classList.add('mp-entry');
    const kicker = card.querySelector('.ge-kicker'); if (kicker) kicker.textContent = '오쭈다 오락실 · 멀티게임';
    card.querySelectorAll('[data-entry-mode="computer"],#soloMode,[data-tour-mode="computer"]').forEach(b => b.textContent = '컴퓨터 대전');
    card.querySelectorAll('[data-entry-mode="opponent"],#onlineMode,[data-tour-mode="online"]').forEach(b => b.textContent = '온라인 대전');
    card.querySelectorAll('#localMode,[data-tour-mode="together"]').forEach(b => b.textContent = '같은 기기');
  }
  function setView(host, active) {
    if (host.dataset.mpActive !== String(active)) host.dataset.mpActive = String(active);
  }
  function mount() {
    for (const [frame, item] of frames) if (!frame.isConnected) { item.bar.remove(); frames.delete(frame); }
    document.querySelectorAll('.mp-board-host').forEach(host => {
      if (host.querySelector('.ge-board-entry')) return;
      host.querySelector(':scope > .mp-entry-bar')?.remove();
      host.classList.remove('mp-entry-host','mp-board-host'); delete host.dataset.mpActive;
    });
    document.querySelectorAll('.tour-game-dialog iframe,.roulette-game-dialog iframe,#ttang-overlay iframe,#matgo-overlay iframe').forEach(frame => {
      if (frames.has(frame)) return;
      const url = new URL(frame.getAttribute('src'), location.href);
      if (url.origin !== location.origin || !paths.has(url.pathname)) return;
      const host = frame.closest('.tour-game-dialog,.roulette-game-dialog,#ttang-overlay,#matgo-overlay');
      const original = host.querySelector('.tour-game-header button,#matgo-loading-bar button,header button');
      const bar = toolbar(() => {
        if (host.id === 'matgo-overlay') window.requestMatgoClose?.();
        else original?.click();
      });
      host.classList.add('mp-entry-host'); host.prepend(bar); frames.set(frame,{host,bar}); setView(host,true);
      if (document.activeElement === original) bar.querySelector('button').focus({preventScroll:true});
      const query = () => frame.contentWindow?.postMessage({type:'ojjuda:entry:query'},location.origin);
      frame.addEventListener('load',query); query();
    });
    document.querySelectorAll('.ge-board-entry').forEach(card => {
      decorate(card); const host = card.closest('.modal-bg'); if (!host) return;
      host.classList.add('mp-entry-host','mp-board-host'); setView(host,true);
      if (!host.querySelector(':scope > .mp-entry-bar')) {
        const close = card.querySelector('[data-act="close"]');
        const bar = toolbar(() => host.querySelector('.ge-board-entry [data-act="close"]')?.click());
        host.prepend(bar);
        if (document.activeElement === close || !host.contains(document.activeElement)) bar.querySelector('button').focus({preventScroll:true});
      }
    });
  }
  function report(force = false) {
    const cards = [...document.querySelectorAll('.game-entry')]; cards.forEach(decorate);
    const active = document.body.hasAttribute('data-mp-entry-pending') || cards.some(visible); if (!force && previous === active) return;
    const wasEntry = previous; previous = active; document.body.dataset.mpEntry = String(active);
    // Games measure their boards while rendering. Refit after entrance styles
    // are removed, including standalone Matgo where the iframe never resizes.
    if (wasEntry && !active) window.dispatchEvent(new Event('resize'));
    if (embedded) parent.postMessage({type:'ojjuda:entry:view',active},location.origin);
    else if (!document.querySelector('body > .mp-entry-bar')) document.body.prepend(toolbar(() => location.assign('/world.html')));
  }
  function update() { queued = false; if (game) report(); else mount(); }
  // Matgo screens must adopt entrance styles before the browser paints the
  // newly rendered card. A later animation frame briefly exposes the board.
  function schedule() { if (!queued) { queued = true; if (game && location.pathname.startsWith('/games/matgo')) queueMicrotask(update); else requestAnimationFrame(update); } }
  addEventListener('message',event => {
    if (event.origin !== location.origin) return;
    if (game) { if (event.source === parent && event.data?.type === 'ojjuda:entry:query') report(true); return; }
    if (event.data?.type !== 'ojjuda:entry:view' || typeof event.data.active !== 'boolean') return;
    for (const [frame,{host}] of frames) if (event.source === frame.contentWindow) { setView(host,event.data.active); break; }
  });
  function start() {
    new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','data-mp-entry-pending']}); update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
