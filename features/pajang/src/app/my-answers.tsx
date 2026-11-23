import {useEffect,useState} from "react";
import type {Slot} from "../lib/station";
import {I} from "./icons";
import {AnswerLike,useAnswerLikes} from "./answer-likes";

export type MyAnswer={day:string;slot:Slot;question:string;body:string;liked?:boolean;likeCount?:number};

function MyAnswerCard({answer,owner,onEdit}:{answer:MyAnswer;owner:string;onEdit:(answer:MyAnswer)=>void}){
  return <article><time dateTime={answer.day}>{answer.day.replaceAll("-",".")} · {answer.slot==="am"?"오전":"오후"}</time>
    <h3>{answer.question}</h3><p>{answer.body}</p>
    <div className="own-answer-actions"><AnswerLike answer={{...answer,peer:owner}}/><button type="button" className="secondary small" aria-haspopup="dialog" onClick={()=>onEdit(answer)}><I n="pencil" s={15}/>답변 수정</button></div></article>;
}

export default function MyAnswers({onWrite,onEdit,answered,revision,owner}:{onWrite:()=>void;onEdit:(answer:MyAnswer)=>void;answered:boolean;revision:number;owner:string}){
  const likes=useAnswerLikes();
  const [items,setItems]=useState<MyAnswer[]|null>(null);
  const [error,setError]=useState(false),[attempt,retry]=useState(0);
  useEffect(()=>{
    let active=true;
    async function load(){
      setError(false);
      try{
        const likeVersion=likes?.checkpoint()??0;
        const db=await window.OjjudaGetClient();
        const result=await db.rpc("pajang_my_answers",{});
        if(result.error||!Array.isArray(result.data))throw Error();
        if(active){likes?.hydrate(result.data.map((answer:MyAnswer)=>({...answer,peer:owner})),likeVersion);setItems(result.data);}
      }catch{if(active)setError(true);}
    }
    void load();
    return()=>{active=false;};
  },[attempt,answered,revision,owner,likes]);
  const card=(answer:MyAnswer)=><MyAnswerCard key={answer.day+answer.slot} answer={answer} owner={owner} onEdit={onEdit}/>;
  return <section className="account-section own-history"><h2>내가 남긴 답변</h2>
    {error?<p role="alert">답변을 불러오지 못했어요. <button className="quiet" onClick={()=>retry(n=>n+1)}>다시 시도</button></p>:
      items===null?<p role="status">답변을 불러오는 중이에요.</p>:items.length?<>{items.slice(0,2).map(card)}
        {items.length>2&&<details><summary>지난 답변 {items.length-2}개 더 보기</summary>{items.slice(2).map(card)}</details>}</>:
        <p>아직 남긴 답변이 없어요.</p>}
    {!answered&&<button className="secondary" onClick={onWrite}>내 답변 쓰기</button>}
  </section>;
}

