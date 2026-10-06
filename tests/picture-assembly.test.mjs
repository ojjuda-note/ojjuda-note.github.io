import assert from 'node:assert/strict';
import fs from 'node:fs';
import {approvedSofaAssembly,normalizeAssembly,assemblyGeometry,assemblyCheck} from '../house-test/anchor-editor/picture-assembly.js?v=20261006-assembly1';
import {originalSofaArtwork} from '../house-test/sofa-original-layers.js';
const read=(name,width,height)=>({data:'data:image/png;base64,'+fs.readFileSync(new URL('../house-test/assets/sofa-original-layers-v1/'+name+'.png',import.meta.url)).toString('base64'),width,height,name:name+'.png'});
const assembly=approvedSofaAssembly(read('side',1262,791),read('body',970,858));
const p={x:0,y:3,direction:'left',...assembly.dimensions};
const g=assemblyGeometry(assembly,p),original=originalSofaArtwork(assembly.dimensions,p,{x:0,y:3,w:1.5,d:3.5},{w:1.5,d:3.5});
for(let i=0;i<2;i++)assert(Math.hypot(g.body.supports[i].x-original.art.supportLine[i].x,g.body.supports[i].y-original.art.supportLine[i].y)<1e-8,'approved bottom connections retained');
for(const placement of [p,{...p,x:.5,y:2.5},{...p,x:2,y:1},{...p,width:3,depth:1.3,height:1.5}]){
 const changed=structuredClone(assembly);changed.sides.near.height=.8;changed.sides.far.height=.7;changed.body.nearHeight=1.55;
 for(const a of [assembly,changed]){const geo=assemblyGeometry(a,placement);assert.equal(geo.layers.map(l=>l.id).join(' '),'far body near');assert.equal(geo.anchors.length,4);
  for(const s of Object.values(geo.sides))for(const band of s.bands)assert(band.target[1].x>band.target[0].x&&band.target[1].y>band.target[0].y);
  for(const [i,id]of ['near','far'].entries())assert.deepEqual(geo.body.supports[i],geo.sides[id].support,'body remains on each support');
 }
 const a=assemblyGeometry(assembly,placement),b=assemblyGeometry(changed,placement);assert.deepEqual(a.body.supports,b.body.supports,'arm and body height do not move the wooden supports');assert.deepEqual(a.anchors,b.anchors,'changing upholstery height does not stretch the feet');
}
for(const edit of [a=>a.body.source.data='https://example.test/image.png',a=>a.sides.near.supportY=a.sides.near.footY,a=>a.sides.far.height=Infinity,a=>a.body.anchors[0]=a.body.anchors[1],a=>a.body.source.width=971]){const bad=structuredClone(assembly);edit(bad);assert.throws(()=>normalizeAssembly(bad));}
assert.equal(assemblyCheck(assembly,{...p,direction:'right'}).ok,false,'directions are never silently mirrored');
assert.deepEqual(normalizeAssembly(JSON.parse(JSON.stringify(assembly))),assembly,'all original pictures and controls survive save/open');
console.log('Picture assembly PASS: approved joins, grounded attached feet, independent height, movement, source validation and round trip.');
