import {useCallback,useEffect,useRef,useState} from "react";
import {exchange,PeerProfile,type ExchangeKind,type SharedProfile} from "./exchange-profile";
import {SharedExchangePhotos} from "./exchange-photos";
import {I} from "./icons";

type Permission = "none"|"sent"|"received"|"accepted";
type ExchangeState = {
  myCount:number; peerCount:number; eligible:boolean;
  profile:Permission; photos:Permission; peerProfile:SharedProfile|null;
};
type Action = "request"|"accept"|"decline"|"withdraw"|"revoke";
const categories:{kind:ExchangeKind;label:string}[]=[{kind:"profile",label:"프로필"},{kind:"photos",label:"사진"}];

export function ChatExchange({peer,name,lastMessage}:{peer:string;name:string;lastMessage?:string}) {
  const [state,setState]=useState<ExchangeState|null>(null);
  const [open,setOpen]=useState(false),[looking,setLooking]=useState<ExchangeKind|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
  const reading=useRef<number|null>(null);
  const revision=useRef(0),pending=useRef(false),mounted=useRef(false);
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
    return ()=>{mounted.current=false;revision.current++;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[reload]);
  useEffect(()=>{void reload();},[lastMessage,reload]);

  async function update(action:Action,kind:ExchangeKind) {
    if(pending.current||!state?.eligible)return;
    const request=++revision.current;
    pending.current=true;setBusy(true);setStatus("");setError("");
    try {
      const next=await exchange<ExchangeState>(action,{p_peer:peer,p_kind:kind});
      if(!mounted.current||request!==revision.current||document.hidden)return;
      setState(next);setLooking(old=>old&&next[old]==="accepted"?old:null);
      const label=kind==="photos"?"사진":"프로필";
      const messages={request:label+" 교환을 신청했어요.",accept:label+" 교환을 수락했어요.",decline:"신청을 거절했어요.",withdraw:"신청을 취소했어요.",revoke:label+" 공유를 끝냈어요."};
      setStatus(messages[action]);
    }catch(err) {
      if(!mounted.current||request!==revision.current)return;
      setState(null);setLooking(null);
      setError(err instanceof Error?err.message:"교환 상태가 바뀌었어요. 다시 확인해 주세요.");
    }finally{
      pending.current=false;
      if(mounted.current){setBusy(false);if(request!==revision.current&&!document.hidden)void reload();}
    }
  }
  const received=state?.profile==="received"||state?.photos==="received";
  const progress=state?(state.eligible?(received?"교환 신청이 도착했어요":"프로필이나 사진을 교환할 수 있어요"):`보낸 메시지 · 나 ${Math.min(state.myCount,5)}/5 · 상대 ${Math.min(state.peerCount,5)}/5`):error?"교환 상태 확인 필요":"대화 횟수 확인 중…";
  return <section className="chat-exchange" aria-label="프로필과 사진 교환">
    <button type="button" className="exchange-summary" aria-expanded={open} aria-controls="exchange-drawer" onClick={()=>{setOpen(!open);if(open)setLooking(null);else void reload();}}>
      <span className="exchange-emblem"><I n="user" s={18}/></span><span><b>프로필·사진 교환</b><small>{progress}</small></span><I n="chevron" s={17}/>
    </button>
    {open&&<div id="exchange-drawer" className="exchange-drawer">
      {!state&&error&&<p className="error" role="alert">{error} <button type="button" className="quiet" onClick={reload}>다시 확인</button></p>}
      {!state&&!error&&<p className="sub" role="status">교환 상태를 확인하고 있어요.</p>}
      {state&&<>
        <p className="exchange-hint">{state.eligible?"프로필과 사진은 따로 신청해요. 상대가 수락하면 해당 항목을 서로 볼 수 있어요.":"이 대화방에서 두 사람 모두 메시지를 5개 이상 보내면 교환을 신청할 수 있어요."}</p>
        {state.eligible&&categories.map(({kind,label})=>{
          const permission=state[kind];
          return <div className="exchange-item" key={kind}>
            <div className="exchange-line"><strong>{label}</strong><small>{permission==="sent"?"수락을 기다리는 중":permission==="received"?name+"님의 교환 신청":permission==="accepted"?"서로 공유 중":""}</small></div>
            <div className="exchange-controls">
              {permission==="none"&&<button type="button" className="secondary small" disabled={busy} onClick={()=>update("request",kind)}>{label} 교환 신청</button>}
              {permission==="sent"&&<button type="button" className="quiet" disabled={busy} aria-label={label+" 교환 신청 취소"} onClick={()=>update("withdraw",kind)}>신청 취소</button>}
              {permission==="received"&&<><button type="button" className="secondary small" disabled={busy} onClick={()=>update("accept",kind)}>{label} 교환 수락</button><button type="button" className="quiet" disabled={busy} aria-label={label+" 교환 거절"} onClick={()=>update("decline",kind)}>거절</button></>}
              {permission==="accepted"&&<><button type="button" className="secondary small" aria-expanded={looking===kind} onClick={()=>{setLooking(looking===kind?null:kind);void reload();}}>{looking===kind?"접기":"상대 "+label+" 보기"}</button><button type="button" className="quiet" disabled={busy} aria-label={label+" 공유 종료"} onClick={()=>update("revoke",kind)}>공유 종료</button></>}
            </div>
            {looking===kind&&permission==="accepted"&&(kind==="photos"?<SharedExchangePhotos key={peer} peer={peer}/>:state.peerProfile?<PeerProfile profile={state.peerProfile}/>:<p className="sub">작성된 프로필 항목이 아직 없어요.</p>)}
          </div>;
        })}
        {status&&<p className="exchange-status" role="status">{status}</p>}
      </>}
    </div>}
  </section>;
}
