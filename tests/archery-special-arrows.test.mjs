import test from 'node:test';
import assert from 'node:assert/strict';
import {ARROWS, BOWS, GRAVITY, STAGES, createClayEvent, targetAt, launchArrow, launchVolley, stepArrow} from '../games/forest-archer/engine.mjs';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const range = (extra = {}) => ({id: 1, distance: 10, radius: .15, height: .32, kind: 'target', motion: {}, wind: 0, obstacles: [], passers: [], ...extra});
const ordinaryCopy = id => ({...ARROWS[id], ability: null});
const configure = (shot, position, velocity) => {
  shot.position = {...position}; shot.velocity = {...velocity}; shot.dragRate = 0;
  shot.trail = [{...position}];
  return shot;
};
const bounceShot = (extra = {}) => configure(launchArrow({arrow: ARROWS[12], ...extra}), {x: 0, y: .6, z: 7}, {x: 0, y: -3, z: 8});
const magneticShot = (extra = {}) => configure(launchArrow({arrow: ARROWS[13], ...extra}), {x: .8, y: 2.2, z: 3}, {x: 0, y: 1, z: 20});
const finishInSteps = (shot, stage, dt, worldTime = 0) => {
  while (shot.active && shot.elapsed < 8) {
    const start = shot.elapsed;
    stepArrow(shot, Math.min(dt, 8 - start), stage, worldTime + start);
    assert.ok(!shot.active || shot.elapsed > start, 'an active projectile consumes simulation time');
  }
  return shot.result;
};
const compareMotion = (left, right, tolerance = 1e-8) => {
  for (const field of ['position', 'velocity']) for (const axis of ['x', 'y', 'z']) near(left[field][axis], right[field][axis], tolerance);
  near(left.elapsed, right.elapsed, tolerance);
};

test('two distinct special arrows append their own abilities after the ordinary inventory', () => {
  assert.equal(ARROWS.length, 14);
  assert.equal(ARROWS[12].id, 12); assert.equal(ARROWS[13].id, 13);
  assert.equal(ARROWS[12].ability.type, 'bounce'); assert.equal(ARROWS[13].ability.type, 'magnetic');
  assert.equal(ARROWS[12].ability.maxBounces, 1);
  assert.equal(ARROWS[13].ability.radius, 5);
  assert.deepEqual(ARROWS.slice(12).map(arrow => arrow.price), [6900, 7800]);
  assert.ok(ARROWS.slice(0, 12).every(arrow => !arrow.ability));
});

test('a short ground impact bounces once, loses energy and continues to a real later hit', () => {
  const stage = range(), shot = bounceShot();
  const ordinary = bounceShot({arrow: ordinaryCopy(12)});
  const originalResult = stepArrow(ordinary, 1, stage);
  assert.equal(originalResult.type, 'ground');
  assert.ok(originalResult.point.z < stage.distance);
  const impactTime = (-3 + Math.sqrt(9 + 2 * GRAVITY * .6)) / GRAVITY;
  const impactSpeedSquared = 8 ** 2 + (-3 - GRAVITY * impactTime) ** 2;
  const intermediate = stepArrow(shot, impactTime + .01, stage);
  assert.equal(intermediate, null, 'the bounce is not a completed shot or a score result');
  assert.equal(shot.active, true); assert.equal(shot.result, null);
  assert.equal(shot.bounceCount, 1); assert.equal(shot.bouncesRemaining, 0);
  assert.ok(shot.position.y > 0 && shot.velocity.y > 0);
  assert.ok(shot.velocity.x ** 2 + shot.velocity.y ** 2 + shot.velocity.z ** 2 < impactSpeedSquared);
  assert.ok(shot.trail.some(point => Math.abs(point.y) < 1e-7), 'the continuous trail includes the ground contact');
  const result = stepArrow(shot, 1, stage, shot.elapsed);
  assert.equal(result.type, 'hit');
  near(result.point.z, stage.distance);
  assert.ok(result.flightTime > impactTime);
  assert.equal(shot.bounceCount, 1);
});

