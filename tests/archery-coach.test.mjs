import test from 'node:test';
import assert from 'node:assert/strict';
import {BOWS, ARROWS, BULLETS, STAGES, PLAYER, GRAVITY, BULLET_GRAVITY_SCALE, WIND_RESPONSE, launchArrow, launchVolley, stepArrow, getFlightTimeLimit, targetAt, passersAt} from '../games/forest-archer/engine.mjs';
import {evaluateCoachShot} from '../games/forest-archer/coach.mjs';

const timing = {held: 2, steadyStart: 5, steadyDuration: .5};
const clone = value => JSON.parse(JSON.stringify(value));
const moving = {id: 5, kind: 'target', distance: 30, radius: 1.2, height: 2.3, wind: 0,
  motion: {amplitudeX: 4, amplitudeY: 0, speed: .7, irregular: false}, obstacles: [], passers: []};

// Independent damped-trajectory interception for deterministic arrow and bullet
// fixtures. It aims at the target's future position, with gravity and crosswind.
function centreAim(stage, worldTime = 0, bow = 0, arrow = 0, bullet = 0) {
  const probe = launchArrow({bow, arrow, bullet, charge: 1}), drag = probe.dragRate;
  const velocity = time => {
    const target = targetAt(stage, worldTime + time), a = drag ? -Math.expm1(-drag * time) / drag : time;
    const b = drag ? (time - a) / drag : time * time / 2;
    return {x: (target.x - PLAYER.x - stage.wind * WIND_RESPONSE * probe.windFactor * b) / a,
      y: (target.y - PLAYER.y + GRAVITY * (probe.gravityScale ?? 1) * b) / a, z: (target.z - PLAYER.z) / a};
  };
  let lo = .001, hi = 3;
  assert.ok(Math.hypot(...Object.values(velocity(hi))) < probe.speed);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (Math.hypot(...Object.values(velocity(mid))) > probe.speed) lo = mid;else hi = mid;
  }
  const v = velocity((lo + hi) / 2);
  return {bow, arrow, bullet, charge: 1, yaw: Math.atan2(v.x, v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z))};
}

// Independent, piecewise closed-form flight through wide, stationary walls.
// This solves the new aim without querying the coach or engine collision path.
function coveredFlight(params, stage, end = stage.distance) {
  const initial = launchArrow(params);
  let point = {...PLAYER}, velocity = {...initial.velocity}, drag = initial.dragRate;
  let gravity = GRAVITY * initial.gravityScale, elapsed = 0, speedRatio = 1, dropRatio = 1;
  const planes = stage.obstacles.map(wall => ({z: wall.z - wall.depth / 2, material: wall.material}))
    .filter(wall => wall.z < end).sort((a, b) => a.z - b.z);
  for (const plane of [...planes, {z: end}]) {
    const dz = plane.z - point.z, dt = drag ? -Math.log1p(-drag * dz / velocity.z) / drag : dz / velocity.z;
    const decay = Math.exp(-drag * dt), a = drag ? -Math.expm1(-drag * dt) / drag : dt;
    const b = drag ? (dt - a) / drag : dt * dt / 2;
    point = {x: point.x + velocity.x * a, y: point.y + velocity.y * a - gravity * b, z: plane.z};
    velocity = {x: velocity.x * decay, y: velocity.y * decay - gravity * a, z: velocity.z * decay};
    elapsed += dt;
    if (plane.material) {
      const retention = plane.material === 'wood' ? .8 : .5, drop = plane.material === 'wood' ? 1.2 : 1.5;
      velocity = Object.fromEntries(Object.entries(velocity).map(([axis, value]) => [axis, value * retention]));
      drag *= retention;speedRatio *= retention;dropRatio *= drop;
      gravity = initial.gravityScale === 0
        ? GRAVITY * BULLET_GRAVITY_SCALE * 9 * speedRatio**2 * (dropRatio-1)
        : gravity * retention * retention * drop;
    }
  }
  return {point, elapsed};
}

