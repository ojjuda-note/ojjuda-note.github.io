/* The parent retains authentication; roulette RPCs validate membership on the server. */
(() => {
  'use strict';
  let active = null, opening = 0;
  const actions = new Set(['status', 'list', 'mine', 'create', 'join', 'read', 'bet', 'ready', 'start', 'confirm', 'leave']);

  window.OjjudaRouletteBridge = {
    async open({owner = null, client = null, authorized = () => true, joinCode = null, onCoins = () => {}, onError = () => {}} = {}) {
      if (active) { active.dialog.focus(); return; }
      const request = ++opening, access = window.OjjudaMatgoAccess;
      try {
        const identity = await access?.check();
        if (!identity || identity.userId !== owner || !authorized()) return;
        if (!Number.isInteger(identity.age) || identity.age < 19) {
          onError('룰렛은 만 19세 이상 회원만 이용할 수 있어요.'); return;
        }
      } catch (error) {
        onError((error?.message || '나이를 확인하지 못했어요.').replaceAll('맞고', '룰렛')); return;
      }
      if (request !== opening || !authorized()) return;
      const service = client || access.getClient();
      const previous = document.activeElement, wasGaming = document.body.classList.contains('gaming');
      const dialog = document.createElement('dialog');
      dialog.className = 'roulette-game-dialog';
      dialog.setAttribute('aria-label', '룰렛 멀티게임');
      dialog.innerHTML = '<header><button type="button">← 게임 목록</button><span>룰렛</span></header><iframe title="룰렛 멀티게임" src="/games/roulette/index.html?v=20261031-roulette-multi2" allow="autoplay"></iframe>';
      const frame = dialog.querySelector('iframe');
      let connected = false, unsubscribe = null, inflight = 0, lastResult = '', exitTimer = null;
      const pendingIds = new Set();
      const send = type => frame.contentWindow?.postMessage({source: 'ojjuda-world', type, owner, joinCode}, location.origin);
      function dispose() {
        if (active?.dialog !== dialog) return;
        active = null; unsubscribe?.(); clearInterval(authTimer); clearTimeout(exitTimer);
        window.removeEventListener('message', receive); dialog.close(); dialog.remove();
        if (!wasGaming) document.body.classList.remove('gaming');
        if (previous?.isConnected) previous.focus({preventScroll: true});
      }
      function close() { return session.close(); }
      async function invoke(body) {
        const {action, ...payload} = body;
        const {data, error} = await service.rpc('roulette_action', {p_action: action, p_payload: payload});
        if (error) return {ok: false, error: error.message || 'unavailable'};
        if (!data?.ok) return data || {ok: false, error: 'unavailable'};
        if (active?.dialog === dialog && authorized()) {
          if (Number.isSafeInteger(data.wallet?.coins) && data.wallet.coins >= 0) onCoins(data.wallet.coins);
          if (['create', 'join', 'leave', 'ready', 'start', 'confirm'].includes(action)) {
            window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));
          }
          const result = data.room?.result && data.room?.spin?.id;
          if ((result && result !== lastResult) || action === 'confirm') {
            lastResult = result || lastResult;
            window.dispatchEvent(new CustomEvent('ojjuda:game-record-saved', {detail: {owner, game: 'roulette'}}));
          }
        }
        return data;
      }
      function respond(id, data, error = null) {
        if (active?.dialog === dialog && authorized()) {
          frame.contentWindow?.postMessage({source: 'ojjuda-world', type: 'roulette-rpc', id, data, error}, location.origin);
        }
      }
      async function receive(event) {
        if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'ojjuda-roulette') return;
        if (!authorized() || !access.visible(19)) { close(); return; }
        if (event.data.type === 'ready') { connected = true; void session.enter(() => send('roulette-init')); return; }
        if (event.data.type === 'exit') { void close(); return; }
        if (event.data.type !== 'rpc') return;
        const {id, body} = event.data;
        if (typeof id !== 'string' || id.length > 64 || !body || typeof body !== 'object' || !actions.has(body.action) || pendingIds.has(id)) return;
        if (inflight >= 4) { respond(id, null, 'busy'); return; }
        pendingIds.add(id); inflight++;
        try {
          await session.run(async () => {
            try {
              const data = await invoke(body);
              respond(id, data?.ok ? data : null, data?.ok ? null : data?.error || 'unavailable');
            } catch (_) { respond(id, null, 'unavailable'); }
          });
        } finally { pendingIds.delete(id); inflight--; }
      }
      function requestClose() {
        if (connected && authorized()) {
          send('roulette-exit-request');
          clearTimeout(exitTimer);
          // A stalled child must not trap a player; the parent still drains and
          // settles accepted server requests before removing the frame.
          exitTimer = setTimeout(() => { if (active?.dialog === dialog) void close(); }, 1500);
        } else void close();
      }
      const session = window.OjjudaGameSession.create({
        kind: 'roulette', dialog, frame,
        authorized: () => active?.dialog === dialog && authorized() && access.visible(19),
        available: () => !!owner, invoke, dispose,
        keepCode: typeof joinCode === 'string' && /^[A-F0-9]{8}$/i.test(joinCode) ? joinCode : ''
      });
      const authTimer = setInterval(() => { if (!authorized() || !access.visible(19)) void close(); }, 1000);
      unsubscribe = access.subscribe(close);
      active = {dialog, close};
      window.addEventListener('message', receive);
      dialog.querySelector('button').addEventListener('click', requestClose);
      dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
      document.body.append(dialog); document.body.classList.add('gaming'); dialog.showModal();
    },
    close() { opening++; return active?.close() ?? true; }
  };
})();
