"use client";
import {useEffect,useRef,useState} from "react";
import {openAccount} from "../lib/account-actions.mjs";
import {clearSignalPurchase,nonnegativeInteger,pendingSignalPurchase,readSignalReceipt,readSignalWallet,saveSignalPurchase,
  type PendingSignalPurchase,type SignalReceipt,type SignalWallet} from "../lib/signal-wallet";
import {I} from "./icons";

type Account=Awaited<ReturnType<typeof openAccount>>;
type Props={onBusyChange:(busy:boolean)=>void;onWallet:(wallet:SignalWallet,userId:string)=>void;onPurchased:(receipt:SignalReceipt,userId:string)=>void};
const changedAccount="계정이 바뀌었어요. 창을 닫고 다시 열어 주세요.";
const uncertainPurchase="구매 결과를 확인하지 못했어요. 다시 누르면 같은 구매 요청으로 이어져요.";
const failureText:Record<string,string>={coins:"쭈가 부족해요. 충전한 뒤 다시 구매해 주세요.",
  price_changed:"신호 가격이 바뀌었어요. 새 가격을 확인하고 다시 선택해 주세요.",
  purchase_unavailable:"지금은 추가 신호를 구매할 수 없어요.",free_remaining:"구매 조건을 다시 확인해 주세요. 창을 닫고 다시 열어 주세요.",
  invalid:"구매 정보를 다시 확인해 주세요.",request_conflict:"이 구매 요청을 확인하지 못했어요. 창을 닫고 다시 열어 주세요.",
  wallet_unavailable:"쭈 잔액을 확인하지 못했어요. 잠시 후 다시 시도해 주세요."};
const format=(value:number)=>value.toLocaleString("ko-KR");

