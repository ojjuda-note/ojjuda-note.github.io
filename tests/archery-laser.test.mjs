import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER,launchArrow,stepArrow} from '../games/forest-archer/engine.mjs';
import {projectPoint} from '../games/forest-archer/view.mjs';
import {LASER_PRICE,LASER_CLICK_DEGREES,LASER_MAX_CLICKS,normalizeLaserSettings,projectLaserPoint,traceLaserPoint} from '../games/forest-archer/laser.mjs';

const near = (actual,expected,epsilon=1e-10) => assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);
const radians = clicks => clicks * LASER_CLICK_DEGREES * Math.PI / 180;

test('laser settings keep only manual zeroing and clamp clicks to the supported range', () => {
  assert.equal(LASER_PRICE,500);assert.equal(LASER_CLICK_DEGREES,.05);assert.equal(LASER_MAX_CLICKS,1200);
  assert.deepEqual(normalizeLaserSettings(),{enabled:true,horizontalClicks:0,verticalClicks:0});
  assert.deepEqual(normalizeLaserSettings({enabled:false,horizontalClicks:1201,verticalClicks:-12345,autoFire:true,targetPoint:{x:0}}),
    {enabled:false,horizontalClicks:1200,verticalClicks:-1200});
  assert.deepEqual(normalizeLaserSettings({horizontalClicks:3.6,verticalClicks:-2.4}),{enabled:true,horizontalClicks:4,verticalClicks:-2});
  for (const value of [null,[],false,0,'settings']) assert.deepEqual(normalizeLaserSettings(value),normalizeLaserSettings());
  assert.deepEqual(normalizeLaserSettings({horizontalClicks:NaN,verticalClicks:Infinity}),normalizeLaserSettings());
});

test('launch correction numbers offset the sight oppositely while the physical aim stays fixed', () => {
  const neutral=projectLaserPoint({yaw:0,pitch:0,distance:30});
  assert.deepEqual(neutral,{x:0,y:PLAYER.y,z:30});
  for (const sign of [-1,1]) {
    const settings=Object.freeze({horizontalClicks:sign*100,verticalClicks:sign*50});
    const point=projectLaserPoint({yaw:.03,pitch:-.01,distance:30,settings});
    near(point.x,Math.tan(.03-radians(sign*100))*30);
    near(point.y,PLAYER.y+Math.tan(-.01-radians(sign*50))/Math.cos(.03-radians(sign*100))*30);
    assert.equal(Math.sign(point.x-projectLaserPoint({yaw:.03,pitch:-.01,distance:30}).x),-sign);
    assert.equal(Math.sign(point.y-projectLaserPoint({yaw:.03,pitch:-.01,distance:30}).y),-sign);
  }
});

test('the sight rejects malformed inputs, a rear-facing ray and a plane behind its origin', () => {
  const valid={yaw:0,pitch:0,distance:30};
  for (const change of [{yaw:NaN},{pitch:Infinity},{distance:NaN},{distance:0},{distance:-5},
    {yaw:Math.PI},{pitch:Math.PI},{yaw:Math.PI/2},{pitch:-Math.PI/2},
    {origin:{x:0,y:Infinity,z:0}},{origin:{x:0,y:1,z:31}}]) assert.equal(projectLaserPoint({...valid,...change}),null);
  assert.equal(traceLaserPoint({yaw:NaN,pitch:0,distance:30}),null);
});

test('the dot stops at the nearest front, side or top box intersection instead of passing through a wall or person', () => {
  const wall={x:0,z:12,width:8,height:4,depth:2},person={x:0,y:0,z:6,width:.8,height:2,depth:.4};
  const ray={yaw:0,pitch:0,distance:30};
  const blocked=traceLaserPoint({...ray,obstacles:[wall],people:[person]});
  assert.equal(blocked.blocked,true);assert.equal(blocked.blockedBy,'person');near(blocked.point.z,5.8);
  assert.deepEqual(blocked.targetPoint,{x:0,y:PLAYER.y,z:30});
  const wallOnly=traceLaserPoint({...ray,obstacles:[wall],people:[{...person,x:10}]});
  assert.equal(wallOnly.blockedBy,'obstacle');near(wallOnly.point.z,11);
  const side=traceLaserPoint({yaw:Math.atan(.1),pitch:0,distance:30,obstacles:[{x:2,z:12,width:2,height:3,depth:10}]});
  near(side.point.x,1);near(side.point.z,10);
  const top=traceLaserPoint({yaw:0,pitch:Math.atan(-.2),distance:30,obstacles:[{x:0,z:6,width:2,height:.65,depth:4}]});
  near(top.point.y,.65);near(top.point.z,5);
});

