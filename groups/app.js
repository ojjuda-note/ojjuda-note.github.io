(() => {
'use strict';
const Age=(() => {
 'use strict';
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const modes = [['all','전체'],['adults','성인전용'],['minors','성인불가'],['range','나이대 설정']];
 const validAge = (value, fallback) => Number.isInteger(Number(value)) && Number(value)>=14 && Number(value)<=150 ? Number(value) : fallback;
 function label(room = {}) {
  if (room.age_policy === 'adults') return '성인전용 · 만 19세 이상';
  if (room.age_policy === 'minors') return '성인불가 · 만 14~18세';
  if (room.age_policy === 'range') return `만 ${validAge(room.min_age,14)}~${validAge(room.max_age,150)}세`;
  return '전체 · 연령 제한 없음';
 }
 const policy = room => modes.some(([value])=>value===room?.age_policy) ? room.age_policy : 'all';
 function badge(room = {}) { return `<span class="tag age-tag" data-age-policy="${policy(room)}">${escape(label(room))}</span>`; }
 function note(room = {}) { return room.age_eligible === false ? `<p class="hint age-note" role="status">${escape(room.age_note || '이 그룹의 연령 조건에 맞지 않아 이용할 수 없어요.')}</p>` : ''; }
 function fields(room = {}, editing = false) {
  const mode = policy(room), lo = validAge(room.min_age,20), hi = validAge(room.max_age,29);
  return `<fieldset class="age-settings" data-age-policy="${mode}"><legend>참여 연령</legend><label class="field">연령 조건<select name="age_policy">${modes.map(([v,t])=>`<option value="${v}" ${v===mode?'selected':''}>${t}</option>`).join('')}</select></label><p class="age-preview" data-age-preview role="status" aria-live="polite" aria-atomic="true">${badge(room)}</p><div data-age-range ${mode==='range'?'':'hidden'}><label class="field">나이대 빠른 선택<select data-age-preset><option value="">직접 입력</option>${[['14-18','청소년 · 만 14~18세'],['20-29','20대'],['30-39','30대'],['40-49','40대'],['50-59','50대'],['60-69','60대'],['70-150','70세 이상']].map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label><div class="two"><label class="field">최소 나이<input name="min_age" type="number" min="14" max="150" step="1" inputmode="numeric" value="${lo}" ${mode==='range'?'required':'disabled'}></label><label class="field">최대 나이<input name="max_age" type="number" min="14" max="150" step="1" inputmode="numeric" value="${hi}" ${mode==='range'?'required':'disabled'}></label></div></div><p class="hint">성인전용: 만 19세 이상 · 성인불가: 만 14~18세.<br>한국 시간 기준, 가입 시 입력한 생년월일로 판단해요. 본인인증된 정보는 아니에요. 방장도 같은 조건을 충족해야 해요.${editing?'<br>기존 그룹원이 새 조건에 맞지 않으면 변경할 수 없어요.':''}</p></fieldset>`;
 }
 function bind(form) {
  if (!form?.elements.age_policy) return;
  const mode=form.elements.age_policy, lo=form.elements.min_age, hi=form.elements.max_age;
  const range=form.querySelector('[data-age-range]'), preset=form.querySelector('[data-age-preset]');
  const settings=mode.closest('.age-settings'), preview=settings.querySelector('[data-age-preview]');
  const paint=()=>{
   const selected=policy({age_policy:mode.value}), lower=Number(lo.value), upper=Number(hi.value);
   settings.dataset.agePolicy=selected;
   preview.innerHTML=badge({age_policy:selected,min_age:lo.value,max_age:hi.value});
   if(selected==='range' && (lo.value==='' || hi.value==='' || !Number.isInteger(lower) || !Number.isInteger(upper) || lower<14 || upper>150 || lower>upper))
    preview.querySelector('.age-tag').textContent='나이대 설정 · 나이 범위를 확인해 주세요.';
  };
  const validate=()=>{hi.setCustomValidity(mode.value==='range' && lo.value!=='' && hi.value!=='' && Number(lo.value)>Number(hi.value)?'최대 나이는 최소 나이 이상이어야 해요.':'');paint();};
  const sync=()=>{const on=mode.value==='range';range.hidden=!on;for(const el of [lo,hi]){el.disabled=!on;el.required=on;}preset.disabled=!on;validate();};
  mode.addEventListener('change',sync);
  for(const el of [lo,hi])el.addEventListener('input',()=>{preset.value='';validate();});
  preset.addEventListener('change',()=>{if(preset.value){[lo.value,hi.value]=preset.value.split('-');validate();}});
  sync();
 }
 return Object.freeze({label,badge,note,fields,bind});
})();

const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>{if(crypto.randomUUID)return crypto.randomUUID();const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;return [...a].map((b,i)=>([4,6,8,10].includes(i)?'-':'')+b.toString(16).padStart(2,'0')).join('');};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sharedCode=()=>{const code=new URLSearchParams(location.hash.slice(1)).get('invite');return UUID.test(code||'')?code:null;};
const bucket='group-media', types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-m4v':'m4v'};
const dayOf=v=>new Date(v).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}), today=()=>dayOf(Date.now());
const dateText=(v,all=false)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short',...(all?{}:{hour:'2-digit',minute:'2-digit'})}).format(new Date(v));
let client,user,rooms=[],posts=[],directory=[],directoryQuery='',onlyMine=false,directoryHasMore=false,roomId=null,view='list',filter='all',query='',date='',month=today().slice(0,7),more=false,epoch=0,loading=false,observer,toastTimer,authEpoch=0,refreshTimer,navigationRun=0,directoryLoading=false,refreshRequest=null,mutationRun=0,mutating=0,invitationRun=0;
const reads=new Map(),signatures=new WeakMap();let renderedRoomId=null;
const mediaCache=new Map(),mediaPending=new Map(),mediaQueue=[];
let mediaBytes=0,mediaActive=0,mediaGeneration=0;
const MEDIA_CACHE_LIMIT=48*1024*1024,MEDIA_PARALLEL=3;
const currentRoom=()=>rooms.find(r=>r.id===roomId), activeRooms=()=>rooms.filter(r=>!r.deleting&&r.age_eligible!==false);
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
function failure(e){if(e?.code==='P0001'&&e?.message==='banned_word')return '금칙어가 포함되어 있어 등록할 수 없어요.';if(e?.code==='42501')return e.message||'권한이 없어요. 다시 로그인하거나 그룹 가입 상태를 확인해 주세요.';if(e?.code==='22P02')return '초대코드나 입력한 내용을 확인해 주세요.';if(e?.code==='23514'||e?.code==='23502')return '필수 항목과 글자 수를 확인해 주세요.';return e?.message||'연결하지 못했어요. 다시 시도해 주세요.';}
async function rpc(name,args,read=false){
 const id=user?.id;if(!id)throw Error('로그인해 주세요.');
 const key=JSON.stringify([id,mutationRun,name,args]);let request=read?reads.get(key):null;
 if(!request){if(!read){mutationRun++;mutating++;}request=Promise.resolve().then(()=>client.rpc(name,args));if(read)reads.set(key,request);}
 try{const {data,error}=await request;if(id!==user?.id)throw Error('로그인 계정이 바뀌었어요.');if(error)throw error;return data;}
 finally{if(read){if(reads.get(key)===request)reads.delete(key);}else mutating--;}
}
const api=(action,payload={})=>rpc('group_board',{p_action:action,p_payload:payload},['rooms','directory','feed','calendar','members','requests','comments','deletion_files'].includes(action));
const invitationApi=(action,payload={})=>rpc('group_invitation',{p_action:action,p_payload:payload},['received','search','preview_link'].includes(action)||action==='link'&&!payload.rotate);
function cachedMedia(path){const entry=mediaCache.get(path);if(!entry)return null;mediaCache.delete(path);mediaCache.set(path,entry);return entry.url;}
function trimMediaCache(protectedPath){
 if(mediaBytes<=MEDIA_CACHE_LIMIT)return;
 const used=new Set([...document.querySelectorAll('img[src^="blob:"],video[src^="blob:"]')].map(el=>el.src));
 for(const [path,entry] of mediaCache){
  if(mediaBytes<=MEDIA_CACHE_LIMIT||mediaCache.size<=1)break;
  if(path===protectedPath||used.has(entry.url))continue;
  URL.revokeObjectURL(entry.url);mediaCache.delete(path);mediaBytes-=entry.bytes;
 }
}
function clearMedia(purge=false){
 observer?.disconnect();
 if(!purge){trimMediaCache();return;}
 mediaGeneration++;
 for(const entry of mediaCache.values())URL.revokeObjectURL(entry.url);
 mediaCache.clear();mediaBytes=0;
 for(const job of mediaQueue.splice(0))job.reject(Error('사진 화면이 바뀌었어요.'));
 mediaPending.clear();
}
function pumpMedia(){
 while(mediaActive<MEDIA_PARALLEL&&mediaQueue.length){
  const job=mediaQueue.shift();mediaActive++;
  Promise.resolve().then(()=>client.storage.from(bucket).download(job.path)).then(({data,error})=>{
   if(error)throw error;
   if(job.generation!==mediaGeneration||job.owner!==user?.id)throw Error('사진 요청이 만료됐어요.');
   const url=URL.createObjectURL(data),bytes=Number(data?.size)||0;
   mediaCache.set(job.path,{url,bytes});mediaBytes+=bytes;trimMediaCache(job.path);job.resolve(url);
  }).catch(job.reject).finally(()=>{
   mediaActive--;
   if(mediaPending.get(job.path)===job)mediaPending.delete(job.path);
   pumpMedia();
  });
 }
}
function requestMedia(path,priority=1){
 const hit=cachedMedia(path);if(hit)return Promise.resolve(hit);
 const existing=mediaPending.get(path);
 if(existing){if(priority<existing.priority){existing.priority=priority;mediaQueue.sort((a,b)=>a.priority-b.priority);}return existing.promise;}
 const job={path,priority,owner:user?.id,generation:mediaGeneration};
 job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
 mediaPending.set(path,job);mediaQueue.push(job);mediaQueue.sort((a,b)=>a.priority-b.priority);pumpMedia();
 return job.promise;
}
async function makePreview(file){
 if(!file?.type?.startsWith('image/'))return null;
 let source,sourceUrl;
 try{
  if(typeof createImageBitmap==='function')source=await createImageBitmap(file);
  else{
   sourceUrl=URL.createObjectURL(file);
   source=await new Promise((resolve,reject)=>{
    const img=new Image(),timeout=setTimeout(()=>reject(Error('사진 준비 시간 초과')),10000);
    img.onload=()=>{clearTimeout(timeout);resolve(img);};
    img.onerror=()=>{clearTimeout(timeout);reject(Error('사진 형식을 읽지 못했어요.'));};
    img.src=sourceUrl;
   });
  }
  const width=source.width||source.naturalWidth,height=source.height||source.naturalHeight;
  if(!width||!height)return null;
  const scale=Math.min(1,960/Math.max(width,height));
  if(scale===1&&file.size<160*1024)return null;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext('2d');if(!context)return null;
  context.drawImage(source,0,0,canvas.width,canvas.height);
  const preview=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.76));
  canvas.width=canvas.height=0;
  return preview?.type==='image/webp'&&preview.size>0&&preview.size<file.size&&preview.size<=1048576?preview:null;
 }catch{return null;}
 finally{source?.close?.();if(sourceUrl)URL.revokeObjectURL(sourceUrl);}
}
function gate(message=sharedCode()?'로그인 후 초대를 수락해 주세요.':'로그인하고 우리만의 그룹을 만들어 보세요.') {epoch++;clearMedia(true);for(const d of document.querySelectorAll('dialog'))d.close();$('#app').innerHTML=`<section class="hero"><div><h1>그룹</h1></div></section><div class="empty"><strong>${esc(message)}</strong><a href="/?auth=login&amp;next=groups${sharedCode()?'&amp;invite='+encodeURIComponent(sharedCode()):''}" class="back">로그인 · 가입 →</a></div>`;}
function dialog(title,body){const d=document.createElement('dialog');d.className='dialog';d.setAttribute('aria-label',title);d.innerHTML=`<header class="dialog-head"><h2>${esc(title)}</h2><button type="button" data-close aria-label="닫기">✕</button></header><div class="dialog-body">${body}</div>`;document.body.append(d);const prev=document.activeElement;d.showModal();d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>{d.remove();prev?.isConnected&&prev.focus({preventScroll:true});});return d;}
function route(id=null){navigationRun++;if(id!==roomId){query='';filter='all';}roomId=id;date='';posts=[];history.pushState(null,'',id?'#room='+id:location.pathname);render();void loadFeed();}
function render(){epoch++;clearTimeout(refreshTimer);loading=false;directoryLoading=false;clearMedia();const r=currentRoom();renderedRoomId=r?.id||null;
$('#app').innerHTML=`<section class="hero"><div class="hero-top"><h1>${esc(r?.name||'그룹')}</h1>${r?'':`<button type="button" class="mine-toggle" data-action="mine" aria-pressed="${onlyMine}" aria-label="${onlyMine?'전체 그룹 보기':'내 그룹만 보기'}">${onlyMine?'전체 그룹':'내 그룹'}</button>`}</div><div class="actions">${r?'<button data-action="home">← 그룹 목록</button>':'<button class="primary" data-action="create">＋ 그룹 만들기</button>'}<button type="button" class="page-share" data-action="share-page" aria-label="${r?'그룹 페이지 공유':'그룹 목록 페이지 공유'}">↗ 페이지 공유</button></div></section>
${!r?`<section class="toolbar directory-toolbar"><input type="search" id="directory-query" maxlength="100" value="${esc(directoryQuery)}" placeholder="그룹 이름 검색" aria-label="그룹 이름 검색"></section><section id="group-invitations" class="feed" hidden></section><section id="directory" class="feed" aria-label="그룹 목록" aria-live="polite"><p class="empty">불러오는 중…</p></section><button class="more" id="directory-more" hidden>더 보기</button>`:
`<div class="room-context"><p class="muted">${r.description?'<span class="room-desc" title="'+esc(r.description)+'">'+esc(r.description)+'</span><span class="room-sep"> · </span>':''}<span class="room-count">${r.member_count}명</span> ${Age.badge(r)}</p><div class="actions">${r.deleting||r.age_eligible===false?'':'<button data-action="share">초대 공유</button>'}${r.age_eligible!==false||r.owner_id===user.id?`<button data-action="manage">${r.owner_id===user.id?'그룹 관리':'그룹원'}</button>`:''}</div></div>
${r.deleting?`<div class="empty"><strong>그룹 삭제를 마무리해 주세요.</strong><button data-action="resume-delete" class="danger">삭제 계속하기</button></div>`:r.age_eligible===false?`<div class="empty">${Age.note(r)}${r.owner_id===user.id?'<p>그룹 관리에서 연령 조건을 변경하거나 그룹을 삭제할 수 있어요.</p>':'<button data-action="age-leave" class="danger">그룹 나가기</button>'}</div>`:
`<div class="toolbar"><div class="view" aria-label="보기 방식"><button data-view="list" class="${view==='list'?'active':''}" aria-pressed="${view==='list'}">목록</button><button data-view="calendar" class="${view==='calendar'?'active':''}" aria-pressed="${view==='calendar'}">캘린더</button></div><input type="search" id="search" maxlength="100" value="${esc(query)}" placeholder="글 · 장소 · 여행계획 검색" aria-label="게시글과 일정 검색"><button data-action="refresh" aria-label="새로고침">↻</button></div>
<div class="filter-row">${[['all','전체'],['post','글 · 사진 · 동영상'],['event','약속 · 여행']].map(([id,label])=>`<button class="filter ${filter===id?'active':''}" data-filter="${id}">${label}</button>`).join('')}</div><div id="calendar" ${view==='calendar'?'':'hidden'}></div><div class="result-heading"><span id="result-caption">최근 올린 순서</span><button class="quiet" data-action="clear-date" ${date?'':'hidden'}>날짜 선택 해제</button></div><section id="feed" class="feed" aria-live="polite"></section><button id="load-more" class="more" hidden>더 보기</button><button class="fab" data-action="compose">＋ 올리기</button>`}`}`;
$('#app').onclick=handleClick;
$('#search')?.addEventListener('input',e=>{query=e.target.value;epoch++;loading=false;clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadFeed(),280);});
$('#directory-query')?.addEventListener('input',e=>{directoryQuery=e.target.value;epoch++;directoryLoading=false;clearTimeout(refreshTimer);if(onlyMine)drawDirectory();else refreshTimer=setTimeout(()=>loadDirectory(),250);});
$('#load-more')?.addEventListener('click',()=>loadFeed(true));$('#directory-more')?.addEventListener('click',()=>loadDirectory(true));
if(!r)void loadHome();}
async function reloadRooms(){const run=mutationRun,data=await api('rooms');if(run!==mutationRun)return;rooms=data;if(roomId&&!rooms.some(r=>r.id===roomId)){clearMedia(true);roomId=null;history.replaceState(null,'',location.pathname);}}
async function refresh({quiet=false}={}){
 if(refreshRequest?.run===navigationRun&&refreshRequest.mutation===mutationRun)return refreshRequest.promise;
 const run=navigationRun,mutation=mutationRun,prior=JSON.stringify(currentRoom());
 const request=(async()=>{try{
  if(!roomId){if(!$('#directory'))render();await loadHome({preserve:quiet});return;}
  await reloadRooms();if(run!==navigationRun)return;
  if(renderedRoomId!==roomId||prior!==JSON.stringify(currentRoom())||!$('#feed')){render();await loadFeed();}
  else if(!quiet||posts.length<=40&&![...document.querySelectorAll('video')].some(v=>!v.paused&&!v.ended))await loadFeed(false,{quiet:true});
 }catch(e){notify(failure(e));}})();
 const holder={run,mutation,promise:request};refreshRequest=holder;try{await request;}finally{if(refreshRequest===holder)refreshRequest=null;}
}
function directoryCards(rows){return rows.map(r=>`<article class="post group-card" data-group="${r.id}"><div class="post-head"><div><h3>${esc(r.name)}</h3>${Age.badge(r)}${Age.note(r)}${r.description?`<p class="muted">${esc(r.description)}</p>`:''}<span class="metadata">${r.owner_name?esc(r.owner_name)+" · ":""}${r.member_count}명</span></div><span class="tag">${r.deleting?'삭제 중':r.is_member?'내 그룹':'가입 가능'}</span></div><div class="actions">${r.is_member?`<button data-room="${r.id}" class="primary">들어가기</button>`:r.requested?`<span class="muted">가입 승인 대기 중</span><button data-cancel-request="${r.id}">신청 취소</button>`:`<button data-request="${r.id}" class="primary" ${r.age_eligible===false?'disabled':''}>${r.age_eligible===false?'연령 조건 확인':'가입 신청'}</button>`}</div></article>`).join('');}
function drawDirectory(){
 const box=$('#directory');if(!box)return;
 const search=directoryQuery.trim().toLowerCase();
 const known=new Map(directory.map(r=>[r.id,r]));
 const deleting=rooms.filter(r=>r.deleting&&r.name.toLowerCase().includes(search)).map(r=>({...r,is_member:true,owner_name:'나'}));
 const mine=rooms.filter(r=>!search||[r.name,r.description].some(x=>String(x||'').toLowerCase().includes(search))).map(r=>({...r,is_member:true,requested:false,owner_name:known.get(r.id)?.owner_name||(r.owner_id===user?.id?'나':'')}));
 const rows=onlyMine?mine:[...deleting,...directory];
 const signature=JSON.stringify([onlyMine,directoryQuery,...rows]);
 if(signatures.get(box)!==signature){
  box.innerHTML=directoryCards(rows)||`<div class="empty">${onlyMine?(search?'내 그룹에서 검색 결과가 없어요.':'아직 가입한 그룹이 없어요.'):(search?'검색한 그룹이 없어요.':'첫 그룹을 만들어 보세요.')}</div>`;
  signatures.set(box,signature);
 }
 $('#directory-more').hidden=onlyMine||!directoryHasMore;
 const invites=$('#group-invitations');if(invites)invites.hidden=onlyMine||!invites.querySelector('article');
}
function paintDirectory(data,append=false){
 const box=$('#directory');if(!box)return;
 const incoming=data.slice(0,40);
 directory=append?[...new Map([...directory,...incoming].map(r=>[r.id,r])).values()]:incoming;
 directoryHasMore=data.length>40;
 drawDirectory();
}
async function loadHome({preserve=false}={}){
 const box=$('#directory');if(!box)return;const ticket=++epoch,q=directoryQuery,run=mutationRun;directoryLoading=true;$('#directory-more').disabled=true;
 try{const data=await rpc('group_home',{p_query:q},true);if(ticket!==epoch||run!==mutationRun||!box.isConnected)return;
  rooms=data.rooms;if(!preserve||directory.length<=40)paintDirectory(data.directory);else drawDirectory();paintInvitations(data.invitations);
 }catch(e){if(ticket===epoch&&box.isConnected){if(!signatures.has(box))box.innerHTML=`<p class="error">${esc(failure(e))}</p><button data-action="refresh">다시 불러오기</button>`;else notify(failure(e));}}
 finally{if(ticket===epoch){directoryLoading=false;if($('#directory-more'))$('#directory-more').disabled=false;}}
}
async function loadDirectory(append=false){
 const box=$('#directory');if(!box||append&&directoryLoading)return;const ticket=++epoch,q=directoryQuery,run=mutationRun;directoryLoading=true;$('#directory-more').disabled=true;
 try{const last=append?directory.at(-1):null,data=await api('directory',{query:q,before:last?.created_at,before_id:last?.id});if(ticket!==epoch||run!==mutationRun||!box.isConnected)return;paintDirectory(data,append);}
 catch(e){if(ticket===epoch&&box.isConnected)notify(failure(e));}
 finally{if(ticket===epoch){directoryLoading=false;if($('#directory-more'))$('#directory-more').disabled=false;}}
}
async function loadFeed(append=false,{quiet=false}={}){
 const box=$('#feed');if(!box||!roomId||append&&loading)return;const ticket=++epoch,run=mutationRun;loading=true;const last=append?posts.at(-1):null;$('#load-more').disabled=true;
 if(!append&&!box.children.length)box.innerHTML='<p class="empty">불러오는 중…</p>';
 try{
  const payload={room_id:roomId,filter,query,date,before:last?.created_at,before_id:last?.id};
  const [data,days]=await Promise.all([api('feed',payload),view==='calendar'&&!append?api('calendar',{room_id:roomId,filter,query,month:month+'-01'}):null]);
  if(ticket!==epoch||run!==mutationRun||!box.isConnected)return;
  more=data.length>40;const incoming=data.slice(0,40),next=append?[...new Map([...posts,...incoming].map(p=>[p.id,p])).values()]:incoming;
  if(append){const ids=new Set(posts.map(p=>p.id));box.insertAdjacentHTML('beforeend',incoming.filter(p=>!ids.has(p.id)).map(postCard).join(''));}
  else if(signatures.get(box)!==JSON.stringify(next)+(next.length?'':date?'dated':'all')){clearMedia();box.innerHTML=next.map(postCard).join('')||`<div class="empty"><strong>${date?'이 날짜의 기록이 없어요.':'아직 올라온 기록이 없어요.'}</strong></div>`;}
  posts=next;signatures.set(box,JSON.stringify(posts)+(posts.length?'':date?'dated':'all'));if(days)renderCalendar(days);$('#load-more').hidden=!more;
  $('#result-caption').textContent=date?`${date.replaceAll('-','.')}의 기록 · 최근 올린 순서`:'최근 올린 순서';$('[data-action=clear-date]').hidden=!date;observeMedia();
 }catch(e){if(ticket===epoch&&box.isConnected){if(e?.code==='42501'){clearMedia(true);posts=[];if($('#calendar'))$('#calendar').replaceChildren();signatures.delete(box);box.innerHTML=`<div class="empty"><p class="error">${esc(failure(e))}</p><button data-action="refresh">다시 불러오기</button></div>`;}else if(!quiet&&!signatures.has(box)){box.innerHTML=`<div class="empty"><p class="error">${esc(failure(e))}</p><button data-action="refresh">다시 불러오기</button></div>`;}else notify(failure(e));}}
 finally{if(ticket===epoch){loading=false;if($('#load-more'))$('#load-more').disabled=false;}}
}
function renderCalendar(days){const [y,m]=month.split('-').map(Number),first=new Date(Date.UTC(y,m-1,1)).getUTCDay(),box=$('#calendar');box.innerHTML=`<section class="calendar"><header class="calendar-head"><button data-month="-1" aria-label="이전 달">‹</button><h2>${y}년 ${m}월</h2><button data-month="1" aria-label="다음 달">›</button></header><div class="calendar-grid">${['일','월','화','수','목','금','토'].map(x=>`<span class="weekday">${x}</span>`).join('')}${'<span></span>'.repeat(first)}${days.map(d=>`<button class="day ${d.day===today()?'today':''} ${d.day===date?'selected':''} ${d.events?'has-event':''}" data-date="${d.day}" aria-label="${d.day}, 기록 ${d.count}개, 일정 ${d.events}개" aria-pressed="${date===d.day}">${Number(d.day.slice(-2))}${d.count?`<span>${d.events?'일정 '+d.events+'개':'기록 '+d.count+'개'}</span>`:''}</button>`).join('')}</div></section>`;}
function postCard(p){return `<article class="post" data-post="${p.id}"><header class="post-head"><div><div class="author">${esc(p.author_name)} <span class="metadata">· ${esc(p.room_name)}</span></div><div class="metadata">${dateText(p.created_at)}${p.updated_at!==p.created_at?' · 수정됨':''}</div></div><span class="tag ${p.kind==='post'?'':'event'}">${{post:'이야기',event:'약속',trip:'여행'}[p.kind]}</span></header>${p.title?`<h3>${esc(p.title)}</h3>`:''}${p.kind!=='post'?`<div class="schedule"><strong>▦ ${dateText(p.starts_at,p.all_day)} ~ ${dateText(p.ends_at,p.all_day)}${p.all_day?' · 종일':''}</strong>${p.location?`⌖ ${esc(p.location)}`:''}</div>`:''}${p.body?`<p class="body">${esc(p.body)}</p>`:''}${p.media.length?`<div class="media-grid">${p.media.map((f,i)=>`<div class="media-slot" data-media-post="${p.id}" data-media-index="${i}"><button data-load-media="${p.id}" data-index="${i}">${f.mime.startsWith('video/')?'▶ 동영상 보기':'사진 불러오기'}</button></div>`).join('')}</div>`:''}<footer class="post-foot"><button data-comments="${p.id}">댓글 ${p.comment_count||0}</button><button data-report="${p.id}">신고</button>${p.author_id===user.id?`<div><button data-edit="${p.id}">수정</button><button class="danger" data-delete="${p.id}">삭제</button></div>`:''}</footer></article>`;}
function observeMedia(){observer?.disconnect();observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){const p=posts.find(p=>p.id===e.target.dataset.mediaPost),f=p?.media[+e.target.dataset.mediaIndex];if(f?.mime.startsWith('image/'))void loadMedia(e.target,p,f,e.boundingClientRect?.top<=innerHeight?0:1);observer.unobserve(e.target);}},{rootMargin:navigator.connection?.saveData?'120px':'600px'});document.querySelectorAll('.media-slot:not([data-loaded])').forEach(n=>observer.observe(n));}

