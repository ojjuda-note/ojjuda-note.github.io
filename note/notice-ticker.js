/* Show the current Note announcement immediately, then pass it across once every five minutes. */
(() => {
  const announcement = document.getElementById('note-announcement');
  const copy = document.getElementById('note-announcement-copy');
  const viewport = announcement?.querySelector('.note-announcement-viewport');
  const moving = announcement?.querySelector('.note-announcement-moving');
  if (!announcement || !copy || !viewport || !moving) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastText = null, timer = null, frame = null;

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    frame = timer = null;
    announcement.classList.remove('is-moving');
  }

  function pass() {
    stop();
    if (!lastText || announcement.hidden || announcement.open || document.hidden || reducedMotion.matches) return;
    const width = viewport.clientWidth, distance = moving.scrollWidth;
    if (!width || !distance) return;
    announcement.style.setProperty('--ticker-start', '0px');
    announcement.style.setProperty('--ticker-duration', `${Math.max(10, distance / 72).toFixed(2)}s`);
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!announcement.hidden && !announcement.open && !document.hidden && !reducedMotion.matches) {
        announcement.classList.add('is-moving');
      }
    });
    timer = setTimeout(pass, 5 * 60 * 1000);
  }

  function sync() {
    const text = copy.textContent.trim();
    if (text === lastText) return;
    lastText = text;
    moving.textContent = text.replace(/\s+/g, ' ');
    pass();
  }

  new MutationObserver(sync).observe(copy, { childList: true, characterData: true, subtree: true });
  moving.addEventListener('animationend', event => {
    if (event.target === moving) announcement.classList.remove('is-moving');
  });
  announcement.addEventListener('toggle', () => { if (announcement.open) stop(); else pass(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else pass(); });
  reducedMotion.addEventListener('change', pass);
  window.addEventListener('pageshow', event => { if (event.persisted) pass(); });
  sync();
})();
