import {floorPoint,roomPoint} from './model.js?v=20261001-plant1';
import {FURNITURE,itemSize,contactBounds} from './furniture-catalog.js?v=20261001-plant1';

export function projectiveMap(source,target){
 const rows=[];
 for(let i=0;i<4;i++){
  const [x,y]=source[i],{x:u,y:v}=target[i];
  rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);
 }
 for(let col=0;col<8;col++){
  let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
  const divisor=rows[col][col];if(Math.abs(divisor)<1e-10)return null;
  for(let j=col;j<=8;j++)rows[col][j]/=divisor;
  for(let row=0;row<8;row++)if(row!==col){const factor=rows[row][col];for(let j=col;j<=8;j++)rows[row][j]-=factor*rows[col][j];}
 }
 const matrix=[...rows.map(row=>row[8]),1];
 // Homographies are scale invariant, but CSS clips negative homogeneous w.
 // Keep the visible source quad in front of the CSS projection plane.
 const cx=source.reduce((sum,p)=>sum+p[0],0)/4,cy=source.reduce((sum,p)=>sum+p[1],0)/4;
 return matrix[6]*cx+matrix[7]*cy+matrix[8]<0?matrix.map(n=>-n):matrix;
}
export function transformPoint(m,[x,y]){const w=m[6]*x+m[7]*y+m[8];return {x:(m[0]*x+m[1]*y+m[2])/w,y:(m[3]*x+m[4]*y+m[5])/w};}
export function cssMatrix(m){return `matrix3d(${[m[0],m[3],0,m[6],m[1],m[4],0,m[7],0,0,1,0,m[2],m[5],0,m[8]].join(',')})`;}
const rectangle=b=>[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.d],[b.x,b.y+b.d]];
function componentBounds(part,contact,direction){
 const {u,v,w,d}=part;
 if(direction==='left')return {x:contact.x+v*contact.w,y:contact.y+(1-u-w)*contact.d,w:d*contact.w,d:w*contact.d};
 if(direction==='right')return {x:contact.x+(1-v-d)*contact.w,y:contact.y+u*contact.d,w:d*contact.w,d:w*contact.d};
 return {x:contact.x+u*contact.w,y:contact.y+v*contact.d,w:w*contact.w,d:d*contact.d};
}
export function furnitureGeometry(id,s){
 const item=FURNITURE[id],size=itemSize(id,s.direction),contact=contactBounds(id,s);
 if(!item||!size||!contact)return null;
 const cells=rectangle(contact),footprint=cells.map(([x,y])=>floorPoint(x,y));
 const reserved=rectangle({...s,...size}).map(([x,y])=>floorPoint(x,y));
 if(item.surface==='organic'){
  // Curved pottery and foliage keep their authored silhouette instead of
  // acquiring a box top/side. Its measured bottom center stays on the floor;
  // height and width still use the same calibrated room projection.
  const view=item.views[s.direction],texture=view.planes.silhouette,y=contact.y+contact.d/2;
  const target=[roomPoint(contact.x,y,item.height),roomPoint(contact.x+contact.w,y,item.height),roomPoint(contact.x+contact.w,y,0),roomPoint(contact.x,y,0)];
  const matrix=projectiveMap(texture.source,target),outline=texture.clip.map(p=>transformPoint(matrix,p));
  const left=Math.min(...outline.map(p=>p.x)),right=Math.max(...outline.map(p=>p.x)),top=Math.min(...outline.map(p=>p.y)),bottom=Math.max(...outline.map(p=>p.y));
  return {footprint,reserved,contact,faces:[{...texture,image:view.image,part:'body',plane:'silhouette',corners:[0,1],target,matrix,outline}],left,top,width:right-left,height:bottom-top};
 }
 const volumes=item.components?item.components.map(part=>({...part,bounds:componentBounds(part,contact,s.direction),topBounds:part.upper?componentBounds({...part,...part.upper},contact,s.direction):null})):[{id:'body',bounds:contact,base:0,height:item.height,views:item.views}];
 if(item.components)volumes.sort((a,b)=>a.base+a.height-b.base-b.height||Math.max(...rectangle(a.bounds).map(([x,y])=>floorPoint(x,y).y))-Math.max(...rectangle(b.bounds).map(([x,y])=>floorPoint(x,y).y)));
 for(const part of item.attachments||[]){
  const widthFraction=s.direction==='center'?part.widthFraction:part.depthFraction,depthFraction=s.direction==='center'?part.depthFraction:part.widthFraction;
  const w=contact.w*widthFraction,d=contact.d*depthFraction;
  volumes.push({...part,bounds:{x:contact.x+(contact.w-w)/2,y:contact.y+(contact.d-d)/2,w,d},base:item.height});
 }
 const frontEdge={left:'2:1',center:'3:2',right:'0:3'}[s.direction],faces=[];
 for(const volume of volumes){
  const points=rectangle(volume.bounds),ground=points.map(([x,y])=>roomPoint(x,y,volume.base)),top=rectangle(volume.topBounds||volume.bounds).map(([x,y])=>roomPoint(x,y,volume.base+volume.height));
  const edges=[[3,2]];
  if(ground[2].x<ground[1].x-.01)edges.unshift([2,1]);
  if(ground[3].x>ground[0].x+.01)edges.unshift([0,3]);
  const wood=[[662,220],[728,220],[728,400],[662,400]],view=volume.views[s.direction];
  // A wooden top closes each volume without baking extra decorative objects
  // into a front plane. The top box keeps its own width, depth and height.
  if(volume.cap!==false&&top[2].y>top[1].y){
   const texture=view.planes.top||{source:wood,clip:wood},target=s.direction==='left'?[top[3],top[0],top[1],top[2]]:s.direction==='right'?[top[1],top[2],top[3],top[0]]:top;
   const matrix=projectiveMap(texture.source,target);
   faces.push({...texture,image:view.planes.top?view.image:item.views.right.image,part:volume.id,plane:'top',corners:[0,1,2,3],target,matrix,outline:top});
  }
  for(const corners of edges){
   const edge=corners.join(':'),backEdge={left:'0:3',center:'1:0',right:'2:1'}[s.direction];
   const plane=edge===frontEdge?'front':edge===backEdge&&view.planes.back?'back':'side',sourceView=view.planes[plane]?view:volume.views.right,face=sourceView.planes[plane];
   const [a,b]=corners,target=[top[a],top[b],ground[b],ground[a]],matrix=projectiveMap(face.source,target);
   faces.push({...face,image:sourceView.image,part:volume.id,plane,corners,target,matrix,outline:matrix?face.clip.map(p=>transformPoint(matrix,p)):[]});
  }
 }
 const points=faces.flatMap(face=>face.outline),left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),upper=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
 return {footprint,reserved,contact,faces,left,top:upper,width:right-left,height:bottom-upper};
}
export const shelfGeometry=s=>furnitureGeometry('bookshelf',s);
export function renderFurniture(button,id,s){
 const item=FURNITURE[id],geometry=furnitureGeometry(id,s);if(!geometry)return null;
 Object.assign(button.style,{left:`${geometry.left}px`,top:`${geometry.top}px`,width:`${geometry.width}px`,height:`${geometry.height}px`,zIndex:String(10+Math.round(Math.max(...geometry.footprint.map(p=>p.y))))});
 button.dataset.x=s.x;button.dataset.y=s.y;button.dataset.direction=s.direction;button.dataset.furniture=id;
 button.replaceChildren();
 for(const face of geometry.faces){
  if(!face.matrix)continue;
  const image=document.createElement('img');image.src=face.image;image.alt='';image.draggable=false;image.className='bookshelf-face';image.dataset.plane=face.plane;image.dataset.part=face.part;image.dataset.corners=face.corners.join(',');
  image.style.width=item.imageSize.width+'px';image.style.height=item.imageSize.height+'px';
  const local=face.target.map(p=>({x:p.x-geometry.left,y:p.y-geometry.top}));
  image.style.transform=cssMatrix(projectiveMap(face.source,local));
  image.style.clipPath=`polygon(${face.clip.map(([x,y])=>`${x}px ${y}px`).join(',')})`;
  button.append(image);
 }
 return geometry;
}
export const renderShelf=(button,s)=>renderFurniture(button,'bookshelf',s);
