import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, BOWS, ARROWS, STAGES, STAGE_GEAR_BANDS, MISSION_GROUPS, LEGACY_STAGE_MAP, CATALOG_V1_STAGE_MAP, LONG_RANGE_DISTANCES, LONG_RANGE_LESSONS, prepareStage, targetAt, passersAt, createClayEvent, eventTargetsAt, launchArrow, stepArrow, getArrowMass, getArrowConsistency, getArrowDragRate, getWindResponse } from '../games/forest-archer/engine.mjs';

const distances = [10, 20, 30, 50];
const originalStages = STAGES.slice(0,120), longStages = STAGES.slice(120);
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

test('the original 120 missions retain thirty skills with four increasing distances each', () => {
  assert.equal(originalStages.length, 120);
  assert.deepEqual(originalStages.map(stage => stage.id), Array.from({length:120}, (_, index) => index + 1));
  assert.equal(new Set(originalStages.map(stage => stage.name)).size, 120);
  const physics = stage => JSON.stringify([stage.kind, stage.distance, stage.radius, stage.height, stage.motion, stage.wind, stage.obstacles, stage.passers]);
  assert.equal(new Set(originalStages.map(physics)).size, 120, 'extra mission names must correspond to distinct playable conditions');
  assert.equal(MISSION_GROUPS.slice(0,30).length, 30);
  for (let chapter = 1; chapter <= 30; chapter++) {
    const stages = STAGES.filter(stage => stage.chapterId === chapter);
    const expectedDistances = [25, 26, 27, 30].includes(chapter) ? [60, 65, 70, 80] : distances;
    assert.deepEqual(stages.map(stage => stage.distance), expectedDistances, `chapter ${chapter} teaches distance in order`);
    const group = MISSION_GROUPS[chapter - 1];
    assert.deepEqual([group.chapterId, group.first, group.last, group.distances], [chapter, chapter * 4 - 3, chapter * 4, expectedDistances]);
    assert.equal(group.chapterName, stages[0].chapterName);
    assert.equal(new Set(stages.map(stage => stage.chapterName)).size, 1);
    for (let index = 1; index < stages.length; index++) {
      // Hidden targets retain their faces when moved back to leave room for
      // the arc; their longer flight, wind and motion provide the progression.
      if(!stages[index].fullCover)assert.ok(stages[index].difficulty.angularRadius < stages[index - 1].difficulty.angularRadius);
      assert.ok(stages[index].difficulty.flightSeconds > stages[index - 1].difficulty.flightSeconds);
    }
  }
  assert.ok(STAGES.slice(0, 4).every(stage => !stage.motion.speed && !stage.obstacles.length));
  assert.ok(STAGES.slice(4, 8).every(stage => stage.lessonKey === 'elevated-fixed' && !stage.motion.speed && !stage.obstacles.length && stage.height > STAGES[stage.id - 5].height));
  assert.ok(STAGES.slice(8, 12).every(stage => stage.motion.speed > 0 && !stage.obstacles.length));
  assert.ok(STAGES.slice(12, 16).every(stage => stage.wind && !stage.motion.speed && !stage.obstacles.length));
  assert.ok(STAGES.slice(16, 20).every(stage => stage.motion.amplitudeY > 0 && !stage.obstacles.length));
  assert.deepEqual(STAGES.slice(20, 32).map(stage => stage.visibleFraction), [...Array(4).fill(.75), ...Array(4).fill(.5), ...Array(4).fill(1 / 3)]);
  assert.ok(STAGES.slice(32, 40).every(stage => stage.coverageMode === 'pillars' && stage.motion.speed > 0));
  assert.ok(STAGES.slice(40, 44).every(stage => stage.motion.amplitudeX > 0 && stage.motion.amplitudeY > 0));
  assert.ok(STAGES.slice(44, 48).every(stage => stage.obstacles.length && !stage.motion.speed));
  for (const [index, kind] of animalKinds.entries()) assert.ok(STAGES.slice(48 + index * 4, 52 + index * 4).every(stage => stage.kind === kind));
  assert.ok(STAGES.slice(72, 76).every(stage => stage.motion.irregular && !stage.obstacles.length));
  assert.ok(STAGES.slice(76, 80).every(stage => stage.coverageMode === 'pillars' && stage.motion.amplitudeY > 0));
  assert.ok(STAGES.slice(80, 84).every(stage => stage.passers.length === 1 && !stage.motion.speed));
  assert.ok(STAGES.slice(84, 88).every(stage => stage.passers.length >= 4 && stage.passers.length <= 6 && !stage.motion.speed));
  assert.ok(STAGES.slice(88, 92).every(stage => stage.passers.length >= 4 && stage.passers.length <= 6 && stage.motion.speed > 0));
  assert.ok(STAGES.slice(92, 96).every(stage => stage.visibleFraction === .5 && stage.variableExposure && stage.motion.speed > 0));
  assert.ok(STAGES.slice(96, 100).every(stage => stage.visibleFraction === 0 && !stage.motion.speed));
  assert.ok(STAGES.slice(100, 108).every(stage => stage.visibleFraction === 0 && stage.motion.speed > 0));
  assert.ok(STAGES.slice(108, 112).every(stage => stage.coverageMode === 'pillars' && stage.passers.length > 0));
  assert.deepEqual(STAGES.slice(112, 116).map(stage => stage.kind), ['pigeon', 'eagle', 'pigeon', 'eagle']);
  assert.ok(originalStages.slice(116).every(stage => stage.visibleFraction === 0 && stage.motion.speed > 0 && stage.obstacles.length === 2));
  assert.ok(originalStages.every(stage => stage.distance <= (stage.fullCover?80:50)));
});

