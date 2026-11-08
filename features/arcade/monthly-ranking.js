/* One small leaderboard reader shared by every game's entry/result links. */
(() => {
 'use strict';
 const games = [
  ['sacheonseong','사천성',''],['solitaire','솔리테어',''],['mines','지뢰찾기',''],
  ['saetbyeol','샛별 키우기','점'],['mole','두더지 잡기','점'],['runner','쭈 달리기','점'],
  ['stacker','탑 쌓기','층'],['breakout','벽돌깨기','점'],['screw_box','나사 풀기 · 박스','점'],
  ['screw_flat','나사 풀기 · 평면','점'],['spot','틀린그림 찾기','장'],['archery','바람의 궁수','점'],
  ['chacha_rush','차차 러시!','점'],['bang','뱅','연승'],['tank','탱크','연승'],
  ['tour','오쭈다 투어','연승'],['ttang','땅따먹기','연승'],['janggi','장기','연승'],
  ['chess','체스','연승'],['billiards','당구','연승'],['matgo','맞고','골드'],
  ['poker','포커','골드'],['roulette','룰렛','골드'],['photo_ttang','포토 땅따먹기','장']
 ];
 const byId = new Map(games.map(([id,name,unit])=>[id,{name,unit}]));
 const aliases = {screw:'screw_box',carom4:'billiards',carom3:'billiards',pool8:'billiards'};
 const $ = selector=>document.querySelector(selector);
 const option=$('#ranking-game'),period=$('#ranking-period'),status=$('#ranking-status');
 const list=$('#ranking-leaders'),mine=$('#ranking-mine'),mineRow=$('#ranking-mine-row'),refresh=$('#ranking-refresh');
 const params=new URL(location.href).searchParams;
 const raw=params.get('game');
 let game=byId.has(raw)?raw:aliases[raw]||'sacheonseong';
 let client=null,request=0,resetTimer=null,lastEndsAt=0;
 const number=value=>{
  try{return new Intl.NumberFormat('ko-KR').format(BigInt(value));}
  catch{return String(value??'—');}
 };
 function formatScore(record,id){
  const score=Number(record.score);
  if(!Number.isFinite(score)||score<0)return '—';
  if(id==='sacheonseong')return window.OjjudaSacheonseongRanking?.format(score)||'—';
  if(id==='solitaire')return window.OjjudaSolitaireRules?.record(score)?.time||'—';
  if(id==='mines')return window.OjjudaMinesRules?.record(score)?.time||'—';
  if(id==='mole'){
   const grid=Math.min(6,3+Math.floor(score/1000));
   return number(score-(grid-3)*1000)+'점';
  }
  return number(record.score)+(byId.get(id)?.unit||'점');
 }
 function describe(record,id){
  const detail=[];
  if(id==='sacheonseong'||id==='archery'){
   if(Number.isInteger(Number(record.stage))&&Number(record.stage)>0)detail.push(number(record.stage)+'단계');
  } else if(id==='solitaire'){
   const level=window.OjjudaSolitaireRules?.record(Number(record.score))?.name;
   if(level)detail.push(level);
  } else if(id==='mines'){
   const level=window.OjjudaMinesRules?.record(Number(record.score))?.name;
   if(level)detail.push(level);
  } else if(id==='mole'){
   const grid=Math.min(6,3+Math.floor(Number(record.score)/1000));
   if(grid>=3)detail.push(`${grid}×${grid}`);
  } else if(id==='tank'&&Number(record.opponents)>0)detail.push(`${record.opponents}명 상대`);
  else if(['chess','janggi','billiards'].includes(id)){
   const variant={carom4:'4구',carom3:'3쿠션',pool8:'포켓볼'}[record.variant];
   const level={online:'회원대결',hard:'어려움',normal:'보통',easy:'쉬움'}[record.difficulty];
   if(variant)detail.push(variant);if(level)detail.push(level);
  }
  return detail.join(' · ');
 }
 function row(record,place){
  const li=document.createElement('li');li.className='rank-row';
  if(record.me===true)li.classList.add('is-me');
  const position=document.createElement('span');position.className='rank-place';position.textContent=`${place}위`;
  const who=document.createElement('div');who.className='rank-person';
  const name=document.createElement('strong');name.textContent=String(record.nick||'익명').slice(0,80);
  if(record.me===true){const label=document.createElement('span');label.className='me-tag';label.textContent='나';name.append(label);}
  who.append(name);
  const detail=describe(record,game);
  if(detail){const small=document.createElement('small');small.textContent=detail;who.append(small);}
  const points=document.createElement('span');points.className='rank-points';points.textContent=formatScore(record,game);
  li.append(position,who,points);return li;
 }
 function guestToken(){
  let stored='';try{stored=localStorage.getItem('ojjuda.guest-ranking.v1')||'';}catch{}
  return /^[a-f0-9]{64}$/.test(stored)?stored:null;
 }
 function clockLabel(value){
  const parts=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date(value));
  const part=type=>parts.find(item=>item.type===type)?.value||'?';
  return `${part('month')}월 ${part('day')}일 ${part('hour')}시`;
 }
 function scheduleReset(){
  clearTimeout(resetTimer);
  if(!lastEndsAt)return;
  const remaining=lastEndsAt-Date.now();
  resetTimer=setTimeout(()=>{if(Date.now()>=lastEndsAt)void load();else scheduleReset();},Math.max(1000,Math.min(3600000,remaining+500)));
 }
 async function load(){
  const id=++request;list.replaceChildren();mine.hidden=true;mineRow.replaceChildren();
  status.textContent='이번 달 기록을 불러오는 중…';refresh.disabled=true;lastEndsAt=0;clearTimeout(resetTimer);
  try{
   if(!client){
    const config=window.OJJUDA_CONFIG;
    if(!config?.supabaseUrl||!config?.supabaseKey||!window.supabase?.createClient)throw Error('연결 설정을 불러오지 못했어요.');
    client=window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
   }
   const {data,error}=await client.rpc('community_game_monthly_personal',{
    p_game:game,p_guest_token:guestToken()
   }).abortSignal(AbortSignal.timeout(12000));
   if(id!==request)return;
   if(error)throw error;
   if(!data||!Array.isArray(data.leaders)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))throw Error('순위 자료 형식을 확인할 수 없어요.');
   const [year,month]=data.month.split('-');
   const begin=clockLabel(data.startsAt),end=clockLabel(data.endsAt);
   period.textContent=`${year}년 ${Number(month)}월 · ${begin}부터 ${end}까지 (한국시간)`;
   for(const [i,record] of data.leaders.slice(0,10).entries())list.append(row(record,i+1));
   if(data.mine&&Number.isInteger(Number(data.mine.rank))&&Number(data.mine.rank)>10){
    mineRow.append(row(data.mine,Number(data.mine.rank)));mine.hidden=false;
   }
   status.textContent=data.leaders.length?'':'아직 이번 달 기록이 없어요. 첫 번째 주인공이 되어 보세요!';
   lastEndsAt=Date.parse(data.endsAt);if(Number.isFinite(lastEndsAt))scheduleReset();
  }catch(error){
   if(id!==request)return;
   status.textContent=error?.code==='42501'||/not_allowed|not_signed_in/.test(error?.message||'')
    ?'회원 로그인 또는 성인 인증이 필요한 게임이에요. 아지트에서 확인해 주세요.'
    :'순위를 불러오지 못했어요. 잠시 후 새로고침해 주세요.';
  }finally{if(id===request)refresh.disabled=false;}
 }
 for(const [id,meta] of byId){const choice=document.createElement('option');choice.value=id;choice.textContent=meta.name;option.append(choice);}
 option.value=game;
 option.addEventListener('change',()=>{game=option.value;const url=new URL(location.href);url.searchParams.set('game',game);history.replaceState(null,'',url);void load();});
 refresh.addEventListener('click',()=>void load());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lastEndsAt&&Date.now()>=lastEndsAt)void load();});
 void load();
})();
