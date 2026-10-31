import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../games/roulette/vendor/three.module.min.js';
import {WHEEL_ORDER,COLOR} from '../games/roulette/engine.js';
import {planSpinMotion,sampleSpinMotion,wheelSurface} from '../games/roulette/motion.js';
import {sampleCloseup} from '../games/roulette/closeup.js';

const epoch=1800000000000,TAU=2*Math.PI;
const near=(a,b,message,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${message}: ${a} vs ${b}`);
const poseAt=(plan,time)=>sampleSpinMotion(plan,time/plan.duration);
const viewAt=(plan,time)=>sampleCloseup(plan,time/plan.duration,poseAt(plan,time));
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];

// Record the actual Canvas operations, including the offscreen number layer.
// Glyph bounds deliberately allow 0.75 em per digit and 1.25 em vertically;
// this tests more than just whether the centre of a printed number is visible.
class TraceContext{
  constructor(canvas){this.canvas=canvas;this.reset()}
  reset(){this.matrix=[1,0,0,1,0,0];this.stack=[];this.labels=[];this.circles=[];this.font='10px sans-serif'}
  save(){this.stack.push({matrix:this.matrix.slice(),font:this.font})}
  restore(){Object.assign(this,this.stack.pop())}
  setTransform(...m){this.matrix=m}
  translate(x,y){this.matrix=multiply(this.matrix,[1,0,0,1,x,y])}
  scale(x,y){this.matrix=multiply(this.matrix,[x,0,0,y,0,0])}
  rotate(a){this.matrix=multiply(this.matrix,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0])}
  clearRect(){this.labels=[];this.circles=[]}
  fillText(text,x,y){
    if(!/^\d+$/.test(text))return;
    const em=Number(this.font.match(/([.\d]+)px/)[1]),w=em*.75*text.length,h=em*1.25;
    this.labels.push({text,centre:point(this.matrix,[x,y]),points:[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([dx,dy])=>point(this.matrix,[x+dx,y+dy]))});
  }
  drawImage(image,...args){
    let sx=0,sy=0,sw=image.width,sh=image.height,dx,dy,dw,dh;
    if(args.length===2){[dx,dy]=args;dw=sw;dh=sh}
    else if(args.length===4)[dx,dy,dw,dh]=args;
    else [sx,sy,sw,sh,dx,dy,dw,dh]=args;
    const mapping=multiply(this.matrix,[dw/sw,0,0,dh/sh,dx-sx*dw/sw,dy-sy*dh/sh]);
    for(const label of image.context.labels)this.labels.push({text:label.text,centre:point(mapping,label.centre),points:label.points.map(p=>point(mapping,p))});
  }
  arc(x,y,r){this.circles.push({radius:r,points:[[x-r,y-r],[x+r,y-r],[x+r,y+r],[x-r,y+r]].map(p=>point(this.matrix,p))})}
  createRadialGradient(){return{addColorStop(){}}}
  createLinearGradient(){return{addColorStop(){}}}
  beginPath(){} closePath(){} moveTo(){} lineTo(){} quadraticCurveTo(){} fill(){} stroke(){} fillRect(){} ellipse(){}
}
class TraceCanvas{
  constructor(width=600,height=600){this._width=width;this._height=height;this.clientWidth=width;this.clientHeight=height;this.context=new TraceContext(this);this.dataset={};this.parentElement={classList:{add(){}}}}
  get width(){return this._width}set width(value){this._width=value;this.context.reset()}
  get height(){return this._height}set height(value){this._height=value;this.context.reset()}
  getContext(){return this.context}
  getBoundingClientRect(){return{width:this.clientWidth,height:this.clientHeight}}
  addEventListener(){}
}
class GPUlessRenderer{
  constructor({canvas}){this.canvas=canvas;this.shadowMap={}}
  setPixelRatio(){}
  setSize(width,height){this.canvas.width=width;this.canvas.height=height}
  render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true)}
}
class GPUlessEnvironment extends THREE.Scene{dispose(){}}
class GPUlessPMREM{fromScene(){return{texture:new THREE.Texture()}}dispose(){}}

function fixture(kind){
  let now=0,startTime=0,frameId=0,onComplete=()=>{};
  const done=[],doneTimes=[],poses=[],frames=new Map(),canvas=new TraceCanvas();
  const scope={WHEEL_ORDER,COLOR,planSpinMotion,sampleSpinMotion,wheelSurface,sampleCloseup,
    THREE:{...THREE,WebGLRenderer:GPUlessRenderer,PMREMGenerator:GPUlessPMREM},RoomEnvironment:GPUlessEnvironment,
    document:{hidden:false,createElement:()=>new TraceCanvas(),addEventListener(){}},devicePixelRatio:1,
    ResizeObserver:class{observe(){}},requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId},cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>now},Date:{now:()=>epoch+now}};
  vm.createContext(scope);
  const file=kind==='2D'?'wheel-2d.js':'wheel-3d.js',name=kind==='2D'?'RouletteWheel2D':'Wheel3D';
  const source=fs.readFileSync(new URL('../games/roulette/'+file,import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export class '+name,'class '+name)+'\nglobalThis.Renderer='+name+';';
  vm.runInContext(source,scope,{filename:file});
  const wheel=new scope.Renderer(canvas,{onDone:id=>{done.push(id);doneTimes.push((now-startTime)/1000);onComplete(id)},onFrame:(progress,pose)=>poses.push({progress,pose})});
  wheel.setVisible(true);
  let numberMesh,numberPoints;
  if(kind==='3D'){
    wheel.rotor.traverse(mesh=>{if(mesh.material?.map?.image?.context?.labels.length===37)numberMesh=mesh});
    assert.ok(numberMesh,'use the actual mesh bearing all 37 printed numbers');
    // Invert the actual mesh UV mapping. No copied label radius or rotation is
    // used to decide where the printed result appears on screen.
    const geometry=numberMesh.geometry,uv=geometry.attributes.uv,pos=geometry.attributes.position;
    const ids=[0,1,2].map(i=>geometry.index.getX(i)),u=ids.map(i=>new THREE.Vector2().fromBufferAttribute(uv,i)),v=ids.map(i=>new THREE.Vector3().fromBufferAttribute(pos,i));
    const ax=u[1].x-u[0].x,ay=u[1].y-u[0].y,bx=u[2].x-u[0].x,by=u[2].y-u[0].y,det=ax*by-ay*bx;
    const map=numberMesh.material.map,image=map.image;
    const toMesh=([x,y])=>{
      const du=x/image.width-u[0].x,dv=(map.flipY?1-y/image.height:y/image.height)-u[0].y;
      const a=(du*by-dv*bx)/det,b=(ax*dv-ay*du)/det;
      return v[0].clone().addScaledVector(v[1].clone().sub(v[0]),a).addScaledVector(v[2].clone().sub(v[0]),b);
    };
    numberPoints=new Map(image.context.labels.map(label=>[Number(label.text),label.points.map(toMesh)]));
    wheel.ball.geometry.computeBoundingSphere();
  }
  const state=()=>kind==='2D'?canvas.context.matrix.map(value=>value/(canvas.width/1000)):[...wheel.camera.position.toArray(),...wheel.camera.quaternion.toArray(),wheel.camera.zoom];
  const deliver=(seconds,callbacks)=>{
    now=startTime+seconds*1000;
    for(const callback of callbacks){for(const [id,pending] of frames)if(pending===callback)frames.delete(id);callback(now)}
    return poses.at(-1)?.pose;
  };
  return{wheel,canvas,done,doneTimes,poses,state,
    onComplete(callback){onComplete=callback},
    start(number=17,reduced=false,duration=25000,variation=.43){
      startTime=now;done.length=0;doneTimes.length=0;poses.length=0;wheel.setVisible(true);wheel.setReduced(reduced);
      return wheel.start({id:`${kind}-${number}-${reduced}-${now}`,number,duration,variation,startedAt:epoch+now}).plan;
    },
    // Deliver only RAFs the real renderer requested, so a post-stop animation
    // that forgets to schedule its next frame cannot pass by manual frame calls.
    at(seconds){return deliver(seconds,[...frames.values()])},
    pendingFrame(){return frames.values().next().value},
    deliver(callback,seconds){assert.equal(typeof callback,'function','a scheduled frame is available');return deliver(seconds,[callback])},
    physical(){return[wheel.rotation,Math.cos(wheel.ballAngle)*wheel.ballRadius,Math.sin(wheel.ballAngle)*wheel.ballRadius,wheel.ballHeight]},
    resize(width,height){canvas.clientWidth=width;canvas.clientHeight=height;wheel.resize()},
    zoom(){return kind==='2D'?canvas.context.matrix[0]/(canvas.width/1000):wheel.camera.zoom/Math.min(1,wheel.camera.aspect)},
    bounds(number){
      if(kind==='2D'){
        const label=canvas.context.labels.find(item=>item.text===String(number)),ball=canvas.context.circles.find(item=>item.radius===8.6);
        assert.ok(label&&ball,'actual draw must contain both the result label and ball');
        return{label:label.points.map(([x,y])=>[2*x/canvas.width-1,2*y/canvas.height-1]),ball:ball.points.map(([x,y])=>[2*x/canvas.width-1,2*y/canvas.height-1])};
      }
      const project=p=>p.project(wheel.camera).toArray(),centre=wheel.ball.getWorldPosition(new THREE.Vector3()),radius=wheel.ball.geometry.boundingSphere.radius;
      const ball=[];
      for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])ball.push(project(centre.clone().add(new THREE.Vector3(x*radius,y*radius,z*radius))));
      return{ball,label:numberPoints.get(number).map(p=>project(p.clone().applyMatrix4(numberMesh.matrixWorld)))};
    }
  };
}

test('closeup stays at overview for the entire spin and only eases in after a full stop',()=>{
  for(const number of WHEEL_ORDER)for(const duration of [20000,25000,30000])for(const variation of [0,.5,1])for(const reduced of [false,true]){
    const plan=planSpinMotion({number,duration,variation},.2,-1.3,{reduced}),stop=plan.duration,span=reduced?1.6:1.2,maxZoom=reduced?1.55:2.4;
    const movingTimes=[...Array.from({length:121},(_,i)=>stop*i/120),plan.flights[2].end,plan.pocketTime,stop-.0001,stop];
    for(const t of movingTimes){
      const view=viewAt(plan,t);near(view.amount,0,'no pan while the ball or rotor can still move');near(view.zoom,1,'the entire spin and coast stay at overview');
    }
    let previous=viewAt(plan,stop),fixedFocus;
    for(let frame=1;frame<=Math.ceil(span*60);frame++){
      const view=viewAt(plan,stop+frame/60);
      assert.ok(view.amount>=previous.amount&&view.zoom>=previous.zoom,'the stopped-result zoom cannot reverse or jump back');
      assert.ok(view.zoom-previous.zoom<.04,'a single 60 Hz frame cannot add more than 4% overview magnification');
      near(view.focus.y,39,'the frozen focus has a stable height');
      if(fixedFocus)for(const axis of ['x','y','z'])near(view.focus[axis],fixedFocus[axis],'the target cannot orbit during the zoom');
      fixedFocus=view.focus;previous=view;
    }
    near(viewAt(plan,stop+span).zoom,maxZoom,'the post-stop enlargement completes in its intended interval');
    near(viewAt(plan,stop+20).zoom,maxZoom,'the stopped result retains its closeup');
    assert.ok(viewAt(plan,stop+.001).zoom-1<1e-6,'zoom has no velocity jump at a full stop');
    assert.ok(maxZoom-viewAt(plan,stop+span-.001).zoom<1e-6,'zoom eases to rest');
    const normal=sampleCloseup(plan,(stop+.6)/stop,poseAt(plan,stop),{reduced:false}),gentle=sampleCloseup(plan,(stop+.6)/stop,poseAt(plan,stop),{reduced:true});
    assert.ok(gentle.amount<normal.amount&&gentle.zoom<normal.zoom,'reduction both slows the pan and limits enlargement');
  }
});

test('the post-stop camera samples a frozen final ball without changing the physical plan or outcome',()=>{
  const overview={amount:0,zoom:1,focus:{x:0,y:10,z:0}};
  assert.deepEqual(sampleCloseup(null,.9,null),overview);
  const plan=planSpinMotion({number:36,duration:25000,variation:.6}),savedPlan=JSON.stringify(plan);
  for(const time of [0,plan.flights[2].end,plan.pocketTime,plan.duration,plan.duration+.6,plan.duration+2,plan.duration+50]){
    const pose=poseAt(plan,time),savedPose=JSON.stringify(pose),view=sampleCloseup(plan,time/plan.duration,pose);
    if(time<=plan.duration)assert.deepEqual(view,overview,'even an already-pocketed ball uses overview while the rotor coasts');
    else{
      const radial=Math.hypot(view.focus.x,view.focus.z);
      near(view.focus.x/radial,Math.cos(pose.angle),'focus uses final ball x');
      near(view.focus.z/radial,Math.sin(pose.angle),'focus uses final ball z');
    }
    assert.equal(JSON.stringify(pose),savedPose);assert.equal(JSON.stringify(plan),savedPlan);
    assert.deepEqual(poseAt(plan,time),pose,'sampling a camera cannot alter physical sampling');
  }
});

const sameState=(actual,expected,message)=>actual.forEach((value,i)=>near(value,expected[i],message,1e-7));
const physicalPose=pose=>[pose.rotation,Math.cos(pose.angle)*pose.radius,Math.sin(pose.angle)*pose.radius,pose.height];
function assertInFrame(f,kind,number,details=''){
  for(const [item,points] of Object.entries(f.bounds(number)))for(const p of points){
    assert.ok(Math.abs(p[0])<.985&&Math.abs(p[1])<.985,`${kind} ${item} clipped: number=${number}, ${details}, point=${p}`);
    if(kind==='3D')assert.ok(p[2]>-1&&p[2]<1,'both subjects remain between the camera clipping planes');
  }
}

for(const kind of ['2D','3D']){
  test(kind+' keeps every spin and coast at overview, then enlarges the stationary ball and result inside every viewport',()=>{
    const f=fixture(kind),sizes=[[360,720],[360,480],[600,600],[714,600],[900,500]];
    for(const [width,height] of sizes)for(const reduced of [false,true])for(const number of WHEEL_ORDER){
      f.resize(width,height);
      // The real app immediately calls showResult from its completion handler.
      // It must not cancel or restart the renderer's separate post-stop zoom.
      f.onComplete(()=>f.wheel.showResult(number));
      const plan=f.start(number,reduced,[20000,25000,30000][number%3],(number%5)/4),baseline=f.state(),stop=plan.duration,span=reduced?1.6:1.2;
      for(let frame=0;frame<120;frame++){
        const time=stop*frame/120,pose=f.at(time),expected=poseAt(plan,time);
        assert.ok(pose,'the renderer schedules and displays the moving frame');
        sameState(f.state(),baseline,'the actual camera/canvas stays at overview for the entire spin and coast');
        sameState(f.physical(),physicalPose(expected),'physical motion remains unchanged');
        assert.equal(f.done.length,0,'camera work cannot finish the round early');
      }
      f.at(stop-.001);assert.equal(f.done.length,0);
      f.at(stop);assert.equal(f.done.length,1);near(f.doneTimes[0],stop,'completion keeps the original server duration');
      sameState(f.state(),baseline,'the exact completion frame is still overview');
      const frozen=physicalPose(poseAt(plan,stop));
      for(let frame=0;frame<=49;frame++){
        const time=stop+(span+.4)*frame/49;f.at(time);
        sameState(f.physical(),frozen,'the rotor and ball remain frozen throughout and after zoom');
        assertInFrame(f,kind,number,`reduced=${reduced}, viewport=${width}x${height}, t=${time.toFixed(3)}`);
      }
      near(f.zoom(),reduced?1.55:2.4,'requested RAFs finish the enlargement after the result callback');
      assert.equal(f.done.length,1,'visual completion cannot repeat game completion');
      const held=f.state();f.at(stop+5);sameState(f.state(),held,'the finished enlargement stays fixed');sameState(f.physical(),frozen,'no idle rotation resumes');
    }
  });

  test(kind+' preserves the post-stop zoom through showResult, preference changes and resize',()=>{
    const f=fixture(kind);f.resize(360,720);f.onComplete(()=>f.wheel.showResult(17));
    const plan=f.start(17),stop=plan.duration;
    f.at(stop);f.at(stop+.6);
    assert.ok(f.zoom()>1&&f.zoom()<2.4,'the result callback leaves a gradual post-stop enlargement running');
    const activeView=JSON.stringify(f.wheel.closeup),activeState=f.state(),frozen=f.physical();
    f.wheel.setReduced(true);f.at(stop+.6);
    assert.equal(JSON.stringify(f.wheel.closeup),activeView,'a preference toggle applies to the next spin');sameState(f.state(),activeState,'active zoom preference is frozen');
    for(const [width,height] of [[900,500],[360,480],[714,600]]){
      f.resize(width,height);assertInFrame(f,kind,17,'resize during stationary zoom');sameState(f.physical(),frozen,'resize does not move the wheel or ball');
    }
    f.at(stop+1.2);near(f.zoom(),2.4,'the original zoom preference completes');
    const heldView=JSON.stringify(f.wheel.closeup),heldState=f.state();
    f.wheel.showResult(17);f.at(stop+3);
    assert.equal(JSON.stringify(f.wheel.closeup),heldView);sameState(f.state(),heldState,'repeated showResult retains the final crop');sameState(f.physical(),frozen,'result delivery cannot resume rotation');
    assert.equal(f.done.length,1);
  });

  test(kind+' cancels pending zoom on hide or next start, including hide inside the completion callback',()=>{
    const f=fixture(kind);f.onComplete(()=>f.wheel.showResult(9));
    const first=f.start(9,true);f.at(first.duration);f.at(first.duration+.8);
    assert.ok(f.zoom()>1&&f.zoom()<1.55);
    const hiddenFrame=f.pendingFrame();f.wheel.setVisible(false);
    near(f.zoom(),1,'hiding immediately restores overview');near(f.wheel.closeup.amount,0,'hiding discards the pan');
    f.deliver(hiddenFrame,first.duration+1);near(f.zoom(),1,'an already-dispatched frame cannot restore hidden zoom');
    f.wheel.setVisible(true);f.at(first.duration+3);near(f.zoom(),1,'reopening cannot resurrect canceled zoom');

    f.onComplete(()=>f.wheel.showResult(27));
    const second=f.start(27);f.at(second.duration);f.at(second.duration+.3);
    assert.ok(f.zoom()>1);const oldFrame=f.pendingFrame();
    f.onComplete(()=>f.wheel.showResult(2));
    const next=f.start(2,true);near(f.zoom(),1,'the next start immediately restores overview');
    f.deliver(oldFrame,.2);near(f.zoom(),1,'the preceding round cannot zoom into the new round');
    sameState(f.physical(),physicalPose(poseAt(next,.2)),'a queued frame follows only the new physical plan');assert.equal(f.done.length,0);
    f.at(next.duration);f.at(next.duration+1.6);near(f.zoom(),1.55,'the next reduced round uses its own post-stop zoom');
    const final=f.poses.at(-1).pose,sector=WHEEL_ORDER.indexOf(2)*TAU/37-Math.PI/2;
    near(Math.atan2(Math.sin(final.angle-final.rotation-sector),Math.cos(final.angle-final.rotation-sector)),0,'camera lifecycle preserves the server-selected number');

    f.onComplete(()=>{f.wheel.showResult(4);f.wheel.setVisible(false)});
    const closing=f.start(4),completionFrame=f.pendingFrame();f.at(closing.duration);
    assert.equal(f.done.length,1);near(f.zoom(),1,'closing from onDone cancels post-stop zoom immediately');
    f.deliver(completionFrame,closing.duration+.6);near(f.zoom(),1,'an old completion callback cannot revive it');
    f.wheel.setVisible(true);f.at(closing.duration+2);near(f.zoom(),1,'no saved closeup survives closing during onDone');assert.equal(f.done.length,1);
  });

  test(kind+' starts gradual zoom at the first observed completed frame when returning late',()=>{
    const f=fixture(kind);f.onComplete(()=>f.wheel.showResult(31));
    const plan=f.start(31),late=plan.duration+4;
    f.at(late);assert.equal(f.done.length,1);near(f.zoom(),1,'a late frame first displays the stopped overview');
    const frozen=f.physical();f.at(late+.6);
    assert.ok(f.zoom()>1&&f.zoom()<2.4,'late delivery does not jump straight to full magnification');sameState(f.physical(),frozen,'the observed final pose stays fixed');
    f.at(late+1.2);near(f.zoom(),2.4,'the late view still gets a full gentle transition');assert.equal(f.done.length,1);
  });
}
