import test from 'node:test';
import assert from 'node:assert/strict';
import {getAnimalGeometry,getAnimalAimPoint,getAnimalAttachmentPoint,getAnimalFallPose,getAnimalGroundHeight,scoreAnimalPoint} from '../games/forest-archer/animal-zones.mjs';
import {GRAVITY,ANIMAL_HEALTH,applyAnimalHit,prepareStage,targetAt,launchArrow,stepArrow} from '../games/forest-archer/engine.mjs';

const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const kinds=['rabbit','wildcat','cheetah','deer','pigeon','eagle','bird'];
const expected={heart:[10,'심장 명중'],head:[8,'머리 명중'],body:[5,'몸통 명중'],leg:[3,'다리 명중'],ear:[3,'귀 명중']};
// Points on the released drawing: eyes/cheek, torso, visible ears and paws.
// These are normalized canvas coordinates, independent of the scoring model.
const anatomy={
  rabbit:{head:[.59,-.155*.84],body:[-.30,.084],ear:[.58,-.65*.84],leg:[.38,.49*.84],blank:[0,-.55]},
  wildcat:{head:[.675,-.235],body:[-.20,0],ear:[.45,-.47],leg:[-.345,.52],blank:[0,-.55]},
  cheetah:{head:[.765,-.235],body:[-.20,0],ear:[.56,-.41],leg:[.425,.52],blank:[0,.56]},
  deer:{head:[.85,-.69*.68],body:[-.20,.02*.68],ear:[.57,-1.03*.68],leg:[.4075,.98*.68],blank:[0,.65]},
  pigeon:{head:[.54,-.15],body:[-.20,.14],leg:[.21,.378],blank:[0,.65]},
  eagle:{head:[.77,-.09],body:[-.20,.15],blank:[0,.70]},
  bird:{head:[.49,.18-.16*.8],body:[-.20,.18+.06*.8],blank:[0,.65]}
};
const target=(kind,direction=1,radius=1,poseTime=0)=>({x:2,y:5,z:30,kind,direction,radius,poseTime,active:true});
const world=(subject,[x,y])=>({x:subject.x+x*subject.radius*(subject.direction<0?-1:1),y:subject.y-y*subject.radius,z:subject.z});

test('the visible chest marker and heart aim point score ten for every species, scale and direction',()=>{
  for(const kind of kinds)for(const direction of[-1,1])for(const radius of[.65,1.8])for(const time of[0,.3,2.1]){
    const subject=target(kind,direction,radius,time),before=structuredClone(subject),point=getAnimalAimPoint(subject);
    assert.ok(point);assert.equal(Math.sign(point.x-subject.x),direction);
    const hit=scoreAnimalPoint(point,subject);
    assert.deepEqual([hit.part,hit.score,hit.zone],['heart',10,'심장 명중']);
    const attached=getAnimalAttachmentPoint(subject,hit.animalAttachment);
    close(attached.x,point.x);close(attached.y,point.y);close(attached.z,point.z);
    assert.deepEqual(subject,before);
    const heart=getAnimalGeometry(kind,time).heart;
    close(point.x,subject.x+heart.x*radius*direction);close(point.y,subject.y-heart.y*radius);
  }
});

test('actual drawn head, torso, legs and ears have distinct scores while empty silhouette space misses',()=>{
  for(const kind of kinds)for(const direction of[-1,1])for(const radius of[.65,1.8]){
    const subject=target(kind,direction,radius);
    for(const[part,local]of Object.entries(anatomy[kind])){
      const point=world(subject,local),hit=scoreAnimalPoint(point,subject);
      if(part==='blank'){assert.equal(hit,null,`${kind}: empty space is not a broad elliptical hit`);continue;}
      assert.deepEqual([hit?.score,hit?.zone],expected[part],`${kind}: ${part}`);
      assert.equal(hit.part,part);assert.ok(hit.animalAttachment);
      const attached=getAnimalAttachmentPoint(subject,hit.animalAttachment);
      close(attached.x,point.x);close(attached.y,point.y);
    }
  }
});

test('wings and tails count as body and beaks count as head, with real bird clipping preserved',()=>{
  for(const[kind,local]of[['pigeon',[.42,-.34]],['pigeon',[-.85,.33]],['eagle',[.5,-.5]],['eagle',[-.8,.4]],['bird',[.5,-.3]]]){
    const subject=target(kind);
    assert.equal(scoreAnimalPoint(world(subject,local),subject)?.score,5,`${kind}: wings and tail`);
  }
  for(const[kind,local]of[['pigeon',[.72,-.04]],['eagle',[.98,.04]],['bird',[.72,.18-.07*.8]]]){
    const subject=target(kind);assert.equal(scoreAnimalPoint(world(subject,local),subject)?.score,8);
  }
  const eagle=target('eagle',1,1,Math.PI/(2*2.2));
  assert.equal(scoreAnimalPoint(world(eagle,[-1.30,-.55]),eagle),null,
    'a feather path outside its actual rendering clip cannot score');
});

