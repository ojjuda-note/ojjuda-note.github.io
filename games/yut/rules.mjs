export const HOME = -1;
export const FINISH = 29;
export const DEFAULT_MODE='island', DEFAULT_PIECES=4;
export const TEAMS = [
  {name:'산호', color:'#ed7057', ink:'#863525', mark:'●', animalOffset:0},
  {name:'바다', color:'#239b90', ink:'#075d59', mark:'◆', animalOffset:3},
  {name:'자두', color:'#9661c5', ink:'#584078', mark:'▲', animalOffset:6},
  {name:'유자', color:'#dfad38', ink:'#735016', mark:'★', animalOffset:9},
  {name:'하늘', color:'#5397e4', ink:'#234b82', mark:'■', animalOffset:1},
  {name:'새싹', color:'#84ac54', ink:'#365715', mark:'✿', animalOffset:4},
  {name:'장미', color:'#e775a7', ink:'#853253', mark:'♥', animalOffset:7},
  {name:'밤톨', color:'#b08161', ink:'#573e2b', mark:'☾', animalOffset:10}
];
export const validTeamCount=n=>Number.isInteger(n)&&n>=2&&n<=TEAMS.length;
export const defaultTeamAnimal=(team,offset=2)=>(offset+TEAMS[team].animalOffset)%12;
export const BACK_DO_STICK=3, BACK_DO_LABEL='한 칸 뒤로';
export const YUT = Object.assign(['', '도', '개', '걸', '윷', '모'],{'-1':'뒤로'});
const fork = new Set([5,10,22]);

