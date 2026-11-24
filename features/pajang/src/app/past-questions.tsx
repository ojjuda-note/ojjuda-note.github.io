import {useEffect,useRef,useState} from "react";
import {openAccount} from "../lib/account-actions.mjs";
import {maskedTextLength} from "../../../../shared/content/text-length.mjs";
import type {Slot} from "../lib/station";
import type {AnswerEditTarget} from "./answer-edit";
import {I} from "./icons";

export type PastQuestion={day:string;slot:Slot;question:string;answered?:boolean;body?:string|null;canEdit?:boolean};
type Cursor={day:string;slot:Slot};
type Account=Awaited<ReturnType<typeof openAccount>>;
const changedAccount="계정이 바뀌었어요. 창을 닫고 다시 열어 주세요.";
const keyOf=(question:PastQuestion)=>question.day+"/"+question.slot;

async function pastRequest(account:Account,name:string,args:Record<string,unknown>,signal:AbortSignal){
  const identity=await account.db.auth.getSession();
  if(!account.isCurrent())throw Error("account_changed");
  if(signal.aborted)throw Error("request_aborted");
  if(identity.error)throw identity.error;
  const session=identity.data?.session;
  if(session?.user?.id!==account.userId||session.user.is_anonymous||!session.access_token)throw Error("account_changed");
  const result=await account.db.rpc(name,args).setHeader("Authorization",`Bearer ${session.access_token}`).abortSignal(signal);
  if(!account.isCurrent())throw Error("account_changed");
  if(result.error)throw result.error;
  return result.data;
}

export function PastQuestions({owner,revision,onChoose}:{owner:string;revision:number;onChoose:(question:PastQuestion)=>void}){
  const [items,setItems]=useState<PastQuestion[]|null>(null),[next,setNext]=useState<Cursor|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  const loadMore=useRef<()=>void>(()=>{}),select=useRef<(question:PastQuestion)=>void>(()=>{});
  useEffect(()=>{
    let active=true,loading=false,account:Account|null=null,current:PastQuestion[]=[],cursor:Cursor|null=null;
    let controller:AbortController|undefined;
    setItems(null);setNext(null);setError("");setBusy(true);
    function invalidate(){
      if(!active)return;
      controller?.abort();account?.dispose();account=null;current=[];cursor=null;
      setItems([]);setNext(null);setBusy(false);setError(changedAccount);
    }
    async function load(append=false){
      if(!active||loading||!account||(append&&!cursor))return;
      loading=true;controller=new AbortController();const request=controller;
      const timeout=setTimeout(()=>request.abort(),15000);
      setBusy(true);setError("");
      try{
        const data=await pastRequest(account,"pajang_past_questions",{p_cursor:append?cursor:null},request.signal);
        if(!active||controller!==request)return;
        if(!Array.isArray(data?.items))throw Error("invalid_question_list");
        const merged=new Map((append?current:[]).map(question=>[keyOf(question),question]));
        for(const question of data.items)merged.set(keyOf(question),question);
        current=[...merged.values()];cursor=data.nextCursor??null;
        setItems(current);setNext(cursor);
      }catch(cause){
        if(!active||controller!==request)return;
        if(!account?.isCurrent()||(cause as Error)?.message==="account_changed"){invalidate();return;}
        setError("질문을 불러오지 못했어요.");
      }finally{clearTimeout(timeout);loading=false;if(active)setBusy(false);}
    }
    loadMore.current=()=>void load(true);
    select.current=question=>{if(active&&account?.isCurrent())onChoose(question);};
    void openAccount(false,invalidate).then(value=>{
      if(!active){value.dispose();return;}
      account=value;void load();
    }).catch(cause=>{if(active){setBusy(false);setError(cause?.message==="account_changed"?changedAccount:"질문을 불러오지 못했어요.");}});
    return()=>{active=false;controller?.abort();account?.dispose();loadMore.current=()=>{};select.current=()=>{};};
  },[owner,revision,attempt]);
  return <section className="past-questions"><h2>지난 질문</h2>
    {items?.length?<ol className="past-question-list">{items.map(question=><li key={keyOf(question)}>
      <time dateTime={question.day}>{question.day.replaceAll("-",".")} · {question.slot==="am"?"오전":"오후"}</time>
      <h3>{question.question}</h3>
      {question.answered&&!question.canEdit?<span className="past-answered"><I n="check" s={15}/>답변 완료</span>:
        <button type="button" className="secondary small" aria-haspopup="dialog" onClick={()=>select.current(question)}>
          <I n="pencil" s={15}/>{question.answered?"답변 수정":"답변하기"}
        </button>}
    </li>)}</ol>:!busy&&!error&&<p className="sub">아직 지난 질문이 없어요.</p>}
    {busy&&<p className="history-status" role="status">질문을 불러오는 중이에요.</p>}
    {error&&<p className="notice" role="alert">{error}{error!==changedAccount&&<button type="button" onClick={()=>next?loadMore.current():setAttempt(value=>value+1)}>다시 시도</button>}</p>}
    {next&&!error&&<button type="button" className="secondary history-more" disabled={busy} onClick={()=>loadMore.current()}>질문 더 보기<I n="chevron" s={16}/></button>}
  </section>;
}

