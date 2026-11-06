/* Public page links never include the current account, filters or iframe flags. */
(() => {
  'use strict';
  const pages = {
    festival: { title: '축제일정 · 오쭈다', text: '전국 축제와 행사 일정을 지도와 캘린더에서 확인해 보세요.' },
    restaurants: { title: '인증맛집 · 오쭈다', text: '지역과 음식 종류별로 인증맛집을 찾아보세요.' }
  };
  let notice, noticeTimer;
  function copied() {
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'page-share-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      document.body.append(notice);
    }
    clearTimeout(noticeTimer);
    notice.textContent = '페이지 링크를 복사했어요.';
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 3000);
  }
  function manualCopy(url, button) {
    const dialog = document.createElement('dialog');
    dialog.className = 'page-share-dialog';
    dialog.setAttribute('aria-label', '페이지 링크 복사');
    dialog.innerHTML = '<h2>페이지 공유</h2><p>아래 링크를 길게 누르거나 선택해서 복사해 주세요.</p><label>공유 링크<input type="text" readonly></label><button type="button">닫기</button>';
    const field = dialog.querySelector('input');
    field.value = url;
    const close = () => { dialog.close(); dialog.remove(); button.focus({ preventScroll: true }); };
    dialog.querySelector('button').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    field.addEventListener('click', () => field.select());
    document.body.append(dialog);
    dialog.showModal();
    field.focus();
    field.select();
  }
  document.querySelectorAll('[data-share-page]').forEach(button => {
    const page = button.dataset.sharePage;
    if (!Object.hasOwn(pages, page)) return;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      const url = new URL('/world.html', location.origin);
      url.searchParams.set('game', page);
      try {
        if (typeof navigator.share === 'function') {
          try { await navigator.share({ ...pages[page], url: url.href }); return; }
          catch (error) { if (error?.name === 'AbortError') return; }
        }
        try {
          if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(url.href);
          copied();
        } catch { manualCopy(url.href, button); }
      } finally { button.disabled = false; }
    });
  });
})();
