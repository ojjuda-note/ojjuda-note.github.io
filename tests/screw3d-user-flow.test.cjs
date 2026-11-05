const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {bundleScrew3d}=require('./screw3d-vm-bundle.cjs');
const fixture=require('./screw3d-user-flow-fixture.cjs');
const source=bundleScrew3d(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'));
const memory=new Map(),noop=()=>{},gradient={addColorStop:noop};
const canvas=new Proxy({canvas:{width:360,height:540},createLinearGradient:()=>gradient,
  createRadialGradient:()=>gradient,measureText:s=>({width:String(s).length*7})},{get:(o,k)=>k in o?o[k]:noop});
const context=vm.createContext({Math:Object.create(Math),console,crypto:require('node:crypto'),
  window:{},canvas,capture:noop,confirm:()=>true,
  localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)}});
vm.runInContext(source+'\n'+fixture,context);
(async()=>{
  const routes=[];
  for(const seed of [1,4,5,6]){
    memory.clear();const r=await context.play(20,seed,seed*7919,true);
    assert.ok(r.cleared&&r.clicks===r.total,'all real timed touches complete stage20: '+JSON.stringify(r));
    assert.equal(r.boxes.length,3);assert.equal(r.buffer,6);
    routes.push({seed,screws:r.total,clicks:r.clicks,sorts:r.sorts,detours:r.detours});
    context.last.game.destroy();
  }
  console.log('PASS: four randomized 3-box/6-slot routes with rotating camera and real falling physics',JSON.stringify(routes));
})().catch(e=>{console.error(e);process.exitCode=1;});
