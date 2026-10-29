import {Game} from './engine.js';
import {CHARACTERS} from './data.js';

export function soloOptions(options){
 if(!options||!Number.isInteger(options.count)||options.count<4||options.count>7||!['sheriff','random'].includes(options.role)||!['random',...CHARACTERS.map(c=>c.id)].includes(options.character))throw Error('invalid_options');
 return {count:options.count,role:options.role,character:options.character};
}
export function createSolo(name,runId,options,random=Math.random){
 const game=onlineGame(null,random);
 game.create(soloOptions(options));
 game.p(0).name=String(name).slice(0,12);
 game.s.runId=runId;game.s.online=true;game.s.forfeited=[];
 game.s.logs=[];game.log('컴퓨터 대전 · 승패가 연승 순위에 반영됩니다.','system');
 return advanceSolo(game.s,random);
}
export function soloNeedsMove(state){return !!state&&!state.winner&&(state.pending?.player??state.current)!==0;}
export function advanceSolo(state,random=Math.random){
 const game=onlineGame(structuredClone(state),random);
 // Bound work per request, and stop at every human decision (including defense).
 for(let n=0;n<48&&soloNeedsMove(game.s);n++)if(!game.aiAction())throw Error('invalid_action');
 return game.s;
}

export function onlineGame(state, random=Math.random){
 const game=new Game(state,random);
 game.label=id=>game.p(id)?.name||'플레이어';
 return game;
}
export function createOnline(names,runId,random=Math.random){
 if(!Array.isArray(names)||names.length<4||names.length>7)throw Error('need_players');
 const game=onlineGame(null,random);
 game.create({count:names.length,role:'random'});
 game.s.players.forEach((p,i)=>{p.name=String(names[i]).slice(0,12);});
 game.s.logs=[];game.log('회원 대전을 시작합니다. 보안관부터 시작합니다.','system');
 game.s.runId=runId;game.s.online=true;game.s.forfeited=[];
 return game.s;
}
export function moveOnline(state,seat,move,random=Math.random){
 if(!Number.isInteger(seat)||!state?.players?.[seat]||!move||typeof move!=='object')throw Error('invalid_action');
 if(state.winner)throw Error('game_finished');
 const game=onlineGame(structuredClone(state),random),s=game.s;
 let ok=false;
 if(move.type==='surrender'){
  if(!game.p(seat).alive)throw Error('already_eliminated');
  const pending=s.pending;
  s.forfeited=[...new Set([...(s.forfeited||[]),seat])];
  game.log(`${game.label(seat)} · 기권했습니다.`,'system');
  game.eliminate(seat,null);
  if(!s.winner&&pending?.player!==seat&&pending?.target!==seat&&!(pending?.kind==='duel'&&pending.source===seat))s.pending=pending;
  game.pump();return s;
 }
 if(move.type==='heal'){
  if(!Array.isArray(move.cards)||move.cards.some(x=>!Number.isInteger(x)))throw Error('invalid_action');
  ok=game.healSid(seat,move.cards);
 }else if(s.pending){
  if(s.pending.player!==seat)throw Error('not_your_turn');
  if(move.type!=='choose'||!['card','take','choose','beer','giveup','deck','discard','steal','hand','equipment'].includes(move.action))throw Error('invalid_action');
  if(move.value!==undefined&&move.value!==null&&!Number.isInteger(move.value))throw Error('invalid_action');
  ok=game.choose(move.action,move.value??null);
 }else{
  if(s.current!==seat)throw Error('not_your_turn');
  if(move.type==='play'&&Number.isInteger(move.card)&&(move.target===null||move.target===undefined||Number.isInteger(move.target)))ok=game.play(seat,move.card,move.target??null);
  else if(move.type==='end')ok=game.endTurn(seat);
  else if(move.type==='discard'&&Number.isInteger(move.card))ok=game.discardCard(seat,move.card);
 }
 if(!ok)throw Error('invalid_action');
 return s;
}
export function automaticOnline(state,random=Math.random){
 const game=onlineGame(structuredClone(state),random);
 const actor=game.s.pending?.player??game.s.current;
 game.log(`${game.label(actor)} · 제한 시간이 지나 자동으로 진행합니다.`,'system');
 if(!game.aiAction(true))throw Error('invalid_action');
 return game.s;
}
export function outcomes(state){
 if(!state.winner)return null;
 return state.players.map(p=>!(state.forfeited||[]).includes(p.id)&&(state.winner==='sheriff'?['sheriff','deputy'].includes(p.role):p.role===state.winner));
}
export function visibleState(state,seat){
 if(!state)return null;
 if(!Number.isInteger(seat)||!state.players[seat])throw Error('not_member');
 const view=structuredClone(state);
 // A player's role and cards never cross the network to other seats.
 for(const player of view.players){
  if(player.id!==seat){
   player.hand=Array.from({length:player.hand.length},()=>({hidden:true}));
   if(player.alive&&player.role!=='sheriff'&&!view.winner)player.role='unknown';
  }
 }
 view.deck=Array.from({length:view.deck.length},()=>({hidden:true}));
 view.queue=[];view.store=null;
 if(view.pending?.player!==seat&&view.pending?.kind==='kit')view.pending.cards=[];
 return view;
}
