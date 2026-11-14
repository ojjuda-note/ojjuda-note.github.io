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
  const roomList = hub + '?mode=multi';
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
  let retryRequest, pollNotice = false;

  function message(text, fromPoll = false) {
    pollNotice = fromPoll;
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
    if (failure === 'room_unavailable') return go(retryRequest?.action === 'leave' ? roomList : hub);
    if (failure === 'not_room_member') return go(retryRequest?.action === 'leave' ? roomList : lobby);
    if (failure === 'not_signed_in') return go(lobby);
    if (failure) {
      const err = Error(failure === 'stale_state' ? '방 상태가 바뀌었어요. 다시 눌러 주세요.' :
        failure === 'host_only' ? '방장만 모두를 대기실로 이동시킬 수 있어요.' :
        '술게임방에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
      err.code = failure;
      throw err;
    }
    if (action === 'leave') {
      if (data?.left !== true) throw Error('나간 상태를 확인할 수 없어요. 다시 눌러 주세요.');
      return go(roomList);
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
    pending = rpc('state').then(matched => {
      if (matched && pollNotice) message('');
      return matched;
    }).catch(err => {
      message(err.message, true);
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
    if (!parent) return '';
    const leave = '<button type="button" class="secondary" data-party-leave>술게임방 나가기</button>';
    if (parent.me === 0) return '<button type="button" class="secondary" data-party-return>모두 대기실로</button>' + leave;
    return (phase === 'done' ? '<p data-party-wait>방장이 다음 게임을 고르고 있어요.</p>' : '') + leave;
  }
  async function leaveOrReturn(button) {
    if (!parent || returning || navigating) return;
    const leaving = button.hasAttribute('data-party-leave');
    if (!leaving && parent.me !== 0) return;
    if (leaving) {
      let prompt = '술게임방에서 나갈까요?';
      if (parent.players.length === 1) {
        prompt += ' 마지막 참가자가 나가면 방이 닫혀요.';
      } else {
        prompt += phase === 'done' ? ' 남은 사람들은 대기실로 돌아가요.' : ' 이번 판은 끝나고 남은 사람들은 대기실로 돌아가요.';
        if (parent.me === 0) prompt += ' 남은 참가자 중 한 명이 무작위로 새 방장이 돼요.';
      }
      if (!window.confirm(prompt)) return;
    } else if (phase !== 'done' && !window.confirm('지금 게임을 마치고 모두 함께 대기실로 돌아갈까요?')) return;
    const action = leaving ? 'leave' : 'return';
    returning = true;
    button.disabled = true;
    message('');
    clearTimeout(timer);
    const revision = parent.revision;
    if (retryRequest?.action !== action || retryRequest.options.revision !== revision) {
      retryRequest = {action,options:{revision,request_id:crypto.randomUUID()}};
    }
    try {
      await rpc(action, retryRequest.options);
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
      control('leave') + '</section>';
    void refresh();
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-party-return],[data-party-leave]');
    if (button) void leaveOrReturn(button);
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
