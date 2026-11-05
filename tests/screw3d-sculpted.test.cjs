/* Regression checks for the sculpted screw-box model and real guard obstacles. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {bundleScrew3d}=require('./screw3d-vm-bundle.cjs');
const sources=bundleScrew3d(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
const testMath=Object.create(Math);
const context=vm.createContext({assert,Math:testMath,console,structuredClone});

vm.runInContext(sources+`
  globalThis.checkStage=(stage,seed)=>{
    let randomSeed=seed>>>0;
    Math.random=()=>((randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0)/4294967296);
    const m=makeLevel(stage),whole=m.els.filter(e=>e.skinGeom);
    assert.ok(m.refs instanceof Map&&m.grid instanceof Map);
    assert.ok(m.staticSpecialNear instanceof Map&&m.staticScrewsNear instanceof Map);
    assert.equal(m.screws.length%3,0,'screw colors must remain grouped in threes');
    const meshFaces=whole.reduce((n,e)=>n+e.skinFastGeom.faces.length,0);
    assert.ok(meshFaces>0,'every stage has a visible sculpted shape, even if it is thin');
    for(const E of whole){
      assert.ok(Array.isArray(E.skinOriginalFaces)&&E.skinOriginalFaces.length===6);
      for(const geom of [E.skinGeom,E.skinFastGeom]){
        assert.equal(geom.sculpted,true);
        for(const v of geom.verts)assert.ok(v.length===3&&v.every(Number.isFinite));
        for(const f of geom.faces){
          assert.equal(f.idx.length,3);
          assert.ok(f.idx.every(i=>Number.isInteger(i)&&i>=0&&i<geom.verts.length));
          assert.ok(f.n.every(Number.isFinite));
        }
      }
    }
    const guards=m.els.filter(e=>e.guard);
    if(stage>=31)assert.ok(guards.length>=1,'hard stages include genuine extraction obstacles');
    if(stage>=31)assert.ok(m.screws.some(s=>!s.guard&&guards.includes(blocked(s,m))),
      'an intended screw is physically blocked by a removable guard');
    for(const guard of guards){
      assert.equal(m.refs.get(guard).filter(s=>s.guard).length,3,'each gate has three removable screws');
    }
    assert.ok(m.screws.some(s=>s.diagonal),'functional diagonal screws are present');
    const angled=m.screws.filter(s=>s.diagonal).length;
    assert.equal(angled%3,0);
    for(const s of m.solution){
      assert.equal(blocked(s,m),null,'all solution moves must be physically extractable at stage '+stage);
      s.state='done';
      for(const E of [s.thru,s.into])if(!held(E,m.screws))E.state='gone';
    }
    assert.ok(m.els.every(e=>e.state==='gone'),'all geometry must detach at stage '+stage);
    return {stage,guards:guards.length,screws:m.screws.length,skinTriangles:meshFaces};
  };
  globalThis.checkClone=(stage)=>{
    const m=makeLevel(stage),copy=structuredClone(m),s=copy.screws[0];
    assert.ok(copy.refs.has(s.thru)&&copy.refs.has(s.into));
    assert.ok(copy.staticSpecialNear.has(s)&&copy.staticScrewsNear.has(s));
    assert.equal(copy.screws.length,m.screws.length);
  };
  globalThis.checkScrewBlocksScrew=()=>{
    const wood=cube(0,0,0,'#F4C28F');
    const cap=el('plate',boxGeom([.12,.015,.12]),[0,.3,0],I3,'#BCC6D1');
    const lower={p:[0,.3,0],a:[0,1,0],thru:cap,into:wood,state:'in'};
    const upper={p:[0,.45,0],a:[0,1,0],thru:cap,into:wood,state:'in'};
    const m=mapLevel({els:[wood,cap],screws:[lower,upper]});
    assert.equal(blocked(lower,m),upper,'a screw head stops another screw moving along the same path');
    upper.state='done';
    assert.equal(blocked(lower,m),null,'removing the obstruction frees the original screw');
  };
`,context);

context.checkScrewBlocksScrew();
const levels=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,
  21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
  41,42,43,44,45,46,47,48,49,50,60,80,100,120,160,200,240,300,
  400,500,600,700,800,900,1000];
for(const stage of levels){
  const r=context.checkStage(stage,Math.imul(stage,9973)+37);
  if([1,20,31,80,160,500,1000].includes(stage))console.log(r);
}
for(const stage of [31,80,160,500,1000])for(let seed=1;seed<=3;seed++)
  context.checkStage(stage,stage*1000+seed);
context.checkClone(160);
console.log('PASS: 65 stages and 15 extra randomized assemblies, including guards, curves, collisions, full legal solutions and worker cloning');
