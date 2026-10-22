(() => {
 'use strict';
 const $=id=>document.getElementById(id), content=$('content'), status=$('status'), refresh=$('refresh');
 const config=window.OJJUDA_CONFIG;
 if(!config?.supabaseUrl||!config?.supabaseKey||!window.supabase?.createClient){status.textContent='설정을 불러오지 못했어요.';return;}
 const client=window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
 const names={tank:'탱크게임',saetbyeol:'샛별키우기',mines:'지뢰찾기',tour:'오쭈다 마블',screw_box:'나사풀기 · 박스형',screw_flat:'나사풀기 · 평면형',spot:'틀린그림찾기',ttang:'월드땅따먹기',mole:'두더지잡기',runner:'달리기',stacker:'쌓기',breakout:'벽돌깨기',matgo:'맞고',poker:'세븐포커',photo_ttang:'포토땅따먹기',carom4:'당구 · 4구',carom3:'당구 · 3쿠션',pool8:'포켓볼',janggi:'장기',chess:'체스'};
 const states={awaiting_provider:'발송업체 연결 대기',awaiting_coupon:'기프티콘 등록 대기',ready:'발송 대기',sending:'발송 확인 중',sent:'발송 완료',blocked:'지급 제외',failed:'실패',unknown:'업체 확인 필요',admin_excluded:'관리자 제외',admin_phone_excluded:'관리자 번호 제외',not_a_member:'비회원 미지급',unconfirmed_member:'가입 인증 미완료',banned:'이용 제한',missing_phone:'전화번호 확인 필요',recipient_blocked:'차단 상태 확인 필요'};
 let run=0,activeOwner=null,pending=[],sending=false,previewUrl=null,upload=null;
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);return node;};
 const money=value=>Number(value||0).toLocaleString('ko-KR')+'원';
 const date=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
 const game=value=>{if(!value)return '—';const match=value.match(/^(.*)_(easy|normal|hard|online)$/);return match?(names[match[1]]||match[1])+' · '+({easy:'쉬움',normal:'보통',hard:'어려움',online:'회원대결'}[match[2]]):names[value]||value;};
 function table(host,headers,rows){
  host.replaceChildren();if(!rows.length){host.append(Object.assign(el('p','아직 기록이 없어요.'),{className:'reward-empty'}));return;}
  const wrap=el('div'),table=el('table'),head=el('thead'),tr=el('tr'),body=el('tbody');wrap.className='reward-table-wrap';table.className='reward-table';
  headers.forEach(label=>{const th=el('th',label);th.scope='col';tr.append(th);});head.append(tr);
  rows.forEach(values=>{const row=el('tr');values.forEach(value=>row.append(el('td',value)));body.append(row);});table.append(head,body);wrap.append(table);host.append(wrap);
 }
 function resetCoupon(){upload=null;$('coupon-form').reset();$('coupon-preview').hidden=true;$('coupon-preview').removeAttribute('src');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('coupon-status').textContent='';$('coupon-target').textContent='';$('coupon-send').disabled=true;}
 function couponTarget(){const chosen=pending.find(x=>x.id===$('coupon-winner').value);$('coupon-target').textContent=chosen?`${chosen.nickname||'탈퇴 회원'}님 · ${game(chosen.game)} · ${money(chosen.amount)}${chosen.blocked_reason?' · '+(states[chosen.blocked_reason]||'지급 제외'):''}`:'';$('coupon-send').disabled=sending||!chosen||!!chosen.blocked_reason;}
 function couponRows(data){
  if(upload&&(data.monthly_sent||[]).some(x=>x.id===upload.award)){resetCoupon();$('coupon-status').textContent='기프티콘 쪽지 발송이 완료된 것을 확인했어요.';}
  pending=data.monthly_pending||[];const current=$('coupon-winner').value;
  const placeholder=el('option','당첨자를 선택해 주세요');placeholder.value='';$('coupon-winner').replaceChildren(placeholder);
  for(const x of pending){const option=el('option',`${x.month_start.slice(0,7)} · ${game(x.game)} · ${x.nickname||'탈퇴 회원'}${x.blocked_reason?' · 지급 제외':''}`);option.value=x.id;option.disabled=!!x.blocked_reason;$('coupon-winner').append(option);}
  if(pending.some(x=>x.id===current))$('coupon-winner').value=current;
  $('coupon-form').hidden=!pending.length;$('coupon-empty').hidden=!!pending.length;couponTarget();
  table($('coupon-sent'),['당첨자','상품','사용기한','쪽지 발송'],(data.monthly_sent||[]).map(x=>[x.nickname||'탈퇴 회원',x.title,x.expires_on,date(x.delivered_at)]));
 }
 async function load(){
  if(sending)return;
  const ticket=++run;content.hidden=true;refresh.disabled=true;status.textContent='지급 현황을 확인하고 있어요.';
  try{
   const account=await client.auth.getUser();if(ticket!==run)return;
   if(account.error||!account.data?.user){activeOwner=null;resetCoupon();status.textContent='관리자 계정으로 로그인한 뒤 다시 열어 주세요.';return;}
   activeOwner=account.data.user.id;
   const result=await client.rpc('admin_reward_summary');if(ticket!==run)return;
   if(result.error)throw result.error;const d=result.data,p=d.policy;
   const fields=[['추천 조건',`가입 후 ${p.observation_days}일 경과 + 첫 ${p.observation_days}일 중 ${p.active_days_required}일 이상 이용`],['추천 보상',`${p.referral_group_size}명마다 ${p.gift_label} 반복 지급`],['전체 한도',`${p.referral_member_limit}명 · ${money(p.referral_member_limit/p.referral_group_size*p.referral_amount)}`],['월말 보상','순위표의 각 게임·난이도 항목 1위에게 '+p.gift_label],['지급 제외',`관리자 계정 및 지정 번호 ${d.excluded_numbers}개`]];
   $('policy').replaceChildren(...fields.flatMap(([a,b])=>[el('dt',a),el('dd',b)]));
   $('delivery').textContent='월말 선물은 직접 구매한 기프티콘을 아래에서 등록하면 당첨자의 쪽지로 발송됩니다. 추천 보상은 '+(p.provider_status==='connected'&&p.dispatch_enabled?'발송업체에 연결되어 있습니다.':'발송업체 연결 대기 중입니다.');
   couponRows(d);
   $('progress').textContent=`인정 회원 ${d.qualified_members} / 500명 · 추천 보상 예정 ${money(d.reserved_amount)} · 실제 발송 ${money(d.sent_amount)}`;
   $('meter').value=d.qualified_members;
   table($('referrers'),['추천인','활동 인정','보상으로 집계'],d.referrers.map(x=>[x.nickname,x.qualified_members+'명',x.allocated_members+'명']));
   table($('awards'),['대상','종류','금액','상태','등록'],d.awards.map(x=>[x.nickname||'탈퇴 회원',x.kind==='referral'?'추천 10명':game(x.game),money(x.amount),states[x.status]||x.status,date(x.created_at)]));
   table($('monthly'),['월','게임','1위','기록','지급 상태'],d.monthly_results.map(x=>[x.month_start.slice(0,7),game(x.game),x.winner_label||'탈퇴 회원',Number(x.score).toLocaleString('ko-KR'),states[x.reason]||x.reason]));
   content.hidden=false;status.textContent='최신 기록을 확인했어요.';
  }catch(error){if(ticket===run)status.textContent=/not_admin|permission denied/.test(String(error.message))?'관리자만 볼 수 있어요.':'기록을 불러오지 못했어요. 다시 확인해 주세요.';}
  finally{if(ticket===run)refresh.disabled=false;}
 }
 refresh.addEventListener('click',load);
 $('coupon-winner').addEventListener('change',couponTarget);
 $('coupon-file').addEventListener('change',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;upload=null;const file=$('coupon-file').files[0];$('coupon-preview').hidden=true;$('coupon-preview').removeAttribute('src');if(file){previewUrl=URL.createObjectURL(file);$('coupon-preview').src=previewUrl;$('coupon-preview').hidden=false;}});
 $('coupon-form').addEventListener('submit',async event=>{
  event.preventDefault();if(sending||!activeOwner)return;
  const chosen=pending.find(x=>x.id===$('coupon-winner').value),file=$('coupon-file').files[0],owner=activeOwner;
  if(!chosen||chosen.blocked_reason||!file)return;
  const exts={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'},extension=exts[file.type];
  if(!extension||!file.size||file.size>5242880){$('coupon-status').textContent='5MB 이하의 PNG·JPG·WEBP 이미지를 선택해 주세요.';return;}
  const title=$('coupon-title').value.trim(),code=$('coupon-code').value.trim(),expires=$('coupon-expires').value;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  if(expires<today){$('coupon-status').textContent='사용기한이 지난 기프티콘은 보낼 수 없어요.';return;}
  if(!/^[A-Z0-9]{6,80}$/.test(code.replace(/[\s-]/g,'').toUpperCase())){$('coupon-status').textContent='쿠폰번호를 확인해 주세요.';return;}
  sending=true;refresh.disabled=true;couponTarget();for(const n of $('coupon-form').elements)n.disabled=true;
  $('coupon-status').textContent='기프티콘을 등록하고 쪽지를 보내고 있어요.';
  try{
   await $('coupon-preview').decode();
   const account=await client.auth.getUser();if(account.error||account.data?.user?.id!==owner||activeOwner!==owner)throw Error('session_changed');
   if(!upload||upload.owner!==owner||upload.award!==chosen.id||upload.file!==file){
    const path=`${owner}/${chosen.id}/${crypto.randomUUID()}.${extension}`;
    const result=await client.storage.from('reward-coupons').upload(path,file,{contentType:file.type,cacheControl:'0',upsert:false});
    if(result.error)throw result.error;upload={owner,award:chosen.id,file,path};
   }
   if(activeOwner!==owner)throw Error('session_changed');
   const result=await client.rpc('admin_send_reward_coupon',{p_award:chosen.id,p_path:upload.path,p_coupon_code:code,p_title:title,p_expires:expires});
   if(result.error)throw result.error;if(!result.data?.ok)throw Error('delivery_not_confirmed');
   if(activeOwner!==owner)return;
   resetCoupon();$('coupon-status').textContent=chosen.nickname+'님에게 기프티콘 쪽지를 보냈어요.';
  }catch(error){
   if(activeOwner!==owner)return;
   const reason=String(error.message||error),messages={coupon_expired:'사용기한이 지난 쿠폰이에요.',coupon_already_used:'이미 지급된 쿠폰번호예요. 다른 쿠폰을 등록해 주세요.',award_already_delivered:'이미 기프티콘을 지급한 당첨 건이에요.',award_not_waiting:'현재 지급 대기 상태가 아니에요. 새로 확인해 주세요.',recipient_blocked:'차단 상태로 쪽지를 보낼 수 없어요.',reward_phone_changed:'당첨자의 전화번호가 변경되어 확인이 필요해요.',coupon_image_missing:'기프티콘 이미지 등록을 확인하지 못했어요.',monthly_winner_not_confirmed:'월말 확정 당첨자를 확인할 수 없어요.',session_changed:'로그인이 바뀌었어요. 다시 로그인해 주세요.'};
   $('coupon-status').textContent=Object.entries(messages).find(([key])=>reason.includes(key))?.[1]||(/reward_recipient_excluded/.test(reason)?'현재 지급 제외 대상이에요.':/coupon_deliveries_coupon_fingerprint_key/.test(reason)?'이미 지급된 쿠폰번호예요.':'발송을 확인하지 못했어요. 같은 내용으로 다시 보내면 중복 지급 없이 확인합니다.');
  }finally{sending=false;for(const n of $('coupon-form').elements)n.disabled=false;refresh.disabled=false;couponTarget();if(activeOwner===owner)await load();}
 });
 client.auth.onAuthStateChange((_event,session)=>{if(activeOwner&&session?.user?.id!==activeOwner){++run;activeOwner=null;content.hidden=true;resetCoupon();}if(!sending)setTimeout(load,0);});
 void load();
})();
