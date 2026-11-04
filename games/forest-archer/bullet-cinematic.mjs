/** Bullet-time presentation of a resolved shot. Never advances or changes physics. */
import {NEAR_PLANE, projectPoint, lerpCamera} from './view.mjs?v=20261104-archery-eagle-dive1';

export const BULLET_REPLAY_DISTANCE = 6.4;
export const BULLET_FLIGHT_DURATION = .82;
export const BULLET_HOLD_DURATION = .62;
export const BULLET_RETURN_DURATION = .52;
export const BULLET_REDUCED_HOLD_DURATION = .40;
export const BULLET_ENTRY_DURATION = .12;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const smooth = value => {const t=clamp(value,0,1);return t*t*(3-2*t);};
const vector = value => value && ['x','y','z'].every(axis=>Number.isFinite(value[axis]));
const copy = value => ({x:value.x,y:value.y,z:value.z});
const mix = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const snapshot = frame => ({point:copy(frame.point),velocity:copy(frame.velocity),time:frame.time,
  ...(frame.incomingVelocity?{incomingVelocity:copy(frame.incomingVelocity)}:{})});
const between = (a,b,t) => t<=0?snapshot(a):t>=1?snapshot(b):
  ({point:mix(a.point,b.point,t),velocity:mix(a.velocity,b.incomingVelocity||b.velocity,t),time:a.time+(b.time-a.time)*t});

/** Keep measured bends and the real contact; even a one-frame flight has two samples. */
export function createBulletCinematic(shot, worldTime, {reducedMotion = false} = {}) {
  const result=shot?.result,center=result?.targetCenter;
  if(shot?.projectileType!=='bullet'||result?.type!=='hit'||result.score!==10||center?.kind!=='target')return null;
  if(!Number.isFinite(worldTime)||!vector(result.point)||!vector(shot.velocity)||!vector(center))return null;
  if(['radius','rx','ry'].some(key=>center[key]!==undefined&&!(Number.isFinite(center[key])&&center[key]>0)))return null;
  if(!Array.isArray(shot.replayFrames)||shot.replayFrames.length<2)return null;
  const recorded=[];
  for(const frame of shot.replayFrames){
    if(!vector(frame?.point)||!vector(frame?.velocity)||!Number.isFinite(frame?.time)||
      (frame.incomingVelocity!==undefined&&!vector(frame.incomingVelocity)))return null;
    if(recorded.length&&frame.time<recorded.at(-1).time-1e-9)return null;
    if(frame.time>worldTime+1e-9)continue;
    const next=snapshot(frame);
    if(recorded.length&&Math.abs(next.time-recorded.at(-1).time)<=1e-9){
      if(recorded.at(-1).incomingVelocity)next.incomingVelocity=copy(recorded.at(-1).incomingVelocity);
      recorded[recorded.length-1]=next;
    }
    else recorded.push(next);
  }
  const impact={point:copy(result.point),velocity:copy(shot.velocity),time:worldTime};
  if(recorded.length&&Math.abs(recorded.at(-1).time-worldTime)<=1e-9){
    if(recorded.at(-1).incomingVelocity)impact.incomingVelocity=copy(recorded.at(-1).incomingVelocity);
    recorded[recorded.length-1]=impact;
  }
  else recorded.push(impact);
  if(recorded.length<2||worldTime-recorded[0].time<=1e-9)return null;
  let length=0,first=0,cut=null;
  for(let i=recorded.length-2;i>=0;i--){
    const segment=distance(recorded[i].point,recorded[i+1].point);
    if(segment>1e-12&&length+segment>=BULLET_REPLAY_DISTANCE){
      cut=between(recorded[i],recorded[i+1],1-(BULLET_REPLAY_DISTANCE-length)/segment);first=i+1;break;
    }
    length+=segment;
  }
  const frames=cut?[cut,...recorded.slice(first)]:recorded;
  if(frames.length<2||distance(frames[0].point,impact.point)<1e-8)return null;
  return {kind:'bullet',shot,frames,impactTime:worldTime,impactPoint:copy(impact.point),velocity:copy(impact.velocity),
    targetCenter:{...center},reducedMotion:!!reducedMotion,cameraSide:impact.velocity.x<-.05?-1:1,
    entryDuration:reducedMotion?0:BULLET_ENTRY_DURATION,
    flightDuration:reducedMotion?0:BULLET_FLIGHT_DURATION,
    holdDuration:reducedMotion?BULLET_REDUCED_HOLD_DURATION:BULLET_HOLD_DURATION,
    returnDuration:BULLET_RETURN_DURATION,soundPlayed:false};
}

