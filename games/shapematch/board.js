/* One visible shape per pass. The player clock starts when the target enters the field. */
(() => {
  'use strict';
  const pieces = [
    ['square','blue'], ['circle','yellow'], ['triangle','green'],
    ['diamond','purple'], ['rectangle','orange'], ['circle','red']
  ];

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

  // A short open-vowel voice with moving pitch, formants and a breath component.
  // The shared mixer owns volume, muting and stopping the sound.
  let scream;
  function screamSource(ctx) {
    if (!scream || scream.sampleRate !== ctx.sampleRate) {
      const sr = ctx.sampleRate;
      scream = ctx.createBuffer(1, Math.round(sr * 1.08), sr);
      const out = scream.getChannelData(0);
      let phase = 0, lastNoise = 0;
      for (let i=0; i<out.length; i++) {
        const t = i/sr, sweep = Math.min(1,t/.16);
        const pitch = 300 + 365*sweep - 270*t*t + 22*Math.sin(52*t);
        phase += 2*Math.PI*pitch/sr;
        let voice = 0;
        for (let h=1; h<=8; h++) {
          const f = h*pitch;
          const formant = .15 + Math.exp(-(((f-940)/250)**2)) +
            1.6*Math.exp(-(((f-1590)/260)**2)) + .8*Math.exp(-(((f-2950)/340)**2));
          voice += Math.sin(h*phase)*formant/h;
        }
        const noise = Math.random()-.5;
        const env = Math.min(1,t/.045) * Math.min(1,(1.08-t)/.36);
        out[i] = Math.tanh(voice+.15*(noise-lastNoise))*env*.9;
        lastNoise = noise;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = scream;
    return source;
  }
  window.OjjudaShapeMatch = Object.freeze({play, screamSource});
})();
