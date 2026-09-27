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
    const allowed = new Set(['overview', 'users', 'reports', 'posts', 'chats', 'feedback', 'errors', 'quiz', 'shop', 'words', 'settings', 'note']);
    const aliases = { account: 'users', payment: 'settings', world: 'overview', note: 'note' };
    const requested = new URLSearchParams(location.search).get('admin');
    const fromHash = aliases[decodeURIComponent(location.hash.slice(1))];
    const tab = allowed.has(requested) ? requested : (fromHash || 'overview');
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
