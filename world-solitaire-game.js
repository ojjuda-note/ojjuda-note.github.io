/* Solitaire runs on the arcade origin and shares its Back confirmation. */
(() => {
  'use strict';
  let active = null;
  window.OjjudaSolitaireGame = {
    open({owner = null, authorized = () => true, onExitRequest = null} = {}) {
      if (active) { active.dialog.focus(); return; }
      const previous = document.activeElement;
      const wasGaming = document.body.classList.contains('gaming');
      const dialog = document.createElement('dialog');
      dialog.className = 'tour-game-dialog solitaire-game-dialog arcade-game-view';
      dialog.setAttribute('aria-label', '솔리테어');
      const frame = document.createElement('iframe');
      frame.title = '솔리테어';
      frame.src = '/games/solitaire/index.html?v=20261106-solitaire1&owner=' + encodeURIComponent(owner || 'guest');
      frame.allow = 'autoplay; fullscreen';
      dialog.append(frame);
      let guestFinished = false;
      function controls() { return frame.contentWindow?.OjjudaSolitaireControls; }
      function close() {
        if (active?.dialog !== dialog) return;
        controls()?.save();
        active = null;
        window.removeEventListener('message', receive);
        dialog.close(); dialog.remove();
        if (!wasGaming) document.body.classList.remove('gaming');
        if (previous?.isConnected) previous.focus({preventScroll:true});
      }
      function receive(event) {
        if (event.origin !== location.origin || event.source !== frame.contentWindow || !authorized()) return;
        if (event.data?.source !== 'ojjuda-solitaire') return;
        if (event.data.type === 'ojjuda-game-exit-request' && onExitRequest?.() !== true) close();
        if (event.data.type === 'ojjuda-game-finished' && !owner && !guestFinished) {
          guestFinished = true;
          window.OjjudaGuestAccess?.finished();
        }
      }
      active = {dialog, close, pause:() => controls()?.pause()};
      window.addEventListener('message', receive);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      document.body.append(dialog);
      document.body.classList.add('gaming');
      dialog.showModal();
      frame.focus({preventScroll:true});
    },
    pause() { return active?.pause(); },
    close() { active?.close(); }
  };
})();
