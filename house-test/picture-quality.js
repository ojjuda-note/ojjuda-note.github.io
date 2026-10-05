// Registration safety, not an aesthetic approval. Rotation and uniform scaling
// preserve shape; unequal singular values reveal flattening and shear.
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function distortionRatio([a,b,c,d]){
 const trace=a*a+b*b+c*c+d*d,det=Math.abs(a*d-b*c);
 if(!Number.isFinite(trace)||!Number.isFinite(det)||det<=0)return Infinity;
 return (trace+Math.sqrt(Math.max(0,trace*trace-4*det*det)))/(2*det);
}
export function sourceWeights(triangles,pixels){
 return triangles.map(({source:s})=>{
  if(!pixels)return Math.abs(cross(...s))/2;
  const {width,height,data}=pixels;
  const left=Math.max(0,Math.floor(Math.min(...s.map(p=>p.x)))),right=Math.min(width,Math.ceil(Math.max(...s.map(p=>p.x))));
  const top=Math.max(0,Math.floor(Math.min(...s.map(p=>p.y)))),bottom=Math.min(height,Math.ceil(Math.max(...s.map(p=>p.y))));
  const sign=Math.sign(cross(...s));let weight=0;
  // Count painted pixel centres exactly. Transparent canvas margins cannot hide
  // a compressed seat/page or make a harmless empty triangle fail the check.
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const alpha=data[(y*width+x)*4+3];if(alpha<8)continue;
   const p={x:x+.5,y:y+.5};
   if(s.every((a,i)=>sign*cross(a,s[(i+1)%3],p)>=-1e-8))weight+=alpha/255;
  }
  return weight;
 });
}
export function checkShape(triangles,weights=sourceWeights(triangles)){
 let total=0,severe=0,extreme=0,broad=0;
 triangles.forEach((t,i)=>{const w=weights[i]||0,r=distortionRatio(t.matrix);total+=w;if(r>2)broad+=w;if(r>4)severe+=w;if(r>8)extreme+=w;});
 const severeFraction=total?severe/total:0,extremeFraction=total?extreme/total:0,broadFraction=total?broad/total:0;
 const ok=total>0&&severeFraction<=.02&&extremeFraction<=.005&&broadFraction<=.5;
 return {ok,severeFraction,extremeFraction,broadFraction,error:ok?null:'원본보다 심하게 눌리거나 늘어난 부분이 있어요. 그림 각도와 기준점을 다시 맞춰 주세요.'};
}
