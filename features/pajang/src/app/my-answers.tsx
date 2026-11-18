import {useEffect,useState} from "react";
import type {Slot} from "../lib/station";

type MyAnswer={day:string;slot:Slot;question:string;body:string};

function MyAnswerCard({answer}:{answer:MyAnswer}){
  return <article><time dateTime={answer.day}>{answer.day.replaceAll("-",".")} · {answer.slot==="am"?"오전":"오후"}</time>
    <h3>{answer.question}</h3><p>{answer.body}</p></article>;
}

export default function MyAnswers({onWrite,answered}:{onWrite:()=>void;answered:boolean}){
  const [items,setItems]=useState<MyAnswer[]|null>(null);
  const [error,setError]=useState(false),[attempt,retry]=useState(0);
  useEffect(()=>{
    let active=true;
    async function load(){
      setError(false);
      try{
        const db=await window.OjjudaGetClient();
        const result=await db.rpc("pajang_my_answers",{});
        if(result.error||!Array.isArray(result.data))throw Error();
        if(active)setItems(result.data);
      }catch{if(active)setError(true);}
    }
    void load();
    return()=>{active=false;};
  },[attempt,answered]);
  const card=(answer:MyAnswer)=><MyAnswerCard key={answer.day+answer.slot} answer={answer}/>;
  return <section className="account-section own-history"><h2>내가 남긴 답변</h2>
    {error?<p role="alert">답변을 불러오지 못했어요. <button className="quiet" onClick={()=>retry(n=>n+1)}>다시 시도</button></p>:
      items===null?<p role="status">답변을 불러오는 중이에요.</p>:items.length?<>{items.slice(0,2).map(card)}
        {items.length>2&&<details><summary>지난 답변 {items.length-2}개 더 보기</summary>{items.slice(2).map(card)}</details>}</>:
        <p>아직 남긴 답변이 없어요.</p>}
    {!answered&&<button className="secondary" onClick={onWrite}>내 답변 쓰기</button>}
  </section>;
}
