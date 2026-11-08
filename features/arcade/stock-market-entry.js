/* A small, shared entry into the record-based game market. */
(() => {
  'use strict';
  if (window.OjjudaStockEntryLoaded) return;
  window.OjjudaStockEntryLoaded = true;
  let queued = false;
  function mount() {
    const solo = document.querySelector('[data-arcade-games="solo"]');
    if (!solo || solo.parentElement?.querySelector('[data-arcade-market-link]')) return;
    const link = document.createElement('a');
    link.className = 'arcade-market-entry';
    link.href = '/features/arcade/stock-market.html';
    link.dataset.arcadeMarketLink = '';
    const icon = document.createElement('span'); icon.className = 'arcade-market-icon'; icon.textContent = '📈';
    const copy = document.createElement('span'); copy.className = 'arcade-market-copy';
    const title = document.createElement('strong'); title.textContent = '오쭈다 게임 주식시장';
    const detail = document.createElement('small'); detail.textContent = '첫 기록일 1,000G · 매수·매도';
    copy.append(title, detail);
    const arrow = document.createElement('span'); arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true');
    link.append(icon, copy, arrow);
    solo.before(link);
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mount(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, {once:true});
  else schedule();
  new MutationObserver(schedule).observe(document.documentElement, {childList:true,subtree:true});
})();
