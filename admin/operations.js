(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const host = $('organization'), state = $('load-state'), retry = $('retry'), login = $('login-link');
  const from = new URLSearchParams(location.search).get('from');
  const service = ['agit', 'park', 'pajang'].includes(from) ? from : 'agit';
  $('admin-back').href = '/admin/?from=' + encodeURIComponent(service);
  if (service !== 'agit') {
    document.querySelector('.brand').href = $('admin-back').href;
    login.href = '/?auth=login&next=' + (service === 'park' ? 'note' : 'pajang');
  }
  const config = window.OJJUDA_CONFIG;
  let run = 0, activeOwner = null, chart = null, refreshTimer = 0;
  function clear() {
    chart?.destroy(); chart = null; activeOwner = null; host.replaceChildren(); host.hidden = true;
  }
  function show(kind) {
    const copy = {
      loading: ['조직도를 불러오고 있어요', '운영 권한을 확인하고 있어요.'],
      auth: ['로그인이 필요해요', '관리자 계정으로 로그인한 뒤 다시 열어 주세요.'],
      forbidden: ['관리자만 볼 수 있어요', '운영 권한이 있는 계정에서 이용해 주세요.'],
      empty: ['아직 등록된 조직도가 없어요', '조직 정보가 등록되면 이곳에서 확인할 수 있어요.'],
      error: ['조직도를 불러오지 못했어요', '잠시 후 다시 확인해 주세요.']
    }[kind];
    state.hidden = false; $('state-title').textContent = copy[0]; $('state-message').textContent = copy[1];
    retry.hidden = !['error', 'empty'].includes(kind); login.hidden = !['auth', 'forbidden'].includes(kind);
    login.textContent = kind === 'forbidden' ? '대문으로 가기' : '대문에서 로그인';
  }
  if (!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient || !window.OjjudaOrganizationChart) {
    show('error'); retry.onclick = () => location.reload(); return;
  }
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
  async function refresh() {
    const ticket = ++run; clear(); show('loading');
    try {
      const account = await client.auth.getUser();
      if (ticket !== run) return;
      if (account.error && (account.error.status >= 500 || account.error.status === 429 || account.error.name === 'AuthRetryableFetchError')) { show('error'); return; }
      if (account.error || !account.data?.user) { show('auth'); return; }
      const owner = account.data.user.id;
      const result = await client.rpc('admin_organization_read');
      if (ticket !== run) return;
      if (result.error) {
        const denied = result.error.code === '42501' || /not_admin|permission denied|administrator required/.test(String(result.error.message));
        show(denied ? 'forbidden' : result.error.code === 'P0002' ? 'empty' : 'error'); return;
      }
      if (!result.data?.organization?.headquarters?.length) { show('empty'); return; }
      chart = window.OjjudaOrganizationChart.mount(host, result.data);
      activeOwner = owner; host.hidden = false; state.hidden = true;
    } catch {
      if (ticket === run) { clear(); show('error'); }
    }
  }
  retry.addEventListener('click', () => void refresh());
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'TOKEN_REFRESHED' && activeOwner === session?.user?.id) return;
    ++run; clear(); show(session?.user ? 'loading' : 'auth');
    // Do not call Supabase methods inside its synchronous auth callback.
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refresh(), 0);
  });
  // A restored page must re-check its current account before revealing cached DOM.
  window.addEventListener('pagehide', () => { ++run; clear(); clearTimeout(refreshTimer); });
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  void refresh();
})();
