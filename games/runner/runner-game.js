/* 쭈달리기 · 바닷속 러시
 * Ojjuda-original canvas artwork, synthesized BGM, and self-contained gameplay.
 * The public Ojjuda arcade supplies the score recorder and sound-effect switch.
 */
(() => {
  'use strict';

  const W = 360;
  const GROUND = 420;
  const TAU = Math.PI * 2;
  const FONT = '"Jua","Gowun Dodum","Apple SD Gothic Neo",sans-serif';
  const ZONES = [
    { name: '산호 정원', deep: '#073a64', mid: '#147a9b', light: '#7be0d1', reef: '#145b81', coral: '#fd977f' },
    { name: '물빛 해초숲', deep: '#063d58', mid: '#127d80', light: '#81d7b7', reef: '#126c74', coral: '#f8c17d' },
    { name: '별빛 진주동굴', deep: '#142b62', mid: '#385d9a', light: '#90c3e8', reef: '#354779', coral: '#d4a7ea' }
  ];
  const MELODY = [392, 440, 523.25, 587.33, 523.25, 440, 349.23, 392,
    392, 523.25, 659.25, 587.33, 523.25, 440, 392, 329.63];
  const safeGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const safeSet = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };
  const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function fit(c) {
    const rect = c.canvas.getBoundingClientRect();
    const h = rect.width > 0 && rect.height > 0 ? W * rect.height / rect.width : 540;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(W * dpr), ph = Math.round(h * dpr);
    if (c.canvas.width !== pw || c.canvas.height !== ph) {
      c.canvas.width = pw;
      c.canvas.height = ph;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { h, ground: h - Math.min(110, Math.max(80, h * .19)) };
  }
  function ellipse(c, x, y, rx, ry, fill) {
    c.beginPath(); c.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, TAU);
    c.fillStyle = fill; c.fill();
  }
  function rounded(c, x, y, w, h, r, fill) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath(); c.fillStyle = fill; c.fill();
  }
  function gradient(c, x1, y1, x2, y2, stops) {
    const g = c.createLinearGradient(x1, y1, x2, y2);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }
  function stroke(c, points, color, weight = 2) {
    c.beginPath(); c.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) c.lineTo(...points[i]);
    c.strokeStyle = color; c.lineWidth = weight;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }
  function sparkle(c, x, y, r, color, angle = 0) {
    c.save(); c.translate(x, y); c.rotate(angle); c.beginPath();
    c.moveTo(0, -r); c.quadraticCurveTo(r * .25, -r * .25, r, 0);
    c.quadraticCurveTo(r * .25, r * .25, 0, r);
    c.quadraticCurveTo(-r * .25, r * .25, -r, 0);
    c.quadraticCurveTo(-r * .25, -r * .25, 0, -r);
    c.fillStyle = color; c.fill(); c.restore();
  }
  function bubble(c, x, y, radius, opacity = .8) {
    c.save(); c.globalAlpha = opacity;
    ellipse(c, x, y, radius, radius, '#e4fff91c');
    c.beginPath(); c.arc(x, y, radius, 0, TAU);
    c.strokeStyle = '#d8fff7a8'; c.lineWidth = 1.2; c.stroke();
    ellipse(c, x - radius * .32, y - radius * .35, radius * .18, radius * .26, '#ffffffd6');
    c.restore();
  }
  function kelp(c, x, bottom, height, phase, color) {
    c.save(); c.translate(x, bottom);
    c.beginPath(); c.moveTo(0, 0);
    const lean = Math.sin(phase) * 12;
    c.bezierCurveTo(-18, -height * .35, 15 + lean, -height * .75, lean, -height);
    c.strokeStyle = color; c.lineWidth = Math.max(3, height * .1); c.lineCap = 'round'; c.stroke();
    for (let i = 1; i <= 3; i++) {
      const t = i / 4, yy = -height * t, xx = Math.sin(phase + t) * 6;
      c.beginPath(); c.moveTo(xx, yy);
      c.quadraticCurveTo((i % 2 ? -1 : 1) * 24, yy - 21, (i % 2 ? -1 : 1) * 19, yy - 34);
      c.quadraticCurveTo((i % 2 ? -1 : 1) * 22, yy - 11, xx, yy);
      c.fillStyle = color; c.fill();
    }
    c.restore();
  }
  function sea(c, dist, time, view, stage, reduced = false) {
    const z = ZONES[stage];
    c.fillStyle = gradient(c, 0, 0, 0, view.h, [[0, z.deep], [.55, z.mid], [1, z.light]]);
    c.fillRect(0, 0, W, view.h);
    const sun = c.createRadialGradient(265, 62, 5, 265, 62, 225);
    sun.addColorStop(0, '#fffdd970'); sun.addColorStop(1, '#d9fff000');
    c.fillStyle = sun; c.fillRect(0, 0, W, view.h);
    for (let i = 0; i < 6; i++) {
      const x = 48 + i * 68 + Math.sin(time * .16 + i) * (reduced ? 0 : 8);
      c.fillStyle = i % 2 ? '#dbffef0b' : '#f5fff417';
      c.beginPath(); c.moveTo(x - 23, 0); c.lineTo(x + 8, 0);
      c.lineTo(x + 114, view.ground); c.lineTo(x + 18, view.ground); c.fill();
    }
    const far = dist * .12;
    c.fillStyle = z.reef;
    c.beginPath(); c.moveTo(0, view.ground - 116);
    for (let x = -20; x <= W + 20; x += 15) {
      const h = Math.sin((x + far) * .012) * 19 + Math.sin((x + far) * .027) * 9;
      c.lineTo(x, view.ground - 105 + h);
    }
    c.lineTo(W, view.ground); c.lineTo(0, view.ground); c.closePath(); c.fill();
    const nearShift = dist * .24;
    for (let i = 0; i < 9; i++) {
      let x = ((i * 84 - nearShift) % 756 + 756) % 756 - 90;
      if (x > W + 80) continue;
      kelp(c, x, view.ground - 12, 48 + i % 3 * 22,
        reduced ? i : time * .9 + i, i % 2 ? '#4ba69c70' : '#1d7d8380');
      if (i % 3 === 1) {
        ellipse(c, x + 21, view.ground - 28, 16, 23, z.coral + '66');
        ellipse(c, x + 13, view.ground - 51, 10, 13, '#f5bc9c50');
      }
    }
    for (let i = 0; i < 24; i++) {
      let x = ((i * 71 - dist * (.2 + i % 3 * .06)) % 570 + 570) % 570 - 70;
      let y = (i * 67 + (reduced ? 0 : time * (8 + i % 4 * 3))) % (view.h + 70);
      y = view.h + 30 - y;
      bubble(c, x, y, 2.5 + i % 4 * 1.5, .22 + i % 3 * .1);
    }
    // A bright lane and a richly textured sea floor keep hazards easy to read.
    c.fillStyle = gradient(c, 0, view.ground, 0, view.h,
      [[0, '#edd6a5'], [.55, '#d4af7e'], [1, '#aa8973']]);
    c.fillRect(0, view.ground, W, view.h - view.ground);
    rounded(c, 0, view.ground - 3, W, 5, 1, '#c4ffe6');
    rounded(c, 0, view.ground + 2, W, 4, 1, '#fbecbc80');
    for (let i = 0; i < 26; i++) {
      const x = ((i * 34 - dist * .85) % 420 + 420) % 420 - 32;
      ellipse(c, x, view.ground + 18 + i % 5 * 17, 1.5 + i % 3, .8 + i % 2, '#8c745a55');
    }
    for (let i = 0; i < 4; i++) {
      const x = ((i * 156 - dist * .8) % 624 + 624) % 624 - 80;
      stroke(c, [[x, view.ground + 68], [x + 22, view.ground + 67]], '#fff2c25c', 2);
    }
    if (stage === 2) for (let i = 0; i < 8; i++)
      sparkle(c, 22 + i * 48, 62 + i % 4 * 43, 2 + i % 2, '#ecedff9c', time * .2 + i);
  }
  function foreground(c, dist, time, view, reduced) {
    for (let i = 0; i < 7; i++) {
      const x = ((i * 95 - dist * 1.08) % 665 + 665) % 665 - 65;
      kelp(c, x, view.ground + 26, 19 + i % 3 * 7,
        reduced ? i : time * 2 + i, '#4c947a');
      if (i % 2 === 0) {
        ellipse(c, x + 23, view.ground + 6, 11, 5, '#e98a7f');
        sparkle(c, x + 24, view.ground + 2, 2.3, '#ffe6bf');
      }
    }
  }
  function pearl(c, x, y, time, size = 10) {
    const pulse = 1 + Math.sin(time * 5 + x * .02) * .055;
    c.save(); c.translate(x, y); c.scale(pulse, pulse);
    const glow = c.createRadialGradient(0, 0, 1, 0, 0, size * 2.3);
    glow.addColorStop(0, '#f8fff6a8'); glow.addColorStop(1, '#d1fffd00');
    c.fillStyle = glow; c.fillRect(-size * 2.3, -size * 2.3, size * 4.6, size * 4.6);
    ellipse(c, 0, 2, size, size, '#7d78c5');
    ellipse(c, 0, 0, size, size, gradient(c, -size, -size, size, size,
      [[0, '#ffffff'], [.5, '#d6fcf0'], [1, '#b9aee6']]));
    ellipse(c, -size * .28, -size * .35, size * .27, size * .19, '#ffffff');
    sparkle(c, size * .8, -size * .76, size * .36, '#fffcea');
    c.restore();
  }
  function shield(c, x, y, time) {
    bubble(c, x, y, 16 + Math.sin(time * 3) * 1.2, 1);
    sparkle(c, x, y, 9, '#fff0a5', Math.sin(time * 2) * .2);
    ellipse(c, x, y, 3.3, 3.3, '#ffcf70');
  }
  function urchin(c, x, y, w, h, time) {
    const cx = x + w / 2, cy = y + h / 2;
    c.save(); c.translate(cx, cy); c.rotate(Math.sin(time * 1.7 + x) * .08);
    for (let i = 0; i < 12; i++) {
      const a = TAU * i / 12;
      stroke(c, [[Math.cos(a) * 10, Math.sin(a) * 10],
        [Math.cos(a) * 19, Math.sin(a) * 19]], '#58487c', 4);
    }
    ellipse(c, 0, 0, 13, 12, gradient(c, 0, -12, 0, 13,
      [[0, '#a293d7'], [1, '#655585']]));
    ellipse(c, -4, -2, 1.8, 2.6, '#232e4c');
    ellipse(c, 4, -2, 1.8, 2.6, '#232e4c');
    ellipse(c, 0, 4, 3, 1.7, '#d2b6df'); c.restore();
  }
  function coral(c, x, y, w, h, time, color) {
    c.save(); c.translate(x + w / 2, y + h);
    const drift = Math.sin(time * .9 + x) * 1.4;
    stroke(c, [[0, 0], [0, -h * .58], [-4 + drift, -h]], '#c65f79', 9);
    stroke(c, [[0, -h * .28], [-w * .38, -h * .56], [-w * .32 + drift, -h * .87]], color, 7);
    stroke(c, [[0, -h * .37], [w * .39, -h * .59], [w * .32 + drift, -h * .94]], color, 7);
    stroke(c, [[-w * .15, -h * .48], [-w * .43, -h * .68]], '#ffd5ae', 3);
    stroke(c, [[w * .12, -h * .45], [w * .37, -h * .66]], '#ffe0b6', 3);
    ellipse(c, -4 + drift, -h, 4.5, 4.5, '#ffe3b6');
    ellipse(c, w * .32 + drift, -h * .94, 4.5, 4.5, '#ffe3b6');
    c.restore();
  }
  function jelly(c, x, y, w, h, time, reduced) {
    c.save(); c.translate(x + w / 2, y + h / 2);
    const bob = reduced ? 0 : Math.sin(time * 4 + x * .01) * 2;
    c.translate(0, bob);
    for (let i = -2; i <= 2; i++) {
      c.beginPath(); c.moveTo(i * 7, 3);
      c.quadraticCurveTo(i * 6 + Math.sin(time * 5 + i) * 4, 15, i * 7, h * .48);
      c.strokeStyle = '#f7c8f1c9'; c.lineWidth = 2.5; c.stroke();
    }
    c.beginPath(); c.moveTo(-w * .49, 3);
    c.bezierCurveTo(-w * .5, -h * .66, -w * .13, -h * .85, 0, -h * .7);
    c.bezierCurveTo(w * .34, -h * .85, w * .51, -h * .38, w * .49, 3);
    c.quadraticCurveTo(w * .25, 10, 0, 4);
    c.quadraticCurveTo(-w * .25, 10, -w * .49, 3);
    c.fillStyle = gradient(c, 0, -h * .8, 0, h * .25,
      [[0, '#ffe4fc'], [.58, '#dca4eb'], [1, '#9e70d2']]); c.fill();
    ellipse(c, -6, -6, 2.1, 2.4, '#513e72');
    ellipse(c, 6, -6, 2.1, 2.4, '#513e72');
    ellipse(c, 0, 0, 3, 1.4, '#fcf1ff');
    ellipse(c, -w * .25, -h * .36, 5.5, 3.5, '#ffffff70');
    c.restore();
  }
  function drawObstacle(c, obstacle, time, reduced, stage) {
    const { x, y, w, h, kind } = obstacle;
    ellipse(c, x + w / 2, GROUND + 2, w * .65, 3, '#315d6957');
    if (kind === 'jelly') jelly(c, x, y, w, h, time, reduced);
    else if (kind === 'urchin') urchin(c, x, y, w, h, time);
    else coral(c, x, y, w, h, time, ZONES[stage].coral);
  }
  function hero(c, x, bottom, time, jumping, sliding, blink, shielded, reduced) {
    c.save(); c.translate(x, bottom);
    const stride = reduced || jumping || sliding ? 0 : Math.sin(time * 16);
    const bounce = reduced || jumping || sliding ? 0 : Math.abs(Math.sin(time * 16)) * 2;
    c.translate(0, -bounce);
    if (shielded) bubble(c, 0, -31, sliding ? 34 : 43, .72);
    if (sliding) {
      ellipse(c, -14, -8, 33, 8, '#86fbdd73');
      for (let i = 0; i < 4; i++)
        stroke(c, [[-14 + i * 9, -7], [-23 + i * 14, -3]], '#ed8d9f', 4);
      ellipse(c, 0, -17, 28, 15, gradient(c, -25, -31, 22, -2,
        [[0, '#ffe0c7'], [.48, '#ff9ca7'], [1, '#dc6e92']]));
      ellipse(c, 10, -20, 7, 4, '#fff4e7');
      stroke(c, [[5, -24], [11, -23], [17, -25]], '#563e64', 2);
      ellipse(c, 18, -16, 4, 3, '#ffc6bb');
      rounded(c, -21, -27, 16, 5, 2, '#79d4b8');
    } else {
      // Four springy tentacles and tiny running shoes belong to Ojjuda's own 쭈.
      for (let i = 0; i < 4; i++) {
        const xx = -16 + i * 10;
        const swing = (i % 2 ? 1 : -1) * stride * 5;
        stroke(c, [[xx, -19], [xx + swing, -8], [xx + swing * 1.25, -3]],
          i % 2 ? '#e97998' : '#f7a1a2', 7);
        rounded(c, xx + swing * 1.25 - 6, -6, 12, 5, 2.5, '#f8f5e6');
      }
      stroke(c, [[-17, -33], [-29 - stride * 4, -25], [-27, -21]], '#eb8396', 7);
      stroke(c, [[16, -33], [27 + stride * 4, -22], [24, -18]], '#f3999c', 7);
      // The mantle silhouette is an original rounded squid, not a sprite sheet.
      c.beginPath(); c.moveTo(-20, -41);
      c.bezierCurveTo(-26, -63, -13, -70, 0, -70);
      c.bezierCurveTo(15, -70, 27, -59, 22, -40);
      c.quadraticCurveTo(29, -18, 5, -16);
      c.quadraticCurveTo(-24, -17, -20, -41);
      c.fillStyle = gradient(c, -21, -70, 18, -13,
        [[0, '#ffe2c9'], [.45, '#ff9da9'], [1, '#dd6c90']]); c.fill();
      ellipse(c, -9, -53, 7, 5, '#ffffff66');
      // Soft mint running headband and Ojjuda's little star.
      stroke(c, [[-20, -51], [-9, -55], [9, -55], [22, -51]], '#64cdb9', 5);
      stroke(c, [[20, -51], [31, -49], [29, -43]], '#9df3d8', 3);
      sparkle(c, -6, -57, 3.6, '#fff9cf');
      if (!blink) {
        ellipse(c, -7, -38, 2.3, 3.3, '#3c4564');
        ellipse(c, 8, -38, 2.3, 3.3, '#3c4564');
        ellipse(c, -7.5, -39, .75, .9, '#ffffff');
        ellipse(c, 7.5, -39, .75, .9, '#ffffff');
      } else {
        stroke(c, [[-10, -37], [-4, -37]], '#3c4564', 2);
        stroke(c, [[5, -37], [11, -37]], '#3c4564', 2);
      }
      ellipse(c, -15, -32, 4, 2.5, '#ffb7ad');
      ellipse(c, 15, -32, 4, 2.5, '#ffb7ad');
      c.beginPath(); c.arc(1, -32, 4, .25, Math.PI - .25);
      c.lineWidth = 1.6; c.strokeStyle = '#8d586d'; c.stroke();
    }
    if (jumping) {
      ellipse(c, 27, -53, 3.5, 3.5, '#c8fff1');
      ellipse(c, 33, -64, 2.1, 2.1, '#c8fff1a6');
    }
    c.restore();
  }
  function hud(c, game, view, score) {
    rounded(c, 12, 11, 148, 54, 15, '#062e47b8');
    rounded(c, 13, 12, 146, 52, 14, '#0b4f65ad');
    c.textAlign = 'left'; c.fillStyle = '#aeede5'; c.font = `11px ${FONT}`;
    c.fillText('SCORE', 25, 28);
    c.font = `24px ${FONT}`; c.fillStyle = '#fffbea';
    c.fillText(score.toLocaleString('ko-KR'), 25, 54);
    rounded(c, 245, 14, 103, 41, 15, '#063d5fc7');
    pearl(c, 265, 34, 0, 8);
    c.font = `17px ${FONT}`; c.fillStyle = '#fffbe5';
    c.fillText(String(game.pearls), 281, 39);
    rounded(c, 12, 76, 118, 30, 13, '#064058a8');
    c.fillStyle = '#ffb0ae'; c.font = `17px ${FONT}`;
    c.fillText('♥'.repeat(game.hearts) + '♡'.repeat(3 - game.hearts), 25, 97);
    rounded(c, 150, 79, 198, 26, 13, '#073f5ba3');
    c.textAlign = 'center'; c.font = `12px ${FONT}`; c.fillStyle = '#e0fff4';
    c.fillText(ZONES[game.stage].name + (game.shielded ? ' · 보호막!' : ''), 248, 97);
    if (game.combo >= 3) {
      c.font = `16px ${FONT}`; c.fillStyle = '#ffe6a4';
      c.fillText(`${game.combo} COMBO`, 180, 130);
    }
    rounded(c, 51, view.h - 37, 258, 28, 14, '#073c57a9');
    c.font = `11px ${FONT}`; c.fillStyle = '#e3fff3';
    c.fillText('왼쪽 탭 점프  ·  오른쪽 탭 슬라이드', 180, view.h - 19);
    c.textAlign = 'left';
  }
  function overlay(c, view, title, description) {
    c.fillStyle = '#052d4e81'; c.fillRect(0, 0, W, view.h);
    rounded(c, 36, view.h * .39, 288, 116, 24, '#eafff3ef');
    c.textAlign = 'center'; c.fillStyle = '#21637c';
    c.font = `28px ${FONT}`; c.fillText(title, 180, view.h * .39 + 49);
    c.font = `13px ${FONT}`; c.fillStyle = '#457c8d';
    c.fillText(description, 180, view.h * .39 + 78); c.textAlign = 'left';
  }

  function create(api) {
    const reduced = reducedMotion();
    let time = 0, distance = 0, speed = 244, offset = 0, vy = 0;
    let jumps = 0, slide = 0, hearts = 3, invulnerable = 0, shielded = false;
    let hazardIn = 1.45, pearlIn = 1, shieldIn = 18;
    let hazards = [], pickups = [], effects = [];
    let pearls = 0, combo = 0, lastScore = -1, ended = false, paused = false;
    let stage = 0, shake = 0, flash = 0, dustIn = 0, musicTick = .16, note = 0;
    let musicOn = safeGet('ojjuda:runner:music') !== 'off';
    let audio = null;
    const score = () => Math.floor(distance / 9) + pearls * 25 + Math.floor(combo * 8);
    function ensureAudio() {
      if (!musicOn || audio) { if (audio?.state === 'suspended') void audio.resume().catch(() => {}); return; }
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') void audio.resume().catch(() => {});
      } catch { audio = null; }
    }
    function tone(frequency, duration, volume, wave = 'sine') {
      if (!musicOn || !audio || audio.state !== 'running') return;
      try {
        const now = audio.currentTime, oscillator = audio.createOscillator(), gain = audio.createGain();
        oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(now); oscillator.stop(now + duration + .02);
      } catch { /* audio is optional */ }
    }
    function music() {
      const frequency = MELODY[note++ % MELODY.length];
      tone(frequency / 2, .19, .011, 'triangle');
      if (note % 4 === 0) tone(frequency, .17, .008);
    }
    function sound(kind) {
      if (kind === 'jump' || kind === 'slide') api.sound?.tap?.();
      else if (kind === 'pearl' || kind === 'shield') api.sound?.hit?.();
      else if (kind === 'hurt') api.sound?.bad?.() || api.sound?.hit?.();
    }
    function particle(x, y, kind, count = 7) {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU, velocity = 25 + Math.random() * 75;
        effects.push({ x, y, vx: Math.cos(a) * velocity, vy: Math.sin(a) * velocity - 40,
          life: .55 + Math.random() * .35, max: .9, kind });
      }
    }
    function jump() {
      if (paused || ended || jumps >= 2) return;
      ensureAudio(); slide = 0; vy = jumps === 0 ? -660 : -630; jumps++;
      particle(96, GROUND + offset - 5, 'foam', 6); sound('jump');
    }
    function crouch() {
      if (paused || ended || offset < -5) return;
      ensureAudio(); slide = Math.max(slide, .72);
      particle(82, GROUND - 10, 'foam', 5); sound('slide');
    }
    function togglePause() {
      if (ended) return;
      paused = !paused;
      const button = document.querySelector('#gov [data-g="key:p"]');
      if (button) { button.textContent = paused ? '▶ 계속' : 'Ⅱ 일시정지'; button.setAttribute('aria-pressed', String(paused)); }
    }
    function toggleMusic() {
      musicOn = !musicOn; safeSet('ojjuda:runner:music', musicOn ? 'on' : 'off');
      if (musicOn) ensureAudio();
      const button = document.querySelector('#gov [data-g="key:m"]');
      if (button) { button.textContent = musicOn ? '♫ 음악 켜짐' : '♪ 음악 꺼짐'; button.setAttribute('aria-pressed', String(musicOn)); }
    }
    function spawnHazard() {
      const r = Math.random();
      const kind = time > 5 && r < .32 ? 'jelly' : r < .59 ? 'urchin' : 'coral';
      const w = kind === 'jelly' ? 45 : kind === 'urchin' ? 31 : 34;
      const h = kind === 'jelly' ? 43 : kind === 'urchin' ? 31 : 61;
      const y = kind === 'jelly' ? GROUND - 82 : GROUND - h;
      hazards.push({ x: W + 32, y, w, h, kind });
    }
    function spawnPearls() {
      const r = Math.random(), high = r > .46;
      const top = high ? GROUND - 88 : GROUND - 32;
      for (let i = 0; i < 4; i++) {
        const arc = high ? -Math.sin(i * Math.PI / 3) * 20 : 0;
        pickups.push({ x: W + 25 + i * 26, y: top + arc, kind: 'pearl' });
      }
    }
    function hit() {
      if (invulnerable > 0 || ended) return;
      if (shielded) {
        shielded = false; invulnerable = .75;
        particle(96, GROUND + offset - 30, 'shield', 18); sound('shield'); return;
      }
      hearts--; combo = 0; invulnerable = 1.4; shake = 12; flash = .23;
      particle(96, GROUND + offset - 35, 'hit', 20); sound('hurt');
      if (hearts <= 0) {
        ended = true; api.setScore(score()); api.end(score());
      }
    }
    const game = {
      controls: '<div class="jju-controls" role="group" aria-label="쭈달리기 조작">' +
        '<button type="button" class="jju-key jump" data-g="key:ArrowUp">↑ 점프 <small>2단 점프</small></button>' +
        '<button type="button" class="jju-key slide" data-g="key:ArrowDown">↓ 슬라이드 <small>해파리 피하기</small></button>' +
        '<button type="button" class="jju-mini" data-g="key:p" aria-pressed="false">Ⅱ 일시정지</button>' +
        `<button type="button" class="jju-mini" data-g="key:m" aria-pressed="${musicOn}">${musicOn ? '♫ 음악 켜짐' : '♪ 음악 꺼짐'}</button>` +
        '</div>',
      update(dt) {
        if (ended || paused) return;
        dt = Math.max(0, Math.min(.05, Number(dt) || 0));
        if (!dt) return;
        time += dt;
        speed = Math.min(468, 244 + time * 5.6);
        distance += speed * dt;
        stage = Math.floor(distance / 1500) % ZONES.length;
        slide = Math.max(0, slide - dt);
        invulnerable = Math.max(0, invulnerable - dt);
        shake = Math.max(0, shake - dt * 38);
        flash = Math.max(0, flash - dt);
        const wasAir = offset < 0;
        vy += 1790 * dt; offset += vy * dt;
        if (offset >= 0) {
          offset = 0; vy = 0; jumps = 0;
          if (wasAir) particle(96, GROUND - 3, 'foam', 8);
        }
        hazardIn -= dt;
        if (hazardIn <= 0) {
          spawnHazard();
          hazardIn = Math.max(.9, 1.6 - time * .006) + Math.random() * .45;
        }
        pearlIn -= dt;
        if (pearlIn <= 0) { spawnPearls(); pearlIn = 1.55 + Math.random() * 1.1; }
        shieldIn -= dt;
        if (shieldIn <= 0) {
          pickups.push({ x: W + 34, y: GROUND - 65, kind: 'shield' });
          shieldIn = 22 + Math.random() * 12;
        }
        for (const item of hazards) item.x -= speed * dt;
        for (const item of pickups) item.x -= speed * dt;
        hazards = hazards.filter(item => item.x + item.w > -40);
        pickups = pickups.filter(item => item.x > -32 && !item.got);
        for (const p of effects) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt; p.life -= dt; }
        effects = effects.filter(p => p.life > 0);
        dustIn -= dt;
        if (offset === 0 && !slide && !reduced && dustIn <= 0) {
          dustIn = .16; particle(87, GROUND - 2, 'foam', 1);
        }
        const sliding = slide > 0 && offset === 0;
        const box = sliding
          ? { l: 75, r: 119, t: GROUND - 25, b: GROUND - 2 }
          : { l: 78, r: 111, t: GROUND + offset - 57, b: GROUND + offset - 3 };
        for (const item of hazards) {
          const inset = item.kind === 'urchin' ? 2 : 4;
          if (item.x + item.w - inset > box.l && item.x + inset < box.r &&
              item.y + item.h - inset > box.t && item.y + inset < box.b) {
            hit(); if (ended) break;
          }
        }
        for (const item of pickups) {
          if (Math.abs(item.x - (box.l + box.r) / 2) < 22 &&
              item.y > box.t - 13 && item.y < box.b + 13) {
            item.got = true;
            if (item.kind === 'shield') { shielded = true; sound('shield'); particle(item.x, item.y, 'shield', 13); }
            else { pearls++; combo++; sound('pearl'); particle(item.x, item.y, 'pearl', 7); }
          }
        }
        const next = score();
        if (lastScore !== next) { lastScore = next; api.setScore(next); }
        musicTick -= dt;
        if (musicTick <= 0) { musicTick += .27; if (musicOn) music(); }
      },
      draw(c) {
        const view = fit(c);
        const dx = !reduced && shake ? Math.sin(time * 44) * shake * .5 : 0;
        c.save(); c.translate(dx, 0);
        sea(c, distance, time, view, stage, reduced);
        c.save(); c.translate(0, view.ground - GROUND);
        for (const item of hazards) drawObstacle(c, item, time, reduced, stage);
        for (const item of pickups) {
          if (!item.got) {
            if (item.kind === 'shield') shield(c, item.x, item.y, time);
            else pearl(c, item.x, item.y, time);
          }
        }
        ellipse(c, 96, GROUND + 3, Math.max(10, 20 + offset / 18), 3, '#315b6e57');
        if (invulnerable <= 0 || Math.floor(time * 12) % 2 === 0) {
          hero(c, 96, GROUND + offset, time, offset < 0, slide > 0, Math.sin(time * 1.7) > .994, shielded, reduced);
        }
        for (const p of effects) {
          c.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
          if (p.kind === 'foam') bubble(c, p.x, p.y, 2 + p.life * 3, .8);
          else sparkle(c, p.x, p.y, p.kind === 'pearl' ? 4 : 6,
            p.kind === 'pearl' ? '#fffece' : p.kind === 'hit' ? '#ffb4ab' : '#d5fff9');
        }
        c.globalAlpha = 1; c.restore();
        foreground(c, distance, time, view, reduced);
        if (flash > 0) { c.fillStyle = `rgba(255,190,187,${Math.min(.33, flash)})`; c.fillRect(0, 0, W, view.h); }
        hud(c, { hearts, pearls, combo, stage, shielded }, view, score());
        if (paused) overlay(c, view, '잠깐 쉬어가요', '아래 계속 버튼을 누르면 다시 달려요.');
        c.restore();
      },
      onDown(x) { if (x >= W * .62) crouch(); else jump(); },
      onSwipe(direction) { if (direction === 'D') crouch(); else if (direction === 'U') jump(); },
      onKey(key) {
        if (['ArrowUp', ' ', 'w', 'W', 'Enter'].includes(key)) { jump(); return true; }
        if (['ArrowDown', 's', 'S', 'Shift', 'c', 'C'].includes(key)) { crouch(); return true; }
        if (key === 'p' || key === 'P') { togglePause(); return true; }
        if (key === 'm' || key === 'M') { toggleMusic(); return true; }
        return false;
      },
      get state() { return { hearts, pearls, combo, distance, jumps, sliding: slide > 0,
        paused, ended, stage, shielded, score: score() }; },
      destroy() {
        ended = true; hazards = []; pickups = []; effects = [];
        if (audio) { void audio.close().catch(() => {}); audio = null; }
      }
    };
    ensureAudio();
    return game;
  }
  function drawPreview(c) {
    const view = fit(c), stage = 0;
    c.save(); sea(c, 340, .3, view, stage, true);
    c.save(); c.translate(0, view.ground - GROUND);
    drawObstacle(c, { x: 264, y: GROUND - 31, w: 31, h: 31, kind: 'urchin' }, 0, true, stage);
    hero(c, 147, GROUND - 18, .2, true, false, false, false, true);
    for (let i = 0; i < 4; i++) pearl(c, 224 + i * 23, GROUND - 90 - Math.sin(i * .9) * 18, .5, 8);
    c.restore(); foreground(c, 340, 0, view, true);
    c.textAlign = 'center'; c.font = `42px ${FONT}`; c.lineWidth = 6;
    c.strokeStyle = '#0a4d71'; c.lineJoin = 'round';
    c.strokeText('쭈달리기', 180, Math.min(164, view.h * .27));
    c.fillStyle = '#fff5ce'; c.fillText('쭈달리기', 180, Math.min(164, view.h * .27));
    rounded(c, 111, Math.min(174, view.h * .29), 138, 25, 12, '#074e67b6');
    c.font = `13px ${FONT}`; c.fillStyle = '#c6fff1';
    c.fillText('바닷속 러시', 180, Math.min(192, view.h * .29 + 18));
    c.textAlign = 'left'; c.restore();
  }
  function soundIcon(value) {
    const off = value === '🔇';
    return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>' +
      (off ? '<path d="m17 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' :
        '<path d="M17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>') + '</svg>';
  }
  function shoeIcon() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M4 13c3-4 5-8 9-8 4 0 6 4 6 8s-3 7-8 7S4 17 4 13Z" fill="#ff9cac"/><circle cx="9" cy="12" r="1.5" fill="#264e62"/><circle cx="16" cy="12" r="1.5" fill="#264e62"/><path d="M9 16q3 3 6 0" stroke="#9a5367" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }
  window.OjjudaRunnerGame = { create, drawPreview, soundIcon, shoeIcon, get ready() { return Promise.resolve(true); } };
})();
