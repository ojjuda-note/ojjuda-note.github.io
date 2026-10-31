/* A batch keeps one coupon bound to one award, including ambiguous retries. */
(() => {
 'use strict';
 function mount({client,game,onRefresh,onBusy=()=>{}}){
  const $=id=>document.getElementById(id),helpers=window.OjjudaCouponBatch;
  const form=$('coupon-form'),files=$('coupon-file'),host=$('coupon-items'),summary=$('coupon-batch-summary'),send=$('coupon-send'),clear=$('coupon-clear'),notice=$('coupon-status');
  const nodes=new Map();let owner=null,epoch=0,items=[],pending=[],sending=false,pumping=false,activeRead=null;
  const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  const uuid=()=>{if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');};
  const current=(token,user)=>token===epoch&&!!user&&owner===user;
  const belongs=item=>items.includes(item);
  const locked=item=>sending||item.status==='sent'||!!item.attempt;
  const label=award=>award?`${String(award.month_start||'').slice(0,7)} · ${game(award.game)} · ${award.nickname||'탈퇴 회원'}`:'배정할 당첨자가 없어요';
  const timeout=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('request_timeout')),60000);})]).finally(()=>clearTimeout(timer));};
  function validation(){
   // A request whose reply was lost can only replay its frozen payload. The
   // server decides whether it was already sent, is still pending, or is blocked.
   const replayIds=new Set(items.filter(item=>item.attempt&&item.status!=='sent').map(item=>item.awardId));
   const candidates=pending.filter(award=>!replayIds.has(award.id));
   for(const item of items)if(replayIds.has(item.awardId))candidates.push({...item.award,id:item.awardId,blocked_reason:null});
   const result=helpers.validateBatch(items,candidates,{today:today()});
   for(const item of items){
    const attempt=item.attempt;
    if(attempt&&item.status!=='sent'&&(attempt.award!==item.awardId||attempt.file!==item.file||attempt.owner!==owner||attempt.code!==helpers.normalizeCode(item.code)||attempt.title!==item.title.trim()||attempt.expires!==item.expires)){
     result.valid=false;result.errors.push({id:item.id,message:'이전 발송 정보가 달라졌어요. 새로 확인해 주세요.'});
    }
   }
   return result;
  }
  function cancelRead(item){
   item.scan++;if(activeRead?.item===item)activeRead.controller.abort();
   if(['queued','reading'].includes(item.status)){item.status='ready';item.note='번호와 사용기한을 직접 확인해 주세요.';}
  }
  function reset(){
   ++epoch;activeRead?.controller.abort();activeRead=null;
   for(const item of items)URL.revokeObjectURL(item.url);
   items=[];pending=[];owner=null;sending=false;nodes.clear();host.replaceChildren();files.value='';notice.textContent='';
   onBusy(false);render();
  }
  function buildRow(item){
   const row=element('article');row.className='coupon-item';row.dataset.couponItem=item.id;
   const head=element('div'),heading=element('h3'),state=element('span');head.className='coupon-item-head';state.className='coupon-item-state';head.append(heading,state);
   const body=element('div'),preview=element('img'),fields=element('div');body.className='coupon-item-body';preview.className='coupon-item-preview';preview.alt='발송할 기프티콘 미리보기';preview.src=item.url;fields.className='coupon-item-fields';
   const targetLabel=element('label'),targetText=element('span','당첨자 배정'),target=element('select');target.dataset.couponField='award';targetLabel.append(targetText,target);fields.append(targetLabel);
   const inputs={};
   for(const [key,title,type]of [['title','상품명','text'],['code','쿠폰번호','text'],['expires','사용기한','date']]){
    const wrap=element('label'),caption=element('span',title),input=element('input');input.type=type;input.required=true;input.dataset.couponField=key;
    if(key==='code'){input.autocomplete='off';input.spellcheck=false;input.maxLength=100;input.placeholder='자동 인식하거나 직접 입력';}
    if(key==='title')input.maxLength=120;
    wrap.append(caption,input);fields.append(wrap);inputs[key]=input;
    input.addEventListener('input',()=>{if(locked(item))return;item[key]=input.value;item.edits[key]++;item.error='';render();});
   }
   target.addEventListener('change',()=>{
    if(locked(item))return;item.awardId=target.value||null;item.award=pending.find(award=>award.id===item.awardId)||null;item.upload=null;item.error='';render();
   });
   const note=element('p'),error=element('p'),actions=element('div');note.className='coupon-item-note';error.className='coupon-item-error';actions.className='coupon-item-actions';
   const retry=element('button','다시 읽기'),manual=element('button','직접 입력'),remove=element('button','목록에서 빼기');
   for(const button of [retry,manual,remove]){button.type='button';button.className='coupon-secondary';}
   retry.addEventListener('click',()=>{if(locked(item))return;cancelRead(item);item.status='queued';item.note='이미지 인식을 기다리고 있어요.';item.error='';render();void pump();});
   manual.addEventListener('click',()=>{if(locked(item))return;cancelRead(item);render();inputs.code.focus();});
   remove.addEventListener('click',()=>{if(locked(item))return;cancelRead(item);items=items.filter(value=>value!==item);URL.revokeObjectURL(item.url);render();});
   actions.append(retry,manual,remove);body.append(preview,fields);row.append(head,body,note,error,actions);
   return {row,heading,state,target,inputs,note,error,retry,manual,remove,preview,optionKey:''};
  }
  function render(){
   const check=validation(),used=new Map(items.filter(item=>item.awardId).map(item=>[item.awardId,item.id]));
   const allowed=pending.filter(award=>!award.blocked_reason),active=items.filter(item=>item.status!=='sent'),done=items.length-active.length;
   form.hidden=!owner||(!pending.length&&!active.length);$('coupon-empty').hidden=!!pending.length||!!active.length;
   for(const copy of document.querySelectorAll('[data-coupon-registration-copy]'))copy.hidden=form.hidden;
   files.disabled=sending||!owner||items.length>=20||!allowed.length;$('coupon-title').disabled=sending;
   clear.disabled=sending||!items.length||items.some(item=>item.attempt&&item.status!=='sent');
   send.disabled=sending||!owner||!check.valid;
   send.textContent=sending?'상품권을 보내고 있어요…':items.length&&!active.length?'모두 발송 완료':active.some(item=>item.status==='failed')?`실패한 항목 다시 보내기 (${active.length}건)`:`한 번에 보내기 (${active.length}건)`;
   const reading=items.filter(item=>['queued','reading'].includes(item.status)).length;
   summary.textContent=`지급 대기 ${allowed.length}건 · 선택한 이미지 ${items.length}장 · ${done?'발송 완료 '+done+'건 · ':''}${reading?'인식 중 '+reading+'장':'발송 준비 '+check.readyCount+'건'}`;
   for(const [id,node]of nodes)if(!items.some(item=>item.id===id)){node.row.remove();nodes.delete(id);}
   items.forEach((item,index)=>{
    let node=nodes.get(item.id);if(!node){node=buildRow(item);nodes.set(item.id,node);host.append(node.row);}
    node.row.dataset.status=item.status;node.row.hidden=item.status==='sent';node.heading.textContent=`${index+1}. ${item.file.name}`;
    node.state.textContent=({queued:'인식 대기',reading:'읽는 중',ready:'배정 확인',sending:'발송 중',sent:'발송 완료',failed:item.attempt?'발송 결과 확인 필요':'확인 필요'})[item.status]||'확인 필요';
    const options=[...pending];if(item.awardId&&!options.some(award=>award.id===item.awardId)&&item.award)options.push(item.award);
    const optionKey=JSON.stringify([options.map(award=>[award.id,label(award),!!award.blocked_reason,used.get(award.id)]),item.awardId]);
    if(node.optionKey!==optionKey){
     const placeholder=element('option','당첨자를 선택해 주세요');placeholder.value='';node.target.replaceChildren(placeholder);
     for(const award of options){const option=element('option',label(award)+(award.blocked_reason?' · 지급 제외':''));option.value=award.id;option.disabled=!!award.blocked_reason||(used.has(award.id)&&used.get(award.id)!==item.id);node.target.append(option);}
     node.target.value=item.awardId||'';node.optionKey=optionKey;
    }
    node.target.setAttribute('aria-label',`당첨자 배정 (${index+1})`);node.target.disabled=locked(item);
    for(const [key,input]of Object.entries(node.inputs)){if(input.value!==item[key])input.value=item[key];input.disabled=locked(item);input.setAttribute('aria-label',`${{title:'상품명',code:'쿠폰번호',expires:'사용기한'}[key]} (${index+1})`);}
    node.note.textContent=item.note||'';
    const issues=['queued','reading','sent','sending'].includes(item.status)?[]:check.errors.filter(error=>error.id===item.id).map(error=>error.message);
    node.error.textContent=[...new Set([item.error,...issues].filter(Boolean))].join('\n');node.error.hidden=!node.error.textContent;
    node.retry.disabled=locked(item)||['queued','reading'].includes(item.status);node.manual.disabled=locked(item);node.manual.hidden=!['queued','reading'].includes(item.status);node.remove.disabled=locked(item);
   });
  }
  async function pump(){
   if(pumping)return;pumping=true;
   try{
    while(!sending){
     const item=items.find(value=>value.status==='queued');if(!item)break;
     const user=owner,token=epoch,scan=++item.scan,edits={...item.edits},controller=new AbortController();
     activeRead={item,controller};item.status='reading';render();
     const valid=()=>current(token,user)&&belongs(item)&&item.scan===scan&&!sending;
     try{
      const result=await window.OjjudaCouponReader.read(item.file,{signal:controller.signal,onProgress:text=>{if(valid()){item.note=text;render();}}});
      if(!valid())continue;
      for(const key of ['code','expires'])if(item.edits[key]===edits[key]&&result[key])item[key]=result[key];
      item.status='ready';item.note=result.code&&result.expires?'바코드와 사용기한을 읽었어요. 이미지와 배정을 확인해 주세요.':result.code?'바코드를 읽었어요. 사용기한을 직접 확인해 주세요.':result.expires?'사용기한을 읽었어요. 쿠폰번호를 직접 확인해 주세요.':'번호와 사용기한을 읽지 못했어요. 직접 입력하거나 선명한 이미지로 다시 올려 주세요.';
      if(result.warnings?.some(warning=>['barcode_text_mismatch','multiple_barcodes','code_ambiguous','expiry_ambiguous','expiry_invalid'].includes(warning)))item.note='인식 결과가 불명확한 부분이 있어요. 번호와 사용기한을 이미지와 비교해 주세요.';
     }catch(error){
      if(valid()){item.status='ready';item.note=error.name==='TimeoutError'?'인식 시간이 오래 걸려 중지했어요. 다시 읽거나 직접 입력해 주세요.':'자동으로 읽지 못했어요. 다시 읽거나 번호와 사용기한을 직접 입력해 주세요.';}
     }finally{if(activeRead?.controller===controller)activeRead=null;if(current(token,user)&&belongs(item))render();}
    }
   }finally{pumping=false;if(!sending&&items.some(item=>item.status==='queued'))queueMicrotask(()=>void pump());}
  }
  function addFiles(list){
   if(sending||!owner)return;
   if(items.length+list.length>20){notice.textContent='한 번에 최대 20장까지 등록할 수 있어요.';return;}
   if(list.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>5242880)){notice.textContent='이미지마다 5MB 이하의 PNG·JPG·WEBP 파일을 선택해 주세요.';return;}
   const added=list.map(file=>({id:uuid(),file,url:URL.createObjectURL(file),awardId:null,award:null,title:$('coupon-title').value.trim(),code:'',expires:'',status:'queued',note:'이미지 인식을 기다리고 있어요.',error:'',scan:0,edits:{title:0,code:0,expires:0},upload:null,attempt:null}));
   const assigned=helpers.assignAwards([...items,...added],pending);
   // Preserve object identity so an already running reader can finish safely.
   [...items,...added].forEach((item,index)=>{item.awardId=assigned[index].awardId;if(!item.award)item.award=pending.find(award=>award.id===item.awardId)||null;});
   items.push(...added);notice.textContent='당첨 건마다 상품권 한 장씩 자동 배정했어요. 인식 결과와 배정을 확인해 주세요.';render();void pump();
  }
  files.addEventListener('change',()=>{const selected=[...files.files];files.value='';if(selected.length)addFiles(selected);});
  clear.addEventListener('click',()=>{if(clear.disabled)return;const user=owner,list=pending;reset();owner=user;pending=list;render();});
  const errorMessage=error=>{
   const message=String(error?.message||error||''),known={coupon_expired:'사용기한이 지난 쿠폰이에요.',coupon_already_used:'이미 지급된 쿠폰번호예요. 다른 상품권 이미지를 등록해 주세요.',award_already_delivered:'다른 상품권으로 이미 지급된 당첨 건이에요.',award_not_waiting:'현재 지급 대기 상태가 아니에요.',recipient_blocked:'차단 상태로 쪽지를 보낼 수 없어요.',reward_phone_changed:'당첨자의 전화번호 확인이 필요해요.',reward_recipient_excluded:'현재 지급 제외 대상이에요.',coupon_image_missing:'이미지 등록을 확인하지 못했어요.',monthly_winner_not_confirmed:'확정 당첨 건을 확인하지 못했어요.',session_changed:'로그인이 바뀌어 발송을 중지했어요.',not_admin:'관리자 권한을 다시 확인해 주세요.',invalid_image:'상품권 이미지 파일을 확인해 주세요.'};
   return Object.entries(known).find(([key])=>message.includes(key))?.[1]||'발송을 확인하지 못했어요. 다시 보내기를 누르면 같은 당첨 건의 결과를 확인하고 중복 없이 처리합니다.';
  };
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(sending||!owner||!validation().valid)return;
   const user=owner,token=epoch;sending=true;onBusy(true);render();
   let completed=0,failures=0;
   try{
    if(!await onRefresh()||!current(token,user))return;
    const check=validation();if(!check.valid){notice.textContent='당첨자 상태가 바뀌었거나 확인할 항목이 있어요. 표시된 내용을 확인해 주세요.';return;}
    const batch=items.filter(item=>item.status!=='sent');
    for(const item of batch){
     if(!current(token,user))break;
     item.status='sending';item.error='';item.note='상품권을 등록하고 쪽지를 보내고 있어요.';render();
     try{
      const account=await timeout(client.auth.getUser());
      if(account.error||account.data?.user?.id!==user||!current(token,user))throw Error('session_changed');
      if(!item.attempt){
       const image=nodes.get(item.id)?.preview;if(!image)throw Error('invalid_image');
       try{await timeout(image.decode());}catch{throw Error('invalid_image');}
       if(!current(token,user))throw Error('session_changed');
       const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[item.file.type];
       if(!item.upload){
        const path=`${user}/${item.awardId}/${uuid()}.${extension}`;
        const uploaded=await timeout(client.storage.from('reward-coupons').upload(path,item.file,{contentType:item.file.type,cacheControl:'0',upsert:false}));
        if(uploaded.error)throw uploaded.error;if(!current(token,user))throw Error('session_changed');
        item.upload={path,owner:user,file:item.file,award:item.awardId};
       }
       item.attempt=Object.freeze({owner:user,file:item.file,award:item.awardId,path:item.upload.path,code:helpers.normalizeCode(item.code),title:item.title.trim(),expires:item.expires});
      }
      if(!current(token,user))throw Error('session_changed');
      const attempt=item.attempt;
      const result=await timeout(client.rpc('admin_send_reward_coupon',{p_award:attempt.award,p_path:attempt.path,p_coupon_code:attempt.code,p_title:attempt.title,p_expires:attempt.expires}));
      if(result.error){
       // A reported SQL rollback permits correction. A missing/unknown reply
       // freezes every field and reuses this exact request on a later retry.
       if(/^(P0001|42501|22023|23505)$/.test(String(result.error.code||'')))item.attempt=null;
       throw result.error;
      }
      if(!result.data?.ok)throw Error('delivery_not_confirmed');if(!current(token,user))break;
      item.status='sent';item.note=`${item.award?.nickname||'당첨자'}님에게 기프티콘 쪽지를 보냈어요.`;completed++;
     }catch(error){
      if(!current(token,user))break;
      item.status='failed';item.error=errorMessage(error);item.note=item.attempt?'이전 발송 내용으로 재시도해요. 번호·날짜·당첨자는 변경되지 않습니다.':'';failures++;
      if(String(error.message).includes('session_changed')||error.code==='42501')break;
     }
     if(current(token,user)){notice.textContent=`이번 발송 ${completed}건 완료${failures?' · 확인 필요 '+failures+'건':''}`;render();}
    }
    if(current(token,user))notice.textContent=failures?`${completed}건을 보냈고 ${failures}건은 확인이 필요해요. 완료된 건은 다시 보내지 않습니다.`:`선택한 상품권 ${items.filter(item=>item.status==='sent').length}건을 모두 보냈어요.`;
   }catch(error){if(current(token,user))notice.textContent=errorMessage(error);}
   finally{if(current(token,user)){sending=false;onBusy(false);render();await onRefresh();}}
  });
  return Object.freeze({
   setData(data,user){if(owner&&owner!==user)reset();owner=user;pending=Array.isArray(data.monthly_pending)?data.monthly_pending:[];render();},
   reset,isSending:()=>sending
  });
 }
 window.OjjudaCouponManager=Object.freeze({mount});
})();
