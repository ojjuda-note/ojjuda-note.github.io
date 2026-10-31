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
  let now=0,startTime=0;
  const done=[],poses=[],canvas=new TraceCanvas();
  const scope={WHEEL_ORDER,COLOR,planSpinMotion,sampleSpinMotion,wheelSurface,sampleCloseup,
    THREE:{...THREE,WebGLRenderer:GPUlessRenderer,PMREMGenerator:GPUlessPMREM},RoomEnvironment:GPUlessEnvironment,
    document:{hidden:false,createElement:()=>new TraceCanvas(),addEventListener(){}},devicePixelRatio:1,
    ResizeObserver:class{observe(){}},requestAnimationFrame:()=>1,performance:{now:()=>now},Date:{now:()=>epoch+now}};
  vm.createContext(scope);
  const file=kind==='2D'?'wheel-2d.js':'wheel-3d.js',name=kind==='2D'?'RouletteWheel2D':'Wheel3D';
  const source=fs.readFileSync(new URL('../games/roulette/'+file,import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export class '+name,'class '+name)+'\nglobalThis.Renderer='+name+';';
  vm.runInContext(source,scope,{filename:file});
  const wheel=new scope.Renderer(canvas,{onDone:id=>done.push(id),onFrame:(progress,pose)=>poses.push({progress,pose})});
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
  return{wheel,canvas,done,poses,state,
    start(number=17,reduced=false,duration=25000,variation=.43){
      startTime=now;done.length=0;poses.length=0;wheel.setVisible(true);wheel.setReduced(reduced);
      return wheel.start({id:`${kind}-${number}-${reduced}-${now}`,number,duration,variation,startedAt:epoch+now}).plan;
    },
    at(seconds){now=startTime+seconds*1000;wheel.frame(now);return poses.at(-1)?.pose},
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

test('closeup waits for in-pocket landing, eases in and out, and remains gentler when reduced',()=>{
  for(const number of WHEEL_ORDER)for(const duration of [20000,25000,30000])for(const variation of [0,.5,1])for(const reduced of [false,true]){
    const plan=planSpinMotion({number,duration,variation},.2,-1.3,{reduced}),landing=plan.flights[2].end,span=reduced?1.6:1.2,maxZoom=reduced?1.55:2.4;
    for(const t of [0,plan.orbitEnd,plan.flights[2].start,landing-.0001,landing]){
      const view=viewAt(plan,t);near(view.amount,0,'no pan before the ball reaches the pocket');near(view.zoom,1,'no early zoom');
    }
    let previous=viewAt(plan,landing);
    for(let frame=1;frame<=Math.ceil(span*60);frame++){
      const view=viewAt(plan,landing+frame/60);
      assert.ok(view.amount>=previous.amount&&view.zoom>=previous.zoom,'the late zoom cannot reverse or jump back');
      assert.ok(view.zoom-previous.zoom<.04,'a single 60 Hz frame cannot add more than 4% overview magnification');
      near(view.focus.y,39,'landing bounces do not shake camera height');previous=view;
    }
    near(viewAt(plan,landing+span).zoom,maxZoom,'the enlargement completes within its intended late interval');
    near(viewAt(plan,plan.duration).zoom,maxZoom,'the final coast retains its closeup');
    assert.ok(viewAt(plan,landing+.001).zoom-1<1e-6,'zoom has no velocity jump at landing');
    assert.ok(maxZoom-viewAt(plan,landing+span-.001).zoom<1e-6,'zoom eases to rest');
    const normal=sampleCloseup(plan,(landing+.6)/plan.duration,poseAt(plan,landing+.6),{reduced:false}),gentle=sampleCloseup(plan,(landing+.6)/plan.duration,poseAt(plan,landing+.6),{reduced:true});
    assert.ok(gentle.amount<normal.amount&&gentle.zoom<normal.zoom,'reduction both slows the pan and limits enlargement');
  }
});

test('closeup follows the current ball without changing the physical plan, pose, or announced outcome',()=>{
  assert.deepEqual(sampleCloseup(null,.9,null),{amount:0,zoom:1,focus:{x:0,y:10,z:0}});
  const plan=planSpinMotion({number:36,duration:25000,variation:.6}),savedPlan=JSON.stringify(plan);
  for(const time of [0,plan.flights[2].end-.1,plan.flights[2].end+.5,plan.pocketTime,plan.duration]){
    const pose=poseAt(plan,time),savedPose=JSON.stringify(pose),view=sampleCloseup(plan,time/plan.duration,pose);
    const radial=Math.hypot(view.focus.x,view.focus.z);
    near(view.focus.x/radial,Math.cos(pose.angle),'focus follows current ball x');
    near(view.focus.z/radial,Math.sin(pose.angle),'focus follows current ball z');
    assert.equal(JSON.stringify(pose),savedPose);assert.equal(JSON.stringify(plan),savedPlan);
    assert.deepEqual(poseAt(plan,time),pose,'sampling a camera cannot alter subsequent physical sampling');
  }
});

for(const kind of ['2D','3D']){
  test(kind+' keeps the drawn ball and the whole printed result in frame during zoom and coast for every pocket',()=>{
    const f=fixture(kind);
    // Include narrower-than-current-CSS portrait surfaces, square and landscape.
    const sizes=[[360,720],[360,480],[600,600],[714,600],[900,500]];
    for(const [width,height] of sizes)for(const reduced of [false,true])for(const number of WHEEL_ORDER){
      f.resize(width,height);
      const plan=f.start(number,reduced,[20000,25000,30000][number%3],(number%5)/4),landing=plan.flights[2].end;
      const baseline=f.state();f.at(landing-.001);f.state().forEach((value,i)=>near(value,baseline[i],'camera is unchanged while the ball is still flying into its pocket'));
      const times=[landing,...Array.from({length:49},(_,i)=>landing+(plan.duration-landing)*(i+1)/49)];
      for(const time of times){
        const pose=f.at(time),expected=poseAt(plan,time);
        for(const key of ['rotation','angle','radius','height'])near(pose[key],expected[key],`${kind} physical ${key} remains unchanged`,1e-7);
        const bounds=f.bounds(number);
        for(const [item,points] of Object.entries(bounds))for(const p of points){
          assert.ok(Math.abs(p[0])<.985&&Math.abs(p[1])<.985,`${kind} ${item} clipped: number=${number}, reduced=${reduced}, viewport=${width}x${height}, t=${time.toFixed(3)}, point=${p}`);
          if(kind==='3D')assert.ok(p[2]>-1&&p[2]<1,'both objects remain between the camera clipping planes');
        }
      }
      near(f.zoom(),reduced?1.55:2.4,'actual drawing reaches its intended enlargement');
      assert.equal(f.done.length,1,'camera follow does not finish the round twice');
    }
  });

  test(kind+' holds the result, survives resize, and resets on a new spin or hidden view',()=>{
    const f=fixture(kind);f.resize(360,720);
    const plan=f.start(17),landing=plan.flights[2].end,duration=plan.duration;
    f.at(landing+.6);
    const activeView=JSON.stringify(f.wheel.closeup),activeState=f.state();
    f.wheel.setReduced(true);f.at(landing+.6);
    assert.equal(JSON.stringify(f.wheel.closeup),activeView,'a preference toggle applies to the next spin');assert.deepEqual(f.state(),activeState);
    for(const [width,height] of [[900,500],[360,480],[714,600]]){
      f.resize(width,height);
      for(const points of Object.values(f.bounds(17)))for(const p of points)assert.ok(Math.abs(p[0])<.985&&Math.abs(p[1])<.985,'resizing during pan keeps both subjects visible');
    }
    f.at(duration-.001);assert.equal(f.done.length,0,'the closeup cannot reveal completion early');
    f.at(duration);assert.equal(f.done.length,1);
    const heldView=JSON.stringify(f.wheel.closeup),heldState=f.state();
    f.wheel.showResult(17);f.at(duration+.5);
    assert.equal(JSON.stringify(f.wheel.closeup),heldView);assert.deepEqual(f.state(),heldState,'showResult keeps the final crop instead of snapping to the overview');
    const next=f.start(9,true);near(f.zoom(),1,'the next start immediately restores overview');near(f.wheel.closeup.amount,0,'no stale pan survives start');
    f.at(next.flights[2].end+1);assert.ok(f.zoom()>1);
    f.wheel.setVisible(false);near(f.zoom(),1,'hiding immediately restores overview');near(f.wheel.closeup.amount,0,'hiding discards the follow target');
    f.at(next.flights[2].end+1.1);near(f.zoom(),1,'an in-flight callback cannot restore the zoom in a hidden view');
    f.wheel.setVisible(true);f.at(next.duration);near(f.zoom(),1.55,'a reduced next spin uses the gentler closeup');
    const final=f.poses.at(-1).pose,sector=WHEEL_ORDER.indexOf(9)*TAU/37-Math.PI/2;
    near(Math.atan2(Math.sin(final.angle-final.rotation-sector),Math.cos(final.angle-final.rotation-sector)),0,'camera changes preserve the server-selected pocket');
  });
}
