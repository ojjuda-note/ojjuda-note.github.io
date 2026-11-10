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
  const HERO_SCALE = 1.43;
  const TAU = Math.PI * 2;
  const FONT = '"Jua","Gowun Dodum","Apple SD Gothic Neo",sans-serif';
  const ZONES = [
    { name: '산호 정원', deep: '#d4f7ff', mid: '#65d7ef', light: '#259db8', reef: '#579db8', coral: '#ff9d88' },
    { name: '물빛 해초숲', deep: '#c3fff2', mid: '#67cfca', light: '#217f9d', reef: '#4baaa7', coral: '#ffca88' },
    { name: '별빛 진주동굴', deep: '#bfdfff', mid: '#649bd1', light: '#456ea7', reef: '#526db5', coral: '#d4aaec' }
  ];
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
        i % 2 ? '#7db5bb67' : '#5daec27e', time + i);
    }
    for (let i = 0; i < 12; i++) {
      const x = ((i * 163 - dist * .18) % 1956 + 1956) % 1956 - 180;
      ellipse(c, x, view.ground + 6, 75 + i % 3 * 30, 85 + i % 4 * 15,
        i % 3 ? '#61a1be60' : '#a3d1c781');
      ellipse(c, x - 32, view.ground - 65, 40, 55, '#e3e5c352');
      if (i % 2 === 0) seaFan(c, x + 32, view.ground - 30, 115 + i % 3 * 26,
        reduced ? i : time * .6 + i, i % 3 ? '#95bfa69e' : '#e8ce9f8c');
    }
    for (let i = 0; i < 20; i++) {
      const x = ((i * 113 - dist * (i % 2 ? .28 : .14)) % 2260 + 2260) % 2260 - 120;
      const y = 95 + i % 6 * 50 + (reduced ? 0 : Math.sin(time * 1.2 + i) * 8);
      fish(c, x, y, 5 + i % 3 * 3, i % 2 ? '#ffeaa3b5' : '#e9fff2bf');
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
    const bounce = reduced || jumping || sliding ? 0 : Math.abs(Math.sin(time * 25)) * 2.5;
    c.translate(0, -bounce);
    if (shielded) bubble(c, 0, -34, sliding ? 40 : 49, .87);
    if (sliding) {
      ellipse(c, -14, -8, 33, 8, '#86fbdd73');
      for (let i = 0; i < 4; i++)
        stroke(c, [[-14 + i * 9, -7], [-23 + i * 14, -3]], '#ed8d9f', 4);
      ellipse(c, 0, -17, 30, 17, '#4c426b');
      ellipse(c, 0, -18, 27, 14, gradient(c, -25, -31, 22, -2,
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
      stroke(c, [[-17, -33], [-29 - stride * 4, -25], [-27, -21]], '#5b506f', 9);
      stroke(c, [[-17, -33], [-29 - stride * 4, -25], [-27, -21]], '#eb8396', 6);
      stroke(c, [[16, -33], [27 + stride * 4, -22], [24, -18]], '#5b506f', 9);
      stroke(c, [[16, -33], [27 + stride * 4, -22], [24, -18]], '#f3999c', 6);
      // The mantle silhouette is an original rounded squid, not a sprite sheet.
      c.beginPath(); c.moveTo(-20, -41);
      c.bezierCurveTo(-26, -63, -13, -70, 0, -70);
      c.bezierCurveTo(15, -70, 27, -59, 22, -40);
      c.quadraticCurveTo(29, -18, 5, -16);
      c.quadraticCurveTo(-24, -17, -20, -41);
      c.fillStyle = gradient(c, -21, -70, 18, -13,
        [[0, '#ffe2c9'], [.45, '#ff9da9'], [1, '#dd6c90']]); c.fill();
      c.strokeStyle = '#4c4a71'; c.lineWidth = 2.8; c.stroke();
      ellipse(c, -9, -53, 7, 5, '#ffffff66');
      // Soft mint running headband and Ojjuda's little star.
      stroke(c, [[-20, -51], [-9, -55], [9, -55], [22, -51]], '#64cdb9', 5);
      stroke(c, [[20, -51], [31, -49], [29, -43]], '#9df3d8', 3);
      sparkle(c, -6, -57, 3.6, '#fff9cf');
      sparkle(c, 14, -66, 2.8, '#fff9ce');
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
    let hazards = [], pickups = [], effects = [];
    let platforms = [{ x: W + 45, y: GROUND - 125, w: 370 }];
    for (let i = 0; i < 6; i++)
      pickups.push({ x: W + 86 + i * 55, y: GROUND - 173 - Math.sin(i * .58) * 14, kind: 'pearl' });
    let pearls = 0, combo = 0, lastScore = -1, ended = false, paused = false;
    let stage = 0, shake = 0, flash = 0, dustIn = 0, musicTick = .16, note = 0;
    let fever = 0, scoreSync = 0, bonus = '', bonusLife = 0;
    let lastButtonKey = '', lastButtonAt = -1000;
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
      const r = Math.random();
      const kind = time > 4.5 && r < .28 ? 'jelly' : r < .63 ? 'urchin' : 'coral';
      const w = kind === 'jelly' ? 80 : kind === 'urchin' ? 47 : 58;
      const h = kind === 'jelly' ? 75 : kind === 'urchin' ? 48 : 89;
      const y = kind === 'jelly' ? GROUND - 132 : GROUND - h;
      hazards.push({ x: W + 55, y, w, h, kind });
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
        pearlIn -= dt;
        if (pearlIn <= 0) { spawnPearls(); pearlIn = 1.08 + Math.random() * .42; }
        platformIn -= dt;
        if (platformIn <= 0) { spawnPlatform(); platformIn = 8.5 + Math.random() * 2.8; }
        shieldIn -= dt;
        if (shieldIn <= 0) {
          pickups.push({ x: W + 34, y: GROUND - 91, kind: 'shield' });
          shieldIn = 18 + Math.random() * 9;
        }
        for (const item of hazards) item.x -= speed * dt;
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
          const inset = item.kind === 'urchin' ? 6 : 8;
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
        paused, ended, stage, shielded, score: score(), speed, fever, platforms: platforms.length }; },
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
    drawObstacle(c, { x: 692, y: GROUND - 47, w: 47, h: 47, kind: 'urchin' }, 0, true, stage);
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
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M4 13c3-4 5-8 9-8 4 0 6 4 6 8s-3 7-8 7S4 17 4 13Z" fill="#ff9cac"/><circle cx="9" cy="12" r="1.5" fill="#264e62"/><circle cx="16" cy="12" r="1.5" fill="#264e62"/><path d="M9 16q3 3 6 0" stroke="#9a5367" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }
  window.OjjudaRunnerGame = { create, drawPreview, soundIcon, shoeIcon, get ready() { return Promise.resolve(true); } };
})();
