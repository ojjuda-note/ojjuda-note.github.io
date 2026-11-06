/* Shared curved cuts across one rectangular metal sheet. */
(function(){
  'use strict';
  const WIDTH=296,HEIGHT=330;
  const randomFor=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function clip(poly,nx,ny,cut){
    const result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=a.x*nx+a.y*ny-cut,db=b.x*nx+b.y*ny-cut;
      if(da<=1e-8)result.push(a);
      if((da<0)!==(db<0)){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    }
    return result;
  }
  const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
  function split(poly,random){
    const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);
    const horizontal=Math.max(...xs)-Math.min(...xs)>Math.max(...ys)-Math.min(...ys);
    const angle=(horizontal?0:Math.PI/2)+(random()-.5)*.9,nx=Math.cos(angle),ny=Math.sin(angle);
    const dots=poly.map(p=>p.x*nx+p.y*ny),cut=Math.min(...dots)+(Math.max(...dots)-Math.min(...dots))*(.42+random()*.16);
    return [clip(poly,nx,ny,cut),clip(poly,-nx,-ny,-cut)];
  }
  function simplify(points){
    if(points.length<=2)return points;
    const a=points[0],b=points.at(-1),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    let distance=.12,index=0;
    for(let i=1;i<points.length-1;i++){
      const d=Math.abs((points[i].x-a.x)*dy-(points[i].y-a.y)*dx)/length;
      if(d>distance){distance=d;index=i;}
    }
    return index?[...simplify(points.slice(0,index+1)).slice(0,-1),...simplify(points.slice(index))]:[a,b];
  }
  function build(count,seed){
    const random=randomFor(seed);
    const rectangle=[{x:0,y:0},{x:WIDTH,y:0},{x:WIDTH,y:HEIGHT},{x:0,y:HEIGHT}];
    let cells=[rectangle];
    if(count>=7&&seed%3===0){
      const sites=[{x:WIDTH*(.44+random()*.12),y:HEIGHT*(.45+random()*.1)}];
      for(let i=0;i<6;i++){const a=(i+random()*.22)*Math.PI/3;sites.push({x:WIDTH*(.5+.43*Math.cos(a)),y:HEIGHT*(.5+.43*Math.sin(a))});}
      cells=sites.map((site,i)=>{
        let poly=rectangle;
        for(let j=0;j<sites.length;j++)if(i!==j){const q=sites[j];poly=clip(poly,q.x-site.x,q.y-site.y,(q.x*q.x+q.y*q.y-site.x*site.x-site.y*site.y)/2);}
        return poly;
      });
    }
    while(cells.length<count){
      let index=0;for(let i=1;i<cells.length;i++)if(area(cells[i])>area(cells[index]))index=i;
      cells.splice(index,1,...split(cells[index],random));
    }
    const phase=random()*Math.PI*2,phase2=random()*Math.PI*2;
    const warp=p=>{
      const u=p.x/WIDTH,v=p.y/HEIGHT;
      return{x:32+p.x+WIDTH*.085*Math.sin(Math.PI*u)*Math.sin(2*Math.PI*v+phase),
        y:151+p.y+HEIGHT*.065*Math.sin(Math.PI*v)*Math.sin(2*Math.PI*u+phase2)};
    };
    // Insert every junction into both sides before sampling. The two neighbours
    // then receive identical vertices, in reverse order, along their shared cut.
    const junctions=cells.flat(),edgeCache=new Map();
    function curve(a,b){
      const reverse=a.x>b.x||(a.x===b.x&&a.y>b.y),lo=reverse?b:a,hi=reverse?a:b;
      const key=[lo.x,lo.y,hi.x,hi.y].map(n=>n.toFixed(6)).join(',');
      if(!edgeCache.has(key)){
        const steps=Math.max(1,Math.ceil(Math.hypot(hi.x-lo.x,hi.y-lo.y)/7));
        edgeCache.set(key,simplify(Array.from({length:steps+1},(_,i)=>warp({x:lo.x+(hi.x-lo.x)*i/steps,y:lo.y+(hi.y-lo.y)*i/steps}))));
      }
      const points=edgeCache.get(key);return reverse?[...points].reverse():points;
    }
    return cells.map(poly=>{
      const out=[];
      for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
        if(length<1e-9)continue;
        const points=[{p:a,t:0},{p:b,t:1}];
        for(const p of junctions){const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/length;
          if(t>1e-6&&t<1-1e-6&&Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)<1e-5&&!points.some(q=>Math.abs(q.t-t)<1e-6))points.push({p,t});}
        points.sort((a,b)=>a.t-b.t);
        for(let j=1;j<points.length;j++)out.push(...curve(points[j-1].p,points[j].p).slice(0,-1));
      }
      return out;
    });
  }
  const api={build};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.OjjudaFlatPartitions=api;
})();
