/* 쭈달리기 · 바닷속 러시
 * Ojjuda-original canvas artwork, synthesized BGM, and self-contained gameplay.
 * The public Ojjuda arcade supplies the score recorder and sound-effect switch.
 */
(() => {
  'use strict';

  // A landscape playfield, matching the intended 16:9 side-scrolling composition.
  const W = 960;
  const H = 540;
  const GROUND = 465;
  const HERO_X = 246;
  const HERO_SCALE = 1.35;
  const TAU = Math.PI * 2;
  const FONT = '"Jua","Gowun Dodum","Apple SD Gothic Neo",sans-serif';
  const ZONES = [
    { name: '산호 정원', deep: '#e4faff', mid: '#a1e5f0', light: '#6dc6da', reef: '#a5d0cc', coral: '#ff6c85' },
    { name: '물빛 해초숲', deep: '#ebfff5', mid: '#a6e3d6', light: '#70c6bc', reef: '#9fccc1', coral: '#ffad6d' },
    { name: '별빛 진주동굴', deep: '#e6eeff', mid: '#b4cbed', light: '#7cadd5', reef: '#9cadce', coral: '#e28bdf' }
  ];
  // Ground shapes require a jump; suspended shapes are designed for a slide.
  const OBSTACLES = Object.freeze([
    { kind: 'urchin', name: '가시 성게', w: 47, h: 48, lane: 'ground' },
    { kind: 'coral', name: '불꽃 산호', w: 58, h: 89, lane: 'ground' },
    { kind: 'crab', name: '집게 게', w: 82, h: 60, lane: 'ground' },
    { kind: 'clam', name: '가시 조개', w: 78, h: 58, lane: 'ground' },
    { kind: 'rock', name: '검은 암초', w: 77, h: 82, lane: 'ground' },
    { kind: 'puffer', name: '복어 폭탄', w: 70, h: 70, lane: 'ground' },
    { kind: 'star', name: '가시 불가사리', w: 68, h: 69, lane: 'ground' },
    { kind: 'jelly', name: '독 해파리', w: 83, h: 77, lane: 'air' },
    { kind: 'mine', name: '심해 기뢰', w: 73, h: 73, lane: 'air' },
    { kind: 'eel', name: '번개 장어', w: 110, h: 59, lane: 'air' },
    { kind: 'shark', name: '심해 상어', w: 162, h: 83, lane: 'high' }
  ]);
  const REGULAR_OBSTACLES = OBSTACLES.filter(item => item.lane !== 'high');
  // Each shark varies its pace while staying faster than the scrolling seafloor.
  function sharkSpeed(shark, groundSpeed, time) {
    return Math.max(groundSpeed + 65,
      groundSpeed * (shark.pace + Math.sin(time * 4.5 + shark.phase) * .09));
  }
  const MELODY = [392, 440, 523.25, 587.33, 523.25, 440, 349.23, 392,
    392, 523.25, 659.25, 587.33, 523.25, 440, 392, 329.63];
  const safeGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const safeSet = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };
  const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function fit(c) {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (c.canvas.width !== pw || c.canvas.height !== ph) {
      c.canvas.width = pw;
      c.canvas.height = ph;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { h: H, ground: GROUND };
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
  function fish(c, x, y, size, color) {
    c.save(); c.translate(x, y);
    c.beginPath(); c.moveTo(-size * .6, 0);
    c.lineTo(-size * 1.1, -size * .48); c.lineTo(-size * 1.1, size * .48); c.closePath();
    c.fillStyle = color; c.fill();
    ellipse(c, 0, 0, size, size * .55, color);
    ellipse(c, size * .48, -size * .12, 1.25, 1.25, '#ffffffb0');
    c.restore();
  }
  function reefGlider(c, x, y, size, time, warm) {
    c.save(); c.translate(x, y + Math.sin(time * 2 + x * .01) * 5);
    // Decorative fish belong to the distance plane, never the danger plane.
    c.globalAlpha = .28;
    c.rotate(Math.sin(time * 1.1) * .08);
    c.beginPath(); c.moveTo(-size * .52, 0);
    c.lineTo(-size * 1.25, -size * .63);
    c.quadraticCurveTo(-size * 1.4, 0, -size * 1.25, size * .63);
    c.closePath(); c.fillStyle = warm ? '#ffb778' : '#83efd6'; c.fill();
    c.lineWidth = 3.8; c.strokeStyle = '#315171'; c.stroke();
    c.beginPath(); c.moveTo(-size * .71, 0);
    c.bezierCurveTo(-size * .25, -size * .9, size * .77, -size * .68, size, 0);
    c.bezierCurveTo(size * .68, size * .66, -size * .31, size * .88, -size * .71, 0);
    c.closePath(); c.fillStyle = gradient(c, -size, -size, size, size,
      warm ? [[0, '#fff2a1'], [.55, '#ffad98'], [1, '#f080aa']] :
        [[0, '#f9ffbf'], [.52, '#8aeb9b'], [1, '#3abaad']]);
    c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-size * .36, -size * .5);
    c.lineTo(-size * .16, -size * .81); c.lineTo(size * .17, -size * .61);
    c.fillStyle = warm ? '#f285a5' : '#51c6bf'; c.fill(); c.stroke();
    ellipse(c, size * .42, -size * .15, size * .11, size * .13, '#30425c');
    ellipse(c, size * .44, -size * .2, size * .035, size * .04, '#fff');
    stroke(c, [[size * .49, size * .21], [size * .64, size * .24]], '#59607a', 1.6);
    ellipse(c, -size * .38, size * .06, size * .08, size * .1, '#fff2df9a');
    c.restore();
  }
  function seaFan(c, x, bottom, height, phase, color) {
    c.save(); c.translate(x, bottom);
    for (let i = -2; i <= 2; i++) {
      c.beginPath(); c.moveTo(0, 0);
      const sway = Math.sin(phase + i * .8) * 7;
      c.bezierCurveTo(i * 9, -height * .42, i * 13 + sway, -height * .79, i * 18 + sway, -height * (1 - Math.abs(i) * .075));
      c.strokeStyle = color; c.lineCap = 'round'; c.lineWidth = 7 - Math.abs(i); c.stroke();
      ellipse(c, i * 18 + sway, -height * (1 - Math.abs(i) * .075), 5, 7, '#ffefb184');
    }
    c.restore();
  }
  function reefTower(c, x, base, height, color, phase) {
    c.save(); c.translate(x, base);
    c.fillStyle = color;
    c.beginPath(); c.moveTo(-43, 0);
    c.bezierCurveTo(-51, -height * .18, -22, -height * .25, -25, -height * .47);
    c.bezierCurveTo(-36, -height * .72, -2, -height * .77, -7, -height);
    c.bezierCurveTo(10, -height * 1.06, 33, -height * .82, 21, -height * .59);
    c.bezierCurveTo(44, -height * .44, 36, -height * .21, 57, 0); c.closePath(); c.fill();
    c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let k = 0; k < 3; k++) {
      const side = k % 2 ? 1 : -1, yy = -height * (.42 + k * .19);
      c.lineWidth = Math.max(8, 22 - k * 4);
      c.beginPath(); c.moveTo(side * 7, yy + 30);
      c.bezierCurveTo(side * 49, yy + 6, side * 68, yy + 14, side * (62 + k * 11), yy - 54);
      c.stroke();
      ellipse(c, side * (62 + k * 11), yy - 54, 15, 9, color);
    }
    c.globalAlpha = .36;
    stroke(c, [[-2, -height * .91], [-10 + Math.sin(phase) * 3, -height * .71], [-8, -height * .52]], '#e5fff6', 4);
    c.restore();
  }
  function sea(c, dist, time, view, stage, reduced = false) {
    const z = ZONES[stage];
    c.fillStyle = gradient(c, 0, 0, 0, view.h, [[0, z.deep], [.55, z.mid], [1, z.light]]);
    c.fillRect(0, 0, W, view.h);
    const sun = c.createRadialGradient(160, -34, 3, 160, -34, 650);
    sun.addColorStop(0, '#ffffffec'); sun.addColorStop(.25, '#fff6d285'); sun.addColorStop(1, '#dcfff000');
    c.fillStyle = sun; c.fillRect(0, 0, W, view.h);
    for (let i = 0; i < 8; i++) {
      const x = -210 + i * 138 + Math.sin(time * .18 + i) * (reduced ? 0 : 10);
      c.fillStyle = i % 2 ? '#fbffff18' : '#ffffff31';
      c.beginPath(); c.moveTo(x - 30, 0); c.lineTo(x + 40, 0);
      c.lineTo(x + 300, view.ground); c.lineTo(x + 130, view.ground); c.closePath(); c.fill();
    }
    const far = dist * .055;
    c.fillStyle = '#b1e7dc54';
    c.beginPath(); c.moveTo(0, view.ground - 116);
    for (let x = -20; x <= W + 20; x += 18) {
      const h = Math.sin((x + far) * .011) * 32 + Math.sin((x + far) * .033) * 14;
      c.lineTo(x, view.ground - 162 + h);
    }
    c.lineTo(W, view.ground); c.lineTo(0, view.ground); c.closePath(); c.fill();
    // Slow silhouettes make a large-scale underwater world, not a tiled wallpaper.
    for (let i = 0; i < 9; i++) {
      const x = ((i * 238 - dist * .09) % 2142 + 2142) % 2142 - 250;
      reefTower(c, x, view.ground + 40, 230 + i % 4 * 68,
        i % 2 ? '#a3d1d76b' : '#9bc6d36a', time + i);
    }
    for (let i = 0; i < 12; i++) {
      const x = ((i * 163 - dist * .18) % 1956 + 1956) % 1956 - 180;
      ellipse(c, x, view.ground + 6, 75 + i % 3 * 30, 85 + i % 4 * 15,
        i % 3 ? '#a6d5d96b' : '#d3e6dc78');
      ellipse(c, x - 32, view.ground - 65, 40, 55, '#e5edd77a');
      if (i % 2 === 0) seaFan(c, x + 32, view.ground - 30, 115 + i % 3 * 26,
        reduced ? i : time * .6 + i, i % 3 ? '#b0d7c681' : '#ebdcb587');
    }
    for (let i = 0; i < 20; i++) {
      const x = ((i * 113 - dist * (i % 2 ? .28 : .14)) % 2260 + 2260) % 2260 - 120;
      const y = 95 + i % 6 * 50 + (reduced ? 0 : Math.sin(time * 1.2 + i) * 8);
      fish(c, x, y, 5 + i % 3 * 3, i % 2 ? '#fff6d95e' : '#eafff270');
    }
    for (let i = 0; i < 6; i++) {
      const x = ((i * 287 - dist * .24) % 1722 + 1722) % 1722 - 100;
      const y = 157 + i % 3 * 83;
      reefGlider(c, x, y, 19 + i % 3 * 5, reduced ? 0 : time + i, i % 3 === 1);
    }
    for (let i = 0; i < 44; i++) {
      const x = ((i * 127 - dist * (.17 + i % 4 * .04)) % 5588 + 5588) % 5588 - 60;
      const y = view.h - ((i * 87 + (reduced ? 0 : time * (16 + i % 5 * 4))) % (view.h + 150));
      bubble(c, x, y, 2 + i % 4 * 1.8, .23 + i % 3 * .1);
      if (i % 9 === 2) sparkle(c, x - 12, y - 14, 3, '#fffdf69c', time * .6);
    }
    c.fillStyle = '#ffffff0e'; c.fillRect(0, 0, W, view.ground - 5);
    // The sandy running track has a bold turquoise outline and a moving tile pattern.
    c.fillStyle = gradient(c, 0, view.ground, 0, view.h,
      [[0, '#f2caa7'], [.55, '#d9a981'], [1, '#c38a70']]);
    c.fillRect(0, view.ground, W, view.h - view.ground);
    for (let i = 0; i < 36; i++) {
      const x = ((i * 37 - dist * .94) % 1332 + 1332) % 1332 - 30;
      ellipse(c, x, view.ground + 29 + i % 4 * 17,
        5 + i % 4 * 2.4, 3 + i % 3 * 2, i % 3 ? '#a66d5d6b' : '#eac29b8c');
      if (i % 3 === 0) ellipse(c, x + 12, view.ground + 40 + i % 2 * 18, 2.2, 2.2, '#fff1c2a3');
    }
    c.strokeStyle = '#086e89'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(0, view.ground + 2); c.lineTo(W, view.ground + 2); c.stroke();
    c.strokeStyle = '#37efd6'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(0, view.ground); c.lineTo(W, view.ground); c.stroke();
    for (let i = 0; i < 40; i++) {
      const x = ((i * 29 - dist * .94) % 1160 + 1160) % 1160 - 20;
      ellipse(c, x, view.ground + 3, 10 + i % 2 * 4, 7 + i % 3 * 2, '#3eeacb');
    }
    if (stage === 2) for (let i = 0; i < 8; i++)
      sparkle(c, 22 + i * 119, 62 + i % 4 * 43, 2 + i % 2, '#ecedff9c', time * .2 + i);
  }
  function foreground(c, dist, time, view, reduced) {
    for (let i = 0; i < 20; i++) {
      const x = ((i * 69 - dist * 1.15) % 1380 + 1380) % 1380 - 55;
      kelp(c, x, view.ground + 27, 21 + i % 3 * 9,
        reduced ? i : time * 2 + i, i % 2 ? '#2b987f' : '#197e79');
      if (i % 2 === 0) {
        ellipse(c, x + 23, view.ground + 6, 10, 5, '#fc8f95');
        sparkle(c, x + 24, view.ground + 1, 2.4, '#fff6cb');
      }
    }
  }
  function pearl(c, x, y, time, size = 14) {
    const pulse = 1 + Math.sin(time * 6 + x * .02) * .08;
    c.save(); c.translate(x, y); c.scale(pulse, pulse);
    const glow = c.createRadialGradient(0, 0, 1, 0, 0, size * 2.3);
    glow.addColorStop(0, '#fff9e9b9'); glow.addColorStop(1, '#d1fffd00');
    c.fillStyle = glow; c.fillRect(-size * 2.3, -size * 2.3, size * 4.6, size * 4.6);
    ellipse(c, -size * .98, 1, size * .42, size * .56, '#ad439dbb');
    ellipse(c, size * .98, 1, size * .42, size * .56, '#ad439dbb');
    ellipse(c, 0, 2, size + 2, size + 2, '#583774');
    ellipse(c, 0, 0, size, size, gradient(c, -size, -size, size, size,
      [[0, '#fff7fc'], [.45, '#ffb1df'], [1, '#c36dd5']]));
    ellipse(c, -size * .27, -size * .35, size * .3, size * .2, '#ffffffed');
    sparkle(c, size * .78, -size * .76, size * .38, '#fffcea');
    c.restore();
  }
  function shield(c, x, y, time) {
    bubble(c, x, y, 23 + Math.sin(time * 3) * 1.5, 1);
    sparkle(c, x, y, 15, '#fff0a5', Math.sin(time * 2) * .2);
    ellipse(c, x, y, 5, 5, '#ffcf70');
  }
  function urchin(c, x, y, w, h, time) {
    const cx = x + w / 2, cy = y + h / 2;
    c.save(); c.translate(cx, cy); c.scale(w / 34, h / 34);
    c.rotate(Math.sin(time * 1.7 + x) * .08);
    for (let i = 0; i < 12; i++) {
      const a = TAU * i / 12;
      stroke(c, [[Math.cos(a) * 10, Math.sin(a) * 10],
        [Math.cos(a) * 20, Math.sin(a) * 20]], '#344666', 5);
    }
    ellipse(c, 0, 0, 15, 14, '#374360');
    ellipse(c, 0, -1, 12, 12, gradient(c, 0, -12, 0, 13,
      [[0, '#e0b2fa'], [1, '#8565bd']]));
    ellipse(c, -5, -2, 2, 3, '#232e4c');
    ellipse(c, 5, -2, 2, 3, '#232e4c');
    ellipse(c, -5.5, -3, .7, .9, '#fff');
    ellipse(c, 4.5, -3, .7, .9, '#fff');
    ellipse(c, 0, 4, 3, 1.7, '#d2b6df'); c.restore();
  }
  function coral(c, x, y, w, h, time, color) {
    c.save(); c.translate(x + w / 2, y + h);
    const drift = Math.sin(time * .9 + x) * 1.4;
    const spine = [[0, 0], [0, -h * .58], [-4 + drift, -h]];
    const left = [[0, -h * .28], [-w * .38, -h * .56], [-w * .32 + drift, -h * .87]];
    const right = [[0, -h * .37], [w * .39, -h * .59], [w * .32 + drift, -h * .94]];
    for (const path of [spine, left, right]) stroke(c, path, '#253650', 16);
    stroke(c, spine, '#e34d77', 11);
    stroke(c, left, color, 11);
    stroke(c, right, '#ff865e', 11);
    stroke(c, [[-2, -h * .33], [-5, -h * .76]], '#ffd3a4', 3.5);
    stroke(c, [[w * .12, -h * .48], [w * .32, -h * .77]], '#ffd7bd', 3.5);
    for (const [xx, yy] of [[-4 + drift, -h], [w * .32 + drift, -h * .94], [-w * .32 + drift, -h * .87]]) {
      ellipse(c, xx, yy, 7, 7, '#243c57');
      ellipse(c, xx, yy, 4, 4, '#fff0bd');
    }
    c.restore();
  }
  function jelly(c, x, y, w, h, time, reduced) {
    c.save(); c.translate(x + w / 2, y + h / 2);
    const bob = reduced ? 0 : Math.sin(time * 4 + x * .01) * 2;
    c.translate(0, bob);
    for (let i = -2; i <= 2; i++) {
      c.beginPath(); c.moveTo(i * 7, 3);
      c.quadraticCurveTo(i * 6 + Math.sin(time * 5 + i) * 4, 15, i * 7, h * .48);
      c.strokeStyle = '#2c3d61'; c.lineWidth = 6; c.stroke();
      c.strokeStyle = '#f65bc8'; c.lineWidth = 3; c.stroke();
    }
    c.beginPath(); c.moveTo(-w * .49, 3);
    c.bezierCurveTo(-w * .5, -h * .66, -w * .13, -h * .85, 0, -h * .7);
    c.bezierCurveTo(w * .34, -h * .85, w * .51, -h * .38, w * .49, 3);
    c.quadraticCurveTo(w * .25, 10, 0, 4);
    c.quadraticCurveTo(-w * .25, 10, -w * .49, 3);
    c.fillStyle = gradient(c, 0, -h * .8, 0, h * .25,
      [[0, '#ffd4fc'], [.58, '#b65dea'], [1, '#7650b9']]); c.fill();
    c.lineWidth = 4.5; c.strokeStyle = '#29375d'; c.stroke();
    ellipse(c, -6, -6, 2.1, 2.4, '#513e72');
    ellipse(c, 6, -6, 2.1, 2.4, '#513e72');
    ellipse(c, 0, 0, 3, 1.4, '#fcf1ff');
    ellipse(c, -w * .25, -h * .36, 5.5, 3.5, '#ffffff70');
    c.restore();
  }
  function crab(c, x, y, w, h, time) {
    c.save(); c.translate(x + w / 2, y + h / 2); c.scale(w / 82, h / 60);
    const wave = Math.sin(time * 10) * 3;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const p = [[side * 18, i * 6], [side * (30 + i * 2), 8 + i * 6], [side * (36 + i * 2), 17 + i * 5]];
        stroke(c, p, '#25334c', 7); stroke(c, p, '#f27756', 4);
      }
      stroke(c, [[side * 24, -7], [side * 38, -22 + side * wave]], '#26354e', 11);
      stroke(c, [[side * 24, -7], [side * 38, -22 + side * wave]], '#ff9361', 7);
      ellipse(c, side * 39, -22 + side * wave, 11, 12, '#25334e');
      ellipse(c, side * 39, -23 + side * wave, 8, 9, '#ff9e69');
      c.beginPath(); c.moveTo(side * 42, -22 + side * wave);
      c.lineTo(side * 50, -32 + side * wave); c.lineTo(side * 48, -18 + side * wave);
      c.fillStyle = '#27364f'; c.fill();
    }
    ellipse(c, 0, 4, 29, 22, '#26354f');
    ellipse(c, 0, 1, 26, 19, gradient(c, 0, -19, 0, 20,
      [[0, '#ffcc88'], [.45, '#ff705f'], [1, '#bb3b59']]));
    for (const a of [-12, 12]) {
      stroke(c, [[a, -11], [a, -24]], '#25334d', 6);
      ellipse(c, a, -25, 6.8, 7.3, '#25334d');
      ellipse(c, a, -25, 5, 5.4, '#ffffff');
      ellipse(c, a + 1, -24, 2.4, 3.4, '#25334d');
    }
    stroke(c, [[-8, 10], [0, 14], [8, 10]], '#562e50', 2.6);
    c.restore();
  }
  function clam(c, x, y, w, h, time) {
    c.save(); c.translate(x + w / 2, y + h / 2); c.scale(w / 78, h / 58);
    rounded(c, -36, 8, 72, 19, 9, '#223b58');
    rounded(c, -31, 10, 62, 12, 7, '#8554b7');
    c.beginPath(); c.moveTo(-36, 9);
    c.quadraticCurveTo(-37, -18, -24, -20);
    c.quadraticCurveTo(-15, -36, -1, -25);
    c.quadraticCurveTo(11, -39, 24, -20);
    c.quadraticCurveTo(38, -13, 36, 9); c.closePath();
    c.fillStyle = gradient(c, -20, -28, 18, 20,
      [[0, '#d9adff'], [.48, '#9a6bd5'], [1, '#59449a']]);
    c.fill(); c.strokeStyle = '#243752'; c.lineWidth = 4.5; c.stroke();
    for (let i = -2; i <= 2; i++) stroke(c, [[0, 10], [i * 13, -19 - (i % 2 ? 4 : 9)]], '#614489', 3);
    for (let i = -3; i <= 3; i++) {
      c.beginPath(); c.moveTo(i * 10 - 3, -18); c.lineTo(i * 10 + 2, -33);
      c.lineTo(i * 10 + 7, -16); c.closePath();
      c.fillStyle = '#26334e'; c.fill();
      c.beginPath(); c.moveTo(i * 10, -19); c.lineTo(i * 10 + 2, -27);
      c.lineTo(i * 10 + 4, -18); c.fillStyle = '#f3c872'; c.fill();
    }
    ellipse(c, -9, 5, 3, 3, '#ffe4f7'); ellipse(c, 9, 5, 3, 3, '#ffe4f7');
    c.restore();
  }
  function rock(c, x, y, w, h, time) {
    c.save(); c.translate(x, y); c.scale(w / 77, h / 82);
    c.beginPath(); c.moveTo(5, 79); c.lineTo(2, 54); c.lineTo(16, 32);
    c.lineTo(11, 15); c.lineTo(37, 2); c.lineTo(59, 19);
    c.lineTo(75, 35); c.lineTo(69, 55); c.lineTo(75, 80); c.closePath();
    c.fillStyle = gradient(c, 0, 0, 75, 75,
      [[0, '#586985'], [.4, '#2e4167'], [1, '#17283e']]);
    c.fill(); c.strokeStyle = '#17283c'; c.lineWidth = 5; c.stroke();
    c.beginPath(); c.moveTo(37, 3); c.lineTo(16, 33); c.lineTo(39, 53);
    c.lineTo(75, 35); c.lineTo(59, 19); c.closePath(); c.fillStyle = '#7d8bab'; c.fill();
    stroke(c, [[36, 7], [34, 30], [48, 41], [37, 62]], '#18263c', 9);
    stroke(c, [[36, 7], [34, 30], [48, 41], [37, 62]], '#ff8a63', 5);
    stroke(c, [[7, 74], [19, 57], [32, 63]], '#f8b676', 3);
    sparkle(c, 52, 24, 4, '#ffe5ac', time * .3);
    c.restore();
  }
  function puffer(c, x, y, w, h, time) {
    c.save(); c.translate(x + w / 2, y + h / 2);
    c.scale(w / 70, h / 70); c.rotate(Math.sin(time * 3) * .06);
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      c.beginPath(); c.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      c.lineTo(Math.cos(a - .1) * 38, Math.sin(a - .1) * 38);
      c.lineTo(Math.cos(a + .1) * 38, Math.sin(a + .1) * 38); c.closePath();
      c.fillStyle = '#27364e'; c.fill();
      stroke(c, [[Math.cos(a) * 24, Math.sin(a) * 24], [Math.cos(a) * 33, Math.sin(a) * 33]], '#ffb45e', 4);
    }
    ellipse(c, 0, 0, 29, 27, '#24364e');
    ellipse(c, 0, -2, 25, 24, gradient(c, 0, -27, 0, 24,
      [[0, '#fff0a2'], [.45, '#ffb750'], [1, '#e35d58']]));
    ellipse(c, -9, -7, 4.2, 5.6, '#27364e');
    ellipse(c, 9, -7, 4.2, 5.6, '#27364e');
    ellipse(c, -10, -9, 1.2, 1.5, '#fff'); ellipse(c, 8, -9, 1.2, 1.5, '#fff');
    ellipse(c, 0, 6, 4.8, 3.5, '#984057');
    c.restore();
  }
  function starHazard(c, x, y, w, h, time) {
    c.save(); c.translate(x + w / 2, y + h / 2);
    c.scale(w / 68, h / 69); c.rotate(Math.sin(time * 2) * .08);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2;
      const r = i % 2 ? 18 : 36;
      const xx = Math.cos(a) * r, yy = Math.sin(a) * r;
      if (!i) c.moveTo(xx, yy); else c.lineTo(xx, yy);
    }
    c.closePath(); c.fillStyle = gradient(c, 0, -35, 0, 35,
      [[0, '#ffc39f'], [.45, '#e45e87'], [1, '#a53675']]);
    c.fill(); c.lineWidth = 5; c.strokeStyle = '#243750'; c.stroke();
    ellipse(c, -8, -1, 2.8, 3.5, '#24334b');
    ellipse(c, 8, -1, 2.8, 3.5, '#24334b');
    stroke(c, [[-4, 9], [1, 12], [5, 8]], '#63345b', 2.5);
    c.restore();
  }
  function mine(c, x, y, w, h, time) {
    c.save(); c.translate(x + w / 2, y + h / 2); c.scale(w / 73, h / 73);
    c.rotate(Math.sin(time * 1.5) * .08);
    for (let i = 0; i < 8; i++) {
      const a = TAU * i / 8;
      stroke(c, [[Math.cos(a) * 22, Math.sin(a) * 22], [Math.cos(a) * 37, Math.sin(a) * 37]], '#273047', 12);
      stroke(c, [[Math.cos(a) * 23, Math.sin(a) * 23], [Math.cos(a) * 35, Math.sin(a) * 35]], '#f2776b', 5);
    }
    ellipse(c, 0, 0, 28, 28, '#1b314d');
    ellipse(c, -2, -4, 24, 24, gradient(c, -20, -22, 22, 26,
      [[0, '#6b789d'], [.5, '#34486d'], [1, '#192f4e']]));
    ellipse(c, 0, 0, 16, 16, '#ef715e');
    ellipse(c, 0, 0, 12, 12, '#ffc07a');
    stroke(c, [[0, -7], [0, 3]], '#744759', 4);
    ellipse(c, 0, 9, 2.8, 2.8, '#744759');
    c.restore();
  }
  function eel(c, x, y, w, h, time) {
    c.save(); c.translate(x, y + h / 2); c.scale(w / 110, h / 59);
    const wave = Math.sin(time * 5 + x * .02) * 6;
    const body = () => {
      c.beginPath(); c.moveTo(9, 8);
      c.bezierCurveTo(33, -24 + wave, 65, 19 - wave, 101, -8);
    };
    body(); c.lineCap = 'round'; c.strokeStyle = '#203550'; c.lineWidth = 34; c.stroke();
    body(); c.strokeStyle = '#28bcb7'; c.lineWidth = 27; c.stroke();
    body(); c.strokeStyle = '#a5f8d1'; c.lineWidth = 8; c.stroke();
    c.beginPath(); c.moveTo(7, 7); c.lineTo(-5, -7); c.lineTo(2, -18);
    c.closePath(); c.fillStyle = '#263d55'; c.fill();
    stroke(c, [[26, -12], [37, -3], [47, -14], [60, 3], [73, -7]], '#ffed76', 4);
    ellipse(c, 91, -13, 4, 5, '#22334e');
    ellipse(c, 92, -14, 1.2, 1.6, '#fff');
    c.restore();
  }
  function shark(c, x, y, w, h, time, reduced) {
    c.save(); c.translate(x + w / 2, y + h / 2); c.scale(w / 162, h / 83);
    const tail = reduced ? 0 : Math.sin(time * 8 + x * .02) * 6;
    // Broad tail and high dorsal fin keep the silhouette legible at speed.
    c.beginPath(); c.moveTo(40, -12); c.lineTo(77, -29 + tail);
    c.lineTo(64, -2); c.lineTo(80, 29 + tail); c.lineTo(39, 12); c.closePath();
    c.fillStyle = '#287a91'; c.fill(); c.lineWidth = 5;
    c.strokeStyle = '#19364f'; c.stroke();
    c.beginPath(); c.moveTo(-4, -17); c.lineTo(20, -43);
    c.lineTo(27, -11); c.closePath(); c.fillStyle = '#1f627f';
    c.fill(); c.strokeStyle = '#172f4b'; c.lineWidth = 5; c.stroke();
    c.beginPath(); c.moveTo(-70, -2);
    c.quadraticCurveTo(-51, -24, -13, -24);
    c.bezierCurveTo(23, -29, 49, -17, 64, -5);
    c.quadraticCurveTo(67, 7, 54, 17);
    c.bezierCurveTo(13, 29, -30, 23, -59, 12);
    c.quadraticCurveTo(-75, 8, -70, -2); c.closePath();
    c.fillStyle = gradient(c, 0, -28, 0, 26,
      [[0, '#7fd6d2'], [.24, '#356b92'], [.66, '#1f436b'], [1, '#102b4a']]);
    c.fill(); c.lineWidth = 5; c.strokeStyle = '#122b45'; c.stroke();
    c.beginPath(); c.moveTo(-65, 8);
    c.bezierCurveTo(-25, 24, 23, 22, 49, 12);
    c.quadraticCurveTo(-11, 42, -65, 8); c.closePath();
    c.fillStyle = '#c2eff0'; c.fill();
    c.beginPath(); c.moveTo(-4, 15); c.lineTo(19, 37);
    c.lineTo(25, 10); c.closePath(); c.fillStyle = '#286a84';
    c.fill(); c.lineWidth = 4; c.strokeStyle = '#19334e'; c.stroke();
    // Little teeth, gills and an alert eye make this clearly a shark, not a fish silhouette.
    stroke(c, [[-67, 9], [-45, 8], [-33, 3]], '#142f4a', 3.8);
    for (const tx of [-57, -49, -41]) {
      c.beginPath(); c.moveTo(tx, 9); c.lineTo(tx + 4, 14); c.lineTo(tx + 7, 8);
      c.closePath(); c.fillStyle = '#fff9e5'; c.fill();
    }
    ellipse(c, -42, -8, 6, 6, '#fff6da');
    ellipse(c, -43, -8, 3.4, 3.8, '#20283f');
    ellipse(c, -44, -10, 1.2, 1.2, '#fff');
    for (let i = 0; i < 3; i++)
      stroke(c, [[-20 + i * 9, -5], [-23 + i * 9, 7]], '#87d6d5', 3);
    c.restore();
  }
  function drawObstacle(c, obstacle, time, reduced, stage) {
    const { x, y, w, h, kind } = obstacle;
    ellipse(c, x + w / 2, GROUND + 2, w * .68, 5, '#1c385776');
    if (kind === 'jelly') jelly(c, x, y, w, h, time, reduced);
    else if (kind === 'urchin') urchin(c, x, y, w, h, time);
    else if (kind === 'coral') coral(c, x, y, w, h, time, ZONES[stage].coral);
    else if (kind === 'crab') crab(c, x, y, w, h, time);
    else if (kind === 'clam') clam(c, x, y, w, h, time);
    else if (kind === 'rock') rock(c, x, y, w, h, time);
    else if (kind === 'puffer') puffer(c, x, y, w, h, time);
    else if (kind === 'star') starHazard(c, x, y, w, h, time);
    else if (kind === 'mine') mine(c, x, y, w, h, time);
    else if (kind === 'eel') eel(c, x, y, w, h, time);
    else if (kind === 'shark') shark(c, x, y, w, h, time, reduced);
  }
  function platform(c, p) {
    const top = p.y, seg = 54;
    // Chunky sea-glass bridge, with a real landing surface for the runner.
    c.save();
    for (const sx of [p.x + 31, p.x + p.w - 40]) {
      if (sx > W + 80 || sx < -90) continue;
      rounded(c, sx - 22, top + 35, 44, GROUND - top - 12, 13, '#2d5d8f');
      rounded(c, sx - 17, top + 39, 34, GROUND - top - 21, 10, '#78c2d1');
      rounded(c, sx - 9, top + 58, 11, GROUND - top - 52, 5, '#c3f1e7a0');
    }
    for (let i = 0; i < Math.ceil(p.w / seg); i++) {
      const x = p.x + i * seg, w = Math.min(seg, p.w - i * seg);
      if (w <= 0 || x > W + 80 || x + w < -80) continue;
      rounded(c, x - 1, top + 1, w + 2, 48, 12, '#234b75');
      rounded(c, x + 3, top + 5, w - 5, 38, 9,
        gradient(c, x + 2, top, x + w, top + 46,
          [[0, '#c6ebf0'], [.4, i % 2 ? '#6da4d1' : '#7abddd'], [1, '#597ab9']]));
      stroke(c, [[x + 11, top + 38], [x + w - 8, top + 38]], '#436f9e', 2.3);
      c.beginPath(); c.moveTo(x, top + 12);
      c.quadraticCurveTo(x + 12, top + 21, x + 16, top + 9);
      c.quadraticCurveTo(x + 26, top + 23, x + 34, top + 9);
      c.quadraticCurveTo(x + w - 3, top + 18, x + w, top + 3);
      c.lineTo(x + w, top - 3); c.lineTo(x, top - 3); c.closePath();
      c.lineWidth = 3; c.strokeStyle = '#22665f'; c.fillStyle = '#74d0a3'; c.fill(); c.stroke();
      ellipse(c, x + 10, top + 1, 7, 2.2, '#d9ffbf');
      if (i % 2 === 0) sparkle(c, x + w * .6, top + 24, 3, '#dff9f4a3');
    }
    c.restore();
  }
  function hero(c, x, bottom, time, jumping, sliding, blink, shielded, reduced) {
    c.save(); c.translate(x, bottom); c.scale(HERO_SCALE, HERO_SCALE);
    const stride = reduced || jumping || sliding ? 0 : Math.sin(time * 25);
    const bounce = reduced || jumping || sliding ? 0 : Math.abs(stride) * 2.5;
    if (shielded) bubble(c, 0, -36, sliding ? 45 : 54, .9);
    if (sliding) {
      // The seahorse tucks into a horizontal dash; no octopus form remains.
      c.translate(-11, -19); c.rotate(Math.PI / 2); c.scale(.7, .87);
      ellipse(c, -30, -12, 30, 7, '#fff5b05e');
    } else {
      c.translate(0, -bounce);
    }
    // Wide spiral tail stays visible beyond the body, even at mobile size.
    const curl = () => {
      c.beginPath(); c.moveTo(-5, -26);
      c.bezierCurveTo(-18, -11, -33, -10, -32, -25);
      c.bezierCurveTo(-31, -40, -11, -37, -15, -23);
      c.bezierCurveTo(-17, -15, -27, -18, -25, -26);
    };
    curl(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#263d55'; c.lineWidth = 16; c.stroke();
    curl(); c.strokeStyle = '#ffb579'; c.lineWidth = 10.5; c.stroke();
    curl(); c.strokeStyle = '#ffe1a2'; c.lineWidth = 2.4; c.stroke();
    // Crown spikes and fluttering back fin.
    c.beginPath(); c.moveTo(-14, -63); c.lineTo(-13, -78);
    c.lineTo(-3, -70); c.lineTo(1, -82); c.lineTo(10, -66);
    c.closePath(); c.fillStyle = '#f48f77'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#253d58'; c.stroke();
    c.beginPath(); c.moveTo(-12, -44);
    c.lineTo(-36 - stride * 3, -43 + stride * 3);
    c.lineTo(-31 - stride * 2, -27 - stride * 2);
    c.lineTo(-13, -26); c.closePath(); c.fillStyle = '#6ed8c3'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#25435b'; c.stroke();
    stroke(c, [[-16, -42], [-29, -34]], '#e6fff0', 2);
    // Upright body, chest and recognizable protruding snout.
    c.beginPath(); c.moveTo(-9, -65);
    c.quadraticCurveTo(-3, -74, 7, -65);
    c.quadraticCurveTo(12, -62, 12, -58);
    c.lineTo(29, -57); c.quadraticCurveTo(37, -54, 33, -49);
    c.quadraticCurveTo(30, -46, 24, -47);
    c.lineTo(12, -47);
    c.bezierCurveTo(7, -43, 12, -39, 13, -34);
    c.bezierCurveTo(18, -17, 8, -12, -4, -17);
    c.bezierCurveTo(-21, -22, -23, -33, -14, -45);
    c.bezierCurveTo(-21, -55, -15, -64, -9, -65); c.closePath();
    c.fillStyle = gradient(c, -22, -72, 25, -11,
      [[0, '#fff0bc'], [.37, '#ffc375'], [.78, '#f28f69'], [1, '#ce6577']]);
    c.fill(); c.lineWidth = 3.3; c.strokeStyle = '#263b55'; c.stroke();
    // Curved cream belly and rib marks identify the seahorse silhouette.
    ellipse(c, 2, -33, 8.6, 15, '#ffe6ac');
    ellipse(c, 3.5, -31, 5.6, 11, '#fff6d0a6');
    for (let i = 0; i < 4; i++) {
      stroke(c, [[-3, -40 + i * 7], [2.5, -38 + i * 7]], '#d7867d', 1.5);
    }
    for (let i = 0; i < 3; i++) ellipse(c, -13 + i * 2, -48 + i * 9, 2, 2.7, '#c66b718f');
    ellipse(c, 27, -52, 5, 2.5, '#ffdc9c');
    stroke(c, [[27, -47], [31, -46]], '#825470', 1.7);
    if (blink) stroke(c, [[2, -59], [10, -59]], '#293b55', 2.4);
    else {
      ellipse(c, 7, -60, 5.2, 5.7, '#fffefa');
      ellipse(c, 8.8, -60, 2.4, 3.6, '#283955');
      ellipse(c, 9.4, -61.4, .9, 1.2, '#fff');
    }
    ellipse(c, 14, -51, 3, 2.2, '#e47582');
    // Fluttering swimming fins replace feet: this character never turns bipedal.
    if (!sliding) {
      c.beginPath(); c.moveTo(-1, -20);
      c.quadraticCurveTo(-4 + stride * 5, -7, 8 + stride * 4, -6);
      c.quadraticCurveTo(12 + stride * 3, -16, 7, -23); c.closePath();
      c.fillStyle = '#6ddcc5'; c.fill(); c.strokeStyle = '#28425a'; c.lineWidth = 3; c.stroke();
      stroke(c, [[2, -17], [7 + stride * 2, -11]], '#f2fff1', 2);
    }
    if (jumping) {
      ellipse(c, -29, -50, 4, 4, '#e7fff4');
      ellipse(c, -37, -62, 2.5, 2.5, '#d4fff3a9');
    }
    c.restore();
  }
  function hud(c, game, view, score) {
    rounded(c, 20, 17, 192, 66, 17, '#134b70c7');
    rounded(c, 23, 19, 185, 60, 15, '#2b7191ba');
    c.textAlign = 'left'; c.fillStyle = '#c7ffed'; c.font = `13px ${FONT}`;
    c.fillText('SCORE', 37, 39);
    c.font = `30px ${FONT}`; c.fillStyle = '#fffbea';
    c.fillText(score.toLocaleString('ko-KR'), 36, 69);
    rounded(c, 231, 18, 110, 55, 16, '#134b70bb');
    pearl(c, 253, 45, 0, 12);
    c.font = `26px ${FONT}`; c.fillStyle = '#fffbe5';
    c.fillText(String(game.pearls), 276, 55);
    rounded(c, 358, 18, 195, 55, 16, '#134b70a8');
    c.font = `14px ${FONT}`; c.fillStyle = '#d4fff0';
    c.fillText('STAGE  ' + String(game.stage + 1), 374, 40);
    c.font = `17px ${FONT}`; c.fillStyle = '#fffce9';
    c.fillText(ZONES[game.stage].name, 374, 63);
    rounded(c, 571, 18, 171, 55, 16, '#134b70b9');
    c.fillStyle = '#ffc1c7'; c.font = `29px ${FONT}`;
    c.fillText('♥'.repeat(game.hearts) + '♡'.repeat(3 - game.hearts), 586, 55);
    if (game.fever > 0) {
      c.textAlign = 'center'; c.font = `bold 30px ${FONT}`;
      c.lineWidth = 6; c.strokeStyle = '#a54c91';
      c.strokeText('✦  진주 피버!  ✦', W / 2, 121);
      c.fillStyle = '#fff2a5'; c.fillText('✦  진주 피버!  ✦', W / 2, 121);
    } else if (game.combo >= 3) {
      c.textAlign = 'center'; c.font = `23px ${FONT}`;
      c.lineWidth = 5; c.strokeStyle = '#2b678b';
      c.strokeText(`${game.combo} COMBO`, W / 2, 121);
      c.fillStyle = '#fff4aa'; c.fillText(`${game.combo} COMBO`, W / 2, 121);
    }
    if (game.shielded) {
      rounded(c, 763, 81, 167, 33, 17, '#6b4caca6');
      c.textAlign = 'center'; c.font = `17px ${FONT}`; c.fillStyle = '#fff8d5';
      c.fillText('✦ 버블 보호막', 846, 103);
    }
    c.textAlign = 'left';
  }
  function overlay(c, view, title, description) {
    c.fillStyle = '#052d4e88'; c.fillRect(0, 0, W, view.h);
    rounded(c, W / 2 - 235, view.h * .32, 470, 162, 28, '#eafff3f2');
    c.textAlign = 'center'; c.fillStyle = '#21637c';
    c.font = `37px ${FONT}`; c.fillText(title, W / 2, view.h * .32 + 66);
    c.font = `18px ${FONT}`; c.fillStyle = '#457c8d';
    c.fillText(description, W / 2, view.h * .32 + 112); c.textAlign = 'left';
  }
  function rushLines(c, distance, speed, time, reduced) {
    if (reduced) return;
    const intensity = Math.min(.65, .16 + Math.max(0, speed - 455) / 900);
    c.save(); c.lineCap = 'round';
    for (let i = 0; i < 15; i++) {
      const x = ((i * 187 - distance * (1.3 + i % 3 * .2)) % 2805 + 2805) % 2805 - 100;
      const y = 144 + i % 8 * 37 + Math.sin(time * 1.6 + i) * 3;
      c.globalAlpha = intensity * (.25 + i % 3 * .15);
      stroke(c, [[x, y], [x + 45 + i % 5 * 13, y - 4]], '#ffffff', 1.6 + i % 2);
    }
    c.restore();
  }

  function create(api) {
    const reduced = reducedMotion();
    let time = 0, distance = 0, speed = 455, offset = 0, vy = 0;
    let jumps = 0, slide = 0, hearts = 3, invulnerable = 0, shielded = false;
    let hazardIn = 1.2, pearlIn = .55, shieldIn = 15, platformIn = 8.8;
    let sharkIn = 6.2 + Math.random() * 5.8;
    let hazards = [], pickups = [], effects = [];
    let platforms = [{ x: W + 45, y: GROUND - 125, w: 370 }];
    for (let i = 0; i < 6; i++)
      pickups.push({ x: W + 86 + i * 55, y: GROUND - 173 - Math.sin(i * .58) * 14, kind: 'pearl' });
    let pearls = 0, combo = 0, lastScore = -1, ended = false, paused = false;
    let stage = 0, shake = 0, flash = 0, dustIn = 0, musicTick = .16, note = 0;
    let fever = 0, scoreSync = 0, bonus = '', bonusLife = 0;
    let lastButtonKey = '', lastButtonAt = -1000;
    let lastHazard = '';
    let musicOn = safeGet('ojjuda:runner:music') !== 'off';
    let audio = null;
    const score = () => Math.floor(distance / 7) + pearls * 25 + Math.floor(combo * 10);
    const globalSoundOn = () => typeof api.soundEnabled !== 'function' || !!api.soundEnabled();
    function ensureAudio() {
      if (!musicOn || !globalSoundOn() || audio) { if (audio?.state === 'suspended' && globalSoundOn()) void audio.resume().catch(() => {}); return; }
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') void audio.resume().catch(() => {});
      } catch { audio = null; }
    }
    function tone(frequency, duration, volume, wave = 'sine') {
      if (!musicOn || !globalSoundOn() || !audio || audio.state !== 'running') return;
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
      else if (kind === 'hurt') {
        if (api.sound?.bad) api.sound.bad(); else api.sound?.hit?.();
      }
      if (kind === 'jump') tone(540, .08, .035, 'sine');
      else if (kind === 'slide') tone(260, .09, .025, 'triangle');
      else if (kind === 'pearl') tone(880, .12, .025, 'sine');
      else if (kind === 'hurt') tone(155, .2, .035, 'sawtooth');
    }
    function particle(x, y, kind, count = 7) {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU, velocity = 50 + Math.random() * 150;
        effects.push({ x, y, vx: Math.cos(a) * velocity, vy: Math.sin(a) * velocity - 40,
          life: .42 + Math.random() * .35, max: .77, kind });
      }
    }
    function jump() {
      if (paused || ended || jumps >= 2) return;
      ensureAudio(); slide = 0; vy = jumps === 0 ? -840 : -775; jumps++;
      particle(HERO_X, GROUND + offset - 5, 'foam', 12); sound('jump');
    }
    function crouch() {
      if (paused || ended) return;
      ensureAudio();
      if (offset < -6 && vy < 820) vy = 820; // Immediate dive after a jump.
      slide = Math.max(slide, .76);
      particle(HERO_X - 23, GROUND + offset - 10, 'foam', 11); sound('slide');
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
      const available = time < 4.5 ? REGULAR_OBSTACLES.slice(0, 5) : REGULAR_OBSTACLES;
      let index = Math.floor(Math.random() * available.length);
      if (available[index].kind === lastHazard) index = (index + 1) % available.length;
      const obstacle = available[index]; lastHazard = obstacle.kind;
      const { kind, w, h, lane } = obstacle;
      const y = lane === 'air' ? GROUND - h - 70 :
        kind === 'puffer' ? GROUND - h - 7 : GROUND - h;
      hazards.push({ x: W + 55, y, w, h, kind });
    }
    function spawnShark() {
      const species = OBSTACLES.find(item => item.kind === 'shark');
      hazards.push({ kind: species.kind, w: species.w, h: species.h,
        x: W + 100, y: GROUND - 351,
        pace: 1.2 + Math.random() * .46, phase: Math.random() * TAU,
        currentSpeed: speed + 65 });
    }
    function spawnPearls() {
      const high = Math.random() > .48;
      const top = high ? GROUND - 138 : GROUND - 63;
      for (let i = 0; i < 5; i++) {
        const arc = high ? -Math.sin(i * Math.PI / 4) * 36 : Math.sin(i * Math.PI / 4) * 9;
        pickups.push({ x: W + 30 + i * 42, y: top + arc, kind: 'pearl' });
      }
    }
    function spawnPlatform() {
      const y = GROUND - 112 - Math.floor(Math.random() * 3) * 13;
      const w = 235 + Math.floor(Math.random() * 4) * 54;
      const x = W + 96;
      platforms.push({ x, y, w });
      for (let i = 0; i < 5; i++)
        pickups.push({ x: x + 35 + i * ((w - 70) / 4), y: y - 43, kind: 'pearl' });
    }
    function hit() {
      if (invulnerable > 0 || ended) return;
      if (shielded) {
        shielded = false; invulnerable = .75;
        particle(HERO_X, GROUND + offset - 55, 'shield', 18); sound('shield'); return;
      }
      hearts--; combo = 0; fever = 0; invulnerable = 1.25; shake = 12; flash = .23;
      particle(HERO_X, GROUND + offset - 54, 'hit', 20); sound('hurt');
      if (hearts <= 0) {
        ended = true; api.setScore(score()); api.end(score());
      }
    }
    function handleButtonPointer(event) {
      const button = event.target?.closest?.('#gov[data-game="runner"] .jju-key');
      if (!button) return;
      const key = button.dataset.g === 'key:ArrowUp' ? 'ArrowUp' :
        button.dataset.g === 'key:ArrowDown' ? 'ArrowDown' : '';
      if (!key) return;
      lastButtonAt = Date.now(); lastButtonKey = key;
      if (key === 'ArrowUp') jump(); else crouch();
    }
    document.addEventListener?.('pointerdown', handleButtonPointer, { passive: true });
    const game = {
      controls: '<div class="jju-controls" role="group" aria-label="쭈달리기 조작">' +
        '<button type="button" class="jju-key jump" data-g="key:ArrowUp" aria-label="점프, 두 번 누르면 2단 점프">JUMP <small>점프 · 2단</small></button>' +
        '<button type="button" class="jju-key slide" data-g="key:ArrowDown" aria-label="슬라이드, 공중에서 누르면 빠르게 내려오기">SLIDE <small>슬라이드</small></button>' +
        '<button type="button" class="jju-mini pause" data-g="key:p" aria-pressed="false">Ⅱ 일시정지</button>' +
        `<button type="button" class="jju-mini music" data-g="key:m" aria-pressed="${musicOn}">${musicOn ? '♫ 음악 켜짐' : '♪ 음악 꺼짐'}</button>` +
        '</div>',
      update(dt) {
        if (ended || paused) return;
        dt = Math.max(0, Math.min(.05, Number(dt) || 0));
        if (!dt) return;
        time += dt;
        fever = Math.max(0, fever - dt);
        speed = Math.min(850, 455 + time * 11.2 + (fever > 0 ? 135 : 0));
        distance += speed * dt;
        stage = Math.floor(distance / 3300) % ZONES.length;
        slide = Math.max(0, slide - dt);
        invulnerable = Math.max(0, invulnerable - dt);
        shake = Math.max(0, shake - dt * 38);
        flash = Math.max(0, flash - dt);
        bonusLife = Math.max(0, bonusLife - dt);
        // Falling feet can land on moving bridges; below-platform collisions stay pass-through.
        const previousFeet = GROUND + offset;
        vy += 2300 * dt; offset += vy * dt;
        const feet = GROUND + offset;
        const landing = vy >= 0 && platforms.find(p =>
          HERO_X + 18 > p.x && HERO_X - 18 < p.x + p.w &&
          previousFeet <= p.y + 5 && feet >= p.y);
        if (landing) {
          offset = landing.y - GROUND; vy = 0; jumps = 0;
          if (previousFeet < landing.y - 5) particle(HERO_X, landing.y - 2, 'foam', 8);
        } else if (offset >= 0) {
          offset = 0; vy = 0; jumps = 0;
          if (previousFeet < GROUND - 5) particle(HERO_X, GROUND - 3, 'foam', 10);
        }
        hazardIn -= dt;
        if (hazardIn <= 0) {
          spawnHazard();
          hazardIn = Math.max(.68, 1.26 - time * .011) + Math.random() * .32;
        }
        sharkIn -= dt;
        if (sharkIn <= 0) {
          spawnShark();
          sharkIn = 9 + Math.random() * 11.5;
        }
        pearlIn -= dt;
        if (pearlIn <= 0) { spawnPearls(); pearlIn = 1.08 + Math.random() * .42; }
        platformIn -= dt;
        if (platformIn <= 0) { spawnPlatform(); platformIn = 8.5 + Math.random() * 2.8; }
        shieldIn -= dt;
        if (shieldIn <= 0) {
          pickups.push({ x: W + 34, y: GROUND - 91, kind: 'shield' });
          shieldIn = 18 + Math.random() * 9;
        }
        for (const item of hazards) {
          const velocity = item.kind === 'shark' ? sharkSpeed(item, speed, time) : speed;
          item.x -= velocity * dt;
          if (item.kind === 'shark') item.currentSpeed = velocity;
        }
        for (const item of pickups) item.x -= speed * dt;
        for (const item of platforms) item.x -= speed * dt;
        hazards = hazards.filter(item => item.x + item.w > -70);
        pickups = pickups.filter(item => item.x > -48 && !item.got);
        platforms = platforms.filter(item => item.x + item.w > -80);
        for (const p of effects) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt; p.life -= dt; }
        effects = effects.filter(p => p.life > 0);
        dustIn -= dt;
        if (vy === 0 && !slide && !reduced && dustIn <= 0) {
          dustIn = .095; particle(HERO_X - 34, GROUND + offset - 2, 'foam', 2);
        }
        const sliding = slide > 0 && vy === 0;
        const foot = GROUND + offset;
        const box = sliding
          ? { l: HERO_X - 39, r: HERO_X + 39, t: foot - 37, b: foot - 2 }
          : { l: HERO_X - 31, r: HERO_X + 31, t: foot - 91, b: foot - 4 };
        for (const item of hazards) {
          const inset = item.kind === 'urchin' ? 6 : item.kind === 'shark' ? 17 : 8;
          if (item.x + item.w - inset > box.l && item.x + inset < box.r &&
              item.y + item.h - inset > box.t && item.y + inset < box.b) {
            hit(); if (ended) break;
          }
        }
        for (const item of pickups) {
          if (Math.abs(item.x - (box.l + box.r) / 2) < 31 &&
              item.y > box.t - 20 && item.y < box.b + 20) {
            item.got = true;
            if (item.kind === 'shield') { shielded = true; sound('shield'); particle(item.x, item.y, 'shield', 13); }
            else {
              pearls++; combo++; sound('pearl'); particle(item.x, item.y, 'pearl', 9);
              if (combo % 12 === 0) {
                fever = 3.8; bonus = '진주 피버!'; bonusLife = 1.5;
                particle(HERO_X, foot - 70, 'shield', 24);
              }
            }
          }
        }
        const next = score();
        scoreSync += dt;
        if (lastScore !== next && scoreSync >= .08) {
          lastScore = next; scoreSync = 0; api.setScore(next);
        }
        musicTick -= dt;
        if (musicTick <= 0) { musicTick += .225; if (musicOn) music(); }
      },
      draw(c) {
        const view = fit(c);
        const dx = !reduced && shake ? Math.sin(time * 44) * shake * .5 : 0;
        c.save(); c.translate(dx, 0);
        sea(c, distance, time, view, stage, reduced);
        rushLines(c, distance, speed, time, reduced);
        c.save(); c.translate(0, view.ground - GROUND);
        for (const item of platforms) platform(c, item);
        for (const item of hazards) drawObstacle(c, item, time, reduced, stage);
        for (const item of pickups) {
          if (!item.got) {
            if (item.kind === 'shield') shield(c, item.x, item.y, time);
            else pearl(c, item.x, item.y, time);
          }
        }
        ellipse(c, HERO_X, (offset < 0 ? GROUND : GROUND + offset) + 3,
          Math.max(12, 33 + offset / 17), 5, '#315b6e64');
        if (invulnerable <= 0 || Math.floor(time * 12) % 2 === 0) {
          hero(c, HERO_X, GROUND + offset, time, vy !== 0, slide > 0,
            Math.sin(time * 1.7) > .994, shielded, reduced);
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
        hud(c, { hearts, pearls, combo, stage, shielded, fever }, view, score());
        if (sharkIn < .85 && sharkIn > 0) {
          rounded(c, 754, 120, 180, 35, 16, '#17395ed9');
          c.textAlign = 'center'; c.font = `bold 18px ${FONT}`;
          c.fillStyle = '#fff0bd'; c.fillText('⚠ 상어 접근!', 844, 144);
          c.textAlign = 'left';
        }
        if (bonusLife > 0) {
          c.save(); c.globalAlpha = Math.min(1, bonusLife);
          c.font = `bold 32px ${FONT}`; c.textAlign = 'center';
          c.lineWidth = 7; c.strokeStyle = '#9e4788';
          c.strokeText(bonus, HERO_X + 20, 257 - Math.sin(bonusLife * 3) * 6);
          c.fillStyle = '#fff4a5'; c.fillText(bonus, HERO_X + 20, 257 - Math.sin(bonusLife * 3) * 6);
          c.restore();
        }
        if (paused) overlay(c, view, '잠깐 쉬어가요', '오른쪽 위 계속 버튼으로 돌아가요.');
        c.restore();
      },
      // World translates pointer coordinates to its common 0–360 range.
      onDown(x) { if (x >= 180) crouch(); else jump(); },
      onSwipe(direction) {
        if (direction === 'D') {
          crouch();
        } else if (direction === 'U') jump();
      },
      onKey(key) {
        if ((key === 'ArrowUp' || key === 'ArrowDown') &&
            lastButtonKey === key && Date.now() - lastButtonAt < 650) {
          lastButtonKey = ''; return true; // Ignore the synthetic click after pointerdown.
        }
        if (['ArrowUp', ' ', 'w', 'W', 'Enter'].includes(key)) { jump(); return true; }
        if (['ArrowDown', 's', 'S', 'Shift', 'c', 'C'].includes(key)) { crouch(); return true; }
        if (key === 'p' || key === 'P') { togglePause(); return true; }
        if (key === 'm' || key === 'M') { toggleMusic(); return true; }
        return false;
      },
      get state() { return { hearts, pearls, combo, distance, jumps, sliding: slide > 0,
        paused, ended, stage, shielded, score: score(), speed, fever,
        platforms: platforms.length, hazards: hazards.map(h => h.kind), sharkIn,
        sharks: hazards.filter(h => h.kind === 'shark').map(h =>
          ({ x: h.x, y: h.y, speed: h.currentSpeed })) }; },
      destroy() {
        document.removeEventListener?.('pointerdown', handleButtonPointer);
        ended = true; hazards = []; pickups = []; effects = []; platforms = [];
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
    platform(c, { x: 548, y: GROUND - 124, w: 317 });
    drawObstacle(c, { x: 690, y: GROUND - 60, w: 82, h: 60, kind: 'crab' }, 0, true, stage);
    drawObstacle(c, { x: 840, y: GROUND - 143, w: 73, h: 73, kind: 'mine' }, 0, true, stage);
    drawObstacle(c, { x: 754, y: GROUND - 351, w: 162, h: 83, kind: 'shark' }, 0, true, stage);
    hero(c, 287, GROUND - 51, .2, true, false, false, false, true);
    for (let i = 0; i < 7; i++) pearl(c, 396 + i * 59, GROUND - 120 - Math.sin(i * .58) * 47, .5, 15);
    c.restore(); foreground(c, 340, 0, view, true);
    c.textAlign = 'center'; c.font = `bold 74px ${FONT}`; c.lineWidth = 9;
    c.strokeStyle = '#146187'; c.lineJoin = 'round';
    c.strokeText('쭈달리기', W / 2, 190);
    c.fillStyle = '#fff2be'; c.fillText('쭈달리기', W / 2, 190);
    rounded(c, W / 2 - 125, 210, 250, 40, 18, '#075d7ac7');
    c.font = `21px ${FONT}`; c.fillStyle = '#dcfff2';
    c.fillText('바닷속 스피드 러시', W / 2, 239);
    c.textAlign = 'left'; c.restore();
  }
  function soundIcon(value) {
    const off = value === '🔇';
    return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>' +
      (off ? '<path d="m17 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' :
        '<path d="M17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>') + '</svg>';
  }
  function shoeIcon() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M9 3 7 1 5 6c-4 4-3 10 2 13 4 2 7-1 6-4-1-2-4-1-3 1" fill="#ffc17c" stroke="#34516a" stroke-width="1.8" stroke-linejoin="round"/><path d="m11 5 8 1q3 0 2 3l-9-1" fill="#ffd49a" stroke="#34516a" stroke-width="1.5"/><path d="m4 11-3 3 4 2" fill="#62d8c0" stroke="#34516a" stroke-width="1.4"/><circle cx="12" cy="6" r="1.6" fill="#29435e"/></svg>';
  }
  window.OjjudaRunnerGame = { create, drawPreview, soundIcon, shoeIcon,
    obstacleTypes: OBSTACLES.map(({ kind, name, lane }) => ({ kind, name, lane })),
    get ready() { return Promise.resolve(true); } };
})();