test('normal bow launches can rescue short shots on the actual 30m and 50m stages', () => {
  for (const {stage, charge, pitch} of [
    {stage: STAGES[2], charge: .30, pitch: .13},
    {stage: STAGES[3], charge: .35, pitch: .33}
  ]) {
    const params = {bow: BOWS[0], charge, pitch};
    const shot = launchArrow({...params, arrow: ARROWS[12]});
    const plain = launchArrow({...params, arrow: ordinaryCopy(12)});
    const plainResult = finishInSteps(plain, stage, 1 / 120);
    const result = finishInSteps(shot, stage, 1 / 120);
    assert.equal(plainResult.type, 'ground');
    assert.ok(plainResult.point.z < stage.distance, 'without the ability, the identical arrow lands short');
    assert.equal(result.type, 'hit', `${stage.distance}m shot continues from the ground to the target`);
    assert.equal(shot.bounceCount, 1);
    near(result.point.z, stage.distance);
    assert.ok(result.flightTime > plainResult.flightTime);
  }
});

test('a bounce is spent once and cannot restart at a second ground contact or after passing the target', () => {
  const shot = bounceShot(), stage = range({distance: 100});
  const result = stepArrow(shot, 8, stage);
  assert.equal(result.type, 'ground'); assert.equal(shot.bounceCount, 1); assert.equal(shot.bouncesRemaining, 0);
  assert.equal(shot.active, false);
  const finalPosition = {...shot.position};
  assert.equal(stepArrow(shot, 1, stage), result);
  assert.deepEqual(shot.position, finalPosition);
  for (const targetPassed of [false, true]) {
    const overshot = bounceShot(); overshot.targetPassed = targetPassed;
    const overshotResult = stepArrow(overshot, 1, range({distance: 5}));
    assert.equal(overshotResult.type, 'ground'); assert.equal(overshot.bounceCount, 0);
  }
});

test('a wall still stops the arrow after its ground bounce', () => {
  const stage = range({obstacles: [{x: 0, z: 9, width: 1, height: 2, depth: .1}]});
  const shot = bounceShot(), result = stepArrow(shot, 2, stage);
  assert.equal(shot.bounceCount, 1); assert.equal(result.type, 'obstacle');
  near(result.point.z, 8.95);
  assert.equal(result.score, 0);
});

test('one large interval and small frames agree through bounce, remaining flight and final collision', () => {
  for (const stage of [range(), range({distance: 100}), range({obstacles: [{x: 0, z: 9, width: 1, height: 2, depth: .1}]})]) {
    const whole = bounceShot(), pieces = bounceShot();
    const result = stepArrow(whole, 8, stage), splitResult = finishInSteps(pieces, stage, 1 / 240);
    assert.equal(result.type, splitResult.type); assert.equal(result.score, splitResult.score);
    assert.equal(whole.bounceCount, pieces.bounceCount);
    near(result.flightTime, splitResult.flightTime);
    compareMotion(whole, pieces);
  }
});

test('magnetic guidance stays completely off outside the actual five-metre sphere', () => {
  const stage = range({distance: 20, height: 2, radius: .4});
  for (const position of [{x: 0, y: 2, z: 14.8}, {x: 3.5, y: 2, z: 16}]) {
    const shot = configure(launchArrow({arrow: ARROWS[13]}), position, {x: 0, y: 0, z: 2});
    const ordinary = configure(launchArrow({arrow: ordinaryCopy(13)}), position, {x: 0, y: 0, z: 2});
    stepArrow(shot, .02, stage); stepArrow(ordinary, .02, stage);
    compareMotion(shot, ordinary);
    assert.equal(shot.magnetSteered, false); assert.equal(shot.magnetActive, false);
  }
});

