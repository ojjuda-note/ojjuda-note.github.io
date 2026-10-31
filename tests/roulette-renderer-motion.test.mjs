import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {WHEEL_ORDER,COLOR} from '../games/roulette/engine.js';
import {planSpinMotion,sampleSpinMotion,wheelSurface} from '../games/roulette/motion.js';
import {sampleCloseup} from '../games/roulette/closeup.js';

const TAU=Math.PI*2,epoch=1800000000000;
const angleDistance=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const spin={id:'renderer-round',number:17,duration:25000,variation:.43,startedAt:epoch};

// Exercise the actual animation methods without requiring a GPU. Only drawing
// and frame delivery are replaced; planning, timing and callbacks remain real.
function renderer(file,name,reduced){
  let now=0;
  const done=[],drawn=[];
  const scope={WHEEL_ORDER,COLOR,planSpinMotion,sampleSpinMotion,wheelSurface,sampleCloseup,document:{hidden:false},requestAnimationFrame:()=>1,performance:{now:()=>now},Date:{now:()=>epoch+now}};
  vm.createContext(scope);
  const source=fs.readFileSync(new URL('../games/roulette/'+file,import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export class '+name,'class '+name)+'\nglobalThis.Renderer='+name+';';
  vm.runInContext(source,scope,{filename:file});
  const wheel=Object.create(scope.Renderer.prototype);
  Object.assign(wheel,{active:null,reduced,visible:true,rotation:0,ballAngle:-Math.PI/2,ballRadius:396,ballHeight:0,raf:0,lastTime:0,lastTick:0,lastImpact:0,state:'idle',draw(){drawn.push({rotation:this.rotation,angle:this.ballAngle,radius:this.ballRadius,height:this.ballHeight})},onTick(){},onPhase(){},onFrame(){},onDone:id=>done.push(id)});
  wheel.start({...spin});
  return {wheel,done,drawn,at(ms){now=ms;wheel.frame(now);return drawn.at(-1)},next(){wheel.rotation=0;wheel.ballAngle=-Math.PI/2;wheel.start({...spin,id:'next-round',startedAt:epoch+now});return now}};
}

for(const [file,name] of [['wheel-2d.js','RouletteWheel2D'],['wheel-3d.js','Wheel3D']]){
  test(name+' keeps reduced motion moving and completes only after the shared coast',()=>{
    const gentle=renderer(file,name,true),normal=renderer(file,name,false);
    const g0=gentle.at(0),g1=gentle.at(100),g2=gentle.at(200),n0=normal.at(0),n2=normal.at(200);
    assert.ok(angleDistance(g1.angle,g0.angle)>.025,'the ball visibly moves even with reduction enabled');
    assert.ok(angleDistance(g2.angle,g1.angle)>.025,'the next frame advances instead of restoring a fixed pose');
    assert.ok(Math.abs(n2.angle-n0.angle)>1.8*Math.abs(g2.angle-g0.angle),'the renderer selects the gentler path at start');
    const poses=[g0,g1,g2,...[4300,9700,16300].map(ms=>gentle.at(ms))];
    for(let i=1;i<poses.length;i++){
      const a=poses[i-1],b=poses[i],distance=Math.hypot(Math.cos(a.angle)*a.radius-Math.cos(b.angle)*b.radius,Math.sin(a.angle)*a.radius-Math.sin(b.angle)*b.radius);
      assert.ok(distance>1,'elapsed time changes the displayed ball position');
    }
    const plan=gentle.wheel.active.plan,coast=gentle.at(plan.pocketTime*1000);
    gentle.at(spin.duration-1);assert.deepEqual(gentle.done,[],'settling in a pocket does not finish the spin early');
    const end=gentle.at(spin.duration);
    assert.deepEqual(gentle.done,[spin.id]);assert.equal(gentle.wheel.active,null);
    const turns=(end.rotation-coast.rotation)/TAU;
    assert.ok(turns>=.5-1e-9&&turns<=1+1e-9,'reduced motion preserves the extra half to one revolution');
    assert.ok(angleDistance(end.angle-end.rotation,WHEEL_ORDER.indexOf(spin.number)*TAU/37-Math.PI/2)<1e-8,'the server number remains the final pocket');
  });

  test(name+' applies preference changes to the next spin without jumping the active ball',()=>{
    const f=renderer(file,name,true),plan=f.wheel.active.plan,before=f.at(4300);
    f.wheel.setReduced(false);
    assert.equal(f.wheel.active.plan,plan);
    assert.deepEqual(f.at(4300),before,'changing the setting cannot replace the active path or move the current pose');
    const later=f.at(4700);assert.ok(angleDistance(later.angle,before.angle)>.025);
    f.at(spin.duration);
    const nextStart=f.next(),normalStart=f.at(nextStart),normalLater=f.at(nextStart+200);
    const gentle=renderer(file,name,true),gentleStart=gentle.at(0),gentleLater=gentle.at(200);
    assert.ok(Math.abs(normalLater.angle-normalStart.angle)>1.8*Math.abs(gentleLater.angle-gentleStart.angle),'the next spin uses the newly selected normal speed');
  });
}
