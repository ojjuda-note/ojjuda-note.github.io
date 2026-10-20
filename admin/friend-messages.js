/* Administrator notes viewer. The server checks current administrator membership. */
(()=>{'use strict';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const button=(text,action)=>{const n=el('button','btn',text);n.type='button';n.addEventListener('click',action);return n;};
 const date=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 function mount({container,client,getAdminId,isCurrent=()=>container.isConnected,initialState=null}){
  let owner=getAdminId(),destroyed=false,run=0,busy=false,query=initialState?.query||'',pages=[null],page=0,next=null;
  const active=()=>!destroyed&&isCurrent()&&!!owner&&getAdminId()===owner;
  const section=el('section','afm-panel'),heading=el('h3','','쪽지 관리'),form=el('form','afm-search'),label=el('label','','쪽지 검색'),input=el('input');input.type='search';input.maxLength=100;input.placeholder='닉네임 또는 쪽지 내용';input.value=query;input.setAttribute('aria-label','쪽지 검색');label.append(input);
  const search=el('button','btn pri','검색');search.type='submit';const reload=button('새로고침',()=>{pages=[null];page=0;void refresh();});form.append(label,search,reload);
  const status=el('p','afm-status');status.setAttribute('role','status');
  const list=el('div','afm-list'),pager=el('nav','afm-pager');pager.setAttribute('aria-label','쪽지 관리 페이지');
  const prev=button('이전',()=>{if(page>0){page--;void refresh();}}),nextButton=button('다음',()=>{if(next){pages[++page]=next;void refresh();}}),pageLabel=el('span');pager.append(prev,pageLabel,nextButton);
  section.append(heading,form,status,list,pager);container.replaceChildren(section);
  function clear(){run++;owner=null;list.replaceChildren();pager.hidden=true;input.value='';input.disabled=search.disabled=reload.disabled=true;status.textContent='관리자 계정으로 다시 열어 주세요.';}
  function controls(){input.disabled=search.disabled=reload.disabled=busy;prev.disabled=busy||page===0;nextButton.disabled=busy||!next;list.setAttribute('aria-busy',String(busy));}
  async function refresh(){
   if(!active()){if(!destroyed&&isCurrent())clear();return;}
   const version=++run,cursor=pages[page];busy=true;next=null;controls();list.replaceChildren();status.textContent='쪽지를 불러오는 중이에요.';pageLabel.textContent=(page+1)+'페이지';
   try{
    const {data,error}=await client.rpc('admin_friend_messages',{p_query:query,p_limit:30,p_before_created_at:cursor?.created_at||null,p_before_id:cursor?.id||null});
    if(!active()||version!==run)return;if(error)throw error;if(!Array.isArray(data?.items))throw Error('invalid_messages_response');
    for(const row of data.items){const article=el('article','afm-card'),head=el('div','afm-head'),time=el('time','',date(row.created_at));time.dateTime=row.created_at;head.append(el('strong','','보낸 사람 '+(row.sender_name||'이름 없음')+' → 받는 사람 '+(row.recipient_name||'이름 없음')),time);article.append(head,el('p','afm-body',row.body));const detail=el('details','afm-detail');detail.append(el('summary','','회원 번호'),el('p','','보낸 사람: '+row.sender_id),el('p','','받는 사람: '+row.recipient_id));article.append(detail);list.append(article);}
    next=data.has_more?data.next_cursor:null;status.textContent=data.items.length?'최근 쪽지부터 표시 · 한국 시간':'조건에 맞는 쪽지가 없어요.';
   }catch(error){if(!active()||version!==run)return;if(error?.code==='42501'){clear();return;}status.textContent='쪽지를 불러오지 못했어요. 새로고침을 눌러 주세요.';}
   finally{if(active()&&version===run){busy=false;controls();}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;query=input.value.trim();pages=[null];page=0;void refresh();});
  const subscription=client.auth?.onAuthStateChange?.((_event,session)=>{if(session?.user?.id!==owner)clear();})?.data?.subscription;
  void refresh();return {getState:()=>({query}),refresh:()=>{pages=[null];page=0;return refresh();},destroy(){destroyed=true;run++;subscription?.unsubscribe?.();container.replaceChildren();}};
 }
 window.OjjudaAdminFriendMessages=Object.freeze({mount});
})();
