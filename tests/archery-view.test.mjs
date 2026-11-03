import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLIGHT_TIME_SCALE, IMPACT_HOLD, RETURN_DURATION, NEAR_PLANE,
  PREVIEW_RISE, PREVIEW_HOLD, PREVIEW_RETURN,
  projectPoint, clipSegmentNear, splitSegmentAtDepths, depthFragments,
  desiredFollowCamera, desiredPreviewCamera, clearShotCamera, lerpCamera
} from '../games/forest-archer/view.mjs';
import {ARROWS, BOWS, STAGES, prepareStage, targetAt, launchArrow, stepArrow} from '../games/forest-archer/engine.mjs';

const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const mission = (lessonKey, distance) => {
  const matches = STAGES.filter(stage => stage.lessonKey === lessonKey && stage.distance === distance);
  assert.equal(matches.length, 1, `${lessonKey} has one ${distance}m lesson`);
  return matches[0];
};
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const base = (w = 1000, h = 600) => ({x: 0, y: 1.65, z: 0, cx: w / 2, horizon: h * .405, focal: Math.min(w * 1.08, h * 1.5)});
// Keep the solid-wall projection regression independent of the gentler lesson catalog.
const coveredBird = {
  id: 28, distance: 44, radius: 1.4, height: 5.8, kind: 'bird',
  motion: {amplitudeX: 5.2, amplitudeY: 3.6, speed: .72, irregular: true},
  wind: 2.258, passDuration: 12, passers: [],
  obstacles: [{x: 0, z: 24, width: 24, height: 3.8, depth: .65, type: 'stone'}]
};

function birdCover(stage, time, camera) {
  const target = targetAt(stage, time), obstacle = stage.obstacles[0];
  const z = obstacle.z - obstacle.depth / 2;
  return {
    target,
    bird: {
      left: projectPoint({...target, x: target.x - target.rx}, camera).x,
      right: projectPoint({...target, x: target.x + target.rx}, camera).x,
      top: projectPoint({...target, y: target.y + target.ry}, camera).y,
      bottom: projectPoint({...target, y: target.y - target.ry}, camera).y
    },
    wall: {
      left: projectPoint({x: obstacle.x - obstacle.width / 2, y: 0, z}, camera).x,
      right: projectPoint({x: obstacle.x + obstacle.width / 2, y: 0, z}, camera).x,
      top: projectPoint({x: obstacle.x, y: obstacle.height, z}, camera).y,
      bottom: projectPoint({x: obstacle.x, y: 0, z}, camera).y
    }
  };
}

const shaftTail = shot => {
  const speed = Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z) || 1;
  return Object.fromEntries(['x', 'y', 'z'].map(key =>
    [key, shot.position[key] - shot.velocity[key] / speed * (shot.shaftLength ?? .85)]));
};

// Independent three-axis ray/box intersection: a projection can be inside the
// canvas and still be hidden by a solid front, side or top face.
function wallBlocks(camera, point, wall) {
  let first = 0, last = 1;
  const bounds = {
    x: [wall.x - wall.width / 2, wall.x + wall.width / 2],
    y: [0, wall.height], z: [wall.z - wall.depth / 2, wall.z + wall.depth / 2]
  };
  for (const axis of ['x', 'y', 'z']) {
    const delta = point[axis] - camera[axis], [low, high] = bounds[axis];
    if (Math.abs(delta) < 1e-10) {
      if (camera[axis] < low || camera[axis] > high) return false;
    } else {
      const a = (low - camera[axis]) / delta, b = (high - camera[axis]) / delta;
      first = Math.max(first, Math.min(a, b)); last = Math.min(last, Math.max(a, b));
      if (first > last) return false;
    }
  }
  return first < 1 - 1e-9 && last > 1e-9;
}

