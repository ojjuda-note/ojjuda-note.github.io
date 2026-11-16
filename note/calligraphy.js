/* Local brush, Hangul outlines and phrase layout used by park cards. */
(() => {
  'use strict';

  /* Ink a single centreline in local glyph coordinates. The optional seeded random
     function gives repeatable variation. Uses ordinary Canvas 2D, without assets. */
  function paintCalliInk(ctx, stroke, random, tint) {
    const knots = stroke.knots;
    if (!knots || knots.length < 2 || !(stroke.width > 0)) return;
    let seed = Math.round((knots[0][0] * 937 + knots[0][1] * 523 + stroke.width * 211) * 100);
    const pick = random || (() => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    const phase = pick() * Math.PI * 2;
    const nibAngle = .30 + pick() * .30;
    const nibX = Math.cos(nibAngle),
      nibY = Math.sin(nibAngle);
    const wet = pick(),
      lift = pick(),
      lean = (pick() - .5) * .20;
    const points = [];
    let length = 0;
    function append(x, y, pressure) {
      const previous = points[points.length - 1];
      const step = previous ? Math.hypot(x - previous.x, y - previous.y) : 0;
      if (previous && step < .035) return;
      length += step;
      points.push({
        x,
        y,
        p: Math.max(.008, pressure),
        d: length
      });
    }
    for (let i = 0; i < knots.length - 1; i++) {
      const a = knots[Math.max(0, i - 1)],
        b = knots[i],
        c = knots[i + 1],
        d = knots[Math.min(i + 2, knots.length - 1)];
      const n = Math.max(3, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 1.35));
      for (let j = 0; j < n; j++) {
        const t = j / n,
          t2 = t * t,
          t3 = t2 * t;
        const wa = .5 * (-t + 2 * t2 - t3),
          wb = 1 + .5 * (-5 * t2 + 3 * t3);
        const wc = .5 * (t + 4 * t2 - 3 * t3),
          wd = .5 * (-t2 + t3);
        append(wa * a[0] + wb * b[0] + wc * c[0] + wd * d[0], wa * a[1] + wb * b[1] + wc * c[1] + wd * d[1], wa * a[2] + wb * b[2] + wc * c[2] + wd * d[2]);
      }
    }
    const lastKnot = knots[knots.length - 1];
    append(lastKnot[0], lastKnot[1], lastKnot[2]);
    if (points.length < 2) return;
    const weight = stroke.width * (.96 + wet * .085);
    const headLength = Math.min(length * .16, weight * (.25 + wet * .12));
    const tailLength = Math.min(length * .26, weight * (.46 + lift * .26));
    for (let i = 0; i < points.length; i++) {
      const q = points[i],
        before = points[Math.max(0, i - 1)],
        after = points[Math.min(points.length - 1, i + 1)];
      const dx = after.x - before.x,
        dy = after.y - before.y,
        norm = Math.hypot(dx, dy) || 1;
      q.nx = -dy / norm;
      q.ny = dx / norm;
      const across = q.nx * nibX + q.ny * nibY;
      // An oblique flexible nib leaves a thinner return and a broader downstroke.
      const nib = Math.sqrt(.47 + .53 * across * across);
      const atHead = Math.min(1, q.d / headLength);
      const atTail = Math.min(1, (length - q.d) / tailLength);
      const load = .50 + .50 * Math.sin(atHead * Math.PI / 2);
      const release = .075 + .925 * Math.sin(atTail * Math.PI / 2);
      const half = weight * .50 * Math.pow(q.p, .93) * nib * load * release;
      const breathing = Math.sin(q.d * .145 + phase) * .022 + Math.sin(q.d * .331 - phase) * .009;
      const roughness = Math.min(.16, half * .021);
      q.l = half * (1 + lean + breathing) + roughness * Math.sin(q.d * 1.73 + phase);
      q.r = half * (1 - lean - breathing) + roughness * Math.sin(q.d * 1.27 - phase);
    }
    const first = points[0],
      last = points[points.length - 1];
    const shade = Math.floor(11 + wet * 6);
    function color(value) {
      if (tint) return tint(value);
      return 'rgb(' + value + ',' + (value - 2) + ',' + (value - 3) + ')';
    }
    // Tonal variation is longitudinal. The body remains one uninterrupted mass of ink.
    if (length > weight * 1.2 && Math.hypot(last.x - first.x, last.y - first.y) > weight * .5) {
      const wash = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
      wash.addColorStop(0, color(shade + 2));
      wash.addColorStop(.42, color(shade));
      wash.addColorStop(1, color(shade + 7));
      ctx.fillStyle = wash;
    } else ctx.fillStyle = color(shade + 1);
    const outline = (q, side) => {
      const radius = side > 0 ? q.l * side : q.r * side;
      return [q.x + radius * q.nx, q.y + radius * q.ny];
    };
    ctx.beginPath();
    ctx.moveTo(...outline(first, 1));
    for (let i = 1; i < points.length; i++) ctx.lineTo(...outline(points[i], 1));
    ctx.lineTo(...outline(last, -1));
    for (let i = points.length - 2; i >= 0; i--) ctx.lineTo(...outline(points[i], -1));
    // Smoothly turn the brush into the loaded opening; no square cut at the start.
    ctx.quadraticCurveTo(first.x - first.ny * weight * first.p * .13, first.y + first.nx * weight * first.p * .13, ...outline(first, 1));
    ctx.closePath();
    ctx.fill();

    // A brief irregular edge on selected long lifts. Each filament leaves the
    // outer edge, then comes to its own point. The paper shows between the hairs.
    if (length < weight * 2 || lift < .55 || last.p > .29) return;
    const side = pick() < .50 ? -1 : 1;
    const count = 1 + Math.floor(pick() * 3);
    ctx.fillStyle = color(shade + 10);
    for (let i = 0; i < count; i++) {
      const start = Math.floor(points.length * (.73 + .08 * pick()));
      const end = Math.min(points.length - 1, Math.max(start + 2, Math.floor(points.length * (.91 + .09 * pick()))));
      const reach = (.028 + pick() * .043) * weight;
      ctx.beginPath();
      for (let j = start; j <= end; j++) {
        const q = points[j],
          t = (j - start) / (end - start);
        const push = reach * Math.sin(t * Math.PI * .7);
        const rad = (side > 0 ? q.l : q.r) + push;
        const x = q.x + side * rad * q.nx,
          y = q.y + side * rad * q.ny;
        if (j === start) ctx.moveTo(x, y);else ctx.lineTo(x, y);
      }
      for (let j = end; j >= start; j--) {
        const q = points[j],
          t = (j - start) / (end - start);
        const rad = (side > 0 ? q.l : q.r) + reach * Math.sin(t * Math.PI * .7) - .045 * weight * (1 - t);
        ctx.lineTo(q.x + side * rad * q.nx, q.y + side * rad * q.ny);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  /* Curves are original, in pen order. Syllables use proportional 100-unit ems. */
  const CalliGlyphs = (() => {
    const initial = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
    const medial = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
    const final = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
    const pairs = {
      ㄲ: 'ㄱㄱ',
      ㄸ: 'ㄷㄷ',
      ㅃ: 'ㅂㅂ',
      ㅆ: 'ㅅㅅ',
      ㅉ: 'ㅈㅈ',
      ㄳ: 'ㄱㅅ',
      ㄵ: 'ㄴㅈ',
      ㄶ: 'ㄴㅎ',
      ㄺ: 'ㄹㄱ',
      ㄻ: 'ㄹㅁ',
      ㄼ: 'ㄹㅂ',
      ㄽ: 'ㄹㅅ',
      ㄾ: 'ㄹㅌ',
      ㄿ: 'ㄹㅍ',
      ㅀ: 'ㄹㅎ',
      ㅄ: 'ㅂㅅ'
    };
    const mixed = {
      ㅘ: 'ㅗㅏ',
      ㅙ: 'ㅗㅐ',
      ㅚ: 'ㅗㅣ',
      ㅝ: 'ㅜㅓ',
      ㅞ: 'ㅜㅔ',
      ㅟ: 'ㅜㅣ',
      ㅢ: 'ㅡㅣ'
    };
    const curve = spec => spec.trim().split(/\s+/).map(point => point.split(',').map(Number));
    const map = (path, x, y, w, h) => path.map(([a, b, p]) => [x + a * w / 100, y + b * h / 100, p]);
    const topBar = curve('2,25,.13 13,23,.67 43,16,.77 74,12,.52 98,14,.03');
    const midBar = curve('16,52,.15 33,50,.54 64,43,.62 87,39,.055');
    const under = curve('3,88,.21 13,92,.81 35,90,.89 68,80,.59 89,77,.28 100,78,.03');
    const foot = curve('22,5,.21 26,10,.84 23,29,1.07 16,58,.94 13,76,.83 18,84,.7 33,85,.67 56,78,.50 81,61,.29 100,48,.025');
    const round = curve('57,12,.10 46,10,.66 27,24,.91 15,48,1.1 13,73,.86 21,86,.70 40,88,.68 60,78,.64 77,60,.51 86,41,.63 85,25,.65 75,17,.44 58,20,.21 48,27,.03');
    const hook = curve('3,30,.15 13,29,.68 36,18,.97 62,10,1.09 79,10,.93 84,16,.74 82,29,.60 69,49,.55 48,71,.36 26,90,.18 11,99,.02');
    const topHook = curve('4,23,.20 17,21,.78 43,14,.93 67,9,.87 84,11,.74 88,21,.70 86,38,.70 78,65,.55 68,88,.19 62,96,.025');
    const armL = curve('13,8,.23 23,12,.73 25,28,.91 20,52,.95 16,78,.70 19,93,.14');
    const armR = curve('79,0,.16 88,5,.83 87,24,.91 82,49,.85 72,77,.57 64,94,.09');
    const forkL = curve('67,2,.18 70,11,.83 64,29,1.09 51,48,.98 33,67,.81 12,82,.49 -2,88,.07');
    const forkR = curve('54,42,.12 58,52,.35 67,65,.59 82,76,.86 94,79,.56 101,77,.09');
    const head = curve('27,4,.13 40,9,.55 54,17,.87 60,24,.68 56,28,.14');
    const bent = curve('22,12,.14 26,20,.81 23,43,.99 15,68,.88 13,80,.78 18,85,.74 35,85,.68 59,77,.54 81,67,.29 99,55,.03');
    const zigTop = curve('7,18,.13 20,18,.67 44,12,.79 67,7,.74 82,8,.64 83,18,.56 75,32,.42 64,44,.09');
    const zigSpan = curve('72,37,.13 57,41,.51 36,47,.69 17,54,.52 11,59,.10');
    const zigFoot = curve('19,49,.12 21,59,.68 16,73,.79 13,84,.74 17,91,.66 34,91,.63 57,83,.55 79,76,.32 99,75,.025');
    const boxTop = curve('14,23,.11 37,17,.52 62,12,.78 83,12,.74 87,19,.63 82,41,.67 75,62,.66 67,83,.25');
    const profiles = {
      ㄱ: [hook],
      ㄴ: [foot],
      ㄷ: [topBar, bent],
      ㄹ: [zigTop, zigSpan, zigFoot],
      ㅁ: [armL, boxTop, under],
      ㅂ: [armL, armR, midBar, under],
      ㅅ: [forkL, forkR],
      ㅇ: [round],
      ㅈ: [topBar, map(forkL, 1, 13, 95, 82), map(forkR, 0, 13, 97, 83)],
      ㅊ: [head, map(topBar, 1, 19, 98, 65), map(forkL, 3, 30, 93, 73), map(forkR, 0, 29, 99, 73)],
      ㅋ: [hook, map(midBar, -2, 4, 94, 95)],
      ㅌ: [topBar, map(midBar, -2, 3, 94, 90), bent],
      ㅍ: [topBar, map(armL, 14, 10, 72, 81), map(armR, -5, 13, 94, 75), under],
      ㅎ: [map(head, 4, -1, 90, 79), map(topBar, 0, 16, 100, 60), map(round, 7, 34, 82, 69)]
    };
    const lowerN = curve('16,5,.11 25,13,.73 24,26,.99 15,51,1.04 9,74,.87 12,87,.77 24,93,.72 43,90,.65 65,79,.52 87,67,.27 103,63,.025');
    const hLine = curve('-1,57,.13 8,57,.79 29,52,1.04 57,43,.86 81,39,.54 101,39,.025');
    const up = curve('51,1,.17 55,8,.79 53,20,1.04 46,36,.74 41,52,.18');
    const down = curve('58,27,.27 60,34,.76 59,46,1.03 55,59,.99 46,75,.79 38,92,.44 32,111,.025');
    const baseLine = curve('-2,62,.15 7,62,.85 30,54,1.02 58,44,.88 81,38,.49 103,38,.03');
    const hVowels = {
      ㅗ: [up, hLine],
      ㅛ: [map(up, -9, 7, 84, 91), map(up, 25, -1, 82, 97), hLine],
      ㅜ: [map(hLine, 0, -10, 100, 89), down],
      ㅠ: [map(hLine, 0, -13, 100, 89), map(down, -14, -5, 90, 102), map(down, 23, -10, 90, 103)],
      ㅡ: [baseLine]
    };
    function decompose(ch) {
      if (!ch || Array.from(ch).length !== 1) return null;
      const i = ch.codePointAt(0) - 0xAC00;
      return i >= 0 && i < 11172 ? [initial[Math.floor(i / 588)], medial[Math.floor(i / 28) % 21], final[i % 28]] : null;
    }
    // The straight vowels are written on a bowed axis; bars are positioned on it.
    function verticalPaths(v, flourish) {
      const leftBars = 'ㅓㅔㅕㅖ'.includes(v),
        doubleBars = 'ㅑㅒㅕㅖ'.includes(v),
        twoStems = 'ㅐㅒㅔㅖ'.includes(v);
      const axes = twoStems ? leftBars ? [55, 91] : [24, 90] : [v === 'ㅣ' ? 57 : leftBars ? 85 : 29];
      const paths = [];
      function axis(x, isOuter) {
        const extension = isOuter && flourish ? 13 : 0;
        return curve(`${x + 7},0,.14 ${x + 10},8,.94 ${x + 7},25,1.04 ${x + .3},49,.91 ${x - 6},72,.68 ${x - 10},91,.40 ${x - 10.5},${101 + extension / 2},.16 ${x - 8},${106 + extension},.025`);
      }
      const starts = doubleBars ? [31, 58] : [47];
      const x = axes[0];
      function bar(y) {
        const joint = x + 1 - (y - 47) * .21;
        if (leftBars) return curve(`0,${y + 13},.045 ${joint * .19},${y + 13},.64 ${joint * .53},${y + 7},.78 ${joint * .82},${y + .8},.45 ${joint + 1},${y},.12`);
        const reach = twoStems ? axes[1] : flourish ? 111 : 100;
        const delta = reach - joint;
        return curve(`${joint},${y + 1},.18 ${joint + delta * .13},${y},.47 ${joint + delta * .45},${y - 9},.70 ${joint + delta * .72},${y - 14},.47 ${reach},${y - 16},.03`);
      }
      if (leftBars) for (const y of starts) paths.push(bar(y));
      paths.push(axis(x, axes.length === 1));
      if (!leftBars && v !== 'ㅣ') for (const y of starts) paths.push(bar(y));
      if (twoStems) paths.push(axis(axes[1], true));
      return paths;
    }
    const terminalL = curve('19,49,.12 22,57,.76 16,72,.90 13,84,.78 19,92,.71 38,91,.72 60,81,.62 86,72,.44 111,70,.23 126,73,.015');
    const terminalN = curve('18,2,.12 24,12,.81 22,30,1.03 14,55,.94 10,78,.83 14,89,.73 29,93,.68 49,87,.54 75,72,.38 98,62,.25 117,60,.025');
    // Two letters share one 받침 row. Give each its own compact pen forms:
    // the open spaces in ㄹ, ㅁ, ㅂ and ㅎ must survive at card thumbnail sizes.
    const codaFoot = curve('7,85,.40 20,87,.87 44,84,.88 72,79,.63 95,76,.16');
    const codaBar = curve('8,23,.27 24,21,.84 50,16,.86 76,13,.66 96,13,.12');
    const codaMiddle = curve('17,50,.28 35,49,.72 62,44,.75 84,43,.21');
    const codaLeft = curve('18,9,.38 23,17,.97 22,34,1.02 17,58,.94 12,84,.65');
    const codaRight = curve('81,5,.33 87,12,.93 85,31,.98 79,57,.94 71,85,.51');
    const codaAngle = curve('5,22,.32 23,18,.92 53,12,.97 78,10,.87 86,14,.84 85,30,.88 76,61,.80 65,88,.29');
    const codaCorner = curve('18,7,.30 23,15,1 21,36,1.08 13,71,1 14,83,.94 23,87,.84 44,84,.87 71,76,.62 97,67,.16');
    const codaFork = [
      curve('62,6,.33 64,15,.96 55,35,1.06 39,56,.97 18,77,.71 0,89,.12'),
      curve('46,44,.26 54,51,.61 69,65,.94 84,73,.84 101,75,.13')
    ];
    const codaProfiles = {
      ㄱ: [codaAngle],
      ㄴ: [codaCorner],
      ㄹ: [
        curve('5,21,.28 20,18,.84 50,13,.93 74,12,.84 81,15,.79 80,28,.86 74,44,.83 62,48,.72 38,50,.73 18,54,.25'),
        curve('22,51,.43 24,58,.91 19,73,.97 17,84,.94 23,89,.86 45,86,.88 72,80,.65 97,74,.13')
      ],
      ㅁ: [codaLeft, codaAngle, codaFoot],
      ㅂ: [codaLeft, codaRight, codaMiddle, codaFoot],
      ㅅ: codaFork,
      ㅈ: [codaBar, ...codaFork.map(stroke => map(stroke, 0, 13, 98, 87))],
      ㅌ: [codaBar, codaMiddle, codaCorner],
      ㅍ: [codaBar, map(codaLeft, 14, 12, 65, 78), map(codaRight, -2, 10, 88, 81), codaFoot],
      ㅎ: [
        curve('38,-2,.26 46,0,.72 55,5,.96 65,11,.38'),
        curve('6,32,.21 24,29,.79 48,23,.89 75,22,.69 97,24,.10'),
        curve('61,40,.41 46,39,.78 30,48,.92 21,66,1 22,82,.94 31,90,.76 48,89,.74 64,79,.86 74,62,.89 74,49,.77 66,42,.60 55,43,.18')
      ]
    };
    function shape(ch, options = {}) {
      const data = decompose(ch);
      if (!data) return null;
      const [c, v, f] = data,
        m = mixed[v],
        horizontal = !!hVowels[v],
        stacked = horizontal || !!m;
      const complexOnset = !!pairs[c],
        complexFinal = !!pairs[f];
      const twinVowel = 'ㅐㅒㅔㅖ'.includes(v);
      const wordEnd = options === true || !!(options && (options.final || options.wordEnd || options.terminal));
      const long = wordEnd && !f,
        strokes = [];
      const baseAdvance = m ? 94 : horizontal ? 90 : twinVowel ? 96 : v === 'ㅣ' ? 76 : v === 'ㅓ' || v === 'ㅕ' ? 82 : 88;
      const advance = baseAdvance + (complexOnset ? 7 : 0) + (complexFinal ? 5 : 0) + (f ? 2 : 0) + (wordEnd ? 3 : 0);
      function draw(key, x, y, w, h, weight = 1, place = '') {
        if (pairs[key]) {
          const [a, b] = pairs[key];
          const left = key === 'ㄺ' || key === 'ㄼ' ? 0.52 : 0.47;
          draw(a, x, y + h * .035, w * left, h * .94, weight * .75, place);
          draw(b, x + w * (left + .035), y, w * (.965 - left), h, weight * .76, place);
          return;
        }
        let paths = profiles[key] || hVowels[key];
        if (!paths) paths = verticalPaths(key, long && place !== 'mixed');
        if ((key === 'ㄱ' || key === 'ㅋ') && place === 'top') paths = [topHook, ...paths.slice(1)];
        if (key === 'ㄴ' && place === 'final') paths = [wordEnd && !complexFinal ? terminalN : lowerN];
        if (key === 'ㄹ' && place === 'final' && wordEnd && !complexFinal) paths = [zigTop, zigSpan, terminalL];
        const density = 'ㅂㅌㅍㅁㄹ'.includes(key) ? .82 : 'ㅎㅊㅈ'.includes(key) ? .88 : 1;
        const width = 15.6 * weight * density * Math.min(1.08, Math.sqrt(Math.min(w / 44, h / 55)));
        for (const path of paths) strokes.push({
          knots: map(path, x, y, w, h),
          width
        });
      }
      // Horizontal and compound syllables make room at the bottom for the coda.
      if (m) {
        const top = complexFinal ? 31 : f ? 34 : 50;
        const upperW = complexOnset ? 53 : 'ㅇㅎ'.includes(c) ? 38 : 49;
        draw(c, 8 + (53 - upperW) * .55, 5, upperW, top, 1.01, 'top');
        const lower = complexFinal ? 24 : f ? 29 : 40;
        draw(m[0], 2, top + 2, 60, lower, .89);
        draw(m[1], 59, -1, advance - 64, complexFinal ? 53 : f ? 61 : 85, .96, 'mixed');
      } else if (horizontal) {
        const top = f ? v === 'ㅡ' ? 41 : 36 : v === 'ㅡ' ? 66 : v === 'ㅗ' || v === 'ㅛ' ? 51 : 43;
        const upperW = (c === 'ㅇ' ? 40 : c === 'ㅎ' ? 51 : complexOnset ? 72 : 62) * (v === 'ㅡ' ? 1.03 : 1);
        const topX = (advance - upperW) / 2 + (c === 'ㅇ' ? 3 : 0);
        draw(c, topX, f ? 1 : 4, upperW, top, 1.05, 'top');
        const y = top + (v === 'ㅡ' ? 0 : 3);
        draw(v, 1, y, advance - (wordEnd && v === 'ㅡ' ? -2 : 6), (complexFinal ? 56 : f ? 65 : 99) - y, 1.00);
      } else {
        const compact = c === 'ㅇ',
          wide = complexOnset,
          start = f ? 7 : 12;
        const cWidth = compact ? f ? 31 : 35 : wide ? 51 : twinVowel ? 44 : 48;
        const cHeight = compact ? f ? 34 : 45 : f ? 50 : 65;
        const cY = compact ? f ? 19 : 30 : start;
        draw(c, 1, cY, cWidth, cHeight, compact ? 1.00 : 1.07);
        const vx = cWidth + (compact ? 0 : -1);
        draw(v, vx, f ? 0 : -1, advance - vx - 5, complexFinal ? 53 : f ? 60 : 88, 1.03);
      }
      if (complexFinal) {
        const [left, right] = pairs[f];
        const start = advance * .035, span = advance * .93;
        const split = left === 'ㄹ' ? .50 : left === 'ㄴ' ? .43 : .475;
        const gap = span * .065, space = span - gap;
        const top = stacked ? 61 : 60, height = 100 - top;
        function codaPart(key, x, width) {
          const weight = Math.min(11.7, width * .31) * ('ㄹㅁㅂㅌㅍㅎ'.includes(key) ? .87 : 1);
          for (const path of codaProfiles[key]) strokes.push({ knots: map(path, x, top, width, height), width: weight });
        }
        codaPart(left, start, space * split);
        codaPart(right, start + space * split + gap, space * (1 - split));
      } else if (f) {
        const y = f === 'ㅇ' ? 62 : f === 'ㄴ' && stacked ? 63 : 66;
        const w = f === 'ㅇ' ? 38 : f === 'ㅎ' ? 52 : f === 'ㅅ' ? 56 : f === 'ㅁ' ? 55 : advance * .72;
        const x = f === 'ㅇ' ? advance * .38 : f === 'ㄴ' ? advance * .10 : (advance - w) * .47;
        draw(f, x, y, w, 99 - y, 1.04, 'final');
      }
      return {
        strokes,
        advance
      };
    }
    return {
      shape,
      decompose
    };
  })();

  /* Original, freely drawn outlines for these syllables. Units are shared with the compositional alphabet. */
  const Lettering = (() => {
    const letter = (advance, ...paths) => ({
      advance,
      paths
    });
    const characters = {
      '오': letter(92, 'M60 7 C68 9 70 17 65 28 C61 40 48 52 36 53 C26 54 21 48 24 38 C29 25 43 11 55 9 C60 8 64 11 62 15 C59 18 56 20 52 21 C43 25 35 37 35 43 C36 47 43 43 50 36 C58 27 63 17 60 7 Z', 'M48 49 C54 48 59 52 56 58 C52 66 48 73 47 80 L37 83 C39 74 43 64 45 56 Q46 51 48 49 Z', 'M3 87 C20 76 40 72 58 68 C72 65 87 63 96 66 C98 67 94 69 89 70 C62 75 36 85 12 96 C6 98 1 93 3 87 Z'),
      '늘': letter(85, 'M32 5 C39 4 43 9 39 14 C35 19 30 25 31 28 C33 31 47 26 63 18 C58 25 43 35 31 36 C22 37 19 33 22 24 C25 17 28 9 32 5 Z', 'M7 50 C23 42 54 36 78 35 C87 34 90 35 91 37 C83 39 68 40 54 44 L15 57 C8 59 4 55 7 50 Z', 'M26 62 C37 56 58 51 70 52 C76 53 75 57 71 61 L57 72 C61 72 64 71 68 70 C66 74 54 77 41 79 C34 81 30 80 32 76 C35 73 46 70 54 65 L59 60 C49 59 38 64 31 66 C26 68 24 66 26 62 Z', 'M35 79 C41 76 45 79 42 83 C39 87 34 91 34 94 C36 99 50 97 69 92 C79 89 88 85 98 81 C88 90 69 101 47 105 C33 108 23 106 22 99 C20 92 27 84 35 79 Z'),
      '도': letter(79, 'M22 20 C40 13 55 9 68 9 C73 9 76 10 75 13 C72 16 63 18 54 19 C40 21 29 24 24 26 C20 27 18 24 22 20 Z', 'M24 20 C30 20 32 23 30 27 C26 35 22 44 25 47 C28 50 44 44 60 36 C56 42 42 51 33 55 C19 62 12 58 14 48 C16 38 19 26 24 20 Z', 'M42 55 C49 53 54 56 52 62 C47 70 45 76 43 81 L34 82 C35 73 38 62 42 55 Z', 'M0 86 C22 76 46 70 68 68 C76 67 86 67 91 68 C83 72 75 74 62 77 C43 82 24 89 9 94 C4 96 -2 92 0 86 Z'),
      '수': letter(99, 'M62 4 C68 2 75 7 72 14 C69 24 58 36 48 45 C35 58 18 68 -6 74 C10 65 26 50 40 34 C50 22 55 13 58 7 Q60 4 62 4 Z', 'M51 32 C55 31 61 35 69 41 C78 47 83 49 94 49 C89 54 82 57 75 55 C66 53 56 45 50 38 C48 35 48 34 51 32 Z', 'M0 81 C21 70 45 65 64 62 C79 60 94 60 103 62 C107 62 111 64 112 66 C98 65 80 67 62 73 C43 78 21 84 9 90 C3 92 -2 87 0 81 Z', 'M58 70 C64 68 68 70 65 76 C58 87 53 100 46 110 C40 119 30 128 21 131 C35 117 43 98 49 80 C52 73 54 71 58 70 Z'),
      '고': letter(91, 'M17 20 C31 15 52 6 68 5 C76 4 80 8 78 15 C74 28 62 43 44 58 C51 47 59 31 62 21 C63 17 63 16 60 17 C50 19 33 28 23 31 C15 34 11 27 17 20 Z', 'M44 54 C50 51 56 55 53 61 C49 68 45 77 44 83 L34 86 C35 75 39 60 44 54 Z', 'M-2 85 C20 76 42 71 66 68 C78 67 91 66 100 68 C89 70 77 73 66 77 C46 83 24 89 8 96 C2 99 -5 92 -2 85 Z'),
      '했': letter(86, 'M18 9 C26 8 37 11 37 16 C36 20 30 20 27 18 C22 15 18 12 18 9 Z', 'M5 29 C15 23 28 21 39 21 C45 20 48 21 47 23 C37 26 25 29 13 34 C8 36 3 34 5 29 Z', 'M32 33 C39 31 43 35 41 42 C38 51 27 60 19 61 C10 64 6 59 9 52 C12 44 23 35 30 34 Q33 34 31 37 C23 41 17 49 17 54 C18 58 24 54 28 50 C33 45 36 37 32 33 Z', 'M53 11 C58 11 61 14 59 20 C54 32 49 45 47 56 Q45 62 42 65 C41 54 43 39 47 26 C49 19 51 13 53 11 Z', 'M48 37 C56 31 63 29 71 28 L70 33 C64 34 57 38 49 42 Z', 'M78 4 C84 4 87 9 85 15 C80 31 74 48 71 62 Q70 66 68 72 C66 56 67 43 71 26 C73 17 75 6 78 4 Z', 'M33 67 C38 66 43 69 40 74 C34 82 19 95 9 99 C18 88 25 78 29 70 Z M30 80 C34 79 40 84 45 91 C38 92 32 88 28 85 Z', 'M60 68 C65 64 70 66 68 72 C64 80 55 91 46 99 C49 90 56 78 58 71 Z M59 80 C64 79 68 83 73 86 C78 90 83 91 86 91 C78 98 68 94 60 87 Z'),
      '어': letter(93, 'M42 24 C49 24 53 28 52 35 C51 45 42 58 31 66 C20 75 9 77 6 70 C3 64 7 51 15 40 C22 30 29 23 36 22 C40 22 43 25 40 29 C38 31 34 33 30 36 C21 45 15 58 17 63 C20 66 29 58 37 49 C45 39 49 28 42 24 Z', 'M45 48 C58 41 67 34 76 33 C81 32 82 36 80 38 C69 40 57 48 49 54 Q43 56 45 48 Z', 'M86 1 C92 -1 98 4 95 13 C89 32 83 56 80 77 C77 95 78 105 81 111 C74 106 72 95 72 79 C72 56 77 32 81 14 C83 8 83 3 86 1 Z'),
      '이': letter(78, 'M40 27 C46 27 49 31 46 38 C43 48 33 60 21 65 C12 69 7 64 9 56 C12 45 23 32 33 28 C37 26 40 27 39 30 C30 35 20 47 19 56 C21 60 27 54 32 49 C39 41 44 31 40 27 Z', 'M69 0 C75 -1 79 4 77 13 C73 30 67 55 64 79 C62 91 61 103 62 111 C57 102 56 87 57 73 C59 50 63 24 65 10 C66 5 67 2 69 0 Z'),
      '건': letter(93, 'M8 30 C17 25 34 17 42 17 C48 16 51 20 48 27 C42 38 24 51 2 65 C18 50 31 35 34 28 C24 30 17 36 11 37 C7 38 5 35 8 30 Z', 'M43 39 C55 33 63 28 70 27 L70 34 C61 36 51 42 44 45 C41 46 40 42 43 39 Z', 'M75 2 C82 0 86 5 84 12 C79 30 74 48 68 64 C66 68 64 69 62 72 C62 59 65 40 69 23 C71 12 72 5 75 2 Z', 'M29 66 C36 63 41 65 38 72 C34 79 29 87 31 90 C34 95 52 89 65 85 C77 81 86 77 99 75 C85 82 70 90 51 98 C35 104 25 106 20 100 C15 93 22 74 29 66 Z'),
      '강': letter(90, 'M6 31 C18 25 33 17 42 17 C47 17 51 20 49 25 C44 36 28 50 8 61 C20 49 32 34 35 28 C27 30 16 38 10 38 C6 38 3 35 6 31 Z', 'M67 3 C73 0 78 4 76 12 C73 26 67 42 62 58 Q60 66 56 68 C55 57 57 43 61 25 C63 14 63 6 67 3 Z', 'M62 37 C74 29 87 25 97 27 C97 29 93 30 88 31 C80 34 71 39 63 43 Z', 'M54 64 C64 63 69 67 66 76 C63 86 50 98 38 102 C26 106 20 102 21 94 C23 83 35 70 46 65 C50 63 54 64 53 68 C44 72 33 84 32 93 C32 99 43 93 50 87 C59 79 63 68 54 64 Z'),
      '최': letter(86, 'M27 10 C33 9 45 12 45 17 C44 21 38 20 35 18 Q29 14 27 10 Z', 'M5 31 C18 24 41 19 54 20 C58 21 58 22 59 23 C45 24 27 29 13 35 Q4 39 5 31 Z', 'M38 29 C44 27 49 30 46 35 C38 46 21 56 4 63 C17 52 28 40 34 32 Z', 'M31 44 C34 41 40 43 45 47 Q50 51 56 50 C49 57 40 55 34 50 Z', 'M33 59 C39 57 45 59 43 65 L35 82 L26 84 Q27 70 33 59 Z', 'M-2 88 C19 79 43 73 61 72 C67 71 69 72 72 73 C55 77 29 86 9 95 Q0 100 -2 88 Z', 'M81 2 C87 0 91 4 90 12 C86 34 79 58 75 81 Q72 97 72 109 C66 101 66 86 68 72 C70 52 73 29 77 12 Q79 4 81 2 Z'),
      '다': letter(91, 'M10 27 C21 20 39 13 47 15 C51 16 49 18 46 20 C35 24 22 28 15 32 C10 35 7 31 10 27 Z', 'M13 28 C19 25 25 27 22 33 C17 41 11 55 14 61 C17 68 34 56 52 43 C43 58 26 72 15 75 C5 78 1 73 2 64 C3 52 9 34 13 28 Z', 'M62 2 C68 0 74 5 71 15 C64 38 58 62 56 83 C54 98 54 108 57 115 C49 107 47 93 49 73 C50 54 54 26 59 8 Q60 3 62 2 Z', 'M55 49 C68 40 79 36 92 35 C101 34 110 35 114 37 C96 38 79 44 62 54 Q55 57 55 49 Z')
    };
    return {
      get: ch => characters[ch] || null
    };
  })();
  const Composition = (() => {
    const WIDTH = 1080,
      HEIGHT = 790;
    const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', {
      granularity: 'grapheme'
    }) : null;
    const syllables = str => segmenter ? Array.from(segmenter.segment(str), entry => entry.segment) : Array.from(str);
    const dictionary = new Map();
    const shapes = new Map();
    function get(ch, end) {
      if (!ch.trim()) return {
        advance: 33
      };
      const hand = Lettering.get(ch);
      if (hand && typeof Path2D === 'function') {
        if (!dictionary.has(ch)) dictionary.set(ch, {
          advance: hand.advance,
          paths: hand.paths.map(path => new Path2D(path))
        });
        return dictionary.get(ch);
      }
      const key = ch + (end ? '1' : '0');
      if (shapes.has(key)) return shapes.get(key);
      const composite = CalliGlyphs.shape(ch, {
        wordEnd: end
      });
      if (composite) {
        if (shapes.size >= 256) shapes.delete(shapes.keys().next().value);
        shapes.set(key, composite);
        return composite;
      }
      return {
        advance: /^[.,!?‘’“”]$/u.test(ch) ? 35 : 65,
        other: ch
      };
    }
    function splitRows(line, limit) {
      const chars = syllables(line);
      if (chars.length <= limit) return [line];
      const words = line.split(/\s+/u),
        out = [];
      let current = '';
      for (const word of words) {
        if (current && syllables(current + ' ' + word).length > limit) {
          out.push(current);
          current = '';
        }
        const g = syllables(word);
        while (g.length > limit) out.push(g.splice(0, limit).join(''));
        current = current ? current + ' ' + g.join('') : g.join('');
      }
      if (current) out.push(current);
      return out;
    }
    function rowsFor(input, longForm) {
      const lines = input.normalize('NFC').trim().split(/\r?\n/u).map(x => x.trim().replace(/\s+/gu, ' '));
      // Cards can contain 200 characters. Balance longer text across more of the sheet.
      if (longForm) {
        const perLine = Math.max(11, Math.ceil(Math.sqrt(syllables(input).length * 1.65)));
        return lines.flatMap(line => splitRows(line, perLine));
      }
      if (lines.length > 1) return lines.flatMap(s => splitRows(s, 11));
      const words = lines[0].split(' ');
      if (words.length === 2 && syllables(lines[0]).length <= 13) return words;
      if (words.length === 3 && syllables(lines[0]).length < 13) return [words[0], words.slice(1).join(' ')];
      return splitRows(lines[0], syllables(lines[0]).length <= 17 ? 7 : 10);
    }
    function tagRanges(source, tags) {
      const ranges = [];
      for (const tag of new Set(tags)) {
        if (typeof tag !== 'string') continue;
        const word = tag.normalize('NFC').trim().replace(/^#+/u, '').replace(/\s+/gu, ' ').trim();
        if (!word) continue;
        let start = source.indexOf(word);
        while (start !== -1) {
          ranges.push([start, start + word.length]);
          start = source.indexOf(word, start + 1);
        }
      }
      ranges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const range of ranges) {
        const previous = merged.at(-1);
        if (previous && range[0] < previous[1]) previous[1] = Math.max(previous[1], range[1]);
        else merged.push(range);
      }
      return merged;
    }
    const handDepth = { 어: 112, 다: 116, 이: 112, 수: 132, 최: 110, 늘: 107 };
    function lowerEdge(p) {
      return p.y + p.scale * ((handDepth[p.ch] ?? 104) + Math.max(0, p.tilt) * p.glyph.advance);
    }
    function layout(input, source, ranges, zoom, accent) {
      const longForm = syllables(input).length > 36;
      const rows = [];
      let position = 0, rangeIndex = 0, widest = 1, height = 0;
      for (const [i, line] of rowsFor(input, longForm).entries()) {
        let x = 0, top = 0, bottom = 0, currentMark = null;
        const letters = [], marks = [];
        for (const [wi, word] of line.split(' ').entries()) {
          if (wi) x += 29;
          const chars = syllables(word);
          for (const [j, ch] of chars.entries()) {
            // Wrapping may split a word, but the source cursor follows the original text.
            while (source[position] === ' ') position++;
            while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= position) rangeIndex++;
            const range = ranges[rangeIndex];
            const marked = range && range[0] < position + ch.length && position < range[1];
            position += ch.length;
            const glyph = get(ch, j === chars.length - 1);
            const scale = marked ? 1.20 : 1;
            const y = 3.7 * Math.sin(j * 1.6 + wi) - (marked ? 14 : 0);
            const p = {ch, glyph, x, y, scale, tilt: [-.057, -.028, .015, -.043, .01][(j+i)%5],
              seed: (i+1)*30181 + (wi+1)*9767 + j*179 + ch.codePointAt(0)};
            letters.push(p);
            const depth = lowerEdge(p);
            top = Math.min(top, y - 8 * scale);
            bottom = Math.max(bottom, depth + 6 * scale);
            if (accent && marked) {
              if (!currentMark || currentMark.range !== range) {
                currentMark = {range, left: x, right: x, bottom: depth};
                marks.push(currentMark);
              }
              currentMark.right = x + glyph.advance * scale;
              currentMark.bottom = Math.max(currentMark.bottom, depth);
            } else currentMark = null;
            x += (glyph.advance + 5.5) * scale;
          }
        }
        // A manual blank line occupies one line in the composition.
        if (!letters.length) bottom = 100;
        for (const mark of marks) bottom = Math.max(bottom, mark.bottom + 14);
        const row = { letters, marks, x: -x / 2, y: height - top };
        height += bottom - top + 16;
        row.end = height - 8;
        rows.push(row);
        widest = Math.max(widest, x + 46);
      }
      height = Math.max(1, height - 16);
      const fit = Math.min(Math.min((longForm ? 960 : 862) / widest, (longForm ? 670 : 470) / height, 1.95) * zoom,
        (WIDTH-48) / widest, (HEIGHT-48) / height);
      return {rows, fit, dy: (HEIGHT - height * fit) / 2};
    }
    const rng = seed => () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
    function accentStroke(ctx, mark) {
      const length = Math.max(1, mark.right - mark.left - 4);
      ctx.save();
      ctx.translate(mark.left + 2, mark.bottom + 12);
      ctx.scale(length / 130, .62);
      const g = ctx.createLinearGradient(0, 0, 130, 0);
      g.addColorStop(0, '#f4d696');
      g.addColorStop(.66, '#edb452');
      g.addColorStop(1, '#d99d3b');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(25, -2, 67, -10, 101, -10);
      ctx.bezierCurveTo(120, -10, 129, -7, 130, -5);
      ctx.bezierCurveTo(129, -2, 124, -2, 118, -3);
      ctx.bezierCurveTo(81, -6, 33, -1, 0, 4);
      ctx.fill();
      ctx.restore();
    }
    function textureInk(ctx, rowEnds) {
      const { width, height } = ctx.canvas;
      const frame = ctx.getImageData(0, 0, width, height);
      const pixels = frame.data;
      const scale = WIDTH / width;
      let seed = 72341;
      let left = width, top = height, right = -1, bottom = -1;
      let rowIndex = 0, rowStart = 0, rowLeft = width, rowRight = -1;
      for (let y = 0; y < height; y++) {
        const brushY = y * scale;
        for (let x = 0; x < width; x++) {
          const alpha = (y * width + x) * 4 + 3;
          const coverage = pixels[alpha];
          if (!coverage) continue;
          seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
          const noise = seed / 4294967296;
          const brushX = x * scale;
          const pool = Math.sin(brushX * .039 + brushY * .017) * Math.sin(brushY * .034 - brushX * .011);
          // Dry pigment reveals the actual backdrop, including at antialiased edges.
          const loss = Math.max(0, .012 + .025 * pool + .024 * (noise - .5) + (noise > .987 ? .045 : 0));
          pixels[alpha] = Math.round(coverage * (1 - loss));
          if (pixels[alpha]) {
            rowLeft = Math.min(rowLeft, x);
            rowRight = Math.max(rowRight, x);
            top = Math.min(top, y);
            bottom = y;
          }
        }
        if (y + 1 >= rowEnds[rowIndex]) {
          // Center the actual painted pixels, including brush tails and punctuation.
          // Move a row in the same pixel buffer already used to texture the ink.
          if (rowRight >= rowLeft) {
            const shift = Math.round((width - 1 - rowLeft - rowRight) / 2);
            if (shift) {
              for (let line = rowStart; line <= y; line++) {
                const begin = (line * width + rowLeft) * 4;
                const end = (line * width + rowRight + 1) * 4;
                pixels.copyWithin(begin + shift * 4, begin, end);
                if (shift > 0) pixels.fill(0, begin, Math.min(end, begin + shift * 4));
                else pixels.fill(0, Math.max(begin, end + shift * 4), end);
              }
            }
            left = Math.min(left, rowLeft + shift);
            right = Math.max(right, rowRight + shift);
          }
          while (rowIndex < rowEnds.length && rowEnds[rowIndex] <= y + 1) rowIndex++;
          rowStart = y + 1; rowLeft = width; rowRight = -1;
        }
      }
      ctx.putImageData(frame, 0, 0);
      return right < left ? null : Object.freeze({
        x: left / width, y: top / height,
        width: (right - left + 1) / width, height: (bottom - top + 1) / height
      });
    }
    function makeTint(inkColor) {
      if (!inkColor) return null;
      const rgb = [1, 3, 5].map(start => parseInt(inkColor.slice(start, start + 2), 16)).join(',');
      return shade => 'rgba(' + rgb + ',' + (1 - Math.max(0, shade - 11) / 430) + ')';
    }
    function draw(ctx, input, source, ranges, accent, zoom, inkColor) {
      const tint = makeTint(inkColor);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.scale(ctx.canvas.width / WIDTH, ctx.canvas.height / HEIGHT);
      if (!input.trim()) {
        ctx.restore();
        return null;
      }
      const page = layout(input, source, ranges, zoom, accent);
      ctx.translate(WIDTH / 2, page.dy);
      ctx.scale(page.fit, page.fit);
      for (const row of page.rows) {
        ctx.save();
        ctx.translate(row.x, row.y);
        for (const p of row.letters) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(p.scale, p.scale);
          ctx.rotate(p.tilt);
          if (p.glyph.paths || p.glyph.other) {
            const wash = ctx.createLinearGradient(1, 6, 70, 106);
            wash.addColorStop(0, tint ? tint(34) : '#22221e');
            wash.addColorStop(.36, tint ? tint(20) : '#141614');
            wash.addColorStop(.71, tint ? tint(33) : '#21221f');
            wash.addColorStop(1, tint ? tint(44) : '#2c2c25');
            ctx.fillStyle = wash;
          }
          if (p.glyph.paths) {
            for (const path of p.glyph.paths) ctx.fill(path);
          } else if (p.glyph.strokes) {
            const random = rng(p.seed);
            for (const stroke of p.glyph.strokes) {
              paintCalliInk(ctx, stroke, random, tint);
            }
          } else if (p.glyph.other) {
            ctx.font = '68px serif';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(p.ch, 0, 83, p.glyph.advance);
          }
          ctx.restore();
        }
        for (const mark of row.marks) accentStroke(ctx, mark);
        ctx.restore();
      }
      ctx.restore();
      const rowEnds = page.rows.map(row => Math.round((page.dy + row.end * page.fit) * ctx.canvas.height / HEIGHT));
      rowEnds[rowEnds.length - 1] = ctx.canvas.height;
      return textureInk(ctx, rowEnds);
    }
    return {
      draw,
      tagRanges,
      WIDTH,
      HEIGHT
    };
  })();
  const lastPaint = new WeakMap();
  const normalizeColor = value => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value) ? value.toLowerCase() : '';
  /** Paint isolated lettering onto a transparent canvas. CSS controls its displayed size. */
  function render(canvas, text, {
    width = 1080,
    accent = true,
    tags = [],
    inkColor,
    zoom = 1
  } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const pixelWidth = Math.max(1, Math.min(1080, Math.round(Number(width) || 1080)));
    const pixelHeight = Math.max(1, Math.round(pixelWidth * Composition.HEIGHT / Composition.WIDTH));
    const normalized = String(text ?? '').normalize('NFC');
    const source = normalized.trim().replace(/\s+/gu, ' ');
    const ranges = Composition.tagRanges(source, Array.isArray(tags) ? tags : []);
    const tagKey = JSON.stringify(ranges);
    inkColor = normalizeColor(inkColor);
    zoom = Math.min(1.12, Math.max(.85, Number(zoom) || 1));
    const last = lastPaint.get(canvas);
    if (last && last.text === normalized && last.tagKey === tagKey && last.accent === accent && last.width === pixelWidth
        && last.inkColor === inkColor && last.zoom === zoom
        && canvas.width === pixelWidth && canvas.height === pixelHeight) return canvas;
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d', {
      willReadFrequently: true
    });
    if (!ctx) return null;
    const bounds = Composition.draw(ctx, normalized, source, ranges, accent, zoom, inkColor);
    lastPaint.set(canvas, {
      text: normalized,
      tagKey,
      width: pixelWidth,
      accent,
      inkColor,
      bounds,
      zoom
    });
    return canvas;
  }
  window.ParkCalligraphy = Object.freeze({
    render,
    inkBounds: canvas => lastPaint.get(canvas)?.bounds ?? null,
    width: Composition.WIDTH,
    height: Composition.HEIGHT
  });
})();
