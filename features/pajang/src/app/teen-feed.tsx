import {useEffect,useState} from "react";
import {TeenDraftStudio,teenDraftRpc,type TeenApi} from "./teen-draft";
import "./teen-feed.css";

type PublicAnswer={
  id:string;questionId:string;authorId:string;authorName:string;body:string;
  updatedAt:string;liked:boolean;likeCount:number;commentCount:number
};
type PublicComment={id:string;authorId:string;authorName:string;body:string;createdAt:string;reviewStatus:"approved"|"pending"};
type FeedResult={questionId:string;items:PublicAnswer[];visibility:"teen-only"};
type FeedApi=(questionId:string)=>Promise<FeedResult>;
type InteractionApi=(action:string,id:string,data?:Record<string,unknown>)=>Promise<unknown>;
const reasons=[
  {value:"bullying",label:"괴롭힘"},
  {value:"privacy",label:"개인정보 노출"},
  {value:"inappropriate",label:"부적절한 내용"},
  {value:"other",label:"기타"}
];

export async function teenFeedRpc(questionId:string):Promise<FeedResult>{
  const client=await window.OjjudaGetClient();
  const {data,error}=await client.rpc("pajang_teen_feed",{p_question:questionId,p_limit:20});
  if(error)throw new Error(error.message);
  return data as FeedResult;
}
export async function teenInteractRpc(action:string,id:string,data:Record<string,unknown>={}):Promise<unknown>{
  const client=await window.OjjudaGetClient();
  const {data:result,error}=await client.rpc("pajang_teen_interact",{p_action:action,p_target:id,p_data:data});
  if(error)throw new Error(error.message);
  return result;
}
function PeerAnswer({answer,api,interact,onBlocked}:{answer:PublicAnswer;api:TeenApi;interact:InteractionApi;onBlocked:(authorId:string)=>void}){
  const [value,setValue]=useState(answer);
  const [expanded,setExpanded]=useState(false);
  const [comments,setComments]=useState<PublicComment[]>([]);
  const [newComment,setNewComment]=useState("");
  const [reason,setReason]=useState("bullying");
  const [commentReason,setCommentReason]=useState("bullying");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  useEffect(()=>setValue(answer),[answer]);
  async function commentsLoad(){
    const result=await interact("comments",value.id) as {items:PublicComment[]};
    setComments(result.items);
  }
  async function action(run:()=>Promise<unknown>,done:string){
    if(busy)return;
    setBusy(true);setNotice("");
    try{await run();setNotice(done);}
    catch(error){setNotice(error instanceof Error?error.message:"처리하지 못했어요.");}
    finally{setBusy(false);}
  }
  function toggleComments(){
    if(expanded){setExpanded(false);return;}
    setExpanded(true);
    void commentsLoad().catch(error=>setNotice(error instanceof Error?error.message:"댓글을 불러오지 못했어요."));
  }
  async function like(){
    await action(async()=>{
      const result=await interact("like",value.id,{liked:!value.liked}) as {liked:boolean;likeCount:number};
      setValue(prev=>({...prev,liked:result.liked,likeCount:result.likeCount}));
    },"");
  }
  async function comment(){
    if(!newComment.trim()||newComment.length>200)return;
    await action(async()=>{
      await interact("comment",value.id,{body:newComment.trim()});
      setNewComment("");
      await commentsLoad();
    },"댓글을 접수했어요. 검토 후 다른 회원에게 보여요.");
  }
  return <article className="teen-public-answer">
    <div className="teen-answer-owner"><strong>{value.authorName}</strong><span>청소년 회원</span></div>
    <p className="teen-answer-body">{value.body}</p>
    <div className="teen-answer-controls">
      <button disabled={busy} type="button" aria-pressed={value.liked} onClick={()=>void like()}>
        <span aria-hidden="true">♡</span> 공감 {value.likeCount}
      </button>
      <button disabled={busy} type="button" aria-expanded={expanded} onClick={toggleComments}>댓글 {value.commentCount}</button>
    </div>
    <div className="teen-answer-safety">
      <label>신고 사유
        <select aria-label="답변 신고 사유" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}>
          {reasons.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <button disabled={busy} type="button" onClick={()=>void action(()=>api("report",{answerId:value.id,reason}),"신고가 접수됐어요.")}>신고</button>
      <button disabled={busy} type="button" onClick={()=>void action(async()=>{
        await api("block",{targetUser:value.authorId});
        onBlocked(value.authorId);
      },"차단했습니다.")}>차단</button>
    </div>
    {expanded&&<section className="teen-comment-section" aria-label="댓글">
      <ul>{comments.map(item=><li key={item.id}>
        <p><strong>{item.authorName}</strong> {item.reviewStatus==="pending"&&<small>검토 중 · 나에게만 표시</small>}</p>
        <p>{item.body}</p>
        {item.reviewStatus==="approved"&&<div className="teen-comment-report">
          <select value={commentReason} aria-label="댓글 신고 사유" disabled={busy} onChange={e=>setCommentReason(e.target.value)}>
            {reasons.map(reason=><option key={reason.value} value={reason.value}>{reason.label}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={()=>void action(
            ()=>interact("report-comment",item.id,{reason:commentReason}),"댓글 신고가 접수됐어요."
          )}>댓글 신고</button>
        </div>}
      </li>)}</ul>
      {!comments.length&&<p className="teen-comment-empty">아직 공개된 댓글이 없어요.</p>}
      <label htmlFor={"comment-"+value.id}>댓글 달기</label>
      <textarea id={"comment-"+value.id} value={newComment} maxLength={200}
        placeholder="존중하는 말로 작성해 주세요."
        onChange={e=>setNewComment(e.target.value)} disabled={busy} rows={2}/>
      <button disabled={busy||!newComment.trim()||newComment.length>200} type="button" onClick={()=>void comment()}>댓글 올리기</button>
    </section>}
    {notice&&<p className="teen-action-feedback" role="status">{notice}</p>}
  </article>;
}
export function TeenCommunityFeed({questionId,fetchFeed=teenFeedRpc,interact=teenInteractRpc,api=teenDraftRpc}:{
  questionId:string;fetchFeed?:FeedApi;interact?:InteractionApi;api?:TeenApi;
}){
  const [items,setItems]=useState<PublicAnswer[]>([]);
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState("");
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let current=true;
    if(!questionId){setItems([]);return;}
    setLoading(true);setNotice("");
    fetchFeed(questionId).then(result=>{
      if(!current)return;
      if(result.questionId!==questionId||result.visibility!=="teen-only"||!Array.isArray(result.items))
        throw new Error("청소년 전용 답변을 불러올 수 없어요.");
      setItems(result.items);
    }).catch(error=>{
      if(current){setItems([]);setNotice(error instanceof Error?error.message:"답변을 불러오지 못했어요.");}
    }).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[questionId,refresh,fetchFeed]);
  return <section className="pajang-teen-feed" aria-label="청소년 회원의 답변">
    <div className="teen-feed-heading"><div><h2>모두의 답변</h2><p>14~18세 회원의 검토된 답변만 보여요.</p></div>
      <button type="button" onClick={()=>setRefresh(x=>x+1)} disabled={loading||!questionId}>새로고침</button>
    </div>
    {loading&&<p role="status">답변을 불러오고 있어요.</p>}
    {!loading&&notice&&<p role="status">{notice}</p>}
    {!loading&&!notice&&!items.length&&<p className="teen-feed-empty">아직 공개된 답변이 없어요.</p>}
    {!loading&&!notice&&items.map(item=><PeerAnswer key={item.id} answer={item} api={api} interact={interact}
      onBlocked={authorId=>setItems(prev=>prev.filter(answer=>answer.authorId!==authorId))}/>)}
  </section>;
}

// 실제 서비스에 연결할 때만 사용하는 연령 보호 화면.
// 성인용 station-app과 별도이며 기존 파장 입구에는 연결하지 않았다.
export function TeenCommunityPage({api=teenDraftRpc,fetchFeed=teenFeedRpc,interact=teenInteractRpc}:{
  api?:TeenApi;fetchFeed?:FeedApi;interact?:InteractionApi
}){
  const [questionId,setQuestionId]=useState("");
  return <div className="pajang-teen-community">
    <TeenDraftStudio api={api} onQuestionChange={setQuestionId}/>
    <TeenCommunityFeed questionId={questionId} api={api} fetchFeed={fetchFeed} interact={interact}/>
  </div>;
}
