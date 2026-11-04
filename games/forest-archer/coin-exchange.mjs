/** Account-bound JU exchange. Pending receipts survive reloads before local credit. */
export const COIN_PACKS=Object.freeze([10,50,100,500,1000,5000]);
export const COINS_PER_ZU=10;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PREFIX='forest-archer-coin-exchange-v1:';
export function createCoinExchangeClient({onCredit=()=>false,onChange=()=>{},host=globalThis.window,storage=globalThis.localStorage,timeout=12000}={}){
  const origin=host?.location?.origin,parent=host?.parent;
  let identity=null,pending=null,busy=false,disposed=false,notice='',balance=null;
  let connection=parent&&parent!==host?'connecting':'standalone';
  const waiting=new Map();
  const fail=reason=>({ok:false,reason});
  const notify=()=>{if(!disposed)onChange();};
  const current=context=>!disposed&&identity===context;
  const key=context=>PREFIX+context.owner;
  function readPending(context){
    const value=JSON.parse(storage.getItem(key(context))||'null');
    if(value!==null&&(!UUID.test(value.requestId||'')||!COIN_PACKS.includes(value.zu)))throw Error('invalid pending receipt');
    return value;
  }
  function send(context,action,record){
    if(!current(context))return Promise.resolve(fail('unavailable'));
    const requestId=action==='coin-exchange'?record.requestId:host.crypto.randomUUID();
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{waiting.delete(requestId);resolve(fail('pending'));},timeout);
      waiting.set(requestId,{context,action,resolve,timer});
      try{parent.postMessage({source:'ojjuda-archery-game',type:'ammo-request',launchEpoch:4,owner:context.owner,sessionId:context.sessionId,action,requestId,zu:record.zu,...(action==='coin-receipt'?{receiptId:record.requestId}:{})},origin);}
      catch{clearTimeout(timer);waiting.delete(requestId);resolve(fail('pending'));}
    });
  }
  async function perform(mode,zu){
    if(!identity||disposed)return fail('sign_in');
    if(busy)return fail('busy');
    if(mode==='buy'&&!COIN_PACKS.includes(zu))return fail('invalid');
    const context=identity;busy=true;notice='';notify();
    const work=async lock=>{
      if(lock===null)return fail('busy');
      if(!current(context))return fail('unavailable');
      let record;
      try{
        record=readPending(context);
        if(!record){
          if(mode==='receipt')return fail('nothing_pending');
          record={requestId:host.crypto.randomUUID(),zu};
          storage.setItem(key(context),JSON.stringify(record));
        }
        pending=record;
      }catch{return fail('storage');}
      notify();
      const result=await send(context,mode==='receipt'?'coin-receipt':'coin-exchange',record);
      if(!current(context))return fail('unavailable');
      if(Number.isSafeInteger(result.coins)&&result.coins>=0)balance=result.coins;
      const receipt=mode==='receipt'?result.receipt:result;
      if(result.ok&&receipt?.ok&&receipt.owner===context.owner&&receipt.request_id===record.requestId&&receipt.zu===record.zu&&receipt.game_coins===record.zu*COINS_PER_ZU){
        // onCredit must save the balance and receipt ID atomically, before removal.
        if(!onCredit(receipt))return fail('storage');
        try{storage.removeItem(key(context));}catch{return fail('storage');}
        pending=null;return {...receipt,ok:true};
      }
      if(!result.ok&&['coins','invalid','banned','wallet_unavailable','request_conflict'].includes(result.reason)){
        try{storage.removeItem(key(context));pending=null;}catch{return fail('storage');}
      }
      return result.ok?fail('pending'):result;
    };
    let result;
    try{result=host.navigator?.locks?.request?await host.navigator.locks.request(key(context),{ifAvailable:true},work):await work(undefined);}
    catch{result=fail('pending');}
    if(current(context)){
      busy=false;
      notice=result.ok?`${result.zu.toLocaleString('ko-KR')} ZU를 ${result.game_coins.toLocaleString('ko-KR')}코인으로 교환했어요.`:
        result.reason==='nothing_pending'?'':result.reason==='storage'?'저장 공간을 확인한 뒤 교환 내역을 다시 확인해 주세요.':result.reason==='coins'?'보유 ZU가 부족해요.':result.reason==='banned'?'현재 계정에서는 교환할 수 없어요.':result.reason==='busy'?'다른 처리가 끝난 뒤 다시 눌러 주세요.':'교환 내역을 다시 확인해 주세요. 중복으로 차감하지 않아요.';
      notify();
    }
    return result;
  }
  function receive(event){
    if(disposed||event.source!==parent||event.origin!==origin||event.data?.source!=='ojjuda-archery-world')return;
    const data=event.data;
    if(data.type==='init'){
      if(data.launchEpoch!==4||!UUID.test(data.sessionId||''))return;
      const signedIn=UUID.test(data.owner||'');
      connection=data.adminTrial===true?'trial':!signedIn?'guest':data.coinExchangeAvailable===true?'ready':'update';
      const usable=parent&&parent!==host&&connection==='ready';
      if(usable&&identity?.owner===data.owner&&identity?.sessionId===data.sessionId)return;
      for(const entry of waiting.values()){clearTimeout(entry.timer);entry.resolve(fail('unavailable'));}waiting.clear();
      identity=usable?{owner:data.owner,sessionId:data.sessionId}:null;busy=false;pending=null;balance=null;notice='';
      if(identity){try{pending=readPending(identity);}catch{notice='교환 내역 저장 공간을 확인해 주세요.';}}
      notify();if(pending)void perform('receipt');return;
    }
    if(data.type!=='ammo-response'||!identity||data.owner!==identity.owner||data.sessionId!==identity.sessionId)return;
    const entry=waiting.get(data.requestId);
    if(!entry||entry.context!==identity||entry.action!==data.action)return;
    clearTimeout(entry.timer);waiting.delete(data.requestId);
    entry.resolve(data.result&&typeof data.result.ok==='boolean'?data.result:fail('pending'));
  }
  host?.addEventListener?.('message',receive);
  return {
    get connection(){return connection;},get available(){return !!identity&&!disposed;},get owner(){return identity?.owner||null;},
    get busy(){return busy;},get pending(){return pending;},get notice(){return notice;},get balance(){return balance;},
    updateBalance(value){if(identity&&Number.isSafeInteger(value)&&value>=0&&value!==balance){balance=value;notify();}},
    exchange:zu=>perform('buy',zu),retry:()=>pending?perform('buy',pending.zu):Promise.resolve(fail('nothing_pending')),
    dispose(){disposed=true;identity=null;host?.removeEventListener?.('message',receive);for(const entry of waiting.values()){clearTimeout(entry.timer);entry.resolve(fail('unavailable'));}waiting.clear();}
  };
}
