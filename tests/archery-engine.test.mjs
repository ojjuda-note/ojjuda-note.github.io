import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, GRAVITY, WIND_RESPONSE, REFERENCE_ARROW_MASS, getArrowMass, getWindResponse, prepareStage, passersAt, BOWS, ARROWS, STAGES, CLAY_EVENT, createClayEvent, eventTargetsAt, targetAt, getSpeed, launchArrow, launchVolley, stepArrow, predictTrajectory, createSway, stepSway } from '../games/forest-archer/engine.mjs';
import { windLeafAt, windLeafCount } from '../games/forest-archer/scenery.mjs';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const dragFree = { ...ARROWS[0], fletching: { ...ARROWS[0].fletching, drag: 0 } };
const emptyRange = { distance: 10000, radius: 1, height: 2, kind: 'target', motion: {}, wind: 0, obstacles: [] };
const seed = initial => () => { initial = (Math.imul(initial, 1664525) + 1013904223) >>> 0; return initial / 4294967296; };

// Independent exact linear-drag aim solver; no game renderer or input helpers.
function crossing(params, stage, worldTime = 0, forcedPassId) {
  const shot = launchArrow(params), v = shot.velocity, k = shot.dragRate;
  const ratio = k * stage.distance / v.z;
  if (ratio >= 1 || v.z <= 0) return null;
  const t = k > 1e-8 ? -Math.log1p(-ratio) / k : stage.distance / v.z;
  const velocityTime = k > 1e-8 ? -Math.expm1(-k * t) / k : t;
  const accelerationTime = k > 1e-8 ? (t - velocityTime) / k : t * t / 2;
  const target = targetAt(stage, worldTime + t, forcedPassId);
  return {
    t, x: v.x * velocityTime + stage.wind * WIND_RESPONSE * shot.windFactor * accelerationTime - target.x,
    y: PLAYER.y + v.y * velocityTime - GRAVITY * accelerationTime - target.y
  };
}
function centeredAim(stage, charge, bow, arrow, worldTime = 0, forcedPassId) {
  const params = { yaw: 0, pitch: .15, charge, bow, arrow, velocityBias: 0 };
  for (let i = 0; i < 24; i++) {
    const error = crossing(params, stage, worldTime, forcedPassId);
    if (!error) return null;
    if (Math.hypot(error.x, error.y) < 1e-7) return params;
    const epsilon = 1e-5;
    const yaw = crossing({ ...params, yaw: params.yaw + epsilon }, stage, worldTime, forcedPassId);
    const pitch = crossing({ ...params, pitch: params.pitch + epsilon }, stage, worldTime, forcedPassId);
    if (!yaw || !pitch) return null;
    const xx = (yaw.x - error.x) / epsilon, xy = (pitch.x - error.x) / epsilon;
    const yx = (yaw.y - error.y) / epsilon, yy = (pitch.y - error.y) / epsilon;
    const determinant = xx * yy - xy * yx;
    if (Math.abs(determinant) < 1e-8) return null;
    params.yaw -= Math.max(-.15, Math.min(.15, (yy * error.x - xy * error.y) / determinant));
    params.pitch -= Math.max(-.15, Math.min(.15, (xx * error.y - yx * error.x) / determinant));
    if (params.pitch > 1 || params.pitch < -.5 || Math.abs(params.yaw) > .7) return null;
  }
  return null;
}

test('zero drag retains the exact constant-acceleration trajectory', () => {
  const shot = launchArrow({ pitch: 0.35, yaw: 0.12, charge: 0.8, arrow: dragFree });
  const startVelocity = { ...shot.velocity };
  stepArrow(shot, 0.3, { ...emptyRange, wind: 1.2 }, 0);
  close(shot.position.x, startVelocity.x * 0.3 + 1.2 * WIND_RESPONSE * 0.3 ** 2 / 2);
  close(shot.position.y, PLAYER.y + startVelocity.y * 0.3 - GRAVITY * 0.3 ** 2 / 2);
  close(shot.position.z, startVelocity.z * 0.3);
  close(shot.velocity.y, startVelocity.y - GRAVITY * 0.3);
});

test('every stage strengthens the crosswind and leaves show the arrow drift direction', () => {
  let previousStrength = 0, previousLeafSpeed = 0, previousCount = 0;
  for (const stage of STAGES) {
    const strength = Math.abs(stage.wind);
    assert.ok(strength > previousStrength, `Stage ${stage.id} must strengthen the wind`);
    const shot = launchArrow({ pitch: .3, arrow: ARROWS[0] });
    stepArrow(shot, .3, { ...emptyRange, wind: stage.wind });
    const leaf = windLeafAt(0, 0, 1000, 600, stage.wind);
    const nextLeaf = windLeafAt(0, .1, 1000, 600, stage.wind);
    assert.equal(Math.sign(nextLeaf.x - leaf.x), Math.sign(shot.position.x));
    close((nextLeaf.x - leaf.x) / .1, leaf.vx);
    assert.ok(Math.abs(leaf.vx) > previousLeafSpeed);
    const count = windLeafCount(stage.wind);
    assert.ok(count >= previousCount && count <= 20, 'keep the animated leaf budget bounded');
    previousStrength = strength;
    previousLeafSpeed = Math.abs(leaf.vx);
    previousCount = count;
  }
  assert.ok(STAGES.some(stage => stage.wind < 0), 'include a leftward wind to learn');
  assert.ok(STAGES.some(stage => stage.wind > 0), 'include a rightward wind to learn');
});

test('wind leaves stay honest at rest, reverse direction and lean with strength on mobile', () => {
  for (const [w, h] of [[390, 600], [1440, 900]]) {
    const calm = windLeafAt(0, 0, w, h, 0);
    const calmLater = windLeafAt(0, 1, w, h, 0);
    close(calmLater.x, calm.x);
    const light = windLeafAt(0, 0, w, h, .12);
    const right = windLeafAt(0, 0, w, h, 1.35);
    const left = windLeafAt(0, 0, w, h, -1.35);
    close(right.vx, -left.vx);
    assert.ok(right.rotation < light.rotation, 'stronger wind makes leaves more horizontal');
    close(Math.PI - left.rotation, right.rotation);
    for (let i = 0; i < windLeafCount(-1.35); i++) {
      const leaf = windLeafAt(i, 1234, w, h, -1.35);
      assert.ok(leaf.x >= -12 && leaf.x <= w + 12);
      assert.ok(leaf.y >= -12 && leaf.y <= h * .78 + 12);
      assert.ok(leaf.vx < 0);
    }
  }
});

