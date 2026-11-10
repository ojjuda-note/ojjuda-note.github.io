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
assert.equal(obstacleTypes.length, 10, 'ten distinct original hazards are available');
assert.equal(new Set(obstacleTypes.map(x => x.kind)).size, 10);
assert.equal(obstacleTypes.filter(x => x.lane === 'air').length, 3,
  'floating hazards require a slide, ground hazards a jump');
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

points = []; ended = [];
const sliding = make();
sliding.onDown(300);
assert.equal(sliding.state.sliding, true);
sliding.onKey('ArrowUp');
assert.equal(sliding.state.sliding, false);
sliding.draw(context);
sliding.destroy();
console.log('Runner physics, pause, slide, rendering and score callback passed.');

