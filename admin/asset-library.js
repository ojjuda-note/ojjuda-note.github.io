/* Read-only administrator library: the actual public artwork and greeting copy. */
((root) => {
  'use strict';
  const categories = [
    ['all', '전체'], ['themes', '테마 그림'], ['popups', '환영 팝업'],
    ['games', '게임 그림'], ['other', '로고·기타']
  ];
  const gameArt = [
    ['archery', '바람의 궁수'], ['bang', '뱅'], ['breakout', '벽돌깨기'],
    ['byeolcheonji', '별천지 (종료 안내)'], ['carom4', '당구'], ['chacha-rush', '차차 러시'],
    ['chess', '체스'], ['festival', '행사·공연'], ['group', '그룹'],
    ['janggi', '장기'], ['matgo', '맞고'], ['mines', '지뢰찾기'],
    ['mole', '두더지잡기'], ['photo_ttang', '포토땅따먹기'], ['poker', '포커'],
    ['recommendations', '추천'], ['restaurants', '맛집'], ['roulette', '룰렛'],
    ['runner', '달리기'], ['sacheonseong', '사천성'], ['saetbyeol', '새별'],
    ['screw', '나사 풀기'], ['solitaire', '솔리테어'], ['spot', '틀린그림찾기'],
    ['stacker', '쌓기'], ['tank', '탱크'], ['tour', '오쭈다 투어'], ['ttang', '땅따먹기']
  ];
  const extraArt = [
    ['오쭈다 로고', '/favicon.svg', '웹사이트·앱 아이콘'],
    ['앱 아이콘', '/apple-touch-icon.png', '휴대폰 홈 화면'],
    ['오락실 그림', '/features/home/agit-arcade-scene.webp', '아지트 오락실'],
    ['팬페이지 그림', '/features/fanpages/fan-tile.svg', '팬페이지 안내'],
    ['공통 장식', '/assets/design/interface.svg', '서비스 디자인']
  ];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function catalog(themes = root.OjjudaThemes, welcome = root.OjjudaAgitWelcome) {
    const items = [];
    if (themes?.order && themes?.catalog) {
      for (const key of themes.order) {
        const meta = themes.catalog[key];
        if (!meta) continue;
        items.push({ id: 'theme-' + key, category: 'themes', name: meta.name + ' 테마',
          detail: meta.copy, condition: meta.period + ' · 아지트 첫 화면',
          src: '/features/home/theme-illustrations/' + key + '.webp?v=20261110-themes3',
          theme: key, variant: '대표 그림' });
        items.push({ id: 'theme-background-' + key, category: 'themes', name: meta.name + ' 배경 그림',
          detail: '테마별 배경 디자인', condition: meta.period + ' · 화면 배경',
          src: key === 'classic' ? '/assets/design/welcome.svg' : '/assets/design/themes/' + key + '.svg',
          theme: key, variant: '배경 그림' });
      }
    }
    for (const popup of welcome?.previewCatalog?.() || []) {
      items.push({ id: 'popup-' + popup.id, category: 'popups',
        name: popup.name + (popup.variant > 1 ? ' · 문구 ' + popup.variant : ''),
        detail: popup.title + ' ' + popup.body, condition: popup.condition,
        popup, variant: popup.group });
    }
    for (const [id, name] of gameArt) {
      items.push({ id: 'game-' + id, category: 'games', name, detail: '오락실 게임 그림',
        condition: '오락실·게임 안내', src: '/assets/design/games/' + id + '.svg', variant: '게임 그림' });
    }
    for (const [name, src, condition] of extraArt) {
      items.push({ id: 'other-' + items.length, category: 'other', name, detail: condition,
        condition, src, variant: '브랜드·기타' });
    }
    return items;
  }

  function mount(options = {}) {
    const host = options.container;
    if (!host || !options.getAdminId?.() || options.isCurrent?.() !== true) return null;
    let category = options.initialState?.category || 'all';
    let query = options.initialState?.query || '';
    if (!categories.some(([key]) => key === category)) category = 'all';
    let items = catalog();
    const themeApi = root.OjjudaThemes;

    function currentTheme() {
      const key = themeApi?.resolve?.(new Date()) || 'classic';
      return { key, ...themeApi?.catalog?.[key] };
    }
    function imageCard(item, activeTheme) {
      return `<article class="asset-lib-card">
        <button type="button" class="asset-lib-picture" data-library-open="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} 크게 보기">
          <img src="${escapeHtml(item.src)}" alt="" loading="lazy" decoding="async">
        </button>
        <div class="asset-lib-card-body"><div class="asset-lib-card-top"><span class="asset-lib-kind">${escapeHtml(item.variant)}</span>${item.theme === activeTheme && item.id === 'theme-' + activeTheme ? '<span class="asset-lib-active">오늘 적용 중</span>' : ''}</div>
          <h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.condition)}</p>
          <button type="button" class="asset-lib-view" data-library-open="${escapeHtml(item.id)}">그림 크게 보기 <span aria-hidden="true">↗</span></button>
        </div></article>`;
    }
    function popupCard(item) {
      const copy = item.popup;
      return `<article class="asset-lib-card asset-lib-popup-card">
        <div class="asset-lib-popup-face"><span class="asset-lib-popup-star" aria-hidden="true">💗</span>
          <span class="asset-lib-popup-label">OJJUDA · ${escapeHtml(copy.group)}</span>
          <strong>${escapeHtml(copy.title)}</strong><p>${escapeHtml(copy.body)}</p></div>
        <div class="asset-lib-card-body"><div class="asset-lib-card-top"><span class="asset-lib-kind">${escapeHtml(copy.group)}</span></div>
          <h4>${escapeHtml(item.name)}</h4><p><b>표시 조건</b> · ${escapeHtml(copy.condition)}</p>
          <button type="button" class="asset-lib-view" data-library-open="${escapeHtml(item.id)}">실제 팝업 보기 <span aria-hidden="true">↗</span></button>
        </div></article>`;
    }
    function renderResults() {
      const list = host.querySelector('[data-library-results]');
      if (!list) return;
      const term = query.trim().toLocaleLowerCase('ko-KR');
      const visible = items.filter(item => (category === 'all' || item.category === category) &&
        (!term || [item.name, item.detail, item.condition, item.variant].join(' ').toLocaleLowerCase('ko-KR').includes(term)));
      list.innerHTML = visible.length ? visible.map(item => item.popup ? popupCard(item) : imageCard(item, currentTheme().key)).join('') :
        '<div class="asset-lib-empty">찾는 자료가 없어요. 다른 이름으로 검색해 보세요.</div>';
      host.querySelector('[data-library-count]').textContent = visible.length + '개 자료';
      host.querySelectorAll('[data-library-filter]').forEach(button => {
        const active = button.dataset.libraryFilter === category;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    function render() {
      items = catalog();
      const theme = currentTheme();
      const themeSrc = '/features/home/theme-illustrations/' + theme.key + '.webp?v=20261110-themes3';
      const today = themeApi?.koreaDate?.().stamp || '';
      host.innerHTML = `<div class="asset-library">
        <header class="asset-lib-intro"><div><span class="asset-lib-eyebrow">관리자 전용 · 보는 자료실</span>
          <h3>회원 눈에 보이는 오쭈다</h3><p>어떤 그림과 인사가 보이는지 여기서 직접 확인해요. 이곳에서 미리 봐도 실제 회원 기록은 바뀌지 않아요.</p></div>
          <a class="asset-lib-visit" href="/world.html" target="_blank" rel="noopener">실제 아지트 열기 ↗</a></header>
        <section class="asset-lib-today" aria-label="오늘의 회원 화면">
          <div class="asset-lib-today-copy"><span class="asset-lib-today-tag">${escapeHtml(today)} · 오늘 자동 테마</span>
            <h3>${escapeHtml(theme.name || '기본')} 테마가 보여요</h3>
            <strong>${escapeHtml((theme.headline || ['오늘도', '잘 왔어!']).join(' '))}</strong>
            <p>${escapeHtml(theme.copy || '')}</p><button type="button" class="asset-lib-today-button" data-library-open="theme-${escapeHtml(theme.key)}">그림 크게 보기 ↗</button></div>
          <div class="asset-lib-today-art"><img src="${escapeHtml(themeSrc)}" alt="${escapeHtml(theme.name || '오늘')} 테마 그림" width="480" height="320"></div>
        </section>
        <p class="asset-lib-explain">💌 인사 팝업은 <b>회원의 방문·생일·기록</b>에 따라 달라져요. 회원에게는 하루 한 번, 비회원에게는 접속할 때마다 가입 혜택을 보여줘요.</p>
        <section class="asset-lib-collection" aria-label="자료 모아보기">
          <div class="asset-lib-collection-head"><div><span class="asset-lib-eyebrow">오쭈다 디자인 자료</span><h3>테마·팝업·게임 그림</h3></div><span class="asset-lib-total">총 ${items.length}개</span></div>
          <div class="asset-lib-controls"><div class="asset-lib-filters" role="group" aria-label="자료 종류">
            ${categories.map(([id, label]) => `<button type="button" data-library-filter="${id}">${label} <span>${id === 'all' ? items.length : items.filter(item => item.category === id).length}</span></button>`).join('')}
            </div><label class="asset-lib-search-label">자료 찾기<input type="search" data-library-search placeholder="그림·방문·명절·게임 이름 검색" maxlength="80" value="${escapeHtml(query)}" autocomplete="off"></label></div>
          <p class="asset-lib-result-count" role="status" data-library-count></p>
          <div class="asset-lib-grid" data-library-results></div>
        </section>
        <dialog class="asset-lib-image-dialog" aria-label="그림 상세 보기"><div class="asset-lib-image-dialog-body" data-library-preview></div></dialog>
      </div>`;
      renderResults();
    }
    function openImage(item) {
      const dialog = host.querySelector('.asset-lib-image-dialog');
      const preview = host.querySelector('[data-library-preview]');
      if (!dialog || !preview) return;
      preview.innerHTML = `<div class="asset-lib-preview-head"><div><span class="asset-lib-eyebrow">회원에게 보이는 그림</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.condition)}</p></div><button type="button" data-library-close aria-label="그림 미리보기 닫기">×</button></div>
        <div class="asset-lib-preview-art"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.name)}"></div>
        <div class="asset-lib-preview-foot"><span>${escapeHtml(item.detail)}</span><a href="${escapeHtml(item.src)}" target="_blank" rel="noopener">원본 그림 열기 ↗</a></div>`;
      dialog.showModal();
    }
    function onClick(event) {
      const filter = event.target.closest?.('[data-library-filter]');
      if (filter) { category = filter.dataset.libraryFilter; renderResults(); return; }
      if (event.target.closest?.('[data-library-close]')) { host.querySelector('dialog')?.close(); return; }
      const open = event.target.closest?.('[data-library-open]');
      if (!open) return;
      const item = items.find(entry => entry.id === open.dataset.libraryOpen);
      if (!item) return;
      if (item.popup) root.OjjudaAgitWelcome?.preview?.(item.popup.id);
      else openImage(item);
    }
    function onInput(event) {
      if (!event.target.matches?.('[data-library-search]')) return;
      query = event.target.value;
      renderResults();
    }
    function onDialogClick(event) {
      if (event.target.matches?.('dialog.asset-lib-image-dialog')) event.target.close();
    }
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('click', onDialogClick);
    render();
    return {
      getState: () => ({ category, query }),
      refresh: render,
      destroy() {
        host.removeEventListener('click', onClick);
        host.removeEventListener('input', onInput);
        host.removeEventListener('click', onDialogClick);
        const dialog = host.querySelector('dialog.asset-lib-image-dialog');
        if (dialog?.open) dialog.close();
      }
    };
  }
  root.OjjudaAdminAssetLibrary = Object.freeze({ catalog, mount });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OjjudaAdminAssetLibrary;
})(typeof window !== 'undefined' ? window : globalThis);
