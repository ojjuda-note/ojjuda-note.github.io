(() => {
  'use strict';
  // A local preview of World's original animation. It never changes an account.
  const petDemo = document.getElementById('pet-demo');
  const petStatus = document.getElementById('pet-demo-status');
  const petButtons = [...document.querySelectorAll('[data-pet-action]')];
  const petMessages = { feed: '냠냠! 밥을 먹어요.', pat: '쓰담쓰담, 더 가까워져요.', play: '통통! 공을 따라 놀아요.' };
  const petClasses = ['a-feed', 'a-pat', 'a-play'];
  let petTimer;
  function previewPet(action) {
    if (!petDemo || !Object.hasOwn(petMessages, action)) return;
    clearTimeout(petTimer);
    petDemo.classList.remove(...petClasses);
    void petDemo.getBoundingClientRect();
    petDemo.classList.add('a-' + action);
    petStatus.textContent = petMessages[action];
    petButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.petAction === action)));
    petTimer = setTimeout(() => {
      petDemo.classList.remove(...petClasses);
      petButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
      petStatus.textContent = '한 번 더 놀아줄까요?';
    }, 2800);
  }
  petButtons.forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => previewPet(button.dataset.petAction));
  });
  if (petDemo && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const petObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        petObserver.disconnect();
        previewPet('pat');
      }
    }, { threshold: .7 });
    petObserver.observe(petDemo);
  }
  const search = document.getElementById('guide-search');
  const results = document.getElementById('search-results');
  const clear = document.getElementById('search-clear');
  const status = document.getElementById('search-status');
  const list = document.getElementById('search-list');
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
  const topics = [...document.querySelectorAll('[data-search-title]')].map(element => ({
    element, title: element.dataset.searchTitle,
    titleKey: normalize(element.dataset.searchTitle),
    body: normalize(element.textContent + ' ' + (element.dataset.keywords || '')),
    snippet: (element.querySelector('.answer p, p:not(.route), li')?.textContent || '').trim()
  }));
  function closeSearch() { results.hidden = true; search.setAttribute('aria-expanded', 'false'); }
  function renderSearch() {
    const query = normalize(search.value); clear.hidden = !query; list.replaceChildren();
    if (!query) { closeSearch(); status.textContent = ''; return; }
    const terms = query.split(' ').filter(Boolean);
    const matches = topics.filter(item => terms.every(term => item.body.includes(term) || item.titleKey.includes(term)))
      .sort((a, b) => Number(b.titleKey.includes(query)) - Number(a.titleKey.includes(query)));
    status.textContent = matches.length ? `${matches.length}개 설명을 찾았어요.${matches.length > 10 ? ' 먼저 10개를 보여드려요.' : ''}` : '찾는 설명이 없어요. 사진, 위치, 쭈처럼 짧은 낱말로 찾아보세요.';
    for (const item of matches.slice(0, 10)) {
      const li = document.createElement('li'), link = document.createElement('a');
      const title = document.createElement('strong'), snippet = document.createElement('small');
      link.href = '#' + item.element.id; title.textContent = item.title; snippet.textContent = item.snippet;
      link.append(title, snippet); li.append(link); list.append(li);
    }
    results.hidden = false; search.setAttribute('aria-expanded', 'true');
  }
  search.addEventListener('input', renderSearch);
  search.addEventListener('focus', () => { if (search.value.trim()) renderSearch(); });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSearch();
    if (event.key === 'ArrowDown' && !results.hidden) { event.preventDefault(); list.querySelector('a')?.focus(); }
    if (event.key === 'Enter') { event.preventDefault(); if (!results.hidden) list.querySelector('a')?.click(); }
  });
  results.addEventListener('keydown', event => {
    const links = [...list.querySelectorAll('a')], index = links.indexOf(document.activeElement);
    if (event.key === 'Escape') { search.focus({ preventScroll: true }); closeSearch(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); links[Math.min(links.length - 1, index + 1)]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); index <= 0 ? search.focus() : links[index - 1]?.focus(); }
  });
  clear.addEventListener('click', () => { search.value = ''; renderSearch(); search.focus(); });
  document.addEventListener('click', event => { if (!event.target.closest('.find-box')) closeSearch(); });
  const groups = [...document.querySelectorAll('.guide-group')];
  const groupTabs = [...document.querySelectorAll('[role="tab"][data-guide-group]')];
  const defaultGroup = groups.find(group => group.id === 'guide-start') || groups[0];
  let activeGroup = defaultGroup;
  let revealFrame = 0;
  function targetFromHash(hash = location.hash) {
    if (!hash || hash === '#') return null;
    try { return document.getElementById(decodeURIComponent(hash.slice(1))); }
    catch { return null; }
  }
  function selectGroup(group = defaultGroup) {
    if (!group || !groups.includes(group)) return;
    activeGroup = group;
    for (const panel of groups) {
      panel.hidden = panel !== group;
      panel.tabIndex = 0;
    }
    for (const tab of groupTabs) {
      const selected = tab.dataset.guideGroup === group.id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  }
  function revealTarget(id, focus = false, tabFocus = null) {
    const target = document.getElementById(id); if (!target) return;
    selectGroup(target.closest('.guide-group') || defaultGroup);
    if (target.matches('details')) target.open = true;
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches('details')) parent.open = true;
    }
    closeSearch();
    cancelAnimationFrame(revealFrame);
    revealFrame = requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (tabFocus) tabFocus.focus({ preventScroll: true });
      else if (focus) {
        if (!target.matches('.guide-group')) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
      if (target.matches('.topic-detail, .faq')) {
        target.classList.remove('search-target'); void target.offsetWidth; target.classList.add('search-target');
      }
    });
  }
  function navigateTo(target, tabFocus = null) {
    const hash = '#' + encodeURIComponent(target.id);
    if (location.hash !== hash) history.pushState(null, '', hash);
    revealTarget(target.id, !tabFocus, tabFocus);
  }
  groupTabs.forEach(tab => {
    tab.addEventListener('keydown', event => {
      const index = groupTabs.indexOf(tab);
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % groupTabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + groupTabs.length) % groupTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = groupTabs.length - 1;
      else if (event.key === ' ') next = index;
      else return;
      event.preventDefault();
      const nextTab = groupTabs[next], group = document.getElementById(nextTab.dataset.guideGroup);
      if (group) navigateTo(group, nextTab);
    });
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]'); if (!link) return;
    const target = targetFromHash(link.hash); if (!target) return;
    event.preventDefault();
    navigateTo(target, link.matches('[role="tab"][data-guide-group]') ? link : null);
  });
  function restoreLocation() {
    const target = targetFromHash();
    if (target) revealTarget(target.id);
    else {
      cancelAnimationFrame(revealFrame);
      selectGroup();
      closeSearch();
    }
  }
  window.addEventListener('hashchange', restoreLocation);
  window.addEventListener('popstate', restoreLocation);
  restoreLocation();
  document.querySelectorAll('[data-faq-toggle]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.faq').forEach(item => { item.open = button.dataset.faqToggle === 'open'; });
  }));
  document.querySelectorAll('[data-guide-toggle]').forEach(button => button.addEventListener('click', () => {
    (activeGroup || document).querySelectorAll('.topic-detail').forEach(item => { item.open = button.dataset.guideToggle === 'open'; });
  }));
  let printState = null;
  window.addEventListener('beforeprint', () => {
    if (printState) return;
    printState = {
      details: [...document.querySelectorAll('#guide-manual, .topic-detail, .faq')].map(item => [item, item.open]),
      groups: groups.map(group => [group, group.hidden])
    };
    printState.details.forEach(([item]) => { item.open = true; });
    groups.forEach(group => { group.hidden = false; });
  });
  window.addEventListener('afterprint', () => {
    if (!printState) return;
    printState.details.forEach(([item, open]) => { item.open = open; });
    printState.groups.forEach(([group, hidden]) => { group.hidden = hidden; });
    printState = null;
  });
  document.getElementById('print-guide')?.addEventListener('click', () => window.print());
})();
