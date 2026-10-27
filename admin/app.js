/* Admin entry only routes World admins. The World and Note RPCs enforce actions. */
(() => {
  'use strict';
  const config = window.OJJUDA_CONFIG;
  const panels = {
    status: document.getElementById('status'),
    auth: document.getElementById('auth-required'),
    forbidden: document.getElementById('no-permission'),
    error: document.getElementById('error')
  };
  let run = 0;

  function show(panel) {
    for (const [key, element] of Object.entries(panels)) element.hidden = key !== panel;
  }

  function destination() {
    const allowed = new Set([
      'overview', 'visitors', 'connections', 'users', 'reports', 'feedback', 'errors', 'note-inquiries', 'note-users', 'words', 'note-actions',
      'settings', 'trash-all', 'trash-accounts', 'trash-cards', 'trash-messages', 'trash-other', 'note', 'referrals', 'activity', 'note-reports', 'photo-stages', 'messages',
      'cards', 'risk', 'map', 'notice', 'spam', 'note-cards', 'note-risk', 'note-map', 'note-settings', 'note-spam'
    ]);
    const aliases = { trash: 'trash-all', archive: 'trash-cards', withdrawn: 'trash-accounts', 'note-archive': 'trash-cards', account: 'overview', payment: 'settings', content: 'cards', world: 'cards', support: 'reports', operations: 'notice',
      events: 'cards', 'note-events': 'cards', posts: 'cards', 'house-content': 'cards', review: 'cards', chats: 'messages', quiz: 'overview' };
    const resolve = value => allowed.has(value) ? value : aliases[value];
    let hash = location.hash.slice(1);
    try { hash = decodeURIComponent(hash); } catch { hash = ''; }
    const tab = resolve(new URLSearchParams(location.search).get('admin')) || resolve(hash) || 'overview';
    const url = new URL('/world.html', location.href);
    url.searchParams.set('admin', tab);
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
    show('status');
    try {
      const { data, error } = await client.auth.getUser();
      if (current !== run) return;
      if (error || !data?.user) { show('auth'); return; }
      const role = await client.from('app_admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (current !== run) return;
      if (role.error) { show('error'); return; }
      if (!role.data) { show('forbidden'); return; }
      location.replace(destination());
    } catch {
      if (current === run) show('error');
    }
  }

  document.getElementById('retry').addEventListener('click', refresh);
  client.auth.onAuthStateChange(() => { setTimeout(refresh, 0); });
  refresh();
})();
