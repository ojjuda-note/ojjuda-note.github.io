// unchanged production source at line 1
    for (const action of Array.isArray(options.actions) ? options.actions : []) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'game-result-action';
      if (action.id) button.id = action.id;
      if (action.autofocus) button.autofocus = true;
      if (action.requiresPlay) button.setAttribute('data-game-result-play', '');
      button.textContent = action.label || '확인'; button.disabled = action.disabled === true;
      button.addEventListener('click', async event => {
// unchanged production source at line 181
    activeDialog = handle; document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    activate(card);
    const first = actionRow.querySelector('[autofocus]:not(:disabled)') || card.querySelector('button:not(:disabled)'); first?.focus({ preventScroll: true });
    return handle;
  }
  function close() { activeDialog?.close(); }
  function confirmExit(message, { exitLabel = '나가기', continueLabel = '계속하기' } = {}) {
    if (document.querySelector('dialog.game-exit-dialog[open]')) return Promise.resolve(false);
    const dialog = document.createElement('dialog');
    const promptId = 'game-exit-message-' + (++sequence);
    dialog.className = 'game-exit-dialog';
    dialog.setAttribute('aria-labelledby', promptId);
    dialog.innerHTML = '<p></p><div class="game-result-navigation"><button type="button" data-exit-leave></button><button type="button" data-exit-stay autofocus></button></div>';
    const prompt = dialog.querySelector('p'), leave = dialog.querySelector('[data-exit-leave]'), stay = dialog.querySelector('[data-exit-stay]');
    prompt.id = promptId;
    prompt.textContent = message;
    leave.textContent = exitLabel;
    stay.textContent = continueLabel;
    return new Promise(resolve => {
      leave.onclick = () => dialog.close('leave');
      stay.onclick = () => dialog.close();
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(dialog.returnValue === 'leave');
      }, { once: true });
      document.body.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else {
        dialog.remove();
        resolve(window.confirm(message));
      }
    });
  }
  function canPlay() {
    let access = window.OjjudaGuestAccess;
    if (!access && window.parent !== window) {
// unchanged production source at line 210
  document.querySelectorAll('.game-entry').forEach(entryRanking);
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  preference?.addEventListener?.('change', event => { if (event.matches) for (const card of liveEffects.keys()) stopEffects(card); });
  window.OjjudaGameResults = Object.freeze({ markup, decorate, update, show, close, confirmExit, canPlay, shareData, supportsGame, requestedGame, games: GAMES });
})();
