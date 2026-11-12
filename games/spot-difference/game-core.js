(function(root){
  'use strict';
  // Slightly forgive fingertip placement without matching distant differences.
  const TOUCH_HIT_SCALE=1.15;
  function hitTest(puzzle,x,y,found=[],padding={x:0,y:0}){
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100)return null;
    const candidates=puzzle.spots.map((spot,index)=>({
      index,bounds:spot.targetBounds,
      distance:Math.min(...[spot,...(spot.hitRegions||[])].map(region=>((x-region.x)/region.rx)**2+((y-region.y)/region.ry)**2))
    }));
    // A forgiving hit area must not turn a matching movement into a correct answer.
    // Scene annotations use thousandths of the image; game taps use percentages.
    if(puzzle.motionScene?.common&&!candidates.some(c=>c.distance<=1)){
      const sameMovement=puzzle.motionScene.common.some(s=>((10*x-s.x)/(s.w/2))**2+((10*y-s.y)/(s.h/2))**2<=1);
      if(sameMovement)return null;
    }
    const inBounds=b=>b&&x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom;
    // Preserve the authored priority of photo and artwork answer bounds.
    if(puzzle.hitMode==='target-bounds'){
      const exact=candidates.find(c=>inBounds(c.bounds));
      if(exact)return {index:exact.index,alreadyFound:found.includes(exact.index)};
    }
    let matches=candidates.filter(c=>c.distance<=TOUCH_HIT_SCALE**2);
    if(!matches.length){
      const px=Math.max(0,Number(padding?.x)||0),py=Math.max(0,Number(padding?.y)||0);
      if(px&&py){
        // Keep legacy mouse hit zones unchanged; finger taps can reach corners.
        matches=candidates.filter(c=>inBounds(c.bounds));
        if(!matches.length)matches=candidates.map(c=>{
          const b=c.bounds;if(!b)return null;
          const dx=Math.max(b.left-x,0,x-b.right),dy=Math.max(b.top-y,0,y-b.bottom);
          return {...c,near:(dx/px)**2+(dy/py)**2};
        }).filter(c=>c&&c.near<=1);
      }
    }
    if(!matches.length)return null;
    matches.sort((a,b)=>(a.near??a.distance)-(b.near??b.distance));
    const hit=matches[0];
    return {index:hit.index,alreadyFound:found.includes(hit.index)};
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
  function puzzleDifficulty(puzzle){return ['slightly-hard','hard','very-hard'].includes(puzzle.difficulty)?puzzle.difficulty:'normal';}
  function collectionOrder(puzzles,moving=false){
    const rank={normal:0,'slightly-hard':1,hard:2,'very-hard':3};
    return puzzles.map((_,i)=>i).filter(i=>!!puzzles[i].motionScene===moving).sort((a,b)=>{
      const left=puzzles[a],right=puzzles[b];
      const difficulty=moving?0:rank[puzzleDifficulty(left)]-rank[puzzleDifficulty(right)];
      return difficulty||left.id-right.id||a-b;
    });
  }
  function difficultyOrder(puzzles){
    return [...collectionOrder(puzzles),...collectionOrder(puzzles,true)];
  }
  function nextUnclearedIndex(progress,puzzles,moving=!!puzzles[progress.current]?.motionScene){
    const completed=new Set(progress.completed||[]),order=collectionOrder(puzzles,moving);
    return order.find(index=>!completed.has(puzzles[index].id))??order[order.length-1];
  }
  function canSelectPuzzle(progress,puzzles,index){
    if(!Number.isInteger(index)||!puzzles[index])return false;
    // A past clear can be replayed, but a skipped clear never opens the gaps
    // before it or the following uncleared pictures.
    return (progress.completed||[]).includes(puzzles[index].id)||index===nextUnclearedIndex(progress,puzzles,!!puzzles[index].motionScene);
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
        if(r.deferredHelp===true&&(round.paid.length||round.timeBought))round.deferredHelp=true;
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
  const api={hitTest,cleanProgress,normalizedPoint,freshRound,timeLeft,shuffleOrder,puzzleDifficulty,difficultyOrder,collectionOrder,nextUnclearedIndex,canSelectPuzzle,ROUND_MS,EXTEND_MS,HEARTS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.JjudaGame=api;
})(typeof window!=='undefined'?window:globalThis);
