/** Deterministic metre/second archery simulation. Coordinates: x right, y up, z forward. */
import {isAnimalKind,scoreAnimalPoint,getAnimalGroundHeight} from './animal-zones.mjs?v=20261104-archery-eagle-dive1';
export {getAnimalAimPoint,getAnimalAttachmentPoint} from './animal-zones.mjs?v=20261104-archery-eagle-dive1';
export const PLAYER = Object.freeze({ x: 0, y: 1.65, z: 0 });
export const GRAVITY = 9.81;
export const WIND_RESPONSE = 2.5;
// High bow arcs need time to reach the ground. Event bullets retain their
// existing timeout as well as their earlier target-plane miss resolution.
export const ARROW_FLIGHT_LIMIT = 16;
export const BULLET_FLIGHT_LIMIT = 8;
export const getFlightTimeLimit = shot => shot?.projectileType === 'bullet' ? BULLET_FLIGHT_LIMIT : ARROW_FLIGHT_LIMIT;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const SCOPES = Object.freeze([
  {magnification:2,name:'2배 조준경',priceMultiplier:.6},
  {magnification:3,name:'3배 조준경',priceMultiplier:1},
  {magnification:6,name:'6배 조준경',priceMultiplier:2},
  {magnification:8,name:'8배 조준경',priceMultiplier:3}
].map(Object.freeze));

// Game ratings: grip controls aiming; elasticity controls stored launch energy.
const bowSway = grip => 0.008 + 0.0006 * (100 - clamp(grip, 0, 100));
const bowSpeed = elasticity => 32 + 0.30 * clamp(elasticity, 0, 100);
export const REFERENCE_ARROW_MASS = 24; // grams, used for bow speed comparisons
const bow = (id, name, tag, description, grip, elasticity, color) => {
  const weaponType = id >= 10 && id < 20 ? 'crossbow' : 'bow';
  const burstTier = id >= 15 && id < 20 ? id - 15 : -1;
  return {
    id, name, tag, description, grip, elasticity, color, weaponType,
    // A new weapon family must not introduce a hidden speed or range cliff.
    launchBoost: 1, extraDragRate: 0,
    burstCount: burstTier >= 0 ? 3 : 1,
    burstInterval: burstTier >= 0 ? [.14, .125, .11, .095, .08][burstTier] : 0,
    burstSpread: burstTier >= 0 ? [.024, .018, .012, .008, .0045][burstTier] : 0,
    grouping: burstTier >= 0 ? [35, 50, 70, 84, 96][burstTier] : 100,
    rarity: burstTier >= 0 ? '레어' : '일반',
    scopeCompatible: true, scopePrice: 0,
    sway: bowSway(grip), speed: bowSpeed(elasticity)
  };
};
// Component coefficients are game tuning, not measurements of commercial arrows.
// Mass is explicit: changing a point must not silently change the shaft's mass.
const point = (name, material, shape, drag, precision) => ({ name, material, shape, drag, precision });
const shaft = (name, material, diameter, windArea, drag, precision) => ({ name, material, diameter, windArea, drag, precision });
const fletch = (name, material, mass, windArea, drag, stability) => ({ name, material, mass, windArea, drag, stability });
const arrow = (id, name, tag, description, tipMass, shaftMass, tip, shaft, fletching, color) => {
  const item = { id, name, tag, description, tipMass, shaftMass, tip, shaft, fletching, color };
  // Compatibility summaries; simulation helpers always read the actual components.
  return { ...item, variance: getArrowVariance(item), windFactor: getWindResponse(item) };
};
const gun = (id, name, tag, description, price, grip, power, mass, windFactor, dragRate, color) => ({
  id, name, tag, description, price, grip, power, muzzleSpeed: 0, color, weaponType: 'gun',
  speed: 0, sway: bowSway(grip), burstCount: 1, burstInterval: 0, burstSpread: 0,
  grouping: 100, rarity: '일반', scopeCompatible: id >= 22, scopePrice: id >= 22 ? 240 : 0,
  scopeMagnifications: Object.freeze(id >= 22 ? [3] : []),
  magazineSize: [2, 4, 6, 8, 10][id - 20],
  reloadSeconds: [3, 2.5, 2, 1.5, 1][id - 20],
  reloadLabel: ['느림', '보통', '보통', '빠름', '빠름'][id - 20],
  ammo: { name: '기본 탄환', mass, windFactor, dragRate, variance: 0 }
});

// Released ranks are stable: rebalancing stats must not move saved items to a
// different price, equipment band, scope cost or steady-window duration.
const EQUIPMENT_ORDER = Object.freeze({
  weapon: Object.freeze([0, 4, 5, 6, 1, 2, 8, 7, 9, 3, 13, 12, 10, 14, 11, 15, 16, 17, 18, 19]),
  arrow: Object.freeze([0, 4, 6, 1, 8, 5, 9, 2, 7, 10, 3, 11, 12, 13, 14, 15, 16, 17, 18])
});
function equipmentCatalog(items, kind) {
  const ranks = new Map(EQUIPMENT_ORDER[kind].map((id, rank) => [id, rank]));
  const ranked = items.filter(item => item.weaponType !== 'gun').slice().sort((a, b) =>
    (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) || a.id - b.id);
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
      // Scope tiers follow the released shop order, never the inventory ID.
      item.scopeMagnifications = Object.freeze(SCOPES.slice(0, 1 + Math.floor(rank / 5)).map(scope => scope.magnification));
      // Keep the released three-power price as the base for every option.
      item.scopePrice = Math.max(500, Math.ceil(item.price * .2 / 50) * 50);
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
    if (key === 'stability') return -getArrowConsistency(item);
    if (key === 'tip-light') return item.tipMass ?? 0;
    if (key === 'tip-heavy') return -(item.tipMass ?? 0);
    return rank(item);
  };
  return [...items].sort((a, b) => value(a) - value(b) || rank(a) - rank(b) || a.id - b.id);
}

export const BOWS = equipmentCatalog([
  bow(0, '숲길 목궁', '입문', '기본 그립과 탄성으로 첫 한 발을 배워요.', 30, 40, '#a9784e'),
  bow(1, '단풍나무 활', '탄성형', '여행자 단궁의 그립을 유지하고 탄성을 한 단계 높였어요.', 50, 60, '#76875a'),
  bow(2, '바람결 활', '안정형', '단풍나무 활의 탄성을 유지하고 그립을 개선했어요.', 60, 60, '#598b8a'),
  bow(3, '달빛 명궁', '균형형', '대나무 복합궁의 탄성에 더 안정적인 그립을 더했어요.', 75, 75, '#c49b50'),
  bow(4, '가죽그립 활', '그립형', '기본 활의 탄성은 그대로, 가죽 손잡이로 조준을 안정시켜요.', 40, 40, '#ad795b'),
  bow(5, '참나무 강궁', '강궁', '가죽그립 활의 그립을 유지하고 탄성을 높였어요.', 40, 50, '#82613f'),
  bow(6, '여행자 단궁', '균형형', '참나무 강궁의 탄성에 더 편안한 그립을 더했어요.', 50, 50, '#849167'),
  bow(7, '수련용 정밀궁', '정밀형', '폭풍 장궁의 탄성을 유지하고 조준 흔들림을 줄였어요.', 70, 70, '#668c83'),
  bow(8, '폭풍 장궁', '강궁', '바람결 활의 그립을 유지하면서 한 단계 빠르게 쏴요.', 60, 70, '#687588'),
  bow(9, '대나무 복합궁', '탄성형', '수련용 정밀궁의 그립에 탄성을 조금 더했어요.', 70, 75, '#9aab70'),
  bow(10, '장인의 석궁', '정밀 석궁', '가죽그립 석궁의 안정감을 유지하고 탄성을 높였어요.', 80, 85, '#b39467'),
  bow(11, '천둥 석궁', '고속 석궁', '은빛 정밀석궁의 그립에 더 강한 탄성을 더한 단발 석궁.', 85, 90, '#7c889e'),
  bow(12, '가죽그립 석궁', '안정 석궁', '사냥꾼 석궁의 탄성을 유지하고 그립을 한 단계 높였어요.', 80, 80, '#709e95'),
  bow(13, '사냥꾼 석궁', '강성 석궁', '달빛 명궁의 그립을 이어받고 탄성을 조금 높인 첫 석궁.', 75, 80, '#a79679'),
  bow(14, '은빛 정밀석궁', '정밀 석궁', '장인의 석궁보다 그립이 좋아져 더 차분하게 겨눠요.', 85, 85, '#bcafcf'),
  bow(15, '레어 연발석궁', '레어 3연발', '천둥 석궁보다 안정적인 그립. 첫 발은 조준한 방향, 두 발은 주변으로 쏘고 세 발의 점수를 합쳐요.', 90, 90, '#718ea2'),
  bow(16, '레어 속사석궁', '레어 속사 3연발', '첫 연발석궁의 그립을 유지하고 탄성과 집탄성을 높였어요.', 90, 95, '#598f83'),
  bow(17, '레어 정밀석궁', '레어 정밀 3연발', '속사석궁의 탄성에 더 좋은 그립과 정밀한 레일을 더했어요.', 95, 95, '#a79679'),
  bow(18, '레어 매눈석궁', '레어 고급 3연발', '정밀석궁의 그립을 유지하고 탄성과 집탄성을 높였어요.', 95, 100, '#b1a471'),
  bow(19, '레어 명인석궁', '레어 명품 3연발', '최고 그립과 탄성, 가장 좁은 탄착군을 갖춘 마지막 석궁.', 100, 100, '#bcafcf'),
  gun(20, '훈련용 공기총', '입문 사격총', '접시 사격용 기본 총. 본편 최고 탄속의 2배로 전용 탄환을 발사해요.', 0, 60, 40, 4, .28, .130, '#7c9a83'),
  gun(21, '숲길 카빈', '경량 사격총', '기본 총보다 좋은 그립과 빠른 장전. 4발 탄창으로 두 발 더 쏴요.', 950, 70, 50, 5, .22, .110, '#9a8467'),
  gun(22, '안정형 소총', '안정 사격총', '카빈보다 안정적인 그립과 빠른 장전. 6발 탄창과 고정 스코프를 사용해요.', 1250, 80, 60, 6, .16, .090, '#7b949b'),
  gun(23, '장거리 소총', '장거리 사격총', '안정형 소총보다 그립과 장전이 좋아지고, 탄환의 공기 저항도 줄었어요.', 1750, 90, 70, 7, .12, .065, '#9c8e73'),
  gun(24, '정밀 사격총', '정밀 사격총', '최고 그립과 가장 빠른 장전, 10발 탄창으로 정밀하게 겨눠요.', 2200, 100, 80, 8, .08, .050, '#a8b1bf')
], 'weapon');