test('rabbits run nearby while deer remain distant animal encounters', () => {
  const rabbit = STAGES.find(stage => stage.kind === 'rabbit');
  const deer = STAGES.find(stage => stage.kind === 'deer');
  assert.equal(rabbit.id, 7); assert.equal(rabbit.distance, 24);
  assert.equal(deer.id, 11); assert.equal(deer.distance, 58);
  assert.ok(rabbit.distance < deer.distance && rabbit.radius < deer.radius);
  assert.equal(targetAt(rabbit, 0).kind, 'rabbit');
});

test('seeded animal passes enter from both sides and vary speed without reversing', () => {
  for (const template of [STAGES[5], STAGES[6], STAGES[10]]) {
    const directions = new Set();
    for (let seedValue = 0; seedValue < 16; seedValue++) {
      const stage = { ...template, encounterSeed: seedValue };
      const period = targetAt(stage, 0).passDuration;
      for (let pass = 0; pass < 3; pass++) {
        const first = targetAt(stage, pass * period), speeds = [];
        directions.add(first.direction);
        assert.equal(first.passId, pass);
        assert.deepEqual(first, targetAt(stage, pass * period), 'same time and seed always reproduce the same animal');
        let previous = first;
        for (let step = 1; step <= 50; step++) {
          const time = (pass + step / 51) * period, current = targetAt(stage, time);
          assert.equal(current.passId, pass);
          assert.equal(current.direction, first.direction);
          const movement = (current.x - previous.x) * first.direction;
          assert.ok(movement > 0, 'an animal crosses once instead of oscillating');
          assert.ok(current.velocityX * first.direction > 0);
          speeds.push(Math.abs(current.velocityX)); previous = current;
        }
        assert.ok(Math.max(...speeds) > Math.min(...speeds) * 1.15, 'speed visibly changes during each pass');
      }
    }
    assert.deepEqual([...directions].sort(), [-1, 1]);
  }
});

test('animal entries and exits are outside normal mobile and desktop views; birds undulate', () => {
  for (const stage of [STAGES[5], STAGES[6], STAGES[8], STAGES[10]]) {
    const first = targetAt(stage, 0), last = targetAt(stage, first.passDuration, first.passId);
    for (const [width, height] of [[390, 600], [1000, 600], [1200, 390], [1600, 900]]) {
      const focal = Math.min(width * 1.08, height * 1.5);
      for (const target of [first, last]) {
        const centerX = width / 2 + target.x * focal / target.z, radius = target.rx * focal / target.z;
        assert.ok(centerX + radius < 0 || centerX - radius > width, 'the entire animal starts/ends off screen');
      }
    }
    if (stage.kind === 'bird') {
      const heights = Array.from({ length: 80 }, (_, i) => targetAt(stage, first.passDuration * i / 80).y);
      assert.ok(Math.max(...heights) - Math.min(...heights) > .5, 'bird body flies up and down while crossing');
      assert.ok(Math.min(...heights) > 0);
    }
  }
});

test('a forced hit animal keeps its pass and position continuity after the next encounter starts', () => {
  for (const template of [STAGES[5], STAGES[6], STAGES[10]]) {
    const stage = { ...template, encounterSeed: 41 }, first = targetAt(stage, 0), period = first.passDuration;
    const before = targetAt(stage, period - .001, 0), after = targetAt(stage, period + .001, 0);
    assert.equal(after.passId, 0); assert.equal(after.direction, before.direction);
    assert.ok(Math.abs(after.x - before.x) < .1, 'an attached arrow must not jump to the new animal');
    assert.ok((after.x - before.x) * first.direction > 0);
    const current = targetAt(stage, period + .001);
    assert.equal(current.passId, 1);
    const later = targetAt(stage, period + .5, 0);
    assert.ok((later.x - after.x) * first.direction > 0, 'old hit animal continues travelling away');
  }
});

test('an arrow samples the active animal pass at the exact crossing time', () => {
  const stage = { ...STAGES[5], distance: 10, radius: .25, encounterSeed: 93, wind: 0, obstacles: [] };
  const period = targetAt(stage, 0).passDuration, crossingTime = .5, worldTime = period - .2;
  const target = targetAt(stage, worldTime + crossingTime);
  assert.equal(target.passId, 1);
  const shot = launchArrow({ arrow: dragFree });
  shot.velocity = { x: target.x / crossingTime, y: (target.y - PLAYER.y + GRAVITY * crossingTime ** 2 / 2) / crossingTime, z: stage.distance / crossingTime };
  const result = stepArrow(shot, 1, stage, worldTime);
  assert.equal(result.type, 'hit'); assert.equal(result.score, 10);
  assert.equal(result.targetCenter.passId, 1);
  assert.equal(result.targetCenter.direction, target.direction);
  close(result.point.x, target.x); close(result.point.y, target.y);
});

test('a calculated center shot earns ten points', () => {
  const params = centeredAim(STAGES[0], 1, BOWS[0], ARROWS[0]);
  const prediction = predictTrajectory(params, STAGES[0], 0);
  assert.equal(prediction.result.type, 'hit');
  assert.equal(prediction.result.score, 10);
  close(prediction.result.point.z, STAGES[0].distance);
});

test('swept obstacle collision catches a thin wall between frame endpoints', () => {
  const shot = launchArrow({ pitch: 0.1 });
  shot.velocity = { x: 0, y: 0, z: 200 };
  shot.position.y = 3;
  const result = stepArrow(shot, 0.5, { ...emptyRange, obstacles: [{ x: 0, z: 10, width: 3, height: 5, depth: 0.4 }] }, 0);
  assert.equal(result.type, 'obstacle');
  close(result.point.z, 9.8);
  assert.ok(result.flightTime < 0.05);
});

test('obstacle sweep follows the parabola rather than a straight frame chord', () => {
  const shot = launchArrow();
  shot.position.y = 1;
  shot.velocity = { x: 0, y: 10, z: 10 };
  const result = stepArrow(shot, 2, { ...emptyRange, obstacles: [{ x: 0, z: 10, width: 3, height: 3, depth: 0.2 }] }, 0);
  assert.notEqual(result?.type, 'obstacle');
});

