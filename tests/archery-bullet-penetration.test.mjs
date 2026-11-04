import test from 'node:test';
import assert from 'node:assert/strict';
import {BOWS, BULLETS, PLAYER, GRAVITY, WIND_RESPONSE, launchArrow, stepArrow, predictTrajectory} from '../games/forest-archer/engine.mjs';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const pointNear=(actual,expected)=>{for(const axis of ['x','y','z'])near(actual[axis],expected[axis]);};
const plain={id:1,kind:'target',distance:150,height:80,radius:1000,motion:{},wind:0,obstacles:[],passers:[]};
const wall=(front,material='wood',depth=.65)=>({x:0,y:0,z:front+depth/2,width:100,height:200,depth,
  type:material==='wood'?'timber':'stone',material});
const makeShot=(params={})=>{
  const shot=launchArrow({bow:20,bullet:0,pitch:.04,yaw:.02,...params});
  shot.position={x:0,y:80,z:0};shot.trail=[{...shot.position}];return shot;
};
const stateOf=shot=>({position:{...shot.position},velocity:{...shot.velocity},elapsed:shot.elapsed,
  dragRate:shot.dragRate,gravityScale:shot.gravityScale,windFactor:shot.windFactor});

// Independent exponential solution, split only at known wide wall front planes.
// It neither calls collision routines nor reads penetration state from the engine.
function cross(state,z,wind=0){
  const k=state.dragRate<1e-8?0:state.dragRate,distance=z-state.position.z;
  const time=k?-Math.log1p(-k*distance/state.velocity.z)/k:distance/state.velocity.z;
  assert.ok(Number.isFinite(time)&&time>=0);
  const decay=Math.exp(-k*time),u=k?-Math.expm1(-k*time)/k:time;
  const a=k?(time-u)/k:time*time/2;
  const acceleration={x:wind*WIND_RESPONSE*state.windFactor,y:-GRAVITY*state.gravityScale,z:0};
  const position={},velocity={};
  for(const axis of ['x','y','z']){
    position[axis]=state.position[axis]+state.velocity[axis]*u+acceleration[axis]*a;
    velocity[axis]=state.velocity[axis]*decay+acceleration[axis]*u;
  }
  return {...state,position,velocity,elapsed:state.elapsed+time};
}
function expectedFlight(initial,materials,wind=0,distance=150){
  let state=stateOf(initial),speedRatio=1,dropRatio=1;const entries=[];
  for(const [index,material] of materials.entries()){
    state=cross(state,25+index*45,wind);
    const before=stateOf(state),r=material==='wood'?.8:.5,d=material==='wood'?1.2:1.5;
    state.velocity=Object.fromEntries(Object.entries(state.velocity).map(([key,value])=>[key,value*r]));
    state.dragRate*=r;state.gravityScale*=r*r*d;speedRatio*=r;dropRatio*=d;
    entries.push({before,after:stateOf(state),speedRatio,dropRatio});
  }
  return {...cross(state,distance,wind),entries,speedRatio,dropRatio};
}
function finish(shot,stage,dt=16,worldStart=0){
  let steps=0;
  while(shot.active&&steps++<20000)stepArrow(shot,dt,stage,worldStart+shot.elapsed);
  assert.equal(shot.active,false,'the shot resolves within its normal flight budget');
  return shot.result;
}

