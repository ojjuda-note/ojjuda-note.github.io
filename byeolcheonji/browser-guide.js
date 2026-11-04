(() => {
  'use strict';
  const dialog = document.getElementById('browser-guide');
  const openButton = document.getElementById('browser-guide-open');
  const confirmButton = document.getElementById('browser-guide-confirm');
  const copyButton = document.getElementById('browser-guide-copy');
  const address = document.getElementById('browser-guide-address');
  const feedback = document.getElementById('browser-guide-feedback');
  const shell = document.querySelector('.page-shell');
  const storageKey = 'ojjuda-byeolcheonji-browser-guide-v2';
  let previousFocus = null;
  let previousOverflow = '';
  function open() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    feedback.textContent = '';
    document.body.style.overflow = 'hidden';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.classList.add('is-fallback'); shell.inert = true; }
    confirmButton.focus({ preventScroll: true });
  }
  function finish() {
    document.body.style.overflow = previousOverflow;
    shell.inert = false;
    dialog.classList.remove('is-fallback');
    try { localStorage.setItem(storageKey, 'seen'); } catch { /* close normally */ }
    const focusTarget = previousFocus instanceof HTMLElement && previousFocus !== document.body ? previousFocus : openButton;
    focusTarget.focus({ preventScroll: true });
  }
  function close() { if (typeof dialog.close === 'function') dialog.close(); else { dialog.removeAttribute('open'); finish(); } }
  openButton.addEventListener('click', open);
  confirmButton.addEventListener('click', close);
  dialog.addEventListener('close', finish);
  dialog.addEventListener('keydown', event => {
    if (!dialog.classList.contains('is-fallback')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === address) { event.preventDefault(); confirmButton.focus(); }
      else if (!event.shiftKey && document.activeElement === confirmButton) { event.preventDefault(); address.focus(); }
    }
  });
  copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('https://ojjuda.kr/star'); feedback.textContent = '주소를 복사했어요.'; }
    catch { address.focus(); address.select(); feedback.textContent = '주소를 길게 눌러 복사해 주세요.'; }
  });
  let seen = false;
  try { seen = localStorage.getItem(storageKey) === 'seen'; } catch { /* show once */ }
  const standalone = Boolean(navigator.standalone) || window.matchMedia?.('(display-mode: standalone)').matches;
  if (!seen && !standalone) open();
})();
