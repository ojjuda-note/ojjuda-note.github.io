import test from 'node:test';
import assert from 'node:assert/strict';
import {createBulletCinematic, sampleBulletCinematic, desiredBulletCamera, BULLET_REPLAY_DISTANCE,
  BULLET_FLIGHT_DURATION, BULLET_HOLD_DURATION, BULLET_RETURN_DURATION} from '../games/forest-archer/bullet-cinematic.mjs';
import {projectPoint} from '../games/forest-archer/view.mjs';

const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const copy=value=>structuredClone(value);
const pointNear=(a,b)=>{for(const key of ['x','y','z'])near(a[key],b[key]);};
const fixture=()=>({projectileType:'bullet',bulletId:0,shaftLength:.12,active:false,elapsed:.4,speed:157,
  position:{x:.04,y:2.25,z:50},velocity:{x:1.2,y:-2,z:141},
  result:{type:'hit',score:10,point:{x:.04,y:2.25,z:50},targetCenter:{kind:'target',x:0,y:2.3,z:50,rx:.61,ry:.61,radius:.61}},
  replayFrames:[
    {point:{x:0,y:1.65,z:0},velocity:{x:0,y:2,z:157},time:2},
    {point:{x:-.1,y:2.4,z:42},velocity:{x:.6,y:-1,z:146},time:2.34},
    {point:{x:-.05,y:2.35,z:47},velocity:{x:.9,y:-1.5,z:143},time:2.38},
    {point:{x:.04,y:2.25,z:50},velocity:{x:1.2,y:-2,z:141},time:2.4}
  ]});

test('only genuine recorded circular-target ten-point bullets start the dedicated motion',()=>{
  const motion=createBulletCinematic(fixture(),2.4);
  assert.equal(motion.kind,'bullet');
  for(const mutate of [
    shot=>{shot.projectileType='arrow';},shot=>{shot.result.score=8;},
    ...['miss','ground','person','obstacle'].map(type=>shot=>{shot.result.type=type;}),
    ...['rabbit','eagle','clay','ufo'].map(kind=>shot=>{shot.result.targetCenter.kind=kind;}),
    shot=>{shot.replayFrames=[];},shot=>{shot.result.point.x=NaN;},
    shot=>{shot.replayFrames[1].velocity.z=Infinity;},shot=>{shot.replayFrames[2].time=1;},
    shot=>{shot.result.targetCenter.radius=0;}
  ]){const shot=fixture();mutate(shot);assert.equal(createBulletCinematic(shot,2.4),null);}
});

test('bullet motion retains the measured curved path and actual impact without changing the shot',()=>{
  const shot=fixture(),before=copy(shot),motion=createBulletCinematic(shot,2.4);
  assert.equal(motion.shot,shot);assert.deepEqual(shot,before);
  const length=motion.frames.slice(1).reduce((sum,frame,i)=>sum+Math.hypot(...['x','y','z'].map(key=>frame.point[key]-motion.frames[i].point[key])),0);
  near(length,BULLET_REPLAY_DISTANCE);
  assert.ok(motion.frames.some(frame=>frame.point.x===-.05),'the measured bend is kept');
  for(let age=0;age<2;age+=.01){
    const frame=sampleBulletCinematic(motion,age);assert.equal(frame.kind,'bullet');
    assert.equal(frame.projectileType,'bullet');near(frame.shaftLength,.12);
    if(frame.phase==='flight'){
      const right=motion.frames.findIndex(value=>value.time>=frame.time);
      const a=motion.frames[Math.max(0,right-1)],b=motion.frames[Math.max(0,right)];
      const t=a===b?0:(frame.time-a.time)/(b.time-a.time);
      for(const field of ['point','velocity'])for(const key of ['x','y','z'])near(frame[field][key],a[field][key]+(b[field][key]-a[field][key])*t);
    }else pointNear(frame.point,shot.result.point);
  }
  assert.deepEqual(shot,before);
  shot.replayFrames.at(-1).point.x=99;shot.result.point.y=99;shot.velocity.x=99;
  pointNear(motion.impactPoint,before.result.point);pointNear(motion.velocity,before.velocity);
});

