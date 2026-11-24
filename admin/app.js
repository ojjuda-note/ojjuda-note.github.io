/* Verify the shared administrator role before opening the selected service. */
(() => {
  'use strict';
  const config = window.OJJUDA_CONFIG;
  const panels = {
    status: document.getElementById('status'),
    auth: document.getElementById('auth-required'),
    forbidden: document.getElementById('no-permission'),
    error: document.getElementById('error')
  };
  const query = new URLSearchParams(location.search);
  const source = query.get('from');
  const local = source === 'park' || source === 'pajang';
  const returnPath = source === 'park' ? '/park/?view=settings' : '/features/pajang/station.html?tab=profile';
  const serviceName = source === 'park' ? '공원' : '파장';
  const workspace = document.getElementById('workspace');
  let run = 0, activeOwner = null, activePanel = null;
  if (local) {
    document.title = serviceName + ' 관리자모드 | 오쭈다';
    document.querySelector('main h1').textContent = serviceName + ' 관리자모드';
    const brand = document.querySelector('.brand');
    brand.href = returnPath; brand.lastChild.textContent = '오쭈다 ' + serviceName;
    brand.setAttribute('aria-label', serviceName + '으로 돌아가기');
    document.getElementById('service-links').replaceChildren();
    const back = document.createElement('a');
    back.href = returnPath; back.textContent = serviceName + ' 설정으로 돌아가기';
    document.getElementById('service-links').append(back);
    for (const link of document.querySelectorAll('.box a')) {
      link.href = returnPath; link.textContent = serviceName + ' 설정으로 돌아가기';
    }
    document.getElementById('no-permission').querySelector('p').textContent = '운영 권한이 있는 계정에서 사용할 수 있어요.';
  }
  function clearWorkspace() {
    activeOwner = null;
    activePanel?.destroy(); activePanel = null;
    workspace.hidden = true;
    document.getElementById('admin-panel').replaceChildren();
    document.getElementById('modal-root').replaceChildren();
    document.getElementById('member-dialog').close?.();
  }

  function show(panel) {
    for (const [key, element] of Object.entries(panels)) element.hidden = key !== panel;
  }

  function destination() {
    const allowed = new Set([
      'overview', 'visitors', 'connections', 'organization', 'users', 'suspended', 'reports', 'feedback', 'errors', 'note-inquiries', 'note-users', 'words', 'note-actions',
      'settings', 'fortune-purchases', 'trash-all', 'trash-accounts', 'trash-cards', 'trash-messages', 'trash-other', 'note', 'referrals', 'activity', 'note-reports', 'photo-stages', 'drinking-prompts', 'messages', 'groups',
      'cards', 'risk', 'map', 'notice', 'spam', 'assets', 'pajang-answers', 'pajang-questions', 'pajang-chats', 'note-cards', 'note-risk', 'note-map', 'note-settings', 'note-spam'
    ]);
    const aliases = { __proto__: null, trash: 'trash-all', archive: 'trash-cards', withdrawn: 'trash-accounts', 'note-archive': 'trash-cards', account: 'overview', payment: 'settings', content: 'cards', world: 'cards', support: 'reports', operations: 'notice',
      events: 'cards', 'note-events': 'cards', posts: 'cards', 'house-content': 'cards', review: 'cards', chats: 'messages', quiz: 'overview' };
    const resolve = value => allowed.has(value) ? value : aliases[value];
    let hash = location.hash.slice(1);
    try { hash = decodeURIComponent(hash); } catch { hash = ''; }
    const tab = resolve(new URLSearchParams(location.search).get('admin')) || resolve(hash) || 'overview';
    const url = new URL(tab === 'organization' ? '/admin/operations.html' : '/world.html', location.href);
    if (tab !== 'organization') url.searchParams.set('admin', tab);
    const from = new URLSearchParams(location.search).get('from');
    const service = window.OjjudaAdminScope?.resolve(from || (tab === 'note' || tab.startsWith('note-') ? 'park' : null), tab);
    if (service) url.searchParams.set('from', service);
    return url.href;
  }

  if (!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient) {
    show('error');
    document.getElementById('retry').onclick = () => location.reload();
    return;
  }
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);

  async function refresh() {
    const current = ++run;
    if (!activeOwner) show('status');
    try {
      const { data, error } = await client.auth.getUser();
      if (current !== run) return;
      if (activeOwner && activeOwner !== data?.user?.id) clearWorkspace();
      if (error && (error.status >= 500 || error.status === 429 || error.name === 'AuthRetryableFetchError')) {
        if (local) clearWorkspace(); show('error'); return;
      }
      if (error || !data?.user) { if (local) clearWorkspace(); show('auth'); return; }
      const role = await client.from('app_admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (current !== run) return;
      if (role.error) { if (local) clearWorkspace(); show('error'); return; }
      if (role.data?.user_id !== data.user.id) { if (local) clearWorkspace(); show('forbidden'); return; }
      if (!local) { location.replace(destination()); return; }
      if (activeOwner === data.user.id && activePanel) return;
      const target = new URL(destination()), scope = window.OjjudaAdminScope;
      const home = scope.services[source].home;
      const requested = query.has('admin') || location.hash ? target.searchParams.get('admin') : home;
      if (target.pathname === '/admin/operations.html') { location.replace(target.href); return; }
      const aliases = {note:'cards', 'note-users':'note-users', 'note-settings':'notice', 'note-archive':'trash-cards', 'note-inquiries':'feedback', 'note-reports':'reports', 'note-actions':'activity'};
      const candidate = Object.hasOwn(aliases, requested) ? aliases[requested] : requested?.replace(/^note-/, '');
      const tab = scope.allows(source, candidate) ? candidate : home;
      const module = await window.OjjudaAdminAssets.loadWorkspace();
      if (current !== run) return;
      activeOwner = data.user.id;
      show(null); workspace.hidden = false;
      document.body.classList.add('world-redesign', 'service-admin');
      activePanel = module.mountWorkspace({ client, service: source, tab, owner: activeOwner, getAdminId: () => activeOwner });
    } catch {
      if (current === run) { if (local) clearWorkspace(); show('error'); }
    }
  }

  document.getElementById('retry').addEventListener('click', refresh);
  client.auth.onAuthStateChange((event, session) => {
    // The explicit startup refresh already covers INITIAL_SESSION.
    if (event === 'INITIAL_SESSION') return;
    if (activeOwner && session?.user?.id !== activeOwner) clearWorkspace();
    const eventRun = ++run;
    setTimeout(() => { if (eventRun === run) return refresh(); }, 0);
  });
  refresh();
})();

