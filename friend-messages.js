/* Friend notes share the application's notification inbox. */
(()=>{
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const button=(text,action,cls='btn')=>{const n=el('button',cls,text);n.type='button';n.addEventListener('click',action);return n;};
 const date=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
 function couponMessage(body){
  const lines=String(body||'').replace(/\r\n/g,'\n').split('\n');
  const index=lines.findIndex(line=>/^기프티콘 확인: https:\/\/ojjuda\.kr\/gift\.html\?id=([0-9a-f-]{36})$/i.test(line));
  if(index<0)return null;
  const id=lines[index].slice(lines[index].lastIndexOf('=')+1);if(!UUID.test(id))return null;
  const award=lines[0]?.match(/^(\d{4})년 (0[1-9]|1[0-2])월 게임 순위 1위를 축하합니다!$/);
  const expiry=lines[index-1]?.match(/^사용기한: (\d{4}-\d{2}-\d{2})$/);
  if(award&&expiry&&index===lines.length-1&&index>2){
   return{id,title:lines.slice(1,index-1).join('\n'),context:`${award[1]}년 ${Number(award[2])}월 게임 순위 1위`,expires:expiry[1],note:''};
  }
  // An official-shaped link is not proof of an award; retain all other text.
  return{id,title:'상품권',context:'',expires:'',note:lines.filter((_,i)=>i!==index).join('\n').trim()};
 }
 function couponCard(gift){
  const card=el('article','fm-gift');
  if(gift.context)card.append(el('p','fm-gift-context',gift.context));
  card.append(el('h3','fm-gift-title',gift.title));
  if(gift.note)card.append(el('p','fm-gift-note',gift.note));
  if(gift.expires){const expiry=el('p','fm-gift-expiry'),time=el('time','',gift.expires.replace(/-/g,'. '));time.dateTime=gift.expires;expiry.append(el('span','','사용기한'),time);card.append(expiry);}
  const link=el('a','fm-gift-link','상품권 보기'),arrow=el('span','fm-gift-arrow','↗');arrow.setAttribute('aria-hidden','true');
  link.href='/gift.html?id='+gift.id;link.target='_blank';link.rel='noopener noreferrer';link.append(arrow);card.append(link);return card;
 }
 let instance;
 function install({client,getUserId,onRead=()=>{}}={}){
  if(instance||!client?.rpc||!client?.auth||!getUserId)return instance;
  let owner=null,peer=null,peerName='친구',epoch=0,loadRun=0,saving=false,loading=false,allowed=false,items=[],cursor=null,anchored=false,retry=null,priorFocus=null,priorOverflow='';
  const dialog=el('dialog','fm-dialog');dialog.id='friend-message-dialog';dialog.setAttribute('aria-labelledby','friend-message-title');
  const head=el('header','fm-head'),title=el('h2','','쪽지');title.id='friend-message-title';
  const closeButton=button('닫기',()=>close()),heading=el('div','fm-heading'),sender=el('p','fm-sender');sender.hidden=true;heading.append(title,sender);head.append(heading,closeButton);
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
  function presentation(reset=false){
   const compact=!reset&&!allowed&&!input.value.trim()&&items.length>0&&items.every(m=>couponMessage(m.body));
   const received=items.every(m=>m.sender_id!==owner),sent=items.every(m=>m.sender_id===owner);
   dialog.classList.toggle('fm-gifts-only',compact);form.hidden=compact;sender.hidden=!compact;
   dialog.classList.toggle('fm-gifts-one-direction',compact&&(received||sent));
   tools.hidden=compact&&!cursor&&!anchored;
   if(compact){
    title.textContent=received?'받은 상품권':sent?'보낸 상품권':'상품권';
    sender.textContent=peerName+(received?'님이 보냈어요':sent?'님께 보냈어요':'님과 주고받았어요');
   }else{title.textContent=peerName+'님과의 쪽지';sender.textContent='';}
   return compact;
  }
  function render(scroll=false){
   const before=history.scrollHeight,top=history.scrollTop,nearBottom=before-top-history.clientHeight<90;
   list.replaceChildren();
   for(const m of items){const mine=m.sender_id===owner,row=el('li','fm-row'+(mine?' fm-own':'')),gift=couponMessage(m.body);row.dataset.messageId=m.id;
    if(gift){row.classList.add('fm-gift-row');row.append(el('span','fm-direction',mine?'보낸 상품권':'받은 상품권'),couponCard(gift));}
    else row.append(el('span','fm-direction',mine?'보낸 쪽지':'받은 쪽지'),el('p','fm-body',m.body));
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
    allowed=data.can_send===true;peerName=data.nickname||'친구';
    const merged=new Map((reset?[]:items).map(m=>[m.id,m]));for(const m of data.items)merged.set(m.id,m);
    const next=[...merged.values()].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));
    const updated=JSON.stringify(next)!==JSON.stringify(items);items=next;
    if(reset||older||!cursor)cursor=data.has_more?data.next_cursor:null;
    const compact=presentation();
    if(updated||reset)render(reset);
    status.textContent=allowed||compact?'':'지금은 쪽지를 보낼 수 없는 친구예요.';
    changedRead();
   }catch(error){
    if(!valid(run)||request!==loadRun)return;
    if(blocked(error)){allowed=false;items=[];cursor=null;list.replaceChildren();}
    presentation();tools.hidden=false;
    status.textContent=blocked(error)?'이 쪽지를 볼 수 없어요. 친구와 차단 상태를 확인해 주세요.':'쪽지를 불러오지 못했어요. 최근 쪽지를 눌러 다시 시도해 주세요.';
   }finally{if(valid(run)&&request===loadRun){loading=false;controls();}}
  }
  function close(force=false){
   if(!dialog.open)return true;
   if(!force&&(saving||input.value.trim()&&!window.confirm('작성 중인 쪽지를 닫을까요?'))){if(saving)status.textContent='전송이 끝난 뒤 닫아 주세요.';return false;}
   epoch++;loadRun++;owner=peer=null;saving=loading=allowed=false;items=[];cursor=null;retry=null;input.value='';list.replaceChildren();status.textContent='';presentation(true);title.textContent='쪽지';dialog.close();document.body.style.overflow=priorOverflow;
   if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});priorFocus=null;return true;
  }
  async function open(id,options={}){
   if(!UUID.test(id||'')||!user())return false;
   if(dialog.open&&!close())return false;
   owner=user();peer=id;peerName='친구';epoch++;loadRun++;items=[];cursor=null;retry=null;allowed=false;loading=saving=false;anchored=!!options.messageId;presentation(true);
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
