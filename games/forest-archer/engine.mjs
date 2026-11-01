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
    Number(a.weaponType === 'crossbow') - Number(b.weaponType === 'crossbow') ||
    equipmentScore(a) - equipmentScore(b) || a.id - b.id);
  ranked.forEach((item, rank) => {
    item.shopRank = rank + 1;
    // Increasing marginal costs keep early choices reachable and later gear a goal.
    item.price = kind === 'arrow' ? 300 * rank + 25 * rank * (rank - 1) : 500 * rank + 50 * rank * (rank - 1);
    if (kind === 'weapon') {
      item.steadyDuration = Math.round((.5 + 1.5 * rank / (ranked.length - 1)) * 100) / 100;
      item.scopePrice = item.scopeCompatible ? Math.max(500, Math.ceil(item.price * .2 / 50) * 50) : 0;
    }
  });
  // Event guns have their own shop and retain their separate economy and timing.
  items.filter(item => item.weaponType === 'gun').forEach((item, rank) => {
    item.shopRank = rank + 1;item.steadyDuration = .5;
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
  arrow(11, '바람깃 화살', '저항형', '쐐기 날개가 옆바람을 가장 적게 받아요. 정밀형보다 속도 편차가 있어요.', 7, '쐐기 날개', 0.18, 0.035, 88, '#82a7a5')
], 'arrow');

const motion = (amplitudeX = 0, amplitudeY = 0, speed = 0) => ({ amplitudeX, amplitudeY, speed, irregular: speed > 0 });
const wall = (z, height, width = 7, x = 0, type = 'stone') => ({ x, z, width, height, depth: 0.65, type, material: type === 'timber' ? 'wood' : 'stone' });
const stage = (id, name, subtitle, hint, distance, extra = {}) => ({
  id, legacyId: id, name, subtitle, hint, distance, radius: 1.25, height: 2.3,
  kind: 'target', motion: motion(), wind: 0, obstacles: [], passers: [], shots: 5, goal: 20,
  ...extra
});

