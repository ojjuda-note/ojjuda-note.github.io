// unchanged production source at line 1
    $('#starEntryHint').textContent = '진행 상황은 이 기기에 자동 저장돼요.';
    refresh();
  }
  function receive(event) {
    if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'ojjuda-world') return;
    const m = event.data;
// unchanged production source at line 87
      clearTimeout(boostTimer);
      const resolve = boost.resolve; boost = null; resolve(result);
    }
    if (m.type === 'ojjuda-saetbyeol-exit-request') {
      if (boost) { game.notice('부스터 결제를 확인하고 있어요. 잠시만 기다려 주세요.'); return; }
      if (m.fromBack !== true && game.isRunning() && !confirm('게임을 나갈까요?\n키운 별은 자동 저장돼요.')) return;
      save(game.getState()); flush(); post({type:'ojjuda-game-exit'});
    }
    if (m.type === 'ojjuda-saetbyeol-record' && flight?.id === m.runId) {
      clearTimeout(timeout);
      if (m.ok === true) {
// unchanged production source at line 106
    }
  }
  window.OjjudaSaetbyeolEntry = {
    save, buyBooster, canPlay,
    ended(runId) { if (ready && !game.isDemo()) post({type:'ojjuda-game-finished', runId, demo:false}); },
    connect(controller) {
      game = controller;
// unchanged production source at line 132
