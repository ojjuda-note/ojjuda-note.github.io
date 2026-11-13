// unchanged production source at line 1
    if (!pending || pending.score <= score) pending = {runId, difficulty, seconds, score};
    flush();
  }
  function requestExit(fromBack = false) {
    if (fromBack !== true && game.isPlaying() && !confirm('게임을 나갈까요?\n진행 중인 판은 종료돼요.')) return;
    save(game.getState()); flush(); post({type:'ojjuda-game-exit'});
  }
  function receive(event) {
// unchanged production source at line 51
