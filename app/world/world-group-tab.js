// Keep the Agit document and its session alive while visiting Groups.
(() => {
  'use strict';
  let frame, owner, selectTab;
  const owns = source => !!frame && source === frame.contentWindow;
  const active = () => !!frame && !frame.hidden;
  function sync(tab, account, select) {
    const shell = document.getElementById('app');
    if (frame && owner !== account) { frame.remove(); frame = null; }
    selectTab = select;
    if (tab === 'group' && !frame) {
      owner = account;
      frame = document.createElement('iframe');
      frame.id = 'world-group-tab';
      frame.title = '그룹';
      frame.allow = 'web-share';
      frame.src = '/groups/?view=agit';
      document.body.appendChild(frame);
    }
    if (frame) frame.hidden = tab !== 'group';
    shell.inert = active();
    document.documentElement.classList.toggle('world-group-open', active());
  }
  window.OjjudaGroupTab = Object.freeze({
    sync, owns,
    select(source, tab) {
      if (!owns(source) || !active() || !['hub','group','arcade','my'].includes(tab)) return false;
      if (tab !== 'group') selectTab(tab);
      return true;
    },
    back() {
      return active() && frame.contentWindow.OjjudaGroupView?.back() === true;
    }
  });
})();
