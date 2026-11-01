import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, GRAVITY, WIND_RESPONSE, BOWS, ARROWS, STAGES, targetAt, getSpeed, launchArrow, stepArrow, predictTrajectory, createSway, stepSway } from '../games/forest-archer/engine.mjs';
import { windLeafAt, windLeafCount } from '../games/forest-archer/scenery.mjs';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const emptyRange = { distance: 10000, radius: 1, height: 2, kind: 'target', motion: {}, wind: 0, obstacles: [] };
const seed = initial => () => { initial = (Math.imul(initial, 1664525) + 1013904223) >>> 0; return initial / 4294967296; };

function centeredAim(stage, charge, bow, arrow, worldTime = 0) {
  const speed = getSpeed({ charge, bow, arrow });
  let target = targetAt(stage, worldTime), yaw = 0, pitch = 0, flight = stage.distance / speed;
  for (let i = 0; i < 24; i++) {
    target = targetAt(stage, worldTime + flight);
    const compensatedX = target.x - stage.wind * WIND_RESPONSE * arrow.windFactor * flight * flight / 2;
    const distance = Math.hypot(compensatedX, target.z);
    const height = target.y - PLAYER.y;
    const discriminant = speed ** 4 - GRAVITY * (GRAVITY * distance * distance + 2 * height * speed * speed);
    if (discriminant < 0) return null;
    yaw = Math.atan2(compensatedX, target.z);
    pitch = Math.atan((speed * speed - Math.sqrt(discriminant)) / (GRAVITY * distance));
    flight = target.z / (speed * Math.cos(pitch) * Math.cos(yaw));
  }
  return { yaw, pitch, charge, bow, arrow, velocityBias: 0 };
}

test('gravity and wind use exact constant-acceleration trajectories', () => {
  const shot = launchArrow({ pitch: 0.35, yaw: 0.12, charge: 0.8 });
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
  const shot = launchArrow();
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
  const shot = launchArrow({ pitch: 0 });
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
  assert.ok(spread(ARROWS[3]) < spread(ARROWS[0]) / 10);
  const shot = launchArrow({ arrow: ARROWS[3], pitch: 0.3 });
  const vy = shot.velocity.y;
  stepArrow(shot, 0.2, emptyRange, 0);
  close(shot.velocity.y, vy - GRAVITY * 0.2);
});

test('stronger crosswinds reward every arrow upgrade without changing gravity or flight time', () => {
  const land = (arrow, wind) => {
    const shot = launchArrow({ arrow, pitch: 0.3, charge: 1, velocityBias: 0 });
    const result = stepArrow(shot, 4, { ...emptyRange, wind });
    assert.equal(result.type, 'ground');
    return result;
  };
  const calm = land(ARROWS[0], 0);
  const legacyBasic = land(ARROWS[0], 1.2 / WIND_RESPONSE);
  const basic = land(ARROWS[0], 1.2);
  close(basic.point.x, legacyBasic.point.x * 2.5);
  for (const direction of [-1, 1]) {
    let previousDrift = Infinity;
    for (const arrow of ARROWS) {
      const result = land(arrow, direction * 1.2);
      const drift = Math.abs(result.point.x);
      assert.equal(Math.sign(result.point.x), direction);
      assert.ok(drift > 0 && drift < previousDrift, 'each upgrade must reduce, not remove, wind drift');
      close(drift, basic.point.x * [1, 0.75, 0.50, 0.30][arrow.id]);
      close(result.flightTime, calm.flightTime);
      close(result.point.y, calm.point.y);
      close(result.point.z, calm.point.z);
      close(land(arrow, 0).point.x, 0);
      previousDrift = drift;
    }
  }
});

test('wind resistance visibly changes the outcome of the same uncompensated long shot', () => {
  const stage = STAGES[9];
  const params = centeredAim({ ...stage, wind: 0 }, 1, BOWS[0], ARROWS[0]);
  const crossingTime = stage.distance / (BOWS[0].speed * Math.cos(params.pitch));
  const basic = launchArrow(params);
  const silver = launchArrow({ ...params, arrow: ARROWS[3] });
  assert.equal(stepArrow(basic, crossingTime, stage), null);
  assert.ok(basic.targetPassed && Math.abs(basic.position.x) > stage.radius, 'wood arrow drifts past the side of the target');
  const result = stepArrow(silver, crossingTime, stage);
  assert.equal(result.type, 'hit', 'silver arrow stays within the target at the same aim');
  close(result.point.x, basic.position.x * 0.30);
});

test('every bow has exactly two thirds of its previous sway throughout the draw', () => {
  const oldAmplitudes = [0.075, 0.050, 0.032, 0.017];
  for (const bow of BOWS) {
    const current = createSway(), previous = createSway();
    const currentRandom = seed(144 + bow.id), previousRandom = seed(144 + bow.id);
    for (let frame = 0; frame < 600; frame++) {
      const held = frame / 60;
      stepSway(current, 1 / 60, bow, held, currentRandom);
      stepSway(previous, 1 / 60, { ...bow, sway: oldAmplitudes[bow.id] }, held, previousRandom);
      for (const component of ['x', 'y', 'vx', 'vy']) close(current[component], previous[component] * 2 / 3);
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

test('every stage has a reachable bullseye with both basic and upgraded arrows', () => {
  assert.equal(STAGES.length, 12);
  for (const arrow of [ARROWS[0], ARROWS[2], ARROWS[3]]) for (const stage of STAGES) {
    let feasible = null;
    for (const bow of [BOWS[0], BOWS[2], BOWS[3]]) {
      for (let charge = 1; charge >= 0.4; charge -= 0.04) {
        const params = centeredAim(stage, charge, bow, arrow, 2.0);
        if (!params || params.pitch > 0.55 || params.pitch < -0.15) continue;
        const result = predictTrajectory(params, stage, 2.0).result;
        if (result?.type === 'hit' && result.score === 10) { feasible = { charge, pitch: params.pitch, bow: bow.id }; break; }
      }
      if (feasible) break;
    }
    assert.ok(feasible, `Stage ${stage.id} must have a reachable target with ${arrow.name}`);
  }
});