function openGallery(p,start=0){
 const media=p?.media||[];if(!media.length)return;
 const d=dialog('첨부 보기','<div class="gallery-stage" role="group" aria-label="첨부 미리보기">불러오는 중…</div><div class="gallery-zoom" hidden><button type="button" data-zoom-out aria-label="사진 축소">−</button><button type="button" data-zoom-reset aria-label="사진 원래 크기로">100%</button><button type="button" data-zoom-in aria-label="사진 확대">＋</button><span>두 손가락으로 확대 · 이동</span></div>'+(media.length>1?'<div class="gallery-nav"><button type="button" data-gallery-prev aria-label="이전 사진">‹</button><span data-gallery-count aria-live="polite"></span><button type="button" data-gallery-next aria-label="다음 사진">›</button></div>':''));
 d.classList.add('lightbox');
 const stage=d.querySelector('.gallery-stage'),zoomBar=d.querySelector('.gallery-zoom'),owner=user?.id;
 let active=-1,run=0,startTouch=null,pinch=null,touchPan=null,mousePan=null,lastTap=null,lastTouchZoom=0;
 let zoom=1,panX=0,panY=0;
 const photo=()=>stage.querySelector('img[data-full-photo]');
 const limit=(v,min,max)=>Math.max(min,Math.min(max,v));
 const point=(clientX,clientY)=>{const r=stage.getBoundingClientRect();return{x:clientX-r.left-r.width/2,y:clientY-r.top-r.height/2};};
 const showZoom=()=>{
  const img=photo();if(!img)return;
  const maxX=Math.max(0,(img.clientWidth*zoom-stage.clientWidth)/2),maxY=Math.max(0,(img.clientHeight*zoom-stage.clientHeight)/2);
  panX=limit(panX,-maxX,maxX);panY=limit(panY,-maxY,maxY);
  img.style.transform=zoom===1?'':`translate3d(${panX}px,${panY}px,0) scale(${zoom})`;
  stage.dataset.zoomed=String(zoom>1);
  zoomBar.querySelector('[data-zoom-reset]').textContent=Math.round(zoom*100)+'%';
  zoomBar.querySelector('[data-zoom-out]').disabled=zoom<=1;
  zoomBar.querySelector('[data-zoom-in]').disabled=zoom>=4;
 };
 const zoomTo=(value,cx=0,cy=0)=>{
  if(!photo())return;
  const next=limit(value,1,4),factor=next/zoom;
  panX=next===1?0:cx+(panX-cx)*factor;
  panY=next===1?0:cy+(panY-cy)*factor;
  zoom=next;showZoom();
 };
 const resetZoom=()=>{
  zoom=1;panX=panY=0;startTouch=pinch=touchPan=mousePan=lastTap=null;
  stage.classList.remove('dragging');delete stage.dataset.zoomable;delete stage.dataset.zoomed;
  zoomBar.hidden=true;
 };
 const tapZoom=(x,y)=>{
  const now=Date.now();
  if(lastTap&&now-lastTap.at<330&&Math.hypot(x-lastTap.x,y-lastTap.y)<32){
   const pos=point(x,y);zoomTo(zoom>1?1:2.5,pos.x,pos.y);lastTap=null;lastTouchZoom=now;return true;
  }
  lastTap={x,y,at:now};return false;
 };
 zoomBar.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-zoom-in'))zoomTo(zoom*1.5);
  if(b.hasAttribute('data-zoom-out'))zoomTo(zoom/1.5);
  if(b.hasAttribute('data-zoom-reset'))zoomTo(1);
 });
 const paint=async index=>{
  if(index<0||index>=media.length)return;
  active=index;const seq=++run,f=media[index];
  resetZoom();
  const prev=d.querySelector('[data-gallery-prev]'),next=d.querySelector('[data-gallery-next]');
  if(prev)prev.disabled=index===0;
  if(next)next.disabled=index===media.length-1;
  const label=d.querySelector('[data-gallery-count]');if(label)label.textContent=(index+1)+' / '+media.length;
  stage.textContent=f.mime.startsWith('video/')?'동영상을 불러오는 중…':'고화질 사진을 불러오는 중…';
  if(f.preview_path&&!f.mime.startsWith('video/')){
   const preview=cachedMedia(f.preview_path);
   if(preview){const image=document.createElement('img');image.src=preview;image.alt=f.name||'그룹 사진';image.className='gallery-preview';stage.replaceChildren(image);stage.setAttribute('aria-busy','true');}
  }
  try{
   const url=await requestMedia(f.path,0);
   if(seq!==run||!d.isConnected||!d.open)return;
   if(owner!==user?.id)return;
   const video=f.mime.startsWith('video/'),el=document.createElement(video?'video':'img');
   el.src=url;
   if(video){el.controls=true;el.playsInline=true;el.preload='metadata';}else{el.alt=f.name||'그룹 사진';el.decoding='async';el.draggable=false;el.dataset.fullPhoto='true';}
   stage.removeAttribute('aria-busy');
   stage.replaceChildren(el);
   if(!video){stage.dataset.zoomable='true';zoomBar.hidden=false;showZoom();}
  }catch(e){if(seq===run&&d.open){stage.removeAttribute('aria-busy');stage.textContent='첨부를 불러오지 못했어요.';}}
 };
 const move=delta=>{if(active+delta>=0&&active+delta<media.length)void paint(active+delta);};
 d.querySelector('[data-gallery-prev]')?.addEventListener('click',()=>move(-1));
 d.querySelector('[data-gallery-next]')?.addEventListener('click',()=>move(1));
 d.addEventListener('keydown',e=>{
  if(photo()&&!e.altKey&&!e.ctrlKey&&!e.metaKey){
   if(e.key==='+'||e.key==='='){e.preventDefault();zoomTo(zoom*1.5);return;}
   if(e.key==='-'){e.preventDefault();zoomTo(zoom/1.5);return;}
   if(e.key==='0'){e.preventDefault();zoomTo(1);return;}
   if(zoom>1&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();panX+=e.key==='ArrowLeft'?70:e.key==='ArrowRight'?-70:0;panY+=e.key==='ArrowUp'?70:e.key==='ArrowDown'?-70:0;showZoom();return;
   }
  }
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}
 });
 stage.addEventListener('wheel',e=>{if(!photo())return;e.preventDefault();const pos=point(e.clientX,e.clientY);zoomTo(zoom*(e.deltaY<0?1.2:1/1.2),pos.x,pos.y);},{passive:false});
 stage.addEventListener('dblclick',e=>{if(!photo()||Date.now()-lastTouchZoom<400)return;e.preventDefault();const pos=point(e.clientX,e.clientY);zoomTo(zoom>1?1:2.5,pos.x,pos.y);});
 stage.addEventListener('mousedown',e=>{if(e.button!==0||zoom<=1||!photo())return;e.preventDefault();mousePan={x:e.clientX,y:e.clientY,panX,panY};stage.classList.add('dragging');});
 const drag=e=>{if(!mousePan||!photo())return;panX=mousePan.panX+e.clientX-mousePan.x;panY=mousePan.panY+e.clientY-mousePan.y;showZoom();};
 const stopDrag=()=>{mousePan=null;stage.classList.remove('dragging');};
 window.addEventListener('mousemove',drag);window.addEventListener('mouseup',stopDrag);
 const midpoint=(a,b)=>point((a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2);
 const distance=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
 stage.addEventListener('touchstart',e=>{
  if(photo()&&e.touches.length>=2){
   const a=e.touches[0],b=e.touches[1],m=midpoint(a,b);
   pinch={distance:Math.max(1,distance(a,b)),midX:m.x,midY:m.y,zoom,panX,panY};
   startTouch=touchPan=lastTap=null;e.preventDefault();return;
  }
  pinch=null;
  if(e.touches.length!==1){startTouch=touchPan=null;return;}
  const t=e.touches[0];
  if(photo()&&zoom>1){touchPan={x:t.clientX,y:t.clientY,panX,panY};startTouch=null;}
  else{startTouch={x:t.clientX,y:t.clientY};touchPan=null;}
 },{passive:false});
 stage.addEventListener('touchmove',e=>{
  if(!photo())return;
  if(e.touches.length>=2){
   if(!pinch){const a=e.touches[0],b=e.touches[1],m=midpoint(a,b);pinch={distance:Math.max(1,distance(a,b)),midX:m.x,midY:m.y,zoom,panX,panY};}
   const a=e.touches[0],b=e.touches[1],m=midpoint(a,b),next=limit(pinch.zoom*distance(a,b)/pinch.distance,1,4),factor=next/pinch.zoom;
   zoom=next;panX=m.x+(pinch.panX-pinch.midX)*factor;panY=m.y+(pinch.panY-pinch.midY)*factor;
   showZoom();e.preventDefault();return;
  }
  if(e.touches.length===1&&touchPan&&zoom>1){const t=e.touches[0];panX=touchPan.panX+t.clientX-touchPan.x;panY=touchPan.panY+t.clientY-touchPan.y;showZoom();e.preventDefault();}
 },{passive:false});
 stage.addEventListener('touchend',e=>{
  if(pinch){if(e.touches.length<2){pinch=null;startTouch=null;if(e.touches.length===1&&zoom>1){const t=e.touches[0];touchPan={x:t.clientX,y:t.clientY,panX,panY};}}return;}
  if(e.changedTouches.length!==1)return;
  const t=e.changedTouches[0],origin=touchPan||startTouch;
  touchPan=startTouch=null;
  if(!origin)return;
  const dx=t.clientX-origin.x,dy=t.clientY-origin.y;
  if(photo()&&Math.hypot(dx,dy)<12&&tapZoom(t.clientX,t.clientY)){e.preventDefault();return;}
  if(zoom===1&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.2)move(dx<0?1:-1);
 },{passive:false});
 stage.addEventListener('touchcancel',()=>{startTouch=pinch=touchPan=null;},{passive:true});
 d.addEventListener('close',()=>{run++;window.removeEventListener('mousemove',drag);window.removeEventListener('mouseup',stopDrag);},{once:true});
 void paint(start);
}