test('a solid wall hides and reveals a crossing bird in either direction without projection leaks', () => {
  for (const {seed, hiddenAt, aboveAt, direction} of [
    {seed: 2, hiddenAt: 7.02, aboveAt: 7.48, direction: -1},
    {seed: 3, hiddenAt: 6.2, aboveAt: 6.7, direction: 1}
  ]) {
    const stage = prepareStage(coveredBird, seed), obstacle = stage.obstacles[0];
    for (const {w, h} of [{w: 1000, h: 600}, {w: 390, h: 410}, {w: 844, h: 280}]) {
      const hidden = birdCover(stage, hiddenAt, base(w, h)), above = birdCover(stage, aboveAt, base(w, h));
      for (const {target, bird, wall} of [hidden, above]) {
        assert.ok(target.z > obstacle.z + obstacle.depth / 2, 'the whole pass stays behind the wall');
        assert.ok(bird.left > 0 && bird.right < w && bird.top > 0 && bird.bottom < h, 'the bird is inside the aiming viewport');
        assert.ok(bird.left > wall.left && bird.right < wall.right, 'exposure comes from flying above the wall, not around an edge');
        assert.equal(target.direction, direction);
      }
      assert.ok(hidden.bird.top > hidden.wall.top && hidden.bird.bottom < hidden.wall.bottom, 'the front face covers the entire bird');
      assert.ok(above.bird.bottom < above.wall.top, 'the entire bird clears the wall silhouette');
      assert.equal(hidden.target.passId, above.target.passId);
      assert.ok(above.target.y > hidden.target.y);
      assert.ok(direction * (above.target.x - hidden.target.x) > 0, 'the bird keeps travelling in its original direction');
    }
  }
});

test('starter equipment clears a solid wall to hit an exposed bird, while a low shot strikes masonry', () => {
  // These are normal full-charge aiming inputs, with gravity, drag and stage wind enabled.
  for (const {seed, time, yaw, pitch, direction} of [
    {seed: 2, time: 4.12, yaw: .073118, pitch: .239681, direction: -1},
    {seed: 5, time: 5.92, yaw: .172276, pitch: .254677, direction: 1}
  ]) {
    const stage = prepareStage(coveredBird, seed);
    const shot = launchArrow({bow: BOWS[0], arrow: ARROWS[0], charge: 1, yaw, pitch});
    const result = stepArrow(shot, 8, stage, time);
    assert.equal(result.type, 'hit', 'the real trajectory must clear the solid wall');
    assert.equal(result.score, 10);
    assert.equal(result.targetCenter.direction, direction);
    for (const [w, h] of [[1000, 600], [390, 410], [844, 280]]) for (const moment of [time, time + result.flightTime]) {
      const {bird, wall} = birdCover(stage, moment, base(w, h));
      assert.ok(bird.bottom < wall.top, 'the bird is exposed at both release and impact');
      assert.ok(bird.left > 0 && bird.right < w && bird.top > 0 && bird.bottom < h);
      assert.ok(bird.left > wall.left && bird.right < wall.right);
    }
    const lowShot = launchArrow({bow: BOWS[0], arrow: ARROWS[0], charge: 1, pitch: .1});
    assert.equal(stepArrow(lowShot, 8, stage, time).type, 'obstacle', 'low shots still strike the wall');
  }
});

test('projection respects camera translation and hides points before the near plane', () => {
  const camera = {...base(), x: 2, y: 4, z: 10};
  const p = projectPoint({x: 3, y: 5, z: 20}, camera);
  assert.equal(p.visible, true);
  near(p.x, 590); near(p.y, 153); near(p.scale, 90); near(p.depth, 10);
  assert.equal(projectPoint({x: 2, y: 4, z: 10 + NEAR_PLANE}, camera).visible, true);
  for (const z of [-200, 9, 10, 10 + NEAR_PLANE / 2]) {
    const hidden = projectPoint({x: 2, y: 4, z}, camera);
    assert.equal(hidden.visible, false);
    assert.ok(['x', 'y', 'depth', 'scale'].every(key => Number.isFinite(hidden[key])));
  }
  const malformed = projectPoint({x: NaN, y: Infinity, z: 20}, camera);
  assert.equal(malformed.visible, false);
  assert.ok(Object.entries(malformed).filter(([key]) => key !== 'visible').every(([, value]) => Number.isFinite(value)));
});

