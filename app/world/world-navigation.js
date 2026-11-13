// unchanged production source at line 1
        const dialog = document.createElement('dialog');
        dialog.className = 'arcade-exit-choice';
        dialog.setAttribute('aria-labelledby', 'arcade-exit-title');
        dialog.innerHTML = '<h2 id="arcade-exit-title">오락실로 갈까요?</h2><div><button type="button" data-exit-leave>오락실로 나가기</button><button type="button" data-exit-stay autofocus>게임 계속하기</button></div>';
        const resume = options.pauseGame?.(game);
        function finish(leave = false) {
          if (exitChoice?.dialog !== dialog) return;
// unchanged production source at line 26
