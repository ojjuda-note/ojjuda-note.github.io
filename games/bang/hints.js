import {Game} from './engine.js';
import {CARDS, CHARACTERS} from './data.js';

// Practice receives a full engine state; online play receives a redacted view.
// Build the same public-information view before evaluating either one.
function publicGame(state, seat) {
 const players=state.players.map(p=>({
  id:p.id,name:p.name,char:p.char,hp:p.hp,maxHp:p.maxHp,alive:p.alive,
  role:p.id===seat||p.role==='sheriff'||!p.alive||state.winner?p.role:'unknown',
  suspicion:p.suspicion||0,
  hand:p.id===seat?p.hand.map(c=>({...c})):Array.from({length:p.hand.length},()=>({hidden:true})),
  equipment:p.equipment.map(c=>({...c}))
 }));
 const pending=state.pending?.player===seat?structuredClone(state.pending):state.pending?{player:state.pending.player}:null;
 return new Game({players,pending,current:state.current,phase:state.phase,bangs:state.bangs,winner:state.winner,discard:state.discard,deck:[],queue:[]});
}

export function recommend(state, seat=0) {
 if(!state?.players?.[seat])return null;
 const g=publicGame(state,seat),s=g.s,p=g.p(seat),q=s.pending;
 if(s.winner||!p.alive)return null;
 const name=id=>state.online?g.p(id).name:CHARACTERS.find(c=>c.id===g.p(id).char)?.name||'상대';
 const hint=(title,reason,action,cardId=null,targetId=null,cardIds=[])=>({title,reason,action,cardId,targetId,cardIds});
 const worth=c=>{
  if(c.type==='beer'&&g.alive().length<=2)return -1;
  const defenses=g.defenseCards(seat,'missed'),defensive=c.type==='missed'||p.char==='janet'&&c.type==='bang';
  return g.value(seat,c)+(defensive?defenses.length===0?2:defenses.length===1&&defenses[0].id===c.id?4:0:0);
 };
 const least=cards=>[...cards].sort((a,b)=>worth(a)-worth(b)||a.id-b.id);
 const best=cards=>[...cards].sort((a,b)=>worth(b)-worth(a)||a.id-b.id);
 const cardHint=(c,reason,action='play',target=null,verb='사용')=>hint(`${CARDS[c.type].name} ${verb} 추천`,reason,action,c.id,target);
 const sidHint=()=>hint('시드 능력으로 회복 추천','표시된 두 장을 버리면 생명 1을 회복해요. 생존을 우선하세요.','sid',null,null,least(p.hand).slice(0,2).map(c=>c.id));
 if(q&&q.player!==seat||!q&&s.current!==seat)return hint('상대의 차례예요','내 차례나 방어 차례가 오면 그때의 상황에 맞춰 추천해요.','wait');
 if(q){
  if(q.kind==='defend'||q.kind==='duel'){
   const cards=g.defenseCards(seat,q.required);
   if(cards.length>=q.need)return cardHint(least(cards)[0],q.need>1?`이번 공격은 ${q.need}장이 필요해요. 한 장씩 내면 생명 1을 지킬 수 있어요.`:'지금 대응하면 생명 1을 지킬 수 있어요.','respond',null,'방어');
   return hint('방어 카드는 아껴두세요',cards.length?`${q.need}장이 필요해서 지금 가진 카드로는 모두 막을 수 없어요. 생명 1을 잃고 카드를 남기세요.`:'막을 카드가 없어요. 생명 1 감소를 확인하세요.','take');
  }
  if(q.kind==='dying'){
   const beer=p.hand.find(c=>c.type==='beer');
   if(beer&&g.alive().length>2)return cardHint(beer,'맥주로 생명 1을 회복하세요. 생명이 1 이상이 될 때까지 회복해야 살아남아요.','saveBeer',null,'회복');
   if(p.char==='sid'&&p.hand.length>=2)return sidHint();
   return hint('회복할 수단이 없어요',g.alive().length<=2?'두 명만 남으면 맥주를 사용할 수 없어요. 이번에는 탈락을 확인하세요.':'현재 손패로는 회복할 수 없어요. 이번에는 탈락을 확인하세요.','giveup');
  }
  if(q.kind==='kit'||q.kind==='store'){
   const c=q.kind==='kit'?least(q.cards)[0]:best(q.cards)[0];
   if(!c)return null;
   return cardHint(c,q.kind==='kit'?'이 카드를 돌려놓고, 지금 활용도가 더 높은 나머지 두 장을 가져오세요.':'내 생명과 장비를 기준으로 활용도가 높은 카드예요.','choose',null,q.kind==='kit'?'돌려놓기':'가져오기');
  }
  if(q.kind==='drawChoice'){
   const top=s.discard?.at(-1);
   if(q.ability==='pedro'&&top&&worth(top)>=6)return cardHint(top,'버린 더미에 보이는 유용한 카드를 확실히 가져올 수 있어요.','drawDiscard',null,'가져오기');
   if(q.ability==='jesse'){
    const t=g.alive().filter(t=>t.id!==seat&&t.hand.length&&g.threat(seat,t.id)>0).sort((a,b)=>g.threat(seat,b.id)-g.threat(seat,a.id)||a.id-b.id)[0];
    if(t)return hint(`${name(t.id)}의 손패 가져오기`,`${t.role==='sheriff'?'보안관의':'정체가 미공개인 상대의'} 카드를 줄이고 내 패를 늘려요. 어떤 카드인지는 알 수 없어요.`,'drawSteal',null,t.id);
   }
   return hint('뽑기 더미에서 가져오세요','안전하게 새 카드를 받아 선택지를 늘리세요.','drawDeck');
  }
  if(q.kind==='steal'){
   const t=g.p(q.target),c=best(t.equipment.filter(c=>!['jail','dynamite'].includes(c.type)))[0];
   if(c)return cardHint(c,'공개된 장비를 골라 상대의 공격이나 방어 능력을 줄이세요.','stealEquip',null,q.steal?'가져오기':'제거');
   if(t.hand.length)return hint('무작위 손패 1장 추천','상대의 선택지를 줄여요. 감옥이나 다이너마이트를 없애 주는 것보다 유리해요.','stealHand');
   const forced=t.equipment[0];
   return forced?cardHint(forced,'남은 선택지예요. 상대에게 불리한 장비를 없애 주는 점은 주의하세요.','stealEquip',null,q.steal?'가져오기':'제거'):null;
  }
  return null;
 }
 if(s.phase==='discard'){
  const c=least(p.hand)[0];
  if(!c)return null;
  const why=c.type==='beer'&&g.alive().length<=2?'두 명만 남아 맥주는 쓸 수 없어요.':c.type==='dynamite'?'폭발하면 내가 생명 3을 잃을 수 있어요.':g.has(seat,c.type)?'이미 같은 장비를 갖고 있어요.':'지금 활용도가 낮은 카드예요. 회복·방어 카드를 우선 남기세요.';
  return cardHint(c,why,'discard',null,'버리기');
 }
 if(s.phase!=='play')return hint('차례를 준비하고 있어요','카드 받기가 끝나면 추천을 확인하세요.','wait');
 const candidates=[];
 const add=(score,result)=>{if(score>0)candidates.push({score,result});};
 const attacks=g.defenseCards(seat,'bang').length;
 const sheriff=g.alive().find(t=>t.role==='sheriff');
 for(const c of p.hand){
  if(g.canPlay(seat,c))continue;
  const type=g.bangType(seat,c)?'bang':c.type,def=CARDS[type];
  if(def.target||type==='bang'){
   const targets=g.targets(seat,c).filter(id=>g.threat(seat,id)>0).sort((a,b)=>g.threat(seat,b)-g.threat(seat,a)||g.p(a).hp-g.p(b).hp||a-b);
   const target=targets[0];if(target===undefined)continue;
   const t=g.p(target);
   if(type==='duel'&&t.hand.length>0&&(attacks===0||p.hp<=2&&attacks<t.hand.length))continue;
   const uncertain=t.role!=='sheriff';
   const why=type==='bang'?'사정거리 안이에요.':type==='duel'?'뱅!으로 번갈아 겨뤄요.':type==='jail'?'상대의 다음 턴을 막을 기회예요.':'상대의 카드나 장비를 줄일 수 있어요.';
   const caution=uncertain?(t.suspicion>=3?' 보안관을 겨냥한 행동으로 추측했어요.':' 정체는 미공개이므로 아군일 수도 있어요.'):(p.role==='renegade'?' 마지막 보안관을 쓰러뜨리면 승리해요.':' 보안관을 쓰러뜨리는 것이 내 목표예요.');
   const score=type==='bang'?58+(t.hp===1?15:0):type==='duel'?40+(t.hand.length===0?20:0):type==='panic'?59:type==='cat'?48:51;
   add(score,cardHint(c,`${name(target)} 추천 · ${why}${caution}`,'play',target));
  }else if(type==='beer')add(p.hp<=2?100:73,cardHint(c,'생명 1을 회복하고, 턴 끝에 남길 수 있는 카드도 한 장 늘려요.'));
  else if(type==='wells'||type==='stagecoach')add(type==='wells'?84:81,cardHint(c,`카드 ${type==='wells'?3:2}장을 더 받아 공격·방어 선택지를 늘리세요.`));
  else if(type==='barrel'||type==='mustang'||type==='scope')add(type==='scope'?54:69,cardHint(c,type==='barrel'?'총격을 받을 때마다 하트 판정으로 피할 기회가 생겨요.':type==='mustang'?'상대가 보는 거리가 늘어 총격을 받기 어려워져요.':'내가 보는 거리가 줄어 공격과 강탈에 유리해져요.'));
  else if(def.kind==='weapon'){
   if(type==='volcanic'){
    if(!g.has(seat,'volcanic')&&attacks>=2&&g.alive().some(t=>t.id!==seat&&g.distance(seat,t.id)<=1&&g.threat(seat,t.id)>0))add(76,cardHint(c,'거리 1 안에 대상이 있고 공격 카드가 여러 장이에요. 뱅!을 연속으로 쓸 수 있어요.'));
   }else if(def.range>g.range(seat)&&!(g.has(seat,'volcanic')&&attacks>=2))add(64,cardHint(c,`사정거리를 ${def.range}로 늘려 더 먼 상대에게 뱅!을 쓸 수 있어요.`));
  }else if(type==='saloon'){
   const allySheriff=p.role==='deputy'||p.role==='renegade'&&g.alive().length>2;
   const ownGain=p.hp<p.maxHp,saveSheriff=allySheriff&&sheriff?.hp<sheriff?.maxHp;
   if(ownGain||saveSheriff)add(ownGain&&p.hp<=2||saveSheriff&&sheriff.hp<=2?88:43,cardHint(c,`${ownGain?'내 생명을':'지켜야 할 보안관의 생명을'} 1 회복해요. 생명이 줄어든 상대도 함께 회복하므로 주의하세요.`));
  }else if(type==='gatling'||type==='indians'){
   if((p.role==='deputy'||p.role==='renegade'&&g.alive().length>2)&&sheriff?.hp<=2)continue;
   add(35,cardHint(c,`모든 상대를 압박해요. ${p.role==='deputy'||p.role==='sheriff'?'아군도 맞을 수 있으니 주의하세요.':'상대의 방어 카드는 알 수 없어요.'}`));
  }else if(type==='store')add(38,cardHint(c,'내가 먼저 공개 카드 한 장을 골라요. 다른 사람도 한 장씩 가져갑니다.'));
  // Dynamite is legal but not a reliable advantage: keep it or discard it.
 }
 if(p.char==='sid'&&p.hp<=2&&p.hand.length>=2)add(p.hp<=1?96:70,sidHint());
 candidates.sort((a,b)=>b.score-a.score);
 return candidates[0]?.result||hint('패를 아끼고 턴을 마치세요','지금 확실히 유리한 사용은 없어요. 방어·회복용 패를 남기세요.','end');
}
