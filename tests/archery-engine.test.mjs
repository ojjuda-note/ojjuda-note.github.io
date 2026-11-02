import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, GRAVITY, WIND_RESPONSE, REFERENCE_ARROW_MASS, MAX_MAIN_PROJECTILE_SPEED, BULLET_SPEED, getArrowMass, getWindResponse, prepareStage, passersAt, BOWS, ARROWS, STAGES, CLAY_EVENT, createClayEvent, eventTargetsAt, targetAt, getSpeed, launchArrow, launchVolley, stepArrow, predictTrajectory, createSway, stepSway, sortEquipment } from '../games/forest-archer/engine.mjs';
import { windLeafAt, windLeafCount } from '../games/forest-archer/scenery.mjs';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const dragFree = { ...ARROWS[0], fletching: { ...ARROWS[0].fletching, drag: 0 } };
const emptyRange = { distance: 10000, radius: 1, height: 2, kind: 'target', motion: {}, wind: 0, obstacles: [] };
const seed = initial => () => { initial = (Math.imul(initial, 1664525) + 1013904223) >>> 0; return initial / 4294967296; };
const animalKinds = ['rabbit', 'wildcat', 'deer', 'pigeon', 'eagle', 'cheetah'];
const animalStage = kind => {
  const stage = STAGES.find(entry => entry.kind === kind);
  assert.ok(stage, `${kind} has a playable encounter`);
  return stage;
};
const releaseMoments = stage => {
  const duration = targetAt(stage, 0).passDuration;
  return Number.isFinite(duration) ? [.25, .35, .45, .55, .65, .75].map(fraction => duration * fraction) : [0, 1, 2, 3.5, 4.5, 5.5, 7, 9, 12, 16];
};

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

