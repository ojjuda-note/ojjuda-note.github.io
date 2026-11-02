import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, BOWS, ARROWS, STAGES, STAGE_GEAR_BANDS, MISSION_GROUPS, LEGACY_STAGE_MAP, prepareStage, targetAt, launchArrow, stepArrow } from '../games/forest-archer/engine.mjs';

const distances = [10, 20, 30, 50];
const animalKinds = ['rabbit', 'wildcat', 'deer', 'pigeon', 'eagle', 'cheetah'];
const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`);

// Sample the actual circle and ray-test the full 3D boxes. This independently
// checks face area, box depth, randomized positions, and moving-target exposure.
const disk = Array.from({ length: 2048 }, (_, index) => {
  const radius = Math.sqrt((index + .5) / 2048), angle = index * Math.PI * (3 - Math.sqrt(5));
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
});
function rayBlocked(point, obstacle) {
  const minimum = {x:obstacle.x - obstacle.width / 2,y:0,z:obstacle.z - obstacle.depth / 2};
  const maximum = {x:obstacle.x + obstacle.width / 2,y:obstacle.height,z:obstacle.z + obstacle.depth / 2};
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y', 'z']) {
    const delta = point[axis] - PLAYER[axis];
    if (Math.abs(delta) < 1e-12) {
      if (PLAYER[axis] < minimum[axis] || PLAYER[axis] > maximum[axis]) return false;
      continue;
    }
    const a = (minimum[axis] - PLAYER[axis]) / delta, b = (maximum[axis] - PLAYER[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return enter < 1 && leave > 0;
}
function visibleFace(stage, time = 0) {
  const target = targetAt(stage, time);
  let visible = 0;
  for (const sample of disk) {
    const point = {x:target.x + sample.x * target.rx,y:target.y + sample.y * target.ry,z:target.z};
    if (!stage.obstacles.some(obstacle => rayBlocked(point, obstacle))) visible++;
  }
  return visible / disk.length;
}

test('120 distinct missions introduce thirty skills with four increasing distances each', () => {
  assert.equal(STAGES.length, 120);
  assert.deepEqual(STAGES.map(stage => stage.id), Array.from({length:120}, (_, index) => index + 1));
  assert.equal(new Set(STAGES.map(stage => stage.name)).size, 120);
  const physics = stage => JSON.stringify([stage.kind, stage.distance, stage.radius, stage.height, stage.motion, stage.wind, stage.obstacles, stage.passers]);
  assert.equal(new Set(STAGES.map(physics)).size, 120, 'extra mission names must correspond to distinct playable conditions');
  assert.equal(MISSION_GROUPS.length, 30);
  for (let chapter = 1; chapter <= 30; chapter++) {
    const stages = STAGES.filter(stage => stage.chapterId === chapter);
    const expectedDistances = [25, 26, 27, 30].includes(chapter) ? [30, 35, 40, 50] : distances;
    assert.deepEqual(stages.map(stage => stage.distance), expectedDistances, `chapter ${chapter} teaches distance in order`);
    const group = MISSION_GROUPS[chapter - 1];
    assert.deepEqual([group.chapterId, group.first, group.last, group.distances], [chapter, chapter * 4 - 3, chapter * 4, expectedDistances]);
    assert.equal(group.chapterName, stages[0].chapterName);
    assert.equal(new Set(stages.map(stage => stage.chapterName)).size, 1);
    for (let index = 1; index < stages.length; index++) {
      assert.ok(stages[index].difficulty.angularRadius < stages[index - 1].difficulty.angularRadius);
      assert.ok(stages[index].difficulty.flightSeconds > stages[index - 1].difficulty.flightSeconds);
    }
  }
  assert.ok(STAGES.slice(0, 4).every(stage => !stage.motion.speed && !stage.obstacles.length));
  assert.ok(STAGES.slice(4, 8).every(stage => stage.motion.speed > 0 && !stage.obstacles.length));
  assert.ok(STAGES.slice(8, 12).every(stage => stage.wind && !stage.motion.speed && !stage.obstacles.length));
  assert.ok(STAGES.slice(12, 16).every(stage => stage.motion.amplitudeY > 0 && !stage.obstacles.length));
  assert.deepEqual(STAGES.slice(16, 28).map(stage => stage.visibleFraction), [...Array(4).fill(.75), ...Array(4).fill(.5), ...Array(4).fill(1 / 3)]);
  assert.ok(STAGES.slice(28, 36).every(stage => stage.coverageMode === 'pillars' && stage.motion.speed > 0));
  assert.ok(STAGES.slice(36, 40).every(stage => stage.motion.amplitudeX > 0 && stage.motion.amplitudeY > 0));
  assert.ok(STAGES.slice(40, 44).every(stage => !stage.motion.speed && !stage.obstacles.length && stage.height > STAGES[stage.id - 41].height));
  assert.ok(STAGES.slice(44, 48).every(stage => stage.obstacles.length && !stage.motion.speed));
  for (const [index, kind] of animalKinds.entries()) assert.ok(STAGES.slice(48 + index * 4, 52 + index * 4).every(stage => stage.kind === kind));
  assert.ok(STAGES.slice(72, 76).every(stage => stage.motion.irregular && !stage.obstacles.length));
  assert.ok(STAGES.slice(76, 80).every(stage => stage.coverageMode === 'pillars' && stage.motion.amplitudeY > 0));
  assert.ok(STAGES.slice(80, 84).every(stage => stage.passers.length === 1 && !stage.motion.speed));
  assert.ok(STAGES.slice(84, 88).every(stage => stage.passers.length === 2 && !stage.motion.speed));
  assert.ok(STAGES.slice(88, 92).every(stage => stage.passers.length === 2 && stage.motion.speed > 0));
  assert.ok(STAGES.slice(92, 96).every(stage => stage.visibleFraction === .5 && stage.variableExposure && stage.motion.speed > 0));
  assert.ok(STAGES.slice(96, 100).every(stage => stage.visibleFraction === 0 && !stage.motion.speed));
  assert.ok(STAGES.slice(100, 108).every(stage => stage.visibleFraction === 0 && stage.motion.speed > 0));
  assert.ok(STAGES.slice(108, 112).every(stage => stage.coverageMode === 'pillars' && stage.passers.length > 0));
  assert.deepEqual(STAGES.slice(112, 116).map(stage => stage.kind), ['pigeon', 'eagle', 'pigeon', 'eagle']);
  assert.ok(STAGES.slice(116).every(stage => stage.visibleFraction === 0 && stage.motion.speed > 0 && stage.obstacles.length === 2));
  assert.ok(STAGES.every(stage => stage.distance <= 50));
});

test('the first eight lessons retain the established starter physics and all fifty old scenes have one migration destination', () => {
  const radii = [1.45, 1.65, 1.85, 2.1];
  for (let index = 0; index < 8; index++) {
    const stage = STAGES[index], lesson = index % 4;
    assert.equal(stage.distance, distances[lesson]);assert.equal(stage.radius, radii[lesson]);
    close(stage.height, radii[lesson] + .5);
    assert.equal(stage.goal, (index < 4 ? 10 : 12) + lesson * 2);
    assert.equal(stage.kind, 'target');assert.equal(stage.shots, 5);assert.deepEqual(stage.obstacles, []);
    close(stage.wind, [0, 0, 0, 0, .03, -.038, -.046, .054][index]);
    close(stage.motion.speed, index < 4 ? 0 : .24 + lesson * .025);
    close(stage.motion.amplitudeX, index < 4 ? 0 : radii[lesson] * (.6 + lesson * .1));
    assert.equal(stage.motion.amplitudeY, 0);assert.equal(stage.motion.irregular, index >= 4);
  }
  const expected = Object.fromEntries(Array.from({length:50}, (_, index) => {
    const old = index + 1;
    return [old, old <= 8 ? old : old <= 20 ? old + 8 : old <= 24 ? old + 12 : old <= 48 ? old + 24 : old === 49 ? 100 : 104];
  }));
  assert.deepEqual(LEGACY_STAGE_MAP, expected);
  const mapped = STAGES.filter(stage => stage.legacyStageId !== undefined);
  assert.equal(mapped.length, 50);assert.equal(new Set(mapped.map(stage => stage.legacyStageId)).size, 50);
  for (const stage of mapped) assert.equal(LEGACY_STAGE_MAP[stage.legacyStageId], stage.id);
});

test('beginners get large calm targets and learn slow tracking before obstacles or animals', () => {
  assert.ok(STAGES.slice(0, 4).every(stage => stage.wind === 0 && stage.radius >= 1.45 && stage.goal <= 16));
  assert.ok(STAGES.slice(0, 16).every(stage => Math.abs(stage.wind) <= .08 && !stage.obstacles.length));
  assert.ok(STAGES.slice(0, 48).every(stage => Math.abs(stage.wind) <= .32 && stage.kind === 'target'));
  assert.ok(STAGES.every(stage => Math.abs(stage.wind) <= 1.3));
  for (const stage of STAGES.slice(4, 8)) {
    const prepared = prepareStage(stage, 31);
    for (let time = 0; time < 40; time += .1) assert.ok(Math.abs(targetAt(prepared, time).velocityX) < 1, 'early tracking stays below one metre per second');
  }
  const first = STAGES[0], target = targetAt(first, 0);
  for (const velocityBias of [-1, 0, 1]) {
    const shot = launchArrow({bow:BOWS[0],arrow:ARROWS[0],charge:1,velocityBias,yaw:0,pitch:Math.atan2(target.y - PLAYER.y, target.z)});
    const hit = stepArrow(shot, 3, first, 0);
    assert.equal(hit.type, 'hit', 'pointing at the first large target remains forgiving with starter-arrow speed variation');
    assert.ok(hit.score >= 8);
  }
});

test('the three fixed wall lessons expose 75 percent, half, and one third of the actual round face', () => {
  for (const template of STAGES.filter(stage => stage.coverageMode === 'side-walls' && !stage.variableExposure)) for (const seed of [0, 5, 19, 99]) {
    const stage = prepareStage(template, seed);
    assert.equal(stage.obstacles.length, 2);
    assert.ok(stage.obstacles.every(obstacle => obstacle.width > 0 && obstacle.depth > 0));
    close(visibleFace(stage), template.visibleFraction, .006);
    const center = targetAt(stage, 0);
    assert.ok(stage.obstacles.every(obstacle => !rayBlocked(center, obstacle)), 'the central opening remains clear even in side layouts');
  }
});

test('the moving half-opening changes real exposure while its fixed gap remains half a centered face', () => {
  const lessons = STAGES.filter(stage => stage.variableExposure);
  assert.equal(lessons.length, 4);
  for (const template of lessons) for (const seed of [0, 5, 19]) {
    const stage = prepareStage(template, seed), before = structuredClone(stage.obstacles);
    const centered = {...stage, motion: {...stage.motion, speed: 0, amplitudeX: 0, amplitudeY: 0}};
    close(visibleFace(centered), .5, .006);
    const exposure = Array.from({length: 48}, (_, index) => visibleFace(stage, index * .43));
    assert.ok(Math.max(...exposure) <= .506);
    assert.ok(Math.min(...exposure) >= 1 / 3, 'this lesson varies a half opening before introducing full cover');
    assert.ok(Math.max(...exposure) - Math.min(...exposure) > .025, 'tracking genuinely changes how much of the disk is visible');
    assert.deepEqual(stage.obstacles, before, 'the walls stay fixed while the target crosses their opening');
  }
});

test('partial-cover layouts randomize together and never accumulate offsets on preparation', () => {
  for (const template of STAGES.filter(stage => stage.coverageMode)) {
    const slots = new Set(), positions = [];
    for (let seed = 0; seed < 24; seed++) {
      const prepared = prepareStage(template, seed);
      slots.add(prepared.wallLayout); positions.push(prepared.targetX);
      assert.deepEqual(prepareStage(prepared, seed), prepared);
      assert.deepEqual(prepareStage(prepared, seed + 19), prepareStage(template, seed + 19));
      assert.equal(template.targetX, undefined, 'the catalog template is not modified by a round');
    }
    assert.deepEqual([...slots].sort(), ['center', 'left', 'right']);
    assert.ok(Math.max(...positions) - Math.min(...positions) > template.distance * .08);
  }
});

test('thin fixed pillars keep roughly three quarters visible while the target crosses their gaps', () => {
  for (const template of STAGES.filter(stage => stage.coverageMode === 'pillars')) for (const seed of [0, 5, 19]) {
    const stage = prepareStage(template, seed), before = structuredClone(stage.obstacles), positions = [];
    for (let sample = 0; sample < 48; sample++) {
      const time = sample * .43, visible = visibleFace(stage, time);
      assert.ok(visible >= .70 && visible <= .80, `stage ${stage.id} seed ${seed} time ${time}: ${visible} visible`);
      positions.push(targetAt(stage, time).x);
    }
    assert.deepEqual(stage.obstacles, before, 'the target moves behind stationary pillars');
    assert.ok(Math.max(...positions) - Math.min(...positions) > template.radius);
  }
});

test('complete cover follows the visible lessons and stays fully hidden across fixed, moving and double-wall layouts', () => {
  const hidden = STAGES.filter(stage => stage.visibleFraction === 0);
  assert.equal(hidden.length, 16);assert.ok(hidden.every(stage => stage.id >= 97));
  for (const template of hidden) {
    const slots = new Set();
    for (let seed = 0; seed < 24; seed++) {
      const stage = prepareStage(template, seed); slots.add(stage.wallLayout);
      for (let time = 0; time < 20; time += 2.5) close(visibleFace(stage, time), 0);
    }
    assert.deepEqual([...slots].sort(), ['center', 'left', 'right']);
  }
});

test('each animal keeps its own body shape and characteristic motion without reversing a pass', () => {
  const expectedShapes = {rabbit:[1.10,.72],wildcat:[1.12,.66],deer:[1.23,.73],pigeon:[1.18,.86],eagle:[1.55,.95],cheetah:[1.38,.62]};
  for (const kind of animalKinds) {
    const template = STAGES.find(stage => stage.kind === kind), stage = prepareStage(template, 42);
    const start = targetAt(stage, 0), heights = [], velocities = [];
    close(start.rx / start.radius, expectedShapes[kind][0]);close(start.ry / start.radius, expectedShapes[kind][1]);
    let previous = start;
    for (let sample = 1; sample < 160; sample++) {
      const current = targetAt(stage, start.passDuration * sample / 160);
      assert.ok((current.x - previous.x) * start.direction > 0);
      assert.equal(current.passId, start.passId);assert.equal(current.direction, start.direction);
      assert.ok(current.y - current.ry > 0, 'the hit envelope stays above the ground');
      heights.push(current.y); velocities.push(Math.abs(current.velocityX));previous = current;
    }
    assert.ok(Math.max(...velocities) > Math.min(...velocities) * 1.3);
    assert.ok(Math.max(...heights) - Math.min(...heights) > .05);
  }
  const pigeon = STAGES.find(stage => stage.kind === 'pigeon'), eagle = STAGES.find(stage => stage.kind === 'eagle');
  const turns = stage => {
    const y = Array.from({length:320},(_,i)=>targetAt(prepareStage(stage,42),i * stage.passDuration / 320).y);
    return y.slice(1,-1).filter((value,index)=>(value-y[index])*(y[index+2]-value)<0).length;
  };
  assert.ok(turns(pigeon) > turns(eagle), 'pigeons flutter more frequently than the eagle soars');
});

test('difficulty metadata describes the current lesson without overriding its teaching order', () => {
  for (const stage of STAGES) {
    for (const field of ['baseScore','score','angularRadius','movementSpeed','flightSeconds','windDriftPerUnit','cover','windStrength','windDrift']) assert.ok(Number.isFinite(stage.difficulty[field]), `${stage.id}: ${field}`);
    assert.equal(stage.difficulty.windStrength, Math.abs(stage.wind));
    assert.ok(stage.difficulty.cover >= 0 && stage.difficulty.cover <= 1);
  }
  assert.ok(STAGES[4].difficulty.score < STAGES[3].difficulty.score, 'a new close moving target intentionally follows the long-distance stationary target');
});


test('equipment lessons have four optional bands with exactly fifteen upper-grade stages', () => {
  assert.deepEqual(STAGE_GEAR_BANDS.map(band => [band.gearTier, band.first, band.last]),
    [['starter',1,16],['lower',17,48],['middle',49,105],['upper',106,120]]);
  assert.deepEqual(STAGE_GEAR_BANDS.map(band => band.referenceLoadouts.map(({bow, arrow}) => [bow, arrow])),
    [[[0,0]], [[6,5],[13,5]], [[8,2],[14,2]], [[3,11],[19,11]]]);
  assert.equal(STAGES.filter(stage => stage.gearTier === 'upper').length, 15);
  for (const band of STAGE_GEAR_BANDS) for (const stage of STAGES.slice(band.first - 1, band.last)) {
    assert.equal(stage.gearTier, band.gearTier);assert.equal(stage.gearLabel, band.gearLabel);
    assert.deepEqual(stage.referenceLoadouts, band.referenceLoadouts);
    assert.ok(stage.referenceLoadouts.some(loadout => loadout.family === 'bow'));
    if (band.gearTier !== 'starter') assert.ok(stage.referenceLoadouts.some(loadout => loadout.family === 'crossbow'));
    for (const reference of stage.referenceLoadouts) {
      assert.equal(BOWS[reference.bow].weaponType, reference.family);
      assert.equal(BOWS[reference.bow].gearTier, band.gearTier);
      assert.ok(ARROWS[reference.arrow]);
    }
    assert.equal(stage.requiredWeapon, undefined, 'guidance must not turn into a weapon lock');
    assert.equal(stage.requiredGearTier, undefined);
  }
  const limits = {starter:[10,18,.08],lower:[18,26,.32],middle:[18,30,.65],upper:[24,36,1.3]};
  for (const stage of STAGES) {
    const [minimum, maximum, wind] = limits[stage.gearTier];
    assert.ok(stage.goal >= minimum && stage.goal <= maximum);
    assert.ok(Math.abs(stage.wind) <= wind);
  }
});

test('only fourteen measured difficult stages adjust goals while the other 106 retain their original goals', () => {
  const caps = new Map([
    [52,18], [56,22], [72,26], [80,24], [84,23], [88,23], [92,23],
    [95,23], [96,21], [103,28], [110,30], [111,30], [112,24], [120,34]
  ]);
  const originalCurves = {lower:[17,48,18,26], middle:[49,105,26,30], upper:[106,120,32,36]};
  assert.deepEqual(STAGES.slice(0, 16).map(stage => stage.goal),
    [10,12,14,16,12,14,16,18,12,14,16,18,12,14,16,18], 'introductory goals remain unchanged');
  const changed = [];
  for (const stage of STAGES.slice(16)) {
    const [first, last, start, end] = originalCurves[stage.gearTier];
    const originalGoal = Math.round(start + (end - start) * (stage.id - first) / (last - first));
    if (stage.goal !== originalGoal) changed.push(stage.id);
    if (caps.has(stage.id)) {
      assert.ok(['middle', 'upper'].includes(stage.gearTier));
      assert.ok(caps.get(stage.id) < originalGoal, 'a calibrated cap addresses a previously excessive goal');
      assert.equal(stage.goal, caps.get(stage.id), `${stage.id} keeps its measured goal`);
    } else assert.equal(stage.goal, originalGoal, `${stage.id} retains the established score curve`);
  }
  assert.deepEqual(changed, [...caps.keys()], 'the calibration must not spread to unmeasured stages');
});

test('bow and crossbow grades are ranked within their own families', () => {
  assert.deepEqual(STAGE_GEAR_BANDS.map(band => [band.gearTier, band.weaponIds.bow, band.weaponIds.crossbow]), [
    ['starter', [0], []],
    ['lower', [4, 5, 6], [13, 12, 10]],
    ['middle', [1, 2, 8], [14, 11, 15, 16]],
    ['upper', [7, 9, 3], [17, 18, 19]]
  ], 'stat rebalancing must preserve the released weapon identities in each equipment grade');
  for (const family of ['bow','crossbow']) {
    const weapons = BOWS.filter(weapon => weapon.weaponType === family).sort((a,b) => a.familyRank - b.familyRank);
    assert.deepEqual(weapons.map(weapon => weapon.familyRank), [1,2,3,4,5,6,7,8,9,10]);
    assert.deepEqual(weapons.map(weapon => weapon.gearTier), family === 'bow' ?
      ['starter','lower','lower','lower','middle','middle','middle','upper','upper','upper'] :
      ['lower','lower','lower','middle','middle','middle','middle','upper','upper','upper']);
    for (const weapon of weapons) {
      assert.equal(weapon.gearLabel,{starter:'기본',lower:'하위',middle:'중간',upper:'상위'}[weapon.gearTier]);
      const band = STAGE_GEAR_BANDS.find(entry => entry.gearTier === weapon.gearTier);
      assert.ok(band.weaponIds[family].includes(weapon.id));
    }
  }
  assert.ok(BOWS.filter(weapon => weapon.weaponType === 'gun').every(weapon => !weapon.gearTier && !weapon.gearLabel));
  assert.equal(BOWS[4].price, 500, 'the first lower bow keeps its existing 500-coin price');
  assert.equal(BOWS[3].price, 8100);assert.equal(BOWS[19].price, 26600);
});

test('later optional reference grades keep the capabilities taught by earlier grades', () => {
  for (const family of ['bow', 'crossbow']) {
    let previous = null;
    for (const band of STAGE_GEAR_BANDS) {
      const reference = band.referenceLoadouts.find(loadout => loadout.family === family);
      if (!reference) continue;
      const bow = BOWS[reference.bow], arrow = ARROWS[reference.arrow];
      if (previous) {
        assert.ok(bow.familyRank > previous.bow.familyRank, `${family} guidance advances within its own family`);
        assert.ok(bow.grip >= previous.bow.grip && bow.elasticity >= previous.bow.elasticity, `${band.gearTier} guidance retains grip and elasticity`);
        assert.ok(bow.steadyDuration >= previous.bow.steadyDuration);
        assert.ok(arrow.shopRank >= previous.arrow.shopRank, 'later guidance never returns to a weaker arrow');
        assert.ok(arrow.fletching.stability >= previous.arrow.fletching.stability);
        assert.ok(arrow.fletching.windArea <= previous.arrow.fletching.windArea && arrow.fletching.drag <= previous.arrow.fletching.drag);
      }
      previous = { bow, arrow };
    }
  }
});
