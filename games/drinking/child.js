(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (!params.has('party')) return;

  const code = (params.get('party') || '').toUpperCase();
  const child = (params.get('room') || '').toUpperCase();
  const kind = location.pathname.split('/')[2];
  const kinds = new Set(['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown']);
  const valid = value => typeof value === 'string' && /^[A-Z0-9]{6}$/.test(value);
  const hub = '/games/drinking/';
  const lobby = valid(code) ? hub + '?room=' + code : hub;
  const header = document.querySelector('header a');
  const view = document.getElementById('view');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.hidden = true;
  document.querySelector('main').append(status);
  header.href = lobby;
  header.textContent = '← 술게임방';
  let client, parent, phase, timer, pending, returning = false, navigating = false, away = false;
  let retryRequest;

  function message(text) {
    status.textContent = text;
    status.hidden = !text;
  }
  function go(url) {
    if (!navigating) {
      navigating = true;
      clearTimeout(timer);
      location.replace(url);
    }
    return false;
  }
  function inviteButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = '술게임방 ' + code + ' · 초대 링크 복사';
    button.addEventListener('click', async () => {
      const url = new URL(lobby, location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        message('술게임방 초대 링크를 복사했어요.');
      } catch {
        message(url);
      }
    });
    header.replaceWith(button);
  }
  function reconcile(state) {
    if (navigating || away) return false;
    if (!state || state.code !== code || !Number.isInteger(state.me) || state.me < 0 ||
        !Number.isInteger(state.revision) || !Array.isArray(state.players) || state.me >= state.players.length) {
      throw Error('술게임방 정보를 다시 확인해 주세요.');
    }
    if (parent && state.revision < parent.revision) return true;
    if (state.phase === 'lobby') return go(lobby);
    if (state.phase !== 'playing' || !kinds.has(state.kind) || !valid(state.child)) {
      throw Error('술게임방의 게임 정보를 확인할 수 없어요.');
    }
    if (state.kind !== kind || state.child !== child) {
      return go('/games/' + state.kind + '/?room=' + state.child + '&party=' + code);
    }
    if (!parent) inviteButton();
    parent = state;
    return true;
  }
  async function rpc(action, options = {}) {
    const {data, error} = await client.rpc('drinking_room', {
      p_action: action, p_code: code, p_options: options
    }).abortSignal(AbortSignal.timeout(12000));
    const failure = error?.message || data?.error;
    if (failure === 'room_unavailable') return go(hub);
    if (failure === 'not_room_member' || failure === 'not_signed_in') return go(lobby);
    if (failure) {
      const err = Error(failure === 'stale_state' ? '방 상태가 바뀌었어요. 다시 확인하고 있어요.' : '술게임방에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
      err.code = failure;
      throw err;
    }
    return reconcile(data);
  }
  function schedule() {
    clearTimeout(timer);
    if (!away && !navigating && parent && !document.hidden) timer = setTimeout(refresh, 1600);
  }
  function refresh() {
    if (!client || away || navigating || returning || document.hidden) return;
    if (pending) return pending;
    clearTimeout(timer);
    pending = rpc('state').catch(err => {
      message(err.message);
      return false;
    }).finally(() => { pending = null; schedule(); });
    return pending;
  }
  async function connect(authClient) {
    client = authClient;
    if (!valid(code) || !kinds.has(kind)) return go(hub);
    if (!valid(child)) return go(lobby);
    const matched = await rpc('state');
    schedule();
    return matched;
  }
  function control(action) {
    if (action === 'again' || action === 'copy') return '';
    if (action !== 'leave') return null;
    if (parent?.me === 0) return '<button type="button" class="secondary" data-party-return>모두 대기실로</button>';
    return phase === 'done' ? '<p data-party-wait>방장이 다음 게임을 고를 때까지 기다려 주세요.</p>' : '';
  }
  async function back(button) {
    if (!parent || parent.me !== 0 || returning || navigating) return;
    if (phase !== 'done' && !window.confirm('지금 게임을 마치고 모두 함께 대기실로 돌아갈까요?')) return;
    returning = true;
    button.disabled = true;
    clearTimeout(timer);
    const revision = parent.revision;
    if (retryRequest?.revision !== revision) retryRequest = {revision, request_id: crypto.randomUUID()};
    try {
      await rpc('return', retryRequest);
    } catch (err) {
      message(err.message);
    } finally {
      returning = false;
      button.disabled = false;
      if (!navigating) void refresh();
    }
  }
  function missing() {
    view.innerHTML = '<section class="card"><p>술게임방에서 현재 게임을 확인하고 있어요.</p>' +
      '<button type="button" class="secondary" data-do="retry">다시 연결</button>' +
      (parent?.me === 0 ? control('leave') : '') + '</section>';
    void refresh();
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-party-return]');
    if (button) void back(button);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else void refresh();
  });
  window.addEventListener('focus', () => { if (parent) void refresh(); });
  window.addEventListener('pagehide', () => { away = true; clearTimeout(timer); });
  window.addEventListener('pageshow', e => {
    away = false;
    if (e.persisted) navigating = false;
    if (parent) void refresh();
  });
  window.DrinkingChild = {code, connect, control, missing, signedOut: () => go(lobby), setPhase: next => { phase = next; }};
})();
