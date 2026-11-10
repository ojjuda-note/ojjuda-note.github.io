(() => {
  'use strict';
  const artists = window.OJJUDA_FAN_ARTISTS || [];
  const profiles = window.OJJUDA_FAN_PROFILES || {};
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

  function initFeatured() {
    const stage = $('#featured-carousel');
    if (!stage || artists.length < 2) return;
    const total = artists.length;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const slides = [artists[total - 1], ...artists, artists[0]];
    const slideHtml = (item) => `<a class="feature-group feature-slide ${item.name.length > 9 ? 'feature-long' : ''}" href="${groupUrl(item.id)}" aria-label="${item.korean} 팬페이지 열기">
      <span class="feature-mini">FAN SPACE / ${String(artists.indexOf(item) + 1).padStart(2, '0')}</span>
      <div class="feature-portrait"><span class="feature-photo-fallback" aria-hidden="true">${item.shape}</span><img data-external-image src="${item.image}" alt="${item.korean} 그룹 사진" loading="${item.id === artists[0].id ? 'eager' : 'lazy'}" referrerpolicy="no-referrer"></div>
      <span class="feature-name">${item.name}<span>↗</span></span><span class="feature-sub">${item.korean} · ${item.fan}</span><span class="feature-sticker">${item.shape}</span>
    </a>`;
    stage.innerHTML = `<div class="feature-track">${slides.map(slideHtml).join('')}</div><div class="feature-dots" role="group" aria-label="아이돌 슬라이드 선택">${artists.map((item, i) => `<button type="button" class="feature-dot" data-slide="${i}" aria-label="${item.korean} 보기" aria-pressed="false"></button>`).join('')}</div>`;
    const track = $('.feature-track', stage);
    const cards = [...stage.querySelectorAll('.feature-slide')];
    const dots = [...stage.querySelectorAll('.feature-dot')];
    let position = 1;
    let moving = false;
    let paused = false;
    let touchX = null;
    let swipedAt = 0;
    let timer = null;
    let sequence = 0;

    function updateControls() {
      const active = (position - 1 + total) % total;
      cards.forEach((card, index) => {
        const visible = index === position;
        card.inert = !visible;
        card.tabIndex = visible ? 0 : -1;
        card.setAttribute('aria-hidden', String(!visible));
      });
      dots.forEach((dot, index) => {
        const selected = index === active;
        dot.classList.toggle('is-active', selected);
        dot.setAttribute('aria-pressed', String(selected));
      });
    }
    function setPosition(instant = false) {
      track.style.transition = instant || reducedMotion ? 'none' : '';
      track.style.transform = `translate3d(${-100 * position}%, 0, 0)`;
    }
    function finish() {
      if (!moving) return;
      if (position === 0 || position === total + 1) {
        position = position === 0 ? total : 1;
        setPosition(true);
        void track.offsetWidth;
        track.style.transition = '';
      }
      moving = false;
      updateControls();
    }
    function move(to) {
      if (moving || to === position) return;
      if (reducedMotion) {
        position = to === 0 ? total : to === total + 1 ? 1 : to;
        setPosition(true);
        updateControls();
        return;
      }
      moving = true;
      position = to;
      setPosition();
      updateControls();
      const currentSequence = ++sequence;
      setTimeout(() => { if (sequence === currentSequence) finish(); }, 900);
    }
    function restartTimer() {
      if (timer) clearInterval(timer);
      if (!reducedMotion) timer = setInterval(() => {
        if (!paused && !document.hidden) move(position + 1);
      }, 5700);
    }
    track.addEventListener('transitionend', (event) => {
      if (event.target === track && event.propertyName === 'transform') finish();
    });
    dots.forEach((dot, index) => dot.addEventListener('click', () => {
      const target = index + 1;
      if (position === total && target === 1) move(total + 1);
      else if (position === 1 && target === total) move(0);
      else move(target);
      restartTimer();
    }));
    stage.addEventListener('mouseenter', () => { paused = true; });
    stage.addEventListener('mouseleave', () => { paused = stage.contains(document.activeElement); });
    stage.addEventListener('focusin', () => { paused = true; });
    stage.addEventListener('focusout', () => { paused = stage.matches(':hover'); });
    stage.addEventListener('touchstart', (event) => { touchX = event.touches[0]?.clientX ?? null; }, { passive: true });
    stage.addEventListener('touchend', (event) => {
      if (touchX === null) return;
      const distance = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
      touchX = null;
      if (Math.abs(distance) < 45) return;
      swipedAt = Date.now();
      move(position + (distance < 0 ? 1 : -1));
      restartTimer();
    }, { passive: true });
    stage.addEventListener('click', (event) => {
      if (Date.now() - swipedAt < 500 && event.target.closest('a')) event.preventDefault();
    }, true);
    setPosition(true);
    updateControls();
    attachImageFallback(stage);
    restartTimer();
  }

  function initHub() {
    initFeatured();
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

  function initPhotoViewer(root, artist) {
    const dialog = $('#photo-viewer', root);
    const buttons = [...root.querySelectorAll('[data-photo-index]')];
    if (!dialog || !buttons.length) return;

    const image = $('#photo-viewer-image', dialog);
    const missing = $('#photo-viewer-missing', dialog);
    const number = $('#photo-viewer-number', dialog);
    const title = $('#photo-viewer-title', dialog);
    const credit = $('#photo-viewer-credit', dialog);
    const source = $('#photo-viewer-source', dialog);
    const license = $('#photo-viewer-license', dialog);
    const close = $('.photo-viewer-close', dialog);
    const stage = $('.photo-viewer-stage', dialog);
    let active = 0;
    let trigger = null;
    let touchX = null;

    function show(index) {
      active = (index + artist.photos.length) % artist.photos.length;
      const photo = artist.photos[active];
      number.textContent = `${String(active + 1).padStart(2, '0')} / ${String(artist.photos.length).padStart(2, '0')}`;
      title.textContent = photo.label;
      credit.textContent = `${photo.meta} · ${photo.credit}`;
      source.href = photo.href;
      license.hidden = !photo.licenseUrl;
      if (photo.licenseUrl) {
        license.href = photo.licenseUrl;
        license.textContent = photo.license;
      }
      missing.hidden = true;
      image.hidden = false;
      image.alt = `${artist.korean} ${photo.label} 사진`;
      image.onerror = () => { image.hidden = true; missing.hidden = false; };
      image.src = photo.full || photo.image;
    }

    buttons.forEach((button) => button.addEventListener('click', () => {
      if (typeof dialog.showModal !== 'function') {
        window.open(artist.photos[Number(button.dataset.photoIndex)].image, '_blank', 'noopener');
        return;
      }
      trigger = button;
      show(Number(button.dataset.photoIndex));
      dialog.showModal();
      document.body.classList.add('photo-viewing');
      close.focus();
    }));
    close.addEventListener('click', () => dialog.close());
    $('.photo-viewer-prev', dialog).addEventListener('click', () => show(active - 1));
    $('.photo-viewer-next', dialog).addEventListener('click', () => show(active + 1));
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('photo-viewing');
      trigger?.focus();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        show(active + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });
    stage.addEventListener('touchstart', (event) => { touchX = event.touches[0]?.clientX ?? null; }, { passive: true });
    stage.addEventListener('touchend', (event) => {
      if (touchX === null) return;
      const delta = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
      touchX = null;
      if (Math.abs(delta) > 55) show(active + (delta < 0 ? 1 : -1));
    }, { passive: true });
  }

  function artistProfileHtml(artist, profile) {
    if (!profile) return '';
    const dossier = (label, value, extra = '') => `<div class="profile-fact"><span>${label}</span><strong class="${extra}">${value}</strong></div>`;
    const revealButton = (id, closedLabel, openLabel, extra = '') => `<button type="button" class="content-reveal ${extra}" data-reveal-target="${id}" data-label-closed="${closedLabel}" data-label-open="${openLabel}" aria-controls="${id}" aria-expanded="false"><span class="content-reveal-text">${closedLabel}</span><span class="content-reveal-icon" aria-hidden="true">⌄</span></button>`;
    const history = (entries, label, sign, id) => `<div class="profile-history-group"><div class="profile-history-label"><span>${sign}</span><strong>${label}</strong><small>${String(entries.length).padStart(2, '0')}</small></div><div class="profile-history-list ${entries.length > 1 ? 'is-preview' : ''}" id="${id}">${entries.map((entry) => `<a href="${entry.href}" target="_blank" rel="noopener noreferrer" class="profile-history-item"><span class="profile-history-year">${entry.year}</span><span class="profile-history-main"><strong>${entry.title}</strong><small>${entry.detail}</small></span><span class="profile-history-arrow" aria-hidden="true">↗</span></a>`).join('')}</div>${entries.length > 1 ? revealButton(id, `${label} 더 보기`, `${label} 접기`, 'content-reveal-small') : ''}</div>`;
    const members = profile.members.map((member, i) => {
      const birthDate = member.birthday.replaceAll('.', '-');
      return `<article class="profile-member-card">
        <div class="profile-member-top"><span class="profile-member-index">${String(i + 1).padStart(2, '0')}</span><span class="profile-member-spark" aria-hidden="true">${artist.shape}</span></div>
        <div class="profile-member-name"><h4>${member.name}</h4><span>${member.note || 'MEMBER'}</span></div>
        <dl><div><dt>생일</dt><dd><time datetime="${birthDate}">${member.birthday}</time></dd></div><div><dt>고향·출신</dt><dd>${member.hometown || '<span class="profile-pending">확인 중</span>'}</dd></div><div><dt>학교·학력</dt><dd>${member.school || '<span class="profile-pending">확인 중</span>'}</dd></div></dl>
        ${member.source ? `<a class="profile-member-source" href="${member.source}" target="_blank" rel="noopener noreferrer" aria-label="${member.name} 관련 자료 보기">관련 자료 <span aria-hidden="true">↗</span></a>` : ''}
      </article>`;
    }).join('');
    return `<section id="profile" class="detail-section profile-section" aria-labelledby="profile-heading">
      <div class="detail-heading"><div><span>01 / ARTIST FILE</span><h2 id="profile-heading">소개 <em>${artist.shape}</em></h2></div><span class="profile-checked">CHECKED ${profile.checkedAt}</span></div>
      <div class="profile-overview">
        <div class="profile-identity"><div class="profile-identity-shape" aria-hidden="true">${artist.shape}</div><span class="profile-kicker">${artist.name} / THE STORY</span><strong class="profile-debut"><small>DEBUT</small><time datetime="${profile.debut.replaceAll('.', '-')}">${profile.debut}</time></strong><p>${profile.concept}</p><div class="profile-facts">${dossier('데뷔곡·음반', profile.debutWork)}${dossier('기획사', profile.agency)}${dossier('팬덤', artist.fan)}</div></div>
        <div class="profile-history">${history(profile.awards, '수상', '✦', 'profile-awards')}${history(profile.records, '기록', '↗', 'profile-records')}</div>
      </div>
      <div class="profile-members-title"><div><span>MEMBER ARCHIVE</span><h3>멤버 프로필</h3></div><strong>${String(profile.members.length).padStart(2, '0')} MEMBERS</strong></div>
      <div class="profile-member-grid ${profile.members.length > 3 ? 'is-preview' : ''}" id="profile-members">${members}</div>
      ${profile.members.length > 3 ? revealButton('profile-members', `멤버 ${profile.members.length}명 모두 보기`, '멤버 간단히 보기') : ''}
      <details class="profile-sources"><summary><span>자료 출처</span><small>${profile.sources.length}곳</small><span class="profile-sources-arrow" aria-hidden="true">⌄</span></summary><div class="profile-source-links">${profile.sources.map((source) => `<a href="${source.href}" target="_blank" rel="noopener noreferrer">${source.label} ↗</a>`).join('')}<small>학교·학력은 재학 이력을 포함하며, 미확인 정보는 표시하지 않아요.</small></div></details>
    </section>`;
  }

  function initProgressiveReveal(root) {
    root.querySelectorAll('[data-reveal-target]').forEach((button) => {
      const target = root.querySelector(`#${button.dataset.revealTarget}`);
      if (!target) return;
      button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') !== 'true';
        target.classList.toggle('is-expanded', expanded);
        button.setAttribute('aria-expanded', String(expanded));
        $('.content-reveal-text', button).textContent = expanded ? button.dataset.labelOpen : button.dataset.labelClosed;
      });
    });
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
    const profile = profiles[artist.id];
    const saved = getSaved().includes(artist.id);
    document.body.dataset.artist = artist.id;
    document.documentElement.style.setProperty('--group-accent', artist.accent);
    document.documentElement.style.setProperty('--group-light', artist.light);
    document.documentElement.style.setProperty('--group-dark', artist.dark);
    document.title = `${artist.korean} (${artist.name}) | 오쭈다 팬페이지`;
    const gallery = artist.photos.map((photo, i) => `<button class="detail-photo" type="button" data-photo-index="${i}" aria-haspopup="dialog" aria-label="${artist.korean} ${photo.label} 사진 크게 보기">
      ${imageHtml(photo.image, `${artist.korean} ${photo.label} 사진`, `detail-photo-image image-${i}`)}
      <div class="detail-photo-caption"><div><small>${photo.meta}</small><strong>${photo.label}</strong><span>${photo.credit}</span></div><span class="out-arrow" aria-hidden="true">⤢</span></div>
    </button>`).join('');
    const resources = (entries, kind) => entries.map((entry, i) => `<a class="resource-item" href="${entry.href}" target="_blank" rel="noopener noreferrer"><span class="resource-icon">${kind === 'merch' ? '◈' : '▦'}</span><div><small>${entry.sub}</small><strong>${entry.title}</strong></div><span class="resource-arrow">↗</span></a>`).join('');
    const other = artists.filter((item) => item.id !== artist.id).map((item) => `<a href="${groupUrl(item.id)}" class="other-group" style="--other-light:${item.light};--other-accent:${item.accent}"><span>${item.shape}</span><div><strong>${item.name}</strong><small>${item.korean}</small></div><span>↗</span></a>`).join('');

    root.innerHTML = `
      <nav class="breadcrumb" aria-label="위치"><a href="./index.html">← 전체 팬페이지</a><span>/</span><span>${artist.korean}</span></nav>
      <section class="detail-hero stage-hero">
        <div class="stage-energy" aria-hidden="true">
          <span class="stage-orb stage-orb-a"></span><span class="stage-orb stage-orb-b"></span><span class="stage-orb stage-orb-c"></span>
          <span class="stage-ring stage-ring-a"></span><span class="stage-ring stage-ring-b"></span>
          <span class="stage-beam stage-beam-a"></span><span class="stage-beam stage-beam-b"></span>
          <span class="stage-glyph stage-glyph-a">${artist.shape}</span><span class="stage-glyph stage-glyph-b">${artist.shape}</span><span class="stage-glyph stage-glyph-c">${artist.shape}</span>
          <span class="stage-ghost-number">${String(index + 1).padStart(2, '0')}</span>
        </div>
        <div class="detail-hero-copy"><span class="detail-overline">OJJUDA FAN SPACE / ${String(index + 1).padStart(2, '0')}</span><div class="detail-hero-main"><div class="detail-heart">${artist.shape}</div><h1>${artist.name}</h1><p>${artist.korean} <span>·</span> ${artist.fan}</p></div><div class="detail-hero-actions"><a href="#photos" class="detail-primary">사진 보기 ↗</a><button class="detail-save ${saved ? 'is-saved' : ''}" type="button" id="detail-save" aria-pressed="${saved}">${saved ? '♥ 관심 등록됨' : '♡ 관심 등록'}</button></div><span class="agency-label">${artist.agency} · FAN MADE</span></div>
        <div class="detail-hero-visual">${imageHtml(artist.image, `${artist.korean} 그룹 사진`, 'detail-hero-image')}<span class="hero-vertical">${artist.status}</span><span class="stage-visual-tag" aria-hidden="true">${artist.fan}</span><span class="hero-image-credit">${artist.imageCredit} ↗</span></div>
      </section>
      <div class="stage-ticker" aria-hidden="true"><div class="stage-ticker-track">${Array.from({ length: 8 }, () => `<span>${artist.name}<b>${artist.shape}</b>${artist.fan}<b>✦</b></span>`).join('')}</div></div>
      <div class="member-strip"><span>MEMBERS</span><div>${artist.members.map((name) => `<span>${name}</span>`).join('')}</div></div>
      <nav class="detail-shortcuts" aria-label="팬페이지 메뉴"><a href="#profile"><span>01</span><strong>소개</strong><b>↗</b></a><a href="#photos"><span>02</span><strong>사진</strong><b>↗</b></a><a href="#goods"><span>03</span><strong>굿즈</strong><b>↗</b></a><a href="#schedule"><span>04</span><strong>일정</strong><b>↗</b></a><a href="#news"><span>05</span><strong>소식</strong><b>↗</b></a></nav>
      ${artistProfileHtml(artist, profile)}
      <section id="photos" class="detail-section"><div class="detail-heading"><div><span>02 / GALLERY</span><h2>사진 <em>${artist.shape}</em></h2></div><div class="gallery-heading-actions"><span class="gallery-count">${artist.photos.length} PHOTOS</span>${openLink(artist.links.find((item) => item.label === 'Instagram')?.url || artist.imageLink, '공식 사진 더 보기', 'section-more')}</div></div><div class="detail-photo-grid ${artist.photos.length > 3 ? 'is-preview' : ''}" id="artist-photo-grid">${gallery}</div>${artist.photos.length > 3 ? `<button type="button" class="content-reveal" data-reveal-target="artist-photo-grid" data-label-closed="사진 ${artist.photos.length}장 모두 보기" data-label-open="사진 간단히 보기" aria-controls="artist-photo-grid" aria-expanded="false"><span class="content-reveal-text">사진 ${artist.photos.length}장 모두 보기</span><span class="content-reveal-icon" aria-hidden="true">⌄</span></button>` : ''}<p class="photo-disclaimer">사진을 누르면 이 페이지에서 크게 볼 수 있어요. 원본 출처·이용 조건은 확대 화면에 표시됩니다.</p></section>
      <dialog class="photo-viewer" id="photo-viewer" aria-labelledby="photo-viewer-title"><div class="photo-viewer-panel">
        <div class="photo-viewer-top"><span>OJJUDA PHOTO GALLERY <b id="photo-viewer-number"></b></span><button type="button" class="photo-viewer-close" aria-label="사진 닫기">✕</button></div>
        <div class="photo-viewer-stage"><button type="button" class="photo-viewer-arrow photo-viewer-prev" aria-label="이전 사진">‹</button><div class="photo-viewer-frame"><img id="photo-viewer-image" alt=""><span class="photo-viewer-missing" id="photo-viewer-missing" hidden>사진을 불러올 수 없어요.</span></div><button type="button" class="photo-viewer-arrow photo-viewer-next" aria-label="다음 사진">›</button></div>
        <div class="photo-viewer-bottom"><div><h3 id="photo-viewer-title"></h3><p id="photo-viewer-credit"></p></div><div class="photo-viewer-actions"><a id="photo-viewer-license" href="#" target="_blank" rel="noopener noreferrer" hidden>이용 조건</a><a id="photo-viewer-source" href="#" target="_blank" rel="noopener noreferrer">원본·출처 ↗</a></div></div>
      </div></dialog>
      <section id="goods" class="detail-section"><div class="detail-heading"><div><span>03 / COLLECTION</span><h2>굿즈 <em>${artist.shape}</em></h2></div></div><div class="resource-grid">${resources(artist.merch, 'merch')}</div></section>
      <section id="schedule" class="detail-section"><div class="detail-heading"><div><span>04 / CALENDAR</span><h2>일정 <em>${artist.shape}</em></h2></div></div><div class="resource-grid">${resources(artist.schedules, 'schedule')}</div></section>
      <section id="news" class="detail-section"><div class="detail-heading"><div><span>05 / UPDATES</span><h2>소식 <em>${artist.shape}</em></h2></div></div><div class="detail-news-list">${artist.news.map((entry) => `<a href="${entry.href}" target="_blank" rel="noopener noreferrer" class="detail-news-row"><span class="detail-news-date">${entry.date}</span><div><span>${entry.tag}</span><strong>${entry.title}</strong></div><b>↗</b></a>`).join('')}</div></section>
      <section class="channels-section"><div><span>OFFICIAL CHANNELS</span><h2>공식 채널</h2></div><div class="channel-links">${artist.links.map((link) => `<a href="${link.url}" target="_blank" rel="noopener noreferrer"><span>${link.icon}</span><strong>${link.label}</strong><b>↗</b></a>`).join('')}</div></section>
      <section class="other-section"><div class="detail-heading"><div><span>MORE FAN SPACES</span><h2>다른 아이돌</h2></div><a class="section-more" href="./index.html">모두 보기 ↗</a></div><div class="other-grid">${other}</div></section>
      <div class="detail-source-note">비공식 팬페이지 · 소개 정보 ${profile?.checkedAt || '확인 중'} 기준 · 일정·판매 정보는 공식 원문 확인</div>`;
    const saveButton = $('#detail-save', root);
    saveButton.addEventListener('click', () => {
      const active = toggleSaved(artist.id);
      saveButton.classList.toggle('is-saved', active);
      saveButton.textContent = active ? '♥ 관심 등록됨' : '♡ 관심 등록';
      saveButton.setAttribute('aria-pressed', String(active));
    });
    attachImageFallback(root);
    initProgressiveReveal(root);
    initPhotoViewer(root, artist);
    if ('IntersectionObserver' in window && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }), { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
      root.querySelectorAll('.detail-section, .channels-section, .other-section').forEach((section) => {
        section.classList.add('will-reveal');
        observer.observe(section);
      });
    }
  }

  if (page === 'hub') initHub();
  if (page === 'artist') initArtist();
})();
