import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,BOWS,ARROWS,PLAYER,GRAVITY,prepareStage,targetAt,getSpeed,launchArrow,stepArrow,applyAnimalHit} from '../games/forest-archer/engine.mjs';
import {getAnimalGroundHeight,getAnimalGeometry,getAnimalFallPose,getAnimalAimPoint,getAnimalAttachmentPoint,scoreAnimalPoint} from '../games/forest-archer/animal-zones.mjs';
import {evaluateCoachShot,COACH_REACTION_SECONDS} from '../games/forest-archer/coach.mjs';

const eagles=STAGES.filter(stage=>stage.kind==='eagle');
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

// Locate the actual lowest pose without duplicating the production path or
// random generator. The coarse bracket also handles level entry/exit glides.
function touchdown(stage,passId=0){
  const duration=targetAt(stage,0).passDuration,count=240;
  let best=1;
  for(let i=2;i<count;i++)if(targetAt(stage,duration*(passId+i/count),passId).y<targetAt(stage,duration*(passId+best/count),passId).y)best=i;
  let low=duration*(passId+(best-1)/count),high=duration*(passId+(best+1)/count);
  for(let i=0;i<64;i++){
    const a=low+(high-low)/3,b=high-(high-low)/3;
    if(targetAt(stage,a,passId).y>targetAt(stage,b,passId).y)low=a;else high=b;
  }
  const time=(low+high)/2;
  return{time,target:targetAt(stage,time,passId),duration};
}

function paintedBottom(subject){
  getAnimalGroundHeight(subject); // Build the same painted contour used by drawing.
  const geometry=getAnimalGeometry(subject.kind,subject.poseTime),pose=getAnimalFallPose(subject);
  return Math.min(...geometry.groundHull.map(point=>subject.y-
    (Math.sin(pose.rotation)*point.x+Math.cos(pose.rotation)*point.y*pose.scaleY)*subject.radius));
}

test('every eagle lesson descends to a visible painted ground contact and rises in each seeded pass',()=>{
  for(const template of eagles)for(const seed of[0,5,19,0xfffffffe])for(const passId of[0,1,4]){
    const stage=prepareStage(template,seed),{time,target,duration}=touchdown(stage,passId);
    close(target.y,getAnimalGroundHeight(target));
    assert.ok(paintedBottom(target)>=0&&paintedBottom(target)<target.radius*.01,`${template.id}: the actual body edge reaches the ground`);
    assert.ok(Math.abs(target.x)+target.rx<stage.distance*.43,'the entire eagle is visible at contact');
    assert.ok(Math.abs(target.x)>.02*stage.distance,'the low point is not pinned to the centre');
    const before=targetAt(stage,time-duration*.05,passId),after=targetAt(stage,time+duration*.05,passId);
    assert.ok(before.y>target.y+target.radius*.03,'the eagle visibly descends before contact');
    assert.ok(after.y>target.y+target.radius*.03,'the eagle visibly rises after contact');
    for(let i=0;i<=32;i++){
      const at=duration*(passId+i/32),pose=targetAt(stage,at,passId);
      assert.ok(paintedBottom(pose)>=-1e-9,'no part of the painted eagle crosses below the ground');
      if(i<32){
        const nextTime=duration*(passId+(i+1)/32),next=targetAt(stage,nextTime,passId);
        if(nextTime<=time)assert.ok(next.y<=pose.y+1e-9,'descent has no extra mid-air valleys');
        if(at>=time)assert.ok(next.y>=pose.y-1e-9,'ascent never dives back into the ground');
      }
    }
  }
});

test('eagle ground spots vary on both sides without depending on call order, frame steps or lesson numbering',()=>{
  for(const template of eagles){
    const spots=new Set(),sides=new Set(),directions=new Set();
    for(const seed of[0,5,19,0xfffffffe]){
      const stage=prepareStage(template,seed),saved=structuredClone(stage);
      for(const passId of[0,1,2,3]){
        const {time,target,duration}=touchdown(stage,passId);
        spots.add(Math.round(target.x/template.distance*1000));sides.add(Math.sign(target.x));directions.add(target.direction);
        const frames=[time,time-.13,time+.11,duration*(passId+1)+.2,time-.04,time];
        for(const at of frames){
          const pose=targetAt(stage,at,passId);
          assert.deepEqual(pose,targetAt(prepareStage(template,seed),at,passId));
          if(template.catalogV1Id)assert.deepEqual(pose,targetAt({...stage,id:9001},at,passId),'catalog identity preserves a reordered lesson’s path');
        }
        const oldBefore=targetAt(stage,duration*(passId+1)-.001,passId),oldAfter=targetAt(stage,duration*(passId+1)+.001,passId);
        assert.equal(oldAfter.passId,passId);
        assert.ok(Math.hypot(oldAfter.x-oldBefore.x,oldAfter.y-oldBefore.y)<.2,'an attached arrow follows its original continuous pass');
        assert.equal(targetAt(stage,duration*(passId+1)+.001).passId,passId+1);
      }
      assert.deepEqual(stage,saved,'pure trajectory prediction does not change the round');
    }
    assert.ok(spots.size>=12,'each appearance can touch a different place');
    assert.deepEqual([...sides].sort(),[-1,1]);assert.deepEqual([...directions].sort(),[-1,1]);
  }
});

