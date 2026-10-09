/* Active house text and album comments. Owner trash is never requested here. */
(() => {
  'use strict';
  const labels = {post:'우리집 글',comment:'앨범 댓글',board_comment:'게시판 댓글'};
  const visibility = {all:'전체 공개',friends:'친구 공개',chosen:'고른 친구 공개',me:'나만 보기'};
  const el = (tag, className, text) => {
    const node=document.createElement(tag);if(className)node.className=className;
    if(text!==undefined)node.textContent=text;return node;
  };
  const date = value => Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '시간 확인 필요';
  function mount(host,{client,getAdminId,isCurrent=()=>host.isConnected,onChanged=()=>{}}={}) {
    let owner=getAdminId?.(),destroyed=false,run=0,loading=false,saving=false;
    let rows=[],cursor=null,more=false,kind='all',filter='all',query='',editing=null,confirming=null,status='',failure=false;
    const current=()=>!destroyed&&host.isConnected&&isCurrent()&&!!owner&&getAdminId?.()===owner;
    const hasDraft=()=>!!editing&&editing.body!==editing.original;
    const say=(text,bad=false)=>{status=text;failure=bad;};
    const message=error=>{
      const text=String(error?.message||error||'');
      if(/not_admin|42501|permission denied/i.test(text))return '관리자 권한을 다시 확인해 주세요.';
      if(/banned_word/.test(text))return '본문에 사용할 수 없는 표현이 있어요. 고친 뒤 저장해 주세요.';
      if(/house_admin_bad_body/.test(text))return '내용을 입력해 주세요. 우리집 글은 4,000자까지 적을 수 있어요.';
      if(/Could not find|schema cache|does not exist/i.test(text))return '우리집 관리 기능을 아직 불러올 수 없어요. 잠시 후 다시 시도해 주세요.';
      return '처리하지 못했어요. 입력 내용은 남아 있으니 연결을 확인하고 다시 시도해 주세요.';
    };
    const canLeave=()=>!saving;
    function confirmLeave() {
      if(saving){say('저장·삭제 결과를 확인하고 있어요. 잠시 기다려 주세요.');render();return false;}
      return !hasDraft()||window.confirm('수정 중인 내용을 버리고 이동할까요?');
    }
    const button=(text,action,tone='')=>{
      const node=el('button',`hc-button ${tone}`,text);node.type='button';node.disabled=saving||loading;
      node.addEventListener('click',()=>{if(current()&&!saving&&!loading)action();});return node;
    };
    async function rpc(name,args) {
      if(!current())throw new Error('not_admin');
      const result=await client.rpc(name,args);
      if(!current())throw new Error('not_admin');
      if(result.error)throw result.error;return result.data;
    }
    async function load(append=false) {
      if(!current()||saving)return false;
      const request=++run;loading=true;say('불러오는 중이에요.');render();
      try {
        const data=await rpc('admin_house_content_feed',{p_kind:kind,p_filter:filter,p_q:query,p_cursor:append?cursor:null,p_limit:30});
        if(!current()||request!==run)return false;
        if(!data||!Array.isArray(data.items))throw new Error('bad_response');
        rows=append?[...rows,...data.items.filter(item=>!rows.some(old=>old.kind===item.kind&&old.id===item.id))]:data.items;
        cursor=data.next_cursor||null;more=!!data.has_more&&!!cursor;
        say(rows.length?`${rows.length}건을 불러왔어요.`:'조건에 맞는 글·댓글이 없어요.');
      } catch(error) {
        if(!current()||request!==run)return false;
        if(/not_admin|42501|permission denied/i.test(String(error?.message||error||'')))rows=[];
        say(message(error),true);return false;
      } finally {
        if(current()&&request===run){loading=false;render();}
      }
      return true;
    }
    async function refresh() {
      if(!current()||!confirmLeave())return false;editing=null;confirming=null;return load();
    }
    function choose(nextKind,nextFilter) {
      if(!confirmLeave())return;kind=nextKind;filter=nextFilter;editing=null;confirming=null;rows=[];cursor=null;more=false;load();
    }
    async function mutate(row,action) {
      if(!current()||saving||loading)return;
      const body=editing?.body.trim();
      if(action==='edit'&&(!body||(row.kind==='post'&&body.length>4000))){say('본문 길이를 확인해 주세요.',true);render();return;}
      ++run;loading=false;saving=true;say(action==='edit'?'저장하고 있어요.':'삭제하고 있어요.');render();
      try {
        const args={p_kind:row.kind,p_id:row.id,p_revision:action==='edit'?editing.revision:row.revision};if(action==='edit')args.p_body=body;
        const result=await rpc(`admin_house_content_${action}`,args);
        if(!current())return;
        if(!result?.ok){
          if(result?.reason==='missing')throw new Error('missing');
          if(result?.reason==='conflict')throw new Error('conflict');
          throw new Error('bad_response');
        }
        editing=null;confirming=null;saving=false;rows=[];cursor=null;more=false;
        // Reload current filters so committed deletions and changed risk matches are never shown as old rows.
        const loaded=await load();if(!current())return;
        say(!loaded?(action==='edit'?'수정은 저장됐지만 목록을 불러오지 못했어요. 새로고침해 주세요.':'삭제는 완료됐지만 목록을 불러오지 못했어요. 새로고침해 주세요.'):action==='edit'?'수정했어요.':result.archived?'삭제했어요. 공개 원문은 보관함에서 30일간 확인할 수 있어요.':'삭제했어요. 비공개·보관 제외 원문은 따로 남기지 않았어요.',!loaded);render();
        // Optional surrounding summaries must not turn a committed mutation into a failure.
        try{await onChanged({kind:row.kind,id:row.id,action,archived:!!result.archived});}catch(_){}
      } catch(error) {
        if(!current())return;
        const text=String(error?.message||error||'');
        say(text==='conflict'?'다른 곳에서 내용이 바뀌었어요. 작성한 내용을 복사해 두고 새로고침해 주세요.':text==='missing'?'이미 삭제되거나 휴지통으로 옮겨진 글이에요. 새로고침해 주세요.':message(error),true);
      } finally {if(current()){saving=false;render();}}
    }
    function render() {
      if(!current())return;
      const root=el('section','hc-root');root.setAttribute('aria-label','우리집 글·댓글 관리');
      const head=el('div','hc-heading');head.append(el('h3','','우리집 글·댓글'),button('새로고침',refresh));root.append(head);
      root.append(el('p','hc-note','현재 남아 있는 우리집 글, 앨범 댓글과 게시판 댓글을 관리해요. 작성자가 휴지통으로 옮긴 글은 표시하지 않아요.'));
      const kinds=el('div','hc-filters');kinds.setAttribute('aria-label','종류');
      for(const [key,label] of [['all','전체'],['post','우리집 글'],['comment','앨범 댓글'],['board_comment','게시판 댓글']]){const b=button(label,()=>choose(key,filter));b.setAttribute('aria-pressed',String(kind===key));kinds.append(b);}root.append(kinds);
      const filters=el('div','hc-filters');filters.setAttribute('aria-label','공개·위험신호 필터');
      for(const [key,label] of [['all','전체 범위'],['public','공개'],['private','비공개'],['risk','위험 신호']]){const b=button(label,()=>choose(kind,key));b.setAttribute('aria-pressed',String(filter===key));filters.append(b);}root.append(filters);
      const form=el('form','hc-search'),search=el('input');search.type='search';search.maxLength=100;search.value=query;search.placeholder='작성자·방 주인·내용 검색';search.setAttribute('aria-label','우리집 글·댓글 검색');search.disabled=saving||loading;
      const submit=el('button','hc-button','찾기');submit.type='submit';submit.disabled=saving||loading;form.append(search,submit);
      form.addEventListener('submit',event=>{event.preventDefault();if(!current()||saving||loading||!confirmLeave())return;query=search.value.trim();editing=null;confirming=null;rows=[];cursor=null;more=false;load();});root.append(form);
      const feedback=el('p',`hc-status${failure?' hc-error':''}`,status);feedback.setAttribute('role',failure?'alert':'status');root.append(feedback);
      const list=el('div','hc-list');list.setAttribute('aria-busy',String(loading||saving));
      for(const row of rows){
        const card=el('article','hc-card');card.dataset.kind=row.kind;card.dataset.id=row.id;
        const meta=el('div','hc-meta');meta.append(el('span','hc-tag',labels[row.kind]||'글'),el('strong','',row.author_nick||'알 수 없음'));
        if(row.author_id!==row.owner_id)meta.append(el('span','',`→ ${row.owner_nick||'알 수 없음'}님의 방`));
        meta.append(el('time','',date(row.created_at)));if(row.is_risk)meta.append(el('span','hc-tag hc-risk','위험 신호'));card.append(meta);
        card.append(el('p','hc-note',`${row.is_private?'비공개 · ':''}${visibility[row.visibility]||'공개 범위 확인'}${row.folder_name?' · 폴더 '+row.folder_name:''}`));
        const active=editing?.kind===row.kind&&editing?.id===row.id;
        if(active){
          const label=el('label','hc-edit-label',`${labels[row.kind]} 본문`),textarea=el('textarea','hc-editor');textarea.value=editing.body;if(row.kind==='post')textarea.maxLength=4000;textarea.rows=row.kind==='post'?8:4;textarea.disabled=saving;label.append(textarea);card.append(label);
          const count=el('p','hc-note',`${editing.body.length}${row.kind==='post'?' / 4000':''}자`);textarea.addEventListener('input',()=>{editing.body=textarea.value;count.textContent=`${textarea.value.length}${row.kind==='post'?' / 4000':''}자`;});card.append(count);
          const actions=el('div','hc-actions');actions.append(button('취소',()=>{if(confirmLeave()){editing=null;render();}}),button('저장',()=>mutate(row,'edit'),'hc-primary'));card.append(actions);
        }else{
          card.append(el('p','hc-body',row.body));const actions=el('div','hc-actions');
          actions.append(button('수정',()=>{if(!confirmLeave())return;editing={kind:row.kind,id:row.id,body:row.body,original:row.body,revision:row.revision};confirming=null;render();host.querySelector('.hc-editor')?.focus();}),button('삭제',()=>{if(!confirmLeave())return;editing=null;confirming={kind:row.kind,id:row.id};render();},'hc-danger'));card.append(actions);
        }
        if(confirming?.kind===row.kind&&confirming?.id===row.id){
          const confirm=el('div','hc-confirm');confirm.setAttribute('role','group');confirm.setAttribute('aria-label','삭제 확인');
          confirm.append(el('p','','이 글·댓글을 삭제할까요? 되돌릴 수 없어요. 공개 원문만 30일 보관하고, 비공개·닫힌 방·탈퇴 작성자 원문은 따로 보관하지 않아요.'));
          const actions=el('div','hc-actions');actions.append(button('취소',()=>{confirming=null;render();}),button('삭제 확인',()=>mutate(row,'delete'),'hc-danger'));confirm.append(actions);card.append(confirm);
        }
        list.append(card);
      }
      root.append(list);
      if(more){const next=button('더 보기',()=>{if(!confirmLeave())return;editing=null;confirming=null;load(true);});next.disabled=loading||saving;root.append(next);}
      host.replaceChildren(root);
    }
    function beforeUnload(event){if(saving||hasDraft()){event.preventDefault();event.returnValue='';}}
    window.addEventListener('beforeunload',beforeUnload);
    function unmount(){destroyed=true;++run;window.removeEventListener('beforeunload',beforeUnload);rows=[];editing=null;confirming=null;host.replaceChildren();}
    if(!owner){host.replaceChildren(el('p','hc-status hc-error','관리자 권한을 다시 확인해 주세요.'));}else load();
    return {refresh,unmount,canLeave,hasDraft,isBusy:()=>saving};
  }
  window.OjjudaHouseContent={mount};
})();