const laterStageNames = [
  '푸른 능선', '흔들리는 길목', '능선의 날갯짓', '바위틈의 토끼', '낮은 담장 너머', '먼 초원의 발자국', '숲 위의 샛길', '두 겹의 담장',
  '강바람', '오가는 숲 표적', '갈대 위의 새', '개울가의 토끼', '돌담의 그림자', '언덕 너머 사슴', '가지 사이 날갯짓', '겹쳐진 숲길',
  '바람이 머무는 곳', '흐르는 과녁', '구름 아래 날갯짓', '꽃밭의 토끼', '높은 담장의 비밀', '멀어진 발자국', '바람 속의 새', '돌담 사잇길',
  '산등성이 바람', '흔들리는 먼 과녁', '깊은 숲의 새', '덤불 속의 토끼', '바람막이 너머', '먼 언덕의 사슴', '빠른 날갯짓', '높고 낮은 담장',
  '먼빛의 과녁', '끊임없는 움직임', '바람 위의 새', '질주하는 토끼', '세 겹의 담장', '바람의 달인'
];
function laterStage(id) {
  const progress = (id - 12) / 38, pattern = (id - 13) % 8;
  let kind = pattern === 2 || pattern === 6 ? 'bird' : pattern === 3 ? 'rabbit' : pattern === 5 ? 'deer' : 'target';
  if (id === 50) kind = 'target';
  const people = [17, 25, 33, 41, 49].includes(id);
  const distance = Math.round(people ? 55 + ((id - 17) / 32) * 35 : kind === 'rabbit' ? 24 + progress * 10 : kind === 'deer' ? 50 + progress * 30 : kind === 'bird' ? 38 + progress * 32 : 70 + progress * 34);
  const radius = people ? .90 - progress * .12 : kind === 'rabbit' ? .85 - progress * .12 : kind === 'deer' ? 1.65 - progress * .15 : kind === 'bird' ? 1.4 - progress * .1 : 1.5 - progress * .2;
  const height = people ? 1.15 : kind === 'rabbit' ? .7 : kind === 'deer' ? 1.65 : kind === 'bird' ? 5.2 + progress * 2 : 2.5 + progress * .4;
  const moving = kind === 'target' && !people;
  const movement = kind === 'bird' ? motion(0, .7 + progress * .35, 0) : moving ? motion(3.5 + progress * 2.4, .1 + progress * .15, .45 + progress * .3) : motion();
  let obstacles = [];
  if (moving) {
    const count = Math.min(5, 3 + Math.floor((id - 13) / 8)), spacing = 3.4 + progress * .2;
    obstacles = Array.from({ length: count }, (_, index) => ({
      ...wall(Math.round(distance * .46), 3.2 + progress, 1.45 + progress * .2, (index - (count - 1) / 2) * spacing, 'pillar'),
      depth: .9, material: Math.floor(id / 8) % 2 ? 'wood' : 'stone'
    }));
  } else if (pattern === 6) {
    obstacles = [wall(Math.round(distance * .42), 3.0 + progress * .9, 7.5 + progress * 1.5, 0, id % 16 < 8 ? 'timber' : 'stone')];
  }
  const passers = people ? Array.from({ length: 3 + Math.floor(progress * 2) }, (_, index) => ({
    id: index, z: distance * (.82 + index * .025), width: .90 + progress * .12,
    height: 2.0, depth: .42, passDuration: 24 + distance * .13 + index * 1.5,
    phase: (.45 + index * .23) % 1
  })) : [];
  const subtitle = id === 50 ? '마지막 기둥 사격장' : people ? '지나가는 사람 사이로' : kind === 'rabbit' ? '가까운 풀숲의 질주' : kind === 'deer' ? '먼 들판을 가로질러' : kind === 'bird' ? '속도를 바꾸는 날갯짓' : '기둥 사이 나타나는 중심';
  const hint = people ? '사람들이 지나간 틈으로 뒤쪽 과녁만 맞혀요. 사람이 화살을 가로막으면 이번 발은 0점이에요.' : kind === 'rabbit' ? '가까운 토끼가 왼쪽이나 오른쪽에서 들어와요. 달라지는 속도를 읽어보세요.' : kind === 'deer' ? '멀리 달리는 사슴이 도착할 위치를 앞서 겨눠보세요.' : kind === 'bird' ? '새는 방향을 바꾸지 않고 숲을 건너요. 위아래 움직임과 속도를 함께 읽으세요.' : '기둥 뒤 과녁이 불규칙한 속도로 움직여요. 틈으로 보이는 순간과 화살 도착 시간을 함께 읽으세요.';
  return stage(id, people ? `${['첫', '두 번째', '세 번째', '네 번째', '마지막'][(id - 17) / 8]} 숲길 행렬` : laterStageNames[id - 13], subtitle, hint, distance, {
    kind, radius, height, motion: movement, obstacles, passers,
    wind: (id % 4 === 0 || id % 4 === 3 ? -1 : 1) * Number((1.35 + progress * 2.65).toFixed(3)),
    goal: id === 50 ? 40 : 22 + Math.floor(progress * 14),
    ...(kind === 'target' ? {} : { passDuration: (kind === 'bird' ? 8 : kind === 'rabbit' ? 7 : 10) - progress * (kind === 'bird' ? 2.2 : kind === 'rabbit' ? 1.6 : 3) })
  });
}

