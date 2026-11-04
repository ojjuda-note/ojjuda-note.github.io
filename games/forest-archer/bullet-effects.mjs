/** Presentation only: every projectile and hole stays at its supplied projection. */
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const visible = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.visible !== false;
const validCanvas = (ctx, w, h) => ctx && [w, h].every(Number.isFinite) && w > 0 && h > 0 && w <= 32768 && h <= 32768;
const opacity = ctx => Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
const ellipse = (ctx, x, y, rx, ry, fill) => {
  ctx.beginPath();ctx.ellipse(x, y, rx, ry, 0, 0, TAU);ctx.fillStyle = fill;ctx.fill();
};
const stroke = (ctx, x1, y1, x2, y2, color, width) => {
  ctx.beginPath();ctx.moveTo(x1, y1);ctx.lineTo(x2, y2);ctx.strokeStyle = color;ctx.lineWidth = width;ctx.stroke();
};

/** A short copper projectile, with light travelling around its rotating jacket. */
export function drawCinematicBullet(ctx, {tip, tail, spin = 0, progress = 0, alpha = 1} = {}) {
  if (!ctx || !visible(tip) || !visible(tail)) return;
  const dx = tip.x - tail.x, dy = tip.y - tail.y, projectedLength = Math.hypot(dx, dy);
  if (!Number.isFinite(projectedLength) || projectedLength > 32768) return;
  const scale = Math.max(0, finite(tip.scale, finite(tail.scale, 100)));
  const radius = clamp(scale * .011, 1.45, 4.6);
  // A minimum jacket silhouette keeps the slow-motion subject readable on a
  // phone. Its nose and heading still use the real, unshifted projection.
  const length = Math.max(projectedLength, radius * 4, 14);
  const rotation = finite(spin), phase = clamp(finite(progress), 0, 1);
  ctx.save();ctx.globalAlpha = opacity(ctx) * clamp(finite(alpha, 1), 0, 1);
  ctx.translate(tip.x, tip.y);ctx.rotate(projectedLength > 1e-7 ? Math.atan2(dy, dx) : 0);

  // All of the jacket is behind the real projected nose; no artificial shaft.
  const jacket = () => {
    ctx.beginPath();ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-length * .13, -radius * .83, -length * .36, -radius);
    ctx.lineTo(-length, -radius * .86);
    ctx.quadraticCurveTo(-length - radius * .16, 0, -length, radius * .86);
    ctx.lineTo(-length * .36, radius);
    ctx.quadraticCurveTo(-length * .13, radius * .83, 0, 0);ctx.closePath();
  };
  const metal = ctx.createLinearGradient(0, -radius, 0, radius);
  metal.addColorStop(0, '#49352b');metal.addColorStop(.19, '#bd8250');
  metal.addColorStop(.40, '#ffe0a7');metal.addColorStop(.55, '#d6a168');
  metal.addColorStop(.80, '#8d5232');metal.addColorStop(1, '#372a24');
  jacket();ctx.shadowColor = '#ffce9466';ctx.shadowBlur = 3.5 * (1 - phase * .25);
  ctx.fillStyle = metal;ctx.fill();ctx.shadowBlur = 0;
  ctx.strokeStyle = '#3d3028';ctx.lineWidth = .65;ctx.stroke();

  ctx.save();jacket();ctx.clip();
  // Two narrow jacket grooves remain circular while the reflected seam turns.
  for (const at of [.70, .84]) {
    stroke(ctx, -length * at, -radius, -length * at, radius, '#513322b8', Math.max(.6, length * .035));
    stroke(ctx, -length * at + .7, -radius, -length * at + .7, radius, '#ebba7d9c', .6);
  }
  const shine = .24 + Math.max(0, Math.cos(rotation)) * .70;
  ctx.globalAlpha *= shine;
  stroke(ctx, -length * .94, Math.sin(rotation) * radius * .64,
    -length * .29, Math.sin(rotation + .38) * radius * .62, '#fff4d5', Math.max(.65, radius * .28));
  ctx.globalAlpha = opacity(ctx) * .60;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, x = -length * (.91 - .60 * t), y = Math.sin(rotation + t * 2.1) * radius * .83;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = '#69432d';ctx.lineWidth = .65;ctx.stroke();ctx.restore();
  ellipse(ctx, -length * .12, -radius * .10, Math.max(.55, radius * .22), Math.max(.5, radius * .32), '#ffebc7');
  ctx.restore();
}

