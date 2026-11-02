import test from 'node:test';
import assert from 'node:assert/strict';
import {BOWS, ARROWS, STAGES, PLAYER, GRAVITY, WIND_RESPONSE, launchArrow, launchVolley, stepArrow, targetAt, passersAt} from '../games/forest-archer/engine.mjs';
import {evaluateCoachShot} from '../games/forest-archer/coach.mjs';

const timing = {held: 2, steadyStart: 5, steadyDuration: .5};
const clone = value => JSON.parse(JSON.stringify(value));
const moving = {id: 5, kind: 'target', distance: 30, radius: 1.2, height: 2.3, wind: 0,
  motion: {amplitudeX: 4, amplitudeY: 0, speed: .7, irregular: false}, obstacles: [], passers: []};

// Independent damped-trajectory interception for deterministic ordinary-arrow
// fixtures. It aims at the target's future position, with gravity and crosswind.
function centreAim(stage, worldTime = 0, bow = 0, arrow = 0) {
  const probe = launchArrow({bow, arrow, charge: 1}), drag = probe.dragRate;
  const velocity = time => {
    const target = targetAt(stage, worldTime + time), a = drag ? -Math.expm1(-drag * time) / drag : time;
    const b = drag ? (time - a) / drag : time * time / 2;
    return {x: (target.x - PLAYER.x - stage.wind * WIND_RESPONSE * probe.windFactor * b) / a,
      y: (target.y - PLAYER.y + GRAVITY * b) / a, z: (target.z - PLAYER.z) / a};
  };
  let lo = .001, hi = 3;
  assert.ok(Math.hypot(...Object.values(velocity(hi))) < probe.speed);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (Math.hypot(...Object.values(velocity(mid))) > probe.speed) lo = mid;else hi = mid;
  }
  const v = velocity((lo + hi) / 2);
  return {bow, arrow, charge: 1, yaw: Math.atan2(v.x, v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z))};
}

test('a stable centre shot earns a cue without changing the supplied aim, stage or equipment', () => {
  const stage = clone(STAGES[0]), params = centreAim(stage), before = clone({stage, params, timing});
  const answer = evaluateCoachShot(params, stage, 0, timing);
  assert.equal(answer.ready, true);assert.equal(answer.nowScore, 10);assert.equal(answer.laterScore, 10);
  assert.equal(answer.probes, 2);assert.equal(answer.reactionDelay, .1);
  assert.deepEqual({stage, params, timing}, before);
  const miss = evaluateCoachShot({...params, yaw: .4}, stage, 0, timing);
  assert.equal(miss.ready, false);assert.equal(miss.nowScore, 0);
});

test('the cue accounts for the moving target at arrival and rejects a hit that vanishes during reaction time', () => {
  const aimed = centreAim(moving), answer = evaluateCoachShot(aimed, moving, 0, timing);
  assert.equal(answer.ready, true);assert.equal(answer.nowScore, 10);assert.ok(answer.laterScore >= 8);
  const aimedAtCurrentPosition = {...aimed, yaw: Math.atan2(targetAt(moving, 0).x, moving.distance)};
  assert.equal(evaluateCoachShot(aimedAtCurrentPosition, moving, 0, timing).ready, false);
  const fast = {...moving, distance: 20, radius: .2, motion: {...moving.motion, speed: 1.5}};
  const fleeting = evaluateCoachShot(centreAim(fast), fast, 0, timing);
  assert.equal(fleeting.nowScore, 10);assert.equal(fleeting.ready, false);assert.equal(fleeting.laterScore, 0);
  const animal = {...moving, kind: 'rabbit', passDuration: 3, encounterSeed: 22};
  const changedPass = evaluateCoachShot(aimed, animal, 2.95, timing);
  assert.equal(changedPass.ready, false);assert.equal(changedPass.reason, 'target-change');
});

test('crosswind compensation can earn a cue while a real wall still blocks the same central aim', () => {
  const windy = {...STAGES[3], wind: 8};
  const compensated = evaluateCoachShot(centreAim(windy), windy, 0, timing);
  assert.equal(compensated.ready, true);
  assert.equal(evaluateCoachShot(centreAim({...windy, wind: 0}), windy, 0, timing).ready, false);
  const stage = {...STAGES[0], obstacles: [{x: 0, z: 5, width: 20, height: 10, depth: .1}]};
  const blocked = evaluateCoachShot(centreAim(stage), stage, 0, timing);
  assert.equal(blocked.ready, false);assert.equal(blocked.reason, 'obstacle');
});

