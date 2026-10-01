import {floorPoint,roomPoint,shelfSize} from './model.js?v=20261001-5';

// Contact corners are measured on the approved atlas, excluding transparent
// padding. Each wooden plane is projected separately so verticals stay upright
// while both bottom edges follow the room's perspective at every placement.
const atlas={
 left:[
  {source:[[216,94],[330,73],[330,946],[216,935]],clip:[[210,26],[330,26],[330,954],[210,954]],corners:[3,2]},
  {source:[[330,73],[442,121],[442,853],[330,946]],clip:[[330,26],[450,26],[450,954],[330,954]],corners:[2,1]}
 ],
 center:[
  {source:[[620,94],[916,94],[916,922],[620,922]],clip:[[614,32],[922,32],[922,932],[614,932]],corners:[3,2]}
 ],
 right:[
  {source:[[1092,121],[1206,73],[1206,946],[1092,853]],clip:[[1084,24],[1206,24],[1206,956],[1084,956]],corners:[0,3]},
  {source:[[1206,73],[1320,94],[1320,935],[1206,946]],clip:[[1206,24],[1328,24],[1328,956],[1206,956]],corners:[3,2]}
 ]
};
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
 return [...rows.map(row=>row[8]),1];
}
export function transformPoint(m,[x,y]){const w=m[6]*x+m[7]*y+m[8];return {x:(m[0]*x+m[1]*y+m[2])/w,y:(m[3]*x+m[4]*y+m[5])/w};}
export function cssMatrix(m){return `matrix3d(${[m[0],m[3],0,m[6],m[1],m[4],0,m[7],0,0,1,0,m[2],m[5],0,m[8]].join(',')})`;}
export function shelfGeometry(s){
 const {w,d}=shelfSize(s.direction),cells=[[s.x,s.y],[s.x+w,s.y],[s.x+w,s.y+d],[s.x,s.y+d]];
 const footprint=cells.map(([x,y])=>floorPoint(x,y)),top=cells.map(([x,y])=>roomPoint(x,y,4.8));
 const faces=atlas[s.direction].map(face=>{
  const [a,b]=face.corners,target=[top[a],top[b],footprint[b],footprint[a]];
  const matrix=projectiveMap(face.source,target);
  return {...face,target,matrix,outline:matrix?face.clip.map(p=>transformPoint(matrix,p)):[]};
 });
 const points=faces.flatMap(face=>face.outline),left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),upper=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
 return {footprint,faces,left,top:upper,width:right-left,height:bottom-upper};
}
export function renderShelf(button,s){
 const geometry=shelfGeometry(s);
 Object.assign(button.style,{left:`${geometry.left}px`,top:`${geometry.top}px`,width:`${geometry.width}px`,height:`${geometry.height}px`,zIndex:String(10+Math.round(Math.max(...geometry.footprint.map(p=>p.y))))});
 button.dataset.x=s.x;button.dataset.y=s.y;button.dataset.direction=s.direction;
 button.replaceChildren();
 for(const face of geometry.faces){
  if(!face.matrix)continue;
  const image=document.createElement('img');image.src='assets/bookshelf-views.webp';image.alt='';image.draggable=false;image.className='bookshelf-face';
  const local=face.target.map(p=>({x:p.x-geometry.left,y:p.y-geometry.top}));
  image.style.transform=cssMatrix(projectiveMap(face.source,local));
  image.style.clipPath=`polygon(${face.clip.map(([x,y])=>`${x}px ${y}px`).join(',')})`;
  button.append(image);
 }
 return geometry;
}
