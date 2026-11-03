import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  PLAYER, GRAVITY, WIND_RESPONSE, BOWS, ARROWS, SCOPES, STAGES,
  BULLET_SPEED, MAX_MAIN_PROJECTILE_SPEED, FASTEST_ARROW_REFERENCE,
  getSpeed, getScopePrice, sortEquipment, launchArrow, stepArrow, predictTrajectory
} from '../games/forest-archer/engine.mjs';

const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const guns = BOWS.filter(weapon => weapon.weaponType === 'gun');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const fingerprint = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const range = {id:1, kind:'target', distance:150, height:100, radius:1000,
  motion:{}, wind:0, obstacles:[], passers:[]};

// Independent closed-form solution of damped motion at a chosen target plane.
// This is also used to place walls either side of the real bullet's path.
function crossing(shot, distance, wind = 0) {
  const z = distance - shot.position.z, k = shot.dragRate;
  const t = k ? -Math.log1p(-k * z / shot.velocity.z) / k : z / shot.velocity.z;
  const u = k ? -Math.expm1(-k * t) / k : t, a = k ? (t - u) / k : t * t / 2;
  return {time:t, x:shot.position.x + shot.velocity.x * u + wind * WIND_RESPONSE * shot.windFactor * a,
    y:shot.position.y + shot.velocity.y * u - GRAVITY * (shot.gravityScale ?? 1) * a, z:distance};
}

test('one precision gun follows the crossbows with a ten-round magazine and its original one-second reload', () => {
  const order = sortEquipment(BOWS);
  assert.deepEqual(order.slice(20).map(weapon => weapon.id), [20]);
  assert.deepEqual(order.map(weapon => weapon.shopRank), Array.from({length:21}, (_, index) => index + 1));
  assert.deepEqual(guns.map(weapon => weapon.price), [29000]);
  assert.deepEqual(guns.map(weapon => weapon.magazineSize), [10]);
  assert.deepEqual(guns.map(weapon => weapon.reloadSeconds), [1]);
  let previousPrice = order[19].price, previousGap = order[19].price - order[18].price;
  for (const weapon of guns) {
    const gap = weapon.price - previousPrice;
    assert.ok(gap > previousGap, 'prices keep the existing increasing-cost progression');
    previousPrice = weapon.price;previousGap = gap;
    assert.equal(weapon.grip, 100);assert.equal(weapon.steadyDuration, 2);
    assert.equal(weapon.name, '정밀 사격총');assert.equal(weapon.visualTier, 24);
    assert.equal(weapon.ammo.mass, 8);assert.equal(weapon.ammo.windFactor, .08);
    assert.equal(weapon.gearTier, 'upper');assert.equal(weapon.burstCount, 1);
    assert.deepEqual(weapon.scopeMagnifications, [2, 3, 6, 8]);
    for (const magnification of [2, 3, 6, 8]) assert.ok(getScopePrice(weapon, magnification) > 0);
    assert.doesNotMatch(weapon.description, /접시|이벤트|[2468]발 탄창/);
  }
});

test('promoting guns leaves every released arrow, bow, crossbow and main mission unchanged', () => {
  // Captured independently from main at b5d1b3b4a6f861a133b9bd851906cd4a382835ee.
  assert.equal(fingerprint({BOWS:BOWS.filter(weapon => weapon.weaponType !== 'gun'), ARROWS, SCOPES}),
    'cbb8e518058169685b5a8004046c51d4b87b36ff61c09cdc50727e156ff8abb2');
  assert.equal(fingerprint(STAGES), 'afc0eddd2bcedc511034e61ad1bcf06062818fe3a1af3fcb29691e9d82b83d2d');
});