/** A fixed entry hole and torn rim, distinct from an arrow embedded in the board. */
export function drawBulletMark(ctx, {point, age = 0, focus = false, reducedMotion = false} = {}) {
  if (!ctx || !visible(point)) return;
  const radius = clamp(Math.max(0, finite(point.scale, 100)) * .014, 1.6, 5.2);
  const heat = focus && !reducedMotion ? Math.exp(-Math.max(0, finite(age)) * 15) : 0;
  ctx.save();ctx.translate(point.x, point.y);
  const shadow = ctx.createRadialGradient(0, 0, radius * .30, 0, 0, radius * 2.1);
  shadow.addColorStop(0, '#291e1c9c');shadow.addColorStop(.55, '#49392f5c');shadow.addColorStop(1, '#49392f00');
  ellipse(ctx, 0, 0, radius * 2.1, radius * 2.1, shadow);
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = i * TAU / 14, r = radius * (1.21 + .18 * Math.sin(i * 2.3));
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();ctx.fillStyle = '#c7b58a';ctx.fill();
  ctx.strokeStyle = '#756044';ctx.lineWidth = .55;ctx.stroke();
  const cavity = ctx.createRadialGradient(-radius * .2, -radius * .2, .1, 0, 0, radius);
  cavity.addColorStop(0, '#090b0a');cavity.addColorStop(.63, '#1b1c18');cavity.addColorStop(1, '#594735');
  ellipse(ctx, 0, 0, radius, radius * .94, cavity);
  stroke(ctx, -radius * .77, -radius * .73, -radius * .18, -radius * .91, '#f0ddaf', .7);
  if (heat > .015) {
    ctx.globalAlpha *= heat * .55;
    ctx.beginPath();ctx.ellipse(0, 0, radius * 1.12, radius * 1.06, 0, 0, TAU);
    ctx.strokeStyle = '#ffc88f';ctx.lineWidth = .85;ctx.stroke();
  }
  ctx.restore();
}

/** A compact pressure wave with dusty board chips; no arrow flex or star burst. */
export function drawBulletImpact(ctx, w, h, {x, y, age, scale = 1, reducedMotion = false} = {}) {
  const duration = .92;
  if (!validCanvas(ctx, w, h) || ![x, y, age].every(Number.isFinite) || age < 0 || age >= duration) return;
  const radius = clamp(Math.min(w, h) * .092, 24, 60) * clamp(finite(scale, 1), .5, 1.7);
  if (x < -radius * 4 || x > w + radius * 4 || y < -radius * 4 || y > h + radius * 4) return;
  ctx.save();ctx.translate(x, y);ctx.lineCap = 'round';
  const baseAlpha = opacity(ctx), fade = (1 - age / duration) ** 1.5;
  if (reducedMotion) {
    const r = clamp(radius * .24, 7, 16), glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    glow.addColorStop(0, '#f2d3a345');glow.addColorStop(1, '#e8bd8400');
    ctx.globalAlpha = baseAlpha * fade;ellipse(ctx, 0, 0, r, r, glow);
    ctx.beginPath();ctx.arc(0, 0, r * .60, 0, TAU);ctx.strokeStyle = '#d4b989';ctx.lineWidth = .9;ctx.stroke();
    ctx.restore();return;
  }

  // A local contact flash, intentionally confined to the actual entry point.
  if (age < .085) {
    const flash = (1 - age / .085) ** 1.7, r = radius * .49;
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    light.addColorStop(0, '#fff5e2ed');light.addColorStop(.18, '#ffe5bfb0');light.addColorStop(1, '#e9ba8000');
    ctx.globalAlpha = baseAlpha * flash;ellipse(ctx, 0, 0, r, r, light);
  }
  if (age < .38) {
    const p = age / .38, wave = radius * (.12 + 1.55 * (1 - (1 - p) ** 3));
    ctx.globalAlpha = baseAlpha * (1 - p) ** 1.6;
    ctx.beginPath();ctx.ellipse(0, 0, wave, wave * .92, 0, 0, TAU);
    ctx.strokeStyle = '#594b3b';ctx.lineWidth = 2.7 - p * 1.5;ctx.stroke();
    ctx.strokeStyle = '#e7d4b3';ctx.lineWidth = 1.2 - p * .5;ctx.stroke();
  }

  if (age < .68) {
    const p = age / .68, dustAlpha = baseAlpha * .24 * (1 - p) ** 1.8 * smooth(age / .025);
    for (let i = 0; i < 7; i++) {
      const seed = (i * .6180339887) % 1, angle = i * 2.39996 + .31;
      const travel = radius * (.10 + p * (.55 + seed * .45));
      const xx = Math.cos(angle) * travel, yy = Math.sin(angle) * travel + age * age * radius * .48;
      const r = radius * (.06 + p * .14), dust = ctx.createRadialGradient(xx, yy, 0, xx, yy, r);
      dust.addColorStop(0, i % 2 ? '#c7b497' : '#8b795f');dust.addColorStop(1, '#9a866b00');
      ctx.globalAlpha = dustAlpha;ellipse(ctx, xx, yy, r, r, dust);
    }
  }

  const count = w < 500 ? 10 : 14;
  for (let i = 0; i < count; i++) {
    const seed = (i * .754877666) % 1, life = .43 + seed * .38;
    if (age >= life) continue;
    const angle = i * 2.39996 + .46, speed = radius * (2.3 + seed * 2.5);
    const travel = (1 - Math.exp(-age * 4.8)) / 4.8 * speed;
    const xx = Math.cos(angle) * travel, yy = Math.sin(angle) * travel + age * age * radius * 1.1;
    const length = radius * (.044 + seed * .047), width = Math.max(.7, length * .42);
    ctx.save();ctx.translate(xx, yy);ctx.rotate(angle + age * (8 + seed * 11));
    ctx.globalAlpha = baseAlpha * .87 * (1 - age / life) ** 1.25;
    ctx.beginPath();ctx.moveTo(-length, -width);ctx.lineTo(length, -width * .25);ctx.lineTo(length * .35, width);ctx.closePath();
    ctx.fillStyle = i % 3 ? '#c2a77b' : '#756044';ctx.fill();
    stroke(ctx, -length * .65, -width * .60, length * .5, -width * .15, '#f2dfb6', .55);ctx.restore();
  }
  ctx.restore();
}

