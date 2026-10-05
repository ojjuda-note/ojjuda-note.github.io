/* Search only the public directory text; no account or server requests. */
(() => {
  'use strict';
  const input = document.getElementById('map-search');
  if (!input) return;
  const reset = document.getElementById('map-search-clear');
  const status = document.getElementById('map-results');
  const empty = document.getElementById('map-empty');
  const groups = [...document.querySelectorAll('[data-map-group]')].map(section => ({
    section,
    title: section.querySelector('h2').textContent,
    route: section.querySelector('.map-route').textContent,
    items: [...section.querySelectorAll('[data-map-item]')],
    jump: document.querySelector(`[data-map-jump="${section.id}"]`)
  }));
  function filter() {
    const words = input.value.trim().toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
    let count = 0;
    for (const group of groups) {
      let visible = 0;
      for (const item of group.items) {
        const text = `${group.title} ${group.route} ${item.textContent} ${item.dataset.keywords || ''}`.toLocaleLowerCase('ko-KR');
        item.hidden = !words.every(word => text.includes(word));
        if (!item.hidden) visible++;
      }
      group.section.hidden = !visible;
      if (group.jump) group.jump.hidden = !visible;
      count += visible;
    }
    status.textContent = words.length ? `${count}개 기능을 찾았어요.` : `${count}개 기능과 안내를 메뉴별로 확인하세요.`;
    empty.hidden = count > 0;
    reset.hidden = !input.value;
  }
  function clear() { input.value = ''; filter(); input.focus(); }
  input.addEventListener('input', filter);
  input.addEventListener('keydown', event => { if (event.key === 'Escape') clear(); });
  reset.addEventListener('click', clear);
  filter();
})();