test('all three guns and four bullets apply the exact wood, stone and cumulative losses at real wall entries',()=>{
  const beforeStage=JSON.stringify(plain);
  for(const bow of BOWS.filter(item=>item.weaponType==='gun'))for(const bullet of BULLETS)
    for(const materials of [['wood'],['stone'],['wood','wood'],['stone','stone'],['wood','stone'],['stone','wood']]){
      const shot=makeShot({bow,bullet}),nominal=shot.speed,wind=1.1;
      const expected=expectedFlight(shot,materials,wind),stage={...plain,wind,obstacles:materials.map((m,i)=>wall(25+i*45,m))};
      const source=JSON.stringify(stage),result=finish(shot,stage,16,12.5);
      assert.equal(result.type,'hit');assert.equal(shot.penetrations.length,materials.length);
      pointNear(result.point,expected.position);pointNear(shot.velocity,expected.velocity);near(shot.elapsed,expected.elapsed);
      near(shot.penetrationSpeedRatio,expected.speedRatio);near(shot.penetrationDropRatio,expected.dropRatio);
      assert.equal(shot.speed,nominal,'the launch-speed field remains nominal; the actual velocity loses energy');
      for(const [index,entry] of shot.penetrations.entries()){
        const reference=expected.entries[index];
        assert.equal(entry.obstacleIndex,index);assert.equal(entry.material,materials[index]);
        pointNear(entry.point,reference.before.position);pointNear(entry.velocityBefore,reference.before.velocity);pointNear(entry.velocityAfter,reference.after.velocity);
        near(entry.elapsed,reference.before.elapsed);near(entry.time,12.5+reference.before.elapsed);
        near(entry.speedRatio,reference.speedRatio);near(entry.dropRatio,reference.dropRatio);
        assert.ok([entry,entry.point,entry.velocityBefore,entry.velocityAfter].every(Object.isFrozen),'recorded wall events cannot be changed by rendering or forecasts');
      }
      assert.equal(JSON.stringify(stage),source);
    }
  assert.equal(JSON.stringify(plain),beforeStage);
});

test('slower wall exits increase same-distance drop by exactly 20 or 50 percent from the incoming tangent',()=>{
  for(const bullet of [0,1,2])for(const [material,ratio] of [['wood',1.2],['stone',1.5]]){
    const shot=makeShot({bullet}),initial=stateOf(shot),stage={...plain,obstacles:[wall(25,material)]};
    const result=finish(shot,stage),entry=shot.penetrations[0];
    const continued=cross({...initial,position:{...entry.point},velocity:{...entry.velocityBefore},elapsed:entry.elapsed},stage.distance);
    const tangentY=entry.point.y+entry.velocityBefore.y/entry.velocityBefore.z*(stage.distance-entry.point.z);
    const normalDrop=tangentY-continued.position.y,actualDrop=tangentY-result.point.y;
    assert.ok(normalDrop>0);near(actualDrop/normalDrop,ratio);
  }
});

test('two walls compound to the specified speed and downstream drop factors regardless of material order',()=>{
  for(const [materials,speedRatio,dropRatio] of [
    [['wood','wood'],.64,1.44],[['stone','stone'],.25,2.25],
    [['wood','stone'],.40,1.80],[['stone','wood'],.40,1.80]
  ]){
    const shot=makeShot(),initial=stateOf(shot);
    const result=finish(shot,{...plain,obstacles:materials.map((m,i)=>wall(25+i*45,m))});
    near(shot.penetrationSpeedRatio,speedRatio);near(shot.penetrationDropRatio,dropRatio);
    const last=shot.penetrations.at(-1);
    // Restore only the penalties at the last entry, holding that actual tangent
    // fixed. This measures subsequent drop, not unmodified travel before walls.
    const counterfactual={...initial,position:{...last.point},elapsed:last.elapsed,
      velocity:Object.fromEntries(Object.entries(last.velocityAfter).map(([key,value])=>[key,value/speedRatio]))};
    const noPenalty=cross(counterfactual,150),tangentY=last.point.y+last.velocityAfter.y/last.velocityAfter.z*(150-last.point.z);
    near((tangentY-result.point.y)/(tangentY-noPenalty.position.y),dropRatio);
  }
});

