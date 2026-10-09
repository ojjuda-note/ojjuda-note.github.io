/* One admin inbox, with explicit server-verified review actions and private media previews. */
(()=>{
 'use strict';
 const labels={post:'우리집 글',card:'노트 카드',note_comment:'카드 답글',event:'이벤트',diary:'다이어리',image:'사진',video:'동영상',comment:'앨범 댓글',board_comment:'게시판 댓글',guestbook:'방명록',intro:'소개글',profile:'프로필',chat:'채팅',game_photo:'땅따먹기 사진',world_report:'신고',note_report:'카드 신고'};
 const states={all:'전체 콘텐츠',priority:'우선 검토',pending:'승인 대기',reports:'신고',risk:'위험 신호'};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;};
 const time=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 function mount({container,client,getAdminId,isCurrent=()=>container.isConnected,initialState=null,onChanged=()=>{},onNavigate=()=>{}}){
  const owner=getAdminId?.();let dead=false,run=0,loading=false,saving=false,cursor=null,more=false,rows=[],counts=null;
  let kind=initialState?.kind||'all',state=Object.hasOwn(states,initialState?.state)?initialState.state:'all',query=initialState?.query||'',snapshot=new Date().toISOString(),draft=null;
  const current=()=>!dead&&container.isConnected&&getAdminId?.()===owner&&isCurrent();
  const root=el('section','ri-root'),head=el('header','ri-heading'),stats=el('div','ri-stats'),controls=el('form','ri-controls'),list=el('div','ri-list'),status=el('p','ri-status');
  root.setAttribute('aria-label','통합 콘텐츠 관리');status.setAttribute('role','status');
  const button=(text,action,cls='btn sm')=>{const b=el('button',cls,text);b.type='button';b.onclick=()=>{if(current()&&!saving&&!loading)action();};return b;};
  const refresh=button('새로고침',()=>reload());head.append(el('div','',null),refresh);head.firstChild.append(el('h3','','통합 콘텐츠'),el('p','ri-help','승인 대기 · 신고 · 위험 신호를 먼저 확인하세요.'));
  const select=el('select','inp');select.setAttribute('aria-label','콘텐츠 종류');
  for(const [value,label] of [['all','모든 종류'],...Object.entries(labels)]){const o=el('option','',label);o.value=value;select.append(o);}select.value=kind;
  const search=el('input','inp');search.type='search';search.maxLength=200;search.placeholder='내용·제목·작성자 검색';search.setAttribute('aria-label','전체 콘텐츠 검색');search.value=query;
  const find=el('button','btn sm','검색');find.type='submit';controls.append(select,search,find);
  const next=button('더 보기',()=>load(true));next.hidden=true;
  root.append(head,stats,controls,status,list,next);container.replaceChildren(root);
  const dirty=()=>draft&&draft.input.value!==draft.original;
  function leave(){return !saving&&(!dirty()||window.confirm('수정 중인 내용을 버릴까요?'));}
  function say(text){if(current())status.textContent=text;}
  async function rpc(name,args){if(!current())throw Error('not_admin');const r=await client.rpc(name,args);if(!current())throw Error('not_admin');if(r.error)throw r.error;return r.data;}
  function summary(){
   stats.replaceChildren();
   for(const [key,label] of Object.entries(states)){
    const value=!counts?'—':key==='priority'?counts.pending+counts.reports+counts.risk:counts[key];
    const b=button('',()=>{if(!leave())return;state=key;draft=null;void reload(false);},'ri-stat');b.setAttribute('aria-pressed',String(state===key));
    b.append(el('strong','',value),el('span','',label));if(key!=='all')b.classList.add('ri-stat-priority');stats.append(b);
   }
  }
  async function signed(bucket,path){const {data,error}=await client.storage.from(bucket).createSignedUrl(path,600);if(error||!data?.signedUrl)throw error||Error('media');const u=new URL(data.signedUrl,location.href);if(!['https:','http:'].includes(u.protocol))throw Error('media');return u.href;}
  async function mediaPreview(row,host,ready=()=>{}){
   try{const url=await signed(row.bucket,row.kind==='game_photo'?row.full_path:row.path);if(!current()||!host.isConnected)return;
    const image=el('img','ri-thumb');image.alt=(labels[row.kind]||'콘텐츠')+' 미리보기';image.loading=row.priority<2?'eager':'lazy';
    image.onload=()=>{if(current()&&host.isConnected)ready();};image.onerror=()=>{if(current()&&host.isConnected)host.replaceChildren(el('p','ri-help','미리보기를 열지 못했어요. 새로고침해 주세요.'));};
    image.src=url;host.replaceChildren(image);
   }catch{if(current()&&host.isConnected)host.textContent='미리보기를 불러오지 못했어요.';}
  }
  async function change(row,action,reason=''){
   if(saving||!current()||!leave())return;
   saving=true;root.querySelectorAll('button,select,input').forEach(b=>b.disabled=true);say('처리 결과를 확인하고 있어요…');
   try{const result=await rpc('admin_review_action',{p_key:row.key,p_revision:row.revision,p_action:action,p_reason:reason});
    if(!result?.ok)throw Error(result?.reason||'failed');draft=null;saving=false;
    const loaded=await reload(false);say(loaded?'처리했어요. 남은 검토 항목을 갱신했습니다.':'처리는 완료됐지만 목록을 갱신하지 못했어요. 새로고침해 주세요.');
    try{onChanged();}catch{}
   }catch(e){say(e.message==='conflict'?'다른 곳에서 내용이나 상태가 바뀌었어요. 새로고침 후 확인해 주세요.':'처리하지 못했어요. 권한과 연결을 확인한 뒤 다시 시도해 주세요.');}
   finally{saving=false;if(current()){root.querySelectorAll('button,select,input').forEach(b=>b.disabled=false);root.querySelectorAll('[data-needs-photo]').forEach(b=>b.disabled=true);}}
  }
  async function commentEdit(row,details){
   if(!leave())return;let full;
   try{full=await rpc('admin_review_detail',{p_key:row.key});if(!full)throw Error('missing');}catch{say('최신 내용을 불러오지 못했어요.');return;}
   if(!current()||!details.isConnected)return;details.open=true;
   const form=el('form','ri-edit'),input=el('textarea');input.value=full.body;input.rows=8;input.setAttribute('aria-label','본문 수정');
   const save=el('button','btn pri sm','수정 저장');save.type='submit';const cancel=button('취소',()=>{if(leave()){draft=null;form.remove();}});
   form.append(input,save,cancel);details.append(form);draft={input,original:full.body};input.focus();
   form.onsubmit=async event=>{event.preventDefault();if(saving||!current()||!input.value.trim())return;saving=true;save.disabled=cancel.disabled=true;
    try{const result=await rpc('admin_house_content_edit',{p_kind:row.kind,p_id:row.id,p_body:input.value.replace(/\r\n?/g,'\n').trim(),p_revision:full.meta.revision});if(!result?.ok)throw Error(result?.reason||'failed');draft=null;saving=false;await reload(false);say('수정 내용을 저장했어요.');}
    catch(e){say(e.message==='conflict'?'내용이 바뀌었어요. 작성한 글을 복사하고 새로고침해 주세요.':'저장하지 못했어요. 입력 내용은 남아 있어요.');}
    finally{saving=false;if(current()){save.disabled=cancel.disabled=false;}}
   };
  }
  async function deleteComment(row){
   if(!leave()||!window.confirm('이 글·댓글을 삭제할까요? 공개 원문은 기존 보관 정책에 따라 보관되고 되돌릴 수 없습니다.'))return;saving=true;
   try{const full=await rpc('admin_review_detail',{p_key:row.key});if(!full)throw Error('missing');const result=await rpc('admin_house_content_delete',{p_kind:row.kind,p_id:row.id,p_revision:row.meta.revision});if(!result?.ok)throw Error(result?.reason||'failed');draft=null;saving=false;await reload(false);say('삭제했어요.');}
   catch(e){say(e.message==='conflict'?'내용이 변경되어 삭제하지 않았어요. 새로고침해 주세요.':'삭제하지 못했어요. 새로고침 후 확인해 주세요.');}finally{saving=false;}
  }
  function render(row){
   const card=el('article','ri-card');card.dataset.key=row.key;card.dataset.priority=row.priority;
   const meta=el('div','ri-meta');meta.append(el('span','ri-kind',labels[row.kind]||row.kind),el('strong','',row.author_nick||'알 수 없는 작성자'),el('time','',time(row.created_at)));
   if(row.priority<3)meta.prepend(el('span','ri-priority',row.priority===0?'신고 확인':row.priority===1?'승인 대기':'위험 신호 · 확인 필요'));
   if(row.is_private)meta.append(el('span','ri-private','비공개'));if(['hidden','rejected'].includes(row.status))meta.append(el('span','ri-private',row.status==='hidden'?'숨김':'반려'));
   card.append(meta);if(row.title)card.append(el('h4','',row.title));
   const layout=el('div','ri-card-content'),body=el('p','ri-excerpt',row.body||'사진 내용을 확인해 주세요.');layout.append(body);card.append(layout);
   const preview=row.bucket&&row.path?el('div','ri-preview'):null;if(preview)layout.prepend(preview);
   const details=el('details','ri-detail'),summary=el('summary','','전체 내용 보기');details.append(summary);card.append(details);let detailLoaded=false;
   details.ontoggle=async()=>{if(!details.open||detailLoaded)return;detailLoaded=true;const target=el('div','ri-full','불러오는 중이에요…');details.append(target);
    try{const full=await rpc('admin_review_detail',{p_key:row.key});if(!current()||!target.isConnected)return;if(!full)throw Error('missing');target.replaceChildren(el('p','ri-body',full.body||''));
     if(full.bucket&&full.full_path){const url=await signed(full.bucket,full.full_path);if(!current()||!target.isConnected)return;const media=el(full.kind==='video'?'video':'img','ri-full-media');media.src=url;if(full.kind==='video'){media.controls=true;media.playsInline=true;media.preload='metadata';}else media.alt='전체 사진';target.append(media);}
    }catch{if(current()&&target.isConnected){target.textContent='내용을 불러오지 못했어요. 접었다가 다시 열어 주세요.';detailLoaded=false;}}
   };
   const actions=el('div','ri-actions');card.append(actions);
   if(row.kind==='game_photo'&&row.meta.visibility==='public'){
    const choices=[];for(const [action,label] of [['approved','승인 · 공개'],['rejected','반려'],['hidden','숨김']])if(row.status!==action){const b=button(label,()=>change(row,action));b.disabled=true;b.dataset.needsPhoto='true';choices.push(b);actions.append(b);}
    if(preview)void mediaPreview(row,preview,()=>choices.forEach(b=>{delete b.dataset.needsPhoto;b.disabled=saving;}));
   }else if(preview)void mediaPreview(row,preview);
   if(['world_report','note_report'].includes(row.kind)){
    actions.append(button('확인 완료',()=>change(row,'reviewed')));
    if(row.kind==='world_report')actions.append(button('조치 완료',()=>change(row,'actioned')));
   }else if(row.priority===2)actions.append(button('검토 완료',()=>change(row,'reviewed')));
   if(['card','note_comment','event'].includes(row.kind)){
    actions.append(button(row.status==='hidden'?'숨김 해제':'숨김',()=>{if(!leave())return;const reason=window.prompt('처리 사유를 적어 주세요.');if(reason?.trim().length>=3)void change(row,row.status==='hidden'?'visible':'hidden',reason.trim());}));
   }
   if(['post','comment','board_comment'].includes(row.kind))actions.append(button('수정',()=>commentEdit(row,details)),button('삭제',()=>deleteComment(row),'btn sm danger'));
   actions.append(button('세부 관리',()=>{if(leave())onNavigate(row);}));list.append(card);
  }
  async function load(append=false){
   if(!current()||loading||saving)return false;const version=++run;loading=true;select.disabled=search.disabled=find.disabled=true;refresh.disabled=next.disabled=true;list.setAttribute('aria-busy','true');say('콘텐츠를 불러오는 중이에요…');
   try{const data=await rpc('admin_review_feed',{p_kind:kind,p_state:state,p_q:query,p_cursor:append?cursor:null,p_snapshot:snapshot,p_limit:30});if(version!==run||!current())return false;
    if(!data||!Array.isArray(data.items))throw Error('invalid_response');if(!append){rows=[];list.replaceChildren();}const additions=data.items.filter(r=>!rows.some(old=>old.key===r.key));rows.push(...additions);additions.forEach(render);counts=data.counts;cursor=data.next_cursor;more=!!data.has_more;
    summary();next.hidden=!more;say(`${Number(counts.matched).toLocaleString('ko-KR')}건 중 ${rows.length}건 표시 · 검토가 필요한 항목부터 보여요.`);return true;
   }catch{if(current()&&version===run){if(!append){rows=[];counts=null;list.replaceChildren();summary();}next.hidden=true;say('콘텐츠를 불러오지 못했어요. 관리자 권한과 연결을 확인하고 새로고침해 주세요.');}return false;}
   finally{loading=false;if(current()&&version===run){select.disabled=search.disabled=find.disabled=false;refresh.disabled=next.disabled=false;list.setAttribute('aria-busy','false');}}
  }
  function reload(confirm=true){if(confirm&&!leave())return Promise.resolve(false);draft=null;snapshot=new Date().toISOString();return load(false);}
  select.onchange=()=>{if(!leave()){select.value=kind;return;}kind=select.value;void reload(false);};
  controls.onsubmit=event=>{event.preventDefault();if(!leave())return;query=search.value.trim();void reload(false);};
  const beforeUnload=event=>{if(saving||dirty()){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  summary();if(owner)void load();else say('관리자 계정으로 열어 주세요.');
  return {refresh:reload,getState:()=>({kind,state,query}),canLeave:()=>!saving,hasDraft:()=>!!dirty(),destroy(){dead=true;run++;root.querySelectorAll('video').forEach(v=>v.pause());window.removeEventListener('beforeunload',beforeUnload);container.replaceChildren();}};
 }
 window.OjjudaReviewInbox={mount};
})();
