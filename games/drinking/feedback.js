(() => {
  'use strict';
  const read = key => {
    try { return localStorage.getItem('oj.party.' + key) !== 'off'; } catch { return true; }
  };
  const prefs = {sound:read('sound'), vibration:read('vibration')};
  // Start and duration in seconds in the lossless, mono sample bank.
  const clips = {
    tap: [0.00000, 0.09646],
    deal: [0.12646, 0.49904],
    flip: [0.65550, 0.23742],
    vote: [0.92292, 0.08950],
    turn: [1.04242, 0.25004],
    spin: [1.32246, 0.13129],
    finish: [1.48375, 0.29342],
    tick: [1.80717, 0.13000],
    boom: [1.96717, 0.82000],
    result: [2.81717, 0.29342],
    king: [3.14058, 0.34392],
    watch: [3.51450, 0.17671],
    load: [3.72121, 0.17692],
    ratchet: [3.92813, 0.06429],
    dry: [4.02242, 0.20208],
    shot: [4.25450, 0.42000],
    scare: [4.70450, 1.07000],
  };
  const names = {truth:'flip', stop:'watch', count:'tick', 'shape-scare':'scare', tooth:'tap', snap:'dry'};
  const volumes = {tick:.26, spin:.17, ratchet:.24, tap:.34, shot:.84, boom:.72, scare:.65};
  const buzz = {tap:9, deal:14, turn:[14,28,14], tooth:18, snap:[70,32,95], spin:8, stop:[32,28,52],
    tick:12, boom:[130,55,180], flip:14, king:[28,30,28,30,68], truth:18, vote:14, count:14, result:[24,36,44]};
  const active = new Set();
  let context, bank, loading, generation = 0, biteTimer = null;
  const laugh = new Audio('/games/croc/audio/croc-laugh.wav');
  const tooth = new Audio('/games/croc/audio/switch-click.wav');
  laugh.loop = true;
  // Keep the original toy click and laugh for the crocodile in both play modes.
  function recorded(clip) {
    clip.currentTime = 0;
    clip.play()?.catch(()=>{});
  }
  async function loadBank() {
    if (!context || bank) return;
    if (!loading) {
      loading = fetch('/games/drinking/audio/table-foley-v1.wav?v=2')
        .then(response => {
          if (!response.ok) throw Error('audio unavailable');
          return response.arrayBuffer();
        }).then(bytes => context.decodeAudioData(bytes))
        .then(decoded => { bank = decoded; }).catch(()=>{}).finally(()=>{ loading = null; });
    }
    await loading;
  }
  function unlock() {
    if (!prefs.sound || document.hidden) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      context ||= new AudioCtor();
      if (context.state !== 'running') context.resume().catch(()=>{});
      void loadBank();
    } catch {}
  }
  function vibrate(pulse) {
    try { navigator.vibrate?.(pulse); } catch {}
  }
  function startBite() {
    if (document.hidden || biteTimer !== null) return;
    if (prefs.sound) recorded(laugh);
    const sustain = () => { if (prefs.vibration && !document.hidden) vibrate(3000); };
    sustain();
    biteTimer = setInterval(sustain, 1500);
  }
  function accent(id) {
    const target = {
      flip:'.private-card, .secret, .role, .mission-card', truth:'.truth-front, .truth-face',
      king:'.king-order, #game h1, .play-body h2', finish:'.winning-seat, .bottle-board, .bottle-dial',
      watch:'#watch-reading, .watch-board', vote:'.turn-tag, .suite-heading',
      boom:'.burst-stage, #game h1', result:'.dp-result-copy, #game h1, .play-body h2'
    }[id];
    if (!target || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const before = generation;
    requestAnimationFrame(() => {
      if (before !== generation || document.hidden) return;
      const element = document.querySelector(target);
      if (!element || !element.getClientRects().length) return;
      const frames = id === 'boom' ? [{translate:'-3px 0'}, {translate:'3px 0',offset:.35}, {translate:'0 0'}]
        : [{scale:'.97',filter:'brightness(1.16)'}, {scale:'1',filter:'brightness(1)'}];
      element.animate?.(frames, {duration:id === 'boom' ? 220 : 280, easing:'ease-out'});
    });
  }
  async function play(id, pulse = buzz[id] ?? 10) {
    if (document.hidden) return;
    if (pulse && prefs.vibration) vibrate(pulse);
    accent(id);
    if (!prefs.sound) return;
    if (id === 'tooth') { recorded(tooth); return; }
    const name = names[id] || id;
    if (!clips[name] || !context) return;
    const before = generation, requested = performance.now();
    if (!bank) await loadBank();
    if (!bank || context.state !== 'running' || before !== generation || !prefs.sound ||
        document.hidden || performance.now() - requested > 220) return;
    if (active.size >= 6) {
      const oldest = active.values().next().value;
      active.delete(oldest);
      oldest.stop();
    }
    const source = context.createBufferSource(), gain = context.createGain();
    const [offset, duration] = clips[name];
    source.buffer = bank;
    gain.gain.value = volumes[name] ?? .56;
    source.connect(gain); gain.connect(context.destination);
    active.add(source);
    source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(0, offset, duration);
  }
  function silence() {
    generation++;
    laugh.pause(); tooth.pause();
    for (const source of active) source.stop();
    active.clear();
  }
  function quiet() {
    clearInterval(biteTimer); biteTimer = null;
    silence(); vibrate(0);
  }
  function change(key,on) {
    prefs[key] = on;
    try { localStorage.setItem('oj.party.' + key, on ? 'on' : 'off'); } catch {}
    if (key === 'sound') {
      if (!on) silence();
      else { unlock(); if (biteTimer !== null && !document.hidden) recorded(laugh); }
    } else if (!on) vibrate(0);
    else if (biteTimer !== null && !document.hidden) vibrate(3000);
  }
  for (const event of ['pointerdown','keydown','click']) document.addEventListener(event,unlock,{capture:true});
  document.addEventListener('visibilitychange', () => { if (document.hidden) quiet(); });
  document.addEventListener('ojjuda:drinking-access', e => { if (!e.detail?.allowed) quiet(); });
  window.addEventListener('pagehide', quiet);
  window.PartyFX = {play,unlock,quiet,prefs,change,startBite};
})();