test('one hundred long-range missions extend twenty familiar lessons through five distances in order',()=>{
  assert.equal(STAGES.length,220);assert.equal(longStages.length,100);assert.equal(MISSION_GROUPS.length,50);
  assert.deepEqual(STAGES.map(stage=>stage.id),Array.from({length:220},(_,i)=>i+1));
  assert.equal(new Set(STAGES.map(stage=>stage.name)).size,220);
  const physics=stage=>JSON.stringify([stage.kind,stage.distance,stage.radius,stage.height,stage.motion,stage.wind,stage.obstacles,stage.passers]);
  assert.equal(new Set(STAGES.map(physics)).size,220,'the new missions have distinct playable conditions');
  assert.deepEqual(LONG_RANGE_DISTANCES,[60,80,100,120,150]);
  assert.deepEqual(LONG_RANGE_LESSONS,[
    'fixed-intro','elevated-fixed','tracking-intro','wind-intro','vertical-intro',
    'fixed-gap-3/4','fixed-gap-1/2','fixed-gap-1/3','pillars-regular','diagonal-tracking',
    'low-wall-arc','animal-rabbit','animal-wildcat','animal-deer','animal-pigeon',
    'animal-eagle','animal-cheetah','passers-tracking','hidden-tracking','double-wall-finale'
  ]);
  let previousSource=0;
  for(const [index,key]of LONG_RANGE_LESSONS.entries()){
    const source=originalStages.filter(stage=>stage.lessonKey===key).at(-1);
    assert.ok(source.id>previousSource,'familiar lessons retain their relative teaching order');previousSource=source.id;
    const chapter=longStages.slice(index*5,index*5+5),group=MISSION_GROUPS[index+30];
    assert.deepEqual(chapter.map(stage=>stage.distance),[60,80,100,120,150]);
    assert.deepEqual([group.chapterId,group.first,group.last,group.distances],[index+31,121+index*5,125+index*5,[60,80,100,120,150]]);
    // The appended bands still restart at 60m even after the original hidden
    // targets have been recessed to 80m; each five-distance band must progress.
    let angle=source.fullCover?Infinity:source.difficulty.angularRadius,flight=source.fullCover?0:source.difficulty.flightSeconds;
    for(const stage of chapter){
      assert.equal(stage.longRange,true);assert.equal(stage.sourceLessonKey,key);assert.equal(stage.lessonKey,`long-${key}`);
      assert.equal(stage.kind,source.kind);assert.equal(stage.chapterId,index+31);assert.equal(stage.chapterName,group.chapterName);
      assert.equal(stage.catalogV1Id,undefined);assert.equal(stage.legacyStageId,undefined,'new stages never receive old records');
      assert.equal(stage.gearTier,'upper');assert.equal(stage.shots,5);
      const arrow=14+LONG_RANGE_DISTANCES.indexOf(stage.distance);
      assert.equal(stage.recommendedArrow,arrow);
      assert.deepEqual(stage.referenceLoadouts,[{family:'bow',bow:3,arrow},{family:'crossbow',bow:19,arrow}]);
      assert.ok(Number.isInteger(stage.goal)&&stage.goal>0&&stage.goal<=50,'a five-shot reference goal remains valid');
      assert.ok(stage.difficulty.angularRadius<angle,'greater physical size must not cancel the smaller distant view');
      assert.ok(stage.difficulty.flightSeconds>flight);angle=stage.difficulty.angularRadius;flight=stage.difficulty.flightSeconds;
      assert.equal(stage.coverageMode,source.coverageMode);assert.equal(stage.visibleFraction,source.visibleFraction);
      assert.equal(stage.fullCover,source.fullCover);assert.equal(stage.passers.length,source.passers.length);
      assert.ok(stage.obstacles.every(wall=>wall.width>0&&wall.height>0&&wall.depth>0&&wall.z>0&&wall.z+wall.depth/2<stage.distance));
      if(!source.motion.speed)assert.equal(stage.motion.speed,0);else assert.ok(stage.motion.speed>0);
    }
  }
});

