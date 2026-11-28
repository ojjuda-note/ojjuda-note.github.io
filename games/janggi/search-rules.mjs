// The arbiter owns move application, repetition and adjudication. For search,
// index potential attackers once so that testing a move needs only its king's square.
import { janggiRules, pieceTargets, repeatsShuttle } from './worker-rules.mjs?v=20261128-janggi-points1';

const TYPES = 'KAPHERC';
const POINTS = { K:0, A:300, P:200, H:500, E:300, R:1300, C:700 };
const rays = Array.from({length:90}, () => []);
const routes = {};
const attackers = { c:Array.from({length:90},()=>[]), h:Array.from({length:90},()=>[]) };
const squareValues = {};
const file = sq => sq % 9;
const rank = sq => Math.floor(sq / 9);
const cho = piece => piece >= 'A' && piece <= 'Z';
const empty = Array(90).fill('');

for (let from=0; from<90; from++) {
 empty[from]='R';
 const byDirection=new Map();
 for (const to of pieceTargets(empty,from)) {
  const direction=Math.sign(file(to)-file(from))+9*Math.sign(rank(to)-rank(from));
  if (!byDirection.has(direction)) byDirection.set(direction,[]);
  byDirection.get(direction).push(to);
 }
 rays[from]=[...byDirection.values()]; // The rule generator lists each ray nearest first.
 empty[from]='';
}

for (const side of ['c','h']) for (const type of TYPES) {
 const piece=side==='c'?type:type.toLowerCase();
 routes[piece]=Array.from({length:90},()=>[]);
 squareValues[piece]=new Int16Array(90);
 for (let from=0;from<90;from++) {
  const advance=side==='c'?9-rank(from):rank(from), center=4-Math.abs(4-file(from));
  let bonus=0;
  if(type==='P') bonus=advance*8+center*5;
  if(type==='H'||type==='E') bonus=(advance===0?-26:0)+center*4;
  if(type==='R') bonus=center*3;
  if(type==='K') bonus=advance>1?-18:0;
  squareValues[piece][from]=POINTS[type]+bonus;
  if(type==='R'||type==='C')continue;
  empty[from]=piece;
  for(const to of pieceTargets(empty,from)){
   const dx=file(to)-file(from),dy=rank(to)-rank(from);
   const sx=Math.sign(dx),sy=Math.sign(dy);
   let leg=-1,second=-1;
   if(type==='H'||type==='E'){
    leg=from+(Math.abs(dx)>Math.abs(dy)?sx:9*sy);
    if(type==='E')second=leg+sx+9*sy;
   }
   const route={from,to,piece,leg,second};
   routes[piece][from].push(route);
   attackers[side][to].push(route);
  }
  empty[from]='';
 }
}

const openRoute=(board,r)=>(r.leg<0||!board[r.leg])&&(r.second<0||!board[r.second]);

function attacked(board,target,side){
 if(target<0)return false;
 const rook=side==='c'?'R':'r',cannon=side==='c'?'C':'c';
 for(const ray of rays[target]){
  let screen=false;
  for(const sq of ray){
   const p=board[sq];if(!p)continue;
   if(screen){if(p===cannon)return true;break}
   if(p===rook)return true;
   if(p==='c'||p==='C')break;
   screen=true;
  }
 }
 for(const r of attackers[side][target]){
  if(board[r.from]===r.piece&&openRoute(board,r))return true;
 }
 return false;
}

function isCheck(state){
 const isCho=state.t==='c';
 return attacked(state.b,state.b.indexOf(isCho?'K':'k'),isCho?'h':'c');
}

function legalMoves(state,capturesOnly=false){
 const board=state.b.slice(),isCho=state.t==='c',enemy=isCho?'h':'c';
 const king=board.indexOf(isCho?'K':'k'),last=state.shuttle?.[state.t],moves=[];
 for(let from=0;from<90;from++){
  const piece=board[from];if(!piece||cho(piece)!==isCho)continue;
  for(const to of pieceTargets(board,from)){
   const victim=board[to];
   if(capturesOnly&&!victim)continue;
   const move=victim?{f:from,t:to,x:1}:{f:from,t:to};
   if(!victim&&last?.run>=4&&from===last.t&&to===last.f&&repeatsShuttle(state,move))continue;
   board[to]=piece;board[from]='';
   if(!attacked(board,from===king?to:king,enemy))moves.push(move);
   board[from]=piece;board[to]=victim;
  }
 }
 return moves;
}

// Reward pieces with usable lines and pressure around the opposing king.
// Count cannon mobility only beyond exactly one non-cannon screen.
function evaluate(state){
 const board=state.b,choKing=board.indexOf('K'),hanKing=board.indexOf('k');
 let score=0;
 for(let from=0;from<90;from++){
  const piece=board[from];if(!piece)continue;
  const friendly=cho(piece),enemyKing=friendly?hanKing:choKing;
  const type=piece.toUpperCase();
  let value=squareValues[piece][from],mobility=0,pressure=0;
  if(type==='R'||type==='C'){
   const isCannon=type==='C';
   for(const ray of rays[from]){
    let ready=!isCannon;
    for(const to of ray){
     const p=board[to];
     if(!ready){if(p){if(p==='C'||p==='c')break;ready=true}continue}
     if(p&&(cho(p)===friendly||(isCannon&&(p==='C'||p==='c'))))break;
     mobility++;
     if(enemyKing>=0 && Math.abs(file(to)-file(enemyKing))<=1&&Math.abs(rank(to)-rank(enemyKing))<=1)pressure++;
     if(p)break;
    }
   }
   value+=Math.min(mobility,15)*(isCannon?5:4)+Math.min(pressure,4)*9;
  }else if(type==='H'||type==='E'){
   for(const r of routes[piece][from]){
    if(!openRoute(board,r))continue;
    const p=board[r.to];if(p&&cho(p)===friendly)continue;
    mobility++;
    if(enemyKing>=0&&Math.abs(file(r.to)-file(enemyKing))<=1&&Math.abs(rank(r.to)-rank(enemyKing))<=1)pressure++;
   }
   value+=mobility*(type==='H'?7:5)+pressure*10;
  }
  score+=friendly?value:-value;
 }
 return state.t==='c'?score:-score;
}

export const searchRules=Object.freeze({
 ...janggiRules, moves:state=>legalMoves(state), captures:state=>legalMoves(state,true),
 isCheck,evaluate
});