test('magnetic correction points toward the actual moving target and remains bounded', () => {
  const stage = range({distance: 20, height: 2, radius: .25, motion: {amplitudeX: 2, amplitudeY: 0, speed: 1, irregular: false}});
  for (const time of [Math.PI / 2, Math.PI * 1.5]) {
    const target = targetAt(stage, time);
    const shot = configure(launchArrow({arrow: ARROWS[13]}), {x: 0, y: 2, z: 17}, {x: 0, y: 0, z: 10});
    const ordinary = configure(launchArrow({arrow: ordinaryCopy(13)}), {...shot.position}, {...shot.velocity});
    stepArrow(shot, .05, stage, time); stepArrow(ordinary, .05, stage, time);
    assert.equal(Math.sign(shot.velocity.x - ordinary.velocity.x), Math.sign(target.x));
    assert.equal(shot.magnetSteered, true);
    assert.ok(shot.magnetTurn > 0 && shot.magnetTurn <= ARROWS[13].ability.maxTurnAngle + 1e-8);
    assert.ok(shot.magnetCorrection > 0 && shot.magnetCorrection <= ARROWS[13].ability.maxCorrectionSpeed + 1e-8);
    assert.ok(Math.hypot(...['x', 'y', 'z'].map(axis => shot.velocity[axis] - ordinary.velocity[axis])) <= ARROWS[13].ability.maxCorrectionSpeed + 1e-8);
    assert.ok(shot.position.x !== target.x, 'guidance bends the path instead of snapping onto the target');
  }
});

test('magnetic guidance can improve a near miss but cannot turn a far error into an automatic bullseye', () => {
  const stage = range({height: 2, radius: .6});
  const guided = magneticShot(), plain = magneticShot({arrow: ordinaryCopy(13)});
  const guidedResult = stepArrow(guided, 2, stage), plainResult = stepArrow(plain, 2, stage);
  assert.equal(guidedResult.type, 'hit');
  assert.notEqual(plainResult?.type, 'hit');
  assert.ok(guidedResult.score < 10, 'a gently assisted edge hit does not receive an automatic centre score');
  const late = configure(launchArrow({arrow: ARROWS[13]}), {x: 3, y: 2, z: 9.8}, {x: 0, y: 0, z: 40});
  const result = stepArrow(late, 2, range({height: 2, radius: .1}));
  assert.notEqual(result?.type, 'hit'); assert.equal(late.targetPassed, true);
  assert.ok(late.position.x > 2, 'bounded steering cannot erase a large late aiming error');
});

test('a normal magnetic-arrow launch improves a real 20m-stage near miss into an edge hit', () => {
  const stage = STAGES[1], params = {bow: BOWS[0], charge: 1, yaw: .07, pitch: .04};
  const shot = launchArrow({...params, arrow: ARROWS[13]});
  const plain = launchArrow({...params, arrow: ordinaryCopy(13)});
  const result = finishInSteps(shot, stage, 1 / 120);
  const plainResult = finishInSteps(plain, stage, 1 / 120);
  assert.equal(result.type, 'hit');
  assert.notEqual(plainResult.type, 'hit');
  assert.ok(result.score > 0 && result.score < 10);
  assert.ok(shot.magnetTurn > 0 && shot.magnetTurn <= ARROWS[13].ability.maxTurnAngle);
  assert.ok(shot.magnetCorrection <= ARROWS[13].ability.maxCorrectionSpeed);
});

test('guidance stops beyond the target plane and ignores inactive event targets', () => {
  const stages = [
    {stage: range({height: 2}), time: 0, position: {x: 1, y: 2, z: 11}, passed: true},
    {stage: createClayEvent(1), time: 1000, position: {x: 1, y: 2, z: 33}, passed: false}
  ];
  for (const {stage, time, position, passed} of stages) {
    const shot = configure(launchArrow({arrow: ARROWS[13]}), position, {x: 0, y: 0, z: 4});
    const ordinary = configure(launchArrow({arrow: ordinaryCopy(13)}), position, {x: 0, y: 0, z: 4});
    shot.targetPassed = ordinary.targetPassed = passed;
    stepArrow(shot, .05, stage, time); stepArrow(ordinary, .05, stage, time);
    compareMotion(shot, ordinary);
    assert.equal(shot.magnetSteered, false);
  }
});