function range(kind,directionSeed=19){return prepareStage({id:901,kind,distance:20,radius:1,height:5,
  motion:{amplitudeX:0,amplitudeY:0,speed:0,irregular:false},passDuration:20,wind:0,obstacles:[],passers:[]},directionSeed);}
function crossingShot(stage,local,dt=.005){
  const subject=targetAt(stage,dt),point=local==='heart'?getAnimalAimPoint(subject):world(subject,local);
  const shot=launchArrow({charge:1,velocityBias:0});
  // Isolate the real swept collision at a known incoming point. The engine
  // still integrates gravity and resolves the exact arrival time itself.
  shot.position={x:point.x,y:point.y+GRAVITY*dt*dt/2,z:stage.distance-.1};
  shot.velocity={x:0,y:0,z:.1/dt};shot.dragRate=0;shot.windFactor=0;
  return{shot,point,subject};
}

test('swept arrow collisions use painted anatomy and remain invariant across integration steps',()=>{
  for(const kind of kinds)for(const seed of[0,19])for(const[part,local]of[['heart','heart'],...Object.entries(anatomy[kind]).filter(([part])=>part!=='blank')]){
    const stage=range(kind,seed),a=crossingShot(stage,local),b=crossingShot(stage,local);
    const whole=stepArrow(a.shot,.02,stage,0);
    let split=null;for(let i=0;i<20&&b.shot.active;i++)split=stepArrow(b.shot,.001,stage,i*.001);
    assert.equal(whole?.type,'hit',`${kind} ${part}`);assert.equal(split?.type,'hit');
    assert.deepEqual([whole.score,whole.zone],expected[part],`${kind} ${part}`);
    assert.deepEqual([split.score,split.zone],[whole.score,whole.zone]);
    close(whole.point.x,a.point.x);close(whole.point.y,a.point.y);close(whole.flightTime,.005);
    close(split.point.x,whole.point.x);close(split.point.y,whole.point.y);
    close(whole.targetCenter.poseTime,.005);
    const attached=getAnimalAttachmentPoint(whole.targetCenter,whole.animalAttachment);
    close(attached.x,whole.point.x);close(attached.y,whole.point.y);
  }
});

test('visible ear outside the old hit ellipse can score, and a blank area inside it stays a miss',()=>{
  const stage=range('deer'),ear=crossingShot(stage,anatomy.deer.ear),relative=ear.point;
  assert.ok(Math.hypot((relative.x-ear.subject.x)/ear.subject.rx,(relative.y-ear.subject.y)/ear.subject.ry)>1);
  const hit=stepArrow(ear.shot,.02,stage,0);
  assert.equal(hit?.score,3);assert.equal(hit?.zone,'귀 명중');
  for(const kind of kinds){
    const stage=range(kind),blank=crossingShot(stage,anatomy[kind].blank);
    assert.ok(Math.hypot((blank.point.x-blank.subject.x)/blank.subject.rx,(blank.point.y-blank.subject.y)/blank.subject.ry)<1);
    const result=stepArrow(blank.shot,.02,stage,0);
    assert.equal(result,null);assert.equal(blank.shot.targetPassed,true);assert.equal(blank.shot.active,true);
  }
});

test('a paw attachment follows the actual animated paw and a mirrored ear attachment stays on the ear',()=>{
  for(const direction of[-1,1]){
    const subject=target('rabbit',direction,1.6),paw=scoreAnimalPoint(world(subject,anatomy.rabbit.leg),subject);
    const ear=scoreAnimalPoint(world(subject,anatomy.rabbit.ear),subject);
    const saved=structuredClone([paw.animalAttachment,ear.animalAttachment]);
    for(const time of[0,.2,.5,.9]){
      const current={...subject,x:subject.x+time*2,y:subject.y+.1,poseTime:time};
      const point=getAnimalAttachmentPoint(current,paw.animalAttachment);
      close(point.x,current.x+(.38+Math.sin(time*7.2)*.12)*current.radius*direction);
      close(point.y,current.y-.49*.84*current.radius);
      assert.equal(scoreAnimalPoint(point,current)?.part,'leg');
      const earPoint=getAnimalAttachmentPoint(current,ear.animalAttachment);
      assert.equal(scoreAnimalPoint(earPoint,current)?.part,'ear');
    }
    assert.deepEqual([paw.animalAttachment,ear.animalAttachment],saved);
  }
});

