import {madeArtwork} from './custom-furniture.js?v=20261006-assembly1';
import {floorPoint,roomPoint,isDeskChairPair} from './model.js?v=20261006-assembly1';
import {FURNITURE,itemSize,itemLayer,itemHeight,contactBounds} from './furniture-catalog.js?v=20261006-assembly1';
import {paintFurniture} from './furniture-painter.js?v=20261006-assembly1';
import {bookshelfArtwork} from './bookshelf-art.js?v=20261006-assembly1';
import {sideTableArtwork} from './side-table-art.js?v=20261006-assembly1';
import {deskArtwork,deskChairForeground} from './desk-art.js?v=20261006-assembly1';
import {sofaArtwork,sofaForegroundLayers} from './sofa-art.js?v=20261006-assembly1';
import {sofaAccessoryArtwork,sofaAccessoryLayers} from './sofa-accessory-art.js?v=20261006-assembly1';
import {SOFA_CUSHION_SEATS,sofaCushionOrder} from './sofa-cushion-placement.js?v=20261006-assembly1';
import {blanketFloorArtwork} from './accessory-art.js?v=20261006-assembly1';
import {isBlanket,blanketMode} from './sofa-accessory-placement.js?v=20261006-assembly1';

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
 const item=FURNITURE[id],size=itemSize(id,s.direction,s),contact=contactBounds(id,s);
 if(!item||!size||!contact)return null;
 if(item.picture==='made')return madeArtwork(id,s,contact);
 if(item.picture==='side-table')return sideTableArtwork(item,s,contact,size);
 if(item.picture==='desk')return deskArtwork(item,s,contact,size);
 if(item.picture==='sofa')return sofaArtwork(item,s,contact,size);
 if(isBlanket(id))return blanketMode(id,s)==='sofa'?sofaAccessoryArtwork({...item,accessoryId:'blanket-sofa'},s,contact,size):blanketFloorArtwork(item,s,contact,size);
 if(item.picture==='sofa-accessory')return sofaAccessoryArtwork(item,s,contact,size);
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
export function renderFurniture(button,id,s,desk=null,sofa=null,scenePlacements=[]){
 const item=FURNITURE[id],geometry=furnitureGeometry(id,s),layer=itemLayer(id,s);if(!geometry)return null;
 Object.assign(button.style,{left:`${geometry.left}px`,top:`${geometry.top}px`,width:`${geometry.width}px`,height:`${geometry.height}px`,zIndex:String(layer==='floor'?4:10+Math.round(Math.max(...geometry.footprint.map(p=>p.y))))});
 button.dataset.x=s.x;button.dataset.y=s.y;button.dataset.direction=s.direction;button.dataset.furniture=id;
 if(isBlanket(id))button.dataset.mode=blanketMode(id,s);else delete button.dataset.mode;
 if(layer==='surface'||isBlanket(id))button.dataset.elevation=String(layer==='floor'?0:s.elevation??0);else delete button.dataset.elevation;
 if(geometry.art?.kind==='sofa-accessory'&&sofa){
  const size=itemSize(id,s.direction,s),sofaSize=itemSize('sofa',sofa.direction,sofa);
  const overlaps=s.x<sofa.x+sofaSize.w&&s.x+size.w>sofa.x&&s.y<sofa.y+sofaSize.d&&s.y+size.d>sofa.y;
  if(overlaps&&(s.elevation??0)+itemHeight(id,s)>.8&&(s.elevation??0)<FURNITURE.sofa.height){
   const sofaGeometry=furnitureGeometry('sofa',sofa),foreground=sofaForegroundLayers(sofaGeometry,sofa.direction);
   geometry.art.layers=geometry.art.layers.map(layer=>layer.sofaSurface?{...layer,eraseWith:foreground}:layer);
   const order=sofaCushionOrder(Object.keys(SOFA_CUSHION_SEATS),sofa.direction),rank=isBlanket(id)?0:order.indexOf(id)+1;
   button.style.zIndex=String(11+Math.round(Math.max(...sofaGeometry.footprint.map(p=>p.y)))+rank);
  }
 }
 if(layer==='surface'&&!isBlanket(id)){
  const size=itemSize(id,s.direction,s),fronts=[];
  for(const prop of scenePlacements.filter(p=>isBlanket(p.id)&&blanketMode(p.id,p)==='sofa')){
   const other=itemSize(prop.id,prop.direction,prop);
   if(s.x>=prop.x+other.w||s.x+size.w<=prop.x||s.y>=prop.y+other.d||s.y+size.d<=prop.y||(s.elevation??0)>prop.elevation+itemHeight(prop.id,prop))continue;
   fronts.push(...sofaAccessoryLayers(prop.id,prop).filter(layer=>layer.id==='blanket-sofa-front'));
  }
  if(fronts.length&&geometry.art.layers)geometry.art.layers=geometry.art.layers.map(layer=>({...layer,eraseWith:[...(layer.eraseWith||[]),...fronts]}));
 }
 if(layer==='surface'&&!item.wallMounted){
  const size=itemSize(id,s.direction,s);
  for(const support of scenePlacements){
   const supportItem=FURNITURE[support.id],supportSize=itemSize(support.id,support.direction,support);
   if(itemLayer(support.id,support)!=='standing'||!supportSize||(s.elevation??0)<supportItem.height-.02)continue;
   if(s.x>=support.x+supportSize.w||s.x+size.w<=support.x||s.y>=support.y+supportSize.d||s.y+size.d<=support.y)continue;
   const points=rectangle(contactBounds(support.id,support)).map(([x,y])=>floorPoint(x,y));
   let depth=10+Math.round(Math.max(...points.map(p=>p.y)));
   if(support.id==='chair'&&isDeskChairPair(desk,support))depth=Math.max(depth,12+Math.round(Math.max(...rectangle(contactBounds('desk',desk)).map(([x,y])=>floorPoint(x,y).y))));
   button.style.zIndex=String(Math.max(Number(button.style.zIndex),depth+1));
  }
 }
 if(item.wallMounted)button.style.zIndex='5';
 const canvas=document.createElement('canvas');canvas.className='furniture-paint';canvas.setAttribute('aria-hidden','true');
 button.dataset.renderState='loading';button.replaceChildren(canvas);
 const paints=[paintFurniture(canvas,geometry)];
 if(id==='chair'&&isDeskChairPair(desk,s)){
  const deskGeometry=furnitureGeometry('desk',desk);
  button.style.zIndex=String(12+Math.round(Math.max(...deskGeometry.footprint.map(p=>p.y),...geometry.footprint.map(p=>p.y))));
  const foreground=deskChairForeground(desk,contactBounds('desk',desk),itemSize('desk',desk.direction));
  if(foreground){
   const overlay=document.createElement('canvas');overlay.className='desk-chair-foreground';overlay.setAttribute('aria-hidden','true');
   Object.assign(overlay.style,{position:'absolute',pointerEvents:'none',left:(foreground.left-geometry.left)+'px',top:(foreground.top-geometry.top)+'px',width:foreground.width+'px',height:foreground.height+'px'});
   button.append(overlay);paints.push(paintFurniture(overlay,foreground));
  }
 }
 button.dataset.renderState='loading';
 Promise.all(paints).then(()=>{if(canvas.isConnected)button.dataset.renderState='ready';}).catch(error=>{if(canvas.isConnected){button.dataset.renderState='error';button.title='가구 이미지를 다시 불러오려면 눌러 주세요.';}console.error(error);});
 return geometry;
}
export const renderShelf=(button,s)=>renderFurniture(button,'bookshelf',s);