test('near-plane clipping preserves the visible portion in either direction', () => {
  const a = {x: 0, y: 2, z: 0}, b = {x: 10, y: 4, z: 20};
  const original = JSON.stringify([a, b]);
  const clipped = clipSegmentNear(a, b, 10);
  near(clipped.a.z, 10 + NEAR_PLANE);
  near(clipped.a.x, (10 + NEAR_PLANE) / 2);
  near(clipped.a.y, 2 + (10 + NEAR_PLANE) / 10);
  assert.deepEqual(clipped.b, b);
  const reverse = clipSegmentNear(b, a, 10);
  assert.deepEqual(reverse.a, clipped.b);
  for (const key of ['x', 'y', 'z']) near(reverse.b[key], clipped.a[key]);
  assert.equal(clipSegmentNear(a, {x: 1, y: 2, z: 9}, 10), null);
  assert.equal(clipSegmentNear(a, a, 0), null);
  assert.equal(JSON.stringify([a, b]), original, 'clipping must not mutate physics/trail points');
});

test('a shaft or trail crossing the target becomes separate front and behind fragments', () => {
  const a = {x: -1, y: 2, z: 12}, b = {x: 1, y: 4, z: 16};
  const fragments = depthFragments(a, b, [14], 0);
  assert.equal(fragments.length, 2);
  assert.deepEqual(fragments.map(p => p.z), [13, 15]);
  assert.deepEqual(fragments[0].b, {x: 0, y: 3, z: 14});
  assert.deepEqual(fragments[0].b, fragments[1].a);
  const paintOrder = [...fragments.map(p => ({z: p.z, type: 'arrow'})), {z: 14, type: 'target'}].sort((p, q) => q.z - p.z);
  assert.deepEqual(paintOrder.map(p => [p.type, p.z]), [['arrow', 15], ['target', 14], ['arrow', 13]]);
});

test('multiple and repeated depth planes retain the full line without zero-length duplicates', () => {
  const a = {x: -2, y: 1, z: 2}, b = {x: 6, y: 7, z: 42};
  const depths = [42, 22, 14, 22, 2, NaN, Infinity, -1, 99];
  const pieces = splitSegmentAtDepths(a, b, depths);
  assert.equal(pieces.length, 3);
  near(pieces.reduce((sum, p) => sum + length(p.a, p.b), 0), length(a, b));
  for (let i = 1; i < pieces.length; i++) assert.deepEqual(pieces[i - 1].b, pieces[i].a);
  assert.ok(pieces.every(p => length(p.a, p.b) > 0));
  assert.deepEqual(pieces[0].a, a); assert.deepEqual(pieces.at(-1).b, b);
  const reverse = splitSegmentAtDepths(b, a, depths);
  assert.equal(reverse.length, pieces.length);
  near(reverse.reduce((sum, p) => sum + length(p.a, p.b), 0), length(a, b));
  assert.deepEqual(reverse[0].a, b); assert.deepEqual(reverse.at(-1).b, a);
  assert.deepEqual(splitSegmentAtDepths(a, a, depths), []);
});

test('camera-overtaken trail is clipped before depth sorting, while depth-parallel lines remain intact', () => {
  const pieces = depthFragments({x: 0, y: 2, z: 0}, {x: 1, y: 3, z: 30}, [5, 14, 22], 10);
  assert.equal(pieces.length, 3);
  near(pieces[0].a.z, 10 + NEAR_PLANE);
  assert.ok(pieces.every(p => p.a.z >= 10 + NEAR_PLANE && p.b.z >= 10 + NEAR_PLANE));
  assert.deepEqual(depthFragments({x: 0, y: 0, z: 2}, {x: 1, y: 1, z: 4}, [14], 10), []);
  const parallel = splitSegmentAtDepths({x: -1, y: 2, z: 14}, {x: 1, y: 2, z: 14}, [14, 22]);
  assert.equal(parallel.length, 1); assert.equal(parallel[0].z, 14);
});

