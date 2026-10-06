import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FLOOR_BLANKET_REGISTRATION} from '../house-test/floor-blanket-registration.js?v=20261006-sofaparts1';
import {blanketFloorArtwork} from '../house-test/accessory-art.js?v=20261006-sofaparts1';
import {validateFloorBlanket,installFloorBlanket} from '../house-test/floor-blanket-data.js';
const data=JSON.parse(fs.readFileSync(new URL('../house-test/assets/floor-blanket-v1.runtime.json',import.meta.url))),original=structuredClone(FLOOR_BLANKET_REGISTRATION);
const render=()=>['left','center','right'].flatMap(direction=>[[0,0],[3,4],[7,1]].map(([x,y])=>blanketFloorArtwork({}, {direction,x,y},null,direction==='center'?{w:2,d:1.5}:{w:1.5,d:2})));
test('migration preserves every PNG, registration, projected triangle, bounds and footprint',()=>{
 const before=render(),prepared=validateFloorBlanket(data);assert.deepEqual(prepared,original);
 installFloorBlanket(prepared);assert.deepEqual(render(),before);
});
test('malformed or unsafe final view never partly replaces the installed data',()=>{
 for(const change of [v=>delete v.views.center,v=>v.dimensions.width=3,v=>v.views.right.image='../bad.png',v=>v.views.right.canvas[0]=0,v=>v.views.right.sourceCorners[0]=v.views.right.sourceCorners[1],v=>v.views.right.sourceCorners.reverse(),v=>v.views.right.normalizedFloorCorners[0][0]=2,v=>v.views.right.alphaHull=[],v=>v.views.right.alphaHull[0][0]=NaN,v=>v.views.right.sourceSha256='invalid',v=>v.views.right.normalizedFloorCorners=[[0,0],[1,0],[.6,1],[.4,1]]]){
  const bad=structuredClone(data);change(bad);assert.throws(()=>installFloorBlanket(validateFloorBlanket(bad)));assert.deepEqual(FLOOR_BLANKET_REGISTRATION,original);
 }
});
test('updated registration reaches renderer and refreshes its source-grid cache',()=>{
 const before=render(),changed=structuredClone(data);changed.views.center.canvas[0]+=1;
 installFloorBlanket(validateFloorBlanket(changed));const after=render();assert.notDeepEqual(after,before);
 assert.equal(Math.max(...after[3].art.triangles.flatMap(t=>t.source.map(p=>p[0]))),changed.views.center.canvas[0]);
 installFloorBlanket(validateFloorBlanket(data));assert.deepEqual(render(),before);
});
