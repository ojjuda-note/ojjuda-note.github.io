/** A replay of recorded flight only: this module never advances game physics. */
import {NEAR_PLANE, projectPoint, lerpCamera} from './view.mjs?v=20261104-archery-burst-sum1';

export const BULLSEYE_REPLAY_DISTANCE = 3.4;
export const BULLSEYE_FLIGHT_DURATION = .48;
export const BULLSEYE_HOLD_DURATION = .82;
export const BULLSEYE_RETURN_DURATION = .60;
export const BULLSEYE_REDUCED_HOLD_DURATION = .40;
export const BULLSEYE_ENTRY_DURATION = .10;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const smoothstep = value => {const t=clamp(value,0,1);return t*t*(3-2*t);};
const vectorIsFinite = value => value && ['x','y','z'].every(axis => Number.isFinite(value[axis]));
const copy = value => ({x:value.x,y:value.y,z:value.z});
const mix = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const snapshot = frame => ({point:copy(frame.point),velocity:copy(frame.velocity),time:frame.time});
const interpolate = (a,b,t) => ({point:mix(a.point,b.point,t),velocity:mix(a.velocity,b.velocity,t),time:a.time+(b.time-a.time)*t});
// A continuous attack and release: contact itself never jumps the camera.
const contactPulse = age => age < 0 ? 0 : age < .055
  ? smoothstep(age/.055) : Math.exp(-Math.pow((age-.055)/.13,2));

/** Capture the final short approach without modifying a shot, result, or recording. */
export function createBullseyeCinematic(shot, worldTime, {reducedMotion = false} = {}) {
  const result = shot?.result, center = result?.targetCenter;
  if (shot?.projectileType !== 'arrow' || result?.type !== 'hit' || result.score !== 10 || center?.kind !== 'target') return null;
  if (!Number.isFinite(worldTime) || !vectorIsFinite(result.point) || !vectorIsFinite(shot.velocity) || !vectorIsFinite(center)) return null;
  if (['radius','rx','ry'].some(key => center[key] !== undefined && !(Number.isFinite(center[key]) && center[key] > 0))) return null;
  if (!Array.isArray(shot.replayFrames) || shot.replayFrames.length < 2) return null;
  const recorded = [];
  for (const frame of shot.replayFrames) {
    if (!vectorIsFinite(frame?.point) || !vectorIsFinite(frame?.velocity) || !Number.isFinite(frame?.time)) return null;
    if (recorded.length && frame.time < recorded.at(-1).time - 1e-9) return null;
    if (frame.time > worldTime + 1e-9) continue;
    const next = snapshot(frame);
    if (recorded.length && Math.abs(next.time-recorded.at(-1).time) <= 1e-9) recorded[recorded.length-1] = next;
    else recorded.push(next);
  }
  const impact = {point:copy(result.point),velocity:copy(shot.velocity),time:worldTime};
  if (recorded.length && Math.abs(recorded.at(-1).time-worldTime) <= 1e-9) recorded[recorded.length-1] = impact;
  else recorded.push(impact);
  if (recorded.length < 2 || worldTime-recorded[0].time <= 1e-9) return null;

  let length = 0, first = 0, cut = null;
  for (let index = recorded.length-2; index >= 0; index--) {
    const segment = distance(recorded[index].point,recorded[index+1].point);
    if (segment > 1e-12 && length+segment >= BULLSEYE_REPLAY_DISTANCE) {
      const portion = (BULLSEYE_REPLAY_DISTANCE-length)/segment;
      cut = interpolate(recorded[index],recorded[index+1],1-portion);
      first = index+1;break;
    }
    length += segment;
  }
  const frames = cut ? [cut,...recorded.slice(first)] : recorded;
  if (frames.length < 2 || distance(frames[0].point,impact.point) < 1e-8) return null;
  return {
    shot,frames,impactTime:worldTime,impactPoint:copy(impact.point),velocity:copy(impact.velocity),
    targetCenter:{...center},reducedMotion:!!reducedMotion,
    cameraSide:impact.velocity.x < -.05 ? -1 : 1,
    entryDuration:reducedMotion ? 0 : BULLSEYE_ENTRY_DURATION,
    flightDuration:reducedMotion ? 0 : BULLSEYE_FLIGHT_DURATION,
    holdDuration:reducedMotion ? BULLSEYE_REDUCED_HOLD_DURATION : BULLSEYE_HOLD_DURATION,
    returnDuration:BULLSEYE_RETURN_DURATION,soundPlayed:false
  };
}

