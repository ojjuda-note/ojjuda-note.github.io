import {useEffect,useRef,useState,type TouchEvent} from "react";
import "./teen-draft.css";

// 준비 단계의 독립 컴포넌트. 성인용 파장 entry / station에 import하지 않는다.
export type TeenQuestion={id:string;category:string;question:string};
export type TeenAnswer={questionId:string;body:string;updatedAt:string};
export type TeenDraftState={mode:"private";questions:TeenQuestion[];answers:TeenAnswer[]};
export type TeenApi=(action:string,data:Record<string,unknown>)=>Promise<unknown>;

export async function teenDraftRpc(action:string,data:Record<string,unknown>={}):Promise<unknown>{
  const client=await window.OjjudaGetClient();
  const {data:result,error}=await client.rpc("pajang_teen_draft",{p_action:action,p_data:data});
  if(error)throw new Error(error.message);
  return result;
}

export function TeenDraftStudio({api=teenDraftRpc}:{api?:TeenApi}){
  const [state,setState]=useState<TeenDraftState|null>(null);
  const [index,setIndex]=useState(0);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const touchX=useRef<number|null>(null);
  useEffect(()=>{
    let active=true;
    api("state",{}).then(result=>{
      if(!active)return;
      const next=result as TeenDraftState;
      if(next?.mode!=="private"||!Array.isArray(next.questions))throw new Error("질문을 불러오지 못했어요.");
      setState(next);
    }).catch(error=>{if(active)setNotice(error instanceof Error?error.message:"다시 접속해 주세요.");});
    return()=>{active=false;};
  },[api]);
  const questions=state?.questions??[];
  const question=questions[index];
  const saved=state?.answers.find(answer=>answer.questionId===question?.id);
  const step=(direction:number)=>{
    if(!questions.length)return;
    const next=(index+direction+questions.length)%questions.length;
    setIndex(next);
    setDraft(state?.answers.find(a=>a.questionId===questions[next].id)?.body??"");
    setNotice("");
  };
  useEffect(()=>{
    setDraft(saved?.body??"");
  },[question?.id,saved?.updatedAt]);
  async function save(){
    if(!question||busy||!draft.trim()||draft.length>220)return;
    setBusy(true);setNotice("");
    try{
      const result=await api("save",{questionId:question.id,body:draft.trim()}) as {saved:boolean;body:string;questionId:string};
      if(!result.saved)throw new Error("답변을 저장하지 못했어요.");
      const now=new Date().toISOString();
      setState(prev=>prev?{...prev,answers:[
        ...prev.answers.filter(a=>a.questionId!==question.id),
        {questionId:question.id,body:result.body,updatedAt:now}
      ]}:prev);
      setDraft(result.body);setNotice("나만 보는 답변으로 저장했어요.");
    }catch(error){setNotice(error instanceof Error?error.message:"저장하지 못했어요.");}
    finally{setBusy(false);}
  }
  async function remove(){
    if(!question||busy||!saved)return;
    setBusy(true);setNotice("");
    try{
      await api("delete",{questionId:question.id});
      setState(prev=>prev?{...prev,answers:prev.answers.filter(a=>a.questionId!==question.id)}:prev);
      setDraft("");setNotice("내 답변을 삭제했어요.");
    }catch(error){setNotice(error instanceof Error?error.message:"삭제하지 못했어요.");}
    finally{setBusy(false);}
  }
  function touchStart(event:TouchEvent<HTMLElement>){touchX.current=event.touches[0]?.clientX??null;}
  function touchEnd(event:TouchEvent<HTMLElement>){
    if(touchX.current===null)return;
    const end=event.changedTouches[0]?.clientX??touchX.current;
    if(Math.abs(end-touchX.current)>70)step(end<touchX.current?1:-1);
    touchX.current=null;
  }
  return <section className="pajang-teen-draft" aria-label="청소년 내 질문">
    <div className="teen-draft-head"><h2>나의 생각</h2><span>나만 보는 임시답변</span></div>
    {!question?<p role="status">{notice||"질문을 불러오고 있어요."}</p>:<>
      <div className="teen-draft-question" onTouchStart={touchStart} onTouchEnd={touchEnd}>
        <div className="teen-draft-question-top"><span>{index+1} / {questions.length}</span><span>{question.category}</span></div>
        <h3>{question.question}</h3>
        <nav aria-label="다른 질문 보기">
          <button type="button" onClick={()=>step(-1)} disabled={busy}>이전</button>
          <button type="button" onClick={()=>step(1)} disabled={busy}>다음</button>
        </nav>
      </div>
      <label className="teen-draft-label" htmlFor="teen-draft-text">답변하기</label>
      <textarea id="teen-draft-text" rows={4} value={draft} maxLength={220}
        onChange={e=>setDraft(e.target.value)} placeholder="내 생각을 자유롭게 적어 주세요."
        disabled={busy}/>
      <div className="teen-draft-counter">{draft.length} / 220</div>
      <div className="teen-draft-actions">
        <button type="button" onClick={save} disabled={busy||!draft.trim()||draft.length>220}>저장</button>
        {saved&&<button type="button" className="quiet" disabled={busy} onClick={remove}>삭제</button>}
      </div>
      {notice&&<p role="status" className="teen-draft-feedback">{notice}</p>}
    </>}
  </section>;
}

// 공개 답변 기능의 안전 검토 이후에만 연결할 수 있는 신고·차단 UI.
// 게시 피드는 현재 없으며, 미리 승인된 답변도 다른 회원에게 노출되지 않는다.
export function TeenSafetyActions({answerId,ownerUserId,api=teenDraftRpc}:{
  answerId:string;ownerUserId:string;api?:TeenApi;
}){
  const [reason,setReason]=useState("bullying");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  async function run(action:string,data:Record<string,unknown>){
    setBusy(true);setNotice("");
    try{
      await api(action,data);
      setNotice(action==="report"?"신고가 접수됐어요.":"이 회원을 차단했어요.");
    }catch(error){setNotice(error instanceof Error?error.message:"처리하지 못했어요.");}
    finally{setBusy(false);}
  }
  return <div className="teen-draft-safety" aria-label="답변 신고와 차단">
    <label htmlFor={"teen-report-"+answerId}>신고 사유</label>
    <select id={"teen-report-"+answerId} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}>
      <option value="bullying">괴롭힘</option><option value="privacy">개인정보 노출</option>
      <option value="inappropriate">부적절한 내용</option><option value="other">기타</option>
    </select>
    <button type="button" disabled={busy} onClick={()=>run("report",{answerId,reason})}>신고</button>
    <button type="button" disabled={busy} onClick={()=>run("block",{targetUser:ownerUserId})}>차단</button>
    {notice&&<p role="status">{notice}</p>}
  </div>;
}