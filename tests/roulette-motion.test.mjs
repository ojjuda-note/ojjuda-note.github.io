import test from 'node:test';
import assert from 'node:assert/strict';
import {WHEEL_ORDER} from '../games/roulette/engine.js';
import {planSpinMotion,sampleSpinMotion,wheelSurface} from '../games/roulette/motion.js';
const TAU=Math.PI*2;
const poseAt=(plan,t)=>sampleSpinMotion(plan,t/plan.duration);
test('every pocket ends on the announced number without a positional snap',()=>{
  for(let number=0;number<=36;number++)for(const variation of [0,.1,.4,.75,1])for(const duration of [20000,25000,30000]){
    const plan=planSpinMotion({number,variation,duration},1.387,-4.4),start=sampleSpinMotion(plan,0),end=sampleSpinMotion(plan,1);
    const expected=end.rotation+WHEEL_ORDER.indexOf(number)*TAU/37-Math.PI/2;
    assert.ok(Math.abs(start.angle+4.4)<1e-10);
    assert.ok(Math.abs(Math.atan2(Math.sin(end.angle-expected),Math.cos(end.angle-expected)))<1e-10);
    assert.equal(end.radius,291);assert.equal(end.height,0);assert.equal(end.done,true);
  }
});
test('ball rolls continuously, never reverses in air and has one modest outward rebound',()=>{
  for(const variation of [0,.25,.5,.75,1])for(const duration of [20000,30000]){
    const plan=planSpinMotion({number:17,variation,duration});let previous=sampleSpinMotion(plan,0),outward=false,rebounds=0,maxHeight=0;
    for(let i=1;i<=10000;i++){
      const pose=sampleSpinMotion(plan,i/10000);
      assert.ok(pose.radius>=290.99&&pose.radius<=396.01);assert.ok(pose.height>=0&&pose.height<55);
      assert.ok(Math.abs(pose.angle-previous.angle)<.05);assert.ok(Math.abs(pose.radius-previous.radius)<1);assert.ok(Math.abs(pose.elevation-previous.elevation)<1);
      assert.ok(pose.angle-pose.rotation <= previous.angle-previous.rotation+1e-10);
      const rising=pose.radius>previous.radius+1e-5;if(rising&&!outward)rebounds++;outward=rising;
      maxHeight=Math.max(maxHeight,pose.height);previous=pose;
    }
    assert.equal(rebounds,1);assert.ok(maxHeight>20);
  }
});
test('angular velocity stays continuous at former docking point and all curve joins',()=>{
  for(const duration of [20000,30000]){
    const plan=planSpinMotion({number:9,variation:.63,duration}),epsilon=.00001;
    for(const time of [...plan.angular.points.slice(1,-1).map(p=>p[0]),plan.dockAt*plan.duration]){
      const before=poseAt(plan,time-epsilon),at=poseAt(plan,time),after=poseAt(plan,time+epsilon);
      assert.ok(Math.abs((at.angle-before.angle)/epsilon-(after.angle-at.angle)/epsilon)<.001);
    }
  }
});
test('airborne motion uses equal gravity for short and long spins and clears the last divider',()=>{
  for(const duration of [20000,25000,30000])for(const variation of [0,.5,1]){
    const plan=planSpinMotion({number:9,variation,duration});
    for(const flight of plan.flights){
      const time=(flight.start+flight.end)/2,h=.0001;
      const a=poseAt(plan,time-h),b=poseAt(plan,time),c=poseAt(plan,time+h);
      assert.ok(Math.abs((c.elevation-2*b.elevation+a.elevation)/(h*h)+1100)<.01);
      assert.ok(b.elevation>wheelSurface(b.radius));
    }
    const pocketFlight=plan.flights[2],atDivider=poseAt(plan,(pocketFlight.start+pocketFlight.end)/2);
    assert.ok(atDivider.height>17,'ball must clear the divider, not pass through it');
  }
});
test('saved rounds reconstruct identical motion; variation changes the path',()=>{
  const spin={number:22,variation:.636,duration:26600},plan=planSpinMotion(spin,.4,-2),restored=planSpinMotion(JSON.parse(JSON.stringify(spin)),.4,-2);
  for(const p of [.1,.34,.52,.66,.79,.87,.93,.99,1])assert.deepEqual(sampleSpinMotion(plan,p),sampleSpinMotion(restored,p));
  assert.notEqual(sampleSpinMotion(plan,.79).angle,sampleSpinMotion(planSpinMotion({...spin,variation:.12},.4,-2),.79).angle);
  assert.ok(plan.impacts.every((hit,i)=>hit.strength>0&&hit.at<1&&(!i||hit.at>plan.impacts[i-1].at)));
});

