import {roomPoint,roomPlaneWorld} from './room-guide.js?v=20261003-chairdesk1';

// An exact 2D drawing guide from the existing room projection. These points are
// proposed composition points, never measured anchors on a generated picture.
export function generationGeometry(placement,size=1024){
 const roomCorners=Object.fromEntries(['top','front','side'].map(plane=>[plane,roomPlaneWorld({...placement,plane}).map(p=>roomPoint(p.x,p.y,p.z))]));
 const feet=roomPlaneWorld({...placement,plane:'top'}).map(p=>roomPoint(p.x,p.y,0));
 const all=[...Object.values(roomCorners).flat(),...feet];
 const minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x));
 const minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y));
 const margin=112,scale=Math.min((size-2*margin)/(maxX-minX),(size-2*margin)/(maxY-minY));
 if(!Number.isFinite(scale)||scale<=0)throw new Error('가구 크기와 배치 위치를 확인해 주세요.');
 const offsetX=(size-(maxX-minX)*scale)/2,offsetY=(size-(maxY-minY)*scale)/2;
 const transform=p=>({x:offsetX+(p.x-minX)*scale,y:offsetY+(p.y-minY)*scale});
 return {size,placement:{...placement},corners:Object.fromEntries(Object.entries(roomCorners).map(([k,v])=>[k,v.map(transform)])),feet:feet.map(transform),roomCorners,projection:{scale,minX,minY,offsetX,offsetY},kind:'generation-guide-not-measured-anchors'};
}

export function generationGuide(placement){
 const geometry=generationGeometry(placement),canvas=document.createElement('canvas');
 canvas.width=canvas.height=geometry.size;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 const trace=points=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
 ctx.strokeStyle='#889298';ctx.lineWidth=2;ctx.setLineDash([9,7]);trace(geometry.feet);ctx.stroke();ctx.setLineDash([]);
 for(const [plane,color]of [['side','#42906c'],['front','#ab5968'],['top','#547fa8']]){
  trace(geometry.corners[plane]);ctx.fillStyle=color+'0c';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();
 }
 ctx.font='18px sans-serif';ctx.textAlign='center';ctx.fillStyle='#333';
 ctx.fillText('COMPOSITION GUIDE — '+({left:'LEFT',center:'FRONT',right:'RIGHT'}[placement.direction]),512,42);
 ctx.font='15px sans-serif';ctx.fillText('Blue: top / Red: front / Green: end panel / Dashed: floor contact',512,73);
 ctx.fillText('Use reference artwork for the actual shape. Do not draw guide lines or labels.',512,990);
 return {...geometry,image:canvas.toDataURL('image/png')};
}
