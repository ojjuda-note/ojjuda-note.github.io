/** Deterministic metre/second archery simulation. Coordinates: x right, y up, z forward. */
export const PLAYER = Object.freeze({ x: 0, y: 1.65, z: 0 });
export const GRAVITY = 9.81;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const BOWS = Object.freeze([
  { id: 0, name: '숲길 목궁', tag: '입문', description: '크고 불규칙한 흔들림. 첫 한 발을 배워요.', price: 0, sway: 0.075, speed: 44, color: '#a9784e' },
  { id: 1, name: '단풍나무 활', tag: '균형', description: '흔들림이 줄고, 시위를 조금 더 단단히 당겨요.', price: 100, sway: 0.050, speed: 48, color: '#76875a' },
  { id: 2, name: '바람결 활', tag: '정밀', description: '작아진 흔들림으로 먼 과녁을 차분히 겨눠요.', price: 280, sway: 0.032, speed: 52, color: '#598b8a' },
  { id: 3, name: '달빛 명궁', tag: '명궁', description: '가장 안정적인 조준과 힘찬 시위.', price: 650, sway: 0.017, speed: 57, color: '#c49b50' }
]);

export const ARROWS = Object.freeze([
  { id: 0, name: '나무 화살', tag: '입문', description: '한 발마다 속도에 차이가 있어요.', price: 0, variance: 0.13, windFactor: 1.0, color: '#b28b64' },
  { id: 1, name: '깃털 화살', tag: '균형', description: '속도 차이를 줄여 낙하를 읽기 쉬워요.', price: 75, variance: 0.08, windFactor: 0.88, color: '#8b9c78' },
  { id: 2, name: '탄소 화살', tag: '정밀', description: '일정한 속도와 적은 바람 영향.', price: 220, variance: 0.035, windFactor: 0.68, color: '#71999b' },
  { id: 3, name: '은빛 화살', tag: '명궁', description: '같은 힘에는 거의 같은 비행. 낙하는 그대로예요.', price: 500, variance: 0.01, windFactor: 0.50, color: '#bfc8d0' }
]);

const motion = (amplitudeX = 0, amplitudeY = 0, speed = 0) => ({ amplitudeX, amplitudeY, speed });
const wall = (z, height, width = 7, x = 0) => ({ x, z, width, height, depth: 0.65 });
const stage = (id, name, subtitle, hint, distance, extra = {}) => ({
  id, name, subtitle, hint, distance, radius: 1.25, height: 2.3,
  kind: 'target', motion: motion(), wind: 0, obstacles: [], shots: 5, goal: 20,
  ...extra
});

