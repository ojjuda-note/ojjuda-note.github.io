/* One visible shape per pass. The player clock starts when the target enters the field. */
(() => {
  'use strict';
  const pieces = [
    ['square','blue'], ['circle','yellow'], ['triangle','green'],
    ['diamond','purple'], ['rectangle','orange'], ['circle','red']
  ];
  const originalGhost = 'ghost.svg';
  const ghosts = [originalGhost, 'ghosts/door.webp', 'ghosts/water.webp', 'ghosts/mask.webp',
    'ghosts/paper.webp', 'ghosts/mirror.webp'];
  let remainingGhosts = [];
  let lastGhost;

  function pickGhost() {
    if (!remainingGhosts.length) remainingGhosts = ghosts.slice();
    const choices = remainingGhosts.filter(file => file !== lastGhost);
    const pool = choices.length ? choices : remainingGhosts;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function play(field, {finish, interrupt, scare}) {
    const token = new AbortController();
    const {signal} = token;
    const shape = field.querySelector('.sm-piece');
    const ghost = field.querySelector('.sm-ghost');
    const hint = field.querySelector('.sm-hint');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let stage = 'before';
    let frame = 0, clock = 0, hintTimer = 0, targetAt = null;
    let used = [];
    const selectedGhost = pickGhost();
    const originalSrc = ghost.src;
    if (selectedGhost !== originalGhost) {
      const photo = new Image();
      photo.src = new URL(selectedGhost + '?v=faces1', originalSrc).href;
      // Keep the original ready if the selected photo misses the reveal on a slow connection.
      photo.decode().then(() => {
        if (!signal.aborted && stage === 'before') ghost.src = photo.src;
      }).catch(() => {});
    }

    function stop() {
      token.abort();
      cancelAnimationFrame(frame);
      clearTimeout(clock);
      clearTimeout(hintTimer);
    }
    function pause() {
      if (signal.aborted) return;
      stop();
      interrupt();
    }
    function available() {
      return !signal.aborted && field.isConnected && !document.hidden &&
        window.OjjudaDrinkingAccessReady === true;
    }
    function takePiece() {
      if (!used.length) used = pieces.slice();
      return used.splice(Math.floor(Math.random() * used.length), 1)[0];
    }
    function enter(target = false) {
      if (!available()) return pause();
      const [kind,color] = target ? ['circle','green'] : takePiece();
      shape.className = 'sm-piece sm-' + kind + ' sm-' + color;
      const side = Math.floor(Math.random() * 4);
      const horizontal = side < 2, reverse = side % 2 === 1;
      const fromLane = 0.18 + Math.random() * 0.64;
      const toLane = 0.18 + Math.random() * 0.64;
      const duration = 1480 + Math.random() * 340;
      const began = performance.now();
      shape.hidden = false;
      function draw(now) {
        if (!available()) return pause();
        const w = field.clientWidth, h = field.clientHeight;
        const size = Math.min(94, Math.max(36, Math.min(w,h) * .21));
        const length = horizontal ? w : h, cross = horizontal ? h : w;
        const elapsed = Math.max(0, (now - began) / duration);
        const p = Math.min(elapsed, target ? .5 : 1);
        const start = reverse ? length + 2 : -size - 2;
        const end = reverse ? -size - 2 : length + 2;
        const along = reduced.matches ? (length-size)/2 : start+(end-start)*p;
        const across = (fromLane + (toLane-fromLane)*p)*(cross-size);
        shape.style.width = shape.style.height = size + 'px';
        shape.style.transform = 'translate('+(horizontal?along:across)+'px,'+(horizontal?across:along)+'px)';
        if (target && targetAt === null && along + size > 0 && along < length) {
          targetAt = now;
          field.setAttribute('aria-label','녹색 동그라미');
          hint.textContent = '';
          field.querySelector('.sm-live').textContent = '녹색 동그라미';
        }
        if (target && elapsed >= .5) return;
        if (!target && elapsed >= 1) {
          shape.hidden = true;
          clock = setTimeout(() => enter(stage === 'after'), 95);
          return;
        }
        frame = requestAnimationFrame(draw);
      }
      draw(began);
    }

    function tap() {
      if (!available() || stage === 'scare') return;
      if (targetAt !== null) {
        const ms = Math.max(1, Math.round(performance.now() - targetAt));
        stop();
        finish(ms);
        return;
      }
      hint.textContent = '아직이에요';
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint.textContent = ''; }, 430);
    }

    document.addEventListener('pointerdown', event => {
      if (event.isPrimary === false || event.button !== 0) return;
      if (event.target.closest('button, a, input, dialog, [data-drinking-overlay]') && !field.contains(event.target)) return;
      tap();
    }, {signal});
    field.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat) tap();
    }, {signal});
    field.addEventListener('click', event => {
      if (event.detail === 0) tap();
    }, {signal});
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, {signal});
    document.addEventListener('click', event => {
      if (event.target.closest('#effects, [data-drinking-help]')) pause();
    }, {capture:true, signal});
    window.addEventListener('pagehide', pause, {signal});

    enter();
    const reveal = setTimeout(() => {
      if (!available()) return pause();
      cancelAnimationFrame(frame);
      clearTimeout(clock);
      clearTimeout(hintTimer);
      stage = 'scare';
      shape.hidden = true;
      hint.textContent = '';
      remainingGhosts = remainingGhosts.filter(file => file !== selectedGhost);
      lastGhost = ghost.src === originalSrc ? originalGhost : selectedGhost;
      ghost.hidden = false;
      scare();
      clock = setTimeout(() => {
        if (!available()) return pause();
        ghost.hidden = true;
        stage = 'after';
        enter();
      }, 1140);
    }, 6000);
    signal.addEventListener('abort', () => clearTimeout(reveal), {once:true});
    field.focus({preventScroll:true});
    return stop;
  }

  window.OjjudaShapeMatch = Object.freeze({play});
})();