test('moving targets are sampled at the exact plane-crossing time', () => {
  const stage = { ...emptyRange, distance: 10, radius: 0.25, height: 2.4, motion: { amplitudeX: 4, amplitudeY: 0.8, speed: 2 } };
  const crossingTime = 0.5, worldTime = 1.2;
  const target = targetAt(stage, worldTime + crossingTime);
  const shot = launchArrow({ arrow: dragFree });
  shot.velocity = { x: target.x / crossingTime, y: (target.y - PLAYER.y + GRAVITY * crossingTime ** 2 / 2) / crossingTime, z: 20 };
  const result = stepArrow(shot, 1.0, stage, worldTime);
  assert.equal(result.type, 'hit');
  assert.equal(result.score, 10);
  close(result.point.x, target.x);
  close(result.flightTime, crossingTime);
});

test('earliest surface wins, and a miss continues beyond the target', () => {
  const stage = { ...STAGES[0], obstacles: [{ x: 0, z: 8, width: 10, height: 10, depth: 1 }] };
  const params = centeredAim(stage, 1, BOWS[0], ARROWS[0]);
  assert.equal(predictTrajectory(params, stage).result.type, 'obstacle');
  const missed = launchArrow({ yaw: 0.3, pitch: 0.2 });
  stepArrow(missed, 0.4, STAGES[0], 0);
  assert.equal(missed.active, true);
  assert.ok(missed.position.z > STAGES[0].distance);
  const result = stepArrow(missed, 3, STAGES[0], 0.4);
  assert.ok(['ground', 'miss'].includes(result.type));
});

test('ground contact solves the actual impact time and position', () => {
  const shot = launchArrow({ pitch: 0, arrow: dragFree });
  const result = stepArrow(shot, 1, emptyRange, 0);
  assert.equal(result.type, 'ground');
  close(result.point.y, 0);
  close(result.flightTime, Math.sqrt(2 * PLAYER.y / GRAVITY));
});

test('a missed high shot stays active beyond the old distance limit and falls to the ground', () => {
  const params = { yaw: 0.20, pitch: 0.55, bow: BOWS[3], arrow: ARROWS[0], charge: 1, velocityBias: 1 };
  const shot = launchArrow(params);
  stepArrow(shot, 1.6, STAGES[0], 0);
  assert.ok(shot.position.z > STAGES[0].distance + 35);
  assert.ok(shot.position.y > 0);
  assert.equal(shot.active, true);
  assert.equal(shot.result, null);
  const result = stepArrow(shot, 6.4, STAGES[0], 1.6);
  assert.equal(result.type, 'ground');
  close(result.point.y, 0);
  assert.ok(result.flightTime < 8);
  const prediction = predictTrajectory(params, STAGES[0]);
  assert.equal(prediction.result.type, 'ground');
  close(prediction.result.point.z, result.point.z);
});

test('better arrows reduce speed spread without cancelling gravity', () => {
  const spread = arrow => getSpeed({ arrow, velocityBias: 1 }) - getSpeed({ arrow, velocityBias: -1 });
  assert.ok(spread(ARROWS[10]) < spread(ARROWS[0]) / 10);
  const shot = launchArrow({ arrow: { ...ARROWS[3], fletching: { ...ARROWS[3].fletching, drag: 0 } }, pitch: 0.3 });
  const vy = shot.velocity.y;
  stepArrow(shot, 0.2, emptyRange, 0);
  close(shot.velocity.y, vy - GRAVITY * 0.2);
});

test('twenty-five weapons and twelve arrows preserve old identities and independent equipment choices', () => {
  assert.equal(BOWS.length, 25); assert.equal(ARROWS.length, 12);
  assert.deepEqual(BOWS.map(item => item.id), Array.from({ length: 25 }, (_, id) => id));
  assert.deepEqual(ARROWS.map(item => item.id), Array.from({ length: 12 }, (_, id) => id));
  assert.deepEqual(BOWS.slice(0, 4).map(item => item.price), [0, 100, 280, 650]);
  assert.deepEqual(ARROWS.slice(0, 4).map(item => item.price), [0, 75, 220, 500]);
  assert.equal(new Set(BOWS.map(item => item.name)).size, 25);
  assert.equal(new Set(ARROWS.map(item => item.fletching.name)).size, 12);
  assert.ok(BOWS[1].grip > BOWS[2].grip && BOWS[1].elasticity < BOWS[2].elasticity);
  assert.ok(ARROWS[1].tipMass > ARROWS[2].tipMass && ARROWS[1].fletching.windArea > ARROWS[2].fletching.windArea);
  for (const bow of BOWS) for (const arrow of ARROWS) {
    const shot = launchArrow({ bow, arrow, charge: 1 });
    assert.ok(Number.isFinite(shot.speed) && shot.speed > 30 && shot.speed < 160);
    assert.ok(Number.isFinite(shot.dragRate) && shot.dragRate > 0);
  }
});

test('ten crossbows launch faster but travel less far than bows and upper weapons accept bound scopes', () => {
  assert.equal(BOWS.filter(bow => bow.weaponType === 'bow').length, 10);
  const crossbows = BOWS.filter(bow => bow.weaponType === 'crossbow');
  assert.equal(crossbows.length, 10);
  assert.ok(crossbows.every(bow => bow.name.includes('석궁')));
  assert.deepEqual(BOWS.filter(bow => bow.scopeCompatible).map(bow => bow.id), [3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24]);
  assert.ok(BOWS.filter(bow => bow.scopeCompatible).every(bow => bow.scopePrice > 0));
  for (const arrow of ARROWS) for (const pitch of [.15, .30, .55]) {
    const normal = launchArrow({ bow: BOWS[9], arrow, pitch });
    const normalRange = stepArrow(normal, 8, emptyRange).point.z;
    for (const bow of crossbows) {
      const bolt = launchArrow({ bow, arrow, pitch });
      const result = stepArrow(bolt, 8, emptyRange);
      assert.ok(bolt.speed > normal.speed, 'crossbow leaves the weapon faster with the same arrow');
      assert.equal(result.type, 'ground');
      assert.ok(result.point.z < normalRange, 'extra crossbow drag limits range at normal arc angles');
    }
  }
});