test('wall losses are independent of frame size and never repeat inside a thick wall or at its rear face',()=>{
  const stage={...plain,wind:-1.7,obstacles:[wall(25,'wood',12),wall(70,'stone',9)]};
  const reference=makeShot();finish(reference,stage,16,5);
  for(const dt of [1/240,1/60,1/30,.25,.47,1.1]){
    const shot=makeShot();finish(shot,stage,dt,5);
    assert.equal(shot.penetrations.length,2);assert.deepEqual(shot.penetrations.map(e=>e.obstacleIndex),[0,1]);
    pointNear(shot.result.point,reference.result.point);pointNear(shot.velocity,reference.velocity);near(shot.elapsed,reference.elapsed);
    for(let i=0;i<2;i++){
      pointNear(shot.penetrations[i].point,reference.penetrations[i].point);
      near(shot.penetrations[i].time,reference.penetrations[i].time);
    }
  }
  const shot=makeShot(),entryTime=cross(stateOf(shot),25).elapsed;
  stepArrow(shot,entryTime,stage,3);assert.equal(shot.penetrations.length,1);near(shot.position.z,25);
  for(let i=0;i<30;i++){
    stepArrow(shot,.001,stage,3+shot.elapsed);assert.equal(shot.penetrations.length,1);
  }
  assert.ok(shot.position.z<37,'these repeated frames are still inside the same wooden wall');
  finish(shot,stage,.01,3);assert.equal(shot.penetrations.length,2);near(shot.penetrationSpeedRatio,.4);
});

test('overlapping and touching walls each apply once, including at an exact interval-end target plane',()=>{
  for(const obstacles of [[wall(10,'wood',4),wall(10,'stone',4)],[wall(10,'wood',2),wall(12,'stone',2)]]){
    const stage={...plain,distance:30,height:PLAYER.y,radius:.61,obstacles};
    const reference=launchArrow({bow:22,bullet:3});finish(reference,stage);
    assert.equal(reference.result.score,10);assert.equal(reference.penetrations.length,2);
    near(reference.penetrationSpeedRatio,.4);near(reference.penetrationDropRatio,1.8);
    for(const dt of [1/240,.25,1]){
      const shot=launchArrow({bow:22,bullet:3});finish(shot,stage,dt);
      assert.equal(shot.penetrations.length,2);near(shot.elapsed,reference.elapsed);pointNear(shot.result.point,reference.result.point);
    }
  }
  const shot=launchArrow({bow:22,bullet:3}),atTarget=cross(stateOf(shot),10).elapsed;
  const stage={...plain,distance:10,height:PLAYER.y,radius:.61,obstacles:[wall(10,'wood'),wall(10,'stone')]};
  const result=stepArrow(shot,atTarget,stage,0);
  assert.equal(result?.type,'hit');assert.equal(result.score,10);assert.equal(shot.targetPassed,true);
  assert.equal(shot.penetrations.length,2);near(shot.penetrations[0].time,shot.penetrations[1].time);
  near(shot.elapsed,atTarget);pointNear(result.point,{x:0,y:PLAYER.y,z:10});
});

test('wooden pillars and explicit materials use the right loss with legacy timber and stone fallbacks',()=>{
  for(const [attributes,material,ratio] of [
    [{type:'pillar',material:'wood'},'wood',.8],
    [{type:'timber',material:'stone'},'stone',.5],
    [{type:'timber',material:undefined},'wood',.8],
    [{type:'pillar',material:undefined},'stone',.5],
    [{type:undefined,material:undefined},'stone',.5]
  ]){
    const shot=makeShot(),obstacle={...wall(25),...attributes};finish(shot,{...plain,obstacles:[obstacle]});
    assert.equal(shot.penetrations[0].material,material);near(shot.penetrationSpeedRatio,ratio);
  }
});

test('people keep priority at a shared entry plane and remain collidable inside or behind a penetrated wall',()=>{
  const params={bow:22,bullet:3},obstacle=wall(10,'wood',5);
  for(const front of [10,11,16]){
    const person={id:7,x:0,z:front+.05,width:100,height:200,depth:.1,passDuration:20,phase:.5};
    const stage={...plain,distance:30,height:PLAYER.y,radius:.61,obstacles:[obstacle],passers:[person]};
    const reference=launchArrow(params),result=finish(reference,stage);
    assert.equal(result.type,'person');assert.equal(result.personId,7);near(result.point.z,front);
    assert.equal(reference.penetrations.length,front===10?0:1);
    for(const dt of [1/240,.25]){
      const shot=launchArrow(params);finish(shot,stage,dt);
      assert.equal(shot.result.type,'person');assert.equal(shot.penetrations.length,reference.penetrations.length);
      near(shot.elapsed,reference.elapsed);pointNear(shot.result.point,result.point);
    }
  }
});

