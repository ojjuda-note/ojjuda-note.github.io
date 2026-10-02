import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {deskArtwork} from '../house-test/desk-art.js';
import {registeredArtwork} from '../house-test/registered-artwork.js';
import {roomPoint} from '../house-test/model.js';
import {DESK_V7} from '../house-test/desk-v7-registration.js';
import {projectiveMap,transformPoint} from '../house-test/furniture.js';

// These hashes are from the approved furniture-maker exports. The production
// checkout does not ship the authoring application or its source project.
const APPROVED_PNG_SHA256={
 left:'b9099f196d96f25abe381c444253167db8dc8c47962d4b808ce515d6469b635f',
 center:'7fd613b22c7a57e52cbf171971ee1aa52e5d2bd6fa46c065bafa7271862db0a2',
 right:'7dc2e491295348e015710e04a7f2d3496d350948ed5cbb51679d44e12e19b3a8'
};
const APPROVED_WEBP_SHA256={
 left:'abdea712bf21f5b007eda0421d25b52b638a8ea505569b25b977d24224db09b6',
 center:'e8421fff07a4edf6f265fc58b4e90f4079fb7ccd53f8e6fddd99509a23c7a74b',
 right:'3a06f284cdf7d909b53e547c4550b3a4b76126579985295bc964654be694b5ac'
};
// Read the actual exported RGBA pixels without a browser or authoring-only
// dependency. PNG filters are decoded so floor checks inspect painted pixels.
function pngPixels(png){
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const chunks=[];let width,height;
 for(let p=8;p<png.length;){const size=png.readUInt32BE(p),name=png.subarray(p+4,p+8).toString('ascii'),data=png.subarray(p+8,p+8+size);if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}if(name==='IDAT')chunks.push(data);p+=12+size;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(width*height*4);
 assert.equal(raw.length,(stride+1)*height);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)],row=y*stride;assert.ok(filter<=4);for(let x=0;x<stride;x++){const a=x>=4?pixels[row+x-4]:0,b=y?pixels[row+x-stride]:0,c=y&&x>=4?pixels[row+x-stride-4]:0,predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];pixels[row+x]=(raw[y*(stride+1)+1+x]+predictor)&255;}}
 return {width,height,alpha:(x,y)=>x>=0&&y>=0&&x<width&&y<height?pixels[(y*width+x)*4+3]:0};
}
const close=(a,b,label,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} != ${b}`);
const area=points=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2;
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const measure=triangles=>triangles.reduce((sum,t)=>sum+Math.abs(area(t.source)),0);
function assertOwnership(triangles,registration){
 for(const t of triangles){
  const index=registration.layers.findIndex(l=>l.id===t.part),center=[0,1].map(axis=>t.source.reduce((sum,p)=>sum+p[axis],0)/3);
  for(const later of registration.layers.slice(index+1)){
   const sign=Math.sign(area(later.target));
   assert.ok(!later.target.every((p,i)=>sign*cross(p,later.target[(i+1)%4],center)>1e-6),'Duplicate flattened pixels on '+t.part);
  }
 }
}
for(const [direction,registration]of Object.entries(DESK_V7)){
 const png=readFileSync(new URL('../house-test/assets/desk-'+direction+'-v7.png',import.meta.url)),pixels=pngPixels(png);
 assert.equal(createHash('sha256').update(png).digest('hex'),APPROVED_PNG_SHA256[direction],'Approved maker PNG must remain byte-identical');
 assert.equal(registration.source.sha256,APPROVED_PNG_SHA256[direction]);
 const webp=readFileSync(new URL('../house-test/assets/desk-'+direction+'-v7.webp',import.meta.url));
 assert.equal(createHash('sha256').update(webp).digest('hex'),APPROVED_WEBP_SHA256[direction],'Lossless runtime WebP must remain byte-identical');
 assert.deepEqual([pixels.width,pixels.height],registration.canvas);assert.equal(registration.scale,3);assert.equal(registration.source.exportScale,3);
 const expectedPlacement={direction,x:direction==='left'?0:direction==='center'?3.5:9,y:direction==='center'?0:3.5,width:3,depth:1,height:1.4};
 assert.deepEqual(registration.placement,expectedPlacement);
 const size=direction==='center'?{w:3,d:1}:{w:1,d:3},pose={direction,x:registration.placement.x,y:registration.placement.y},contact={...pose,...size};
 const base=deskArtwork({height:1.4},pose,contact,size),sprite=base.art.sprite;
 assert.ok(sprite);assert.equal(base.art.triangles,undefined);assert.equal(sprite.image,'assets/desk-'+direction+'-v7.webp');
 close(sprite.width,pixels.width/registration.scale,'sprite width');close(sprite.height,pixels.height/registration.scale,'sprite height');
 registration.layers.forEach(layer=>layer.target.forEach(([x,y],i)=>{
  const expected=roomPoint(...layer.world[i]);
  close(sprite.x+x/registration.scale,expected.x,'reference x');close(sprite.y+y/registration.scale,expected.y,'reference y');
 }));
 for(const c of registration.contacts){
  assert.equal(c.world[2],0);const layer=registration.layers.find(l=>l.id===c.layer),i=layer.world.findIndex(w=>w.every((n,j)=>n===c.world[j]));
  assert.ok(i>=0,'Floor anchor must have a measured picture corner');assert.deepEqual(c.source,layer.target[i]);
  const [sx,sy]=c.source.map(Math.round);let painted=false;
  for(let y=sy-6;y<=sy;y++)for(let x=sx-6;x<=sx+6;x++)if(pixels.alpha(x,y)>64)painted=true;
  assert.ok(painted,`${direction}/${c.layer}: registered floor corner must touch actual exported wood pixels`);
 }
 assert.deepEqual(registration.anchors,registration.contacts.map(c=>c.world));
 const moves=direction==='right'?[[-.5,0],[0,-.5]]:direction==='left'?[[.5,0],[0,-.5]]:[[.5,0],[0,.5]];
 for(const [dx,dy]of moves){
  const movedPose={...pose,x:pose.x+dx,y:pose.y+dy},moved=deskArtwork({height:1.4},movedPose,{...contact,x:movedPose.x,y:movedPose.y},size);
  assert.equal(moved.art.sprite,undefined);assert.ok(moved.art.triangles.length>0);
  const maps=new Map(registration.layers.map(l=>[l.id,projectiveMap(l.target,l.world.map(([x,y,z])=>roomPoint(x+dx,y+dy,z)))]));
  for(const t of moved.art.triangles){
   assert.equal(t.image,sprite.image);assert.ok(Math.abs(area(t.source))>1e-7);
   assert.ok(maps.get(t.part),'Every painted plane has a valid independent projective mapping');
   t.source.forEach((point,i)=>{const expected=transformPoint(maps.get(t.part),point);close(t.target[i].x,expected.x,'moved x');close(t.target[i].y,expected.y,'moved y');});
  }
  assertOwnership(moved.art.triangles,registration);
  registration.anchors.forEach(([x,y,z],i)=>{const expected=roomPoint(x+dx,y+dy,z);close(moved.anchors[i].x,expected.x,'floor x');close(moved.anchors[i].y,expected.y,'floor y');});
  // Reversing every face's correspondence order preserves geometry and source
  // coverage. This exercises clockwise and counterclockwise clipping cutters.
  const reversed={...registration,layers:registration.layers.map(l=>({...l,target:[...l.target].reverse(),world:[...l.world].reverse()}))};
  const reverseResult=registeredArtwork(reversed,movedPose,contact,size);
  assertOwnership(reverseResult.art.triangles,reversed);
  close(measure(reverseResult.art.triangles),measure(moved.art.triangles),'winding-independent source coverage',1e-3);
 }
 console.log('PASS '+direction+': approved PNG hash/pixels, room registration, painted floor contacts, half-cell moves, ownership and both polygon windings');
}