export function PastAnswerForm({question,owner,onBusyChange,onDirtyChange,onSaved,onExisting,onMyAnswers}:{
  question:PastQuestion;owner:string;onBusyChange:(busy:boolean)=>void;onDirtyChange:(dirty:boolean)=>void;
  onSaved:()=>boolean;onExisting:(answer:AnswerEditTarget)=>void;onMyAnswers:()=>void;
}){
  const [value,setValue]=useState(""),[error,setError]=useState(""),[conflict,setConflict]=useState(false);
  const [account,setAccount]=useState<Account|null>(null),[checking,setChecking]=useState(true),[blocked,setBlocked]=useState(false);
  const [busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  const active=useRef(true),locked=useRef(false),request=useRef<AbortController|null>(null);
  const editor=useRef<HTMLTextAreaElement|null>(null);
  const length=maskedTextLength(value),tooLong=length>220;
  function invalidate(){
    request.current?.abort();setAccount(null);setValue("");setBlocked(true);setError(changedAccount);onDirtyChange(false);
  }
  useEffect(()=>{
    let cancelled=false,dispose=()=>{};
    active.current=true;setChecking(true);setAccount(null);setError("");
    const controller=new AbortController();request.current=controller;
    const timeout=setTimeout(()=>controller.abort(),15000);
    void openAccount(false,()=>{if(!cancelled)invalidate();}).then(async next=>{
      if(cancelled){next.dispose();return;}
      dispose=next.dispose;
      // Feed pages may not include the member's own card. Check before offering a new draft.
      if(question.answered===undefined){
        const answers=await pastRequest(next,"pajang_my_answers",{},controller.signal);
        if(cancelled||!next.isCurrent())return;
        if(!Array.isArray(answers))throw Error("invalid_answers");
        const existing=answers.find(answer=>answer.day===question.day&&answer.slot===question.slot);
        if(existing){onExisting({...existing,owner});return;}
      }
      if(!next.isCurrent()){invalidate();return;}
      setAccount(next);
    }).catch(cause=>{
      if(cancelled)return;
      if(cause?.message==="account_changed")invalidate();
      else setError("질문을 확인하지 못했어요. 다시 시도해 주세요.");
    }).finally(()=>{clearTimeout(timeout);if(!cancelled){request.current=null;setChecking(false);}});
    return()=>{cancelled=true;controller.abort();clearTimeout(timeout);dispose();};
  },[attempt]);
  useEffect(()=>()=>{active.current=false;request.current?.abort();onDirtyChange(false);},[]);
  useEffect(()=>{if(account&&!blocked&&!checking)editor.current?.focus({preventScroll:true});},[account,blocked,checking]);
  async function submit(event:React.FormEvent){
    event.preventDefault();
    const body=value.trim();
    if(locked.current||!account||blocked||!body||maskedTextLength(body)>220)return;
    if(!account.isCurrent()){invalidate();return;}
    locked.current=true;setBusy(true);setError("");setConflict(false);onBusyChange(true);
    const controller=new AbortController();request.current=controller;
    const timeout=setTimeout(()=>controller.abort(),15000);
    let saved=false;
    try{
      const data=await pastRequest(account,"pajang_answer_past_question",{
        p_day:question.day,p_slot:question.slot,p_question:question.question,p_body:body,p_expected_person:owner
      },controller.signal);
      if(!active.current||!account.isCurrent())throw Error("account_changed");
      if(!data?.saved||data.day!==question.day||data.slot!==question.slot)throw Error("invalid_saved_answer");
      saved=true;
    }catch(cause){
      if(active.current){
        if(!account.isCurrent()||(cause as Error)?.message==="account_changed")invalidate();
        else{
          const code=(cause as {code?:string})?.code;setConflict(code==="PT409");
          setError(code==="PT409"?"이미 답변한 질문이에요. 내 답변에서 수정해 주세요.":
            code==="22023"?"답변할 질문을 다시 선택해 주세요.":
            code==="42501"||code==="PGRST301"||code==="PGRST303"?"회원 정보를 확인하지 못했어요. 창을 닫고 다시 열어 주세요.":
              "저장하지 못했어요. 작성한 내용은 그대로예요. 다시 시도해 주세요.");
        }
      }
    }finally{
      clearTimeout(timeout);request.current=null;locked.current=false;
      if(active.current){setBusy(false);onBusyChange(false);}
    }
    if(saved&&active.current&&account.isCurrent()){
      onDirtyChange(false);if(!onSaved())invalidate();
    }
  }
  return <form className="past-answer-form" aria-busy={busy||checking} onSubmit={event=>void submit(event)}>
    <span className="modalicon"><I n="pencil"/></span><h2>지난 질문에 답변하기</h2>
    <p className="sub"><time dateTime={question.day}>{question.day.replaceAll("-",".")}</time> · {question.slot==="am"?"오전":"오후"}</p>
    <p className="questionbox">{question.question}</p>
    <label className="formlabel" htmlFor="past-answer-body">내 이야기</label>
    <textarea ref={editor} id="past-answer-body" value={value} rows={4} required autoFocus data-autofocus disabled={busy||blocked||checking}
      aria-invalid={tooLong||undefined} aria-describedby={"past-answer-count past-answer-publication"+(tooLong?" past-answer-limit":"")}
      onChange={event=>{setValue(event.target.value);onDirtyChange(Boolean(event.target.value.trim()));setError("");setConflict(false);}}/>
    <div className="counter" id="past-answer-count">{length} / 220</div>
    {tooLong&&<p className="error" role="alert" id="past-answer-limit">답변은 220자까지 적을 수 있어요.</p>}
    <p className="publication-note" id="past-answer-publication">질문과 답변은 질문이 올라온 날부터 최대 365일간 파장 회원에게 보여요.</p>
    {checking&&<p className="sub" role="status">질문을 확인하고 있어요.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {conflict&&<button type="button" className="secondary wide" onClick={onMyAnswers}>내 답변 보기</button>}
    {!checking&&!account&&!blocked&&<button type="button" className="secondary wide" onClick={()=>setAttempt(value=>value+1)}>다시 시도</button>}
    <button type="submit" className="primary wide" disabled={busy||!account||blocked||!value.trim()||tooLong||conflict}>
      {busy?"저장하는 중…":"답변하기"}<I n="arrow" s={17}/>
    </button>
  </form>;
}
