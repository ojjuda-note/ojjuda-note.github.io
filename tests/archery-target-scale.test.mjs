import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  PLAYER, GRAVITY, BOWS, ARROWS, SCOPES, STAGES, createClayEvent,
  prepareStage, targetAt, getSpeed, launchArrow, stepArrow, getFlightTimeLimit
} from '../games/forest-archer/engine.mjs';
import {projectPoint} from '../games/forest-archer/view.mjs';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance,
  `${actual} differs from ${expected}`);
const fixedStage = distance => STAGES.find(stage =>
  ['fixed-intro', 'long-fixed-intro'].includes(stage.lessonKey) && stage.distance === distance);
const camera = (width, height, zoom = 1) => ({
  ...PLAYER, cx: width / 2, horizon: height * .405,
  focal: Math.min(width * 1.08, height * 1.5) * zoom
});
function projectedDiameter(stage, view) {
  const target = targetAt(stage, 0);
  const left = projectPoint({...target, x: target.x - target.radius}, view);
  const right = projectPoint({...target, x: target.x + target.radius}, view);
  assert.equal(left.visible, true);assert.equal(right.visible, true);
  return right.x - left.x;
}

test('all circular lessons keep one 122cm physical face at every distance and equipment tier', () => {
  const targets = STAGES.filter(stage => stage.kind === 'target');
  assert.equal(STAGES.length, 220);assert.equal(targets.length, 162);
  assert.deepEqual([...new Set(targets.map(stage => stage.gearTier))], ['starter', 'lower', 'middle', 'upper']);
  for (const template of targets) {
    assert.equal(template.radius * 2, 1.22, `stage ${template.id} never enlarges its real hit area for distance`);
    for (const seed of [0, 19]) {
      const stage = prepareStage(template, seed);
      for (const time of [0, 3.7, 12]) {
        const target = targetAt(stage, time);
        assert.equal(target.radius, .61);
        assert.equal(target.rx, .61);assert.equal(target.ry, .61);
        assert.equal(target.z, template.distance, 'the displayed range is the real world distance');
      }
    }
  }
});

test('the same face halves at twice the distance and a 150m face is one third of its 50m view', () => {
  for (const [width, height] of [[360, 440], [390, 600], [844, 260], [1280, 720]]) {
    const view = camera(width, height);
    const diameter10 = projectedDiameter(fixedStage(10), view);
    const diameter20 = projectedDiameter(fixedStage(20), view);
    const diameter50 = projectedDiameter(fixedStage(50), view);
    const diameter150 = projectedDiameter(fixedStage(150), view);
    close(diameter20 / diameter10, .5);
    close(diameter50 / diameter10, .2);
    close(diameter150 / diameter50, 1 / 3);
    close(diameter150 / diameter10, 1 / 15);
    assert.ok(diameter150 < width * .01, 'a 122cm face at 150m occupies under one percent of the normal field width');
  }
});

test('explicit scope magnification enlarges the distant view without changing the target or hit area', () => {
  const stage = prepareStage(fixedStage(150), 19), before = structuredClone(stage);
  for (const [width, height] of [[390, 600], [844, 260]]) {
    const normal = projectedDiameter(stage, camera(width, height));
    for (const zoom of [2, 3, 6, 8]) {
      close(projectedDiameter(stage, camera(width, height, zoom)), normal * zoom);
      assert.deepEqual(stage, before);
      assert.equal(targetAt(stage, 0).rx, .61);
    }
  }
});

// The drag-free analytical solution deliberately does not call the game's
// aiming/prediction helpers. The real collision engine still resolves each
// shot from the player's position through the exact target plane.
const testArrow = {...ARROWS[18],
  tip: {...ARROWS[18].tip, drag: 0}, shaft: {...ARROWS[18].shaft, drag: 0},
  fletching: {...ARROWS[18].fletching, drag: 0}};
const testBow = {...BOWS[3], extraDragRate: 0};
function launchAt(point) {
  const horizontal = Math.hypot(point.x - PLAYER.x, point.z - PLAYER.z);
  const vertical = point.y - PLAYER.y;
  const speed = getSpeed({bow: testBow, arrow: testArrow, charge: 1, velocityBias: 0});
  const square = speed * speed;
  const discriminant = square * square - GRAVITY * (GRAVITY * horizontal * horizontal + 2 * vertical * square);
  assert.ok(discriminant >= 0, 'the chosen collision fixture lies within the real bow range');
  const pitch = Math.atan((square - Math.sqrt(discriminant)) / (GRAVITY * horizontal));
  return launchArrow({bow: testBow, arrow: testArrow, charge: 1, velocityBias: 0,
    yaw: Math.atan2(point.x - PLAYER.x, point.z - PLAYER.z), pitch});
}

test('a real arrow just inside the 61cm edge hits while the same shot just outside misses at every range', () => {
  for (const distance of [10, 20, 50, 100, 150]) {
    const stage = prepareStage(fixedStage(distance), 19), target = targetAt(stage, 0);
    for (const sign of [-1, 1]) {
      const inside = launchAt({...target, x: target.x + sign * .6099});
      const outside = launchAt({...target, x: target.x + sign * .6101});
      const hit = stepArrow(inside, getFlightTimeLimit(inside), stage, 0);
      const miss = stepArrow(outside, getFlightTimeLimit(outside), stage, 0);
      assert.equal(hit.type, 'hit', `${distance}m: the visible scoring edge remains hittable`);
      assert.equal(hit.score, 2, 'edge contacts use the outer ring rather than an enlarged gold zone');
      close(hit.point.z, distance);close(hit.point.x, target.x + sign * .6099);
      assert.notEqual(miss?.type, 'hit', `${distance}m: an invisible larger hit area must not remain`);
      assert.equal(outside.targetPassed, true);
      for (const zoom of [1, 8]) {
        const view = camera(390, 600, zoom), center = projectPoint(target, view), impact = projectPoint(hit.point, view);
        assert.ok(Math.abs(impact.x - center.x) < projectedDiameter(stage, view) / 2);
      }
    }
  }
});

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const fingerprint = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

test('the face-size correction preserves released animal lessons, legacy event geometry and arrow equipment', () => {
  // Captured from the deployed engine at 761825ecf8c76f75fd127271a68c8752e9508373.
  // Circular face geometry may change; unrelated arrow gear and moving
  // animal mechanics must not be silently rebalanced with it. The equipment
  // snapshot includes the later, explicitly approved doubled item prices.
  // Guns have their own main-range progression and ballistic tests.
  const animals = STAGES.filter(stage => stage.kind !== 'target');
  assert.equal(animals.length, 58);
  assert.equal(fingerprint(animals), 'b52e88fc5489bd5e4d51860def2afa5190306c20015bf1ff8b0963c04614b324');
  assert.equal(fingerprint(Array.from({length: 10}, (_, index) => createClayEvent(index + 1))),
    '2b0d487979ec36277fedb8f20b0d4c99d7798fe6b7061fd828afa2d42f1af65a');
  assert.equal(fingerprint({BOWS:BOWS.filter(item => item.weaponType !== 'gun'), ARROWS, SCOPES}), 'aa985ae4b61de4cd22e367aba8ca995cf1b21484d5cd0052a530617df6feec6a');
});
