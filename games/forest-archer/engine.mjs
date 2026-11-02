/** Deterministic metre/second archery simulation. Coordinates: x right, y up, z forward. */
export const PLAYER = Object.freeze({ x: 0, y: 1.65, z: 0 });
export const GRAVITY = 9.81;
export const WIND_RESPONSE = 2.5;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Game ratings: grip controls aiming; elasticity controls stored launch energy.
const bowSway = grip => 0.008 + 0.0006 * (100 - clamp(grip, 0, 100));
const bowSpeed = elasticity => 32 + 0.30 * clamp(elasticity, 0, 100);
export const REFERENCE_ARROW_MASS = 24; // grams, used for bow speed comparisons
const bow = (id, name, tag, description, grip, elasticity, color) => {
  const weaponType = id >= 10 && id < 20 ? 'crossbow' : 'bow';
  const launchBoost = weaponType === 'crossbow' ? 1.55 : 1;
  const scopeCompatible = [3, 7, 8, 9].includes(id) || id >= 10;
  const burstTier = id >= 15 && id < 20 ? id - 15 : -1;
  return {
    id, name, tag, description, grip, elasticity, color, weaponType,
    launchBoost, extraDragRate: [1.0, 1.35, 1.05, 1.25, 1.15, 1.25, 1.30, 1.20, 1.28, 1.30][id - 10] || 0,
    burstCount: burstTier >= 0 ? 3 : 1,
    burstInterval: burstTier >= 0 ? [.14, .125, .11, .095, .08][burstTier] : 0,
    burstSpread: burstTier >= 0 ? [.024, .018, .012, .008, .0045][burstTier] : 0,
    grouping: burstTier >= 0 ? [35, 50, 70, 84, 96][burstTier] : 100,
    rarity: burstTier >= 0 ? '레어' : '일반',
    scopeCompatible, scopePrice: 0,
    sway: bowSway(grip), speed: bowSpeed(elasticity) * launchBoost
  };
};
const arrow = (id, name, tag, description, tipMass, wingName, windArea, drag, stability, color) => ({
  id, name, tag, description, tipMass, shaftMass: 20, color,
  fletching: { name: wingName, windArea, drag, stability },
  variance: 0.20 * (1 - stability / 100),
  windFactor: windArea * REFERENCE_ARROW_MASS / (20 + tipMass)
});
const gun = (id, name, tag, description, price, grip, power, mass, windFactor, dragRate, color) => ({
  id, name, tag, description, price, grip, power, muzzleSpeed: 0, color, weaponType: 'gun',
  speed: 0, sway: bowSway(grip), burstCount: 1, burstInterval: 0, burstSpread: 0,
  grouping: 100, rarity: '일반', scopeCompatible: id >= 22, scopePrice: id >= 22 ? 240 : 0,
  magazineSize: [2, 2, 4, 4, 10][id - 20],
  reloadSeconds: [3, 1.3, 3.2, 1.5, 2.8][id - 20],
  reloadLabel: ['느림', '빠름', '느림', '빠름', '보통'][id - 20],
  ammo: { name: '기본 탄환', mass, windFactor, dragRate, variance: 0 }
});

// Shop rank is independent of permanent save IDs. Keep the physical trade-offs:
// grip and elasticity matter for bows; bursts also gain value from grouping.
// Arrow mass is not a quality score: compare stability, side drift and drag.
function equipmentScore(item) {
  if (item.fletching) {
    const wind = item.fletching.windArea * REFERENCE_ARROW_MASS / (item.shaftMass + item.tipMass);
    return .4 * item.fletching.stability +
      40 * (1 - clamp(wind / 1.3, 0, 1)) +
      20 * (1 - clamp(item.fletching.drag / .2, 0, 1));
  }
  if (item.weaponType === 'crossbow') {
    return .4 * item.grip + .4 * item.elasticity + (item.burstCount > 1 ? .2 * item.grouping : 0);
  }
  return .5 * item.grip + .5 * (item.elasticity ?? item.power);
}
function equipmentCatalog(items, kind) {
  const ranked = items.filter(item => item.weaponType !== 'gun').slice().sort((a, b) =>
    (kind === 'arrow' ? Number(!!a.ability) - Number(!!b.ability) || (a.ability && b.ability ? a.id - b.id : 0) : 0) ||
    Number(a.weaponType === 'crossbow') - Number(b.weaponType === 'crossbow') ||
    equipmentScore(a) - equipmentScore(b) || a.id - b.id);
  const familyRanks = new Map();
  ranked.forEach((item, rank) => {
    item.shopRank = rank + 1;
    const family = item.weaponType || kind;
    item.familyRank = (familyRanks.get(family) || 0) + 1;
    familyRanks.set(family, item.familyRank);
    // Increasing marginal costs keep early choices reachable and later gear a goal.
    item.price = kind === 'arrow' ? 300 * rank + 25 * rank * (rank - 1) : 500 * rank + 50 * rank * (rank - 1);
    if (kind === 'weapon') {
      item.gearTier = item.weaponType === 'bow' && item.familyRank === 1 ? 'starter' :
        item.familyRank <= (item.weaponType === 'bow' ? 4 : 3) ? 'lower' : item.familyRank <= 7 ? 'middle' : 'upper';
      item.gearLabel = {starter:'기본',lower:'하위',middle:'중간',upper:'상위'}[item.gearTier];
      item.steadyDuration = Math.round((.5 + 1.5 * rank / (ranked.length - 1)) * 100) / 100;
      item.scopePrice = item.scopeCompatible ? Math.max(500, Math.ceil(item.price * .2 / 50) * 50) : 0;
    }
  });
  // Event guns have their own shop and retain their separate economy and timing.
  items.filter(item => item.weaponType === 'gun').forEach((item, rank) => {
    item.shopRank = rank + 1;item.familyRank = rank + 1;item.steadyDuration = .5;
  });
  return Object.freeze(items);
}

/** Display-only sorting; stable IDs continue to address inventory and bound scopes. */
export function sortEquipment(items, key = 'progression') {
  const rank = item => item.shopRank ?? item.id + 1;
  const value = item => {
    if (key === 'grip') return -(item.grip ?? 0);
    if (key === 'elasticity') return -(item.elasticity ?? item.power ?? 0);
    if (key === 'steady') return -(item.steadyDuration ?? .5);
    if (key === 'grouping') return item.burstCount > 1 ? -(item.grouping ?? 0) : 1;
    if (key === 'magazine') return -(item.magazineSize ?? 0);
    if (key === 'reload') return item.reloadSeconds ?? Infinity;
    if (key === 'wind') return getWindResponse(item);
    if (key === 'stability') return -(item.fletching?.stability ?? 0);
    if (key === 'tip-light') return item.tipMass ?? 0;
    if (key === 'tip-heavy') return -(item.tipMass ?? 0);
    return rank(item);
  };
  return [...items].sort((a, b) => value(a) - value(b) || rank(a) - rank(b) || a.id - b.id);
}