export const STAGES = Object.freeze([
  stage(1, '첫 번째 시위', '햇살 드는 숲길', '누른 채 방향을 조절하고, 조준점이 과녁을 지날 때 손을 떼세요.', 14, { goal: 16, radius: 1.35, wind: 0.12 }),
  stage(2, '조금 더 멀리', '낙하를 읽는 연습', '화살이 아래로 떨어져요. 과녁 중심보다 조금 위를 겨눠보세요.', 18, { radius: 1.30, wind: -0.20 }),
  stage(3, '숲의 끝자락', '거리 감각 익히기', '충분히 당긴 화살은 빠르게 날아요. 점선으로 낙하를 살펴보세요.', 24, { goal: 22, radius: 1.30, height: 2.5, wind: 0.30 }),
  stage(4, '긴 사거리', '높이와 힘의 균형', '나뭇잎이 날리는 쪽으로 화살도 밀려요. 반대쪽으로 조금 보정해보세요.', 32, { goal: 24, height: 2.6, wind: -0.40 }),
  stage(5, '오가는 과녁', '한 걸음 앞을 향해', '움직이는 과녁이 화살 도착 때 있을 자리를 겨눠요.', 32, { goal: 22, motion: motion(3.5, 0, 0.72), radius: 1.35, wind: 0.50 }),
  stage(6, '하늘의 날갯짓', '숲 위를 나는 새', '새의 진행 방향 앞쪽을 겨눠요. 비행시간도 생각해보세요.', 36, { kind: 'bird', height: 4.8, radius: 1.3, motion: motion(5.0, 0.65, 0.88), goal: 20, wind: -0.60 }),
  stage(7, '초원의 발자국', '달리는 사슴', '사슴이 지나갈 위치를 먼저 겨눠보세요.', 40, { kind: 'deer', height: 1.65, radius: 1.5, motion: motion(5.5, 0, 0.66), goal: 22, wind: 0.72 }),
  stage(8, '담장 너머', '곡선으로 넘어서기', '힘을 조금 줄이고 더 위로 조준해, 큰 포물선으로 담장을 넘겨보세요.', 42, { radius: 1.35, obstacles: [wall(22, 2.8)], goal: 20, wind: -0.84 }),
  stage(9, '나뭇가지 사이', '바람 속 날갯짓', '빠르게 날리는 나뭇잎으로 바람을 읽고, 새의 앞쪽을 겨눠보세요.', 44, { kind: 'bird', height: 5.2, radius: 1.4, motion: motion(5.2, 0.8, 0.72), wind: 0.96, obstacles: [wall(24, 2.8, 5.5)], goal: 22 }),
  stage(10, '바람의 들판', '먼 곳의 작은 중심', '바람 반대쪽으로 조준을 보정하세요. 좋은 화살은 바람을 덜 타요.', 55, { radius: 1.45, wind: 1.08, goal: 26 }),
  stage(11, '숨은 숲길', '담장 너머의 움직임', '사슴의 다음 위치를 읽고, 담장을 넘는 높이로 쏘세요.', 58, { kind: 'deer', height: 1.65, radius: 1.65, motion: motion(6.0, 0, 0.58), wind: -1.20, obstacles: [wall(31, 3.5)], goal: 26 }),
  stage(12, '바람의 궁수', '마지막 한 발', '거리·움직임·바람·담장. 지금까지 익힌 감각을 모두 써보세요.', 70, { radius: 1.55, motion: motion(2.5, 0.2, 0.45), wind: 1.35, obstacles: [wall(26, 3.4, 5.4), wall(46, 3.2, 5, -1.6)], goal: 30 })
]);

const getBow = bow => typeof bow === 'number' ? BOWS[bow] || BOWS[0] : bow || BOWS[0];
const getArrow = arrow => typeof arrow === 'number' ? ARROWS[arrow] || ARROWS[0] : arrow || ARROWS[0];

export function targetAt(stage, time = 0) {
  const m = stage.motion || motion();
  const phase = time * (m.speed || 0);
  const kind = stage.kind || 'target';
  const r = stage.radius || 1.25;
  return {
    x: (stage.targetX || 0) + (m.amplitudeX || 0) * Math.sin(phase),
    y: (stage.height ?? (kind === 'bird' ? 4.8 : kind === 'deer' ? 1.65 : 2.3)) + (m.amplitudeY || 0) * Math.sin(phase * 1.37),
    z: stage.distance,
    radius: r,
    rx: kind === 'bird' ? r * 1.38 : kind === 'deer' ? r * 1.23 : r,
    ry: kind === 'bird' ? r * 0.88 : kind === 'deer' ? r * 0.73 : r,
    kind
  };
}

export function getSpeed({ charge = 1, bow, arrow, velocityBias = 0 } = {}) {
  const b = getBow(bow);
  const a = getArrow(arrow);
  return b.speed * (0.42 + 0.58 * clamp(charge, 0, 1)) * (1 + clamp(velocityBias, -1, 1) * a.variance);
}

export function launchArrow(params = {}) {
  const { yaw = 0, pitch = 0, charge = 1, bow, arrow, velocityBias = 0 } = params;
  const speed = getSpeed({ charge, bow, arrow, velocityBias });
  const cp = Math.cos(pitch);
  return {
    position: { ...PLAYER },
    velocity: { x: Math.sin(yaw) * cp * speed, y: Math.sin(pitch) * speed, z: Math.cos(yaw) * cp * speed },
    elapsed: 0, active: true, result: null, trail: [{ ...PLAYER }],
    speed, windFactor: getArrow(arrow).windFactor, lastTrailTime: 0, targetPassed: false
  };
}

const at = (position, velocity, acceleration, t) => ({
  x: position.x + velocity.x * t + acceleration.x * t * t / 2,
  y: position.y + velocity.y * t + acceleration.y * t * t / 2,
  z: position.z + velocity.z * t + acceleration.z * t * t / 2
});

