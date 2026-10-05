import {roomPoint} from './model.js?v=20261005-pencilcup1';
import {FLOOR_BLANKET_REGISTRATION} from './floor-blanket-registration.js?v=20261005-pencilcup1';

// A single flat illustration registered by measured cloth corners. Only those
// picture pixels are sampled; no material, shape or hidden cloth is generated.
function homography(source,target){
 const rows=[];
 for(let i=0;i<4;i++){
  const [x,y]=source[i],{x:u,y:v}=target[i];
  rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);
 }
 for(let col=0;col<8;col++){
  let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
  const divisor=rows[col][col];if(!Number.isFinite(divisor)||Math.abs(divisor)<1e-12)throw new RangeError('담요 기준점을 투영할 수 없습니다.');
  for(let j=col;j<=8;j++)rows[col][j]/=divisor;
  for(let row=0;row<8;row++)if(row!==col){const factor=rows[row][col];for(let j=col;j<=8;j++)rows[row][j]-=factor*rows[col][j];}
 }
 return [...rows.map(row=>row[8]),1];
}
function project(matrix,[x,y]){
 const w=matrix[6]*x+matrix[7]*y+matrix[8];
 if(!Number.isFinite(w)||Math.abs(w)<1e-10)throw new RangeError('담요 그림이 투영 범위를 벗어났습니다.');
 return {x:(matrix[0]*x+matrix[1]*y+matrix[2])/w,y:(matrix[3]*x+matrix[4]*y+matrix[5])/w};
}
const grids=new WeakMap();
function imageTriangles(registration){
 if(grids.has(registration))return grids.get(registration);
 const [width,height]=registration.canvas,n=24,triangles=[];
 // The source-frame grid is sampling coverage only, not physical registration.
 // It preserves every source pixel, including curved wool ends beyond the four
 // measured body corners. Visible-cloth bounds plus source-pixel padding define
 // the canvas extent; distant alpha1 noise cannot create a huge touch target.
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const q=[[x*width/n,y*height/n],[(x+1)*width/n,y*height/n],[(x+1)*width/n,(y+1)*height/n],[x*width/n,(y+1)*height/n]];
  triangles.push([q[0],q[1],q[2]],[q[0],q[2],q[3]]);
 }
 grids.set(registration,triangles);return triangles;
}

export function blanketFloorArtwork(item,placement,contact,size){
 const registration=FLOOR_BLANKET_REGISTRATION[placement?.direction];
 if(!registration||![placement.x,placement.y,size?.w,size?.d].every(Number.isFinite)||size.w<=0||size.d<=0)throw new RangeError('바닥 담요의 방향 또는 위치가 올바르지 않습니다.');
 const floor=([u,v])=>roomPoint(placement.x+u*size.w,placement.y+v*size.d,0);
 const anchors=registration.normalizedFloorCorners.map(floor),matrix=homography(registration.sourceCorners,anchors);
 const triangles=imageTriangles(registration).map(source=>({image:registration.image,part:'floor-blanket',source,target:source.map(point=>project(matrix,point))}));
 const coverage=registration.alphaHull.map(point=>project(matrix,point));
 const left=Math.floor(Math.min(...coverage.map(p=>p.x)))-2,top=Math.floor(Math.min(...coverage.map(p=>p.y)))-2;
 const right=Math.ceil(Math.max(...coverage.map(p=>p.x)))+2,bottom=Math.ceil(Math.max(...coverage.map(p=>p.y)))+2;
 const footprint=[[0,0],[1,0],[1,1],[0,1]].map(floor);
 return {footprint,reserved:footprint,anchors,contact,faces:[],left,top,width:right-left,height:bottom-top,
  art:{kind:'floor-blanket',triangles},registration:{sourceCorners:registration.sourceCorners,worldCorners:registration.normalizedFloorCorners.map(([u,v])=>({x:placement.x+u*size.w,y:placement.y+v*size.d,z:0})),image:registration.image}};
}