test('long-range walls preserve their real exposure promises at the expanded target height',()=>{
  for(const template of longStages.filter(stage=>stage.obstacles.length))for(const seed of[0,19]){
    const stage=prepareStage(template,seed);
    for(const time of[0,1.3,5.7]){
      const exposure=visibleFace(stage,time),center=targetAt(stage,time);
      if(stage.fullCover)close(exposure,0);
      else if(stage.lowWall){
        assert.ok(stage.obstacles.every(wall=>!rayBlocked(center,wall)),`${stage.id}: low wall keeps the centre visible`);
        assert.ok(exposure>0&&exposure<1,'only the lower part of the target is behind the wall');
      }else if(stage.coverageMode==='side-walls'){
        close(exposure,stage.visibleFraction,.006);
        assert.ok(stage.obstacles.every(wall=>!rayBlocked(center,wall)));
      }else if(stage.coverageMode==='pillars')assert.ok(exposure>=.70&&exposure<=.80);
    }
  }
});

test('original fixed and tracking lessons retain geometry, goals and wind while all fifty old scenes have one migration destination', () => {
  const radii = [1.45, 1.65, 1.85, 2.1];
  const originalIntro = STAGES.filter(stage => ['fixed-intro', 'tracking-intro'].includes(stage.lessonKey));
  assert.deepEqual(originalIntro.map(stage => stage.id), [1, 2, 3, 4, 9, 10, 11, 12]);
  for (let index = 0; index < 8; index++) {
    const stage = originalIntro[index], lesson = index % 4;
    assert.equal(stage.distance, distances[lesson]);assert.equal(stage.radius, radii[lesson]);
    close(stage.height, radii[lesson] + .5);
    assert.equal(stage.goal, (index < 4 ? 10 : 12) + lesson * 2);
    assert.equal(stage.kind, 'target');assert.equal(stage.shots, 5);assert.deepEqual(stage.obstacles, []);
    close(stage.wind, [0, 0, 0, 0, .03, -.038, -.046, .054][index]);
    close(stage.motion.speed, index < 4 ? 0 : (.24 + lesson * .025) * 2.30);
    close(stage.motion.amplitudeX, index < 4 ? 0 : radii[lesson] * (.6 + lesson * .1));
    assert.equal(stage.motion.amplitudeY, 0);assert.equal(stage.motion.irregular, index >= 4);
  }
  const expected = Object.fromEntries(Array.from({length:50}, (_, index) => {
    const old = index + 1;
    return [old, old <= 4 ? old : old <= 8 ? old + 4 : old <= 20 ? old + 12 : old <= 24 ? old + 16 : old <= 48 ? old + 24 : old === 49 ? 100 : 104];
  }));
  assert.deepEqual(LEGACY_STAGE_MAP, expected);
  const mapped = STAGES.filter(stage => stage.legacyStageId !== undefined);
  assert.equal(mapped.length, 50);assert.equal(new Set(mapped.map(stage => stage.legacyStageId)).size, 50);
  for (const stage of mapped) assert.equal(LEGACY_STAGE_MAP[stage.legacyStageId], stage.id);
});