async function loadMedia(slot,p,f,priority=0){
 if(!slot||slot.dataset.loaded||!f)return;
 slot.dataset.loaded='loading';const owner=user?.id;
 slot.textContent='🌿 사진을 준비하고 있어요…';
 try{
  let url;
  if(f.preview_path){try{url=await requestMedia(f.preview_path,priority);}catch{url=await requestMedia(f.path,priority);}}
  else url=await requestMedia(f.path,priority);
  if(!slot.isConnected||owner!==user?.id)return;
  const video=f.mime.startsWith('video/'),el=document.createElement(video?'video':'img');
  el.src=url;
  if(video){el.controls=true;el.playsInline=true;el.preload='metadata';}
  else{el.alt=f.name||'그룹 사진';el.decoding='async';el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','사진 크게 보기');const show=()=>openGallery(p,+slot.dataset.mediaIndex);el.onclick=show;el.onkeydown=e=>{if(e.key==='Enter')show();};}
  slot.replaceChildren(el);slot.dataset.loaded='yes';
 }catch(e){if(!slot.isConnected||owner!==user?.id)return;delete slot.dataset.loaded;slot.innerHTML=`<button data-load-media="${p.id}" data-index="${p.media.indexOf(f)}">첨부를 불러오지 못했어요. 다시 시도</button>`;}
}
async function handleClick(e){const b=e.target.closest('button');if(!b||b.disabled)return;try{
if(b.dataset.acceptInvite||b.dataset.declineInvite){const row=b.closest('article');if(row.dataset.busy)return;row.dataset.busy='yes';row.querySelectorAll('button').forEach(x=>x.disabled=true);try{const accepted=!!b.dataset.acceptInvite,data=await invitationApi(accepted?'accept':'decline',{id:b.dataset.acceptInvite||b.dataset.declineInvite});if(accepted){await reloadRooms();route(data.room_id);notify('그룹에 가입했어요.');}else{await loadInvitations();notify('초대를 거절했어요.');}}finally{delete row.dataset.busy;row.querySelectorAll('button').forEach(x=>x.disabled=false);}return;}
if(b.dataset.action==='mine'){onlyMine=!onlyMine;epoch++;directoryLoading=false;clearTimeout(refreshTimer);b.textContent=onlyMine?'전체 그룹':'내 그룹';b.setAttribute('aria-pressed',String(onlyMine));b.setAttribute('aria-label',onlyMine?'전체 그룹 보기':'내 그룹만 보기');if(onlyMine)drawDirectory();else{directory=[];directoryHasMore=false;const box=$('#directory');signatures.delete(box);box.innerHTML='<p class="empty">불러오는 중…</p>';await loadDirectory();}return;}
 if(b.dataset.room!==undefined){route(b.dataset.room||null);return;}
if(b.dataset.request||b.dataset.cancelRequest){b.disabled=true;await api(b.dataset.request?'request':'cancel_request',{room_id:b.dataset.request||b.dataset.cancelRequest});notify(b.dataset.request?'가입 신청을 보냈어요.':'가입 신청을 취소했어요.');await loadDirectory();return;}
if(b.dataset.view){view=b.dataset.view;render();await loadFeed();return;}
if(b.dataset.filter){filter=b.dataset.filter;render();await loadFeed();return;}
if(b.dataset.date){date=b.dataset.date;await loadFeed();return;}
if(b.dataset.month){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+Number(b.dataset.month),1)).toISOString().slice(0,7);date='';await loadFeed();return;}
if(b.dataset.loadMedia){const p=posts.find(p=>p.id===b.dataset.loadMedia);await loadMedia(b.parentElement,p,p.media[+b.dataset.index]);return;}
if(b.dataset.edit){compose(posts.find(p=>p.id===b.dataset.edit));return;}
if(b.dataset.delete){const p=posts.find(p=>p.id===b.dataset.delete);confirmAction('이 기록을 삭제할까요?','첨부와 댓글도 함께 삭제돼요.',async()=>{const result=await api('remove',{id:p.id});await removeFiles(result.media.flatMap(f=>[f.path,f.preview_path]));await loadFeed();notify('삭제했어요.');});return;}
if(b.dataset.comments){b.disabled=true;await comments(posts.find(p=>p.id===b.dataset.comments));return;}
 if(b.dataset.report){const p=posts.find(p=>p.id===b.dataset.report);if(p)reportPost(p);return;}
switch(b.dataset.action){case 'age-leave':{const r=currentRoom();if(r)confirmAction('그룹을 나갈까요?','다시 가입할 때 연령 조건을 확인해요.',async()=>{await api('leave',{room_id:r.id});await reloadRooms();route();});break;}case 'home':route();break;case 'create':createRoom();break;case 'compose':compose();break;case 'manage':b.disabled=true;await manage();break;case 'share':{const r=currentRoom();if(r&&!r.deleting){b.disabled=true;await shareInvitation(r);}break;}case 'share-page':b.disabled=true;await sharePage(currentRoom());break;case 'refresh':await refresh();break;case 'clear-date':date='';await loadFeed();break;case 'resume-delete':await deleteRoom(currentRoom());break;}
}catch(err){notify(failure(err));}finally{if(b.isConnected)b.disabled=false;}}
function confirmAction(title,message,fn){const d=dialog(title,`<p class="muted">${esc(message)}</p><p class="error" role="alert"></p><div class="dialog-foot"><button data-no>취소</button><button class="primary" data-yes>확인</button></div>`);d.querySelector('[data-no]').onclick=()=>d.close();d.querySelector('[data-yes]').onclick=async e=>{e.target.disabled=true;try{await fn();d.close();}catch(err){d.querySelector('.error').textContent=failure(err);e.target.disabled=false;}};}
function reportPost(p){const d=dialog("게시글 신고",`<form><p class="muted">관리자가 글과 첨부, 댓글을 확인해요.</p><label class="field">신고 이유<textarea name="reason" required maxlength="300" placeholder="신고 이유를 적어 주세요."></textarea></label><p class="error" role="alert"></p><div class="dialog-foot"><button class="primary">신고 보내기</button></div></form>`);const f=d.querySelector("form");f.onsubmit=async e=>{e.preventDefault();const button=f.querySelector("button");button.disabled=true;try{await rpc("group_report",{p_entry_id:p.id,p_reason:f.elements.reason.value.trim()});d.close();notify("신고가 접수됐어요.");}catch(err){f.querySelector(".error").textContent=failure(err);button.disabled=false;}};}
 function createRoom(){const requestId=uuid();const d=dialog('그룹 만들기',`<form id="room-form"><label class="field">그룹 이름<input name="name" required maxlength="60" placeholder="우리의 주말"></label><br><label class="field">그룹 소개<textarea name="description" maxlength="300" placeholder="그룹 소개"></textarea></label>${Age.fields()}<p class="hint">이름·소개 공개 · 게시물은 그룹원과 운영 관리자만 열람할 수 있어요.</p><p class="error" role="alert"></p><div class="dialog-foot"><button class="primary">만들기</button></div></form>`);Age.bind(d.querySelector('form'));d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,btn=f.querySelector('button');if(!f.reportValidity())return;if(btn.disabled)return;btn.disabled=true;try{await api('create_room',{...Object.fromEntries(new FormData(f)),id:requestId});await reloadRooms();d.close();directoryQuery='';route();notify('그룹을 만들었어요.');}catch(err){f.querySelector('.error').textContent=failure(err);}finally{btn.disabled=false;}};}
