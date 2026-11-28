(() => {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, c =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  let previousText = '', startedAt = 0;

  function themeText() {
    const themes = window.OjjudaThemes, key = themes?.getCurrent?.(), item = themes?.catalog?.[key];
    return item && key !== 'classic' ? `${item.name} · ${item.copy}` : '';
  }

  function markup(notice) {
    if (!notice) return '';
    const theme = themeText();
    const contents = `<span class="nb-announcement">${escape(notice)}</span>` +
      (theme ? `<span class="nb-divider" aria-hidden="true">✦</span><span class="nb-season">${escape(theme)}</span>` : '');
    return `<button type="button" class="notice-bar notice-tk" data-act="notice-open" aria-label="공지: ${escape(notice)} (눌러서 전체 보기)"><span class="nb-ico" aria-hidden="true">📢</span><span class="nb-track" aria-hidden="true"><span class="nb-flow"><span class="nb-text">${contents}</span><span class="nb-copy">${contents}</span></span></span></button>`;
  }

  function measure(banner) {
    const track = banner?.querySelector('.nb-track'), flow = track?.querySelector('.nb-flow');
    const text = flow?.querySelector('.nb-text'), width = track?.clientWidth;
    if (!text || !width) return;
    const value = text.textContent;
    if (value !== previousText) { previousText = value; startedAt = Date.now(); }
    if (flow.dataset.width === String(width) && flow.dataset.noticeKey === value) return;
    track.style.setProperty('--notice-width', width + 'px');
    const duration = Math.max(8000, text.getBoundingClientRect().width / 38 * 1000);
    flow.style.setProperty('--notice-duration', duration + 'ms');
    flow.style.animationDelay = -((Date.now() - startedAt) % duration) + 'ms';
    flow.dataset.width = String(width);
    flow.dataset.noticeKey = value;
  }

  window.OjjudaServiceNotice = Object.freeze({markup, measure, themeText});
})();
