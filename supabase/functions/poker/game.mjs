import {SevenPoker,rank,chooseDiscard,aiView,chooseAI} from '../../../games/poker/engine.mjs';
const hydrate=state=>Object.assign(Object.create(SevenPoker.prototype),structuredClone(state));
export function newGame(names,previous=null,random=Math.random,{mode='online',stacks=names.map(()=>5000)}={}){
 const solo=mode==='solo';
 if(stacks.some(n=>n<50))throw Error('gold_empty');
 if(solo){names=[names[0],'하루','두리','보리'];stacks=[stacks[0],...names.slice(1).map((_,i)=>previous?.players[i+1]?.stack>=50?Math.min(1e9,previous.players[i+1].stack):5000)];}
 return new SevenPoker({names,stacks,allHuman:!solo,dealer:previous?(previous.dealer+1)%names.length:0,random});
}
export function move(state,seat,command,random=Math.random,difficulty='normal',computer=false){
 const g=hydrate(state);
 if(!command||typeof command!=='object')throw Error('invalid_move');
 if(command.type==='leave'){
  if(g.phase==='finished')return g;
  const p=g.players[seat];p.folded=true;p.last='퇴장';g.pending=g.pending.filter(i=>i!==seat);g.raiseAllowed=g.raiseAllowed.filter(i=>i!==seat);
  if(g.active().length===1){g.finish();return g;}
  if(['discard','open'].includes(g.phase)&&g.turn===seat){
   const next=g.active().find(i=>!g.players[i].up.length);
   if(next===undefined)g.dealStreet();else{g.turn=next;g.phase='discard';}
  }else if(g.phase==='betting'){
   if(!g.pending.length){g.phase='between';g.turn=-1;}
   else if(g.turn===seat)for(let n=1;n<g.players.length;n++){const i=(seat+n)%g.players.length;if(g.pending.includes(i)){g.turn=i;break;}}
  }
  return g;
 }
 if(['between','runout'].includes(g.phase)){
  if(command.type!=='timeout')throw Error('not_your_turn');g.advance();return g;
 }
 if(g.turn!==seat||g.players[seat]?.folded||g.phase==='finished')throw Error('not_your_turn');
 if(command.type==='ai'){if(!computer&&(g.allHuman||seat===0))throw Error('invalid_move');command=chooseAI(aiView(g),random,difficulty);}
 let type=command.type,index=command.index;
 if(type==='timeout'){
  if(g.phase==='discard'){type='discard';index=chooseDiscard(g.players[seat].cards);}
  else if(g.phase==='open'){type='open';index=g.players[seat].cards.reduce((best,c,i,a)=>rank(c)>rank(a[best])?i:best,0);}
  else type=g.legal().check?'check':'fold';
 }
 try{
  if(type==='discard'&&g.phase==='discard')g.discard(index,seat);
  else if(type==='open'&&g.phase==='open')g.open(index,seat);
  else if(g.phase==='betting'&&['fold','check','call','raise','allin'].includes(type))g.act(type,command.to,command.preset);
  else throw Error();
 }catch{throw Error('invalid_move');}
 return g;
}
// Explicit allowlist: the deck, discarded cards and other hole cards never leave the server.
export function project(result){
 const r=result.room;if(!r)return null;const seat=result.seat,g=r.state?hydrate(r.state):null;
 let game=null;
 if(g){
  const showdown=g.phase==='finished'&&!g.result.uncontested;
  game={phase:g.phase,street:g.street,turn:g.turn,dealer:g.dealer,ante:g.ante,pot:g.pot,
   currentBet:g.currentBet,legal:g.turn===seat?g.legal():null,log:g.log,
   players:g.players.map((p,i)=>({name:p.name,stack:p.stack,initial:p.initial,total:p.total,bet:p.bet,
    folded:p.folded,allIn:p.allIn,last:p.last,up:[...p.up],
    cards:p.cards.map((c,k)=>i===seat||p.up.includes(c)||showdown&&!p.folded?c:`hidden:${i}:${k}`)})),
   result:g.result};
 }
 return {id:r.id,code:r.code,title:r.title,capacity:r.capacity,mode:r.mode||'online',seat,names:r.names,
  hostSeat:r.members.indexOf(r.host_id),status:r.status,version:r.version,round:r.round,
  deadline:r.deadline,serverTime:Date.now(),departed:r.departed,computerSeats:r.computer_seats||[],rankExcluded:r.rank_excluded||[],ready:r.ready,game};
}