test('actual bullets arrive twice as fast and drop exactly half as far at the same distance and aim angle', () => {
  const references = BOWS.filter(weapon => weapon.weaponType !== 'gun').flatMap(bow => ARROWS.map(arrow =>
    ({bow, arrow, charge:1, velocityBias:1})));
  const fastest = references.reduce((best, params) => getSpeed(params) >= getSpeed(best) ? params : best);
  assert.equal(FASTEST_ARROW_REFERENCE.bowId, fastest.bow.id);
  assert.equal(FASTEST_ARROW_REFERENCE.arrowId, fastest.arrow.id);
  assert.equal(MAX_MAIN_PROJECTILE_SPEED, getSpeed(fastest));
  assert.equal(BULLET_SPEED, getSpeed(fastest) * 2);
  for (const distance of [10, 50, 150]) for (const pitch of [0, .25, Math.PI / 4, Math.PI / 3]) {
    for (const yaw of [-.2, 0, .2]) {
      const reference = launchArrow({...fastest, pitch, yaw});
      // Elevation lets even a horizontal arrow cross 150m before ground contact.
      // The target plane only observes the real swept trajectory.
      reference.position.y = 100;
      const aimRayY = 100 + Math.tan(pitch) * distance / Math.cos(yaw);
      const referenceResult = stepArrow(reference, 16, {...range, distance});
      assert.equal(referenceResult.type, 'hit');
      const referenceDrop = aimRayY - referenceResult.point.y;
      assert.ok(referenceDrop > 0);
      for (const bow of guns) {
        const bullet = launchArrow({bow, arrow:18, charge:0, velocityBias:-1, pitch, yaw});
        bullet.position.y = 100;
        const result = stepArrow(bullet, 16, {...range, distance});
        assert.equal(result.type, 'hit');
        close(result.flightTime, referenceResult.flightTime / 2);
        close(aimRayY - result.point.y, referenceDrop / 2);
        close(result.point.x, referenceResult.point.x);
        close(bullet.velocity.z, reference.velocity.z * 2);
      }
    }
  }
});

test('every gun can hit the actual fixed 1.22m targets at 10, 50 and 150m regardless of the selected arrow', () => {
  for (const distance of [10, 50, 150]) {
    const stage = STAGES.find(stage => stage.distance === distance && /fixed-intro$/.test(stage.lessonKey));
    assert.ok(stage);assert.equal(stage.radius, .61);
    for (const bow of guns) {
      let lo = 0, hi = .5;
      for (let iteration = 0; iteration < 55; iteration++) {
        const pitch = (lo + hi) / 2, point = crossing(launchArrow({bow, pitch}), distance);
        if (point.y < stage.height) lo = pitch;else hi = pitch;
      }
      const pitch = (lo + hi) / 2;
      let first = null;
      for (const arrow of [0, 12, 13, 18]) {
        const params = {bow, arrow, charge:0, velocityBias:-1, pitch};
        const shot = launchArrow(params), result = stepArrow(shot, 16, stage);
        assert.equal(shot.projectileType, 'bullet');assert.equal(shot.ability, null);
        assert.equal(result.type, 'hit');assert.equal(result.score, 10);
        close(result.point.y, stage.height);close(result.point.z, distance);
        if (first) assert.deepEqual(result, first, 'arrow upgrades cannot secretly change gun ballistics');
        first = result;
        const forecast = predictTrajectory(params, stage).result;
        assert.equal(forecast.type, 'hit');assert.equal(forecast.score, 10);
        close(forecast.point.y, result.point.y);close(forecast.flightTime, result.flightTime);
      }
    }
  }
});

test('bullet drop is used by exact wall collisions and stays identical across physics step sizes', () => {
  const params = {bow:20, pitch:.12, yaw:0, charge:1}, initial = launchArrow(params);
  const target = crossing(initial, 150), front = crossing(initial, 49.995), rear = crossing(initial, 50.005);
  const stage = {...range, height:target.y, radius:.61, wind:0};
  const wall = {x:0, z:50, width:3, depth:.01, height:front.y + .03};
  const blocked = stepArrow(launchArrow(params), 16, {...stage, obstacles:[wall]});
  assert.equal(blocked.type, 'obstacle');close(blocked.point.z, 49.995);close(blocked.point.y, front.y);
  const clearStage = {...stage, obstacles:[{...wall, height:Math.min(front.y, rear.y) - .03}]};
  const direct = stepArrow(launchArrow(params), 16, clearStage);
  assert.equal(direct.type, 'hit');assert.equal(direct.score, 10);
  for (const dt of [1 / 30, 1 / 60, 1 / 144, .47]) {
    const shot = launchArrow(params);
    while (shot.active) stepArrow(shot, dt, clearStage, shot.elapsed);
    assert.equal(shot.result.type, 'hit');assert.equal(shot.result.score, 10);
    close(shot.result.flightTime, direct.flightTime);
    for (const axis of ['x', 'y', 'z']) close(shot.result.point[axis], direct.point[axis]);
  }
});