export const BOWS = equipmentCatalog([
  bow(0, '숲길 목궁', '입문', '기본 그립과 탄성으로 첫 한 발을 배워요.', 30, 40, '#a9784e'),
  bow(1, '단풍나무 활', '안정형', '높은 그립감으로 차분하게. 탄성은 낮아 속도가 느려요.', 85, 35, '#76875a'),
  bow(2, '바람결 활', '탄성형', '탄성이 강해 빠르게 날지만, 조준은 더 흔들려요.', 48, 80, '#598b8a'),
  bow(3, '달빛 명궁', '균형형', '높은 그립감과 강한 탄성을 함께 갖췄어요.', 95, 95, '#c49b50'),
  bow(4, '가죽그립 활', '그립형', '부드러운 가죽 손잡이. 약한 탄성으로 가까운 곳을 겨눠요.', 70, 38, '#ad795b'),
  bow(5, '참나무 강궁', '강궁', '힘찬 탄성 대신 거친 그립을 다뤄야 해요.', 38, 75, '#82613f'),
  bow(6, '여행자 단궁', '균형형', '그립과 탄성을 고르게 갖춘 가벼운 선택.', 62, 55, '#849167'),
  bow(7, '수련용 정밀궁', '정밀형', '아주 안정적인 그립. 낮은 탄성만큼 낙차를 읽어보세요.', 96, 45, '#668c83'),
  bow(8, '폭풍 장궁', '강궁', '매우 강한 탄성. 크게 흔들리는 조준을 잡아야 해요.', 35, 98, '#687588'),
  bow(9, '대나무 복합궁', '균형형', '좋은 그립과 강한 대나무 탄성을 조합했어요.', 76, 83, '#9aab70'),
  bow(10, '장인의 석궁', '정밀 석궁', '정교한 그립과 빠른 출발. 비행 중 빠르게 감속하는 근거리 석궁.', 98, 72, '#b39467'),
  bow(11, '천둥 석궁', '고속 석궁', '한 발을 빠르게 쏘는 일반 석궁. 탄성은 높지만 감속이 커 먼 거리에는 불리해요.', 82, 100, '#7c889e'),
  bow(12, '가죽그립 석궁', '안정 석궁', '부드러운 그립으로 한 발을 차분하게. 탄성은 조금 낮아요.', 96, 68, '#709e95'),
  bow(13, '사냥꾼 석궁', '강성 석궁', '강한 탄성으로 한 발을 빠르게 보내요. 낮은 그립감을 다뤄야 해요.', 64, 94, '#a79679'),
  bow(14, '은빛 정밀석궁', '정밀 석궁', '좋은 그립과 탄성을 갖춘 일반 단발 석궁.', 93, 87, '#bcafcf'),
  bow(15, '레어 연발석궁', '레어 3연발', '3발이 넓게 흩어지는 첫 연발석궁. 3발 중 최고점으로 기록해요.', 74, 91, '#718ea2'),
  bow(16, '레어 속사석궁', '레어 속사 3연발', '강한 탄성과 개량 레일. 3발이 조금 더 가깝게 모이지만 그립은 낮아요.', 68, 98, '#598f83'),
  bow(17, '레어 정밀석궁', '레어 정밀 3연발', '높은 그립과 정밀한 레일로 3발을 가깝게 모아요. 탄성은 조금 낮아요.', 94, 84, '#a79679'),
  bow(18, '레어 매눈석궁', '레어 고급 3연발', '강한 탄성과 좁은 탄착군. 빠른 3발이 작은 범위에 모여요.', 88, 96, '#b1a471'),
  bow(19, '레어 명인석궁', '레어 명품 3연발', '안정적인 그립과 가장 좁은 탄착군. 3발은 서로 다른 가까운 지점에 꽂혀요.', 96, 100, '#bcafcf'),
  gun(20, '훈련용 공기총', '입문 사격총', '접시 사격용 기본 총. 본편 최고 탄속의 2배로 전용 탄환을 발사해요.', 0, 60, 40, 4, .28, .130, '#7c9a83'),
  gun(21, '숲길 카빈', '경량 사격총', '가벼운 총과 빠른 장전. 그립이 낮아 조준이 더 흔들려요.', 950, 48, 60, 5, .22, .110, '#9a8467'),
  gun(22, '안정형 소총', '안정 사격총', '높은 그립감으로 안정적으로 겨눠요. 전용 탄환과 고정 스코프를 사용해요.', 1250, 92, 68, 6, .16, .090, '#7b949b'),
  gun(23, '장거리 소총', '장거리 사격총', '공기 저항이 낮은 전용 탄환. 안정형보다 그립은 낮지만 빠르게 재장전해요.', 1750, 70, 90, 7, .12, .065, '#9c8e73'),
  gun(24, '정밀 사격총', '정밀 사격총', '높은 그립과 10발 탄창. 전용 탄환으로 먼 과녁을 정밀하게 겨눠요.', 2200, 98, 100, 8, .08, .050, '#a8b1bf')
], 'weapon');

export const ARROWS = equipmentCatalog([
  arrow(0, '나무 화살', '입문', '가벼운 촉과 넓은 깃. 빠르게 출발하지만 바람을 많이 타요.', 4, '넓은 깃', 1.00, 0.140, 35, '#b28b64'),
  arrow(1, '깃털 화살', '안정형', '무거운 촉과 큰 안정깃. 출발은 느리고, 넓은 깃은 바람을 받아요.', 8, '큰 안정깃', 1.10, 0.180, 80, '#8b9c78'),
  arrow(2, '탄소 화살', '경량형', '가벼운 촉과 좁은 날개로 빠르게. 안정깃보다 속도 편차가 있어요.', 4, '좁은 날개', 0.50, 0.060, 65, '#71999b'),
  arrow(3, '은빛 화살', '유선형', '무거운 촉은 천천히 출발하고, 유선형 날개는 감속과 바람 영향을 줄여요.', 10, '유선형 날개', 0.35, 0.055, 94, '#bfc8d0'),
  arrow(4, '가벼운 연습 화살', '초경량', '가장 가벼운 촉으로 빠르게 출발해요. 가벼운 만큼 쉽게 밀려요.', 2, '작은 깃', 0.85, 0.110, 45, '#c3a474'),
  arrow(5, '황동촉 화살', '중량형', '무거운 황동촉과 직선 깃. 출발은 느리지만 속도를 오래 유지해요.', 12, '직선 깃', 0.78, 0.100, 70, '#b99c52'),
  arrow(6, '긴깃 화살', '안정형', '긴 깃으로 발사 속도가 일정해요. 대신 공기와 옆바람을 많이 받아요.', 6, '긴 안정깃', 1.25, 0.200, 96, '#9a9c77'),
  arrow(7, '돌풍 화살', '저항형', '낮은 날개가 바람을 덜 받고, 비행 중 감속도 적어요.', 5, '낮은 날개', 0.40, 0.050, 73, '#709ba0'),
  arrow(8, '철갑촉 화살', '중량형', '가장 무거운 촉. 천천히 출발하며, 삼각 깃의 저항도 고려하세요.', 14, '삼각 깃', 0.95, 0.140, 86, '#89909b'),
  arrow(9, '비연 화살', '속도형', '작은 날개로 저항을 줄였어요. 발사 속도 편차는 가장 커요.', 3, '초소형 날개', 0.22, 0.025, 30, '#93a8b3'),
  arrow(10, '금빛 화살', '정밀형', '정교한 곡면 날개로 일정하게 출발해요. 촉은 조금 무거워요.', 9, '곡면 날개', 0.48, 0.075, 98, '#ceb36c'),
  arrow(11, '바람깃 화살', '저항형', '쐐기 날개가 옆바람을 가장 적게 받아요. 정밀형보다 속도 편차가 있어요.', 7, '쐐기 날개', 0.18, 0.035, 88, '#82a7a5'),
  {...arrow(12, '탄성 화살', '특수 · 한 번 튕김', '과녁에 못 미쳐 땅에 닿으면 한 번 튕겨 다시 날아요. 속도가 줄고, 벽에 닿거나 과녁을 지나친 뒤에는 튕기지 않아요.', 8, '탄성 안정깃', .55, .095, 85, '#be9a69'),
    ability:Object.freeze({type:'bounce',label:'한 번 튕김',description:'과녁 앞 지면에서 1회 튕김 · 전진 속도 75% · 수직 반발 55%',maxBounces:1,horizontalRetention:.75,restitution:.55})},
  {...arrow(13, '자석 화살', '특수 · 근접 유도', '실제 과녁 5m 안에서 중심 쪽으로 조금 휘어요. 크게 빗나간 화살을 되돌리거나 벽을 통과하지 않아요.', 10, '유도 안정깃', .40, .080, 90, '#629d98'),
    ability:Object.freeze({type:'magnetic',label:'근접 유도',description:'실제 표적 5m 안에서 약하게 유도 · 최대 약 10° 보정 · 명중 보장 없음',radius:5,maxAcceleration:24,maxTurnRate:1,maxTurnAngle:.18,maxCorrectionSpeed:4})}
], 'arrow');

const motion = (amplitudeX = 0, amplitudeY = 0, speed = 0) => ({ amplitudeX, amplitudeY, speed, irregular: speed > 0 });
const wall = (z, height, width = 7, x = 0, type = 'stone') => ({ x, z, width, height, depth: 0.65, type, material: type === 'timber' ? 'wood' : 'stone' });
const stage = (id, name, subtitle, hint, distance, extra = {}) => ({
  id, legacyId: id, name, subtitle, hint, distance, radius: 1.25, height: 2.3,
  kind: 'target', motion: motion(), wind: 0, obstacles: [], passers: [], shots: 5, goal: 20,
  ...extra
});

// Distances repeat whenever a new skill is introduced. The teaching order is
// intentional; a global difficulty sort would place unfamiliar mechanics early.
const learningDistances = Object.freeze([10, 20, 30, 50]);
const targetRadii = Object.freeze([1.45, 1.65, 1.85, 2.1]);
const stageShapes = Object.freeze({
  rabbit: [1.10, .72, 16], wildcat: [1.12, .66, 15], deer: [1.23, .73, 17],
  pigeon: [1.18, .86, 15], eagle: [1.55, .95, 18], cheetah: [1.38, .62, 12],
  bird: [1.38, .88, 8]
});
const flyingKinds = new Set(['bird', 'pigeon', 'eagle']);

// Solve a central circular strip by its fraction of the actual round face.
// A face-area fraction differs from the same fraction of its bounding width.
function circularStripHalfWidth(fraction) {
  let low = 0, high = 1;
  for (let i = 0; i < 48; i++) {
    const middle = (low + high) / 2;
    const area = 2 / Math.PI * (Math.asin(middle) + middle * Math.sqrt(1 - middle * middle));
    if (area < fraction) low = middle; else high = middle;
  }
  return (low + high) / 2;
}