test('a guided arrow never transfers its lock to the next passing animal', () => {
  const stage = range({kind: 'rabbit', distance: 10, height: 1, radius: .5, passDuration: 3, encounterSeed: 22});
  const time = 2.99, target = targetAt(stage, time);
  const shot = configure(launchArrow({arrow: ARROWS[13]}), {x: target.x - .2, y: target.y, z: 9}, {x: 0, y: 0, z: 1});
  stepArrow(shot, .005, stage, time);
  assert.equal(shot.magnetTargetPassId, 0);
  stepArrow(shot, .02, stage, time + .005);
  assert.equal(shot.magnetLost, true); assert.equal(shot.magnetActive, false);
  assert.notEqual(shot.magnetTargetPassId, 1);
});

test('guidance cannot pass through a wall even when the target is within its activation radius', () => {
  const stage = range({height: 2, radius: .6, obstacles: [{x: 0, z: 8, width: 10, height: 10, depth: .02}]});
  const shot = magneticShot(), result = stepArrow(shot, 2, stage);
  assert.equal(result.type, 'obstacle'); near(result.point.z, 7.99);
  assert.equal(result.score, 0);
});

test('guidance and collision timing remain consistent across large and small frame intervals', () => {
  const stage = range({height: 2, radius: .6});
  const whole = magneticShot(); stepArrow(whole, 8, stage);
  for (const dt of [1 / 30, 1 / 120, .003]) {
    const pieces = magneticShot(); finishInSteps(pieces, stage, dt);
    assert.equal(pieces.result.type, whole.result.type); assert.equal(pieces.result.score, whole.result.score);
    compareMotion(pieces, whole, 1e-5);
    near(pieces.magnetTurn, whole.magnetTurn, 1e-5);
  }
});

test('event guns ignore both special arrow abilities and retain identical bullet trajectories', () => {
  const stage = range({distance: 20, height: 2});
  for (const gun of BOWS.filter(weapon => weapon.weaponType === 'gun')) for (const arrow of ARROWS.slice(12)) {
    const shot = configure(launchArrow({bow: gun, arrow}), {x: 1, y: .2, z: 17}, {x: 0, y: -2, z: 10});
    const plain = configure(launchArrow({bow: gun, arrow: ARROWS[0]}), {...shot.position}, {...shot.velocity});
    assert.equal(shot.ability, null); assert.equal(shot.projectileType, 'bullet');
    const result = stepArrow(shot, 2, stage), plainResult = stepArrow(plain, 2, stage);
    assert.equal(result.type, plainResult.type); compareMotion(shot, plain);
    assert.equal(shot.bounceCount, 0); assert.equal(shot.magnetSteered, false);
  }
});

test('each rare-crossbow arrow owns its own bounce allowance and guidance state', () => {
  const volley = launchVolley({bow: BOWS[19], arrow: ARROWS[12], burstSeed: 28});
  assert.equal(volley.length, 3);
  for (const shot of volley) configure(shot, {x: 0, y: .6, z: 7}, {x: 0, y: -3, z: 8});
  stepArrow(volley[0], .2, range({distance: 100}));
  assert.deepEqual(volley.map(shot => shot.bounceCount), [1, 0, 0]);
  assert.deepEqual(volley.map(shot => shot.bouncesRemaining), [0, 1, 1]);
  for (const shot of volley.slice(1)) stepArrow(shot, .2, range({distance: 100}));
  assert.deepEqual(volley.map(shot => shot.bounceCount), [1, 1, 1]);
  const magnets = launchVolley({bow: BOWS[19], arrow: ARROWS[13], burstSeed: 28});
  configure(magnets[0], {x: .5, y: 2, z: 7}, {x: 0, y: 0, z: 10});
  stepArrow(magnets[0], .02, range({height: 2, radius: .5}));
  assert.equal(magnets[0].magnetSteered, true);
  assert.ok(magnets.slice(1).every(shot => !shot.magnetSteered && shot.magnetTurn === 0 && shot.magnetCorrection === 0));
});
