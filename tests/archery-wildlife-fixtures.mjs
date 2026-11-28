// Select a visible point on a posed surface for full flight tests. Start high
// on the skull/back or low on a free foot to avoid shared joint boundaries.
import {wildlifeMesh,wildlifeView} from '../games/forest-archer/wildlife.mjs';
import {getAnimalAimPoint,scoreAnimalPoint} from '../games/forest-archer/animal-zones.mjs';
export function visiblePart(target,part){
 if(part==='heart')return getAnimalAimPoint(target);
 const mesh=wildlifeMesh(target.kind,target.gaitPhase,target.bank,target.landing),view=wildlifeView(target);
 const candidates=[];
 for(const group of mesh.parts){
  if(group.part!==part)continue;
  for(let k=group.first;k<group.end;k+=12){
   let xx=0,yy=0,zz=0,mx=0;
   for(let j=0;j<3;j++){
    const i=mesh.indices[k+j]*8,v=mesh.v,x=v[i],y=v[i+1],z=v[i+2],d=1-z*view.unit;
    xx+=(x*view.side+view.dx*z)/d;yy+=(y+view.dy*z)/d;zz+=z;mx+=x;
   }
   const rank=zz*.8+(part==='body'?-Math.abs(mx/3+.26)*4+yy*.38:
    part==='leg'?-Math.abs(yy/3+(target.kind==='rabbit'?.33:.47))*3:part==='ear'?yy*.48:mx*.35);
   candidates.push({rank,point:{x:target.x+xx*target.radius/3,y:target.y+yy*target.radius/3,z:target.z}});
  }
 }
 candidates.sort((a,b)=>b.rank-a.rank);
 for(const {point} of candidates){if(scoreAnimalPoint(point,target)?.part===part)return point;}
 throw Error('No visible '+target.kind+' '+part);
}
