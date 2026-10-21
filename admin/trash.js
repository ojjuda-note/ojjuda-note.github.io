/* Private administrator trash. The server owns permissions and expiry. */
(() => {
  'use strict';
  const labels = {all:'전체',accounts:'탈퇴 계정',cards:'삭제한 카드',messages:'삭제한 쪽지',other:'기타 보관 정보'};
  const el = (tag,text,cls='') => { const node=document.createElement(tag); if(text!=null)node.textContent=text;node.className=cls;return node; };
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '기록 없음';
  function mount({container,client,getAdminId,isCurrent=()=>container.isConnected,category='all',initialState}) {
    const owner=getAdminId(),kind=Object.hasOwn(labels,category)?category:'all';
    let destroyed=false,revoked=false,run=0,busy=false,mutating=false,query=initialState?.query||'',offset=initialState?.offset||0,total=0;
    const active=()=>!destroyed&&!revoked&&isCurrent()&&!!owner&&getAdminId()===owner;
    const section=el('section',null,'trash-panel'),heading=el('h3',labels[kind]),intro=el('p','삭제·탈퇴 후 한 달 보관하며, 기간이 끝나면 자동으로 삭제돼요.','trash-intro');
    section.setAttribute('aria-label','휴지통 '+labels[kind]);
    const form=el('form',null,'trash-search'),label=el('label','휴지통 검색'),input=el('input');input.type='search';input.maxLength=100;input.placeholder='닉네임 또는 내용';input.value=query;label.append(input);
    const search=el('button','검색','btn pri');search.type='submit';
    const status=el('p','','trash-status');status.setAttribute('role','status');
    const list=el('div',null,'trash-list'),pager=el('nav',null,'trash-pager');pager.setAttribute('aria-label','휴지통 페이지');
    const btn=(text,action)=>{const b=el('button',text,'btn');b.type='button';b.addEventListener('click',action);return b;};
    const prev=btn('이전',()=>{if(!busy&&offset){offset=Math.max(0,offset-20);void refresh();}}),next=btn('다음',()=>{if(!busy&&offset+20<total){offset+=20;void refresh();}}),page=el('span');
    form.append(label,search);pager.append(prev,page,next);section.append(heading,intro,form,status,list,pager);container.replaceChildren(section);
    function controls(){input.disabled=search.disabled=busy;prev.disabled=busy||!offset;next.disabled=busy||offset+20>=total;section.setAttribute('aria-busy',String(busy));}
    function clear(){revoked=true;run++;list.replaceChildren();input.value='';pager.hidden=true;input.disabled=search.disabled=true;status.textContent='관리자 계정으로 다시 열어 주세요.';}
    async function restore(row,button){
      if(!active()||busy||!confirm('이 카드와 함께 삭제된 답글을 복구할까요?'))return;
      busy=mutating=true;button.disabled=true;controls();
      try{const {error}=await client.schema('ojjuda_note').rpc('restore_archived_card',{p_card_id:row.card_id,p_reason:'관리자 휴지통에서 복구'});if(error)throw error;if(active()){busy=false;await refresh();}}
      catch(error){if(active()){if(error?.code==='42501')clear();else status.textContent='복구하지 못했어요. 보관 기간과 카드 상태를 확인해 주세요.';}}
      finally{busy=mutating=false;if(active()){button.disabled=false;controls();}}
    }
    function item(row){
      const article=el('article',null,'trash-card'),head=el('div',null,'trash-head');
      head.append(el('span',labels[row.category]||'기타 보관 정보','trash-badge'),el('strong',row.title));article.append(head);
      const d=row.detail||{},names=row.category==='messages' ? `${d.sender_name||'탈퇴한 회원'} → ${d.recipient_name||'탈퇴한 회원'}` : d.author_name;
      if(names)article.append(el('p',names,'trash-author'));
      article.append(el('p',row.body||'내용 없음','trash-body'));
      if(d.reply)article.append(el('p','답변: '+d.reply,'trash-body'));
      const times=el('dl',null,'trash-dates');
      for(const [name,value]of [['작성·가입',d.created_at],[row.category==='accounts'?'탈퇴':'삭제·보관',row.deleted_at],['자동 삭제 예정',row.expires_at]]){times.append(el('dt',name),el('dd',date(value)));}
      article.append(times);
      if(row.restorable&&row.card_id){const control=btn('카드 복구',()=>void restore(row,control));article.append(control);}
      return article;
    }
    async function refresh(){
      if(!active()){if(!destroyed&&isCurrent())clear();return;}
      const version=++run;busy=true;controls();list.replaceChildren();status.textContent='휴지통을 불러오는 중이에요.';
      try{
        const {data,error}=await client.rpc('admin_trash_items',{p_category:kind,p_query:query,p_offset:offset,p_limit:20});
        if(!active()||version!==run)return;if(error)throw error;
        if(!Array.isArray(data?.items)||!Number.isFinite(data.total))throw Error('invalid_trash_response');
        total=data.total;if(offset&&offset>=total){offset=Math.max(0,Math.floor((total-1)/20)*20);return await refresh();}
        for(const row of data.items)list.append(item(row));
        status.textContent=total?`총 ${total.toLocaleString('ko-KR')}건 · 한국 시간`:'보관 중인 항목이 없어요.';
        pager.hidden=total<=20;page.textContent=`${Math.floor(offset/20)+1} / ${Math.max(1,Math.ceil(total/20))}`;
      }catch(error){if(!active()||version!==run)return;if(error?.code==='42501'){clear();return;}status.textContent='휴지통을 불러오지 못했어요. 새로고침해 주세요.';}
      finally{if(active()&&version===run){busy=false;controls();}}
    }
    form.addEventListener('submit',e=>{e.preventDefault();if(busy)return;query=input.value.trim();offset=0;void refresh();});
    const subscription=client.auth?.onAuthStateChange?.((_event,session)=>{if(session?.user?.id!==owner)clear();})?.data?.subscription;
    const expiryTimer=setInterval(()=>{if(active()&&!busy&&list.children.length)void refresh();},60000);
    void refresh();return {refresh,getState:()=>({query,offset}),canLeave:()=>!mutating,destroy(){destroyed=true;run++;clearInterval(expiryTimer);subscription?.unsubscribe?.();container.replaceChildren();}};
  }
  window.OjjudaAdminTrash=Object.freeze({mount});
})();
