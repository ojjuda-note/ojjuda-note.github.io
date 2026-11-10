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
patrol.destroy();

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
console.log('Runner physics, random shark pace, pause, slide, rendering and score callback passed.');

