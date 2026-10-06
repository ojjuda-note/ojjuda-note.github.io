(function(root){
  'use strict';
  function hitTest(puzzle,x,y,found=[]){
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100)return null;
    const candidates=puzzle.spots.map((s,i)=>({i,d:Math.min(...[s,...(s.hitRegions||[])].map(r=>((x-r.x)/r.rx)**2+((y-r.y)/r.ry)**2))})).filter(s=>s.d<=1).sort((a,b)=>a.d-b.d);
    if(!candidates.length)return null;
    const hit=candidates[0];
    return {index:hit.i,alreadyFound:found.includes(hit.i)};
  }
  const ROUND_MS=60000, EXTEND_MS=60000, HEARTS=3;
  const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  function freshRound(){return {status:'ready',hearts:HEARTS,remainingMs:ROUND_MS,totalMs:ROUND_MS,deadline:null,paid:[],hintIndex:null,pending:null,assisted:false,timeBought:false};}
  function ids(value){return Array.isArray(value)?[...new Set(value.filter(i=>Number.isInteger(i)&&i>=0&&i<6))]:[];}
  function shuffleOrder(length,random=Math.random){
    const order=Array.from({length},(_,i)=>i);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    return order;
  }
  function cleanProgress(raw,puzzles){
    const result={current:0,found:{},rounds:{},revisions:Object.fromEntries(puzzles.map(p=>[p.id,p.revision||'original'])),order:shuffleOrder(puzzles.length)};
    result.current=result.order[0];
    if(!raw||![1,2].includes(raw.version))return result;
    if(Array.isArray(raw.order)&&raw.order.length===puzzles.length&&new Set(raw.order).size===puzzles.length&&raw.order.every(i=>Number.isInteger(i)&&i>=0&&i<puzzles.length))result.order=[...raw.order];
    result.current=result.order[0];
    if(Number.isInteger(raw.current)&&raw.current>=0&&raw.current<puzzles.length)result.current=raw.current;
    for(const puzzle of puzzles){
      const changed=puzzle.revision==='mixed-sizes-1'&&raw.revisions?.[puzzle.id]!==puzzle.revision;
      const found=changed?[]:ids(raw.found?.[puzzle.id]);result.found[puzzle.id]=found;
      const round=freshRound(),previous=raw.version===2&&raw.rounds?.[puzzle.id],r=changed&&previous?.status==='won'?null:previous;
      if(r){
        const unopened=r.status==='ready'&&r.totalMs===30000&&r.remainingMs===30000&&!found.length&&!r.paid?.length&&!r.pending;
        if(Number.isInteger(r.hearts)&&r.hearts>=0&&r.hearts<=HEARTS)round.hearts=r.hearts;
        if(!unopened&&Number.isFinite(r.totalMs)&&r.totalMs>=30000)round.totalMs=r.totalMs;
        if(!unopened&&Number.isFinite(r.remainingMs))round.remainingMs=Math.max(0,Math.min(round.totalMs,r.remainingMs));
        round.paid=ids(r.paid);
        round.assisted=r.assisted===true||round.paid.length>0||round.totalMs>ROUND_MS;round.timeBought=r.timeBought===true||round.totalMs>ROUND_MS;
        if(uuid(r.rankOwner))round.rankOwner=r.rankOwner;
        if(round.paid.includes(r.hintIndex))round.hintIndex=r.hintIndex;
        if(['ready','playing','lost','payment'].includes(r.status))round.status=r.status;
        if(Number.isFinite(r.deadline)&&r.deadline>0)round.deadline=r.deadline;
        const pending=r.pending;
        if(pending&&uuid(pending.requestId)&&uuid(pending.userId)&&['hint','time'].includes(pending.kind)&&Number.isInteger(pending.spot)&&((pending.kind==='hint'&&pending.spot>=0&&pending.spot<6)||(pending.kind==='time'&&pending.spot===-1))){
          round.pending={requestId:pending.requestId,userId:pending.userId,kind:pending.kind,spot:pending.spot};round.status='payment';round.deadline=null;
        }else if(round.status==='payment')round.status='ready';
        if(round.status==='playing'&&!round.deadline)round.status='ready';
      }
      if(found.length===6){round.status='won';round.deadline=null;round.pending=null;}
      else if(!round.pending&&(!round.hearts||round.remainingMs===0)){round.status='lost';round.deadline=null;}
      result.rounds[puzzle.id]=round;
    }
    return result;
  }
  function timeLeft(round,now=Date.now()){
    return round.status==='playing'?Math.max(0,Math.min(round.totalMs,round.deadline-now)):round.remainingMs;
  }
  function normalizedPoint(rect,clientX,clientY){return {x:(clientX-rect.left)/rect.width*100,y:(clientY-rect.top)/rect.height*100};}
  const api={hitTest,cleanProgress,normalizedPoint,freshRound,timeLeft,shuffleOrder,ROUND_MS,EXTEND_MS,HEARTS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.JjudaGame=api;
})(typeof window!=='undefined'?window:globalThis);