test('follow view trails the arrow through rising, falling, and ground positions on desktop and mobile', () => {
  for (const {w, h} of [{w: 1000, h: 600}, {w: 390, h: 410}, {w: 844, h: 280}]) {
    for (const p of [{x: 0, y: 2, z: 14}, {x: -9, y: 24, z: 60}, {x: 17, y: 3, z: 100}, {x: 8, y: 0, z: 140}]) {
      const camera = desiredFollowCamera(p, base(w, h), {w, h});
      near(camera.z, p.z - 7);
      assert.ok(camera.y >= 1);
      assert.ok(Object.values(camera).every(Number.isFinite));
      const projected = projectPoint(p, camera);
      assert.equal(projected.visible, true);
      assert.ok(projected.x > 0 && projected.x < w, `arrow x remains in ${w}px view`);
      assert.ok(projected.y > 0 && projected.y < h, `arrow y remains in ${h}px view`);
    }
  }
});

test('post-shot camera reveals ordinary off-centre impacts through partial cover on every viewport', () => {
  let hiddenContacts = 0;
  for (const [lessonKey, distance] of [
    ['fixed-gap-3/4', 10], ['fixed-gap-3/4', 30],
    ['fixed-gap-1/2', 10], ['fixed-gap-1/2', 30],
    ['fixed-gap-1/3', 10], ['fixed-gap-1/3', 20], ['moving-half-gap', 20]
  ]) for (const seed of [19, 123, 0x80000000]) {
    const stage = prepareStage(mission(lessonKey, distance), seed);
    for (const time of [0, 9.3]) for (const [offsetX, offsetY] of [[-.3, 0], [0, .3], [.3, 0]]) {
      const target = targetAt(stage, time), shot = {
        position: {x: target.x + target.rx * offsetX, y: target.y + target.ry * offsetY, z: target.z - .002},
        velocity: {x: target.x / target.z * 30, y: -5, z: 30}
      };
      const points = [shot.position, shaftTail(shot)];
      for (const [w, h] of [[390, 300], [1000, 600], [844, 280]]) {
        const original = desiredFollowCamera(shot.position, base(w, h), {w, h});
        const snapshot = structuredClone({original, stage, shot});
        const camera = clearShotCamera(original, stage, shot, {w, h});
        const hidden = points.some(point => stage.obstacles.some(wall => wallBlocks(original, point, wall)));
        if (hidden) hiddenContacts++;
        for (const point of points) {
          assert.ok(stage.obstacles.every(wall => !wallBlocks(camera, point, wall)),
            `stage ${stage.id}: real tip and tail clear the wall on ${w}×${h}`);
          const projected = projectPoint(point, camera);
          assert.ok(projected.visible && projected.x > 0 && projected.x < w && projected.y > 0 && projected.y < h,
            `stage ${stage.id}: visible shaft fits the canvas`);
        }
        assert.ok(camera.z <= original.z && shaftTail(shot).z - camera.z >= NEAR_PLANE,
          'the camera cannot overtake the shaft to fake visibility');
        assert.ok(camera.y - original.y <= 6 && Math.abs(camera.x - original.x) <= 4.5,
          'near cover cannot send the camera to an unbounded height or sideways position');
        assert.deepEqual({original, stage, shot}, snapshot, 'camera correction leaves physics, walls and saved view unchanged');
      }
    }
  }
  assert.ok(hiddenContacts > 100, 'exercise genuinely occluded contacts, including the reported left-shoulder view');
});

