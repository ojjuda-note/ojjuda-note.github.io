/* The growing-star game shares the arcade's existing member/guest rankings. */
(() => {
  'use strict';
  let active = null;
  window.OjjudaSaetbyeolGame = {
    open({owner = null, client = null, onScore = null, onRanking = null, authorized = () => true} = {}) {
      if (active) { active.dialog.focus(); return; }
      const previous = document.activeElement;
      const wasGaming = document.body.classList.contains('gaming');
      const dialog = document.createElement('dialog');
      dialog.className = 'tour-game-dialog saetbyeol-game-dialog';
      dialog.setAttribute('aria-label', '샛별키우기 · 전체이용');
      dialog.innerHTML = '<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>샛별키우기 · 전체이용</span></header><iframe title="샛별키우기" src="/games/bulssi/index.html?v=20261013-rewards1" allow="autoplay; fullscreen"></iframe>';
      const frame = dialog.querySelector('iframe');
      const records = new Map();
      let rankingPending = false, connected = false, initializing = false;
      const current = () => active?.dialog === dialog && authorized();
      function send(message) {
        if (current()) frame.contentWindow.postMessage({source:'ojjuda-world', ...message}, location.origin);
      }
      async function initialize() {
        if (initializing) return;
        initializing = true;
        let admin = false;
        if (owner && client?.from) {
          try {
            const {data,error} = await client.from('app_admins').select('user_id').eq('user_id', owner).maybeSingle().abortSignal(AbortSignal.timeout(8000));
            admin = !error && data?.user_id === owner;
          } catch {}
        }
        connected = true;
        send({type:'ojjuda-saetbyeol-init', owner:owner || 'guest', admin});
      }
      async function record(message) {
        const {runId, score, demo} = message;
        if (demo !== false || !Number.isSafeInteger(score) || score < 0 || score > 60000 ||
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
        send({type:'ojjuda-saetbyeol-record', runId, ok:result?.ok === true});
      }
      async function ranking() {
        if (rankingPending) return;
        rankingPending = true;
        try {
          const rows = typeof onRanking === 'function' ? await onRanking() : [];
          send({type:'ojjuda-saetbyeol-ranking', rows:Array.isArray(rows) ? rows.slice(0, 5) : []});
        } catch { send({type:'ojjuda-saetbyeol-ranking', error:true}); }
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
        if (message?.source !== 'ojjuda-saetbyeol') return;
        if (message.type === 'ojjuda-game-ready') void initialize();
        if (message.type === 'ojjuda-game-exit') close();
        if (message.type === 'ojjuda-game-result') void record(message);
        if (message.type === 'ojjuda-game-ranking') void ranking();
      }
      function requestClose() {
        if (!connected || !authorized()) { close(); return; }
        send({type:'ojjuda-saetbyeol-exit-request'});
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
