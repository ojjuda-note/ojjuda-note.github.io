import {useEffect,useRef,useState,type PointerEvent} from "react";
import type {DiscoveryAnswer} from "./answer-history";
import {I} from "./icons";

type Props = {
  question:DiscoveryAnswer; index:number; count:number; more:boolean; loading:boolean;
  onStep:(direction:number)=>void;
};

export default function QuestionCarousel({question,index,count,more,loading,onStep}:Props){
  const gesture=useRef<{id:number;x:number;y:number;horizontal:boolean}|null>(null);
  const [drag,setDrag]=useState(0);
  const previous=index>0,next=index<count-1||(more&&!loading);
  function cancel(){gesture.current=null;setDrag(0);}
  useEffect(cancel,[question.day,question.slot,question.question]);
  function finish(e:PointerEvent<HTMLElement>){
    const start=gesture.current;
    if(!start||start.id!==e.pointerId)return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y;
    const threshold=Math.min(60,Math.max(40,e.currentTarget.clientWidth*.12));
    if(start.horizontal&&Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.5){
      if(dx<0&&next)onStep(1);
      if(dx>0&&previous)onStep(-1);
    }
    cancel();
  }
  return <header className="question-carousel" tabIndex={0} role="group" aria-label="질문 넘기기"
    aria-roledescription="캐러셀" data-dragging={drag!==0}
    onKeyDown={e=>{
      if(e.target!==e.currentTarget||e.altKey||e.ctrlKey||e.metaKey)return;
      if(e.key==="ArrowLeft"){e.preventDefault();if(previous)onStep(-1);}
      if(e.key==="ArrowRight"){e.preventDefault();if(next)onStep(1);}
    }}
    onPointerDown={e=>{
      if(!e.isPrimary||e.button!==0||(e.target as Element).closest("button,a,input,select,textarea"))return;
      gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,horizontal:false};
    }}
    onPointerMove={e=>{
      const start=gesture.current;if(!start||start.id!==e.pointerId)return;
      const dx=e.clientX-start.x,dy=e.clientY-start.y;
      if(!start.horizontal){
        if(Math.abs(dy)>8&&Math.abs(dy)>=Math.abs(dx)){cancel();return;}
        if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.5)return;
        start.horizontal=true;e.currentTarget.setPointerCapture(e.pointerId);
      }
      if(e.cancelable)e.preventDefault();
      const available=dx>0?previous:next;
      setDrag(Math.max(-72,Math.min(72,dx*(available?0.45:0.15))));
    }}
    onPointerUp={finish} onPointerCancel={cancel}
    onLostPointerCapture={e=>{if(e.target===e.currentTarget)cancel();}}>
    <div className="question-meta">
      <time dateTime={question.day}>{question.day.replaceAll("-",".")} · {question.slot==="am"?"오전":"오후"}</time>
      <div className="question-controls">
        <button type="button" aria-label="이전 질문" aria-controls="question-answers" disabled={!previous} onClick={()=>onStep(-1)}><I n="back" s={16}/></button>
        <span className="question-position" role="status" aria-live="polite" aria-atomic="true"
          aria-label={(more?"불러온 ":"")+"질문 "+count+"개 중 "+(index+1)+"번째: "+question.question}>
          {index+1} / {count}{more?"+":""}
        </span>
        <button type="button" aria-label="다음 질문" aria-controls="question-answers" disabled={!next} onClick={()=>onStep(1)}><I n="right" s={16}/></button>
      </div>
    </div>
    <div className="question-copy" style={{transform:drag?`translateX(${drag}px)`:undefined}}>
      <h3 id="selected-question">{question.question}</h3>
    </div>
  </header>;
}
