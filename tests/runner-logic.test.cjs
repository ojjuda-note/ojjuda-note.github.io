const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../games/runner/runner-game.js'), 'utf8');
const noop = () => {};
const canvas = {
  width: 360, height: 540,
  getBoundingClientRect: () => ({ width: 360, height: 540 })
};
const context = new Proxy({
  canvas,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop })
}, { get: (obj, key) => key in obj ? obj[key] : noop });
const sandbox = {
  window: { devicePixelRatio: 1, matchMedia: () => ({ matches: true }) },
  document: { querySelector: () => null },
  localStorage: { getItem: () => 'off', setItem: noop },
  Math: Object.assign(Object.create(Math), { random: () => .4 }),
  console
};
vm.runInNewContext(source, sandbox);
assert.equal(typeof sandbox.window.OjjudaRunnerGame.create, 'function');
const obstacleTypes = sandbox.window.OjjudaRunnerGame.obstacleTypes;
assert.equal(obstacleTypes.length, 11, 'eleven distinct original hazards are available');
assert.equal(new Set(obstacleTypes.map(x => x.kind)).size, 11);
assert.equal(obstacleTypes.filter(x => x.lane === 'air').length, 3,
  'floating hazards require a slide, ground hazards a jump');
assert.equal(obstacleTypes.filter(x => x.lane === 'high').length, 1,
  'the shark patrols only double-jump altitude');
assert.ok(obstacleTypes.some(x => x.kind === 'eel') && obstacleTypes.some(x => x.kind === 'crab'));
sandbox.window.OjjudaRunnerGame.drawPreview(context);
assert.equal(canvas.width, 960, 'landscape game backing uses 960px logical width');
assert.equal(canvas.height, 540, 'landscape game backing uses 540px logical height');

let points = [], ended = [];
const make = () => sandbox.window.OjjudaRunnerGame.create({
  setScore: score => points.push(score),
  end: score => ended.push(score),
  sound: { tap: noop, hit: noop, bad: noop }
});
const game = make();
assert.equal(game.state.hearts, 3);
assert.ok(game.state.speed >= 450, 'runner starts at an exciting pace');
assert.ok(game.controls.includes('ArrowDown'));
assert.ok(game.controls.includes('JUMP') && game.controls.includes('SLIDE'),
  'on-stage arcade controls use round gamepad labels');
game.onKey('ArrowUp');
assert.equal(game.state.jumps, 1);
game.update(1 / 60);
game.onKey('ArrowUp');
game.onKey('ArrowUp');
assert.equal(game.state.jumps, 2);
game.onKey('p');
const distance = game.state.distance;
for (let i = 0; i < 100; i++) game.update(1 / 60);
assert.equal(game.state.distance, distance);
game.onKey('p');
game.draw(context);
for (let i = 0; i < 1600 && !game.state.ended; i++) game.update(1 / 60);
assert.equal(game.state.hearts, 0);
assert.equal(game.state.ended, true);
assert.equal(ended.length, 1);
assert.ok(game.state.score > 0 && points.length > 0);
game.destroy();

// Keep the test avatar safe so a long shark patrol can be measured independent
// of ordinary ground hazards; production collision logic is tested above.
const safeSource = source.replace('function hit() {', 'function hit() { return;');
assert.notEqual(safeSource, source, 'isolated no-damage timing fixture is applied');
const sharkSandbox = {
  ...sandbox,
  window: { devicePixelRatio: 1, matchMedia: () => ({ matches: true }) },
  Math: Object.assign(Object.create(Math), { random: () => .4 })
};
vm.runInNewContext(safeSource, sharkSandbox);
const patrol = sharkSandbox.window.OjjudaRunnerGame.create({
  setScore: noop, end: noop, sound: { tap: noop, hit: noop, bad: noop }
});
assert.ok(patrol.state.sharkIn >= 6.2 && patrol.state.sharkIn <= 12,
  'first shark arrival waits a variable interval');
let sharkSeen = false, varyingSpeed = false, firstSpeed = null;
for (let i = 0; i < 1500; i++) {
  patrol.update(1 / 60);
  for (const shark of patrol.state.sharks) {
    sharkSeen = true;
    assert.ok(shark.speed >= patrol.state.speed + 64.9,
      'sharks always outrun floor obstacles, even when the runner accelerates');
    assert.equal(shark.y, 114, 'sharks stay at double-jump height');
    if (firstSpeed !== null && Math.abs(shark.speed - firstSpeed) > 1) varyingSpeed = true;
    firstSpeed = shark.speed;
  }
}
assert.ok(sharkSeen, 'a shark is spawned during an extended game');
assert.ok(varyingSpeed, 'the shark changes speed during its pass');
let vortexCount = 0, hadVortex = false;
let sawGap = false, sawThreeFloors = false, sawInk = false;
let highestDifficulty = 0, highestSpeed = 0;
for (let i = 0; i < 13000; i++) {
  patrol.update(1 / 60);
  const s = patrol.state;
  if (s.vortexRemaining > 0 && !hadVortex) vortexCount++;
  hadVortex = s.vortexRemaining > 0;
  sawGap ||= s.gaps.length > 0;
  sawThreeFloors ||= s.platformFloors.includes(2) && s.platformFloors.includes(3);
  sawInk ||= s.inkRemaining > 0;
  assert.ok(s.inkRemaining <= 1, 'ink never obscures the game longer than one second');
  highestDifficulty = Math.max(highestDifficulty, s.difficulty);
  highestSpeed = Math.max(highestSpeed, s.speed);
}
assert.ok(highestSpeed > 3000, 'running speed has no 1000px/s ceiling');
assert.ok(vortexCount >= 2, 'new chapters begin at 1300 and 2600px/s');
assert.ok(patrol.state.chapter >= 3, 'the runner continues into later chapters');
assert.ok(highestDifficulty >= 5, 'challenge levels rise again every additional 300px/s');
assert.ok(sawGap && sawThreeFloors, 'hard-mode courses have gaps and second/third floors');
assert.ok(sawInk, 'an enemy squid obscures part of the screen for one second');
patrol.draw(context);
patrol.destroy();