function coveredAim(stage, bullet = 0) {
  const params = {bow: 22, bullet, arrow: 13, charge: 0, yaw: 0}, target = targetAt(stage, 0);
  let lo = -.05, hi = .4;
  for (let i = 0; i < 60; i++) {
    const pitch = (lo + hi) / 2;
    if (coveredFlight({...params, pitch}, stage).point.y < target.y) lo = pitch;else hi = pitch;
  }
  return {...params, pitch: (lo + hi) / 2};
}

const coveredStage = materials => ({...clone(STAGES[0]), distance: 150, height: 2.3, radius: .06, wind: 0,
  motion: {}, passers: [], retiredPasserIds: [], obstacles: materials.map((material, index) => ({
    x: 0, z: 25 + index * 45 + .4, width: 30, height: 30, depth: .8, material,
    type: material === 'wood' ? 'timber' : 'stone'
  }))});

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
  const hiddenMoving = STAGES.find(stage => stage.lessonKey === 'hidden-tracking' && stage.distance === 80);
  assert.ok(distantPillars && hiddenMoving, 'the forecast still exercises distant pillars and a fully hidden moving target');
  for (const stage of [{...STAGES[3], wind: 3}, distantPillars, hiddenMoving]) {
    const params = centreAim(stage, 1.3, 0, 13), actual = launchArrow(params);
    stepArrow(actual, 8, stage, 1.3);
    const predicted = evaluateCoachShot(params, stage, 1.3, timing);
    assert.equal(predicted.nowScore, actual.result?.type === 'hit' ? actual.result.score : 0,
      'a fast prediction of the distant unguided prefix must retain the full magnetic trajectory and swept obstruction result');
  }
  const narrow = {...low, radius: .1}, partialParams = {bow: 0, arrow: 12, charge: .4, yaw: 0, pitch: .06034};
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

test('the main gun earns an accurate cue at 10, 50 and 150 metres without charge or arrow dependencies', () => {
  const gun = BOWS.find(item => item.weaponType === 'gun');
  for (const distance of [10, 50, 150]) {
    const stage = {...clone(STAGES[0]), distance};
    const aimed = centreAim(stage, 0, gun.id);
    for (const [charge, arrow] of [[0, 0], [.2, 12], [1, 13]]) {
      const params = {...aimed, bow: charge ? gun : gun.id, charge, arrow};
      const before = clone({stage, params, timing}), actual = launchArrow(params);
      assert.equal(actual.projectileType, 'bullet');
      stepArrow(actual, getFlightTimeLimit(actual), stage);
      assert.equal(actual.result.type, 'hit');assert.equal(actual.result.score, 10);
      const answer = evaluateCoachShot(params, stage, 0, timing);
      assert.equal(answer.ready, true, `${distance}m gun cue at charge ${charge}`);
      assert.equal(answer.nowScore, actual.result.score);assert.equal(answer.laterScore, 10);
      assert.equal(answer.probes, 2);assert.equal(answer.reactionDelay, .1);
      assert.deepEqual({stage, params, timing}, before);
    }
    const miss = evaluateCoachShot({...aimed, yaw: .4}, stage, 0, timing);
    assert.equal(miss.ready, false);assert.equal(miss.nowScore, 0);
  }
});

test('coaching uses the selected bullet trajectory for the original gun and both snipers', () => {
  const stage = {...clone(STAGES[0]), distance:150, wind:8};
  for (const gun of BOWS.filter(item => item.weaponType === 'gun')) for (const bullet of BULLETS) {
    const params = {...centreAim(stage, 0, gun.id, 13, bullet.id), charge:0};
    const shot = launchArrow(params), actual = stepArrow(shot, getFlightTimeLimit(shot), stage);
    assert.equal(actual.type, 'hit');assert.equal(actual.score, 10);
    const answer = evaluateCoachShot(params, stage, 0, timing);
    assert.equal(answer.ready, true, `${gun.name} with ${bullet.name}`);
    assert.equal(answer.nowScore, 10);assert.equal(answer.laterScore, 10);assert.equal(answer.probes, 2);
    const covered = {...stage, obstacles:[{x:0, z:5, width:20, height:10, depth:.1, material:'stone'}]};
    const penetrated = launchArrow(params);stepArrow(penetrated, getFlightTimeLimit(penetrated), covered);
    const forecast = evaluateCoachShot(params, covered, 0, timing);
    assert.equal(penetrated.penetrations.length, 1);
    assert.equal(forecast.nowScore, penetrated.result.type === 'hit' ? penetrated.result.score : 0);
    assert.notEqual(forecast.reason, 'obstacle', 'a gun forecast cannot treat the penetrable wall as a terminal hit');
  }
  const straightAim = centreAim(stage, 0, 22, 13, 3);
  assert.equal(evaluateCoachShot({...straightAim, bullet:0}, stage, 0, timing).ready, false,
    'a cue for a flat bullet cannot silently reuse the dropping basic-bullet prediction');
});