export function sampleBulletCinematic(cinematic, elapsed) {
  if(!cinematic?.frames?.length||!vector(cinematic.impactPoint))return null;
  const flight=Math.max(0,finite(cinematic.flightDuration)),hold=Math.max(0,finite(cinematic.holdDuration));
  const returning=Math.max(0,finite(cinematic.returnDuration)),age=Math.max(0,finite(elapsed));
  let phase,progress;
  if(flight>0&&age<flight){phase='flight';progress=age/flight;}
  else if(hold>0&&age<flight+hold){phase='impact';progress=(age-flight)/hold;}
  else if(returning>0&&age<flight+hold+returning){phase='return';progress=(age-flight-hold)/returning;}
  else{phase='done';progress=1;}
  // Linger beside the spinning projectile, then accelerate into its saved hit.
  const pathProgress=phase==='flight'?.22*progress+.78*progress**3:1;
  let frame={point:copy(cinematic.impactPoint),velocity:copy(cinematic.velocity),time:cinematic.impactTime};
  if(phase==='flight'){
    const frames=cinematic.frames,time=frames[0].time+(frames.at(-1).time-frames[0].time)*pathProgress;
    const right=frames.findIndex(candidate=>candidate.time>=time);
    frame=right<=0?snapshot(frames[0]):between(frames[right-1],frames[right],clamp((time-frames[right-1].time)/Math.max(1e-12,frames[right].time-frames[right-1].time),0,1));
  }
  const impactAge=phase==='flight'?0:Math.max(0,age-flight);
  const pulse=impactAge<.045?smooth(impactAge/.045):Math.exp(-Math.pow((impactAge-.045)/.095,2));
  const entry=Math.max(0,finite(cinematic.entryDuration,BULLET_ENTRY_DURATION));
  return {...frame,kind:'bullet',projectileType:'bullet',phase,progress,phaseProgress:progress,pathProgress,elapsed:age,impactAge,
    spin:cinematic.reducedMotion?0:Math.min(age,flight)*Math.PI*18,
    entryMask:cinematic.reducedMotion||entry<=0?0:1-smooth(age/entry),
    impactPulse:cinematic.reducedMotion||phase==='flight'?0:pulse,
    cameraSide:cinematic.cameraSide===-1?-1:1,targetCenter:{...cinematic.targetCenter},reducedMotion:cinematic.reducedMotion,
    shaftLength:Math.max(.04,finite(cinematic.shot?.shaftLength,.12))};
}

/** A close side view of the bullet opens onto the target, followed by a short recoil. */
export function desiredBulletCamera(frame, baseCamera = {}, viewport = {}) {
  if(!frame||frame.reducedMotion||frame.phase==='done'||!vector(frame.point)||!vector(frame.targetCenter))return lerpCamera(baseCamera,baseCamera,1);
  const w=Math.max(1,finite(viewport.w,1)),h=Math.max(1,finite(viewport.h,1)),point=frame.point,target=frame.targetCenter;
  const rx=Math.max(.05,finite(target.rx,finite(target.radius,.61))),ry=Math.max(.05,finite(target.ry,finite(target.radius,.61)));
  const radius=Math.max(rx,ry),approach=frame.phase==='flight'?smooth(finite(frame.progress)):1;
  const side=frame.cameraSide===-1?-1:1,pulse=clamp(finite(frame.impactPulse),0,1);
  const velocity=vector(frame.velocity)?frame.velocity:{x:0,y:0,z:1};
  const speed=Math.max(1e-10,Math.hypot(velocity.x,velocity.y,velocity.z)),length=Math.max(.04,finite(frame.shaftLength,.12));
  const tail={x:point.x-velocity.x/speed*length,y:point.y-velocity.y/speed*length,z:point.z-velocity.z/speed*length};
  const follow=(1.05+(Math.max(1.7,radius*2.2)-1.05)*approach)*(1-.12*pulse);
  const camera={...baseCamera,
    x:point.x+(target.x-point.x)*.16*approach-side*(.32*(1-approach)+radius*.24*approach),
    y:point.y+(target.y-point.y)*.16*approach+.10+.03*approach,
    z:Math.min(point.z-follow,tail.z-NEAR_PLANE-.2,target.z-NEAR_PLANE-.2),
    cx:0,horizon:0,focal:Math.min(w*(1.3+.12*approach),h*(1.65+.15*approach))*(1+.025*pulse)};
  const contact=projectPoint(point,camera);
  camera.cx=w*(.34+.16*approach)-contact.x;
  camera.horizon=h*(.57-.10*approach)-contact.y;
  const points=[point,tail,{x:target.x-rx*.2,y:target.y,z:target.z},{x:target.x+rx*.2,y:target.y,z:target.z},
    {x:target.x,y:target.y-ry*.2,z:target.z},{x:target.x,y:target.y+ry*.2,z:target.z}];
  const projected=points.map(p=>projectPoint(p,{...camera,cx:0,horizon:0,focal:1}));
  const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x));
  const minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
  const marginX=w*.10,marginY=h*.14;
  if(maxX-minX>1e-10)camera.focal=Math.min(camera.focal,(w-2*marginX)/(maxX-minX));
  if(maxY-minY>1e-10)camera.focal=Math.min(camera.focal,(h-2*marginY)/(maxY-minY));
  camera.focal=Math.max(.01,camera.focal);
  camera.cx=clamp(camera.cx,marginX-minX*camera.focal,w-marginX-maxX*camera.focal);
  camera.horizon=clamp(camera.horizon,marginY-minY*camera.focal,h-marginY-maxY*camera.focal);
  const shake=Math.min(2.3,Math.min(w,h)*.0045)*pulse,contactAge=Math.max(0,finite(frame.impactAge));
  camera.cx+=Math.sin(contactAge*80)*shake*.6;
  camera.horizon+=Math.sin(contactAge*65)*shake;
  return camera;
}
