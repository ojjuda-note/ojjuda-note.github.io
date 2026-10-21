/* Ojjuda seven-card poker. Pure rules; no account balance or paid currency. */
export const SUITS = ['♣', '♥', '♦', '♠'];
export const NAMES = ['하이카드','원페어','투페어','트리플','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시'];
export const rank = card => card % 13 + 2;
export const suit = card => Math.floor(card / 13);
export const face = card => ({11:'J',12:'Q',13:'K',14:'A'}[rank(card)] || String(rank(card)));
export const cardName = card => face(card) + SUITS[suit(card)];
export function compare(a, b) {
  for (let i = 0; i < Math.max(a.length,b.length); i++) if ((a[i]||0) !== (b[i]||0)) return (a[i]||0) - (b[i]||0);
  return 0;
}
export function shuffle(random = Math.random) {
  const deck = Array.from({length:52},(_,i)=>i);
  for (let i=51;i>0;i--) { const j=Math.floor(random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}
function groups(cards) {
  const counts=new Map();
  for(const card of cards) counts.set(rank(card),(counts.get(rank(card))||0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
}
export function evaluateFive(cards) {
  if(cards.length!==5) throw Error('Five cards required');
  const sorted=[...cards].sort((a,b)=>rank(b)-rank(a)||suit(b)-suit(a));
  const ranks=sorted.map(rank), g=groups(cards);
  const flush=cards.every(c=>suit(c)===suit(cards[0]));
  const wheel=ranks.join(',')==='14,5,4,3,2';
  const straight=new Set(ranks).size===5 && (wheel || ranks[0]-ranks[4]===4);
  // Korean table rule: mountain > back straight > K-high straight.
  const high=wheel?13.5:ranks[0];
  let category, values;
  if(flush&&straight){category=8;values=[high];}
  else if(g[0][1]===4){category=7;values=g.map(x=>x[0]);}
  else if(g[0][1]===3&&g[1][1]===2){category=6;values=g.map(x=>x[0]);}
  else if(flush){category=5;values=ranks;}
  else if(straight){category=4;values=[high];}
  else if(g[0][1]===3){category=3;values=g.map(x=>x[0]);}
  else if(g[0][1]===2&&g[1][1]===2){category=2;values=g.map(x=>x[0]);}
  else if(g[0][1]===2){category=1;values=g.map(x=>x[0]);}
  else{category=0;values=ranks;}
  let name=NAMES[category];
  if(straight) name=high===14?(flush?'로열 스트레이트 플러시':'마운틴'):wheel?(flush?'백 스트레이트 플러시':'백스트레이트'):name;
  // Compare all relevant ranks before suits. Suit breaks an otherwise exact tie.
  const ordered=g.flatMap(([r])=>sorted.filter(c=>rank(c)===r));
  const suitKey=(straight||flush||category===0?sorted:ordered).map(suit);
  return {category,name,score:[category,...values,...suitKey.map(s=>(s+1)/100)],cards:sorted};
}
export function bestHand(cards) {
  if(cards.length<5){
    const g=groups(cards), category=g[0]?.[1]===4?7:g[0]?.[1]===3?3:g[0]?.[1]===2?(g[1]?.[1]===2?2:1):0;
    return {category,name:NAMES[category],score:[category,...g.map(x=>x[0])],cards:[...cards]};
  }
  let best=null;
  for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){
    const result=evaluateFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);
    if(!best||compare(result.score,best.score)>0)best=result;
  }
  return best;
}
export function distributePots(players, dealer=0) {
  const payouts=players.map(()=>0), pots=[];
  const levels=[...new Set(players.map(p=>p.total).filter(v=>v>0))].sort((a,b)=>a-b);
  let previous=0;
  for(const level of levels){
    const contributors=players.map((p,i)=>p.total>=level?i:-1).filter(i=>i>=0);
    const amount=(level-previous)*contributors.length; previous=level;
    let eligible=contributors.filter(i=>!players[i].folded);
    // An unmatched excess belongs to its sole contributor, even on abandonment.
    if(contributors.length===1){payouts[contributors[0]]+=amount;pots.push({amount,winners:contributors,refund:true});continue;}
    if(!eligible.length)eligible=players.map((p,i)=>!p.folded?i:-1).filter(i=>i>=0);
    if(!eligible.length)throw Error('No eligible player');
    const scores=new Map(eligible.map(i=>[i,bestHand(players[i].cards).score]));
    let winners=[eligible[0]];
    for(const i of eligible.slice(1)){
      const cmp=compare(scores.get(i),scores.get(winners[0]));
      if(cmp>0)winners=[i];else if(cmp===0)winners.push(i);
    }
    winners.sort((a,b)=>(a-dealer-1+players.length)%players.length-(b-dealer-1+players.length)%players.length);
    const share=Math.floor(amount/winners.length);let remainder=amount%winners.length;
    for(const i of winners)payouts[i]+=share+(remainder-->0?1:0);
    pots.push({amount,winners,refund:false});
  }
  return {payouts,pots};
}
export class SevenPoker {
  constructor({stacks=[5000,5000,5000,5000],ante=50,dealer=0,random=Math.random}={}) {
    if(stacks.length!==4||!Number.isInteger(ante)||ante<1||stacks.some(n=>!Number.isSafeInteger(n)||n<ante||n>1e9))throw Error('Invalid buy-in');
    this.random=random;this.ante=ante;this.minimum=ante*2;this.dealer=dealer%4;this.deck=shuffle(random);
    this.players=stacks.map((stack,i)=>({name:['나','하루','두리','보리'][i],stack,initial:stack,cards:[],up:[],total:0,bet:0,folded:false,allIn:false,last:'참가'}));
    this.discarded=[];this.log=[];this.phase='discard';this.street=0;this.turn=0;this.currentBet=0;this.raises=0;this.raiseSize=this.minimum;
    this.pending=[];this.raiseAllowed=[];this.result=null;
    for(let round=0;round<4;round++)for(const p of this.players)p.cards.push(this.deck.pop());
    for(const p of this.players)this.pay(p,ante);
    for(let i=1;i<4;i++){
      const p=this.players[i];const idx=chooseDiscard(p.cards);this.discarded.push(...p.cards.splice(idx,1));
      const open=[...p.cards].sort((a,b)=>rank(b)-rank(a)||suit(b)-suit(a))[0];p.up=[open];
    }
  }
  get pot(){return this.players.reduce((sum,p)=>sum+p.total,0);}
  active(){return this.players.map((p,i)=>!p.folded?i:-1).filter(i=>i>=0);}
  canAct(){return this.active().filter(i=>!this.players[i].allIn);}
  pay(p,amount){const n=Math.min(p.stack,amount);p.stack-=n;p.total+=n;p.bet+=n;p.allIn=p.stack===0;return n;}
  discard(index){
    if(this.phase!=='discard'||!Number.isInteger(index)||index<0||index>=4)throw Error('Invalid discard');
    this.discarded.push(...this.players[0].cards.splice(index,1));this.phase='open';
  }
  open(index){
    if(this.phase!=='open'||!Number.isInteger(index)||index<0||index>=3)throw Error('Invalid open card');
    this.players[0].up=[this.players[0].cards[index]];this.dealStreet();
  }
  exposedScore(p){
    const cards=p.up, g=groups(cards);
    return [g[0]?.[1]===4?4:g[0]?.[1]===3?3:g[0]?.[1]===2?(g[1]?.[1]===2?2:1):0,...g.map(x=>x[0]),...cards.slice().sort((a,b)=>rank(b)-rank(a)||suit(b)-suit(a)).map(c=>suit(c)/10)];
  }
  dealStreet(){
    const next=this.street?this.street+1:4;
    if(next>7){this.finish();return;}
    this.street=next;this.currentBet=0;this.raises=0;this.raiseSize=this.minimum;
    for(const p of this.players){
      p.bet=0;p.last=p.folded?'다이':p.allIn?'올인':'';
      if(!p.folded){const c=this.deck.pop();p.cards.push(c);if(next<7)p.up.push(c);}
    }
    const actionable=this.canAct();
    if(actionable.length<2){this.phase='runout';this.turn=-1;this.pending=[];return;}
    let first=actionable[0];
    for(const i of actionable)if(compare(this.exposedScore(this.players[i]),this.exposedScore(this.players[first]))>0)first=i;
    this.pending=[...actionable];this.raiseAllowed=[...actionable];this.turn=first;this.phase='betting';
    this.log.push(`${next===7?'마지막 히든':next+'구'} · ${this.players[first].name}부터`);
  }
  advance(){if(this.phase!=='runout'&&this.phase!=='between')throw Error('Not between streets');this.dealStreet();}
  legal(){
    if(this.phase!=='betting')return null;
    const p=this.players[this.turn],need=Math.max(0,this.currentBet-p.bet);
    const mayRaise=this.raises<3&&this.raiseAllowed.includes(this.turn)&&this.canAct().length>1;
    const minTo=this.currentBet+this.raiseSize,maxTo=p.bet+p.stack;
    return {call:Math.min(need,p.stack),need,check:need===0,mayRaise:mayRaise&&maxTo>this.currentBet,minTo,maxTo,allIn:maxTo<=this.currentBet||mayRaise};
  }
  act(type,to=0){
    const legal=this.legal();if(!legal)throw Error('Not your turn');
    const id=this.turn,p=this.players[id];let raised=false,fullRaise=false,oldBet=this.currentBet;
    if(type==='fold'){p.folded=true;p.last='다이';}
    else if(type==='check'){if(!legal.check)throw Error('Must call');p.last='체크';}
    else if(type==='call'){this.pay(p,legal.call);p.last=p.allIn?'올인':legal.need?'콜':'체크';}
    else if(type==='raise'||type==='allin'){
      if(type==='allin')to=legal.maxTo;
      if(!Number.isSafeInteger(to)||to<=p.bet||to>legal.maxTo)throw Error('Invalid amount');
      if(to<=this.currentBet){if(type!=='allin'||!legal.allIn)throw Error('Invalid call');this.pay(p,to-p.bet);p.last='올인';}
      else{
        if(!legal.mayRaise||(to<legal.minTo&&to!==legal.maxTo))throw Error('Cannot raise');
        this.pay(p,to-p.bet);this.currentBet=p.bet;raised=true;fullRaise=this.currentBet-oldBet>=this.raiseSize;
        if(fullRaise){this.raiseSize=this.currentBet-oldBet;this.raises++;}
        p.last=p.allIn?'올인':`베팅 ${p.bet.toLocaleString('ko-KR')}`;
      }
    }else throw Error('Unknown action');
    this.log.push(`${p.name} · ${p.last}`);this.log=this.log.slice(-40);
    this.pending=this.pending.filter(i=>i!==id&&!this.players[i].folded&&!this.players[i].allIn);
    this.raiseAllowed=this.raiseAllowed.filter(i=>i!==id);
    if(raised){
      this.pending=this.canAct().filter(i=>i!==id);
      if(fullRaise)this.raiseAllowed=[...this.pending];
    }
    if(this.active().length===1){this.finish();return;}
    if(!this.pending.length){this.phase='between';this.turn=-1;return;}
    for(let offset=1;offset<=4;offset++){const next=(id+offset)%4;if(this.pending.includes(next)){this.turn=next;break;}}
  }
  finish(){
    if(this.phase==='finished')return;
    const total=this.pot;
    if(this.active().length===1){
      const winner=this.active()[0],payouts=this.players.map((_,i)=>i===winner?total:0);
      this.result={payouts,pots:[{amount:total,winners:[winner]}],uncontested:true};
    }else this.result={...distributePots(this.players,this.dealer),uncontested:false};
    this.players.forEach((p,i)=>{p.stack+=this.result.payouts[i];p.allIn=false;});
    this.result.net=this.players.map(p=>p.stack-p.initial);
    this.phase='finished';this.turn=-1;this.pending=[];
  }
}
export function chooseDiscard(cards){
  let best=-Infinity,pick=0;
  for(let i=0;i<cards.length;i++){
    const keep=cards.filter((_,j)=>j!==i),g=groups(keep),r=keep.map(rank).sort((a,b)=>a-b);
    const score=(g[0][1]===3?500:g[0][1]===2?150:0)+keep.reduce((s,c)=>s+rank(c),0)+(new Set(keep.map(suit)).size===1?30:0)+(r[2]-r[0]<=4?12:0);
    if(score>best){best=score;pick=i;}
  }return pick;
}
// The AI receives only its own cards and public opponent cards. No deck/hole access.
export function aiView(game){
  const me=game.turn;
  return {street:game.street,pot:game.pot,legal:game.legal(),cards:[...game.players[me].cards],opponents:game.players.filter((p,i)=>i!==me&&!p.folded).map(p=>({up:[...p.up],stack:p.stack})),stack:game.players[me].stack,bet:game.players[me].bet};
}
export function chooseAI(view,random=Math.random,difficulty='normal'){
  const {legal:l,cards,opponents}=view;if(!l)throw Error('No legal actions');
  const made=bestHand(cards),upBest=Math.max(0,...opponents.map(p=>bestHand(p.up).category));
  let strength=[.12,.38,.59,.73,.83,.87,.93,.98,.995][made.category];
  if(made.category===1)strength+=(rank(made.cards.find(c=>cards.filter(k=>rank(k)===rank(c)).length===2)??cards[0])-8)/65;
  if(view.street<7){
    const flushDraw=Math.max(...SUITS.map((_,s)=>cards.filter(c=>suit(c)===s).length));
    if(flushDraw===4)strength+=.12;
  }
  if(upBest>made.category)strength-=.16;
  if(difficulty==='easy')strength+=(random()-.5)*.4;
  const roll=random(),price=l.need/Math.max(1,view.pot+l.need);
  if(l.need>0&&strength<price+.16&&roll>.13)return {type:'fold'};
  if(l.mayRaise&&l.maxTo>=l.minTo&&((strength>.66&&roll<.5)||(strength>.2&&roll<.055))){
    const target=Math.max(l.minTo,view.bet+l.need+Math.floor((view.pot+l.need)/2));
    return {type:'raise',to:Math.min(target,l.maxTo)};
  }
  return {type:l.check?'check':'call'};
}
export function restoreGame(snapshot,random=Math.random){
  try{
    const s=JSON.parse(JSON.stringify(snapshot));
    if(!s||!Array.isArray(s.players)||s.players.length!==4||!['discard','open','betting','between','runout','finished'].includes(s.phase))return null;
    if(![0,4,5,6,7].includes(s.street)||!Number.isInteger(s.dealer)||s.dealer<0||s.dealer>3||s.ante!==50||s.minimum!==100)return null;
    if(!Array.isArray(s.deck)||!Array.isArray(s.discarded)||!Array.isArray(s.log)||!Array.isArray(s.pending)||!Array.isArray(s.raiseAllowed))return null;
    for(const p of s.players){
      if(!p||!Array.isArray(p.cards)||p.cards.length<3||p.cards.length>7||!Array.isArray(p.up)||p.up.some(c=>!p.cards.includes(c)))return null;
      if(['stack','initial','total','bet'].some(k=>!Number.isSafeInteger(p[k])||p[k]<0||p[k]>1e9)||p.bet>p.total)return null;
      if(typeof p.folded!=='boolean'||typeof p.allIn!=='boolean')return null;
    }
    const all=[...s.deck,...s.discarded,...s.players.flatMap(p=>p.cards)];
    if(all.length!==52||new Set(all).size!==52||all.some(c=>!Number.isInteger(c)||c<0||c>51))return null;
    const initial=s.players.reduce((n,p)=>n+p.initial,0),current=s.players.reduce((n,p)=>n+p.stack+(s.phase==='finished'?0:p.total),0);
    if(initial!==current)return null;
    if(s.phase==='betting'&&(!s.pending.includes(s.turn)||!s.players[s.turn]||s.players[s.turn].folded||s.players[s.turn].allIn))return null;
    if(s.pending.concat(s.raiseAllowed).some(i=>!Number.isInteger(i)||i<0||i>3))return null;
    if(!Number.isSafeInteger(s.currentBet)||s.currentBet<0||!Number.isSafeInteger(s.raises)||s.raises<0||s.raises>3||!Number.isSafeInteger(s.raiseSize)||s.raiseSize<100)return null;
    if(s.phase==='finished'&&(!s.result||s.result.payouts?.length!==4||s.result.net?.length!==4||!Array.isArray(s.result.pots)))return null;
    s.log=s.log.filter(v=>typeof v==='string').slice(-40);
    s.players.forEach((p,i)=>{p.name=['나','하루','두리','보리'][i];});
    return Object.assign(Object.create(SevenPoker.prototype),s,{random});
  }catch{return null;}
}