test('inactive or malformed animal queries do not turn unrelated targets into anatomical hits',()=>{
  assert.equal(getAnimalAimPoint({...target('rabbit'),kind:'target'}),null);
  assert.equal(scoreAnimalPoint({x:0,y:0},{...target('rabbit'),active:false}),null);
  assert.equal(scoreAnimalPoint({x:NaN,y:0},target('rabbit')),null);
  assert.equal(scoreAnimalPoint({x:0,y:0},{...target('rabbit'),radius:0}),null);
  assert.equal(getAnimalAttachmentPoint(target('rabbit'),{kind:'deer'}),null);
  assert.equal(getAnimalGeometry('clay'),null);
});

test('each species accumulates real hit scores up to its own health and stops accepting damage after death',()=>{
  assert.deepEqual(ANIMAL_HEALTH,{rabbit:5,wildcat:8,deer:10,pigeon:12,eagle:15,cheetah:18,bird:12});
  for(const kind of kinds){
    const stage=range(kind),maximum=ANIMAL_HEALTH[kind];let total=0,hits=0,lastAlive;
    while(total<maximum){
      const time=1+hits*.1,subject=targetAt(stage,time);lastAlive=subject;
      const result=applyAnimalHit(stage,subject,3,time);total+=3;hits++;
      assert.equal(result.applied,true);assert.equal(result.damage,total);
      assert.equal(result.health,Math.max(0,maximum-total));assert.equal(result.maxHealth,maximum);
      assert.equal(result.killed,total>=maximum);assert.equal(result.justKilled,total>=maximum);
      const after=targetAt(stage,time);assert.equal(after.damage,total);assert.equal(after.health,Math.max(0,maximum-total));
      assert.equal(after.dead,total>=maximum);assert.equal(after.active,true,'a corpse remains visible');
    }
    const saved=structuredClone(stage.animalState),again=applyAnimalHit(stage,lastAlive,10,3);
    assert.equal(again.applied,false);assert.equal(again.justKilled,false);assert.equal(again.damage,total);
    assert.deepEqual(stage.animalState,saved,'even an old alive snapshot cannot damage a dead pass again');
    const fresh=prepareStage(stage,19);
    assert.deepEqual(fresh.animalState,{});assert.equal(targetAt(fresh,1).health,maximum);
    assert.deepEqual(stage.animalState,saved,'starting a fresh round leaves the old round untouched');
  }
});

test('death keeps its horizontal impact spot and frozen pose while falling until the original next pass',()=>{
  const stage=range('deer'),clean=range('deer');
  applyAnimalHit(stage,targetAt(stage,1),3,1);
  const impact=targetAt(stage,2);assert.equal(impact.health,7);
  const killed=applyAnimalHit(stage,impact,8,2);assert.equal(killed.justKilled,true);
  for(const time of[2,2.1,10,19.999]){
    const corpse=targetAt(stage,time);
    for(const key of['x','z','direction','passId','poseTime'])assert.equal(corpse[key],impact[key]);
    assert.ok(corpse.y<=impact.y);
    if(time===2)assert.equal(corpse.y,impact.y);
    else if(time<2.5)close(corpse.y,impact.y-GRAVITY*(time-2)**2/2);
    else close(corpse.y,getAnimalGroundHeight(corpse));
    assert.equal(corpse.velocityX,0);assert.equal(corpse.dead,true);assert.equal(corpse.active,true);
    assert.equal(corpse.health,0);assert.equal(corpse.deathTime,2);close(corpse.deathAge,time-2);
    assert.equal(getAnimalAimPoint(corpse),null);
    assert.equal(scoreAnimalPoint({x:corpse.x,y:corpse.y},corpse),null);
  }
  const before=targetAt(stage,.9),wounded=targetAt(stage,1.5);
  assert.equal(before.dead,false);assert.equal(before.health,10);
  assert.equal(wounded.dead,false);assert.equal(wounded.health,7,'past-time samples retain the damage already applied at that moment');
  const nextTime=20.00001,next=targetAt(stage,nextTime);
  assert.equal(next.passId,1);assert.equal(next.dead,false);assert.equal(next.health,10);
  assert.deepEqual(next,targetAt(clean,nextTime),'death does not move the next spawn schedule or path');
  const old=targetAt(stage,nextTime,impact.passId);
  assert.equal(old.dead,true);assert.equal(old.x,impact.x);close(old.y,getAnimalGroundHeight(old));assert.equal(old.poseTime,2);
});

test('a projectile cannot score against a corpse even though the corpse remains visible',()=>{
  const stage=range('rabbit'),shot=crossingShot(stage,'heart');
  applyAnimalHit(stage,shot.subject,5,.005);
  const corpse=targetAt(stage,.005);assert.equal(corpse.active,true);assert.equal(corpse.dead,true);
  assert.equal(stepArrow(shot.shot,.02,stage,0),null);
  assert.equal(shot.shot.targetPassed,true);assert.equal(shot.shot.active,true);
  const result=stepArrow(shot.shot,8,stage,.02);
  assert.notEqual(result.type,'hit');assert.equal(result.score,0);
});