test('release limits and transitions into or out of steadiness cannot give a misleading cue', () => {
  const stage = STAGES[0], params = centreAim(stage);
  for (const options of [{held: .1}, {held: 9.95}, {held: 1.45, steadyStart: 1.5, steadyDuration: .5}, {held: 1.95, steadyStart: 1.5, steadyDuration: .5}]) {
    const answer = evaluateCoachShot(params, stage, 0, options);
    assert.equal(answer.ready, false);assert.equal(answer.probes, 0);
  }
  const steady = evaluateCoachShot(params, stage, 0, {held: 1.6, steadyStart: 1.5, steadyDuration: .5});
  assert.equal(steady.ready, true);assert.equal(steady.steady, true);
  assert.equal(evaluateCoachShot({...params, charge: 0}, stage, 0, timing).ready, false);
  assert.equal(evaluateCoachShot({...params, yaw: NaN}, stage, 0, timing).ready, false);
});

test('genuine elastic and magnetic trajectories inform the cue instead of ordinary-arrow approximations', () => {
  const low = {id: 1, kind: 'target', distance: 30, radius: .55, height: .5, wind: 0, motion: {}, obstacles: [], passers: []};
  const bouncing = {bow: 0, arrow: 12, charge: 1, yaw: 0, pitch: -.0445};
  const actual = launchArrow(bouncing);stepArrow(actual, 8, low);
  assert.equal(actual.bounceCount, 1);assert.equal(actual.result.score, 10);
  assert.equal(evaluateCoachShot(bouncing, low, 0, timing).ready, true);
  const withoutBounce = {...bouncing, arrow: {...ARROWS[12], ability: null}};
  assert.equal(evaluateCoachShot(withoutBounce, low, 0, timing).ready, false);
  const magnetic = centreAim(STAGES[1], 0, 0, 13);
  assert.equal(evaluateCoachShot(magnetic, STAGES[1], 0, timing).ready, true);
  const distantPillars = STAGES.find(stage => stage.coverageMode === 'pillars' && stage.distance === 50);
  const hiddenMoving = STAGES.find(stage => stage.visibleFraction === 0 && stage.motion.speed && stage.distance === 50);
  assert.ok(distantPillars && hiddenMoving, 'the forecast still exercises distant pillars and a fully hidden moving target');
  for (const stage of [{...STAGES[3], wind: 3}, distantPillars, hiddenMoving]) {
    const params = centreAim(stage, 1.3, 0, 13), actual = launchArrow(params);
    stepArrow(actual, 8, stage, 1.3);
    const predicted = evaluateCoachShot(params, stage, 1.3, timing);
    assert.equal(predicted.nowScore, actual.result?.type === 'hit' ? actual.result.score : 0,
      'a fast prediction of the distant unguided prefix must retain the full magnetic trajectory and swept obstruction result');
  }
  const narrow = {...low, radius: .1}, partialParams = {bow: 0, arrow: 12, charge: .4, yaw: 0, pitch: .094};
  const partialShot = launchArrow(partialParams);stepArrow(partialShot, 8, narrow);
  assert.equal(partialShot.bounceCount, 1);assert.equal(partialShot.result.score, 10);
  const partial = evaluateCoachShot(partialParams, narrow, 0, {...timing, held: .4 * 1.25});
  assert.equal(partial.nowScore, 10);assert.equal(partial.laterScore, 0);
  assert.equal(partial.ready, false, 'a further tenth-second draw changes this narrow bounce opportunity');
});

