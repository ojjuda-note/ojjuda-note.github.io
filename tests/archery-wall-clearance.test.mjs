import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  PLAYER, GRAVITY, WIND_RESPONSE, BOWS, ARROWS, STAGES,
  CATALOG_V1_STAGE_MAP, LEGACY_STAGE_MAP, prepareStage, targetAt,
  launchArrow, launchVolley, stepArrow
} from '../games/forest-archer/engine.mjs';

const seeds = [0, 5, 19, 0xfffffffe];
const hidden = STAGES.filter(stage => stage.fullCover);
const legacyDistances = [60, 65, 70, 80];
const longDistances = [60, 80, 100, 120, 150];
const legacyChapters = ['hidden-fixed', 'hidden-tracking', 'hidden-irregular', 'double-wall-finale'];
const fullCoverIds = [...Array.from({length: 12}, (_, i) => 97 + i),
  ...Array.from({length: 4}, (_, i) => 117 + i), ...Array.from({length: 10}, (_, i) => 211 + i)];
const releaseMoments = [2.5, 3.5, 5, 7, 9, 12, 16];
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const fingerprint = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const identity = stage => ({id: stage.id, legacyId: stage.legacyId, legacyStageId: stage.legacyStageId,
  catalogV1Id: stage.catalogV1Id, lessonKey: stage.lessonKey, sourceLessonKey: stage.sourceLessonKey,
  chapterId: stage.chapterId, longRange: stage.longRange});
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} differs from ${expected}`);

// Independent linear-drag geometry. This solver chooses aim only; every
// accepted result below still traverses the unchanged real collision engine.
function atPlane(shot, stage, z) {
  const v = shot.velocity, drag = shot.dragRate, distance = z - shot.position.z;
  if (!(v.z > 0) || distance < 0 || drag * distance / v.z >= 1) return null;
  const time = drag > 1e-8 ? -Math.log1p(-drag * distance / v.z) / drag : distance / v.z;
  const a = drag > 1e-8 ? -Math.expm1(-drag * time) / drag : time;
  const b = drag > 1e-8 ? (time - a) / drag : time * time / 2;
  return {time, point: {
    x: shot.position.x + v.x * a + stage.wind * WIND_RESPONSE * shot.windFactor * b,
    y: shot.position.y + v.y * a - GRAVITY * b, z
  }};
}

function aimError(params, stage, time, offsetY) {
  const flight = atPlane(launchArrow(params), stage, stage.distance);
  if (!flight || flight.time >= 8) return null;
  const target = targetAt(stage, time + flight.time);
  return {x: flight.point.x - target.x,
    y: flight.point.y - target.y - offsetY * target.ry};
}

function fullChargeAim(stage, bow, arrow, time, offsetY = 0) {
  const params = {bow, arrow, yaw: 0, pitch: .15, charge: 1, velocityBias: 0};
  for (let iteration = 0; iteration < 30; iteration++) {
    const error = aimError(params, stage, time, offsetY);
    if (!error) return null;
    if (Math.hypot(error.x, error.y) < 1e-7) return params;
    const epsilon = 1e-5;
    const yaw = aimError({...params, yaw: params.yaw + epsilon}, stage, time, offsetY);
    const pitch = aimError({...params, pitch: params.pitch + epsilon}, stage, time, offsetY);
    if (!yaw || !pitch) return null;
    const xx = (yaw.x - error.x) / epsilon, xy = (pitch.x - error.x) / epsilon;
    const yx = (yaw.y - error.y) / epsilon, yy = (pitch.y - error.y) / epsilon;
    const determinant = xx * yy - xy * yx;
    if (Math.abs(determinant) < 1e-10) return null;
    params.yaw -= Math.max(-.15, Math.min(.15, (yy * error.x - xy * error.y) / determinant));
    params.pitch -= Math.max(-.15, Math.min(.15, (xx * error.y - yx * error.x) / determinant));
    if (Math.abs(params.yaw) > .7 || params.pitch < -.5 || params.pitch > 1) return null;
  }
  return null;
}

const legalAim = params => params && params.charge === 1 && Math.abs(params.yaw) <= .38 &&
  params.pitch >= -.15 && params.pitch <= .55;

function topClearance(params, stage) {
  const shot = launchArrow(params);
  let clearance = Infinity;
  for (const wall of stage.obstacles) for (const z of [wall.z - wall.depth / 2, wall.z + wall.depth / 2]) {
    const flight = atPlane(shot, stage, z);
    if (!flight) return -Infinity;
    // Require height over every slab even if wind bends outside its side.
    // A lateral detour must not disguise an unusably flat arc.
    clearance = Math.min(clearance, flight.point.y - wall.height);
  }
  return clearance;
}

function fireVolley(params, stage, time, burstSeed) {
  return launchVolley({...params, burstSeed}).map(shot => ({shot,
    result: stepArrow(shot, 8, stage, time + shot.launchDelay)}));
}

function findFullChargeShot(stage, bow, arrow, burstSeed, offsets = [0, .15, .19]) {
  for (const offsetY of offsets) for (const time of releaseMoments) {
    const params = fullChargeAim(stage, bow, arrow, time, offsetY);
    if (!legalAim(params) || topClearance(params, stage) < .05) continue;
    const volley = fireVolley(params, stage, time, burstSeed);
    if (volley[0].result?.type !== 'hit' || volley[0].result.score !== 10) continue;
    if (![-.08, .08].every(offset => {
      const results = fireVolley(params, stage, time + offset, burstSeed).map(entry => entry.result);
      return results.every(result => result?.type !== 'person') && Math.max(...results.map(result => result?.score || 0)) >= 8;
    })) continue;
    return {params, time, offsetY, volley};
  }
  return null;
}

function rayMeetsWall(point, wall) {
  let enter = 0, leave = 1;
  for (const [axis, low, high] of [
    ['x', wall.x - wall.width / 2, wall.x + wall.width / 2],
    ['y', 0, wall.height], ['z', wall.z - wall.depth / 2, wall.z + wall.depth / 2]
  ]) {
    const delta = point[axis] - PLAYER[axis];
    if (Math.abs(delta) < 1e-12) {
      if (PLAYER[axis] < low || PLAYER[axis] > high) return false;
      continue;
    }
    const a = (low - PLAYER[axis]) / delta, b = (high - PLAYER[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

test('wall repairs preserve the 194 other missions and every saved lesson identity from release 9078849', () => {
  // Canonical SHA-256 values captured from git 9078849ba4a9554a21394b63712d04a1d438741d.
  // The test needs no git checkout or generated baseline file when it runs.
  const unaffected = STAGES.filter(stage => !stage.fullCover);
  assert.equal(STAGES.length, 220);assert.equal(unaffected.length, 194);
  assert.deepEqual(STAGES.map(stage => stage.id), Array.from({length: 220}, (_, i) => i + 1));
  assert.deepEqual(hidden.map(stage => stage.id), fullCoverIds);
  assert.equal(fingerprint(unaffected), '2b85353589eecf22328b30abc98ce40465fb5d877c4a86fbd2ce243abb7b4f2e');
  assert.equal(fingerprint(hidden.map(identity)), '38bbc6d6853d02e600407c15e72094d42b2f41be8abe4c4e0e3d53be32dfda0c');
  assert.equal(fingerprint({CATALOG_V1_STAGE_MAP, LEGACY_STAGE_MAP}),
    'e7846981eed8be2f4619f2cfa1f2c1104441527612165850abfb60f88bdc9999');
});

test('fully hidden missions leave substantial flight distance after the final real wall', () => {
  for (const key of legacyChapters) {
    assert.deepEqual(hidden.filter(stage => stage.lessonKey === key).map(stage => stage.distance), legacyDistances);
  }
  for (const key of ['long-hidden-tracking', 'long-double-wall-finale']) {
    assert.deepEqual(hidden.filter(stage => stage.lessonKey === key).map(stage => stage.distance), longDistances);
  }
  for (const stage of hidden) {
    assert.equal(stage.visibleFraction, 0);
    assert.ok(stage.name.endsWith(`${stage.distance}m`), `stage ${stage.id} names its real distance`);
    assert.equal(stage.obstacles.length, stage.fullCover === 'double' ? 2 : 1);
    const farEdge = Math.max(...stage.obstacles.map(wall => wall.z + wall.depth / 2));
    const gap = stage.distance - farEdge;
    assert.ok(gap >= stage.distance * .60 && gap >= 30, `stage ${stage.id}: only ${gap}m after its final wall`);
    for (const wall of stage.obstacles) {
      assert.ok([wall.x, wall.z, wall.width, wall.height, wall.depth].every(Number.isFinite));
      assert.ok(wall.z - wall.depth / 2 > 0 && wall.width > 0 && wall.height > 0 && wall.depth > 0);
    }
  }
});

test('moving the walls forward still hides the entire real target for each prepared layout', () => {
  for (const template of hidden) for (const seed of seeds) {
    const stage = prepareStage(template, seed);
    for (const time of [0, 1.3, 3.7, 7, 12, 19]) {
      const target = targetAt(stage, time);
      const points = [target, ...Array.from({length: 16}, (_, i) => {
        const angle = i * Math.PI / 8;
        return {...target, x: target.x + Math.cos(angle) * target.rx, y: target.y + Math.sin(angle) * target.ry};
      })];
      assert.ok(points.every(point => stage.obstacles.some(wall => rayMeetsWall(point, wall))),
        `stage ${stage.id}, seed ${seed}, time ${time}: a rim point is exposed`);
    }
  }
});

test('every hidden range accepts full-charge reference and fastest equipment shots through the real walls', () => {
  for (const template of hidden) for (const seed of seeds) {
    const stage = prepareStage(template, seed);
    const combinations = [...new Map([...stage.referenceLoadouts, {bow: 19, arrow: 18}]
      .map(loadout => [`${loadout.bow}/${loadout.arrow}`, loadout])).values()];
    for (const loadout of combinations) {
      const found = findFullChargeShot(stage, BOWS[loadout.bow], ARROWS[loadout.arrow], seed);
      const label = `stage ${stage.id}, seed ${seed}, equipment ${loadout.bow}/${loadout.arrow}`;
      assert.ok(found, `${label}: full charge needs a real 10-point shot with 5cm wall clearance and an 8-point release window`);
      assert.ok(legalAim(found.params));assert.equal(found.params.charge, 1);
      assert.ok([0, .15, .19].includes(found.offsetY), 'only the centre or upper part of the true gold ring is used');
      assert.ok(topClearance(found.params, stage) >= .05);
      assert.equal(found.volley[0].result.type, 'hit');assert.equal(found.volley[0].result.score, 10);
      const impact = found.volley[0].result, target = impact.targetCenter;
      const ring = Math.hypot((impact.point.x - target.x) / target.rx, (impact.point.y - target.y) / target.ry);
      assert.ok(ring < .2, `${label}: the impact remains inside the actual gold ring`);
      near(impact.point.z, stage.distance);
      assert.equal(found.volley.length, BOWS[loadout.bow].burstCount);
      assert.ok(found.volley.every(entry => !entry.shot.active && entry.result), 'all delayed arrows resolve against the real stage');
    }
  }
});

test('reachable legacy ranges retain a full-charge centre shot with the free starter equipment', () => {
  const checked = new Set();
  for (const template of hidden.filter(stage => !stage.longRange)) for (const seed of seeds) {
    const stage = prepareStage(template, seed);
    const physicallyReachable = releaseMoments.some(time => legalAim(fullChargeAim(stage, BOWS[0], ARROWS[0], time)));
    if (!physicallyReachable) continue;
    const found = findFullChargeShot(stage, BOWS[0], ARROWS[0], seed, [0]);
    assert.ok(found, `stage ${stage.id}, seed ${seed}: the walls must not block an otherwise reachable starter centre shot`);
    assert.equal(found.offsetY, 0);assert.equal(found.params.charge, 1);assert.equal(found.volley[0].result.score, 10);
    checked.add(template.id);
  }
  assert.ok(checked.has(108) && checked.has(120), 'the established upper-equipment comparison missions retain their free baseline');
});

test('clearing one or two walls is independent of rendering frame size', () => {
  for (const id of [97, 104, 120, 211, 220]) {
    const stage = prepareStage(STAGES[id - 1], 19);
    const found = findFullChargeShot(stage, BOWS[19], ARROWS[18], 19);
    assert.ok(found, `stage ${id} has a real full-charge fixture`);
    const expected = found.volley[0].result;
    for (const dt of [1 / 30, 1 / 144]) {
      const shot = launchArrow(found.params);
      let time = found.time;
      while (shot.active && time - found.time < 8) {stepArrow(shot, dt, stage, time);time += dt;}
      assert.equal(shot.result?.type, 'hit');assert.equal(shot.result.score, 10);
      near(shot.result.flightTime, expected.flightTime);
      for (const axis of ['x', 'y', 'z']) near(shot.position[axis], expected.point[axis]);
    }
  }
});