test('the previous 120-stage catalog maps every lesson exactly once after moving elevated targets forward', () => {
  const expected = Object.fromEntries(Array.from({length: 120}, (_, index) => {
    const old = index + 1;
    return [old, old <= 4 ? old : old <= 40 ? old + 4 : old <= 44 ? old - 36 : old];
  }));
  assert.deepEqual(CATALOG_V1_STAGE_MAP, expected);
  assert.equal(new Set(Object.values(CATALOG_V1_STAGE_MAP)).size, 120);
  assert.ok(Object.isFrozen(CATALOG_V1_STAGE_MAP));
  for (const stage of originalStages) assert.equal(CATALOG_V1_STAGE_MAP[stage.catalogV1Id], stage.id);
  assert.deepEqual(STAGES.slice(0, 20).filter((stage, index) => index % 4 === 0).map(stage => stage.lessonKey),
    ['fixed-intro', 'elevated-fixed', 'tracking-intro', 'wind-intro', 'vertical-intro']);
});

test('display order does not reroll a lesson’s walls, irregular motion or people', () => {
  for (const stage of originalStages) {
    const previousIdentity = {...stage, id: stage.catalogV1Id};
    delete previousIdentity.catalogV1Id;
    for (const time of [0, 1.3, 9.3]) {
      assert.deepEqual(targetAt(stage, time), targetAt(previousIdentity, time));
      assert.deepEqual(passersAt(stage, time), passersAt(previousIdentity, time));
    }
    for (const seed of [0, 19, 0x80000000]) {
      const current = prepareStage(stage, seed), original = prepareStage(previousIdentity, seed);
      assert.deepEqual(current.obstacles, original.obstacles, `${stage.id} keeps the same wall layout for the same round`);
      assert.equal(current.targetX, original.targetX); assert.equal(current.wallLayout, original.wallLayout);
      for (const time of [0, 1.3, 9.3]) {
        assert.deepEqual(targetAt(current, time), targetAt(original, time), `${stage.id} keeps its target path`);
        assert.deepEqual(passersAt(current, time), passersAt(original, time), `${stage.id} keeps its moving blockers`);
      }
    }
  }
});

test('moving circular targets replay their complete paths exactly twice as fast without accelerating animals, people or events', () => {
  let moving = 0, stationary = 0, unchangedAnimals = 0;
  for (const template of STAGES) {
    const factor = template.kind === 'target' ? 2 : 1;
    assert.equal(template.targetSpeedScale, 1.15 * factor);
    const earlier = {...template, targetSpeedScale: 1.15,
      motion: {...template.motion, speed: template.motion.speed / factor},
      ...(Number.isFinite(template.passDuration) ? {passDuration: template.passDuration * factor} : {})};
    const isMoving = template.motion.speed > 0 || animalKinds.includes(template.kind);
    if (animalKinds.includes(template.kind)) unchangedAnimals++;
    else if (isMoving) moving++; else stationary++;
    for (const seed of [0, 19]) {
      const current = prepareStage(template, seed), original = prepareStage(earlier, seed);
      assert.deepEqual(current.obstacles, original.obstacles);
      assert.equal(current.targetX, original.targetX);
      if (factor === 1) {
        assert.deepEqual(current.motion, original.motion);
        assert.equal(current.passDuration, original.passDuration);
      }
      for (const time of [0, .25, 1.3, 4.7, 11, 23]) {
        const actual = targetAt(current, time), expected = targetAt(original, time * factor);
        for (const key of ['x', 'y', 'z', 'radius', 'rx', 'ry']) close(actual[key], expected[key], 1e-8);
        close(actual.velocityX, expected.velocityX * factor, 1e-8);
        if (animalKinds.includes(template.kind)) {
          assert.equal(actual.passId, expected.passId); assert.equal(actual.direction, expected.direction);
          assert.deepEqual(actual, targetAt(original, time), 'animals retain their complete previous-release motion and pass duration');
        }
        if (!isMoving) {
          const unchanged = targetAt(original, time);
          assert.equal(actual.x, unchanged.x); assert.equal(actual.y, unchanged.y); assert.equal(actual.velocityX, 0);
        }
        assert.deepEqual(passersAt(current, time), passersAt(original, time), 'people retain real-time motion');
      }
    }
  }
  assert.ok(moving > 0 && stationary > 0 && unchangedAnimals > 0);
  for (const level of [1, 8, 10]) {
    const event = prepareStage(createClayEvent(level), 19);
    assert.equal(event.targetSpeedScale, undefined, 'the main curriculum multiplier is not assigned to the separate gun event');
    for (const time of [0, .7, 2.4, 5.3]) {
      assert.deepEqual(eventTargetsAt(event, time), eventTargetsAt({...event, targetSpeedScale: 2.30}, time),
        'plates and UFOs use their own unchanged trajectories');
    }
  }
});

