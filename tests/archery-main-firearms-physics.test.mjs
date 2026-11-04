import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  PLAYER, GRAVITY, WIND_RESPONSE, BOWS, ARROWS, BULLETS, SCOPES, STAGES,
  BULLET_SPEED, MAX_MAIN_PROJECTILE_SPEED, FASTEST_ARROW_REFERENCE,
  getSpeed, getBullet, getScopePrice, sortEquipment, launchArrow, launchVolley, stepArrow, predictTrajectory, passersAt
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

test('the original gun and two snipers follow the crossbows with ten-round magazines and one-second reloads', () => {
  const order = sortEquipment(BOWS);
  assert.deepEqual(order.slice(20).map(weapon => weapon.id), [20, 21, 22]);
  assert.deepEqual(order.map(weapon => weapon.shopRank), Array.from({length:23}, (_, index) => index + 1));
  assert.deepEqual(guns.map(weapon => weapon.price), [29000, 31500, 34100]);
  assert.deepEqual(guns.map(weapon => weapon.magazineSize), [10, 10, 10]);
  assert.deepEqual(guns.map(weapon => weapon.reloadSeconds), [1, 1, 1]);
  assert.deepEqual(guns.map(weapon => weapon.name), ['정밀 사격총', '정밀 저격총', '무진동 저격총']);
  assert.deepEqual(guns.map(weapon => weapon.handSwayFactor), [1, .25, 0]);
  assert.equal(sortEquipment(BOWS, 'steady')[0].id, 22, 'permanent zero-shake stability sorts ahead of timed steady windows');
  let previousPrice = order[19].price, previousGap = order[19].price - order[18].price;
  for (const weapon of guns) {
    const gap = weapon.price - previousPrice;
    assert.ok(gap > previousGap, 'prices keep the existing increasing-cost progression');
    previousPrice = weapon.price;previousGap = gap;
    assert.equal(weapon.grip, 100);assert.equal(weapon.steadyDuration, 2);
    assert.equal(weapon.visualTier, 24);
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

test('bullet drop locates exact wall entries and clear paths stay identical across physics step sizes', () => {
  const params = {bow:20, pitch:.12, yaw:0, charge:1}, initial = launchArrow(params);
  const target = crossing(initial, 150), front = crossing(initial, 49.995), rear = crossing(initial, 50.005);
  const stage = {...range, height:target.y, radius:.61, wind:0};
  const wall = {x:0, z:50, width:3, depth:.01, height:front.y + .03};
  const penetrated = launchArrow(params), result = stepArrow(penetrated, 16, {...stage, obstacles:[wall]});
  assert.notEqual(result.type, 'obstacle');assert.equal(penetrated.penetrations.length, 1);
  close(penetrated.penetrations[0].point.z, 49.995);close(penetrated.penetrations[0].point.y, front.y);
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

test('four reusable bullet choices retain exact basic ammunition and never alter bows or special arrows', () => {
  assert.deepEqual(BULLETS.map(item => item.id), [0, 1, 2, 3]);
  assert.deepEqual(BULLETS.map(item => item.price), [0, 4000, 12000, 30000]);
  assert.deepEqual(BULLETS.map(item => item.speedRatio), [1, 1.5, 2, 3]);
  assert.deepEqual(BULLETS.map(item => item.dropRatio), [1, .6, .25, 0]);
  assert.equal(getBullet(), BULLETS[0]);assert.equal(getBullet(999), BULLETS[0]);
  for (const item of BULLETS) {
    assert.equal(getBullet(item.id), item);assert.equal(getBullet(item), item);
    assert.equal(item.muzzleSpeed, BULLET_SPEED * item.speedRatio);
    assert.equal(item.variance, 0);
  }
  for (const bow of guns) {
    const basic = launchArrow({bow, pitch:.15});
    assert.deepEqual(launchArrow({bow, bullet:0, pitch:.15}), basic);
    assert.equal(basic.speed, BULLET_SPEED);
    for (const key of ['mass', 'windFactor', 'dragRate', 'gravityScale']) assert.equal(basic[key], bow.ammo[key]);
    for (const bullet of BULLETS) {
      const expected = launchArrow({bow, bullet, pitch:.15});
      for (const arrow of [0, 12, 13, 18]) for (const charge of [0, .5, 1]) for (const velocityBias of [-1, 0, 1]) {
        const params = {bow, bullet:bullet.id, arrow, charge, velocityBias, pitch:.15};
        const shot = launchArrow(params), volley = launchVolley(params);
        assert.equal(shot.bulletId, bullet.id);assert.equal(shot.ability, null);
        assert.equal(shot.speed, BULLET_SPEED * bullet.speedRatio);
        assert.equal(getSpeed(params), shot.speed);assert.deepEqual(shot, expected);
        assert.equal(volley.length, 1);assert.equal(volley[0].bulletId, bullet.id);
        assert.equal(volley[0].speed, expected.speed);
      }
    }
  }
  for (const bow of BOWS.filter(item => item.weaponType !== 'gun')) for (const arrow of [0, 12, 13, 18]) {
    const params = {bow, arrow, charge:.7, pitch:.15, velocityBias:.4};
    const normal = launchArrow(params);
    for (const bullet of BULLETS) assert.deepEqual(launchArrow({...params, bullet}), normal);
  }
});

test('upgraded bullets reduce actual same-distance drop to sixty percent, one quarter and zero', () => {
  for (const bow of guns) for (const distance of [10, 50, 150]) for (const pitch of [0, .25, Math.PI / 4]) for (const yaw of [-.2, 0, .2]) {
    const params = {bow, yaw, pitch}, basic = launchArrow(params);
    basic.position.y = 100;
    const stage = {...range, distance}, rayY = 100 + Math.tan(pitch) * distance / Math.cos(yaw);
    const reference = stepArrow(basic, 16, stage), baseDrop = rayY - reference.point.y;
    assert.equal(reference.type, 'hit');assert.ok(baseDrop > 0);
    let previousDrop = Infinity;
    for (const bullet of BULLETS) {
      const shot = launchArrow({...params, bullet});shot.position.y = 100;
      const result = stepArrow(shot, 16, stage), drop = rayY - result.point.y;
      assert.equal(result.type, 'hit');close(result.flightTime, reference.flightTime / bullet.speedRatio);
      close(drop, baseDrop * bullet.dropRatio);assert.ok(drop < previousDrop);
      close(result.point.x, reference.point.x);
      previousDrop = drop;
    }
  }
});

test('the highest bullet launches at exactly three times basic speed and stays on a straight ray in strong wind', () => {
  for (const bow of guns) for (const distance of [10, 50, 150]) for (const wind of [-12, 12]) {
    const params = {bow, bullet:3, yaw:.17, pitch:.08};
    const shot = launchArrow(params), basic = launchArrow({...params, bullet:0});
    assert.equal(shot.speed, basic.speed * 3);assert.equal(shot.gravityScale, 0);assert.equal(shot.windFactor, 0);
    const ray = z => ({x:PLAYER.x + Math.tan(params.yaw) * z,
      y:PLAYER.y + Math.tan(params.pitch) * z / Math.cos(params.yaw),z});
    const expected = ray(distance), stage = {...range, distance, wind, targetX:expected.x, height:expected.y, radius:.61};
    const result = stepArrow(shot, 16, stage);
    assert.equal(result.type, 'hit');assert.equal(result.score, 10);
    for (const axis of ['x', 'y', 'z']) close(result.point[axis], expected[axis]);
    close(shot.velocity.x / shot.velocity.z, Math.tan(params.yaw));
    close(shot.velocity.y / shot.velocity.z, Math.tan(params.pitch) / Math.cos(params.yaw));
    const forecast = predictTrajectory(params, stage);
    assert.equal(forecast.result.type, 'hit');assert.equal(forecast.result.score, 10);
    for (const point of forecast.points) {
      const onRay = ray(point.z);
      close(point.x, onRay.x);close(point.y, onRay.y);
    }
  }
});

test('straight misses finish at the target plane while wall penetration and people retain swept collision priority', () => {
  const params = {bow:22, bullet:3, pitch:0, yaw:0}, distance = 150;
  const plain = {...range, distance, height:PLAYER.y, radius:.61, wind:12}, missedStage = {...plain, height:5};
  const expected = crossing(launchArrow(params), distance), missed = stepArrow(launchArrow(params), 16, missedStage);
  assert.equal(missed.type, 'miss');close(missed.point.z, distance);close(missed.flightTime, expected.time);
  assert.ok(missed.flightTime < 1, 'a flat miss must not wait for the sixteen-second timeout');
  const hit = stepArrow(launchArrow(params), 16, plain);
  assert.equal(hit.type, 'hit');assert.equal(hit.score, 10);close(hit.flightTime, missed.flightTime);

  // Both blockers begin at precisely the target plane. A person still stops
  // the bullet first; a wall applies its loss before the same-time hit/miss.
  const wall = {x:0, z:distance + .005, width:1, height:3, depth:.01};
  const config = {id:0, z:distance + .005, width:1, height:3, depth:.01, passDuration:20, phase:.5};
  const person = passersAt({...plain, passers:[config]}, expected.time)[0];
  config.phase -= person.x / (person.velocityX * config.passDuration);
  for (const stage of [plain, missedStage]) {
    const wallStage = {...stage, obstacles:[wall]}, personStage = {...wallStage, passers:[config]};
    const pierced = launchArrow(params), through = stepArrow(pierced, 16, wallStage);
    assert.equal(through.type, stage === plain ? 'hit' : 'ground');
    if(stage===plain)close(through.point.z,distance);
    else {close(through.point.y,0);assert.ok(through.point.z>distance);}
    assert.ok(pierced.gravityScale>0, 'after penetration a missed straight bullet now falls');
    assert.equal(pierced.penetrations.length, 1);close(pierced.penetrationSpeedRatio, .5);
    const stopped = launchArrow(params), intercepted = stepArrow(stopped, 16, personStage);
    assert.equal(intercepted.type, 'person');assert.equal(intercepted.personId, 0);close(intercepted.point.z, distance);
    assert.equal(stopped.penetrations.length, 0, 'a person at the entry plane has priority over penetration');
    for (const dt of [1 / 30, 1 / 144, .47]) {
      const shot = launchArrow(params);
      while (shot.active) stepArrow(shot, dt, personStage, shot.elapsed);
      assert.equal(shot.result.type, 'person');close(shot.result.flightTime, intercepted.flightTime);
      for (const axis of ['x', 'y', 'z']) close(shot.result.point[axis], intercepted.point[axis]);
    }
  }
});

test('the three dropping bullet types preserve their falling flight after missing the target plane', () => {
  const stage = {...range, height:100, radius:.1};
  for (const bullet of BULLETS.slice(0, 3)) {
    const shot = launchArrow({bow:20, bullet, pitch:.15}), atPlane = crossing(shot, stage.distance);
    stepArrow(shot, atPlane.time + .000001, stage);
    assert.equal(shot.targetPassed, true);assert.equal(shot.active, true);assert.equal(shot.result, null);
    const result = stepArrow(shot, 16, stage, shot.elapsed);
    assert.equal(result.type, 'ground');assert.ok(result.flightTime > atPlane.time);
  }
});
