import '../../shared/location/location.js?v=20261119-kma-current1';

// Prepare a short-lived position on Agit. Member features decide when to save it.
export function warmLocationOnAgit(db,{surface=window,service=globalThis.OjjudaLocation}={}){
  let account='',read=null,unsubscribe=()=>{},closed=false,lastAttempt=0,authRevision=0;
  const cancel=()=>{read?.abort();read=null;};
  // Park loads its cards independently, then requests GPS only when useful.
  // Avoid launching a second, competing Agit GPS read during a direct Park entry.
  const parkEntry=()=>surface.document?.documentElement?.classList?.contains?.('world-park-active')
    || /(?:^|[?&])(?:place|tab)=park(?:&|$)/.test(surface.location?.search||'');
  function warm(force=false){
    if(closed||!account||surface.document.hidden||read||parkEntry()||(!force&&Date.now()-lastAttempt<120000))return;
    lastAttempt=Date.now();
    const controller=new AbortController();read=controller;
    void service.readPosition({db,accountId:account,coarseCache:true,signal:controller.signal,preciseTimeout:12000})
      .catch(()=>{}).finally(()=>{if(read===controller)read=null;});
  }
  function sessionChanged(session){
    if(closed)return;
    const next=session?.user&&!session.user.is_anonymous?session.user.id:'';
    if(next===account)return;
    cancel();unsubscribe();
    if(account)service.forget(account);
    account=next;
    if(!account)return;
    unsubscribe=service.subscribe(account,choice=>{
      if(!choice.enabled)cancel();
      else warm(true);
    });
    warm(true);
  }
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{
    const revision=++authRevision;
    // Supabase auth callbacks must return before another auth read starts.
    setTimeout(()=>{if(revision===authRevision)sessionChanged(session);},0);
  });
  function checkSession(){
    const revision=authRevision;
    void db.auth.getSession().then(({data:{session}})=>{
      if(revision!==authRevision||closed)return;
      sessionChanged(session);warm();
    }).catch(()=>{});
  }
  const visible=()=>{if(surface.document.hidden)cancel();else checkSession();};
  const intent=event=>{if(event.target.closest?.('[data-pajang-launch]'))warm();};
  const show=event=>{if(event.persisted)checkSession();};
  const hide=event=>{cancel();if(!event.persisted)dispose();};
  function dispose(){
    closed=true;cancel();unsubscribe();subscription.unsubscribe();
    surface.document.removeEventListener('visibilitychange',visible);
    surface.document.removeEventListener('pointerover',intent);
    surface.document.removeEventListener('focusin',intent);
    surface.removeEventListener('pagehide',hide);surface.removeEventListener('pageshow',show);
  }
  surface.document.addEventListener('visibilitychange',visible);
  surface.document.addEventListener('pointerover',intent,{passive:true});
  surface.document.addEventListener('focusin',intent);
  surface.addEventListener('pagehide',hide);surface.addEventListener('pageshow',show);
  checkSession();
  return dispose;
}

if(typeof window!=='undefined'){
  const start=()=>{void window.OjjudaGetClient?.().then(db=>warmLocationOnAgit(db)).catch(()=>{});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
