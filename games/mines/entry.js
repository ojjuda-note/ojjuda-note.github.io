// unchanged production source at line 1
    if (!pending || pending.score <= score) pending = {runId, difficulty, seconds, score};
    flush();
  }
  let confirmingExit = false;
  async function requestExit(fromBack = false) {
    if (confirmingExit) return;
    if (fromBack !== true && game.isPlaying()) {
      const message = '게임을 나갈까요?\n진행 중인 판은 종료돼요.';
      confirmingExit = true;
      try {
        if (!(window.OjjudaGameResults?.confirmExit ? await window.OjjudaGameResults.confirmExit(message) : confirm(message))) return;
      } finally { confirmingExit = false; }
    }
    save(game.getState()); flush(); post({type:'ojjuda-game-exit'});
  }
  function receive(event) {
// unchanged production source at line 51
