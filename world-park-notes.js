/* Public Note cards share the park conversation; chat remains channel-specific. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
  const colors = {white:'#FFFDF7',black:'#2E2B36',red:'#FFBFCF',yellow:'#FFDF7E',green:'#AEEACF',blue:'#BCD6FF',purple:'#D6C4FF'};
  window.OjjudaParkNotes = {install(app) {
    let place = null, owner = null, cards = [], status = '', loading = false, loaded = false;
    let timer = null, request = null, generation = 0, dialog = null, frame = null, opener = null;
    const messageTimes = new WeakMap();
    const active = () => app.place()?.id === 'park' && document.getElementById('plog');
    const current = (room, user, run) => active() && app.place() === room && app.userId() === user && generation === run;
    const schedule = () => { clearTimeout(timer); if (active()) timer = setTimeout(refresh, 30000); };
    function reset() {
      generation++; request?.abort(); request = null; clearTimeout(timer); timer = null;
      place = null; owner = null; cards = []; loaded = false; loading = false; status = '';
    }
    function sync() {
      if (!active()) { reset(); close(true); return; }
      const next = app.place(), user = app.userId();
      if (place !== next || owner !== user) {
        reset(); close(true); place = next; owner = user;
        void refresh();
      }
    }
    async function refresh() {
      if (!active()) { reset(); return; }
      if (place !== app.place() || owner !== app.userId()) { sync(); return; }
      if (loading) return;
      if (document.visibilityState === 'hidden') { schedule(); return; }
      const room = place, user = owner, run = ++generation;
      request = new AbortController(); loading = true;
      const controller = request, timeout = setTimeout(()=>controller.abort(), 15000);
      if (!loaded) status = '노트를 불러오는 중이에요…';
      app.changed();
      try {
        const rows = await app.list(request.signal);
        if (!current(room, user, run)) return;
        const unique = new Map();
        for (const card of Array.isArray(rows) ? rows : []) {
          if (!validId(card?.id) || typeof card.body !== 'string' || card.kind === 'comment' || card.tags?.includes('19금')) continue;
          unique.set(card.id, card);
        }
        cards = [...unique.values()]; loaded = true;
        status = cards.length ? '' : '아직 공개된 노트가 없어요. 첫 노트를 남겨 보세요.';
      } catch (error) {
        if (!current(room, user, run)) return;
        // Never keep removed/blocked cards indefinitely after a failed refresh.
        cards = []; status = '노트를 불러오지 못했어요. 새로고침을 눌러 주세요.';
      } finally {
        clearTimeout(timeout);
        if (current(room, user, run)) { loading = false; request = null; app.changed(); schedule(); }
      }
    }
    function cardMarkup(card) {
      const key = String(card.photo_key || card.background_key || '');
      const image = /^\d{2,3}$/.test(key) && +key >= 10 && +key <= 189 ? `/note/assets/${key}.jpg?v=20260927-curated180` : '';
      const style = card.style && typeof card.style === 'object' ? card.style : {};
      const font = ['round','serif','handwriting','mono'].includes(style.font) ? style.font : 'default';
      const color = colors[style.textColor] || colors.white;
      const box = Number(style.boxTransparency) === 0 ? 'transparent' : style.textColor === 'black' ? '#fffdf7c9' : '#1c1a248a';
      const date = new Date(card.created_at);
      const when = Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      const count = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
      return `<article class="park-note-card" data-park-card-id="${esc(card.id)}"><button type="button" class="park-note-open" data-park-note="${esc(card.id)}" aria-label="${esc(card.display_name || '익명')}님의 노트 전체 글과 답글 보기"><span class="park-note-photo park-note-font-${font}" style="${image ? `background-image:linear-gradient(#14152925,#14152965),url('${image}');` : ''}--park-note-color:${color};--park-note-box:${box}"><span class="park-note-quote${card.body.length > 120 ? ' park-note-long' : ''}">${esc(card.body)}</span><span class="park-note-tags">${(Array.isArray(card.tags) ? card.tags : []).slice(0,5).map(tag=>`<span>#${esc(tag)}</span>`).join('')}</span></span><span class="park-note-meta"><strong>${esc(card.display_name || '익명')}</strong><time>${esc(when)}</time>${card.kind === 'event' ? '<span>이벤트·광고</span>' : ''}</span><span class="park-note-actions">공감 ${count(card.like_count)} · 답글 ${count(card.reply_count)}<span>전체 글·답글 보기 ›</span></span></button></article>`;
    }
    function render(room, renderMessage) {
      // The host may render a different account/room before sync() runs.
      const visible = place === room && owner === app.userId();
      const entries = (visible ? cards : []).map(card=>({at:Date.parse(card.created_at)||0,html:cardMarkup(card)}));
      for (const message of room.log) {
        if (!messageTimes.has(message)) messageTimes.set(message, Date.now());
        entries.push({at:Number.isFinite(message.at) ? message.at : messageTimes.get(message),html:renderMessage(message)});
      }
      entries.sort((a,b)=>a.at-b.at);
      return entries.map(entry=>entry.html).join('') + (visible && status ? `<p class="park-note-status" role="status">${esc(status)}</p>` : '');
    }
    function toolbar() {
      return '<div class="park-note-toolbar"><span>대화 · 최근 노트</span><button type="button" class="btn sm" data-park-note-refresh aria-label="공원 노트 새로고침">새로고침</button><button type="button" class="btn sm pri" data-park-note-write>노트 남기기</button></div>';
    }
    function open(id) {
      if (!active() || (id && !validId(id))) return;
      if (dialog) return;
      opener = document.activeElement;
      dialog = document.createElement('dialog'); dialog.className = 'park-note-dialog'; dialog.setAttribute('aria-label', id ? '공원 노트 보기' : '공원에 노트 남기기');
      const header = document.createElement('header'), title = document.createElement('strong'), back = document.createElement('button');
      title.textContent = id ? '공원 노트' : '노트 남기기'; back.type = 'button'; back.textContent = '공원으로'; back.className = 'btn sm';
      back.addEventListener('click',()=>close()); header.append(title, back);
      frame = document.createElement('iframe'); frame.title = id ? '노트 전체 글과 답글' : '공원 노트 작성';
      frame.src = '/note/?park=1' + (id ? '&card='+encodeURIComponent(id) : '&compose=memo');
      frame.allow = 'geolocation';
      dialog.append(header,frame); document.body.append(dialog);
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
      document.documentElement.classList.add('park-note-dialog-open'); dialog.showModal(); back.focus();
    }
    function close(force = false) {
      if (!dialog) return false;
      if (!force) {
        try { if (frame.contentWindow.canCloseParkNote?.() === false) return true; } catch { /* Account/login navigation may replace the document. */ }
      }
      const previous = opener; dialog.close(); dialog.remove(); dialog = frame = opener = null;
      document.documentElement.classList.remove('park-note-dialog-open');
      if (previous?.isConnected) previous.focus({preventScroll:true});
      if (!force) void refresh();
      return true;
    }
    document.addEventListener('click',event=>{
      const target = event.target.closest?.('[data-park-note],[data-park-note-write],[data-park-note-refresh]');
      if (!target || !active()) return;
      event.preventDefault();
      if (target.hasAttribute('data-park-note-refresh')) void refresh();
      else open(target.dataset.parkNote || null);
    });
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState === 'visible' && active()) void refresh();});
    addEventListener('pagehide',()=>{reset();close(true);});
    addEventListener('pageshow',sync);
    return {sync,render,toolbar,close,refresh};
  }};
})();
