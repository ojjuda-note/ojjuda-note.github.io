/* Share canonical public pages, with only the sender's explicit invitation reference. */
(() => {
  'use strict';
  const installed = Symbol.for('ojjuda.page-share');
  if (document[installed]) return;
  document[installed] = true;
  const pages = {
    festival: { title: '축제일정 · 오쭈다', text: '전국 축제와 행사 일정을 지도와 캘린더에서 확인해 보세요.', path: '/world.html?game=festival' },
    restaurants: { title: '인증맛집 · 오쭈다', text: '지역과 음식 종류별로 인증맛집을 찾아보세요.', path: '/world.html?game=restaurants' },
    agit: { title: '아지트 · 오쭈다', text: '오쭈다 아지트로 초대해요.', path: '/world.html?tab=hub', invite: true },
    park: { title: '공원 · 오쭈다', text: '오쭈다 공원으로 초대해요.', path: '/world.html?place=park', invite: true },
    pajang: { title: '파장 · 오쭈다', text: '오쭈다 파장으로 초대해요.', path: '/features/pajang/', invite: true }
  };
  let active = null, notice, noticeTimer;
  function announce(message) {
    if (!notice?.isConnected) {
      notice = document.createElement('div');
      notice.className = 'page-share-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      document.body.append(notice);
    }
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 3000);
  }
  function manualCopy(url, invite, onClose) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'page-share-dialog';
      dialog.setAttribute('aria-label', invite ? '초대 링크 복사' : '페이지 링크 복사');
      dialog.innerHTML = `<h2>${invite ? '초대 링크' : '페이지 공유'}</h2><p>아래 링크를 길게 누르거나 선택해서 복사해 주세요.</p><label>${invite ? '초대 링크' : '공유 링크'}<input type="text" readonly></label><button type="button">닫기</button>`;
      const field = dialog.querySelector('input');
      field.value = url;
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        dialog.remove();
        onClose();
        resolve();
      };
      const close = () => { dialog.close(); finish(); };
      dialog.querySelector('button').addEventListener('click', close);
      dialog.addEventListener('close', finish);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      field.addEventListener('click', () => field.select());
      document.body.append(dialog);
      dialog.showModal();
      field.focus();
      field.select();
    });
  }
  document.addEventListener('click', async event => {
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    const button = target?.closest?.('[data-share-page]');
    const key = button?.dataset.sharePage;
    if (!button || !Object.hasOwn(pages, key)) return;
    event.preventDefault();
    if (active || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    const request = {};
    active = request;
    button.disabled = true;
    let restoreFocus = false;
    const page = pages[key];
    const release = () => {
      // Closing a dialog can immediately start a new request. Its lock must not
      // be cleared later by this request's asynchronous finally block.
      if (active !== request) return;
      active = null;
      button.disabled = false;
      if (restoreFocus) {
        const focusTarget = button.isConnected ? button : document.querySelector(`[data-share-page="${key}"]`);
        focusTarget?.focus({ preventScroll: true });
      }
    };
    try {
      let url;
      if (page.invite) {
        try {
          if (!window.OjjudaInvite) throw Error('초대 링크를 준비하지 못했어요. 새로고침해 주세요.');
          url = window.OjjudaInvite.shareUrl(page.path);
        } catch (error) { announce(error.message); return; }
      } else url = new URL(page.path, location.origin).href;
      if (typeof navigator.share === 'function') {
        // Call from this click, before any asynchronous preparation loses activation.
        try { await navigator.share({ title: page.title, text: page.text, url }); return; }
        catch (error) { if (error?.name === 'AbortError') return; }
      }
      try {
        if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        announce(page.invite ? '초대 링크를 복사했어요.' : '페이지 링크를 복사했어요.');
      } catch {
        restoreFocus = true;
        await manualCopy(url, page.invite, release);
      }
    } finally {
      release();
    }
  });
})();