test('boxes behind the player or target and rays passing above or beside them do not block the dot', () => {
  const ray={yaw:0,pitch:0,distance:30};
  for (const box of [{x:0,z:-5,width:3,height:4,depth:1},{x:0,z:35,width:3,height:4,depth:1},
    {x:3,z:5,width:1,height:4,depth:1},{x:0,z:5,width:3,height:1,depth:1},
    {x:0,y:3,z:5,width:3,height:1,depth:1}]) {
    const result=traceLaserPoint({...ray,obstacles:[box]});
    assert.equal(result.blocked,false);assert.deepEqual(result.point,result.targetPoint);
  }
});

test('false zeroing can place the dot at the target while the untouched real arrow misses', () => {
  const stage={id:1,kind:'target',distance:30,height:PLAYER.y,radius:.2,wind:0,motion:{},obstacles:[],passers:[]};
  const params=Object.freeze({bow:0,arrow:0,charge:1,velocityBias:0,yaw:radians(120),pitch:radians(40)});
  const baseline=launchArrow(params),shot=launchArrow(params);
  const dot=traceLaserPoint({...params,distance:stage.distance,settings:{horizontalClicks:120,verticalClicks:40}});
  near(dot.point.x,0);near(dot.point.y,stage.height);assert.equal(dot.blocked,false);
  assert.deepEqual(shot,baseline,'zeroing never mutates a launch or the real aim');
  const result=stepArrow(shot,8,stage,0),expected=stepArrow(baseline,8,stage,0);
  assert.deepEqual(result,expected);assert.notEqual(result.type,'hit');assert.equal(result.score,0);
});

function manuallyReturnDotToSamePoint(settings = {},wind = 0) {
  // A wide target records the real plane crossing for every tested angle.
  const stage={id:1,kind:'target',distance:20,height:PLAYER.y,radius:10,wind,motion:{},obstacles:[],passers:[]};
  const params=Object.freeze({bow:0,arrow:0,charge:1,velocityBias:0,
    yaw:radians(settings.horizontalClicks||0),pitch:.1+radians(settings.verticalClicks||0)});
  const dot=projectLaserPoint({...params,distance:stage.distance,settings}),shot=launchArrow(params);
  const angle={yaw:Math.atan2(shot.velocity.x,shot.velocity.z),pitch:Math.atan2(shot.velocity.y,Math.hypot(shot.velocity.x,shot.velocity.z))};
  const result=stepArrow(shot,8,stage,0);
  assert.equal(result.type,'hit');near(result.point.z,stage.distance);
  return {dot,angle,point:result.point};
}

for (const [axis,angle,coordinate] of [['horizontalClicks','yaw','x'],['verticalClicks','pitch','y']]) {
  test(`manual ${axis} correction changes the actual launch and arrival in the labeled direction at the same sight point`, () => {
    const baseline=manuallyReturnDotToSamePoint();
    for (const sign of [-1,1]) {
      const shot=manuallyReturnDotToSamePoint({[axis]:sign*40});
      for (const key of ['x','y','z']) near(shot.dot[key],baseline.dot[key]);
      near(shot.angle[angle]-baseline.angle[angle],radians(sign*40));
      assert.equal(Math.sign(shot.point[coordinate]-baseline.point[coordinate]),sign);
    }
  });
}

test('manual horizontal correction opposite the wind reduces drift without moving the chosen sight point', () => {
  for (const wind of [-4,4]) {
    const drift=manuallyReturnDotToSamePoint({},wind);
    const corrected=manuallyReturnDotToSamePoint({horizontalClicks:-Math.sign(wind)*10},wind);
    const wrong=manuallyReturnDotToSamePoint({horizontalClicks:Math.sign(wind)*10},wind);
    assert.equal(Math.sign(drift.point.x),Math.sign(wind));
    assert.ok(Math.abs(corrected.point.x)<Math.abs(drift.point.x));
    assert.ok(Math.abs(wrong.point.x)>Math.abs(drift.point.x));
    for (const shot of [corrected,wrong]) for (const axis of ['x','y','z']) near(shot.dot[axis],drift.dot[axis]);
  }
});

test('the same world dot projects with the active 1, 2, 3, 6 or 8-power camera', () => {
  const dot=projectLaserPoint({yaw:.025,pitch:.012,distance:50,settings:{horizontalClicks:10,verticalClicks:-5}});
  const camera={x:0,y:PLAYER.y,z:0,cx:195,horizon:166,focal:390};
  const basic=projectPoint(dot,camera);
  for (const zoom of [1,2,3,6,8]) {
    const projected=projectPoint(dot,{...camera,focal:camera.focal*zoom});
    near(projected.x-camera.cx,(basic.x-camera.cx)*zoom);near(projected.y-camera.horizon,(basic.y-camera.horizon)*zoom);
    assert.equal(projected.visible,true);
  }
});
