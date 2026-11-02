import test from 'node:test';
import assert from 'node:assert/strict';
import {createBullseyeCinematic, sampleBullseyeCinematic, desiredBullseyeCamera,
  BULLSEYE_REPLAY_DISTANCE, BULLSEYE_FLIGHT_DURATION, BULLSEYE_HOLD_DURATION,
  BULLSEYE_RETURN_DURATION, BULLSEYE_REDUCED_HOLD_DURATION, BULLSEYE_ENTRY_DURATION} from '../games/forest-archer/cinematic.mjs';
import {projectPoint} from '../games/forest-archer/view.mjs';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const pointNear = (actual, expected, tolerance = 1e-8) => {
  for (const axis of ['x', 'y', 'z']) near(actual[axis], expected[axis], tolerance);
};
const copy = value => JSON.parse(JSON.stringify(value));
const shotFixture = () => ({
  projectileType: 'arrow', shaftLength: .85, active: false, elapsed: 1.2,
  velocity: {x: -1, y: -3, z: 32}, position: {x: .1, y: 2.2, z: 30},
  result: {type: 'hit', score: 10, point: {x: .1, y: 2.2, z: 30},
    targetCenter: {x: 0, y: 2.3, z: 30, rx: 1.8, ry: 1.8, radius: 1.8, kind: 'target'}},
  // Deliberately curved samples: replay must preserve measured lateral changes
  // and changing velocity instead of constructing a new straight trajectory.
  replayFrames: [
    {point: {x: -1, y: 1.65, z: 0}, velocity: {x: 3, y: 6, z: 40}, time: 4},
    {point: {x: .4, y: 3, z: 22}, velocity: {x: 2, y: 1, z: 36}, time: 4.6},
    {point: {x: .9, y: 3.3, z: 25}, velocity: {x: 1, y: 0, z: 34}, time: 4.8},
    {point: {x: .7, y: 2.8, z: 28}, velocity: {x: -2, y: -2, z: 33}, time: 5},
    {point: {x: .1, y: 2.2, z: 30}, velocity: {x: -1, y: -3, z: 32}, time: 5.2}
  ]
});

test('only recorded ten-point arrow hits on circular targets qualify for the replay', () => {
  assert.ok(createBullseyeCinematic(shotFixture(), 5.2));
  for (const change of [
    shot => { shot.result.score = 8; },
    shot => { shot.result.type = 'ground'; },
    shot => { shot.result.type = 'miss'; },
    shot => { shot.projectileType = 'bullet'; },
    ...['rabbit', 'wildcat', 'deer', 'pigeon', 'eagle', 'cheetah', 'clay', 'ufo'].map(kind => shot => { shot.result.targetCenter.kind = kind; }),
    shot => { shot.result = null; },
    shot => { shot.replayFrames = []; }
  ]) {
    const shot = shotFixture();change(shot);
    assert.equal(createBullseyeCinematic(shot, 5.2), null);
  }
});

test('creation copies the last 3.4 metres of recorded arc and the actual contact without mutating physics', () => {
  const shot = shotFixture(), before = copy(shot), replay = createBullseyeCinematic(shot, 5.2);
  assert.equal(replay.shot, shot);
  assert.deepEqual(shot, before);
  const length = replay.frames.slice(1).reduce((sum, frame, i) => sum + Math.hypot(...['x', 'y', 'z'].map(axis => frame.point[axis] - replay.frames[i].point[axis])), 0);
  near(BULLSEYE_REPLAY_DISTANCE, 3.4);
  near(length, BULLSEYE_REPLAY_DISTANCE);
  pointNear(replay.frames.at(-1).point, shot.result.point);
  pointNear(replay.frames.at(-1).velocity, shot.velocity);
  near(replay.impactTime, 5.2);
  assert.ok(replay.frames[0].time > shot.replayFrames[1].time);
  assert.ok(replay.frames.some(frame => frame.point.x === .7), 'the real curved portion is retained');
  shot.replayFrames.at(-1).point.x = 999;
  shot.result.point.y = 999;shot.result.targetCenter.x = 999;shot.velocity.z = 999;
  pointNear(replay.impactPoint, before.result.point);
  pointNear(replay.velocity, before.velocity);
  assert.equal(replay.targetCenter.x, before.result.targetCenter.x);
  assert.ok(replay.frames.every(frame => frame.point.x !== 999));
});