const courseSource = source.replace('const game = {',
  'window.__courseProbe = { gap() { chapter = 2; peakSpeed = 1300; gaps = [{ x: HERO_X - 300, w: 600 }]; offset = 125; vy = 300; }, platform() { chapter = 2; gaps = []; platforms = [{ x: HERO_X - 110, w: 650, y: FLOOR_3, floor: 3 }, { x: HERO_X - 110, w: 650, y: FLOOR_2, floor: 2 }]; offset = FLOOR_3 - GROUND - 5; vy = 320; }, feet() { return GROUND + offset; } }; const game = {');
assert.notEqual(courseSource, source, 'course fixture can simulate a missing floor');
const courseSandbox = { ...sandbox,
  window: { devicePixelRatio: 1, matchMedia: () => ({ matches: true }) } };
vm.runInNewContext(courseSource, courseSandbox);
const courseGame = courseSandbox.window.OjjudaRunnerGame.create({
  setScore: noop, end: noop, sound: { tap: noop, hit: noop, bad: noop }
});
courseSandbox.window.__courseProbe.gap();
courseGame.update(1 / 60);
assert.equal(courseGame.state.hearts, 2, 'falling through a gap costs one heart');
courseSandbox.window.__courseProbe.platform();
courseGame.update(1 / 60);
assert.equal(courseSandbox.window.__courseProbe.feet(), 231,
  'the seahorse can land on a third-floor bridge');
courseGame.onKey('ArrowDown');
for (let i = 0; i < 18; i++) courseGame.update(1 / 60);
assert.equal(courseSandbox.window.__courseProbe.feet(), 343,
  'sliding drops from the third-floor bridge onto the second floor');
courseGame.destroy();

const collisionSource = source.replace('const game = {',
  'window.__sharkProbe = { put() { hazards.push({ kind: "shark", x: HERO_X - 80, y: 114, w: 162, h: 83, pace: 1.35, phase: 0 }); }, altitude(v) { offset = v; vy = 0; } }; const game = {');
assert.notEqual(collisionSource, source, 'collision test injects a position-only fixture');
const collisionSandbox = { ...sandbox,
  window: { devicePixelRatio: 1, matchMedia: () => ({ matches: true }) } };
vm.runInNewContext(collisionSource, collisionSandbox);
const collisionGame = collisionSandbox.window.OjjudaRunnerGame.create({
  setScore: noop, end: noop, sound: { tap: noop, hit: noop, bad: noop }
});
collisionSandbox.window.__sharkProbe.put();
collisionSandbox.window.__sharkProbe.altitude(-153);
collisionGame.update(1 / 60);
assert.equal(collisionGame.state.hearts, 3,
  'a maximum-height first jump passes below the shark');
collisionSandbox.window.__sharkProbe.altitude(-270);
collisionGame.update(1 / 60);
assert.equal(collisionGame.state.hearts, 2,
  'a double jump entering the shark lane takes one hit');
collisionGame.destroy();

points = []; ended = [];
const sliding = make();
sliding.onDown(300);
assert.equal(sliding.state.sliding, true);
sliding.onKey('ArrowUp');
assert.equal(sliding.state.sliding, false);
sliding.draw(context);
sliding.destroy();
console.log('Runner vortex chapters, unlimited speed, multilevel gaps, squid ink, shark and controls passed.');

// Real Canvas rejects negative arcTo radii; the last platform inset may be <= 0.
const roundedSource = source.slice(source.indexOf('function rounded('), source.indexOf('  function gradient('));
const drawRounded = vm.runInNewContext('(' + roundedSource + ')');
for (const width of [-5, -1, 0, .01, 1, 5, 48]) {
  let calls = 0;
  const canvasProbe = new Proxy({ arcTo(...args) { assert.ok(args[4] >= 0); calls++; } }, { get: (o, k) => k in o ? o[k] : noop });
  drawRounded(canvasProbe, 0, 0, width, 38, 9, '#fff');
  assert.equal(calls, width > 0 ? 4 : 0, 'nonpositive inset is skipped, positive segment still renders');
}