test('the full ball clears each 3D divider throughout descent and settling',()=>{
  const step=TAU/37;
  for(const duration of [20000,25000,30000])for(const variation of [0,.25,.5,.75,1]){
    const plan=planSpinMotion({number:17,variation,duration});
    for(let t=plan.reboundAt*plan.duration-1;t<=plan.duration;t+=.001){
      const pose=poseAt(plan,t),relative=pose.angle-pose.rotation;
      const divider=Math.round((relative+Math.PI/2+step/2)/step)*step-Math.PI/2-step/2;
      const angle=relative-divider;
      // Actual renderer dimensions: radius .099, divider .028 x .17 x .55
      // at radius2.93 and height.33; trajectory units are world units x100.
      const radial=Math.max(0,Math.abs(pose.radius*Math.cos(angle)-293)-27.5);
      const lateral=Math.max(0,Math.abs(pose.radius*Math.sin(angle))-1.4);
      const vertical=Math.max(0,Math.abs(pose.elevation+10-33)-8.5);
      assert.ok(Math.hypot(radial,lateral,vertical)>=9.9,`sphere overlaps divider at ${t}s`);
    }
  }
});

test('surface speed matches measured travel on the fixed bowl and rotating rotor',()=>{
  const h=.00001;
  for(const duration of [20000,25000,30000])for(const variation of [0,.5,1]){
    const plan=planSpinMotion({number:17,variation,duration},.7,-2.2);
    for(let p=.005;p<.995;p+=.013){
      const time=p*plan.duration,pose=poseAt(plan,time),before=poseAt(plan,time-h),after=poseAt(plan,time+h);
      assert.ok(Number.isFinite(pose.surfaceSpeed)&&pose.surfaceSpeed>=0);
      // Outside the lip, measure travel in the bowl's world frame. Inside,
      // remove rotor rotation before measuring the actual Cartesian travel.
      if(pose.radius>369&&pose.radius<374)continue;
      const rotor=pose.radius<=369;
      const a=before.angle-(rotor?before.rotation:0),b=after.angle-(rotor?after.rotation:0);
      const vx=(after.radius*Math.cos(b)-before.radius*Math.cos(a))/(2*h);
      const vy=(after.radius*Math.sin(b)-before.radius*Math.sin(a))/(2*h);
      assert.ok(Math.abs(pose.surfaceSpeed-Math.hypot(vx,vy))<.01);
    }
    const carried=poseAt(plan,plan.duration-.5),later=poseAt(plan,plan.duration-.4);
    assert.ok(later.rotation>carried.rotation,'the wheel is still turning');
    assert.equal(carried.surfaceSpeed,0,'a ball locked in its pocket is not rolling');
    assert.equal(later.surfaceSpeed,0);
  }
});

