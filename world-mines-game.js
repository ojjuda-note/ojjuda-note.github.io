/* Minesweeper shares the arcade's existing member/guest rankings. */
(() => {
  'use strict';
  let active = null;
  window.OjjudaMinesGame = {
    open({owner = null, onScore = null, onRanking = null, authorized = () => true} = {}) {
      if (active) { active.dialog.focus(); return; }
      const previous = document.activeElement;
      const wasGaming = document.body.classList.contains('gaming');
      const dialog = document.createElement('dialog');
      dialog.className = 'tour-game-dialog mines-game-dialog';
      dialog.setAttribute('aria-label', '지뢰찾기 · 전체이용');
      dialog.innerHTML = '<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>지뢰찾기 · 전체이용</span></header><iframe title="지뢰찾기" src="/games/mines/index.html?v=20261021-guest1" allow="autoplay; fullscreen"></iframe>';
      const frame = dialog.querySelector('iframe');
      const records = new Map();
      let rankingPending = false, connected = false;
      const current = () => active?.dialog === dialog && authorized();
      function send(message) {
        if (current()) frame.contentWindow.postMessage({source:'ojjuda-world', ...message}, location.origin);
      }
      function initialize() {
        connected = true;
        send({type:'ojjuda-mines-init', owner:owner || 'guest'});
      }
      async function record(message) {
        const {runId, difficulty, seconds, completed} = message;
        const score = window.OjjudaMinesRules.score(difficulty, seconds);
        if (completed !== true || score === null || message.score !== score ||
            typeof runId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId)) return;
        let pending = records.get(runId);
        if (pending && pending.score !== score) return;
        if (!pending) {
          pending = {score, promise:Promise.resolve().then(() => authorized() && typeof onScore === 'function'
            ? onScore(score, runId) : {ok:false}).catch(() => ({ok:false}))};
          records.set(runId, pending);
        }
        const result = await pending.promise;
        if (!result?.ok) records.delete(runId);
        else if (records.size > 100) records.delete(records.keys().next().value);
        send({type:'ojjuda-mines-record', runId, ok:result?.ok === true});
      }
      async function ranking() {
        if (rankingPending) return;
        rankingPending = true;
        try {
          const rows = typeof onRanking === 'function' ? await onRanking() : [];
          send({type:'ojjuda-mines-ranking', rows:Array.isArray(rows) ? rows.slice(0, 5) : []});
        } catch { send({type:'ojjuda-mines-ranking', error:true}); }
        finally { rankingPending = false; }
      }
      function close() {
        if (active?.dialog !== dialog) return;
        active = null;
        window.removeEventListener('message', receive);
        dialog.close(); dialog.remove();
        if (!wasGaming) document.body.classList.remove('gaming');
        if (previous?.isConnected) previous.focus({preventScroll:true});
      }
      function receive(event) {
        if (event.origin !== location.origin || event.source !== frame.contentWindow || !current()) return;
        const message = event.data;
        if (message?.source !== 'ojjuda-mines') return;
        if (message.type === 'ojjuda-game-ready') void initialize();
        if (message.type === 'ojjuda-game-exit') close();
        if (message.type === 'ojjuda-game-finished' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(message.runId || '')) window.OjjudaGuestAccess?.finished();
        if (message.type === 'ojjuda-game-result') void record(message);
        if (message.type === 'ojjuda-game-ranking') void ranking();
      }
      function requestClose() {
        if (!connected || !authorized()) { close(); return; }
        send({type:'ojjuda-mines-exit-request'});
      }
      active = {dialog, close};
      window.addEventListener('message', receive);
      dialog.querySelector('button').addEventListener('click', requestClose);
      dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
      document.body.append(dialog);
      document.body.classList.add('gaming');
      dialog.showModal();
      dialog.querySelector('button').focus({preventScroll:true});
    },
    close() { active?.close(); }
  };
})();
