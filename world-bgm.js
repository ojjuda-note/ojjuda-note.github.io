/* Ojjuda World BGM. One player, gesture start, independent foreground blockers. */
(() => {
  'use strict';
  if (window.OjjudaWorldBgm) return;
  const SOURCE = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3IxANoqRL1uMNs5GRgxqpniGdas/d1bf28db-89ac-47da-a905-f755dac1531b.mp3';
  const KEY = 'ojjuda.world.bgm.enabled.v1';
  const GAME = '.gov,.bd-wrap,.spot-game-dialog[open],#matgo-overlay,#photo-ttang-overlay';
  const documents = new Map(), holds = new Set();
  let enabled = true, activated = false, needsGesture = false, away = false;
  let audio = null, button = null, pending = null, scanTimer = null, failed = false;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch {}

  function visible(node) {
    return !!node?.isConnected && !node.hidden && !!node.getClientRects().length &&
      node.ownerDocument.defaultView.getComputedStyle(node).visibility !== 'hidden';
  }
  function gameFrame(frame) {
    try { return new URL(frame.getAttribute('src') || '', frame.ownerDocument.baseURI).pathname.startsWith('/games/'); }
    catch { return false; }
  }
  function liveDocument(doc) {
    const record = documents.get(doc);
    if (!record) return false;
    if (!record.frame) return true;
    try { return record.frame.isConnected && record.frame.contentDocument === doc && liveDocument(record.parent); }
    catch { return false; }
  }
  function blockers() {
    const reasons = [];
    if (!enabled) reasons.push('off');
    if (!activated || needsGesture) reasons.push('gesture');
    if (away || document.hidden) reasons.push('hidden');
    if (holds.size) reasons.push('held');
    let game = false, video = false;
    for (const [doc, record] of documents) {
      if (!liveDocument(doc)) continue;
      const shown = !record.frame || visible(record.frame);
      if (shown && (doc.body?.classList.contains('gaming') || doc.body?.classList.contains('matgo-open') ||
        [...doc.querySelectorAll(GAME)].some(visible) || [...doc.querySelectorAll('iframe[src]')].some(f => gameFrame(f) && visible(f)))) game = true;
      // Do not interrupt BGM for short UI sound effects; games are blocked above.
      for (const media of doc.querySelectorAll('video,audio[controls],audio[data-foreground-audio]')) {
        if (media !== audio && media.isConnected && !media.paused && !media.ended) video = true;
      }
    }
    if (game) reasons.push('game');
    if (video) reasons.push('video');
    return reasons;
  }
  function paint(reasons) {
    if (!button) return;
    const hide = reasons.includes('game') || reasons.includes('video');
    if (button.hidden !== hide) button.hidden = hide;
    const pressed = String(enabled), label = enabled ? '배경음악 끄기' : '배경음악 켜기';
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    if (button.getAttribute('aria-label') !== label) { button.setAttribute('aria-label', label); button.title = label; }
    const text = enabled ? '♫' : '♫ ×';
    if (button.textContent !== text) button.textContent = text;
  }
  function reconcile() {
    const reasons = blockers();
    paint(reasons);
    if (!audio) return;
    if (reasons.length || failed) { if (!audio.paused) audio.pause(); return; }
    if (!audio.paused || pending) return;
    const result = audio.play();
    pending = Promise.resolve(result).then(() => {
      // Opening a game while play() was pending must never leak music.
      if (blockers().length) audio.pause();
    }).catch(error => {
      if (error?.name === 'NotAllowedError') needsGesture = true;
      else if (error?.name !== 'AbortError') failed = true;
    }).finally(() => {
      pending = null;
      paint(blockers());
      // Retry an interrupted load only after its pending play has settled.
      if (!failed && !needsGesture && !blockers().length && audio.paused) schedule();
    });
  }
  function createAudio() {
    if (audio) return;
    audio = document.createElement('audio');
    audio.id = 'world-bgm-audio';
    audio.hidden = true;
    audio.preload = 'none';
    audio.loop = true;
    audio.volume = 0.6;
    audio.setAttribute('playsinline', '');
    audio.src = SOURCE;
    audio.addEventListener('error', () => { failed = true; paint(blockers()); });
    document.body.append(audio);
  }
  function gesture(event) {
    if (!event.isTrusted || !document.body || event.target.closest?.('#world-bgm-toggle')) return;
    if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.key === 'Escape')) return;
    activated = true;
    needsGesture = false;
    if (enabled) {
      createAudio();
      if (failed) { failed = false; audio.load(); }
    }
    reconcile();
  }
  function attach(doc, frame = null, parent = null) {
    if (!doc?.documentElement || documents.has(doc)) return;
    const removers = [], listen = (type, fn) => {
      doc.addEventListener(type, fn, {capture:true, passive:true});
      removers.push(() => doc.removeEventListener(type, fn, true));
    };
    for (const name of ['click','pointerup','touchend','keydown']) listen(name, gesture);
    for (const name of ['play','playing','pause','ended','emptied','error']) listen(name, event => {
      if (event.target !== audio && /^(VIDEO|AUDIO)$/.test(event.target.tagName || '')) reconcile();
    });
    listen('load', event => { if (event.target.tagName === 'IFRAME') scan(); });
    const observer = new MutationObserver(changes => {
      // Synchronous state reconciliation after game insertion/body-class changes.
      if (changes.some(change => change.target === doc.body)) reconcile();
      schedule();
    });
    observer.observe(doc.documentElement, {subtree:true, childList:true, attributes:true,
      attributeFilter:['class','hidden','open','src']});
    documents.set(doc, {frame, parent, dispose:() => {observer.disconnect();removers.forEach(fn => fn());}});
  }
  function scan() {
    clearTimeout(scanTimer); scanTimer = null;
    for (const [doc, record] of documents) if (!liveDocument(doc)) {record.dispose();documents.delete(doc);}
    // Maps include newly attached documents; cap nesting to avoid pathological embeds.
    let count = 0;
    for (const [doc] of documents) {
      if (++count > 20) break;
      for (const frame of doc.querySelectorAll('iframe')) {
        if (gameFrame(frame)) continue; // A game's own animation/media needs no observers.
        try { if (frame.contentDocument) attach(frame.contentDocument, frame, doc); } catch {}
      }
    }
    reconcile();
  }
  function schedule() { if (scanTimer === null) scanTimer = setTimeout(scan, 40); }
  function setEnabled(value) {
    if (typeof value !== 'boolean') throw new TypeError('enabled must be a boolean');
    enabled = value;
    try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch {}
    if (enabled && activated) createAudio();
    reconcile();
  }
  window.OjjudaWorldBgm = {
    setEnabled,
    hold() { const token = {}; holds.add(token); reconcile(); return () => { holds.delete(token); reconcile(); }; },
    status() { return {enabled, playing:!!audio && !audio.paused, position:audio?.currentTime || 0,
      loop:audio?.loop ?? true, volume:audio?.volume ?? 0.6, blockedBy:blockers(), error:failed}; }
  };
  function mount() {
    if (button || !document.body) return;
    const style = document.createElement('style');
    style.textContent = '#world-bgm-toggle{position:fixed;right:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:30;width:38px;height:38px;padding:0;border:1px solid var(--line,#daddf0);border-radius:50%;background:var(--surface,#fff);color:var(--ink,#23264a);font:18px system-ui;box-shadow:0 2px 8px #0002;cursor:pointer;touch-action:manipulation}#world-bgm-toggle[hidden]{display:none}#world-bgm-toggle[aria-pressed="false"]{font-size:13px}#world-bgm-toggle:focus-visible{outline:3px solid var(--accent,#f0679a);outline-offset:3px}@media(min-width:900px){#world-bgm-toggle{bottom:18px;right:18px}}';
    document.head.append(style);
    button = document.createElement('button');
    button.id = 'world-bgm-toggle'; button.type = 'button';
    button.addEventListener('click', event => {
      if (event.isTrusted) { activated = true; needsGesture = false; }
      if (!enabled && failed && audio) {failed = false;audio.load();}
      setEnabled(!enabled);
    });
    document.body.append(button);
    attach(document);
    scan();
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('pagehide', () => {away = true;reconcile();});
    window.addEventListener('pageshow', () => {away = false;scan();});
    window.addEventListener('storage', event => {
      if (event.key === KEY) { enabled = event.newValue !== 'off'; if (enabled && activated) createAudio(); reconcile(); }
    });
    // Catches style-only hiding and third-party DOM updates without per-frame work.
    setInterval(() => { if (!document.hidden) scan(); }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
