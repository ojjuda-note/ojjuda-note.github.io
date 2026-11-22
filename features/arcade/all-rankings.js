/* All monthly arcade leaders in a single readable page (no carousel). */
(()=>{
 'use strict';
 const GROUPS=[
  {id:'solo',title:'혼자하는 플레이',games:[
   ['solitaire','솔리테어','초'],['sacheonseong','사천성','초'],['mines','지뢰찾기','초'],
   ['saetbyeol','샛별키우기','점'],['mole','두더지잡기','점'],['runner','쭈 달리기','점'],
   ['stacker','탑쌓기','층'],['breakout','벽돌깨기','점'],['screw_box','나사풀기 · 박스','점'],
   ['screw_flat','나사풀기 · 평면','점'],['spot','틀린그림찾기','장'],['archery','바람의 궁수','점'],
   ['chacha_rush','차차 러시!','점']
  ]},
  {id:'multi',title:'함께하는 플레이',games:[
   ['onecard','원카드','연승'],['bang','뱅','연승'],['tank','탱크게임','연승'],
   ['tour','마블','연승'],['yut','윷놀이','연승'],['ttang','월드땅따먹기','연승'],
   ['janggi','장기','연승'],['chess','체스','연승'],['billiards','당구','연승']
  ]},
  {id:'adult',title:'어른들 플레이',games:[
   ['matgo','맞고','G'],['poker','세븐포커','G'],['roulette','룰렛','G'],['photo_ttang','포토땅따먹기','장']
  ]}
 ];
 const PUBLIC_GAMES=new Set(GROUPS[0].games.map(game=>game[0]));
 const GAME_LIST=GROUPS.flatMap(group=>group.games.map(game=>({id:game[0],name:game[1],unit:game[2],group:group.id})));
 const $=selector=>document.querySelector(selector);
 const container=$('#all-rankings-groups'),status=$('#all-rankings-status'),month=$('#all-rankings-month'),refreshButton=$('#all-rankings-refresh');
 if(!container||!status||!month||!refreshButton)return;
 const rows=new Map();let client=null,requestId=0,lastActor=undefined,authListener=null,shownMonth=null;
 const make=(tag,text,className)=>{
  const element=document.createElement(tag);
  if(text!=null)element.textContent=text;
  if(className)element.className=className;
  return element;
 };
 function renderRows(){
  const fragment=document.createDocumentFragment();
  for(const group of GROUPS){
   const section=make('section',null,'rank-section');section.dataset.group=group.id;
   const heading=make('header',null,'rank-section-head');
   heading.append(make('h3',group.title),make('span',group.games.length+'개 게임'));
   const list=make('div',null,'rank-list');
   for(const [id,name] of group.games){
    const link=make('a',null,'rank-entry');link.dataset.game=id;
    link.href='./monthly-ranking.html?game='+encodeURIComponent(id);
    link.setAttribute('aria-label',name+' 월간 순위 자세히 보기');
    const title=make('span',name,'game-name'),nickname=make('span','불러오는 중…','first-name'),
     detail=make('small',null,'first-detail'),person=make('span',null,'first-person'),
     score=make('strong','—','first-score'),arrow=make('span','›','arrow');
    person.append(nickname,detail);
    arrow.setAttribute('aria-hidden','true');link.append(title,person,score,arrow);
    rows.set(id,{nickname,detail,score,link});list.append(link);
   }
   section.append(heading,list);fragment.append(section);
  }
  container.replaceChildren(fragment);
 }
 const gameById=new Map(GAME_LIST.map(game=>[game.id,game]));
 const monthKey=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,7);
 function updateMonth(){const key=monthKey();shownMonth=key;month.textContent=key.slice(0,4)+'년 '+Number(key.slice(5,7))+'월';}
 function valueFor(game,record){
  const n=Number(record?.score);
  if(!Number.isFinite(n)||n<=0)return '—';
  if(game.id==='sacheonseong')return window.OjjudaSacheonseongRanking?.format?.(n)||'—';
  if(game.id==='solitaire')return window.OjjudaSolitaireRules?.record?.(n)?.time||'—';
  if(game.id==='mines')return window.OjjudaMinesRules?.record?.(n)?.time||'—';
  let score=n;
  if(game.id==='mole')score=window.OjjudaMoleRanking?.rankingRecord?.(n)?.points??n;
  const formatted=(game.unit==='점'||game.unit==='G')&&window.OjjudaScoreFormat
   ?window.OjjudaScoreFormat(score):Number(score).toLocaleString('ko-KR');
  return formatted+game.unit;
 }
 function paint(id,value,issue){
  const row=rows.get(id),game=gameById.get(id);if(!row||!game)return;
  const nick=row.nickname,score=row.score;row.detail.textContent='';row.link.removeAttribute('title');
  nick.classList.remove('is-error','is-login','is-record');
  if(issue){
   nick.textContent=issue==='member'?'로그인 후 확인':issue==='adult'?'성인 인증 후 확인':'조회 실패 · 새로고침';
   nick.classList.add(issue==='error'?'is-error':'is-login');score.textContent='—';return;
  }
  const raw=Number(value?.score);
  if(!value||!Number.isFinite(raw)||raw<=0){
   nick.textContent='이번 달 기록 없음';score.textContent='—';return;
  }
  nick.textContent='1위 · '+String(value.nick||'익명').slice(0,80);nick.classList.add('is-record');
  const detail=window.OjjudaRankingDetails?.describe?.(id,value)||'';
  row.detail.textContent=detail;
  if(detail)row.link.title=game.name+' · '+detail;
  else row.link.removeAttribute('title');
  score.textContent=valueFor(game,value);
 }
 function reset(){
  for(const row of rows.values()){row.nickname.textContent='불러오는 중…';row.nickname.className='first-name';row.detail.textContent='';row.link.removeAttribute('title');row.score.textContent='—';}
 }
 function create(){
  if(client)return client;
  const config=window.OJJUDA_CONFIG;
  if(!config?.supabaseUrl||!config?.supabaseKey||!window.supabase?.createClient)throw Error('connection_missing');
  client=window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
  return client;
 }
 function bounded(name,args,ms){
  const q=client.rpc(name,args);
  return typeof q?.abortSignal==='function'&&typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'
   ?q.abortSignal(AbortSignal.timeout(ms)):q;
 }
 async function retrieveIndividual(ids,token){
  // One Card is the first multiplayer ranking read if the batched response fails.
  const ordered=[...ids].sort((a,b)=>Number(b==='onecard')-Number(a==='onecard'));
  let failures=0;
  for(let i=0;i<ordered.length;i+=4){
   const part=ordered.slice(i,i+4);
   await Promise.all(part.map(async id=>{
    try{
     const response=await bounded('community_game_monthly_personal',{p_game:id,p_guest_token:null},8000);
     if(token!==requestId)return;
     if(response.error)throw response.error;
     if(!Array.isArray(response.data?.leaders))throw Error('invalid_rank_response');
     paint(id,response.data.leaders[0]||null);
    }catch(error){
     if(token!==requestId)return;
     const blocked=error?.code==='42501'||/not_signed_in|not_allowed/.test(error?.message||'');
     paint(id,null,blocked?(gameById.get(id)?.group==='adult'?'adult':'member'):'error');failures++;
    }
   }));
   if(token!==requestId)return failures;
  }
  return failures;
 }
 async function load(){
  const token=++requestId;
  updateMonth();reset();status.textContent='이번 달 순위를 확인하고 있어요.';
  refreshButton.disabled=true;
  try{
   create();
   const sessionResult=await client.auth.getSession();
   if(token!==requestId)return;
   if(sessionResult.error)throw sessionResult.error;
   const user=sessionResult.data?.session?.user;
   const owner=user&&!user.is_anonymous?user.id:null;
   lastActor=owner;
   if(!authListener&&typeof client.auth.onAuthStateChange==='function'){
    const sub=client.auth.onAuthStateChange((_event,next)=>{
     const candidate=next?.user&&!next.user.is_anonymous?next.user.id:null;
     if(candidate!==lastActor){lastActor=candidate;queueMicrotask(()=>void load());}
    });
    authListener=sub.data?.subscription||sub;
   }
   if(!owner){
    for(const game of GAME_LIST)if(!PUBLIC_GAMES.has(game.id))paint(game.id,null,game.group==='adult'?'adult':'member');
    const errors=await retrieveIndividual(GROUPS[0].games.map(game=>game[0]),token);
    if(token===requestId)status.textContent=errors?'일부 순위를 불러오지 못했어요. 새로고침해 주세요.':'함께하는 플레이 순위는 로그인 후 볼 수 있어요.';
    return;
   }
   let data=null;
   try{
    const response=await bounded('community_game_monthly_leaders',{p_games:GAME_LIST.map(game=>game.id)},10000);
    if(!response.error&&response.data&&!Array.isArray(response.data)&&typeof response.data==='object'&&Object.keys(response.data).length)data=response.data;
   }catch{}
   if(token!==requestId)return;
   if(data){
    for(const game of GAME_LIST){
     if(Object.prototype.hasOwnProperty.call(data,game.id))paint(game.id,data[game.id]);
     else paint(game.id,null,game.group==='adult'?'adult':'error');
    }
    status.textContent='';return;
   }
   const errors=await retrieveIndividual(GAME_LIST.map(game=>game.id),token);
   if(token===requestId)status.textContent=errors?'일부 순위를 불러오지 못했어요. 새로고침해 주세요.':'';
  }catch(error){
   if(token===requestId){for(const game of GAME_LIST)paint(game.id,null,'error');status.textContent='연결을 확인하지 못했어요. 새로고침해 주세요.';}
  }finally{
   if(token===requestId)refreshButton.disabled=false;
  }
 }
 renderRows();
 refreshButton.addEventListener('click',()=>void load());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&monthKey()!==shownMonth)void load();});
 void load();
})();
