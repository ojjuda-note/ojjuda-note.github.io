export const HOME = -1;
export const FINISH = 29;
export const TEAMS = [
  {name:'산호', color:'#ed7057', mark:'●'},
  {name:'바다', color:'#239b90', mark:'◆'},
  {name:'자두', color:'#9661c5', mark:'▲'},
  {name:'유자', color:'#dfad38', mark:'★'}
];
export const YUT = ['', '도', '개', '걸', '윷', '모'];
export const ROCK = [3,16], WHIRL = [8,13], WIND = [6,18];
const fork = new Set([5,10,22]);

export function newGame(count=2) {
  if (![2,3,4].includes(count)) throw new Error('2~4팀을 골라 주세요.');
  return {team:0, turn:1, phase:'roll', revision:0, sticks:null, steps:0,
    pawns:Array.from({length:count},()=>[[],[]]), winner:null, lastMove:null,
    note:'윷을 던져 첫 말을 출발시키세요.'};
}
export const position = trail => trail.length ? trail[trail.length-1] : HOME;
export function throwSticks(random=Math.random) {
  return Array.from({length:4},()=>random()<0.5?1:0);
}
export function roll(state,sticks) {
  if (state.phase!=='roll'||!Array.isArray(sticks)||sticks.length!==4||!sticks.every(n=>n===0||n===1)) return state;
  const steps=sticks.reduce((sum,n)=>sum+n,0)||5;
  return {...state,revision:state.revision+1,sticks,steps,phase:'move',note:YUT[steps]+'! 움직일 말을 고르세요.'};
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
function advance(trail,steps,shortcut) {
  const next=[...trail], frames=[];
  for(let step=0;step<steps&&position(next)!==FINISH;step++){
    const node=nextNode(next,step===0&&shortcut);
    next.push(node); frames.push(node);
  }
  return {next,frames};
}
export function moves(state) {
  if(state.phase!=='move') return [];
  const team=state.pawns[state.team], options=[];
  for(let index=0;index<team.length;index++){
    const trail=team[index], from=position(trail);
    if(from===FINISH|| (index>0&&position(team[0])===from)) continue;
    const direct=advance(trail,state.steps,false);
    options.push({index,shortcut:false,to:position(direct.next)});
    if(fork.has(from)){
      const cut=advance(trail,state.steps,true);
      if(cut.frames.join(',')!==direct.frames.join(',')) options.push({index,shortcut:true,to:position(cut.next)});
    }
  }
  return options;
}
export function move(state,index,shortcut=false) {
  if(!moves(state).some(m=>m.index===index&&m.shortcut===shortcut)) return state;
  const pawns=state.pawns.map(team=>team.map(t=>[...t]));
  const team=pawns[state.team], trail=team[index], from=position(trail);
  const moving=team.flatMap((p,i)=>i===index||(from!==HOME&&position(p)===from)?[i]:[]);
  let {next,frames}=advance(trail,state.steps,shortcut);
  let at=position(next), effect='', captured=0;
  if(ROCK.includes(at)||WHIRL.includes(at)){
    const back=WHIRL.includes(at)?2:1;
    for(let i=0;i<back&&next.length;i++){next.pop();frames.push(position(next));}
    effect=back===2?'소용돌이! 두 칸 뒤로 밀렸어요.':'바위턱! 한 칸 뒤로 밀렸어요.';
  }else if(WIND.includes(at)){
    const gust=advance(next,2,false);
    next=gust.next;frames.push(...gust.frames);effect='순풍! 두 칸 더 갔어요.';
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
  const won=team.every(p=>position(p)===FINISH);
  const extra=state.steps>=4||captured>0;
  const notes=[TEAMS[state.team].name+' '+(index+1)+'번 말'+(at===FINISH?' 골인!':' 이동.')];
  if(effect)notes.push(effect);
  if(captured)notes.push(captured+'마리를 잡았어요!');
  if(at!==HOME&&at!==FINISH&&moving.length===1&&team.filter(p=>position(p)===at).length>1)notes.push('두 말이 업혔어요.');
  if(won)notes.push('두 말 모두 골인!');
  else if(extra)notes.push('한 번 더 던져요.');
  return {...state,pawns,revision:state.revision+1,phase:won?'won':'roll',winner:won?state.team:null,
    team:won||extra?state.team:(state.team+1)%pawns.length,turn:state.turn+(won||extra?0:1),
    lastMove:{team:state.team,indices:moving,frames,from},note:notes.join(' ')};
}
export function act(state,action) {
  if(!state||!action) return state;
  if(action.type==='roll')return roll(state,throwSticks());
  if(action.type==='move')return move(state,action.index,action.shortcut);
  return state;
}
export function nodeName(n){
  if(n===HOME)return '대기';if(n===FINISH)return '골인';if(n===0)return '마지막 칸';
  if(n===22)return '가운데';if(n>19)return '지름길 '+({20:1,21:2,23:4,24:5,25:1,26:2,27:4,28:5}[n])+'칸';
  return n+'번 칸';
}
