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
let rankDispose=()=>{},releaseAccess=null,rankPage=0,rankFocusGame=null,alive=true,request=0,catalogKey=null;
let view='home',historyMonth=null,historyInfo=null,observedMonth=rankingMonth(),rolloverTimer=0;
const lifecycle=new AbortController(),lifecycleOptions={signal:lifecycle.signal};
const active=()=>alive&&host.isConnected&&authorized();
function updateGames(){
 const next=typeof getGames==='function'?getGames():games;
 const key=JSON.stringify(Object.entries(next).map(([id,game])=>[id,game.name,game.unit,game.rankingBasis,game.baseName,game.difficultyName]));
 const changed=key!==catalogKey;games=next;catalogKey=key;return changed;
}
async function syncCatalog(){
 if(!client||!owner||!active()||!updateGames())return false;
 return refreshView();
}
const status=el('p','','board-status');status.setAttribute('role','status');
const content=el('div');host.replaceChildren(status,content);
async function result(query){const {data,error}=await query;if(error)throw error;if(!active())throw Error('stale');return data||[];}
function labelGame(target,game,detail=''){
 if(detail)target.replaceChildren(el('span',game.name,'board-game-name'),el('small',detail,'board-game-difficulty'));
 else if(game.difficultyName)target.replaceChildren(el('span',game.baseName,'board-game-name'),el('small',game.difficultyName,'board-game-difficulty'));
 else target.textContent=game.name;
}
function makeRow(id,game,token,playable=true){
 const row=el('tr','','board-leader');row.dataset.game=id;
 const period=playable?'이번 달':'해당 월';
 const name=el('th','','board-leader-game');name.scope='row';name.title=game.name+(game.rankingBasis==='stage_time'?' · 최고 완료 단계 → 가장 짧은 완료 시간 → 먼저 달성한 순':game.rankingBasis==='opponents_streak'?' · 이긴 상대 수 → 연승 → 먼저 달성한 순':['picture_clears','photo_clears'].includes(game.rankingBasis)?' · '+period+' 완료한 그림 장수':game.rankingBasis==='best_round_gain'?' · '+period+' 한 판 최대 획득 골드':game.rankingBasis==='difficulty_streak'?' · 회원대결, 어려움, 보통, 쉬움 순 · 같은 난이도는 연승순':game.rankingBasis==='difficulty_time'?' · 난이도 → 완료 시간 → 먼저 달성한 순':game.rankingBasis==='current_streak'?' · '+period+' 연승 기준':'');
 labelGame(name,game);
 if(playable&&typeof onOpenGame==='function'){
  const play=button(game.name,async()=>{
   if(!active()||token!==request||play.disabled)return;
   play.disabled=true;status.textContent='';
   try{await onOpenGame(id);}catch{if(active()&&token===request)status.textContent='게임을 열지 못했어요. 다시 눌러 주세요.';}
   finally{play.disabled=false;}
  },'board-game-open');
  play.setAttribute('aria-label',game.name+' 게임 열기');labelGame(play,game);name.replaceChildren(play);
 }
 const nick=el('td','불러오는 중…','board-leader-nick'),score=el('td','—','board-leader-score');row.append(name,nick,score);
 return {row,name,nick,score,hasScore:false};
}
function paintRecord(target,id,game,top,period='이번 달'){
 const {name,nick,score}=target;
 target.hasScore=!!(top&&top.score!==null&&top.score!==''&&Number.isFinite(Number(top.score)));
 labelGame(name.querySelector('button')||name,game);
 if(!target.hasScore){
  score.textContent='—';score.removeAttribute('title');nick.removeAttribute('title');
  nick.replaceChildren(el('span',period==='이번 달'?'이번 달 기록 없음':'기록 없음','board-leader-empty'));return;
 }
 nick.textContent=top.nick||'익명';
 nick.title=period+(['picture_clears','photo_clears'].includes(game.rankingBasis)?' 완료 장수 1등 · ':game.rankingBasis==='best_round_gain'?' 한 판 최대 획득 골드 1등 · ':['current_streak','difficulty_streak','opponents_streak'].includes(game.rankingBasis)?' 연승 1등 · ':' 1등 · ')+(top.nick||'익명');
 let value=Number(top.score).toLocaleString('ko-KR')+game.unit,detail='';
 if(game.rankingBasis==='stage_time'){
  value=window.OjjudaSacheonseongRanking.format(Number(top.score));
  const stage=Number(top.stage);if(window.OjjudaSacheonseongRanking.game(stage))detail=stage+'단계 · '+(4*stage*stage)+'개';
 }else if(game.rankingBasis==='difficulty_time'){
  const record=window.OjjudaMinesRules?.record(Number(top.score));value=record?.time||'—';detail=record?.name||'';
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
  function leaders(token,fresh){
   const entries=Object.entries(games);if(!entries.length)return [];
   const section=el('section','','board-leaders');section.setAttribute('aria-label','게임순위');section.dataset.worldSwipe='off';
   const head=el('header','','board-rank-head'),heading=el('h3'),openHistory=button('게임순위',()=>{if(active()&&token===request)void showHistory(null,false,true);},'board-rank-history-open');
   openHistory.setAttribute('aria-label','월별 게임순위 보기');openHistory.append(Object.assign(el('span','›'),{ariaHidden:'true'}));heading.append(openHistory);head.append(heading,el('span','이번 달','board-rank-caption'));section.append(head);
   const viewport=el('div','','board-rank-viewport'),track=el('div','','board-rank-track');viewport.append(track);const paper=el('div','','board-rank-paper');paper.append(viewport);section.append(paper);
   section.append(el('p','중간 퇴장으로 컴퓨터가 대신한 사용자의 그 판 기록은 순위·연승에서 제외돼요.','note board-rank-rule'));
   const pages=[],targets=new Map();
   for(let start=0;start<entries.length;start+=3){
    const page=el('div','','board-rank-page'),table=el('table'),thead=el('thead'),tr=el('tr'),tbody=el('tbody');
    table.setAttribute('aria-label',`게임순위 ${pages.length+1}쪽`);
    for(const title of ['게임','닉네임','기록']){const th=el('th',title);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead,tbody);page.append(table);track.append(page);pages.push(page);
    for(const [id,game] of entries.slice(start,start+3)){
     const target=makeRow(id,game,token);tbody.append(target.row);targets.set(id,target);
    }
   }
   let index=Math.min(rankPage,pages.length-1),timer=0,hover=false,touch=null,dragging=false,initialLoading=true;
   const controls=el('div','','board-rank-controls'),position=el('span','','board-rank-position');position.setAttribute('aria-live','off');
   const prev=button('‹',()=>go(index-1)),next=button('›',()=>go(index+1));prev.setAttribute('aria-label','이전 게임 순위');next.setAttribute('aria-label','다음 게임 순위');controls.append(prev,position,next);if(pages.length>1)head.append(controls);
   const motion=matchMedia('(prefers-reduced-motion: reduce)');let paused=motion.matches;
   content.append(section);
   function paint(){
    position.textContent=(index+1)+' / '+pages.length;rankPage=index;track.style.transform=`translateX(-${index*100}%)`;
    section.dataset.rankPage=String(index);
    pages.forEach((page,i)=>{page.inert=i!==index;page.setAttribute('aria-hidden',String(i!==index));});
   }
   function schedule(delay=5000){
    clearTimeout(timer);if(initialLoading||paused||pages.length<2||!active()||!section.isConnected)return;
    timer=setTimeout(()=>{const rect=section.getBoundingClientRect();if(document.hidden||hover||dragging||section.contains(document.activeElement)||rect.bottom<=0||rect.top>=innerHeight){schedule();return;}go(index+1);},delay);
   }
   function go(value){index=(value+pages.length)%pages.length;track.style.transform=`translateX(-${index*100}%)`;paint();schedule(motion.matches?5000:5280);}
   const controller=new AbortController(),options={signal:controller.signal};
   section.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')hover=true;},options);
   section.addEventListener('pointerleave',()=>{hover=false;},options);
   viewport.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;touch={x:e.clientX,y:e.clientY};dragging=true;viewport.setPointerCapture(e.pointerId);},options);
   viewport.addEventListener('pointerup',e=>{if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;dragging=false;if(Math.abs(dx)>35&&Math.abs(dx)>Math.abs(dy)*1.3)go(index+(dx<0?1:-1));else schedule();},options);
   viewport.addEventListener('pointercancel',()=>{touch=null;dragging=false;schedule();},options);
   section.addEventListener('focusout',()=>schedule(),options);
   document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)schedule();},options);
   motion.addEventListener('change',()=>{paused=motion.matches;paint();schedule();},options);
   const fitting=fitRecords(targets,token),fitScores=fitting.fit;
   rankDispose=()=>{clearTimeout(timer);fitting.dispose();controller.abort();};paint();schedule();
   function orderByRecords(){
    if(!active()||token!==request)return;
    const ordered=[...entries].sort(([a],[b])=>Number(targets.get(b).hasScore)-Number(targets.get(a).hasScore));
    pages.forEach((page,i)=>{
     const body=page.querySelector('tbody'),rows=ordered.slice(i*3,i*3+3).map(([id])=>targets.get(id).row);
     if(rows.some((row,j)=>body.children[j]!==row))body.replaceChildren(...rows);
    });
   }
   // Fetch the visible games in one request instead of competing with the feed
   // for thirty separate HTTP/database connections.
   const batch=result(readLeaders(client,owner,entries.map(([id])=>id),fresh));
   const loads=entries.map(async([id,game])=>{
    const target=targets.get(id),{nick,score}=target;let loadVersion=0;
    async function load(initial=false){
     const version=++loadVersion,key=id;
     nick.textContent='불러오는 중…';
     try{
      const ranking=await (initial?batch:result(readLeaders(client,owner,[key],true)));
      if(!active()||token!==request||version!==loadVersion)return;
      paintRecord(target,id,game,ranking?.[key]||null);
     }catch{if(active()&&token===request&&version===loadVersion)nick.replaceChildren(button('다시 불러오기',()=>load(),'board-leader-retry'));}
     finally{orderByRecords();fitScores();}
    }
    target.reload=()=>load();
    await load(true);
   });
   return [Promise.all(loads).then(()=>{
    if(!active()||token!==request)return;
    initialLoading=false;orderByRecords();
    if(rankFocusGame&&targets.has(rankFocusGame)){
     const row=targets.get(rankFocusGame).row;
     index=pages.findIndex(page=>page.contains(row));rankFocusGame=null;paint();
    }
    schedule();
   })];
  }

