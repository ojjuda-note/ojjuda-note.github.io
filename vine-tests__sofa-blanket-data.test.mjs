import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SOFA_ACCESSORY_IMAGES} from '../house-test/sofa-v1-registration.js?v=20261006-vine1';
import {getSofaBlanketDrape} from '../house-test/sofa-blanket-drape.js?v=20261006-vine1';
import {sofaAccessoryLayers,sofaAccessoryPoseValid} from '../house-test/sofa-accessory-art.js?v=20261006-vine1';
import {validateSofaBlanket,installSofaBlanket} from '../house-test/sofa-blanket-data.js';
const dirs=['left','center','right'],data=JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-blanket-v1.runtime.json',import.meta.url)));
const original=structuredClone(SOFA_ACCESSORY_IMAGES),drapes=()=>dirs.map(getSofaBlanketDrape),beforeDrapes=drapes();
const poses=dirs.map(direction=>({direction,x:3,y:3,elevation:.025,mode:'sofa'}));
const layers=()=>poses.map(p=>sofaAccessoryLayers('blanket-sofa',p));
test('moving blanket data preserves original images, folds, layer order and every triangle',()=>{
 const before=layers(),valid=poses.map(p=>sofaAccessoryPoseValid('blanket-sofa',p)),prepared=validateSofaBlanket(data);
 installSofaBlanket(prepared);assert.deepEqual(drapes(),beforeDrapes);assert.deepEqual(SOFA_ACCESSORY_IMAGES,original);assert.deepEqual(layers(),before);assert.deepEqual(poses.map(p=>sofaAccessoryPoseValid('blanket-sofa',p)),valid);
});
test('invalid last view and collapsed folds cannot partly replace the blanket',()=>{
 for(const change of [v=>delete v.views.center,v=>v.views.right.image='../bad.png',v=>v.views.right.sourceRect[2]=0,v=>v.views.right.drape.direction='left',v=>v.views.right.drape.referenceDimensions.width=4,v=>v.views.right.drape.rows[1][0]=0,v=>v.views.right.drape.rows[1][2]=-1,v=>{v.views.right.drape.rows[1][1]=v.views.right.drape.rows[0][1];v.views.right.drape.rows[1][2]=v.views.right.drape.rows[0][2];}]){
  const bad=structuredClone(data);change(bad);assert.throws(()=>installSofaBlanket(validateSofaBlanket(bad)));assert.deepEqual(drapes(),beforeDrapes);assert.deepEqual(SOFA_ACCESSORY_IMAGES,original);
 }
});
test('data updates reach the renderer and getters return detached copies',()=>{
 const before=layers(),changed=structuredClone(data);changed.views.center.drape.centerU=.82;
 installSofaBlanket(validateSofaBlanket(changed));assert.equal(getSofaBlanketDrape('center').centerU,.82);
 const copy=getSofaBlanketDrape('center');copy.rows[0][2]=-9;assert.notEqual(getSofaBlanketDrape('center').rows[0][2],-9);
 assert.notDeepEqual(layers(),before);
 installSofaBlanket(validateSofaBlanket(data));assert.deepEqual(drapes(),beforeDrapes);
});
