export const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
export const red = card => card.suit === 'hearts' || card.suit === 'diamonds';
export const copy = value => JSON.parse(JSON.stringify(value));

export function createGame(drawCount = 1, random = Math.random) {
  const deck = SUITS.flatMap(suit => Array.from({length:13}, (_,i) => ({id:`${suit}-${i+1}`, suit, rank:i+1, up:false})));
  for (let i=51; i>0; i--) { const j = Math.floor(random() * (i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  const tableau = Array.from({length:7}, (_,col) => Array.from({length:col+1}, (_,row) => ({...deck.pop(),up:row===col})));
  return {stock:deck,waste:[],wastePackets:[],tableau,foundations:[[],[],[],[]],drawCount:drawCount===3?3:1,moves:0,score:0};
}
// Each draw is its own fan. Using a card must not pull an older card into it.
function ensureWastePackets(state){
  if(state.wastePackets)return state.wastePackets;
  // Older saves did not record packet boundaries. Keep all their cards and
  // reconstruct the available boundary information once, without restarting.
  state.wastePackets=[];
  for(let left=state.waste.length;left>0;left-=state.drawCount)state.wastePackets.push(Math.min(left,state.drawCount));
  return state.wastePackets;
}
export function visibleWasteCount(state){
  if(!state.waste.length)return 0;
  return state.wastePackets?.at(-1)??((state.waste.length-1)%state.drawCount+1);
}
export function restoreWastePackets(states){
  let previous;
  for(const state of states){
    if(!state.wastePackets && previous && state.moves===previous.moves+1 && state.drawCount===previous.drawCount){
      const delta=state.waste.length-previous.waste.length;
      const prefix=state.waste.slice(0,Math.min(state.waste.length,previous.waste.length)).every((c,i)=>c.id===previous.waste[i].id);
      if(prefix && delta===0)state.wastePackets=[...previous.wastePackets];
      else if(prefix && delta>0 && delta<=state.drawCount && previous.stock.length-state.stock.length===delta)state.wastePackets=[...previous.wastePackets,delta];
      else if(prefix && delta===-1 && previous.stock.length===state.stock.length){
        state.wastePackets=[...previous.wastePackets];
        if(--state.wastePackets[state.wastePackets.length-1]===0)state.wastePackets.pop();
      }
    }
    ensureWastePackets(state);previous=state;
  }
}
export function getPile(state, source) {
  if (!source) return null;
  if (source.type === 'waste') return state.waste;
  if (source.type === 'tableau') return state.tableau[source.col];
  if (source.type === 'foundation') return state.foundations[source.col];
  return null;
}
export function validSequence(cards) {
  return cards.length>0 && cards.every((c,i)=> c.up && (!i || (cards[i-1].rank===c.rank+1 && red(cards[i-1])!==red(c))));
}
export function canMove(state, source, target) {
  if (!source || !target || (source.type===target.type && source.col===target.col)) return false;
  const pile = getPile(state,source), dest=getPile(state,target);
  if (!pile || !dest || !Number.isInteger(source.index) || source.index<0 || source.index>=pile.length) return false;
  const cards = pile.slice(source.index), card=cards[0];
  if (!validSequence(cards)) return false;
  if (source.type!=='tableau' && cards.length!==1) return false;
  if (target.type==='foundation') return cards.length===1 && card.suit===SUITS[target.col] && card.rank===dest.length+1;
  if (target.type==='tableau') {
    const top=dest.at(-1);
    return top ? top.up && red(top)!==red(card) && top.rank===card.rank+1 : card.rank===13;
  }
  return false;
}
export function move(state,source,target) {
  if (!canMove(state,source,target)) return false;
  const pile=getPile(state,source), dest=getPile(state,target);
  if(source.type==='waste'){
    const packets=ensureWastePackets(state);
    if(--packets[packets.length-1]===0)packets.pop();
  }
  dest.push(...pile.splice(source.index));
  if (target.type==='foundation') state.score+=10;
  if (source.type==='foundation') state.score-=10;
  if (source.type==='tableau' && pile.length && !pile.at(-1).up) {pile.at(-1).up=true;state.score+=5;}
  state.moves++;
  return true;
}
export function draw(state) {
  if (!state.stock.length && !state.waste.length) return false;
  const packets=ensureWastePackets(state);
  if (!state.stock.length){state.stock=state.waste.splice(0).reverse().map(c=>({...c,up:false}));state.wastePackets=[];}
  else {
    const count=Math.min(state.drawCount,state.stock.length);
    for(let i=0;i<count;i++)state.waste.push({...state.stock.pop(),up:true});
    packets.push(count);
  }
  state.moves++;
  return true;
}
export const isWon = state => state.foundations.every(p=>p.length===13);
export const canFinish = state => !isWon(state) && !state.stock.length && !state.waste.length && state.tableau.every(p=>p.every(c=>c.up));
export function legalMoves(state, includeBack = true) {
  const sources=[];
  if(state.waste.length) sources.push({type:'waste',col:0,index:state.waste.length-1});
  state.tableau.forEach((p,col)=>p.forEach((c,index)=>{if(c.up) sources.push({type:'tableau',col,index});}));
  if(includeBack) state.foundations.forEach((p,col)=>{if(p.length) sources.push({type:'foundation',col,index:p.length-1});});
  const targets=[...SUITS.map((_,col)=>({type:'foundation',col})),...state.tableau.map((_,col)=>({type:'tableau',col}))];
  return sources.flatMap(source=>targets.filter(target=>canMove(state,source,target)).map(target=>({source,target})));
}
export function suggest(state) {
  const moves=legalMoves(state,false);
  return moves.find(m=>m.source.type==='tableau' && m.source.index>0 && !getPile(state,m.source)[m.source.index-1].up)
    || moves.find(m=>m.target.type==='foundation')
    || moves.find(m=>m.source.type==='waste')
    || moves.find(m=>m.source.index>0 && m.target.type==='tableau')
    || (state.stock.length || state.waste.length ? {draw:true} : null);
}
export function validateState(state) {
  if(!state || ![1,3].includes(state.drawCount) || !Number.isSafeInteger(state.moves) || state.moves<0 || !Number.isSafeInteger(state.score)) return false;
  if(!Array.isArray(state.stock)||!Array.isArray(state.waste)||!Array.isArray(state.tableau)||state.tableau.length!==7||!Array.isArray(state.foundations)||state.foundations.length!==4) return false;
  const piles=[state.stock,state.waste,...state.tableau,...state.foundations];
  if(!piles.every(Array.isArray)) return false;
  if(state.wastePackets!==undefined && (!Array.isArray(state.wastePackets)||!state.wastePackets.every(n=>Number.isInteger(n)&&n>0&&n<=state.drawCount)||state.wastePackets.reduce((sum,n)=>sum+n,0)!==state.waste.length))return false;
  const cards=piles.flat();
  if(cards.length!==52 || new Set(cards.map(c=>c?.id)).size!==52) return false;
  if(!cards.every(c=>c && SUITS.includes(c.suit) && Number.isInteger(c.rank) && c.rank>=1 && c.rank<=13 && c.id===`${c.suit}-${c.rank}` && typeof c.up==='boolean')) return false;
  if(!state.stock.every(c=>!c.up) || !state.waste.every(c=>c.up)) return false;
  if(!state.foundations.every((p,i)=>p.every((c,j)=>c.up && c.suit===SUITS[i] && c.rank===j+1))) return false;
  return state.tableau.every(p=>{const i=p.findIndex(c=>c.up);return p.length===0 || (i>=0 && validSequence(p.slice(i)));});
}
