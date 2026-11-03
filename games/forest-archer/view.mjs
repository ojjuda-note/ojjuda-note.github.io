/** Forward-facing camera and painter-order geometry. World units are metres. */
// Keep targets and projectiles on the same real-time clock during live flight.
export const FLIGHT_TIME_SCALE = 1;
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

// The horizontal/depth part of a sightline through an actual wall slab. Its
// endpoints are also where the required height over that slab is greatest.
function wallSightInterval(camera, point, wall, margin = 0) {
  let enter = 0, leave = 1;
  for (const [axis, low, high] of [
    ['x', wall.x - wall.width / 2 - margin, wall.x + wall.width / 2 + margin],
    ['z', wall.z - wall.depth / 2, wall.z + wall.depth / 2]
  ]) {
    const delta = point[axis] - camera[axis];
    if (Math.abs(delta) < 1e-10) {
      if (camera[axis] < low || camera[axis] > high) return null;
    } else {
      const a = (low - camera[axis]) / delta, b = (high - camera[axis]) / delta;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
    if (enter > leave) return null;
  }
  return leave > 1e-9 && enter < 1 ? [enter, leave] : null;
}

const insideWall = (point, wall) => point.x >= wall.x - wall.width / 2 && point.x <= wall.x + wall.width / 2 &&
  point.z >= wall.z - wall.depth / 2 && point.z <= wall.z + wall.depth / 2 && point.y >= 0 && point.y <= wall.height;

/**
 * Clear a real post-release sightline without changing any scene geometry.
 * Usually a small rise is enough; a view through the arrow's flight line is
 * also considered when close side cover would demand an excessive height.
 * Apply after follow/entry interpolation, never to the player's aiming view.
 */
export function clearShotCamera(camera = {}, stage = {}, shot = {}, viewport = {}) {
  const point = shot.position, velocity = shot.velocity;
  if (!pointIsFinite(point) || !pointIsFinite(velocity) ||
      !cameraFields.every(key => Number.isFinite(camera[key])) || point.z < 5) return camera;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z) || 1;
  const shaftLength = Math.max(0, finite(shot.shaftLength, .85));
  const tail = {
    x: point.x - velocity.x / speed * shaftLength,
    y: point.y - velocity.y / speed * shaftLength,
    z: point.z - velocity.z / speed * shaftLength
  };
  const points = [point, tail];
  const walls = (stage.obstacles || []).filter(wall =>
    ['x', 'z', 'width', 'height', 'depth'].every(key => Number.isFinite(wall[key])) &&
    wall.width > 0 && wall.height > 0 && wall.depth > 0 && wall.z + wall.depth / 2 > camera.z);
  if (!walls.length || points.some(p => p.z - camera.z < NEAR_PLANE)) return camera;
  // The impact shaft flexes by less than .1m. Leave room for that motion, but
  // taper the margin at a wall crossing so an almost touching point cannot
  // demand an unbounded camera height. Embedded shaft remains truly hidden.
  const clearance = (p, wall) => Math.min(.12, Math.max(0, p.z - wall.z - wall.depth / 2) * .25);
  const blocked = (view, p, wall, margin = 0) => {
    if (insideWall(p, wall)) return false;
    const interval = wallSightInterval(view, p, wall, margin);
    if (!interval) return false;
    const heights = interval.map(t => view.y + (p.y - view.y) * t);
    return Math.min(...heights) <= wall.height + margin && Math.max(...heights) >= 0;
  };
  if (!points.some(p => walls.some(wall => blocked(camera, p, wall, clearance(p, wall))))) return camera;

  const origin = {...camera, z: Math.min(camera.z, tail.z - NEAR_PLANE - .25)};
  const candidates = [origin.x, point.x, tail.x];
  if (Math.abs(velocity.z) > 1e-8) candidates.push(point.x - velocity.x / velocity.z * (point.z - origin.z));
  for (const p of points) for (const wall of walls) {
    const margin = clearance(p, wall);
    for (const z of [wall.z - wall.depth / 2, wall.z + wall.depth / 2]) {
      const t = (z - origin.z) / (p.z - origin.z);
      if (!(t > 0 && t < 1 - 1e-8)) continue;
      for (const side of [-1, 1]) candidates.push((wall.x + side * (wall.width / 2 + margin + .02) - t * p.x) / (1 - t));
    }
  }
  let best = null, cost = Infinity;
  for (const x of candidates) {
    if (!Number.isFinite(x) || Math.abs(x - origin.x) > 4.5) continue;
    const candidate = {...origin, x};
    for (const p of points) for (const wall of walls) {
      if (insideWall(p, wall)) continue;
      const margin = clearance(p, wall), interval = wallSightInterval(candidate, p, wall, margin);
      if (!interval) continue;
      for (const t of interval) {
        const required = t < 1 - 1e-10 ? (wall.height + margin - p.y * t) / (1 - t) + .01 :
          p.y > wall.height + margin ? -Infinity : Infinity;
        candidate.y = Math.max(candidate.y, required);
      }
    }
    // A pathological focus immediately behind/inside masonry must not throw
    // the view into the sky. Keep the physical occlusion if no nearby view can
    // reveal it; ordinary, unobstructed shots retain their original camera.
    if (!Number.isFinite(candidate.y) || candidate.y - origin.y > 6 ||
        points.some(p => walls.some(wall => blocked(candidate, p, wall)))) continue;
    const distance = (candidate.y - origin.y) ** 2 + (candidate.x - origin.x) ** 2 * 2.25;
    if (distance < cost) {best = candidate; cost = distance;}
  }
  if (!best) return camera;

  // Raising a forward-facing camera alone would push the contact below the
  // canvas. Fit the real shaft and a small area around its tip after moving it.
  const w = Math.max(1, finite(viewport.w, 1)), h = Math.max(1, finite(viewport.h, 1));
  const radius = Math.min(.5, Math.max(.25, finite(stage.radius, 1.25) * .2));
  const framed = [...points,
    {...point, x: point.x - radius}, {...point, x: point.x + radius},
    {...point, y: point.y - radius}, {...point, y: point.y + radius}];
  const unit = {...best, cx: 0, horizon: 0, focal: 1};
  const projected = framed.map(p => projectPoint(p, unit));
  const minX = Math.min(...projected.map(p => p.x)), maxX = Math.max(...projected.map(p => p.x));
  const minY = Math.min(...projected.map(p => p.y)), maxY = Math.max(...projected.map(p => p.y));
  const marginX = w * .10, marginY = h * .12;
  if (maxX - minX > 1e-10) best.focal = Math.min(best.focal, (w - marginX * 2) / (maxX - minX));
  if (maxY - minY > 1e-10) best.focal = Math.min(best.focal, (h - marginY * 2) / (maxY - minY));
  best.focal = Math.max(.01, best.focal);
  best.cx = Math.min(w - marginX - maxX * best.focal, Math.max(marginX - minX * best.focal, best.cx));
  best.horizon = Math.min(h - marginY - maxY * best.focal, Math.max(marginY - minY * best.focal, best.horizon));
  return best;
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
  const rim = target.kind === 'target' ? 1.055 : 1;
  const radiusX = Math.max(0, finite(target.rx, finite(target.radius, finite(stage.radius, 1.25)))) * rim;
  const radiusY = Math.max(0, finite(target.ry, finite(target.radius, finite(stage.radius, 1.25)))) * rim;
  const bottomY = targetY - radiusY;
  let focal = .9 * Math.min(w * 1.08, h * 1.5);
  const visibleWalls = [];
  let cameraY = 5;
  for (const wall of stage.obstacles || []) {
    if (!Number.isFinite(wall.z) || !Number.isFinite(wall.height)) continue;
    const halfDepth = Math.max(0, finite(wall.depth, .65)) / 2;
    for (const wallZ of [wall.z - halfDepth, wall.z + halfDepth]) {
      if (!(wallZ > 0 && wallZ < targetZ)) continue;
      visibleWalls.push({z: wallZ, height: wall.height, x: finite(wall.x), halfWidth: Math.max(0, finite(wall.width)) / 2});
      const fraction = wallZ / targetZ;
      const required = (wall.height + .5 - bottomY * fraction) / (1 - fraction);
      if (Number.isFinite(required)) cameraY = Math.max(cameraY, required);
    }
  }
  // Close cover requires a much higher camera to see its far edge. Fit the
  // actual projected target and wall corners after raising it; otherwise the
  // wall bases can fall below a short landscape viewport during the overview.
  const fitPoint = (x, y, z) => {
    const dx = x / z - targetX / targetZ;
    const dy = (cameraY - y) / z - (cameraY - targetY) / targetZ;
    if (Math.abs(dx) > 1e-10) focal = Math.min(focal, w * .46 / Math.abs(dx));
    if (dy > 1e-10) focal = Math.min(focal, h * .56 / dy);
    else if (dy < -1e-10) focal = Math.min(focal, h * .36 / -dy);
  };
  fitPoint(targetX - radiusX, targetY, targetZ);
  fitPoint(targetX + radiusX, targetY, targetZ);
  fitPoint(targetX, targetY - radiusY, targetZ);
  fitPoint(targetX, targetY + radiusY, targetZ);
  for (const wall of visibleWalls) for (const x of [wall.x - wall.halfWidth, wall.x + wall.halfWidth]) {
    fitPoint(x, 0, wall.z); fitPoint(x, wall.height, wall.z);
  }
  focal = Math.max(.01, focal);
  return {
    ...baseCamera,
    x: 0, y: cameraY, z: 0,
    cx: w / 2 - targetX * focal / targetZ,
    horizon: h * .40 - (cameraY - targetY) * focal / targetZ,
    focal
  };
}
