/* Arcade monthly rankings. Uses the current viewer session. */
(()=>{'use strict';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=action;return n;};
let dispose=null,controller=null;
// A ranking month starts at 01:00 in Korea (16:00 UTC on the prior day).
const rankingMonth=(now=Date.now())=>new Date(now+8*60*60*1000).toISOString().slice(0,7);
const nextReset=month=>Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)-8*60*60*1000;
const validMonth=month=>typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
const monthName=month=>Number(month.slice(0,4))+'년 '+Number(month.slice(5,7))+'월';
const rankGroups=[{id:'solo',name:'혼자하는 플레이'},{id:'multi',name:'함께하는 플레이'},{id:'adult',name:'어른들 플레이'}];
const multiGames=new Set(['bang','tank','tour','ttang','janggi','chess','billiards']);
const adultGames=new Set(['matgo','poker','roulette','photo_ttang']);
const rankGroupFor=id=>adultGames.has(id)?'adult':multiGames.has(id)?'multi':'solo';
const groupedEntries=entries=>rankGroups.map(group=>({...group,entries:entries.filter(([id])=>rankGroupFor(id)===group.id)})).filter(group=>group.entries.length);
const streakCondition='해당 월에 연속으로 이긴 횟수 중 가장 높은 기록으로 정해요.';
const boardCondition='회원 대결 → 어려움 → 보통 → 쉬움 순으로 우선하고, 같은 조건에서는 해당 월 최고 연승으로 정해요.';
const scoreCondition='해당 월에 기록한 가장 높은 점수로 정해요.';
const rankingConditions={
 archery:'통과한 단계가 높은 순, 같은 단계에서는 해당 월 최고 점수, 점수도 같으면 먼저 달성한 순으로 정해요. 이벤트 사격 기록은 제외돼요.',
 bang:streakCondition,
 sacheonseong:'완료한 단계가 높은 순, 같은 단계에서는 완료 시간이 짧은 순으로 정해요.',
 tank:'상대 수가 많은 대전 기록을 우선하고, 같은 상대 수에서는 해당 월 최고 연승으로 정해요.',
 saetbyeol:'해당 월에 기록한 가장 높은 성장 점수로 정해요.',
 solitaire:'보통 → 초보 순으로 우선하고, 같은 난이도에서는 클리어 시간이 짧은 순으로 정해요. 시간이 같으면 먼저 달성한 순이에요.',
 mines:'난이도가 높은 순, 같은 난이도에서는 완료 시간이 짧은 순으로 정해요. 기본 8개 난이도만 집계해요.',
 tour:streakCondition,
 billiards:boardCondition+' 4구·3쿠션·포켓볼을 통합 표시하며, 종목별 연승은 합산하지 않아요.',
 janggi:boardCondition,chess:boardCondition,
 screw_box:'박스형에서 해당 월에 기록한 가장 높은 점수로 정해요.',
 screw_flat:'평면형에서 해당 월에 기록한 가장 높은 점수로 정해요.',
 spot:'해당 월에 완료한 서로 다른 그림의 장수로 정해요. 같은 그림은 한 번만 세요.',
 ttang:streakCondition,mole:scoreCondition,runner:scoreCondition,
 stacker:'해당 월에 가장 높이 쌓은 층수로 정해요.',breakout:scoreCondition,
 matgo:'해당 월 한 판에서 실제로 늘어난 골드의 최댓값으로 정해요.',
 poker:'해당 월 한 판에서 실제로 늘어난 골드의 최댓값으로 정해요.',
 roulette:'해당 월 한 판에서 받은 당첨 골드의 최댓값으로 정해요.',
 photo_ttang:'해당 월에 완료한 서로 다른 사진의 장수로 정해요. 같은 사진은 한 번만 세요.'
};
const readKey=(kind,month,ids)=>JSON.stringify([kind,month,[...ids].sort()]);
// Shell redraws should share the same read. Explicit refreshes and saved game
// results bypass this short-lived cache; data never crosses account/client scope.
let rankingScope=null;
function scopeFor(client,owner){
 if(!client||!owner){rankingScope=null;return null;}
 if(rankingScope?.client!==client||rankingScope.owner!==owner)rankingScope={client,owner,reads:new Map()};
 return rankingScope;
}
function invalidate(client,owner){if(rankingScope?.client===client&&rankingScope.owner===owner)rankingScope.reads.clear();}
function readRanking(client,owner,key,query,fresh=false){
 const scope=scopeFor(client,owner),now=Date.now();
 if(fresh)scope.reads.clear();
 const cached=scope.reads.get(key);
 if(cached?.promise)return cached.promise;
 if(cached&&now-cached.at<15000)return Promise.resolve(cached.response);
 for(const [oldKey,entry] of scope.reads)if(!entry.promise&&now-entry.at>=15000)scope.reads.delete(oldKey);
 const entry={promise:null,response:null,at:0};scope.reads.set(key,entry);
 entry.promise=Promise.resolve().then(query).then(response=>{
  if(response.error)throw response.error;
  if(rankingScope===scope&&scope.reads.get(key)===entry){
   if(response.data?.pending===true)scope.reads.delete(key);
   else{entry.response=response;entry.at=Date.now();entry.promise=null;}
  }
  return response;
 }).catch(error=>{
  if(scope.reads.get(key)===entry)scope.reads.delete(key);
  throw error;
 });
 return entry.promise;
}
function readLeaders(client,owner,ids,fresh=false){
 return readRanking(client,owner,readKey('leaders',rankingMonth(),ids),()=>client.rpc('community_game_monthly_leaders',{p_games:ids}),fresh);
}
function readHistory(client,owner,ids,month,fresh=false){
 return readRanking(client,owner,readKey('history',[rankingMonth(),month||rankingMonth()],ids),()=>client.rpc('community_game_monthly_history',{p_games:ids,p_month:month?month+'-01':null}),fresh);
}
function shareCurrentLeaders(client,owner,ids,data){
 if(rankingScope?.client!==client||rankingScope.owner!==owner||data.month!==data.currentMonth)return;
 rankingScope.reads.set(readKey('leaders',data.currentMonth,ids),{response:{data:data.leaders},at:Date.now(),promise:null});
}
function mount(host,{client,owner,games={},getGames=null,onOpenGame=null,authorized=()=>true}={}){
dispose?.();dispose=null;controller=null;scopeFor(client,owner);if(!host)return;
let rankDispose=()=>{},releaseAccess=null,alive=true,request=0,catalogKey=null;
const rankStates=new Map();
let view='home',historyMonth=null,historyInfo=null,observedMonth=rankingMonth(),rolloverTimer=0,help=null,rankCategory=null,automaticOverride=null;
const lifecycle=new AbortController(),lifecycleOptions={signal:lifecycle.signal};
const active=()=>alive&&host.isConnected&&authorized();
function updateGames(){
 const next=typeof getGames==='function'?getGames():games;
 const key=JSON.stringify(Object.entries(next).map(([id,game])=>[id,game.name,game.unit,game.rankingBasis,game.baseName,game.difficultyName,game.maintenance,game.pinInRanking]));
 const changed=key!==catalogKey;games=next;catalogKey=key;
 const groups=new Set(Object.keys(games).map(rankGroupFor));
 if(!groups.has(rankCategory))rankCategory=rankGroups.find(group=>groups.has(group.id))?.id||null;
 for(const [id,state] of rankStates){if(!groups.has(id))rankStates.delete(id);else if(state.focus&&!games[state.focus])state.focus=null;}
 return changed;
}
async function syncCatalog(){
 if(alive&&host.isConnected&&!authorized()){
  request++;closeHelp(false);rankDispose();clearTimeout(rolloverTimer);rankStates.clear();rankCategory=null;catalogKey=null;content.replaceChildren();status.textContent='';
  return false;
 }
 if(!client||!owner||!active()||!updateGames())return false;
 return refreshView();
}
const status=el('p','','board-status');status.setAttribute('role','status');
const content=el('div');host.replaceChildren(status,content);
async function result(query){const {data,error}=await query;if(error)throw error;if(!active())throw Error('stale');return data||[];}
function closeHelp(restoreFocus=true){
 if(!help)return false;
 const current=help;help=null;current.trigger.setAttribute('aria-expanded','false');
 if(current.dialog.open)current.dialog.close();current.dialog.remove();
 if(restoreFocus&&active()&&current.trigger.isConnected)current.trigger.focus({preventScroll:true});
 return true;
}
function openHelp(trigger,token){
 if(!active()||view!=='history'||token!==request)return;
 if(help){help.close.focus({preventScroll:true});return;}
 const dialog=el('dialog','','board-rank-help-dialog'),heading=el('h2','게임별 순위 조건');heading.id='board-rank-help-title';
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',heading.id);dialog.dataset.worldSwipe='off';
 const header=el('header','','board-rank-help-header'),close=button('닫기',()=>closeHelp(),'board-rank-help-close');close.setAttribute('aria-label','순위 조건 닫기');header.append(heading,close);
 const body=el('div','','board-rank-help-body');body.tabIndex=0;body.setAttribute('role','region');body.setAttribute('aria-label','게임별 순위 조건');
 const rules=el('ul','','board-rank-help-rules');
 for(const text of [
  '선택한 월의 기록을 집계하며, 매월 1일 오전 1시(한국시간)에 새로 시작해요.',
  '0점·0연승 등 0 이하의 기록은 순위에서 제외돼요.',
  '연승은 패배·무승부 때 다시 세지만, 그달 최고 연승은 남아요.',
  '게임을 나가 컴퓨터가 대신한 판은 나간 사람의 순위·연승에서 제외돼요.',
  '조건과 기록이 같으면 먼저 달성한 순으로 정해요.'
 ])rules.append(el('li',text));
 const list=el('dl','','board-rank-help-games');
 for(const [id,game] of Object.entries(games)){
  const item=el('div');item.dataset.rankingGame=id;
  item.append(el('dt',game.name),el('dd',rankingConditions[id]||'해당 월에 달성한 최고 기록으로 정해요.'));list.append(item);
 }
 body.append(rules,list);dialog.append(header,body);help={dialog,trigger,close};trigger.setAttribute('aria-expanded','true');document.body.append(dialog);
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(help?.dialog===dialog)closeHelp();});
 dialog.addEventListener('close',()=>{if(help?.dialog===dialog)closeHelp();});
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog||help?.dialog!==dialog)return;
  const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeHelp();
 });
 dialog.showModal();close.focus({preventScroll:true});
}
function labelGame(target,game,detail=''){
 if(detail)target.replaceChildren(el('span',game.name,'board-game-name'),el('small',detail,'board-game-difficulty'));
 else if(game.difficultyName)target.replaceChildren(el('span',game.baseName,'board-game-name'),el('small',game.difficultyName,'board-game-difficulty'));
 else target.textContent=game.name;
}
function makeRow(id,game,token,playable=true,openState=null){
 const row=el('tr','','board-leader');row.dataset.game=id;
 const period=playable?'이번 달':'해당 월';
 const name=el('th','','board-leader-game');name.scope='row';name.title=game.name+(game.rankingBasis==='stage_score'?' · 최고 통과 단계 → 같은 단계 최고 점수 → 먼저 달성한 순':game.rankingBasis==='stage_time'?' · 최고 완료 단계 → 가장 짧은 완료 시간 → 먼저 달성한 순':game.rankingBasis==='opponents_streak'?' · 이긴 상대 수 → '+period+' 최고 연승 → 먼저 달성한 순':['picture_clears','photo_clears'].includes(game.rankingBasis)?' · '+period+' 완료한 그림 장수':game.rankingBasis==='best_round_gain'?' · '+period+' 한 판 최대 획득 골드':game.rankingBasis==='difficulty_streak'?' · 회원대결, 어려움, 보통, 쉬움 순 · 같은 난이도는 '+period+' 최고 연승순':game.rankingBasis==='difficulty_time'?' · 난이도 → 완료 시간 → 먼저 달성한 순':game.rankingBasis==='current_streak'?' · '+period+' 최고 연승 기준':'');
 labelGame(name,game);
 if(playable&&!game.maintenance&&typeof onOpenGame==='function'){
  const opening=openState||{busy:false,buttons:new Set()};
  const play=button(game.name,async()=>{
   if(!active()||token!==request||opening.busy)return;
   opening.busy=true;for(const copy of opening.buttons)copy.disabled=true;status.textContent='';
   try{await onOpenGame(id);}catch{if(active()&&token===request)status.textContent='게임을 열지 못했어요. 다시 눌러 주세요.';}
   finally{opening.busy=false;for(const copy of opening.buttons)copy.disabled=false;}
  },'board-game-open');
  opening.buttons.add(play);play.disabled=opening.busy;
  play.setAttribute('aria-label',game.name+' 게임 열기');labelGame(play,game);name.replaceChildren(play);
 }
 const nick=el('td','불러오는 중…','board-leader-nick'),score=el('td','—','board-leader-score');row.append(name,nick,score);
 return {row,name,nick,score,hasScore:false};
}
function paintRecord(target,id,game,top,period='이번 달'){
 const {name,nick,score}=target;
 target.hasScore=!!(top&&top.score!==null&&top.score!==''&&Number.isFinite(Number(top.score))&&Number(top.score)>0);
 labelGame(name.querySelector('button')||name,game);
 if(!target.hasScore){
  score.textContent='—';score.removeAttribute('title');nick.removeAttribute('title');
  nick.replaceChildren(el('span',period==='이번 달'?'이번 달 기록 없음':'기록 없음','board-leader-empty'));return;
 }
 nick.textContent=top.nick||'익명';
 nick.title=period+(['picture_clears','photo_clears'].includes(game.rankingBasis)?' 완료 장수 1등 · ':game.rankingBasis==='best_round_gain'?' 한 판 최대 획득 골드 1등 · ':['current_streak','difficulty_streak','opponents_streak'].includes(game.rankingBasis)?' 최고 연승 1등 · ':' 1등 · ')+(top.nick||'익명');
 let value=Number(top.score).toLocaleString('ko-KR')+game.unit,detail='';
 if(game.rankingBasis==='stage_score'){
  const stage=Number(top.stage);if(Number.isInteger(stage)&&stage>=1&&stage<=220)detail=stage+'단계';
 }else if(game.rankingBasis==='stage_time'){
  const rules=window.OjjudaSacheonseongRanking;
  value=rules?.format?.(Number(top.score))||'—';
  const stage=Number(top.stage);if(rules?.game?.(stage))detail=stage+'단계';
 }else if(game.rankingBasis==='difficulty_time'){
  const record=(id==='solitaire'?window.OjjudaSolitaireRules:window.OjjudaMinesRules)?.record(Number(top.score));value=record?.time||'—';detail=record?.name||'';
 }else if(game.rankingBasis==='opponents_streak'){
  const n=Number(top.opponents);if(Number.isInteger(n)&&n>=1&&n<=11)detail=n+'명 상대';
 }else if(game.rankingBasis==='difficulty_streak'){
  const level={online:'회원대결',hard:'어려움',normal:'보통',easy:'쉬움'}[top.difficulty]||'';
  const variant=id==='billiards'?{carom4:'4구',carom3:'3쿠션',pool8:'포켓볼'}[top.variant]:'';
  detail=[variant,level].filter(Boolean).join(' · ');
 }
 if(detail)labelGame(name.querySelector('button')||name,game,detail);
 score.replaceChildren(el('span',value,'board-score-value'));score.title=score.textContent;
}
function fitRecords(targets,token){
 let frame=0;
 const fit=()=>{
  cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   if(!active()||token!==request)return;
   for(const {score} of targets.values()){
    const text=score.querySelector('.board-score-value');if(!text)continue;
    const style=getComputedStyle(score),width=score.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);if(width<=0)continue;
    text.style.fontSize='16px';text.style.whiteSpace='nowrap';
    const natural=text.scrollWidth,size=Math.max(11,Math.min(16,16*(width-1)/Math.max(1,natural)));text.style.fontSize=size+'px';
    if(natural*size/16>width-1)text.style.whiteSpace='normal';
   }
  });
 };
 const resize=new ResizeObserver(fit);resize.observe(content);document.fonts?.ready.then(fit);
 return {fit,dispose:()=>{cancelAnimationFrame(frame);resize.disconnect();}};
}
const rankColumnCount=width=>width>=960?3:width>=640?2:1;
function rankTable(label,history=false){
 const table=el('table'),thead=el('thead'),tr=el('tr'),body=el('tbody');table.setAttribute('aria-label',label);
 for(const title of ['게임',history?'1등 닉네임':'닉네임','기록']){const th=el('th',title);th.scope='col';tr.append(th);}
 thead.append(tr);table.append(thead,body);return {table,body};
}
function rankingCarousel(groups,head,token,items,onChange=()=>{},onResize=()=>{}){
 const panels=[...groups.children],ids=panels.map(panel=>panel.dataset.rankGroup);
 let index=Math.max(0,ids.indexOf(rankCategory)),width=groups.clientWidth,enabled=true,gesture=null,suppressClickUntil=0;
 const controls=el('div','','board-rank-controls board-rank-carousel-controls'),position=el('span','','board-rank-position');position.setAttribute('aria-live','polite');
 const prev=button('‹',()=>move(-1)),next=button('›',()=>move(1));
 prev.setAttribute('aria-label','이전 게임 순위');next.setAttribute('aria-label','다음 게임 순위');controls.append(prev,position,next);
 head.insertBefore(controls,head.querySelector('.board-rank-back'));
 groups.tabIndex=0;groups.setAttribute('role','region');groups.setAttribute('aria-label','게임순위 목록');
 const count=()=>items.reduce((total,item)=>total+item.count(),0);
 function paint(){
  const total=count(),current=items.slice(0,index).reduce((sum,item)=>sum+item.count(),0)+(items[index]?.current()||0);
  controls.hidden=!enabled||total<2;position.textContent=total?(current+1)+' / '+total:'0 / 0';
 }
 const offset=i=>panels[i].offsetLeft-panels[0].offsetLeft||i*groups.clientWidth;
 function align(animate=false){
  const changed=width!==groups.clientWidth;width=groups.clientWidth;if(changed)onResize();
  paint();if(!panels.length)return;
  const left=offset(index);
  const behavior=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant';
  if(typeof groups.scrollTo==='function')groups.scrollTo({left,behavior});else groups.scrollLeft=left;
 }
 function select(value,scroll=false){
  if(!active()||token!==request||!panels.length)return;
  const next=(value+panels.length)%panels.length,animate=Math.abs(next-index)===1;
  index=next;rankCategory=ids[index];groups.dataset.rankCategory=rankCategory;
  panels.forEach((panel,i)=>{panel.inert=i!==index;panel.setAttribute('aria-hidden',String(i!==index));});
  paint();if(scroll)align(animate);onChange();
 }
 function move(direction){
  if(!enabled||!active()||token!==request||count()<2)return;
  let target=index,page=items[index].current()+direction;
  if(page<0){target=(index-1+items.length)%items.length;page=items[target].count()-1;}
  else if(page>=items[index].count()){target=(index+1)%items.length;page=0;}
  items[target].go(page);select(target,true);
 }
 const events=new AbortController();
 const options={signal:events.signal},passive={...options,passive:true};
 // One gesture pages games before crossing to the next category. Vertical
 // scrolling and pinch zoom remain native; a completed swipe never opens a game.
 groups.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false){gesture=null;return;}
  if(!enabled||!active()||token!==request||event.button!==0||event.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  suppressClickUntil=0;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY};
 },passive);
 document.addEventListener('pointermove',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=Math.abs(event.clientX-gesture.x),dy=Math.abs(event.clientY-gesture.y);
  if(dy>16&&dy>dx)gesture=null;
 },passive);
 document.addEventListener('pointerup',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture=null;
  if(Math.abs(dx)<40||Math.abs(dx)<Math.abs(dy)*1.25)return;
  suppressClickUntil=Date.now()+500;move(dx<0?1:-1);
 },passive);
 document.addEventListener('pointercancel',()=>{gesture=null;},passive);
 groups.addEventListener('click',event=>{
  if(Date.now()>=suppressClickUntil)return;
  event.preventDefault();event.stopPropagation();suppressClickUntil=0;
 },{...options,capture:true});
 groups.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
  event.preventDefault();move(event.key==='ArrowRight'?1:-1);groups.focus({preventScroll:true});
 },options);
 let resizeFrame=0;
 const resize=new ResizeObserver(()=>{
  if(!active()||token!==request||width===groups.clientWidth)return;
  cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{
   if(active()&&token===request&&width!==groups.clientWidth)align();
  });
 });resize.observe(groups);
 onResize();paint();select(index,true);
 return {
  controls,count,move,update:paint,
  setEnabled(value){enabled=value;paint();},
  setAutomatic(value){position.setAttribute('aria-live',value?'off':'polite');},
  dispose(){cancelAnimationFrame(resizeFrame);events.abort();resize.disconnect();}
 };
}
  function leaders(token,fresh){
   const entries=Object.entries(games);if(!entries.length)return [];
   const section=el('section','','board-leaders');section.setAttribute('aria-label','게임순위');section.dataset.worldSwipe='off';
   const head=el('header','','board-rank-head'),heading=el('h3'),openHistory=button('게임순위',()=>{if(active()&&token===request)void showHistory(null,false,true);},'board-rank-history-open');
   openHistory.setAttribute('aria-label','월별 게임순위 보기');openHistory.append(Object.assign(el('span','›'),{ariaHidden:'true'}));heading.append(openHistory);head.append(heading,el('span','이번 달','board-rank-caption'));section.append(head);
   const groups=el('div','','board-rank-groups'),targets=new Set(),panels=new Map();section.append(groups);content.append(section);
   let timer=0,hover=false,touching=false,loaded=false,categories=null;
   const motion=matchMedia('(prefers-reduced-motion: reduce)'),events=new AbortController(),options={signal:events.signal};
   const automatic=()=>automaticOverride??!motion.matches;
   const hasNext=()=>panels.size>1||[...panels.values()].some(panel=>panel.count()>1);
   const autoplay=button('Ⅱ',()=>{automaticOverride=!automatic();paintAutomatic();schedule();},'board-rank-autoplay');
   autoplay.setAttribute('aria-label','자동 넘김');
   function paintAutomatic(){
    const running=automatic()&&hasNext();autoplay.hidden=!hasNext();autoplay.textContent=running?'Ⅱ':'▶';
    autoplay.setAttribute('aria-pressed',String(running));autoplay.title=running?'자동 넘김 일시정지':'자동 넘김 시작';categories?.setAutomatic(running);
   }
   function schedule(delay=5000){
    clearTimeout(timer);
    if(!loaded||!automatic()||!hasNext()||!active()||token!==request)return;
    timer=setTimeout(()=>{
     if(!active()||token!==request)return;
     const panel=panels.get(rankCategory),rect=panel?.node.getBoundingClientRect(),focus=document.activeElement;
     const reading=focus!==autoplay&&section.contains(focus)&&focus.matches(':focus-visible');
     if(!panel||document.hidden||hover||touching||reading||playing()||document.querySelector('dialog[open]')||!rect||rect.bottom<=0||rect.top>=innerHeight){schedule();return;}
     categories.move(1);
     schedule(motion.matches?5000:5280);
    },delay);
   }
   section.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hover=true;clearTimeout(timer);}},options);
   section.addEventListener('pointerleave',()=>{hover=false;schedule();},options);
   section.addEventListener('pointerdown',()=>{touching=true;clearTimeout(timer);},options);
   const releasePointer=()=>{if(touching){touching=false;schedule();}};
   document.addEventListener('pointerup',releasePointer,options);document.addEventListener('pointercancel',releasePointer,options);
   section.addEventListener('focusin',()=>schedule(),options);section.addEventListener('focusout',()=>schedule(),options);
   document.addEventListener('visibilitychange',()=>{clearTimeout(timer);touching=false;if(!document.hidden)schedule();},options);
   motion.addEventListener('change',()=>{paintAutomatic();schedule();},options);
   const records=new Map(entries.map(([id,game])=>[id,{game,record:null,status:'loading',target:null,opening:{busy:false,buttons:new Set()}}]));
   function paintTarget(id){
    const record=records.get(id),target=record.target;if(!target)return;paintRecord(target,id,record.game,record.record);
    if(record.status==='loading')target.nick.textContent='불러오는 중…';
    else if(record.status==='error')target.nick.replaceChildren(button('다시 불러오기',()=>record.reload(),'board-leader-retry'));
   }
   function rowFor(id){
    const record=records.get(id);
    if(!record.target){
     record.target=makeRow(id,record.game,token,true,record.opening);targets.add(record.target);paintTarget(id);
    }
    return record.target.row;
   }
   for(const group of groupedEntries(entries))panels.set(group.id,makeGroup(group));
   const fitting=fitRecords(targets,token),fitScores=fitting.fit;
   categories=rankingCarousel(groups,head,token,[...panels.values()],()=>{schedule();fitScores();},()=>{for(const panel of panels.values())panel.resize();paintAutomatic();schedule();fitScores();});
   categories.controls.prepend(autoplay);
   paintAutomatic();
   rankDispose=()=>{clearTimeout(timer);events.abort();categories.dispose();fitting.dispose();};
   function makeGroup(group){
    const panel=el('section','','board-rank-group');panel.dataset.rankGroup=group.id;panel.setAttribute('aria-label',group.name);
    const groupHead=el('header','','board-rank-group-head');groupHead.append(el('h4',group.name));panel.append(groupHead);
    const viewport=el('div','','board-rank-viewport'),track=el('div','','board-rank-track');viewport.append(track);const paper=el('div','','board-rank-paper');paper.append(viewport);panel.append(paper);groups.append(panel);
    const pages=[];
    if(!rankStates.has(group.id))rankStates.set(group.id,{page:0,focus:null});
    const state=rankStates.get(group.id);
    let index=state.page,columns=0,capacity=3,initialLoading=true,pendingAnchor=state.anchor||null;
    function paint(){
     state.page=index;track.style.transform=`translateX(-${index*100}%)`;
     state.anchor=pages[index]?.querySelector('[data-game]')?.dataset.game||null;
     panel.dataset.rankPage=String(index);
     pages.forEach((page,i)=>{page.inert=i!==index;page.setAttribute('aria-hidden',String(i!==index));});
     categories?.update();
    }
    function go(value){if(!active()||token!==request)return;index=(value+pages.length)%pages.length;paint();if(initialLoading)pendingAnchor=state.anchor;schedule(motion.matches?5000:5280);}
    function orderByRecords(){
     if(!active()||token!==request)return;
     const ordered=[...group.entries].sort(([a,ga],[b,gb])=>
      Number(gb.pinInRanking===true)-Number(ga.pinInRanking===true)||
      Number(!!records.get(b).target?.hasScore)-Number(!!records.get(a).target?.hasScore));
     pages.forEach((page,i)=>{
      // The last page contains only the remaining games, never earlier rows.
      const rows=ordered.slice(i*capacity,(i+1)*capacity).map(([id])=>rowFor(id));
      [...page.querySelectorAll('tbody')].forEach((body,column)=>{
       const selected=rows.slice(column*3,column*3+3);
       if(selected.length!==body.children.length||selected.some((row,j)=>body.children[j]!==row))body.replaceChildren(...selected);
      });
     });
    }
    function resize(){
     if(!active()||token!==request)return;
     const next=rankColumnCount(groups.clientWidth);if(next===columns)return;
     const anchor=(initialLoading&&pendingAnchor)||pages[index]?.querySelector('[data-game]')?.dataset.game||state.anchor;
     columns=next;capacity=columns*3;panel.dataset.rankColumns=String(columns);panel.dataset.rankCapacity=String(capacity);
     const count=Math.ceil(group.entries.length/capacity);
     pages.length=0;
     for(let i=0;i<count;i++){
      const tableCount=Math.ceil(Math.min(capacity,group.entries.length-i*capacity)/3);
      const page=el('div','','board-rank-page board-rank-page-columns');page.style.setProperty('--board-rank-columns',String(tableCount));
      for(let column=0;column<tableCount;column++)page.append(rankTable(`${group.name} 게임순위 ${i+1}쪽 ${column+1}열`).table);
      pages.push(page);
     }
     track.replaceChildren(...pages);orderByRecords();
     const anchorRow=records.get(anchor)?.target?.row,anchorIndex=anchorRow?pages.findIndex(page=>page.contains(anchorRow)):-1;
     index=anchorIndex>=0?anchorIndex:Math.max(0,Math.min(index,pages.length-1));
     if(initialLoading)pendingAnchor=anchor||null;
     paint();schedule();
    }
    resize();
    return {node:panel,count:()=>pages.length,current:()=>index,go,orderByRecords,resize,loaded(){
     initialLoading=false;orderByRecords();
     const focus=state.focus||pendingAnchor;
     if(focus&&records.has(focus)){
      const indexForGame=pages.findIndex(page=>page.contains(records.get(focus).target?.row));
      if(indexForGame>=0)index=indexForGame;
     }
     state.focus=null;pendingAnchor=null;paint();schedule();
    }};
   }
   // Fetch the visible games in one request instead of competing with the feed
   // for thirty separate HTTP/database connections.
   const batch=result(readLeaders(client,owner,entries.map(([id])=>id),fresh));
   const loads=entries.map(async([id])=>{
    const record=records.get(id);let loadVersion=0,loading=false;
    async function load(initial=false){
     if(loading||!active()||token!==request)return;
     loading=true;
     const version=++loadVersion,key=id;
     record.status='loading';paintTarget(id);
     try{
      const ranking=await (initial?batch:result(readLeaders(client,owner,[key],true)));
      if(!active()||token!==request||version!==loadVersion)return;
      record.record=ranking?.[key]||null;record.status='ready';paintTarget(id);
     }catch{if(active()&&token===request&&version===loadVersion){record.status='error';paintTarget(id);}}
     finally{loading=false;panels.get(rankGroupFor(id)).orderByRecords();fitScores();}
    }
    record.reload=()=>load();
    await load(true);
   });
   return [Promise.all(loads).then(()=>{
    if(!active()||token!==request)return;
    for(const panel of panels.values())panel.loaded();
    loaded=true;paintAutomatic();schedule();
   })];
  }

