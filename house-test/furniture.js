import {floorPoint,roomPoint} from './model.js?v=20261002-side-table-v2';
import {FURNITURE,itemSize,contactBounds} from './furniture-catalog.js?v=20261002-side-table-v2';
import {paintFurniture} from './furniture-painter.js?v=20261002-side-table-v2';
import {bookshelfArtwork} from './bookshelf-art.js?v=20261002-side-table-v2';
import {sideTableArtwork} from './side-table-art.js?v=20261002-side-table-v2';
import {deskArtwork} from './desk-art.js?v=20261002-side-table-v2';
import {sofaArtwork} from './sofa-art.js?v=20261002-side-table-v2';
import {blanketFloorArtwork} from './accessory-art.js?v=20261002-side-table-v2';

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
 // Use one consistent homogeneous sign for the source image rectangle.
 const cx=source.reduce((sum,p)=>sum+p[0],0)/4,cy=source.reduce((sum,p)=>sum+p[1],0)/4;
 return matrix[6]*cx+matrix[7]*cy+matrix[8]<0?matrix.map(n=>-n):matrix;
}
export function transformPoint(m,[x,y]){const w=m[6]*x+m[7]*y+m[8];return {x:(m[0]*x+m[1]*y+m[2])/w,y:(m[3]*x+m[4]*y+m[5])/w};}
const rectangle=b=>[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.d],[b.x,b.y+b.d]];
export function furnitureGeometry(id,s){
 const item=FURNITURE[id],size=itemSize(id,s.direction),contact=contactBounds(id,s);
 if(!item||!size||!contact)return null;
 if(item.picture==='side-table')return sideTableArtwork(item,s,contact,size);
 if(item.picture==='desk')return deskArtwork(item,s,contact,size);
 if(item.picture==='sofa')return sofaArtwork(item,s,contact,size);
 if(id==='blanket-floor')return blanketFloorArtwork(item,s,contact,size);
 const cells=rectangle(contact),footprint=cells.map(([x,y])=>floorPoint(x,y));
 const reserved=rectangle({...s,...size}).map(([x,y])=>floorPoint(x,y));
 // Only registered picture corners are projected; there are no assembled parts.
 const regions=[{id:'body',bounds:contact,base:0,height:item.height,views:item.views}];
 for(const part of item.attachments||[]){
  const widthFraction=s.direction==='center'?part.widthFraction:part.depthFraction,depthFraction=s.direction==='center'?part.depthFraction:part.widthFraction;
  const w=contact.w*widthFraction,d=contact.d*depthFraction;
  regions.push({...part,bounds:{x:contact.x+(contact.w-w)/2,y:contact.y+(contact.d-d)/2,w,d},base:item.height});
 }
 const frontEdge={left:'2:1',center:'3:2',right:'0:3'}[s.direction],faces=[];
 for(const region of regions){
  const points=rectangle(region.bounds),ground=points.map(([x,y])=>roomPoint(x,y,region.base)),top=rectangle(region.bounds).map(([x,y])=>roomPoint(x,y,region.base+region.height));
  const edges=[[3,2]];
  if(ground[2].x<ground[1].x-.01)edges.unshift([2,1]);
  if(ground[3].x>ground[0].x+.01)edges.unshift([0,3]);
  const view=region.views[s.direction];
  for(const corners of edges){
   const edge=corners.join(':'),backEdge={left:'0:3',center:'1:0',right:'2:1'}[s.direction];
   const plane=edge===frontEdge?'front':edge===backEdge&&view.planes.back?'back':'side',sourceView=view.planes[plane]?view:region.views.right,face=sourceView.planes[plane];
   const [a,b]=corners,target=[top[a],top[b],ground[b],ground[a]],matrix=projectiveMap(face.source,target);
   faces.push({...face,image:sourceView.image,part:region.id,plane,corners,target,matrix,outline:matrix?face.clip.map(p=>transformPoint(matrix,p)):[]});
  }
 }
 const points=faces.flatMap(face=>face.outline),left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),upper=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
 const geometry={footprint,reserved,contact,faces,left,top:upper,width:right-left,height:bottom-upper};
 return id==='bookshelf'?bookshelfArtwork(geometry,s,item):geometry;
}
export const shelfGeometry=s=>furnitureGeometry('bookshelf',s);
export function renderFurniture(button,id,s){
 const item=FURNITURE[id],geometry=furnitureGeometry(id,s);if(!geometry)return null;
 Object.assign(button.style,{left:`${geometry.left}px`,top:`${geometry.top}px`,width:`${geometry.width}px`,height:`${geometry.height}px`,zIndex:String(item.layer==='floor'?4:10+Math.round(Math.max(...geometry.footprint.map(p=>p.y))))});
 button.dataset.x=s.x;button.dataset.y=s.y;button.dataset.direction=s.direction;button.dataset.furniture=id;
 const canvas=document.createElement('canvas');canvas.className='furniture-paint';canvas.setAttribute('aria-hidden','true');
 button.dataset.renderState='loading';button.replaceChildren(canvas);
 paintFurniture(canvas,geometry).catch(error=>{if(canvas.isConnected){button.dataset.renderState='error';button.title='가구 이미지를 다시 불러오려면 눌러 주세요.';}console.error(error);});
 return geometry;
}
export const renderShelf=(button,s)=>renderFurniture(button,'bookshelf',s);