function roots(p, v, a, level) {
  const c = p - level;
  if (Math.abs(a) < 1e-12) return Math.abs(v) < 1e-12 ? [] : [-c / v];
  const discriminant = v * v - 2 * a * c;
  if (discriminant < 0) return [];
  const d = Math.sqrt(discriminant);
  return [(-v - d) / a, (-v + d) / a];
}

/** Time intervals where the exact quadratic coordinate lies inside a slab. */
function insideIntervals(p, v, a, min, max, dt) {
  const points = [0, dt, ...roots(p, v, a, min), ...roots(p, v, a, max)]
    .filter(t => t >= 0 && t <= dt).sort((left, right) => left - right);
  const unique = points.filter((value, index) => !index || value - points[index - 1] > 1e-10);
  const intervals = [];
  const valueAt = t => p + v * t + a * t * t / 2;
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

function obstacleTime(position, velocity, acceleration, obstacle, dt) {
  let windows = [[0, dt]];
  const slabs = {
    x: [obstacle.x - obstacle.width / 2, obstacle.x + obstacle.width / 2],
    y: [0, obstacle.height],
    z: [obstacle.z - (obstacle.depth || 0.65) / 2, obstacle.z + (obstacle.depth || 0.65) / 2]
  };
  for (const axis of ['x', 'y', 'z']) {
    const intervals = insideIntervals(position[axis], velocity[axis], acceleration[axis], ...slabs[axis], dt);
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

function scoreAt(point, target) {
  const ratio = Math.hypot((point.x - target.x) / target.rx, (point.y - target.y) / target.ry);
  if (ratio > 1 + 1e-9) return null;
  if (target.kind !== 'target') return { score: ratio <= 0.38 ? 10 : 8, zone: ratio <= 0.38 ? '정확한 명중' : '명중' };
  const ring = Math.min(4, Math.floor(clamp(ratio, 0, 0.999999) * 5));
  return { score: [10, 8, 6, 4, 2][ring], zone: ['정중앙', '빨간 원', '파란 원', '검은 원', '흰 원'][ring] };
}

/** Advance a shot; worldTime is the absolute scene time at the START of this interval. */
export function stepArrow(shot, dt, stage, worldTime = 0) {
  if (!shot.active) return shot.result;
  if (!(dt > 0) || !Number.isFinite(dt)) return null;
  const position = shot.position, velocity = shot.velocity;
  const acceleration = { x: (stage.wind || 0) * (shot.windFactor ?? 1), y: -GRAVITY, z: 0 };
  const events = [];
  const ground = roots(position.y, velocity.y, acceleration.y, 0).filter(t => t >= 0 && t <= dt && velocity.y + acceleration.y * t <= 0);
  if (ground.length) events.push({ t: Math.min(...ground), type: 'ground', score: 0, zone: '땅에 떨어졌어요' });
  for (const obstacle of stage.obstacles || []) {
    const t = obstacleTime(position, velocity, acceleration, obstacle, dt);
    if (t !== null) events.push({ t, type: 'obstacle', score: 0, zone: '장애물에 닿았어요' });
  }
  const targetTime = velocity.z > 0 ? (stage.distance - position.z) / velocity.z : -1;
  if (!shot.targetPassed && targetTime >= -1e-9 && targetTime <= dt + 1e-9) {
    const t = clamp(targetTime, 0, dt);
    const target = targetAt(stage, worldTime + t);
    const point = at(position, velocity, acceleration, t);
    const hit = scoreAt(point, target);
    if (hit) events.push({ t, type: 'hit', ...hit, targetCenter: target });
    shot.targetPassed = true;
  }
  if (shot.elapsed + dt >= 8) events.push({ t: Math.max(0, 8 - shot.elapsed), type: 'miss', score: 0, zone: '멀리 날아갔어요' });
  events.sort((a, b) => a.t - b.t || (a.type === 'obstacle' ? -1 : 1));
  const event = events[0], usedTime = event ? event.t : dt;
  shot.position = at(position, velocity, acceleration, usedTime);
  shot.velocity = {
    x: velocity.x + acceleration.x * usedTime,
    y: velocity.y + acceleration.y * usedTime,
    z: velocity.z
  };
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
  const amplitude = getBow(bow).sway * fatigue;
  state.x = state.ux * amplitude;
  state.y = state.uy * amplitude;
  state.vx = state.uvx * amplitude;
  state.vy = state.uvy * amplitude;
  return state;
}
