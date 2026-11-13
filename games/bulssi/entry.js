// unchanged production source at line 1
    $('#starEntryHint').textContent = '진행 상황은 이 기기에 자동 저장돼요.';
    refresh();
  }
  let confirmingExit = false;
  async function requestExit(fromBack = false) {
    if (boost) { game.notice('부스터 결제를 확인하고 있어요. 잠시만 기다려 주세요.'); return; }
    if (confirmingExit) return;
    if (!fromBack && game.isRunning()) {
      const message = '게임을 나갈까요?\n키운 별은 자동 저장돼요.';
      confirmingExit = true;
      try {
        const results = parent.OjjudaGameResults;
        if (!(results?.confirmExit ? await results.confirmExit(message) : confirm(message))) return;
      } finally { confirmingExit = false; }
    }
    save(game.getState()); flush(); post({type:'ojjuda-game-exit'});
  }
  function receive(event) {
    if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'ojjuda-world') return;
    const m = event.data;
// unchanged production source at line 87
      clearTimeout(boostTimer);
      const resolve = boost.resolve; boost = null; resolve(result);
    }
    if (m.type === 'ojjuda-saetbyeol-exit-request') void requestExit(m.fromBack === true);
    if (m.type === 'ojjuda-saetbyeol-record' && flight?.id === m.runId) {
      clearTimeout(timeout);
      if (m.ok === true) {
// unchanged production source at line 106
    }
  }
  window.OjjudaSaetbyeolEntry = {
    save, buyBooster, canPlay, requestExit,
    get confirmingExit(){ return confirmingExit; },
    ended(runId) { if (ready && !game.isDemo()) post({type:'ojjuda-game-finished', runId, demo:false}); },
    connect(controller) {
      game = controller;
// unchanged production source at line 132
