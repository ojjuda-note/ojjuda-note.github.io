/* Entry controls are presentation only; existing game start/invite handlers own actions. */
(() => {
  'use strict';
  const selected = new Map();
  const icons={
    '🔨':'<path d="m8 5 3-3 8 8-3 3-3-3-7 9-3-3 8-7z"/>',
    '🏃':'<circle cx="15" cy="4" r="2"/><path d="m7 10 4-3 4 3 4 1M11 7l-1 7-5 6m5-6 5 1 1 6"/>',
    '🏗️':'<rect x="3" y="16" width="18" height="5" rx="1"/><rect x="5" y="10" width="14" height="5" rx="1"/><rect x="8" y="4" width="12" height="5" rx="1"/>',
    '🎾':'<path d="M3 4h18v8H3zM3 8h18M9 4v4m6 0v4M7 21h10"/><circle cx="12" cy="17" r="2"/>',
    '🔩':'<path d="m7 3-4 4v6l4 4h6l4-4V7l-4-4zM16 14l5 5m-4-1 2-2m-9-5h0"/><circle cx="10" cy="10" r="3"/>',
    '🟣':'<path d="M3 3h18v18H3zM3 14h7V8h5V3M10 14v7M15 8h6"/>',
    '🖼️':'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-5 4 3 4-6 4 5"/>',
    '🔎':'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
    '🎱':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="2"/><circle cx="12" cy="14" r="3"/>',
    '🎴':'<rect x="7" y="3" width="13" height="18" rx="2"/><path d="M4 6H3v15h11M7 15l5-5 8 8"/><circle cx="15" cy="8" r="1"/>',
    '♟️':'<circle cx="12" cy="5" r="3"/><path d="M8 10h8m-6 0-1 6-4 4h14l-4-4-1-6M5 22h14"/>',
    '🀄':'<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 7h8m-8 5h8m-8 5h8M12 7v10"/>',
    '👥':'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>'
  };
  function select(card, mode) {
    if (!['computer', 'opponent'].includes(mode)) return;
    selected.set(card.dataset.entryKey, mode);
    card.querySelectorAll('[data-entry-mode]').forEach(button => {
      const active = button.dataset.entryMode === mode;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    });
    card.querySelectorAll('[data-entry-panel]').forEach(panel => {
      panel.hidden = panel.dataset.entryPanel !== mode;
    });
  }
  function filter(picker) {
    const term = (picker.querySelector('[data-friend-search]')?.value || '').trim().toLocaleLowerCase('ko');
    let shown = 0;
    picker.querySelectorAll('[data-friend-id]').forEach(row => {
      row.hidden = !(row.dataset.friendName || '').toLocaleLowerCase('ko').includes(term);
      if (!row.hidden) shown++;
    });
    const empty = picker.querySelector('[data-friend-empty]');
    if (empty) empty.hidden = !term || shown > 0;
  }
  function presence() {
    const friends = window.OjjudaGameFriends?.list?.();
    if (!friends) return;
    const byId = new Map(friends.map(friend => [friend.id, friend]));
    document.querySelectorAll('[data-entry-friends]').forEach(picker => {
      picker.querySelectorAll('[data-friend-id]').forEach(row => {
        const friend = byId.get(row.dataset.friendId);
        if (!friend) { row.remove(); return; }
        const status = friend.online === true ? 'true' : friend.online === false ? 'false' : 'unknown';
        if (row.dataset.online !== status) {
          row.dataset.online = status;
          const label = row.querySelector('.ge-presence');
          label.replaceChildren(Object.assign(document.createElement('i'), {ariaHidden: 'true'}),
            document.createTextNode(status === 'true' ? '접속 중' : status === 'false' ? '오프라인' : '접속 확인 중'));
        }
      });
      const list = picker.querySelector('[data-friend-list]');
      if (list) {
        const rows = [...list.querySelectorAll('[data-friend-id]')];
        const sorted = [...rows].sort((a, b) => Number(b.dataset.online === 'true') - Number(a.dataset.online === 'true') || a.dataset.friendName.localeCompare(b.dataset.friendName, 'ko'));
        if (sorted.some((row, index) => row !== rows[index])) sorted.forEach(row => list.appendChild(row));
      }
      const count = picker.querySelector('[data-friend-count]');
      if (count) {
        const text = friends.some(friend => friend.online === null) ? '접속 확인 중' : friends.filter(friend => friend.online).length + '명 접속 중';
        if (count.textContent !== text) count.textContent = text;
      }
      filter(picker);
    });
  }
  function mount(root = document) {
    root.querySelectorAll('.game-entry .ge-icon:not([data-icon-ready])').forEach(icon=>{
      const paths=icons[icon.textContent.trim()];icon.dataset.iconReady='true';
      if(paths)icon.innerHTML='<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
    });
    root.querySelectorAll('.game-entry[data-entry-key]:not([data-entry-ready])').forEach(card => {
      card.dataset.entryReady = 'true';
      select(card, selected.get(card.dataset.entryKey) || 'computer');
    });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-entry-mode]');
    if (button) select(button.closest('.game-entry'), button.dataset.entryMode);
  });
  document.addEventListener('input', event => {
    if (event.target.matches('[data-friend-search]')) filter(event.target.closest('[data-entry-friends]'));
  });
  window.addEventListener('ojjuda:friends-presence', presence);
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1))) mount();
  }).observe(document.body, {childList:true, subtree:true});
  mount();
})();