test('only rare crossbows launch three distinct arrows and better tiers tighten actual groups', () => {
  const rare = BOWS.filter(bow => bow.rarity === '레어');
  assert.deepEqual(rare.map(bow => bow.id), [15, 16, 17, 18, 19]);
  const params = { arrow: ARROWS[0], charge: 1, yaw: .07, pitch: .15, burstSeed: 2468 };
  for (const bow of BOWS.filter(bow => bow.rarity !== '레어')) {
    const volley = launchVolley({ ...params, bow });
    assert.equal(volley.length, 1); assert.equal(volley[0].launchDelay, 0);
    assert.deepEqual(volley[0].velocity, launchArrow({ ...params, bow }).velocity);
  }
  let previousSpread = Infinity, previousGroup = Infinity;
  for (const bow of rare) {
    const shots = launchVolley({ ...params, bow });
    assert.equal(shots.length, 3);
    assert.deepEqual(shots.map(shot => shot.launchDelay), [0, bow.burstInterval, bow.burstInterval * 2]);
    assert.deepEqual(shots.map(shot => shot.velocity), launchVolley({ ...params, bow }).map(shot => shot.velocity));
    const offsets = shots.map(shot => ({
      yaw: Math.atan2(shot.velocity.x, shot.velocity.z) - params.yaw,
      pitch: Math.asin(shot.velocity.y / shot.speed) - params.pitch
    }));
    const spread = Math.max(...offsets.map(offset => Math.hypot(offset.yaw, offset.pitch)));
    assert.ok(spread <= bow.burstSpread + 1e-10 && spread < previousSpread);
    const points = shots.map(shot => stepArrow(shot, 8, { ...emptyRange, distance: 30, radius: 100 }).point);
    let group = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const separation = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      assert.ok(separation > .01, 'three arrows must not overlap at one impact point');
      group = Math.max(group, separation);
    }
    assert.ok(group < previousGroup, 'upgraded rare crossbows produce a tighter group at the same range');
    previousSpread = spread; previousGroup = group;
  }
});

test('five guns use their fixed bullets independently of arrows and draw charge', () => {
  const guns = BOWS.filter(weapon => weapon.weaponType === 'gun');
  assert.equal(guns.length, 5);
  assert.deepEqual(guns.map(gun => gun.magazineSize), [2, 2, 4, 4, 10]);
  assert.deepEqual(guns.map(gun => gun.reloadSeconds), [3, 1.3, 3.2, 1.5, 2.8]);
  assert.deepEqual(guns.map(gun => gun.reloadLabel), ['느림', '빠름', '느림', '빠름', '보통']);
  for (const gun of guns) {
    assert.ok(gun.power > 0 && !Object.hasOwn(gun, 'elasticity'));
    const reference = launchArrow({ bow: gun, arrow: ARROWS[0], charge: 0, pitch: .1 });
    for (const arrow of ARROWS) for (const charge of [0, .5, 1]) {
      const shot = launchArrow({ bow: gun, arrow, charge, pitch: .1 });
      assert.deepEqual(shot.velocity, reference.velocity);
      close(getSpeed({ bow: gun, arrow, charge }), gun.muzzleSpeed);
      assert.equal(shot.projectileType, 'bullet'); assert.equal(shot.shaftLength, .12);
      close(shot.mass, gun.ammo.mass); close(shot.windFactor, gun.ammo.windFactor); close(shot.dragRate, gun.ammo.dragRate);
    }
    const initial = { ...reference.velocity };
    stepArrow(reference, .3, { ...emptyRange, wind: 1 });
    assert.ok(reference.position.x > 0 && reference.velocity.z < initial.z);
    assert.ok(reference.position.y < PLAYER.y + initial.y * .3, 'bullets still fall under gravity');
    const blocked = launchArrow({ bow: gun, pitch: .03 });
    const result = stepArrow(blocked, 1, { ...emptyRange, obstacles: [{ x: 0, z: 10, width: 3, height: 4, depth: .01 }] });
    assert.equal(result.type, 'obstacle'); close(result.point.z, 9.995);
  }
  assert.equal(launchArrow({ bow: BOWS[0] }).projectileType, 'arrow');
});

test('ten timed event levels progress from two to ten simultaneous targets in three finite waves', () => {
  assert.equal(STAGES.length, 50); assert.ok(!STAGES.includes(CLAY_EVENT));
  assert.deepEqual(CLAY_EVENT, createClayEvent(1));
  assert.equal(CLAY_EVENT.shots, null); assert.equal(CLAY_EVENT.goal, 30);
  assert.equal(BOWS[20].price, 0, 'the first event gun is free');
  assert.equal(createClayEvent(-4).eventLevel, 1); assert.equal(createClayEvent(99).eventLevel, 10);
  let previousDuration = Infinity, previousFlight = Infinity;
  for (let level = 1; level <= 10; level++) {
    const stage = prepareStage(createClayEvent(level), 17), count = Math.min(10, level + 1), ids = new Set();
    assert.equal(stage.targetsPerWave, count); assert.equal(stage.waveCount, 3);
    assert.equal(stage.totalTargets, count * 3); assert.equal(stage.maxScore, count * 30);
    assert.equal(stage.goal, Math.ceil(count * 3 / 2) * 10);
    assert.ok(stage.eventDuration < previousDuration && stage.flightSeconds < previousFlight);
    for (let wave = 0; wave < 3; wave++) {
      const startTime = stage.waveDuration * wave, targets = eventTargetsAt(stage, startTime);
      assert.equal(targets.length, count); assert.deepEqual(targets, eventTargetsAt(stage, startTime));
      for (const target of targets) {
        assert.equal(target.waveId, wave); assert.equal(target.passId, wave * 10 + target.slot);
        assert.ok(target.active && target.z === stage.distance); ids.add(target.passId);
      }
      const gapTime = startTime + stage.flightSeconds * 1.04 + .2;
      assert.deepEqual(eventTargetsAt(stage, gapTime), []); assert.equal(targetAt(stage, gapTime).active, false);
    }
    assert.equal(ids.size, stage.totalTargets);
    assert.deepEqual(eventTargetsAt(stage, stage.eventDuration), []);
    assert.deepEqual(eventTargetsAt(stage, stage.eventDuration + 100), []);
    previousDuration = stage.eventDuration; previousFlight = stage.flightSeconds;
  }
  const early = eventTargetsAt(prepareStage(createClayEvent(1), 17), 0)[1];
  const late = eventTargetsAt(prepareStage(createClayEvent(10), 17), 0)[1];
  assert.ok(early.flightDuration >= 6 && early.flightDuration <= 7);
  assert.ok(late.flightDuration >= 2.5 && late.flightDuration <= 3);
  assert.ok(Math.abs(late.velocityX) > Math.abs(early.velocityX) * 2);
});

