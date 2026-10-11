/* Keep the standalone tour inside the arcade, with a same-origin message bridge. */
(() => {
  'use strict';
  let active = null;
  window.OjjudaTourGame = {
    open({nickname = '', owner = null, onScore = null, authorized = () => true} = {}) {
      if (active) { active.dialog.focus(); return; }
      const previous = document.activeElement;
      const wasGaming = document.body.classList.contains('gaming');
      const dialog = document.createElement('dialog');
      dialog.className = 'tour-game-dialog';
      dialog.setAttribute('aria-label', '오쭈다 투어');
      dialog.innerHTML = '<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>오쭈다 투어</span></header><iframe title="오쭈다 투어 · 같은 기기에서 2~8명" src="/games/ojjuda-tour/index.html?v=20261011-tour4" allow="fullscreen"></iframe>';
      const frame = dialog.querySelector('iframe');
      const results = new Map();
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
            nickname:String(nickname).slice(0, 12), owner:owner || 'guest'}, location.origin);
        }
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