test('gun coaching compensates the compounded wall drop for every bullet including new straight-bullet drop', () => {
  for (const materials of [['wood'], ['stone'], ['wood', 'wood'], ['stone', 'stone'], ['wood', 'stone'], ['stone', 'wood']]) {
    const stage = coveredStage(materials);
    for (const bullet of BULLETS) {
      const params = coveredAim(stage, bullet.id), original = clone({stage, params});
      const reference = coveredFlight(params, stage), shot = launchArrow(params);
      stepArrow(shot, getFlightTimeLimit(shot), stage, 2.5);
      assert.equal(shot.result.type, 'hit');assert.equal(shot.result.score, 10);
      assert.equal(shot.penetrations.length, materials.length);
      assert.ok(Math.abs(shot.result.point.y - reference.point.y) < 1e-7);
      assert.ok(Math.abs(shot.elapsed - reference.elapsed) < 1e-7);
      const answer = evaluateCoachShot(params, stage, 2.5, timing);
      assert.equal(answer.ready, true, `${bullet.name} after ${materials.join(' then ')}`);
      assert.equal(answer.nowScore, 10);assert.equal(answer.laterScore, 10);assert.equal(answer.probes, 2);
      const oldAim = centreAim(stage, 0, 22, 13, bullet.id);
      if (bullet.id === 0) {
        const oldShot = launchArrow(oldAim);stepArrow(oldShot, getFlightTimeLimit(oldShot), stage);
        assert.notEqual(oldShot.result.type, 'hit', 'the former open-lane aim misses after its drop increases');
        const oldCue = evaluateCoachShot(oldAim, stage, 0, timing);
        assert.equal(oldCue.ready, false);assert.equal(oldCue.nowScore, 0);
        assert.ok(params.pitch > oldAim.pitch, 'the valid cue requires the player to raise the gun');
      }
      if (bullet.id === 3) {
        assert.ok(params.pitch > oldAim.pitch, 'straight bullets also require higher aim after a wall');
        assert.ok(shot.gravityScale > 0);
        assert.equal(evaluateCoachShot(oldAim, stage, 0, timing).ready, false);
        assert.ok(shot.elapsed > coveredFlight(params, {...stage, obstacles: []}).elapsed,
          'even the straight bullet takes longer after losing speed');
      }
      assert.deepEqual({stage, params}, original, 'coaching cannot mutate wall, equipment or aim state');
    }
  }
});

test('gun coaching includes slowed arrival when a person crosses behind a penetrated wall', () => {
  const stage = coveredStage(['wood', 'stone']), params = coveredAim(stage);
  const z = 100, arrival = coveredFlight(params, stage, z);
  const directArrival = coveredFlight(params, {...stage, obstacles: []}, z);
  assert.ok(arrival.elapsed > directArrival.elapsed + .3, 'the fixture distinguishes slowed and old arrival clocks');
  for (const delay of [0, .1]) {
    const config = {id: 7, z, width: .01, height: 10, depth: .01, passDuration: 20, phase: .5};
    const person = passersAt({...stage, passers: [config]}, delay + arrival.elapsed)[0];
    config.phase += (arrival.point.x - person.x) / (person.velocityX * config.passDuration);
    const occupied = {...stage, passers: [config]}, before = clone(occupied);
    const actual = [0, .1].map(time => {
      const shot = launchArrow(params);stepArrow(shot, getFlightTimeLimit(shot), occupied, time);
      assert.equal(shot.penetrations.length, 2);return shot.result;
    });
    assert.deepEqual(actual.map(result => result.type), delay ? ['hit', 'person'] : ['person', 'hit']);
    const answer = evaluateCoachShot(params, occupied, 0, timing);
    assert.equal(answer.ready, false);assert.equal(answer.reason, 'person');assert.equal(answer.probes, delay ? 2 : 1);
    assert.deepEqual(occupied, before, 'a forecast does not retire the person or change persistent state');
  }
});