test('simultaneous plates have deterministic parabolic arcs and remain visible around their apex', () => {
  const directions = new Set(), durations = new Set();
  for (const level of [1, 4, 7, 10]) for (const seedValue of [0, 4, 17, 999]) {
    const stage = prepareStage(createClayEvent(level), seedValue);
    for (let wave = 0; wave < 3; wave++) {
      const startTime = stage.waveDuration * wave;
      for (const first of eventTargetsAt(stage, startTime)) {
        const passId = first.passId, middle = targetAt(stage, startTime + .25, passId), later = targetAt(stage, startTime + .5, passId);
        assert.deepEqual(first, targetAt(stage, startTime, passId)); directions.add(first.direction); durations.add(first.flightDuration.toFixed(3));
        if (first.kind === 'clay') {
          assert.ok((middle.x - first.x) * first.direction > 0 && (later.x - middle.x) * first.direction > 0);
          close(later.x - middle.x, middle.x - first.x);
          close(later.y - 2 * middle.y + first.y, -first.gravity * .25 ** 2);
        }
        const apex = targetAt(stage, startTime + first.flightDuration / 2, passId);
        for (const [width, height] of [[390, 600], [1000, 600], [1200, 390]]) {
          const focal = Math.min(width * 1.08, height * 1.5), scale = focal / apex.z;
          const x = width / 2 + apex.x * scale, y = height * .405 - (apex.y - PLAYER.y) * scale;
          assert.ok(x - apex.rx * scale >= 0 && x + apex.rx * scale <= width);
          assert.ok(y - apex.ry * scale >= 0 && y + apex.ry * scale <= height, 'slow early arcs must not fly above the normal view');
        }
        assert.equal(targetAt(stage, startTime + first.flightDuration + .01, passId).active, false);
      }
    }
  }
  assert.deepEqual([...directions].sort(), [-1, 1]); assert.ok(durations.size > 30);
});

test('late event UFOs escape on continuous seeded irregular paths', () => {
  assert.ok(eventTargetsAt(prepareStage(createClayEvent(7), 8), 0).every(target => target.kind === 'clay'));
  for (const level of [8, 9, 10]) {
    const stage = prepareStage(createClayEvent(level), 8), targets = eventTargetsAt(stage, 0);
    const ufo = targets.find(target => target.kind === 'ufo');
    assert.ok(ufo && targets.some(target => target.kind === 'clay'));
    let deviation = 0, fastest = 0, slowest = Infinity;
    for (let i = 1; i < 80; i++) {
      const time = ufo.flightDuration * i / 80;
      const target = targetAt(stage, time, ufo.passId), next = targetAt(stage, time + 1e-5, ufo.passId);
      assert.deepEqual(target, targetAt(stage, time, ufo.passId));
      assert.ok(Math.hypot(next.x - target.x, next.y - target.y) < .01);
      close((next.x - target.x) / 1e-5, target.velocityX, .003);
      close((next.y - target.y) / 1e-5, target.velocityY, .003);
      deviation = Math.max(deviation, Math.abs(target.x - (ufo.x + ufo.velocityX * time)));
      const speed = Math.hypot(target.velocityX, target.velocityY);
      fastest = Math.max(fastest, speed); slowest = Math.min(slowest, speed);
    }
    assert.ok(deviation > .5 && fastest > slowest * 1.4, 'UFOs weave and change speed instead of following a plain arc');
  }
});

test('every gun can reach individual plates or UFOs across all ten event levels', () => {
  for (let level = 1; level <= 10; level++) for (const gun of BOWS.filter(weapon => weapon.weaponType === 'gun')) {
    const stage = prepareStage(createClayEvent(level), 17), time = stage.flightSeconds / 2 - .4;
    for (const passId of [0, stage.targetsPerWave - 1]) {
      const params = centeredAim(stage, 0, gun, ARROWS[11], time, passId);
      assert.ok(params && Math.abs(params.yaw) < .48 && params.pitch < .58);
      const result = predictTrajectory(params, stage, time).result;
      assert.equal(result.type, 'hit'); assert.equal(result.score, 10); assert.equal(result.targetCenter.passId, passId);
    }
  }
});

test('event collision resolves one of several targets exactly and breaking it leaves the others active', () => {
  const stage = prepareStage(createClayEvent(10), 42), time = .7, duration = .5;
  const targets = eventTargetsAt(stage, time + duration);
  const makeShot = target => {
    const shot = launchArrow({ bow: BOWS[20] }), k = shot.dragRate;
    const b = -Math.expm1(-k * duration) / k, c = (duration - b) / k;
    shot.velocity = { x: (target.x - stage.wind * WIND_RESPONSE * shot.windFactor * c) / b,
      y: (target.y - PLAYER.y + GRAVITY * c) / b, z: stage.distance / b };
    return shot;
  };
  for (const target of [targets[0], targets[5], targets[9]]) {
    const whole = makeShot(target), pieces = makeShot(target);
    const result = stepArrow(whole, 1, stage, time);
    let elapsed = 0;
    while (pieces.active && elapsed < 1) { stepArrow(pieces, .005, stage, time + elapsed); elapsed += .005; }
    assert.equal(result.type, 'hit'); assert.equal(result.score, 10); assert.equal(result.targetCenter.passId, target.passId);
    assert.equal(pieces.result.targetCenter.passId, target.passId); close(result.flightTime, pieces.result.flightTime);
    const before = eventTargetsAt(stage, time + duration);
    stage.brokenPasses.push(target.passId);
    const after = eventTargetsAt(stage, time + duration);
    assert.deepEqual(after, before.filter(candidate => candidate.passId !== target.passId));
    assert.equal(targetAt(stage, time + duration, target.passId).active, false);
    assert.notEqual(stepArrow(makeShot(target), 1, stage, time)?.targetCenter?.passId, target.passId);
  }
  const fresh = prepareStage(stage, 42);
  assert.deepEqual(fresh.brokenPasses, []); assert.equal(stage.brokenPasses.length, 3);
  assert.equal(eventTargetsAt(fresh, time + duration).length, 10);
  const overlapping = { ...prepareStage(createClayEvent(3), 42), radius: 20 };
  const target = eventTargetsAt(overlapping, 3)[2], shot = launchArrow({ bow: BOWS[20] });
  const k = shot.dragRate, b = -Math.expm1(-k * duration) / k, c = (duration - b) / k;
  shot.velocity = { x: (target.x - overlapping.wind * WIND_RESPONSE * shot.windFactor * c) / b,
    y: (target.y - PLAYER.y + GRAVITY * c) / b, z: overlapping.distance / b };
  const result = stepArrow(shot, 1, overlapping, 2.5);
  assert.equal(result.type, 'hit'); assert.equal(result.score, 10); assert.equal(result.targetCenter.passId, target.passId);
  assert.equal(shot.active, false, 'one bullet cannot score against every overlapping plate');
});

