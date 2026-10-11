/* Keep the standalone tour inside the arcade, with a same-origin message bridge. */
(() => {
  'use strict';
  let active = null;
  window.OjjudaTourGame = {
    open({nickname = '', owner = null} = {}) {
      if (active) { active.dialog.focus(); return; }
      const previous = document.activeElement;
      const wasGaming = document.body.classList.contains('gaming');
      const dialog = document.createElement('dialog');
      dialog.className = 'tour-game-dialog';
      dialog.setAttribute('aria-label', '오쭈다 투어');
      dialog.innerHTML = '<header class="tour-game-header"><button type="button" aria-label="게임 목록으로 돌아가기">← 게임 목록</button><span>오쭈다 투어</span></header><iframe title="오쭈다 투어 · 같은 기기에서 2~8명" src="/games/ojjuda-tour/index.html?v=20261011-tour1" allow="fullscreen"></iframe>';
      const frame = dialog.querySelector('iframe');
      function close() {
        if (active?.dialog !== dialog) return;
        active = null;
        window.removeEventListener('message', receive);
        dialog.close();
        dialog.remove();
        if (!wasGaming) document.body.classList.remove('gaming');
        if (previous?.isConnected) previous.focus({preventScroll:true});
      }
      function receive(event) {
        if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
        const message = event.data;
        if (message?.source !== 'ojjuda-tour') return;
        if (message.type === 'ojjuda-game-ready') {
          frame.contentWindow.postMessage({source:'ojjuda-world', type:'ojjuda-tour-init',
            nickname:String(nickname).slice(0, 12), owner:owner || 'guest'}, location.origin);
        }
        if (message.type === 'ojjuda-game-exit') close();
        // Tour results are local. No wallet or public ranking accepts client results.
      }
      active = {dialog, close};
      window.addEventListener('message', receive);
      dialog.querySelector('button').addEventListener('click', close);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      document.body.append(dialog);
      document.body.classList.add('gaming');
      dialog.showModal();
      dialog.querySelector('button').focus({preventScroll:true});
    },
    close() { active?.close(); }
  };
})();
