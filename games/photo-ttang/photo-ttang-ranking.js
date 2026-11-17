/* Shared by the World overlay and the standalone member page. */
(() => {
 'use strict';
 const stageKey=/^(?:[0-9]|[1-3][0-9]|c[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
 window.OjjudaPhotoRanking={bind({frame,client,owner,authorized,status}){
  let disposed=false;
  const active=()=>!disposed&&authorized()&&window.OjjudaAdminPreview?.isEnabled?.()!==true;
  const show=(text,retry=false)=>{if(disposed||!status)return;status.textContent=text;status.disabled=!retry;};
  const clears=window.OjjudaPuzzleRecords.pictures({game:'photo_ttang',owner,active,
   async submit(item){
    const session=await client.auth.getUser();
    if(!active()||session.error||session.data?.user?.id!==owner)throw Error('account_changed');
    const result=await client.rpc('record_photo_ttang_clear_at',{p_stage_id:item.stage,p_finished_at:item.completedAt,p_expected_owner:owner});
    if(result.error)throw result.error;
    if(result.data?.ok===true&&authorized())dispatchEvent(new CustomEvent('ojjuda:game-record-saved',{detail:{owner,game:'photo_ttang'}}));
    return result.data;
   },
   status(state,result){
    if(state==='saving')show('완료 기록 저장 중…');
    if(state==='failed')show('기록 저장 다시 시도',true);
    if(state==='saved'){
     show((result.previous_period?'이전 달 ':'이번 달 ')+result.score+'장 완료');
    }
   }
  });
  const receive=e=>{
   if(disposed||e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.type!=='ojjuda:photottang:clear'||!authorized())return;
   if(window.OjjudaAdminPreview?.isEnabled?.()===true){show('관리자 체험 · 완료 기록은 저장하지 않아요');return;}
   if(typeof e.data.stage==='string'&&stageKey.test(e.data.stage))clears.add(e.data.stage,e.data.completedAt);
  };
  status?.addEventListener('click',clears.flush);addEventListener('message',receive);void clears.flush();
  return ()=>{disposed=true;clears.dispose();removeEventListener('message',receive);status?.removeEventListener('click',clears.flush);};
 }};
})();