/** Warm edge streaks during approach, with a brief restrained contact lift. */
export function drawBulletVignette(ctx, w, h, {age, duration = 1.7, impactAge = -1, entryMask = 0, reducedMotion = false} = {}) {
  if (reducedMotion || !validCanvas(ctx, w, h) || ![age, duration].every(Number.isFinite) || duration <= 0 || age < 0 || age >= duration) return;
  const envelope = smooth(age / .08) * smooth((duration - age) / .30);
  const entry = clamp(finite(entryMask), 0, 1), impact = finite(impactAge, -1);
  const contact = impact >= 0 && impact < .065 ? (1 - impact / .065) ** 2 : 0;
  const approach = impact < 0 ? 1 : Math.exp(-impact * 14);
  ctx.save();const baseAlpha = opacity(ctx);
  ctx.save();ctx.translate(w * .5, h * .45);ctx.scale(w * .56, h * .64);
  const edges = ctx.createRadialGradient(0, 0, .34, 0, 0, 1.30);
  edges.addColorStop(0, '#302a2200');edges.addColorStop(.48, '#302a2200');
  edges.addColorStop(.79, `rgba(43,34,25,${(.09 * envelope + .07 * entry).toFixed(4)})`);
  edges.addColorStop(1, `rgba(35,29,23,${(.30 * envelope + .13 * entry).toFixed(4)})`);
  ctx.fillStyle = edges;ctx.fillRect(-1.2, -1.2, 2.4, 2.4);ctx.restore();
  if (approach > .02) {
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const pulse = .45 + .55 * Math.sin(age * 31 + i * 1.7) ** 2;
      const yy = h * (.17 + i * .21), edgeX = side < 0 ? w * .018 : w * .982;
      const endX = edgeX - side * w * (.045 + .018 * pulse), endY = yy + (h * .45 - yy) * .045;
      const streak = ctx.createLinearGradient(edgeX, yy, endX, endY);
      streak.addColorStop(0, '#f4d2a800');streak.addColorStop(.28, '#f4d2a8');streak.addColorStop(1, '#f4d2a800');
      ctx.globalAlpha = baseAlpha * .19 * envelope * approach * pulse;
      stroke(ctx, edgeX, yy, endX, endY, streak, i % 2 ? .8 : 1.3);
    }
  }
  if (contact > 0) {
    ctx.globalAlpha = baseAlpha * contact * .07;
    const flash = ctx.createRadialGradient(w * .5, h * .45, Math.min(w, h) * .32, w * .5, h * .45, Math.max(w, h) * .8);
    flash.addColorStop(0, '#f6dab000');flash.addColorStop(1, '#f6dab0');ctx.fillStyle = flash;ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