test('main gun coaching leads moving targets and rejects a hit lost during reaction time', () => {
  const gun = BOWS.find(item => item.weaponType === 'gun');
  const aimed = centreAim(moving, 0, gun.id), answer = evaluateCoachShot(aimed, moving, 0, timing);
  assert.equal(answer.ready, true);assert.equal(answer.nowScore, 10);assert.ok(answer.laterScore >= 8);
  const aimedAtCurrentPosition = {...aimed, yaw: Math.atan2(targetAt(moving, 0).x, moving.distance)};
  assert.equal(evaluateCoachShot(aimedAtCurrentPosition, moving, 0, timing).ready, false);
  const fast = {...moving, distance: 20, radius: .2, motion: {...moving.motion, speed: 1.5}};
  const fleetingAim = centreAim(fast, 0, gun.id), fleeting = evaluateCoachShot(fleetingAim, fast, 0, timing);
  const actual = [0, .1].map(time => {
    const shot = launchArrow(fleetingAim);return stepArrow(shot, getFlightTimeLimit(shot), fast, time);
  });
  assert.equal(actual[0].type, 'hit');assert.equal(actual[0].score, 10);assert.notEqual(actual[1].type, 'hit');
  assert.equal(fleeting.nowScore, 10);assert.equal(fleeting.laterScore, 0);assert.equal(fleeting.ready, false);
});

test('main gun coaching rejects people entering the shot during reaction time', () => {
  const gun = BOWS.find(item => item.weaponType === 'gun');
  const stage = {...clone(STAGES[1]), retiredPasserIds: []}, params = centreAim(stage, 0, gun.id);
  const shot = launchArrow(params), z = 12;
  const flightTime = -Math.log1p(-shot.dragRate * z / shot.velocity.z) / shot.dragRate;
  const bulletX = shot.velocity.x * -Math.expm1(-shot.dragRate * flightTime) / shot.dragRate;
  for (const delay of [0, .1]) {
    const config = {id: 0, z, width: .01, height: 10, depth: .01, passDuration: 20, phase: .5};
    const person = passersAt({...stage, passers: [config]}, delay + flightTime)[0];
    config.phase += (bulletX - person.x) / (person.velocityX * config.passDuration);
    const occupied = {...stage, passers: [config]}, before = clone(occupied);
    const actual = [0, .1].map(time => {
      const bullet = launchArrow(params);return stepArrow(bullet, getFlightTimeLimit(bullet), occupied, time);
    });
    assert.deepEqual(actual.map(result => result.type), delay ? ['hit', 'person'] : ['person', 'hit']);
    const answer = evaluateCoachShot(params, occupied, 0, timing);
    assert.equal(answer.ready, false);assert.equal(answer.reason, 'person');assert.equal(answer.probes, delay ? 2 : 1);
    assert.deepEqual(occupied, before, 'a forecast neither retires a person nor mutates the stage');
  }
});

