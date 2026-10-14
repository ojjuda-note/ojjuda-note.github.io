// Keep the triple produced by the real deal; arrange the other cards for a capture.
export function setupOpening(g,E,{p=0,route='hand',opponent=[6,7],sweep=false,enabled=true}={}){
  g.openingPpuk=enabled;g.random=E.seededRandom(5);g.deal();
  const stack=g.floor.find(st=>st.length===3);
  if(!stack||stack[0].m!==4)throw Error('opening fixture changed');
  const pool=new Map(E.CARDS.filter(c=>!stack.some(s=>s.id===c.id)).map(c=>[c.id,{...c,asPi:false}]));
  const take=id=>{const c=pool.get(id);if(!c)throw Error('duplicate fixture card '+id);pool.delete(id);return c;};
  g.floor=[stack,[take(sweep?(route==='hand'?4:5):8)]];
  g.hand=[[],[]];g.hand[p]=[route==='hand'?14:4,16].map(take);g.hand[1-p]=[take(44)];
  g.caps=[[],[]];g.caps[1-p]=opponent.map(take);
  g.deck=[take(route==='flip'?14:sweep?5:20),...pool.values()];
  g.turn=p;g.endTurn=async()=>{};
  return {stack,card:g.hand[p][0]};
}

export async function playRound(E,dealSoloRound,round){
  let g;const events=[];
  g=new E.Game({event:async(type,data)=>events.push(JSON.parse(JSON.stringify({type,...data}))),
    choose:async(p,ids)=>E.aiChoose(g,p,ids),chooseGukjin:async p=>E.aiChooseGukjin(g,p),goStop:async(p,s)=>E.aiGoStop(g,p,s)});
  Object.assign(g,{bank:[round.gold,5000],rate:round.rate??100,first:round.first,carry:round.carry,roundCpuLevel:round.cpu_level});
  dealSoloRound(g,round,E);
  for(let move=0;!g.over&&move<160;move++){
    const pending=g.pendingChongtong();if(pending){await g.declareChongtong(pending.p,'win');continue;}
    const p=g.turn,rng=g.random;if(p===0)g.random=()=>.25;
    const card=E.aiChooseCard(g,p);g.random=rng;
    const same=card?g.hand[p].filter(c=>c.m===card.m):[],matches=card?g.matches(card.m):[];
    const bomb=same.length>=3&&matches.length===1&&matches[0][0].length===1?same.filter(c=>c!==card).slice(0,2):null;
    if(same.length>=3&&!bomb&&!g.shake[p])g.shakeCards(p,card.m);
    if(await g.play(p,card,bomb)===false)throw Error('invalid fixture move');
  }
  if(!g.over)throw Error('unfinished fixture');return {g,events};
}
