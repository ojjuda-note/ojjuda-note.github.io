/** A manually zeroed sight only. This module never aims or fires an arrow. */
import {PLAYER, BOWS} from './engine.mjs?v=20261104-archery-passer-retire1';

export const LASER_PRICE = 500;
export const LASER_CLICK_DEGREES = .05;
export const LASER_MAX_CLICKS = 1200;
const CLICK_RADIANS = LASER_CLICK_DEGREES * Math.PI / 180;
const EPSILON = 1e-10;
const finitePoint = point => point && ['x','y','z'].every(axis => Number.isFinite(point[axis]));
const clicks = value => Number.isFinite(value) ? Math.max(-LASER_MAX_CLICKS,Math.min(LASER_MAX_CLICKS,Math.round(value))) : 0;

/** The second half of the main weapon shop starts with the first crossbow. */
export function canEquipLaser(weaponOrId) {
  const id=weaponOrId && typeof weaponOrId==='object'?weaponOrId.id:weaponOrId;
  return Number.isInteger(id)&&BOWS.some(weapon=>weapon.id===id&&weapon.weaponType==='crossbow');
}

/** Saved settings contain no target, automatic trigger or ballistic correction. */
export function normalizeLaserSettings(value = {}) {
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {enabled:settings.enabled !== false,horizontalClicks:clicks(settings.horizontalClicks),verticalClicks:clicks(settings.verticalClicks)};
}

/**
 * Numbers describe the intended launch correction: + means right/higher.
 * Move the sight the opposite way, so manually returning its dot to the same
 * point requires that launch correction. Never change the physical aim here.
 */
export function projectLaserPoint({yaw,pitch,distance,settings,origin = PLAYER} = {}) {
  if (![yaw,pitch,distance].every(Number.isFinite) || !finitePoint(origin) || distance <= origin.z + EPSILON) return null;
  const zero = normalizeLaserSettings(settings);
  const horizontal = yaw - zero.horizontalClicks * CLICK_RADIANS;
  const vertical = pitch - zero.verticalClicks * CLICK_RADIANS;
  const cosine = Math.cos(horizontal), forward = cosine * Math.cos(vertical);
  if (!Number.isFinite(forward) || forward <= EPSILON) return null;
  const depth = distance - origin.z;
  const point = {x:origin.x + Math.tan(horizontal) * depth,
    y:origin.y + Math.tan(vertical) / cosine * depth,z:distance};
  return finitePoint(point) ? point : null;
}

function boxIntersection(origin, endpoint, box) {
  if (!box || !['x','z','width','height','depth'].every(key => Number.isFinite(box[key])) ||
      box.width <= 0 || box.height <= 0 || box.depth < 0 || !Number.isFinite(box.y ?? 0)) return null;
  const bottom = box.y ?? 0;
  const bounds = {x:[box.x-box.width/2,box.x+box.width/2],y:[bottom,bottom+box.height],z:[box.z-box.depth/2,box.z+box.depth/2]};
  let first = 0, last = 1;
  for (const axis of ['x','y','z']) {
    const delta = endpoint[axis] - origin[axis], [low,high] = bounds[axis];
    if (Math.abs(delta) <= EPSILON) {
      if (origin[axis] < low || origin[axis] > high) return null;
    } else {
      const a = (low-origin[axis])/delta, b = (high-origin[axis])/delta;
      first = Math.max(first,Math.min(a,b));last = Math.min(last,Math.max(a,b));
      if (first > last) return null;
    }
  }
  return first;
}

/** Stop the visible dot at the nearest current wall or passer, with no prediction. */
export function traceLaserPoint({obstacles = [],people = [],origin = PLAYER,...ray} = {}) {
  const targetPoint = projectLaserPoint({...ray,origin});
  if (!targetPoint) return null;
  let nearest = 1, blockedBy = null;
  for (const [kind,boxes] of [['obstacle',obstacles],['person',people]]) {
    if (!Array.isArray(boxes)) continue;
    for (const box of boxes) {
      const at = boxIntersection(origin,targetPoint,box);
      if (at !== null && at <= nearest) {nearest=at;blockedBy=kind;}
    }
  }
  const point = nearest === 1 ? {...targetPoint} : Object.fromEntries(['x','y','z'].map(axis =>
    [axis,origin[axis]+(targetPoint[axis]-origin[axis])*nearest]));
  return {point,targetPoint,blocked:blockedBy !== null,blockedBy};
}
