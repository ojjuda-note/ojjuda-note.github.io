// The user's October 6 composition: unrotated side pictures surrounding one
// angled body picture. These are crops of supplied pixels, not new drawings.
import {floorPoint,roomPoint} from './model.js?v=20261006-assembly1';

export const SOFA_ORIGINAL_PARTS={
 side:{image:'assets/sofa-original-layers-v1/side.png',size:[1262,791],feet:[[87,786],[1171,786]],height:.94,supportY:640,supportHeight:(786-640)/786*.98},
 body:{image:'assets/sofa-original-layers-v1/body.png',size:[970,858],topHeight:1.32,bottomHeight:.43,nearHeight:1.4,nearInset:.14,farInset:.2824174346953029,
  supportAnchors:[[10,250],[620,0],[949,559],[506,857]],
  outline:[[0,278],[1,269],[2,264],[3,261],[6,254],[8,251],[13,245],[18,240],[23,236],[77,205],[81,203],[460,43],[575,1],[585,0],[627,0],[643,2],[651,6],[659,11],[681,32],[959,347],[961,351],[963,357],[964,361],[966,373],[969,394],[969,405],[957,549],[949,559],[940,567],[924,581],[666,755],[587,807],[509,856],[506,857],[504,857],[482,855],[473,853],[303,805],[184,771],[67,737],[32,726],[31,725],[26,700],[18,637],[1,339],[0,316]]}
};
const quad=(source,target)=>[[0,1,2],[0,2,3]].map(ids=>({source:ids.map(i=>source[i]),target:ids.map(i=>target[i])}));
const corners=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
// One continuous perspective adjustment keeps the original body intact.
function pictureMap(source,target){
 const rows=[];
 source.forEach(([x,y],i)=>{const {x:u,y:v}=target[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
 for(let col=0;col<8;col++){
  let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
  const d=rows[col][col];if(Math.abs(d)<1e-10)throw new RangeError('Invalid sofa picture alignment.');
  for(let j=col;j<=8;j++)rows[col][j]/=d;
  for(let row=0;row<8;row++)if(row!==col){const f=rows[row][col];for(let j=col;j<=8;j++)rows[row][j]-=f*rows[col][j];}
 }
 const m=[...rows.map(row=>row[8]),1];
 return ([x,y])=>{const w=m[6]*x+m[7]*y+1;if(w<=0)throw new RangeError('Reversed sofa picture.');return {x:(m[0]*x+m[1]*y+m[2])/w,y:(m[3]*x+m[4]*y+m[5])/w};};
}

export function originalSofaArtwork(item,placement,contact,size,parts=SOFA_ORIGINAL_PARTS){
 const {x,y}=placement,{side,body}=parts;
 const farY=y,nearY=y+item.width;
 const panel=(id,depth)=>{
  const [sw,sh]=side.size;
  // Both feet and the rail stay attached to this one picture. One horizontal
  // room row guarantees horizontal edges and straight legs at every position.
  const fixedSupport=Number.isFinite(side.supportHeight),footY=side.feet[0][1];
  const at=(sx,sy)=>roomPoint(x+sx/sw*item.depth,depth,fixedSupport?
   (sy<=side.supportY?side.supportHeight+(side.supportY-sy)/side.supportY*(side.height-side.supportHeight):(footY-sy)/(footY-side.supportY)*side.supportHeight):
   (footY-sy)/footY*side.height);
  // Lower the upholstery without changing the attached wood or feet.
  const bands=fixedSupport?[[0,side.supportY],[side.supportY,sh]]:[[0,sh]];
  const triangles=bands.flatMap(([start,end])=>{const source=corners(0,start,sw,end-start);return quad(source,source.map(([sx,sy])=>at(sx,sy)));});
  return {id,image:side.image,triangles,feet:side.feet.map(([sx,sy])=>at(sx,sy))};
 };
 const rear=panel('right-arm',farY),front=panel('left-arm',nearY);
 const near=floorPoint(x,nearY),far=floorPoint(x+item.depth,farY);
 const left=near.x+2,right=far.x-2,top=roomPoint(x,farY,body.topHeight).y,bottom=roomPoint(x,nearY,body.bottomHeight).y;
 if(right<=left||bottom<=top)throw new RangeError('The original sofa picture cannot face this position.');
 let triangles=quad(corners(0,0,...body.size),corners(left,top,right-left,bottom-top).map(([x,y])=>({x,y})));
 let supportLine,bodyBounds;
 if(body.supportAnchors&&Number.isFinite(side.supportY)){
  const supportHeight=side.supportHeight??(side.feet[0][1]-side.supportY)/side.feet[0][1]*side.height;
  const nearSupport=roomPoint(x+item.depth*.98,nearY,supportHeight),farSupport=roomPoint(x+item.depth*.98,farY,supportHeight);
  if(farSupport.x<=nearSupport.x)throw new RangeError('The body support edge is reversed.');
  const [sw,sh]=body.size;
  const topTargets=Number.isFinite(body.nearHeight)?[
   roomPoint(x+item.depth*body.nearInset,nearY,body.nearHeight),roomPoint(x+item.depth*body.farInset,farY,body.topHeight)
  ]:[{x:left+(right-left)*.062,y:top+body.supportAnchors[0][1]/sh*(bottom-top)},
   {x:left+body.supportAnchors[1][0]/sw*(right-left),y:top}];
  const targets=[...topTargets,farSupport,nearSupport];
  const at=pictureMap(body.supportAnchors,targets);
  triangles=[];
  // Subdivide both axes so the 2D painter samples a smooth single picture.
  const n=24;
  for(let row=0;row<n;row++)for(let col=0;col<n;col++){
   const source=corners(col*sw/n,row*sh/n,sw/n,sh/n);
   triangles.push(...quad(source,source.map(at)));
  }
  supportLine=[at(body.supportAnchors[3]),at(body.supportAnchors[2])];
  bodyBounds=body.outline?.map(at);
 }

 const middle={id:'body',image:body.image,triangles,...(bodyBounds?{bounds:bodyBounds}: {})};
 const layers=[rear,middle,front],points=layers.flatMap(layer=>layer.bounds||layer.triangles.flatMap(t=>t.target));
 const minX=Math.min(...points.map(p=>p.x))-2,minY=Math.min(...points.map(p=>p.y))-2,maxX=Math.max(...points.map(p=>p.x))+2,maxY=Math.max(...points.map(p=>p.y))+2;
 const footprint=corners(contact.x,contact.y,contact.w,contact.d).map(p=>floorPoint(...p));
 return {footprint,reserved:corners(x,y,size.w,size.d).map(p=>floorPoint(...p)),contact,faces:[],anchors:[...rear.feet,...front.feet],
  left:minX,top:minY,width:maxX-minX,height:maxY-minY,
  art:{kind:'sofa',layers,foreground:['left-arm'],sourceMode:'original-layers',...(supportLine?{supportLine}: {})}};
}
