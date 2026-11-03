import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOWS, PLAYER, GRAVITY, ARROW_FLIGHT_LIMIT, BULLET_FLIGHT_LIMIT,
  getFlightTimeLimit, launchArrow, stepArrow, predictTrajectory, createClayEvent
} from '../games/forest-archer/engine.mjs';
import {evaluateCoachShot} from '../games/forest-archer/coach.mjs';

const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const radians = degrees => degrees * Math.PI / 180;
const emptyRange = {id:1, kind:'target', distance:10000, height:PLAYER.y, radius:.2,
  wind:0, motion:{}, obstacles:[], passers:[]};
const timing = {held:2, steadyStart:5, steadyDuration:.5};

// Independent continuous, calm-air trajectory. Fixtures use the launched
// velocity, never a target-distance preset or a fitted display angle.
function pointAt(shot, time) {
  const k = shot.dragRate, u = -Math.expm1(-k * time) / k;
  const gravity = GRAVITY * (shot.gravityScale ?? 1);
  return {x:PLAYER.x + shot.velocity.x * u,
    y:PLAYER.y + (shot.velocity.y + gravity / k) * u - gravity * time / k,
    z:PLAYER.z + shot.velocity.z * u};
}
function groundTime(shot) {
  let lo = 0, hi = 30;
  assert.ok(pointAt(shot, hi).y < 0);
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (pointAt(shot, mid).y > 0) lo = mid;else hi = mid;
  }
  return (lo + hi) / 2;
}

test('the launch elevation is the real upward angle of the velocity, including 45 and 60 degrees', () => {
  for (const bow of [0, 3, 19]) for (const arrow of [0, 18]) for (const charge of [.25, .5, 1]) {
    for (const pitch of [-.22, 0, radians(15), radians(45), radians(60)]) {
      const shot = launchArrow({bow, arrow, charge, yaw:.17, pitch, velocityBias:0});
      const horizontalSpeed = Math.hypot(shot.velocity.x, shot.velocity.z);
      near(Math.atan2(shot.velocity.y, horizontalSpeed), pitch);
      near(Math.atan2(shot.velocity.x, shot.velocity.z), .17);
      near(Math.hypot(...Object.values(shot.velocity)), shot.speed);
      if (pitch === radians(45)) near(shot.velocity.y, horizontalSpeed);
    }
  }
});

test('the same 45-degree angle gives different real ranges with the weapon, arrow and draw strength', () => {
  const fixtures = [
    {name:'starter', bow:0, arrow:0, charge:1, expectedRange:121.94},
    {name:'best bow', bow:3, arrow:0, charge:1, expectedRange:169.82},
    {name:'best crossbow', bow:19, arrow:0, charge:1, expectedRange:206.06},
    {name:'long-range arrow', bow:19, arrow:18, charge:1, expectedRange:443.80},
    {name:'partial draw', bow:19, arrow:18, charge:.5}
  ];
  const ranges = [];
  for (const fixture of fixtures) {
    const params = {...fixture, pitch:radians(45), yaw:0, velocityBias:0};
    const initial = launchArrow(params), expectedTime = groundTime(initial);
    const shot = launchArrow(params), result = stepArrow(shot, ARROW_FLIGHT_LIMIT, emptyRange);
    assert.equal(result.type, 'ground', fixture.name);
    assert.ok(shot.velocity.y < 0, 'the arrow lands while falling');
    near(result.point.y, 0);
    near(result.flightTime, expectedTime);
    near(result.point.z, pointAt(initial, expectedTime).z);
    if (fixture.expectedRange !== undefined) near(result.point.z, fixture.expectedRange, .01);
    ranges.push(result.point.z);
  }
  assert.ok(ranges[0] < ranges[1] && ranges[1] < ranges[2] && ranges[2] < ranges[3]);
  assert.ok(ranges[4] < ranges[3], 'less draw reduces range at the same physical angle');
  assert.ok(ranges.every(range => Math.abs(range - 150) > 10), '45 degrees is never silently treated as a 150m preset');
});

test('high arrows remain in flight after eight seconds and finish at the actual ground contact', () => {
  assert.equal(ARROW_FLIGHT_LIMIT, 16);
  for (const degrees of [45, 60, 90]) {
    const params = {bow:19, arrow:18, charge:1, pitch:radians(degrees), velocityBias:1};
    const initial = launchArrow(params), shot = launchArrow(params);
    const first = stepArrow(shot, 8, emptyRange);
    assert.equal(first, null);assert.equal(shot.active, true);assert.ok(shot.position.y > 0);
    const result = stepArrow(shot, getFlightTimeLimit(shot) - shot.elapsed, emptyRange, 8);
    assert.equal(result.type, 'ground');assert.equal(shot.active, false);
    assert.ok(result.flightTime > 8 && result.flightTime < 16);
    near(result.flightTime, groundTime(initial));
    near(result.point.y, 0);
  }
});

test('default trajectory prediction reaches the same high-arrow landing while an explicit short preview stays short', () => {
  const params = {bow:19, arrow:18, charge:1, yaw:0, pitch:radians(45), velocityBias:0};
  const actual = stepArrow(launchArrow(params), ARROW_FLIGHT_LIMIT, emptyRange);
  const predicted = predictTrajectory(params, emptyRange);
  assert.equal(predicted.result.type, 'ground');
  near(predicted.result.flightTime, actual.flightTime);
  for (const axis of ['x', 'y', 'z']) near(predicted.points.at(-1)[axis], actual.point[axis]);
  const brief = predictTrajectory(params, emptyRange, 0, 8);
  assert.equal(brief.result, null);assert.ok(brief.points.at(-1).y > 0);
});

