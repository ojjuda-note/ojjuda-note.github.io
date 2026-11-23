/* Local brush, Hangul and numeral outlines, and phrase layout used by park cards. */
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
    const nibAngle = .16 + pick() * .14;
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
    const tailLength = Math.min(length * .34, weight * (.80 + lift * .58));
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
      const nib = Math.sqrt(.27 + .73 * across * across);
      const down = dy / norm;
      // Load the descending side of a loop, then lift across its return.
      const press = 1 + .16 * Math.max(0, down) - .12 * Math.max(0, -down);
      const atHead = Math.min(1, q.d / headLength);
      const atTail = Math.min(1, (length - q.d) / tailLength);
      const load = .50 + .50 * Math.sin(atHead * Math.PI / 2);
      const release = .075 + .925 * Math.sin(atTail * Math.PI / 2);
      const half = weight * .51 * Math.pow(q.p, .96) * nib * press * load * release;
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
    const foot = curve('22,5,.24 26,13,.94 23,34,1.09 15,63,1.02 14,76,.93 19,84,.85 33,86,.76 54,80,.55 79,65,.29 100,51,.025');
    const round = curve('55,8,.23 41,8,.62 26,15,.99 14,30,1.22 8,52,1.23 9,72,.97 17,83,.73 30,87,.52 46,85,.43 63,78,.39 77,66,.37 87,51,.43 91,34,.57 87,23,.69 79,19,.61 68,20,.40 59,25,.19 54,31,.025');
    const hook = curve('3,30,.15 13,29,.68 36,18,.97 62,10,1.09 79,10,.93 84,16,.74 82,29,.60 69,49,.55 48,71,.36 26,90,.18 11,99,.02');
    const topHook = curve('4,23,.20 17,21,.78 43,14,.93 67,9,.87 84,11,.74 88,21,.70 86,38,.70 78,65,.55 68,88,.19 62,96,.025');
    const armL = curve('13,8,.23 23,12,.73 25,28,.91 20,52,.95 16,78,.70 19,93,.14');
    const armR = curve('79,0,.16 88,5,.83 87,24,.91 82,49,.85 72,77,.57 64,94,.09');
    const forkL = curve('64,2,.39 69,7,.81 68,16,1.03 58,33,1.08 44,52,1.03 27,69,.79 12,81,.43 -3,89,.04');
    const forkR = curve('52,40,.10 55,47,.34 63,58,.57 75,68,.76 88,73,.77 97,72,.39 102,69,.055');
    // A written ㅈ turns its top stroke into the left fall without lifting the brush.
    const joinedJ = curve('0,23,.28 8,23,.63 26,17,.77 51,10,.78 72,7,.74 79,9,.77 80,16,.82 73,28,.95 60,45,1.06 42,62,.96 23,76,.64 5,86,.29 -5,90,.026');
    const head = curve('27,4,.13 40,9,.55 54,17,.87 60,24,.68 56,28,.14');
    const bent = curve('21,13,.26 26,19,.78 25,35,.99 18,57,.95 14,74,.83 15,83,.79 23,88,.78 37,88,.65 57,83,.44 78,74,.24 99,66,.025');
    // Fold back with the tip still down; lift again before the bottom sweep.
    const foldedL = curve('6,18,.23 16,19,.62 39,13,.82 63,8,.78 78,8,.72 84,13,.69 82,23,.60 73,37,.49 64,43,.32 49,47,.43 30,50,.61 16,54,.54 11,58,.16');
    const zigFoot = curve('18,50,.20 21,57,.74 18,69,1.01 14,82,1.02 16,91,.91 25,95,.80 42,93,.68 62,85,.55 85,76,.35 100,71,.23 110,66,.07 116,62,.02');
    const boxTop = curve('14,23,.11 37,17,.52 62,12,.78 83,12,.74 87,19,.63 82,41,.67 75,62,.66 67,83,.25');
    const profiles = {
      ㄱ: [hook],
      ㄴ: [foot],
      ㄷ: [topBar, bent],
      ㄹ: [foldedL, zigFoot],
      ㅁ: [armL, boxTop, under],
      ㅂ: [armL, armR, midBar, under],
      ㅅ: [forkL, forkR],
      ㅇ: [round],
      ㅈ: [joinedJ, map(forkR, 3, 12, 97, 85)],
      ㅊ: [head, map(joinedJ, 1, 24, 98, 77), map(forkR, 3, 32, 96, 68)],
      ㅋ: [hook, map(midBar, -2, 4, 94, 95)],
      ㅌ: [topBar, map(midBar, -2, 3, 94, 90), bent],
      ㅍ: [topBar, map(armL, 14, 10, 72, 81), map(armR, -5, 13, 94, 75), under],
      ㅎ: [map(head, 4, -1, 90, 79), map(topBar, 0, 16, 100, 60), map(round, 7, 34, 82, 69)]
    };
    // Narrow double onsets need an open bowl and a fine crossbar at card size.
    // The left stroke of ㅂ turns along the base so the counter survives scaling.
    const doubleB = [
      curve('6,22,.18 11,26,.59 12,39,.76 9,61,.86 7,78,.78 9,86,.81 16,89,.85 27,88,.79 38,83,.49 43,78,.20'),
      curve('35,13,.19 40,15,.62 41,26,.81 39,48,.74 37,70,.63 38,81,.36 41,85,.10'),
      curve('9,55,.21 19,55,.68 31,51,.66 42,46,.30'),
      curve('60,13,.21 65,16,.60 65,33,.80 60,56,.88 59,72,.81 60,82,.77 64,85,.88 77,80,.72 88,73,.50 94,69,.18'),
      curve('89,0,.24 95,4,.79 97,17,.96 95,37,.94 90,58,.70 89,71,.44 92,77,.10'),
      curve('60,47,.20 69,44,.66 79,41,.68 94,38,.36')
    ];
    const doubleD = [
      curve('3,35,.19 9,33,.78 23,25,.94 34,22,.75 42,22,.32'),
      curve('10,31,.26 12,38,.91 10,53,1.01 6,74,.92 6,82,.79 10,87,.75 19,89,.65 32,84,.46 43,74,.21'),
      curve('53,24,.15 61,19,.72 75,10,1.01 88,6,.84 98,7,.29'),
      curve('62,17,.21 65,24,.83 63,39,1.04 57,62,1.03 55,74,.87 59,82,.82 68,83,.69 80,78,.49 92,67,.30 103,56,.04')
    ];
    const lowerN = curve('15,6,.11 23,13,.76 22,27,1.07 13,51,1.1 8,73,1.0 10,84,.85 17,91,.71 31,94,.63 49,90,.56 68,82,.44 86,71,.32 101,64,.17 111,59,.02');
    const hLine = curve('-1,53,.41 4,57,.72 13,59,1.01 31,55,1.07 55,47,.82 76,41,.51 92,39,.25 103,38,.025');
    const sweepLine = curve('-1,57,.14 9,56,.82 30,50,1.06 55,45,.88 75,44,.62 93,44,.42 108,41,.19 117,36,.018');
    const up = curve('51,1,.17 55,8,.79 53,20,1.04 46,36,.74 41,52,.18');
    const down = curve('58,27,.27 60,34,.76 59,46,1.03 55,59,.99 46,75,.79 38,92,.44 32,111,.025');
    const baseLine = curve('-1,57,.42 4,61,.72 13,63,1.01 34,56,1.04 59,45,.84 79,39,.52 96,37,.23 104,38,.025');
    const hVowels = {
      ㅗ: [up, hLine],
      ㅛ: [map(up, -9, 7, 84, 91), map(up, 25, -1, 82, 97), hLine],
      ㅜ: [map(hLine, 0, -10, 100, 89), down],
      ㅠ: [map(hLine, 0, -13, 100, 89), map(down, -14, -5, 90, 102), map(down, 23, -10, 90, 103)],
      ㅡ: [baseLine]
    };
    // On a 받침 row, keep the ㅗ/ㅜ stem distinct from both consonants
    // when the lettering is reduced to card size.
    // Shorter, rising tips can pass at different heights between stacked syllables.
    const stackedBar = curve('8,70,.41 14,72,.72 21,70,1.01 37,58,1.07 54,47,.82 71,36,.51 84,30,.25 94,26,.025');
    const stackedO = [curve('48,-5,.26 51,-3,.52 52,3,.72 52,15,.82 51,32,.70 49,48,.48'), stackedBar];
    const stackedU = [map(stackedBar, 0, -10, 100, 89), curve('55,30,.43 56,37,.79 55,49,.89 52,62,.79 48,73,.53 43,82,.21 41,85,.04')];
    const terminalVowels = { ㅗ: [up, sweepLine], ㅡ: [sweepLine] };
    function decompose(ch) {
      if (!ch || Array.from(ch).length !== 1) return null;
      const i = ch.codePointAt(0) - 0xAC00;
      return i >= 0 && i < 11172 ? [initial[Math.floor(i / 588)], medial[Math.floor(i / 28) % 21], final[i % 28]] : null;
    }
    // In ㅔ and ㅖ, the short arm belongs to the inner upright. Keep its
    // joint square to the stem, with a lighter shoulder and a taller outer stroke.
    const eInner = curve('46,10,.22 53,14,.61 55,23,.79 54,37,.87 50,54,.85 44,71,.70 41,83,.47 41,90,.20 44,94,.035');
    const eOuter = curve('90,1,.27 96,5,.70 99,13,.94 98,30,.96 94,52,.84 89,73,.68 85,90,.46 85,101,.24 88,108,.035');
    const eFinal = [...eOuter.slice(0, -3), ...curve('85,89,.48 85,103,.30 89,112,.15 95,118,.025')];
    const eArm = curve('1,53,.30 8,54,.67 19,53,.88 33,50,.87 44,47,.72 53,46,.49');
    const eUpperArm = curve('4,40,.29 12,40,.64 23,38,.80 37,35,.82 48,33,.67 55,33,.47');
    const eLowerArm = curve('0,66,.30 7,66,.66 18,64,.82 31,61,.85 42,59,.69 50,58,.47');
    // ㅐ joins its two uprights across their counters. Give the inside stem
    // a shorter, lighter descent and carry each crossbar into the outer stem.
    const aeInner = curve('22,11,.22 28,15,.61 31,24,.81 29,37,.88 25,53,.85 20,69,.69 18,81,.49 19,89,.26 23,94,.045');
    const aeOuter = curve('86,1,.22 94,6,.68 97,15,.93 96,31,.97 92,49,.90 86,69,.76 82,86,.53 82,99,.30 85,107,.045');
    const aeFinal = [...aeOuter.slice(0, -3), ...curve('82,87,.54 81,101,.33 85,111,.17 91,117,.03')];
    const aeBridge = curve('24,53,.38 34,53,.78 51,51,.92 68,48,.87 82,46,.73 95,46,.53');
    const aeUpperBridge = curve('28,40,.38 39,39,.74 57,37,.85 75,35,.81 89,35,.68 97,35,.50');
    const aeLowerBridge = curve('21,66,.38 32,65,.76 49,63,.88 65,61,.82 80,60,.69 90,60,.49');
    // The remaining straight vowels share a bowed axis.
    function verticalPaths(v, flourish, phraseEnd) {
      if (v === 'ㅔ') return [eArm, eInner, flourish ? eFinal : eOuter];
      if (v === 'ㅖ') return [eUpperArm, eLowerArm, eInner, flourish ? eFinal : eOuter];
      if (v === 'ㅐ') return [aeBridge, aeInner, flourish ? aeFinal : aeOuter];
      if (v === 'ㅒ') return [aeUpperBridge, aeLowerBridge, aeInner, flourish ? aeFinal : aeOuter];
      const leftBars = 'ㅓㅕ'.includes(v),
        doubleBars = 'ㅑㅕ'.includes(v);
      const x = v === 'ㅣ' ? 57 : leftBars ? 85 : 29;
      const paths = [];
      function axis() {
        if (flourish) {
          // After a bowed descent, ease the heel forward as the brush lifts.
          return curve(`${x - 2},1,.21 ${x + 9},4,.66 ${x + 15},13,1.00 ${x + 11},28,1.08 ${x + 1},49,.96 ${x - 13},73,.73 ${x - 18},90,.51 ${x - 16},103,.32 ${x - 7},112,.17 ${x + 5},118,.025`);
        }
        return curve(`${x - 1},1,.20 ${x + 9},4,.66 ${x + 14},12,.97 ${x + 11},26,1.08 ${x + 2},47,.95 ${x - 11},69,.76 ${x - 16},86,.53 ${x - 14},99,.30 ${x - 6},108,.025`);
      }
      const starts = doubleBars ? [31, 58] : [47];
      function bar(y) {
        const joint = x + 1 - (y - 47) * .21;
        if (leftBars) return curve(`0,${y + 13},.045 ${joint * .19},${y + 13},.64 ${joint * .53},${y + 7},.78 ${joint * .82},${y + .8},.45 ${joint + 1},${y},.12`);
        if (flourish && phraseEnd && y === starts[starts.length - 1]) {
          // Continue the existing arm: a loaded shoulder, a level sweep and a fine lift.
          return curve(`${joint - 2},${y + 2},.22 ${joint + 12},${y},.68 65,${y - 7},.90 91,${y - 9},.79 119,${y - 7},.65 146,${y - 7},.47 170,${y - 11},.31 189,${y - 18},.17 205,${y - 28},.025`);
        }
        const reach = flourish ? 109 : 100;
        const delta = reach - joint;
        return curve(`${joint},${y + 1},.18 ${joint + delta * .13},${y},.47 ${joint + delta * .45},${y - 9},.70 ${joint + delta * .72},${y - 14},.47 ${reach},${y - 16},.03`);
      }
      if (leftBars) for (const y of starts) paths.push(bar(y));
      paths.push(axis());
      if (!leftBars && v !== 'ㅣ') for (const y of starts) paths.push(bar(y));
      return paths;
    }
    const terminalL = curve('18,48,.16 22,55,.74 19,66,1.05 14,80,1.08 17,90,.88 28,95,.75 46,94,.63 66,87,.52 87,77,.42 110,69,.31 129,64,.19 143,60,.09 152,56,.02');
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
    function inkMetrics(strokes) {
      let inkTop = Infinity, inkBottom = -Infinity;
      for (const { knots, width } of strokes) {
        for (const [,y,pressure] of knots) {
          const radius = width * pressure * .5 + .65;
          inkTop = Math.min(inkTop, y - radius);
          inkBottom = Math.max(inkBottom, y + radius);
        }
      }
      return { inkTop, inkBottom };
    }
    function shape(ch, options = {}) {
      const wordEnd = options === true || !!(options && (options.final || options.wordEnd || options.terminal));
      const phraseEnd = wordEnd && !!options.phraseEnd;
      const data = decompose(ch);
      if (!data) {
        if (ch.length !== 1) return null;
        // Standalone medial jamo and their keyboard forms use the same brush.
        const vowel = medial[ch.charCodeAt(0) - 0x1161] || ch;
        if (!'ㅐㅒㅔㅖ'.includes(vowel)) return null;
        const strokes = verticalPaths(vowel, wordEnd, phraseEnd).map(path => ({
          knots: map(path, 4, 0, 57, 88), width: 13.8
        }));
        return { strokes, advance: 67, ...inkMetrics(strokes), brushCode: vowel.codePointAt(0) };
      }
      const [c, v, f] = data,
        m = mixed[v],
        horizontal = !!hVowels[v],
        stacked = horizontal || !!m;
      const complexOnset = !!pairs[c],
        complexFinal = !!pairs[f];
      const twinVowel = 'ㅐㅒㅔㅖ'.includes(v);
      const long = wordEnd && !f,
        strokes = [];
      const baseAdvance = m ? 94 : horizontal ? 90 : twinVowel ? 96 : v === 'ㅣ' ? 76 : v === 'ㅓ' || v === 'ㅕ' ? 82 : 88;
      const advance = baseAdvance + (complexOnset ? 17 : 0) + (complexFinal ? 5 : 0) + (f ? 2 : 0) + (wordEnd ? 3 : 0);
      function draw(key, x, y, w, h, weight = 1, place = '') {
        if (pairs[key] && key !== 'ㅃ' && key !== 'ㄸ') {
          const [a, b] = pairs[key];
          // The first press is shallower; the second carries the gesture onward.
          draw(a, x - w * .02, y + h * .18, w * .485, h * .71, weight * .65, 'twin');
          draw(b, x + w * .51, y - h * .03, w * .49, h * 1.04, weight * .74, 'twin');
          return;
        }
        let paths = key === 'ㅃ' ? doubleB : key === 'ㄸ' ? doubleD : profiles[key] || hVowels[key];
        if (f && place === 'base' && key === 'ㅗ') paths = stackedO;
        if (f && place === 'base' && key === 'ㅜ') paths = stackedU;
        if (long && phraseEnd && place === 'base' && terminalVowels[key]) paths = terminalVowels[key];
        if (!paths) paths = verticalPaths(key, long && place !== 'mixed', phraseEnd);
        if ((key === 'ㄱ' || key === 'ㅋ') && place === 'top') paths = [topHook, ...paths.slice(1)];
        if (key === 'ㄴ' && place === 'final') paths = [phraseEnd ? terminalN : lowerN];
        if (key === 'ㄹ' && place === 'final' && wordEnd) paths = [foldedL, terminalL];
        const density = key === 'ㅃ' ? .54 : key === 'ㄸ' ? .65 : 'ㅂㅌㅍㅁㄹ'.includes(key) ? .82 : 'ㅎㅊㅈ'.includes(key) ? .88 : 1;
        const stemWeight = 'ㅐㅒㅔㅖ'.includes(key) ? .85 : 1;
        const width = 15.6 * weight * density * stemWeight * Math.min(1.08, Math.sqrt(Math.min(w / 44, h / 55)));
        for (const path of paths) strokes.push({
          knots: map(path, x, y, w, h),
          width
        });
      }
      // Horizontal and compound syllables make room at the bottom for the coda.
      if (m) {
        const top = complexFinal ? 31 : f ? 34 : 50;
        const upperW = complexOnset ? 59 : 'ㅇㅎ'.includes(c) ? 38 : 49;
        draw(c, 8 + (53 - upperW) * .55, 5, upperW, top, 1.01, 'top');
        const lower = complexFinal ? 24 : f ? 29 : 40;
        draw(m[0], 2, top + 2, 60, lower, .89);
        draw(m[1], 59, -1, advance - 64, complexFinal ? 53 : f ? 61 : 85, .96, 'mixed');
      } else if (horizontal) {
        const top = f ? v === 'ㅡ' ? 41 : 36 : v === 'ㅡ' ? 66 : v === 'ㅗ' || v === 'ㅛ' ? 51 : 43;
        const upperW = (c === 'ㅇ' ? 40 : c === 'ㅎ' ? 51 : complexOnset ? 78 : 62) * (v === 'ㅡ' ? 1.03 : 1);
        const topX = (advance - upperW) / 2 + (c === 'ㅇ' ? 3 : 0);
        const onsetHeight = f && v === 'ㅗ' ? top - 3 : top;
        draw(c, topX, f ? 1 : 4, upperW, onsetHeight, 1.05, 'top');
        const y = top + (v === 'ㅡ' ? 0 : 3);
        draw(v, 1, y, advance - 6, (complexFinal ? 56 : f ? 65 : 99) - y, 1.00, 'base');
      } else {
        const compact = c === 'ㅇ',
          wide = complexOnset,
          start = f ? 7 : 12;
        const cWidth = compact ? f ? 34 : 45 : wide ? 61 : twinVowel ? 44 : 48;
        const cHeight = compact ? f ? 34 : 48 : f ? 50 : 65;
        const cY = compact ? f ? 18 : 22 : start;
        // The ㄴ shoulder sits beside two vowel stems in 내/네. A lighter
        // first press keeps three consecutive downstrokes in the same hand.
        const weight = c === 'ㄴ' && twinVowel ? .88 : compact ? 1.00 : 1.07;
        draw(c, 1, cY, cWidth, cHeight, weight);
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
        const y = f === 'ㅇ' ? 62 : f === 'ㄴ' && stacked ? (v === 'ㅜ' ? 60 : 63) : 66;
        const w = f === 'ㅇ' ? 38 : f === 'ㅎ' ? 52 : f === 'ㅅ' ? 56 : f === 'ㅁ' ? 55 : advance * .72;
        const x = f === 'ㅇ' ? advance * .38 : f === 'ㄴ' ? advance * .10 : (advance - w) * .47;
        draw(f, x, y, w, 99 - y, 1.04, 'final');
      }
      return {
        strokes,
        ...inkMetrics(strokes),
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
      '고': letter(91, 'M17 20 C31 15 52 6 68 5 C76 4 80 8 78 15 C74 28 62 43 44 58 C51 47 59 31 62 21 C63 17 63 16 60 17 C50 19 33 28 23 31 C15 34 11 27 17 20 Z', 'M44 54 C50 51 56 55 53 61 C49 68 45 77 44 83 L34 86 C35 75 39 60 44 54 Z', 'M-2 85 C18 76 45 69 65 67 C80 66 93 67 103 69 C86 70 75 73 62 78 C43 84 27 91 10 97 C3 100 -5 93 -2 85 Z'),
      '했': letter(86, 'M18 9 C26 8 37 11 37 16 C36 20 30 20 27 18 C22 15 18 12 18 9 Z', 'M5 29 C15 23 28 21 39 21 C45 20 48 21 47 23 C37 26 25 29 13 34 C8 36 3 34 5 29 Z', 'M32 33 C39 31 43 35 41 42 C38 51 27 60 19 61 C10 64 6 59 9 52 C12 44 23 35 30 34 Q33 34 31 37 C23 41 17 49 17 54 C18 58 24 54 28 50 C33 45 36 37 32 33 Z', 'M53 12 C57 12 60 15 59 21 C58 29 55 37 53 44 C50 51 49 58 49 62 C44 58 44 51 47 40 C49 32 53 21 53 12 Z', 'M49 37 C57 36 67 33 77 32 L77 36 C67 36 58 40 51 42 Q48 43 49 37 Z', 'M78 4 C84 4 87 8 86 14 C84 25 77 45 74 60 C73 65 73 69 74 72 C69 69 67 62 68 53 C69 40 75 23 78 12 Q80 6 78 4 Z', 'M33 67 C38 66 43 69 40 74 C34 82 19 95 9 99 C18 88 25 78 29 70 Z M30 80 C34 79 40 84 45 91 C38 92 32 88 28 85 Z', 'M60 68 C65 64 70 66 68 72 C64 80 55 91 46 99 C49 90 56 78 58 71 Z M59 80 C64 79 68 83 73 86 C78 90 83 91 86 91 C78 98 68 94 60 87 Z'),
      '어': letter(93, 'M40 22 C49 20 56 25 55 34 C53 47 42 61 28 70 C16 78 4 76 3 67 C1 58 9 43 18 33 C25 25 34 20 40 20 C44 20 46 23 43 26 C39 30 32 33 25 41 C16 51 11 62 15 65 C20 68 31 62 41 51 C52 39 56 25 40 22 Z', 'M45 48 C58 41 67 34 76 33 C81 32 82 36 80 38 C69 40 57 48 49 54 Q43 56 45 48 Z', 'M86 1 C92 -1 98 4 95 13 C89 32 83 56 80 77 C77 95 78 105 81 111 C74 106 72 95 72 79 C72 56 77 32 81 14 C83 8 83 3 86 1 Z'),
      '이': letter(78, 'M39 26 C46 24 52 28 50 36 C48 46 36 60 25 66 C13 73 4 70 5 61 C5 49 17 34 29 28 C34 25 39 24 41 27 C42 29 37 31 33 34 C24 40 16 50 15 58 C14 64 18 65 25 61 C33 56 43 46 46 37 C48 32 46 27 39 26 Z', 'M66 0 C74 0 80 4 78 14 C75 32 68 54 65 75 C62 91 62 103 65 112 C57 106 54 91 56 72 C58 51 63 32 65 18 C67 9 69 4 66 0 Z'),
      '건': letter(93, 'M8 30 C17 25 34 17 42 17 C48 16 51 20 48 27 C42 38 24 51 2 65 C18 50 31 35 34 28 C24 30 17 36 11 37 C7 38 5 35 8 30 Z', 'M43 39 C55 33 63 28 70 27 L70 34 C61 36 51 42 44 45 C41 46 40 42 43 39 Z', 'M75 2 C82 0 86 5 84 12 C79 30 74 48 68 64 C66 68 64 69 62 72 C62 59 65 40 69 23 C71 12 72 5 75 2 Z', 'M28 65 C35 61 43 64 40 72 C37 80 29 88 32 92 C36 97 52 92 65 87 C80 82 91 78 102 77 C93 82 79 93 59 100 C42 107 26 107 20 101 C13 94 19 77 28 65 Z'),
      '강': letter(90, 'M6 31 C18 25 33 17 42 17 C47 17 51 20 49 25 C44 36 28 50 8 61 C20 49 32 34 35 28 C27 30 16 38 10 38 C6 38 3 35 6 31 Z', 'M67 3 C73 0 78 4 76 12 C73 26 67 42 62 58 Q60 66 56 68 C55 57 57 43 61 25 C63 14 63 6 67 3 Z', 'M62 37 C74 29 87 25 97 27 C97 29 93 30 88 31 C80 34 71 39 63 43 Z', 'M53 64 C61 62 69 65 68 73 C67 84 55 97 41 103 C27 109 16 105 17 95 C17 84 29 70 43 65 C49 62 54 63 54 66 C50 70 40 74 33 84 C27 91 26 97 31 98 C38 99 50 91 56 83 C63 75 64 67 53 64 Z'),
      '최': letter(86, 'M27 10 C33 9 45 12 45 17 C44 21 38 20 35 18 Q29 14 27 10 Z', 'M5 31 C18 24 41 19 54 20 C58 21 58 22 59 23 C45 24 27 29 13 35 Q4 39 5 31 Z', 'M38 29 C44 27 49 30 46 35 C38 46 21 56 4 63 C17 52 28 40 34 32 Z', 'M31 44 C34 41 40 43 45 47 Q50 51 56 50 C49 57 40 55 34 50 Z', 'M33 59 C39 57 45 59 43 65 L35 82 L26 84 Q27 70 33 59 Z', 'M-2 88 C19 79 43 73 61 72 C67 71 69 72 72 73 C55 77 29 86 9 95 Q0 100 -2 88 Z', 'M78 2 C87 2 93 6 91 14 C87 32 79 57 76 77 C73 94 73 103 76 110 C69 105 65 95 66 80 C66 59 73 35 76 21 C78 13 81 5 78 2 Z'),
      '다': letter(91, 'M10 27 C21 20 39 13 47 15 C51 16 49 18 46 20 C35 24 22 28 15 32 C10 35 7 31 10 27 Z', 'M13 28 C19 25 25 27 22 33 C17 41 11 55 14 61 C17 68 34 56 52 43 C43 58 26 72 15 75 C5 78 1 73 2 64 C3 52 9 34 13 28 Z', 'M59 2 C66 1 76 5 73 15 C68 36 59 61 57 83 C55 98 57 110 62 116 C53 112 47 100 47 85 C47 62 52 39 57 18 C59 11 61 5 59 2 Z', 'M55 48 C72 38 84 33 96 34 C104 35 111 35 117 33 C112 37 104 39 96 40 C82 42 70 48 60 54 C54 57 51 53 55 48 Z')
    };
    const verticalExtents = {
      오: [7,97], 늘: [4,107], 도: [9,95], 수: [3,131], 고: [4,98], 했: [4,99],
      어: [0,111], 이: [0,112], 건: [1,106], 강: [2,106], 최: [2,110], 다: [1,116]
    };
    for (const [ch, [inkTop, inkBottom]] of Object.entries(verticalExtents)) {
      Object.assign(characters[ch], { inkTop, inkBottom });
    }
    // The last arm of 다 can finish its sweep in the open space at the end
    // of a phrase. The shorter form still fits before a following syllable.
    const finalDa = letter(120, ...characters.다.paths.slice(0, -1),
      'M54 49 C65 42 78 35 91 34 C108 32 123 36 134 34 C142 33 148 30 155 26 C149 34 137 40 126 41 C114 42 103 39 91 41 C77 43 68 50 59 55 C53 58 49 53 54 49 Z');
    Object.assign(finalDa, { inkTop: 1, inkBottom: 116 });
    return {
      get: (ch, phraseEnd) => ch === '다' && phraseEnd ? finalDa : characters[ch] || null
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
    const digitsByChar = new Map();
    function brushDigit(ch, advance, inkTop, inkBottom, ...strokes) {
      const glyph = { advance, inkTop, inkBottom, brushCode: ch.codePointAt(0), strokes };
      digitsByChar.set(ch, glyph);
      digitsByChar.set(String.fromCodePoint(0xFF10 + Number(ch)), glyph);
    }
    // Numerals use the same pressure-sensitive brush as Hangul. Keep them
    // separate from punctuation so their spacing follows the adjacent ink.
    brushDigit('0', 64, 4, 101, { width: 15.4, knots: [
      [43,11,.23], [31,9,.61], [18,16,.94], [10,32,1.10], [6,54,1.12],
      [7,77,.97], [15,91,.76], [27,93,.55], [40,84,.43], [50,66,.43],
      [55,45,.52], [55,27,.74], [50,15,.78], [43,11,.52], [35,13,.04]
    ] });
    brushDigit('1', 46, 6, 101,
      { width: 15.8, knots: [
        [7,29,.15], [16,24,.55], [28,12,.77], [31,12,.83],
        [29,30,1.04], [25,55,1.08], [20,78,.87], [17,94,.10]
      ] },
      { width: 11.8, knots: [[6,94,.22], [18,92,.69], [32,88,.48], [41,87,.04]] });
    brushDigit('2', 64, 4, 99, { width: 15.2, knots: [
      [7,29,.17], [13,17,.61], [26,10,.87], [40,12,.97], [49,21,1.09],
      [50,32,1.03], [44,44,.85], [32,58,.68], [17,73,.71], [7,86,.97],
      [9,91,.95], [22,90,.76], [38,85,.56], [53,83,.29], [61,84,.04]
    ] });
    brushDigit('3', 62, 5, 101, { width: 15.5, knots: [
      [9,21,.16], [22,12,.59], [38,11,.83], [48,19,.97], [47,29,.96],
      [39,40,.74], [29,48,.40], [24,50,.22], [34,46,.46], [45,50,.83],
      [50,61,1.07], [47,75,1.05], [36,88,.86], [23,93,.65], [11,89,.38], [4,82,.04]
    ] });
    brushDigit('4', 68, 4, 103,
      { width: 14.2, knots: [
        [44,10,.25], [35,23,.81], [25,39,1.03], [14,55,.96], [9,64,.57],
        [23,65,.81], [40,61,.76], [58,57,.05]
      ] },
      { width: 16.2, knots: [[47,31,.25], [47,43,.93], [43,64,1.07], [38,86,.83], [36,99,.04]] });
    brushDigit('5', 63, 3, 101,
      { width: 12.8, knots: [[12,17,.25], [24,15,.89], [40,11,.72], [55,8,.04]] },
      { width: 15.4, knots: [
        [16,16,.25], [14,28,.88], [10,42,.91], [19,40,.57], [33,42,.75],
        [45,49,1.01], [47,63,1.07], [42,78,1.01], [31,89,.81],
        [17,93,.59], [6,87,.32], [4,81,.04]
      ] });
    brushDigit('6', 61, 5, 103, { width: 15.6, knots: [
      [48,9,.15], [36,14,.65], [23,28,.93], [13,45,1.03], [8,65,1.05],
      [10,83,1.07], [20,94,.77], [34,92,.60], [45,81,.45], [49,66,.55],
      [46,54,.86], [36,48,.83], [24,51,.65], [14,60,.41], [11,69,.04]
    ] });
    brushDigit('7', 63, 5, 101, { width: 15.8, knots: [
      [5,22,.22], [17,19,.81], [33,13,.91], [49,11,.83], [55,15,.66],
      [48,29,.79], [39,45,1.02], [30,63,1.10], [24,82,.84], [23,96,.04]
    ] });
    brushDigit('8', 62, 4, 102, { width: 14.8, knots: [
      [36,48,.26], [23,41,.64], [14,29,1.00], [17,17,.78], [29,10,.59],
      [42,12,.61], [49,22,.72], [45,35,.61], [32,46,.42], [18,55,.71],
      [9,69,1.06], [9,82,1.03], [19,93,.80], [32,93,.61], [44,84,.45],
      [49,72,.57], [45,60,.86], [33,50,.78], [22,43,.04]
    ] });
    brushDigit('9', 62, 4, 103, { width: 15.6, knots: [
      [48,36,.29], [40,46,.65], [29,50,.75], [17,45,.86], [11,35,1.00],
      [14,22,1.00], [24,12,.86], [38,10,.77], [48,17,.84], [51,32,.98],
      [46,51,1.04], [38,70,.96], [27,87,.66], [13,97,.04]
    ] });
    const marksByChar = new Map();
    function brushMark(chars, advance, inkTop, inkBottom, ...strokes) {
      const glyph = { advance, inkTop, inkBottom, closingScale: .90, brushCode: chars.codePointAt(0), strokes };
      for (const ch of chars) marksByChar.set(ch, glyph);
    }
    const dot = { width: 14.5, knots: [[16,86,.39], [17,89,1.02], [16,93,.95], [12,97,.12]] };
    brushMark('?？', 50, 6, 98, { width: 13.8, knots: [
      [3,30,.18], [9,20,.49], [19,13,.75], [29,12,.91], [38,16,1.02],
      [42,25,1.05], [41,35,.98], [35,44,.88], [25,52,.73],
      [18,59,.62], [15,66,.52], [15,74,.34], [17,79,.04]
    ] }, dot);
    brushMark('!！', 34, 4, 98, { width: 15.5, knots: [
      [22,6,.28], [25,10,.83], [25,21,1.05], [22,37,.99],
      [18,54,.76], [15,68,.43], [15,75,.06]
    ] }, dot);
    brushMark('.．', 27, 84, 98, dot);
    brushMark(',，', 28, 78, 106, { width: 14, knots: [
      [17,80,.33], [20,84,.94], [19,90,1.0], [15,97,.66], [9,102,.32], [4,105,.04]
    ] });
    brushMark('~～', 68, 38, 61, { width: 11.5, knots: [
      [2,57,.08], [9,50,.57], [18,44,.82], [26,44,.92],
      [36,51,.95], [45,55,.73], [54,51,.52], [64,41,.06]
    ] });
    brushMark('-－', 47, 46, 57, { width: 11.5, knots: [
      [3,53,.29], [9,54,.87], [20,52,.96], [33,49,.63], [43,48,.07]
    ] });
    brushMark('*＊', 50, 15, 66,
      { width: 9.4, knots: [[29,17,.28], [29,25,.96], [25,41,.87], [21,55,.54], [19,64,.06]] },
      { width: 9.8, knots: [[5,32,.22], [13,34,.83], [24,40,.87], [36,46,.68], [45,49,.09]] },
      { width: 9.4, knots: [[5,55,.15], [13,49,.72], [25,40,.90], [38,31,.64], [46,26,.06]] });
    brushMark('@＠', 88, 12, 95,
      { width: 10, knots: [
        [55,38,.30], [48,34,.67], [39,36,.83], [30,46,.92], [27,57,.97],
        [31,64,.84], [39,65,.75], [48,57,.59], [54,44,.39], [56,37,.13]
      ] },
      { width: 10.7, knots: [
        [59,32,.25], [59,39,.87], [55,51,.98], [53,61,.83], [57,66,.65],
        [66,63,.63], [75,54,.72], [80,42,.79], [79,30,.80], [73,20,.76],
        [61,15,.66], [46,16,.62], [30,23,.73], [16,36,.88], [8,53,1.03],
        [8,70,.98], [16,83,.86], [30,90,.77], [47,90,.59], [61,85,.38], [71,78,.06]
      ] });
    function get(ch, end, phraseEnd) {
      if (!ch.trim()) return {
        advance: 33
      };
      const digit = digitsByChar.get(ch);
      if (digit) return digit;
      const mark = marksByChar.get(ch);
      if (mark) return mark;
      const hand = Lettering.get(ch, phraseEnd);
      if (hand && typeof Path2D === 'function') {
        if (!dictionary.has(hand)) dictionary.set(hand, {
          advance: hand.advance,
          inkTop: hand.inkTop,
          inkBottom: hand.inkBottom,
          paths: hand.paths.map(path => new Path2D(path))
        });
        return dictionary.get(hand);
      }
      const key = ch + (phraseEnd ? '2' : end ? '1' : '0');
      if (shapes.has(key)) return shapes.get(key);
      const composite = CalliGlyphs.shape(ch, {
        wordEnd: end, phraseEnd
      });
      if (composite) {
        if (shapes.size >= 256) shapes.delete(shapes.keys().next().value);
        shapes.set(key, composite);
        return composite;
      }
      return {
        advance: /^[‘’“”]$/u.test(ch) ? 35 : 65,
        other: ch
      };
    }
    const closing = /^[,.;:!?%~…．。，、！？～：；”’»」』）】〕〉》)\]}]+$/u;
    const opening = /^[“‘«「『（【〔〈《(\[{]+$/u;
    const leadWord = /^(?:내|네|제|그|이|저|우리|어느|어떤|모든|온|한|두|세|몇|여러|가장|더|곧|늘|또|잘|꼭|첫|새|다시|잠깐|함께)$/u;
    const boundWord = /^(?:수|것|때|뿐|줄|듯|채|데|리)$/u;
    const locationWord = /^(?:위|아래|곁|옆|속|앞|뒤|사이)(?:에|에서|으로|로|까지|부터)?$/u;
    const tailParticle = /(?:처럼|에게|한테|까지|부터|에서|으로|보다|[을를의은는])$/u;
    // Two-unit slices follow the facing edges. Thin tips at different heights
    // can tuck together while two full stems still have a visible white seam.
    const contours = new WeakMap();
    let measureContext;
    function contour(glyph) {
      if (!glyph.strokes && !glyph.paths) return null;
      if (contours.has(glyph)) return contours.get(glyph);
      const bands = [];
      if (glyph.strokes) {
        // Walk the existing stroke knots, without painting and reading a second
        // copy of every syllable. Record in the brush's usual -0.04 rad lean.
        for (const {knots, width} of glyph.strokes) {
          for (let k = 1; k < knots.length; k++) {
            const [x0,y0,p0] = knots[k-1], [x1,y1,p1] = knots[k];
            const dx = x1-x0, dy = y1-y0;
            const length = Math.hypot(dx,dy) || 1;
            // A horizontal segment's extrema are at its endpoints. Only split
            // segments that cross multiple slices on their way up or down.
            const steps = Math.max(1, Math.ceil(Math.abs(dy - .04*dx) / 5));
            const nib = .5 * width * Math.sqrt(.27 + .73 * ((dy * .97 - dx * .24) / length) ** 2);
            for (let step = 0; step <= steps; step++) {
              const t = step / steps, px = x0 + t*dx, py = y0 + t*dy;
              const x = px + .04*py, y = py - .04*px;
              const radius = Math.max(.55, nib * (p0 + t*(p1-p0)));
              for (let i = Math.floor(8 + (y-radius)/2); i <= Math.floor(8 + (y+radius)/2); i++) {
                const off = Math.max(0, Math.abs((i-8)*2 + 1 - y) - 1);
                const half = radius - .35 * off*off / radius;
                const band = bands[i];
                if (!band) bands[i] = [x-half, x+half];
                else { band[0] = Math.min(band[0], x-half); band[1] = Math.max(band[1], x+half); }
              }
            }
          }
        }
        contours.set(glyph, bands);
        return bands;
      }
      // The few hand-drawn Bézier outlines have no pressure knots. A 2:1
      // stencil covers x=-16…176 and y=-16…152, including the final 다 flourish.
      if (!measureContext) {
        const surface = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(96, 84) :
          typeof document !== 'undefined' ? document.createElement('canvas') : null;
        if (!surface) return null;
        surface.width = 96; surface.height = 84;
        measureContext = surface.getContext('2d', {willReadFrequently:true});
        if (!measureContext) return null;
      }
      const ctx = measureContext;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 96, 84);
      ctx.setTransform(.5, 0, 0, .5, 8, 8);
      ctx.rotate(-.04);
      ctx.fillStyle = '#000';
      for (const path of glyph.paths) ctx.fill(path);
      const data = ctx.getImageData(0, 0, 96, 84).data;
      for (let y = 0; y < 84; y++) {
        let left = 96, right = -1;
        for (let x = 0; x < 96; x++) if (data[(y * 96 + x) * 4 + 3] >= 32) {
          left = Math.min(left, x); right = x;
        }
        if (right >= left) bands[y] = [(left - 8) * 2, (right - 7) * 2];
      }
      contours.set(glyph, bands);
      return bands;
    }
    function separation(a, b) {
      const natural = a.glyph.advance * a.scale;
      const ap = contour(a.glyph), bp = contour(b.glyph);
      if (!ap || !bp) return natural;
      const aLean = a.tilt + .04, bLean = b.tilt + .04;
      const aTop = a.y + aLean * a.glyph.advance * a.scale / 2;
      const bTop = b.y + bLean * b.glyph.advance * b.scale / 2;
      let clearance = 0;
      const top = Math.max(aTop - 16 * a.scale, bTop - 16 * b.scale);
      const bottom = Math.min(aTop + (ap.length - 8) * 2 * a.scale, bTop + (bp.length - 8) * 2 * b.scale);
      for (let y = top; y < bottom; y += 2) {
        const ay = (y - aTop) / a.scale, by = (y - bTop) / b.scale;
        const right = ap[Math.floor(8 + ay / 2)];
        const left = bp[Math.floor(8 + by / 2)];
        if (left && right) clearance = Math.max(clearance,
          (right[1] - ay * aLean) * a.scale - (left[0] - by * bLean) * b.scale);
      }
      const seam = a.glyph.strokes || b.glyph.strokes ? 6.5 : 3.5;
      // Keep a low dot beside a syllable's long arm, and leave consecutive
      // symbols in reading order even when their strokes sit at different heights.
      const keepAdvance = marksByChar.has(b.ch) && (marksByChar.has(a.ch) || '.,．，'.includes(b.ch));
      return Math.max(keepAdvance ? natural : natural * .55, clearance + seam * Math.min(a.scale, b.scale));
    }
    function lineWidth(letters, start, end) {
      const last = letters[end - 1];
      return last.x + last.glyph.advance * last.scale - letters[start].x;
    }
    function breakCost(a, b) {
      if (opening.test(a.ch) || closing.test(b.ch)) return 18;
      if (!b.newWord) return a.range && a.range === b.range ? 1.5 : .35;
      if (a.word === b.word) return -.35;
      if (leadWord.test(a.word) || boundWord.test(b.word) || /의$/u.test(a.word)) return 5;
      if (a.range && a.range === b.range) return 2;
      if (/(?:지만|[가-힣]{2}면|어서|면서)$/u.test(a.word)) return -.48;
      if (locationWord.test(b.word) || /(?:처럼|에게|으로|까지|히|게)$/u.test(a.word)) return .78;
      if (/^[가-힣]$/u.test(a.word) && /(?:면|며|는|어요|아요|다[.!?]?)$/u.test(b.word)) return 1.5;
      if (/[은는던]$/u.test(a.word) && /^[가-힣]{1,2}[.!?…]?$/u.test(b.word) && !/[게히]$/u.test(b.word)) return 1.15;
      if (/[,.;:!?…．。，！？]$/u.test(a.ch)) return -.14;
      return 0;
    }
    function rowsFor(letters, manual, longForm) {
      if (!letters.length) return [[]];
      const total = lineWidth(letters, 0, letters.length);
      if (manual && total < 1580) return [letters];
      // Several enlarged words need a wider measure to keep the whole verse readable.
      const marked = letters.filter(p => p.range).length / letters.length;
      const proportion = longForm ? 154 : 84 + Math.min(90, Math.max(0, marked - .4) * 400);
      // Medium-length sayings read in a few complete phrases. A wider measure
      // opens gradually as words accumulate; very short verses keep their cadence.
      const phraseLines = Math.max(2.7, Math.sqrt(letters.length * .44));
      const compactWidth = Math.sqrt(total * proportion);
      const phraseWidth = Math.min(1040, total / phraseLines);
      const blend = Math.min(1, Math.max(0, (letters.length - 8) / 9));
      const target = Math.max(186, compactWidth + Math.max(0, phraseWidth - compactWidth) * blend);
      const stops = [0];
      // Keep short inflected words intact even when their tagged stem is enlarged.
      // Long unspaced text can still wrap at syllable boundaries.
      for (let start = 0; start < letters.length;) {
        let end = start + 1;
        while (end < letters.length && !letters[end].newWord) end++;
        if (end - start > 7 && lineWidth(letters, start, end) > 1.52 * target) {
          for (let i = start + 1; i < end; i++) stops.push(i);
        }
        stops.push(end);
        start = end;
      }
      const best = Array(stops.length).fill(Infinity), previous = [];
      best[0] = 0;
      for (let end = 1; end < stops.length; end++) {
        const finish = stops[end];
        const penalty = finish === letters.length ? 0 : breakCost(letters[finish - 1], letters[finish]);
        for (let start = end - 1; start >= 0; start--) {
          const from = stops[start], ratio = lineWidth(letters, from, finish) / target;
          const rag = ratio - 1;
          const cost = best[start] + .08 + rag * rag * (rag > 0 ? 2.4 : 1) + penalty;
          if (cost < best[end]) { best[end] = cost; previous[end] = start; }
          if (ratio > 2.7) break;
        }
      }
      const rows = [];
      for (let i = stops.length - 1; i > 0; i = previous[i]) rows.push(letters.slice(stops[previous[i]], stops[i]));
      return rows.reverse();
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
      return p.y + p.scale * ((p.glyph.inkBottom ?? handDepth[p.ch] ?? 104) + Math.max(0, p.tilt) * p.glyph.advance);
    }
    function layout(input, source, ranges, zoom, accent) {
      const paragraphs = input.trim().split(/\r\n?|\n/u);
      const longForm = syllables(input).length > 36;
      const rows = [];
      let position = 0, rangeIndex = 0, widest = 1, height = 0;
      for (const [li, paragraph] of paragraphs.entries()) {
        const letters = [], words = paragraph.trim().split(/\s+/u);
        for (const [wi, word] of words.entries()) {
          const chars = syllables(word);
          let last = chars.length - 1;
          while (last > 0 && closing.test(chars[last])) last--;
          const stem = chars.slice(0, last + 1).join('');
          const particle = stem.match(tailParticle)?.[0];
          const particleStart = particle && stem.length > particle.length + 1
            ? last + 1 - particle.length : last + 1;
          for (const [j, ch] of chars.entries()) {
            while (source[position] === ' ') position++;
            while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= position) rangeIndex++;
            const candidate = ranges[rangeIndex];
            const range = candidate && candidate[0] < position + ch.length ? candidate : null;
            position += ch.length;
            const glyph = get(ch, j === last, j === last && wi === words.length - 1);
            // Give short grammatical words less weight, unless the writer tagged them.
            const supporting = (boundWord.test(word) && wi > 0) ||
              (leadWord.test(word) && chars.length === 1 && wi + 1 < words.length);
            const baseScale = range ? 1.35 : j > last ? (glyph.closingScale ?? .76) : supporting ? .83 : j >= particleStart ? .86 : 1;
            // A word starts with a planted stroke, opens around its stressed syllable,
            // then settles into its ending. Single-syllable words keep their full size.
            const firstInTag = range && position - ch.length === range[0];
            const lastInTag = range && position === range[1];
            let shapeScale = 1;
            if (last > 0 && j <= last && !supporting && (range || j < particleStart)) {
              if (firstInTag) shapeScale = lastInTag ? 1.08 : 1.20;
              else if (range) {
                const syllable = CalliGlyphs.decompose(ch);
                const tallVowel = syllable && !syllable[2] && 'ㅏㅐㅓㅔㅣㅑㅒㅕㅖ'.includes(syllable[1]);
                shapeScale = lastInTag ? .97 : tallVowel ? 1.07 : .96;
              }
              else if (j === 0) shapeScale = 1.08;
              else if (j === last) shapeScale = .95;
            }
            const scale = baseScale * shapeScale;
            // The baseline follows a single gesture per word: lift through the body,
            // settle at its end. Short particles sit in the shoulder of the stem.
            const phase = last ? Math.min(1, j / last) : .5;
            const arch = Math.sin(phase * Math.PI);
            const tuck = j >= particleStart && !range ? 8 : 0;
            const y = -(scale - 1) * 70 + 4 * Math.cos(wi * 1.8) - 12 * arch + 4 * (1 - phase) - 3 * phase + tuck;
            const p = {ch, word, newWord: !j, glyph, range, x: 0, y, scale,
              tilt: -.053 + .019 * Math.sin(wi * 1.7) + .050 * arch - (firstInTag ? .023 : 0),
              seed: (li + 1)*30181 + (wi + 1)*9767 + j*179 + (glyph.brushCode ?? ch.codePointAt(0))};
            const prev = letters.at(-1);
            if (prev) p.x = prev.x + separation(prev, p) + (p.newWord ? 11 : 0);
            letters.push(p);
          }
        }
        for (const run of rowsFor(letters, paragraphs.length > 1, longForm)) {
          let top = Infinity, bottom = -Infinity, mark = null;
          const width = run.length ? lineWidth(run, 0, run.length) : 0;
          const origin = run.length ? run[0].x : 0, marks = [];
          for (const p of run) {
            p.x -= origin;
            const depth = lowerEdge(p);
            top = Math.min(top, p.y + p.scale * ((p.glyph.inkTop ?? -4) + Math.min(0, p.tilt) * p.glyph.advance));
            bottom = Math.max(bottom, depth);
            if (accent && p.range) {
              if (!mark || mark.range !== p.range) {
                mark = {range: p.range, left: p.x, right: p.x, bottom: depth};
                marks.push(mark);
              }
              mark.right = p.x + p.glyph.advance * p.scale;
              mark.bottom = Math.max(mark.bottom, depth);
            } else mark = null;
          }
          if (!run.length) { top = 0; bottom = 88; }
          for (const stroke of marks) bottom = Math.max(bottom, stroke.bottom + 10);
          const gap = 4;
          const row = { letters: run, marks, x: -width / 2, y: height - top };
          height += bottom - top;
          row.end = height + gap / 2;
          height += gap;
          rows.push(row);
          widest = Math.max(widest, width + 42);
        }
      }
      height = Math.max(1, height - 4);
      const preferredAreaScale = ranges.length ? 1.065 : 1;
      const tall = longForm ? 665 : rows.length > 2 ? 565 : 475;
      const fit = Math.min(Math.min((longForm ? 950 : 840) * preferredAreaScale / widest,
        tall * preferredAreaScale / height, 1.95) * zoom, (WIDTH - 48) / widest, (HEIGHT - 48) / height);
      return {rows, fit, dy: (HEIGHT - height * fit) / 2};
    }
    const rng = seed => () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
    function accentStroke(ctx, mark) {
      const inset = (mark.right - mark.left) * .15;
      const length = Math.max(1, mark.right - mark.left - 2 * inset);
      ctx.save();
      ctx.translate(mark.left + inset, mark.bottom + 5);
      ctx.scale(length / 130, .51);
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
    function textureInk(ctx, rowEnds, edges) {
      const { width, height } = ctx.canvas;
      const frame = ctx.getImageData(0, 0, width, height);
      const pixels = frame.data;
      const scale = WIDTH / width;
      let seed = 72341;
      let left = width, top = height, right = -1, bottom = -1;
      let rowIndex = 0, rowStart = 0, rowLeft = width, rowRight = -1;
      for (let y = 0; y < height; y++) {
        const brushY = y * scale;
        let firstX = width, lastX = -1;
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
            if (lastX < 0) firstX = x;
            lastX = x;
            rowLeft = Math.min(rowLeft, x);
            rowRight = Math.max(rowRight, x);
            top = Math.min(top, y);
            bottom = y;
          }
        }
        if (edges) {
          edges.left[y] = firstX;
          edges.right[y] = lastX;
        }
        if (y + 1 >= rowEnds[rowIndex]) {
          // Center the actual painted pixels, including brush tails and punctuation.
          // Move a row in the same pixel buffer already used to texture the ink.
          if (rowRight >= rowLeft) {
            const shift = Math.round((width - 1 - rowLeft - rowRight) / 2);
            if (shift) {
              for (let line = rowStart; line <= y; line++) {
                if (edges && edges.right[line] >= 0) {
                  edges.left[line] += shift;
                  edges.right[line] += shift;
                }
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
    function draw(ctx, input, source, ranges, accent, zoom, inkColor, edges) {
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
      return textureInk(ctx, rowEnds, edges);
    }
    return {
      draw,
      tagRanges,
      WIDTH,
      HEIGHT
    };
  })();
  // Look for the shoulder of the lettering: the open space next to a short line.
  // Both contours include brush tips and gold marks, after centering each line.
  function motifPosition(width, height, bounds, edges) {
    const top = Math.round(bounds.y * height), bottom = Math.round((bounds.y + bounds.height) * height);
    const left = Math.round(bounds.x * width), right = Math.round((bounds.x + bounds.width) * width);
    const gap = Math.max(2, Math.round(width * .014));
    const margin = Math.max(2, Math.ceil(width * .015)), step = Math.max(1, Math.round(width / 140));
    const preferred = Math.round(Math.min(width * .205, Math.max(width * .15, (bottom - top) * .61)));
    for (const size of [preferred, Math.round(preferred * .79), Math.round(preferred * .61)]) {
      if (size < 8) break;
      let best = null, lowest = Infinity;
      const from = Math.max(margin, top - size + gap);
      const to = Math.min(height - size - margin, bottom - gap);
      for (let y = from; y <= to; y += step) {
        let outerLeft = width, outerRight = -1;
        for (let line = Math.max(0, y - gap); line < Math.min(height, y + size + gap); line++) {
          outerLeft = Math.min(outerLeft, edges.left[line]);
          outerRight = Math.max(outerRight, edges.right[line]);
        }
        if (outerRight < 0) continue;
        for (const x of [outerRight + 1 + gap, outerLeft - gap - size]) {
          if (x < margin || x + size > width - margin) continue;
          const overhang = Math.max(0, left - x, x + size - right);
          const score = Math.abs(y + size * .50 - top - (bottom - top) * .30)
            + overhang * .85 + (x < outerLeft ? gap : 0);
          if (score < lowest) { lowest = score; best = {x, y, size}; }
        }
      }
      if (best) return best;
    }
    // A wide, short line sometimes leaves room just above its last word.
    const size = Math.min(preferred, top - margin - gap);
    if (size >= Math.max(8, width * .105)) {
      return {x: Math.max(margin, Math.min(width - margin - size, Math.round(right - size * .90))),
        y: top - gap - size, size};
    }
    return null;
  }
  function paintMotif(ctx, motif, bounds, edges, inkColor) {
    const {width, height} = ctx.canvas;
    const space = motifPosition(width, height, bounds, edges);
    if (!space) return bounds;
    const {x, y, size} = space;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    window.ParkInkMotifs.paint(ctx, motif, x, y, size, inkColor);
    ctx.restore();
    // Only this square changed. Include its painted pixels in the adjustable box.
    const pixels = ctx.getImageData(x, y, size, size).data;
    let left = Math.round(bounds.x * width), top = Math.round(bounds.y * height);
    let right = Math.round((bounds.x + bounds.width) * width), bottom = Math.round((bounds.y + bounds.height) * height);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      if (!pixels[(j * size + i) * 4 + 3]) continue;
      left = Math.min(left, x + i); right = Math.max(right, x + i + 1);
      top = Math.min(top, y + j); bottom = Math.max(bottom, y + j + 1);
    }
    return Object.freeze({x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height});
  }
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
    const cardTags = Array.isArray(tags) ? tags : [];
    const ranges = Composition.tagRanges(source, cardTags);
    const motif = window.ParkInkMotifs?.choose(source, cardTags);
    const tagKey = JSON.stringify(ranges);
    inkColor = normalizeColor(inkColor);
    zoom = Math.min(1.12, Math.max(.85, Number(zoom) || 1));
    const last = lastPaint.get(canvas);
    if (last && last.text === normalized && last.tagKey === tagKey && last.accent === accent && last.width === pixelWidth
        && last.inkColor === inkColor && last.zoom === zoom && last.motif === motif
        && canvas.width === pixelWidth && canvas.height === pixelHeight) return canvas;
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d', {
      willReadFrequently: true
    });
    if (!ctx) return null;
    const edges = motif ? { left: new Int16Array(pixelHeight), right: new Int16Array(pixelHeight) } : null;
    let bounds = Composition.draw(ctx, normalized, source, ranges, accent, zoom, inkColor, edges);
    if (motif && bounds) bounds = paintMotif(ctx, motif, bounds, edges, inkColor);
    lastPaint.set(canvas, {
      text: normalized,
      tagKey,
      motif,
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
  if (typeof window.dispatchEvent === 'function' && typeof window.Event === 'function') {
    window.dispatchEvent(new window.Event('ojjuda:park-calligraphy-ready'));
  }
})();
