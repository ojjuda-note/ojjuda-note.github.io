(() => {
  'use strict';
  const host = document.getElementById('organization');
  const state = document.getElementById('load-state');
  const title = document.getElementById('state-title');
  const message = document.getElementById('state-message');
  const retry = document.getElementById('retry');
  const settings = {
    agit: '/world.html?tab=my',
    park: '/world.html?place=park&view=settings',
    pajang: '/features/pajang/station.html?tab=profile'
  };
  const source = new URLSearchParams(location.search).get('from');
  const service = Object.hasOwn(settings, source) ? source : 'agit';
  document.getElementById('settings-back').href = settings[service];
  let chart = null, request = null, generation = 0;

  async function load() {
    const ticket = ++generation;
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    chart?.destroy(); chart = null; host.hidden = true;
    state.hidden = false; retry.hidden = true;
    title.textContent = '조직도를 불러오고 있어요';
    message.textContent = '잠시만 기다려 주세요.';
    try {
      const response = await fetch('organization.json?v=20261120-public-org1', {
        credentials: 'omit', cache: 'no-cache', signal: controller.signal
      });
      if (!response.ok) throw Error('organization_unavailable');
      const payload = await response.json();
      if (ticket !== generation) return;
      chart = window.OjjudaOrganizationChart.mount(host, payload, { publicMode: true });
      host.hidden = false; state.hidden = true;
    } catch {
      if (ticket !== generation) return;
      host.replaceChildren(); host.hidden = true;
      title.textContent = '조직도를 불러오지 못했어요';
      message.textContent = '잠시 후 다시 확인해 주세요.';
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
    }
  }

  retry.addEventListener('click', () => void load());
  window.addEventListener('pagehide', () => { ++generation; request?.abort(); });
  window.addEventListener('pageshow', event => { if (event.persisted) void load(); });
  void load();
})();
