import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SOFA_ACCESSORY_IMAGES} from '../house-test/sofa-v1-registration.js?v=20261006-floordata1';
import {SOFA_CUSHION_SEATS} from '../house-test/sofa-cushion-placement.js?v=20261006-floordata1';
import {sofaAccessoryLayers} from '../house-test/sofa-accessory-art.js?v=20261006-floordata1';
import {validateSofaCushions,installSofaCushions} from '../house-test/sofa-cushion-data.js';
const original={seats:structuredClone(SOFA_CUSHION_SEATS),images:structuredClone(SOFA_ACCESSORY_IMAGES)};
const data=JSON.parse(fs.readFileSync(new URL('../house-test/assets/sofa-cushions-v1.runtime.json',import.meta.url)));
const poses=['left','center','right'].flatMap(direction=>[0,.81].map(elevation=>({direction,elevation,x:3,y:3})));
const layers=()=>Object.keys(original.seats).flatMap(id=>poses.map(p=>sofaAccessoryLayers(id,p)));
test('data migration preserves every cushion image, seat and rendered triangle',()=>{
 const before=layers(),prepared=validateSofaCushions(data);
 for(const [id,entry]of Object.entries(prepared)){assert.deepEqual(entry.seat,original.seats[id]);assert.deepEqual(entry.views,original.images[id]);}
 installSofaCushions(prepared);assert.deepEqual(layers(),before);assert.deepEqual(SOFA_ACCESSORY_IMAGES,original.images);
});
test('invalid final view, dimensions or seat never partially replaces the set',()=>{
 for(const change of [v=>delete v.cushions['sage-cushion'],v=>v.cushions['peach-cushion'].seat.width=.9,v=>v.cushions['peach-cushion'].seat.u=-1,v=>v.cushions['peach-cushion'].seat.bottom=2,v=>v.cushions['pink-check-cushion'].views.right.image='../bad.png',v=>v.cushions['pink-check-cushion'].views.right.sourceRect[2]=0,v=>v.cushions['sage-cushion'].seat.v=NaN]){
  const bad=structuredClone(data);change(bad);assert.throws(()=>installSofaCushions(validateSofaCushions(bad)));assert.deepEqual(SOFA_CUSHION_SEATS,original.seats);assert.deepEqual(SOFA_ACCESSORY_IMAGES,original.images);
 }
});
