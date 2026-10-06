/* Public photo stages share the game's server-side moderation rules. */
(() => {
  'use strict';
  const PAGE = 24;
  const states = {pending:'승인 대기',approved:'공개 중',rejected:'반려',hidden:'숨김'};
  const el = (tag, cls, text) => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!=null)n.textContent=String(text); return n; };
  const btn = (text, action) => { const n=el('button','btn sm',text); n.type='button'; n.onclick=action; return n; };
  function mount({container,client,getAdminId,isCurrent=()=>container.isConnected,initialState=null,onChanged=()=>{}}) {
    const owner=getAdminId?.(); let destroyed=false,run=0,pending=false,offset=0;
    let filter=Object.hasOwn(states,initialState?.filter)?initialState.filter:initialState?.filter==='all'?'all':'pending';
    const active=()=>!destroyed&&!!owner&&getAdminId?.()===owner&&isCurrent();
    const valid=n=>active()&&n===run;
    const wrap=el('section','ap-stage'),head=el('div','ap-head'),select=el('select','inp'),status=el('p','note'),list=el('div','ap-list');
    select.setAttribute('aria-label','사진 승인 상태');
    for(const [key,label] of [...Object.entries(states),['all','전체']]){const op=el('option','',label);op.value=key;select.append(op);}
    select.value=filter;
    const refresh=btn('새로고침',()=>load()),more=btn('더 보기',()=>load(true));more.hidden=true;
    head.append(el('h3','h3','포토땅따먹기 사진 검토'),select,refresh);
    status.setAttribute('role','status');
    wrap.append(head,el('p','note','전체공개로 등록한 사진을 확인하고 승인해 주세요. 승인한 사진은 이용자가 판을 깨면 선명하게 보여요.'),status,list,more);
    container.replaceChildren(wrap);
    select.onchange=()=>{filter=select.value;load();};
    function message(text){if(active())status.textContent=text;}
    async function signedPhoto(row,card,version){
      try {
        const {data,error}=await client.storage.from('photo-stages').createSignedUrl(row.full_path||row.image_path,600);
        if(error)throw error;
        if(!active()||!card.isConnected||!list.contains(card))return;
        const url=new URL(data.signedUrl,location.href);if(!['https:','http:'].includes(url.protocol))throw Error('사진 주소 오류');
        const image=el('img','ap-image');image.alt=(row.nick||'회원')+'님이 올린 사진';image.loading='lazy';image.src=url.href;
        image.onerror=()=>{if(active()&&list.contains(card))image.replaceWith(el('p','note','사진을 열지 못했어요. 새로고침해 주세요.'));};
        card.prepend(image);
      } catch {if(active()&&list.contains(card))card.prepend(el('p','note','사진을 열지 못했어요. 새로고침해 주세요.'));}
    }
    async function change(row,next,card) {
      if(!active()||pending)return;
      pending=true;select.disabled=refresh.disabled=more.disabled=true;
      list.querySelectorAll('button').forEach(b=>b.disabled=true);
      try {
        const {error}=await client.rpc('photo_set_status',{p_id:row.id,p_status:next});if(error)throw error;
        if(!active())return;
        onChanged();message(states[next]+'로 변경했어요.');
        await load();
      } catch(e){message(e.message||'변경하지 못했어요. 다시 시도해 주세요.');}
      finally {pending=false;if(active()){select.disabled=refresh.disabled=more.disabled=false;list.querySelectorAll('button').forEach(b=>b.disabled=false);}}
    }
    function render(row,version){
      const card=el('article','ap-card');card.dataset.photoId=row.id;
      card.append(el('strong','',row.nick||'이름 없는 회원'),el('span','ap-status ap-'+row.status,states[row.status]||row.status));
      const date=new Date(row.created_at);card.append(el('p','note',`${Number.isNaN(date.getTime())?'':date.toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})+' · '}신고 ${Number(row.report_count)||0}회 · 클리어 ${Number(row.clears)||0}회`));
      const actions=el('div','ap-actions');
      for(const [next,label] of [['approved','승인 · 공개'],['rejected','반려'],['hidden','숨김']])if(row.status!==next)actions.append(btn(label,()=>change(row,next,card)));
      card.append(actions);actions.querySelectorAll('button').forEach(b=>b.disabled=pending);list.append(card);signedPhoto(row,card,version);
    }
    async function load(append=false){
      if(!active())return;
      const version=++run;if(!append){offset=0;list.replaceChildren();}
      refresh.disabled=more.disabled=true;more.hidden=true;list.setAttribute('aria-busy','true');message('사진을 불러오는 중이에요.');
      try {
        const auth=await client.rpc('photo_is_admin');if(auth.error||auth.data!==true)throw Error('관리자 계정으로 다시 열어 주세요.');
        if(!valid(version))return;
        let q=client.from('photo_stages').select('id,nick,image_path,full_path,status,visibility,report_count,clears,created_at').eq('visibility','public');
        if(filter!=='all')q=q.eq('status',filter);
        const {data,error}=await q.order('created_at',{ascending:filter==='pending'}).range(offset,offset+PAGE-1);if(error)throw error;
        if(!valid(version))return;
        const rows=(data||[]).filter(r=>r.visibility==='public');
        rows.forEach(r=>render(r,version));offset+=rows.length;more.hidden=rows.length<PAGE;
        message(offset?`${offset}개 사진 · ${filter==='all'?'전체':states[filter]}`:'확인할 사진이 없어요.');
      } catch(e){if(valid(version))message(e.message||'사진을 불러오지 못했어요. 새로고침해 주세요.');}
      finally {if(valid(version)){list.setAttribute('aria-busy','false');refresh.disabled=more.disabled=pending;}}
    }
    const subscription=client.auth?.onAuthStateChange?.((_event,session)=>{if(session?.user?.id!==owner){run++;container.replaceChildren(el('p','note','관리자 계정으로 다시 열어 주세요.'));destroyed=true;}})?.data?.subscription;
    load();
    return {refresh:()=>load(),getState:()=>({filter}),canLeave:()=>!pending,hasDraft:()=>false,destroy(){destroyed=true;run++;subscription?.unsubscribe?.();container.replaceChildren();}};
  }
  window.OjjudaPhotoStageAdmin={mount};
})();
