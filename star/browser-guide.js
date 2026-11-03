/* Show the browser instructions once, outside the reservation app's React root. */
(() => {
  'use strict';
  const seenKey = 'ojjuda:star:browser-guide:v1';
  const dialog = document.getElementById('star-browser-guide');
  if (!dialog) return;
  try { if (localStorage.getItem(seenKey) === 'seen') return; } catch { /* Storage may be unavailable. */ }

  const address = dialog.querySelector('#star-guide-url');
  const status = dialog.querySelector('[data-star-guide-status]');
  dialog.querySelector('[data-star-guide-copy]').addEventListener('click', async () => {
    let copied = false;
    try {
      await navigator.clipboard.writeText('https://ojjuda.kr/star');
      copied = true;
    } catch {
      address.focus();
      address.select();
      address.setSelectionRange(0, address.value.length);
      try { copied = document.execCommand('copy'); } catch { /* Keep the address selected for manual copying. */ }
    }
    status.textContent = copied
      ? '주소를 복사했어요. 브라우저 주소창에 붙여 넣어 주세요.'
      : '위 주소를 길게 눌러 복사해 주세요.';
  });
  dialog.querySelector('[data-star-guide-confirm]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('star-browser-guide-open');
    try { localStorage.setItem(seenKey, 'seen'); } catch { /* Dismissal still works without storage. */ }
  });
  dialog.showModal();
  document.body.classList.add('star-browser-guide-open');
  dialog.querySelector('h2').focus({ preventScroll: true });
})();
