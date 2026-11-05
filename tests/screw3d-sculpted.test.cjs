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
  globalThis.checkConnectedAnimalMesh=whole=>{
    const parent=[],vertices=new Map(),faces=[];
    const vertex=p=>{
      const key=p.map(v=>v.toFixed(4)).join(',');
      if(vertices.has(key))return vertices.get(key);
      const id=parent.length;parent.push(id);vertices.set(key,id);return id;
    };
    const find=id=>{while(parent[id]!==id){parent[id]=parent[parent[id]];id=parent[id];}return id;};
    const unite=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
    for(const E of whole.filter(e=>e.skinRole!=='pedestal')){
      for(const face of E.skinFastGeom.faces){
        const ids=face.idx.map(i=>vertex(E.skinFastGeom.verts[i].map((p,j)=>p+E.c[j])));
        unite(ids[0],ids[1]);unite(ids[1],ids[2]);faces.push(ids[0]);
      }
    }
    assert.ok(faces.length>0,'the animal model must have a visible curved mesh');
    assert.equal(new Set(faces.map(find)).size,1,
      'every animal paw and leg must join the body as one continuous model');
  };
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
    if(['토끼','돼지','소','펭귄'].includes(m.name)){
      checkConnectedAnimalMesh(whole);
      const cosmetic=m.els.filter(e=>e.kind==='plate'&&!e.guard&&!e.diagonal);
      assert.ok(cosmetic.length>0,'animal scenes have working fastening plates');
      assert.ok(cosmetic.every(e=>e.skinPlate&&e.visualMountOnly),
        'old square fastening plates, including multi-part ones, must not protrude from the curved animal');
    }
    if(stage>=31)assert.ok(guards.length>=1,'hard stages include genuine extraction obstacles');
    if(stage>=31)assert.ok(m.screws.some(s=>!s.guard&&guards.includes(blocked(s,m))),
      'an intended screw is physically blocked by a removable guard');
    for(const guard of guards){
      assert.equal(m.refs.get(guard).filter(s=>s.guard).length,3,'each gate has three removable screws');
      if(guard.visualOffset){
        assert.ok(guard.guardTarget.skinMount,'a moved guard stays attached to its protected curved-surface screw');
        for(const s of m.refs.get(guard).filter(s=>s.guard))
          assert.ok(Math.hypot(...sub(s.skinMount.p,add(s.p,guard.visualOffset)))<1e-8,
            'all three guard screw heads follow the guard plate');
      }
    }
    const mounts=m.screws.filter(s=>s.skinMount&&!s.guard);
    assert.ok(mounts.length>=3,'every level shows actual surface-mounted screws');
    for(const s of mounts){
      const anchor=s.skinMount;
      assert.ok(anchor.p.every(Number.isFinite)&&anchor.a.every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...anchor.a)-1)<1e-5,'surface-mounted head is normal to the curved body');
      assert.ok(anchor.surfaceError<GRID*.03,'the fastening seat touches the rendered SDF surface');
      assert.ok(anchor.gap<GRID*2.2,'no fastener is projected into a distant unconnected part');
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
  globalThis.checkAnimalOcclusion=()=>{
    const triangle=[{x:50,y:50},{x:85,y:50},{x:68,y:85}];
    const skin={isSkin:true,owner:{},alpha:1,polys:[{
      pts:[{x:40,y:40},{x:95,y:40},{x:95,y:95},{x:40,y:95}],depth:[0,0,.8]}]};
    const rear={owner:{faceFeature:true},polys:[{pts:triangle,depth:[0,0,.6]}]};
    maskSculptDetails([skin,rear],null);
    assert.equal(rear.polys[0].visible.length,0,'the body hides a rear ear, muzzle or tail completely');
    const front={owner:{faceFeature:true},polys:[{pts:triangle,depth:[0,0,.9]}]};
    maskSculptDetails([skin,front],null);
    assert.equal(front.polys[0].visible.length,1,'a front ear stays visible');
    const crossingSkin={isSkin:true,owner:{},alpha:1,polys:[{
      pts:[{x:40,y:40},{x:66,y:40},{x:66,y:95},{x:40,y:95}],depth:[0,0,.8]}]};
    const partial={owner:{faceFeature:true},polys:[{pts:triangle,depth:[0,0,.6]}]};
    maskSculptDetails([crossingSkin,partial],null);
    const area=polys=>polys.reduce((sum,p)=>sum+Math.abs(polyArea(p)),0);
    assert.ok(area(partial.polys[0].visible)>0&&area(partial.polys[0].visible)<area([triangle]),
      'an ear crossing the silhouette is clipped only where the front body covers it');
    const screw={owner:{p:[0,0,0]},polys:[{pts:triangle,depth:[0,0,.6],visible:[triangle]}]};
    maskSculptDetails([skin,screw],null);
    assert.equal(screw.polys[0].visible.length,0,'surface geometry also hides screw heads on the far side');
    const transparent={isSkin:true,owner:{},alpha:1,polys:[{
      pts:skin.polys[0].pts,depth:[0,0,.8]}]};
    const xray={owner:{faceFeature:true},polys:[{pts:triangle,depth:[0,0,.6]}]};
    maskSculptDetails([transparent,xray],transparent.owner);
    assert.equal(xray.polys[0].visible.length,1,'the deliberate x-ray action can reveal hidden parts');
  };
`,context);

context.checkScrewBlocksScrew();
context.checkAnimalOcclusion();
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
