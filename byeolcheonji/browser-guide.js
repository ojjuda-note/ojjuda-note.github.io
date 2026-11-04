(() => {
  'use strict';
  const dialog = document.getElementById('browser-guide');
  const openButton = document.getElementById('browser-guide-open');
  const confirmButton = document.getElementById('browser-guide-confirm');
  const copyButton = document.getElementById('browser-guide-copy');
  const address = document.getElementById('browser-guide-address');
  const feedback = document.getElementById('browser-guide-feedback');
  const dontShowCheckbox = document.getElementById('browser-guide-dont-show');
  const shell = document.querySelector('.page-shell');
  const storageKey = 'ojjuda-byeolcheonji-browser-guide-v3';
  let previousFocus = null;
  let previousOverflow = '';

  function isHidden() {
    try { return localStorage.getItem(storageKey) === 'hidden'; }
    catch { return false; }
  }
  function savePreference() {
    try {
      if (dontShowCheckbox.checked) localStorage.setItem(storageKey, 'hidden');
      else localStorage.removeItem(storageKey);
    } catch { /* keep showing the guide when storage is unavailable */ }
  }
  function open() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    feedback.textContent = '';
    dontShowCheckbox.checked = isHidden();
    document.body.style.overflow = 'hidden';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.classList.add('is-fallback'); shell.inert = true; }
    confirmButton.focus({ preventScroll: true });
  }
  function finish() {
    savePreference();
    document.body.style.overflow = previousOverflow;
    shell.inert = false;
    dialog.classList.remove('is-fallback');
    const focusTarget = previousFocus instanceof HTMLElement && previousFocus !== document.body ? previousFocus : openButton;
    focusTarget.focus({ preventScroll: true });
  }
  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); finish(); }
  }

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

  if (!isHidden()) open();
})();
