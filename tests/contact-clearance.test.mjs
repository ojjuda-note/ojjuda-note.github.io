import assert from 'node:assert/strict';
import {belowContactPixels,placedContactBoxes,contactBoxesInsideRoom,contactBoxesOverlap} from '../house-test/anchor-editor/contact-clearance.js';

// Only the small painted tail counts. Empty image padding extends far below it.
const mesh={referenceDimensions:{width:1,depth:1,height:1},anchors:[
 {source:{x:0,y:0},world:{x:0,y:0,z:1},kind:'support'},
 {source:{x:10,y:0},world:{x:1,y:0,z:1},kind:'support'},
 {source:{x:10,y:20},world:{x:1,y:0,z:-1},kind:'support'},
 {source:{x:0,y:20},world:{x:0,y:0,z:-1},kind:'support'}
],indices:[[0,1,2],[0,2,3]]};
const pixels={width:10,height:20,data:new Uint8ClampedArray(800)};
for(let y=5;y<15;y++)for(let x=3;x<6;x++)pixels.data[(y*10+x)*4+3]=255;
const profile=belowContactPixels(mesh,pixels);
assert(Math.abs(profile.minimum+.5)<1e-9,'transparent bottom padding is ignored');
assert(profile.boxes.length>0);
assert(profile.boxes.every(b=>b.minX>=.3-1e-8&&b.maxX<=.6+1e-8));
const p={direction:'center',x:2,y:3,width:1,depth:1,height:1,elevation:.5};
assert(contactBoxesInsideRoom(placedContactBoxes(profile,p)),'touching the floor is allowed');
assert(!contactBoxesInsideRoom(placedContactBoxes(profile,{...p,elevation:.49})),'painted leaves cannot enter the floor');
const boxes=placedContactBoxes(profile,{...p,elevation:1.5});
const low={minX:2.2,maxX:2.8,minY:2.9,maxY:3.1,minZ:0,maxZ:.9};
const high={...low,maxZ:1.4};
assert(!boxes.some(b=>contactBoxesOverlap(b,low)),'clear furniture below remains usable');
assert(boxes.some(b=>contactBoxesOverlap(b,high)),'a tall object touching the hanging part is blocked');
assert(boxes.some(b=>contactBoxesOverlap(high,b)),'overlap is symmetric');
const scaled=placedContactBoxes(profile,{...p,width:2,depth:2,height:2,elevation:1});
assert(Math.abs(Math.min(...scaled.map(b=>b.minZ)))<1e-9,'dimension changes scale the hanging length');
assert.equal(belowContactPixels(mesh,{...pixels,data:new Uint8ClampedArray(800)}).boxes.length,0);
console.log('CONTACT CLEARANCE PASS: actual alpha, source padding, floor contact, scaling and symmetric furniture obstruction');
