(()=>{
 'use strict';
 const $=id=>document.getElementById(id),cfg=window.OJJUDA_CONFIG,id=new URL(location.href).searchParams.get('id');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 let run=0,owner=null,objectUrl=null;
 function clear(){++run;$('gift-content').hidden=true;$('gift-image').removeAttribute('src');$('gift-download').removeAttribute('href');$('gift-title').textContent='';$('gift-expiry').textContent='';if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;}
 if(!UUID.test(id||'')||!cfg?.supabaseUrl||!window.supabase?.createClient){$('gift-status').textContent='기프티콘 주소를 확인해 주세요.';$('gift-retry').hidden=true;return;}
 const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);
 async function load(){
  clear();const ticket=run;$('gift-retry').disabled=true;$('gift-status').textContent='기프티콘을 확인하고 있어요.';
  try{
   const account=await client.auth.getUser();if(ticket!==run)return;
   if(account.error||!account.data?.user){owner=null;$('gift-status').textContent='기프티콘을 받은 계정으로 오쭈다에 로그인한 뒤 다시 열어 주세요.';return;}
   owner=account.data.user.id;const result=await client.rpc('my_reward_coupon',{p_award:id});if(ticket!==run)return;
   if(result.error)throw result.error;const gift=result.data;
   const image=await client.storage.from('reward-coupons').download(gift.storage_path);if(ticket!==run)return;if(image.error)throw image.error;
   if(!['image/png','image/jpeg','image/webp'].includes(image.data.type))throw Error('invalid_image');
   objectUrl=URL.createObjectURL(image.data);$('gift-image').src=objectUrl;$('gift-title').textContent=gift.title;$('gift-expiry').textContent='사용기한: '+gift.expires_on;
   $('gift-download').href=objectUrl;$('gift-download').download='오쭈다-기프티콘.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[image.data.type]);
   $('gift-content').hidden=false;const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
   $('gift-status').textContent=gift.expires_on<today?'표시된 사용기한이 지났어요.':'월말 게임 순위 1위를 축하합니다!';
  }catch{if(ticket===run){clear();$('gift-status').textContent='이 기프티콘을 볼 수 없거나 이미지를 불러오지 못했어요. 받은 계정인지 확인한 뒤 다시 시도해 주세요.';$('gift-retry').disabled=false;}}
  finally{if(ticket===run||!owner)$('gift-retry').disabled=false;}
 }
 $('gift-retry').addEventListener('click',load);
 client.auth.onAuthStateChange((_event,session)=>{if(owner&&owner!==session?.user?.id){owner=null;clear();$('gift-status').textContent='로그인이 바뀌었어요. 기프티콘을 받은 계정으로 다시 확인해 주세요.';$('gift-retry').disabled=false;}});
 window.addEventListener('pagehide',()=>{owner=null;clear();});window.addEventListener('pageshow',event=>{if(event.persisted)void load();});
 void load();
})();
