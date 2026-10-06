const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../games/ttang.html'), 'utf8');
const engine = html.split('/*ENGINE*/')[1].split('/*ENDENGINE*/')[0];
const {World} = vm.runInNewContext(engine + '\n({World})');
require('./ttang-capture-cases.cjs')(World, 'ttang');

function fixture({diagonal = false, bot = false, shield = 0} = {}) {
  const world = new World(32, 'solo');
  world.itemsOn = false;
  const attacker = world.addPlayer({noSpawn:true, alive:true, x:25, y:25, bot});
  const target = world.addPlayer({noSpawn:true, alive:true, x:6, y:diagonal ? 6 : 10});
  // Use the real trail writer, including its grid and drawing vertices.
  for (let i = 1; i <= 160; i++) {
    const px = target.x, py = target.y;
    target.x = 6 + i * .05;
    target.y = diagonal ? target.x : 10;
    world.visit(target, px, py);
  }
  world.time = 1;
  target.shieldT = shield;
  world.events.length = 0;
  return {world, attacker, target};
}

function touch(f, x, y, fromX = x, fromY = y) {
  f.attacker.x = x;
  f.attacker.y = y;
  f.world.visit(f.attacker, fromX, fromY);
}

test('body edge cuts an opponent trail even when the center misses', () => {
  for (const bot of [false, true]) {
    const f = fixture({bot});
    touch(f, 10, 10.5);
    assert.equal(f.target.alive, false);
    assert.equal(f.attacker.kills, 1);
    assert.equal(f.world.events.find(e => e.t === 'death').why, 'cut');
    assert.equal(f.target.trail.length, 0);
  }
});

test('exact visible boundary hits, a gap outside it does not', () => {
  const boundary = .42 + .55 / 2;
  const hit = fixture(); touch(hit, 10, 10 + boundary);
  assert.equal(hit.target.alive, false);
  const miss = fixture(); touch(miss, 10, 10 + boundary + .01);
  assert.equal(miss.target.alive, true);
  assert.equal(miss.attacker.kills, 0);
});

test('diagonal trails use perpendicular distance', () => {
  const hit = fixture({diagonal:true}); touch(hit, 10, 10 + .5 * Math.SQRT2);
  assert.equal(hit.target.alive, false);
  const miss = fixture({diagonal:true}); touch(miss, 10, 10 + .71 * Math.SQRT2);
  assert.equal(miss.target.alive, true);
});

test('round trail endpoints hit only within their visible reach', () => {
  const hit = fixture(); touch(hit, 6 - .69, 10);
  assert.equal(hit.target.alive, false);
  const miss = fixture(); touch(miss, 6 - .71, 10);
  assert.equal(miss.target.alive, true);
});

test('swept movement cannot jump across a trail between samples', () => {
  const f = fixture(); touch(f, 10, 12, 10, 8);
  assert.equal(f.target.alive, false);
});

test('boosted movement cuts at the body edge', () => {
  const f = fixture();
  Object.assign(f.attacker, {x:10, y:10.73, ang:-Math.PI/2, target:-Math.PI/2, boostT:5});
  f.world.step(.02);
  assert.equal(f.target.alive, false);
  assert.equal(f.world.events.find(e => e.t === 'death' && e.p === f.target).why, 'cut');
});

test('shield protects the trail until it expires', () => {
  const f = fixture({shield:3}); touch(f, 10, 10.5);
  assert.equal(f.target.alive, true);
  assert.equal(f.attacker.kills, 0);
  f.target.shieldT = 0;
  touch(f, 10, 10.5);
  assert.equal(f.target.alive, false);
});

test('old self trail reacts to the body edge, recent neck remains safe', () => {
  for (const [time, shield, expected] of [[1, 0, false], [.1, 0, true], [1, 3, true]]) {
    const f = fixture(); f.world.time = time;
    Object.assign(f.target, {x:10, y:10.5, shieldT:shield});
    f.world.visit(f.target, 10, 10.5);
    assert.equal(f.target.alive, expected);
  }
});

test('returning into owned territory still captures safely', () => {
  const f = fixture();
  Object.assign(f.target, {x:10, y:10.5});
  f.world.setOwn(f.world.si(10, 10.5), f.target.id);
  f.world.visit(f.target, 10, 10.6);
  assert.equal(f.target.alive, true);
  assert.equal(f.target.trail.length, 0);
  assert.ok(f.world.events.some(e => e.t === 'capture'));
});

test('head collisions use the same body size and preserve land ownership rules', () => {
  for (const owner of [0, 1, 2]) {
    const world = new World(32, 'solo');
    const a = world.addPlayer({noSpawn:true, alive:true, x:10, y:10});
    const b = world.addPlayer({noSpawn:true, alive:true, x:10.83, y:10});
    if (owner) for (const x of [10, 10.415, 10.83]) world.setOwn(world.si(x, 10), owner);
    world.visit(a, 10, 10);
    assert.equal(a.alive, owner === 1);
    assert.equal(b.alive, owner === 2);
  }
});

test('normal straight movement does not hit its newly created trail', () => {
  const world = new World(64, 'solo'); world.itemsOn = false;
  const p = world.addPlayer({noSpawn:true, alive:true, x:4, y:10, ang:0, target:0});
  for (let i = 0; i < 240; i++) world.step(1/60);
  assert.equal(p.alive, true);
});
