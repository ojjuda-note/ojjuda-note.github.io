/* Keep the standalone tour inside the arcade, with a same-origin message bridge. */
(() => {
  'use strict';
  let active = null;
  window.OjjudaTourGame = {
    open({nickname = '', owner = null, client = null, joinCode = '', onScore = null, authorized = () => true} = {}) {
      if (active) { active.dialog.focus(); return; }
      const previous = document.activeElement;
      const wasGaming = document.body.classList.contains('gaming');
      const dialog = document.createElement('dialog');
      dialog.className = 'tour-game-dialog';
      dialog.setAttribute('aria-label', '오쭈다 마블');
      dialog.innerHTML = '<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>오쭈다 마블</span></header><iframe title="오쭈다 마블 · 온라인 또는 같은 기기에서 2~8명" src="/games/ojjuda-tour/index.html?v=20261022-agit1" allow="fullscreen"></iframe>';
      const frame = dialog.querySelector('iframe');
      const results = new Map();
      const invitation = new AbortController();
      const invitedCode = typeof joinCode === 'string' && /^[A-F0-9]{8}$/i.test(joinCode) ? joinCode.toUpperCase() : '';
      let onlineRequests = 0;
      async function invoke(body) {
        const {data,error} = await client.functions.invoke('marble', {body});
        if (error) { try { return await error.context.json(); } catch { return {error:'unavailable'}; } }
        if (data?.ok && body.action === 'create' && data.room?.status === 'waiting') {
          const published = await client.rpc('arcade_publish_marble', {p_room:data.room.id});
          if (published.error || !published.data?.ok) return {error:'unavailable'};
        }
        if (data?.ok && ['create','join','start','leave','surrender'].includes(body.action)) window.dispatchEvent(new Event('ojjuda:arcade-rooms-changed'));
        return data || {error:'unavailable'};
      }
      async function invite(body) {
        if (!window.OjjudaFriendInvites?.available()) return {error:'invites_unavailable'};
        async function prepare() {
          if (invitation.signal.aborted || !authorized()) throw Error('room_unavailable');
          const result = await invoke({action:'read',room_id:body.room_id});
          const room = result.room;
          if (!result.ok || room?.status !== 'waiting' || room.seat !== room.hostSeat) throw Error('room_unavailable');
          if (room.names.length >= room.capacity) throw Error('room_full');
          return {code:room.code};
        }
        try {
          await prepare();
          if (invitation.signal.aborted || !authorized()) return {error:'room_unavailable'};
          const opened = await window.OjjudaFriendInvites.pick({kind:'marble',container:dialog,signal:invitation.signal,prepare,
            onSent:()=>frame.contentWindow.postMessage({source:'ojjuda-world',type:'ojjuda-marble-invite-sent'},location.origin)});
          return opened ? {ok:true} : {error:'invites_unavailable'};
        } catch (error) { return {error:error.message === 'room_full' ? 'room_full' : 'room_unavailable'}; }
      }
      async function online(message) {
        if (typeof message.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(message.requestId) ||
            !message.body || typeof message.body !== 'object' || JSON.stringify(message.body).length > 4096 ||
            !['mine','create','join','read','start','move','surrender','leave','invite'].includes(message.body.action) || onlineRequests >= 4) return;
        onlineRequests++;
        let result = {error:'not_signed_in'};
        try {
          if (client?.functions && owner && authorized()) {
            result = message.body.action === 'invite' ? await invite(message.body) : await invoke(message.body);
          }
        } catch { result = {error:'unavailable'}; }
        finally { onlineRequests--; }
        if (active?.dialog === dialog && authorized()) frame.contentWindow.postMessage({
          source:'ojjuda-world',type:'ojjuda-marble-response',replyTo:message.requestId,result
        },location.origin);
      }
      async function record(message) {
        const {runId, myRank, ranking, players} = message;
        if (message.game !== 'ojjuda-tour' || typeof runId !== 'string' ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId) ||
            !Number.isInteger(players) || players < 2 || players > 8 ||
            !Array.isArray(ranking) || ranking.length !== players ||
            !Number.isInteger(myRank) || myRank < 1 || myRank > players) return;
        const me = ranking[myRank - 1];
        if (!me || me.human !== true || !Number.isSafeInteger(me.assets) || me.assets < 0 ||
            me.assets > 1000000 || typeof me.bankrupt !== 'boolean' || (me.bankrupt && me.assets !== 0)) return;
        if (!authorized()) return;
        window.OjjudaGuestAccess?.finished();
        let pending = results.get(runId);
        if (!pending) {
          pending = Promise.resolve().then(() => authorized() && typeof onScore === 'function'
            ? onScore(me.assets, runId) : {ok:false}).catch(() => ({ok:false}));
          results.set(runId, pending);
        }
        const result = await pending;
        if (!result?.ok) results.delete(runId);
        if (active?.dialog === dialog && authorized()) frame.contentWindow.postMessage({
          source:'ojjuda-world', type:'ojjuda-tour-record', runId, ok:result?.ok === true
        }, location.origin);
      }
      function close() {
        if (active?.dialog !== dialog) return;
        active = null;
        invitation.abort();
        window.removeEventListener('message', receive);
        dialog.close();
        dialog.remove();
        if (!wasGaming) document.body.classList.remove('gaming');
        if (previous?.isConnected) previous.focus({preventScroll:true});
      }
      function receive(event) {
        if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
        const message = event.data;
        if (message?.source !== 'ojjuda-tour' || !authorized()) return;
        if (message.type === 'ojjuda-game-ready') {
          frame.contentWindow.postMessage({source:'ojjuda-world', type:'ojjuda-tour-init',
            nickname:String(nickname).slice(0, 12), owner:owner || 'guest', onlineAvailable:!!(owner && client?.functions),joinCode:invitedCode}, location.origin);
        }
        if (message.type === 'ojjuda-marble-request') void online(message);
        if (message.type === 'ojjuda-game-exit') close();
        // Casual records share the existing unverified, zero-reward score path.
        if (message.type === 'ojjuda-game-result') void record(message);
      }
      active = {dialog, close};
      window.addEventListener('message', receive);
      dialog.querySelector('button').addEventListener('click', close);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      document.body.append(dialog);
      document.body.classList.add('gaming');
      dialog.showModal();
      dialog.querySelector('button').focus({preventScroll:true});
    },
    close() { active?.close(); }
  };
})();