function paintInvitations(rows){const box=$('#group-invitations');if(!box)return;const signature=JSON.stringify(rows);if(signatures.get(box)===signature)return;signatures.set(box,signature);box.hidden=onlyMine||!rows.length;box.innerHTML=rows.length?`<h3>받은 초대</h3>${rows.map(i=>`<article class="post"><h3>${esc(i.group_name)}</h3>${Age.badge(i)}${Age.note(i)}<p class="muted">${esc(i.sender_name)}님의 초대</p><div class="actions"><button class="primary" data-accept-invite="${i.id}" ${i.age_eligible===false?'disabled':''}>수락</button><button data-decline-invite="${i.id}">거절</button></div></article>`).join('')}`:'';}
async function loadInvitations(){const box=$('#group-invitations');if(!box)return;const ticket=++invitationRun;try{const rows=await invitationApi('received');if(!box.isConnected||ticket!==invitationRun)return;paintInvitations(rows);}catch(e){if(box.isConnected&&ticket===invitationRun)notify(failure(e));}}
async function showSharedInvitation(){const code=sharedCode();if(!code)return;try{const data=await invitationApi('preview_link',{code});if(sharedCode()!==code)return;const d=dialog('그룹 초대',`<h3>${esc(data.group_name)}</h3>${Age.badge(data)}${Age.note(data)}<p class="error" role="alert"></p><div class="dialog-foot"><button data-later>나중에</button><button class="primary" data-accept-link ${data.age_eligible===false?'disabled':''}>${data.member?'그룹 들어가기':'수락하고 가입'}</button></div>`);d.querySelector('[data-later]').onclick=()=>{d.close();history.replaceState(null,'',location.pathname);};d.querySelector('[data-accept-link]').onclick=async e=>{e.target.disabled=true;try{const result=await invitationApi('accept_link',{code});await reloadRooms();d.close();route(result.room_id);notify('그룹에 가입했어요.');}catch(err){d.querySelector('.error').textContent=failure(err);}finally{e.target.disabled=false;}};}catch(e){notify(failure(e));}}
async function inviteMembers(r){const d=dialog('회원 초대',`<form id="invite-search" class="actions"><input name="query" type="search" maxlength="60" placeholder="회원 닉네임 검색" aria-label="회원 닉네임 검색"><button class="primary">검색</button></form><p class="muted">최근 가입순</p><div id="invite-results" aria-live="polite"></div><button id="invite-more" hidden>더 보기</button><p class="error" role="alert"></p>`),form=d.querySelector('form'),box=d.querySelector('#invite-results'),more=d.querySelector('#invite-more');let searchRun=0,rows=[],query='',loading=false;
const card=m=>`<div class="member"><span>${esc(m.nickname)}</span><button data-send-invite="${m.user_id}" ${m.invited?'disabled':''}>${m.invited?'초대 보냄':'초대'}</button></div>`;
async function load(append=false){if(append&&loading)return;const ticket=++searchRun,last=append?rows.at(-1):null;loading=true;more.disabled=true;form.querySelector('button').disabled=true;d.querySelector('.error').textContent='';if(!append){rows=[];more.hidden=true;box.innerHTML='<p class="muted">불러오는 중…</p>';}
 try{const data=await invitationApi('search',{room_id:r.id,query,before:last?.created_at,before_id:last?.user_id});if(!d.isConnected||ticket!==searchRun)return;const incoming=data.slice(0,30);rows=append?[...new Map([...rows,...incoming].map(m=>[m.user_id,m])).values()]:incoming;box.innerHTML=rows.map(card).join('')||'<p class="muted">초대할 회원이 없어요.</p>';more.hidden=data.length<=30;}
 catch(err){if(d.isConnected&&ticket===searchRun){d.querySelector('.error').textContent=failure(err);if(!append)box.replaceChildren();}}
 finally{if(ticket===searchRun){loading=false;more.disabled=false;form.querySelector('button').disabled=false;}}
}
form.onsubmit=e=>{e.preventDefault();query=form.elements.query.value.trim();void load();};more.onclick=()=>void load(true);
box.onclick=async e=>{const b=e.target.closest('[data-send-invite]');if(!b||b.disabled)return;b.disabled=true;try{await invitationApi('send',{room_id:r.id,user_id:b.dataset.sendInvite});const row=rows.find(m=>m.user_id===b.dataset.sendInvite);if(row)row.invited=true;b.textContent='초대 보냄';notify('초대 알림을 보냈어요.');}catch(err){d.querySelector('.error').textContent=failure(err);b.disabled=false;}};
await load();}

