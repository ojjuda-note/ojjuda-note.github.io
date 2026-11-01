/** Forward-facing camera and painter-order geometry. World units are metres. */
export const FLIGHT_TIME_SCALE = .32;
export const IMPACT_HOLD = .65;
export const RETURN_DURATION = .7;
export const NEAR_PLANE = .15;
export const PREVIEW_RISE = .45;
export const PREVIEW_HOLD = 1.45;
export const PREVIEW_RETURN = .65;

const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const pointIsFinite = point => point && ['x', 'y', 'z'].every(key => Number.isFinite(point[key]));
const copyPoint = point => ({x: point.x, y: point.y, z: point.z});
const mixPoint = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t
});
const samePoint = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;

/** A finite projection is returned even for points behind the camera. */
export function projectPoint(point, camera = {}) {
  const cx = finite(camera.cx), horizon = finite(camera.horizon);
  const hidden = {x: cx, y: horizon, scale: 0, depth: 0, visible: false};
  if (!pointIsFinite(point)) return hidden;
  const depth = point.z - finite(camera.z);
  const focal = Math.max(.01, finite(camera.focal, 1));
  const scale = focal / Math.max(NEAR_PLANE, depth);
  const x = cx + (point.x - finite(camera.x)) * scale;
  const y = horizon - (point.y - finite(camera.y)) * scale;
  if (![x, y, depth, scale].every(Number.isFinite)) return hidden;
  return {x, y, scale, depth, visible: depth >= NEAR_PLANE - 1e-9};
}

/** Clip before projecting: an overtaken trail must never wrap across the screen. */
export function clipSegmentNear(a, b, cameraZ = 0, near = NEAR_PLANE) {
  if (!pointIsFinite(a) || !pointIsFinite(b) || !Number.isFinite(cameraZ)) return null;
  const plane = cameraZ + (Number.isFinite(near) && near >= 0 ? near : NEAR_PLANE);
  const aVisible = a.z >= plane, bVisible = b.z >= plane;
  if (!aVisible && !bVisible) return null;
  if (aVisible && bVisible) return samePoint(a, b) ? null : {a: copyPoint(a), b: copyPoint(b)};
  const t = (plane - a.z) / (b.z - a.z);
  const crossing = {...mixPoint(a, b, t), z: plane};
  const result = aVisible ? {a: copyPoint(a), b: crossing} : {a: crossing, b: copyPoint(b)};
  return samePoint(result.a, result.b) ? null : result;
}

/**
 * Preserve segment direction and split at opaque scene depths. Each fragment can
 * be painted at its midpoint depth, so foreground trail is not erased together
 * with an arrow tip that has already passed behind a target.
 */
export function splitSegmentAtDepths(a, b, depths = []) {
  if (!pointIsFinite(a) || !pointIsFinite(b) || samePoint(a, b)) return [];
  const dz = b.z - a.z;
  const cuts = [0, 1];
  if (Math.abs(dz) > 1e-12) {
    for (const depth of depths) {
      if (!Number.isFinite(depth)) continue;
      const t = (depth - a.z) / dz;
      if (t > 1e-10 && t < 1 - 1e-10) cuts.push(t);
    }
  }
  cuts.sort((left, right) => left - right);
  const unique = cuts.filter((value, index) => index === 0 || value - cuts[index - 1] > 1e-10);
  const fragments = [];
  for (let i = 1; i < unique.length; i++) {
    const start = unique[i - 1] === 0 ? copyPoint(a) : mixPoint(a, b, unique[i - 1]);
    const end = unique[i] === 1 ? copyPoint(b) : mixPoint(a, b, unique[i]);
    fragments.push({a: start, b: end, z: (start.z + end.z) / 2});
  }
  return fragments;
}

export function depthFragments(a, b, depths = [], cameraZ = 0, near = NEAR_PLANE) {
  const clipped = clipSegmentNear(a, b, cameraZ, near);
  return clipped ? splitSegmentAtDepths(clipped.a, clipped.b, depths) : [];
}

const cameraFields = ['x', 'y', 'z', 'cx', 'horizon', 'focal'];

/** Interpolate every projection field, including the player's saved aim pan/zoom. */
export function lerpCamera(from = {}, to = {}, t = 0) {
  const amount = clamp01(t), result = {...from, ...to};
  for (const key of cameraFields) {
    const start = finite(from[key], finite(to[key]));
    const end = finite(to[key], start);
    result[key] = amount === 0 ? start : amount === 1 ? end : start + (end - start) * amount;
  }
  return result;
}

/** A trailing view, eased out of the original shooting position over five metres. */
export function desiredFollowCamera(position, baseCamera, viewport = {}) {
  const w = Math.max(1, finite(viewport.w, 1)), h = Math.max(1, finite(viewport.h, 1));
  const p = pointIsFinite(position) ? position : {x: 0, y: 1.65, z: 0};
  const approach = clamp01(p.z / 5);
  return lerpCamera(baseCamera, {
    x: p.x - .9,
    y: Math.max(1, p.y + .65),
    z: Math.max(0, p.z - 7),
    cx: .46 * w,
    horizon: .43 * h,
    focal: Math.min(w * 1.08, h * 1.5)
  }, approach);
}

/**
 * Raise the real camera above the range so the entire target clears every wall.
 * The sightline to the target's bottom must clear both ends of each wall top by
 * half a metre. This reveals its location without painting through masonry.
 */
export function desiredPreviewCamera(stage = {}, target = {}, baseCamera = {}, viewport = {}) {
  const w = Math.max(1, finite(viewport.w, 1)), h = Math.max(1, finite(viewport.h, 1));
  const targetZ = Math.max(NEAR_PLANE * 2, finite(target.z, finite(stage.distance, 14)));
  const targetX = finite(target.x), targetY = finite(target.y, finite(stage.height, 2.3));
  const radiusY = Math.max(0, finite(target.ry, finite(target.radius, finite(stage.radius, 1.25))));
  const bottomY = targetY - radiusY;
  const focal = .9 * Math.min(w * 1.08, h * 1.5);
  let cameraY = 5;
  for (const wall of stage.obstacles || []) {
    if (!Number.isFinite(wall.z) || !Number.isFinite(wall.height)) continue;
    const halfDepth = Math.max(0, finite(wall.depth, .65)) / 2;
    for (const wallZ of [wall.z - halfDepth, wall.z + halfDepth]) {
      if (!(wallZ > 0 && wallZ < targetZ)) continue;
      const fraction = wallZ / targetZ;
      const required = (wall.height + .5 - bottomY * fraction) / (1 - fraction);
      if (Number.isFinite(required)) cameraY = Math.max(cameraY, required);
    }
  }
  return {
    ...baseCamera,
    x: 0, y: cameraY, z: 0,
    cx: w / 2 - targetX * focal / targetZ,
    horizon: h * .40 - (cameraY - targetY) * focal / targetZ,
    focal
  };
}
