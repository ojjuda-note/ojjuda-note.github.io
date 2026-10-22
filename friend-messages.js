/* Friend notes share the application's notification inbox. */
(()=>{
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const button=(text,action,cls='btn')=>{const n=el('button',cls,text);n.type='button';n.addEventListener('click',action);return n;};
 const date=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
 let instance;
 function install({client,getUserId,onRead=()=>{}}={}){
  if(instance||!client?.rpc||!client?.auth||!getUserId)return instance;
  let owner=null,peer=null,epoch=0,loadRun=0,saving=false,loading=false,allowed=false,items=[],cursor=null,anchored=false,retry=null,priorFocus=null,priorOverflow='';
  const dialog=el('dialog','fm-dialog');dialog.id='friend-message-dialog';dialog.setAttribute('aria-labelledby','friend-message-title');
  const head=el('header','fm-head'),title=el('h2','','쪽지');title.id='friend-message-title';
  const closeButton=button('닫기',()=>close());head.append(title,closeButton);
  const tools=el('div','fm-tools'),recent=button('최근 쪽지',()=>{anchored=false;void load({reset:true});}),more=button('이전 쪽지',()=>void load({older:true}));tools.append(more,recent);
  const history=el('div','fm-history'),list=el('ol','fm-list');list.setAttribute('aria-label','주고받은 쪽지');history.append(list);
  const form=el('form','fm-form'),label=el('label','','쪽지 쓰기'),input=el('textarea','fm-input');input.id='friend-message-body';input.maxLength=1000;input.rows=3;input.placeholder='친구에게 쪽지를 남겨 보세요.';label.htmlFor=input.id;
  const foot=el('div','fm-foot'),counter=el('span','fm-counter','0 / 1,000'),send=el('button','btn pri fm-send','보내기');send.type='submit';foot.append(counter,send);
  const status=el('p','fm-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  form.append(label,input,foot);dialog.append(head,tools,history,form,status);document.body.append(dialog);
  const user=()=>getUserId()||null;
  const valid=run=>run===epoch&&!!owner&&owner===user()&&dialog.open;
  const blocked=error=>error?.code==='42501';
  function controls(){input.disabled=!allowed||saving;send.disabled=!allowed||saving||loading||!input.value.trim();send.textContent=saving?'보내는 중…':'보내기';more.disabled=loading||saving;recent.disabled=loading||saving;more.hidden=!cursor;counter.textContent=input.value.length.toLocaleString('ko-KR')+' / 1,000';}
  async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
  function changedRead(){onRead();window.dispatchEvent(new CustomEvent('ojjuda:messages-read'));}
  function render(scroll=false){
   const before=history.scrollHeight,top=history.scrollTop,nearBottom=before-top-history.clientHeight<90;
   list.replaceChildren();
   for(const m of items){const mine=m.sender_id===owner,row=el('li','fm-row'+(mine?' fm-own':''));row.dataset.messageId=m.id;row.append(el('span','fm-direction',mine?'보낸 쪽지':'받은 쪽지'),el('p','fm-body',m.body));
    const gift=String(m.body||'').match(/(?:^|\n)기프티콘 확인: https:\/\/ojjuda\.kr\/gift\.html\?id=([0-9a-f-]{36})(?:\n|$)/i);
    if(gift&&UUID.test(gift[1])){const link=el('a','btn','기프티콘 열기');link.href='/gift.html?id='+gift[1];link.target='_blank';link.rel='noopener noreferrer';row.append(link);}
    const time=el('time','fm-time',date(m.created_at));time.dateTime=m.created_at;row.append(time);list.append(row);}
   if(!items.length)list.append(el('li','fm-empty','아직 주고받은 쪽지가 없어요.'));
   if(scroll||nearBottom)history.scrollTop=history.scrollHeight;else history.scrollTop=top+Math.max(0,history.scrollHeight-before);
  }
  async function load({older=false,reset=false,anchor=null,quiet=false}={}){
   if(!valid(epoch)||saving||loading)return;
   const run=epoch,request=++loadRun,requestedPeer=peer,boundary=older?cursor:null;if(older&&!boundary)return;
   loading=true;controls();if(!quiet)status.textContent='쪽지를 불러오는 중이에요.';
   try{
    const data=await rpc('friend_message_thread',{p_peer:requestedPeer,p_limit:30,p_before_created_at:boundary?.created_at||null,p_before_id:boundary?.id||null,p_anchor:anchor});
    if(!valid(run)||request!==loadRun)return;
    if(data?.peer_id!==peer||!Array.isArray(data.items))throw Error('invalid_message_response');
    allowed=data.can_send===true;title.textContent=(data.nickname||'친구')+'님과의 쪽지';
    const merged=new Map((reset?[]:items).map(m=>[m.id,m]));for(const m of data.items)merged.set(m.id,m);
    const next=[...merged.values()].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));
    const updated=JSON.stringify(next)!==JSON.stringify(items);items=next;
    if(reset||older||!cursor)cursor=data.has_more?data.next_cursor:null;
    if(updated||reset)render(reset);
    status.textContent=allowed?'':'지금은 쪽지를 보낼 수 없는 친구예요.';
    changedRead();
   }catch(error){
    if(!valid(run)||request!==loadRun)return;
    if(blocked(error)){allowed=false;items=[];cursor=null;list.replaceChildren();}
    status.textContent=blocked(error)?'이 쪽지를 볼 수 없어요. 친구와 차단 상태를 확인해 주세요.':'쪽지를 불러오지 못했어요. 최근 쪽지를 눌러 다시 시도해 주세요.';
   }finally{if(valid(run)&&request===loadRun){loading=false;controls();}}
  }
  function close(force=false){
   if(!dialog.open)return true;
   if(!force&&(saving||input.value.trim()&&!window.confirm('작성 중인 쪽지를 닫을까요?'))){if(saving)status.textContent='전송이 끝난 뒤 닫아 주세요.';return false;}
   epoch++;loadRun++;owner=peer=null;saving=loading=allowed=false;items=[];cursor=null;retry=null;input.value='';list.replaceChildren();status.textContent='';title.textContent='쪽지';dialog.close();document.body.style.overflow=priorOverflow;
   if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});priorFocus=null;return true;
  }
  async function open(id,options={}){
   if(!UUID.test(id||'')||!user())return false;
   if(dialog.open&&!close())return false;
   owner=user();peer=id;epoch++;loadRun++;items=[];cursor=null;retry=null;allowed=false;loading=saving=false;anchored=!!options.messageId;
   priorFocus=document.activeElement;priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden';title.textContent='친구와의 쪽지';input.value='';list.replaceChildren();controls();dialog.showModal();closeButton.focus();
   await load({reset:true,anchor:options.messageId||null});return true;
  }
  async function openMessage(id){
   if(!UUID.test(id||'')||!user())return false;
   const startUser=user(),run=++epoch;
   try{const data=await rpc('friend_message_target',{p_id:id});if(run!==epoch||user()!==startUser)return false;return open(data.peer_id,{messageId:id});}
   catch{if(run===epoch&&user()===startUser)window.alert('이 쪽지를 볼 수 없어요.');return false;}
  }
  form.addEventListener('submit',async event=>{
   event.preventDefault();const body=input.value.trim();if(!valid(epoch)||saving||loading||!allowed||!body||body.length>1000)return;
   const run=epoch,to=peer;if(!retry||retry.body!==body||retry.peer!==to)retry={id:crypto.randomUUID(),body,peer:to};
   saving=true;controls();status.textContent='쪽지를 보내는 중이에요.';
   try{
    const data=await rpc('send_friend_message',{p_recipient:to,p_body:body,p_request:retry.id});if(!valid(run))return;if(!data?.ok)throw Error('invalid_send_response');
    input.value='';retry=null;saving=false;anchored=false;status.textContent='쪽지를 보냈어요.';controls();await load({reset:true});if(valid(run)){status.textContent='쪽지를 보냈어요.';input.focus();}
   }catch(error){if(!valid(run))return;if(blocked(error)){allowed=false;items=[];cursor=null;list.replaceChildren();}status.textContent=String(error?.message).includes('message_rate_limit')?'쪽지를 많이 보냈어요. 잠시 후 다시 보내 주세요.':blocked(error)?'지금은 이 친구에게 쪽지를 보낼 수 없어요.':'전송을 확인하지 못했어요. 다시 보내기를 눌러 주세요.';}
   finally{if(valid(run)){saving=false;controls();}}
  });
  input.addEventListener('input',controls);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.addEventListener('click',event=>{const n=event.target.closest?.('[data-friend-message]');if(n){event.preventDefault();void open(n.dataset.friendMessage);}});
  client.auth.onAuthStateChange((_event,session)=>{if(owner&&session?.user?.id!==owner)close(true);});
  function refresh(){if(owner!==user()){close(true);return;}if(dialog.open&&!anchored&&!document.hidden&&!loading&&!saving)void load({quiet:true});}
  setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  window.addEventListener('beforeunload',event=>{if(dialog.open&&(saving||input.value.trim())){event.preventDefault();event.returnValue='';}});
  instance=Object.freeze({open,openMessage,close,isOpen:()=>dialog.open});return instance;
 }
 window.OjjudaFriendMessages=Object.freeze({install});
})();