test('targets and ground inside a wall still stop the bullet at their exact collisions',()=>{
  const stage={...plain,distance:11,height:PLAYER.y,radius:.61,obstacles:[wall(10,'stone',5)]};
  const shot=launchArrow({bow:22,bullet:3}),result=finish(shot,stage);
  assert.equal(result.type,'hit');assert.equal(result.score,10);near(result.point.z,11);assert.equal(shot.penetrations.length,1);
  const falling=launchArrow({bow:20,bullet:0,pitch:-.15});
  const ground=finish(falling,{...plain,height:100,radius:.1,obstacles:[wall(1,'wood',30)]});
  assert.equal(ground.type,'ground');near(ground.point.y,0);assert.ok(ground.point.z>1&&ground.point.z<31);
  assert.equal(falling.penetrations.length,1);
});

test('a missed target plane before a later wall remains consumed after penetration',()=>{
  const shot=launchArrow({bow:20,bullet:0,pitch:.12});
  const stage={...plain,distance:5,height:100,radius:.1,obstacles:[wall(10,'wood')]};
  stepArrow(shot,.2,stage,0);
  assert.equal(shot.targetPassed,true);assert.equal(shot.penetrations.length,1);
  const result=finish(shot,stage);assert.notEqual(result.type,'hit');
});

test('zero-drop bullets retain their straight ray and wind immunity after cumulative penetration',()=>{
  for(const wind of [-12,12]){
    const params={bow:22,bullet:3,yaw:.04,pitch:.08},shot=launchArrow(params);
    const ray=z=>({x:Math.tan(params.yaw)*z,y:PLAYER.y+Math.tan(params.pitch)/Math.cos(params.yaw)*z,z});
    const expected=ray(150),stage={...plain,height:expected.y,targetX:expected.x,radius:.61,wind,obstacles:[wall(25,'wood'),wall(70,'stone')]};
    const result=finish(shot,stage);assert.equal(result.score,10);pointNear(result.point,expected);
    assert.equal(shot.gravityScale,0);assert.equal(shot.windFactor,0);near(shot.penetrationSpeedRatio,.4);
    const predicted=predictTrajectory(params,stage,8);assert.equal(predicted.result.score,10);near(predicted.result.flightTime,result.flightTime);
    assert.ok(predicted.points.some(p=>Math.abs(p.z-25)<1e-8));assert.ok(predicted.points.some(p=>Math.abs(p.z-70)<1e-8));
    for(const point of predicted.points)pointNear(point,ray(point.z));
  }
});

test('clear paths and gaps have no penalties and bows, crossbows and special arrows still stop at walls',()=>{
  const noWall=makeShot(),clear=makeShot();
  finish(noWall,plain);finish(clear,{...plain,obstacles:[{...wall(25),x:500},{...wall(70),y:110,height:10}]});
  assert.deepEqual(clear,noWall,'untouched bullet ballistics and records remain exact');
  for(const bow of [0,10,19])for(const arrow of [0,12,13,18]){
    const shot=launchArrow({bow,arrow,pitch:.2}),result=finish(shot,{...plain,obstacles:[wall(1,'wood')]});
    assert.equal(result.type,'obstacle');near(result.point.z,1);assert.equal(shot.penetrations,undefined);
  }
});

test('forecasts are deterministic and cannot consume walls, mutate stage objects or affect a later real shot',()=>{
  const params={bow:22,bullet:1,pitch:.05},stage={...plain,height:3,radius:1000,obstacles:[wall(25,'wood'),wall(70,'stone')]};
  const before=JSON.stringify(stage),first=predictTrajectory(params,stage,3),second=predictTrajectory(params,stage,3);
  assert.deepEqual(first,second);assert.equal(JSON.stringify(stage),before);
  const shot=launchArrow(params),result=finish(shot,stage,.25,3);
  assert.equal(shot.penetrations.length,2);assert.equal(result.type,first.result.type);
  pointNear(result.point,first.result.point);near(result.flightTime,first.result.flightTime);
  for(const dt of [0,-1,NaN,Infinity])assert.equal(stepArrow(launchArrow(params),dt,stage),null);
});
