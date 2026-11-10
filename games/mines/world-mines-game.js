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
      dialog.className = 'tour-game-dialog mines-game-dialog arcade-game-view';
      dialog.setAttribute('aria-label', '지뢰찾기 · 전체이용');
     dialog.innerHTML = '<header class="tour-game-header"><button type="button" aria-label="아지트로 돌아가기">← 아지트</button><span>지뢰찾기 · 전체이용</span></header><iframe title="지뢰찾기" src="/games/mines/index.html?v=20261110-navigation-return1" allow="autoplay; fullscreen; web-share; clipboard-write"></iframe>';
      const frame = dialog.querySelector('iframe');
      const records = new Map(), baselines = new Map();
      let leaderFlight = null;
      let rankingPending = false, connected = false, guestFinished = false;
      const current = () => active?.dialog === dialog && authorized();
      function send(message) {
        if (current()) frame.contentWindow.postMessage({source:'ojjuda-world', ...message}, location.origin);
      }
      function initialize() {
        connected = true;
        send({type:'ojjuda-mines-init', owner:owner || 'guest'});
      }
      const validRun = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
      const rankingMonth=()=>new Date(Date.now()+8*60*60*1000).toISOString().slice(0,7);
      function readLeader() {
        if(leaderFlight)return leaderFlight;
        let timeout;
        const query=Promise.resolve().then(async()=>{
          if(!current()||typeof onRanking!=='function')return null;
          const month=rankingMonth(),rows=await onRanking();
          if(month!==rankingMonth()||!Array.isArray(rows)||!rows.length)return null;
          const score=Number(rows[0].score),record=window.OjjudaMinesRules.record(score);
          return record?{score,record,month,me:rows[0].me===true}:null;
        }).catch(()=>null);
        leaderFlight=Promise.race([query,new Promise(resolve=>{timeout=setTimeout(()=>resolve(null),3000);})]).finally(()=>{clearTimeout(timeout);leaderFlight=null;});
        return leaderFlight;
      }
      function startComparison(runId,difficulty) {
        if(window.OjjudaAdminPreview?.isEnabled?.()===true)return;
        if(!validRun(runId)||!Number.isInteger(difficulty)||difficulty<0||difficulty>7)return;
        if(!baselines.has(runId))baselines.set(runId,{difficulty,leader:readLeader()});
        if(baselines.size>40)baselines.delete(baselines.keys().next().value);
      }
      function comparison(before,after,difficulty,seconds,score) {
        // The encoded ranking caps at 10,000 seconds, so it cannot prove an
        // exact time difference at that boundary.
        if(!before||!after||before.month!==after.month||before.record.difficulty!==difficulty||after.record.difficulty!==difficulty||before.record.seconds>=10000||after.record.seconds>=10000||seconds>=10000)return null;
        if(score>before.score&&after.score===score&&after.me)return {outcome:'record',encouragement:'월간 1등 기록을 넘었어요!'};
        const difference=seconds-after.record.seconds;
        if(difference>0)return {outcome:'success',encouragement:`1등 기록까지 ${difference}초 · 조금만 더 빠르게!`};
        if(difference===0)return {outcome:'success',encouragement:'1등 기록과 같은 시간이에요!'};
        return null;
      }
      async function record(message) {
        if(window.OjjudaAdminPreview?.isEnabled?.()===true){
          send({type:'ojjuda-mines-record',runId:message.runId,ok:false,preview:true});return;
        }
        const {runId, difficulty, seconds, completed} = message;
        const score = window.OjjudaMinesRules.score(difficulty, seconds);
        if (completed !== true || score === null || message.score !== score ||
            typeof runId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId)) return;
        let pending = records.get(runId);
        if (pending && pending.score !== score) return;
        if (!pending) {
          startComparison(runId,difficulty);
          const baseline=baselines.get(runId);
          pending = {score, promise:Promise.resolve().then(async() => {
            const before=await baseline?.leader;
            const saved=authorized() && typeof onScore==='function' ? await onScore(score,runId) : {ok:false};
            if(!saved?.ok)return {ok:false};
            const after=before?.record.difficulty===difficulty&&before.record.seconds<10000&&seconds<10000?await readLeader():null;
            return {ok:true,comparison:comparison(before,after,difficulty,seconds,score)};
          }).catch(() => ({ok:false}))};
          records.set(runId, pending);
        }
        const result = await pending.promise;
        if (!result?.ok) records.delete(runId);
        else if (records.size > 100) records.delete(records.keys().next().value);
        send({type:'ojjuda-mines-record', runId, ok:result?.ok === true,comparison:result?.ok===true?result.comparison:null});
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
        if (message.type === 'ojjuda-game-start') startComparison(message.runId,message.difficulty);
        if (message.type === 'ojjuda-game-exit') close();
        if (message.type === 'ojjuda-game-finished' && !owner && !guestFinished && validRun(message.runId)) {
          guestFinished = true; window.OjjudaGuestAccess?.finished();
        }
        if (message.type === 'ojjuda-game-result') void record(message);
        if (message.type === 'ojjuda-game-ranking') void ranking();
      }
      function requestClose(fromBack = false) {
        if (!connected || !authorized()) { close(); return; }
        send({type:'ojjuda-mines-exit-request', fromBack:fromBack === true});
      }
      active = {dialog, close};
      window.addEventListener('message', receive);
      dialog.querySelector('button').addEventListener('click', requestClose);
      dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(true); });
      document.body.append(dialog);
      document.body.classList.add('gaming');
      dialog.showModal();
      dialog.querySelector('button').focus({preventScroll:true});
    },
    close() { active?.close(); }
  };
})();