async function showHistory(month=null,fresh=false,focus=false){
 if(!client||!owner||!active()||(month!==null&&!validMonth(month)))return false;
 updateGames();rankDispose();view='history';historyMonth=month;const token=++request;
 observedMonth=rankingMonth();scheduleRollover();content.replaceChildren();status.textContent='';
 const entries=Object.entries(games),ids=entries.map(([id])=>id),targets=new Map();
 const section=el('section','','board-rank-history');section.setAttribute('aria-label','월별 게임순위');section.setAttribute('aria-busy','true');section.dataset.worldSwipe='off';
 const head=el('header','','board-rank-head'),close=button('돌아가기',back,'board-rank-back');close.setAttribute('aria-label','이번 달 순위로 돌아가기');
 head.append(el('h3','월별 게임순위'),close);section.append(head,el('p','매월 1일 오전 1시 갱신 · 한국시간','board-rank-reset'));
 const field=el('label','','board-rank-month-field'),select=el('select','','board-rank-month');select.setAttribute('aria-label','월 선택');field.append(el('span','월 선택'),select);section.append(field);
 const message=el('p','월별 순위를 불러오는 중…','board-rank-history-status');message.setAttribute('role','status');section.append(message);
 const page=el('div','','board-rank-page board-rank-history-table'),table=el('table'),thead=el('thead'),tr=el('tr'),tbody=el('tbody');
 page.tabIndex=0;page.setAttribute('role','region');page.setAttribute('aria-label','게임별 월 1등 기록');
 for(const title of ['게임','1등 닉네임','기록']){const th=el('th',title);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead,tbody);page.append(table);section.append(page);
 for(const [id,game] of entries){const target=makeRow(id,game,token,false);targets.set(id,target);tbody.append(target.row);}
 section.append(el('p','중간 퇴장으로 컴퓨터가 대신한 사용자의 그 판 기록은 순위·연승에서 제외돼요.','note board-rank-rule'));
 content.append(section);const fitting=fitRecords(targets,token);rankDispose=fitting.dispose;
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
  table.setAttribute('aria-label',monthName(data.month)+' 게임별 1등');
  for(const [id,game] of entries)paintRecord(targets.get(id),id,game,data.leaders[id],data.closed?monthName(data.month):'이번 달');
  const hasRecords=[...targets.values()].some(target=>target.hasScore);
  message.textContent=hasRecords?'':data.closed?'이 달에는 등록된 기록이 없어요.':'이번 달에는 아직 등록된 기록이 없어요.';
  shareCurrentLeaders(client,owner,ids,data);fitting.fit();return true;
 }catch(error){
  if(!active()||token!==request)return false;
  page.hidden=true;message.replaceChildren(el('span',error?.message==='history_pending'?'이 달의 순위를 보관하고 있어요. 잠시 후 다시 불러와 주세요. ':'월별 순위를 불러오지 못했어요. '));
  const retry=button('다시 불러오기',()=>{if(active()&&token===request&&!retry.disabled){retry.disabled=true;void showHistory(historyMonth,true,true);}},'board-leader-retry');message.append(retry);return false;
 }finally{if(active()&&token===request)section.setAttribute('aria-busy','false');}
}
function back(){
 if(!active()||view!=='history')return false;
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
async function home(fresh=false){if(!client||!owner||!active())return false;updateGames();rankDispose();view='home';observedMonth=rankingMonth();scheduleRollover();const token=++request;content.replaceChildren();status.textContent='';await Promise.all(leaders(token,fresh));return active()&&token===request;}
let gameplayObserver=null;
dispose=()=>{alive=false;request++;rankDispose();releaseAccess?.();clearTimeout(rolloverTimer);lifecycle.abort();gameplayObserver?.disconnect();};
controller={refresh:()=>refreshView(true),back,isHistoryOpen:()=>active()&&view==='history',syncCatalog:viewer=>viewer===owner?syncCatalog():Promise.resolve(false)};
if(!client||!owner){const empty=el('div','','board-rank-empty'),art=el('img');art.src='/assets/design/games/stacker.svg';art.alt='';const copy=el('div');copy.append(el('h3','이번 달 게임순위'),el('p','로그인하면 게임 순위를 볼 수 있어요. 나의 기록으로 함께 도전해 보세요.'),Object.assign(el('a','로그인하고 참여하기','btn'),{href:'/?auth=login&next=world'}));empty.append(art,copy);content.append(empty);return;}
const playing=()=>document.body.classList.contains('gaming')||document.body.classList.contains('matgo-open');
let gaming=playing();
window.addEventListener('ojjuda:game-record-saved',event=>{
 if(event.detail?.owner!==owner||!active())return;
 if(games[event.detail?.game])rankFocusGame=event.detail.game;
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
  if((!games.matgo||!games.poker||!games.photo_ttang)&&typeof matgoAccess?.check==='function'){
   void matgoAccess.check().then(member=>{
    if(!active()||member?.userId!==owner||!matgoAccess.visible())return;
    if(typeof getGames==='function'){void syncCatalog();return;}
    games={...games,matgo:{name:'맞고',unit:'G',rankingBasis:'best_round_gain'},poker:{name:'세븐포커',unit:'G',rankingBasis:'best_round_gain'},photo_ttang:{name:'포토땅따먹기',unit:'장',rankingBasis:'photo_clears'}};
    void home();
   }).catch(()=>{});
  }
}
window.OjjudaGameRankings={mount,back:()=>controller?.back()??false,isHistoryOpen:()=>controller?.isHistoryOpen()??false,refresh:()=>controller?.refresh()??Promise.resolve(false),syncCatalog:owner=>controller?.syncCatalog(owner)??Promise.resolve(false)};
})();