test('main gun coaching keeps minimum hold, release-limit and steady-transition guards', () => {
  const gun = BOWS.find(item => item.weaponType === 'gun');
  const stage = STAGES[0], params = {...centreAim(stage, 0, gun.id), charge: 0};
  for (const options of [{held: .1}, {held: 9.95}, {held: 1.45, steadyStart: 1.5, steadyDuration: 2}, {held: 3.45, steadyStart: 1.5, steadyDuration: 2}]) {
    const answer = evaluateCoachShot(params, stage, 0, options);
    assert.equal(answer.ready, false);assert.equal(answer.probes, 0);
  }
  assert.equal(evaluateCoachShot(params, stage, 0, {...timing, held: .25}).ready, true);
  const steady = evaluateCoachShot(params, stage, 0, {held: 2.5, steadyStart: 1.5, steadyDuration: 2});
  assert.equal(steady.ready, true);assert.equal(steady.steady, true);
});

test('manual-release laser coaching stays accurate after ten seconds while automatic draws keep their limit', () => {
  const gun = BOWS.find(item => item.weaponType === 'gun');
  const stage = STAGES[0];
  for (const bow of [0, 10, gun.id]) {
    const params = centreAim(stage, 0, bow);
    for (const held of [9.95, 10.25, 30]) {
      const automatic = evaluateCoachShot(params, stage, 0, {...timing, held});
      assert.equal(automatic.ready, false);assert.equal(automatic.reason, 'release-limit');assert.equal(automatic.probes, 0);
      const manual = evaluateCoachShot(params, stage, 0, {...timing, held, releaseLimitSeconds: Infinity});
      const actual = [0, .1].map(time => {
        const shot = launchArrow(params);return stepArrow(shot, getFlightTimeLimit(shot), stage, time);
      });
      assert.equal(manual.ready, true, `manual weapon ${bow} held for ${held}s`);assert.equal(manual.probes, 2);
      assert.deepEqual(actual.map(result => [result.type, result.score]), [['hit', 10], ['hit', 10]]);
      assert.equal(manual.nowScore, actual[0].score);assert.equal(manual.laterScore, actual[1].score);
    }
  }
});

test('manual laser holds still require a real arrow hit and a stable reaction window', () => {
  const stage = {...clone(STAGES[0]), distance: 50}, params = centreAim(stage, 0, 10);
  const manual = {...timing, held: 20, releaseLimitSeconds: Infinity};
  assert.equal(evaluateCoachShot(params, stage, 0, manual).ready, true);
  const target = targetAt(stage, 0), straightRay = {...params, pitch: Math.atan2(target.y - PLAYER.y, target.z - PLAYER.z)};
  const uncompensated = launchArrow(straightRay);stepArrow(uncompensated, getFlightTimeLimit(uncompensated), stage);
  assert.notEqual(uncompensated.result.type, 'hit', 'a straight laser ray on the target does not compensate arrow drop');
  assert.equal(evaluateCoachShot(straightRay, stage, 0, manual).ready, false);
  const wall = {...stage, obstacles: [{x: 0, z: 5, width: 20, height: 10, depth: .1}]};
  const blocked = evaluateCoachShot(params, wall, 0, manual);
  assert.equal(blocked.ready, false);assert.equal(blocked.reason, 'obstacle');
  for (const options of [
    {held: .1, reason: 'early'},
    {held: 10.95, steadyStart: 11, steadyDuration: .5, reason: 'steady-transition'},
    {held: 11.45, steadyStart: 11, steadyDuration: .5, reason: 'steady-transition'}
  ]) {
    const {reason, ...window} = options;
    const answer = evaluateCoachShot(params, stage, 0, {...window, releaseLimitSeconds: Infinity});
    assert.equal(answer.ready, false);assert.equal(answer.reason, reason);assert.equal(answer.probes, 0);
  }
});

test('retired event targets remain excluded from coaching for bows and the main gun', () => {
  const gun = BOWS.find(item => item.weaponType === 'gun');
  for (const bow of [0, gun.id]) for (const event of [{kind: 'clay'}, {kind: 'ufo'}, {eventLevel: 1}, {isEvent: true}]) {
    const params = centreAim(STAGES[0], 0, bow);
    const answer = evaluateCoachShot(params, {...STAGES[0], ...event}, 0, timing);
    assert.equal(answer.reason, 'event');
    assert.equal(answer.ready, false);assert.equal(answer.probes, 0);
  }
});