test('the new second chapter teaches height with calm starter equipment and reachable ten-point centres', () => {
  const heights = [2.60, 2.92, 3.24, 3.61], radii = [1.45, 1.65, 1.85, 2.1];
  // Independently solved full-charge angles with the released basic bow and
  // component-based basic arrow; all are comfortably inside the real input.
  const pitches = [.120682, .116641, .134944, .184281];
  for (const [index, stage] of STAGES.slice(4, 8).entries()) {
    assert.equal(stage.lessonKey, 'elevated-fixed'); assert.equal(stage.distance, distances[index]);
    close(stage.height, heights[index]); assert.equal(stage.radius, radii[index]);
    assert.equal(stage.wind, 0); assert.equal(stage.goal, 12 + index * 2); assert.equal(stage.shots, 5);
    assert.equal(stage.gearTier, 'starter');
    assert.deepEqual(stage.referenceLoadouts, [{family: 'bow', bow: 0, arrow: 0}]);
    assert.deepEqual(stage.motion, {amplitudeX: 0, amplitudeY: 0, speed: 0, irregular: false});
    assert.deepEqual(stage.obstacles, []); assert.deepEqual(stage.passers, []);
    const shot = launchArrow({bow: BOWS[0], arrow: ARROWS[0], charge: 1, velocityBias: 0, yaw: 0, pitch: pitches[index]});
    const result = stepArrow(shot, 8, stage, 0);
    assert.equal(result.type, 'hit'); assert.equal(result.score, 10);
    assert.ok(pitches[index] >= -.15 && pitches[index] <= .55);
  }
});

