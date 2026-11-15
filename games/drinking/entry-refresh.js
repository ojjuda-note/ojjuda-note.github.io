/* Check releases only when a player chooses a new game from a menu. */
(() => {
  'use strict';
  if (window.OjjudaDrinkingEntry) return;
  const kinds = new Set(['menu','croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown','secretcount','partyroulette']);
  const revisionPattern = /^\d{8}-[a-z0-9-]{1,60}$/;
  let releaseCheck = null;
  let navigating = false;

  function latestRevision() {
    if (releaseCheck) return releaseCheck;
    releaseCheck = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      try {
        const response = await fetch('/game-release.json?t=' + Date.now(), {cache:'no-store', signal:controller.signal});
        if (!response.ok) return null;
        const revision = (await response.json())?.revision;
        return typeof revision === 'string' && revisionPattern.test(revision) ? revision : null;
      } catch { return null; }
      finally { clearTimeout(timeout); }
    })().finally(() => { releaseCheck = null; });
    return releaseCheck;
  }

  const menuAvailable = () => !navigating && !document.querySelector('.play-shell, dialog[open]');
  async function navigateLocal(kind, currentRevision) {
    if (!kinds.has(kind) || !menuAvailable()) return false;
    const source = location.href;
    const revision = await latestRevision();
    if (!revision || location.href !== source || !menuAvailable()) return false;
    const local = /^\/games\/drinking\/local\/(?:index\.html)?$/.test(location.pathname);
    if (local && revision === currentRevision) return false;
    const target = new URL('/games/drinking/local/', location.origin);
    target.searchParams.set('v', revision);
    if (kind !== 'menu') target.hash = kind;
    navigating = true;
    location.assign(target.href);
    return true;
  }

  window.addEventListener('pageshow', event => { if (event.persisted) navigating = false; });
  window.OjjudaDrinkingEntry = Object.freeze({navigateLocal});
})();
