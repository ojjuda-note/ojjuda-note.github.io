import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER, GRAVITY, WIND_RESPONSE, BOWS, STAGES, prepareStage, passersAt,
  retirePasser, launchArrow, stepArrow, predictTrajectory} from '../games/forest-archer/engine.mjs';
import {traceLaserPoint} from '../games/forest-archer/laser.mjs';
import {evaluateCoachShot} from '../games/forest-archer/coach.mjs';

const range = {id: 71, kind: 'target', distance: 30, radius: 100, height: 2,
  motion: {}, wind: .4, obstacles: [], passers: []};
const blocker = {id: 0, behavior: 'shuttle', z: 20, width: .12, height: 3,
  depth: .02, span: 2, passDuration: 2, phase: 0};

// Independently solve the exact damped trajectory through the selected
// person's future position, including gravity and wind. The engine then
// resolves the moving collision without a fabricated hit result.
function aimedAtPerson(stage, personId, worldTime, bow = BOWS[0]) {
  const arrival = .4, person = passersAt(stage, worldTime + arrival).find(person => person.id === personId);
  assert.ok(person, 'the reference round still contains the requested person');
  return () => {
    const shot = launchArrow({bow}), drag = shot.dragRate;
    const travel = drag ? -Math.expm1(-drag * arrival) / drag : arrival;
    const acceleration = drag ? (arrival - travel) / drag : arrival * arrival / 2;
    shot.velocity = {
      x: (person.x - PLAYER.x - stage.wind * WIND_RESPONSE * shot.windFactor * acceleration) / travel,
      y: (1.8 - PLAYER.y + GRAVITY * (shot.gravityScale ?? 1) * acceleration) / travel,
      z: (person.z - PLAYER.z) / travel
    };
    return shot;
  };
}

test('retiring one person preserves every other walker across later legs in all real person lessons', () => {
  const lessons = STAGES.filter(stage => stage.passers.length);
  assert.ok(lessons.length > 0);
  for (const template of lessons) {
    const original = structuredClone(template), stage = prepareStage(template, 19), reference = prepareStage(template, 19);
    const id = stage.passers[0].id ?? 0;
    assert.equal(retirePasser(stage, id), true);
    const moments = [0, .1, ...stage.passers.flatMap(person =>
      [person.passDuration * .5, person.passDuration, person.passDuration * 3 + .01])];
    for (const time of moments) {
      assert.deepEqual(passersAt(stage, time), passersAt(reference, time).filter(person => person.id !== id),
        `lesson ${stage.id}, time ${time}: the hit identity stays out and other walking paths are unchanged`);
    }
    assert.deepEqual(stage.passers, original.passers, 'the full round roster remains available for retry');
    assert.deepEqual(template, original, 'retirement never rewrites a catalog lesson');
    for (const person of stage.passers) retirePasser(stage, person.id ?? 0);
    assert.deepEqual(passersAt(stage, 100), [], 'a round can continue after its last blocker leaves');
  }
});

test('retirement is idempotent, accepts ID zero and ignores unknown IDs or an unprepared template', () => {
  const template = {...range, passers: [blocker, {...blocker, id: 7, centerX: 5}]};
  const original = structuredClone(template), stage = prepareStage(template, 4);
  for (const invalid of [undefined, null, -1, 99, '0', NaN, Infinity, {}]) {
    assert.equal(retirePasser(stage, invalid), false);
    assert.deepEqual(stage.retiredPasserIds, []);
  }
  assert.equal(retirePasser(template, 0), false);
  assert.equal(retirePasser(null, 0), false);
  assert.deepEqual(template, original);
  assert.equal(retirePasser(stage, 0), true);
  assert.equal(retirePasser(stage, 0), false);
  assert.deepEqual(stage.retiredPasserIds, [0]);
  assert.deepEqual(passersAt(stage).map(person => person.id), [7]);

  const {id, ...withoutExplicitId} = blocker;
  const defaultIdStage = prepareStage({...range, passers: [withoutExplicitId]}, 4);
  assert.equal(passersAt(defaultIdStage)[0].id, 0);
  assert.equal(retirePasser(defaultIdStage, 0), true);
  assert.deepEqual(passersAt(defaultIdStage), []);
});

test('a retry or fresh stage restores its complete roster without sharing retirement state', () => {
  for (const template of STAGES.filter(stage => stage.passers.length)) {
    const used = prepareStage(template, 4), independent = prepareStage(template, 4);
    for (const person of used.passers) retirePasser(used, person.id ?? 0);
    assert.deepEqual(passersAt(used), []);
    const retry = prepareStage(used, 19), fresh = prepareStage(template, 19);
    assert.deepEqual(retry, fresh, 're-preparing the current round is a complete reset');
    assert.equal(passersAt(retry).length, template.passers.length);
    assert.equal(passersAt(independent).length, template.passers.length);
    assert.notEqual(retry.retiredPasserIds, used.retiredPasserIds);
    assert.notEqual(retry.retiredPasserIds, fresh.retiredPasserIds);
    retirePasser(retry, retry.passers[0].id ?? 0);
    assert.equal(passersAt(fresh).length, template.passers.length, 'separate rounds cannot retire each other\'s people');
  }
});