/** `progress` always describes the current phase, not the entire sequence. */
export function sampleBullseyeCinematic(cinematic, elapsed) {
  if (!cinematic?.frames?.length || !vectorIsFinite(cinematic.impactPoint)) return null;
  const flight = Math.max(0,finite(cinematic.flightDuration)), hold = Math.max(0,finite(cinematic.holdDuration));
  const returning = Math.max(0,finite(cinematic.returnDuration)), age = Math.max(0,finite(elapsed));
  let phase, progress;
  if (flight > 0 && age < flight) {phase='flight';progress=age/flight;}
  else if (hold > 0 && age < flight+hold) {phase='impact';progress=(age-flight)/hold;}
  else if (returning > 0 && age < flight+hold+returning) {phase='return';progress=(age-flight-hold)/returning;}
  else {phase='done';progress=1;}
  // Accelerate through recorded scene time, retaining every bend and velocity
  // sample. Camera beats change presentation, never the resolved shot.
  const pathProgress = phase === 'flight' ? .35*progress+.65*progress*progress : 1;
  const impactAge = phase === 'flight' ? 0 : Math.max(0,age-flight);
  const entry = Math.max(0,finite(cinematic.entryDuration,BULLSEYE_ENTRY_DURATION));
  let frame = {point:copy(cinematic.impactPoint),velocity:copy(cinematic.velocity),time:cinematic.impactTime};
  if (phase === 'flight') {
    const frames = cinematic.frames, first = frames[0], last = frames.at(-1);
    const time = first.time+(last.time-first.time)*pathProgress;
    let right = frames.findIndex(candidate => candidate.time >= time);
    if (right <= 0) frame = snapshot(first);
    else {
      const before = frames[right-1], after = frames[right];
      frame = interpolate(before,after,clamp((time-before.time)/Math.max(1e-12,after.time-before.time),0,1));
    }
  }
  return {...frame,phase,progress,phaseProgress:progress,pathProgress,elapsed:age,impactAge,
    entryMask:cinematic.reducedMotion || entry <= 0 ? 0 : 1-smoothstep(age/entry),
    impactPulse:cinematic.reducedMotion || phase === 'flight' ? 0 : contactPulse(impactAge),
    cameraSide:cinematic.cameraSide === -1 ? -1 : 1,
    targetCenter:{...cinematic.targetCenter},reducedMotion:cinematic.reducedMotion,
    shaftLength:Math.max(.1,finite(cinematic.shot?.shaftLength,.85))};
}

/** A close follow goal; the caller owns entry and return camera interpolation. */
export function desiredBullseyeCamera(frame, baseCamera = {}, viewport = {}) {
  if (!frame || frame.reducedMotion || frame.phase === 'done' || !vectorIsFinite(frame.point) || !vectorIsFinite(frame.targetCenter)) return lerpCamera(baseCamera,baseCamera,1);
  const w = Math.max(1,finite(viewport.w,1)), h = Math.max(1,finite(viewport.h,1));
  const point = frame.point, target = frame.targetCenter;
  const radiusX = Math.max(.05,finite(target.rx,finite(target.radius,1.25)));
  const radiusY = Math.max(.05,finite(target.ry,finite(target.radius,1.25)));
  const radius = Math.max(radiusX,radiusY);
  const approach = frame.phase === 'flight' ? smoothstep(finite(frame.progress)) : 1;
  const side = frame.cameraSide === -1 ? -1 : 1;
  const pulse = clamp(finite(frame.impactPulse),0,1);
  const followStart = Math.max(2.7,radius*1.95), followEnd = Math.max(1.9,radius*1.50);
  const follow = (followStart+(followEnd-followStart)*approach)*(1-.09*pulse);
  const velocity = vectorIsFinite(frame.velocity) ? frame.velocity : {x:0,y:0,z:1};
  const speed = Math.max(1e-10,Math.hypot(velocity.x,velocity.y,velocity.z));
  const shaft = Math.max(.1,finite(frame.shaftLength,.85));
  const tail = {x:point.x-velocity.x/speed*shaft,y:point.y-velocity.y/speed*shaft,z:point.z-velocity.z/speed*shaft};
  const camera = {
    ...baseCamera,
    // A modest shoulder-to-centre arc adds parallax without orbiting behind the
    // board or moving the real contact to the middle of the screen.
    x:point.x*.82+target.x*.18-side*radius*(.56-.28*approach),
    y:point.y*.82+target.y*.18+radius*(.24-.13*approach+.05*Math.sin(Math.PI*approach)),
    z:Math.min(point.z-follow,tail.z-NEAR_PLANE-.25,target.z-NEAR_PLANE-.25),
    cx:w*.44,horizon:h*.43,
    focal:Math.min(w*(1.18+.19*approach),h*(1.65+.28*approach))*(1+.045*pulse)
  };
  const points = [point,tail,
    {x:target.x-radiusX*.2,y:target.y,z:target.z},
    {x:target.x+radiusX*.2,y:target.y,z:target.z},
    {x:target.x,y:target.y-radiusY*.2,z:target.z},
    {x:target.x,y:target.y+radiusY*.2,z:target.z}];
  // Fit real 3D projections, including the shaft and complete ten-point ring.
  // Only camera fields change; the arrow, target, and impact remain untouched.
  const unit = {...camera,cx:0,horizon:0,focal:1};
  const projected = points.map(point => projectPoint(point,unit));
  const minX = Math.min(...projected.map(p=>p.x)), maxX = Math.max(...projected.map(p=>p.x));
  const minY = Math.min(...projected.map(p=>p.y)), maxY = Math.max(...projected.map(p=>p.y));
  const marginX = w*.09, marginY = h*.12;
  if (maxX-minX > 1e-10) camera.focal = Math.min(camera.focal,(w-2*marginX)/(maxX-minX));
  if (maxY-minY > 1e-10) camera.focal = Math.min(camera.focal,(h-2*marginY)/(maxY-minY));
  camera.focal = Math.max(.01,camera.focal);
  camera.cx = clamp(camera.cx,marginX-minX*camera.focal,w-marginX-maxX*camera.focal);
  camera.horizon = clamp(camera.horizon,marginY-minY*camera.focal,h-marginY-maxY*camera.focal);
  // Shake is limited to a few screen pixels after fitting, well inside the
  // reserved margins. Its smooth envelope starts at zero on the actual hit.
  const impactAge = Math.max(0,finite(frame.impactAge));
  const shake = Math.min(4.5,Math.min(w,h)*.007)*pulse;
  camera.cx += Math.sin(impactAge*92)*shake*.8;
  camera.horizon += Math.sin(impactAge*77+.7)*shake*.6;
  return camera;
}
