const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname,'..','screw3d-depth-renderer.js'),'utf8').replace('export function','function');

function exercise(mode) {
  const canvases=[];
  const goodGl={
    VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    ARRAY_BUFFER:5,FLOAT:6,DYNAMIC_DRAW:7,TRIANGLES:8,
    COLOR_BUFFER_BIT:16,DEPTH_BUFFER_BIT:32,DEPTH_TEST:64,LEQUAL:128,CULL_FACE:256,
    BLEND:512,SRC_ALPHA:1024,ONE_MINUS_SRC_ALPHA:2048,ONE:4096,
    createShader(){return {}},shaderSource(){},compileShader(){},getShaderParameter(){return true},
    createProgram(){return {}},attachShader(){},linkProgram(){},deleteShader(){},
    getProgramParameter(){return true},createBuffer(){return {}},
    viewport(){},clearColor(){},clearDepth(){},depthMask(){},clear(){},
    enable(){},depthFunc(){},disable(){},blendFuncSeparate(){},useProgram(){},
    bindBuffer(){},getAttribLocation(){return 0},enableVertexAttribArray(){},vertexAttribPointer(){},
    bufferData(){},drawArrays(){},deleteBuffer(){},deleteProgram(){}
  };
  const document={createElement(name){
    assert.equal(name,'canvas');
    const canvas={width:0,height:0,addEventListener(_event,callback){canvas.lost=callback},getContext(type){
      if(type==='webgl')return mode==='unavailable'?null:mode==='context_loss'?goodGl:mode==='compile_failure'?{
        VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,
        createShader(){return {}},shaderSource(){},compileShader(){},getShaderParameter(){return false}
      }:null;
      if(type==='2d')return {
        createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},
        putImageData(frame){canvas.pixels=frame.data}
      };
      return null;
    }};
    canvases.push(canvas);return canvas;
  }};
  const build=vm.runInNewContext(source+';createScrewDepthRenderer',{document,Math,Map,Float32Array,Uint8ClampedArray,parseInt});
  const renderer=build();let painted=null;
  const target={canvas:{width:360},drawImage(canvas){painted=canvas}};
  const triangle=[{x:10,y:10},{x:30,y:10},{x:10,y:30}];
  const item={owner:{},alpha:1,polys:[{pts:triangle,fill:'#ff0000',depth:[0,0,1]}]};
  const success=renderer.draw(target,[item],null,1,0,50);
  if(mode==='context_loss'){
    canvases[0].lost();
    const again=renderer.draw(target,[item],null,1,0,50);
    assert.equal(again,true,'context loss should fall back to software pixels');
  }
  return {success,canvases:canvases.length,pixels:painted?.pixels};
}

const normal=exercise('unavailable');
assert.equal(normal.success,true);
assert.ok(normal.pixels.some(v=>v>0));
const recovered=exercise('context_loss');
assert.equal(recovered.success,true);
assert.ok(recovered.pixels.some(v=>v>0));
const failing=exercise('compile_failure');
console.log('software-only:',normal.success,'context-loss fallback:',!!recovered.pixels,'failed-GL fallback:',failing.success);
assert.equal(failing.success,true,'shader-compile failure should still fall back to software depth rendering');

const {bundleScrew3d}=require('./screw3d-vm-bundle.cjs');
const engine=bundleScrew3d(f=>fs.readFileSync(require('node:path').join(__dirname,'..',f),'utf8'));
const physics=vm.createContext({window:{},structuredClone,assert,console});
vm.runInContext(engine+`
  const games=[screw3d({setScore(){},getCoins:()=>0,end(){}},1)];
  const first=window.__ojjScrew3d;
  games.push(screw3d({setScore(){},getCoins:()=>0,end(){}},1));
  const second=window.__ojjScrew3d;
  const base=cube(0,0,0,'#FFFFFF'),falling=cube(0,0,0,'#FFFFFF');
  falling.c=[.7,1,0];falling.dyn={c:[.7,1,0],R:I3.slice(),v:[.05,-.1,.02],w:[.1,.2,.3],m:1,I:1,sleep:0,t:0};
  const cap=el('plate',boxGeom([.03,.02,.03]),[.25,0,0],I3,'#AAAAAA');
  const screw={p:[.26,0,0],a:[1,0,0],thru:cap,into:base,state:'in',color:0,t:0};
  first.lvl=mapLevel({name:'camera invariant',els:[base,falling,cap],screws:[screw],queue:[0]});
  second.lvl=structuredClone(first.lvl);
  first.touched=second.touched=true;
  first.yaw=first.pitch=0;first.zm=1;first.pan=[0,0];
  second.yaw=2.1;second.pitch=1.2;second.zm=9;second.pan=[1500,-2500];
  for(let frame=0;frame<20;frame++){
    games[0].update(.04);games[1].update(.04);
    const a=first.lvl.els[1],b=second.lvl.els[1];
    assert.deepEqual(a.dyn.c,b.dyn.c,'camera yaw and pitch cannot redirect falling gravity');
    assert.deepEqual(a.dyn.v,b.dyn.v,'the same physical state has the same velocity');
    assert.equal(a.state,b.state,'zoom and pan cannot remove a physical obstruction');
    const blockerA=blocked(first.lvl.screws[0],first.lvl),blockerB=blocked(second.lvl.screws[0],second.lvl);
    assert.equal(first.lvl.els.indexOf(blockerA),second.lvl.els.indexOf(blockerB),'camera-only changes cannot change blocked/free');
  }
  for(const game of games)game.destroy();
`,physics);
console.log('PASS: software depth fallback, graphics failures and camera-independent falling physics');
