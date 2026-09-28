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
      'overview', 'users', 'reports', 'feedback', 'errors', 'note-inquiries', 'note-users', 'words', 'note-actions',
      'shop', 'settings', 'posts', 'chats', 'archive', 'quiz', 'note'
    ]);
    const aliases = { account: 'overview', payment: 'shop', world: 'posts' };
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
