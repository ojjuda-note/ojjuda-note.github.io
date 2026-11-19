import {useEffect,useRef,useState} from "react";
import {openAccount} from "../lib/account-actions.mjs";
import type {Slot,Station} from "../lib/station";
import {I} from "./icons";

export type AnswerEditTarget={owner:string;day:string;slot:Slot;question:string;body:string};
type Account=Awaited<ReturnType<typeof openAccount>>;
const changedAccount="계정이 바뀌었어요. 창을 닫고 답변 목록을 다시 열어 주세요.";
function editError(error:unknown){
  const value=error as {code?:string;message?:string};
  if(value?.message==="account_changed")return changedAccount;
  if(value?.code==="PT412")return "다른 곳에서 이 답변이 바뀌었어요. 작성한 내용은 그대로예요. 창을 닫고 최신 답변을 다시 열어 주세요.";
  if(value?.message==="banned_word")return "사용할 수 없는 표현이 있어요. 내용을 고쳐 다시 저장해 주세요.";
  if(value?.code==="PT409")return "수정할 답변을 찾을 수 없어요. 작성한 내용은 그대로예요. 목록을 다시 열어 확인해 주세요.";
  if(value?.code==="42501"||value?.code==="PGRST301"||value?.code==="PGRST303")return "회원 정보를 확인하지 못했어요. 창을 닫고 답변 목록을 다시 열어 주세요.";
  if(value?.code==="22023")return "수정할 답변을 다시 선택해 주세요. 작성한 내용은 그대로예요.";
  return "저장하지 못했어요. 작성한 내용은 그대로예요. 다시 시도해 주세요.";
}

export function AnswerEditForm({answer,onBusyChange,onDirtyChange,onSaved}:{
  answer:AnswerEditTarget;onBusyChange:(busy:boolean)=>void;onDirtyChange:(dirty:boolean)=>void;
  onSaved:(station:Station)=>boolean;
}){
  const [value,setValue]=useState(answer.body),[error,setError]=useState("");
  const [account,setAccount]=useState<Account|null>(null);
  const [busy,setBusy]=useState(false),[checking,setChecking]=useState(true),[blocked,setBlocked]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const length=Array.from(value).length,tooLong=length>220;
  const active=useRef(true),locked=useRef(false);
  const request=useRef<AbortController|null>(null);
  function markDirty(next:boolean){onDirtyChange(next);}
  function invalidate(){
    request.current?.abort();setAccount(null);setValue("");setBlocked(true);setError(changedAccount);markDirty(false);
  }
  useEffect(()=>{
    let cancelled=false,dispose=()=>{};
    active.current=true;setChecking(true);setAccount(null);setError("");
    void openAccount(false,()=>{if(!cancelled)invalidate();}).then(next=>{
      if(cancelled){next.dispose();return;}
      if(!next.isCurrent()){next.dispose();invalidate();return;}
      dispose=next.dispose;setAccount(next);
    }).catch(cause=>{
      if(cancelled)return;
      if(cause?.message==="account_changed")invalidate();
      else setError("계정 정보를 확인하지 못했어요. 다시 확인해 주세요.");
    }).finally(()=>{if(!cancelled)setChecking(false);});
    return()=>{cancelled=true;dispose();};
  },[attempt]);
  useEffect(()=>{
    return()=>{
      active.current=false;request.current?.abort();markDirty(false);
      if(locked.current)onBusyChange(false);
    };
  },[]);

  async function submit(event:React.FormEvent){
    event.preventDefault();
    const body=value.trim();
    if(locked.current||!account||blocked||!body||tooLong||body===answer.body.trim())return;
    if(!account.isCurrent()){invalidate();return;}
    locked.current=true;setBusy(true);setError("");onBusyChange(true);
    let saved:Station|null=null;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{
      const identity=await account.db.auth.getSession();
      if(!active.current||!account.isCurrent())throw Error("account_changed");
      if(identity.error)throw identity.error;
      const session=identity.data?.session;
      if(session?.user?.id!==account.userId||session.user.is_anonymous||!session.access_token)throw Error("account_changed");
      const controller=new AbortController();request.current=controller;
      timeout=setTimeout(()=>controller.abort(),15000);
      const {data,error}=await account.db.rpc("pajang_member",{p_action:"edit-history-answer",p_data:{
        day:answer.day,slot:answer.slot,body,previousBody:answer.body,expectedPerson:answer.owner
      }}).setHeader("Authorization",`Bearer ${session.access_token}`).abortSignal(controller.signal);
      if(!active.current||!account.isCurrent())throw Error("account_changed");
      if(error)throw error;
      if(!data?.authenticated||data.me?.id!==answer.owner)throw Error("account_changed");
      saved=data as Station;
    }catch(cause){
      if(active.current){
        if(!account.isCurrent()||(cause as Error)?.message==="account_changed")invalidate();
        else setError(editError(cause));
      }
    }finally{
      if(timeout!==undefined)clearTimeout(timeout);
      request.current=null;locked.current=false;
      if(active.current){setBusy(false);onBusyChange(false);}
    }
    if(saved&&active.current&&account.isCurrent()){
      markDirty(false);
      if(!onSaved(saved))invalidate();
    }
  }

  return <form className="answer-edit-form" onSubmit={event=>void submit(event)} aria-busy={busy}>
    <span className="modalicon"><I n="pencil"/></span><h2>답변 수정</h2>
    <p className="sub"><time dateTime={answer.day}>{answer.day.replaceAll("-",".")}</time> · {answer.slot==="am"?"오전":"오후"}</p>
    <p className="questionbox">{answer.question}</p>
    <p className="sub" id="history-answer-help">답변 내용만 바뀌며, 작성일은 그대로예요.</p>
    <label className="formlabel" htmlFor="history-answer-body">내 이야기</label>
    <textarea id="history-answer-body" value={value} rows={4} required autoFocus data-autofocus
      disabled={busy||blocked} aria-invalid={tooLong||undefined}
      aria-describedby={"history-answer-help history-answer-count"+(tooLong?" history-answer-limit":"")}
      onChange={event=>{const next=event.target.value;setValue(next);markDirty(next.trim()!==answer.body.trim());setError("");}}/>
    <div className="counter" id="history-answer-count">{length} / 220</div>
    {tooLong&&<p className="error" id="history-answer-limit" role="alert">답변은 220자까지 적을 수 있어요.</p>}
    {checking&&<p className="sub" role="status">계정을 확인하고 있어요.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {!checking&&!account&&!blocked&&<button type="button" className="secondary wide" onClick={()=>setAttempt(next=>next+1)}>다시 확인</button>}
    <button type="submit" className="primary wide" disabled={busy||!account||blocked||!value.trim()||tooLong||value.trim()===answer.body.trim()}>
      {busy?"저장하는 중…":"수정 저장하기"}<I n="arrow" s={17}/>
    </button>
  </form>;
}
