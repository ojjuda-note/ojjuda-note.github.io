// unchanged production source at line 1
      const dialog = document.createElement('dialog');
      dialog.className = 'tour-game-dialog arcade-game-view';
      dialog.setAttribute('aria-label', '마블');
      dialog.innerHTML = '<header class="tour-game-header"><button type="button" aria-label="오락실로 돌아가기">← 오락실</button><span>마블</span></header><iframe title="마블 · 온라인 또는 같은 기기에서 2~8명" src="/games/ojjuda-tour/index.html?v=20261113-game-popup-order1" allow="fullscreen; web-share; clipboard-write"></iframe>';
      const frame = dialog.querySelector('iframe');
      const results = new Map();
      let invitation = new AbortController();
// unchanged production source at line 15
