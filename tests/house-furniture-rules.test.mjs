import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FLOOR,ROOM,CEILING_CORNERS,normalize,normalizePlacement,canPlaceFurniture,floorCell,roomPoint} from '../house-test/model.js';
import {FURNITURE,itemSize,contactBounds} from '../house-test/furniture-catalog.js';
import {furnitureGeometry,transformPoint} from '../house-test/furniture.js';

const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
for(const [i,[x,y]]of [[0,0],[10,0],[10,7],[0,7]].entries()){const p=roomPoint(x,y,ROOM.wallHeight);assert.ok(Math.hypot(p.x-CEILING_CORNERS[i].x,p.y-CEILING_CORNERS[i].y)<1e-8,'ceiling calibration');}
let count=0;
for(const [id,item]of Object.entries(FURNITURE).filter(([id])=>id==='bookshelf'))for(const direction of item.directions){
 const size=itemSize(id,direction);assert.ok(fs.existsSync(new URL('../house-test/'+item.views[direction].image,import.meta.url)));
 assert.equal(new Set(Object.values(item.views).map(view=>view.image)).size,3,'three separate authored view assets');
 for(let y=0;y<=FLOOR.depth-size.d;y+=FLOOR.step)for(let x=0;x<=FLOOR.width-size.w;x+=FLOOR.step){
  const placement={direction,x,y},g=furnitureGeometry(id,placement),contact=contactBounds(id,placement);
  assert.ok(g.width>0&&g.height>0&&Number.isFinite(g.width+g.height));
  assert.ok(contact.x>=x&&contact.y>=y&&contact.x+contact.w<=x+size.w+1e-8&&contact.y+contact.d<=y+size.d+1e-8);
  const footprint=g.footprint.map(p=>floorCell(p.x,p.y));
  const rear={center:[0,1],left:[0,3],right:[1,2]}[direction];for(const i of rear)assert.ok(Math.hypot(g.footprint[i].x-g.reserved[i].x,g.footprint[i].y-g.reserved[i].y)<1e-8,'rear corners must stay on grid reservation corners');
  assert.ok(Math.abs((direction==='center'?contact.w:contact.d)-item.width)<1e-9,'front clearance must not shrink width');
  assert.ok(Math.abs(area(footprint)/(size.w*size.d)-2/3)<1e-9,'actual base area must be two thirds, not both lengths reduced to two thirds');
  for(const face of g.faces){if(!face.matrix)continue;
   for(let i=0;i<4;i++){const p=transformPoint(face.matrix,face.source[i]);assert.ok(Math.hypot(p.x-face.target[i].x,p.y-face.target[i].y)<1e-6);}
   if(face.part==='body'&&face.plane!=='top'){
    const p=footprint[face.corners[0]],unit=roomPoint(p.x,p.y,0).y-roomPoint(p.x,p.y,1).y;
    assert.ok(Math.abs((face.target[3].y-face.target[0].y)/unit-item.height)<1e-8,'clearance must not shrink height');
   }
  }
  assert.ok(canPlaceFurniture(id,placement));count++;
 }
}
assert.equal(count,639);
const atLeft=furnitureGeometry('bookshelf',{direction:'center',x:0,y:2}),atCenter=furnitureGeometry('bookshelf',{direction:'center',x:4,y:2}),atRight=furnitureGeometry('bookshelf',{direction:'center',x:8,y:2});
const bodyPlanes=g=>g.faces.filter(f=>f.part==='body').map(f=>f.plane+':'+f.corners.join(','));
assert.ok(bodyPlanes(atLeft).includes('side:2,1'),'left-of-camera placement exposes the right side');
assert.ok(bodyPlanes(atRight).includes('side:0,3'),'right-of-camera placement exposes the left side');
assert.ok(!bodyPlanes(atCenter).some(f=>f.startsWith('side:')),'central frontal placement has no artificial side panel');
assert.notDeepEqual(bodyPlanes(atLeft),bodyPlanes(atRight));
const widthRatio=g=>{const f=g.faces.find(f=>f.part==='body'&&f.plane==='front');return (f.target[1].x-f.target[0].x)/g.width;};
assert.ok(widthRatio(atCenter)>widthRatio(atLeft),'visible face proportions must change with room position');

