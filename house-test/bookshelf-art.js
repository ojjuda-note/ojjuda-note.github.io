import {roomPoint} from './model.js?v=20261005-openbook1';

// The approved PNGs were drawn against these measured room placements.
// Keep the authored camera registration; positions are always world coordinates.
const authored={
 left:{placement:{x:0,y:1.5},contact:{x:0,y:1.5,w:2/3,d:2},scale:2.665153666874585,offset:{x:-160.46782821054722,y:-465.7467637302643}},
 center:{placement:{x:4,y:0},contact:{x:4,y:0,w:2,d:2/3},scale:3.4950574559943526,offset:{x:-2113.215154804168,y:-737.1620701371503}},
 right:{placement:{x:9,y:1.5},contact:{x:9+1/3,y:1.5,w:2/3,d:2},scale:2.665153666874585,offset:{x:-2821.3979841409023,y:-465.7467637302643}}
};
const rectangle=b=>[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.d],[b.x,b.y+b.d]];
const frontEdge={left:[2,1],center:[3,2],right:[0,3]};
function volume(contact,direction,part,item){
 if(part==='body')return {bounds:contact,base:0,height:item.height};
 const attachment=item.attachments.find(a=>a.id===part);
 const w=contact.w*(direction==='center'?attachment.widthFraction:attachment.depthFraction);
 const d=contact.d*(direction==='center'?attachment.depthFraction:attachment.widthFraction);
 return {bounds:{x:contact.x+(contact.w-w)/2,y:contact.y+(contact.d-d)/2,w,d},base:item.height,height:attachment.height};
}
const edgePoint=(bounds,edge,u)=>{
 const points=rectangle(bounds),a=points[edge[0]],b=points[edge[1]];
 return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];
};
export function bookshelfArtwork(geometry,placement,item){
 const record=authored[placement.direction];
 const baseline=placement.x===record.placement.x&&placement.y===record.placement.y;
 // A small raster gutter preserves the source edge antialiasing and mesh seams.
 const result={...geometry,left:geometry.left-3,top:geometry.top-3,width:geometry.width+6,height:geometry.height+6};
 if(baseline){
  result.art={kind:'bookshelf',sprite:{image:item.views[placement.direction].image,x:-record.offset.x/record.scale,y:-record.offset.y/record.scale,width:1024/record.scale,height:1536/record.scale}};
  return result;
 }
 const triangles=[];
 // Use the visible image regions. Crossing the room center hides
 // the open front and exposes a wood back, without flipping the bookshelf.
 for(const face of geometry.faces){
  const sourceDirection=/bookshelf-(left|center|right)-v2\.webp$/.exec(face.image)?.[1];
  if(!sourceDirection)continue;
  const sourceRecord=authored[sourceDirection];
  const sourceVolume=volume(sourceRecord.contact,sourceDirection,face.part,item);
  const targetVolume=volume(geometry.contact,placement.direction,face.part,item);
  const sourceEdge=face.plane==='front'?frontEdge[sourceDirection]:[3,2];
  const rows=[],nx=4,ny=8;
  for(let x=0;x<=nx;x++){
   rows[x]=[];
   for(let y=0;y<=ny;y++){
    const u=x/nx,v=y/ny;
     const sp=edgePoint(sourceVolume.bounds,sourceEdge,u),tp=edgePoint(targetVolume.bounds,face.corners,u);
     const sourceRoom=roomPoint(...sp,sourceVolume.base+sourceVolume.height*(1-v));
     rows[x][y]={source:[sourceRoom.x*sourceRecord.scale+sourceRecord.offset.x,sourceRoom.y*sourceRecord.scale+sourceRecord.offset.y],target:roomPoint(...tp,targetVolume.base+targetVolume.height*(1-v))};
   }
  }
  for(let x=0;x<nx;x++)for(let y=0;y<ny;y++){
   const q=[rows[x][y],rows[x+1][y],rows[x+1][y+1],rows[x][y+1]];
   for(const indexes of [[0,1,2],[0,2,3]])triangles.push({image:face.image,part:face.part,plane:face.plane,source:indexes.map(i=>q[i].source),target:indexes.map(i=>q[i].target)});
  }
 }
 result.art={kind:'bookshelf',triangles};
 return result;
}

// Expand each edge equally. Radial expansion leaves cracks in thin triangles;
// limit acute-corner extension so neighboring image planes cannot bleed across.
export function expandBookshelfTriangle(points,pad){
 const [p,q,r]=points,sign=Math.sign((q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x));
 if(!sign)return points;
 const normals=points.map((p,i)=>{const q=points[(i+1)%3],dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);return {x:sign*dy/length,y:-sign*dx/length};});
 return points.map((p,i)=>{
  const a=normals[(i+2)%3],b=normals[i];
  const factor=Math.min(pad/Math.max(.00001,1+a.x*b.x+a.y*b.y),2*pad/Math.max(.00001,Math.hypot(a.x+b.x,a.y+b.y)));
  return {x:p.x+(a.x+b.x)*factor,y:p.y+(a.y+b.y)*factor};
 });
}
