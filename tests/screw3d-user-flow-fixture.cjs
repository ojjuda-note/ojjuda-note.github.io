/* Deterministic reproduction of a real user route: normal color queues,
 * purchased slots, pointer rotation with elapsed time, and falling debris. */
module.exports=String.raw`
globalThis.play=async(stage,seed,route,upgrades)=>{
  let r=seed>>>0,pr=route>>>0;
  Math.random=()=>((r=(Math.imul(r,1664525)+1013904223)>>>0)/4294967296);
  const random=()=>((pr=(Math.imul(pr,1664525)+1013904223)>>>0)/4294967296);
  const game=screw3d({getUserId:()=>String(seed)+'-'+route,getCoins:()=>19366,
    setScore(){},end(){},buyScrew:async(kind,id,stage)=>({ok:true,stage})},stage);
  const st=window.__ojjScrew3d,lv=st.lvl;st.touched=true;
  const tap=(x,y)=>{game.onDown(x,y,1);game.onUp(x,y,1);};
  if(upgrades){tap(320,80);for(let i=0;i<8;i++)await Promise.resolve();
    tap(320,160);for(let i=0;i<8;i++)await Promise.resolve();}
  const advance=t=>{for(let i=0;i<t/.04;i++)game.update(.04);};
  const rotate=(yaw,pitch)=>{
    const dy=Math.atan2(Math.sin(yaw-st.yaw),Math.cos(yaw-st.yaw));
    const dp=pitch-st.pitch;
    if(Math.hypot(dy,dp)<.09)return;
    game.onDown(180,350,9);
    for(let k=1;k<=6;k++){
      game.onMove(180+dy*k/6/.011,350+dp*k/6/.011,9);
      game.update(.04);
    }
    game.onUp(180+dy/.011,350+dp/.011,9);
  };
  const inside=(x,y,pts)=>{let hit=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const a=pts[i],b=pts[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }return hit;};
  const top=(x,y)=>{let owner=null,z=-Infinity;
    for(const it of st.order)for(const pg of it.polys)if(pg.depth&&(pg.visible||[pg.pts]).some(p=>inside(x,y,p))){
      const d=depthAt(pg.depth,{x,y});if(d>z){z=d;owner=it.owner;}}
    return owner;};
  const order=[],angles=[];
  for(const p of [.45,-.45,.9,-.9,0,1.35,-1.35])for(let k=0;k<12;k++)angles.push([k*Math.PI/6,p]);
  let attempts=0,sorts=0,settled=false;
  while(order.length<lv.screws.length&&attempts++<lv.screws.length+70){
    if([lv.screws.length,21,4,2].includes(lv.screws.length-order.length)){
      const yaw=st.yaw,pitch=st.pitch;st.yaw=-.67;st.pitch=.29;
      capture(game,st,seed+'-'+(lv.screws.length-order.length));st.yaw=yaw;st.pitch=pitch;
    }
    let picked=false;
    const offset=Math.floor(random()*angles.length);
    for(let ai=-1;ai<angles.length;ai++){
      if(ai>=0)rotate(...angles[(ai+offset)%angles.length]);
      st.lastPaintStamp=null;game.draw(canvas);
      const fits=s=>st.boxes.some(b=>b&&!b.close&&b.c===s.color&&b.n+b.res<3);
      const moves=[...st.heads].filter(([s,h])=>s.state==='in'&&!blocked(s,lv)
        &&h.x>5&&h.x<315&&h.y>230&&h.y<520&&top(h.x,h.y)===s)
        .map(([s,h])=>({s,h,rank:random()+(fits(s)?1:0)})).sort((a,b)=>b.rank-a.rank);
      for(const {s,h} of moves){
        if(!fits(s)&&!st.buf.includes(null))continue;
        tap(h.x,h.y);
        if(s.state==='out'){order.push(lv.screws.indexOf(s));picked=true;settled=false;break;}
      }
      if(picked)break;
    }
    if(picked){advance(.5+random()*1.2);continue;}
    if(st.buf.some(Boolean)&&sorts<30){tap(80,212);advance(10);sorts++;continue;}
    if(!settled){advance(16);settled=true;continue;}
    break;
  }
  if(order.length===lv.screws.length)for(let k=0;k<30&&!game.stageCleared;k++){
    if(st.buf.some(Boolean)){tap(80,212);sorts++;}advance(16);
  }
  const remaining=lv.screws.filter(s=>s.state==='in').map(s=>{
    const b=blocked(s,lv),q=visibleScrewPose(s),o=screwPose(s);
    return {id:lv.screws.indexOf(s),color:s.color,p:o.p,a:o.a,mount:s.skinMount&&{p:s.skinMount.p,a:s.skinMount.a,owner:lv.els.indexOf(s.skinMount.owner)},visible:{p:q.p,a:q.a},
      thru:lv.els.indexOf(s.thru),into:lv.els.indexOf(s.into),
      blocker:b?{screw:lv.screws.indexOf(b),el:lv.els.indexOf(b),kind:b.kind,
        hidden:b.visualMountOnly,dyn:!!b.dyn,hinge:b.hinge?.th}:null};
  });
  globalThis.last={game,st};
  const views=[];
  if(!game.stageCleared&&remaining.length){
    const target=lv.screws[remaining.find(s=>!s.blocker)?.id??remaining[0].id];
    for(const [yaw,pitch] of angles){
      st.yaw=yaw;st.pitch=pitch;st.lastPaintStamp=null;game.draw(canvas);
      const h=st.heads.get(target);if(!h)continue;
      const front=[];
      for(const it of st.order)for(const pg of it.polys){
        if(pg.depth&&(pg.visible||[pg.pts]).some(p=>inside(h.x,h.y,p)))
          front.push({s:lv.screws.indexOf(it.owner),e:lv.els.indexOf(it.owner),z:depthAt(pg.depth,h)});
      }
      front.sort((a,b)=>b.z-a.z);
      views.push({yaw,pitch,h,front:front.slice(0,3)});
      if(views.length===6)break;
    }
  }
  return {stage,seed,route,upgrades,total:lv.screws.length,clicks:order.length,
    cleared:game.stageCleared,sorts,detours:st.detours,boxes:st.boxes,buffer:st.buf.length,
    remaining,views:views.length?views:undefined,order:game.stageCleared?undefined:order};
};
`;
