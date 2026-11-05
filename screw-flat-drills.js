/* Flat screw rewards. Members have an account wallet; guests keep theirs on this device. */
(function(){
  'use strict';
  const prefix='ojjuda-flat-drills-v1';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
  function legacyProgress(owner,unlocked){
    const key=prefix+':legacy';
    let snapshot=read(key,null);
    if(!snapshot){
      const previousOwners=[];
      try{for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);if(k?.startsWith('ojjuda-screw-flat-active-attempt-v1:'))previousOwners.push(k.split(':').pop());
      }}catch{}
      const actor=previousOwners.length===1?previousOwners[0]:previousOwners.length?'shared':owner||'guest';
      snapshot={device:crypto.randomUUID(),owner:actor,cleared:Math.max(0,Math.min(999,unlocked-1))};
      if(!write(key,snapshot))return null;
    }
    if(snapshot.owner===(owner||'guest'))return snapshot;
    // On a shared browser use only this member's own pre-update stage record.
    const own=read('ojjuda-screw-flat-active-attempt-v1:'+owner,null),key2=key+':'+owner;
    if(snapshot.owner==='shared'&&owner&&own){
      let saved=read(key2,null);
      if(!saved){saved={device:crypto.randomUUID(),cleared:Math.max(0,Math.min(snapshot.cleared,own.stage-1))};write(key2,saved);}
      return saved;
    }
    return null;
  }
  function create(api,owner,unlocked){
    const account=owner||'guest',base=prefix+':'+account,legacy=legacyProgress(owner,unlocked);
    const state={balance:0,ready:false,result:'',legacyAdded:0};
    const guestKey=base+':wallet';
    const guestWallet=()=>read(guestKey,{earned:{},used:{},first:{},legacy:legacy?.cleared||0});
    const guestBalance=w=>w.legacy+Object.keys(w.earned).filter(s=>Number(s)>w.legacy).length-Object.keys(w.used).length;
    const guestAction=fn=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request(guestKey,fn):Promise.resolve(fn());
    const current=()=>!owner||api.getUserId?.()===owner;
    const changed=()=>api.drillChanged?.();
    const remote=(action,run,extra={})=>api.drillAction(action,run,extra);
    async function flush(){
      if(!owner||!api.verifyDrill||!current())return;
      const queue=read(base+':clears',{});
      for(const proof of Object.values(queue)){
        if(!current())return;
        try{
          await remote('start',proof);
          if(!current())return;
          const r=await api.verifyDrill(proof);
          if(!current()||!r?.ok)continue;
          const latest=read(base+':clears',{});delete latest[proof.run];write(base+':clears',latest);
          state.balance=r.balance;
          if(active?.run===proof.run)state.result=r.reward==='earned'?'드릴 1개 획득':r.reward==='items_used'?'아이템 사용 · 순위 반영':'순위 반영';
          changed();
        }catch{}
      }
    }
    let active=null,registration=Promise.resolve(),flushing=null;
    const reconcile=()=>{if(!flushing)flushing=flush().finally(()=>{flushing=null;});return flushing;};
    function start(stage,attempt){
      const run={stage,attempt,run:crypto.randomUUID()};active=run;
      state.ready=false;state.result='';state.legacyAdded=0;
      if(!owner){
        registration=guestAction(()=>{
          const w=guestWallet();if(!w.first[stage])w.first[stage]=run.run;
          write(guestKey,w);state.balance=guestBalance(w);state.ready=true;changed();
        });return run;
      }
      if(!api.drillAction)return run;
      const key=base+':first:'+stage,first=read(key,run);write(key,first);
      registration=(async()=>{
        if(!current())return;
        if(first.run!==run.run)await remote('start',first);
        if(!current())return;
        const r=await remote('start',run,{device:legacy?.device||null,legacy:legacy?.cleared||0});
        if(!current()||active!==run||!r?.ok)return;
        state.balance=r.balance;state.legacyAdded=r.legacy_added||0;state.ready=true;changed();
        void reconcile();
      })().catch(()=>{});return run;
    }
    async function fail(run){
      run.failed=true;
      if(owner&&api.drillAction&&current()){await registration;try{if(current())await remote('fail',run);}catch{}}
    }
    function finish(run,events,endTick,itemsUsed){
      if(run.failed||itemsUsed){state.result=itemsUsed?'아이템 사용 · 순위 반영':'재도전 · 순위 반영';changed();return;}
      if(!owner){
        void guestAction(()=>{
          const w=guestWallet();
          if(w.first[run.stage]===run.run&&run.stage>w.legacy&&!w.earned[run.stage]){
            w.earned[run.stage]=true;state.result='드릴 1개 획득';
          }else state.result='순위 반영';
          write(guestKey,w);state.balance=guestBalance(w);changed();
        });return;
      }
      if(!api.verifyDrill||!current())return;
      const first=read(base+':first:'+run.stage,null);
      if(first&&first.run!==run.run){state.result='재도전 · 순위 반영';changed();return;}
      const proof={...run,events,endTick},queue=read(base+':clears',{});
      queue[run.run]=proof;write(base+':clears',queue);state.result='드릴 지급 확인 중';changed();
      void registration.then(async()=>{await reconcile();if(read(base+':clears',{})[run.run])await reconcile();});
    }
    async function use(run,currentHoles){
      if(currentHoles>=9)return {ok:false,reason:'limit'};
      if(!owner)return guestAction(()=>{
        const w=guestWallet();
        if(guestBalance(w)<1)return {ok:false,reason:'empty'};
        w.used[crypto.randomUUID()]=run.attempt;
        if(!write(guestKey,w))return {ok:false};
        state.balance=guestBalance(w);changed();return {ok:true,count:currentHoles+1};
      });
      if(!current()||!api.drillAction)return {ok:false};
      await registration;if(!current())return {ok:false};
      const key=base+':use:'+run.attempt,id=read(key,null)||crypto.randomUUID();
      if(!write(key,id))return {ok:false};
      const r=await remote('use',run,{request:id});
      if(r?.ok||['empty','limit','request_conflict'].includes(r?.reason))write(key,null);
      if(current()&&Number.isSafeInteger(r?.balance)){state.balance=r.balance;changed();}return r;
    }
    return {state,start,fail,finish,use};
  }
  const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else globalThis.OjjudaFlatDrills=api;
})();