// Preserve the encounter templates independently from their playable order.
// Difficulty is a balancing estimate, not a promise that every player will find
// every adjacent encounter harder. Precision, lead and cover each teach a skill.
const stageShapes = Object.freeze({ rabbit: [1.10, .72, 7], deer: [1.23, .73, 10], bird: [1.38, .88, 8] });
function stageCover(template, rx, ry, animal) {
  if (!template.obstacles.length) return 0;
  let hidden = 0, samples = 0;
  // Sample several real randomized layouts and points across the target face.
  // Animal samples stay in the normal aiming field; offscreen travel is not cover.
  for (const seed of [0, 5, 19, 31, 47, 61]) {
    const layout = prepareStage(template, seed);
    for (let index = 0; index < 48; index++) {
      const fraction = (index + .5) / 48, angle = fraction * Math.PI * 2;
      const x = (layout.targetX || 0) + (animal ? .38 * template.distance * (2 * fraction - 1) : template.motion.amplitudeX * Math.sin(angle));
      for (let phase = 0; phase < (animal ? 8 : 1); phase++) {
        const y = template.height + template.motion.amplitudeY * Math.sin(template.kind === 'bird' ? phase * Math.PI / 4 + angle * 1.83 : angle * 1.37);
        for (const dy of [-.7, 0, .7]) for (const dx of [-.7, 0, .7]) {
          hidden += Number(layout.obstacles.some(obstacle => {
            const ratio = obstacle.z / template.distance;
            return Math.abs((x + dx * rx) * ratio - obstacle.x) <= obstacle.width / 2 &&
              PLAYER.y + (y + dy * ry - PLAYER.y) * ratio <= obstacle.height;
          }));
          samples++;
        }
      }
    }
  }
  return hidden / samples;
}
function stageDifficulty(template) {
  const shape = stageShapes[template.kind], animal = !!shape;
  const rx = template.radius * (shape?.[0] || 1), ry = template.radius * (shape?.[1] || 1);
  const radius = Math.sqrt(rx * ry), angularRadius = Math.atan2(radius, template.distance);
  // One animal pass travels the entire span once. Unlike an oscillating target,
  // its amplitudeX/speed fields do not control the actual crossing speed.
  const movementSpeed = animal ? 2 * (template.distance * 1.25 + template.radius * 3) / (template.passDuration || shape[2]) :
    2 / Math.PI * Math.hypot(template.motion.amplitudeX * template.motion.speed, template.motion.amplitudeY * template.motion.speed * 1.37);
  const basicArrow = ARROWS[0], mass = basicArrow.shaftMass + basicArrow.tipMass;
  const speed = BOWS[0].speed * Math.sqrt(REFERENCE_ARROW_MASS / mass), drag = basicArrow.fletching.drag * REFERENCE_ARROW_MASS / mass;
  // Horizontal flight time with the starter loadout; elevation adds flight time.
  const flightSeconds = -Math.log1p(-drag * template.distance / speed) / drag;
  const windDriftPerUnit = WIND_RESPONSE * basicArrow.windFactor * (flightSeconds - template.distance / speed) / drag;
  const cover = stageCover(template, rx, ry, animal);
  const pillars = template.obstacles.filter(obstacle => obstacle.type === 'pillar').length;
  const walls = template.obstacles.length - pillars, people = template.passers.length;
  const components = {
    precision: 8 * Math.log2(1 + .05 / angularRadius),
    flight: 2 * Math.log2(1 + flightSeconds),
    lead: (animal ? 4 : 3.5) * Math.log2(1 + movementSpeed * flightSeconds / radius),
    cover: 10 * cover,
    obstacles: pillars * 1.4 + walls * 2 + Math.max(0, walls - 1) * 3 + (people ? 8 + people * 1.5 : 0),
    vertical: template.kind === 'bird' ? 1.8 * Math.log2(1 + template.motion.amplitudeY / radius) : 0
  };
  return { baseScore: Object.values(components).reduce((sum, value) => sum + value, 0),
    angularRadius, movementSpeed, flightSeconds, windDriftPerUnit, cover, pillars, walls, people,
    components: Object.freeze(components) };
}
function stageProgression(templates) {
  const ranked = templates.map(template => ({ template, difficulty: stageDifficulty(template) }))
    .sort((a, b) => a.difficulty.baseScore - b.difficulty.baseScore || a.template.legacyId - b.template.legacyId);
  return Object.freeze(ranked.map(({ template, difficulty }, index) => {
    const strength = Number((.12 + 3.88 * index / (ranked.length - 1)).toFixed(3));
    return { ...template, id: index + 1, wind: (Math.sign(template.wind) || 1) * strength,
      goal: 16 + Math.round(24 * index / (ranked.length - 1)),
      difficulty: Object.freeze({ ...difficulty, score: difficulty.baseScore + strength * 2.5,
        windStrength: strength, windDrift: difficulty.windDriftPerUnit * strength }) };
  }));
}