// Describe a box by its silhouette at the target plane. Correct both near and
// far faces so a thick pillar cannot quietly narrow the promised opening.
function projectedBox(distance, left, right, z, height, type = 'stone', depth = .16) {
  const near = z - depth / 2, far = z + depth / 2;
  const worldLeft = left * (left < 0 ? near : far) / distance;
  const worldRight = right * (right > 0 ? near : far) / distance;
  return { ...wall(z, height, worldRight - worldLeft, (worldLeft + worldRight) / 2, type), depth };
}
function partialCover(stage, targetX = 0) {
  const { distance, radius, height, coverageMode } = stage;
  const z = distance * .82, top = height + radius + .3;
  if (coverageMode === 'side-walls') {
    const edge = radius * circularStripHalfWidth(stage.visibleFraction ?? .75);
    return [
      projectedBox(distance, targetX - radius * 4.5, targetX - edge, z, top, stage.coverMaterial || 'stone'),
      projectedBox(distance, targetX + edge, targetX + radius * 4.5, z, top, stage.coverMaterial || 'stone')
    ];
  }
  // Seven thin columns cover roughly one quarter of the round face throughout
  // its movement. Fixed columns and open gaps are independent collision boxes.
  const spacing = radius * .70, width = spacing * .25;
  return Array.from({ length: 7 }, (_, index) => {
    const center = targetX + (index - 3) * spacing;
    return { ...projectedBox(distance, center - width / 2, center + width / 2, z, top, 'pillar'),
      material: stage.coverMaterial === 'timber' ? 'wood' : 'stone' };
  });
}
function coverStage(id, name, subtitle, hint, distance, extra) {
  const template = stage(id, name, subtitle, hint, distance, extra);
  template.obstacles = partialCover(template);
  return template;
}
function roundFaceSlice(left, right, center, radius) {
  const primitive = x => { const u = clamp((x - center) / radius, -1, 1);return (Math.asin(u) + u * Math.sqrt(Math.max(0, 1 - u * u))) / Math.PI; };
  return Math.max(0, primitive(right) - primitive(left));
}
function stageCover(template) {
  if (!template.obstacles.length) return 0;
  let total = 0;
  for (let index = 0; index < 48; index++) {
    const x = (template.targetX || 0) + (template.motion.amplitudeX || 0) * Math.sin(index * Math.PI / 24);
    const intervals = template.obstacles.map(obstacle => {
      const near = obstacle.z - obstacle.depth / 2, far = obstacle.z + obstacle.depth / 2;
      const left = obstacle.x - obstacle.width / 2, right = obstacle.x + obstacle.width / 2;
      return [Math.min(left / near, left / far) * template.distance,
        Math.max(right / near, right / far) * template.distance];
    }).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
      else merged.push([...interval]);
    }
    total += merged.reduce((sum, [left, right]) => sum + roundFaceSlice(left, right, x, template.radius), 0);
  }
  return total / 48;
}
function stageDifficulty(template) {
  const shape = stageShapes[template.kind], animal = !!shape;
  const rx = template.radius * (shape?.[0] || 1), ry = template.radius * (shape?.[1] || 1);
  const radius = Math.sqrt(rx * ry), angularRadius = Math.atan2(radius, template.distance);
  const movementSpeed = animal ? 2 * (template.distance * 1.25 + template.radius * 3) / (template.passDuration || shape[2]) :
    2 / Math.PI * Math.hypot(template.motion.amplitudeX * template.motion.speed, template.motion.amplitudeY * template.motion.speed * 1.37);
  const basicArrow = ARROWS[0], mass = basicArrow.shaftMass + basicArrow.tipMass;
  const speed = BOWS[0].speed * Math.sqrt(REFERENCE_ARROW_MASS / mass), drag = basicArrow.fletching.drag * REFERENCE_ARROW_MASS / mass;
  const flightSeconds = -Math.log1p(-drag * template.distance / speed) / drag;
  const windDriftPerUnit = WIND_RESPONSE * basicArrow.windFactor * (flightSeconds - template.distance / speed) / drag;
  const cover = stageCover(template), pillars = template.obstacles.filter(obstacle => obstacle.type === 'pillar').length;
  const walls = template.obstacles.length - pillars, people = template.passers.length;
  const components = {
    precision: 8 * Math.log2(1 + .05 / angularRadius), flight: 2 * Math.log2(1 + flightSeconds),
    lead: (animal ? 4 : 3.5) * Math.log2(1 + movementSpeed * flightSeconds / radius), cover: 10 * cover,
    obstacles: pillars * .25 + walls * .75 + (people ? 3 + people : 0),
    vertical: flyingKinds.has(template.kind) ? 1.8 * Math.log2(1 + template.motion.amplitudeY / radius) : 0
  };
  const baseScore = Object.values(components).reduce((sum, value) => sum + value, 0), windStrength = Math.abs(template.wind);
  return Object.freeze({ baseScore, score: baseScore + windStrength * 2.5,
    angularRadius, movementSpeed, flightSeconds, windDriftPerUnit, cover, pillars, walls, people,
    windStrength, windDrift: windDriftPerUnit * windStrength, components: Object.freeze(components) });
}
const signedWind = (id, amount) => (id % 4 < 2 ? 1 : -1) * Number(amount.toFixed(3));
function lessonStages() {
  const templates = [];
  const chapters = [
    ['고정 표적', '먼저 거리와 당기는 힘을 익혀요.', '바람 없는 과녁이에요. 충분히 당긴 뒤, 멀수록 조금 높이 겨눠보세요.'],
    ['움직이는 표적', '천천히 움직이는 중심을 따라가요.', '과녁이 천천히 좌우로 움직여요. 화살이 도착할 앞쪽을 조금 겨눠보세요.'],
    ['벽 사이 · 3/4 보임', '양옆이 조금 가려진 고정 과녁이에요.', '과녁의 3/4이 보여요. 가운데 넓게 열린 부분으로 쏴보세요.'],
    ['벽 사이 · 1/2 보임', '열린 틈을 조금 좁혀볼까요?', '과녁의 절반이 보여요. 짧은 거리부터 좁아진 틈에 익숙해져 보세요.'],
    ['벽 사이 · 1/3 보임', '작은 틈의 중심을 읽어요.', '과녁의 1/3이 보여요. 충분히 조준하고 열린 가운데 부분으로 쏴보세요.'],
    ['기둥 뒤 표적', '기둥 사이로 움직임을 읽어요.', '과녁의 약 3/4이 보이도록 가는 기둥을 놓았어요. 움직이는 중심과 열린 틈을 함께 읽어보세요.']
  ];
  for (let chapter = 0; chapter < chapters.length; chapter++) for (const [index, distance] of learningDistances.entries()) {
    const id = templates.length + 1, radius = targetRadii[index], [title, subtitle, hint] = chapters[chapter];
    const extra = { chapterId: chapter + 1, chapterName: title, radius, height: radius + .5,
      goal: 10 + chapter * 2 + index * 2, wind: chapter ? signedWind(id, .03 + (id - 5) * .008) : 0,
      motion: chapter === 1 ? motion(radius * (.60 + index * .10), 0, .24 + index * .025) :
        chapter === 5 ? motion(radius * .85, 0, .25 + index * .025) : motion() };
    if (chapter >= 2) {
      extra.coverageMode = chapter < 5 ? 'side-walls' : 'pillars';
      extra.visibleFraction = chapter < 5 ? [.75, .5, 1 / 3][chapter - 2] : .75;
      extra.coverMaterial = index % 2 ? 'timber' : 'stone';
      extra.layoutJitter = distance * .055;
      templates.push(coverStage(id, `${title} · ${distance}m`, subtitle, hint, distance, extra));
    } else templates.push(stage(id, `${title} · ${distance}m`, subtitle, hint, distance, extra));
  }
  const animals = [
    {kind:'rabbit',name:'토끼',radius:.85,height:.72,duration:16,bob:.16,pace:.55,hint:'낮게 통통 뛰는 토끼를 따라가요. 양쪽 중 어디에서 들어오는지 먼저 살펴보세요.'},
    {kind:'wildcat',name:'살쾡이',radius:1,height:.8,duration:15,bob:.07,pace:.65,hint:'짧은 보폭으로 속도를 바꾸는 살쾡이를 따라가요. 이동 방향 앞쪽을 겨눠보세요.'},
    {kind:'deer',name:'사슴',radius:1.4,height:1.3,duration:17,bob:.23,pace:.5,hint:'긴 보폭으로 달리는 사슴이 떠오르고 내려오는 흐름을 읽어보세요.'},
    {kind:'pigeon',name:'비둘기',radius:1.03,height:2.25,duration:15,bob:.28,pace:.6,hint:'짧게 위아래로 날갯짓하는 비둘기를 따라가요. 움직일 앞쪽과 높이를 함께 읽으세요.'},
    {kind:'eagle',name:'독수리',radius:1.22,height:2.35,duration:18,bob:.45,pace:.5,hint:'넓게 날개를 펴고 천천히 높이를 바꾸는 독수리를 따라가요.'},
    {kind:'cheetah',name:'치타',radius:1.16,height:.93,duration:12,bob:.12,pace:.8,hint:'가속했다가 숨을 고르는 치타를 따라가요. 빨라질 때는 조금 더 앞을 겨누세요.'}
  ];
  for (const [animalIndex, animal] of animals.entries()) for (const [index, distance] of learningDistances.entries()) {
    const id = templates.length + 1, scale = 1 + index * .09;
    templates.push(stage(id, `${animal.name} 따라가기 · ${distance}m`, `${animal.name}의 움직임 익히기`, animal.hint, distance, {
      kind: animal.kind, chapterId: animalIndex + 7, chapterName: `${animal.name} 따라가기`,
      radius: animal.radius * scale, height: animal.height * scale,
      motion: motion(0, animal.bob * scale, 0), passDuration: animal.duration - index * .4,
      paceVariation: animal.pace, approachEase: .45,
      wind: signedWind(id, .22 + (id - 25) * .025), goal: 18 + Math.floor((id - 25) / 4) + index
    }));
  }
  // Full cover comes only after every visible-target and tracking lesson.
  // The wall blocks the sightline but leaves a reachable parabolic path above it.
  for (const moving of [false, true]) {
    const id = moving ? 50 : 49;
    templates.push(stage(id, moving ? '벽 뒤에서 움직이는 과녁' : '완전히 숨은 고정 과녁',
      moving ? '미리 본 움직임을 이어서 읽어요.' : '미리 보고 포물선으로 넘겨요.',
      moving ? '시작할 때 벽 뒤 과녁과 움직임을 먼저 보여줘요. 과녁 보기로 다시 살피고, 도착할 위치를 앞서 겨눠 벽 위로 쏘세요.' :
        '시작할 때 벽 뒤 과녁을 먼저 보여줘요. 과녁 보기로 다시 살피고, 조금 높게 겨눠 벽 위로 쏘세요.', 50, {
        chapterId:13,chapterName:'완전히 숨은 과녁',radius:2.1,height:2.6,visibleFraction:0,
        motion:moving ? motion(1.8,0,.28) : motion(),
        obstacles:[wall(25,3.35,9,0,moving ? 'timber' : 'stone')],
        wind:moving ? -1 : .9,goal:moving ? 28 : 26
      }));
  }
  return templates;
}
const gearBand = (gearTier, gearLabel, first, last, weaponIds, referenceLoadouts, balance) => Object.freeze({
  gearTier, gearLabel, first, last,
  weaponIds: Object.freeze({bow:Object.freeze(weaponIds.bow),crossbow:Object.freeze(weaponIds.crossbow)}),
  referenceLoadouts: Object.freeze(referenceLoadouts.map(loadout => Object.freeze(loadout))),
  balance: Object.freeze(balance)
});