assert.equal(canPlaceFurniture('bookshelf',{direction:'right',x:9.5,y:0}),false);
assert.equal(canPlaceFurniture('bookshelf',{direction:'right',x:9,y:0},[{id:'bookshelf',direction:'right',x:9,y:1}]),false);
assert.equal(canPlaceFurniture('bookshelf',{direction:'right',x:9,y:0},[{id:'bookshelf',direction:'right',x:8,y:0}]),true);
assert.equal(normalizePlacement('missing',{direction:'right',x:0,y:0}),null);
assert.equal(normalizePlacement('bookshelf',{direction:'back',x:0,y:0}),null);
assert.deepEqual(normalizePlacement('bookshelf',{direction:'right',x:99.2,y:-5}),{direction:'right',x:9,y:0});
for(const [direction,x,wanted]of [['right',7,9],['left',0,0],['center',3,4],['right',6.5,7.5]]){
 const upgraded=normalize({version:2,rooms:[{x:0,y:0,curtains:false,shelf:{direction,x,y:1.5}}],diary:'keep me'});
 assert.equal(upgraded.version,5);assert.equal(upgraded.rooms[0].shelf.x,wanted);assert.equal(upgraded.rooms[0].curtains,false);assert.equal(upgraded.diary,'keep me');
 assert.deepEqual(normalize(upgraded),upgraded,'migration runs once');
}
for(const id of ['desk','chair'])for(const direction of ['left','center','right']){
 const placement={direction,x:direction==='right'?8.5:0,y:3},g=furnitureGeometry(id,placement);
 assert.ok(g.faces.some(f=>f.part===(id==='desk'?'tabletop':'seat'))&&g.faces.some(f=>f.part==='leg-0'));
 assert.ok(g.faces.every(f=>f.matrix&&f.target.every(p=>Number.isFinite(p.x+p.y))));
 for(const face of g.faces)for(let i=0;i<4;i++){const [x,y]=face.source[i];assert.ok(face.matrix[6]*x+face.matrix[7]*y+face.matrix[8]>0,'CSS must not clip visible furniture faces behind its projection plane');const p=transformPoint(face.matrix,face.source[i]);assert.ok(Math.hypot(p.x-face.target[i].x,p.y-face.target[i].y)<1e-6);}
}
const previous={version:3,rooms:[{x:0,y:0,curtains:true,shelf:{direction:'right',x:9,y:4}}],diary:'kept'};
const next=normalize(previous);assert.deepEqual(next.rooms[0].shelf,previous.rooms[0].shelf);assert.ok(next.rooms[0].furniture.desk);
assert.ok(canPlaceFurniture('desk',next.rooms[0].furniture.desk,[{id:'bookshelf',...next.rooms[0].shelf}]),'new desk finds free space without moving an existing shelf');
assert.deepEqual(normalize(next),next,'desk migration runs once');
assert.equal(canPlaceFurniture('chair',{direction:'left',x:8,y:5},[{id:'desk',direction:'right',x:8.5,y:4}]),false);
const chairSave=normalize({version:4,rooms:[{x:0,y:0,shelf:null,furniture:{desk:{direction:'right',x:8,y:3}}}]});
assert.deepEqual(chairSave.rooms[0].furniture.desk,{direction:'right',x:8,y:3});
assert.deepEqual(chairSave.rooms[0].furniture.chair,{direction:'left',x:7,y:4});
assert.deepEqual(normalize(chairSave),chairSave);
console.log('PASS: desk/chair components, non-overlapping migration, 639 bookshelf poses, 2/3 contact area, fixed height, face anchors, reserved-space collision, half-cell bounds and one-time wider-room migration');