test('flight samples interpolate recorded position, velocity and scene time, then hold the exact impact', () => {
  const shot = shotFixture(), before = copy(shot), replay = createBullseyeCinematic(shot, 5.2);
  const flight = replay.flightDuration, impactEnd = flight + replay.holdDuration, end = impactEnd + replay.returnDuration;
  let previousTime = -Infinity;
  for (const fraction of [0, .12, .32, .52, .82, .999]) {
    const age = flight * fraction;
    const sample = sampleBullseyeCinematic(replay, age);
    assert.equal(sample.phase, 'flight');assert.ok(sample.time >= previousTime);previousTime = sample.time;
    const right = replay.frames.findIndex(frame => frame.time >= sample.time);
    const a = replay.frames[Math.max(0, right - 1)], b = replay.frames[Math.max(0, right)];
    const t = a === b ? 0 : (sample.time - a.time) / (b.time - a.time);
    for (const field of ['point', 'velocity']) for (const axis of ['x', 'y', 'z']) near(sample[field][axis], a[field][axis] + (b[field][axis] - a[field][axis]) * t);
    assert.equal(sample.impactAge, 0);
  }
  for (const [age, phase] of [[flight, 'impact'], [impactEnd - .001, 'impact'], [impactEnd + .001, 'return'], [end - .001, 'return'], [end, 'done']]) {
    const sample = sampleBullseyeCinematic(replay, age);
    assert.equal(sample.phase, phase);near(sample.time, replay.impactTime);
    pointNear(sample.point, shot.result.point);pointNear(sample.velocity, shot.velocity);
  }
  assert.deepEqual(shot, before, 'sampling never changes the resolved projectile or result');
  const halfway = sampleBullseyeCinematic(replay, flight / 2);
  near(halfway.progress, .5);near(halfway.phaseProgress, .5);
  assert.ok(halfway.time < (replay.frames[0].time + replay.impactTime) / 2,
    'the recorded approach accelerates into contact instead of replaying at one flat speed');
  const entry = Array.from({length: 11}, (_, index) => sampleBullseyeCinematic(replay, BULLSEYE_ENTRY_DURATION * index / 10));
  near(entry[0].entryMask, 1);near(entry.at(-1).entryMask, 0);
  assert.ok(entry.every((frame, index) => frame.entryMask >= 0 && frame.entryMask <= 1 && (!index || frame.entryMask <= entry[index - 1].entryMask)));
  assert.ok(entry.every(frame => frame.impactPulse === 0), 'the impact flash and camera pulse never start during approach');
  near(replay.flightDuration + replay.holdDuration + replay.returnDuration, 1.9);
  assert.deepEqual([replay.flightDuration, replay.holdDuration, replay.returnDuration], [BULLSEYE_FLIGHT_DURATION, BULLSEYE_HOLD_DURATION, BULLSEYE_RETURN_DURATION]);
});

test('malformed or reversed recordings cannot create a broken replay camera', () => {
  for (const change of [
    shot => { shot.replayFrames[2].point.x = NaN; },
    shot => { shot.replayFrames[2].velocity.z = Infinity; },
    shot => { shot.replayFrames[2].time = 3; },
    shot => { shot.result.point.z = NaN; },
    shot => { shot.result.targetCenter.rx = 0; }
  ]) {
    const shot = shotFixture();change(shot);
    assert.equal(createBullseyeCinematic(shot, 5.2), null);
  }
});

