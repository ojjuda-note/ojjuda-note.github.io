import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER,GRAVITY,WIND_RESPONSE,STAGES,BOWS,ARROWS,prepareStage,targetAt,getAnimalAimPoint,launchArrow,stepArrow} from '../games/forest-archer/engine.mjs';

const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const seeds=[0,5,19,0xfffffffe],step=.005;

// Independently solve the exact linear-drag interception. The final check uses
// the actual swept collision, so a mathematical lead outside the visible pass
// cannot masquerade as a playable opportunity.
function heartAim(stage,time,loadout){
  const passId=targetAt(stage,time).passId;
  const params={bow:BOWS[loadout.bow],arrow:ARROWS[loadout.arrow],charge:1,velocityBias:0,yaw:0,pitch:.15};
  const error=input=>{
    const shot=launchArrow(input),v=shot.velocity,k=shot.dragRate,ratio=k*stage.distance/v.z;
    if(v.z<=0||ratio>=1)return null;
    const flight=k>1e-8?-Math.log1p(-ratio)/k:stage.distance/v.z;
    const velocityTime=k>1e-8?-Math.expm1(-k*flight)/k:flight;
    const accelerationTime=k>1e-8?(flight-velocityTime)/k:flight*flight/2;
    const aim=getAnimalAimPoint(targetAt(stage,time+flight,passId));
    return{x:v.x*velocityTime+stage.wind*WIND_RESPONSE*shot.windFactor*accelerationTime-aim.x,
      y:PLAYER.y+v.y*velocityTime-GRAVITY*accelerationTime-aim.y};
  };
  for(let iteration=0;iteration<24;iteration++){
    const e=error(params);if(!e)return null;
    if(Math.hypot(e.x,e.y)<1e-7)return params;
    const h=1e-5,yaw=error({...params,yaw:params.yaw+h}),pitch=error({...params,pitch:params.pitch+h});
    if(!yaw||!pitch)return null;
    const xx=(yaw.x-e.x)/h,xy=(pitch.x-e.x)/h,yx=(yaw.y-e.y)/h,yy=(pitch.y-e.y)/h,det=xx*yy-xy*yx;
    if(Math.abs(det)<1e-8)return null;
    const limit=value=>Math.max(-.15,Math.min(.15,value));
    params.yaw-=limit((yy*e.x-xy*e.y)/det);params.pitch-=limit((xx*e.y-yx*e.x)/det);
    if(Math.abs(params.yaw)>.7||params.pitch<-.5||params.pitch>1)return null;
  }
  return null;
}

// Check that a phone camera can frame both the current body and the real lead
// point while the reticle stays in the existing aiming area. This permits pan,
// but rejects a mathematically reachable shot that needs its subject offscreen.
function canFrameBodyAndLead(stage,animal,params,zoom){
  const width=390,height=410,focal=Math.min(width*1.08,height*1.5)*zoom,scale=focal/stage.distance;
  const leadX=Math.tan(params.yaw)*stage.distance,leadY=PLAYER.y+Math.tan(params.pitch)/Math.cos(params.yaw)*stage.distance;
  const left=Math.min(42,width*.12),right=width-left,top=Math.min(58,height*.2),bottom=height*2/3-Math.min(14,height*.06);
  const minX=Math.max(-(animal.x-animal.rx)*scale,left-leadX*scale),maxX=Math.min(width-(animal.x+animal.rx)*scale,right-leadX*scale);
  const minY=Math.max((animal.y+animal.ry-PLAYER.y)*scale,top+(leadY-PLAYER.y)*scale);
  const maxY=Math.min(height+(animal.y-animal.ry-PLAYER.y)*scale,bottom+(leadY-PLAYER.y)*scale);
  return minX<=maxX&&minY<=maxY;
}

