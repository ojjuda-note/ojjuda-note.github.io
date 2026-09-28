(() => {
  'use strict';
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
  function revealTarget(id, focus = false) {
    const target = document.getElementById(id); if (!target) return;
    if (target.matches('details')) target.open = true;
    for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.matches('details')) parent.open = true;
    document.querySelector('.mobile-contents')?.removeAttribute('open');
    closeSearch();
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (focus) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
      target.classList.remove('search-target'); void target.offsetWidth; target.classList.add('search-target');
    });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]'); if (!link || link.getAttribute('href') === '#top') return;
    const id = decodeURIComponent(link.hash.slice(1)); if (!document.getElementById(id)) return;
    event.preventDefault(); history.pushState(null, '', '#' + encodeURIComponent(id)); revealTarget(id, true);
  });
  window.addEventListener('hashchange', () => { if (location.hash) revealTarget(decodeURIComponent(location.hash.slice(1))); });
  if (location.hash) revealTarget(decodeURIComponent(location.hash.slice(1)));
  const chapters = [...document.querySelectorAll('.chapter')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        document.querySelectorAll('.contents a[href^="#"]').forEach(link => {
          if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
        });
      }
    }, { rootMargin: '-105px 0px -66% 0px', threshold: 0 });
    chapters.forEach(chapter => observer.observe(chapter));
  }
  document.querySelectorAll('[data-faq-toggle]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.faq').forEach(item => { item.open = button.dataset.faqToggle === 'open'; });
  }));
  let printState = [];
  window.addEventListener('beforeprint', () => { printState = [...document.querySelectorAll('.faq')].map(item => [item, item.open]); printState.forEach(([item]) => { item.open = true; }); });
  window.addEventListener('afterprint', () => { printState.forEach(([item, open]) => { item.open = open; }); });
  document.getElementById('print-guide').addEventListener('click', () => window.print());
})();