export const EVENT_NAMES=Object.freeze({back:'뒤로',carry:'업기',home:'꽝'});
function dealTiles(){
  const spots=Array.from({length:FINISH-1},(_,i)=>i+1); // Leave the exit free.
  const eventTiles={};
  for(const effect of Object.keys(EVENT_NAMES)){
    const index=Math.floor(Math.random()*spots.length);
    const [node]=spots.splice(index,1);
    eventTiles[node]=effect;
  }
  return eventTiles;
}
export function tileEffect(state,node){
  const event=state.eventTiles?.[node];
  const first=(map,effect)=>Object.keys(map??{}).find(n=>map[n]===effect);
  if(Object.hasOwn(EVENT_NAMES,event))return first(state.eventTiles,event)===String(node)?event:undefined;
  if(state.mode==='easy')return;
  // Old saved boards used a stone (or a fixed square) for the one-step penalty.
  const oldBack=state.islandTiles?state.islandTiles[node]==='stone'&&first(state.islandTiles,'stone')===String(node):node===3;
  if(oldBack&&!first(state.eventTiles,'back'))return 'back';
}
export function newGame(count=2,zodiacOffset=2,mode=DEFAULT_MODE,pieceCounts=DEFAULT_PIECES,computerTeams=[],teamAnimals=null) {
  if(!validTeamCount(count))throw Error('2~'+TEAMS.length+'팀을 골라 주세요.');
  if (!Number.isInteger(zodiacOffset)||zodiacOffset<0||zodiacOffset>=12) throw new Error('십이지 동물을 골라 주세요.');
  if (mode!=='easy'&&mode!=='island') throw new Error('놀이 방식을 골라 주세요.');
  const counts=Array.isArray(pieceCounts)?pieceCounts:Array(count).fill(pieceCounts);
  if(counts.length!==count||!counts.every(n=>[2,3,4].includes(n)))throw Error('각 팀의 말은 2~4개로 골라 주세요.');
  if(!Array.isArray(computerTeams)||!computerTeams.every(i=>Number.isInteger(i)&&i>=0&&i<count))throw Error('컴퓨터 팀을 다시 골라 주세요.');
  const animals=teamAnimals??Array.from({length:count},(_,i)=>defaultTeamAnimal(i,zodiacOffset));
  if(!Array.isArray(animals)||animals.length!==count||!animals.every(i=>Number.isInteger(i)&&i>=0&&i<12))throw Error('각 팀의 동물을 골라 주세요.');
  return {roundId:globalThis.crypto?.randomUUID?.()??null,mode,eventTiles:dealTiles(),islandTiles:{},teamAnimals:[...animals],computerTeams:[...new Set(computerTeams)], team:0, turn:1, phase:'roll', revision:0, sticks:null, steps:0,
    pawns:counts.map(n=>Array.from({length:n},()=>[])), zodiacOffset, winner:null, lastMove:null,pendingRolls:[],
    note:'윷을 던져 첫 말을 출발시키세요.'};
}
export const FIRST_SEAT_SPIN_MS=4500;
export const FIRST_SEAT_RESULT_MS=2700;
export function chooseFirstSeat(state){
  const team=Math.floor(Math.random()*state.pawns.length);
  return {...state,team,firstSeatAt:Date.now(),firstSeatSpinMs:FIRST_SEAT_SPIN_MS,firstSeatResultMs:FIRST_SEAT_RESULT_MS};
}
export const firstSeatTiming=state=>[state.firstSeatSpinMs??2400,state.firstSeatResultMs??900];
export function firstSeatRemaining(state,now=Date.now()){
  if(state.revision!==0||!Number.isFinite(state.firstSeatAt))return 0;
  const [spin,result]=firstSeatTiming(state),duration=spin+result;
  return Math.max(0,Math.min(duration,state.firstSeatAt+duration-now));
}
export const position = trail => trail.length ? trail[trail.length-1] : HOME;
export function lastThrowSeed(state) {
  if(!state.sticks)return null;
  if(Number.isInteger(state.throwSeed))return state.throwSeed;
  const justRolled=state.phase==='move';
  const revision=state.revision-(justRolled?0:1);
  const team=justRolled?state.team:(state.lastMove?.team??state.team);
  return state.sticks.reduce((seed,face)=>31*seed+face,revision*11+team);
}
export function pendingRolls(state){
  return state.pendingRolls??(state.phase==='move'?[state.steps]:[]);
}
export function singleResult(state){
  const held=pendingRolls(state);
  return held.length&&held.every(n=>n===held[0])?held[0]:null;
}
export function restoreGame(state){
  if(!state||Array.isArray(state.pendingRolls))return state;
  const bonusDue=state.phase==='move'&&state.steps>=4;
  return {...state,pendingRolls:pendingRolls(state),throwSeed:lastThrowSeed(state),
    phase:bonusDue?'roll':state.phase,lastMove:bonusDue?null:state.lastMove};
}
export function throwSticks(random=Math.random) {
  return Array.from({length:4},()=>random()<0.5?1:0);
}
function passUnusedBackdo(state){
  if(state.phase!=='move'||singleResult(state)!==-1||moves(state,-1).length)return state;
  return {...state,phase:'roll',pendingRolls:[],team:(state.team+1)%state.pawns.length,turn:state.turn+1,
    passedBackdo:true,note:'물러날 말이 없어 차례를 넘겨요.'};
}
export function roll(state,sticks) {
  if (state.phase!=='roll'||!Array.isArray(sticks)||sticks.length!==4||!sticks.every(n=>n===0||n===1)) return state;
  const flats=sticks.reduce((sum,n)=>sum+n,0);
  const steps=flats===1&&sticks[BACK_DO_STICK]===1?-1:flats||5;
  const revision=state.revision+1,bonus=steps>=4;
  return passUnusedBackdo({...state,passedBackdo:false,revision,sticks,steps,throwSeed:sticks.reduce((seed,n)=>31*seed+n,revision*11+state.team),
    pendingRolls:[...pendingRolls(state),steps],lastMove:null,phase:bonus?'roll':'move',
    note:bonus?'한 번 더 던지세요.':'움직일 말을 고르세요.'});
}
function nextNode(trail,shortcut) {
  const n=position(trail);
  if(n===HOME) return 1;
  if(n===0||n===FINISH) return FINISH;
  if(shortcut&&n===5) return 20;
  if(shortcut&&n===10) return 25;
  if(n===22) return shortcut || trail.at(-2)===26 ? 27 : 23;
  if(n===19||n===28) return 0;
  if(n===24) return 15;
  if(n===26) return 22;
  return n+1;
}
function stepBack(trail){
  const from=trail.pop();
  // The first square borders the exit. From there the outer track continues backwards.
  if(!trail.length&&from>=0&&from<20)trail.push((from+19)%20);
}
function advance(trail,steps,shortcut) {
  const next=[...trail], frames=[];
  if(steps===-1){
    stepBack(next);return {next,frames:[position(next)]};
  }
  for(let step=0;step<steps&&position(next)!==FINISH;step++){
    const node=nextNode(next,step===0&&shortcut);
    next.push(node); frames.push(node);
  }
  return {next,frames};
}
export function moves(state,steps=singleResult(state)) {
  if(state.phase!=='move'||!pendingRolls(state).includes(steps)) return [];
  const team=state.pawns[state.team], options=[];
  for(let index=0;index<team.length;index++){
    const trail=team[index], from=position(trail);
    if(from===FINISH||(steps===-1&&from===HOME)||(from!==HOME&&team.findIndex(p=>position(p)===from)!==index)) continue;
    const direct=advance(trail,steps,false);
    options.push({index,shortcut:false,to:position(direct.next)});
    if(steps>0&&fork.has(from)){
      const cut=advance(trail,steps,true);
      if(cut.frames.join(',')!==direct.frames.join(',')) options.push({index,shortcut:true,to:position(cut.next)});
    }
  }
  return options;
}
export function move(state,index,shortcut=false,steps=singleResult(state)) {
  if(!moves(state,steps).some(m=>m.index===index&&m.shortcut===shortcut)) return state;
  const pawns=state.pawns.map(team=>team.map(t=>[...t]));
  const team=pawns[state.team], trail=team[index], from=position(trail);
  const moving=team.flatMap((p,i)=>i===index||(from!==HOME&&position(p)===from)?[i]:[]);
  let {next,frames}=advance(trail,steps,shortcut);
  let at=position(next), effect='', captured=0;
  const landing=at,event=tileEffect(state,at);
  if(event==='home'){
    next=[];frames.push(HOME);
    effect=EVENT_NAMES.home+'! '+(moving.length>1?'업은 말까지 모두 대기석으로 돌아갔어요.':'대기석으로 돌아갔어요.');
  }else if(event==='back'){
    stepBack(next);frames.push(position(next));
    effect=EVENT_NAMES.back+'! 왔던 길로 한 칸 물러났어요.';
  }
  at=position(next);
  moving.forEach(i=>{team[i]=[...next];});
  if(at!==HOME&&at!==FINISH){
    pawns.forEach((other,t)=>{if(t!==state.team)other.forEach((p,i)=>{
      if(position(p)===at){other[i]=[];captured++;}
    });});
    // All members of a stack follow the arriving group's route after they meet.
    team.forEach((p,i)=>{if(position(p)===at)team[i]=[...next];});
  }
  let pickedUp=null;
  if(event==='carry'){
    const stacked=team.filter(trail=>position(trail)===at).length;
    const reserve=team.findIndex(trail=>position(trail)===HOME);
    if(stacked===1&&reserve>=0){
      team[reserve]=[...next];pickedUp=reserve;
      effect=EVENT_NAMES.carry+'! 대기 중인 '+(reserve+1)+'번 말을 업었어요.';
    }else effect=EVENT_NAMES.carry+'! '+(stacked>1?'이미 업힌 말이 함께 가요.':'업을 대기 말이 없어요.');
  }
  const won=team.every(p=>position(p)===FINISH);
  const remaining=[...pendingRolls(state)];remaining.splice(remaining.indexOf(steps),1);
  // A yut or mo already earned its extra throw before the move.
  const extra=captured>0&&steps<4;
  const keepTurn=won||extra||remaining.length>0;
  let phase='roll';
  if(won)phase='won';
  else if(!extra&&remaining.length)phase='move';
  const notes=[TEAMS[state.team].name+' '+(index+1)+'번 말'+(at===FINISH?' 골인!':' 이동.')];
  if(effect)notes.push(effect);
  if(captured)notes.push(captured+'마리를 잡았어요!');
  const stackSize=team.filter(p=>position(p)===at).length;
  if(!event&&at!==HOME&&at!==FINISH&&stackSize>moving.length)notes.push('말 '+stackSize+'개가 함께 가요.');
  if(won)notes.push('말 '+team.length+'개 모두 골인!');
  else if(extra)notes.push('한 번 더 던져요.');
  return passUnusedBackdo({...state,passedBackdo:false,pawns,revision:state.revision+1,phase,winner:won?state.team:null,pendingRolls:won?[]:remaining,
    team:keepTurn?state.team:(state.team+1)%pawns.length,turn:state.turn+(keepTurn?0:1),
    lastMove:{team:state.team,steps,indices:moving,frames,from,landing,event:event??null,pickedUp,captured},note:notes.join(' ')});
}
// Estimate the remaining path with the same forks and center-entry rule as a real move.
function stepsLeft(trail){
  const at=position(trail);
  if(at===FINISH)return 0;
  const next=nextNode(trail,false);
  let remaining=stepsLeft([...trail,next]);
  if(fork.has(at)){
    const cut=nextNode(trail,true);
    if(cut!==next)remaining=Math.min(remaining,stepsLeft([...trail,cut]));
  }
  return 1+remaining;
}
export function computerAction(state){
  if(state.phase==='roll')return {type:'roll'};
  if(state.phase!=='move')return null;
  const team=state.team,progress=state.pawns[team].map(stepsLeft);
  let best=null,bestScore=-Infinity;
  for(const steps of new Set(pendingRolls(state)))for(const option of moves(state,steps)){
    const next=move(state,option.index,option.shortcut,steps);
    const own=next.pawns[team];
    let score=next.phase==='won'?10000:0;
    for(let i=0;i<own.length;i++){
      score+=progress[i]-stepsLeft(own[i]);
      if(position(own[i])===FINISH&&progress[i]>0)score+=35;
    }
    next.pawns.forEach((pawns,t)=>{
      if(t!==team)pawns.forEach((p,i)=>{
        if(position(p)===HOME&&position(state.pawns[t][i])!==HOME)score+=24;
      });
    });
    if(score>bestScore){bestScore=score;best={type:'move',index:option.index,shortcut:option.shortcut,steps};}
  }
  return best;
}
export function act(state,action) {
  if(!state||!action||firstSeatRemaining(state)) return state;
  if(action.type==='roll')return roll(state,throwSticks());
  if(action.type==='move')return move(state,action.index,action.shortcut,action.steps);
  return state;
}
export function nodeName(n){
  if(n===HOME)return '대기';if(n===FINISH)return '골인';if(n===0)return '나가기 칸';
  if(n===22)return '가운데';if(n>19)return '지름길 '+({20:1,21:2,23:4,24:5,25:1,26:2,27:4,28:5}[n])+'칸';
  return n+'번 칸';
}
