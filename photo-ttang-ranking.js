/* Shared by the World overlay and the standalone member page. */
(() => {
 'use strict';
 window.OjjudaPhotoRanking={bind({frame,client,owner,authorized,status}){
  let disposed=false;
  const pending=new Set(),failed=new Set();
  const show=(text,retry=false)=>{if(disposed||!status)return;status.textContent=text;status.disabled=!retry;};
  async function save(stage){
   if(pending.has(stage)||!authorized())return;
   pending.add(stage);failed.delete(stage);
   show('완료 기록 저장 중…');
   try{
    const session=await client.auth.getUser();
    if(session.error||session.data?.user?.id!==owner)throw Error('account_changed');
    const result=await client.rpc('photo_game_clear',{p_stage:stage});
    if(result.error||result.data?.ok!==true)throw Error('save_failed');
    show('이번 달 '+result.data.score+'장 완료');
    dispatchEvent(new CustomEvent('ojjuda:game-record-saved',{detail:{owner,game:'photo_ttang'}}));
   }catch{failed.add(stage);show('기록 저장 다시 시도',true);}
   finally{pending.delete(stage);if(failed.size)show('기록 저장 다시 시도',true);}
  }
  const retry=()=>{for(const stage of failed)void save(stage);};
  const receive=e=>{
   if(disposed||e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.type!=='ojjuda:photottang:clear'||!authorized())return;
   const stage=e.data.stage;
   if(typeof stage!=='string'||! /^(?:[0-9]|1[0-9]|c[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(stage))return;
   void save(stage);
  };
  status?.addEventListener('click',retry);addEventListener('message',receive);
  return ()=>{disposed=true;removeEventListener('message',receive);status?.removeEventListener('click',retry);};
 }};
})();