/** Return a supported scope's price without treating an invalid weapon as the starter bow. */
export function getScopePrice(weaponOrId, magnification) {
  const weapon = typeof weaponOrId === 'number' ? BOWS.find(item => item.id === weaponOrId) : weaponOrId;
  const scope = SCOPES.find(item => item.magnification === magnification);
  if (!scope || !weapon?.scopeCompatible || !Array.isArray(weapon.scopeMagnifications) || !weapon.scopeMagnifications.includes(magnification) ||
      !Number.isFinite(weapon.scopePrice) || weapon.scopePrice <= 0) return null;
  // Event guns retain their exact 240-coin price instead of rounding it to 250.
  return magnification === 3 ? weapon.scopePrice : Math.max(50, Math.ceil(weapon.scopePrice * scope.priceMultiplier / 50) * 50);
}

export const ARROWS = equipmentCatalog([
  arrow(0, '나무 화살', '입문', '강철 촉과 목재 몸통, 넓은 천연 깃으로 바람과 비행 편차를 익혀요.', 4, 19.4,
    point('연습용 원뿔촉', '강철', '원뿔형', .018, 40), shaft('목재 몸통', '목재', 7.2, .70, .072, 30),
    fletch('넓은 깃', '천연 깃', .60, .30, .050, 40), '#b28b64'),
  arrow(1, '깃털 화살', '안정형', '큰 천연 깃이 자세를 잡아줘요. 더 정밀하고 가는 알루미늄 몸통이 깃의 저항을 보완해요.', 4, 18.1,
    point('정렬 원뿔촉', '강철', '매끈한 원뿔형', .014, 52), shaft('정밀 알루미늄 몸통', '알루미늄', 6.3, .50, .044, 52),
    fletch('큰 안정깃', '천연 깃', .70, .37, .061, 64), '#8b9c78'),
  arrow(2, '탄소 화살', '경량형', '정밀하게 맞춘 카본 몸통과 좁은 합성 날개로 비연 화살보다 일정하게 날아요.', 3.8, 17.1,
    point('정밀 유선촉', '강철', '유선형', .010, 82), shaft('정밀 카본 몸통', '카본', 5.8, .49, .043, 80),
    fletch('좁은 날개', '합성 베인', .30, .20, .040, 62), '#71999b'),
  arrow(3, '은빛 화살', '유선형', '카본·알루미늄 복합 몸통과 은빛 마감의 유선촉. 매끈한 연결부가 감속을 줄여요.', 4, 15.95,
    point('은빛 유선촉', '은빛 마감 강철', '매끈한 유선형', .007, 95), shaft('가는 복합 몸통', '카본·알루미늄', 4.6, .36, .031, 92),
    fletch('유선형 날개', '합성 베인', .25, .19, .037, 78), '#bfc8d0'),
  arrow(4, '가벼운 연습 화살', '가벼운 촉', '가벼운 촉, 선별한 목재와 작은 천연 깃. 기본 화살보다 조금 가볍고 일정해요.', 3.5, 19.65,
    point('경량 연습촉', '강철', '작은 원뿔형', .017, 42), shaft('선별 목재 몸통', '선별 목재', 7.1, .69, .070, 42),
    fletch('작은 깃', '천연 깃', .45, .27, .046, 42), '#c3a474'),
  arrow(5, '황동촉 화살', '황동촉', '작게 가공한 황동 촉과 정밀 알루미늄 몸통. 곧게 붙인 깃으로 비행 편차를 줄여요.', 4.6, 16.95,
    point('소형 황동촉', '황동', '매끈한 원뿔형', .012, 70), shaft('정렬 알루미늄 몸통', '알루미늄', 6.1, .50, .045, 65),
    fletch('직선 깃', '천연 깃', .45, .28, .048, 65), '#b99c52'),
  arrow(6, '긴깃 화살', '자세 제어', '긴 천연 깃은 자세를 잘 잡지만 바람과 저항도 받아요. 가는 알루미늄 몸통으로 전체 저항을 낮췄어요.', 4, 18.5,
    point('매끈한 연습촉', '강철', '원뿔형', .015, 46), shaft('가는 알루미늄 몸통', '알루미늄', 6.5, .55, .050, 44),
    fletch('긴 안정깃', '천연 깃', .70, .36, .060, 58), '#9a9c77'),
  arrow(7, '돌풍 화살', '바람 대응', '더 가는 카본 몸통과 낮은 합성 날개로 옆바람을 덜 받아요. 촉의 정렬도 개선했어요.', 4.1, 16.4,
    point('정렬 유선촉', '강철', '유선형', .009, 86), shaft('가는 카본 몸통', '카본', 5.4, .45, .040, 82),
    fletch('낮은 날개', '합성 베인', .30, .19, .038, 65), '#709ba0'),
  arrow(8, '철갑촉 화살', '철갑촉', '묵직한 강철 촉을 가벼운 알루미늄 몸통에 맞췄어요. 작은 합성 깃으로 전체 무게와 저항을 줄였어요.', 4.8, 17.1,
    point('소형 강철촉', '강철', '단단한 원뿔형', .013, 65), shaft('경량 알루미늄 몸통', '알루미늄', 6.2, .52, .046, 55),
    fletch('삼각 깃', '합성 베인', .50, .30, .052, 62), '#89909b'),
  arrow(9, '비연 화살', '저항형', '초소형 합성 날개는 저항이 작지만 자세 제어가 약해요. 균일한 카본 복합 몸통과 정렬된 촉이 보완해요.', 3.8, 17.55,
    point('경량 유선촉', '강철', '유선형', .011, 76), shaft('경량 카본 복합 몸통', '카본 복합재', 6.0, .53, .048, 70),
    fletch('초소형 날개', '합성 베인', .25, .20, .040, 55), '#93a8b3'),
  arrow(10, '금빛 화살', '정밀형', '정밀 카본 몸통과 금빛 마감의 정렬 촉. 곡면 날개의 자세 제어를 더해 일정하게 날아요.', 4.1, 16,
    point('금빛 정렬촉', '금빛 마감 강철', '유선형', .008, 90), shaft('고정밀 카본 몸통', '카본', 5.0, .39, .034, 90),
    fletch('곡면 날개', '합성 베인', .30, .21, .039, 75), '#ceb36c'),
  arrow(11, '바람깃 화살', '정밀형', '정밀 복합 몸통과 매끈한 촉, 자세를 잘 잡는 쐐기 날개. 장거리 화살로 넘어가기 전의 20g 정밀 화살이에요.', 4, 15.75,
    point('고정밀 유선촉', '강철', '매끈한 유선형', .006, 100), shaft('정밀 복합 몸통', '카본·알루미늄', 4.2, .32, .028, 96),
    fletch('쐐기 날개', '합성 베인', .25, .18, .035, 90), '#82a7a5'),
  {...arrow(12, '탄성 화살', '특수 · 한 번 튕김', '바람깃 화살과 같은 기본 성능. 과녁 앞 땅에서 한 번 튕기며 속도가 줄어요. 벽에 닿거나 과녁을 지나친 뒤에는 튕기지 않아요.', 4, 15.75,
    point('탄성 유선촉', '강철·탄성 접합', '매끈한 유선형', .006, 100), shaft('정밀 복합 몸통', '카본·알루미늄', 4.2, .32, .028, 96),
    fletch('탄성 안정깃', '합성 베인', .25, .18, .035, 90), '#be9a69'),
    ability:Object.freeze({type:'bounce',label:'한 번 튕김',description:'과녁 앞 지면에서 1회 튕김 · 전진 속도 75% · 수직 반발 55%',maxBounces:1,horizontalRetention:.75,restitution:.55})},
  {...arrow(13, '자석 화살', '특수 · 근접 유도', '바람깃 화살과 같은 기본 성능. 실제 과녁 5m 안에서 중심 쪽으로 조금 휘어요. 크게 빗나간 화살을 되돌리거나 벽을 통과하지 않아요.', 4, 15.75,
    point('자성 유선촉', '자성 강철', '매끈한 유선형', .006, 100), shaft('정밀 복합 몸통', '카본·알루미늄', 4.2, .32, .028, 96),
    fletch('유도 안정깃', '합성 베인', .25, .18, .035, 90), '#629d98'),
    ability:Object.freeze({type:'magnetic',label:'근접 유도',description:'실제 표적 5m 안에서 약하게 유도 · 최대 약 10° 보정 · 명중 보장 없음',radius:5,maxAcceleration:24,maxTurnRate:1,maxTurnAngle:.18,maxCorrectionSpeed:4})},
  {...arrow(14, '경량 장거리 화살', '장거리 · 60m', '20g 정밀 화살에서 1g을 줄였어요. 가는 카본 복합 몸통과 낮은 날개로 더 빠르게 도착하고 덜 떨어져요.', 3.9, 14.88,
    point('경량 정밀촉', '강철', '매끈한 유선형', .0058, 100), shaft('경량 카본 복합 몸통', '카본 복합재', 4.0, .28, .024, 97),
    fletch('낮은 장거리 날개', '합성 베인', .22, .16, .031, 91), '#7babb4'),longRange:true,recommendedDistance:60},
  {...arrow(15, '유선 장거리 화살', '장거리 · 80m', '18g으로 가볍게 맞춘 몸통과 얇은 날개. 촉과 몸통의 유선 연결부가 감속을 한 단계 더 줄여요.', 3.8, 13.99,
    point('유선 연결촉', '강철', '좁은 유선형', .0055, 100), shaft('유선 카본 복합 몸통', '카본 복합재', 3.8, .24, .0206, 98),
    fletch('얇은 유선 날개', '합성 베인', .21, .14, .027, 92), '#73a1bd'),longRange:true,recommendedDistance:80},
  {...arrow(16, '저저항 장거리 화살', '장거리 · 100m', '17g의 가는 카본 몸통과 작게 정렬한 날개가 바람과 저항을 덜 받아요. 몸통의 정밀도도 함께 높였어요.', 3.7, 13.1,
    point('저저항 정렬촉', '강철', '좁은 유선형', .0052, 100), shaft('고정밀 카본 몸통', '카본', 3.6, .20, .0177, 99),
    fletch('미세 정렬 날개', '합성 베인', .20, .12, .023, 93), '#8d9dbf'),longRange:true,recommendedDistance:100},
  {...arrow(17, '정밀 장거리 화살', '장거리 · 120m', '16g 경량 몸통과 균일하게 맞춘 날개. 같은 활에서도 초기 속도와 도착 속도가 조금씩 더 높아져요.', 3.6, 12.21,
    point('정밀 소형 유선촉', '강철', '좁은 유선형', .005, 100), shaft('균일 정밀 카본 몸통', '카본', 3.4, .17, .0142, 100),
    fletch('균일 정밀 날개', '합성 베인', .19, .10, .020, 94), '#aea1c2'),longRange:true,recommendedDistance:120},
  {...arrow(18, '극세 장거리 화살', '장거리 · 150m', '15g 극세 카본 몸통과 가장 작은 저항의 날개. 긴 비행에서도 속도를 더 유지해 중력으로 떨어지는 거리를 줄여요.', 3.5, 11.32,
    point('극세 연결 유선촉', '강철', '좁은 유선형', .0048, 100), shaft('극세 정밀 카본 몸통', '카본', 3.2, .14, .0112, 100),
    fletch('극세 균형 날개', '합성 베인', .18, .08, .017, 96), '#c2b58a'),longRange:true,recommendedDistance:150}
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
export const LONG_RANGE_DISTANCES = Object.freeze([60, 80, 100, 120, 150]);
export const LONG_RANGE_LESSONS = Object.freeze([
  'fixed-intro','elevated-fixed','tracking-intro','wind-intro','vertical-intro',
  'fixed-gap-3/4','fixed-gap-1/2','fixed-gap-1/3','pillars-regular','diagonal-tracking',
  'low-wall-arc','animal-rabbit','animal-wildcat','animal-deer','animal-pigeon',
  'animal-eagle','animal-cheetah','passers-tracking','hidden-tracking','double-wall-finale'
]);
const targetRadii = Object.freeze([1.45, 1.65, 1.85, 2.1]);
const MAIN_TARGET_SPEED_SCALE = 1.15;
// Double circular target movement relative to the previous release.
const CIRCULAR_TARGET_SPEED_SCALE = MAIN_TARGET_SPEED_SCALE * 2;
const stageShapes = Object.freeze({
  rabbit: [1.10, .72, 16], wildcat: [1.12, .66, 12.5], deer: [1.23, .73, 7.6],
  pigeon: [1.18, .86, 9.2], eagle: [1.55, .95, 5.65], cheetah: [1.38, .62, 5.8],
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
  const basicArrow = ARROWS[0], mass = getArrowMass(basicArrow);
  const speed = BOWS[0].speed * Math.sqrt(REFERENCE_ARROW_MASS / mass), drag = getArrowDragRate(basicArrow);
  const flightSeconds = -Math.log1p(-drag * template.distance / speed) / drag;
  const windDriftPerUnit = WIND_RESPONSE * getWindResponse(basicArrow) * (flightSeconds - template.distance / speed) / drag;
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
  let chapterId = 0;
  const addChapter = (title, subtitle, hint, build, {distances = learningDistances, legacyFirst, key} = {}) => {
    chapterId++;
    for (const [index, distance] of distances.entries()) {
      const id = templates.length + 1, radius = targetRadii[index];
      // Keep balance and saved records attached to the lesson when its display
      // position changes. The elevated chapter moves from 41–44 to 5–8.
      const catalogV1Id = id >= 5 && id <= 8 ? id + 36 : id >= 9 && id <= 44 ? id - 4 : id;
      const extra = {chapterId,chapterName:title,lessonKey:key || title,catalogV1Id,radius,height:radius+.5,
        ...(legacyFirst ? {legacyStageId:legacyFirst+index} : {}),...build(index,distance,radius,catalogV1Id)};
      const make = extra.coverageMode ? coverStage : stage;
      templates.push(make(id, `${title} · ${distance}m`, subtitle, hint, distance, extra));
    }
  };
  const cover = (fraction,index,distance,extra = {}) => ({coverageMode:'side-walls',visibleFraction:fraction,
    coverMaterial:index%2 ? 'timber' : 'stone',layoutJitter:distance*.055,...extra});
  const pillars = (index,distance,radius,extra = {}) => ({coverageMode:'pillars',visibleFraction:.75,
    coverMaterial:index%2 ? 'timber' : 'stone',layoutJitter:distance*.055,
    motion:motion(radius*.85,0,.25+index*.025),...extra});
  const people = (count,index,distance,radius=1.10+index*.10,height=1.35) => {
    const crowd=count>1,members=crowd?4+(index>=1?1:0)+(index>=3?1:0):1;
    // The painted coat occupies roughly half of the full moving-limb box.
    // Keep coats together in a crowd, not just their invisible box edges.
    const width=radius*(crowd?.90:.95),spacing=width*.44;
    const groupHalfWidth=((members-1)*spacing+width)/2;
    const crossingSpan=crowd?groupHalfWidth+width*.30:radius*.85;
    // Keep the quick central crossing, then turn farther beyond the rings.
    // The extra clear interval accommodates the last arrow in a real burst.
    const span=crossingSpan+width*(crowd?.20+index/15:.25);
    const passDuration=(crowd?2.8-index*.12:1.5-index*.08)*span/crossingSpan;
    return Array.from({length:members},(_,person)=>({
      id:person,behavior:crowd?'crowd':'shuttle',
      z:distance-Math.max(.45,Math.min(1.2,distance*.04))-person*.08,
      width,height:Math.max(2.3,height+radius*.75),depth:.32,
      // A crowd crosses as a compact line. At either turn its centre clears
      // the scoring rings briefly; every path stays continuous on screen.
      span,
      laneOffset:(person-(members-1)/2)*spacing,
      passDuration,phase:.5
    }));
  };

  // Learn a stationary target's height before adding movement, wind or cover.
  // The original fixed and tracking lessons retain their goals and wind.
  addChapter('고정 표적','먼저 거리와 당기는 힘을 익혀요.',
    '바람 없는 과녁이에요. 충분히 당긴 뒤, 멀수록 조금 높이 겨눠보세요.',
    index => ({goal:10+index*2}),{legacyFirst:1,key:'fixed-intro'});
  addChapter('높은 고정 과녁','높은 곳의 과녁으로 발사 각도를 익혀요.',
    '과녁은 멈춰 있어요. 높은 위치와 거리에 맞춰 위쪽을 겨누되 너무 크게 올리지 마세요.',
    (index,distance,radius) => ({height:radius+1.15+index*.12,goal:12+index*2,wind:0}),{key:'elevated-fixed'});
  addChapter('움직이는 표적','천천히 움직이는 중심을 따라가요.',
    '과녁이 천천히 좌우로 움직여요. 화살이 도착할 앞쪽을 조금 겨눠보세요.',
    (index,distance,radius,id) => ({goal:12+index*2,wind:signedWind(id,.03+index*.008),
      motion:motion(radius*(.60+index*.10),0,.24+index*.025)}),{legacyFirst:5,key:'tracking-intro'});
  // A focused wind lesson needs perceptible drift, unlike the nearly calm
  // tracking lessons around it. The same signed wind drives arrows and leaves.
  addChapter('가벼운 바람 읽기','옆바람에 밀리는 화살을 읽어요.',
    '잎이 흘러가는 쪽으로 화살도 밀려요. 바람 반대쪽을 겨누고, 멀수록 더 보정해보세요.',
    (index,distance,radius,id) => ({goal:12+index*2,wind:signedWind(id,1+index*.1)}),{key:'wind-intro'});
  addChapter('높낮이 따라가기','위아래로 움직이는 과녁을 따라가요.',
    '옆으로는 움직이지 않아요. 올라가고 내려오는 속도를 보고 화살이 도착할 높이를 겨눠요.',
    (index,distance,radius,id) => ({goal:12+index*2,wind:signedWind(id,.05+index*.01),height:radius+.85,
      motion:{...motion(0,radius*.22,.22+index*.02),irregular:false}}),{key:'vertical-intro'});

  for (const [index,fraction] of [.75,.5,1/3].entries()) {
    const label=['3/4','1/2','1/3'][index];
    addChapter(`벽 사이 · ${label} 보임`,'양옆 벽 사이의 고정 과녁을 겨눠요.',
      `과녁의 ${label}이 보여요. 짧은 거리에서 열린 틈의 중심을 익힌 뒤 멀리 쏴보세요.`,
      (step,distance) => cover(fraction,step,distance),{legacyFirst:9+index*4,key:`fixed-gap-${label}`});
  }
  addChapter('기둥 사이 · 일정한 속도','가는 기둥 뒤 과녁을 일정한 속도로 따라가요.',
    '과녁의 약 3/4이 보여요. 기둥은 움직이지 않으니 과녁 중심이 열린 틈으로 나올 때 쏘세요.',
    (index,distance,radius) => pillars(index,distance,radius,{motion:{...motion(radius*.85,0,.22+index*.025),irregular:false}}),
    {key:'pillars-regular'});
  addChapter('기둥 사이 · 불규칙한 속도','기둥 뒤 과녁이 빨라졌다 느려져요.',
    '과녁의 약 3/4이 보여요. 일정한 박자 대신 지금의 이동 속도와 빈틈을 함께 읽어보세요.',
    (index,distance,radius) => pillars(index,distance,radius),{legacyFirst:21,key:'pillars-irregular'});
  addChapter('대각선 따라가기','좌우와 높낮이를 함께 읽어요.',
    '과녁이 대각선으로 움직여요. 지금 위치보다 화살이 도착할 위치를 조금 앞서 겨눠요.',
    (index,distance,radius) => ({height:radius+1,motion:{...motion(radius*.72,radius*.23,.25+index*.025),irregular:false}}),
    {key:'diagonal-tracking'});
  addChapter('낮은 담 너머','과녁의 아래쪽만 담에 가려져 있어요.',
    '보이는 중심을 기준으로 낙하를 보정하세요. 너무 낮은 화살은 앞쪽 담에 닿아요.',
    (index,distance,radius) => ({lowWall:true,obstacles:[wall(distance*.58,
      PLAYER.y+(radius+.5-radius*.18-PLAYER.y)*.58,Math.max(5,radius*3.4),0,index%2?'timber':'stone')]}),
    {key:'low-wall-arc'});

  const animals = [
    {kind:'rabbit',name:'토끼',radius:.85,height:.72,duration:16,bob:.32,pace:.85,hint:'땅을 딛었다가 통통 뛰는 토끼를 따라가요. 다음에 뛰어오를 위치를 읽어보세요.'},
    {kind:'wildcat',name:'살쾡이',radius:1,height:.8,duration:12.5,bob:.09,pace:1,hint:'짧은 보폭으로 가속하고 감속하는 살쾡이를 따라가요. 지금 속도에 맞춰 앞을 겨누세요.'},
    {kind:'deer',name:'사슴',radius:1.4,height:1.3,duration:7.6,bob:.66,pace:.95,hint:'큰 몸으로 빠르게 달리며 높이 도약하는 사슴의 도착 위치를 읽어보세요.'},
    {kind:'pigeon',name:'비둘기',radius:1.03,height:2.25,duration:9.2,bob:.62,pace:1,hint:'빠르게 위아래로 오르내리는 비둘기를 따라가요. 움직일 앞쪽과 높이를 함께 읽으세요.'},
    {kind:'eagle',name:'독수리',radius:1.22,height:2.35,duration:5.65,bob:.95,pace:1,hint:'매번 다른 지면 위치까지 내려왔다 올라가는 독수리의 앞쪽을 겨누세요.'},
    {kind:'cheetah',name:'치타',radius:1.16,height:.93,duration:5.8,bob:.18,pace:1,hint:'강하게 질주했다가 속도를 낮추는 치타를 따라가요. 가속 구간에서는 훨씬 앞을 겨누세요.'}
  ];
  for (const [animalIndex,animal] of animals.entries()) {
    addChapter(`${animal.name} 따라가기`,`${animal.name}의 움직임 익히기`,animal.hint,
      index => {
        const scale=1+index*.09;
        return {kind:animal.kind,radius:animal.radius*scale,height:animal.height*scale,
          motion:motion(0,animal.bob*scale,0),passDuration:animal.duration-index*.4,
          paceVariation:animal.pace,approachEase:animal.kind==='rabbit'?.2:.15};
      },{legacyFirst:25+animalIndex*4,key:`animal-${animal.kind}`});
  }
  addChapter('넓은 불규칙 이동','넓게 움직이는 과녁과 바람을 함께 읽어요.',
    '방향이 바뀌는 끝부분에서는 속도가 줄어요. 움직임을 읽고 좋은 순간을 기다려 보세요.',
    (index,distance,radius) => ({motion:motion(radius*(1.02+index*.08),radius*.07,.31+index*.025)}),
    {key:'wide-irregular'});
  addChapter('기둥 사이 높낮이','기둥 뒤에서 과녁의 높이도 바뀌어요.',
    '가는 기둥 뒤 과녁이 대각선으로 움직여요. 중심의 높이와 가로 방향을 함께 따라가세요.',
    (index,distance,radius) => pillars(index,distance,radius,{height:radius+.8,
      motion:motion(radius*.85,radius*.16,.29+index*.02)}),{key:'pillars-diagonal'});
  addChapter('한 사람 왕복 피하기','과녁 바로 앞을 왕복하는 사람의 틈을 읽어요.',
    '사람은 표적이 아니에요. 과녁 앞에서 방향을 바꾸는 박자를 보고 화살이 도착할 때 열리는 틈을 겨누세요.',
    (index,distance) => ({radius:1.10+index*.10,height:1.35,passers:people(1,index,distance)}),{key:'one-passer'});
  addChapter('사람 행렬의 틈','줄지어 오가는 사람들 사이로 잠깐 열린 과녁을 겨눠요.',
    '사람들이 과녁 바로 앞을 이어서 가려요. 행렬 끝에서 중심이 열리는 짧은 틈에 맞춰 쏘세요.',
    (index,distance) => ({radius:1.10+index*.10,height:1.35,passers:people(2,index,distance)}),{key:'two-passers'});
  addChapter('행렬 사이 움직이는 과녁','움직이는 과녁과 빠르게 지나가는 행렬의 틈을 함께 읽어요.',
    '화살이 도착할 과녁 위치와 행렬 끝이 열리는 순간을 함께 살펴보세요. 사람에게 닿으면 그 발사는 점수를 받지 못해요.',
    (index,distance) => ({radius:1.10+index*.10,height:1.35,passers:people(2,index,distance),
      motion:motion(.58+index*.12,0,.23+index*.02)}),{key:'passers-tracking'});
  addChapter('좁은 틈의 움직임','고정된 좁은 틈 뒤로 과녁이 움직여요.',
    '과녁이 가운데에 오면 절반이 보여요. 움직이면 보이는 부분이 달라지니 빈틈을 통과할 때를 겨누세요.',
    (index,distance,radius) => cover(.5,index,distance,{variableExposure:true,motion:motion(radius*.42,0,.28+index*.02)}),
    {key:'moving-half-gap'});

  // Keep these authored distances as the scale reference for the appended
  // long-range lessons. Runtime hidden targets are moved back after expansion.
  const hiddenDistances = [30,35,40,50];
  const hidden = (index,distance,radius,profile,extra = {}) => ({
    radius:[1.45,1.6,1.8,2.1][index],height:[2,2.15,2.3,2.6][index],visibleFraction:0,
    fullCover:profile,...extra
  });
  addChapter('완전히 숨은 고정 과녁','미리 보고 포물선으로 넘겨요.',
    '과녁 보기로 벽 뒤의 위치를 확인하세요. 충분히 당긴 뒤 벽 위를 넘겨 과녁으로 내려오는 궤적을 겨누세요.',
    (index,distance,radius) => hidden(index,distance,radius,'single',index===3?{legacyStageId:49}:{}),
    {distances:hiddenDistances,key:'hidden-fixed'});
  addChapter('벽 뒤에서 움직이는 과녁','미리 본 움직임을 이어서 읽어요.',
    '과녁 보기로 벽 뒤의 움직임을 살펴보세요. 화살이 도착할 위치를 앞서 겨누고 벽 위로 쏘세요.',
    (index,distance,radius) => hidden(index,distance,radius,'single',{
      motion:motion(index===3?1.8:.65+index*.22,0,index===3?.28:.20+index*.02),
      ...(index===3?{legacyStageId:50}:{})}),{distances:hiddenDistances,key:'hidden-tracking'});
  addChapter('벽 뒤 불규칙 이동','보이지 않는 동안에도 속도가 바뀌어요.',
    '미리 보기를 자주 활용하세요. 벽 뒤에서 빨라졌다 느려지는 과녁의 다음 위치를 읽어보세요.',
    (index,distance,radius) => hidden(index,distance,radius,'single',{
      motion:motion(.95+index*.27,.08+index*.02,.29+index*.025)}),
    {distances:hiddenDistances,key:'hidden-irregular'});
  addChapter('기둥과 사람 사이','고정 기둥과 지나가는 사람을 함께 살펴요.',
    '기둥 사이로 과녁이 움직이고 사람이 앞을 지나가요. 화살이 지날 길이 모두 열리는 순간을 기다리세요.',
    (index,distance,radius) => pillars(index,distance,radius,{radius:1.15+index*.12,height:1.5,
      motion:motion(.65+index*.12,0,.28+index*.02),passers:people(2,index,distance,1.15+index*.12,1.5)}),{key:'pillars-passers'});
  addChapter('바람 속 하늘 추적','새의 높낮이와 강한 옆바람을 함께 읽어요.',
    '비둘기는 빠르게 높이를 바꾸고 독수리는 넓게 활공해요. 도착할 위치와 바람의 밀림을 함께 계산하세요.',
    index => {
      const animal=animals[index%2?4:3],scale=1+index*.09;
      return {kind:animal.kind,radius:animal.radius*scale,height:(animal.height+.35)*scale,
        // The 50m eagle needs time to lead a visible animal through real flight.
        motion:motion(0,animal.bob*1.4*scale,0),passDuration:index===3?6.25:animal.duration-index*.4-1.0,
        paceVariation:Math.min(1,animal.pace+.15),approachEase:.1};
    },{key:'sky-wind'});
  addChapter('두 겹 벽 너머','두 벽을 넘겨 마지막 이동 과녁을 맞혀요.',
    '미리 보기로 두 벽과 과녁 위치를 확인하세요. 첫 벽을 넘은 뒤에도 충분한 높이를 유지하도록 당기는 힘과 각도를 조절해요.',
    (index,distance,radius) => hidden(index,distance,radius,'double',{
      motion:motion(.72+index*.24,.07+index*.02,.25+index*.025)}),
    {distances:hiddenDistances,key:'double-wall-finale'});
  return templates;
}

function hiddenCover(template) {
  const {distance,radius,height,motion:movement} = template;
  const positions=template.fullCover==='double'?[.14,.26]:[.22];
  const halfWidth=Math.max(5,radius+Math.abs(movement.amplitudeX||0)+3.5);
  return positions.map((fraction,index) => {
    const z=distance*fraction,depth=.36,near=z-depth/2;
    const top=height+radius+Math.abs(movement.amplitudeY||0);
    const heightAtWall=PLAYER.y+(top-PLAYER.y)*near/distance+.035;
    return {...wall(z,heightAtWall,halfWidth*2*fraction,0,index%2||template.motion.speed?'timber':'stone'),depth};
  });
}

const gearBand = (gearTier, gearLabel, first, last, weaponIds, referenceLoadouts, balance) => Object.freeze({
  gearTier, gearLabel, first, last,
  weaponIds: Object.freeze({bow:Object.freeze(weaponIds.bow),crossbow:Object.freeze(weaponIds.crossbow)}),
  referenceLoadouts: Object.freeze(referenceLoadouts.map(loadout => Object.freeze(loadout))),
  balance: Object.freeze(balance)
});

/** Optional equipment guidance. Family ranks never lock a stage or a weapon. */
export const STAGE_GEAR_BANDS = Object.freeze([
  gearBand('starter','기본 활',1,20,{bow:[0],crossbow:[]},
    [{family:'bow',bow:0,arrow:0}],{radiusScale:1,speedScale:1}),
  gearBand('lower','하위 활·석궁',21,48,{bow:[4,5,6],crossbow:[13,12,10]},
    [{family:'bow',bow:6,arrow:5},{family:'crossbow',bow:13,arrow:5}],
    {radiusScale:1,speedScale:1,curveFirst:17,curveLast:48,windStart:.10,windEnd:.32,goalStart:18,goalEnd:26}),
  gearBand('middle','중간 활·석궁',49,105,{bow:[1,2,8],crossbow:[14,11,15,16]},
    [{family:'bow',bow:8,arrow:2},{family:'crossbow',bow:14,arrow:2}],
    {radiusScale:.94,speedScale:1.03,curveFirst:49,curveLast:105,windStart:.35,windEnd:.65,goalStart:26,goalEnd:30}),
  gearBand('upper','상위 활·석궁',106,220,{bow:[7,9,3],crossbow:[17,18,19]},
    [{family:'bow',bow:3,arrow:11},{family:'crossbow',bow:19,arrow:11}],
    {radiusScale:.82,speedScale:1.08,curveFirst:106,curveLast:120,windStart:.75,windEnd:1.30,goalStart:32,goalEnd:36})
]);

// The old score curve assumed large early grip/stability jumps. Keep difficult
// lanes achievable with the gradual ladder, using real sway, release timing,
// arrow variance and person collisions. Other mission goals keep their curve.
const EQUIPMENT_GOAL_CAPS = Object.freeze({
  // True animal anatomy uses 10/8/5/3 points, with no hits in empty silhouette gaps.
  // Reference bow and crossbow shots keep roughly one point of expected margin.
  50:19, 51:13, 52:7, 54:23, 55:16, 56:8,
  58:23, 59:18, 60:11, 62:19, 63:14, 64:7,
  66:22, 67:15, 68:12, 70:16, 71:17, 72:5,
  80:24, 84:23, 88:23, 92:23, // Long moving targets behind pillars or people.
  95:23, 96:21, // Moving gaps.
  97:20, 98:20, 99:20, 100:20, 101:20, 102:20, 103:20, 104:20, 105:20,
  106:26, 107:28, 108:28, // Recessed hidden targets use full-draw reference shots.
  109:31, 110:30, 111:28, 112:21, // Time the real openings in the faster pedestrian groups.
  113:28, 114:22, 115:16, 116:15, 117:26, 118:26, 119:28, 120:28
});

function applyEquipmentLesson(template) {
  const band = STAGE_GEAR_BANDS.find(entry => template.id >= entry.first && template.id <= entry.last);
  const balance = band.balance, curveFirst = balance.curveFirst ?? band.first, curveLast = balance.curveLast ?? band.last;
  const fraction = (template.catalogV1Id - curveFirst) / Math.max(1, curveLast - curveFirst);
  const targetSpeedScale = (template.kind || 'target') === 'target' ? CIRCULAR_TARGET_SPEED_SCALE : MAIN_TARGET_SPEED_SCALE;
  const adjusted = {...template,gearTier:band.gearTier,gearLabel:band.gearLabel,referenceLoadouts:band.referenceLoadouts,
    targetSpeedScale,
    radius:template.radius * balance.radiusScale,
    motion:{...template.motion,speed:template.motion.speed * balance.speedScale * targetSpeedScale},
    ...(Number.isFinite(template.passDuration) ? {passDuration:template.passDuration / balance.speedScale / targetSpeedScale} : {})};
  if (band.gearTier !== 'starter') {
    adjusted.wind = signedWind(template.catalogV1Id,balance.windStart + (balance.windEnd - balance.windStart) * fraction);
    const baseGoal = Math.round(balance.goalStart + (balance.goalEnd - balance.goalStart) * fraction);
    adjusted.goal = Math.min(baseGoal,EQUIPMENT_GOAL_CAPS[template.catalogV1Id] ?? baseGoal);
  }
  // Keep promised circular face fractions after any balance change to size.
  if (adjusted.coverageMode) adjusted.obstacles = partialCover(adjusted);
  if (adjusted.fullCover) adjusted.obstacles = hiddenCover(adjusted);
  return {...adjusted,difficulty:stageDifficulty(adjusted)};
}
// Actual silhouette scores and distance-matched arrows set a reachable bonus
// target for both families. Longer distances never raise an animal's quota.
const LONG_RANGE_GOALS = Object.freeze({
  'animal-rabbit':[11,10,10,10,10],
  'animal-wildcat':[14,13,11,11,11],
  'animal-deer':[13,13,13,13,13],
  'animal-pigeon':[10,10,10,10,10],
  'animal-eagle':[19,16,15,13,13],
  'animal-cheetah':[12,12,11,11,11],
  'passers-tracking':[23,23,23,23,20]
});
function longRangeStages(baseStages) {
  const upper=STAGE_GEAR_BANDS.find(band=>band.gearTier==='upper');
  return LONG_RANGE_LESSONS.flatMap((key,chapterIndex)=>{
    const source=baseStages.find(stage=>stage.lessonKey===key&&stage.distance===50);
    return LONG_RANGE_DISTANCES.map((distance,index)=>{
      const id=121+chapterIndex*5+index,rangeScale=distance/source.distance,sizeScale=Math.sqrt(rangeScale);
      const {catalogV1Id,legacyStageId,difficulty,...settings}=source;
      const radius=source.radius*sizeScale;
      const expanded={...settings,id,longRange:true,sourceLessonKey:key,lessonKey:`long-${key}`,
        chapterId:31+chapterIndex,chapterName:`${source.chapterName} · 장거리`,
        name:`${source.chapterName} · ${distance}m`,distance,radius,height:source.height*sizeScale,
        subtitle:`${distance}m 장거리 · 상위 활·석궁 권장`,
        hint:`${source.hint} 먼 거리에서는 충분히 당기고 낙하와 바람을 더 보정해요.${source.kind==='cheetah'?' 확대를 낮추면 달리는 치타와 앞쪽 겨냥점을 함께 보기 좋아요.':''}`,
        gearTier:upper.gearTier,gearLabel:upper.gearLabel,recommendedArrow:14+index,
        referenceLoadouts:upper.referenceLoadouts.map(loadout=>({...loadout,arrow:14+index})),
        goal:LONG_RANGE_GOALS[key]?.[index]??20+Math.floor(chapterIndex/5),
        motion:{...source.motion,amplitudeX:source.motion.amplitudeX*sizeScale,amplitudeY:source.motion.amplitudeY*sizeScale},
        ...(Number.isFinite(source.passDuration)?{passDuration:source.passDuration*rangeScale}:{}),
        ...(Number.isFinite(source.layoutJitter)?{layoutJitter:source.layoutJitter*rangeScale}:{}),
        passers:source.passers.map(person=>({...person,
          z:distance-(source.distance-person.z)*sizeScale,
          width:person.width*sizeScale,height:person.height*sizeScale,depth:person.depth*sizeScale,
          ...(Number.isFinite(person.span)?{span:person.span*sizeScale}:{}),
          ...(Number.isFinite(person.laneOffset)?{laneOffset:person.laneOffset*sizeScale}:{})})),
        obstacles:source.obstacles.map(obstacle=>({...obstacle,z:obstacle.z*rangeScale,x:obstacle.x*sizeScale,width:obstacle.width*sizeScale,height:obstacle.height*sizeScale}))};
      if(expanded.coverageMode)expanded.obstacles=partialCover(expanded);
      if(expanded.fullCover)expanded.obstacles=hiddenCover(expanded);
      if(expanded.lowWall)expanded.obstacles=expanded.obstacles.map(obstacle=>({...obstacle,
        height:PLAYER.y+(expanded.height-expanded.radius*.18-PLAYER.y)*(obstacle.z/expanded.distance)}));
      return {...expanded,difficulty:stageDifficulty(expanded)};
    });
  });
}
const introductoryStages=lessonStages().map(applyEquipmentLesson);
function arrangeHiddenRange(template) {
  if(!template.fullCover)return template;
  // A fully hidden face needs room for a real arc. At the old 30–50m ranges,
  // fast equipment could only clear the wall at an impractically short draw.
  // Move these targets back without changing saved IDs or using their new
  // distances to rescale the separately authored 60–150m extension.
  const distance=template.longRange?template.distance:({30:60,35:65,40:70,50:80}[template.distance]??template.distance);
  const adjusted={...template,distance,name:`${template.chapterName} · ${distance}m`};
  adjusted.obstacles=hiddenCover(adjusted);
  return {...adjusted,difficulty:stageDifficulty(adjusted)};
}
// These fast crossings need a readable middle before the arrow arrives. Keep
// their total crossing time and vertical motion; the entry/exit stays fast.
// Apply after long-range expansion so a repair never spreads to other ranges.
const animalApproachEase=Object.freeze({68:.35,72:.25,196:.30});
function arrangeAnimalTracking(template) {
  const adjusted=Object.hasOwn(animalApproachEase,template.id)?{...template,approachEase:animalApproachEase[template.id]}:template;
  if(adjusted.kind!=='eagle')return adjusted;
  // A broad soaring pass must leave time to see, lead and release a real arrow.
  // Apply once after range expansion, keeping every eagle lesson readable while
  // the other animals and the doubled circular-target speed stay independent.
  const eagle={...adjusted,passDuration:adjusted.passDuration*2,
    paceVariation:Math.min(adjusted.paceVariation??1,.55),
    motion:{...adjusted.motion,amplitudeY:adjusted.motion.amplitudeY*.6}};
  return {...eagle,difficulty:stageDifficulty(eagle)};
}
export const STAGES = Object.freeze([...introductoryStages,...longRangeStages(introductoryStages)]
  .map(arrangeHiddenRange).map(arrangeAnimalTracking));
/** The first 120-mission catalog keeps its records after the teaching reorder. */
export const CATALOG_V1_STAGE_MAP = Object.freeze(Object.fromEntries(introductoryStages.map(stage => [stage.catalogV1Id,stage.id])));
/** Migration only: old saved records move to their corresponding expanded lesson. */
export const LEGACY_STAGE_MAP = Object.freeze(Object.fromEntries(STAGES
  .filter(stage => Number.isInteger(stage.legacyStageId)).map(stage => [stage.legacyStageId,stage.id])));
/** Shared chapter boundaries for navigation, documentation and curriculum checks. */
export const MISSION_GROUPS = Object.freeze(Array.from(new Set(STAGES.map(stage => stage.chapterId)),chapterId => {
  const missions=STAGES.filter(stage => stage.chapterId===chapterId);
  return Object.freeze({chapterId,chapterName:missions[0].chapterName,first:missions[0].id,last:missions.at(-1).id,
    distances:Object.freeze(missions.map(stage => stage.distance))});
}));

/** Separate timed gun event; the main archery missions retain their own progress. */
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
function getArrow(arrow) { return typeof arrow === 'number' ? ARROWS[arrow] || ARROWS[0] : arrow || ARROWS[0]; }

// Evaluate the same launch formula only after both catalogs and their lookups
// exist. Excluding guns avoids a circular dependency on their derived speed.
export const MAX_MAIN_PROJECTILE_SPEED = Math.max(...BOWS.filter(weapon => weapon.weaponType !== 'gun')
  .flatMap(bow => ARROWS.map(arrow => getSpeed({ bow, arrow, charge: 1, velocityBias: 1 }))));
export const BULLET_SPEED = MAX_MAIN_PROJECTILE_SPEED * 2;
for (const weapon of BOWS.filter(weapon => weapon.weaponType === 'gun')) {
  weapon.muzzleSpeed = BULLET_SPEED;weapon.speed = BULLET_SPEED;
}

const animalPassDuration = Object.freeze(Object.fromEntries(Object.entries(stageShapes).map(([kind, shape]) => [kind, shape[2]])));
export const ANIMAL_HEALTH = Object.freeze({rabbit:5,wildcat:8,deer:10,pigeon:12,eagle:15,cheetah:18,bird:12});
// Integer beat counts integrate to a full crossing, with several pace changes
// inside the visible middle of a pass. Large cats have the strongest bursts.
const animalPace = Object.freeze({
  rabbit:{a:.14,b:.06,beats:2,secondBeats:3},wildcat:{a:.50,b:.14,beats:2,secondBeats:4},
  deer:{a:.23,b:.09,beats:2,secondBeats:3},pigeon:{a:.30,b:.10,beats:3,secondBeats:5},
  eagle:{a:.34,b:.12,beats:2,secondBeats:3},cheetah:{a:.58,b:.13,beats:3,secondBeats:6},
  bird:{a:.30,b:.10,beats:3,secondBeats:5}
});
// The live eagle's tail is its lowest painted point throughout the wing cycle.
// Derive its support once from the shared silhouette, not a broad hit envelope
// or a fresh geometry allocation at every prediction/physics sample.
const eagleGroundRadius = getAnimalGroundHeight({kind:'eagle',x:0,y:0,z:1,radius:1,poseTime:0});
function hashUnit(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
// Reordering lessons must not reroll their walls or irregular motion. Events
// and standalone range fixtures still use their own id when no catalog exists.
const stageSeedId = stage => stage.catalogV1Id ?? stage.id;
const targetTimeScale = stage => Number.isFinite(stage.targetSpeedScale) && stage.targetSpeedScale > 0 ? stage.targetSpeedScale : 1;
/** Fresh round layout; rerolling an already-prepared stage never compounds offsets. */
export function prepareStage(stage, seed = 0) {
  const encounterSeed = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
  const prepared = {
    ...stage, motion: { ...stage.motion },
    obstacles: (stage.obstacles || []).map(obstacle => ({ ...obstacle })),
    passers: (stage.passers || []).map(person => ({ ...person })), encounterSeed,
    ...(isAnimalKind(stage.kind) ? {animalState:{}} : {}),
    ...(stage.kind === 'clay' ? { brokenPasses: [] } : {})
  };
  if (stage.coverageMode === 'side-walls' || stage.coverageMode === 'pillars') {
    const mixed = encounterSeed ^ Math.imul(stageSeedId(stage) || 1, 0x9e3779b1);
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
  const mixed = encounterSeed ^ Math.imul(stageSeedId(stage) || 1, 0x9e3779b1);
  const slot = Math.min(2, Math.floor(hashUnit(mixed ^ 0x6a09e667) * 3));
  const jitter = (hashUnit(mixed ^ 0xbb67ae85) * 2 - 1) * available * .12;
  prepared.targetX = center + (slot - 1) * available * .65 + jitter;
  prepared.wallLayout = ['left', 'center', 'right'][slot];
  return prepared;
}

/** Apply one already-resolved physical arrow to this round's independent pass. */
export function applyAnimalHit(stage,target,score,worldTime=target?.poseTime??0) {
  const maxHealth=ANIMAL_HEALTH[target?.kind]||0,passId=target?.passId;
  const existing=stage?.animalState?.[passId],damage=existing?.damage||0;
  const status=(applied=false,justKilled=false)=>({applied,damage:existing?.damage||0,
    health:Math.max(0,maxHealth-(existing?.damage||0)),maxHealth,killed:!!existing?.killed,justKilled});
  if(!maxHealth||stage?.kind!==target?.kind||!stage.animalState||!Number.isInteger(passId)||passId<0||
      ![3,5,8,10].includes(score)||!Number.isFinite(worldTime)||target.active===false||target.dead||existing?.killed||
      !['x','y','z'].every(key=>Number.isFinite(target[key])))return status();
  const total=damage+score,killed=total>=maxHealth;
  const entry={damage:total,killed,hits:[...(existing?.hits||[]),{time:worldTime,score}]};
  if(killed){
    entry.deathTime=worldTime;
    entry.frozen={x:target.x,y:target.y,z:target.z,direction:target.direction,
      poseTime:Number.isFinite(target.poseTime)?target.poseTime:worldTime};
  }
  stage.animalState[passId]=entry;
  return{applied:true,damage:total,health:Math.max(0,maxHealth-total),maxHealth,killed,justKilled:killed};
}

function motionClock(stage, time, irregular) {
  if (!irregular) return { time, rate: 1 };
  const mixed = (stage.encounterSeed ?? stageSeedId(stage) ?? 1) ^ Math.imul(stageSeedId(stage) || 1, 0x9e3779b1);
  const random = salt => hashUnit(mixed ^ salt), tau = Math.PI * 2;
  const phase = random(0x6a09e667) * tau, secondPhase = random(0xbb67ae85) * tau;
  const a = .28 + random(0x3c6ef372) * .10, b = .08 + random(0xa54ff53a) * .08;
  const w = .65 + random(0x510e527f) * .4, secondW = 1.6 + random(0x9b05688c) * .6;
  const scale = targetTimeScale(stage);
  const elapsed = time * scale;
  // Positive clock rate gives continuous, uneven pace without introducing jumps.
  // Compress its irregular beats with the main target speed as well, so the
  // complete path follows the same target-speed multiplier without shifting it.
  return {
    time: time + a / (w * scale) * (Math.sin(w * elapsed + phase) - Math.sin(phase)) +
      b / (secondW * scale) * (Math.sin(secondW * elapsed + secondPhase) - Math.sin(secondPhase)),
    rate: 1 + a * Math.cos(w * elapsed + phase) + b * Math.cos(secondW * elapsed + secondPhase)
  };
}

function animalMotion(stage, time, forcedPassId) {
  const timeScale=targetTimeScale(stage);
  const duration = Math.max(3/timeScale, stage.passDuration || animalPassDuration[stage.kind]/timeScale);
  const t = Math.max(0, Number.isFinite(time) ? time : 0);
  // Snap nanosecond rounding at a crossing boundary equally for large/small steps.
  const currentPass = Math.floor((t + 1e-9) / duration);
  const passId = Number.isInteger(forcedPassId) && forcedPassId >= 0 ? forcedPassId : currentPass;
  const seedValue = Number.isFinite(stage.encounterSeed) ? stage.encounterSeed : stageSeedId(stage) || 1;
  const seed = (Number.isInteger(seedValue) ? seedValue : Math.floor(seedValue * 0xffffffff)) >>> 0;
  const passSeed = seed ^ Math.imul(passId + 1, 0x9e3779b1) ^ Math.imul(stageSeedId(stage) || 1, 0x85ebca6b);
  const random = salt => hashUnit(passSeed ^ salt);
  const direction = random(0x243f6a88) < .5 ? -1 : 1;
  const phase = random(0xb7e15162) * Math.PI * 2, secondPhase = random(0x8aed2a6b) * Math.PI * 2;
  const variation = clamp(stage.paceVariation ?? 1, .2, 1);
  const profile=animalPace[stage.kind],a=profile.a*(.9+random(0x9e3779b9)*.1)*variation,
    b=profile.b*(.9+random(0x3c6ef372)*.1)*variation;
  const approach = clamp(stage.approachEase || 0, 0, Math.min(.45,.94-a-b));
  const u = (t - passId * duration) / duration, tau = Math.PI * 2;
  // Integral of a positive varying velocity. Each pass crosses once, never reverses.
  const progress = u + approach / tau * Math.sin(tau * u) +
    a/(tau*profile.beats)*(Math.sin(tau*profile.beats*u+phase)-Math.sin(phase))+
    b/(tau*profile.secondBeats)*(Math.sin(tau*profile.secondBeats*u+secondPhase)-Math.sin(secondPhase));
  const rate = 1 + approach * Math.cos(tau*u) + a*Math.cos(tau*profile.beats*u+phase)+b*Math.cos(tau*profile.secondBeats*u+secondPhase);
  const span = stage.distance * 1.25 + (stage.radius || 1.25) * 3;
  const x = (stage.targetX || 0) + direction * span * (2 * progress - 1);
  let y = stage.height ?? (flyingKinds.has(stage.kind) ? 4.8 : stage.kind === 'rabbit' ? .7 : 1.65);
  if (stage.kind === 'eagle') {
    const radius = stage.radius || 1.25, center = stage.targetX || 0;
    const ground = eagleGroundRadius * radius;
    // Pick a different off-centre ground spot for each seeded pass, leaving
    // room to see the whole body descend and rise on either side of the turn.
    const visibleHalf = Math.max(radius, stage.distance * .4 - radius * stageShapes.eagle[0]);
    const side = random(0xa54ff53a) < .5 ? -1 : 1;
    const touchX = center + side * visibleHalf * (.18 + random(0x510e527f) * .37);
    const width = x < touchX ? touchX - (center - visibleHalf) : center + visibleHalf - touchX;
    const away = clamp(Math.abs(x - touchX) / width, 0, 1);
    // Smooth at both the ground and the upper glide. Using the same monotone
    // horizontal path keeps the contact inside the view despite pace changes.
    const rise = away * away * (3 - 2 * away);
    y = ground + Math.max(radius, y - ground + (stage.motion?.amplitudeY || 0)) * rise;
  } else if (flyingKinds.has(stage.kind)) {
    const amplitude = stage.motion?.amplitudeY || .7;
    const cycles = stage.kind === 'pigeon' ? 4.8 + random(0xa54ff53a) : 2.4 + random(0xa54ff53a);
    y += amplitude * (.72 * Math.sin(tau * cycles * u + phase) + .28 * Math.sin(tau * (cycles + .8) * u + secondPhase));
  } else {
    const amplitude = stage.motion?.amplitudeY || 0;
    const leaps=stage.kind==='rabbit'||stage.kind==='deer';
    const frequency = stage.kind==='rabbit'?1.8:stage.kind==='wildcat'?2.8:stage.kind==='deer'?.85:3.5;
    // Root movement follows the animal while the drawing only animates limbs.
    // Positive smooth hops keep the body above its ground-level baseline.
    const wave=Math.sin(t*timeScale*Math.PI*frequency*(leaps?2:1)+phase);
    const stride=leaps?Math.max(0,wave):wave;
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
  const result = {
    ...position, z: stage.distance, radius: r,
    rx: r * (stageShapes[kind]?.[0] || 1),
    ry: r * (stageShapes[kind]?.[1] || 1),
    kind,...(animal?{poseTime:Number.isFinite(time)?time:0}:{})
  };
  if(!animal)return result;
  const maxHealth=ANIMAL_HEALTH[kind],entry=stage.animalState?.[position.passId];
  const damage=(entry?.hits||[]).reduce((total,hit)=>total+(hit.time<=time+1e-9?hit.score:0),0);
  if(entry?.killed&&entry.deathTime<=time+1e-9){
    const corpse={...result,...entry.frozen,velocityX:0,active:true,dead:true,
      damage:entry.damage,health:0,maxHealth,deathTime:entry.deathTime,deathAge:Math.max(0,time-entry.deathTime)};
    // Keep the horizontal impact spot; birds and jumping animals actually fall.
    // The shared drawn pose supplies ground support, so bodies and stuck arrows
    // settle together without either clipping into the floor or hovering above it.
    const support=getAnimalGroundHeight(corpse);
    // A swooping eagle can be killed at ground contact. Its rotating wing may
    // need slightly more support than the live tail did at the impact height.
    const ground=kind==='eagle'?support:Math.min(entry.frozen.y,support);
    corpse.y=Math.max(ground,entry.frozen.y-GRAVITY*corpse.deathAge*corpse.deathAge/2);
    return corpse;
  }
  return{...result,dead:false,damage,health:Math.max(0,maxHealth-damage),maxHealth};
}

function passerAt(stage, config, time) {
  const id = config.id ?? 0, z = config.z ?? stage.distance * .88;
  const width = config.width ?? .95, height = config.height ?? 2, depth = config.depth ?? .42;
  if(config.behavior==='shuttle'||config.behavior==='crowd'){
    const duration=Math.max(.2,config.passDuration||1.5),phase=((config.phase||0)%1+1)%1;
    const elapsed=Math.max(0,Number.isFinite(time)?time:0),passId=Math.floor((elapsed+phase*duration+1e-9)/duration);
    const passStart=passId*duration-phase*duration,span=Math.max(width*.55,config.span||width*1.2);
    const mixed=(stage.encounterSeed??stageSeedId(stage)??1)^Math.imul(stageSeedId(stage)||1,0x85ebca6b);
    const initialDirection=hashUnit(mixed^0x243f6a88)<.5?-1:1;
    const direction=initialDirection*(passId%2?-1:1),speed=span*2/duration;
    const center=(stage.targetX||0)+(config.centerX||0)+initialDirection*(config.laneOffset||0);
    return{id,passId,type:'person',x:center+direction*(-span+speed*(elapsed-passStart)),
      y:config.y??0,z,width,height,depth,direction,speed,velocityX:direction*speed,
      // Continuous collision splits at this exact turn, then uses the new
      // linear velocity. No rendered-frame approximation enters the hit test.
      passStart,passEnd:passStart+duration,passDuration:duration};
  }
  const duration = Math.max(2, config.passDuration || 32);
  const phase = ((config.phase || 0) % 1 + 1) % 1;
  const passId = Math.floor((Math.max(0, time) + phase * duration + 1e-9) / duration);
  const passStart = passId * duration - phase * duration;
  const mixed = (stage.encounterSeed ?? stageSeedId(stage) ?? 1) ^ Math.imul(id + 1, 0x85ebca6b) ^ Math.imul(passId + 1, 0x9e3779b1);
  const direction = hashUnit(mixed ^ 0x243f6a88) < .5 ? -1 : 1;
  const span = (z * 1.25 + width * 2) * (1 + hashUnit(mixed ^ 0xb7e15162) * .25);
  const speed = span * 2 / duration, velocityX = direction * speed;
  return {
    id, passId, type: 'person', x: direction * span * (2 * (time - passStart) / duration - 1),
    y: config.y ?? 0, z, width, height, depth, direction, speed, velocityX,
    passStart, passEnd: passStart + duration, passDuration: duration
  };
}

/** Harmless moving blockers. Each linear leg is continuous through its next turn. */
export function passersAt(stage, time = 0) {
  return (stage.passers || []).map(config => passerAt(stage, config, time));
}

export function getArrowMass(arrow) {
  const a = getArrow(arrow);
  return Math.max(1, (a.shaftMass ?? 20) + (a.tipMass ?? 4) + (a.fletching?.mass ?? 0));
}

/** Relative side acceleration from the shaft and fletching, divided by mass. */
export function getWindResponse(arrow) {
  const a = getArrow(arrow);
  return a.fletching ? (Math.max(0, a.shaft?.windArea ?? 0) + Math.max(0, a.fletching.windArea)) *
    REFERENCE_ARROW_MASS / getArrowMass(a) : a.windFactor ?? 1;
}

/** The point profile, shaft and fletching each contribute to linear game drag. */
export function getArrowDragRate(arrow) {
  const a = getArrow(arrow);
  return (Math.max(0, a.tip?.drag ?? 0) + Math.max(0, a.shaft?.drag ?? 0) + Math.max(0, a.fletching?.drag ?? 0)) *
    REFERENCE_ARROW_MASS / getArrowMass(a);
}

/** Manufacturing precision and flight control, combined as a game consistency rating.
 * This is not FOC/spine simulation: the existing speed-spread model approximates
 * shot-to-shot dispersion. Fletching never adds nominal launch energy.
 */
export function getArrowConsistency(arrow) {
  const a = getArrow(arrow);
  if (a.tip && a.shaft) return clamp(.5 * a.shaft.precision + .2 * a.tip.precision + .3 * a.fletching.stability, 0, 100);
  return clamp(a.fletching?.stability ?? (1 - (a.variance ?? .2) / .2) * 100, 0, 100);
}

export function getArrowVariance(arrow) {
  return .20 * (1 - getArrowConsistency(arrow) / 100);
}

export function getSpeed({ charge = 1, bow, arrow, velocityBias = 0 } = {}) {
  const b = getBow(bow), a = getArrow(arrow);
  if (b.weaponType === 'gun') return b.muzzleSpeed * (1 + clamp(velocityBias, -1, 1) * b.ammo.variance);
  const referenceSpeed = Number.isFinite(b.elasticity) ? bowSpeed(b.elasticity) * (b.launchBoost ?? 1) : b.speed;
  const variance = getArrowVariance(a);
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
    dragRate: bullet ? weapon.ammo.dragRate : getArrowDragRate(arrow) + Math.max(0, weapon.extraDragRate ?? 0) * REFERENCE_ARROW_MASS / getArrowMass(arrow),
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
    // The added burst preserves the aimed first shot; later shots add coverage.
    const radius = index > 0 ? weapon.burstSpread * (.75 + random(Math.imul(index + 1, 0x9e3779b1)) * .25) : 0;
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
  if (target.active === false || target.dead) return null;
  if (isAnimalKind(target.kind)) return scoreAnimalPoint(point,target);
  const ratio = Math.hypot((point.x - target.x) / target.rx, (point.y - target.y) / target.ry);
  if (ratio > 1 + 1e-9) return null;
  if (target.kind === 'clay' || target.kind === 'ufo') return { score: 10, zone: target.kind === 'ufo' ? 'UFO 명중' : '접시 명중' };
  if (target.kind !== 'target') return null;
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
  const flightLimit = getFlightTimeLimit(shot);
  if (shot.elapsed + dt >= flightLimit) events.push({ t: Math.max(0, flightLimit - shot.elapsed), type: 'miss', score: 0, zone: '멀리 날아갔어요' });
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
  const active = targets.filter(target => target.active !== false && !target.dead);
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

export function predictTrajectory(params, stage, worldTime = 0, maxSeconds) {
  const shot = launchArrow(params);
  const forecastSeconds = maxSeconds === undefined ? getFlightTimeLimit(shot) : maxSeconds;
  const points = [{ ...shot.position }];
  const dt = 1 / 45;
  let time = 0;
  while (shot.active && time < forecastSeconds) {
    const step = Math.min(dt, forecastSeconds - time);
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