async function showHistory(month=null,fresh=false,focus=false){
 if(!client||!owner||!active()||(month!==null&&!validMonth(month)))return false;
 closeHelp(false);updateGames();rankDispose();view='history';historyMonth=month;const token=++request;
 observedMonth=rankingMonth();scheduleRollover();content.replaceChildren();status.textContent='';
 const entries=Object.entries(games),ids=entries.map(([id])=>id),targets=new Map();
 const section=el('section','','board-rank-history');section.setAttribute('aria-label','월별 게임순위');section.setAttribute('aria-busy','true');section.dataset.worldSwipe='off';
 const head=el('header','','board-rank-head'),close=button('돌아가기',back,'board-rank-back');close.setAttribute('aria-label','이번 달 순위로 돌아가기');
 const title=el('div','','board-rank-history-title'),helpButton=button('!',()=>openHelp(helpButton,token),'board-rank-help-button');
 helpButton.setAttribute('aria-label','게임별 순위 조건 보기');helpButton.setAttribute('aria-haspopup','dialog');helpButton.setAttribute('aria-expanded','false');helpButton.title='게임별 순위 조건';
 title.append(el('h3','월별 게임순위'),helpButton);head.append(title,close);section.append(head);
 const field=el('label','','board-rank-month-field'),select=el('select','','board-rank-month');select.setAttribute('aria-label','월 선택');field.append(el('span','월 선택'),select);section.append(field);
 const message=el('p','월별 순위를 불러오는 중…','board-rank-history-status');message.setAttribute('role','status');section.append(message);
 const groups=el('div','','board-rank-groups'),panels=[];let fitHistory=()=>{},categories=null;section.append(groups);
 for(const group of groupedEntries(entries)){
  const panel=el('section','','board-rank-group'),groupHead=el('header','','board-rank-group-head');
  panel.dataset.rankGroup=group.id;panel.setAttribute('aria-label',group.name);groupHead.append(el('h4',group.name));panel.append(groupHead);
  const page=el('div','','board-rank-page board-rank-history-table board-rank-page-columns'),reserve=el('table','','board-rank-history-reserve'),reserveBody=el('tbody');reserve.hidden=true;reserve.append(reserveBody);
  page.tabIndex=0;page.setAttribute('role','region');page.setAttribute('aria-label',group.name+' 게임별 월 1등 기록');
  panel.append(page,reserve);groups.append(panel);
  const rows=group.entries.map(([id,game])=>{const target=makeRow(id,game,token,false);targets.set(id,target);return target.row;});
  let index=0,columns=0,capacity=3,pageCount=1,tables=[],tableLabel=group.name+' 게임별 월 1등 기록';
  function paintPage(){
   const visible=rows.slice(index*capacity,(index+1)*capacity),selected=new Set(visible);
   const count=Math.ceil(visible.length/3);
   if(tables.length!==count){tables=Array.from({length:count},()=>rankTable(tableLabel,true));page.replaceChildren(...tables.map(({table})=>table));}
   page.style.setProperty('--board-rank-columns',String(count));
   for(const row of rows)row.hidden=!selected.has(row);
   tables.forEach(({body},column)=>body.replaceChildren(...visible.slice(column*3,column*3+3)));
   reserveBody.replaceChildren(...rows.filter(row=>row.hidden));
   panel.dataset.rankPage=String(index);categories?.update();fitHistory();
  }
  function go(value){if(!active()||token!==request||page.hidden)return;index=(value+pageCount)%pageCount;paintPage();}
  function resize(){
   if(!active()||token!==request)return;
   const next=rankColumnCount(groups.clientWidth);if(next===columns)return;
   const anchor=page.querySelector('[data-game]:not([hidden])');
   columns=next;capacity=columns*3;pageCount=Math.ceil(rows.length/capacity);panel.dataset.rankColumns=String(columns);panel.dataset.rankCapacity=String(capacity);
   const anchorIndex=anchor?rows.indexOf(anchor):-1;index=anchorIndex>=0?Math.floor(anchorIndex/capacity):Math.min(index,pageCount-1);
   paintPage();
  }
  resize();
  panels.push({node:panel,name:group.name,page,count:()=>pageCount,current:()=>index,go,resize,setMonth(month){tableLabel=monthName(month)+' '+group.name+' 게임별 1등';for(const {table} of tables)table.setAttribute('aria-label',tableLabel);}});
 }
 content.append(section);const fitting=fitRecords(targets,token);fitHistory=fitting.fit;
 categories=rankingCarousel(groups,head,token,panels,fitHistory,()=>{for(const panel of panels)panel.resize();fitHistory();});rankDispose=()=>{categories.dispose();fitting.dispose();};
 function setMonths(info,selected){
  const current=validMonth(info?.currentMonth)?info.currentMonth:rankingMonth();
  const months=[...new Set([current,selected,...(Array.isArray(info?.months)?info.months.map(item=>item.month):[])].filter(validMonth))].sort().reverse();
  select.replaceChildren(...months.map(value=>{const option=el('option',monthName(value)+(value===current?' · 진행 중':''));option.value=value;return option;}));select.value=selected;
 }
 setMonths(historyInfo,month||historyInfo?.currentMonth||rankingMonth());
 select.onchange=()=>{
  if(!active()||token!==request)return;
  const current=historyInfo?.currentMonth||rankingMonth(),next=select.value===current?null:select.value;
  if(next!==historyMonth)void showHistory(next,false,true);
 };
 if(focus)select.focus({preventScroll:true});
 try{
  const data=await result(readHistory(client,owner,ids,month,fresh));
  if(!active()||token!==request)return false;
  if(!validMonth(data.month)||!validMonth(data.currentMonth)||!data.leaders||!Array.isArray(data.months))throw Error('invalid_history');
  historyInfo=data;if(historyMonth!==null)historyMonth=data.month;
  setMonths(data,data.month);if(data.pending===true)throw Error('history_pending');
  for(const panel of panels)panel.setMonth(data.month);
  for(const [id,game] of entries)paintRecord(targets.get(id),id,game,data.leaders[id],data.closed?monthName(data.month):'이번 달');
  const hasRecords=[...targets.values()].some(target=>target.hasScore);
  message.textContent=hasRecords?'':data.closed?'이 달에는 등록된 기록이 없어요.':'이번 달에는 아직 등록된 기록이 없어요.';
  shareCurrentLeaders(client,owner,ids,data);fitting.fit();return true;
 }catch(error){
  if(!active()||token!==request)return false;
  for(const panel of panels)panel.page.hidden=true;
  categories.setEnabled(false);
  message.replaceChildren(el('span',error?.message==='history_pending'?'이 달의 순위를 보관하고 있어요. 잠시 후 다시 불러와 주세요. ':'월별 순위를 불러오지 못했어요. '));
  const retry=button('다시 불러오기',()=>{if(active()&&token===request&&!retry.disabled){retry.disabled=true;void showHistory(historyMonth,true,true);}},'board-leader-retry');message.append(retry);return false;
 }finally{if(active()&&token===request)section.setAttribute('aria-busy','false');}
}
function back(){
 if(!active())return false;
 if(closeHelp())return true;
 if(view!=='history')return false;
 void home();content.querySelector('.board-rank-history-open')?.focus({preventScroll:true});return true;
}
function refreshView(fresh=false){return view==='history'?showHistory(historyMonth,fresh):home(fresh);}
function scheduleRollover(){
 clearTimeout(rolloverTimer);if(!client||!owner||!active())return;
 rolloverTimer=setTimeout(()=>{if(!document.hidden)checkRollover();},Math.max(1,Math.min(2147483647,nextReset(observedMonth)-Date.now())));
}
function checkRollover(){
 if(!active()||document.hidden)return;
 const month=rankingMonth();
 if(month!==observedMonth){observedMonth=month;void refreshView(true);}
 scheduleRollover();
}
async function home(fresh=false){if(!client||!owner||!active())return false;closeHelp(false);updateGames();rankDispose();view='home';observedMonth=rankingMonth();scheduleRollover();const token=++request;content.replaceChildren();status.textContent='';await Promise.all(leaders(token,fresh));return active()&&token===request;}
let gameplayObserver=null;
dispose=()=>{alive=false;request++;closeHelp(false);rankDispose();releaseAccess?.();clearTimeout(rolloverTimer);lifecycle.abort();gameplayObserver?.disconnect();};
controller={refresh:()=>refreshView(true),back,isHistoryOpen:()=>active()&&view==='history',syncCatalog:viewer=>viewer===owner?syncCatalog():Promise.resolve(false)};
if(!client||!owner){const empty=el('div','','board-rank-empty'),art=el('img');art.src='/assets/design/games/stacker.svg';art.alt='';const copy=el('div');copy.append(el('h3','이번 달 게임순위'),el('p','로그인하면 게임 순위를 볼 수 있어요. 나의 기록으로 함께 도전해 보세요.'),Object.assign(el('a','로그인하고 참여하기','btn'),{href:'/?auth=login&next=world'}));empty.append(art,copy);content.append(empty);return;}
const playing=()=>document.body.classList.contains('gaming')||document.body.classList.contains('matgo-open');
let gaming=playing();
window.addEventListener('ojjuda:game-record-saved',event=>{
 if(event.detail?.owner!==owner||!active())return;
 if(games[event.detail?.game]){
  const id=rankGroupFor(event.detail.game);
  rankCategory=id;
  if(!rankStates.has(id))rankStates.set(id,{page:0,focus:null});
  rankStates.get(id).focus=event.detail.game;
 }
 invalidate(client,owner);if(!playing())void refreshView(true);
},lifecycleOptions);
gameplayObserver=new MutationObserver(()=>{const next=playing();if(gaming&&!next&&active())void refreshView(true);gaming=next;});
gameplayObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',checkRollover,lifecycleOptions);
window.addEventListener('focus',checkRollover,lifecycleOptions);window.addEventListener('pageshow',checkRollover,lifecycleOptions);
void home();
  const matgoAccess=window.OjjudaMatgoAccess;
  // Existing access checks notify revocation immediately. Successful checks
  // sync through the World refresh hook; unchanged catalogs need no new read.
  if(typeof getGames==='function'&&typeof matgoAccess?.subscribe==='function')releaseAccess=matgoAccess.subscribe(()=>{void syncCatalog();});
  if((!games.matgo||!games.poker||!games.roulette||!games.photo_ttang)&&typeof matgoAccess?.check==='function'){
   void matgoAccess.check().then(member=>{
    if(!active()||member?.userId!==owner||!matgoAccess.visible())return;
    if(typeof getGames==='function'){void syncCatalog();return;}
    games={...games,matgo:{name:'맞고',unit:'G',rankingBasis:'best_round_gain'},poker:{name:'세븐포커',unit:'G',rankingBasis:'best_round_gain'},roulette:{name:'룰렛',unit:'G',rankingBasis:'best_round_gain'},photo_ttang:{name:'포토땅따먹기',unit:'장',rankingBasis:'photo_clears'}};
    void home();
   }).catch(()=>{});
  }
}
window.OjjudaGameRankings={mount,back:()=>controller?.back()??false,isHistoryOpen:()=>controller?.isHistoryOpen()??false,refresh:()=>controller?.refresh()??Promise.resolve(false),syncCatalog:owner=>controller?.syncCatalog(owner)??Promise.resolve(false)};
})();