test('grip changes only sway while elasticity changes only launch energy', () => {
  const base = BOWS[0], betterGrip = { ...base, grip: 90 }, stronger = { ...base, elasticity: 90 };
  close(base.sway, .05); // retains the previously requested two-thirds starter sway
  close(getSpeed({ bow: betterGrip }), getSpeed({ bow: base }));
  assert.ok(getSpeed({ bow: stronger }) > getSpeed({ bow: base }));
  const states = [base, betterGrip, stronger].map(() => createSway());
  const randoms = states.map(() => seed(333));
  let basePower = 0, gripPower = 0;
  for (let frame = 0; frame < 600; frame++) {
    [base, betterGrip, stronger].forEach((bow, i) => stepSway(states[i], 1 / 60, bow, frame / 60, randoms[i]));
    close(states[0].x, states[2].x); close(states[0].y, states[2].y);
    basePower += states[0].x ** 2 + states[0].y ** 2;
    gripPower += states[1].x ** 2 + states[1].y ** 2;
  }
  assert.ok(gripPower < basePower / 4);
});

test('a heavier point lowers launch speed at equal bow energy and slows drag loss', () => {
  const light = ARROWS[0], heavy = { ...light, tipMass: light.tipMass + 10 };
  const lightShot = launchArrow({ arrow: light, pitch: .4 });
  const heavyShot = launchArrow({ arrow: heavy, pitch: .4 });
  const kinetic = shot => getArrowMass(shot === lightShot ? light : heavy) * shot.speed ** 2 / 2;
  close(kinetic(lightShot), kinetic(heavyShot));
  assert.ok(heavyShot.speed < lightShot.speed);
  assert.ok(heavyShot.dragRate < lightShot.dragRate);
  assert.ok(heavyShot.windFactor < lightShot.windFactor);
  const lightStart = lightShot.velocity.z, heavyStart = heavyShot.velocity.z;
  stepArrow(lightShot, .7, { ...emptyRange, wind: 1.2 });
  stepArrow(heavyShot, .7, { ...emptyRange, wind: 1.2 });
  assert.ok(heavyShot.velocity.z / heavyStart > lightShot.velocity.z / lightStart, 'heavy arrow retains a larger fraction of speed');
  assert.ok(heavyShot.position.x < lightShot.position.x, 'equal wing area gives less side acceleration to more mass');
  // All arrows have the same gravitational acceleration: mass does not alter g.
  const vacuumHeavy = launchArrow({ arrow: { ...heavy, fletching: { ...heavy.fletching, drag: 0 } } });
  const vacuumLight = launchArrow({ arrow: dragFree });
  stepArrow(vacuumHeavy, .3, emptyRange); stepArrow(vacuumLight, .3, emptyRange);
  close(vacuumHeavy.position.y, vacuumLight.position.y);
});

test('wing area, air drag and stability each affect their own flight property', () => {
  const base = ARROWS[0];
  const narrow = { ...base, fletching: { ...base.fletching, windArea: .3 } };
  const streamlined = { ...base, fletching: { ...base.fletching, drag: .025 } };
  const stable = { ...base, fletching: { ...base.fletching, stability: 98 } };
  close(getSpeed({ arrow: narrow }), getSpeed({ arrow: base }));
  close(getSpeed({ arrow: streamlined }), getSpeed({ arrow: base }));
  const spread = arrow => getSpeed({ arrow, velocityBias: 1 }) - getSpeed({ arrow, velocityBias: -1 });
  assert.ok(spread(stable) < spread(base) / 10);
  for (const direction of [-1, 0, 1]) {
    const shots = [base, narrow, streamlined].map(arrow => launchArrow({ arrow, pitch: .3 }));
    for (const shot of shots) stepArrow(shot, .5, { ...emptyRange, wind: direction * 1.2 });
    close(shots[1].position.x, shots[0].position.x * .3);
    close(shots[1].position.z, shots[0].position.z);
    close(shots[1].position.y, shots[0].position.y);
    assert.ok(shots[2].velocity.z > shots[0].velocity.z);
    if (direction) assert.equal(Math.sign(shots[0].position.x), direction);
    else close(shots[0].position.x, 0);
  }
});

test('faster shots receive less accumulated wind drift over the same distance', () => {
  const stage = { ...emptyRange, distance: 40, radius: 1000, wind: 1.2 };
  const slow = launchArrow({ bow: BOWS[1], arrow: ARROWS[0], pitch: .25 });
  const fast = launchArrow({ bow: BOWS[8], arrow: ARROWS[0], pitch: .25 });
  const slowResult = stepArrow(slow, 3, stage), fastResult = stepArrow(fast, 3, stage);
  assert.equal(slowResult.type, 'hit'); assert.equal(fastResult.type, 'hit');
  assert.ok(fastResult.flightTime < slowResult.flightTime);
  assert.ok(Math.abs(fastResult.point.x) < Math.abs(slowResult.point.x));
});

test('drag trajectories and continuous collisions agree across frame sizes', () => {
  const params = { bow: BOWS[2], arrow: ARROWS[1], yaw: .1, pitch: .35, charge: .8 };
  const whole = launchArrow(params), pieces = launchArrow(params);
  stepArrow(whole, .8, { ...emptyRange, wind: -.7 }, 0);
  for (let i = 0; i < 80; i++) stepArrow(pieces, .01, { ...emptyRange, wind: -.7 }, i * .01);
  for (const axis of ['x', 'y', 'z']) { close(whole.position[axis], pieces.position[axis]); close(whole.velocity[axis], pieces.velocity[axis]); }
  for (const stage of [
    { ...emptyRange, wind: -.7 },
    { ...emptyRange, wind: -.7, obstacles: [{ x: 0, z: 10, width: 20, height: 15, depth: .02 }] },
    { ...STAGES[5], radius: 50, obstacles: [] }
  ]) {
    const big = launchArrow(params), small = launchArrow(params);
    const result = stepArrow(big, 8, stage, 1.2);
    let elapsed = 0;
    while (small.active && elapsed < 8) { stepArrow(small, .01, stage, 1.2 + elapsed); elapsed += .01; }
    assert.equal(result.type, small.result.type);
    close(result.flightTime, small.result.flightTime);
    for (const axis of ['x', 'y', 'z']) close(result.point[axis], small.result.point[axis]);
    if (result.type === 'hit') {
      const target = targetAt(stage, 1.2 + result.flightTime);
      close(result.targetCenter.x, target.x); close(result.targetCenter.y, target.y);
    }
  }
});

