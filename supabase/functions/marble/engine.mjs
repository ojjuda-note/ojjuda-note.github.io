// Authoritative online rules. No browser, wallet, or caller-supplied randomness.
const C=(n,g,p)=>({n,t:'city',g,p}),S=(n,p)=>({n,t:'special',p}),K=()=>({n:'찬스',t:'chance'});
export const tiles=[
 {n:'출발',t:'start'},C('방콕',0,50),K(),C('베이징',0,60),S('제주도',120),C('타이베이',1,80),C('두바이',1,80),C('카이로',1,100),
 {n:'무인도',t:'island'},S('발리',150),C('도쿄',2,120),C('시드니',2,140),K(),C('퀘벡',3,160),C('상파울루',3,160),S('하와이',180),
 {n:'페스티벌',t:'fest'},C('프라하',4,180),S('푸켓',200),C('베를린',4,180),K(),C('모스크바',4,200),C('제네바',5,220),C('로마',5,240),
 {n:'세계여행',t:'travel'},S('타히티',220),C('런던',6,260),C('파리',6,280),K(),C('뉴욕',7,320),{n:'국세청',t:'tax'},C('서울',7,350)
];
const colors=['#ff5fae','#3bb6ff','#ffd23f','#2ee6b0','#9b6bff','#ff3b5c','#ff8f2b','#3b4a9c'];
const BM=[.5,.9,1.3,1.5],TM=[.25,.85,2.05,4.05,7.05],SM=[0,1,1.6,2.4,3.2,4.5],BN=['땅','별장','빌딩','호텔','랜드마크'];
const property=i=>['city','special'].includes(tiles[i]?.t),specials=tiles.flatMap((t,i)=>t.t==='special'?[i]:[]);
const groups=Object.groupBy(tiles.flatMap((t,i)=>t.t==='city'?[i]:[]),i=>tiles[i].g);
const sides=[0,1,2,3].map(s=>Array.from({length:7},(_,k)=>s*8+k+1).filter(property));
const copy=x=>JSON.parse(JSON.stringify(x)),r10=n=>Math.round(n/10)*10,lv=(g,i)=>g.level[i]||0;
const owned=(g,p)=>Object.keys(g.owner).map(Number).filter(i=>g.owner[i]===p);
const cost=(i,l)=>r10(tiles[i].p*BM[l-1]);
const range=(i,a,b)=>Array.from({length:Math.max(0,b-a)},(_,k)=>cost(i,a+k+1)).reduce((a,b)=>a+b,0);
export const value=(g,i)=>tiles[i].p+(tiles[i].t==='city'?range(i,0,lv(g,i)):0);
export const assets=(g,p)=>g.players[p].bankrupt?0:g.players[p].money+owned(g,p).reduce((s,i)=>s+value(g,i),0);
export function toll(g,i){
 const t=tiles[i],o=g.owner[i];let b;
 if(t.t==='special')b=t.p*.35*SM[specials.filter(j=>g.owner[j]===o).length];
 else{b=t.p*TM[lv(g,i)];if(groups[t.g].every(j=>g.owner[j]===o))b*=2;}
 return r10(b*2**(g.fest[i]||0));
}
export function monopoly(g,p){
 if(sides.some(s=>s.every(i=>g.owner[i]===p)))return '라인독점';
 if(Object.values(groups).filter(s=>s.every(i=>g.owner[i]===p)).length>=3)return '트리플독점';
 if(specials.every(i=>g.owner[i]===p))return '관광지독점';
 return null;
}
function log(g,text){g.log.unshift(text);g.log.length=Math.min(60,g.log.length);}
function event(g,kind,detail={}){g.events.push({kind,...detail});}
function release(g,i){delete g.owner[i];delete g.level[i];delete g.fest[i];}
const alive=g=>g.players.flatMap((p,i)=>p.bankrupt?[]:[i]);
export function ranking(g){return g.players.map((p,i)=>({seat:i,name:p.name,bankrupt:p.bankrupt,assets:assets(g,i)})).sort((a,b)=>Number(a.bankrupt)-Number(b.bankrupt)||b.assets-a.assets||a.seat-b.seat);}
function end(g,winner,reason){g.over=true;g.winner=winner;g.reason=reason;g.phase=null;event(g,'end',{winner,reason});log(g,`${g.players[winner]?.name||''} 우승 · ${reason}`);}
function check(g){
 if(g.over)return true;
 const left=alive(g);
 if(left.length<=1){end(g,left[0]??null,'마지막 생존');return true;}
 for(const i of left){const win=monopoly(g,i);if(win){end(g,i,win);return true;}}
 return false;
}
function eliminate(g,p,reason){
 const q=g.players[p];q.money=0;q.bankrupt=true;q.island=0;q.travel=false;q.escape=0;q.angel=0;q.half=0;
 owned(g,p).forEach(i=>release(g,i));log(g,`${q.name} 탈락: ${reason} · 관전 중`);event(g,'eliminated',{p});
}
export function settle(g,p,to=null){
 const q=g.players[p];
 while(q.money<0){
  const mine=owned(g,p),built=mine.filter(i=>lv(g,i)>0).sort((a,b)=>lv(g,a)-lv(g,b)||tiles[a].p-tiles[b].p);
  if(built.length){const i=built[0],n=r10(cost(i,lv(g,i))/2);g.level[i]--;q.money+=n;log(g,`${q.name} ${tiles[i].n} 건물 급매 +${n}만`);}
  else if(mine.length){const i=mine.sort((a,b)=>tiles[a].p-tiles[b].p)[0],n=r10(tiles[i].p/2);release(g,i);q.money+=n;log(g,`${q.name} ${tiles[i].n} 땅 급매 +${n}만`);}
  else break;
 }
 if(q.money<0||(q.money===0&&!owned(g,p).length)){
  if(to!==null)g.players[to].money-=Math.max(0,-q.money);
  eliminate(g,p,'판매할 도시·건물이 없고 잔액이 0원 이하예요');
 }
}
function pay(g,p,amount,to=null){
 if(amount<=0||g.players[p].bankrupt)return;
 g.players[p].money-=amount;if(to!==null)g.players[to].money+=amount;
 log(g,`${g.players[p].name} ${to===null?'지출':g.players[to].name+'에게 통행료'} ${amount}만`);
 event(g,'pay',{p,to,amount});settle(g,p,to);
}
function move(g,p,steps){
 const q=g.players[p],from=q.pos;
 for(let k=0;k<Math.abs(steps);k++){
  q.pos=(q.pos+Math.sign(steps)+32)%32;
  if(steps>0&&q.pos===0){q.money+=300;q.laps++;log(g,`${q.name} 한 바퀴! 월급 +300만`);}
 }
 event(g,'move',{p,from,to:q.pos,steps});
}
function island(g,p){const q=g.players[p],from=q.pos;q.pos=8;q.island=3;g.extra=false;event(g,'move',{p,from,to:8,steps:0});log(g,`${q.name} 무인도로!`);}
function beginTurn(g){
 if(check(g))return;
 const q=g.players[g.turn];settle(g,g.turn);if(check(g))return;if(q.bankrupt){nextTurn(g);return;}
 g.doubles=0;g.extra=false;
 if(q.travel){q.travel=false;g.phase={kind:'travel'};return;}
 if(q.island>0&&q.escape>0){q.escape--;q.island=0;log(g,`${q.name} 탈출권 사용`);}
 g.phase={kind:q.island>0?'island':'roll'};
}
function nextTurn(g){
 if(check(g))return;
 const prev=g.turn;do{g.turn=(g.turn+1)%g.players.length;}while(g.players[g.turn].bankrupt);
 if(g.turn<=prev){g.round++;if(g.maxRound&&g.round>g.maxRound){g.round=g.maxRound;end(g,ranking(g)[0].seat,'라운드 종료');return;}log(g,`── 라운드 ${g.round} ──`);}
 beginTurn(g);
}
function finish(g){
 if(check(g))return;
 const q=g.players[g.turn];
 if(!q.bankrupt&&g.extra&&!q.island&&!q.travel)g.phase={kind:'roll'};else nextTurn(g);
}
function buildChoices(g,i){
 const q=g.players[g.turn],from=lv(g,i),max=from===3?4:q.laps>=1?3:2;
 return Array.from({length:Math.max(0,max-from)},(_,k)=>from+k+1).filter(n=>range(i,from,n)<=q.money);
}
function buildOffer(g,i){
 if(!g.over&&tiles[i].t==='city'&&lv(g,i)<4&&buildChoices(g,i).length)g.phase={kind:'build',tile:i};else finish(g);
}
function build(g,i,to,free=false){
 const p=g.turn,q=g.players[p],n=free?0:range(i,lv(g,i),to);q.money-=n;g.level[i]=to;
 log(g,`${q.name} ${tiles[i].n} ${BN[to]} ${free?'무료 건설':'건설 −'+n+'만'}`);event(g,'build',{p,tile:i,level:to});
}
function targets(g,kind){
 const p=g.turn;
 if(kind==='travel')return tiles.flatMap((t,i)=>i!==24?[i]:[]);
 if(kind==='fest')return owned(g,p).filter(i=>(g.fest[i]||0)<3);
 if(kind==='bonus')return owned(g,p).filter(i=>tiles[i].t==='city'&&lv(g,i)<(g.players[p].laps>=1?4:2));
 if(kind==='swapOwn')return owned(g,p).filter(i=>lv(g,i)<4);
 if(kind==='swapOther')return Object.keys(g.owner).map(Number).filter(i=>g.owner[i]!==p&&lv(g,i)<4);
 if(kind==='quake')return Object.keys(g.owner).map(Number).filter(i=>g.owner[i]!==p&&lv(g,i)>0&&lv(g,i)<4);
 return [];
}
function pick(g,kind){
 if(!targets(g,kind).length||(kind==='swapOwn'&&!targets(g,'swapOther').length)){finish(g);return;}
 g.phase={kind};
}
function land(g,random,depth=0){
 if(depth>8)throw Error('invalid_move');
 const p=g.turn,q=g.players[p],i=q.pos,t=tiles[i],o=g.owner[i];
 if(check(g))return;
 if(property(i)){
  if(o===undefined){if(q.money>=t.p)g.phase={kind:'buy',tile:i};else finish(g);}
  else if(o===p)buildOffer(g,i);
  else{
   let amount=toll(g,i);
   if(q.angel){q.angel--;amount=0;log(g,`${q.name} 천사카드로 통행료 면제`);}
   else if(q.half){q.half--;amount=r10(amount/2);log(g,`${q.name} 반값 쿠폰 사용`);}
   pay(g,p,amount,o);
   if(!check(g)&&!q.bankrupt&&lv(g,i)<4&&q.money>=value(g,i)*2)g.phase={kind:'takeover',tile:i};else finish(g);
  }
 }else if(t.t==='island'){q.island=3;log(g,`${q.name} 무인도에서 3턴 대기`);finish(g);}
 else if(t.t==='travel'){q.travel=true;log(g,`${q.name} 다음 차례 세계여행`);finish(g);}
 else if(t.t==='fest')pick(g,'fest');
 else if(t.t==='start')pick(g,'bonus');
 else if(t.t==='tax'){pay(g,p,Math.max(10,r10(assets(g,p)*.1)));finish(g);}
 else if(t.t==='chance')card(g,random,depth+1);
}
const cardNames=['천사카드','반값 쿠폰','무인도 탈출권','세계여행 초대권','페스티벌 개최권','도시 체인지','지진','태풍','출발지로','세무조사','무인도 예능','음원 차트 1위','스캔들 기사','기부 천사'];
function card(g,random,depth){
 const p=g.turn,q=g.players[p],n=random(14);log(g,`${q.name} 찬스: ${cardNames[n]}`);event(g,'card',{p,index:n,name:cardNames[n]});
 if(n<4){q[['angel','half','escape','travel'][n]]=n===3?true:q[['angel','half','escape'][n]]+1;finish(g);}
 else if(n<7)pick(g,['fest','swapOwn','quake'][n-4]);
 else if(n===7){move(g,p,-3);land(g,random,depth);}
 else if(n===8||n===9){move(g,p,((n===8?0:30)-q.pos+32)%32);land(g,random,depth);}
 else if(n===10){island(g,p);finish(g);}
 else if(n===11){q.money+=200;log(g,`${q.name} 정산금 +200만`);finish(g);}
 else if(n===12){pay(g,p,100);finish(g);}
 else{const other=alive(g).filter(i=>i!==p).sort((a,b)=>g.players[a].money-g.players[b].money)[0];if(other!==undefined)pay(g,p,100,other);finish(g);}
}
export function secureRandom(max){
 const a=new Uint32Array(1),limit=Math.floor(0x100000000/max)*max;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%max;
}
export function newGame(names,{runId,maxRound=25}={}){
 if(!Array.isArray(names)||names.length<2||names.length>8||![0,15,25].includes(maxRound))throw Error('invalid_options');
 const g={runId,players:names.map((name,i)=>({name,m:i,color:colors[i],human:true,money:2000,pos:0,laps:0,island:0,escape:0,angel:0,half:0,travel:false,par:0,bankrupt:false})),owner:{},level:{},fest:{},warned:[],turn:0,round:1,maxRound,fast:false,over:false,log:[],events:[],doubles:0,extra:false,phase:null};
 log(g,'🎉 오쭈다 마블 온라인 시작! 모두 2,000만을 받았어요.');beginTurn(g);return g;
}
export function prompt(g){
 if(g.over)return null;
 const ph=g.phase,p=g.turn,q=g.players[p],kind=ph.kind,i=ph.tile,t=tiles[i];
 const result={kind,p,choices:[],title:'',text:'',tiles:[]};
 const choice=(value,label)=>({value,label});
 if(kind==='roll'){result.title=g.doubles?'더블! 한 번 더 굴려요':'주사위를 굴려요';return result;}
 if(kind==='island'){result.title='🏝️ 무인도';result.text=`${q.island}턴 남았어요.`;result.choices=[choice('roll','더블 도전'),...(q.money>=50?[choice('pay','50만 내고 탈출')]:[])];}
 else if(kind==='buy'){result.title=`${t.n} 구입`;result.text=`땅값 ${t.p}만 · 보유 ${q.money}만`;result.choices=[choice('yes','살래요!'),choice('skip','넘어가기')];}
 else if(kind==='takeover'){result.title=`${t.n} 인수`;result.text=`인수 가격 ${value(g,i)*2}만 · 보유 ${q.money}만`;result.choices=[choice('yes','인수할래요!'),choice('skip','넘어가기')];}
 else if(kind==='build'){result.title=`${t.n} 건설`;result.text=`보유 ${q.money}만${q.laps<1?' · 호텔은 한 바퀴 돈 뒤부터':''}`;result.choices=[...buildChoices(g,i).map(n=>choice(n,`${BN[n]}까지 · ${range(i,lv(g,i),n)}만`)),choice('skip','안 지을래요')];}
 else{
  const labels={travel:['✈️ 세계여행','20만 내고 갈 곳을 골라요.'],fest:['🎆 페스티벌','통행료를 2배로 올릴 내 땅을 골라요.'],bonus:['🏁 출발지 보너스','건물 하나를 무료로 올릴 내 도시를 골라요.'],swapOwn:['🔄 도시 체인지','내줄 내 도시를 골라요.'],swapOther:['🔄 도시 체인지','가져올 상대 도시를 골라요.'],quake:['🌋 지진','건물 하나를 무너뜨릴 상대 도시를 골라요.']};
  [result.title,result.text]=labels[kind];result.tiles=targets(g,kind);result.choices=result.tiles.map(i=>choice(i,tiles[i].n));
  if(!['swapOther','quake'].includes(kind))result.choices.push(choice('skip',kind==='travel'?'주사위 굴리기':'건너뛰기'));
 }
 return result;
}
export function advance(state,seat,command,random=secureRandom){
 if(state.over)throw Error('room_unavailable');
 if(!Number.isInteger(seat)||!state.players[seat]||state.players[seat].bankrupt)throw Error('not_your_turn');
 const g=copy(state);g.events=[];
 if(command?.type==='surrender'){
  eliminate(g,seat,'기권했어요');if(check(g))return g;
  if(seat===g.turn)nextTurn(g);
  else if(g.phase.kind==='takeover'&&g.owner[g.phase.tile]===undefined)g.phase={kind:'buy',tile:g.phase.tile};
  else if(['swapOwn','swapOther','quake','fest','bonus'].includes(g.phase.kind)&&(!targets(g,g.phase.kind).length||(g.phase.kind==='swapOwn'&&!targets(g,'swapOther').length)))finish(g);
  return g;
 }
 if(seat!==g.turn)throw Error('not_your_turn');
 const q=g.players[seat],ph=g.phase,kind=ph.kind,i=ph.tile,pr=prompt(g),v=command?.value;
 if(kind==='roll'&&command?.type==='roll'){
  const a=random(6)+1,b=random(6)+1;event(g,'dice',{p:seat,a,b});log(g,`${q.name} 주사위 ${a} + ${b}`);
  if(a===b&&++g.doubles===3){island(g,seat);finish(g);return g;}
  g.extra=a===b;move(g,seat,a+b);land(g,random);return g;
 }
 if(command?.type!=='choose'||!pr.choices.some(c=>c.value===v))throw Error('invalid_choice');
 if(kind==='island'){
  if(v==='pay'){q.island=0;pay(g,seat,50);if(q.bankrupt)finish(g);else g.phase={kind:'roll'};}
  else{const a=random(6)+1,b=random(6)+1;event(g,'dice',{p:seat,a,b});g.extra=false;if(a===b){q.island=0;move(g,seat,a+b);land(g,random);}else{q.island--;log(g,`${q.name} 무인도 탈출 실패 · ${q.island}턴 남음`);finish(g);}}
 }else if(v==='skip'){
  if(kind==='travel'){if(q.island>0&&q.escape){q.escape--;q.island=0;}g.phase={kind:q.island>0?'island':'roll'};}else finish(g);
 }else if(kind==='buy'){
  if(g.owner[i]!==undefined||q.money<tiles[i].p)throw Error('invalid_choice');
  q.money-=tiles[i].p;g.owner[i]=seat;g.level[i]=0;log(g,`${q.name} ${tiles[i].n} 구입 −${tiles[i].p}만`);event(g,'buy',{p:seat,tile:i});if(!check(g))buildOffer(g,i);
 }else if(kind==='takeover'){
  const owner=g.owner[i],price=value(g,i)*2;if(owner===undefined||owner===seat||lv(g,i)>=4||q.money<price)throw Error('invalid_choice');
  q.money-=price;g.players[owner].money+=price;g.owner[i]=seat;log(g,`${q.name} ${tiles[i].n} 인수 −${price}만`);event(g,'buy',{p:seat,tile:i});if(!check(g))buildOffer(g,i);
 }else if(kind==='build'){build(g,i,v);finish(g);}
 else if(kind==='travel'){g.extra=false;pay(g,seat,20);if(q.bankrupt)finish(g);else{move(g,seat,(v-q.pos+32)%32);land(g,random);}}
 else if(kind==='fest'){g.fest[v]=(g.fest[v]||0)+1;log(g,`${q.name} ${tiles[v].n} 페스티벌 · 통행료 ×${2**g.fest[v]}`);event(g,'fest',{p:seat,tile:v});finish(g);}
 else if(kind==='bonus'){build(g,v,lv(g,v)+1,true);finish(g);}
 else if(kind==='swapOwn')g.phase={kind:'swapOther',mine:v};
 else if(kind==='swapOther'){const mine=ph.mine;if(g.owner[mine]!==seat||lv(g,mine)>=4)throw Error('invalid_choice');g.owner[mine]=g.owner[v];g.owner[v]=seat;log(g,`${q.name} ${tiles[mine].n} ↔ ${tiles[v].n} 교환`);event(g,'swap',{a:mine,b:v});finish(g);}
 else if(kind==='quake'){g.level[v]--;log(g,`${q.name} ${tiles[v].n} 건물 하나 파괴`);event(g,'quake',{p:seat,tile:v});finish(g);}
 return g;
}
export function automaticCommand(g){
 const ph=g.phase,kind=ph.kind,p=g.turn,q=g.players[p],pr=prompt(g),allowed=pr.choices.filter(c=>c.value!=='skip').map(c=>c.value);
 if(kind==='roll')return {type:'roll'};
 let value='skip';
 if(kind==='island')value=q.money>600?'pay':'roll';
 else if(kind==='buy'||kind==='takeover'){
  const next=copy(g);next.owner[ph.tile]=p;const price=kind==='buy'?tiles[ph.tile].p:valueOfTakeover(g,ph.tile);
  if(monopoly(next,p)||q.money-price>=(kind==='buy'?250:600))value='yes';
 }else if(kind==='build')value=allowed.filter(n=>q.money-range(ph.tile,lv(g,ph.tile),n)>=350).at(-1)??'skip';
 else if(kind==='travel')value=allowed.filter(i=>property(i)&&g.owner[i]===undefined&&q.money-tiles[i].p>=270).sort((a,b)=>tiles[b].p-tiles[a].p)[0]??0;
 else if(kind==='bonus')value=allowed.sort((a,b)=>tiles[b].p-tiles[a].p)[0]??'skip';
 else if(kind==='fest'||kind==='quake')value=allowed.sort((a,b)=>toll(g,b)-toll(g,a))[0]??'skip';
 else if(kind==='swapOwn')value=allowed.sort((a,b)=>valueOf(g,a)-valueOf(g,b))[0]??'skip';
 else if(kind==='swapOther')value=allowed.sort((a,b)=>valueOf(g,b)-valueOf(g,a))[0]??'skip';
 return {type:'choose',value};
}
const valueOf=value,valueOfTakeover=(g,i)=>value(g,i)*2;
export function automaticTurn(state,random=secureRandom){
 let g=state;const p=g.turn,events=[];
 for(let n=0;n<24&&!g.over&&g.turn===p;n++){g=advance(g,p,automaticCommand(g),random);events.push(...g.events);}
 g.events=events.slice(-40);log(g,`${g.players[p].name} 시간 초과 · 자동 진행`);return g;
}
