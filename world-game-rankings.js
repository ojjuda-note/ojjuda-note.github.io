/* Arcade monthly rankings. Uses the current viewer session. */
(()=>{'use strict';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=action;return n;};
let dispose=null,controller=null;
// Shell redraws should share the same read. Explicit refreshes and saved game
// results bypass this short-lived cache; data never crosses account/client scope.
let rankingScope=null;
function scopeFor(client,owner){
 if(!client||!owner){rankingScope=null;return null;}
 if(rankingScope?.client!==client||rankingScope.owner!==owner)rankingScope={client,owner,reads:new Map()};
 return rankingScope;
}
function invalidate(client,owner){if(rankingScope?.client===client&&rankingScope.owner===owner)rankingScope.reads.clear();}
function readLeaders(client,owner,ids,fresh=false){
 const scope=scopeFor(client,owner),now=Date.now();
 const month=new Date(now+9*60*60*1000).toISOString().slice(0,7);
 const key=JSON.stringify([month,[...ids].sort()]);
 if(fresh)scope.reads.clear();
 const cached=scope.reads.get(key);
 if(cached?.promise)return cached.promise;
 if(cached&&now-cached.at<15000)return Promise.resolve(cached.response);
 for(const [oldKey,entry] of scope.reads)if(!entry.promise&&now-entry.at>=15000)scope.reads.delete(oldKey);
 const entry={promise:null,response:null,at:0};scope.reads.set(key,entry);
 entry.promise=Promise.resolve().then(()=>client.rpc('community_game_monthly_leaders',{p_games:ids})).then(response=>{
  if(response.error)throw response.error;
  if(rankingScope===scope&&scope.reads.get(key)===entry){entry.response=response;entry.at=Date.now();entry.promise=null;}
  return response;
 }).catch(error=>{
  if(scope.reads.get(key)===entry)scope.reads.delete(key);
  throw error;
 });
 return entry.promise;
}
function mount(host,{client,owner,games={},onOpenGame=null,authorized=()=>true}={}){
dispose?.();dispose=null;controller=null;scopeFor(client,owner);if(!host)return;
let rankDispose=()=>{},rankPage=0,rankFocusGame=null,alive=true,request=0;
const active=()=>alive&&host.isConnected&&authorized();
const status=el('p','','board-status');status.setAttribute('role','status');
const content=el('div');host.replaceChildren(status,content);
async function result(query){const {data,error}=await query;if(error)throw error;if(!active())throw Error('stale');return data||[];}
  function leaders(token,fresh){
   const entries=Object.entries(games);if(!entries.length)return [];
   const section=el('section','','board-leaders');section.setAttribute('aria-label','게임순위');section.dataset.worldSwipe='off';
   const head=el('header','','board-rank-head');head.append(el('h3','게임순위'),el('span','이번 달','board-rank-caption'));section.append(head);
   const viewport=el('div','','board-rank-viewport'),track=el('div','','board-rank-track');viewport.append(track);const paper=el('div','','board-rank-paper');paper.append(viewport);section.append(paper);
   const pages=[],targets=new Map();
   for(let start=0;start<entries.length;start+=3){
    const page=el('div','','board-rank-page'),table=el('table'),thead=el('thead'),tr=el('tr'),tbody=el('tbody');
    table.setAttribute('aria-label',`게임순위 ${pages.length+1}쪽`);
    for(const title of ['게임','닉네임','기록']){const th=el('th',title);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead,tbody);page.append(table);track.append(page);pages.push(page);
    for(const [id,game] of entries.slice(start,start+3)){
     const row=el('tr','','board-leader');row.dataset.game=id;
     const name=el('th',game.name,'board-leader-game');name.scope='row';name.title=game.name+(game.rankingBasis==='stage_time'?' · 최고 완료 단계 → 가장 짧은 완료 시간 → 먼저 달성한 순':game.rankingBasis==='opponents_streak'?' · 이긴 상대 수 → 연승 → 먼저 달성한 순':game.rankingBasis==='picture_clears'?' · 이번 달 완료한 그림 장수':game.rankingBasis==='best_round_gain'?' · 이번 달 한 판 최대 획득 골드':game.rankingBasis==='difficulty_streak'?' · 회원대결, 어려움, 보통, 쉬움 순 · 같은 난이도는 연승순':game.rankingBasis==='difficulty_time'?' · 난이도 → 완료 시간 → 먼저 달성한 순':game.rankingBasis==='current_streak'?' · 이번 달 연승 기준':'');
     const labelGame=target=>{if(game.difficultyName)target.replaceChildren(el('span',game.baseName,'board-game-name'),el('small',game.difficultyName,'board-game-difficulty'));};labelGame(name);
     if(typeof onOpenGame==='function'){
      const play=button(game.name,async()=>{
       if(!active()||token!==request||play.disabled)return;
       play.disabled=true;status.textContent='';
       try{await onOpenGame(id);}catch{if(active()&&token===request)status.textContent='게임을 열지 못했어요. 다시 눌러 주세요.';}
       finally{play.disabled=false;}
      },'board-game-open');
      play.setAttribute('aria-label',game.name+' 게임 열기');labelGame(play);name.replaceChildren(play);
     }
     const nick=el('td','불러오는 중…','board-leader-nick'),score=el('td','—','board-leader-score');row.append(name,nick,score);tbody.append(row);targets.set(id,{row,name,nick,score,hasScore:false});
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
   const playing=()=>document.body.classList.contains('gaming')||document.body.classList.contains('matgo-open');
   let gaming=playing();
   window.addEventListener('ojjuda:game-record-saved',event=>{
    if(event.detail?.owner!==owner||!active()||token!==request)return;
    if(targets.has(event.detail?.game))rankFocusGame=event.detail.game;
    invalidate(client,owner);
    if(!playing())void home(true);
   },options);
   const observer=new MutationObserver(()=>{
    const next=playing();
    if(gaming&&!next&&active()&&token===request)void home(true);
    gaming=next;
   });
   observer.observe(document.body,{attributes:true,attributeFilter:['class']});
   let fitFrame=0;
   function fitScores(){
    cancelAnimationFrame(fitFrame);
    fitFrame=requestAnimationFrame(()=>{
     if(!active()||token!==request)return;
     for(const {score} of targets.values()){
      const text=score.querySelector('.board-score-value');if(!text)continue;
      const style=getComputedStyle(score),width=score.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
      if(width<=0)continue;
      text.style.fontSize='16px';text.style.whiteSpace='nowrap';
      const natural=text.scrollWidth;
      const size=Math.max(11,Math.min(16,16*(width-1)/Math.max(1,natural)));
      text.style.fontSize=size+'px';
      if(natural*size/16>width-1)text.style.whiteSpace='normal';
     }
    });
   }
   const resize=new ResizeObserver(fitScores);resize.observe(viewport);
   document.fonts?.ready.then(fitScores);
   rankDispose=()=>{clearTimeout(timer);cancelAnimationFrame(fitFrame);resize.disconnect();controller.abort();observer.disconnect();};paint();schedule();
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
      const valid=row=>row&&row.score!==null&&row.score!==''&&Number.isFinite(Number(row.score));
      const top=ranking?.[key]||null;
      target.hasScore=!!valid(top);
      if(target.hasScore){
       nick.textContent=top.nick||'익명';
       nick.title=(game.rankingBasis==='picture_clears'?'이번 달 완료 장수 1등 · ':game.rankingBasis==='best_round_gain'?'이번 달 한 판 최대 획득 골드 1등 · ':['current_streak','difficulty_streak','opponents_streak'].includes(game.rankingBasis)?'이번 달 연승 1등 · ':'이번 달 1등 · ')+(top.nick||'익명');
       let value=Number(top.score).toLocaleString('ko-KR')+game.unit,detail='';
       if(game.rankingBasis==='stage_time'){
        value=window.OjjudaSacheonseongRanking.format(Number(top.score));
        const stage=Number(top.stage);if(window.OjjudaSacheonseongRanking.game(stage))detail=stage+'단계 · '+(4*stage*stage)+'개';
       }else if(game.rankingBasis==='difficulty_time'){
        const record=window.OjjudaMinesRules?.record(Number(top.score));
        value=record?.time||'—';detail=record?.name||'';
       }else if(game.rankingBasis==='opponents_streak'){
        const n=Number(top.opponents);if(Number.isInteger(n)&&n>=1&&n<=11)detail=n+'명 상대';
       }else if(game.rankingBasis==='difficulty_streak'){
        const level={online:'회원대결',hard:'어려움',normal:'보통',easy:'쉬움'}[top.difficulty]||'';
        const variant=id==='billiards'?{carom4:'4구',carom3:'3쿠션',pool8:'포켓볼'}[top.variant]:'';
        detail=[variant,level].filter(Boolean).join(' · ');
       }
       if(detail){const label=target.name.querySelector('button')||target.name;label.replaceChildren(el('span',game.name,'board-game-name'),el('small',detail,'board-game-difficulty'));}
       score.replaceChildren(el('span',value,'board-score-value'));score.title=score.textContent;
      }else{
       score.textContent='—';score.removeAttribute('title');nick.removeAttribute('title');
       nick.replaceChildren(el('span','이번 달 기록 없음','board-leader-empty'));
      }
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

async function home(fresh=false){if(!client||!owner||!active())return false;rankDispose();const token=++request;content.replaceChildren();status.textContent='';await Promise.all(leaders(token,fresh));return active()&&token===request;}
dispose=()=>{rankDispose();alive=false;request++;};
controller={refresh:()=>home(true)};
if(!client||!owner){const empty=el('div','','board-rank-empty'),art=el('img');art.src='/assets/design/games/stacker.svg';art.alt='';const copy=el('div');copy.append(el('h3','이번 달 게임순위'),el('p','로그인하면 게임 순위를 볼 수 있어요. 나의 기록으로 함께 도전해 보세요.'),Object.assign(el('a','로그인하고 참여하기','btn'),{href:'/?auth=login&next=world'}));empty.append(art,copy);content.append(empty);return;}
void home();
  const matgoAccess=window.OjjudaMatgoAccess;
  if((!games.matgo||!games.poker||!games.photo_ttang)&&typeof matgoAccess?.check==='function'){
   void matgoAccess.check().then(member=>{
    if(!active()||member?.userId!==owner||!matgoAccess.visible())return;
    games={...games,matgo:{name:'맞고',unit:'G',rankingBasis:'best_round_gain'},poker:{name:'세븐포커',unit:'G',rankingBasis:'best_round_gain'},photo_ttang:{name:'포토땅따먹기',unit:'장',rankingBasis:'photo_clears'}};
    void home();
   }).catch(()=>{});
  }
}
window.OjjudaGameRankings={mount,back:()=>false,refresh:()=>controller?.refresh()??Promise.resolve(false)};
})();
