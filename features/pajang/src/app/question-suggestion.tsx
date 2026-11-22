"use client";
import {useEffect,useRef,useState} from "react";
import {openAccount} from "../lib/account-actions.mjs";
import {maskedTextLength,textInputMaxLength} from "../../../../shared/content/text-length.mjs";

type Account=Awaited<ReturnType<typeof openAccount>>;
const changedAccount="계정이 바뀌었어요. 창을 닫고 다시 열어 주세요.";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type NextQuestion={day:string;slot:"am"|"pm";startsAt:string;prompt:string};

function NextQuestionPreview({account,period}:{account:Account|null;period:string}){
  const [next,setNext]=useState<NextQuestion|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    setNext(null);setFailed(false);
    if(!account)return()=>{active=false;};
    const timeout=setTimeout(()=>{controller.abort();if(active&&account.isCurrent())setFailed(true);},15000);
    void (async()=>{
      const identity=await account.db.auth.getSession();
      if(!active||!account.isCurrent()||controller.signal.aborted)return;
      if(identity.error)throw identity.error;
      const session=identity.data?.session;
      if(session?.user?.id!==account.userId||session.user.is_anonymous||!session.access_token)throw Error("account_changed");
      const {data,error}=await account.db.rpc("pajang_next_question",{})
        .setHeader("Authorization",`Bearer ${session.access_token}`).abortSignal(controller.signal);
      if(!active||!account.isCurrent())return;
      if(error)throw error;
      if(controller.signal.aborted)throw Error("preview_timed_out");
      if(!data||!/^\d{4}-\d{2}-\d{2}$/.test(data.day)||!["am","pm"].includes(data.slot)
        ||!Number.isFinite(Date.parse(data.startsAt))||typeof data.prompt!=="string"||!data.prompt.trim())throw Error("invalid_next_question");
      setNext(data);
    })().catch(()=>{if(active&&account.isCurrent())setFailed(true);}).finally(()=>clearTimeout(timeout));
    return()=>{active=false;controller.abort();clearTimeout(timeout);};
  },[account,period,attempt]);
  if(!account)return null;
  return <section className="next-question-preview" aria-label="다음 질문" aria-live="polite">
    {next?<div className="questionbox"><small>다음 질문 · <time dateTime={next.startsAt}>{next.day.replaceAll("-",".")} · {next.slot==="am"?"오전":"오후"}</time></small><p>{next.prompt}</p></div>:
      failed?<p className="next-question-status">다음 질문을 불러오지 못했어요.<button type="button" onClick={()=>setAttempt(value=>value+1)}>다시 보기</button></p>:
        <p className="next-question-status">다음 질문을 불러오는 중…</p>}
  </section>;
}

function submissionError(error:unknown){
  const value=error as {code?:string;message?:string};
  if(value?.message==="account_changed")return changedAccount;
  if(value?.code==="22023"&&value.message?.includes("하루에 문의"))return "문의와 질문 제안은 24시간 동안 합쳐서 3개까지 보낼 수 있어요.";
  if(value?.code==="42501"||value?.code==="PGRST301")return "로그인을 다시 확인해 주세요. 창을 닫고 다시 열어 주세요.";
  return "보내지 못했어요. 작성한 내용은 그대로예요. 다시 시도해 주세요.";
}