test('surface contact transition is smooth and speed does not depend on frame history',()=>{
  const plan=planSpinMotion({number:9,variation:.65,duration:27500});
  for(const boundary of [369,374]){
    let lo=plan.dropAt*plan.duration,hi=plan.duration-5.4;
    for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(poseAt(plan,mid).radius>boundary)lo=mid;else hi=mid}
    const t=(lo+hi)/2,h=.000001,a=poseAt(plan,t-h).surfaceSpeed,b=poseAt(plan,t).surfaceSpeed,c=poseAt(plan,t+h).surfaceSpeed;
    assert.ok(Math.abs(a-c)<.05,'no speed step when changing contact surface');
    assert.ok(Math.abs((c-b)/h-(b-a)/h)<.1,'contact blend joins with continuous slope');
  }
  const expected=sampleSpinMotion(plan,.837).surfaceSpeed;
  for(const fps of [30,60,120]){
    for(let t=0;t<plan.duration*.837;t+=1/fps)poseAt(plan,t);
    assert.equal(sampleSpinMotion(plan,.837).surfaceSpeed,expected);
  }
});


test('the quiet ball and rotor coast together for exactly half to one extra revolution',()=>{
  for(let number=0;number<=36;number++)for(const variation of [0,.25,.5,.75,1])for(const duration of [20000,25000,30000]){
    const plan=planSpinMotion({number,variation,duration},.72,-1.9),at=poseAt(plan,plan.pocketTime),end=sampleSpinMotion(plan,1);
    assert.equal(plan.duration*1000,duration,'server duration stays unchanged');
    assert.ok(plan.coastDuration>=4&&plan.coastDuration<=6);
    const turns=(end.rotation-at.rotation)/TAU;
    assert.ok(Math.abs(turns-(.5+variation*.5))<1e-12);
    assert.ok(turns>=.5-1e-12&&turns<=1+1e-12);
    assert.equal(at.radius,291);assert.equal(at.height,0);assert.equal(at.surfaceSpeed,0);assert.equal(at.phase,'coast');
    let prior=at;
    for(let i=1;i<=60;i++){
      const pose=poseAt(plan,plan.pocketTime+plan.coastDuration*i/60);
      assert.equal(pose.radius,291);assert.equal(pose.height,0);assert.equal(pose.surfaceSpeed,0);
      assert.ok(Math.abs((pose.angle-pose.rotation)-(at.angle-at.rotation))<1e-12,'ball stays in the same pocket');
      assert.ok(pose.rotation>=prior.rotation,'rotor never reverses');
      assert.ok(pose.wheelVelocity<=prior.wheelVelocity+1e-12,'coast slows smoothly');
      assert.equal(pose.done,i===60,'result stays pending until all extra rotation finishes');
      prior=pose;
    }
    assert.equal(end.wheelVelocity,0);
    assert.ok(plan.impacts.every(event=>event.at<plan.coastAt),'bouncing finishes before coasting');
  }
});

test('rotor velocity and acceleration remain continuous when the ball stops',()=>{
  for(const duration of [20000,30000])for(const variation of [0,.5,1]){
    const plan=planSpinMotion({number:9,variation,duration}),time=plan.pocketTime,h=.00001;
    const a=poseAt(plan,time-h),b=poseAt(plan,time),c=poseAt(plan,time+h);
    assert.ok(Math.abs(a.wheelVelocity-c.wheelVelocity)<1e-8);
    assert.ok(Math.abs((b.wheelVelocity-a.wheelVelocity)/h-(c.wheelVelocity-b.wheelVelocity)/h)<1e-4);
    assert.ok(Math.abs((b.rotation-a.rotation)/h-(c.rotation-b.rotation)/h)<1e-4);
    const end=sampleSpinMotion(plan,1),beforeEnd=poseAt(plan,plan.duration-h);
    assert.ok(beforeEnd.wheelVelocity<1e-8);assert.equal(end.wheelVelocity,0);
    let previous=sampleSpinMotion(plan,0).wheelVelocity;
    for(let i=1;i<=1000;i++){const current=sampleSpinMotion(plan,i/1000).wheelVelocity;assert.ok(current<=previous+1e-10);previous=current;}
  }
});
