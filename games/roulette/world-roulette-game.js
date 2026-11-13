// unchanged production source at line 1
      const dialog = document.createElement('dialog');
      dialog.className = 'roulette-game-dialog';
      dialog.setAttribute('aria-label', '룰렛');
      dialog.innerHTML = '<header><button type="button">← 오락실</button><span>룰렛</span></header><iframe title="룰렛" src="/games/roulette/index.html?v=20261113-game-popup-order1" allow="autoplay; web-share; clipboard-write"></iframe>';
      const frame = dialog.querySelector('iframe');
      let connected = false, unsubscribe = null, inflight = 0, lastResult = '', exitTimer = null;
      const pendingIds = new Set();
// unchanged production source at line 27
