import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SOFA_V1} from '../house-test/sofa-v1-registration.js?v=20261006-sofaparts1';
import {validateSofaRegistration,installSofaRegistration} from '../house-test/sofa-registration-data.js';
const original=structuredClone(SOFA_V1),data=JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-registration-v1.runtime.json',import.meta.url)));
test('moving registration to data preserves every view, anchor, PNG and draw order',()=>{
 const prepared=validateSofaRegistration(data);assert.deepEqual(prepared,original);installSofaRegistration(prepared);assert.deepEqual(SOFA_V1,original);
});
test('bad registration cannot partly replace installed sofa data',()=>{
 for(const change of [v=>delete v.views.center,v=>v.views.right.canvas[0]=0,v=>v.views.left.parts.body='../private.png',v=>v.views.right.placement.width=4,v=>v.views.left.order.push('body'),v=>v.views.right.mesh.anchors[0].world.x=-1,v=>v.views.right.mesh.indices=[[0,0,1]]]){
  const bad=structuredClone(data);change(bad);assert.throws(()=>{const checked=validateSofaRegistration(bad);installSofaRegistration(checked);});assert.deepEqual(SOFA_V1,original);
 }
});
