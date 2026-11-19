import {client} from './member.mjs?v=account1';
import '../../note/notifications.js?v=20261117-inbox-keyboard1';
import '../wallet/ju-charge.js?v=20261119-pajang-toolbar1';

// This public toolbar shares the same authenticated client as the member app.
// Balances are never seeded from a demo value or a previous account's storage.
export function installPajangToolbar() {
  const amount=document.querySelector('[data-pajang-balance]');
  const wallet=amount?.closest('[data-ju-charge-open]');
  const bell=document.querySelector('.pajang-mast [data-notifications-open]');
  if(!amount||!wallet||!bell)return;
  let db,userId=null,authKnown=false,authRevision=0,balanceRun=0,pendingBalance=null;
  let connecting=null,subscription,notifications,installed=false,overlayAccount=0;
  const overlayWatchers=[];

  function watchOverlay(node,api) {
    if(!node||node.dataset.pajangHistoryOverlay)return;
    node.dataset.pajangHistoryOverlay='true';
    let visible=false,context=null,registered=false;
    const stationHistory=()=>window.OjjudaPajangHistory;
    const sync=()=>{
      const service=api();
      if(!service)return;
      if(service.isOpen()){
        if(!visible){
          visible=true;registered=false;
          const revision=overlayAccount,member=userId;
          const entry={
            isCurrent:()=>revision===overlayAccount&&member===userId,
            canLeave:()=>!entry.isCurrent()||!service.isOpen()||service.canLeave?.()!==false,
            show:()=>{if(entry.isCurrent()){visible=true;registered=true;context=entry;if(!service.isOpen())service.open();}},
            hide:()=>{visible=false;service.close();}
          };
          context=entry;
        }
        const history=stationHistory();
        if(history&&!registered){
          if(!history.canLeave()){visible=false;service.close();return;}
          registered=true;history.openExternal(context,{stack:true});
        }
      }else if(visible){
        visible=false;
        if(registered)stationHistory()?.closeExternal(context);
      }
    };
    // Native Escape/close and the inbox's own close button also consume their entry.
    new MutationObserver(sync).observe(node,{attributes:true,attributeFilter:['open','hidden']});
    node.addEventListener('close',sync);
    node.addEventListener('cancel',event=>{if(api()?.canLeave?.()===false)event.preventDefault();});
    node.addEventListener('click',event=>{
      if(api()?.canLeave?.()!==false)return;
      if(event.target===node||event.target.closest?.('.ju-charge-close')){
        event.preventDefault();event.stopImmediatePropagation();
      }
    },true);
    overlayWatchers.push(sync);sync();
  }

  function watchDialogs() {
    if(!window.document)return;
    watchOverlay(document.getElementById('ju-charge-dialog'),()=>window.OjjudaCharge);
    watchOverlay(document.getElementById('note-notification-backdrop'),()=>notifications);
  }

  function paint(value,label) {
    amount.textContent=value;
    wallet.setAttribute('aria-label',`${label}, 충전 열기`);
    wallet.title=`${label}, 충전 열기`;
  }

  function acceptBalance(coins,owner) {
    if(!owner||owner!==userId||!Number.isSafeInteger(coins)||coins<0)return false;
    // A charge or purchase can complete while an older balance read is pending.
    ++balanceRun;pendingBalance=null;
    paint(coins.toLocaleString('ko-KR'),`보유 ${coins.toLocaleString('ko-KR')} ZU`);
    return true;
  }

  function balanceChanged(event) {
    acceptBalance(event.detail?.coins,event.detail?.userId);
  }

  function refreshBalance() {
    const owner=userId;
    if(!db||!authKnown||!owner||document.hidden)return Promise.resolve();
    if(pendingBalance?.owner===owner)return pendingBalance.promise;
    const request={owner,run:++balanceRun,promise:null};
    pendingBalance=request;
    const current=()=>request.run===balanceRun&&owner===userId;
    request.promise=(async()=>{
      try{
        const {data,error}=await db.from('user_private').select('coins').eq('user_id',owner).maybeSingle();
        if(!current())return;
        if(error||!Number.isSafeInteger(data?.coins)||data.coins<0)throw Error('balance_unavailable');
        acceptBalance(data.coins,owner);
      }catch{
        if(current())paint('—','보유 ZU 확인 불가');
      }finally{
        if(pendingBalance===request)pendingBalance=null;
      }
    })();
    return request.promise;
  }

  function sessionChanged(session) {
    const next=session?.user&&!session.user.is_anonymous?session.user.id:null;
    const changed=!authKnown||next!==userId;
    authKnown=true;
    if(!changed)return;
    userId=next;++overlayAccount;++balanceRun;pendingBalance=null;
    paint(next?'…':'—',next?'보유 ZU 확인 중':'로그인 후 보유 ZU 확인');
    notifications?.close();
    window.OjjudaCharge?.close();
    // Supabase must finish its auth callback before another request starts.
    if(installed)setTimeout(()=>{if(userId===next)void refreshBalance();},0);
  }

  function navigate(path) {
    (window.top||window).location.assign(path);
  }

  async function connect() {
    if(connecting)return connecting;
    connecting=(async()=>{
      db=await client();
      if(!subscription){
        subscription=db.auth.onAuthStateChange((_event,session)=>{
          ++authRevision;sessionChanged(session);
        })?.data?.subscription;
      }
      const revision=authRevision;
      const {data,error}=await db.auth.getSession();
      if(error)throw error;
      // A late initial getSession result must not restore the old account.
      if(revision===authRevision)sessionChanged(data?.session);
      if(!installed){
        window.OjjudaCharge.install({client:db,getUserId:()=>userId,source:'pajang',onBalance:(coins,owner)=>{
          if(!acceptBalance(coins,owner))return;
          window.dispatchEvent(new CustomEvent('pajang:balance',{detail:{userId:owner,coins}}));
        }});
        notifications=window.OjjudaNotifications.install({client:db,getUserId:()=>userId,
          onOpenCard:id=>navigate('/world.html?place=park&card='+encodeURIComponent(id)),
          onOpenInquiry:id=>navigate('/world.html?inquiry='+encodeURIComponent(id)+'&from=pajang'),
          onKeepCard:(id,kind)=>navigate('/world.html?place=park&card='+encodeURIComponent(id)+'&keep='+encodeURIComponent(kind)),
          onOpenWorld:(type,id)=>navigate('/world.html?notice='+encodeURIComponent(type)+'&target='+encodeURIComponent(id)),
          onOpenGroup:id=>navigate('/groups/#room='+encodeURIComponent(id)),
          onGiftClaimed:()=>void refreshBalance()
        });
        watchDialogs();
        installed=true;
      }
      await refreshBalance();
      return true;
    })().catch(()=>{
      if(!authKnown||userId)paint('—','보유 ZU 확인 불가');
      return false;
    }).finally(()=>{connecting=null;});
    return connecting;
  }

  // The same delegated charge control is also used by the account settings.
  // Retry an unavailable SDK/session before opening a shared dialog.
  document.addEventListener('click',event=>{
    const control=event.target.closest?.('[data-ju-charge-open],[data-notifications-open]');
    if(!control)return;
    if(window.OjjudaPajangHistory?.canLeave()===false){event.preventDefault();event.stopImmediatePropagation();return;}
    if(installed)return;
    event.preventDefault();event.stopImmediatePropagation();
    void connect().then(ready=>{
      if(!ready)return;
      if(control.matches('[data-ju-charge-open]'))window.OjjudaCharge.open();
      else notifications.open();
    });
  },true);
  const resume=()=>{
    if(document.hidden)return;
    if(installed)void refreshBalance();else void connect();
  };
  window.addEventListener('focus',resume);
  window.addEventListener('pageshow',resume);
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pajang:balance',balanceChanged);
  // The charge dialog is created lazily on its first open; the React member
  // history may also become ready after the public toolbar has initialized.
  new MutationObserver(watchDialogs).observe(document.body,{childList:true});
  window.addEventListener('pajang:history-ready',()=>{watchDialogs();for(const sync of overlayWatchers)sync();});
  void connect();
}