function visibleHeartHit(stage,time,loadout,zoom=1){
  const now=targetAt(stage,time);
  if(Math.abs(now.x)+now.rx>=stage.distance*.43)return false;
  const params=heartAim(stage,time,loadout);
  if(!params||Math.abs(params.yaw)>.38||params.pitch<-.15||params.pitch>.55)return false;
  if(zoom>1&&!canFrameBodyAndLead(stage,now,params,zoom))return false;
  const result=stepArrow(launchArrow(params),8,stage,time);
  return result?.type==='hit'&&result.score===10&&result.targetCenter.passId===now.passId;
}

function longestWindow(stage,loadout,{zoom=1,interval=step}={}){
  const duration=targetAt(stage,0).passDuration;
  let start=null,longest=0,hits=0;
  // A fully drawn bow can be held before the animal enters; require an actual
  // visible body and a normal aim at every release throughout the whole window.
  for(let index=Math.ceil(2.58/interval);index*interval<duration*2;index++){
    const time=index*interval;
    if(visibleHeartHit(stage,time,loadout,zoom)){start??=time;hits++;longest=Math.max(longest,time-start);}
    else start=null;
  }
  return{longest,hits};
}

for(const template of STAGES.filter(stage=>stage.kind==='eagle'))test(`eagle stage ${template.id} leaves at least one visible second to lead the same animal at 2x`,t=>{
  let minimum=Infinity;
  for(const seed of seeds)for(const loadout of template.referenceLoadouts){
    const stage=prepareStage(template,seed),window=longestWindow(stage,loadout,{zoom:2,interval:.01});
    assert.ok(window.longest>=1,`${template.id}, seed ${seed}, ${loadout.family}: only ${window.longest.toFixed(3)} seconds with the eagle and lead point in view`);
    minimum=Math.min(minimum,window.longest);
  }
  t.diagnostic(`Shortest continuous visible same-pass release window at 2x: ${minimum.toFixed(3)} seconds`);
});

for(const id of[72])test(`fast animal stage ${id} keeps at least 0.32 seconds to lead a visible animal`,t=>{
  let minimum=Infinity;
  for(const seed of seeds)for(const loadout of STAGES[id-1].referenceLoadouts){
    const stage=prepareStage(STAGES[id-1],seed),window=longestWindow(stage,loadout);
    assert.ok(window.longest>=.32,`${id}, seed ${seed}, ${loadout.family}: only ${window.longest.toFixed(3)} seconds`);
    minimum=Math.min(minimum,window.longest);
  }
  t.diagnostic(`Shortest continuous visible release window: ${minimum.toFixed(3)} seconds`);
});

test('stage 72 remains reachable with the starter bow and arrow in its difficult seed',()=>{
  const stage=prepareStage(STAGES[71],0);
  assert.ok(longestWindow(stage,{bow:0,arrow:0}).hits>0,
    'the introductory equipment can lead the actual visible cheetah without shooting at a future offscreen pass');
});

test('local approach easing preserves adjusted crossing times, vertical paths and average species speed',()=>{
  const durations={68:4.45/1.03/1.15*2,72:4.6/1.03/1.15,196:4.45/1.03/1.15*1.2*2};
  for(const id of[68,72,196])for(const seed of seeds){
    const stage=prepareStage(STAGES[id-1],seed),previous={...stage,approachEase:.15};
    close(stage.passDuration,durations[id]);
    const duration=stage.passDuration,start=targetAt(stage,0);
    for(const time of[0,duration])close(targetAt(stage,time,0).x,targetAt(previous,time,0).x);
    let oldMean=0,newMean=0,last=start;
    for(let sample=0;sample<240;sample++){
      const time=duration*(sample+.5)/240,now=targetAt(stage,time),before=targetAt(previous,time),h=1e-5;
      close(now.y,before.y);assert.equal(now.passId,before.passId);assert.equal(now.direction,before.direction);
      assert.ok((now.x-last.x)*now.direction>0,'the animal never reverses or jumps within a pass');last=now;
      close(now.velocityX,(targetAt(stage,time+h).x-targetAt(stage,time-h).x)/(2*h),1e-6);
      oldMean+=Math.abs(before.velocityX)/before.rx;newMean+=Math.abs(now.velocityX)/now.rx;
    }
    close(oldMean/240,newMean/240);
  }
});