export const STAGES = stageProgression([
  stage(1, '첫 번째 시위', '햇살 드는 숲길', '누른 채 방향을 조절하고, 조준점이 과녁을 지날 때 손을 떼세요.', 14, { goal: 16, radius: 1.35, wind: 0.12 }),
  stage(2, '조금 더 멀리', '낙하를 읽는 연습', '화살이 아래로 떨어져요. 과녁 중심보다 조금 위를 겨눠보세요.', 18, { radius: 1.30, wind: -0.20 }),
  stage(3, '숲의 끝자락', '거리 감각 익히기', '충분히 당긴 화살은 빠르게 날아요. 점선으로 낙하를 살펴보세요.', 24, { goal: 22, radius: 1.30, height: 2.5, wind: 0.30 }),
  stage(4, '긴 사거리', '높이와 힘의 균형', '나뭇잎이 날리는 쪽으로 화살도 밀려요. 반대쪽으로 조금 보정해보세요.', 32, { goal: 24, height: 2.6, wind: -0.40 }),
  stage(5, '오가는 과녁', '한 걸음 앞을 향해', '움직이는 과녁이 화살 도착 때 있을 자리를 겨눠요.', 32, { goal: 22, motion: motion(3.5, 0, 0.72), radius: 1.35, wind: 0.50 }),
  stage(6, '하늘의 날갯짓', '숲을 가로지르는 새', '들어오는 방향을 읽고, 위아래로 나는 새의 앞쪽을 겨눠요.', 36, { kind: 'bird', height: 4.8, radius: 1.3, motion: motion(5.0, 0.65, 0.88), goal: 20, wind: -0.60 }),
  stage(7, '풀숲의 토끼', '가까이 달려가는 토끼', '풀숲에서 들어오는 토끼가 속도를 바꿔 달려요. 진행 방향 앞을 겨눠보세요.', 24, { kind: 'rabbit', height: 0.7, radius: 0.85, goal: 22, wind: 0.72 }),
  stage(8, '담장 너머', '곡선으로 넘어서기', '힘을 조금 줄이고 더 위로 조준해, 큰 포물선으로 담장을 넘겨보세요.', 42, { radius: 1.35, obstacles: [wall(22, 2.8)], goal: 20, wind: -0.84 }),
  stage(9, '벽 너머 날갯짓', '숨었다 나타나는 새', '새가 벽 위로 떠오르는 순간을 노리세요. 나뭇잎으로 바람을 읽고 날아갈 앞쪽을 겨눠보세요.', 44, { kind: 'bird', height: 5.8, radius: 1.4, motion: motion(5.2, 3.6, 0.72), passDuration: 12, wind: 0.96, obstacles: [wall(24, 3.8, 24)], goal: 22 }),
  stage(10, '바람의 들판', '멀리 움직이는 작은 중심', '바람 반대쪽으로 보정하면서, 작게 보이는 과녁이 이동할 앞쪽을 겨누세요.', 55, { radius: 1.15, motion: motion(4.5, 0.15, 0.95), wind: 1.08, goal: 26 }),
  stage(11, '숨은 숲길', '멀리 달리는 사슴', '멀리서 숲을 가로지르는 사슴의 속도를 읽고, 담장을 넘겨 쏘세요.', 58, { kind: 'deer', height: 1.65, radius: 1.65, motion: motion(6.0, 0, 0.58), wind: -1.20, obstacles: [wall(31, 3.5, 7, 0, 'timber')], goal: 26 }),
  stage(12, '바람의 궁수', '첫 복합 사격장', '거리·움직임·바람·담장. 익힌 감각을 모아 더 깊은 숲으로 나아가세요.', 70, { radius: 1.55, motion: motion(2.5, 0.2, 0.45), wind: 1.35, obstacles: [wall(26, 3.4, 5.4), wall(46, 3.2, 5, -1.6)], goal: 30 }),
  ...Array.from({ length: 38 }, (_, index) => laterStage(index + 13))
]);

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

