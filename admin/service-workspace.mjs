import { renderCommon, memberActions } from './service-workspace-common.mjs?v=20261124-service1';

const noteTabs = { cards:'cards', risk:'risk', map:'map', notice:'settings', spam:'spam', 'note-users':'users' };

export function mountWorkspace({client, service, tab, owner, getAdminId}) {
  const panel = document.getElementById('admin-panel'), menu = document.getElementById('service-menu');
  const container = document.createElement('section');
  panel.replaceChildren(container);
  const nav = window.OjjudaAdminNavigation, scope = window.OjjudaAdminScope;
  const items = nav.GROUPS.flatMap(group => group.items);
  const requestedArea = new URL(location.href).searchParams.get('area');
  const item = items.find(([area, id]) => id === tab && area === requestedArea) || items.find(([, id]) => id === tab);
  const area = item?.[0] || 'account', navigation = {service, area, tab};
  const dialog = document.getElementById('member-dialog'), modal = document.getElementById('modal-root');
  let alive = true, controller = null, saving = false;
  const current = () => alive && getAdminId() === owner && container.isConnected;
  async function rpc(name, args) {
    if (!current()) throw Error('account_changed');
    const response = await client.rpc(name, args);
    if (response.error) throw response.error;
    return response.data;
  }
  function dirty() {
    return saving || controller?.canLeave?.() === false || controller?.hasDraft?.() || dialog.open
      || window.OjjudaNoteAdmin?.canLeave?.() === false || window.OjjudaNoteAdmin?.hasDraft?.();
  }
  function warnBeforeUnload(event) {
    if (current() && dirty()) { event.preventDefault(); event.returnValue = ''; }
  }
  function showError(error) {
    if (!current()) return;
    const status = document.createElement('p');
    status.setAttribute('role','alert');
    status.textContent = '처리하지 못했어요. 다시 확인해 주세요.';
    container.prepend(status);
    console.warn('Service administration:', error);
  }
  const refresh = () => current() && controller?.refresh?.();
  async function mutate(action) {
    if (!current() || saving) return;
    saving = true;
    try { await action(); if (current()) await refresh(); }
    catch (error) { showError(error); }
    finally { saving = false; }
  }
  function renderModal(html, title) {
    if (!current()) return;
    modal.innerHTML = html; // Owned markup from the identity controller.
    dialog.setAttribute('aria-label', title);
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() {
    dialog.close(); modal.replaceChildren();
  }
  function choose(target, targetArea) {
    if (!scope.allows(service, target)) return;
    const url = new URL('/admin/', location.origin);
    url.searchParams.set('from', service);
    url.searchParams.set('admin', target);
    if (targetArea) url.searchParams.set('area', targetArea);
    location.assign(url.pathname + url.search);
  }
  function click(event) {
    const button = event.target.closest('[data-act]');
    if (!button || !current()) return;
    const {act, area, v, uid, days, name} = button.dataset;
    if (act === 'adm-open') choose(v, area);
    if (act === 'adm-folder') nav.selectFolder(button);
    if (act === 'adm-pin' && nav.togglePin(area, v)) nav.replaceNav(navigation, area + ':' + v);
    if (act === 'close' && dialog.open) closeDialog();
    if (act === 'adm-ban' && window.confirm(name + '님의 이용 제한을 변경할까요?')) {
      void mutate(() => rpc('admin_ban', {target_user:uid, days:Number(days)}));
    }
  }
  const options = {client, container, isCurrent:current, getAdminId, onChanged:() => {}};
  const common = {...options, rpc, mutate, renderModal, owner, service, tab, area, refresh, choose};
  menu.innerHTML = nav.render(navigation);
  document.addEventListener('click', click);
  window.addEventListener('beforeunload', warnBeforeUnload);
  dialog.addEventListener('close', clearModal);
  function clearModal() { modal.replaceChildren(); }
  async function mountPanel() {
    if (Object.hasOwn(noteTabs, tab)) {
      await window.OjjudaNoteAdmin.mount(container, {...options, externalNav:true, initialTab:noteTabs[tab]});
      if (!current()) return null;
      return {refresh:() => window.OjjudaNoteAdmin.refresh(), destroy:() => window.OjjudaNoteAdmin.unmount(),
        hasDraft:() => window.OjjudaNoteAdmin.hasDraft(), canLeave:() => window.OjjudaNoteAdmin.canLeave()};
    }
    if (tab === 'reports' || tab === 'feedback' || tab === 'pajang-questions') {
      const method = {reports:'renderReports', feedback:'renderSupport', 'pajang-questions':'renderPajangQuestionSuggestions'}[tab];
      return window.OjjudaOperations[method]({...options,
        worldActions:{setReport:(id, state) => rpc('admin_set_report', {report_id:id, st:state}),
          deleteContent:(kind, id, user) => rpc('admin_delete_content', {kind, target_id:id, target_user:user}),
          ban:(id, days) => rpc('admin_ban', {target_user:id, days})},
        openNoteCard:(_id, report) => window.OjjudaNoteAdmin.openReportedCard({client, report, onChanged:refresh})});
    }
    if (tab.startsWith('pajang-')) return window.OjjudaAdminPajang.mount({...options, view:tab === 'pajang-chats' ? 'chats' : 'answers'});
    if (tab.startsWith('trash-')) return window.OjjudaAdminTrash.mount({...options, category:tab.slice(6)});
    if (['users','suspended','referrals'].includes(tab)) return window.OjjudaAdminAccounts.mount({...options,
      view:tab === 'users' ? 'members' : tab, renderActions:record => tab === 'suspended' ? '' : memberActions(common, record)});
    if (tab === 'visitors') return window.OjjudaAdminVisitors.mount(options);
    if (tab === 'activity') return window.OjjudaAdminActivity.mount({...options, initialSource:service === 'park' ? 'park' : 'world'});
    if (tab === 'connections') return window.OjjudaConnections.mount(options);
    if (tab === 'assets') return window.OjjudaAdminAssetLibrary.mount({...options, service});
    if (tab === 'rewards') { location.replace('/admin/rewards.html?from=' + service); return null; }
    return renderCommon(common);
  }
  mountPanel().then(result => { if (current()) controller = result; else result?.destroy?.(); }).catch(showError);
  return {destroy() {
    alive = false; controller?.destroy?.(); window.OjjudaNoteAdmin?.close?.();
    window.removeEventListener('beforeunload', warnBeforeUnload);
    document.removeEventListener('click', click);
    dialog.removeEventListener('close', clearModal);
    menu.replaceChildren(); container.replaceChildren();
  }};
}
