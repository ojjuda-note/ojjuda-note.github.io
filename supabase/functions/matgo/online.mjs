import {Game,aiChooseCard,aiChoose,aiGoStop} from './engine.mjs';

// A 256-bit server-only secret drives the deal. Neither the secret nor the
// opponent's hand / future deck is ever included in an API response.
async function secretRandom(secret) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw Error('invalid_seed');
  const raw=Uint8Array.from(secret.match(/../g),v=>parseInt(v,16));
  const key=await crypto.subtle.importKey('raw',raw,'AES-CTR',false,['encrypt']);
  const bytes=await crypto.subtle.encrypt({name:'AES-CTR',counter:new Uint8Array(16),length:64},key,new Uint8Array(8192));
  const view=new DataView(bytes);let offset=0;
  return ()=>{if(offset>=view.byteLength)throw Error('invalid_seed');const v=view.getUint32(offset);offset+=4;return v/4294967296;};
}
class InputNeeded extends Error { constructor(prompt){super('input_needed');this.prompt=prompt;} }
const copy=v=>JSON.parse(JSON.stringify(v));

export async function replayOnline(room) {
  const actions=room.actions||[];
  if(!Array.isArray(actions)||actions.length>256)throw Error('invalid_actions');
  let action,choice=0,prompt=null,result=null;
  const events=[];
  const game=new Game({
    event:async(type,data={})=>{
      const event={type,...copy(data)};events.push(event);
      if(type==='end'||type==='nagari')result=event;
    },
    choose:async(p,indices,card,source)=>{
      if(choice>=action.choices.length)throw new InputNeeded({type:'choose',p,indices,card:copy(card),source});
      const selected=action.choices[choice++];
      if(!indices.includes(selected))throw Error('invalid_choice');
      return selected;
    },
    goStop:async(p,points)=>{
      if(action.decision===null)throw new InputNeeded({type:'gostop',p,points});
      if(!['go','stop'].includes(action.decision))throw Error('invalid_decision');
      return action.decision;
    }
  });
  game.random=await secretRandom(room.seed);game.bank=[...room.start_gold];
  game.first=room.first;game.carry=room.carry;game.deal();
  for(let i=0;i<actions.length;i++){
    action=actions[i];choice=0;
    if(!action||game.over||![0,1].includes(action.p))throw Error('invalid_action');
    try{
      if(action.type==='chongtong'){
        if(!await game.declareChongtong(action.p,action.decision))throw Error('invalid_chongtong');
      }else if(action.type==='shake'){
        if(!game.shakeCards(action.p,action.month))throw Error('invalid_shake');
        events.push({type:'shake',p:action.p,cards:copy(game.hand[action.p].filter(c=>c.m===action.month))});
      }else if(action.type==='gukjin'){
        if(!game.toggleGukjin(action.p))throw Error('invalid_gukjin');
      }else if(action.type==='play'){
        if(!Array.isArray(action.choices)||action.choices.length>2)throw Error('invalid_choice');
        const card=action.card===null?null:game.hand[action.p].find(c=>c.id===action.card);
        if(action.card!==null&&!card)throw Error('invalid_card');
        let bomb=null;
        if(action.bomb!==null){
          if(!Array.isArray(action.bomb)||action.bomb.length!==2)throw Error('invalid_bomb');
          bomb=action.bomb.map(id=>game.hand[action.p].find(c=>c.id===id));
          if(bomb.some(c=>!c))throw Error('invalid_bomb');
        }
        const n=game.actions.length;
        if(await game.play(action.p,card,bomb)===false||game.actions.length!==n+1)throw Error('invalid_play');
        if(choice!==action.choices.length||game.actions.at(-1).decision!==action.decision)throw Error('invalid_decision');
      }else throw Error('invalid_action');
    }catch(error){
      if(!(error instanceof InputNeeded)||i!==actions.length-1)throw error;
      prompt=error.prompt;break;
    }
  }
  if(!prompt&&!game.over){
    const pending=game.pendingChongtong();
    prompt=pending?{type:'chongtong',...pending}:{type:'play',p:game.turn};
  }
  return {game,prompt,result,events};
}

