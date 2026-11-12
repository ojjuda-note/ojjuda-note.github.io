// Photograph-based motion puzzles. All public drawing coordinates use a 900 × 600 stage.
(function (global) {
  'use strict';

  const WIDTH = 900;
  const HEIGHT = 600;
  const TAU = Math.PI * 2;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const fract = value => value - Math.floor(value);
  const smooth = value => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };

  function surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function geometry(spot) {
    return {
      x: spot.x * WIDTH / 1000,
      y: spot.y * HEIGHT / 1000,
      w: spot.w * WIDTH / 1000,
      h: spot.h * HEIGHT / 1000
    };
  }

  function noise(seed) {
    let state = (seed ^ 0x9e3779b9) >>> 0;
    return function () {
      state += 0x6d2b79f5;
      let value = Math.imul(state ^ state >>> 15, 1 | state);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function bytePosition(x, y, image) {
    return 4 * (clamp(Math.round(y), 0, image.height - 1) * image.width +
      clamp(Math.round(x), 0, image.width - 1));
  }

  function sample(image, x, y, output) {
    x = clamp(x, 0, image.width - 1);
    y = clamp(y, 0, image.height - 1);
    const ix = Math.floor(x), iy = Math.floor(y);
    const ax = x - ix, ay = y - iy;
    const p = (iy * image.width + ix) * 4;
    const right = ix + 1 < image.width ? p + 4 : p;
    const row = iy + 1 < image.height ? 4 * image.width : 0;
    for (let i = 0; i < 3; i++) {
      const top = image.data[p + i] * (1 - ax) + image.data[right + i] * ax;
      const bottom = image.data[p + row + i] * (1 - ax) + image.data[right + row + i] * ax;
      output[i] = top * (1 - ay) + bottom * ay;
    }
  }

  // Tone changes are applied to the photographed material, with its grain and lettering intact.
  function staticDifference(image, target, spot, index) {
    const cx = spot.x * image.width / 1000, cy = spot.y * image.height / 1000;
    const rx = Math.max(2, spot.w * image.width / 2000), ry = Math.max(2, spot.h * image.height / 2000);
    const sx = spot.sx * image.width / 1000, sy = spot.sy * image.height / 1000;
    const rotation = (index % 2 ? 1 : -1) * .43;
    const sin = Math.sin(rotation), cos = Math.cos(rotation);
    const p = image.data, out = target.data, color = [0, 0, 0];
    const middle = bytePosition(cx, cy, image);
    // Use a cool change on warm metal, bronze on cool/neutral metal.
    const warm = p[middle] - p[middle + 2] > 9;
    const endX = Math.min(image.width, Math.ceil(cx + rx)), endY = Math.min(image.height, Math.ceil(cy + ry));
    for (let y = Math.max(0, Math.floor(cy - ry)); y < endY; y++) {
      const v = (y + .5 - cy) / ry;
      for (let x = Math.max(0, Math.floor(cx - rx)); x < endX; x++) {
        const u = (x + .5 - cx) / rx;
        const radius = Math.hypot(u, v);
        if (radius >= 1) continue;
        const feather = smooth((1 - radius) / .24);
        const i = (y * image.width + x) * 4;
        const r = p[i], g = p[i + 1], b = p[i + 2], luma = .2126 * r + .7152 * g + .0722 * b;
        switch (spot.type) {
          case 'erase':
          case 'copy':
            sample(image, sx + x - cx, sy + y - cy, color);
            break;
          case 'mirror':
            sample(image, cx - u * rx, cy + v * ry, color);
            break;
          case 'shift':
            sample(image, x - rx * .27 * (1 - v * v), y + ry * .13, color);
            break;
          case 'rotate':
            sample(image, cx + (u * cos + v * sin) * rx, cy + (v * cos - u * sin) * ry, color);
            break;
          case 'notch': {
            // A small break entering the photographed detail from its upper edge.
            const groove = Math.exp(-Math.pow((u - .24 * v) / .18, 2)) * smooth((.57 - v) / .48);
            const lip = Math.exp(-Math.pow((u - .24 * v - .18) / .085, 2)) * smooth((.57 - v) / .48);
            for (let k = 0; k < 3; k++) color[k] = p[i + k] * (1 - .76 * groove) + 24 * lip;
            break;
          }
          case 'stripe': {
            // Double inlaid line, slightly tilted to follow a natural printed/tooled pattern.
            const d = v - .10 * u;
            const lines = Math.max(Math.exp(-Math.pow((d + .13) / .070, 2)),
              Math.exp(-Math.pow((d - .11) / .052, 2)));
            const contrast = luma > 155 ? -.52 * luma : 47 + .17 * luma;
            color[0] = r + contrast * lines; color[1] = g + contrast * lines * .88;
            color[2] = b + contrast * lines * .66;
            break;
          }
          case 'metal': {
            const shade = luma * (warm ? 1.02 : 1.12);
            color[0] = warm ? shade * .80 + 3 : shade * 1.16 + 17;
            color[1] = warm ? shade * .99 + 7 : shade * .87 + 9;
            color[2] = warm ? shade * 1.14 + 15 : shade * .58 + 3;
            break;
          }
          case 'tint': {
            const red = r - luma, blue = b - luma;
            const tint = warm ? -1 : 1;
            color[0] = luma + .48 * blue + tint * (10 + .12 * luma);
            color[1] = luma + (g - luma) * .53 + 2;
            color[2] = luma + .65 * red - tint * (9 + .15 * luma);
            break;
          }
          default: throw new Error('Unknown static photograph effect: ' + spot.type);
        }
        for (let k = 0; k < 3; k++) out[i + k] = out[i + k] * (1 - feather) + color[k] * feather;
      }
    }
  }

  // A local, softly matted photographic cutout. Lighting masks lift the bright parts of the
  // actual object first, avoiding a painted circle over the surface. No full-frame filter runs per tick.
  function texture(image, spot, lighting) {
    const w = Math.max(4, Math.round(spot.w * image.width / 1000));
    const h = Math.max(4, Math.round(spot.h * image.height / 1000));
    const left = Math.round(spot.x * image.width / 1000 - w / 2);
    const top = Math.round(spot.y * image.height / 1000 - h / 2);
    const sprite = surface(w, h), ctx = sprite.getContext('2d');
    const pixels = ctx.createImageData(w, h), out = pixels.data, src = image.data;
    for (let y = 0; y < h; y++) {
      const v = 2 * (y + .5) / h - 1;
      for (let x = 0; x < w; x++) {
        const u = 2 * (x + .5) / w - 1;
        const radius = Math.hypot(u, v);
        if (radius >= 1) continue;
        const from = bytePosition(left + x, top + y, image), to = 4 * (y * w + x);
        const luma = (src[from] * .2126 + src[from + 1] * .7152 + src[from + 2] * .0722) / 255;
        let mask = smooth((1 - radius) / (lighting ? .55 : .32));
        if (lighting === 'dim') {
          mask *= .48 + .52 * Math.sqrt(luma);
          for (let k = 0; k < 3; k++) out[to + k] = src[from + k] * (.48 - k * .045);
        } else if (lighting) {
          // "Screen" exposure contributes more where the photographic surface already catches light.
          mask *= .32 + .68 * Math.sqrt(luma);
          const strength = lighting === 'warm' ? [.56, .395, .20] : [.39, .46, .48];
          for (let k = 0; k < 3; k++) out[to + k] = src[from + k] + (255 - src[from + k]) * strength[k];
        } else {
          for (let k = 0; k < 3; k++) out[to + k] = src[from + k];
        }
        out[to + 3] = Math.round(mask * 255);
      }
    }
    ctx.putImageData(pixels, 0, 0);
    return sprite;
  }

  // Detect a dark pointer against its lighter dial. Separate only the ink of the hand from
  // the photograph, so the printed numbers stay fixed while the instrument registers a reading.
  function instrument(image, spot) {
    const w = Math.max(8, Math.round(spot.w * image.width / 1000));
    const h = Math.max(8, Math.round(spot.h * image.height / 1000));
    const left = spot.x * image.width / 1000 - w / 2, top = spot.y * image.height / 1000 - h / 2;
    const at = (x, y) => bytePosition(left + x * w, top + y * h, image);
    const lum = (x, y) => {
      const i = at(x, y);
      return .25 * image.data[i] + .60 * image.data[i + 1] + .15 * image.data[i + 2];
    };
    let best = {score: -Infinity, x: .5, y: .5, angle: 0};
    const directions = Array.from({length: 72}, (_, i) => [Math.cos(i * TAU / 72), Math.sin(i * TAU / 72)]);
    for (let iy = 0; iy < 11; iy++) {
      const cy = .16 + .068 * iy;
      for (let ix = 0; ix < 11; ix++) {
        const cx = .16 + .068 * ix;
        let greatest = -Infinity, index = 0;
        for (let j = 0; j < directions.length; j++) {
          const [dx, dy] = directions[j];
          let support = 0;
          for (let k = 1; k <= 10; k++) {
            const x = cx + dx * (.025 + .031 * k), y = cy + dy * (.025 + .031 * k);
            if (x < .045 || x > .955 || y < .045 || y > .955) break;
            const ink = Math.min(lum(x, y), lum(x + dy * .009, y - dx * .009), lum(x - dy * .009, y + dx * .009));
            const flank = Math.min(lum(x - dy * .049, y + dx * .049), lum(x + dy * .049, y - dx * .049));
            support += clamp(flank - ink, -15, 125);
          }
          if (support > greatest) {greatest = support; index = j}
        }
        // A pivot often carries a dark rivet. Favour it over a point partway along a long hand.
        const surrounding = (lum(cx + .056, cy) + lum(cx - .056, cy) + lum(cx, cy + .056) + lum(cx, cy - .056)) / 4;
        const score = greatest / 10 + .5 * (surrounding - lum(cx, cy)) - 48 * Math.hypot(cx - .5, cy - .5);
        if (score > best.score) best = {x: cx, y: cy, angle: index * TAU / 72, score};
      }
    }
    const repair = surface(w, h), hand = surface(w, h);
    const rc = repair.getContext('2d'), hc = hand.getContext('2d');
    const rp = rc.createImageData(w, h), hp = hc.createImageData(w, h), src = image.data;
    const dx = Math.cos(best.angle), dy = Math.sin(best.angle), stroke = clamp(1.2 / Math.min(w,h), .026, .066);
    let pixels = 0;
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
      const u = (col + .5) / w, v = (row + .5) / h;
      const length = (u - best.x) * dx + (v - best.y) * dy, across = (u - best.x) * dy - (v - best.y) * dx;
      if (length < .021 || length > .39 || Math.abs(across) > stroke) continue;
      const d = .024 + stroke, p = at(u,v);
      const l = at(u - dy * d, v + dx * d), r = at(u + dy * d, v - dx * d);
      const b = (row * w + col) * 4;
      let contrast = 0;
      for (let k = 0; k < 3; k++) {
        rp.data[b + k] = .5 * (src[l + k] + src[r + k]);
        hp.data[b + k] = src[p + k];
        contrast += [.25,.60,.15][k] * (rp.data[b + k] - src[p + k]);
      }
      const mask = smooth((contrast - 3) / 17) * smooth((stroke - Math.abs(across)) / (stroke * .35)) *
        smooth((.39 - length) / .035);
      rp.data[b + 3] = hp.data[b + 3] = Math.round(255 * mask);
      if (mask > .55) pixels++;
    }
    rc.putImageData(rp,0,0);hc.putImageData(hp,0,0);
    return {...best, repair, hand, extracted:pixels >= Math.max(6, Math.min(w,h)*.24)};
  }

  function moveNeedle(c, a, t) {
    const needle = a.needle, {w,h} = a;
    const beat = (a.phase + t * a.rate) * 2.2;
    const steps = Math.floor(beat) + smooth(fract(beat) / .24);
    const angle = Math.sin(steps * .51) * .68;
    const px = needle.x - .5, py = needle.y - .5;
    if (needle.extracted) c.drawImage(needle.repair, -w/2,-h/2,w,h);
    c.scale(w,h);
    c.translate(px,py);
    c.rotate(angle);
    if (needle.extracted) {
      c.drawImage(needle.hand, -needle.x,-needle.y,1,1);
    } else {
      // A slim auxiliary sweep hand on a dial whose photographed pointer is too small to extract.
      c.rotate(needle.angle);
      c.beginPath();c.moveTo(-.045,.009);c.lineTo(.35,0);c.lineTo(-.045,-.012);c.closePath();
      c.fillStyle='rgba(87,48,30,.94)';c.fill();
      c.beginPath();c.arc(0,0,.025,0,TAU);c.fillStyle='#564631';c.fill();
    }
  }

  const surfaceMotion = new Set(['sway', 'swing', 'tick', 'turn', 'flutter', 'ripple']);
  const lightingMotion = new Set(['glow', 'glint', 'shimmer']);
  const airborneMotion = new Set(['steam', 'drip', 'dust', 'spark', 'sand']);
  function actor(image, spot, seed, different) {
    const random = noise(seed);
    const shape = geometry(spot);
    const actor = {
      ...shape, type: spot.type, different, phase: random() * TAU,
      rate: .66 + random() * .59, direction: random() < .5 ? -1 : 1, sample: null, particles: []
    };
    if (spot.type === 'tick') actor.needle = instrument(image, spot);
    else if (surfaceMotion.has(spot.type)) actor.sample = texture(image, spot, null);
    else if (lightingMotion.has(spot.type)) {
      actor.sample = texture(image, spot, spot.type === 'glow' ? 'warm' : 'cool');
      if (spot.type === 'glow') actor.dim = texture(image, spot, 'dim');
    }
    else if (!airborneMotion.has(spot.type)) throw new Error('Unknown photograph motion: ' + spot.type);
    if (airborneMotion.has(spot.type)) {
      const count = {steam: 3, drip: 3, spark: 7, dust: 8, sand: 11}[spot.type];
      for (let i = 0; i < count; i++) {
        actor.particles.push({start: (i + random() * .6) / count, x: random() - .5,
          y: random(), speed: .68 + random() * .56, size: .64 + random() * .72, phase: random() * TAU});
      }
      const center = bytePosition(spot.x * image.width / 1000, spot.y * image.height / 1000, image);
      actor.darkDust = image.data[center] * .3 + image.data[center + 1] * .59 + image.data[center + 2] * .11 > 172;
    }
    return actor;
  }

  function drawSurface(c, a, t) {
    const {w, h, sample} = a, p = a.phase, phase = p + t * a.rate * 1.86;
    const wave = Math.sin(phase);
    if (a.type === 'ripple' || a.type === 'flutter') {
      const flutter = a.type === 'flutter', rows = Math.min(11, sample.height);
      for (let row = 0; row < rows; row++) {
        const y0 = Math.round(sample.height * row / rows), y1 = Math.round(sample.height * (row + 1) / rows);
        const q = (row + .5) / rows;
        const envelope = flutter ? Math.pow(q, .76) : Math.sin(Math.PI * q);
        const offset = Math.sin(phase * (flutter ? 1.3 : 1) + q * (flutter ? 3.1 : 7.4)) *
          Math.min(w * (flutter ? .10 : .066), flutter ? 6 : 4.6) * envelope;
        const y = -h / 2 + y0 / sample.height * h;
        c.drawImage(sample, 0, y0, sample.width, y1 - y0,
          -w / 2 + offset, y, w, (y1 - y0) / sample.height * h + .16);
      }
      return;
    }
    if (a.type === 'sway' || a.type === 'swing') {
      const isSwing = a.type === 'swing';
      const pivot = (isSwing ? -.43 : .35) * h;
      c.translate(0, pivot);
      // The angle is constrained for broad objects so the scene never tears at their edges.
      const angle = Math.min(isSwing ? .19 : .135, .11 * w / Math.max(h * .7, 1));
      c.rotate(angle * wave);
      c.drawImage(sample, -w / 2, -h / 2 - pivot, w, h);
      return;
    }
    if (a.type === 'turn') {
      // Turn in the plane of the photographed wheel, retaining its foreshortened outline.
      c.scale(w / 2, h / 2);
      c.rotate(p + t * a.rate * .76);
      c.drawImage(sample, -1, -1, 2, 2);
      return;
    }
    moveNeedle(c, a, t);
  }

  function drawLight(c, a, t) {
    const {w, h, sample} = a, phase = t * a.rate * 1.95 + a.phase;
    if (a.type === 'glow') {
      const light = .84 * Math.sin(phase) + .16 * Math.sin(phase * 2.4);
      c.globalAlpha *= Math.abs(light);
      c.drawImage(light < 0 ? a.dim : sample, -w / 2, -h / 2, w, h);
      return;
    }
    const horizontal = a.type === 'glint', n = Math.min(12, horizontal ? sample.width : sample.height);
    const baseAlpha = c.globalAlpha;
    for (let i = 0; i < n; i++) {
      const q = (i + .5) / n;
      const lobe = .5 + .5 * Math.cos(phase - q * (horizontal ? 4.8 : 7.5));
      c.globalAlpha = baseAlpha * Math.pow(lobe, horizontal ? 3.7 : 2.4) * (horizontal ? 1 : .79);
      if (horizontal) {
        const x0 = Math.round(i * sample.width / n), x1 = Math.round((i + 1) * sample.width / n);
        c.drawImage(sample, x0, 0, x1 - x0, sample.height, (x0 / sample.width - .5) * w, -h / 2,
          (x1 - x0) / sample.width * w + .16, h);
      } else {
        const y0 = Math.round(i * sample.height / n), y1 = Math.round((i + 1) * sample.height / n);
        c.drawImage(sample, 0, y0, sample.width, y1 - y0, -w / 2, (y0 / sample.height - .5) * h,
          w, (y1 - y0) / sample.height * h + .16);
      }
    }
  }

  function airborne(c, a, t) {
    const {w, h} = a, kind = a.type, baseAlpha = c.globalAlpha;
    c.lineCap = 'round';
    const rate = {steam: .24, drip: .42, dust: .145, spark: .54, sand: .87}[kind] * a.rate;
    // Fractional cycles fade at both endpoints, including when the alternate track reverses.
    for (const p of a.particles) {
      const q = fract(p.start + t * rate * p.speed);
      const opacity = Math.sin(q * Math.PI);
      const wave = Math.sin(t * a.rate + p.phase + q * 3.1);
      if (kind === 'sand') {
        const x = w * p.x * (.08 + .08 * q);
        const y = h * (.87 * q - .445);
        const size = clamp(w * .037 * p.size, .65, 1.25);
        c.globalAlpha = baseAlpha * opacity * .82;
        c.fillStyle = p.y < .5 ? '#f1ddab' : '#ae9361';
        c.fillRect(x, y, size, size * 1.3);
      } else if (kind === 'steam') {
        const x = w * (p.x * .25 + wave * q * .15), y = h * (.41 - .69 * q);
        const bend = w * (.07 + .15 * q) * Math.sin(p.phase + t * .65);
        c.beginPath();c.moveTo(x, y);
        c.bezierCurveTo(x + bend, y - h * .09, x - .8 * bend, y - h * .20, x + bend * .48, y - h * .36);
        c.strokeStyle = a.darkDust ? '#8e877d' : '#f4e9d6';
        c.globalAlpha = baseAlpha * opacity * .105;
        c.lineWidth = clamp(w * .073, 1.8, 4.7);c.stroke();
        c.globalAlpha = baseAlpha * opacity * .27;
        c.lineWidth = clamp(w * .026, .76, 2.1);c.stroke();
      } else if (kind === 'drip') {
        const x = w * (p.x * .70 - q * .075), y = h * (q * .83 - .45);
        c.beginPath();c.moveTo(x, y);c.lineTo(x - .018 * w, y + h * .11);
        c.strokeStyle = a.darkDust ? '#435766' : '#d5e8ee';c.globalAlpha = baseAlpha * opacity * .64;
        c.lineWidth = clamp(w * .023 * p.size, .85, 1.8);c.stroke();
        c.beginPath();c.ellipse(x - .018 * w, y + .11 * h, .65 * p.size, 1.18 * p.size, 0, 0, TAU);c.fillStyle='#e3eef0';c.fill();
      } else {
        const spark = kind === 'spark';
        const x = w * (spark ? p.x * (.12 + .65 * q) + wave * .045 : p.x * .71 + wave * .12);
        const y = h * (spark ? .40 - .85 * q : .40 - .79 * q + .06 * Math.sin(p.phase + t * .65));
        const r = clamp(Math.min(w, h) * (spark ? .030 : .023) * p.size, .67, 2.1);
        c.globalAlpha = baseAlpha * opacity * (spark ? .70 : .56);
        c.fillStyle = spark ? (p.y < .45 ? '#e99f55' : '#ffe3a5') : (a.darkDust ? '#655b4f' : '#ece0c6');
        c.beginPath();c.ellipse(x, y, r, spark ? 1.4 * r : r * .82, 0, 0, TAU);c.fill();
      }
    }
  }

  function drawActor(c, actor, seconds, alternate) {
    // Shared actors receive exactly the same time. Answer actors start in precisely the same
    // pose, then diverge in tempo or travel direction.
    let time = seconds;
    if (alternate && actor.different) {
      if (airborneMotion.has(actor.type) && actor.type !== 'dust') time *= 1.79;
      else time *= actor.direction > 0 ? -1.14 : 1.83;
    }
    c.save();c.translate(actor.x, actor.y);
    if (surfaceMotion.has(actor.type)) drawSurface(c, actor, time);
    else if (lightingMotion.has(actor.type)) drawLight(c, actor, time);
    else airborne(c, actor, time);
    c.restore();
  }

  function create(image, scene) {
    const ratio = Math.min(1.8, (image.naturalWidth || image.width) / WIDTH);
    const width = Math.max(1, Math.round(WIDTH * ratio)), height = Math.max(1, Math.round(HEIGHT * ratio));
    const original = surface(width, height), altered = surface(width, height);
    const source = original.getContext('2d', {willReadFrequently: true});
    const edit = altered.getContext('2d');
    source.drawImage(image, 0, 0, width, height);
    const before = source.getImageData(0, 0, width, height), after = edit.createImageData(width, height);
    after.data.set(before.data);
    scene.static.forEach((spot, i) => staticDifference(before, after, spot, i));
    edit.putImageData(after, 0, 0);
    const seed = (Number(scene.id) || 1) * 15485863;
    const moving = [
      ...scene.common.map((s, i) => actor(before, s, seed + 983 * i, false)),
      ...scene.motion.map((s, i) => actor(before, s, seed + 4093 * (i + 11), true))
    ];

    return {
      draw(ctx, side, seconds) {
        const alternate = side === 1 || side === 'right';
        const t = Number.isFinite(seconds) ? seconds : 0;
        ctx.save();
        ctx.beginPath();ctx.rect(0, 0, WIDTH, HEIGHT);ctx.clip();
        ctx.drawImage(alternate ? altered : original, 0, 0, WIDTH, HEIGHT);
        for (const element of moving) drawActor(ctx, element, t, alternate);
        ctx.restore();
      }
    };
  }

  global.OjjudaMotionRenderer = {create};
})(window);