test('camera sightlines clear both faces of thick double walls and keep impact surroundings in frame', () => {
  const stage = {radius: 1.6, obstacles: [
    {x: 0, z: 13, width: 24, height: 3.8, depth: 1.8},
    {x: 0, z: 15, width: 24, height: 3, depth: .8}
  ]};
  const shot = {position: {x: .2, y: 2, z: 18}, velocity: {x: 0, y: -3, z: 25}};
  for (const [w, h] of [[390, 300], [1000, 600], [844, 280]]) {
    const original = desiredFollowCamera(shot.position, base(w, h), {w, h});
    assert.ok(stage.obstacles.some(wall => wallBlocks(original, shot.position, wall)));
    const camera = clearShotCamera(original, stage, shot, {w, h});
    assert.ok(camera.y > original.y, 'wide walls require an actual elevated viewpoint');
    near(camera.x, original.x); near(camera.z, original.z);
    const radius = .32, surrounding = [
      shot.position, shaftTail(shot),
      {...shot.position, x: shot.position.x - radius}, {...shot.position, x: shot.position.x + radius},
      {...shot.position, y: shot.position.y - radius}, {...shot.position, y: shot.position.y + radius}
    ];
    for (const point of [shot.position, shaftTail(shot)]) {
      assert.ok(stage.obstacles.every(wall => !wallBlocks(camera, point, wall)), 'neither wall thickness hides the shaft');
    }
    for (const point of surrounding) {
      const p = projectPoint(point, camera);
      assert.ok(p.visible && p.x >= w * .10 - 1e-7 && p.x <= w * .90 + 1e-7 &&
        p.y >= h * .12 - 1e-7 && p.y <= h * .88 + 1e-7, 'real impact vicinity fits after the elevation');
    }
    // The final impact shaft wiggles by less than .1m; reserve physical sight
    // clearance rather than merely ensuring the unanimated centreline shows.
    const tail = shaftTail(shot);
    for (const dx of [-.08, .08]) for (const dy of [-.05, .05]) {
      assert.ok(stage.obstacles.every(wall => !wallBlocks(camera, {...tail, x: tail.x + dx, y: tail.y + dy}, wall)));
    }
  }
});

test('close side cover uses a finite view through the gap and embedded shaft stays physically hidden', () => {
  const shot = {position: {x: 0, y: 2, z: 10}, velocity: {x: 0, y: 0, z: 30}};
  const stage = {radius: 1.3, obstacles: [{x: -2, z: 9.6, width: 3.96, height: 4, depth: .4}]};
  const original = desiredFollowCamera(shot.position, base(390, 300), {w: 390, h: 300});
  assert.ok(wallBlocks(original, shot.position, stage.obstacles[0]));
  const camera = clearShotCamera(original, stage, shot, {w: 390, h: 300});
  assert.ok(Math.abs(camera.x - original.x) > 0 && Math.abs(camera.x - original.x) <= 4.5);
  assert.ok(camera.y - original.y <= 6);
  for (const point of [shot.position, shaftTail(shot)]) assert.equal(wallBlocks(camera, point, stage.obstacles[0]), false);

  const embedded = {position: {x: 0, y: 2, z: 10.5}, velocity: {x: 0, y: 0, z: 30}};
  const solid = {obstacles: [{x: 0, z: 9.8, width: 12, height: 4, depth: .5}]};
  const view = desiredFollowCamera(embedded.position, base(390, 300), {w: 390, h: 300});
  const bounded = clearShotCamera(view, solid, embedded, {w: 390, h: 300});
  assert.ok(Object.values(bounded).every(Number.isFinite));
  assert.ok(bounded.y - view.y <= 6 && Math.abs(bounded.x - view.x) <= 4.5);
  assert.equal(wallBlocks(bounded, shaftTail(embedded), solid.obstacles[0]), true,
    'a tail inside masonry remains hidden instead of being painted through it');
});