export async function advanceOnline(room,p,command) {
  if(room.status!=='active'||!command||typeof command!=='object')throw Error('invalid_move');
  const before=await replayOnline(room),prompt=before.prompt;
  if(!prompt||prompt.p!==p)throw Error('not_your_turn');
  const actions=copy(room.actions),last=actions.at(-1);
  if(prompt.type==='choose'&&command.type==='choose'){
    if(!prompt.indices.includes(command.index))throw Error('invalid_choice');
    last.choices.push(command.index);
  }else if(prompt.type==='gostop'&&command.type==='gostop'){
    if(!['go','stop'].includes(command.decision))throw Error('invalid_decision');
    last.decision=command.decision;
  }else if(prompt.type==='chongtong'&&command.type==='chongtong'){
    if(!['win','continue'].includes(command.decision))throw Error('invalid_decision');
    actions.push({type:'chongtong',p,decision:command.decision});
  }else if(prompt.type==='play'&&command.type==='play'){
    if(command.card!==null&&(!Number.isInteger(command.card)||command.card<0||command.card>49))throw Error('invalid_card');
    const bomb=command.bomb??null;
    if(bomb!==null&&(!Array.isArray(bomb)||bomb.length!==2||bomb.some(id=>!Number.isInteger(id))))throw Error('invalid_bomb');
    actions.push({type:'play',p,card:command.card,bomb,choices:[],decision:null});
  }else if(prompt.type==='play'&&command.type==='shake'){
    actions.push({type:'shake',p,month:command.month});
  }else if(prompt.type==='play'&&command.type==='gukjin'){
    actions.push({type:'gukjin',p});
  }else throw Error('invalid_move');
  const next=await replayOnline({...room,actions});
  if(next.result&&(!next.game.over||next.result.goldDelta.some(n=>!Number.isSafeInteger(n))))throw Error('invalid_result');
  const completed=s=>s.game.normalPlays.reduce((a,b)=>a+b,0)-(['choose','gostop'].includes(s.prompt?.type)?1:0);
  return {actions,result:next.result,first:next.game.first,carry:next.game.carry,
    reset_clock:next.prompt?.p!==before.prompt?.p||completed(next)>completed(before)};
}

// Finish one timed-out / departed player's turn, including bonus exchanges,
// floor selections and go/stop. No client supplies an AI move or result.
export async function automaticOnline(room) {
  const initial=await replayOnline(room),p=initial.prompt?.p;
  if(p===undefined)return null;
  const completed=s=>s.game.normalPlays.reduce((a,b)=>a+b,0)-(['choose','gostop'].includes(s.prompt?.type)?1:0);
  const starting=completed(initial);let next;
  for(let i=0;i<48;i++){
    const state=await replayOnline(room),{game:g,prompt:pr}=state;
    if(!pr||pr.p!==p||completed(state)>starting)break;
    let command;
    if(pr.type==='choose')command={type:'choose',index:aiChoose(g,p,pr.indices)};
    else if(pr.type==='gostop')command={type:'gostop',decision:aiGoStop(g,p,pr.points)};
    else if(pr.type==='chongtong')command={type:'chongtong',decision:'win'};
    else{
      const card=aiChooseCard(g,p),same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
      const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2).map(c=>c.id):null;
      command=same.length>=3&&!bomb&&!g.shake[p]?{type:'shake',month:card.m}:{type:'play',card:card?.id??null,bomb};
    }
    next=await advanceOnline(room,p,command);room={...room,actions:next.actions};
  }
  if(!next)throw Error('invalid_move');
  return {...next,reset_clock:true};
}

export async function onlineView(room,seat,cursor=0) {
  const base={id:room.id,code:room.code,status:room.status,version:room.version,seat,
    names:room.names,round:room.round_no,deadline:room.deadline,reason:room.reason||null,
    ready:room.ready||[false,false],gold:room.gold,bots:room.bots||[false,false],departed:room.departed||[false,false],
    autoCount:room.auto_count||0,lastAuto:room.last_auto,serverTime:Date.now()};
  if(room.status==='waiting'||room.status==='cancelled')return base;
  const {game:g,prompt,result,events}=await replayOnline(room);
  base.game={hand:copy(g.hand[seat]),otherCount:g.hand[1-seat].length,
    floor:g.floor.map(st=>({cards:copy(st),ppuk:!!st.ppuk,owner:st.ppukOwner??null})),
    caps:copy(g.caps),deckCount:g.deck.length,turn:g.turn,go:g.go,bomb:g.bomb,
    shake:g.shake,mult:g.mult,ppukCount:g.ppukCount,firstPpukGold:g.firstPpukGold,
    bank:room.status==='finished'?room.gold:room.start_gold,over:g.over,
    prompt:prompt?(prompt.p===seat?prompt:{type:'waiting',p:prompt.p}):null};
  base.eventCount=events.length;
  base.events=events.slice(Math.max(0,Math.min(events.length,cursor))).map((event,i)=>{
    const out={...event,id:Math.max(0,Math.min(events.length,cursor))+i};
    if(event.type==='draw'&&event.p!==seat)delete out.card;
    return out;
  });
  base.result=room.status==='finished'?{...result,...room.result}:null;
  return base;
}
