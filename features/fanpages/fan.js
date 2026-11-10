(() => {
  'use strict';
  const artists = window.OJJUDA_FAN_ARTISTS || [];
  const savedKey = 'ojjuda-fanpages-saved-v1';
  const $ = (selector, base = document) => base.querySelector(selector);
  const page = document.body.dataset.page;
  const ids = new Set(artists.map((item) => item.id));

  function getSaved() {
    try {
      const parsed = JSON.parse(localStorage.getItem(savedKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter((id) => ids.has(id)) : [];
    } catch { return []; }
  }
  function toggleSaved(id) {
    const next = new Set(getSaved());
    next.has(id) ? next.delete(id) : next.add(id);
    try { localStorage.setItem(savedKey, JSON.stringify([...next])); } catch { /* optional */ }
    return next.has(id);
  }
  function groupUrl(id) { return `./artist.html?group=${encodeURIComponent(id)}`; }
  function openLink(url, label, className = '') { return `<a class="${className}" href="${url}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`; }
  function attachImageFallback(root = document) {
    root.querySelectorAll('img[data-external-image]').forEach((image) => {
      const fallback = () => {
        image.closest('.image-surface')?.classList.add('image-failed');
        image.remove();
      };
      image.addEventListener('error', fallback, { once: true });
      if (image.complete && image.naturalWidth === 0) fallback();
    });
  }
  function imageHtml(src, alt, extra = '') {
    return `<div class="image-surface ${extra}"><span class="image-placeholder" aria-hidden="true">✳</span><img data-external-image src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer"></div>`;
  }

  function initHub() {
    const grid = $('#artist-grid');
    const search = $('#artist-search');
    const buttons = [...document.querySelectorAll('[data-category]')];
    let filter = 'all';
    $('#artist-total').textContent = String(artists.length).padStart(2, '0');
    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      const saved = new Set(getSaved());
      const items = artists.filter((item) => {
        if (filter === 'saved' && !saved.has(item.id)) return false;
        return `${item.name} ${item.korean} ${item.fan}`.toLocaleLowerCase().includes(query);
      });
      grid.innerHTML = items.map((item, index) => `<article class="artist-tile" style="--artist-accent:${item.accent};--artist-light:${item.light};--artist-dark:${item.dark}">
        <a class="tile-cover" href="${groupUrl(item.id)}" aria-label="${item.korean} 팬페이지 열기">
          ${imageHtml(item.image, `${item.korean} 그룹 사진`, 'tile-photo')}
          <span class="tile-number">${String(artists.indexOf(item) + 1).padStart(2, '0')} / FAN SPACE</span>
          <span class="tile-sticker">${item.shape}</span>
        </a>
        <div class="tile-bottom"><a href="${groupUrl(item.id)}"><small>${item.fan}</small><strong>${item.name}</strong><span>${item.korean}</span></a><button type="button" class="tile-save ${saved.has(item.id) ? 'is-saved' : ''}" data-save="${item.id}" aria-label="${item.korean} 관심 ${saved.has(item.id) ? '취소' : '등록'}" aria-pressed="${saved.has(item.id)}">${saved.has(item.id) ? '♥' : '♡'}</button></div>
      </article>`).join('');
      $('#filter-count').textContent = `${items.length} / ${artists.length}`;
      $('#empty-content').hidden = items.length > 0;
      grid.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', () => { toggleSaved(button.dataset.save); render(); }));
      attachImageFallback(grid);
    }
    buttons.forEach((button) => button.addEventListener('click', () => {
      filter = button.dataset.category;
      buttons.forEach((other) => { other.classList.toggle('is-active', other === button); other.setAttribute('aria-pressed', String(other === button)); });
      render();
    }));
    search.addEventListener('input', render);
    render();
  }

  function initArtist() {
    const id = new URLSearchParams(location.search).get('group');
    const artist = artists.find((item) => item.id === id);
    const root = $('#artist-root');
    if (!artist) {
      root.innerHTML = `<section class="not-found"><span>✳</span><h1>페이지가 없어요.</h1><a href="./index.html">전체 아티스트 보기 ↗</a></section>`;
      document.title = '팬페이지 | 오쭈다';
      return;
    }
    const index = artists.indexOf(artist);
    const saved = getSaved().includes(artist.id);
    document.documentElement.style.setProperty('--group-accent', artist.accent);
    document.documentElement.style.setProperty('--group-light', artist.light);
    document.documentElement.style.setProperty('--group-dark', artist.dark);
    document.title = `${artist.korean} (${artist.name}) | 오쭈다 팬페이지`;
    const gallery = artist.photos.map((photo, i) => `<a class="detail-photo" href="${photo.href}" target="_blank" rel="noopener noreferrer">
      ${imageHtml(photo.image, `${artist.korean} ${photo.label} 사진`, `detail-photo-image image-${i}`)}
      <div class="detail-photo-caption"><div><small>${photo.meta}</small><strong>${photo.label}</strong><span>${photo.credit}</span></div><span class="out-arrow">↗</span></div>
    </a>`).join('');
    const extraMedia = artist.photos.length < 3 ? artist.links.filter((link) => /Instagram|YouTube/.test(link.label)).map((link, i) => `<a class="detail-media-tile media-tile-${i}" href="${link.url}" target="_blank" rel="noopener noreferrer"><span class="media-symbol">${link.icon}</span><small>OFFICIAL</small><strong>${link.label}</strong><span class="media-arrow">↗</span></a>`).join('') : '';
    const resources = (entries, kind) => entries.map((entry, i) => `<a class="resource-item" href="${entry.href}" target="_blank" rel="noopener noreferrer"><span class="resource-icon">${kind === 'merch' ? '◈' : '▦'}</span><div><small>${entry.sub}</small><strong>${entry.title}</strong></div><span class="resource-arrow">↗</span></a>`).join('');
    const other = artists.filter((item) => item.id !== artist.id).map((item) => `<a href="${groupUrl(item.id)}" class="other-group" style="--other-light:${item.light};--other-accent:${item.accent}"><span>${item.shape}</span><div><strong>${item.name}</strong><small>${item.korean}</small></div><span>↗</span></a>`).join('');

    root.innerHTML = `
      <nav class="breadcrumb" aria-label="위치"><a href="./index.html">← 전체 팬페이지</a><span>/</span><span>${artist.korean}</span></nav>
      <section class="detail-hero">
        <div class="detail-hero-copy"><span class="detail-overline">OJJUDA FAN SPACE / ${String(index + 1).padStart(2, '0')}</span><div class="detail-hero-main"><div class="detail-heart">${artist.shape}</div><h1>${artist.name}</h1><p>${artist.korean} <span>·</span> ${artist.fan}</p></div><div class="detail-hero-actions"><a href="#photos" class="detail-primary">사진 보기 ↗</a><button class="detail-save ${saved ? 'is-saved' : ''}" type="button" id="detail-save" aria-pressed="${saved}">${saved ? '♥ 관심 등록됨' : '♡ 관심 등록'}</button></div><span class="agency-label">${artist.agency} · FAN MADE</span></div>
        <div class="detail-hero-visual">${imageHtml(artist.image, `${artist.korean} 그룹 사진`, 'detail-hero-image')}<span class="hero-vertical">${artist.status}</span><span class="hero-image-credit">${artist.imageCredit} ↗</span></div>
      </section>
      <div class="member-strip"><span>MEMBERS</span><div>${artist.members.map((name) => `<span>${name}</span>`).join('')}</div></div>
      <nav class="detail-shortcuts" aria-label="팬페이지 메뉴"><a href="#photos"><span>01</span><strong>사진</strong><b>↗</b></a><a href="#goods"><span>02</span><strong>굿즈</strong><b>↗</b></a><a href="#schedule"><span>03</span><strong>일정</strong><b>↗</b></a><a href="#news"><span>04</span><strong>소식</strong><b>↗</b></a></nav>
      <section id="photos" class="detail-section"><div class="detail-heading"><div><span>01 / GALLERY</span><h2>사진 <em>✳</em></h2></div>${openLink(artist.links.find((item) => item.label === 'Instagram')?.url || artist.imageLink, '공식 사진 더 보기', 'section-more')}</div><div class="detail-photo-grid">${gallery}${extraMedia}</div><p class="photo-disclaimer">사진 제공·저작권: 각 출처. 사진을 누르면 원본으로 이동합니다.</p></section>
      <section id="goods" class="detail-section"><div class="detail-heading"><div><span>02 / COLLECTION</span><h2>굿즈 <em>✳</em></h2></div></div><div class="resource-grid">${resources(artist.merch, 'merch')}</div></section>
      <section id="schedule" class="detail-section"><div class="detail-heading"><div><span>03 / CALENDAR</span><h2>일정 <em>✳</em></h2></div></div><div class="resource-grid">${resources(artist.schedules, 'schedule')}</div></section>
      <section id="news" class="detail-section"><div class="detail-heading"><div><span>04 / UPDATES</span><h2>소식 <em>✳</em></h2></div></div><div class="detail-news-list">${artist.news.map((entry) => `<a href="${entry.href}" target="_blank" rel="noopener noreferrer" class="detail-news-row"><span class="detail-news-date">${entry.date}</span><div><span>${entry.tag}</span><strong>${entry.title}</strong></div><b>↗</b></a>`).join('')}</div></section>
      <section class="channels-section"><div><span>OFFICIAL CHANNELS</span><h2>공식 채널</h2></div><div class="channel-links">${artist.links.map((link) => `<a href="${link.url}" target="_blank" rel="noopener noreferrer"><span>${link.icon}</span><strong>${link.label}</strong><b>↗</b></a>`).join('')}</div></section>
      <section class="other-section"><div class="detail-heading"><div><span>MORE FAN SPACES</span><h2>다른 아이돌</h2></div><a class="section-more" href="./index.html">모두 보기 ↗</a></div><div class="other-grid">${other}</div></section>
      <div class="detail-source-note">비공식 팬페이지 · 2026.11.10 기준 · 일정·판매 정보는 공식 원문 확인</div>`;
    const saveButton = $('#detail-save', root);
    saveButton.addEventListener('click', () => {
      const active = toggleSaved(artist.id);
      saveButton.classList.toggle('is-saved', active);
      saveButton.textContent = active ? '♥ 관심 등록됨' : '♡ 관심 등록';
      saveButton.setAttribute('aria-pressed', String(active));
    });
    attachImageFallback(root);
  }

  if (page === 'hub') initHub();
  if (page === 'artist') initArtist();
})();
