import {CARDS,CHARACTERS,ROLES,makeDeck,rankName,suitSymbol} from './data.js';

export class Game {
 constructor(state=null, random=Math.random){this.s=state;this.random=random;}
 shuffle(a){for(let i=a.length-1;i>0;i--){let j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 create({count=5,role='sheriff',character='random'}={}){
  count=Math.max(4,Math.min(7,count));
  const roles=['sheriff','renegade','outlaw','outlaw'];
  if(count>=5)roles.push('deputy');if(count>=6)roles.push('outlaw');if(count>=7)roles.push('deputy');
  this.shuffle(roles);if(role==='sheriff'){const i=roles.indexOf('sheriff');[roles[0],roles[i]]=[roles[i],roles[0]];}
  const chars=this.shuffle([...CHARACTERS]);
  if(character!=='random'){const i=chars.findIndex(c=>c.id===character);if(i>=0)[chars[0],chars[i]]=[chars[i],chars[0]];}
  this.s={version:1,players:roles.map((r,i)=>({id:i,name:i===0?'나':`AI ${i}`,role:r,char:chars[i].id,hp:chars[i].hp+(r==='sheriff'?1:0),maxHp:chars[i].hp+(r==='sheriff'?1:0),hand:[],equipment:[],alive:true,suspicion:0})),deck:this.shuffle(makeDeck()),discard:[],queue:[],pending:null,phase:'processing',current:roles.indexOf('sheriff'),turn:0,bangs:0,logs:[],serial:0,visual:null,winner:null,options:{count,role,character},store:null};
  for(const p of this.s.players)this.draw(p.id,p.hp);
  this.log('살롱의 문이 열렸습니다. 보안관부터 시작합니다.','system');
  this.s.queue.push({type:'begin',player:this.s.current});this.pump();return this.s;
 }
 p(id){return this.s.players[id];}
 char(id){return CHARACTERS.find(c=>c.id===this.p(id).char);}
 label(id){return id===0?'나':this.char(id).name;}
 alive(){return this.s.players.filter(p=>p.alive);}
 has(id,type){return this.p(id).equipment.some(c=>c.type===type);}
 weapon(id){return this.p(id).equipment.find(c=>CARDS[c.type].kind==='weapon');}
 range(id){return CARDS[this.weapon(id)?.type]?.range||1;}
 log(text,kind='normal'){this.s.logs.push({id:++this.s.serial,text,kind});if(this.s.logs.length>120)this.s.logs.shift();}
 display(card,actor=null,kind='card'){this.s.visual={id:++this.s.serial,card,actor,kind};}
 distance(a,b){if(a===b)return 0;const ids=this.alive().map(p=>p.id),x=ids.indexOf(a),y=ids.indexOf(b);if(x<0||y<0)return Infinity;return Math.max(1,Math.min(Math.abs(x-y),ids.length-Math.abs(x-y))+(this.has(b,'mustang')?1:0)+(this.p(b).char==='paul'?1:0)-(this.has(a,'scope')?1:0)-(this.p(a).char==='rose'?1:0));}
 next(id){for(let i=1;i<=this.s.players.length;i++){const p=this.p((id+i)%this.s.players.length);if(p.alive)return p.id;}return id;}
 clockwise(id,include=false){let result=include?[id]:[],n=this.next(id);while(n!==id){result.push(n);n=this.next(n);}return result;}
 takeDeck(){if(!this.s.deck.length&&this.s.discard.length){this.s.deck=this.shuffle(this.s.discard.splice(0));this.log('버린 카드를 섞어 새 뽑기 더미를 만들었습니다.','system');}return this.s.deck.pop()||null;}
 draw(id,n=1){const cards=[];for(let i=0;i<n;i++){const c=this.takeDeck();if(c){this.p(id).hand.push(c);cards.push(c);}}return cards;}
 drop(card){if(card)this.s.discard.push(card);}
 removeHand(id,cardId){const h=this.p(id).hand,i=h.findIndex(c=>c.id===cardId);return i<0?null:h.splice(i,1)[0];}
 removeEquip(id,type){const e=this.p(id).equipment,i=e.findIndex(c=>c.type===type);return i<0?null:e.splice(i,1)[0];}
 suzy(){if(this.s.pending?.kind==='duel')return;for(const p of this.alive())if(p.char==='suzy'&&p.hp>0&&!p.hand.length){if(this.draw(p.id).length)this.log(`${this.label(p.id)} · 수지의 능력으로 1장을 가져왔습니다.`);}}
 judge(id,check,reason,avoid=false){
  const cards=[];for(let i=0;i<(this.p(id).char==='lucky'?2:1);i++){const c=this.takeDeck();if(c)cards.push(c);}
  const chosen=cards.find(c=>avoid?!check(c):check(c))||cards[0];
  cards.forEach(c=>this.drop(c));if(chosen)this.display(chosen,id,'judge');
  const result=chosen?check(chosen):false;
  this.log(`${this.label(id)} · ${reason} 판정 ${cards.map(c=>rankName(c.rank)+suitSymbol[c.suit]).join(' / ')}${this.p(id).char==='lucky'?' (유리한 결과)':''}`, 'judge');return result;
 }
 pump(){
  let guard=0;
  while(!this.s.pending&&!this.s.winner&&this.s.queue.length&&guard++<150){const e=this.s.queue.shift();this.event(e);}
  this.suzy();return this.s;
 }
 event(e){
  const s=this.s,p=e.player===undefined?null:this.p(e.player);
  if(p&&!p.alive&&e.type!=='advance')return;
  switch(e.type){
   case 'begin':{
    s.current=e.player;s.turn++;s.bangs=0;s.phase='processing';this.log(`${this.label(e.player)}의 턴`, 'turn');
    s.queue.unshift({type:'dynamite',player:e.player},{type:'jail',player:e.player},{type:'draw',player:e.player});break;
   }
   case 'dynamite':{
    if(!this.has(p.id,'dynamite'))break;
    const c=this.removeEquip(p.id,'dynamite');
    if(this.judge(p.id,c=>c.suit==='S'&&c.rank>=2&&c.rank<=9,'다이너마이트',true)){this.drop(c);this.damage(p.id,3,null,'다이너마이트');if(!p.alive&&!s.winner)s.queue.push({type:'advance'});}
    else{const n=this.next(p.id);this.p(n).equipment.push(c);this.log(`다이너마이트가 ${this.label(n)}에게 넘어갔습니다.`);}
    break;
   }
   case 'jail':{
    if(!this.has(p.id,'jail'))break;
    const success=this.judge(p.id,c=>c.suit==='H','감옥');this.drop(this.removeEquip(p.id,'jail'));
    if(success)this.log(`${this.label(p.id)} · 탈출 성공!`);else{this.log(`${this.label(p.id)} · 감옥에서 한 턴 쉽니다.`);s.queue=s.queue.filter(q=>q.player!==p.id);s.queue.unshift({type:'advance'});}break;
   }
   case 'draw':{
    if(p.char==='kit'){const cards=[];for(let i=0;i<3;i++){const c=this.takeDeck();if(c)cards.push(c);}if(cards.length>2)s.pending={kind:'kit',player:p.id,cards};else{p.hand.push(...cards);s.phase='play';}}
    else if(p.char==='jesse'||(p.char==='pedro'&&s.discard.length)){s.pending={kind:'drawChoice',player:p.id,ability:p.char};}
    else{const cards=this.draw(p.id,2);this.log(`${this.label(p.id)} · 카드 ${cards.length}장을 가져왔습니다.`);
     if(p.char==='blackjack'&&cards[1]){this.display(cards[1],p.id,'reveal');this.log(`블랙 잭의 두 번째 카드: ${CARDS[cards[1].type].name} ${rankName(cards[1].rank)}${suitSymbol[cards[1].suit]}`);if(['H','D'].includes(cards[1].suit)){this.draw(p.id);this.log('블랙 잭 · 빨간 무늬로 카드 1장 추가!');}}
     s.phase='play';}break;
   }
   case 'attack':{
    let need=e.need||1;
    if(e.response==='missed'){
     const barrels=(this.has(p.id,'barrel')?1:0)+(p.char==='jourdonnais'?1:0);
     for(let i=0;i<barrels&&need>0;i++)if(this.judge(p.id,c=>c.suit==='H','술통')){need--;this.log(`${this.label(p.id)} · 술통으로 피했습니다!`);}
    }
    if(need>0)s.pending={kind:'defend',player:p.id,source:e.source,required:e.response,need,cause:e.cause};break;
   }
   case 'duel':s.pending={kind:'duel',player:p.id,source:e.source,required:'bang',need:1,cause:'결투'};break;
   case 'store':{
    if(!s.store||!s.store.order.length){s.store=null;break;}
    const id=s.store.order.shift();if(this.p(id).alive&&s.store.cards.length)s.pending={kind:'store',player:id,cards:s.store.cards};else s.queue.unshift({type:'store'});break;
   }
   case 'advance':this.advance();break;
  }
 }
 advance(){
  if(this.s.winner)return;this.s.phase='processing';this.s.pending=null;
  this.s.queue.push({type:'begin',player:this.next(this.s.current)});
 }
 checkWin(){
  const alive=this.alive(),sheriff=alive.find(p=>p.role==='sheriff');let winner=null;
  if(!sheriff)winner=alive.length===1&&alive[0].role==='renegade'?'renegade':'outlaw';
  else if(!alive.some(p=>p.role==='outlaw'||p.role==='renegade'))winner='sheriff';
  if(winner){this.s.winner=winner;this.s.phase='gameover';this.s.queue=[];this.s.pending=null;this.log(`${ROLES[winner].name}${winner==='sheriff'?'과 부관':''}의 승리!`,'win');}return winner;
 }
 damage(id,amount,source,cause){
  const p=this.p(id);p.hp-=amount;this.log(`${this.label(id)} · ${cause}으로 생명 ${amount} 감소`,'damage');
  this.s.visual={id:++this.s.serial,kind:'damage',actor:source,target:id,amount};
  if(p.char==='bart'){this.draw(id,amount);this.log(`${this.label(id)} · 바트의 능력으로 ${amount}장 획득`);}
  if(p.char==='gringo'&&source!==null&&source!==id&&this.p(source).alive){for(let i=0;i<amount;i++){const h=this.p(source).hand;if(h.length)p.hand.push(h.splice(Math.floor(this.random()*h.length),1)[0]);}this.log(`${this.label(id)} · 엘 그링고의 능력으로 상대 카드를 가져왔습니다.`);}
  if(p.hp<=0)this.s.pending={kind:'dying',player:id,source,cause};
 }
 eliminate(id,source){
  const p=this.p(id);p.alive=false;p.hp=0;
  this.log(`${this.label(id)} 탈락 · 정체는 ${ROLES[p.role].name}!`,'eliminate');
  const loot=[...p.hand.splice(0),...p.equipment.splice(0)],vulture=this.alive().find(q=>q.char==='vulture');
  if(vulture){vulture.hand.push(...loot);this.log(`${this.label(vulture.id)} · 탈락자의 카드 ${loot.length}장 획득`);}else this.s.discard.push(...loot);
  this.s.pending=null;
  if(this.checkWin())return;
  if(source!==null&&this.p(source).alive){
   const killer=this.p(source);
   if(p.role==='outlaw'){this.draw(source,3);this.log(`${this.label(source)} · 무법자 현상금으로 카드 3장 획득`);}
   if(killer.role==='sheriff'&&p.role==='deputy'){this.s.discard.push(...killer.hand.splice(0),...killer.equipment.splice(0));this.log('보안관이 부관을 제거했습니다. 손패와 장비를 모두 버립니다.','damage');}
  }
  if(id===this.s.current&&!this.s.queue.some(e=>e.type==='advance'))this.s.queue.push({type:'advance'});
 }
 bangType(id,card){return card.type==='bang'||(this.p(id).char==='janet'&&card.type==='missed');}
 defenseCards(id,required){return this.p(id).hand.filter(c=>c.type===required||(this.p(id).char==='janet'&&((required==='bang'&&c.type==='missed')||(required==='missed'&&c.type==='bang'))));}
 canPlay(id,card){
  const s=this.s,p=this.p(id);if(!p.alive)return '이미 탈락했습니다.';
  if(s.winner||s.current!==id||s.phase!=='play'||s.pending)return '내 턴에 사용할 수 있습니다.';
  if(!p.hand.some(c=>c.id===card.id))return '손에 없는 카드입니다.';
  const type=this.bangType(id,card)?'bang':card.type;
  if(type==='missed')return '공격받았을 때 쓰는 방어 카드입니다.';
  if(type==='bang'&&s.bangs>=1&&p.char!=='willy'&&!this.has(id,'volcanic'))return '이번 턴에는 이미 뱅!을 사용했습니다.';
  if(type==='beer'&&(p.hp>=p.maxHp||this.alive().length<=2))return this.alive().length<=2?'두 명만 남으면 맥주를 사용할 수 없습니다.':'생명이 가득 찼습니다.';
  if(CARDS[type].kind==='equipment'&&type!=='jail'&&this.has(id,type))return '이미 같은 장비를 장착했습니다.';
  if((CARDS[type].target||type==='bang')&&!this.targets(id,card).length)return '사용할 수 있는 상대가 없습니다.';
  return '';
 }
 targets(id,card){
  const type=this.bangType(id,card)?'bang':card.type;
  return this.alive().filter(p=>p.id!==id).filter(p=>{
   if(type==='bang')return this.distance(id,p.id)<=this.range(id);
   if(type==='panic')return this.distance(id,p.id)<=1&&(p.hand.length+p.equipment.length)>0;
   if(type==='cat')return (p.hand.length+p.equipment.length)>0;
   if(type==='jail')return p.role!=='sheriff'&&!this.has(p.id,'jail');
   return type==='duel';
  }).map(p=>p.id);
 }
 play(id,cardId,target=null){
  const p=this.p(id),card=p.hand.find(c=>c.id===cardId);if(!card)return false;
  if(this.canPlay(id,card))return false;
  const type=this.bangType(id,card)?'bang':card.type,def=CARDS[type];
  if((def.target||type==='bang')&&!this.targets(id,card).includes(target))return false;
  this.removeHand(id,cardId);this.display(card,id);this.log(`${this.label(id)} · ${CARDS[card.type].name}${target!==null?' → '+this.label(target):''}`);
  if(target!==null&&this.p(target).role==='sheriff')p.suspicion+=3;
  else if(target!==null&&p.role==='sheriff')this.p(target).suspicion+=0.35;
  if(def.kind==='weapon'){
   const old=this.weapon(id);if(old)this.drop(this.removeEquip(id,old.type));p.equipment.push(card);
  }else if(def.kind==='equipment')this.p(type==='jail'?target:id).equipment.push(card);
  else{
   this.drop(card);
   switch(type){
    case 'bang':this.s.bangs++;this.s.queue.push({type:'attack',player:target,source:id,response:'missed',need:p.char==='slab'?2:1,cause:'뱅!'});break;
    case 'beer':p.hp=Math.min(p.maxHp,p.hp+1);break;
    case 'saloon':for(const a of this.alive())a.hp=Math.min(a.maxHp,a.hp+1);break;
    case 'stagecoach':this.draw(id,2);break;
    case 'wells':this.draw(id,3);break;
    case 'cat':case 'panic':this.s.pending={kind:'steal',player:id,target,steal:type==='panic'};break;
    case 'duel':this.s.queue.push({type:'duel',player:target,source:id});break;
    case 'indians':case 'gatling':
     if(p.role!=='sheriff')p.suspicion+=0.4;
     this.s.queue.push(...this.clockwise(id).map(player=>({type:'attack',player,source:id,response:type==='indians'?'bang':'missed',need:1,cause:def.name})));break;
    case 'store':{
     const cards=[];for(let i=0;i<this.alive().length;i++){const c=this.takeDeck();if(c)cards.push(c);}
     this.s.store={cards,order:this.clockwise(id,true)};this.s.queue.push({type:'store'});break;
    }
   }
  }
  this.suzy();this.pump();return true;
 }
 choose(action,value=null){
  const q=this.s.pending;if(!q)return false;const p=this.p(q.player);
  if(q.kind==='kit'){
   const c=q.cards.find(c=>c.id===value);if(!c)return false;
   p.hand.push(...q.cards.filter(x=>x.id!==value));this.s.deck.push(c);this.log(`${this.label(p.id)} · 키트의 능력으로 카드 2장 선택`);this.s.pending=null;this.s.phase='play';
  }else if(q.kind==='drawChoice'){
   if(action==='deck')this.draw(p.id);
   else if(action==='discard'&&q.ability==='pedro'&&this.s.discard.length)p.hand.push(this.s.discard.pop());
   else if(action==='steal'&&q.ability==='jesse'&&value!==p.id&&this.p(value)?.alive&&this.p(value).hand.length){const h=this.p(value).hand;p.hand.push(h.splice(Math.floor(this.random()*h.length),1)[0]);if(this.p(value).role==='sheriff')p.suspicion+=1;}
   else return false;
   this.draw(p.id);this.log(`${this.label(p.id)} · 카드 2장을 가져왔습니다.`);this.s.pending=null;this.s.phase='play';
  }else if(q.kind==='store'){
   const i=this.s.store.cards.findIndex(c=>c.id===value);if(i<0)return false;const card=this.s.store.cards.splice(i,1)[0];p.hand.push(card);this.log(`${this.label(p.id)} · 잡화점에서 ${CARDS[card.type].name} 선택`);this.s.pending=null;this.s.queue.unshift({type:'store'});
  }else if(q.kind==='steal'){
   const target=this.p(q.target);let card;
   if(action==='hand'&&target.hand.length)card=target.hand.splice(Math.floor(this.random()*target.hand.length),1)[0];
   else if(action==='equipment'){const i=target.equipment.findIndex(c=>c.id===value);if(i>=0)card=target.equipment.splice(i,1)[0];}
   if(!card)return false;if(q.steal)p.hand.push(card);else this.drop(card);
   this.log(`${this.label(p.id)} · ${this.label(target.id)}의 ${q.steal&&action==='hand'?'손패 1장':CARDS[card.type].name}${q.steal?' 획득':' 버림'}`);this.s.pending=null;
  }else if(q.kind==='defend'||q.kind==='duel'){
   if(action==='card'){
    const c=this.defenseCards(p.id,q.required).find(c=>c.id===value);if(!c)return false;
    this.drop(this.removeHand(p.id,value));this.display(c,p.id);this.log(`${this.label(p.id)} · ${CARDS[c.type].name}으로 대응`);
    q.need--;if(q.need<=0){this.s.pending=null;if(q.kind==='duel')this.s.queue.unshift({type:'duel',player:q.source,source:p.id});}
   }else if(action==='take'){
    this.s.pending=null;this.damage(p.id,1,q.source,q.cause);
   }else return false;
  }else if(q.kind==='dying'){
   if(action==='beer'){
    const c=p.hand.find(c=>c.type==='beer');if(!c||this.alive().length<=2)return false;
    this.drop(this.removeHand(p.id,c.id));p.hp++;this.log(`${this.label(p.id)} · 맥주로 마지막 생명을 회복합니다!`);if(p.hp>0)this.s.pending=null;
   }else if(action==='giveup')this.eliminate(p.id,q.source);else return false;
  }else return false;
  // Suzy cannot draw in the middle of a duel, including its queued continuation.
  if(!this.s.queue.some(e=>e.type==='duel'))this.suzy();this.pump();return true;
 }
 healSid(id,ids){
  const p=this.p(id);if(p.char!=='sid'||!p.alive||p.hp>=p.maxHp||ids.length!==2||new Set(ids).size!==2||!ids.every(x=>p.hand.some(c=>c.id===x))||this.s.winner)return false;
  for(const cid of ids)this.drop(this.removeHand(id,cid));p.hp++;this.log(`${this.label(id)} · 손패 2장을 버리고 생명 1 회복`);
  if(this.s.pending?.kind==='dying'&&this.s.pending.player===id&&p.hp>0)this.s.pending=null;
  this.pump();return true;
 }
 endTurn(id){if(id!==this.s.current||this.s.phase!=='play'||this.s.pending||this.s.winner)return false;
  if(this.p(id).hand.length>this.p(id).hp)this.s.phase='discard';else{this.advance();this.pump();}return true;
 }
 discardCard(id,cardId){if(this.s.current!==id||this.s.phase!=='discard'||this.s.pending)return false;const c=this.removeHand(id,cardId);if(!c)return false;this.drop(c);this.log(`${this.label(id)} · ${CARDS[c.type].name} 버림`);if(this.p(id).hand.length<=this.p(id).hp){this.advance();this.pump();}return true;}
 value(id,c){const p=this.p(id),type=c.type;
  if(type==='beer')return this.alive().length<=2?0:p.hp<p.maxHp?10:5;
  if(type==='missed')return 7;
  if(type==='bang')return 6;
  if(CARDS[type].kind==='weapon')return this.range(id)<CARDS[type].range?8:2;
  if(CARDS[type].kind==='equipment')return this.has(id,type)?1:type==='dynamite'?0:8;
  return {wells:10,stagecoach:9,panic:8,cat:6,duel:4,indians:4,gatling:5,store:5,saloon:p.hp<p.maxHp?7:1}[type]||4;
 }
 threat(id,target){const p=this.p(id),t=this.p(target),sheriff=this.alive().find(p=>p.role==='sheriff');
  // Bots use their own role, public sheriff identity and observed actions only.
  if(p.role==='outlaw')return t.role==='sheriff'?20:Math.max(0,2-t.suspicion);
  if(p.role==='sheriff'||p.role==='deputy')return t.role==='sheriff'?-100:3+t.suspicion*3+(t.hp<3?1:0);
  if(t.role==='sheriff')return this.alive().length===2?25:-30;
  return 5+(sheriff&&sheriff.hp<=2?t.suspicion*3:0)+(t.hp<=2?2:0);
 }
 aiAction(includeHuman=false){
  const s=this.s;if(s.winner)return false;const q=s.pending,id=q?q.player:s.current,p=this.p(id);
  if(id===0&&!includeHuman)return false;
  const least=()=>[...p.hand].sort((a,b)=>this.value(id,a)-this.value(id,b));
  if(q){
   if(q.kind==='kit'){const c=[...q.cards].sort((a,b)=>this.value(id,a)-this.value(id,b))[0];return this.choose('choose',c.id);}
   if(q.kind==='drawChoice'){
    if(q.ability==='pedro'&&s.discard.length&&this.value(id,s.discard.at(-1))>=6)return this.choose('discard');
    if(q.ability==='jesse'){const t=this.alive().filter(t=>t.id!==id&&t.hand.length).sort((a,b)=>this.threat(id,b.id)-this.threat(id,a.id))[0];if(t&&this.threat(id,t.id)>0)return this.choose('steal',t.id);}
    return this.choose('deck');
   }
   if(q.kind==='store'){const c=[...q.cards].sort((a,b)=>this.value(id,b)-this.value(id,a))[0];return this.choose('choose',c.id);}
   if(q.kind==='steal'){
    const t=this.p(q.target),c=[...t.equipment].sort((a,b)=>this.value(id,b)-this.value(id,a))[0];if(c)return this.choose('equipment',c.id);return this.choose('hand');
   }
   if(q.kind==='defend'||q.kind==='duel'){
    const cards=this.defenseCards(id,q.required);return cards.length>=q.need?this.choose('card',cards[0].id):this.choose('take');
   }
   if(q.kind==='dying'){
    if(p.hand.some(c=>c.type==='beer')&&this.alive().length>2)return this.choose('beer');
    if(p.char==='sid'&&p.hand.length>=2)return this.healSid(id,least().slice(0,2).map(c=>c.id));
    return this.choose('giveup');
   }
  }
  if(s.phase==='discard')return this.discardCard(id,least()[0].id);
  if(s.phase!=='play'){this.pump();return true;}
  if(p.char==='sid'&&p.hp<=2&&p.hand.length>=3)return this.healSid(id,least().slice(0,2).map(c=>c.id));
  const candidates=[];
  for(const card of p.hand){if(this.canPlay(id,card))continue;const type=this.bangType(id,card)?'bang':card.type,def=CARDS[type];
   if(def.target||type==='bang'){
    const targets=this.targets(id,card).sort((a,b)=>this.threat(id,b)-this.threat(id,a));const t=targets[0];
    if(t!==undefined&&this.threat(id,t)>0)candidates.push({card,target:t,score:type==='bang'?9:type==='jail'?7:6});
   }else{
    let score=this.value(id,card);
    if(def.kind==='weapon'&&def.range<=this.range(id)&&type!=='volcanic')score=-1;
    if(type==='dynamite')score=p.hand.length>p.hp?1:-1;
    if(type==='saloon'&&p.hp===p.maxHp)score=-1;
    if((type==='indians'||type==='gatling')&&['deputy','renegade'].includes(p.role)&&this.alive().find(t=>t.role==='sheriff')?.hp<=1)score=-1;
    if(score>0)candidates.push({card,target:null,score});
   }
  }
  candidates.sort((a,b)=>b.score-a.score);const action=candidates[0];
  return action?this.play(id,action.card.id,action.target):this.endTurn(id);
 }
}