async function sharePage(r){
 const url=location.origin+location.pathname+(r?'#room='+encodeURIComponent(r.id):'');
 const title=r?r.name+' · 오쭈다 그룹':'그룹 · 오쭈다 아지트';
 const message=r?r.name+' 그룹 페이지예요. 그룹원만 내용을 볼 수 있어요.':'오쭈다 아지트의 그룹 목록이에요.';
 if(navigator.share){try{await navigator.share({title,text:message,url});return;}catch(e){if(e?.name==='AbortError')return;}}
 try{await navigator.clipboard.writeText(url);notify(r?'페이지 링크를 복사했어요. 그룹원만 볼 수 있어요.':'페이지 링크를 복사했어요.');}
 catch{const d=dialog('페이지 공유','<p class="muted">링크를 길게 눌러 복사해 주세요.'+(r?' 그룹원만 볼 수 있어요.':'')+'</p><input id="page-share-link" readonly aria-label="페이지 링크">');const input=d.querySelector('#page-share-link');input.value=url;input.focus();input.select();}
}
async function shareInvitation(r){const owner=r.owner_id===user.id,d=dialog('초대 공유',`<p id="share-status" class="muted">링크를 준비하고 있어요…</p><input id="invite-link" readonly aria-label="초대 링크" hidden><p class="error" role="alert"></p><div class="actions"><button data-share-link class="primary" disabled>다른 앱으로 공유</button><button data-copy-link disabled>링크 복사</button>${owner?'<button data-renew-link disabled>링크 변경</button>':''}</div>`);let link='',name=r.name;
const prepare=async rotate=>{const data=await invitationApi('link',{room_id:r.id,rotate});link=location.origin+'/groups/#invite='+encodeURIComponent(data.code);name=data.group_name;d.querySelector('#invite-link').value=link;d.querySelector('#invite-link').hidden=false;d.querySelector('#share-status').textContent='링크에서 수락하면 가입';d.querySelectorAll('.actions button').forEach(b=>b.disabled=false);};
const copy=async()=>{try{await navigator.clipboard.writeText(link);notify('초대 링크를 복사했어요.');}catch{const input=d.querySelector('#invite-link');input.focus();input.select();d.querySelector('#share-status').textContent='링크를 길게 눌러 복사해 주세요.';}};
d.querySelector('[data-copy-link]').onclick=copy;
d.querySelector('[data-share-link]').onclick=async()=>{if(!navigator.share){await copy();return;}try{await navigator.share({title:name+' · 오쭈다 그룹 초대',text:name+' 그룹에 초대해요.',url:link});}catch(e){if(e.name!=='AbortError')await copy();}};
d.querySelector('[data-renew-link]')?.addEventListener('click',()=>confirmAction('초대 링크를 바꿀까요?','기존 링크는 사용할 수 없어요.',async()=>{await prepare(true);notify('초대 링크를 변경했어요.');}));
try{await prepare(false);}catch(e){d.querySelector('.error').textContent=failure(e);d.querySelector('#share-status').textContent='링크를 불러오지 못했어요.';}}
async function manage(){const run=navigationRun,r=currentRoom();if(!r)return;const owner=r.owner_id===user.id;const [members,requests]=await Promise.all([api('members',{room_id:r.id}),owner?api('requests',{room_id:r.id}):[]]);if(run!==navigationRun||currentRoom()?.id!==r.id)return;const d=dialog('그룹 관리',`${owner?`<form id="rename-form"><label class="field">그룹 이름<input name="name" required maxlength="60" value="${esc(r.name)}"></label><br><label class="field">소개<textarea name="description" maxlength="300">${esc(r.description)}</textarea></label>${Age.fields(r,true)}<div class="dialog-foot"><button>그룹 설정 저장</button></div></form><div class="actions"><button data-invite>회원 초대</button><button data-share>초대 공유</button></div><section><h3>가입 신청 <span class="metadata">${requests.length}명</span></h3>${requests.map(m=>`<div class="member"><span>${esc(m.nickname)}</span><button data-approve="${m.user_id}" class="primary">승인</button><button data-reject="${m.user_id}">거절</button></div>`).join('')||'<p class="muted">대기 중인 신청이 없어요.</p>'}</section>`:''}<section><h3>그룹원 ${members.length}명</h3>${members.map(m=>`<div class="member"><span>${esc(m.nickname)}${m.user_id===r.owner_id?' · 방장':''}${m.user_id===user.id?' · 나':''}</span>${owner&&m.user_id!==user.id?`<button data-transfer="${m.user_id}">방장 위임</button><button data-kick="${m.user_id}" class="danger">추방</button>`:''}</div>`).join('')}</section><p class="error" role="alert"></p><div class="dialog-foot">${owner?'<button class="danger" data-delete-room>그룹 삭제</button>':'<button class="danger" data-leave>그룹 나가기</button>'}</div>`);
Age.bind(d.querySelector('#rename-form'));
const report=err=>d.querySelector('.error').textContent=failure(err);
d.querySelector('#rename-form')?.addEventListener('submit',async e=>{e.preventDefault();if(!e.target.reportValidity())return;const b=e.target.querySelector('button');if(b.disabled)return;b.disabled=true;try{await api('rename',{room_id:r.id,...Object.fromEntries(new FormData(e.target))});await refresh();notify('그룹 설정을 변경했어요.');}catch(err){report(err);}finally{b.disabled=false;}});
d.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled||b.type==='submit'&&b.closest('form'))return;const act=['approve','reject','transfer','kick','leave','invite','share','deleteRoom'].find(a=>b.dataset[a]!==undefined);if(!act)return;const controls=['approve','reject'].includes(act)?[...b.closest('.member').querySelectorAll('button')]:[b];controls.forEach(x=>x.disabled=true);const target=b.dataset[act],p={room_id:r.id,user_id:target};
const perform=async()=>{await api(act,p);await refresh();d.close();if(['approve','reject','kick'].includes(act))await manage();};
try{if(act==='invite'){await inviteMembers(r);}else if(act==='share'){await shareInvitation(r);}
else if(act==='deleteRoom')confirmAction('그룹을 삭제할까요?','모든 글·일정·댓글·첨부가 삭제되며 되돌릴 수 없어요.',async()=>{d.close();await deleteRoom(r);});
else if(act==='transfer')confirmAction('방장을 위임할까요?','선택한 그룹원에게 모든 관리 권한을 넘겨요. 나는 일반 그룹원이 돼요.',perform);
else if(act==='kick')confirmAction('이 그룹원을 추방할까요?','그룹을 볼 수 없게 되며 기존 초대 링크도 사용할 수 없어요.',perform);
else if(act==='leave')confirmAction('그룹을 나갈까요?','다시 들어오려면 가입 승인이 필요해요.',perform);
else{await perform();}}catch(err){report(err);}finally{controls.forEach(x=>{if(x.isConnected)x.disabled=false;});}});}
async function deleteRoom(r){const d=dialog('그룹 삭제 중',`<p role="status">첨부 파일을 정리하고 있어요…</p><p class="error"></p>`);try{await api('delete_room',{room_id:r.id});for(;;){const paths=await api('deletion_files',{room_id:r.id});if(!paths.length)break;const {error}=await client.storage.from(bucket).remove(paths);if(error)throw error;}await api('finish_delete',{room_id:r.id});d.close();roomId=null;history.replaceState(null,'',location.pathname);await refresh();notify('그룹을 삭제했어요.');}catch(e){d.querySelector('.error').textContent='삭제가 중단됐어요. 그룹의 ‘삭제 계속하기’로 다시 진행해 주세요. '+failure(e);await refresh();throw e;}}
async function removeFiles(paths){const files=[...new Set(paths.filter(Boolean))];if(!files.length)return;const {error}=await client.storage.from(bucket).remove(files);clearMedia(true);if(error)notify('기록은 저장됐지만 일부 이전 첨부 정리가 지연됐어요.');}
function compose(existing){const available=activeRooms();if(!available.length){createRoom();return;}let saved=existing?.media?.map(x=>({...x}))||[],files=[],previewUrls=[],busy=false,entryId=existing?.id||uuid(),uploaded=[],published=false;
const dt=v=>v?new Date(new Date(v).getTime()+9*3600000).toISOString().slice(0,16):today()+'T12:00';
const d=dialog(existing?'기록 수정':'우리 그룹에 올리기',`<form id="composer"><label class="field">그룹<select name="room_id" ${existing?'disabled':''}>${available.map(r=>`<option value="${r.id}" ${r.id===(existing?.room_id||roomId)?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><br><div class="two"><label class="field">종류<select name="kind">${[['post','글 · 사진 · 동영상'],['event','약속'],['trip','여행계획']].map(([v,t])=>`<option value="${v}" ${existing?.kind===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="field">제목<input name="title" maxlength="120" value="${esc(existing?.title)}" placeholder="제목"></label></div><section id="schedule-fields" hidden><br><label class="check"><input type="checkbox" name="all_day" ${existing?.all_day?'checked':''}> 종일 일정</label><br><div class="two"><label class="field">시작<input name="starts_at" type="datetime-local" value="${dt(existing?.starts_at)}"></label><label class="field">종료<input name="ends_at" type="datetime-local" value="${dt(existing?.ends_at)}"></label></div><br><label class="field">장소<input name="location" maxlength="200" value="${esc(existing?.location)}" placeholder="장소"></label><p class="hint">한국 시간 기준</p></section><br><label class="field">내용<textarea name="body" maxlength="10000" placeholder="내용을 입력하세요.">${esc(existing?.body)}</textarea></label><br><label class="file-picker">＋ 사진 · 동영상 함께 선택<input id="files" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/x-m4v" multiple></label><p class="hint">첨부 10개 · 50MB/개 · 총 200MB</p><div class="attachment-list" id="attachments"></div><p class="error" role="alert"></p><p id="upload-status" class="muted" role="status"></p><div class="dialog-foot"><button type="submit" class="primary">${existing?'저장하기':'올리기'}</button></div></form>`),form=d.querySelector('form');
function schedule(){const on=form.elements.kind.value!=='post';d.querySelector('#schedule-fields').hidden=!on;form.elements.title.required=on;for(const name of ['starts_at','ends_at']){const el=form.elements[name],value=el.value;el.type=form.elements.all_day.checked?'date':'datetime-local';el.value=form.elements.all_day.checked?value.slice(0,10):(value.includes('T')?value:value+'T12:00');el.required=on;}}
form.elements.kind.onchange=schedule;form.elements.all_day.onchange=schedule;schedule();
function attachments(){for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls=[];const all=[...saved,...files];d.querySelector('#attachments').innerHTML=all.map((f,i)=>{let preview='';if(f instanceof File){const url=URL.createObjectURL(f);previewUrls.push(url);preview=f.type.startsWith('image/')?`<img src="${url}" alt="">`:'<span aria-hidden="true">▶</span>';}return `<div class="attachment">${preview}<span>${esc(f.name)}</span><button type="button" data-remove-file="${i}" aria-label="${esc(f.name)} 첨부 제거">✕</button></div>`;}).join('');}
d.querySelector('#files').onchange=e=>{const incoming=[...e.target.files];e.target.value='';const all=[...saved,...files,...incoming];if(all.length>10||all.reduce((s,f)=>s+f.size,0)>209715200||incoming.some(f=>!types[f.type]||f.size>52428800||f.size===0)){form.querySelector('.error').textContent='사진·동영상은 10개, 파일당 50MB, 전체 200MB 이내로 선택해 주세요.';return;}form.querySelector('.error').textContent='';files.push(...incoming);attachments();};
d.addEventListener('click',e=>{const b=e.target.closest('[data-remove-file]');if(!b||busy)return;const i=+b.dataset.removeFile;if(i<saved.length)saved.splice(i,1);else files.splice(i-saved.length,1);attachments();});attachments();
const draftSnapshot=()=>JSON.stringify({fields:[...new FormData(form)],media:saved.map(f=>f.path),files:files.map(f=>[f.name,f.size,f.lastModified])}),initialDraft=draftSnapshot();
const dirty=()=>draftSnapshot()!==initialDraft;
d.requestDismiss=()=>{if(busy)return;if(dirty())confirmAction('작성 중인 내용을 지울까요?','',()=>d.close());else d.close();};
const protectUnload=e=>{if(d.isConnected&&(busy||dirty())){e.preventDefault();e.returnValue='';}};
window.addEventListener('beforeunload',protectUnload);
d.addEventListener('cancel',e=>{e.preventDefault();d.requestDismiss();});d.querySelector('[data-close]').onclick=d.requestDismiss;d.addEventListener('close',()=>{window.removeEventListener('beforeunload',protectUnload);for(const url of previewUrls)URL.revokeObjectURL(url);});
form.onsubmit=async e=>{e.preventDefault();if(busy)return;const fields=Object.fromEntries(new FormData(form));fields.room_id=existing?.room_id||fields.room_id;fields.all_day=form.elements.all_day.checked;fields.id=entryId;fields.updated_at=existing?.updated_at;fields.media=[...saved];if(fields.kind!=='post'){fields.starts_at=fields.starts_at+(fields.all_day?'T00:00:00+09:00':':00+09:00');fields.ends_at=fields.ends_at+(fields.all_day?'T23:59:59+09:00':':00+09:00');if(Date.parse(fields.ends_at)<Date.parse(fields.starts_at)){form.querySelector('.error').textContent='종료 날짜는 시작 날짜 이후로 정해 주세요.';return;}}else{fields.starts_at=null;fields.ends_at=null;fields.location='';}
if(!fields.title.trim()&&!fields.body.trim()&&!saved.length&&!files.length){form.querySelector('.error').textContent='글을 쓰거나 사진·동영상을 선택해 주세요.';return;}busy=true;form.querySelector('.error').textContent='';form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);uploaded=[];
try{
 for(let i=0;i<files.length;i++){
  const file=files[i],base=`${user.id}/${fields.room_id}/${entryId}/${uuid()}`,path=`${base}.${types[file.type]}`;
  d.querySelector('#upload-status').textContent=`첨부 ${i+1}/${files.length} 미리보기 준비 중…`;
  const preview=await makePreview(file);
  if(preview){
   const thumbPath=`${base}.thumb.webp`;
   const {error:thumbError}=await client.storage.from(bucket).upload(thumbPath,preview,{contentType:'image/webp',upsert:false,cacheControl:'0'});
   if(!thumbError)uploaded.push(thumbPath);
  }
  d.querySelector('#upload-status').textContent=`첨부 ${i+1}/${files.length} 원본 올리는 중…`;
  const {error}=await client.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false,cacheControl:'0'});
  if(error)throw error;
  uploaded.push(path);fields.media.push({path,name:file.name});
 }
 d.querySelector('#upload-status').textContent='기록을 저장하고 있어요…';
 const result=await api('save',fields);published=true;
 const retained=new Set(result.media.flatMap(f=>[f.path,f.preview_path].filter(Boolean)));
 await removeFiles(uploaded.filter(path=>!retained.has(path)));
 if(existing)await removeFiles(existing.media.filter(x=>!saved.some(f=>f.path===x.path)).flatMap(f=>[f.path,f.preview_path]));
 d.close();roomId=fields.room_id;date='';query='';filter='all';history.replaceState(null,'','#room='+roomId);await refresh();notify(existing?'수정했어요.':'그룹에 올렸어요.');
}
catch(err){if(!published)await removeFiles(uploaded);form.querySelector('.error').textContent=failure(err);d.querySelector('#upload-status').textContent='';}
finally{busy=false;form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);if(existing)form.elements.room_id.disabled=true;}};
}
async function comments(p){const d=dialog('댓글',`<div id="comment-list"></div><button id="older-comments" hidden>이전 댓글 더 보기</button><form><label class="field">댓글 남기기<textarea name="body" required maxlength="2000" placeholder="댓글을 입력하세요."></textarea></label><p class="error" role="alert"></p><div class="dialog-foot"><button class="primary">등록</button></div></form>`);let rows=[],requestId=uuid(),listRun=0,appendBusy=false;
async function load(append=false){if(append&&appendBusy)return;const ticket=++listRun;appendBusy=true;d.querySelector('#older-comments').disabled=true;try{const last=append?rows.at(-1):null,data=await api('comments',{id:p.id,before:last?.created_at,before_id:last?.id});if(!d.isConnected||ticket!==listRun)return;rows=append?[...new Map([...rows,...data.slice(0,50)].map(c=>[c.id,c])).values()]:data.slice(0,50);d.querySelector('#comment-list').innerHTML=rows.map(c=>`<div class="comment"><div><b class="author">${esc(c.author_name)}</b><p>${esc(c.body)}</p><time>${dateText(c.created_at)}</time></div>${c.author_id===user.id?`<button class="danger" data-delete-comment="${c.id}">삭제</button>`:''}</div>`).join('')||'<p class="muted">첫 댓글을 남겨 보세요.</p>';d.querySelector('#older-comments').hidden=data.length<=50;}finally{if(ticket===listRun){appendBusy=false;d.querySelector('#older-comments').disabled=false;}}}
d.querySelector('#older-comments').onclick=()=>load(true).catch(e=>notify(failure(e)));d.addEventListener('click',async e=>{const b=e.target.closest('[data-delete-comment]');if(!b)return;b.disabled=true;try{await api('delete_comment',{comment_id:b.dataset.deleteComment});await load();}catch(err){notify(failure(err));b.disabled=false;}});
d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');if(b.disabled)return;b.disabled=true;try{await api('comment',{id:p.id,comment_id:requestId,body:f.elements.body.value});requestId=uuid();f.reset();await load();}catch(err){f.querySelector('.error').textContent=failure(err);}finally{b.disabled=false;}};d.addEventListener('close',()=>loadFeed());await load();}
async function initialize(){if(!window.supabase||!window.OJJUDA_CONFIG){gate('연결하지 못했어요. 새로고침해 주세요.');return;}client=window.supabase.createClient(window.OJJUDA_CONFIG.supabaseUrl,window.OJJUDA_CONFIG.supabaseKey);client.auth.onAuthStateChange((_event,session)=>{if(user&&session?.user?.id!==user.id){user=null;rooms=[];posts=[];gate('로그인 상태가 바뀌었어요. 다시 로그인해 주세요.');}});const ticket=++authEpoch;try{const {data,error}=await client.auth.getUser();if(error||!data.user||data.user.is_anonymous){gate();return;}if(ticket!==authEpoch)return;user=data.user;const match=location.hash.match(/^#room=([a-f0-9-]{36})$/);roomId=match?.[1]||null;if(roomId)await reloadRooms();render();if(roomId)await loadFeed();await showSharedInvitation();}catch(e){gate(failure(e));}}
window.addEventListener('popstate',()=>{if(!user)return;const top=[...document.querySelectorAll('dialog[open]')].at(-1);if(top){history.pushState(null,'',roomId?'#room='+roomId:location.pathname);if(top.requestDismiss)top.requestDismiss();else top.close();return;}navigationRun++;const match=location.hash.match(/^#room=([a-f0-9-]{36})$/);roomId=rooms.some(r=>r.id===match?.[1])?match[1]:null;date='';render();void loadFeed();void showSharedInvitation();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user&&!mutating&&!document.querySelector('dialog[open]'))void refresh({quiet:true});});
window.addEventListener('pagehide',()=>clearMedia(true));
setInterval(()=>{if(user&&!document.hidden&&!mutating&&!loading&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,textarea,select'))void refresh({quiet:true});},60000);
void initialize();
})();
