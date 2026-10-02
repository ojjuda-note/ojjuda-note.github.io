// Shared browser/server Matgo rules. Keep the deployed Edge copy byte-identical.
const DEF = [
 [1,'gwang','', ], [1,'tti','hong'], [1,'pi'], [1,'pi'],
 [2,'yul','bird'], [2,'tti','hong'], [2,'pi'], [2,'pi'],
 [3,'gwang'], [3,'tti','hong'], [3,'pi'], [3,'pi'],
 [4,'yul','bird'], [4,'tti','cho'], [4,'pi'], [4,'pi'],
 [5,'yul'], [5,'tti','cho'], [5,'pi'], [5,'pi'],
 [6,'yul'], [6,'tti','cheong'], [6,'pi'], [6,'pi'],
 [7,'yul'], [7,'tti','cho'], [7,'pi'], [7,'pi'],
 [8,'gwang'], [8,'yul','bird'], [8,'pi'], [8,'pi'],
 [9,'yul','gukjin'], [9,'tti','cheong'], [9,'pi'], [9,'pi'],
 [10,'yul'], [10,'tti','cheong'], [10,'pi'], [10,'pi'],
 [11,'gwang'], [11,'ssang'], [11,'pi'], [11,'pi'],
 [12,'gwang','bi'], [12,'yul'], [12,'tti'], [12,'ssang'],
];
const CARDS = DEF.map((d,i)=>({id:i,m:d[0],k:d[1],tag:d[2]||''})).concat([{id:48,m:13,k:'bonus',tag:'',pv:2},{id:49,m:13,k:'bonus',tag:'',pv:3}]);
const isPi = c => c.k==='pi'||c.k==='ssang'||c.k==='bonus'||(c.k==='yul'&&c.tag==='gukjin'&&c.asPi);
const piVal = c => c.k==='bonus'?c.pv:c.k==='ssang'?2:(c.k==='yul'&&c.asPi)?2:c.k==='pi'?1:0;
function score(caps){
  const g=caps.filter(c=>c.k==='gwang'), y=caps.filter(c=>c.k==='yul'&&!c.asPi), t=caps.filter(c=>c.k==='tti'), pi=caps.filter(isPi);
  const det=[]; let pts=0;
  if(g.length>=3){ let s= g.length===5?15 : g.length===4?4 : (g.some(c=>c.tag==='bi')?2:3); pts+=s; det.push([`${g.length}광`,s]); }
  if(y.length>=5){ pts+=y.length-4; det.push([`열끗 ${y.length}장`,y.length-4]); }
  if(y.filter(c=>c.tag==='bird').length===3){ pts+=5; det.push(['고도리',5]); }
  if(t.length>=5){ pts+=t.length-4; det.push([`띠 ${t.length}장`,t.length-4]); }
  for(const [tag,nm] of [['hong','홍단'],['cheong','청단'],['cho','초단']]) if(t.filter(c=>c.tag===tag).length===3){ pts+=3; det.push([nm,3]); }
  const pv=pi.reduce((s,c)=>s+piVal(c),0); if(pv>=10){ pts+=pv-9; det.push([`피 ${pv}장`,pv-9]); }
  return {pts,det,g:g.length,y:y.length,t:t.length,pv};
}
// ================= 게임 엔진 =================
function shuffle(a,r=Math.random){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
class Game {
  constructor(ui){ this.ui=ui; this.random=Math.random; this.actions=[]; this.bank=[5000,5000]; this.rate=100; this.carry=1; this.first=0; }
  deal(){
    if(this._playing)return false;
    let d,board,bonus;
    for(;;){
      d=shuffle(CARDS.map(c=>({...c,asPi:false})),this.random);board=[];bonus=[];
      while(board.length<8){const c=d.shift();if(c.k==='bonus')bonus.push(c);else board.push(c);}
      const counts={};board.forEach(c=>counts[c.m]=(counts[c.m]||0)+1);
      if(Object.values(counts).every(n=>n<4))break;
    }
    this.deck=d;this.floor=[];const by={};
    board.forEach(c=>(by[c.m]||(by[c.m]=[])).push(c));
    // 같은 월 3장만 묶는다. 2장은 서로 선택할 수 있도록 따로 둔다.
    for(const cards of Object.values(by)){if(cards.length===3)this.floor.push(cards);else cards.forEach(c=>this.floor.push([c]));}
    this.caps=[[],[]];this.dealBonus=bonus;this.actions=[];
    this.hand=[this.deck.splice(0,10),this.deck.splice(0,10)];this.go=[0,0];this.lastPts=[0,0];this.mult=[1,1];this.shake=[0,0];this.bomb=[0,0];this.turn=this.first;this.over=false;this.log=[];
    this.ppukCount=[0,0];this.chongtongDeclined=[new Set(),new Set()];
    this.caps[this.first].push(...bonus);return true;
  }
  pendingChongtong(){
    if(this.over)return null;
    // Resolve simultaneous declarations in dealer order, before either player moves.
    for(const p of [this.first,1-this.first]){
      const counts=new Map();
      for(const c of this.hand[p])if(c.k!=='bonus')counts.set(c.m,(counts.get(c.m)||0)+1);
      const months=[...counts].filter(([m,n])=>n===4&&!this.chongtongDeclined[p].has(m)).map(([m])=>m);
      if(months.length)return {p,months};
    }
    return null;
  }
  async declareChongtong(p,decision){
    const pending=this.pendingChongtong();
    if(this._playing||!pending||pending.p!==p||!['win','continue'].includes(decision))return false;
    this.actions.push({type:'chongtong',p,decision});
    pending.months.forEach(m=>this.chongtongDeclined[p].add(m));
    this._playing=true;
    try{if(decision==='win')await this.finish(p,'chongtong');return true;}
    finally{this._playing=false;}
  }
  async ppukReward(p,stack){
    const self=stack.ppukOwner===p,bonusCount=stack.filter(c=>c.k==='bonus').length;
    const count=(self?2:1)+bonusCount;
    await this.ui.event('ppukget',{p,self,count,bonusCount});return count;
  }
  canBombFlip(p){return this.bomb[p]>0&&this.deck.length>0;}
  canMove(p){return this.hand[p].length>0||this.canBombFlip(p);}
  pts(p){ return score(this.caps[p]).pts; }
  async stealPi(from,to,why){ const c=this.caps[from]; const idx=(()=>{ let i=c.findIndex(x=>x.k==='pi'); if(i<0) i=c.findIndex(x=>x.k==='yul'&&x.asPi); if(i<0) i=c.findIndex(x=>x.k==='ssang'); if(i<0) i=c.findIndex(x=>x.k==='bonus'); return i; })(); if(idx<0) return false; const [card]=c.splice(idx,1); this.caps[to].push(card); await this.ui.event('steal',{from,to,card,why}); return true; }
  async take(p,cards,silent){ if(!cards.length) return; const before=new Set(score(this.caps[p]).det.map(d=>d[0])); this.caps[p].push(...cards); await this.ui.event('take',{p,cards,silent}); const after=score(this.caps[p]).det.map(d=>d[0]).filter(n=>!before.has(n)); const big=after.filter(n=>/광$|고도리|홍단|청단|초단/.test(n)); const first=after.filter(n=>/^(열끗|띠|피) /.test(n)&&![...before].some(old=>old.split(' ')[0]===n.split(' ')[0])); if(big.length||first.length) await this.ui.event('combo',{p,names:big,first}); }
  matches(m){ return this.floor.map((st,i)=>[st,i]).filter(([st])=>st[0].m===m); }
  async play(p, card, bombCards){
    if(this.over||this._playing||this.pendingChongtong()||p!==this.turn||!this.canMove(p))return false;
    if(card&&!this.hand[p].includes(card))return false;
    if(!card&&!this.canBombFlip(p))return false;
    if(bombCards){
      const all=[card,...bombCards],matches=this.matches(card.m);
      if(all.length!==3||new Set(all).size!==3||all.some(c=>!this.hand[p].includes(c)||c.m!==card.m)||matches.length!==1||matches[0][0].length!==1)return false;
    }
    const action={type:"play",p,card:card?card.id:null,bomb:bombCards?bombCards.map(c=>c.id):null,choices:[],decision:null}; this.actions.push(action); this.currentAction=action;
    this._playing=true;
    try{
    if(!card)this.bomb[p]--;
    const hand=this.hand[p]; let stole=0, swept=false, ppukGot=false;
    // ----- 0) 보너스패: 바로 먹고 더미에서 한 장 받은 뒤 다시 내 차례 -----
    if(card && card.k==='bonus'){ hand.splice(hand.indexOf(card),1); await this.ui.event('bonusPlay',{p,card}); await this.take(p,[card],true); await this.stealPi(1-p,p,'bonus'); const d=this.deck.shift(); if(d){ hand.push(d); await this.ui.event('draw',{p,card:d}); } await this.ui.event('state'); if(!this.canMove(p))await this.endTurn(p); return; }
    // ----- 1) 손패 내기 -----
    let playedStackIdx=-1, handCardStack=null;
    if(bombCards){ // 폭탄: 같은 월 3장 + 바닥 1장
      const ms=this.matches(card.m); const st=ms[0][0]; const three=[card,...bombCards.filter(c=>c!==card)].slice(0,3);
      for(const c of three){ const k=hand.indexOf(c); if(k>=0) hand.splice(k,1); st.push(c); await this.ui.event('played',{p,card:c,stack:st,quick:true}); }
      this.bomb[p]+=2; this.mult[p]*=2; await this.ui.event('bomb',{p,m:card.m,cards:[...st]}); this.floor.splice(this.floor.indexOf(st),1); await this.take(p,[...st]); stole++;
    } else {
      if(card) hand.splice(hand.indexOf(card),1);
      if(card){ const ms=this.matches(card.m);
        if(ms.length===0){ this.floor.push([card]); playedStackIdx=this.floor.length-1; handCardStack=this.floor[playedStackIdx]; await this.ui.event('played',{p,card,stack:handCardStack}); }
        else if(ms.length===1){ const [st,idx]=ms[0]; if(st.ppuk){ st.push(card); await this.ui.event('played',{p,card,stack:st}); this.floor.splice(idx,1); ppukGot=true; stole+=await this.ppukReward(p,st); await this.take(p,st); } else if(st.length>=3){ st.push(card); await this.ui.event('played',{p,card,stack:st}); this.floor.splice(idx,1); await this.take(p,st); } else { st.push(card); handCardStack=st; playedStackIdx=idx; st.pending=true; await this.ui.event('played',{p,card,stack:st}); } }
        else { // 2장 중 선택 (따닥 가능성)
          const choice = await this.choose(p, ms.map(x=>x[1]), card, 'hand'); const st=this.floor[choice]; st.push(card); handCardStack=st; playedStackIdx=choice; st.pending=true; await this.ui.event('played',{p,card,stack:st}); }
      } else await this.ui.event('played',{p,card:null});
    }
    // ----- 2) 패 뒤집기 -----
    let flip = this.deck.shift(); let flipStack=null;
    // 보너스 뒤에 뻑이 나면 보너스와 피 뺏기 보상도 그 더미에 묶어 둔다.
    const flipBonuses=[];
    while(flip && flip.k==='bonus'){ flipBonuses.push(flip); await this.ui.event('flipBonus',{p,card:flip}); flip=this.deck.shift(); }
    const bindsBonus=flip&&handCardStack&&flip.m===card.m&&handCardStack.length===2&&!this.floor.some(st=>st!==handCardStack&&st[0].m===card.m&&!st.ppuk);
    if(!bindsBonus&&flipBonuses.length){await this.take(p,flipBonuses);stole+=flipBonuses.length;}
    let tookAny=false;
    if(flip){
      if(handCardStack && flip.m===card.m){
        if(handCardStack.length===1){ // 쪽
          handCardStack.push(flip); await this.ui.event('flip',{p,card:flip,stack:handCardStack}); this.floor.splice(this.floor.indexOf(handCardStack),1); stole++; await this.ui.event('jjok',{p}); await this.take(p,handCardStack); tookAny=true; handCardStack=null;
        } else if(handCardStack.length===2){ const other=this.floor.find(st=>st!==handCardStack&&st[0].m===card.m&&!st.ppuk);
          if(other){ // 따닥 (바닥 2장 + 손 1장 + 뒤집기 1장)
            other.push(flip); await this.ui.event('flip',{p,card:flip,stack:other}); const all=[...handCardStack,...other]; this.floor.splice(this.floor.indexOf(handCardStack),1); this.floor.splice(this.floor.indexOf(other),1); stole++; await this.ui.event('ttadak',{p}); await this.take(p,all); tookAny=true; handCardStack=null;
          } else { // 뻑
          handCardStack.push(flip); await this.ui.event('flip',{p,card:flip,stack:handCardStack}); handCardStack.ppuk=true; handCardStack.ppukOwner=p; delete handCardStack.pending;
          if(flipBonuses.length){handCardStack.push(...flipBonuses);await this.ui.event('ppukBonus',{p,cards:flipBonuses,stack:handCardStack});}
          this.ppukCount[p]++;await this.ui.event('ppuk',{p,count:this.ppukCount[p],bonusCount:flipBonuses.length});handCardStack=null; }
        } else if(handCardStack.length===3){ // 따닥 (바닥2+손1+뒤집기1)
          handCardStack.push(flip); await this.ui.event('flip',{p,card:flip,stack:handCardStack}); this.floor.splice(this.floor.indexOf(handCardStack),1); stole++; await this.ui.event('ttadak',{p}); await this.take(p,handCardStack); tookAny=true; handCardStack=null;
        }
      } else {
        const ms2=this.matches(flip.m).filter(([st])=>st!==handCardStack);
        if(ms2.length===0){ this.floor.push([flip]); await this.ui.event('flip',{p,card:flip,stack:this.floor[this.floor.length-1]}); }
        else if(ms2.length===1){ const [st,idx]=ms2[0]; st.push(flip); await this.ui.event('flip',{p,card:flip,stack:st}); if(st.ppuk){ ppukGot=true; stole+=await this.ppukReward(p,st); } this.floor.splice(idx,1); await this.take(p,st); tookAny=true; }
        else { const choice=await this.choose(p, ms2.map(x=>x[1]), flip, 'flip'); const st=this.floor[choice]; st.push(flip); await this.ui.event('flip',{p,card:flip,stack:st}); this.floor.splice(choice,1); await this.take(p,st); tookAny=true; }
      }
    }
    if(this.ppukCount[p]>=3){await this.ui.event('state');await this.finish(p,'three_ppuk');return true;}
    // 손패와 짝이 맞았던 더미 수거
    if(handCardStack && handCardStack.pending){ delete handCardStack.pending; if(handCardStack.length>=2 && !handCardStack.ppuk){ this.floor.splice(this.floor.indexOf(handCardStack),1); await this.take(p,handCardStack); tookAny=true; } }
    this.floor.forEach(st=>delete st.pending);
    if(this.floor.length===0 && tookAny && this.deck.length){ swept=true; stole++; await this.ui.event('sweep',{p}); }
    for(let i=0;i<stole;i++) await this.stealPi(1-p,p,'bonus');
    await this.ui.event('state');
    await this.endTurn(p);
    return true;
    }finally{this._playing=false;this.currentAction=null;}
  }
  async choose(p,indices,card,source){
    const selected=await this.ui.choose(p,indices,card,source);
    if(!indices.includes(selected))throw new Error('invalid_choice');
    this.currentAction.choices.push(selected);return selected;
  }
  async goStop(p,points){
    const decision=await this.ui.goStop(p,points);
    if(!['go','stop'].includes(decision))throw new Error('invalid_decision');
    this.currentAction.decision=decision;return decision;
  }
  shakeCards(p,month){
    if(this.over||this._playing||this.pendingChongtong()||this.turn!==p||this.shake[p]||this.hand[p].filter(c=>c.m===month).length<3)return false;
    this.shake[p]=1;this.mult[p]*=2;this.actions.push({type:'shake',p,month});return true;
  }
  toggleGukjin(p){
    if(this.over||this._playing||this.pendingChongtong()||this.turn!==p)return false;
    const card=this.caps[p].find(c=>c.tag==='gukjin');if(!card)return false;
    card.asPi=!card.asPi;this.actions.push({type:'gukjin',p});return true;
  }
  async endTurn(p){
    const s=this.pts(p);
    if(s>=7&&s>this.lastPts[p]){
      const canGo=this.deck.length>0&&this.canMove(p)&&this.canMove(1-p);
      const decision=canGo?await this.goStop(p,s):'stop';
      if(decision==='go'){this.go[p]++;this.lastPts[p]=s;await this.ui.event('go',{p,n:this.go[p]});}
      else{await this.finish(p);return;}
    }
    if(this.canMove(1-p))this.turn=1-p;
    else if(this.canMove(p))this.turn=p;
    else await this.finish(-1);
  }
  async finish(winner,special=null){
    if(this.over)return;
    this.over=true;
    if(winner<0){ this.carry=Math.min(1024,this.carry*2); this.first=1-this.first; return this.ui.event('nagari'); }
    const l=1-winner, sw=score(this.caps[winner]), sl=score(this.caps[l]); let pts=sw.pts; const det=[...sw.det]; let mult=1;
    if(special){
      pts=7;det.splice(0,det.length,[special==='chongtong'?'총통':'뻑 3회',7]);
      if(special==='three_ppuk'&&this.go[l]>0){mult*=2;det.push(['고박','×2']);}
    }
    else{
    const g=this.go[winner]; if(g>=1){ pts+=Math.min(g,2); det.push([`${g}고`,'+'+Math.min(g,2)]); } if(g>=3){ const k=Math.pow(2,g-2); mult*=k; det.push([`${g}고 배`,'×'+k]); }
    if(sw.det.some(d=>d[0].startsWith('피'))&&sl.pv<=5){ mult*=2; det.push(['피박','×2']); }
    if(sw.det.some(d=>d[0].endsWith('광'))&&sl.g===0){ mult*=2; det.push(['광박','×2']); }
    if(sw.det.some(d=>d[0].startsWith('열끗')||d[0]==='고도리')&&sl.y===0){ mult*=2; det.push(['멍박','×2']); }
    if(this.go[l]>0){ mult*=2; det.push(['고박','×2']); }
    if(this.mult[winner]>1){ mult*=this.mult[winner]; det.push([this.bomb[winner]||this.shake[winner]?'흔들기·폭탄':'배',`×${this.mult[winner]}`]); }
    if(this.carry>1){ mult*=this.carry; det.push(['나가리 이월',`×${this.carry}`]); }
    }
    const total=pts*mult, money=total*this.rate; this.bank[winner]+=money; this.bank[l]=Math.max(0,this.bank[l]-money); this.carry=1; this.first=winner;
    return this.ui.event('end',{winner,pts,mult,total,money,det,special});
  }
}
// ================= AI =================
function aiChooseCard(g,p){
  const hand=g.hand[p]; const bn=hand.find(c=>c.k==='bonus'); if(bn) return bn; let best=null,bs=-1e9;
  const val=c=>c.k==='gwang'?6:c.k==='yul'?3:c.k==='tti'?3:c.k==='ssang'?3:1.2;
  for(const c of hand){ const ms=g.matches(c.m); let s=0;
    if(ms.length){ const st=ms.reduce((a,b)=>a[0].length>=b[0].length?a:b)[0]; s=val(c)+st.reduce((a,x)=>a+val(x),0); if(st.ppuk) s+=6; if(st.length===2) s+=2;
      const mine=g.caps[p]; if(c.k==='gwang'||st.some(x=>x.k==='gwang')) s+=4; if(c.k==='tti'&&c.tag){ const same=mine.filter(x=>x.k==='tti'&&x.tag===c.tag).length; s+=same*2; } if(c.tag==='bird'||st.some(x=>x.tag==='bird')){ s+=mine.filter(x=>x.tag==='bird').length*3; }
    } else { s=-val(c)-(hand.filter(x=>x.m===c.m).length>1?2:0); const left=48-g.caps[0].length-g.caps[1].length-g.floor.flat().length; s-=0; if(g.hand[1-p].length) s-=1; }
    s+=g.random()*.5; if(s>bs){bs=s;best=c;}
  }
  return best;
}
function aiGoStop(g,p,s){ const o=g.pts(1-p); const lead=s-o; const risky=o>=5 || g.deck.length<4 || g.hand[p].length<=2; if(s>=12) return 'stop'; if(!risky && lead>=4 && g.go[p]<2) return 'go'; if(g.go[p]===0 && o<=2 && g.deck.length>=8 && s<10) return 'go'; return 'stop'; }
function aiChoose(g,p,idxs){ const val=c=>c.k==='gwang'?6:c.k==='yul'?3:c.k==='tti'?3:c.k==='ssang'?3:1; return idxs.reduce((a,b)=>val(g.floor[a][0])>=val(g.floor[b][0])?a:b); }

export function seededRandom(seed){let value=seed>>>0;return()=>{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export { CARDS, isPi, piVal, score, Game, aiChooseCard, aiGoStop, aiChoose };