test('the impact camera punches in and settles without a cut at either phase boundary', () => {
  const replay = createBullseyeCinematic(shotFixture(), 5.2), contact = replay.flightDuration, returnAt = contact + replay.holdDuration;
  for (const [w, h] of [[390, 640], [844, 290], [1000, 600]]) {
    const base = {x: 0, y: 1.65, z: 0, cx: w / 2, horizon: h * .405, focal: Math.min(w * 1.08, h * 1.5)};
    const cameraAt = age => desiredBullseyeCamera(sampleBullseyeCinematic(replay, age), base, {w, h});
    for (const boundary of [contact, returnAt]) {
      const before = cameraAt(boundary - 1e-6), after = cameraAt(boundary + 1e-6);
      const a = projectPoint(replay.impactPoint, before), b = projectPoint(replay.impactPoint, after);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .01, 'the same contact point cannot teleport between camera phases');
      assert.ok(Math.abs(a.scale - b.scale) < .01, 'impact and return begin at the preceding magnification');
    }
    const initial = projectPoint(replay.impactPoint, cameraAt(contact));
    const samples = Array.from({length: 50}, (_, index) => projectPoint(replay.impactPoint, cameraAt(contact + replay.holdDuration * index / 50)));
    assert.ok(Math.max(...samples.map(sample => sample.scale)) > initial.scale * 1.03, 'the brief impact push visibly enlarges the actual contact');
    const last = cameraAt(returnAt), later = cameraAt(returnAt + replay.returnDuration * .8);
    for (const field of ['x', 'y', 'z', 'cx', 'horizon', 'focal']) near(last[field], later[field], .01);
    assert.ok(samples.every(sample => sample.visible && sample.x > 0 && sample.x < w && sample.y > 0 && sample.y < h));
  }
});

test('the close camera keeps the complete arrow and ten-point ring visible across phone, landscape and desktop', () => {
  const replay = createBullseyeCinematic(shotFixture(), 5.2);
  const ages = Array.from({length: 100}, (_, index) => (replay.flightDuration + replay.holdDuration) * index / 100);
  for (const [w, h] of [[390, 640], [844, 290], [1000, 600]]) for (const age of ages) {
    const frame = sampleBullseyeCinematic(replay, age), base = {x: 0, y: 1.65, z: 0, cx: w / 2, horizon: h * .405, focal: Math.min(w * 1.08, h * 1.5)};
    const original = copy(frame), camera = desiredBullseyeCamera(frame, base, {w, h});
    assert.ok(Object.values(camera).every(Number.isFinite));
    const speed = Math.hypot(...Object.values(frame.velocity));
    const tail = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, frame.point[axis] - frame.velocity[axis] / speed * frame.shaftLength]));
    const center = frame.targetCenter;
    const points = [frame.point, tail,
      {x: center.x - center.rx * .2, y: center.y, z: center.z}, {x: center.x + center.rx * .2, y: center.y, z: center.z},
      {x: center.x, y: center.y - center.ry * .2, z: center.z}, {x: center.x, y: center.y + center.ry * .2, z: center.z}];
    for (const point of points) {
      const projected = projectPoint(point, camera);
      assert.equal(projected.visible, true);
      assert.ok(projected.x >= 0 && projected.x <= w && projected.y >= 0 && projected.y <= h,
        `${w}×${h} ${age}s keeps ${JSON.stringify(point)} visible`);
    }
    assert.deepEqual(frame, original);
  }
});

test('reduced motion skips replay flight and leaves the camera at the supplied view', () => {
  const replay = createBullseyeCinematic(shotFixture(), 5.2, {reducedMotion: true});
  assert.equal(replay.flightDuration, 0);assert.equal(replay.holdDuration, BULLSEYE_REDUCED_HOLD_DURATION);
  const frame = sampleBullseyeCinematic(replay, 0);
  assert.equal(frame.phase, 'impact');assert.equal(frame.reducedMotion, true);
  assert.equal(frame.entryMask, 0);assert.equal(frame.impactPulse, 0);
  pointNear(frame.point, replay.impactPoint);
  const base = {x: 0, y: 1.65, z: 0, cx: 200, horizon: 250, focal: 450};
  assert.deepEqual(desiredBullseyeCamera(frame, base, {w: 390, h: 640}), base);
  near(replay.holdDuration + replay.returnDuration, 1);
  assert.equal(sampleBullseyeCinematic(replay, replay.holdDuration + replay.returnDuration + .01).phase, 'done');
});
