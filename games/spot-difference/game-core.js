(function(root){
  'use strict';
  function hitTest(puzzle,x,y,found=[]){
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100)return null;
    if(puzzle.hitMode==='target-bounds'){
      const index=puzzle.spots.findIndex(s=>{const b=s.targetBounds;return b&&x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom;});
      if(index>=0)return {index,alreadyFound:found.includes(index)};
    }
    const candidates=puzzle.spots.map((s,i)=>({i,d:Math.min(...[s,...(s.hitRegions||[])].map(r=>((x-r.x)/r.rx)**2+((y-r.y)/r.ry)**2))})).filter(s=>s.d<=1).sort((a,b)=>a.d-b.d);
    if(!candidates.length)return null;
    const hit=candidates[0];
    return {index:hit.i,alreadyFound:found.includes(hit.i)};
  }
  const ROUND_MS=60000, EXTEND_MS=60000, HEARTS=3;
  const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  function freshRound(){return {status:'ready',hearts:HEARTS,remainingMs:ROUND_MS,totalMs:ROUND_MS,deadline:null,paid:[],hintIndex:null,pending:null,assisted:false,timeBought:false};}
  function ids(value,total){return Array.isArray(value)?[...new Set(value.filter(i=>Number.isInteger(i)&&i>=0&&i<total))]:[];}
  function shuffleOrder(length,random=Math.random){
    const order=Array.from({length},(_,i)=>i);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    return order;
  }
  function puzzleDifficulty(puzzle){return ['hard','very-hard'].includes(puzzle.difficulty)?puzzle.difficulty:'normal';}
  function difficultyOrder(puzzles){
    const rank={normal:0,hard:1,'very-hard':2};
    return puzzles.map((_,i)=>i).sort((a,b)=>rank[puzzleDifficulty(puzzles[a])]-rank[puzzleDifficulty(puzzles[b])]||puzzles[a].id-puzzles[b].id||a-b);
  }
  function cleanProgress(raw,puzzles){
    const result={current:0,found:{},rounds:{},completed:[],revisions:Object.fromEntries(puzzles.map(p=>[p.id,p.revision||'original'])),order:difficultyOrder(puzzles)};
    result.current=result.order[0];
    if(!raw||![1,2].includes(raw.version))return result;
    // Stored indices keep their picture identity while old random orders migrate.
    const puzzleIds=new Set(puzzles.map(p=>p.id));
    const completed=new Set(Array.isArray(raw.completed)?raw.completed.filter(id=>Number.isInteger(id)&&puzzleIds.has(id)):[]);
    if(Number.isInteger(raw.current)&&raw.current>=0&&raw.current<puzzles.length)result.current=raw.current;
    for(const puzzle of puzzles){
      const total=puzzle.spots.length;
      const changed=puzzle.revision==='mixed-sizes-1'&&raw.revisions?.[puzzle.id]!==puzzle.revision;
      const found=changed?[]:ids(raw.found?.[puzzle.id],total);result.found[puzzle.id]=found;
      const round=freshRound(),previous=raw.version===2&&raw.rounds?.[puzzle.id],r=changed&&previous?.status==='won'?null:previous;
      if(r){
        const unopened=r.status==='ready'&&r.totalMs===30000&&r.remainingMs===30000&&!found.length&&!r.paid?.length&&!r.pending;
        if(Number.isInteger(r.hearts)&&r.hearts>=0&&r.hearts<=HEARTS)round.hearts=r.hearts;
        if(!unopened&&Number.isFinite(r.totalMs)&&r.totalMs>=30000)round.totalMs=r.totalMs;
        if(!unopened&&Number.isFinite(r.remainingMs))round.remainingMs=Math.max(0,Math.min(round.totalMs,r.remainingMs));
        round.paid=ids(r.paid,total);
        round.assisted=r.assisted===true||round.paid.length>0||round.totalMs>ROUND_MS;round.timeBought=r.timeBought===true||round.totalMs>ROUND_MS;
        if(uuid(r.rankOwner))round.rankOwner=r.rankOwner;
        if(round.paid.includes(r.hintIndex))round.hintIndex=r.hintIndex;
        if(['ready','playing','lost','payment'].includes(r.status))round.status=r.status;
        if(Number.isFinite(r.deadline)&&r.deadline>0)round.deadline=r.deadline;
        const pending=r.pending;
        if(pending&&uuid(pending.requestId)&&uuid(pending.userId)&&['hint','time'].includes(pending.kind)&&Number.isInteger(pending.spot)&&((pending.kind==='hint'&&pending.spot>=0&&pending.spot<total)||(pending.kind==='time'&&pending.spot===-1))){
          round.pending={requestId:pending.requestId,userId:pending.userId,kind:pending.kind,spot:pending.spot};round.status='payment';round.deadline=null;
        }else if(round.status==='payment')round.status='ready';
        if(round.status==='playing'&&!round.deadline)round.status='ready';
      }
      if(found.length===total){round.status='won';round.deadline=null;round.pending=null;completed.add(puzzle.id);}
      else if(!round.pending&&(!round.hearts||round.remainingMs===0)){round.status='lost';round.deadline=null;}
      result.rounds[puzzle.id]=round;
    }
    result.completed=[...completed].sort((a,b)=>a-b);
    return result;
  }
  function timeLeft(round,now=Date.now()){
    return round.status==='playing'?Math.max(0,Math.min(round.totalMs,round.deadline-now)):round.remainingMs;
  }
  function normalizedPoint(rect,clientX,clientY){return {x:(clientX-rect.left)/rect.width*100,y:(clientY-rect.top)/rect.height*100};}
  const api={hitTest,cleanProgress,normalizedPoint,freshRound,timeLeft,shuffleOrder,puzzleDifficulty,difficultyOrder,ROUND_MS,EXTEND_MS,HEARTS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.JjudaGame=api;
})(typeof window!=='undefined'?window:globalThis);
