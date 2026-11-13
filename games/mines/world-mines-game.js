// unchanged production source at line 1
      const dialog = document.createElement('dialog');
      dialog.className = 'tour-game-dialog mines-game-dialog arcade-game-view';
      dialog.setAttribute('aria-label', '지뢰찾기 · 전체이용');
     dialog.innerHTML = '<header class="tour-game-header"><button type="button" class="arcade-return">← 오쭈다 오락실</button><span>지뢰찾기 · 전체이용</span></header><iframe title="지뢰찾기" src="/games/mines/index.html?v=20261112-arcade-entry-return1" allow="autoplay; fullscreen; web-share; clipboard-write"></iframe>';
      const frame = dialog.querySelector('iframe');
      const records = new Map(), baselines = new Map();
      let leaderFlight = null;
// unchanged production source at line 14