/** Optional equipment guidance. Family ranks never lock a stage or a weapon. */
export const STAGE_GEAR_BANDS = Object.freeze([
  gearBand('starter','기본 활',1,8,{bow:[0],crossbow:[]},
    [{family:'bow',bow:0,arrow:0}],{radiusScale:1,speedScale:1}),
  gearBand('lower','하위 활·석궁',9,24,{bow:[4,5,6],crossbow:[13,12,10]},
    [{family:'bow',bow:4,arrow:6},{family:'crossbow',bow:13,arrow:6}],
    {radiusScale:1,speedScale:1,windStart:.10,windEnd:.32,goalStart:18,goalEnd:26}),
  gearBand('middle','중간 활·석궁',25,35,{bow:[1,2,8],crossbow:[14,11,15,16]},
    [{family:'bow',bow:1,arrow:6},{family:'crossbow',bow:14,arrow:6}],
    {radiusScale:.94,speedScale:1.03,windStart:.35,windEnd:.65,goalStart:26,goalEnd:30}),
  gearBand('upper','상위 활·석궁',36,50,{bow:[7,9,3],crossbow:[17,18,19]},
    [{family:'bow',bow:3,arrow:3},{family:'crossbow',bow:19,arrow:3}],
    {radiusScale:.82,speedScale:1.08,windStart:.75,windEnd:1.30,goalStart:32,goalEnd:36})
]);

function applyEquipmentLesson(template) {
  const band = STAGE_GEAR_BANDS.find(entry => template.id >= entry.first && template.id <= entry.last);
  const fraction = (template.id - band.first) / Math.max(1, band.last - band.first), balance = band.balance;
  const adjusted = {...template,gearTier:band.gearTier,gearLabel:band.gearLabel,referenceLoadouts:band.referenceLoadouts,
    radius:template.radius * balance.radiusScale,
    motion:{...template.motion,speed:template.motion.speed * balance.speedScale},
    ...(Number.isFinite(template.passDuration) ? {passDuration:template.passDuration / balance.speedScale} : {})};
  if (band.gearTier !== 'starter') {
    adjusted.wind = signedWind(template.id,balance.windStart + (balance.windEnd - balance.windStart) * fraction);
    adjusted.goal = Math.round(balance.goalStart + (balance.goalEnd - balance.goalStart) * fraction);
  }
  // Keep promised circular face fractions after any balance change to size.
  if (adjusted.coverageMode) adjusted.obstacles = partialCover(adjusted);
  return {...adjusted,difficulty:stageDifficulty(adjusted)};
}
export const STAGES = Object.freeze(lessonStages().map(applyEquipmentLesson));

/** Separate timed gun event; the fifty main archery stages retain their own progress. */
export function createClayEvent(level = 1) {
  const eventLevel = clamp(Math.floor(Number(level) || 1), 1, 10);
  const targetsPerWave = Math.min(10, eventLevel + 1), waveCount = 3;
  const flightSeconds = 6.6 - (eventLevel - 1) * .42;
  const waveDuration = flightSeconds * 1.04 + .85, totalTargets = waveCount * targetsPerWave;
  return stage(0, '접시 사격 이벤트', `${eventLevel}단계 · 동시 ${targetsPerWave}개`,
    eventLevel >= 8 ? '불규칙하게 달아나는 UFO와 접시를 겨누세요. 탄창과 재장전 시간을 함께 읽어보세요.' :
      '동시에 날아오는 접시의 앞을 겨누세요. 탄창이 비면 재장전하고 다음 접시를 기다려요.', 36, {
      kind: 'clay', eventLevel, height: 1.5, radius: .9 - (eventLevel - 1) * .025,
      wind: .25 + (eventLevel - 1) * .035, shots: null, goal: Math.ceil(totalTargets * .5) * 10,
      waveCount, targetsPerWave, totalTargets, maxScore: totalTargets * 10,
      flightSeconds, waveDuration, passDuration: waveDuration,
      eventDuration: waveCount * waveDuration, brokenPasses: []
    });
}

export const CLAY_EVENT = Object.freeze(createClayEvent(1));

const getBow = bow => typeof bow === 'number' ? BOWS[bow] || BOWS[0] : bow || BOWS[0];
const getArrow = arrow => typeof arrow === 'number' ? ARROWS[arrow] || ARROWS[0] : arrow || ARROWS[0];

// Evaluate the same launch formula only after both catalogs and their lookups
// exist. Excluding guns avoids a circular dependency on their derived speed.
export const MAX_MAIN_PROJECTILE_SPEED = Math.max(...BOWS.filter(weapon => weapon.weaponType !== 'gun')
  .flatMap(bow => ARROWS.map(arrow => getSpeed({ bow, arrow, charge: 1, velocityBias: 1 }))));
export const BULLET_SPEED = MAX_MAIN_PROJECTILE_SPEED * 2;
for (const weapon of BOWS.filter(weapon => weapon.weaponType === 'gun')) {
  weapon.muzzleSpeed = BULLET_SPEED;weapon.speed = BULLET_SPEED;
}

