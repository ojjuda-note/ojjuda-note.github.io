(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  // Direct invitations use a native game room without a shared lobby.
  window.DrinkingStandaloneExit = {
    confirm(s) {
      const playing = s.phase !== 'waiting' && s.phase !== 'done';
      if (s.me === 0 && s.players.length > 1) {
        const prompt = playing ? '이번 판을 끝내고 방에서 나갈까요?' : '방에서 나갈까요?';
        return window.confirm(prompt + ' 남은 사람 중 한 명이 무작위로 방장을 맡고 같은 방에서 기다려요.');
      }
      if (s.me === 0) return window.confirm('마지막 참가자예요. 나가면 방이 닫혀요. 나갈까요?');
      if (s.phase !== 'waiting') return window.confirm('나가면 이 방이 모든 참가자에게서 닫혀요. 나갈까요?');
      return true;
    },
    options(s) { return {round:s.round, waiting:s.phase==='waiting', host:s.me===0}; }
  };
  const code = (params.get('party') || '').toUpperCase();
  const child = (params.get('room') || '').toUpperCase();
  const kind = location.pathname.split('/')[2];
  const kinds = new Set(['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown']);
  const valid = value => typeof value === 'string' && /^[A-Z0-9]{6}$/.test(value);
  const hub = '/games/drinking/';
  const roomList = hub + '?mode=multi';
  const lobby = valid(code) ? hub + '?room=' + code : hub;
  const header = document.querySelector('header a');
  const mainLink = params.has('party') ? document.createElement('a') : header;
  mainLink.className = 'drinks-home';
  mainLink.textContent = '← 술게임 메인';
  function mainDestination() {
    if (valid(code)) return hub+'?resume='+code;
    const direct = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    return valid(direct) && kinds.has(kind) ? hub+'?resume='+direct+'&gameFrom='+kind : hub;
  }
  mainLink.href = mainDestination();
  if(mainLink!==header)header.before(mainLink);
  header.parentElement.classList.add('drinks-room-header');
  mainLink.addEventListener('click', e => {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    mainLink.href = mainDestination();
    if (params.has('party')) {
      navigating = true;
      connection.pause();
      clearTimeout(timer);
    }
  });
  if (!params.has('party')) return;

  const view = document.getElementById('view');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.hidden = true;
  document.querySelector('main').append(status);
  header.href = lobby;
  header.textContent = '← 술게임방';
  let client, parent, phase, timer, pending, returning = false, navigating = false;
  let retryRequest, pollNotice = false;
  const connection = window.OjjudaRoomConnection.create({
    onPause: () => clearTimeout(timer),
    onResume: () => { if(client && !navigating)void refresh(); }
  });

  function message(text, fromPoll = false) {
    pollNotice = fromPoll;
    status.textContent = text;
    status.hidden = !text;
  }
  function go(url) {
    if (!navigating) {
      navigating = true;
      connection.pause();
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
    if (navigating || !connection.active()) return false;
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
    let result;
    try {
      result = await connection.request(signal => client.rpc('drinking_room', {
        p_action: action, p_code: code, p_options: options
      }).abortSignal(signal), {read:action==='state'});
    } catch(err) {
      if(!connection.cancelled(err))connection.failed();
      throw err;
    }
    const {data, error} = result;
    const failure = error?.message || data?.error;
    if (failure === 'room_unavailable') return go(retryRequest?.action === 'leave' ? roomList : hub);
    if (failure === 'not_room_member') return go(retryRequest?.action === 'leave' ? roomList : lobby);
    if (failure === 'not_signed_in') return go(lobby);
    if (failure) {
      if (['stale_state','host_only'].includes(failure)) connection.succeeded();
      else connection.failed();
      const err = Error(failure === 'stale_state' ? '방 상태가 바뀌었어요. 다시 눌러 주세요.' :
        failure === 'host_only' ? '방장만 모두를 대기실로 이동시킬 수 있어요.' :
        '술게임방에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
      err.code = failure;
      throw err;
    }
    connection.succeeded();
    if (action === 'leave') {
      if (data?.left !== true) throw Error('나간 상태를 확인할 수 없어요. 다시 눌러 주세요.');
      return go(roomList);
    }
    return reconcile(data);
  }
  function schedule() {
    clearTimeout(timer);
    if (!navigating && !returning && parent && connection.active()) timer = setTimeout(refresh, connection.delay(1600));
  }
  function refresh() {
    if (!client || navigating || returning || !connection.active()) return Promise.resolve(false);
    if (pending) return pending;
    clearTimeout(timer);
    pending = rpc('state').then(matched => {
      if (matched && pollNotice) message('');
      return matched;
    }).catch(err => {
      if (!connection.cancelled(err)) message(err.message, true);
      return false;
    }).finally(() => { pending = null; schedule(); });
    return pending;
  }
  async function connect(authClient) {
    client = authClient;
    if (!valid(code) || !kinds.has(kind)) return go(hub);
    if (!valid(child)) return go(lobby);
    const matched = await refresh();
    if(!matched && !navigating){
      if(!connection.active())throw Object.assign(Error('연결 확인을 잠시 멈췄어요.'),{code:'superseded'});
      throw Error('술게임방 연결을 다시 확인하고 있어요.');
    }
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
    if (!parent || returning || navigating || !connection.active()) return;
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
    connection.cancelReads();
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
      if(!connection.cancelled(err))message(err.message);
    } finally {
      returning = false;
      button.disabled = false;
      if (!navigating) void refresh();
    }
  }
  function missing() {
    if(returning || navigating || !connection.active())return;
    view.innerHTML = '<section class="card"><p>술게임방에서 현재 게임을 확인하고 있어요.</p>' +
      '<button type="button" class="secondary" data-do="retry">다시 연결</button>' +
      control('leave') + '</section>';
    void refresh();
  }
  document.addEventListener('click', e => {
    const button = e.target.closest('[data-party-return],[data-party-leave]');
    if (button) void leaveOrReturn(button);
  });
  window.addEventListener('pageshow', e => {
    if (e.persisted) navigating = false;
  });
  window.DrinkingChild = {code, connect, control, missing, signedOut: () => go(lobby), setPhase: next => { phase = next; }};
})();