test('retired people no longer collide, including later reversals and exact large or small physics steps', () => {
  for (const behavior of ['shuttle', 'crowd', undefined]) for (const bow of [BOWS[0], BOWS[20]]) {
    const stage = prepareStage({...range, passers: [{...blocker, behavior}]}, 777);
    const reference = prepareStage(stage, 777);
    for (const worldTime of [.4, 1.8, 6.4]) {
      const makeShot = aimedAtPerson(reference, 0, worldTime, bow);
      const blocked = makeShot(), expectedPerson = passersAt(reference, worldTime + .4)[0];
      const blockedResult = stepArrow(blocked, 1, reference, worldTime);
      assert.equal(blockedResult.type, 'person');assert.equal(blockedResult.personId, 0);
      assert.equal(blockedResult.passId, expectedPerson.passId);assert.equal(blockedResult.score, 0);
      assert.deepEqual(reference.retiredPasserIds, [], 'collision alone must not commit a retirement during a burst or forecast');
      retirePasser(stage, 0);
      const whole = makeShot(), pieces = makeShot(), noPeople = makeShot();
      const result = stepArrow(whole, 1, stage, worldTime);
      const expected = stepArrow(noPeople, 1, {...stage, passers: []}, worldTime);
      assert.equal(result.type, 'hit', 'the same trajectory now reaches the actual target');
      assert.deepEqual(result, expected, 'an invisible person must not remain in continuous collision');
      for (let elapsed = 0; pieces.active && elapsed < 1; elapsed += .001) {
        stepArrow(pieces, .001, stage, worldTime + elapsed);
      }
      assert.equal(pieces.result.type, 'hit');
      assert.ok(Math.abs(pieces.result.flightTime - result.flightTime) < 1e-8);
      for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(pieces.result.point[axis] - result.point[axis]) < 1e-8);
      assert.deepEqual(passersAt(stage, worldTime), []);
    }
  }
});

test('the surviving person still blocks real arrows and the laser while the retired person blocks neither', () => {
  const stage = prepareStage({...range, passers: [{...blocker, centerX: -5}, {...blocker, id: 7, centerX: 5}]}, 19);
  const reference = prepareStage(stage, 19), worldTime = .4;
  const throughFirst = aimedAtPerson(reference, 0, worldTime), throughSecond = aimedAtPerson(reference, 7, worldTime);
  assert.equal(stepArrow(throughFirst(), 1, stage, worldTime).personId, 0);
  assert.equal(stepArrow(throughSecond(), 1, stage, worldTime).personId, 7);
  const rays = passersAt(reference, worldTime).map(person => ({yaw: Math.atan2(person.x, person.z), pitch: 0, distance: stage.distance}));
  for (const ray of rays) assert.equal(traceLaserPoint({...ray, people: passersAt(stage, worldTime)}).blockedBy, 'person');

  retirePasser(stage, 0);
  assert.equal(stepArrow(throughFirst(), 1, stage, worldTime).type, 'hit');
  assert.equal(stepArrow(throughSecond(), 1, stage, worldTime).personId, 7);
  const clear = traceLaserPoint({...rays[0], people: passersAt(stage, worldTime)});
  assert.equal(clear.blocked, false);assert.equal(clear.point.z, stage.distance);
  assert.equal(traceLaserPoint({...rays[1], people: passersAt(stage, worldTime)}).blockedBy, 'person');
  retirePasser(stage, 7);
  assert.equal(stepArrow(throughSecond(), 1, stage, worldTime).type, 'hit');
  assert.equal(traceLaserPoint({...rays[1], people: passersAt(stage, worldTime)}).blocked, false);
});

test('trajectory and coach forecasts report person hits without removing anyone from the real round', () => {
  const stage = prepareStage({...range, wind: 0, passers: [{...blocker, width: 3, span: .2, passDuration: 8, phase: .5}]}, 19);
  const before = structuredClone(stage), params = {bow: 0, arrow: 0, charge: 1, velocityBias: 0, yaw: 0, pitch: .08};
  const timing = {held: 2, steadyStart: 5, steadyDuration: .5};
  for (let probe = 0; probe < 3; probe++) {
    const forecast = predictTrajectory(params, stage, 0);
    assert.equal(forecast.result.type, 'person');assert.equal(forecast.result.personId, 0);
    const coach = evaluateCoachShot(params, stage, 0, timing);
    assert.equal(coach.ready, false);assert.equal(coach.reason, 'person');
    assert.deepEqual(stage, before);
    assert.equal(passersAt(stage, 20).length, 1);
  }
  retirePasser(stage, 0);
  const after = structuredClone(stage);
  assert.equal(predictTrajectory(params, stage, 0).result.type, 'hit');
  assert.equal(evaluateCoachShot(params, stage, 0, timing).ready, true);
  assert.deepEqual(stage, after, 'later forecasts honor the committed retirement but never alter it');
});