const animalPassDuration = Object.freeze(Object.fromEntries(Object.entries(stageShapes).map(([kind, shape]) => [kind, shape[2]])));
function hashUnit(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
/** Fresh round layout; rerolling an already-prepared stage never compounds offsets. */
export function prepareStage(stage, seed = 0) {
  const encounterSeed = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  const prepared = {
    ...stage, motion: { ...stage.motion },
    obstacles: (stage.obstacles || []).map(obstacle => ({ ...obstacle })),
    passers: (stage.passers || []).map(person => ({ ...person })), encounterSeed,
    ...(stage.kind === 'clay' ? { brokenPasses: [] } : {})
  };
  if (stage.coverageMode === 'side-walls' || stage.coverageMode === 'pillars') {
    const mixed = encounterSeed ^ Math.imul(stage.id || 1, 0x9e3779b1);
    const slot = Math.min(2, Math.floor(hashUnit(mixed ^ 0x6a09e667) * 3));
    const extent = stage.layoutJitter || stage.distance * .055;
    const jitter = (hashUnit(mixed ^ 0xbb67ae85) * 2 - 1) * extent * .12;
    prepared.targetX = (slot - 1) * extent + jitter;
    prepared.wallLayout = ['left', 'center', 'right'][slot];
    // Rebuild from the fresh center, never shift a previously prepared group.
    prepared.obstacles = partialCover(prepared, prepared.targetX);
    return prepared;
  }
  if ((stage.kind || 'target') !== 'target' || !prepared.obstacles.length) return prepared;
  const cover = prepared.obstacles[0];
  const group = cover.type === 'pillar' ? prepared.obstacles.filter(obstacle => obstacle.type === 'pillar') : [cover];
  const left = Math.min(...group.map(obstacle => (obstacle.x - obstacle.width / 2) * stage.distance / obstacle.z));
  const right = Math.max(...group.map(obstacle => (obstacle.x + obstacle.width / 2) * stage.distance / obstacle.z));
  const center = (left + right) / 2;
  const margin = (stage.radius || 1.25) + Math.abs(stage.motion?.amplitudeX || 0) + .25;
  const available = Math.max(0, (right - left) / 2 - margin);
  const mixed = encounterSeed ^ Math.imul(stage.id || 1, 0x9e3779b1);
  const slot = Math.min(2, Math.floor(hashUnit(mixed ^ 0x6a09e667) * 3));
  const jitter = (hashUnit(mixed ^ 0xbb67ae85) * 2 - 1) * available * .12;
  prepared.targetX = center + (slot - 1) * available * .65 + jitter;
  prepared.wallLayout = ['left', 'center', 'right'][slot];
  return prepared;
}

function motionClock(stage, time, irregular) {
  if (!irregular) return { time, rate: 1 };
  const mixed = (stage.encounterSeed ?? stage.id ?? 1) ^ Math.imul(stage.id || 1, 0x9e3779b1);
  const random = salt => hashUnit(mixed ^ salt), tau = Math.PI * 2;
  const phase = random(0x6a09e667) * tau, secondPhase = random(0xbb67ae85) * tau;
  const a = .28 + random(0x3c6ef372) * .10, b = .08 + random(0xa54ff53a) * .08;
  const w = .65 + random(0x510e527f) * .4, secondW = 1.6 + random(0x9b05688c) * .6;
  // Positive clock rate gives continuous, uneven pace without introducing jumps.
  return {
    time: time + a / w * (Math.sin(w * time + phase) - Math.sin(phase)) +
      b / secondW * (Math.sin(secondW * time + secondPhase) - Math.sin(secondPhase)),
    rate: 1 + a * Math.cos(w * time + phase) + b * Math.cos(secondW * time + secondPhase)
  };
}

function animalMotion(stage, time, forcedPassId) {
  const duration = Math.max(3, stage.passDuration || animalPassDuration[stage.kind]);
  const t = Math.max(0, Number.isFinite(time) ? time : 0);
  // Snap nanosecond rounding at a crossing boundary equally for large/small steps.
  const currentPass = Math.floor((t + 1e-9) / duration);
  const passId = Number.isInteger(forcedPassId) && forcedPassId >= 0 ? forcedPassId : currentPass;
  const seedValue = Number.isFinite(stage.encounterSeed) ? stage.encounterSeed : stage.id || 1;
  const seed = (Number.isInteger(seedValue) ? seedValue : Math.floor(seedValue * 0xffffffff)) >>> 0;
  const passSeed = seed ^ Math.imul(passId + 1, 0x9e3779b1) ^ Math.imul(stage.id || 1, 0x85ebca6b);
  const random = salt => hashUnit(passSeed ^ salt);
  const direction = random(0x243f6a88) < .5 ? -1 : 1;
  const phase = random(0xb7e15162) * Math.PI * 2, secondPhase = random(0x8aed2a6b) * Math.PI * 2;
  const variation = clamp(stage.paceVariation ?? 1, .2, 1);
  const a = (.18 + random(0x9e3779b9) * .18) * variation, b = (.06 + random(0x3c6ef372) * .10) * variation;
  const approach = clamp(stage.approachEase || 0, 0, .45);
  const u = (t - passId * duration) / duration, tau = Math.PI * 2;
  // Integral of a positive varying velocity. Each pass crosses once, never reverses.
  const progress = u + approach / tau * Math.sin(tau * u) + a / tau * (Math.sin(tau * u + phase) - Math.sin(phase)) +
    b / (tau * 2) * (Math.sin(tau * 2 * u + secondPhase) - Math.sin(secondPhase));
  const rate = 1 + approach * Math.cos(tau * u) + a * Math.cos(tau * u + phase) + b * Math.cos(tau * 2 * u + secondPhase);
  const span = stage.distance * 1.25 + (stage.radius || 1.25) * 3;
  const x = (stage.targetX || 0) + direction * span * (2 * progress - 1);
  let y = stage.height ?? (flyingKinds.has(stage.kind) ? 4.8 : stage.kind === 'rabbit' ? .7 : 1.65);
  if (flyingKinds.has(stage.kind)) {
    const amplitude = stage.motion?.amplitudeY || .7;
    const cycles = stage.kind === 'pigeon' ? 3.6 + random(0xa54ff53a) * 1.2 :
      stage.kind === 'eagle' ? .8 + random(0xa54ff53a) * .6 : 1.2 + random(0xa54ff53a) * 1.2;
    y += amplitude * (.72 * Math.sin(tau * cycles * u + phase) + .28 * Math.sin(tau * (cycles + .8) * u + secondPhase));
  } else {
    const amplitude = stage.motion?.amplitudeY || 0;
    const frequency = stage.kind === 'rabbit' ? 2.0 : stage.kind === 'wildcat' ? 2.8 : stage.kind === 'deer' ? 1.35 : 3.1;
    // Root movement follows the animal while the drawing only animates limbs.
    // Positive smooth hops keep the body above its ground-level baseline.
    const stride = Math.sin(t * Math.PI * frequency + phase);
    y += amplitude * stride * stride;
  }
  return { x, y, passId, direction, passDuration: duration, velocityX: direction * span * 2 / duration * rate, active: true };
}

function eventTargetAt(stage, time, passId) {
  if (!Number.isInteger(passId) || passId < 0) return null;
  const waveId = Math.floor(passId / 10), slot = passId % 10;
  const count = stage.targetsPerWave || 2, waves = stage.waveCount || 3;
  if (waveId >= waves || slot >= count) return null;
  const level = stage.eventLevel || 1, interval = stage.waveDuration || CLAY_EVENT.waveDuration;
  const t = Math.max(0, Number.isFinite(time) ? time : 0), elapsed = t - waveId * interval;
  const mixed = (stage.encounterSeed ?? 1) ^ Math.imul(passId + 1, 0x9e3779b1);
  const random = salt => hashUnit(mixed ^ salt), radius = stage.radius || .9;
  const direction = random(0x243f6a88) < .5 ? -1 : 1;
  const flightDuration = (stage.flightSeconds || CLAY_EVENT.flightSeconds) * (.96 + random(0xb7e15162) * .08);
  const launchHeight = 1.4 + random(0x8aed2a6b) * .65, arcRise = 4.6 + random(0xa54ff53a) * 2.3;
  // Scale target gravity with flight time so early slow arcs stay inside the view.
  // Fired projectiles still use the unchanged GRAVITY constant.
  const gravity = 8 * arcRise / (flightDuration * flightDuration), verticalSpeed = 4 * arcRise / flightDuration;
  const span = stage.distance * (.46 + random(0x510e527f) * .04) + radius * 2;
  const laneWidth = 6 + Math.min(6, (count - 2) * .9);
  const laneX = (slot / Math.max(1, count - 1) * 2 - 1) * laneWidth + (random(0x9b05688c) * 2 - 1) * .7;
  let velocityX = direction * span * 2 / flightDuration, velocityY = verticalSpeed - gravity * elapsed;
  let x = laneX - direction * span + velocityX * elapsed;
  let y = launchHeight + verticalSpeed * elapsed - gravity * elapsed * elapsed / 2;
  const kind = level >= 8 && (slot + waveId) % (level >= 10 ? 2 : 3) === 0 ? 'ufo' : 'clay';
  if (kind === 'ufo') {
    const u = elapsed / flightDuration, phase = random(0x1f83d9ab) * Math.PI * 2, second = random(0x5be0cd19) * Math.PI * 2;
    const envelope = Math.sin(Math.PI * u) ** 2, derivative = Math.PI * Math.sin(2 * Math.PI * u);
    const sx = 1.6 * Math.sin(6 * Math.PI * u + phase) + .6 * Math.sin(13 * Math.PI * u + second);
    const sy = .85 * Math.sin(9 * Math.PI * u + second);
    x += envelope * sx; y += envelope * sy;
    velocityX += (derivative * sx + envelope * (1.6 * 6 * Math.PI * Math.cos(6 * Math.PI * u + phase) + .6 * 13 * Math.PI * Math.cos(13 * Math.PI * u + second))) / flightDuration;
    velocityY += (derivative * sy + envelope * .85 * 9 * Math.PI * Math.cos(9 * Math.PI * u + second)) / flightDuration;
  }
  return {
    x, y, z: stage.distance, radius, rx: radius * 1.3, ry: radius * .6, kind,
    velocityX, velocityY, gravity, passId, waveId, slot, direction,
    passDuration: interval, flightDuration,
    active: elapsed >= -1e-9 && elapsed < flightDuration && !(stage.brokenPasses || []).includes(passId)
  };
}

/** All currently airborne unbroken plates/UFOs; at most ten targets share the plane. */
export function eventTargetsAt(stage, time = 0) {
  if (stage.kind !== 'clay') return [];
  const t = Math.max(0, Number.isFinite(time) ? time : 0), interval = stage.waveDuration || CLAY_EVENT.waveDuration;
  const waveId = Math.floor((t + 1e-9) / interval);
  if (waveId >= (stage.waveCount || 3)) return [];
  return Array.from({ length: stage.targetsPerWave || 2 }, (_, slot) => eventTargetAt(stage, t, waveId * 10 + slot)).filter(target => target?.active);
}

/** Animals retain a seeded pass identity; forcedPassId continues an already-hit animal. */
export function targetAt(stage, time = 0, forcedPassId) {
  if (stage.kind === 'clay') {
    const target = Number.isInteger(forcedPassId) ? eventTargetAt(stage, time, forcedPassId) : eventTargetsAt(stage, time)[0];
    return target || { x: 0, y: stage.height ?? 1.5, z: stage.distance, radius: stage.radius || .9,
      rx: (stage.radius || .9) * 1.3, ry: (stage.radius || .9) * .6, kind: 'clay', active: false, passId: -1, direction: 1 };
  }
  const m = stage.motion || motion(), clock = motionClock(stage, time, m.irregular), phase = clock.time * (m.speed || 0);
  const kind = stage.kind || 'target', r = stage.radius || 1.25;
  const animal = Object.hasOwn(animalPassDuration, kind);
  const position = animal ? animalMotion(stage, time, forcedPassId) : {
    x: (stage.targetX || 0) + (m.amplitudeX || 0) * Math.sin(phase),
    y: (stage.height ?? 2.3) + (m.amplitudeY || 0) * Math.sin(phase * 1.37),
    velocityX: (m.amplitudeX || 0) * Math.cos(phase) * (m.speed || 0) * clock.rate,
    active: true
  };
  return {
    ...position, z: stage.distance, radius: r,
    rx: r * (stageShapes[kind]?.[0] || 1),
    ry: r * (stageShapes[kind]?.[1] || 1),
    kind
  };
}

function passerAt(stage, config, time) {
  const id = config.id ?? 0, z = config.z ?? stage.distance * .88;
  const width = config.width ?? .95, height = config.height ?? 2, depth = config.depth ?? .42;
  const duration = Math.max(2, config.passDuration || 32);
  const phase = ((config.phase || 0) % 1 + 1) % 1;
  const passId = Math.floor((Math.max(0, time) + phase * duration + 1e-9) / duration);
  const passStart = passId * duration - phase * duration;
  const mixed = (stage.encounterSeed ?? stage.id ?? 1) ^ Math.imul(id + 1, 0x85ebca6b) ^ Math.imul(passId + 1, 0x9e3779b1);
  const direction = hashUnit(mixed ^ 0x243f6a88) < .5 ? -1 : 1;
  const span = (z * 1.25 + width * 2) * (1 + hashUnit(mixed ^ 0xb7e15162) * .25);
  const speed = span * 2 / duration, velocityX = direction * speed;
  return {
    id, passId, type: 'person', x: direction * span * (2 * (time - passStart) / duration - 1),
    y: config.y ?? 0, z, width, height, depth, direction, speed, velocityX,
    passStart, passEnd: passStart + duration, passDuration: duration
  };
}

/** Harmless moving blockers. Each linear pass is continuous and starts off screen. */
export function passersAt(stage, time = 0) {
  return (stage.passers || []).map(config => passerAt(stage, config, time));
}

export function getArrowMass(arrow) {
  const a = getArrow(arrow);
  return Math.max(1, (a.shaftMass ?? 20) + (a.tipMass ?? 4));
}

/** Relative side acceleration at the same wind, including wing area and mass. */
export function getWindResponse(arrow) {
  const a = getArrow(arrow);
  return a.fletching ? Math.max(0, a.fletching.windArea) * REFERENCE_ARROW_MASS / getArrowMass(a) : a.windFactor ?? 1;
}

export function getSpeed({ charge = 1, bow, arrow, velocityBias = 0 } = {}) {
  const b = getBow(bow), a = getArrow(arrow);
  if (b.weaponType === 'gun') return b.muzzleSpeed * (1 + clamp(velocityBias, -1, 1) * b.ammo.variance);
  const referenceSpeed = Number.isFinite(b.elasticity) ? bowSpeed(b.elasticity) * (b.launchBoost ?? 1) : b.speed;
  const variance = a.fletching ? 0.20 * (1 - clamp(a.fletching.stability, 0, 100) / 100) : a.variance;
  // Equal bow energy: adding point mass lowers launch speed, not gravity.
  return referenceSpeed * Math.sqrt(REFERENCE_ARROW_MASS / getArrowMass(a)) *
    (0.42 + 0.58 * clamp(charge, 0, 1)) * (1 + clamp(velocityBias, -1, 1) * variance);
}

export function launchArrow(params = {}) {
  const { yaw = 0, pitch = 0, charge = 1, bow, arrow, velocityBias = 0 } = params;
  const speed = getSpeed({ charge, bow, arrow, velocityBias });
  const cp = Math.cos(pitch), weapon = getBow(bow), bullet = weapon.weaponType === 'gun';
  const ability = bullet ? null : getArrow(arrow).ability || null;
  return {
    position: { ...PLAYER },
    velocity: { x: Math.sin(yaw) * cp * speed, y: Math.sin(pitch) * speed, z: Math.cos(yaw) * cp * speed },
    elapsed: 0, active: true, result: null, trail: [{ ...PLAYER }],
    speed, mass: bullet ? weapon.ammo.mass : getArrowMass(arrow), windFactor: bullet ? weapon.ammo.windFactor : getWindResponse(arrow),
    projectileType: bullet ? 'bullet' : 'arrow', shaftLength: bullet ? .12 : .85,
    // Crossbow drag is an explicit short-range game balance, not a real-weapon claim.
    dragRate: bullet ? weapon.ammo.dragRate : (Math.max(0, getArrow(arrow).fletching?.drag ?? 0) + Math.max(0, weapon.extraDragRate ?? 0)) * REFERENCE_ARROW_MASS / getArrowMass(arrow),
    lastTrailTime: 0, targetPassed: false, ability,
    bounceCount:0,bouncesRemaining:ability?.type === 'bounce' ? ability.maxBounces : 0,
    magnetActive:false,magnetSteered:false,magnetTurn:0,magnetCorrection:0,magnetTargetPassId:null,magnetLost:false
  };
}

/** One trigger: ordinary weapons launch once; rare crossbows launch a nearby trio. */
export function launchVolley(params = {}) {
  const weapon = getBow(params.bow), count = weapon.burstCount || 1;
  const mixed = (Number.isFinite(params.burstSeed) ? params.burstSeed : 0) >>> 0;
  const random = salt => hashUnit(mixed ^ salt);
  const rotation = random(0x243f6a88) * Math.PI * 2;
  return Array.from({ length: count }, (_, index) => {
    const radius = count > 1 ? weapon.burstSpread * (.75 + random(Math.imul(index + 1, 0x9e3779b1)) * .25) : 0;
    const angle = rotation + index * Math.PI * 2 / 3 + (random(Math.imul(index + 1, 0x85ebca6b)) - .5) * .20;
    return {
      ...launchArrow({ ...params, yaw: (params.yaw || 0) + Math.cos(angle) * radius, pitch: (params.pitch || 0) + Math.sin(angle) * radius }),
      launchDelay: index * (weapon.burstInterval || 0), burstIndex: index
    };
  });
}

// Simplified game aerodynamics: constant crosswind force and linear air drag.
// The exact exponential solution is independent of render FPS and substep size.
function motionTerms(t, drag = 0) {
  if (drag < 1e-8) return { decay: 1, velocityTime: t, accelerationTime: t * t / 2 };
  const decay = Math.exp(-drag * t);
  const velocityTime = -Math.expm1(-drag * t) / drag;
  return { decay, velocityTime, accelerationTime: (t - velocityTime) / drag };
}
const coordinateAt = (p, v, a, t, drag = 0) => {
  const terms = motionTerms(t, drag);
  return p + v * terms.velocityTime + a * terms.accelerationTime;
};
const at = (position, velocity, acceleration, t, drag = 0) => {
  const terms = motionTerms(t, drag), point = {};
  for (const axis of ['x', 'y', 'z']) point[axis] = position[axis] + velocity[axis] * terms.velocityTime + acceleration[axis] * terms.accelerationTime;
  return point;
};
const velocityAt = (velocity, acceleration, t, drag = 0) => {
  const terms = motionTerms(t, drag), result = {};
  for (const axis of ['x', 'y', 'z']) result[axis] = velocity[axis] * terms.decay + acceleration[axis] * terms.velocityTime;
  return result;
};

function roots(p, v, a, level, dt = 8, drag = 0) {
  const c = p - level;
  if (drag < 1e-8) {
    if (Math.abs(a) < 1e-12) return Math.abs(v) < 1e-12 ? [] : [-c / v];
    const discriminant = v * v - 2 * a * c;
    if (discriminant < 0) return [];
    const d = Math.sqrt(discriminant);
    return [(-v - d) / a, (-v + d) / a];
  }
  const points = [0, dt], terminal = a / drag;
  const ratio = -terminal / (v - terminal);
  if (ratio > 0 && ratio < 1) {
    const turn = -Math.log(ratio) / drag;
    if (turn > 0 && turn < dt) points.push(turn);
  }
  points.sort((left, right) => left - right);
  const result = [], value = t => coordinateAt(p, v, a, t, drag) - level;
  for (const t of points) if (Math.abs(value(t)) < 1e-10) result.push(t);
  for (let i = 0; i < points.length - 1; i++) {
    let lo = points[i], hi = points[i + 1], flo = value(lo), fhi = value(hi);
    if (flo === 0 || fhi === 0 || Math.sign(flo) === Math.sign(fhi)) continue;
    for (let iteration = 0; iteration < 55; iteration++) {
      const mid = (lo + hi) / 2, fmid = value(mid);
      if (Math.sign(fmid) === Math.sign(flo)) { lo = mid; flo = fmid; } else hi = mid;
    }
    result.push((lo + hi) / 2);
  }
  return result.sort((left, right) => left - right).filter((value, index, all) => !index || value - all[index - 1] > 1e-9);
}

/** Time intervals where the exact damped coordinate lies inside a slab. */
function insideIntervals(p, v, a, min, max, dt, drag = 0) {
  const points = [0, dt, ...roots(p, v, a, min, dt, drag), ...roots(p, v, a, max, dt, drag)]
    .filter(t => t >= 0 && t <= dt).sort((left, right) => left - right);
  const unique = points.filter((value, index) => !index || value - points[index - 1] > 1e-10);
  const intervals = [];
  const valueAt = t => coordinateAt(p, v, a, t, drag);
  for (let i = 0; i < unique.length - 1; i++) {
    const value = valueAt((unique[i] + unique[i + 1]) / 2);
    if (value >= min - 1e-9 && value <= max + 1e-9) intervals.push([unique[i], unique[i + 1]]);
  }
  for (const t of unique) {
    const value = valueAt(t);
    if (value >= min - 1e-9 && value <= max + 1e-9 && !intervals.some(([start, end]) => t >= start && t <= end)) intervals.push([t, t]);
  }
  return intervals;
}

function obstacleTime(position, velocity, acceleration, obstacle, dt, drag = 0) {
  let windows = [[0, dt]];
  const slabs = {
    x: [obstacle.x - obstacle.width / 2, obstacle.x + obstacle.width / 2],
    y: [obstacle.y || 0, (obstacle.y || 0) + obstacle.height],
    z: [obstacle.z - (obstacle.depth || 0.65) / 2, obstacle.z + (obstacle.depth || 0.65) / 2]
  };
  for (const axis of ['x', 'y', 'z']) {
    const movingSpeed = axis === 'x' ? obstacle.velocityX || 0 : 0;
    // A constant-speed block is exact in its moving frame: a' = a - drag * v_block.
    const intervals = insideIntervals(position[axis], velocity[axis] - movingSpeed, acceleration[axis] - drag * movingSpeed, ...slabs[axis], dt, drag);
    const next = [];
    for (const [start, end] of windows) for (const [otherStart, otherEnd] of intervals) {
      const lo = Math.max(start, otherStart), hi = Math.min(end, otherEnd);
      if (lo <= hi + 1e-9) next.push([lo, hi]);
    }
    windows = next;
    if (!windows.length) return null;
  }
  return Math.min(...windows.map(window => window[0]));
}

function personCollision(position, velocity, acceleration, stage, worldTime, dt, drag) {
  let earliest = null;
  for (const config of stage.passers || []) {
    let start = 0;
    while (start < dt - 1e-10) {
      const person = passerAt(stage, config, worldTime + start);
      const duration = Math.min(dt - start, Math.max(1e-8, person.passEnd - worldTime - start));
      const point = at(position, velocity, acceleration, start, drag);
      const speed = velocityAt(velocity, acceleration, start, drag);
      const collision = obstacleTime(point, speed, acceleration, person, duration, drag);
      if (collision !== null && (!earliest || start + collision < earliest.t)) {
        earliest = { t: start + collision, personId: person.id, passId: person.passId };
      }
      start += duration;
    }
  }
  return earliest;
}

function scoreAt(point, target) {
  if (target.active === false) return null;
  const ratio = Math.hypot((point.x - target.x) / target.rx, (point.y - target.y) / target.ry);
  if (ratio > 1 + 1e-9) return null;
  if (target.kind === 'clay' || target.kind === 'ufo') return { score: 10, zone: target.kind === 'ufo' ? 'UFO 명중' : '접시 명중' };
  if (target.kind !== 'target') return { score: ratio <= 0.38 ? 10 : 8, zone: ratio <= 0.38 ? '정확한 명중' : '명중' };
  const ring = Math.min(4, Math.floor(clamp(ratio, 0, 0.999999) * 5));
  return { score: [10, 8, 6, 4, 2][ring], zone: ['정중앙', '빨간 원', '파란 원', '검은 원', '흰 원'][ring] };
}

// A constant-acceleration segment retains the exact original damped solution.
// Special guidance supplies the same acceleration to movement and swept hits.
function advanceBallistic(shot, dt, stage, worldTime = 0, steering = null) {
  if (!shot.active) return shot.result;
  if (!(dt > 0) || !Number.isFinite(dt)) return null;
  const position = shot.position, velocity = shot.velocity;
  const drag = Math.max(0, shot.dragRate ?? 0);
  const acceleration = { x: (stage.wind || 0) * WIND_RESPONSE * (shot.windFactor ?? 1), y: -GRAVITY, z: 0 };
  if (steering) for (const axis of ['x','y','z']) acceleration[axis] += steering[axis];
  const events = [];
  const ground = roots(position.y, velocity.y, acceleration.y, 0, dt, drag).filter(t => t >= 0 && t <= dt && velocityAt(velocity, acceleration, t, drag).y <= 0);
  if (ground.length) events.push({ t: Math.min(...ground), type: 'ground', score: 0, zone: '땅에 떨어졌어요' });
  for (const obstacle of stage.obstacles || []) {
    const t = obstacleTime(position, velocity, acceleration, obstacle, dt, drag);
    if (t !== null) events.push({ t, type: 'obstacle', score: 0, zone: '장애물에 닿았어요' });
  }
  const person = personCollision(position, velocity, acceleration, stage, worldTime, dt, drag);
  if (person) events.push({ ...person, type: 'person', score: 0, zone: '사람이 가로막았어요' });
  const targetTime = velocity.z > 0 ? roots(position.z, velocity.z, acceleration.z, stage.distance, dt, drag).find(t => t >= -1e-9 && t <= dt + 1e-9) ?? -1 : -1;
  if (!shot.targetPassed && targetTime >= -1e-9 && targetTime <= dt + 1e-9) {
    const t = clamp(targetTime, 0, dt);
    const point = at(position, velocity, acceleration, t, drag);
    const targets = stage.kind === 'clay' ? eventTargetsAt(stage, worldTime + t) : [targetAt(stage, worldTime + t)];
    let closest = null;
    for (const target of targets) {
      const hit = scoreAt(point, target);
      if (!hit) continue;
      const distance = Math.hypot((point.x - target.x) / target.rx, (point.y - target.y) / target.ry);
      if (!closest || distance < closest.distance) closest = { hit, target, distance };
    }
    if (closest) events.push({ t, type: 'hit', ...closest.hit, targetCenter: closest.target });
    // All event targets share this plane. A missed bullet is finished here;
    // arrows retain their full falling trajectory beyond the target.
    else if (shot.projectileType === 'bullet' && stage.kind === 'clay') events.push({ t, type: 'miss', score: 0, zone: '표적을 지나쳤어요' });
  }
  if (shot.elapsed + dt >= 8) events.push({ t: Math.max(0, 8 - shot.elapsed), type: 'miss', score: 0, zone: '멀리 날아갔어요' });
  const eventPriority = { person: 0, obstacle: 1, ground: 2, hit: 3, miss: 4 };
  events.sort((a, b) => a.t - b.t || eventPriority[a.type] - eventPriority[b.type]);
  const event = events[0], usedTime = event ? event.t : dt;
  shot.position = at(position, velocity, acceleration, usedTime, drag);
  shot.velocity = velocityAt(velocity, acceleration, usedTime, drag);
  shot.elapsed += usedTime;
  // An earlier ground contact must not consume a future target-plane crossing.
  if (!shot.targetPassed && targetTime >= -1e-9 && targetTime <= usedTime + 1e-9) {
    shot.targetPassed = true;
    shot.magnetActive = false;
  }
  if (steering) {
    const strength = Math.hypot(steering.x,steering.y,steering.z);
    shot.magnetCorrection += strength * usedTime;
    shot.magnetTurn += steering.turnRate * usedTime;
    if (strength > 0 && usedTime > 0) shot.magnetSteered = true;
  }
  if (shot.elapsed - shot.lastTrailTime >= 0.025 || event) {
    shot.trail.push({ ...shot.position });
    shot.lastTrailTime = shot.elapsed;
    if (shot.trail.length > 180) shot.trail.shift();
  }
  if (event) {
    if (event.type === 'ground' && shot.projectileType === 'arrow' && shot.ability?.type === 'bounce' &&
      shot.bouncesRemaining > 0 && !shot.targetPassed && shot.position.z < stage.distance - 1e-7 && shot.velocity.z > 0) {
      shot.bounceCount++;shot.bouncesRemaining--;
      shot.bouncePoint = {...shot.position};shot.bounceTime = shot.elapsed;
      shot.velocity = {x:shot.velocity.x * shot.ability.horizontalRetention,
        y:Math.abs(shot.velocity.y) * shot.ability.restitution,z:shot.velocity.z * shot.ability.horizontalRetention};
      const remaining = dt - usedTime;
      return remaining > 1e-10 ? advanceBallistic(shot,remaining,stage,worldTime + usedTime) : null;
    }
    shot.active = false;
    shot.magnetActive = false;
    const { t, ...result } = event;
    shot.result = { ...result, point: { ...shot.position }, flightTime: shot.elapsed };
  }
  return shot.result;
}

const MAGNET_STEP = 1 / 240;
const noSteering = Object.freeze({x:0,y:0,z:0,turnRate:0});
function currentMagnetTarget(shot, stage, worldTime) {
  const targets = stage.kind === 'clay' ? eventTargetsAt(stage,worldTime) : [targetAt(stage,worldTime)];
  const active = targets.filter(target => target.active !== false);
  if (shot._magnetTargetKey !== undefined) {
    const same = active.find(target => `${target.kind}:${target.passId ?? 'fixed'}` === shot._magnetTargetKey);
    if (!same) {shot.magnetLost = true;shot.magnetActive = false;return null;}
    return same;
  }
  return active.sort((a,b)=>Math.hypot(a.x-shot.position.x,a.y-shot.position.y,a.z-shot.position.z)-
    Math.hypot(b.x-shot.position.x,b.y-shot.position.y,b.z-shot.position.z))[0] || null;
}
function guidanceForInterval(shot, stage, worldTime, duration) {
  const ability = shot.ability;
  shot.magnetActive = false;
  if (shot.targetPassed || shot.magnetLost || shot.position.z >= stage.distance - 1e-10 || shot.velocity.z <= 0) return noSteering;
  const target = currentMagnetTarget(shot,stage,worldTime);
  if (!target) return noSteering;
  const delta = {x:target.x-shot.position.x,y:target.y-shot.position.y,z:target.z-shot.position.z};
  const distance = Math.hypot(delta.x,delta.y,delta.z), speed = Math.hypot(shot.velocity.x,shot.velocity.y,shot.velocity.z);
  if (!(distance > 1e-8 && distance <= ability.radius) || !(speed > 1e-8) || delta.z <= 0) return noSteering;
  if (shot._magnetTargetKey === undefined) {
    shot._magnetTargetKey = `${target.kind}:${target.passId ?? 'fixed'}`;
    shot.magnetTargetPassId = target.passId ?? null;
  }
  shot._magnetPassEnd = Number.isInteger(target.waveId) ? target.waveId * (stage.waveDuration || target.passDuration) + target.flightDuration :
    Number.isInteger(target.passId) && Number.isFinite(target.passDuration) ? (target.passId + 1) * target.passDuration : Infinity;
  const forward = {x:shot.velocity.x/speed,y:shot.velocity.y/speed,z:shot.velocity.z/speed};
  const desired = {x:delta.x/distance,y:delta.y/distance,z:delta.z/distance};
  const dot = clamp(forward.x*desired.x+forward.y*desired.y+forward.z*desired.z,-1,1);
  const lateral = {x:desired.x-dot*forward.x,y:desired.y-dot*forward.y,z:desired.z-dot*forward.z};
  const sideways = Math.hypot(lateral.x,lateral.y,lateral.z), angle = Math.atan2(sideways,dot);
  if (sideways < 1e-10) return noSteering;
  const correctionLeft = Math.max(0,ability.maxCorrectionSpeed-shot.magnetCorrection);
  const turnLeft = Math.max(0,ability.maxTurnAngle-shot.magnetTurn);
  const strength = Math.min(ability.maxAcceleration,speed*Math.min(ability.maxTurnRate,angle*5),
    correctionLeft/duration,turnLeft*speed/duration);
  if (!(strength > 1e-10)) return noSteering;
  shot.magnetActive = true;
  return {x:lateral.x/sideways*strength,y:lateral.y/sideways*strength,z:lateral.z/sideways*strength,turnRate:strength/speed};
}

/** Advance a shot; worldTime is the absolute scene time at the START of this interval. */
export function stepArrow(shot, dt, stage, worldTime = 0) {
  if (!shot.active) return shot.result;
  if (!(dt > 0) || !Number.isFinite(dt)) return null;
  if (shot.projectileType !== 'arrow' || shot.ability?.type !== 'magnetic') return advanceBallistic(shot,dt,stage,worldTime);
  const startElapsed = shot.elapsed, endElapsed = startElapsed + dt;
  while (shot.active && shot.elapsed < endElapsed - 1e-10) {
    const sceneTime = worldTime + shot.elapsed - startElapsed;
    if (shot.targetPassed || shot.magnetLost || shot.position.z >= stage.distance - 1e-10) {
      shot.magnetActive = false;
      return advanceBallistic(shot,endElapsed-shot.elapsed,stage,sceneTime);
    }
    if (shot._magnetTargetKey !== undefined && !currentMagnetTarget(shot,stage,sceneTime)) continue;
    if (!Number.isFinite(shot._magnetFrameEnd) || shot.elapsed >= shot._magnetFrameEnd - 1e-10) {
      const frame = Math.floor((shot.elapsed+1e-10)/MAGNET_STEP);
      shot._magnetFrameEnd = (frame+1)*MAGNET_STEP;
      shot._magnetSteering = guidanceForInterval(shot,stage,sceneTime,shot._magnetFrameEnd-shot.elapsed);
    }
    let duration = Math.min(endElapsed-shot.elapsed,shot._magnetFrameEnd-shot.elapsed);
    if (Number.isFinite(shot._magnetPassEnd)) duration = Math.min(duration,Math.max(0,shot._magnetPassEnd-sceneTime));
    if (duration < 1e-10) {
      // A pass boundary ends this target's guidance, never selects a replacement.
      shot.magnetLost = true;shot.magnetActive = false;continue;
    }
    const steering = shot._magnetSteering;
    const crossing = roots(shot.position.z,shot.velocity.z,steering.z,stage.distance,duration,Math.max(0,shot.dragRate||0))
      .find(time=>time>1e-10 && time<duration);
    if (Number.isFinite(crossing)) duration = crossing;
    advanceBallistic(shot,duration,stage,sceneTime,steering);
  }
  return shot.result;
}

export function predictTrajectory(params, stage, worldTime = 0, maxSeconds = 8) {
  const shot = launchArrow(params);
  const points = [{ ...shot.position }];
  const dt = 1 / 45;
  let time = 0;
  while (shot.active && time < maxSeconds) {
    const step = Math.min(dt, maxSeconds - time);
    const beforeBounce = shot.bounceCount;
    stepArrow(shot, step, stage, worldTime + time);
    if (shot.bounceCount > beforeBounce && shot.bouncePoint) points.push({...shot.bouncePoint});
    points.push({ ...shot.position });
    time += step;
  }
  return { points, result: shot.result };
}

export function createSway() {
  return { x: 0, y: 0, vx: 0, vy: 0, ux: 0, uy: 0, uvx: 0, uvy: 0, tx: 0, ty: 0, timer: 0 };
}

/** Bounded stochastic spring motion, with no periodic path and no teleporting reticle. */
export function stepSway(state, dt, bow, heldSeconds = 0, random = Math.random) {
  const duration = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
  const steps = Math.max(1, Math.ceil(duration / (1 / 120)));
  const step = duration / steps;
  for (let i = 0; i < steps; i++) {
    state.timer -= step;
    if (state.timer <= 0) {
      state.tx = random() * 2 - 1;
      state.ty = random() * 2 - 1;
      state.timer += 0.10 + random() * 0.19;
    }
    state.uvx += ((state.tx - state.ux) * 68 - state.uvx * 6.2) * step;
    state.uvy += ((state.ty - state.uy) * 68 - state.uvy * 6.2) * step;
    state.ux += state.uvx * step;
    state.uy += state.uvy * step;
    for (const [axis, velocity] of [['ux', 'uvx'], ['uy', 'uvy']]) {
      if (Math.abs(state[axis]) > 1.15) {
        state[axis] = clamp(state[axis], -1.15, 1.15);
        state[velocity] *= -0.35;
      }
    }
  }
  const fatigue = 1 + clamp((heldSeconds - 1.8) / 3.0, 0, 0.70);
  const b = getBow(bow);
  const amplitude = (Number.isFinite(b.grip) ? bowSway(b.grip) : b.sway) * fatigue;
  state.x = state.ux * amplitude;
  state.y = state.uy * amplitude;
  state.vx = state.uvx * amplitude;
  state.vy = state.uvy * amplitude;
  return state;
}