test('a real 150m high-arc hit after eight seconds agrees between the live shot, prediction and coach', () => {
  const stage = {...emptyRange, distance:150, radius:1.2};
  const params = {bow:10, arrow:0, charge:1, yaw:0, velocityBias:0};
  const heightAtTarget = pitch => {
    const shot = launchArrow({...params, pitch});
    const time = -Math.log1p(-shot.dragRate * stage.distance / shot.velocity.z) / shot.dragRate;
    return pointAt(shot, time).y;
  };
  // Select the descending 45–60° solution without invoking game prediction.
  let lo = radians(45), hi = radians(60);
  assert.ok(heightAtTarget(lo) > stage.height && heightAtTarget(hi) < stage.height);
  for (let i = 0; i < 65; i++) {
    const mid = (lo + hi) / 2;
    if (heightAtTarget(mid) > stage.height) lo = mid;else hi = mid;
  }
  params.pitch = (lo + hi) / 2;
  near(params.pitch * 180 / Math.PI, 58.0090393607, 1e-6);
  const shot = launchArrow(params);
  assert.equal(stepArrow(shot, 8, stage), null);assert.equal(shot.active, true);
  const actual = stepArrow(shot, ARROW_FLIGHT_LIMIT - shot.elapsed, stage, 8);
  assert.equal(actual.type, 'hit');assert.equal(actual.score, 10);assert.ok(actual.flightTime > 8);
  const prediction = predictTrajectory(params, stage).result;
  assert.equal(prediction.type, 'hit');assert.equal(prediction.score, 10);
  near(prediction.flightTime, actual.flightTime);
  const cue = evaluateCoachShot(params, stage, 0, timing);
  assert.equal(cue.ready, true);assert.equal(cue.nowScore, 10);assert.equal(cue.laterScore, 10);
});

test('the coach keeps the same long magnetic trajectory when guidance starts after eight seconds', () => {
  const params = {bow:19, arrow:13, charge:1, yaw:0, pitch:radians(60), velocityBias:0};
  const initial = launchArrow(params), target = pointAt(initial, 9);
  const stage = {...emptyRange, distance:target.z, height:target.y, radius:1.2};
  const entryTime = -Math.log1p(-initial.dragRate * (stage.distance - initial.ability.radius) / initial.velocity.z) / initial.dragRate;
  assert.ok(entryTime > 8, 'the fixture exercises the extended unguided prefix');
  const shot = launchArrow(params), result = stepArrow(shot, ARROW_FLIGHT_LIMIT, stage);
  assert.equal(result.type, 'hit');assert.equal(result.score, 10);assert.ok(shot.magnetSteered);
  const predicted = predictTrajectory(params, stage).result;
  assert.equal(predicted.type, 'hit');assert.equal(predicted.score, result.score);
  near(predicted.flightTime, result.flightTime);
  for (const axis of ['x', 'y', 'z']) near(predicted.point[axis], result.point[axis]);
  const cue = evaluateCoachShot(params, stage, 0, timing);
  assert.equal(cue.ready, true);assert.equal(cue.nowScore, result.score);assert.equal(cue.laterScore, result.score);
});

test('main-range bullets complete their 45 and 60 degree falling arcs after the former event timeout', () => {
  assert.equal(BULLET_FLIGHT_LIMIT, 16);
  for (const bow of BOWS.filter(weapon => weapon.weaponType === 'gun')) for (const degrees of [45, 60]) {
    const params = {bow, pitch:radians(degrees), charge:1, velocityBias:0};
    const initial = launchArrow(params), shot = launchArrow(params), expectedTime = groundTime(initial);
    assert.equal(getFlightTimeLimit(shot), 16);
    assert.ok(expectedTime > 8 && expectedTime < 16);
    assert.equal(stepArrow(shot, 8, emptyRange), null);assert.equal(shot.active, true);
    const result = stepArrow(shot, 8, emptyRange, 8);
    assert.equal(result.type, 'ground');assert.equal(shot.active, false);
    near(result.flightTime, expectedTime);near(result.point.y, 0);
    near(result.point.z, pointAt(initial, expectedTime).z);
    const predicted = predictTrajectory(params, emptyRange).result;
    assert.equal(predicted.type, 'ground');near(predicted.flightTime, expectedTime);
    near(predicted.point.z, result.point.z);
  }
});

test('high-arc ground contact is identical with large steps and different display frame rates', () => {
  const stage = {...emptyRange, wind:1.3};
  const params = {bow:19, arrow:18, charge:1, yaw:.17, pitch:radians(60), velocityBias:0};
  const whole = launchArrow(params), expected = stepArrow(whole, ARROW_FLIGHT_LIMIT, stage);
  assert.equal(expected.type, 'ground');assert.ok(expected.flightTime > 8);
  for (const step of [1 / 30, 1 / 60, 1 / 144, .47]) {
    const pieces = launchArrow(params);
    while (pieces.active && pieces.elapsed < ARROW_FLIGHT_LIMIT) {
      stepArrow(pieces, Math.min(step, ARROW_FLIGHT_LIMIT - pieces.elapsed), stage, pieces.elapsed);
    }
    assert.equal(pieces.result.type, 'ground');near(pieces.result.flightTime, expected.flightTime);
    for (const axis of ['x', 'y', 'z']) {
      near(pieces.position[axis], whole.position[axis]);
      near(pieces.velocity[axis], whole.velocity[axis]);
    }
  }
});
