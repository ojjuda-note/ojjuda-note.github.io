import {useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import {exchange,PeerProfile,type ExchangeKind,type SharedProfile} from "./exchange-profile";
import {SharedExchangePhotos} from "./exchange-photos";
import {I} from "./icons";

type Permission = "none"|"sent"|"received"|"accepted";
type ExchangeState = {
  myCount:number; peerCount:number; eligible:boolean;
  profile:Permission; photos:Permission; peerProfile:SharedProfile|null;
};
type Action = "request"|"accept"|"decline"|"withdraw"|"revoke";
type ChatExchangeParts = {notification:ReactNode;actions:ReactNode};
const categories:{kind:ExchangeKind;label:string}[]=[{kind:"profile",label:"프로필"},{kind:"photos",label:"사진"}];

// Render the conversation notice and the compact buttons in their own slots.
// Both share one authenticated server state: no duplicate polling or client-side
// message counter can override the server's five-messages-each consent gate.
export function ChatExchange({peer,lastMessage,children}:{
  peer:string;name:string;lastMessage?:string;children:(parts:ChatExchangeParts)=>ReactNode;
}) {
  const [state,setState]=useState<ExchangeState|null>(null);
  const [looking,setLooking]=useState<ExchangeKind|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
  const reading=useRef<number|null>(null);
  const revision=useRef(0),pending=useRef(false),mounted=useRef(false);
  const notificationRef=useRef<HTMLDivElement>(null);

  const reload=useCallback(async()=>{
    if(pending.current||reading.current!==null||document.hidden)return;
    const request=++revision.current;
    reading.current=request;
    try {
      const next=await exchange<ExchangeState>("state",{p_peer:peer});
      if(!mounted.current||request!==revision.current)return;
      setState(next);setError("");
      setLooking(kind=>kind&&next[kind]==="accepted"?kind:null);
    }catch {
      if(!mounted.current||request!==revision.current)return;
      setState(null);setLooking(null);setError("교환 상태를 확인하지 못했어요.");
    }finally{if(reading.current===request)reading.current=null;}
  },[peer]);

  useEffect(()=>{
    mounted.current=true;
    const visible=()=>{
      if(document.hidden){reading.current=null;revision.current++;setState(null);setLooking(null);}
      else void reload();
    };
    const timer=window.setInterval(reload,8000);
    document.addEventListener("visibilitychange",visible);
    return ()=>{
      mounted.current=false;revision.current++;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",visible);
    };
  },[reload]);
  useEffect(()=>{void reload();},[lastMessage,reload]);

  // Incoming requests appear inside the chat log, and stay in view only if
  // the member was already reading near the bottom of the conversation.
  useEffect(()=>{
    const card=notificationRef.current;
    const log=card?.closest(".chatlog");
    if(!card||!log)return;
    if(log.scrollHeight-log.scrollTop-log.clientHeight<card.offsetHeight+110){
      log.scrollTop=log.scrollHeight;
    }
  },[state?.profile,state?.photos]);

  async function update(action:Action,kind:ExchangeKind){
    if(pending.current||!state?.eligible)return;
    const request=++revision.current;
    pending.current=true;setBusy(true);setStatus("");setError("");
    try {
      const next=await exchange<ExchangeState>(action,{p_peer:peer,p_kind:kind});
      if(!mounted.current||request!==revision.current||document.hidden)return;
      setState(next);setLooking(old=>old&&next[old]==="accepted"?old:null);
      const label=kind==="photos"?"사진":"프로필";
      const messages={request:label+" 교환을 신청했어요.",accept:label+" 교환을 승인했어요.",
        decline:label+" 교환을 거부했어요.",withdraw:label+" 교환 신청을 취소했어요.",revoke:label+" 공유를 종료했어요."};
      setStatus(messages[action]);
    }catch(err){
      if(!mounted.current||request!==revision.current)return;
      setState(null);setLooking(null);
      setError(err instanceof Error?err.message:"교환 상태가 바뀌었어요. 다시 확인해 주세요.");
    }finally{
      pending.current=false;
      if(mounted.current){setBusy(false);if(request!==revision.current&&!document.hidden)void reload();}
    }
  }
  // Both sides see the request in their chat. These notices are derived from
  // the persisted exchange state, so re-entering the chat keeps pending status.
  // Only the recipient may approve or decline.
  const pendingNotices=state?.eligible?categories.filter(({kind})=>
    state[kind]==="sent"||state[kind]==="received"):[]; 
  const notification=pendingNotices.length?<div ref={notificationRef} className="exchange-chat-notices" aria-live="polite">
    {pendingNotices.map(({kind,label})=>{
      const incoming=state?.[kind]==="received";
      return <div className={"exchange-chat-request"+(incoming?"":" exchange-chat-sent")} key={kind} role="group"
        aria-label={label+(incoming?" 교환 요청":" 교환 신청 상태")}>
        <span className="exchange-chat-symbol"><I n={kind==="profile"?"user":"document"} s={17}/></span>
        <div className="exchange-chat-request-content">
          <p>{incoming?"상대가":"상대에게"} {label} 교환을 신청하였습니다.</p>
          {incoming?<div className="exchange-chat-response">
            <button type="button" className="exchange-approve" disabled={busy} onClick={()=>void update("accept",kind)} aria-label={label+" 교환 승인"}>승인</button>
            <button type="button" className="exchange-decline" disabled={busy} onClick={()=>void update("decline",kind)} aria-label={label+" 교환 거부"}>거부</button>
          </div>:<small className="exchange-chat-waiting">상대의 승인을 기다리고 있어요.</small>}
        </div>
      </div>;
    })}
  </div>:null;
  const current=state;
  const actions=current?.eligible?<section className="chat-exchange-actions" aria-label="프로필과 사진 교환">
    <div className="chat-exchange-choices">
      {categories.map(({kind,label})=>{
        const permission=current[kind];
        return <div className="chat-exchange-choice" key={kind}>
          {permission==="none"&&<button type="button" className="chat-exchange-button" disabled={busy} onClick={()=>void update("request",kind)}>
            <I n={kind==="profile"?"user":"document"} s={17}/>{label} 교환
          </button>}
          {permission==="sent"&&<div className="chat-exchange-pending"><span>{label} 교환 · 수락 대기</span>
            <button type="button" className="chat-exchange-text" disabled={busy} onClick={()=>void update("withdraw",kind)}>{label} 신청 취소</button>
          </div>}
          {permission==="received"&&<span className="chat-exchange-pending received">{label} 교환 요청 도착</span>}
          {permission==="accepted"&&<div className="chat-exchange-shared">
            <button type="button" className="chat-exchange-button" aria-expanded={looking===kind} onClick={()=>{setLooking(looking===kind?null:kind);void reload();}}>
              <I n={kind==="profile"?"user":"document"} s={17}/>{looking===kind?"접기":"상대 "+label+" 보기"}
            </button>
            <button type="button" className="chat-exchange-text" disabled={busy} onClick={()=>void update("revoke",kind)}>{label} 공유 종료</button>
          </div>}
        </div>;
      })}
    </div>
    <p className="chat-exchange-safety"><I n="shield" s={15}/><span>프로필은 회원이 직접 작성한 미검증 정보입니다. 실제와 다를 수 있으니 사기·금전 요구에 주의하세요.</span></p>
    {looking&&current[looking]==="accepted"&&<div className="chat-exchange-details" role="region" aria-label={"교환한 "+(looking==="photos"?"사진":"프로필")}>
      {looking==="photos"?<SharedExchangePhotos key={peer} peer={peer}/>:current.peerProfile?
        <PeerProfile profile={current.peerProfile}/>:<p className="sub">작성된 프로필 항목이 아직 없어요.</p>}
    </div>}
    {status&&<p className="chat-exchange-feedback" role="status">{status}</p>}
  </section>:error?<p className="chat-exchange-failure" role="alert">{error} <button type="button" onClick={()=>void reload()}>다시 확인</button></p>:null;

  return <>{children({notification,actions})}</>;
}