// Independent sensitivity fixture: natural .68-scaled sway, real arrow speed
// variance, ±80ms release timing and actual three-shot spread/delay. Partial
// power follows held/1.25, so it receives no impossible early steady bonus.
function volleyResult(params, stage, time, trial=0, steady=false) {
  const random=seed(7321 ^ Math.imul(trial+1,0x9e3779b1)),sway=createSway();
  const velocityBias=trial<0?0:random()*2-1,jitter=trial<0?0:(random()*2-1)*.08;
  const held=Math.max(0,(params.charge>=1?2.5:params.charge*1.25)+jitter);
  for(let frame=0;frame<120;frame++)stepSway(sway,1/60,params.bow,0,random);
  for(let frame=0;frame<Math.ceil(held*60);frame++)stepSway(sway,1/60,params.bow,Math.min(held,(frame+1)/60),random);
  const inSteady=steady&&params.charge>=1;
  const shots=launchVolley({...params,charge:Math.min(1,held/1.25),velocityBias,burstSeed:Math.max(0,trial),
    yaw:params.yaw+(trial<0||inSteady?0:sway.x*.68),pitch:params.pitch+(trial<0||inSteady?0:sway.y*.68)});
  let score=0,hit=false,personHit=false;
  for(const shot of shots){const r=stepArrow(shot,8,stage,time+jitter+shot.launchDelay);hit ||= r?.type==='hit';personHit ||= r?.type==='person';score=Math.max(score,r?.score||0);}
  return {hit:hit&&!personHit,score:personHit?0:score,swayX:sway.x*.68,swayY:sway.y*.68};
}
function wallClearance(params, stage) {
  const shot=launchArrow(params),v=shot.velocity,k=shot.dragRate;let margin=Infinity;
  for(const wall of stage.obstacles)for(const z of[wall.z-wall.depth/2,wall.z+wall.depth/2]) {
    const ratio=k*z/v.z;if(ratio>=1)continue;
    const t=k>1e-8?-Math.log1p(-ratio)/k:z/v.z,b=k>1e-8?-Math.expm1(-k*t)/k:t,c=k>1e-8?(t-b)/k:t*t/2;
    const x=v.x*b+stage.wind*WIND_RESPONSE*shot.windFactor*c,y=PLAYER.y+v.y*b-GRAVITY*c;
    if(x>=wall.x-wall.width/2&&x<=wall.x+wall.width/2)margin=Math.min(margin,y-wall.height);
  }
  return margin;
}
function feasibleAim(stage,bow,arrow) {
  let fallback=null;
  // The actual draw supports the whole 0..1 range; low-power lobs can clear
  // close walls even when a stronger weapon's full-power trajectory cannot.
  for(let chargeStep=25;chargeStep>=0;chargeStep--)for(const time of releaseMoments(stage)) {
    const charge=chargeStep/25;
    const held=charge>=1?2.5:charge*1.25;
    if(time<held+.08)continue;
    const params=centeredAim(stage,charge,bow,arrow,time);
    if(!params||params.pitch<-.15||params.pitch>.55||Math.abs(params.yaw)>.38)continue;
    const result=volleyResult(params,stage,time,-1);
    if(!result.hit)continue;
    const found={params,time,margin:wallClearance(params,stage)};fallback??=found;
    if(found.margin>=.35)return found;
  }
  return fallback;
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

test('leaves show the real arrow drift direction, including calm introductory stages', () => {
  for (const stage of STAGES) {
    const shot = launchArrow({ pitch: .3, arrow: ARROWS[0] });
    stepArrow(shot, .3, { ...emptyRange, wind: stage.wind });
    const leaf = windLeafAt(0, 0, 1000, 600, stage.wind);
    const nextLeaf = windLeafAt(0, .1, 1000, 600, stage.wind);
    assert.equal(Math.sign(nextLeaf.x - leaf.x), Math.sign(shot.position.x));
    close((nextLeaf.x - leaf.x) / .1, leaf.vx);
    const count = windLeafCount(stage.wind);
    assert.ok(count >= 0 && count <= 20, 'keep the animated leaf budget bounded');
    if (!stage.wind) close(shot.position.x, 0);
  }
  const strengths = [0, .1, .3, .6, 1.5];
  const leafSpeeds = strengths.map(wind => Math.abs(windLeafAt(0, 0, 1000, 600, wind).vx));
  assert.ok(leafSpeeds.every((speed, index) => !index || speed > leafSpeeds[index - 1]), 'stronger wind must visibly move leaves faster');
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

test('all six animal species expose finite moving targets with their own hit envelopes', () => {
  for (const kind of animalKinds) {
    const target = targetAt(animalStage(kind), 0);
    assert.equal(target.kind, kind);
    for (const key of ['x', 'y', 'z', 'rx', 'ry', 'velocityX', 'passDuration']) assert.ok(Number.isFinite(target[key]), `${kind} ${key}`);
    assert.ok(target.rx > 0 && target.ry > 0 && target.rx !== target.ry);
    assert.ok(target.passDuration > 0 && target.active);
    assert.ok(target.direction === -1 || target.direction === 1);
  }
});

test('seeded animal passes enter from both sides and vary speed without reversing', () => {
  for (const template of animalKinds.map(animalStage)) {
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

test('all animal distances enter and exit outside normal views; flying targets undulate', () => {
  for (const stage of STAGES.filter(stage => animalKinds.includes(stage.kind))) {
    const first = targetAt(stage, 0), last = targetAt(stage, first.passDuration, first.passId);
    for (const [width, height] of [[390, 600], [1000, 600], [1200, 390], [1600, 900]]) {
      const focal = Math.min(width * 1.08, height * 1.5);
      for (const target of [first, last]) {
        const centerX = width / 2 + target.x * focal / target.z, radius = target.rx * focal / target.z;
        assert.ok(centerX + radius < 0 || centerX - radius > width, 'the entire animal starts/ends off screen');
      }
    }
    if (['bird', 'pigeon', 'eagle'].includes(stage.kind)) {
      const heights = Array.from({ length: 80 }, (_, i) => targetAt(stage, first.passDuration * i / 80).y);
      assert.ok(Math.max(...heights) - Math.min(...heights) > .15, 'bird body flies up and down while crossing');
      assert.ok(Math.min(...heights) > 0);
    }
  }
});

test('a forced hit animal keeps its pass and position continuity after the next encounter starts', () => {
  for (const template of animalKinds.map(animalStage)) {
    const stage = { ...template, encounterSeed: 41 }, first = targetAt(stage, 0), period = first.passDuration;
    const before = targetAt(stage, period - .001, 0), after = targetAt(stage, period + .001, 0);
    assert.equal(after.passId, 0); assert.equal(after.direction, before.direction);
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < .1, 'an attached arrow must not jump to the new animal or restart its hop');
    assert.ok((after.x - before.x) * first.direction > 0);
    const current = targetAt(stage, period + .001);
    assert.equal(current.passId, 1);
    const later = targetAt(stage, period + .5, 0);
    assert.ok((later.x - after.x) * first.direction > 0, 'old hit animal continues travelling away');
  }
});

test('an arrow samples each animal species at the exact crossing time, even at pass boundaries', () => {
  for (const kind of animalKinds) {
    const stage = { ...animalStage(kind), distance: 10, radius: .25, encounterSeed: 93, wind: 0, obstacles: [] };
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
  assert.ok(spread(sortEquipment(ARROWS).at(-1)) < spread(ARROWS[0]) / 10);
  const shot = launchArrow({ arrow: { ...ARROWS[3], fletching: { ...ARROWS[3].fletching, drag: 0 } }, pitch: 0.3 });
  const vy = shot.velocity.y;
  stepArrow(shot, 0.2, emptyRange, 0);
  close(shot.velocity.y, vy - GRAVITY * 0.2);
});

test('twenty-five weapons and fourteen arrows preserve old identities and independent equipment choices', () => {
  assert.equal(BOWS.length, 25); assert.equal(ARROWS.length, 14);
  assert.deepEqual(BOWS.map(item => item.id), Array.from({ length: 25 }, (_, id) => id));
  assert.deepEqual(ARROWS.map(item => item.id), Array.from({ length: 14 }, (_, id) => id));
  assert.deepEqual(BOWS.slice(0, 4).map(item => item.name), ['숲길 목궁', '단풍나무 활', '바람결 활', '달빛 명궁']);
  assert.deepEqual(ARROWS.slice(0, 4).map(item => item.name), ['나무 화살', '깃털 화살', '탄소 화살', '은빛 화살']);
  assert.equal(new Set(BOWS.map(item => item.name)).size, 25);
  assert.equal(new Set(ARROWS.slice(0, 12).map(item => item.fletching.name)).size, 12);
  assert.ok(ARROWS[1].tipMass > ARROWS[2].tipMass, 'different arrow points remain independently selectable');
  for (const bow of BOWS) for (const arrow of ARROWS) {
    const shot = launchArrow({ bow, arrow, charge: 1 });
    assert.ok(Number.isFinite(shot.speed) && shot.speed > 30);
    if (bow.weaponType === 'gun') assert.equal(shot.speed, BULLET_SPEED);
    else assert.ok(shot.speed <= MAX_MAIN_PROJECTILE_SPEED);
    assert.ok(Number.isFinite(shot.dragRate) && shot.dragRate > 0);
  }
});


const originalArrowIdentities = [
  [0, '나무 화살', 0, 1, 4, '넓은 깃', '#b28b64'],
  [1, '깃털 화살', 1050, 4, 8, '큰 안정깃', '#8b9c78'],
  [2, '탄소 화살', 3150, 8, 4, '좁은 날개', '#71999b'],
  [3, '은빛 화살', 5250, 11, 10, '유선형 날개', '#bfc8d0'],
  [4, '가벼운 연습 화살', 300, 2, 2, '작은 깃', '#c3a474'],
  [5, '황동촉 화살', 2000, 6, 12, '직선 깃', '#b99c52'],
  [6, '긴깃 화살', 650, 3, 6, '긴 안정깃', '#9a9c77'],
  [7, '돌풍 화살', 3800, 9, 5, '낮은 날개', '#709ba0'],
  [8, '철갑촉 화살', 1500, 5, 14, '삼각 깃', '#89909b'],
  [9, '비연 화살', 2550, 7, 3, '초소형 날개', '#93a8b3'],
  [10, '금빛 화살', 4500, 10, 9, '곡면 날개', '#ceb36c'],
  [11, '바람깃 화살', 6050, 12, 7, '쐐기 날개', '#82a7a5'],
  [12, '탄성 화살', 6900, 13, 8, '탄성 안정깃', '#be9a69'],
  [13, '자석 화살', 7800, 14, 10, '유도 안정깃', '#629d98']
];
test('equipment rebalancing preserves arrow identities, prices, points and appearances', () => {
  assert.deepEqual(ARROWS.map(item => [item.id, item.name, item.price, item.shopRank, item.tipMass, item.fletching.name, item.color]), originalArrowIdentities);
  assert.ok(ARROWS.slice(0, 12).every(item => !item.ability));
  assert.equal(ARROWS[12].ability.type, 'bounce');
  assert.equal(ARROWS[13].ability.type, 'magnetic');
});

test('shop progression keeps released ranks and prices while adding small stat improvements', () => {
  const weapons = sortEquipment(BOWS.filter(item => item.weaponType !== 'gun'));
  const arrows = sortEquipment(ARROWS);
  assert.deepEqual(weapons.slice(0, 10).map(item => item.id), [0, 4, 5, 6, 1, 2, 8, 7, 9, 3]);
  assert.deepEqual(weapons.slice(10).map(item => item.id), [13, 12, 10, 14, 11, 15, 16, 17, 18, 19]);
  assert.deepEqual(arrows.map(item => item.id), [0, 4, 6, 1, 8, 5, 9, 2, 7, 10, 3, 11, 12, 13]);
  assert.ok(weapons.slice(0, 10).every(item => item.weaponType === 'bow'));
  assert.ok(weapons.slice(10).every(item => item.weaponType === 'crossbow'));
  assert.deepEqual([weapons[0].grip, weapons[0].elasticity], [30, 40], 'the starter retains its familiar strength');
  assert.deepEqual([weapons.at(-1).grip, weapons.at(-1).elasticity], [100, 100]);
  for (let index = 1; index < weapons.length; index++) {
    const before = weapons[index - 1], after = weapons[index];
    const changes = ['grip', 'elasticity'].map(key => after[key] - before[key]);
    assert.ok(changes.every(change => change >= 0 && change <= 10), `weapon rank ${after.shopRank} retains both stats without a large jump`);
    assert.equal(changes.filter(change => change > 0).length, 1, 'each upgrade adds to one stat while preserving the other');
  }
  for (const items of [weapons, arrows]) {
    assert.equal(items[0].id, 0);
    assert.equal(items[0].price, 0, 'the original starter remains free');
    assert.deepEqual(items.map(item => item.shopRank), Array.from({ length: items.length }, (_, index) => index + 1));
    let previousGap = 0;
    for (let index = 1; index < items.length; index++) {
      const gap = items[index].price - items[index - 1].price;
      assert.ok(Number.isInteger(items[index].price));
      assert.ok(gap > previousGap, `rank ${index + 1} must widen the upgrade price gap`);
      assert.ok(items[index].price > 75, 'a perfect first round cannot buy a paid upgrade');
      previousGap = gap;
    }
  }
  assert.deepEqual(weapons.map(item => item.price), [0, 500, 1100, 1800, 2600, 3500, 4500, 5600, 6800, 8100, 9500, 11000, 12600, 14300, 16100, 18000, 20000, 22100, 24300, 26600]);
  assert.deepEqual(arrows.map(item => item.price), [0, 300, 650, 1050, 1500, 2000, 2550, 3150, 3800, 4500, 5250, 6050, 6900, 7800]);
  assert.ok(arrows.at(-1).fletching.stability > arrows[0].fletching.stability);
  assert.ok(getWindResponse(arrows.at(-1)) < getWindResponse(arrows[0]));
  assert.ok(arrows.at(-1).fletching.drag < arrows[0].fletching.drag);
  for (const weapon of weapons.filter(item => item.scopeCompatible)) {
    assert.ok(weapon.scopePrice >= 500 && weapon.scopePrice >= weapon.price * .2, 'a permanent scope also requires meaningful savings');
  }
  assert.deepEqual(BOWS.filter(item => item.weaponType === 'gun').map(item => item.price), [0, 950, 1250, 1750, 2200], 'event weapon prices remain outside this main-gear change');
});

test('ability sorting uses the selected actual stat without mutating saved equipment identities', () => {
  const weapons = BOWS.filter(item => item.weaponType !== 'gun'), weaponIds = weapons.map(item => item.id), arrowIds = ARROWS.map(item => item.id);
  const assertOrder = (items, key, value, direction) => {
    const sorted = sortEquipment(items, key);
    assert.notEqual(sorted, items, 'sorting returns a new view');
    assert.equal(sorted.length, items.length);
    assert.equal(new Set(sorted.map(item => item.id)).size, items.length);
    assert.ok(sorted.every(item => items.includes(item)), 'cards retain the original equipment objects and IDs');
    for (let index = 1; index < sorted.length; index++) {
      const difference = value(sorted[index]) - value(sorted[index - 1]);
      assert.ok(direction * difference >= -1e-12, `${key} order at ${index}`);
      if (difference === 0) assert.ok(sorted[index].shopRank > sorted[index - 1].shopRank, 'equal stats retain progression order');
    }
    return sorted;
  };
  assertOrder(weapons, 'grip', item => item.grip, -1);
  assertOrder(weapons, 'elasticity', item => item.elasticity, -1);
  assertOrder(BOWS.filter(item => item.weaponType === 'gun'), 'elasticity', item => item.power, -1);
  assertOrder(ARROWS, 'wind', getWindResponse, 1);
  assertOrder(ARROWS, 'stability', item => item.fletching.stability, -1);
  assertOrder(ARROWS, 'tip-light', item => item.tipMass, 1);
  assertOrder(ARROWS, 'tip-heavy', item => item.tipMass, -1);
  assert.deepEqual(sortEquipment(weapons, 'unknown').map(item => item.id), sortEquipment(weapons).map(item => item.id));
  assert.deepEqual(weapons.map(item => item.id), weaponIds);
  assert.deepEqual(BOWS.map(item => item.id), Array.from({ length: 25 }, (_, id) => id));
  assert.deepEqual(ARROWS.map(item => item.id), arrowIds);
});

test('all twenty main weapon tiers progressively extend the steady opportunity from half a second to two seconds', () => {
  const weapons = sortEquipment(BOWS.filter(item => item.weaponType !== 'gun'));
  assert.equal(weapons[0].steadyDuration, .5);
  assert.equal(weapons[9].steadyDuration, 1.21, 'the strongest bow sits between entry bows and crossbows');
  assert.equal(weapons[10].steadyDuration, 1.29);
  assert.equal(weapons.at(-1).id, 19);
  assert.equal(weapons.at(-1).steadyDuration, 2);
  for (let index = 1; index < weapons.length; index++) {
    assert.ok(weapons[index].steadyDuration > weapons[index - 1].steadyDuration);
    assert.ok(weapons[index].steadyDuration <= 2);
  }
  assert.ok(BOWS.filter(item => item.weaponType === 'gun').every(item => item.steadyDuration === .5), 'the event guns retain their separate aiming rules');
});

test('all main weapon upgrades preserve speed and range with bounded gains, including the first crossbow', () => {
  assert.equal(BOWS.filter(bow => bow.weaponType === 'bow').length, 10);
  const crossbows = BOWS.filter(bow => bow.weaponType === 'crossbow');
  assert.equal(crossbows.length, 10);
  assert.ok(crossbows.every(bow => bow.name.includes('석궁')));
  assert.deepEqual(BOWS.filter(bow => bow.scopeCompatible).map(bow => bow.id), [3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24]);
  assert.ok(BOWS.filter(bow => bow.scopeCompatible).every(bow => bow.scopePrice > 0));
  const weapons = sortEquipment(BOWS.filter(bow => bow.weaponType !== 'gun'));
  for (const item of ARROWS) for (const charge of [.5, 1]) for (const pitch of [.15, .30, .55]) {
    // Compare the shared flight model; bounce and guidance have separate tests.
    const arrow = { ...item, ability: null };
    let previous = null;
    for (const bow of weapons) {
      const shot = launchArrow({ bow, arrow, pitch, charge, velocityBias: 0 });
      const result = stepArrow(shot, 8, emptyRange);
      assert.equal(result.type, 'ground');
      if (previous) {
        const label = `weapon ${previous.id} → ${bow.id}, arrow ${item.id}, charge ${charge}, pitch ${pitch}`;
        assert.ok(shot.speed >= previous.speed - 1e-8, `${label} keeps launch speed`);
        assert.ok(shot.speed <= previous.speed * 1.07, `${label} adds at most 7% launch speed`);
        assert.ok(result.point.z >= previous.range - 1e-8, `${label} keeps actual ground range`);
        assert.ok(result.point.z <= previous.range * 1.15, `${label} adds at most 15% ground range`);
        close(shot.dragRate, previous.dragRate);
      }
      previous = { id: bow.id, speed: shot.speed, range: result.point.z, dragRate: shot.dragRate };
    }
  }
});

test('main weapon upgrades reduce actual sway and wind drift without losing forward speed', () => {
  const weapons = sortEquipment(BOWS.filter(bow => bow.weaponType !== 'gun'));
  let previousSway = Infinity;
  for (const bow of weapons) {
    const sway = createSway(), random = seed(137);
    let sum = 0;
    for (let frame = 0; frame < 360; frame++) {
      stepSway(sway, 1 / 60, bow, frame / 60, random);
      sum += sway.x ** 2 + sway.y ** 2;
    }
    assert.ok(sum <= previousSway + 1e-12, `${bow.name} must not reintroduce aim motion`);
    previousSway = sum;
  }
  const range = { ...emptyRange, distance: 20, radius: 100, wind: 1.3 };
  for (const item of ARROWS) for (const charge of [.5, 1]) {
    let previous = null;
    for (const bow of weapons) {
      const shot = launchArrow({ bow, arrow: { ...item, ability: null }, pitch: .3, charge, velocityBias: 0 });
      const result = stepArrow(shot, 8, range);
      assert.equal(result.type, 'hit');
      assert.ok(result.point.x > 0, 'wind remains part of every trajectory');
      if (previous) {
        assert.ok(result.flightTime <= previous.flightTime + 1e-8, `${bow.name} reaches the same plane no later`);
        assert.ok(result.point.x <= previous.drift + 1e-8, `${bow.name} never increases wind drift`);
        assert.ok(shot.velocity.z >= previous.forwardSpeed - 1e-8, `${bow.name} retains downrange speed`);
      }
      previous = { flightTime: result.flightTime, drift: result.point.x, forwardSpeed: shot.velocity.z };
    }
  }
});

test('arrow ranks balance point mass and gradually retain or improve all base flight stats', () => {
  const arrows = sortEquipment(ARROWS);
  for (const arrow of arrows) {
    assert.equal(getArrowMass(arrow), REFERENCE_ARROW_MASS, `${arrow.name} balances its point with its shaft`);
    assert.ok(arrow.shaftMass > 0);
  }
  for (let index = 1; index < arrows.length; index++) {
    const before = arrows[index - 1].fletching, after = arrows[index].fletching;
    const stabilityGain = after.stability - before.stability;
    const windGain = before.windArea - after.windArea, dragGain = before.drag - after.drag;
    assert.ok(stabilityGain >= 0 && stabilityGain <= 10);
    assert.ok(windGain >= -1e-12 && windGain <= .15 + 1e-12);
    assert.ok(dragGain >= -1e-12 && dragGain <= .02 + 1e-12);
    if (!arrows[index].ability) assert.ok(stabilityGain > 0 || windGain > 0 || dragGain > 0, 'each ordinary upgrade improves at least one stat');
    else assert.deepEqual([after.stability, after.windArea, after.drag], [before.stability, before.windArea, before.drag], 'special abilities retain the strongest ordinary base flight');
  }
});

test('arrow upgrades narrow native speed spread and retain actual range while reducing wind drift', () => {
  const arrows = sortEquipment(ARROWS), bows = [BOWS[0], BOWS[3], BOWS[13], BOWS[15], BOWS[19]];
  for (const bow of bows) for (const charge of [.5, 1]) for (const pitch of [.15, .30, .55]) {
    let previous = null;
    for (const item of arrows) {
      const arrow = { ...item, ability: null }, params = { bow, arrow, charge, pitch, velocityBias: 0 };
      const shot = launchArrow(params), low = getSpeed({ ...params, velocityBias: -1 }), high = getSpeed({ ...params, velocityBias: 1 });
      const result = stepArrow(shot, 8, emptyRange);
      assert.equal(result.type, 'ground');
      const windShot = launchArrow({ ...params, pitch: .3 });
      const windy = stepArrow(windShot, 8, { ...emptyRange, distance: 20, radius: 100, wind: 1.3 });
      assert.equal(windy.type, 'hit');
      if (previous) {
        const label = `arrow ${previous.id} → ${item.id} with ${bow.name}, charge ${charge}, pitch ${pitch}`;
        close(shot.speed, previous.speed);
        assert.ok(low >= previous.low - 1e-8 && high <= previous.high + 1e-8, `${label} narrows the random speed envelope`);
        assert.ok(previous.high - previous.low - (high - low) <= shot.speed * .04 + 1e-8, `${label} improves spread by at most four percent of nominal speed`);
        assert.ok(result.point.z >= previous.range - 1e-8, `${label} retains ground range`);
        assert.ok(result.point.z <= previous.range * 1.15, `${label} adds at most 15% ground range`);
        assert.ok(windy.point.x <= previous.drift + 1e-8, `${label} retains wind resistance`);
        assert.ok(windy.flightTime <= previous.flightTime + 1e-8, `${label} reaches the same plane no later`);
        assert.ok(windShot.velocity.z >= previous.forwardSpeed - 1e-8, `${label} retains downrange speed`);
      }
      previous = { id: item.id, speed: shot.speed, low, high, range: result.point.z, drift: windy.point.x,
        flightTime: windy.flightTime, forwardSpeed: windShot.velocity.z };
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
    assert.deepEqual(shots[0].velocity, launchArrow({ ...params, bow }).velocity, 'adding a burst preserves the aimed central shot');
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

test('five guns fire at exactly twice the actual maximum archery speed regardless of arrows, charge or random bias', () => {
  const guns = BOWS.filter(weapon => weapon.weaponType === 'gun');
  const mainSpeeds = BOWS.filter(weapon => weapon.weaponType !== 'gun').flatMap(bow => ARROWS.map(arrow =>
    getSpeed({ bow, arrow, charge: 1, velocityBias: 1 })));
  assert.equal(mainSpeeds.length, 20 * 14);
  assert.equal(MAX_MAIN_PROJECTILE_SPEED, Math.max(...mainSpeeds));
  assert.equal(BULLET_SPEED, Math.max(...mainSpeeds) * 2);
  assert.equal(guns.length, 5);
  assert.deepEqual(guns.map(gun => gun.magazineSize), [2, 4, 6, 8, 10]);
  assert.deepEqual(guns.map(gun => gun.reloadSeconds), [3, 2.5, 2, 1.5, 1]);
  assert.deepEqual(guns.map(gun => gun.reloadLabel), ['느림', '보통', '보통', '빠름', '빠름']);
  for (const gun of guns) {
    assert.ok(gun.power > 0 && !Object.hasOwn(gun, 'elasticity'));
    assert.equal(gun.muzzleSpeed, BULLET_SPEED);assert.equal(gun.speed, BULLET_SPEED);assert.equal(gun.ammo.variance, 0);
    const reference = launchArrow({ bow: gun, arrow: ARROWS[0], charge: 0, pitch: .1 });
    for (const arrow of ARROWS) for (const charge of [0, .5, 1]) for (const velocityBias of [-1, 0, 1]) {
      const shot = launchArrow({ bow: gun, arrow, charge, velocityBias, pitch: .1 });
      assert.deepEqual(shot.velocity, reference.velocity);
      assert.equal(getSpeed({ bow: gun, arrow, charge, velocityBias }), BULLET_SPEED);
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

test('event gun upgrades retain aiming, ammunition and reload performance with gradually better ballistics', () => {
  const guns = sortEquipment(BOWS.filter(weapon => weapon.weaponType === 'gun'));
  for (let index = 1; index < guns.length; index++) {
    const before = guns[index - 1], after = guns[index];
    for (const key of ['grip', 'power']) assert.ok(after[key] >= before[key] && after[key] <= before[key] + 10, `${after.name} gradually improves ${key}`);
    assert.ok(after.magazineSize >= before.magazineSize && after.magazineSize <= before.magazineSize + 2, 'an upgrade adds at most two magazine rounds');
    assert.ok(after.reloadSeconds < before.reloadSeconds && after.reloadSeconds >= before.reloadSeconds - .5, 'each step shortens the reload by at most half a second');
    assert.ok(after.sway <= before.sway);
  }
  for (const distance of [10, 30, 50]) {
    let previous = null;
    for (const bow of guns) {
      const shot = launchArrow({ bow, pitch: .15 });
      const result = stepArrow(shot, 8, { ...emptyRange, distance, radius: 100, wind: 1.3 });
      assert.equal(result.type, 'hit');
      if (previous) {
        assert.ok(result.flightTime <= previous.flightTime + 1e-8, `${bow.name} keeps travel time at ${distance}m`);
        assert.ok(result.point.x <= previous.drift + 1e-8, `${bow.name} keeps wind resistance at ${distance}m`);
        assert.ok(shot.velocity.z >= previous.forwardSpeed - 1e-8, `${bow.name} keeps downrange speed at ${distance}m`);
        assert.ok(shot.velocity.z <= previous.forwardSpeed * 1.02, `${bow.name} adds at most 2% downrange speed at ${distance}m`);
      }
      previous = { flightTime: result.flightTime, drift: result.point.x, forwardSpeed: shot.velocity.z };
    }
  }
});

test('double-speed event bullets finish misses at the target plane while arrows keep falling', () => {
  const stage = prepareStage(createClayEvent(10), 17), time = stage.flightSeconds * 1.04 + .2;
  assert.equal(eventTargetsAt(stage, time).length, 0, 'the fixture fires in a gap between target waves');
  for (const gun of BOWS.filter(weapon => weapon.weaponType === 'gun')) {
    const straight = launchArrow({ bow: gun, charge: 0 });
    const straightBudget = stage.distance / straight.velocity.z * 1.05;
    const result = stepArrow(straight, straightBudget, stage, time);
    assert.equal(result.type, 'miss');
    assert.ok(result.flightTime < straightBudget && result.flightTime < .3, 'a straight event shot remains prompt with the current double-speed ammunition');
    for (const yaw of [-.48, 0, .48]) for (const pitch of [0, .58]) for (const velocityBias of [-1, 1]) {
      const shot = launchArrow({ bow: gun, charge: 0, yaw, pitch, velocityBias });
      const budget = stage.distance / shot.velocity.z * 1.05;
      const missed = stepArrow(shot, budget, stage, time);
      assert.equal(missed.type, 'miss');assert.equal(missed.score, 0);
      assert.ok(missed.flightTime > 0 && missed.flightTime < budget && missed.flightTime < .4, `${gun.name} took ${missed.flightTime}s at the aiming limits`);
      close(missed.point.z, stage.distance);
      assert.equal(shot.active, false, 'missed event bullets do not linger until an eight-second timeout');
    }
  }
  const arrow = launchArrow({ bow: BOWS[0], pitch: .3 });
  stepArrow(arrow, 1.2, stage, time);
  assert.equal(arrow.targetPassed, true);assert.equal(arrow.active, true);
  assert.ok(arrow.position.z > stage.distance, 'arrows still fly beyond a missed target');
  assert.equal(stepArrow(arrow, 8, stage, time + 1.2).type, 'ground', 'arrow fall and ground collisions remain unchanged');
});

test('ten timed event levels progress from two to ten simultaneous targets in three finite waves', () => {
  assert.ok(!STAGES.includes(CLAY_EVENT));
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
      const shot = launchArrow(params), budget = stage.distance / shot.velocity.z * 1.05;
      assert.ok(result.flightTime < budget && result.flightTime < .4, 'both plates and UFOs are reached within the current ammunition flight budget');
      const coarse = stepArrow(shot, budget, stage, time);
      assert.equal(coarse.type, 'hit');assert.equal(coarse.targetCenter.passId, passId);assert.equal(coarse.score, 10);
      close(coarse.flightTime, result.flightTime);
      for (const axis of ['x', 'y', 'z']) close(coarse.point[axis], result.point[axis]);
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
    { ...animalStage('pigeon'), radius: 50, obstacles: [] }
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

test('all main stages keep physically valid targets, cover and independent people blockers', () => {
  assert.deepEqual(STAGES.map(stage => stage.id), Array.from({ length: STAGES.length }, (_, index) => index + 1));
  assert.equal(new Set(STAGES.map(stage => stage.name)).size, STAGES.length);
  for (const stage of STAGES) {
    const target = targetAt(stage, 0);
    assert.ok(target.z > 0 && target.rx > 0 && target.ry > 0);
    for (const obstacle of stage.obstacles) {
      assert.ok(obstacle.width > 0 && obstacle.height > 0 && obstacle.depth > 0);
      assert.ok(obstacle.z - obstacle.depth / 2 > 0, 'cover lies in front of the player');
      assert.ok(obstacle.z + obstacle.depth / 2 < target.z, 'cover stays in front of the target plane');
    }
    for (const person of passersAt(stage, 0)) {
      assert.ok(person.width > 0 && person.height > 0 && person.depth > 0);
      assert.ok(person.z > 0 && person.z < target.z);
    }
    const pillars = stage.obstacles.filter(obstacle => obstacle.type === 'pillar').sort((a, b) => a.x - b.x);
    for (let index = 1; index < pillars.length; index++) {
      assert.ok(pillars[index].x - pillars[index].width / 2 > pillars[index - 1].x + pillars[index - 1].width / 2,
        'separate columns retain real gaps for projectiles');
    }
  }
});

test('seeded cover layouts vary without mutating templates or accumulating offsets on retry', () => {
  const wallTargets = STAGES.filter(stage => stage.kind === 'target' && stage.obstacles.length);
  for (const template of wallTargets) {
    const original = JSON.stringify(template), slots = new Set(), positions = [];
    for (let seedValue = 0; seedValue < 24; seedValue++) {
      const stage = prepareStage(template, seedValue); slots.add(stage.wallLayout); positions.push(stage.targetX);
      assert.deepEqual(stage, prepareStage(template, seedValue), 'the same seed reproduces the same layout');
      assert.deepEqual(stage, prepareStage(prepareStage(template, seedValue + 1), seedValue), 'retry layout must not accumulate old offsets');
      assert.notEqual(stage.obstacles, template.obstacles);
      assert.ok(stage.obstacles.every((obstacle, index) => obstacle !== template.obstacles[index]));
    }
    assert.equal(JSON.stringify(template), original, 'preparing rounds must leave the shared template unchanged');
    assert.deepEqual([...slots].sort(), ['center', 'left', 'right']);
    assert.ok(Math.max(...positions) - Math.min(...positions) > .05, 'different layouts really move the target');
  }
});

test('slow introductory moving targets and pillar targets keep continuous reproducible uneven motion', () => {
  const templates = [STAGES.find(stage => stage.kind === 'target' && stage.motion.speed && !stage.obstacles.length),
    STAGES.find(stage => stage.kind === 'target' && stage.motion.speed && stage.obstacles.some(obstacle => obstacle.type === 'pillar'))];
  for (const template of templates) {
    const stage = prepareStage(template, 1234), repeated = prepareStage(template, 1234), different = prepareStage(template, 9876);
    let differentPositions = 0, previous = targetAt(stage, 0), maxSpeed = 0, minSpeed = Infinity;
    for (let time = .02; time <= 120; time += .02) {
      const current = targetAt(stage, time);
      assert.deepEqual(current, targetAt(repeated, time));
      if (Math.abs(current.x - targetAt(different, time).x) > .05) differentPositions++;
      assert.ok(Math.abs(current.x - previous.x) < .08, 'slower irregular motion must not teleport');
      const epsilon = .0001;
      const measuredSpeed = (targetAt(stage, time + epsilon).x - targetAt(stage, time - epsilon).x) / (2 * epsilon);
      close(current.velocityX, measuredSpeed, .00001);
      maxSpeed = Math.max(maxSpeed, Math.abs(current.velocityX));
      minSpeed = Math.min(minSpeed, Math.abs(current.velocityX));
      previous = current;
    }
    assert.ok(differentPositions > 100, 'new round seeds change the movement rhythm');
    assert.ok(maxSpeed > minSpeed * 1.15, 'targets accelerate and slow continuously');
  }
});

test('pillar gaps let arrows pass while the adjoining column stops the same low shot', () => {
  const stage = { ...emptyRange, obstacles: STAGES.find(stage => stage.obstacles[0]?.type === 'pillar').obstacles };
  const left = stage.obstacles[0], right = stage.obstacles[1], time = left.z / 200;
  const gapX = (left.x + left.width / 2 + right.x - right.width / 2) / 2;
  for (const [x, expected] of [[gapX, null], [right.x, 'obstacle']]) {
    const shot = launchArrow({ arrow: dragFree });
    shot.position.x = x; shot.position.y = Math.min(1.5, right.height / 2); shot.velocity = { x: 0, y: 0, z: 200 };
    const result = stepArrow(shot, time + .01, stage);
    assert.equal(result?.type ?? null, expected);
    if (result) close(result.point.z, right.z - right.depth / 2);
  }
});

test('passing people are seeded offscreen arrivals with independent directions and walking speeds', () => {
  const base = {...emptyRange, id: 71, distance: 50};
  const config = {id: 0, z: 42, width: 1, height: 2, depth: .42, passDuration: 28, phase: 0};
  const directions = new Set(), speeds = new Set();
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

test('every mission remains reachable with starter equipment across seeded layouts and normal aiming limits', () => {
  for (const seedValue of [0, 5, 19, 0xfffffffe]) for (const template of STAGES) {
    const stage = prepareStage(template, seedValue);
    let feasible = false;
    for (const time of releaseMoments(stage)) {
      for (let charge = 1; charge >= .4; charge -= .08) {
        const params = centeredAim(stage, charge, BOWS[0], ARROWS[0], time);
        if (!params || params.pitch < -.15 || params.pitch > .55 || Math.abs(params.yaw) > .38) continue;
        const result = predictTrajectory(params, stage, time).result;
        if (result?.type === 'hit' && result.score === 10) { feasible = true; break; }
      }
      if (feasible) break;
    }
    assert.ok(feasible, `stage ${stage.id}, seed ${seedValue} must be reachable with the starter bow and arrow within normal aim controls`);
  }
});

test('every stage has a reachable bullseye with all twelve ordinary arrow types', () => {
  for (const arrow of ARROWS.slice(0, 12)) for (const stage of STAGES) {
    let feasible = null;
    // Crossing animals and blockers do not promise a clear shot at exactly 2s.
    // Search ordinary release moments without disabling real cover or wind.
    for (const time of releaseMoments(stage)) {
      for (const bow of [BOWS[0], BOWS[2], BOWS[3]]) {
        for (let charge = 1; charge >= 0.4; charge -= 0.04) {
          const params = centeredAim(stage, charge, bow, arrow, time);
          if (!params || params.pitch > 0.55 || params.pitch < -0.15 || Math.abs(params.yaw) > .38) continue;
          const result = predictTrajectory(params, stage, time).result;
          if (result?.type === 'hit' && result.score === 10) { feasible = { charge, pitch: params.pitch, bow: bow.id, time }; break; }
        }
        if (feasible) break;
      }
      if (feasible) break;
    }
    assert.ok(feasible, `Stage ${stage.id} must have a reachable target with ${arrow.name}`);
  }
});


test('every recommended bow and crossbow can complete its assigned stage with the real burst and drag model', () => {
  for (const seedValue of [0, 5, 19, 0xfffffffe]) for (const template of STAGES) {
    const stage = prepareStage(template, seedValue);
    for (const loadout of stage.referenceLoadouts) {
      assert.equal(BOWS[loadout.bow].weaponType, loadout.family);
      const found = feasibleAim(stage, BOWS[loadout.bow], ARROWS[loadout.arrow]);
      assert.ok(found, `${stage.id}: ${loadout.family} ${loadout.bow}/${loadout.arrow} can reach the real target`);
      assert.ok(found.params.pitch >= -.15 && found.params.pitch <= .55 && Math.abs(found.params.yaw) <= .38);
      const shots = launchVolley({...found.params, burstSeed: seedValue});
      const results = shots.map(shot => stepArrow(shot, 8, stage, found.time + shot.launchDelay));
      assert.ok(results.every(result => result?.type !== 'person'), 'a person blocking any burst shot invalidates the entire trigger');
      assert.ok(results.some(result => result?.type === 'hit'), 'changing the burst orientation must retain a feasible aimed hit');
    }
  }
});

test('all 120 reference goals retain real five-shot margins with sway, timing, variance and person collisions', () => {
  // The full curriculum catches narrow moving gaps and shorter combined
  // obstacles that a few long-distance examples would miss.
  const adjustedGoals = new Set([52, 56, 72, 80, 84, 88, 92, 95, 96, 103, 110, 111, 112, 120]);
  // Retain the established +10-point comparison at 50m. Near targets can
  // already give the starter over 40 points, leaving less than 10 to improve.
  const upgradeComparisons = new Set([108, 112, 116, 120]);
  const sample = (stage, found) => {
    let normal = 0, steady = 0;
    for (let trial = 0; trial < 96; trial++) {
      normal += volleyResult(found.params, stage, found.time, trial).score;
      steady += volleyResult(found.params, stage, found.time, trial, true).score;
    }
    // One deliberately timed steady release out of five, only when the draw
    // really reaches full charge. Subsecond lob shots keep their actual sway.
    return {normal: normal / 96, steady: steady / 96,
      fiveShots: found.params.charge >= 1 ? (normal * 4 + steady) / 96 : normal * 5 / 96};
  };
  for (const template of STAGES) {
    const stage = prepareStage(template, 19);
    let baseline = null, minimumMargin = Infinity;
    if (upgradeComparisons.has(stage.id)) {
      assert.equal(stage.gearTier, 'upper'); assert.equal(stage.distance, 50);
      const basic = feasibleAim(stage, BOWS[0], ARROWS[0]);
      assert.ok(basic, 'equipment recommendations must not impose an artificial purchase lock');
      baseline = sample(stage, basic);
    }
    for (const loadout of stage.referenceLoadouts) {
      const found = feasibleAim(stage, BOWS[loadout.bow], ARROWS[loadout.arrow]);
      assert.ok(found);
      const result = sample(stage, found);
      minimumMargin = Math.min(minimumMargin, result.fiveShots - stage.goal);
      assert.ok(result.fiveShots >= stage.goal,
        `${stage.id} ${loadout.family}: ${result.fiveShots.toFixed(2)} expected points supports the ${stage.goal}-point reference goal`);
      if (baseline) {
        assert.ok(result.fiveShots >= baseline.fiveShots + 10,
          'upper equipment supplies measurable aiming/flight margin instead of being a label or access gate');
        assert.ok(BOWS[loadout.bow].steadyDuration > BOWS[0].steadyDuration);
      }
    }
    if (adjustedGoals.has(stage.id)) assert.ok(minimumMargin >= 1,
      `${stage.id}: the calibrated goal keeps at least one expected point of margin for its weaker reference (${minimumMargin.toFixed(2)} actual)`);
  }
});