export function SignalPurchaseForm({onBusyChange,onWallet,onPurchased}:Props){
  const [account,setAccount]=useState<Account|null>(null),[wallet,setWallet]=useState<SignalWallet|null>(null);
  const [selected,setSelected]=useState<string|null>(null),[pending,setPending]=useState<PendingSignalPurchase|null>(null);
  const [checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false);
  const [complete,setComplete]=useState(false);
  const [error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  const active=useRef(false),owner=useRef<Account|null>(null),locked=useRef(false),controller=useRef<AbortController|null>(null);
  const completed=useRef(false);
  const callbacks=useRef({onBusyChange,onWallet,onPurchased});callbacks.current={onBusyChange,onWallet,onPurchased};
  const coinRevision=useRef(0),latestCoins=useRef<number|null>(null);
  const current=(value:Account)=>active.current&&owner.current===value&&value.isCurrent();
  function invalidate(){
    controller.current?.abort();setAccount(null);setWallet(null);setSelected(null);setPending(null);
    setBlocked(true);setError(changedAccount);
  }
  async function rpc(value:Account,name:string,args?:Record<string,unknown>){
    const identity=await value.db.auth.getSession();
    if(!current(value))throw Error("account_changed");
    if(identity.error)throw identity.error;
    const session=identity.data?.session;
    if(session?.user?.id!==value.userId||session.user.is_anonymous||!session.access_token)throw Error("account_changed");
    const request=new AbortController();controller.current=request;
    const timeout=setTimeout(()=>request.abort(),15000);
    try {
      // Bind both the wallet and any purchase to the member who opened this form.
      const {data,error}=await value.db.rpc(name,args).setHeader("Authorization",`Bearer ${session.access_token}`).abortSignal(request.signal);
      if(!current(value))throw Error("account_changed");
      if(error)throw error;
      return data;
    }finally{clearTimeout(timeout);if(controller.current===request)controller.current=null;}
  }
  async function loadWallet(value:Account){
    const revision=coinRevision.current;
    const data=readSignalWallet(await rpc(value,"pajang_signal_wallet"));
    if(!data)throw Error("wallet_unconfirmed");
    if(revision!==coinRevision.current&&latestCoins.current!==null)data.coins=latestCoins.current;
    setWallet(data);return data;
  }
  function purchaseArgs(value:PendingSignalPurchase,verifyOnly:boolean){
    return {p_pack:value.pack,p_request_id:value.requestId,p_expected_user:value.userId,
      p_expected_price:value.price,p_expected_revision:value.revision,p_verify_only:verifyOnly};
  }
  function finish(value:PendingSignalPurchase,receipt:SignalReceipt,member:Account){
    if(!current(member)||completed.current)return;
    // History closes asynchronously. Mark this form finished before it can
    // accept another click or a programmatic submit while that close settles.
    completed.current=true;setComplete(true);
    clearSignalPurchase(value);setPending(null);
    setWallet(previous=>previous?{...previous,coins:receipt.coins,freeRemaining:receipt.freeRemaining,
      paidRemaining:receipt.paidRemaining,remaining:receipt.remaining}:previous);
    window.dispatchEvent(new CustomEvent("pajang:balance",{detail:{userId:member.userId,coins:receipt.coins}}));
    callbacks.current.onPurchased(receipt,member.userId);
  }

  useEffect(()=>{
    let cancelled=false,dispose=()=>{};
    active.current=true;setChecking(true);setBlocked(false);setError("");
    function balance(event:Event){
      const detail=(event as CustomEvent).detail,value=owner.current;
      if(!value||!current(value)||detail?.userId!==value.userId||!nonnegativeInteger(detail.coins))return;
      coinRevision.current++;latestCoins.current=detail.coins;
      setWallet(previous=>previous?{...previous,coins:detail.coins}:previous);
    }
    window.addEventListener("pajang:balance",balance);
    void (async()=>{
      const value=await openAccount(false,()=>{if(!cancelled)invalidate();});
      if(cancelled){value.dispose();return;}
      dispose=value.dispose;owner.current=value;setAccount(value);
      const saved=pendingSignalPurchase(value.userId);
      setPending(saved);setSelected(saved?.pack??null);
      const data=await loadWallet(value);
      if(saved){
        // Reopening a dialog only checks a receipt; it never starts a new charge.
        const result=await rpc(value,"pajang_signal_purchase",purchaseArgs(saved,true));
        const receipt=readSignalReceipt(result,saved);
        if(receipt){finish(saved,receipt,value);return;}
        if(result?.ok===false&&result.reason==="not_found")setError(uncertainPurchase);
        else throw Error("purchase_unconfirmed");
      }
      if(current(value))callbacks.current.onWallet(data,value.userId);
    })().catch(reason=>{
      if(cancelled)return;
      if(reason?.message==="account_changed")invalidate();
      else setError(owner.current&&pendingSignalPurchase(owner.current.userId)?uncertainPurchase:"신호와 쭈 잔액을 불러오지 못했어요. 다시 확인해 주세요.");
    }).finally(()=>{if(!cancelled)setChecking(false);});
    return()=>{
      cancelled=true;active.current=false;controller.current?.abort();dispose();owner.current=null;
      window.removeEventListener("pajang:balance",balance);
      if(locked.current){locked.current=false;callbacks.current.onBusyChange(false);}
    };
  },[attempt]);

  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(locked.current||completed.current||checking||blocked||!account||!wallet)return;
    if(!current(account)){invalidate();return;}
    const choice=wallet.offers.find(item=>item.id===selected);
    if(!pending&&(!wallet.purchasingEnabled||!choice||wallet.coins<choice.price))return;
    const value=pending??{userId:account.userId,requestId:crypto.randomUUID(),pack:choice!.id,
      quantity:choice!.quantity,price:choice!.price,revision:choice!.revision};
    // Save before the network call, so a dropped reply cannot become a second purchase.
    saveSignalPurchase(value);setPending(value);locked.current=true;setBusy(true);setError("");callbacks.current.onBusyChange(true);
    let receipt:SignalReceipt|null=null;
    try{
      const result=await rpc(account,"pajang_signal_purchase",purchaseArgs(value,false));
      receipt=readSignalReceipt(result,value);
      if(!receipt){
        if(result?.ok!==false||typeof result.reason!=="string")throw Error("purchase_unconfirmed");
        if(result.reason==="account_changed")throw Error("account_changed");
        const message=failureText[result.reason];
        if(!message)throw Error("purchase_unconfirmed");
        // These are explicit server rejections before a charge. New prices need new consent.
        clearSignalPurchase(value);setPending(null);setSelected(null);setError(message);
        try{
          const refreshed=await loadWallet(account);
          if(current(account))callbacks.current.onWallet(refreshed,account.userId);
        }catch(reason){
          if(!current(account))throw reason;
          setWallet(null);setError(message+" 잔액을 다시 확인해 주세요.");
        }
      }
    }catch(reason){
      if(current(account))setError(uncertainPurchase);
      else if(active.current)invalidate();
    }finally{
      locked.current=false;
      if(active.current){setBusy(false);callbacks.current.onBusyChange(false);}
    }
    if(receipt)finish(value,receipt,account);
  }

  const choice=pending?{id:pending.pack,quantity:pending.quantity,price:pending.price,revision:pending.revision}:
    wallet?.offers.find(item=>item.id===selected);
  const available=!!wallet?.purchasingEnabled&&wallet.offers.length>0;
  const short=!!choice&&!!wallet&&wallet.coins<choice.price;
  const canBuy=!!account&&!blocked&&!checking&&!busy&&!complete&&!!wallet&&!!choice&&(!!pending||(available&&!short));
  return <form className="signal-purchase" onSubmit={event=>void submit(event)} aria-busy={checking||busy}>
    <span className="modalicon"><I n="signal"/></span><h2>추가 신호 구매</h2>
    <p className="sub">무료 신호가 남아 있어도 미리 구매할 수 있어요.</p>
    {checking&&<p className="sub" role="status">신호와 쭈 잔액을 확인하고 있어요.</p>}
    {wallet&&<>
      <dl className="signal-wallet"><div><dt>보유 쭈</dt><dd>{format(wallet.coins)}<span>쭈</span></dd></div>
        <div><dt>남은 신호</dt><dd>{format(wallet.remaining)}<span>개</span></dd></div></dl>
      <p className="signal-wallet-note">오늘 무료 {wallet.freeRemaining}개 · 구매한 신호 {format(wallet.paidRemaining)}개</p>
      {available&&!pending&&!complete&&<fieldset className="signal-offers" disabled={checking||busy||blocked}><legend>구매할 신호 선택</legend>
        {wallet.offers.map(item=><label className={selected===item.id?"selected":""} key={item.id}>
          <input type="radio" name="signal-pack" value={item.id} checked={selected===item.id} onChange={()=>{setSelected(item.id);setError("");}}/>
          <span><strong>신호 {format(item.quantity)}개</strong><b>{format(item.price)}쭈</b></span>
        </label>)}
      </fieldset>}
      {choice&&<div className="signal-confirm" role="status"><strong>신호 {format(choice.quantity)}개</strong><span>{format(choice.price)}쭈 사용</span></div>}
      {!checking&&!available&&!pending&&<p className="sub" role="status">지금은 추가 신호를 구매할 수 없어요.</p>}
    </>}
    {error&&<p className="error" role="alert">{error}</p>}
    {!checking&&!wallet&&!blocked&&<button type="button" className="secondary wide" onClick={()=>setAttempt(value=>value+1)}>다시 확인</button>}
    {choice&&short&&!pending&&!complete&&<div className="signal-short"><p>{format(choice.price-wallet!.coins)}쭈가 더 필요해요.</p>
      <button type="button" className="secondary wide" data-ju-charge-open disabled={busy||blocked}>쭈 충전하기</button></div>}
    {(available||pending)&&<button type="submit" className="primary wide" disabled={!canBuy}>
      {complete?"구매 완료":busy?"구매 확인 중…":pending?"같은 구매 다시 확인":choice?format(choice.price)+"쭈로 신호 "+format(choice.quantity)+"개 구매":"신호 묶음을 선택해 주세요"}
    </button>}
    {(available||pending)&&<p className="signal-purchase-note">무료 신호부터 사용해요. 구매한 신호는 다음 날에도 남아요.</p>}
  </form>;
}
