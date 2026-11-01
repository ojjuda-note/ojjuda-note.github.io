import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, STAGES, prepareStage, targetAt, launchArrow, stepArrow } from '../games/forest-archer/engine.mjs';

const original = id => STAGES.find(stage => stage.legacyId === id);
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('all fifty original encounters remain unique while practice precedes moving and covered challenges', () => {
  assert.equal(STAGES.length, 50);
  assert.deepEqual(STAGES.map(stage => stage.id), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.deepEqual(STAGES.map(stage => stage.legacyId).sort((a, b) => a - b), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.equal(new Set(STAGES.map(stage => stage.name)).size, 50);
  assert.deepEqual(STAGES.slice(0, 6).map(stage => stage.legacyId), [1, 2, 3, 4, 5, 10]);
  assert.ok(STAGES.slice(0, 4).every(stage => stage.kind === 'target' && !stage.motion.speed && !stage.obstacles.length && !stage.passers.length));
  assert.ok(STAGES.slice(4, 6).every(stage => stage.kind === 'target' && stage.motion.speed > 0 && !stage.obstacles.length));
  assert.ok(original(7).id > original(10).id, 'crossing animals follow the moving-target introduction');
  assert.ok(original(9).id > original(6).id && original(9).id > original(8).id, 'a hidden flying animal follows open flying and wall practice');
  assert.ok(original(11).id > original(18).id, 'the covered deer follows an open deer encounter');
  assert.ok(original(12).id > original(8).id, 'two walls and movement follow the first stationary wall');
  assert.equal(STAGES.at(-1).legacyId, 50);
});

test('difficulty, wind strength and reference goals rise together without turning distance into the only ordering rule', () => {
  assert.equal(Math.abs(STAGES[0].wind), .12);assert.equal(Math.abs(STAGES.at(-1).wind), 4);
  assert.equal(STAGES[0].goal, 16);assert.equal(STAGES.at(-1).goal, 40);
  for (const [index, stage] of STAGES.entries()) {
    const rating = stage.difficulty;
    for (const key of ['baseScore', 'score', 'angularRadius', 'movementSpeed', 'flightSeconds', 'windDriftPerUnit', 'cover', 'windStrength', 'windDrift']) {
      assert.ok(Number.isFinite(rating[key]) && rating[key] >= 0, `stage ${stage.id}: finite ${key}`);
    }
    assert.ok(rating.cover <= 1);
    assert.equal(rating.windStrength, Math.abs(stage.wind));
    assert.equal(stage.shots, 5, 'reordering never adds an equipment gate or changes the shot budget');
    assert.ok(!stage.requiredWeapon && !stage.requiredArrow);
    if (!index) continue;
    const previous = STAGES[index - 1];
    assert.ok(rating.baseScore >= previous.difficulty.baseScore);
    assert.ok(rating.score > previous.difficulty.score);
    assert.ok(Math.abs(stage.wind) > Math.abs(previous.wind));
    assert.ok(stage.goal >= previous.goal);
  }
  const distantMover = original(10), closeRunner = original(48);
  assert.ok(closeRunner.distance < distantMover.distance && closeRunner.id > distantMover.id,
    'a small, fast nearby rabbit can require more skill than a distant oscillating target');
  assert.ok(closeRunner.difficulty.components.lead > distantMover.difficulty.components.lead);
  assert.ok(original(9).distance < original(18).distance && original(9).id > original(18).id,
    'vertical cover and timing can outweigh raw distance');
  assert.ok(STAGES.some(stage => stage.wind < 0) && STAGES.some(stage => stage.wind > 0));
});

test('difficulty uses actual hit-area proportions, starter flight and the real one-pass animal speed', () => {
  for (const template of STAGES) {
    const stage = prepareStage(template, 17), center = targetAt(stage, 0), rating = stage.difficulty;
    close(rating.angularRadius, Math.atan2(Math.sqrt(center.rx * center.ry), stage.distance));
    // Raising the test launch avoids the ground while measuring its horizontal
    // flight. The real engine independently supplies drag and wind acceleration.
    const shot = launchArrow({ charge: 1, velocityBias: 0 });shot.position.y = 1000;
    stepArrow(shot, rating.flightSeconds, { distance: 10000, radius: 1, height: 1000, kind: 'target', motion: {}, wind: 1, obstacles: [], passers: [] });
    close(shot.position.z, stage.distance);close(shot.position.x, rating.windDriftPerUnit);
    if (!['rabbit', 'deer', 'bird'].includes(stage.kind)) continue;
    const first = targetAt(stage, 0, 0), last = targetAt(stage, first.passDuration, 0);
    close(Math.abs(last.x - first.x) / first.passDuration, rating.movementSpeed,
      1e-7);
  }
});

test('reordering preserves animal pass timing and progressively harder unoccluded encounters', () => {
  const defaults = { bird: 8, rabbit: 7, deer: 10 }, reductions = { bird: 2.2, rabbit: 1.6, deer: 3 };
  for (const stage of STAGES.filter(stage => Object.hasOwn(defaults, stage.kind))) {
    const before = stage.legacyId;
    const expected = before === 9 ? 12 : before <= 12 ? defaults[stage.kind] : defaults[stage.kind] - (before - 12) / 38 * reductions[stage.kind];
    close(targetAt(stage, 0).passDuration, expected);
    assert.ok(stage.kind !== 'rabbit' || stage.distance <= 34);
    assert.ok(stage.kind !== 'deer' || stage.distance >= 50);
  }
  for (const kind of ['rabbit', 'deer', 'bird']) {
    const stages = STAGES.filter(stage => stage.kind === kind && !stage.obstacles.length);
    for (let index = 1; index < stages.length; index++) {
      const before = stages[index - 1], after = stages[index];
      assert.ok(after.distance >= before.distance);
      assert.ok(after.difficulty.angularRadius < before.difficulty.angularRadius);
      assert.ok(targetAt(after, 0).passDuration < targetAt(before, 0).passDuration);
    }
  }
});

test('cover progression keeps three, four and five pillars and increases the people challenge', () => {
  const pillars = STAGES.filter(stage => stage.difficulty.pillars), groups = [];
  assert.equal(pillars.length, 15);
  for (const stage of pillars) {
    const count = stage.obstacles.filter(obstacle => obstacle.type === 'pillar').length;
    assert.equal(stage.difficulty.pillars, count);
    assert.ok(stage.difficulty.cover > 0 && stage.difficulty.cover < 1, 'pillar gaps alternate available and hidden aiming space');
    if (groups.at(-1) !== count) groups.push(count);
  }
  assert.deepEqual(groups, [3, 4, 5], 'later pillar encounters never fall back to an easier group');
  const people = STAGES.filter(stage => stage.passers.length);
  assert.deepEqual(people.map(stage => stage.legacyId), [17, 25, 33, 41, 49]);
  assert.ok(people[0].id > pillars[0].id, 'moving blockers follow the introduction to solid cover');
  for (let index = 1; index < people.length; index++) {
    assert.ok(people[index].distance > people[index - 1].distance);
    assert.ok(people[index].passers.length >= people[index - 1].passers.length);
    assert.ok(people[index].difficulty.angularRadius < people[index - 1].difficulty.angularRadius);
  }
  assert.equal(original(8).difficulty.cover, 1);assert.equal(original(12).difficulty.cover, 1);
});

test('the original wall-bird encounter still hides and reveals its bird after moving to a later slot', () => {
  const template = original(9);
  assert.ok(template.id > 9);assert.equal(template.kind, 'bird');assert.equal(template.passDuration, 12);
  assert.equal(template.motion.amplitudeY, 3.6);assert.equal(template.obstacles[0].width, 24);
  assert.ok(template.difficulty.cover > 0 && template.difficulty.cover < 1);
  for (const seed of [0, 5, 19]) {
    const stage = prepareStage(template, seed), cover = stage.obstacles[0];
    let hidden = false, revealed = false;
    for (let time = 0; time < 36 && !(hidden && revealed); time += .025) {
      const target = targetAt(stage, time), ratio = cover.z / target.z;
      if (Math.abs(target.x / target.z) > .38) continue;
      const withinWall = (target.x - target.rx) * ratio >= cover.x - cover.width / 2 &&
        (target.x + target.rx) * ratio <= cover.x + cover.width / 2;
      hidden ||= withinWall && PLAYER.y + (target.y + target.ry - PLAYER.y) * ratio <= cover.height;
      revealed ||= PLAYER.y + (target.y - target.ry - PLAYER.y) * ratio > cover.height;
    }
    assert.ok(hidden && revealed, `seed ${seed}: the bird must offer visible and concealed moments`);
  }
});