test('post-shot correction leaves launch, open views and already-passed walls unchanged', () => {
  const original = {...base(390, 300), cx: 240, horizon: 160, focal: 600};
  const shot = {position: {x: 0, y: 3, z: 20}, velocity: {x: 0, y: -2, z: 30}};
  const openWall = {x: 20, z: 10, width: 2, height: 10, depth: 1};
  assert.strictEqual(clearShotCamera(original, {obstacles: []}, shot, {w: 390, h: 300}), original);
  assert.strictEqual(clearShotCamera(original, {obstacles: [openWall]}, shot, {w: 390, h: 300}), original);
  for (const id of [97, 117, 120]) {
    const stage = prepareStage(STAGES[id - 1], 19), target = targetAt(stage, 9.3);
    const landed = {position: {...target}, velocity: {x: 0, y: -4, z: 30}};
    const follow = desiredFollowCamera(landed.position, original, {w: 390, h: 300});
    assert.strictEqual(clearShotCamera(follow, stage, landed, {w: 390, h: 300}), follow,
      'once both single/double walls are behind the camera, keep the established follow view');
  }
  for (const z of [0, 2.5, 4.999]) {
    const launching = {position: {x: 0, y: 2, z}, velocity: {x: 0, y: 0, z: 30}};
    const follow = desiredFollowCamera(launching.position, original, {w: 390, h: 300});
    assert.strictEqual(clearShotCamera(follow, {obstacles: [{x: 0, z: 1, width: 8, height: 8, depth: .5}]}, launching, {w: 390, h: 300}), follow);
  }
  assert.strictEqual(clearShotCamera(original, {}, {position: {x: NaN, y: 2, z: 20}, velocity: shot.velocity}), original);
  assert.strictEqual(clearShotCamera(original, {}, shot), original);
});

test('launch begins in the saved aiming view and interpolation restores it exactly', () => {
  const aiming = {...base(), cx: 620, horizon: 363, focal: 1800};
  assert.deepEqual(desiredFollowCamera({x: 0, y: 1.65, z: 0}, aiming, {w: 1000, h: 600}), aiming);
  const chase = desiredFollowCamera({x: 3, y: 12, z: 30}, aiming, {w: 1000, h: 600});
  assert.deepEqual(lerpCamera(chase, aiming, 1), aiming);
  assert.deepEqual(lerpCamera(chase, aiming, 2), aiming);
  assert.deepEqual(lerpCamera(chase, aiming, -1), chase);
  const halfway = lerpCamera(chase, aiming, .5);
  for (const key of Object.keys(aiming)) near(halfway[key], (chase[key] + aiming[key]) / 2);
  assert.equal(FLIGHT_TIME_SCALE, 1);
  assert.equal(IMPACT_HOLD, .65);
  assert.equal(RETURN_DURATION, .7);
});

test('all six animal lessons fit vertically when crossing the normal aiming view at every distance', () => {
  const animalKinds = ['rabbit', 'wildcat', 'deer', 'pigeon', 'eagle', 'cheetah'];
  for (const template of STAGES.filter(stage => animalKinds.includes(stage.kind))) for (const seed of [0, 5, 19]) {
    const stage = prepareStage(template, seed), duration = targetAt(stage, 0).passDuration;
    for (const [w, h] of [[1000, 600], [390, 410], [844, 280]]) {
      let visibleSamples = 0;
      for (let index = 0; index < 120; index++) {
        const target = targetAt(stage, duration * (index + .5) / 120), camera = base(w, h);
        const left = projectPoint({...target, x: target.x - target.rx}, camera);
        const right = projectPoint({...target, x: target.x + target.rx}, camera);
        if (left.x < 0 || right.x > w) continue;
        visibleSamples++;
        const top = projectPoint({...target, y: target.y + target.ry}, camera);
        const bottom = projectPoint({...target, y: target.y - target.ry}, camera);
        assert.ok(top.y >= 0 && bottom.y <= h, `${stage.kind} at ${stage.distance}m fits a ${w}×${h} view`);
      }
      assert.ok(visibleSamples > 0, 'each animal crosses the visible aiming field');
    }
  }
});