test('beginners get large calm targets and learn slow tracking before obstacles or animals', () => {
  assert.ok(STAGES.slice(0, 4).every(stage => stage.wind === 0 && stage.radius >= 1.45 && stage.goal <= 16));
  assert.ok(STAGES.slice(0, 20).every(stage => !stage.obstacles.length));
  assert.ok(STAGES.slice(0, 20).filter(stage => stage.lessonKey !== 'wind-intro').every(stage => Math.abs(stage.wind) <= .08));
  assert.ok(STAGES.slice(0, 48).every(stage => (stage.lessonKey === 'wind-intro' || Math.abs(stage.wind) <= .32) && stage.kind === 'target'));
  assert.deepEqual(STAGES.filter(stage => stage.lessonKey === 'wind-intro').map(stage => stage.wind), [1, -1.1, -1.2, 1.3]);
  assert.ok(STAGES.every(stage => Math.abs(stage.wind) <= 1.3));
  for (const stage of STAGES.filter(stage => stage.lessonKey === 'tracking-intro')) {
    const prepared = prepareStage(stage, 31);
    for (let time = 0; time < 40; time += .1) assert.ok(Math.abs(targetAt(prepared, time).velocityX) < 2.30,
      'early tracking stays within twice the previous release’s beginner speed limit');
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
  const hidden = originalStages.filter(stage => stage.visibleFraction === 0);
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

test('later species cross faster relative to their painted body width at every distance, with honest continuous velocity',()=>{
  const directions=new Set();
  for(const distance of[10,20,30,50,...LONG_RANGE_DISTANCES])for(const seed of[0,19,42])for(const passId of[0,1]){
    let previous=0;
    for(const kind of animalKinds){
      const lessonKey=`${distance>50?'long-':''}animal-${kind}`;
      const stage=prepareStage(STAGES.find(s=>s.lessonKey===lessonKey&&s.distance===distance),seed);
      const duration=targetAt(stage,0).passDuration,start=targetAt(stage,duration*passId,passId);
      let sum=0,last=start;
      for(let sample=0;sample<240;sample++){
        const time=duration*(passId+(sample+.5)/240),current=targetAt(stage,time);
        assert.equal(current.passId,passId);assert.equal(current.direction,start.direction);
        assert.ok((current.x-last.x)*start.direction>0,'a visible pass never reverses or teleports');
        // With the same depth, focal length cancels from screen speed / body width.
        sum+=Math.abs(current.velocityX)/current.rx;last=current;directions.add(current.direction);
        if(sample%30===0){
          const h=1e-5,numerical=(targetAt(stage,time+h,passId).x-targetAt(stage,time-h,passId).x)/(2*h);
          close(current.velocityX,numerical,1e-6);
          assert.deepEqual(current,targetAt(prepareStage(stage,seed),time),'the same round seed reproduces the path');
        }
      }
      const speed=sum/240;
      if(previous)assert.ok(speed>=previous*1.05,`${distance}m ${kind}: a larger body must not make the later lesson easier`);
      previous=speed;
      assert.ok(Math.abs(start.x-(stage.targetX||0))>distance,'new animals begin outside the view');
      const end=targetAt(stage,duration*(passId+1),passId);
      assert.ok(Math.abs(end.x-(stage.targetX||0))>distance,'old animals leave before the next pass spawns');
      assert.equal(end.passId,passId,'forced old attachments keep their own continuous pass');
    }
  }
  assert.deepEqual([...directions].sort(),[-1,1]);
});

test('visible species motion has real hops, large leaps, quick bird waves and strong cat bursts',()=>{
  for(const distance of[10,20,30,50,...LONG_RANGE_DISTANCES])for(const seed of[0,19,42]){
    const metrics={};
    for(const kind of animalKinds){
      const key=`${distance>50?'long-':''}animal-${kind}`,stage=prepareStage(STAGES.find(s=>s.lessonKey===key&&s.distance===distance),seed);
      const duration=targetAt(stage,0).passDuration,samples=Array.from({length:600},(_,i)=>targetAt(stage,duration*(i+.5)/600));
      const visible=samples.filter(t=>Math.abs(t.x-(stage.targetX||0))<distance*.42);
      const heights=visible.map(t=>t.y),speeds=visible.map(t=>Math.abs(t.velocityX));
      metrics[kind]={range:(Math.max(...heights)-Math.min(...heights))/stage.radius,
        variation:Math.max(...speeds)/Math.min(...speeds),ground:visible.filter(t=>t.y===stage.height).length/visible.length,
        turns:samples.slice(1,-1).filter((t,i)=>(t.y-samples[i].y)*(samples[i+2].y-t.y)<0).length};
    }
    assert.ok(metrics.rabbit.range>.35&&metrics.rabbit.ground>.3,'rabbit hops visibly leave and return to the ground');
    assert.ok(metrics.deer.range>.45&&metrics.deer.ground>.3,'deer make larger separate leaps');
    assert.ok(metrics.deer.range>metrics.rabbit.range*1.1);
    assert.ok(metrics.wildcat.variation>1.4,'wildcats accelerate and slow inside the visible crossing');
    assert.ok(metrics.cheetah.variation>2.5,'cheetahs visibly alternate a sprint and a slower interval');
    assert.ok(metrics.pigeon.range>.55&&metrics.eagle.range>.55,'bird height changes are large enough to require vertical tracking');
    assert.ok(metrics.pigeon.turns>metrics.eagle.turns,'pigeon waves are quicker than the eagle’s larger swoops');
  }
});

test('difficulty metadata describes the current lesson without overriding its teaching order', () => {
  for (const stage of STAGES) {
    for (const field of ['baseScore','score','angularRadius','movementSpeed','flightSeconds','windDriftPerUnit','cover','windStrength','windDrift']) assert.ok(Number.isFinite(stage.difficulty[field]), `${stage.id}: ${field}`);
    assert.equal(stage.difficulty.windStrength, Math.abs(stage.wind));
    assert.ok(stage.difficulty.cover >= 0 && stage.difficulty.cover <= 1);
  }
  assert.ok(STAGES[4].difficulty.score < STAGES[3].difficulty.score, 'a new height lesson returns to a close target after the long-distance stationary target');
});


test('four optional bands keep the original fifteen upper stages and guide all one hundred long-range stages', () => {
  assert.deepEqual(STAGE_GEAR_BANDS.map(band => [band.gearTier, band.first, band.last]),
    [['starter',1,20],['lower',21,48],['middle',49,105],['upper',106,220]]);
  assert.deepEqual(STAGE_GEAR_BANDS.map(band => band.referenceLoadouts.map(({bow, arrow}) => [bow, arrow])),
    [[[0,0]], [[6,5],[13,5]], [[8,2],[14,2]], [[3,11],[19,11]]]);
  assert.equal(originalStages.filter(stage => stage.gearTier === 'upper').length, 15);
  assert.equal(STAGES.filter(stage => stage.gearTier === 'upper').length, 115);
  for (const band of STAGE_GEAR_BANDS) for (const stage of STAGES.slice(band.first - 1, band.last)) {
    assert.equal(stage.gearTier, band.gearTier);assert.equal(stage.gearLabel, band.gearLabel);
    assert.deepEqual(stage.referenceLoadouts, stage.longRange ?
      band.referenceLoadouts.map(loadout=>({...loadout,arrow:14+LONG_RANGE_DISTANCES.indexOf(stage.distance)})) : band.referenceLoadouts);
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
  for (const stage of originalStages) {
    const [bandMinimum, maximum, wind] = limits[stage.gearTier];
    const minimum=stage.id===72?5:stage.id===112?21:stage.id===116?15:animalKinds.includes(stage.kind)?(stage.gearTier==='upper'?16:7):bandMinimum;
    assert.ok(stage.goal >= minimum && stage.goal <= maximum);
    assert.ok(Math.abs(stage.wind) <= (stage.lessonKey === 'wind-intro' ? 1.3 : wind));
  }
});

test('measured anatomy and tracking caps leave every other original lesson goal on its established curve', () => {
  const caps = new Map([
    [50,19],[51,13],[52,7],[54,23],[55,16],[56,8],
    [58,23],[59,18],[60,11],[62,19],[63,14],[64,7],
    [66,22],[67,15],[68,12],[70,16],[71,17],[72,5],
    [80,24],[84,23],[88,23],[92,23],[95,23],[96,21],
    [97,20],[98,20],[99,20],[100,20],[101,20],[102,20],[103,20],[104,20],[105,20],[106,26],[107,28],[108,28],
    [109,31],[110,30],[111,28],[112,21],[113,28],[114,22],[115,16],[116,15],[117,26],[118,26],[119,28],[120,28]
  ]);
  const originalCurves = {lower:[17,48,18,26], middle:[49,105,26,30], upper:[106,120,32,36]};
  assert.deepEqual(STAGES.slice(0, 20).map(stage => stage.goal),
    [10,12,14,16,12,14,16,18,12,14,16,18,12,14,16,18,12,14,16,18], 'elevated targets use the same gentle progression as other introductory lessons');
  const changed = [];
  for (const stage of originalStages.slice(20)) {
    const [first, last, start, end] = originalCurves[stage.gearTier];
    const originalGoal = Math.round(start + (end - start) * (stage.catalogV1Id - first) / (last - first));
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
        assert.ok(getArrowMass(arrow) <= getArrowMass(previous.arrow));
        assert.ok(getArrowConsistency(arrow) >= getArrowConsistency(previous.arrow));
        assert.ok(getWindResponse(arrow) <= getWindResponse(previous.arrow) && getArrowDragRate(arrow) <= getArrowDragRate(previous.arrow));
      }
      previous = { bow, arrow };
    }
  }
});