test('a fastest bullet resolved in one display frame still has a full visible approach and one impact',()=>{
  const shot=fixture();shot.bulletId=3;shot.position={x:0,y:1.65,z:10};shot.velocity={x:0,y:0,z:471};
  shot.result.point={...shot.position};shot.result.targetCenter={kind:'target',x:0,y:1.65,z:10,radius:.61};
  shot.replayFrames=[{point:{x:0,y:1.65,z:0},velocity:{...shot.velocity},time:0},{point:{...shot.position},velocity:{...shot.velocity},time:10/471}];
  const motion=createBulletCinematic(shot,10/471),before=copy(shot);
  assert.ok(motion);assert.equal(motion.flightDuration,BULLET_FLIGHT_DURATION);
  let previous=-Infinity,spin=-Infinity;
  for(let i=0;i<50;i++){
    const frame=sampleBulletCinematic(motion,motion.flightDuration*i/50);
    assert.equal(frame.phase,'flight');assert.ok(frame.time>=previous);assert.ok(frame.spin>spin);
    near(frame.point.x,0);near(frame.point.y,1.65);assert.ok(frame.point.z>=10-BULLET_REPLAY_DISTANCE&&frame.point.z<10);
    previous=frame.time;spin=frame.spin;
  }
  for(const [age,phase] of [[BULLET_FLIGHT_DURATION,'impact'],[BULLET_FLIGHT_DURATION+BULLET_HOLD_DURATION+.001,'return'],[BULLET_FLIGHT_DURATION+BULLET_HOLD_DURATION+BULLET_RETURN_DURATION+.001,'done']]){
    assert.equal(sampleBulletCinematic(motion,age).phase,phase);
  }
  assert.deepEqual(shot,before);
});

test('the bullet and full ten-point ring remain visible through phone, landscape and desktop close views',()=>{
  const motion=createBulletCinematic(fixture(),2.4);
  for(const [w,h] of [[320,360],[390,640],[844,290],[1280,650]]){
    const base={x:0,y:1.65,z:0,cx:w/2,horizon:h*.405,focal:Math.min(w*1.08,h*1.5)};
    for(let i=0;i<100;i++){
      const frame=sampleBulletCinematic(motion,(motion.flightDuration+motion.holdDuration)*i/100),before=copy(frame);
      const camera=desiredBulletCamera(frame,base,{w,h});assert.ok(Object.values(camera).every(Number.isFinite));
      const speed=Math.hypot(...Object.values(frame.velocity)),center=frame.targetCenter;
      const tail=Object.fromEntries(['x','y','z'].map(key=>[key,frame.point[key]-frame.velocity[key]/speed*frame.shaftLength]));
      for(const point of [frame.point,tail,{x:center.x-center.rx*.2,y:center.y,z:center.z},{x:center.x+center.rx*.2,y:center.y,z:center.z},{x:center.x,y:center.y-center.ry*.2,z:center.z},{x:center.x,y:center.y+center.ry*.2,z:center.z}]){
        const p=projectPoint(point,camera);assert.equal(p.visible,true);assert.ok(p.x>0&&p.x<w&&p.y>0&&p.y<h,`${w}x${h} ${i}`);
      }
      assert.deepEqual(frame,before);
    }
    for(const age of [motion.flightDuration,motion.flightDuration+motion.holdDuration]){
      const before=projectPoint(motion.impactPoint,desiredBulletCamera(sampleBulletCinematic(motion,age-1e-6),base,{w,h}));
      const after=projectPoint(motion.impactPoint,desiredBulletCamera(sampleBulletCinematic(motion,age+1e-6),base,{w,h}));
      assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<.02,'contact and return do not cut to a new camera');
    }
  }
});

test('reduced motion keeps a static impact and never spins, shakes or adds a flight camera',()=>{
  const motion=createBulletCinematic(fixture(),2.4,{reducedMotion:true});
  assert.equal(motion.flightDuration,0);
  const base={x:0,y:1.65,z:0,cx:195,horizon:220,focal:450};
  for(const age of [0,.1,.399,.45,.8]){
    const frame=sampleBulletCinematic(motion,age);
    assert.notEqual(frame.phase,'flight');assert.equal(frame.spin,0);assert.equal(frame.entryMask,0);assert.equal(frame.impactPulse,0);
    assert.deepEqual(desiredBulletCamera(frame,base,{w:390,h:640}),base);
  }
});