test('the fall and attached arrows share one transform with no impact jump or continuing limb animation',()=>{
  for(const kind of kinds)for(const seed of[0,19]){
    const stage=range(kind,seed);let time=1;
    while(targetAt(stage,time).health>10){applyAnimalHit(stage,targetAt(stage,time),3,time);time+=.05;}
    const impact=targetAt(stage,2),point=getAnimalAimPoint(impact),hit=scoreAnimalPoint(point,impact);
    applyAnimalHit(stage,impact,10,2);
    const same=getAnimalAttachmentPoint(targetAt(stage,2),hit.animalAttachment);
    close(same.x,point.x);close(same.y,point.y);
    for(const age of[0,.175,.35,2]){
      const corpse=targetAt(stage,2+age),pose=getAnimalFallPose(corpse);
      const localX=(point.x-impact.x)/impact.radius*(impact.direction<0?-1:1),localY=(impact.y-point.y)/impact.radius;
      const x=Math.cos(pose.rotation)*localX-Math.sin(pose.rotation)*localY*pose.scaleY;
      const y=Math.sin(pose.rotation)*localX+Math.cos(pose.rotation)*localY*pose.scaleY;
      const attached=getAnimalAttachmentPoint(corpse,hit.animalAttachment);
      close(attached.x,impact.x+x*impact.radius*(impact.direction<0?-1:1));close(attached.y,corpse.y-y*impact.radius);
      assert.equal(corpse.x,impact.x);assert.ok(corpse.y<=impact.y);assert.equal(corpse.poseTime,2);
    }
  }
  const stage=range('rabbit'),initial=targetAt(stage,0);
  const paw=scoreAnimalPoint(world(initial,anatomy.rabbit.leg),initial);
  const impact=targetAt(stage,2);applyAnimalHit(stage,impact,5,2);
  const settled=getAnimalAttachmentPoint(targetAt(stage,3),paw.animalAttachment);
  assert.deepEqual(getAnimalAttachmentPoint(targetAt(stage,4),paw.animalAttachment),settled,
    'a dead paw does not keep walking after the fall settles');
  assert.deepEqual(getAnimalAttachmentPoint(targetAt(stage,4),paw.animalAttachment,4),settled,
    'an explicit render clock cannot restart the frozen limb animation');
});

test('airborne bodies and attached arrows descend under gravity and rest on their painted silhouette',()=>{
  for(const kind of kinds){
    const stage=range(kind);let time=1;
    while(targetAt(stage,time).health>10){applyAnimalHit(stage,targetAt(stage,time),3,time);time+=.05;}
    const impact=targetAt(stage,2),point=getAnimalAimPoint(impact),hit=scoreAnimalPoint(point,impact);
    applyAnimalHit(stage,impact,10,2);
    const falling=targetAt(stage,2.2),settled=targetAt(stage,4),later=targetAt(stage,5);
    close(falling.y,impact.y-GRAVITY*.2**2/2);
    assert.ok(settled.y<falling.y);close(settled.y,getAnimalGroundHeight(settled));
    assert.equal(settled.y,later.y);assert.equal(settled.x,impact.x);assert.equal(settled.z,impact.z);
    assert.equal(settled.poseTime,impact.poseTime);
    const attached=getAnimalAttachmentPoint(settled,hit.animalAttachment);
    assert.ok(attached.y<point.y);assert.ok(attached.y>=0,'the lodged heart arrow rests above the floor with its body');
    assert.deepEqual(attached,getAnimalAttachmentPoint(later,hit.animalAttachment));
    const geometry=getAnimalGeometry(kind,impact.poseTime),pose=getAnimalFallPose(settled);
    const minY=Math.min(...geometry.groundHull.map(p=>settled.y-(Math.sin(pose.rotation)*p.x+Math.cos(pose.rotation)*p.y*pose.scaleY)*settled.radius));
    assert.ok(minY>=0&&minY<.01*settled.radius,'a visible body edge contacts the ground instead of hovering');
  }
});

test('damage stays in prepared animal rounds and rejects invalid hits without altering the catalog',()=>{
  const prepared=range('rabbit'),plain={...prepared};delete plain.animalState;
  const subject=targetAt(plain,1);
  assert.equal(applyAnimalHit(plain,subject,3,1).applied,false);assert.equal(plain.animalState,undefined);
  for(const score of[0,-3,2,NaN,Infinity])assert.equal(applyAnimalHit(prepared,targetAt(prepared,1),score,1).applied,false);
  assert.deepEqual(prepared.animalState,{});
  assert.equal(applyAnimalHit(prepared,{...targetAt(prepared,1),kind:'deer'},3,1).applied,false);
  assert.deepEqual(prepared.animalState,{});
});