export function QuestionSuggestionForm({period,onBusyChange,onSaved}:{period:string;onBusyChange:(busy:boolean)=>void;onSaved:()=>void}){
  const [account,setAccount]=useState<Account|null>(null);
  const [question,setQuestion]=useState(""),[error,setError]=useState("");
  const [busy,setBusy]=useState(false),[checking,setChecking]=useState(true),[blocked,setBlocked]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const active=useRef(true),locked=useRef(false),requests=useRef(new Map<string,string>());
  function invalidate(){
    requests.current.clear();
    setAccount(null);setQuestion("");setBlocked(true);setError(changedAccount);
  }
  useEffect(()=>{
    let cancelled=false,dispose=()=>{};
    active.current=true;setChecking(true);setAccount(null);setError("");
    void openAccount(false,()=>{if(!cancelled)invalidate();}).then(value=>{
      if(cancelled){value.dispose();return;}
      if(!value.isCurrent()){value.dispose();invalidate();return;}
      dispose=value.dispose;setAccount(value);
    }).catch(error=>{
      if(cancelled)return;
      if(error?.message==="account_changed")invalidate();
      else setError("계정 정보를 확인하지 못했어요. 다시 확인해 주세요.");
    }).finally(()=>{if(!cancelled)setChecking(false);});
    return()=>{cancelled=true;active.current=false;dispose();};
  },[attempt]);

  async function submit(event:React.FormEvent){
    event.preventDefault();
    const body=question.trim();
    if(locked.current||!account||blocked||!body||maskedTextLength(body)>200)return;
    if(!account.isCurrent()){invalidate();return;}
    locked.current=true;setBusy(true);setError("");onBusyChange(true);
    let saved=false;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{
      const identity=await account.db.auth.getSession();
      if(!active.current||!account.isCurrent())throw Error("account_changed");
      if(identity.error)throw identity.error;
      const session=identity.data?.session;
      if(session?.user?.id!==account.userId||session.user.is_anonymous||!session.access_token)throw Error("account_changed");
      let requestId=requests.current.get(body);
      if(!requestId){requestId=crypto.randomUUID();requests.current.set(body,requestId);}
      const controller=new AbortController();
      timeout=setTimeout(()=>controller.abort(),15000);
      // Pin this request to the member who opened the form, even if auth changes in flight.
      const {data,error}=await account.db.schema("ojjuda_note").rpc("submit_inquiry",{
        p_request_id:requestId,p_body:"[파장 · 오늘의 질문 제안]\n"+body
      }).setHeader("Authorization",`Bearer ${session.access_token}`).abortSignal(controller.signal);
      if(!active.current||!account.isCurrent())throw Error("account_changed");
      if(error)throw error;
      if(typeof data!=="string"||!uuid.test(data))throw Error("inquiry_not_confirmed");
      saved=true;setQuestion("");
    }catch(error){
      if(active.current){
        if(!account.isCurrent()||(error as Error)?.message==="account_changed")invalidate();
        else setError(submissionError(error));
      }
    }finally{
      if(timeout!==undefined)clearTimeout(timeout);
      locked.current=false;onBusyChange(false);
      if(active.current)setBusy(false);
    }
    if(saved&&active.current&&account.isCurrent())onSaved();
  }

  return <form className="question-suggestion-form" onSubmit={event=>void submit(event)} aria-busy={busy}>
    <h2>이 질문 어때요?</h2>
    <NextQuestionPreview account={account} period={period}/>
    <label className="formlabel" htmlFor="question-suggestion-body">추천할 질문</label>
    <textarea id="question-suggestion-body" value={question} onChange={event=>{setQuestion(event.target.value);if(account)setError("");}}
      placeholder="추천하고 싶은 질문을 적어 주세요." maxLength={textInputMaxLength(question,200)} rows={4} required autoFocus data-autofocus
      disabled={busy||blocked} aria-describedby="question-suggestion-help question-suggestion-count"/>
    <div className="counter" id="question-suggestion-count">{maskedTextLength(question)} / 200</div>
    <p className="question-suggestion-help" id="question-suggestion-help">운영자가 확인해 다음 질문에 참고해요.</p>
    {checking&&<p className="sub" role="status">계정을 확인하고 있어요.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {!checking&&!account&&!blocked&&<button type="button" className="secondary wide" onClick={()=>setAttempt(value=>value+1)}>다시 확인</button>}
    <button type="submit" className="primary wide" disabled={busy||!account||blocked||!question.trim()||maskedTextLength(question.trim())>200}>
      {busy?"보내는 중…":"질문 보내기"}
    </button>
  </form>;
}