const animalPassDuration = Object.freeze({ bird: 8, rabbit: 7, deer: 10 });
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
  const a = .18 + random(0x9e3779b9) * .18, b = .06 + random(0x3c6ef372) * .10;
  const u = (t - passId * duration) / duration, tau = Math.PI * 2;
  // Integral of a positive varying velocity. Each pass crosses once, never reverses.
  const progress = u + a / tau * (Math.sin(tau * u + phase) - Math.sin(phase)) +
    b / (tau * 2) * (Math.sin(tau * 2 * u + secondPhase) - Math.sin(secondPhase));
  const rate = 1 + a * Math.cos(tau * u + phase) + b * Math.cos(tau * 2 * u + secondPhase);
  const span = stage.distance * 1.25 + (stage.radius || 1.25) * 3;
  const x = (stage.targetX || 0) + direction * span * (2 * progress - 1);
  let y = stage.height ?? (stage.kind === 'bird' ? 4.8 : stage.kind === 'rabbit' ? .7 : 1.65);
  if (stage.kind === 'bird') {
    const amplitude = stage.motion?.amplitudeY || .7;
    const cycles = 1.2 + random(0xa54ff53a) * 1.2;
    y += amplitude * (.72 * Math.sin(tau * cycles * u + phase) + .28 * Math.sin(tau * (cycles + .8) * u + secondPhase));
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
    rx: kind === 'bird' ? r * 1.38 : kind === 'deer' ? r * 1.23 : kind === 'rabbit' ? r * 1.10 : r,
    ry: kind === 'bird' ? r * .88 : kind === 'deer' ? r * .73 : kind === 'rabbit' ? r * .72 : r,
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
  return {
    position: { ...PLAYER },
    velocity: { x: Math.sin(yaw) * cp * speed, y: Math.sin(pitch) * speed, z: Math.cos(yaw) * cp * speed },
    elapsed: 0, active: true, result: null, trail: [{ ...PLAYER }],
    speed, mass: bullet ? weapon.ammo.mass : getArrowMass(arrow), windFactor: bullet ? weapon.ammo.windFactor : getWindResponse(arrow),
    projectileType: bullet ? 'bullet' : 'arrow', shaftLength: bullet ? .12 : .85,
    // Crossbow drag is an explicit short-range game balance, not a real-weapon claim.
    dragRate: bullet ? weapon.ammo.dragRate : (Math.max(0, getArrow(arrow).fletching?.drag ?? 0) + Math.max(0, weapon.extraDragRate ?? 0)) * REFERENCE_ARROW_MASS / getArrowMass(arrow),
    lastTrailTime: 0, targetPassed: false
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

/** Advance a shot; worldTime is the absolute scene time at the START of this interval. */
export function stepArrow(shot, dt, stage, worldTime = 0) {
  if (!shot.active) return shot.result;
  if (!(dt > 0) || !Number.isFinite(dt)) return null;
  const position = shot.position, velocity = shot.velocity;
  const drag = Math.max(0, shot.dragRate ?? 0);
  const acceleration = { x: (stage.wind || 0) * WIND_RESPONSE * (shot.windFactor ?? 1), y: -GRAVITY, z: 0 };
  const events = [];
  const ground = roots(position.y, velocity.y, acceleration.y, 0, dt, drag).filter(t => t >= 0 && t <= dt && velocityAt(velocity, acceleration, t, drag).y <= 0);
  if (ground.length) events.push({ t: Math.min(...ground), type: 'ground', score: 0, zone: '땅에 떨어졌어요' });
  for (const obstacle of stage.obstacles || []) {
    const t = obstacleTime(position, velocity, acceleration, obstacle, dt, drag);
    if (t !== null) events.push({ t, type: 'obstacle', score: 0, zone: '장애물에 닿았어요' });
  }
  const person = personCollision(position, velocity, acceleration, stage, worldTime, dt, drag);
  if (person) events.push({ ...person, type: 'person', score: 0, zone: '사람이 가로막았어요' });
  const targetTime = velocity.z > 0 ? roots(position.z, velocity.z, 0, stage.distance, dt, drag).find(t => t >= -1e-9 && t <= dt + 1e-9) ?? -1 : -1;
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
    shot.targetPassed = true;
  }
  if (shot.elapsed + dt >= 8) events.push({ t: Math.max(0, 8 - shot.elapsed), type: 'miss', score: 0, zone: '멀리 날아갔어요' });
  const eventPriority = { person: 0, obstacle: 1, ground: 2, hit: 3, miss: 4 };
  events.sort((a, b) => a.t - b.t || eventPriority[a.type] - eventPriority[b.type]);
  const event = events[0], usedTime = event ? event.t : dt;
  shot.position = at(position, velocity, acceleration, usedTime, drag);
  shot.velocity = velocityAt(velocity, acceleration, usedTime, drag);
  shot.elapsed += usedTime;
  if (shot.elapsed - shot.lastTrailTime >= 0.025 || event) {
    shot.trail.push({ ...shot.position });
    shot.lastTrailTime = shot.elapsed;
    if (shot.trail.length > 180) shot.trail.shift();
  }
  if (event) {
    shot.active = false;
    const { t, ...result } = event;
    shot.result = { ...result, point: { ...shot.position }, flightTime: shot.elapsed };
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
    stepArrow(shot, step, stage, worldTime + time);
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