test('rare burst guidance retains a central hit when only its additional arrows strike the wall', () => {
  const stage = {...STAGES[1], radius: 3, obstacles: [
    {x: -2.03, z: 12, width: 4, height: 10, depth: .2}, {x: 2.03, z: 12, width: 4, height: 10, depth: .2}
  ]};
  const params = {...centreAim(stage, 0, 15), burstSeed: 2468};
  assert.equal(evaluateCoachShot({...params, bow: {...BOWS[15], burstCount: 1}}, stage, 0, timing).ready, true);
  const results = launchVolley(params).map(shot => stepArrow(shot, 8, stage, shot.launchDelay));
  assert.deepEqual(results.map(result => [result.type, result.score]), [['hit', 10], ['obstacle', 0], ['obstacle', 0]],
    'the real centered first arrow keeps its score when the two added arrows hit masonry');
  const burst = evaluateCoachShot(params, stage, 0, timing);
  assert.equal(burst.ready, true);assert.equal(burst.nowScore, 10);assert.equal(burst.laterScore, 10);assert.equal(burst.probes, 2);
  const open = {...stage, obstacles: []};
  const clearBurst = evaluateCoachShot(centreAim(open, 0, 19), open, 0, timing);
  assert.equal(clearBurst.ready, true);assert.ok(clearBurst.probes <= 6);
});

test('rare burst coaching checks the actual seeded side arrows before allowing a shot past people', () => {
  const stage = {...STAGES[1], radius: 3, obstacles: [], passers: []};
  const params = {...centreAim(stage, 0, 15), burstSeed: 2468};
  const side = launchVolley(params)[1], z = 12;
  const flightTime = -Math.log1p(-side.dragRate * z / side.velocity.z) / side.dragRate;
  const sideX = side.velocity.x * -Math.expm1(-side.dragRate * flightTime) / side.dragRate;
  const config = {id: 0, z, width: .04, height: 10, depth: .1, passDuration: 1e6, phase: .5};
  const person = passersAt({...stage, passers: [config]}, side.launchDelay + flightTime)[0];
  const phaseAt = x => config.phase + (x - person.x) / (person.velocityX * config.passDuration);
  const blocked = {...stage, passers: [{...config, phase: phaseAt(sideX)}]};
  const results = launchVolley(params).map(shot => stepArrow(shot, 8, blocked, shot.launchDelay));
  assert.deepEqual(results.map(result => [result.type, result.score]), [['hit', 10], ['person', 0], ['hit', 10]],
    'a real side-arrow person collision cancels a volley whose central arrow is perfect');
  const answer = evaluateCoachShot(params, blocked, 0, timing);
  assert.equal(answer.ready, false);assert.equal(answer.reason, 'person');assert.equal(answer.nowScore, 10);assert.equal(answer.laterScore, 10);
  assert.ok(answer.probes <= 6);
  const betweenRays = {...stage, passers: [{...config, phase: phaseAt(sideX / 2)}]};
  assert.ok(launchVolley(params).every(shot => stepArrow(shot, 8, betweenRays, shot.launchDelay).type === 'hit'));
  const safe = evaluateCoachShot(params, betweenRays, 0, timing);
  assert.equal(safe.ready, true);assert.equal(safe.probes, 6, 'a person between the actual rays does not suppress a valid cue');

  const movingConfig = {...config, width: .01, depth: .01, passDuration: 20, phase: .5};
  const laterPerson = passersAt({...stage, passers: [movingConfig]}, .1 + side.launchDelay + flightTime)[0];
  movingConfig.phase += (sideX - laterPerson.x) / (laterPerson.velocityX * movingConfig.passDuration);
  const laterBlocked = {...stage, passers: [movingConfig]};
  const arrivals = [0, .1].map(time => launchVolley(params).map(shot => stepArrow(shot, 8, laterBlocked, time + shot.launchDelay).type));
  assert.deepEqual(arrivals, [['hit', 'hit', 'hit'], ['hit', 'person', 'hit']],
    'the moving person intercepts only a delayed side arrow after the reaction interval');
  const later = evaluateCoachShot(params, laterBlocked, 0, timing);
  assert.equal(later.ready, false);assert.equal(later.reason, 'person');assert.equal(later.probes, 5);
});

test('event targets and all five guns are excluded from coaching', () => {
  const params = centreAim(STAGES[0]);
  for (const gun of BOWS.filter(item => item.weaponType === 'gun')) {
    const answer = evaluateCoachShot({...params, bow: gun}, STAGES[0], 0, timing);
    assert.equal(answer.ready, false);assert.equal(answer.probes, 0);
  }
  for (const kind of ['clay', 'ufo']) {
    const answer = evaluateCoachShot(params, {...STAGES[0], kind}, 0, timing);
    assert.equal(answer.ready, false);assert.equal(answer.probes, 0);
  }
});
