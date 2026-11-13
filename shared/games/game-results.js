// unchanged production source at line 1
    for (const action of Array.isArray(options.actions) ? options.actions : []) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'game-result-action';
      if (action.id) button.id = action.id;
      if (action.requiresPlay) button.setAttribute('data-game-result-play', '');
      button.textContent = action.label || '확인'; button.disabled = action.disabled === true;
      button.addEventListener('click', async event => {
// unchanged production source at line 181
    activeDialog = handle; document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    activate(card);
    const first = card.querySelector('button:not(:disabled)'); first?.focus({ preventScroll: true });
    return handle;
  }
  function close() { activeDialog?.close(); }
  function canPlay() {
    let access = window.OjjudaGuestAccess;
    if (!access && window.parent !== window) {
// unchanged production source at line 210
  document.querySelectorAll('.game-entry').forEach(entryRanking);
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  preference?.addEventListener?.('change', event => { if (event.matches) for (const card of liveEffects.keys()) stopEffects(card); });
  window.OjjudaGameResults = Object.freeze({ markup, decorate, update, show, close, canPlay, shareData, supportsGame, requestedGame, games: GAMES });
})();