test('elevated preview reveals the full target above every wall in all obstacle stages', () => {
  for (const template of STAGES.filter(stage => stage.obstacles.length)) for (const seed of [0, 19]) {
    const stage = prepareStage(template, seed);
    for (const time of [0, 1.3, 5.7, 19]) {
      const target = targetAt(stage, time);
      for (const {w, h} of [{w: 1000, h: 600}, {w: 390, h: 410}, {w: 844, h: 280}]) {
        const camera = desiredPreviewCamera(stage, target, base(w, h), {w, h});
        const center = projectPoint(target, camera);
        assert.ok(Object.values(camera).every(Number.isFinite));
        near(center.x, w / 2); near(center.y, h * .40);
        assert.equal(camera.x, 0); assert.equal(camera.z, 0); assert.ok(camera.y >= 5);
        // Include the board's outer wooden rim, which is slightly wider than its scoring radius.
        const rx = target.kind === 'target' ? target.radius * 1.055 : target.rx;
        const ry = target.kind === 'target' ? target.radius * 1.055 : target.ry;
        const boundary = [
          {x: target.x - rx, y: target.y, z: target.z},
          {x: target.x + rx, y: target.y, z: target.z},
          {x: target.x, y: target.y - ry, z: target.z},
          {x: target.x, y: target.y + ry, z: target.z}
        ].map(point => projectPoint(point, camera));
        assert.ok(boundary.every(point => point.visible && point.x > 0 && point.x < w && point.y > 0 && point.y < h));
        const bottom = boundary[2];
        for (const wall of stage.obstacles) {
          for (const wallZ of [wall.z - wall.depth / 2, wall.z + wall.depth / 2]) {
            const fraction = wallZ / target.z;
            const rayHeight = camera.y * (1 - fraction) + (target.y - target.ry) * fraction;
            assert.ok(rayHeight >= wall.height + .5 - 1e-9, `stage ${stage.id} sightline clears both wall edges`);
            const top = projectPoint({x: wall.x, y: wall.height, z: wallZ}, camera);
            assert.ok(bottom.y < top.y, `stage ${stage.id} entire target appears above masonry`);
            const ground = projectPoint({x: wall.x, y: 0, z: wallZ}, camera);
            assert.ok(ground.y > top.y && ground.y < h, `stage ${stage.id} wall and ground fit in overview`);
            for (const x of [wall.x - wall.width / 2, wall.x + wall.width / 2]) for (const y of [0, wall.height]) {
              const corner = projectPoint({x, y, z: wallZ}, camera);
              assert.ok(corner.x >= 0 && corner.x <= w && corner.y >= 0 && corner.y <= h,
                `stage ${stage.id} near and far wall corners fit a ${w}×${h} overview`);
            }
          }
        }
      }
    }
  }
});

test('preview centers moving targets independently of the saved zoom and pan', () => {
  const stage = STAGES.find(stage => stage.kind === 'deer' && stage.distance === 30), target = targetAt(stage, 2.4);
  const normal = base(390, 410);
  const zoomed = {...normal, cx: normal.cx + 90, horizon: normal.horizon + 130, focal: normal.focal * 2};
  const camera = desiredPreviewCamera(stage, target, normal, {w: 390, h: 410});
  assert.deepEqual(desiredPreviewCamera(stage, target, zoomed, {w: 390, h: 410}), camera);
  near(camera.focal, .9 * Math.min(390 * 1.08, 410 * 1.5));
  assert.deepEqual(normal, base(390, 410), 'preview must not change the saved aiming camera');
  assert.deepEqual(lerpCamera(camera, zoomed, 1), zoomed, 'the exact prior aim can be restored');
  assert.equal(PREVIEW_RISE, .45);
  assert.equal(PREVIEW_HOLD, 1.45);
  assert.equal(PREVIEW_RETURN, .65);
});

test('preview ignores walls behind the target and remains finite without optional target bounds', () => {
  const target = {x: 2, y: 3, z: 30, radius: 1.2};
  const stage = {distance: 30, obstacles: [{z: 10, height: 3, depth: 2}]};
  const camera = desiredPreviewCamera(stage, target, base(), {w: 1000, h: 600});
  const behind = {...stage, obstacles: [...stage.obstacles, {z: 60, height: 1000, depth: 2}]};
  assert.deepEqual(desiredPreviewCamera(behind, target, base(), {w: 1000, h: 600}), camera);
  const fraction = 11 / 30;
  assert.ok(camera.y * (1 - fraction) + (3 - 1.2) * fraction >= 3.5 - 1e-9);
  const fallback = desiredPreviewCamera();
  assert.ok(Object.values(fallback).every(Number.isFinite));
});
