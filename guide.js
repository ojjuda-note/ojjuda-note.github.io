/* Progressive enhancements for the public guide; no account or game state. */
(() => {
  'use strict';
  const cards = [...document.querySelectorAll('[data-game]')];
  const groups = [...document.querySelectorAll('[data-game-group]')];
  const search = document.getElementById('game-search');
  const clear = document.getElementById('clear-search');
  const status = document.getElementById('search-status');
  const empty = document.getElementById('empty-search');
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, '');
  const searchable = new Map(cards.map(card => [card, normalize(card.textContent)]));
  let beforeSearch = null;
  function filterGames() {
    const query = normalize(search.value.trim());
    if (query && !beforeSearch) beforeSearch = new Map(cards.map(card => [card, card.open]));
    let count = 0;
    cards.forEach(card => {
      const match = !query || searchable.get(card).includes(query);
      card.hidden = !match;
      if (query) card.open = match;
      else if (beforeSearch) card.open = beforeSearch.get(card);
      if (match) count++;
    });
    if (!query) beforeSearch = null;
    groups.forEach(group => { group.hidden = ![...group.querySelectorAll('[data-game]')].some(card => !card.hidden); });
    empty.hidden = count > 0;
    clear.hidden = !search.value;
    status.textContent = query ? `${count}개 게임의 사용법을 찾았어요.` : `${cards.length}개 게임의 사용법을 볼 수 있어요.`;
  }
  document.querySelector('.game-search').hidden = false;
  search.addEventListener('input', filterGames);
  clear.addEventListener('click', () => { search.value = ''; filterGames(); search.focus(); });

  function revealLinkedGame() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const card = document.getElementById(id);
    if (!card?.matches('[data-game]')) return;
    if (search.value) { search.value = ''; filterGames(); }
    card.open = true;
    requestAnimationFrame(() => card.scrollIntoView({block:'start'}));
  }
  window.addEventListener('hashchange', revealLinkedGame);
  revealLinkedGame();

  const sections = [...document.querySelectorAll('.guide-section')];
  const navLinks = [...document.querySelectorAll('.contents nav a')];
  let scrollFrame = 0;
  function updateNavigation() {
    scrollFrame = 0;
    let current = sections[0];
    const offset = matchMedia('(max-width: 850px)').matches ? 160 : 115;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= offset) current = section;
    }
    navLinks.forEach(link => {
      if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function scheduleNavigation() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateNavigation);
  }
  window.addEventListener('scroll', scheduleNavigation, {passive:true});
  window.addEventListener('resize', scheduleNavigation, {passive:true});
  cards.forEach(card => card.addEventListener('toggle', scheduleNavigation));
  updateNavigation();

  const viewer = document.getElementById('image-viewer');
  const viewerImage = document.getElementById('viewer-image');
  const caption = document.getElementById('viewer-caption');
  let previousFocus = null;
  if (typeof viewer.showModal === 'function') {
    document.querySelectorAll('[data-zoom]').forEach(link => {
      link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        previousFocus = link;
        viewerImage.src = link.href;
        viewerImage.alt = link.querySelector('img').alt;
        caption.textContent = link.dataset.caption;
        viewer.showModal();
        document.body.classList.add('viewer-open');
        viewer.querySelector('.viewer-image').scrollTop = 0;
        viewer.querySelector('button').focus();
      });
    });
    viewer.addEventListener('click', event => {
      if (event.target !== viewer) return;
      const bounds = viewer.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) viewer.close();
    });
    viewer.addEventListener('close', () => {
      document.body.classList.remove('viewer-open');
      previousFocus?.focus({preventScroll:true});
    });
  }
})();
