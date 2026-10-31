(() => {
 'use strict';
 const $=id=>document.getElementById(id), content=$('content'), status=$('status'), refresh=$('refresh');
 const config=window.OJJUDA_CONFIG;
 if(!config?.supabaseUrl||!config?.supabaseKey||!window.supabase?.createClient){status.textContent='설정을 불러오지 못했어요.';return;}
 if(!window.OjjudaCouponManager||!window.OjjudaCouponBatch||!window.OjjudaCouponReader||!window.OjjudaCouponParser){status.textContent='상품권 등록 화면을 불러오지 못했어요. 새로고침해 주세요.';return;}
 const client=window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
 const names={billiards:'당구',tank:'탱크게임',saetbyeol:'샛별키우기',mines:'지뢰찾기',tour:'오쭈다 마블',screw_box:'나사풀기 · 박스형',screw_flat:'나사풀기 · 평면형',spot:'틀린그림찾기',ttang:'월드땅따먹기',mole:'두더지잡기',runner:'달리기',stacker:'쌓기',breakout:'벽돌깨기',matgo:'맞고',poker:'세븐포커',photo_ttang:'포토땅따먹기',carom4:'당구 · 4구',carom3:'당구 · 3쿠션',pool8:'포켓볼',janggi:'장기',chess:'체스'};
 const states={awaiting_provider:'발송업체 연결 대기',awaiting_coupon:'기프티콘 등록 대기',ready:'발송 대기',sending:'발송 확인 중',sent:'발송 완료',blocked:'지급 제외',failed:'실패',unknown:'업체 확인 필요',admin_excluded:'관리자 제외',admin_phone_excluded:'관리자 번호 제외',not_a_member:'비회원 미지급',unconfirmed_member:'가입 인증 미완료',banned:'이용 제한',missing_phone:'전화번호 확인 필요',recipient_blocked:'차단 상태 확인 필요'};
 let run=0,activeOwner=null,loading=false;
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
 const coupons=window.OjjudaCouponManager.mount({client,game,onRefresh:()=>load(true),onBusy:busy=>{refresh.disabled=busy||loading;}});
 async function load(force=false){
  if(coupons.isSending()&&!force)return false;
  const ticket=++run;loading=true;if(!activeOwner)content.hidden=true;refresh.disabled=true;status.textContent='지급 현황을 확인하고 있어요.';
  try{
   const account=await client.auth.getUser();if(ticket!==run)return false;
   if(account.error||!account.data?.user){activeOwner=null;coupons.reset();content.hidden=true;status.textContent='관리자 계정으로 로그인한 뒤 다시 열어 주세요.';return false;}
   if(activeOwner&&activeOwner!==account.data.user.id){coupons.reset();content.hidden=true;}
   activeOwner=account.data.user.id;
   const result=await client.rpc('admin_reward_summary');if(ticket!==run)return false;
   if(result.error)throw result.error;const d=result.data,p=d.policy;
   const fields=[['추천 조건',`가입 후 ${p.observation_days}일 경과 + 첫 ${p.observation_days}일 중 ${p.active_days_required}일 이상 이용`],['추천 보상',`${p.referral_group_size}명마다 ${p.gift_label} 반복 지급`],['전체 한도',`${p.referral_member_limit}명 · ${money(p.referral_member_limit/p.referral_group_size*p.referral_amount)}`],['월말 보상','순위표의 각 게임·난이도 항목 1위에게 '+p.gift_label],['지급 제외',`관리자 계정 및 지정 번호 ${d.excluded_numbers}개`]];
   $('policy').replaceChildren(...fields.flatMap(([a,b])=>[el('dt',a),el('dd',b)]));
   $('delivery').textContent='월말 선물은 직접 구매한 기프티콘을 아래에서 등록하면 당첨자의 쪽지로 발송됩니다. 추천 보상은 '+(p.provider_status==='connected'&&p.dispatch_enabled?'발송업체에 연결되어 있습니다.':'발송업체 연결 대기 중입니다.');
   coupons.setData(d,activeOwner);
   table($('coupon-sent'),['당첨자','상품','사용기한','쪽지 발송'],(d.monthly_sent||[]).map(x=>[x.nickname||'탈퇴 회원',x.title,x.expires_on,date(x.delivered_at)]));
   $('progress').textContent=`인정 회원 ${d.qualified_members} / 500명 · 추천 보상 예정 ${money(d.reserved_amount)} · 실제 발송 ${money(d.sent_amount)}`;
   $('meter').value=d.qualified_members;
   table($('referrers'),['추천인','활동 인정','보상으로 집계'],d.referrers.map(x=>[x.nickname,x.qualified_members+'명',x.allocated_members+'명']));
   table($('awards'),['대상','종류','금액','상태','등록'],d.awards.map(x=>[x.nickname||'탈퇴 회원',x.kind==='referral'?'추천 10명':game(x.game),money(x.amount),states[x.status]||x.status,date(x.created_at)]));
   table($('monthly'),['월','게임','1위','기록','지급 상태'],d.monthly_results.map(x=>[x.month_start.slice(0,7),game(x.game),x.winner_label||'탈퇴 회원',Number(x.score).toLocaleString('ko-KR'),states[x.reason]||x.reason]));
   content.hidden=false;status.textContent='최신 기록을 확인했어요.';return true;
  }catch(error){if(ticket===run){const denied=/not_admin|permission denied/.test(String(error.message));if(denied){activeOwner=null;coupons.reset();content.hidden=true;}status.textContent=denied?'관리자만 볼 수 있어요.':'기록을 불러오지 못했어요. 다시 확인해 주세요.';}return false;}
  finally{if(ticket===run){loading=false;refresh.disabled=coupons.isSending();}}
 }
 refresh.addEventListener('click',()=>void load());
 client.auth.onAuthStateChange((_event,session)=>{if(activeOwner&&session?.user?.id!==activeOwner){++run;activeOwner=null;content.hidden=true;coupons.reset();}if(!coupons.isSending())setTimeout(()=>void load(),0);});
 void load();
})();
