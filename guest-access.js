/* One completed round per browsing session; signed-in play is unaffected. */
(() => {
  'use strict';
  const key = 'ojjuda.guest-round-completed.v1';
  let isGuest = () => false, completed = false, timer = null, leaving = false;
  const used = () => {
    try { return completed || sessionStorage.getItem(key) === '1'; }
    catch { return completed; }
  };
  function signup() {
    if (!isGuest() || leaving) return;
    leaving = true;
    clearTimeout(timer);
    location.assign('/?auth=login&next=world');
  }
  function canPlay() {
    if (!isGuest() || !used()) return true;
    signup(); return false;
  }
  function finished() {
    if (!isGuest() || completed) return;
    completed = true;
    try { sessionStorage.setItem(key, '1'); } catch {}
    // Let the result appear, even when saving a zero score fails or is offline.
    timer = setTimeout(signup, 1600);
  }
  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-g="start"], [data-g="screw-start"], [data-act="bl-start"], [data-act="bl-resume"], [data-act="bd-start"], [data-act="bd-resume"], [data-act="bd-new"], [data-bl="again"]')) return;
    if (!canPlay()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  addEventListener('pageshow', () => { leaving = false; });
  window.OjjudaGuestAccess = Object.freeze({
    configure(check) { isGuest = check; }, canPlay, finished
  });
})();
