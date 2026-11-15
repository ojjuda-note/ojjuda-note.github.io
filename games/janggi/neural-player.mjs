// The external engine communicates only through UCI. Ojjuda supplies the
// permitted root moves and handles its own bikjang, shuttle and points rules.
import { openingCounts, pickOpeningMove } from './opening-book.mjs?v=20261115-janggi-book1';

const ENGINE='/games/janggi/fairy-4d4b393-9991472750de/';
const NETWORK='janggi-9991472750de.nnue';
const limits={pro:12000,master:40000,grandmaster:120000};
const square=i=>'abcdefghi'[i%9]+(10-Math.floor(i/9));
const notation=move=>square(move.f)+square(move.t);
const fenPiece={H:'N',h:'n',E:'B',e:'b'};

function facingKings(board){
 const cho=board.indexOf('K'),han=board.indexOf('k');
 if(cho<0||han<0||cho%9!==han%9)return false;
 for(let i=Math.min(cho,han)+9;i<Math.max(cho,han);i+=9)if(board[i])return false;
 return true;
}

export function positionFen(state){
 const ranks=[];
 for(let i=0;i<90;i+=9){
  const rank=state.b.slice(i,i+9).map(p=>fenPiece[p]||p||'.').join('');
  ranks.push(rank.replace(/\.+/g,spaces=>String(spaces.length)));
 }
 return ranks.join('/')+' '+(state.t==='c'?'w':'b')+' - - 0 '+(1+Math.floor(state.n/2));
}

export function createNeuralPlayer(makeWorker=url=>new Worker(url)){
 let worker,ready=false,loading,pending,bootTimer,failedAt=-Infinity;
 function close(){
  clearTimeout(bootTimer);
  worker?.terminate();worker=null;ready=false;
  loading?.(false);loading=null;
  if(pending){clearTimeout(pending.timer);pending.resolve(null);pending=null}
  failedAt=Date.now();
 }
 function start(){
  if(ready)return Promise.resolve(true);
  if(worker||Date.now()-failedAt<30000)return Promise.resolve(false);
  return new Promise(resolve=>{
   try{
    loading=resolve;worker=makeWorker(ENGINE+'engine-worker.js');
    bootTimer=setTimeout(close,45000);
    const instance=worker;
    worker.onerror=()=>{if(worker===instance)close()};
    worker.onmessage=({data})=>{
     if(worker!==instance||typeof data!=='string')return;
     if(data==='uciok'){
      worker.postMessage('setoption name UCI_Variant value janggi');
      worker.postMessage({type:'load-nnue',url:ENGINE+NETWORK});
     }else if(data==='nnue-ready'){
      worker.postMessage('setoption name EvalFile value /janggi.nnue');
      worker.postMessage('setoption name Use NNUE value true');
      worker.postMessage('isready');
     }else if(data==='readyok'){
      clearTimeout(bootTimer);ready=true;loading?.(true);loading=null;
     }else if(data==='nnue-failed'||/^info string ERROR/i.test(data)){
      close();
     }else if(pending){
      if(/^info string NNUE evaluation/i.test(data))pending.usedNetwork=true;
      const pv=data.match(/^info depth (\d+).*? multipv (\d+) score (cp|mate) (-?\d+) .*?\bpv (\S+)/);
      if(pv){
       const rank=Number(pv[2]);
       if(pv[3]==='mate'||/\b(?:upperbound|lowerbound)\b/.test(data))pending.lines.delete(rank);
       else pending.lines.set(rank,{depth:Number(pv[1]),score:Number(pv[4]),move:pv[5]});
      }
      if(data.startsWith('bestmove ')){
       const job=pending;pending=null;clearTimeout(job.timer);
       const best=data.split(/\s+/)[1],first=job.lines.get(1);
       let choice=job.legal.get(best);
       if(job.opening&&first?.move===best){
        const near=[...job.lines.values()].filter(line=>line.depth===first.depth&&Math.abs(first.score-line.score)<=6&&job.legal.has(line.move));
        if(near.length)choice=pickOpeningMove(near.map(line=>job.legal.get(line.move)),job.counts??openingCounts(job.state));
       }
       job.resolve(job.usedNetwork?choice??null:null);
      }
     }
    };
    worker.postMessage('uci');
   }catch{close()}
  });
 }
 async function choose(state,level,rules,budgetMs){
  if(!limits[level]||state.passes||state.n>=390||facingKings(state.b)||
    Object.values(state.bikjangKeys||{}).some(count=>count>=2)||
    Object.values(state.shuttle||{}).some(last=>last?.run>=3))return null;
  if(!ready){
   let timer;
   try{await Promise.race([start(),new Promise(resolve=>{timer=setTimeout(resolve,350)})])}
   finally{clearTimeout(timer)}
  }
  if(!ready||pending)return null;
  const legal=new Map(rules.moves(state).map(move=>[notation(move),move]));
  if(!legal.size||rules.isDraw(state))return null;
  const counts=openingCounts(state);
  const opening=state.n<10||!!counts;
  const recommended=await new Promise(resolve=>{
   pending={legal,state,counts,lines:new Map(),opening,usedNetwork:false,resolve,timer:setTimeout(close,budgetMs+350)};
   try{
    worker.postMessage('setoption name MultiPV value '+(opening?3:1));
    worker.postMessage('position fen '+positionFen(state));
    worker.postMessage('go nodes '+limits[level]+' movetime '+budgetMs+' searchmoves '+[...legal.keys()].join(' '));
   }catch{close()}
  });
  return recommended&&!facingKings(rules.apply(state,recommended).b)?recommended:null;
 }
 return {choose,start};
}