test('seeded sway is continuous, irregular, bounded and reduced by upgraded bows', () => {
  const basic = createSway(), advanced = createSway();
  const randomA = seed(621), randomB = seed(621);
  let rmsA = 0, rmsB = 0, previousX = 0;
  for (let frame = 0; frame < 1200; frame++) {
    stepSway(basic, 1 / 60, BOWS[0], 0, randomA);
    stepSway(advanced, 1 / 60, BOWS[3], 0, randomB);
    assert.ok(Math.abs(basic.x) <= BOWS[0].sway * 1.15 + 1e-8);
    assert.ok(Math.abs(basic.x - previousX) < 0.02, 'reticle should not teleport');
    rmsA += basic.x ** 2 + basic.y ** 2;
    rmsB += advanced.x ** 2 + advanced.y ** 2;
    previousX = basic.x;
  }
  assert.ok(rmsA > 0.25);
  close(Math.sqrt(rmsB / rmsA), BOWS[3].sway / BOWS[0].sway, 1e-8);
});

test('fifty stages mix near rabbits, distant deer, pillars, solid walls and people gaps', () => {
  assert.deepEqual(STAGES.map(stage => stage.id), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.equal(new Set(STAGES.map(stage => stage.name)).size, 50);
  assert.ok(STAGES.filter(stage => stage.kind === 'rabbit').every(stage => stage.distance >= 22 && stage.distance <= 34));
  assert.ok(STAGES.filter(stage => stage.kind === 'deer').every(stage => stage.distance >= 50 && stage.distance <= 80));
  const types = new Set(STAGES.flatMap(stage => stage.obstacles.map(obstacle => obstacle.type)));
  assert.deepEqual([...types].sort(), ['pillar', 'stone', 'timber']);
  const pillars = STAGES.filter(stage => stage.obstacles.some(obstacle => obstacle.type === 'pillar'));
  assert.equal(pillars.length, 15);
  for (const stage of pillars) {
    assert.equal(stage.kind, 'target'); assert.ok(stage.motion.irregular);
    assert.ok(stage.obstacles.length >= 3 && stage.obstacles.length <= 5);
    assert.ok(stage.obstacles.every(obstacle => obstacle.type === 'pillar'));
    for (let i = 1; i < stage.obstacles.length; i++) {
      const left = stage.obstacles[i - 1], right = stage.obstacles[i];
      assert.ok(right.x - right.width / 2 > left.x + left.width / 2 + 1, 'columns have physical open gaps');
    }
  }
  const people = STAGES.filter(stage => stage.passers.length);
  assert.deepEqual(people.map(stage => stage.id), [17, 25, 33, 41, 49]);
  assert.ok(people.every(stage => stage.kind === 'target' && stage.distance >= 55 && stage.distance <= 90));
  assert.equal(STAGES[49].distance, 104); assert.equal(STAGES[49].wind, 4);
});

test('wall layouts reroll reproducibly without drift and solid walls fully conceal the target', () => {
  const wallTargets = STAGES.filter(stage => stage.kind === 'target' && stage.obstacles.length);
  for (const template of wallTargets) {
    const slots = new Set();
    for (let seedValue = 0; seedValue < 24; seedValue++) {
      const stage = prepareStage(template, seedValue); slots.add(stage.wallLayout);
      assert.deepEqual(stage, prepareStage(prepareStage(template, seedValue + 1), seedValue), 'retry layout must not accumulate old offsets');
      const cover = stage.obstacles[0];
      if (cover.type === 'pillar') continue;
      for (let time = 0; time < 24; time += .5) {
        const target = targetAt(stage, time), ratio = cover.z / target.z;
        assert.ok((target.x - target.rx) * ratio >= cover.x - cover.width / 2 - 1e-8);
        assert.ok((target.x + target.rx) * ratio <= cover.x + cover.width / 2 + 1e-8);
        assert.ok(PLAYER.y + (target.y + target.ry - PLAYER.y) * ratio <= cover.height + 1e-8, 'normal view must not reveal the top of a hidden target');
      }
    }
    assert.deepEqual([...slots].sort(), ['center', 'left', 'right']);
  }
  const pillar = STAGES.find(stage => stage.obstacles[0]?.type === 'pillar');
  const positions = Array.from({ length: 24 }, (_, value) => prepareStage(pillar, value).targetX);
  assert.ok(Math.max(...positions) - Math.min(...positions) > 2, 'pillar layouts use the whole group width, not the first column');
});

test('round targets change pace smoothly and reproducibly between pillar gaps', () => {
  const stage = prepareStage(STAGES[4], 1234), repeated = prepareStage(STAGES[4], 1234), different = prepareStage(STAGES[4], 9876);
  let differentPositions = 0, previous = targetAt(stage, 0), previousCrossing = null;
  const periods = [];
  for (let time = .01; time <= 60; time += .01) {
    const current = targetAt(stage, time);
    assert.deepEqual(current, targetAt(repeated, time));
    if (Math.abs(current.x - targetAt(different, time).x) > .1) differentPositions++;
    assert.ok(Math.abs(current.x - previous.x) < .08, 'irregular speed must not teleport the target');
    if (previous.x <= 0 && current.x > 0) {
      const crossingTime = time - .01 + .01 * -previous.x / (current.x - previous.x);
      if (previousCrossing !== null) periods.push(crossingTime - previousCrossing);
      previousCrossing = crossingTime;
    }
    previous = current;
  }
  assert.ok(differentPositions > 100);
  assert.ok(periods.length >= 4 && Math.max(...periods) > Math.min(...periods) * 1.05, 'round trips must not repeat at a fixed uniform pace');
  for (const template of STAGES.filter(stage => stage.obstacles[0]?.type === 'pillar')) {
    const stage = prepareStage(template, 12);
    let hidden = false, revealed = false;
    for (let time = 0; time < 32 && !(hidden && revealed); time += .02) {
      const target = targetAt(stage, time);
      const cover = stage.obstacles.map(obstacle => {
        const ratio = obstacle.z / target.z;
        return { obstacle, left: (target.x - target.rx) * ratio, right: (target.x + target.rx) * ratio,
          top: PLAYER.y + (target.y + target.ry - PLAYER.y) * ratio };
      });
      hidden ||= cover.some(({ obstacle, left, right, top }) => left >= obstacle.x - obstacle.width / 2 && right <= obstacle.x + obstacle.width / 2 && top <= obstacle.height);
      revealed ||= cover.every(({ obstacle, left, right }) => right < obstacle.x - obstacle.width / 2 || left > obstacle.x + obstacle.width / 2);
    }
    assert.ok(hidden && revealed, `stage ${stage.id} must fully hide and reveal its moving target`);
  }
});

test('pillar gaps let arrows pass while the adjoining column stops the same low shot', () => {
  const stage = { ...emptyRange, obstacles: STAGES.find(stage => stage.obstacles[0]?.type === 'pillar').obstacles };
  const left = stage.obstacles[0], right = stage.obstacles[1], time = left.z / 200;
  const gapX = (left.x + left.width / 2 + right.x - right.width / 2) / 2;
  for (const [x, expected] of [[gapX, null], [right.x, 'obstacle']]) {
    const shot = launchArrow({ arrow: dragFree });
    shot.position.y = 1.5; shot.velocity = { x: x / time, y: 0, z: 200 };
    const result = stepArrow(shot, time + .01, stage);
    assert.equal(result?.type ?? null, expected);
    if (result) close(result.point.z, right.z - right.depth / 2);
  }
});

test('passing people are seeded offscreen arrivals with independent directions and walking speeds', () => {
  const base = STAGES[16], config = { ...base.passers[0], phase: 0 }, directions = new Set(), speeds = new Set();
  for (let seedValue = 0; seedValue < 20; seedValue++) {
    const stage = prepareStage({ ...base, passers: [config] }, seedValue);
    for (let pass = 0; pass < 3; pass++) {
      const time = config.passDuration * pass, person = passersAt(stage, time)[0];
      directions.add(person.direction); speeds.add(person.speed.toFixed(3));
      assert.equal(person.passId, pass); assert.equal(person.type, 'person'); assert.equal(person.y, 0);
      assert.deepEqual(person, passersAt(stage, time)[0]);
      const next = passersAt(stage, time + .1)[0];
      close(next.x - person.x, person.velocityX * .1);
      assert.ok(Math.abs(person.x) > person.z * 1.2 + person.width, 'each new person starts outside the wide normal view');
      assert.ok(person.z < stage.distance && person.height > 0);
    }
  }
  assert.deepEqual([...directions].sort(), [-1, 1]); assert.ok(speeds.size > 10);
});

test('continuous moving-person collision catches thin blockers and is independent of timestep', () => {
  for (const boundary of [false, true]) for (const bow of [BOWS[0], BOWS[24]]) {
    const stage = { ...emptyRange, distance: 30, radius: 100, wind: .4, encounterSeed: 777,
      passers: [{ id: 9, z: 20, width: .02, height: 3, depth: .02, passDuration: 2, phase: 0 }] };
    const worldTime = boundary ? 1.8 : .4, impactTime = .4;
    const person = passersAt(stage, worldTime + impactTime)[0];
    if (boundary) assert.equal(person.passId, 1);
    const makeShot = () => {
      const shot = launchArrow({ bow }), k = shot.dragRate;
      const b = -Math.expm1(-k * impactTime) / k, c = (impactTime - b) / k;
      shot.velocity = { x: (person.x - stage.wind * WIND_RESPONSE * shot.windFactor * c) / b,
        y: (1.3 - PLAYER.y + GRAVITY * c) / b, z: person.z / b };
      return shot;
    };
    const whole = makeShot(), pieces = makeShot();
    const result = stepArrow(whole, 1, stage, worldTime);
    let elapsed = 0;
    while (pieces.active && elapsed < 1) { stepArrow(pieces, .001, stage, worldTime + elapsed); elapsed += .001; }
    assert.equal(result.type, 'person'); assert.equal(result.score, 0); assert.equal(result.zone, '사람이 가로막았어요');
    assert.equal(result.personId, 9); assert.equal(result.passId, person.passId);
    assert.equal(pieces.result.type, 'person'); close(result.flightTime, pieces.result.flightTime);
    for (const axis of ['x', 'y', 'z']) close(result.point[axis], pieces.result.point[axis]);
    const unblocked = makeShot();
    assert.equal(stepArrow(unblocked, 1, { ...stage, passers: [] }, worldTime).type, 'hit', 'the same shot reaches the distant target after a clear gap');
  }
});

test('all fifty stages remain reachable across representative seeded layouts with normal aiming limits', () => {
  for (const seedValue of [0, 5, 19, 0xfffffffe]) for (const template of STAGES) {
    const stage = prepareStage(template, seedValue);
    let feasible = false;
    for (const time of [2, 3.5, 1, 4.5, 0, 5.5]) {
      for (const arrow of [ARROWS[11], ARROWS[3]]) {
        for (let charge = 1; charge >= .4; charge -= .08) {
          const params = centeredAim(stage, charge, BOWS[3], arrow, time);
          if (!params || params.pitch < -.15 || params.pitch > .55 || Math.abs(params.yaw) > .38) continue;
          const result = predictTrajectory(params, stage, time).result;
          if (result?.type === 'hit' && result.score === 10) { feasible = true; break; }
        }
        if (feasible) break;
      }
      if (feasible) break;
    }
    assert.ok(feasible, `stage ${stage.id}, seed ${seedValue} must be reachable within normal aim controls`);
  }
});

test('every stage has a reachable bullseye with both basic and upgraded arrows', () => {
  assert.equal(STAGES.length, 50);
  for (const arrow of ARROWS) for (const stage of STAGES) {
    let feasible = null;
    for (const bow of [BOWS[0], BOWS[2], BOWS[3]]) {
      for (let charge = 1; charge >= 0.4; charge -= 0.04) {
        const params = centeredAim(stage, charge, bow, arrow, 2.0);
        if (!params || params.pitch > 0.55 || params.pitch < -0.15 || Math.abs(params.yaw) > .38) continue;
        const result = predictTrajectory(params, stage, 2.0).result;
        if (result?.type === 'hit' && result.score === 10) { feasible = { charge, pitch: params.pitch, bow: bow.id }; break; }
      }
      if (feasible) break;
    }
    assert.ok(feasible, `Stage ${stage.id} must have a reachable target with ${arrow.name}`);
  }
});