test('local pace easing keeps the same ground spot and painted support is stable through every wing pose',()=>{
  for(const id of[68,196])for(const seed of[0,5,19,0xfffffffe]){
    const stage=prepareStage(STAGES[id-1],seed),other={...stage,approachEase:.15};
    const now=touchdown(stage),before=touchdown(other);
    close(now.target.x,before.target.x,1e-6);close(now.target.y,before.target.y);
    assert.equal(now.duration,before.duration);
  }
  const reference=getAnimalGroundHeight({kind:'eagle',x:0,y:0,z:10,radius:1,poseTime:0});
  for(const direction of[-1,1])for(let sample=0;sample<=64;sample++){
    const subject={kind:'eagle',x:0,y:0,z:10,radius:1.7,direction,poseTime:sample*Math.PI/32/2.2};
    close(getAnimalGroundHeight(subject),reference*subject.radius);
  }
});

const dragFree={...ARROWS[0],tip:{...ARROWS[0].tip,drag:0},shaft:{...ARROWS[0].shaft,drag:0},fletching:{...ARROWS[0].fletching,drag:0}};
function contactShot(stage,time){
  const subject=targetAt(stage,time),point=getAnimalAimPoint(subject),params={bow:BOWS[9],arrow:dragFree,charge:1,velocityBias:0};
  const speed=getSpeed(params),dy=point.y-PLAYER.y,range2=point.x**2+point.z**2;
  const b=speed*speed-GRAVITY*dy,flight=Math.sqrt(2*(range2+dy*dy)/(b+Math.sqrt(b*b-GRAVITY*GRAVITY*(range2+dy*dy))));
  params.yaw=Math.atan2(point.x,point.z);params.pitch=Math.asin((dy+GRAVITY*flight*flight/2)/flight/speed);
  return{params,release:time-flight,flight,subject,point};
}

test('actual shots, coaching and attached arrows agree with the eagle at ground contact',()=>{
  for(const template of eagles)for(const seed of[0,19]){
    const stage=prepareStage({...template,wind:0},seed),{time}=touchdown(stage);
    const {params,release,subject,point}=contactShot(stage,time);
    let expected;
    for(const step of[8,1/30,1/120]){
      const shot=launchArrow(params);let result;
      while(shot.active&&shot.elapsed<8){result=stepArrow(shot,step,stage,release+shot.elapsed);if(result)break;}
      assert.equal(result?.type,'hit');assert.equal(result.score,10);assert.equal(result.targetCenter.passId,subject.passId);
      close(result.point.x,point.x,1e-6);close(result.point.y,point.y,1e-6);close(result.targetCenter.y,subject.y,1e-6);
      expected??=result;
    }
    const coach=evaluateCoachShot(params,stage,release,{held:2,steadyStart:1,steadyDuration:2});
    assert.equal(coach.nowScore,10);
    const later=stepArrow(launchArrow(params),8,stage,release+COACH_REACTION_SECONDS);
    assert.equal(coach.laterScore,later?.type==='hit'?later.score:0,'the coach forecasts the same moving body as live physics');
    const next=targetAt(stage,time+.15,subject.passId),attached=getAnimalAttachmentPoint(next,expected.animalAttachment);
    const nextAim=getAnimalAimPoint(next);
    for(const axis of['x','y','z'])close(attached[axis],nextAim[axis]);
    assert.equal(scoreAnimalPoint(attached,next)?.score,10);
  }
});

test('an eagle killed at touchdown rotates on top of the ground and keeps the next pass unchanged',()=>{
  let supportIncreased=false;
  for(const seed of[0,5,19,42,71,97]){
    const stage=prepareStage(eagles[0],seed),clean=prepareStage(eagles[0],seed),{time,target,duration}=touchdown(stage);
    const hit=scoreAnimalPoint(getAnimalAimPoint(target),target);
    applyAnimalHit(stage,target,10,time);
    assert.equal(applyAnimalHit(stage,targetAt(stage,time),5,time).justKilled,true);
    const impact=targetAt(stage,time);
    close(impact.y,target.y);assert.equal(impact.x,target.x);
    for(let sample=0;sample<=40;sample++){
      const corpse=targetAt(stage,time+sample*.01,target.passId),support=getAnimalGroundHeight(corpse);
      supportIncreased||=support>target.y+1e-6;
      assert.ok(paintedBottom(corpse)>=-1e-9,'rotation must not push a wing below the ground');
      assert.equal(corpse.x,target.x);assert.equal(corpse.z,target.z);assert.equal(corpse.poseTime,target.poseTime);
      assert.equal(corpse.dead,true);assert.equal(corpse.health,0);
      assert.ok(getAnimalAttachmentPoint(corpse,hit.animalAttachment).y>0,'the lodged heart arrow stays with the resting body');
    }
    const settled=targetAt(stage,time+1,target.passId);
    close(settled.y,getAnimalGroundHeight(settled));
    assert.deepEqual(targetAt(stage,duration+.001),targetAt(clean,duration+.001));
  }
  assert.ok(supportIncreased,'the fixture covers a rotating wing that needs more support than the live tail');
});
