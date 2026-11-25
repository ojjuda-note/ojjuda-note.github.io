// The board is mounted once per account inside the existing Agit document.
(() => {
  'use strict';
  const styles = [
    '/shared/viewport/mobile-viewport.css?v=20261106-source-folders1',
    '/groups/style.css?v=20261123-search-submit1',
    '/groups/composer.css?v=20261124-single-tab-highlight1',
    '/features/groups/appearance.css?v=20261126-room-compact1',
    '/shared/share/page-share.css?v=20261123-park-share1',
    '/groups/navigation.css?v=20261126-group-password1'
  ];
  let host, owner, board, loading;
  const active = () => !!host && !host.hidden;
  function clear() {
    board?.destroy();
    board = null;
    loading = null;
    host?.remove();
    host = null;
    owner = null;
    document.documentElement.classList.remove('world-group-open');
  }
  async function load(element) {
    const root = element.shadowRoot;
    const content = root.querySelector('main');
    try {
      await Promise.all([
        ...Array.from(root.querySelectorAll('link'),link => link.sheet || new Promise((resolve,reject)=>{
          link.onload=resolve;link.onerror=reject;
        })),
        import('/groups/activities.js?v=20261126-theme1'),
        import('/groups/composer.js?v=20261126-theme1'),
        import('/shared/art/cozy-scenes.js?v=20261118-cozy100-1'),
        import('/groups/app.js?v=20261126-room-compact1')
      ]);
      if (host === element) board = window.OjjudaGroups.mount(root);
    } catch {
      if (host !== element) return;
      content.innerHTML='<button type="button">그룹 다시 불러오기</button>';
      content.firstElementChild.onclick=()=>{const account=owner;clear();sync('group',account);};
    }
  }
  function sync(tab, account) {
    if (host && owner !== account) clear();
    const entering = tab === 'group' && !active();
    if (tab === 'group' && !host) {
      owner = account;
      host = document.createElement('section');
      host.id = 'world-group-tab';
      host.setAttribute('aria-label','그룹');
      host.dataset.worldSwipeSurface = '';
      const root = host.attachShadow({mode:'open'});
      root.innerHTML = styles.map(href=>'<link rel="stylesheet" href="'+href+'">').join('') +
        '<main id="app"><p role="status">그룹을 불러오고 있어요…</p></main><div id="toast" role="status" aria-live="polite"></div>';
      document.getElementById('app').after(host);
      loading = load(host);
    }
    if (active() && tab !== 'group') board?.suspend();
    if (host) host.hidden = tab !== 'group';
    document.documentElement.classList.toggle('world-group-open', active());
    if (entering) { board?.resume(); window.scrollTo(0,0); }
  }
  document.addEventListener('click', event => {
    if (active() && event.target.closest?.('.topbar [data-share-page="groups"]') && board?.invite()) {
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  window.OjjudaGroupTab = Object.freeze({
    sync, clear,
    roomHash() { return board?.roomHash() || ''; },
    async openRoom(id) {
      const element = host;
      await loading;
      if (element === host && active()) await board?.openRoom(id);
    },
    back() { return active() && board?.back() === true; }
  });
})();
