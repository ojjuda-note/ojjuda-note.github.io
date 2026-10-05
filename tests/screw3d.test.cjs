const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../screw3d.js'), 'utf8');
const context = vm.createContext({ assert, console });
vm.runInContext(source.replace(/export \{[^}]*\};/, '')
  .replace('  order.forEach((s, i) => { s.color = queue[Math.floor(i / 3)]; });',
    '  order.forEach((s, i) => { s.color = queue[Math.floor(i / 3)]; }); globalThis.solution = order.slice();'), context);
vm.runInContext(`
  let seed = 19;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const makeShape = (geom, c = [0, 0, 0]) => el('wheel', geom, c, I3, '#F4C28F');
  const cyl = makeShape(cylGeom(1, 0.3));
  assert.equal(rayHit([0.85, 1, 0.85], [0, -1, 0], 2, [cyl], []), null, 'empty cylinder bounding-box corner stays free');
  assert.equal(rayHit([0.4, 1, 0.4], [0, -1, 0], 2, [cyl], []), cyl, 'actual cylinder face blocks');
  const cone = makeShape(coneGeom(1, 1));
  assert.equal(rayHit([0.8, 0.8, 2], [0, 0, -1], 4, [cone], []), null, 'empty cone corner stays free');
  const roof = makeShape(prismGeom([1, 1, 0.2]));
  assert.equal(rayHit([0.8, 0.8, 1], [0, 0, -1], 2, [roof], []), null, 'empty triangular roof corner stays free');
  const arch = el('arch', null, [0, 0, 0], I3, '#F4C28F');
  arch.parts = archParts(1, 0.1, 10, ['#F4C28F']); arch.geom = boundOf(arch.parts);
  assert.equal(rayHit([0, 0.3, 1], [0, 0, -1], 2, [arch], []), null, 'space under an arch stays free');
  const base = makeShape(boxGeom([0.2, 0.2, 0.02]), [0, 0, -0.03]);
  const moving = cube(0, 0, 0, '#F4C28F');
  const screw = { p: [0, 0, 0], a: [0, 0, 1], thru: base, into: base, state: 'in' };
  const level = mapLevel({ els: [base, moving], screws: [screw], mid: [0, 0, 0] });
  moving.dyn = { c: [0, 0, 0.2], R: I3, t: 0, sleep: 1 };
  assert.equal(blocked(screw, level), moving, 'a released block still blocks at its current position');
  moving.dyn.c = [1, 0, 0.2];
  assert.equal(blocked(screw, level), null, 'a moved block leaves no stale blocker at its old grid cell');
  moving.dyn.c = [0, 0, 1.2];
  assert.equal(blocked(screw, level), null, 'a distant object beyond the unscrew travel does not block');
  stepDyn(moving, [], [0, -1, 0], 0.5);
  assert.equal(moving.dyn.t, 0.5, 'resting loose blocks keep aging and can disappear');
  moving.dyn.c = [0, 0, 0.2]; moving.state = 'gone';
  assert.equal(blocked(screw, level), null, 'removed geometry never blocks');
  const translated = cube(0, 0, 0, '#F4C28F'); translated.c = [3, 3, 3];
  const translatedLevel = mapLevel({ els: [translated], screws: [] });
  assert.equal(translatedLevel.grid.size, 0, 'translated models cannot reuse stale cell coordinates');
  assert.equal(translatedLevel.special[0], translated);
  const square = (x0, y0, x1, y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  const item = (owner, pts, depth) => ({ owner, alpha: 1, polys: [{ pts, depth }] });
  const rear = item(screw, square(0, 0, 10, 10), [0, 0, 1]);
  const front = item(moving, square(-1, -1, 11, 11), [0, 0, 2]);
  maskScrews([rear, front], null);
  assert.equal(rear.polys[0].visible.length, 0, 'foreground block hides the whole screw despite painter order');
  front.polys[0].pts = square(5, -1, 11, 11);
  maskScrews([rear, front], null);
  assert.ok(Math.abs(rear.polys[0].visible.reduce((a,p)=>a+Math.abs(polyArea(p))/2,0) - 50) < 1e-6, 'only the uncovered half remains visible and clickable');
  front.polys[0].pts = square(-1, -1, 11, 11); front.polys[0].depth = [0.2, 0, 0];
  maskScrews([rear, front], null);
  assert.ok(Math.abs(rear.polys[0].visible.reduce((a,p)=>a+Math.abs(polyArea(p))/2,0) - 50) < 0.001, 'intersecting depth planes clip at the actual crossing');
  maskScrews([rear, front], moving);
  assert.equal(rear.polys[0].visible.length, 1, 'intentional x-ray remains available');
  let last = 0;
  for (let L = 1; L <= STAGES; L++) { assert.ok(targetScrews(L) >= last); last = targetScrews(L); }
  assert.equal(colorCount(3), 2); assert.equal(colorCount(4), 3); assert.equal(colorCount(8), 4);
  for (const L of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,32,80,160,500]) {
    const m = makeLevel(L), witness = solution;
    if (L <= 3) { assert.equal(m.screws.length, targetScrews(L)); assert.equal(new Set(m.queue).size, 2); }
    else { assert.ok(m.screws.length > 24); assert.equal(new Set(m.queue).size, colorCount(L)); }
    assert.equal(m.screws.length % 3, 0);
    for (let i = 0; i < witness.length; i++) {
      const s = witness[i];
      assert.equal(blocked(s, m), null, 'stage '+L+' has a legal next move '+i);
      assert.equal(s.color, m.queue[Math.floor(i / 3)], 'solution fills each box with no paid upgrades');
      s.state = 'done';
      for (const e of [s.thru, s.into]) if (!held(e, m.screws)) e.state = 'gone';
    }
    assert.ok(m.els.every(e => e.state === 'gone'), 'stage '+L+' fully disassembles');
  }
`, context, { timeout: 120000 });
console.log('PASS: exact empty-space geometry, moving occluders, partial screw visibility, three tutorial rounds and 22 solvable stages through stage 500');
