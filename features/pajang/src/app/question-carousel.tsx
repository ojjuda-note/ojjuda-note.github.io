import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent,type ReactNode} from "react";
import type {DiscoveryAnswer} from "./answer-history";
import {I} from "./icons";

type Props = {
  groups:DiscoveryAnswer[][]; index:number; scope:string; more:boolean; loading:boolean;
  onStep:(direction:number)=>void; renderAnswers:(answers:DiscoveryAnswer[])=>ReactNode;
  renderQuestionAction?:(answers:DiscoveryAnswer[])=>ReactNode;
};
const questionKey=(question:DiscoveryAnswer)=>JSON.stringify([question.day,question.slot,question.question]);

export default function QuestionCarousel({groups,index,scope,more,loading,onStep,renderAnswers,renderQuestionAction}:Props){
  const viewport=useRef<HTMLDivElement>(null),track=useRef<HTMLDivElement>(null);
  const gesture=useRef<{id:number;x:number;y:number;horizontal:boolean}|null>(null);
  const animation=useRef<Animation|null>(null),dragValue=useRef(0),suppressClick=useRef(false);
  const requested=useRef<{key:string;direction:number;focus:string|null}|null>(null);
  const departed=useRef<{key:string;offset:number}|null>(null);
  const key=questionKey(groups[index][0]);
  const shown=useRef({key,scope,index,height:0});
  const [drag,setDrag]=useState(0),[moving,setMoving]=useState(false);
  const [minHeight,setMinHeight]=useState<number>();
  function adjacentIndex(direction:number){
    const candidate=index+direction;
    if(candidate>=0&&candidate<groups.length)return candidate;
    if(more||groups.length<2)return -1;
    return direction>0?0:groups.length-1;
  }
  // Either edge remains swipeable while an older page is available on the server.
  const previous=adjacentIndex(-1)>=0||(index===0&&more&&!loading);
  const next=adjacentIndex(1)>=0||(index===groups.length-1&&more&&!loading);
  function move(value:number){dragValue.current=value;setDrag(value);}
  function cancel(){gesture.current=null;move(0);}
  function step(direction:number,keepFocus=true){
    if(direction<0?!previous:!next)return;
    if(keepFocus)dragValue.current=0;
    animation.current?.finish();
    const focused=keepFocus&&viewport.current?.contains(document.activeElement)?document.activeElement:null;
    requested.current={key,direction,focus:focused?.getAttribute("aria-label")??(focused?"header":null)};
    onStep(direction);
  }
  function revealQuestion(){
    const top=viewport.current?.getBoundingClientRect().top??0;
    const edge=(document.querySelector(".pajang-mast")?.getBoundingClientRect().bottom??0)+12;
    if(top<edge)window.scrollBy({top:top-edge,behavior:"instant"});
  }
  // Reposition the neighboring pages before paint, then slide the entire track.
  // The old page stays in place until a new question has actually arrived.
  useLayoutEffect(()=>{
    const before=shown.current,height=track.current?.querySelector<HTMLElement>(".answer-group")?.offsetHeight??0;
    shown.current={key,scope,index,height};
    if(before.key===key&&before.scope===scope)return;
    const navigation=requested.current,offset=dragValue.current;
    requested.current=null;departed.current=null;cancel();animation.current?.cancel();animation.current=null;
    setMoving(false);setMinHeight(undefined);
    const wraps=!more&&groups.length>1&&(
      (navigation?.direction===1&&before.index===groups.length-1&&index===0)||
      (navigation?.direction===-1&&before.index===0&&index===groups.length-1)
    );
    if(before.scope!==scope||navigation?.key!==before.key||(!wraps&&Math.abs(index-before.index)!==1))return;
    revealQuestion();
    if(navigation.focus&&(viewport.current?.contains(document.activeElement)||document.activeElement===document.body)){
      const control=[...viewport.current!.querySelectorAll<HTMLButtonElement>(".answer-group .question-controls button")]
        .find(button=>button.getAttribute("aria-label")===navigation.focus&&!button.disabled);
      (control??viewport.current!.querySelector<HTMLElement>("header.question-carousel"))?.focus({preventScroll:true});
    }
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches||!track.current)return;
    departed.current={key:before.key,offset:-navigation.direction};
    setMinHeight(Math.max(before.height,height));setMoving(true);
    const start=navigation.direction*((viewport.current?.clientWidth??0)+12)+offset;
    const motion=track.current.animate([{transform:`translate3d(${start}px,0,0)`},{transform:"translate3d(0,0,0)"}],
      {duration:240,easing:"cubic-bezier(.22,.8,.25,1)"});
    animation.current=motion;
    void motion.finished.then(()=>{
      if(animation.current!==motion)return;
      animation.current=null;departed.current=null;setMoving(false);setMinHeight(undefined);
    },()=>{});
  });
  useEffect(()=>()=>{animation.current?.cancel();},[]);
  function finish(e:PointerEvent<HTMLDivElement>){
    const start=gesture.current;
    if(!start||start.id!==e.pointerId)return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y;
    const threshold=Math.min(60,Math.max(40,e.currentTarget.clientWidth*.12));
    let advances=false;
    if(start.horizontal&&Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.5){
      const direction=dx<0?1:-1;
      advances=direction>0?next:previous;
      if(advances)step(direction,false);
    }
    // Preserve the last drag offset for the layout effect when selection changes.
    if(!advances)dragValue.current=0;
    gesture.current=null;setDrag(0);
  }
  return <div ref={viewport} className="question-viewport" data-moving={moving} data-dragging={drag!==0}
    style={{minHeight}}
    onPointerDown={e=>{
      if(!e.isPrimary){cancel();return;}
      suppressClick.current=false;
      if(e.button!==0||(e.target as Element).closest("button,a,input,select,textarea,[contenteditable=true]"))return;
      if(window.getSelection()?.isCollapsed===false)return;
      animation.current?.finish();
      gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,horizontal:false};
    }}
    onPointerMove={e=>{
      const start=gesture.current;if(!start||start.id!==e.pointerId)return;
      if(window.getSelection()?.isCollapsed===false){cancel();return;}
      const dx=e.clientX-start.x,dy=e.clientY-start.y;
      if(!start.horizontal){
        if(Math.abs(dy)>8&&Math.abs(dy)>=Math.abs(dx)){cancel();return;}
        if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.5)return;
        start.horizontal=true;suppressClick.current=true;e.currentTarget.setPointerCapture(e.pointerId);
      }
      if(e.cancelable)e.preventDefault();
      if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){move(0);return;}
      const adjacent=dx>0?previous:next;
      const width=e.currentTarget.clientWidth;
      move(Math.max(-width,Math.min(width,dx*(adjacent?1:.18))));
    }}
    onPointerUp={finish} onPointerCancel={cancel}
    onLostPointerCapture={e=>{if(e.target===e.currentTarget&&gesture.current)cancel();}}
    onClickCapture={e=>{if(e.detail&&suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}>
    <div ref={track} className="question-track" style={{transform:drag?`translate3d(${drag}px,0,0)`:undefined}}>
      {[-1,0,1].map(offset=>{
        const active=offset===0;
        if(!active&&!drag&&!moving)return null;
        const pageIndex=moving&&departed.current?.offset===offset
          ?groups.findIndex(answers=>questionKey(answers[0])===departed.current!.key)
          :active?index:adjacentIndex(offset);
        const answers=groups[pageIndex];
        if(!answers){
          // The next page is not downloaded yet: show a noninteractive peek
          // rather than treating the current batch as the end of the carousel.
          if(!active&&more&&((offset>0&&index===groups.length-1)||(offset<0&&index===0)))
            return <section key={"pending/"+offset} className="question-page question-preview" inert aria-hidden="true"
              style={{left:`calc(${offset*100}% + ${offset*12}px)`}}>
              <header className="question-header"><h3>다음 질문을 불러오는 중…</h3></header>
            </section>;
          return null;
        }
        const question=answers[0];
        return <section key={questionKey(question)+"/"+offset} className={"question-page "+(active?"answer-group":"question-preview")}
          inert={!active} aria-hidden={active?undefined:true} aria-labelledby={active?"selected-question":undefined}
          style={active?undefined:{left:`calc(${offset*100}% + ${offset*12}px)`}}>
          <header className={"question-header"+(active?" question-carousel":"")} data-tone={pageIndex%6}
            tabIndex={active?0:undefined} role={active?"group":undefined} aria-label={active?"질문 넘기기":undefined}
            aria-roledescription={active?"캐러셀":undefined}
            onKeyDown={e=>{
              if(!active||e.target!==e.currentTarget||e.altKey||e.ctrlKey||e.metaKey)return;
              if(e.key==="ArrowLeft"){e.preventDefault();step(-1);}
              if(e.key==="ArrowRight"){e.preventDefault();step(1);}
            }}>
            <div className="question-meta">
              <time dateTime={question.day}>{question.day.replaceAll("-",".")} · {question.slot==="am"?"오전":"오후"}</time>
              <div className="question-controls">
                <button type="button" aria-label="이전 질문" aria-controls={active?"question-answers":undefined} disabled={!active||!previous} onClick={()=>step(-1)}><I n="back" s={16}/></button>
                <span className="question-position" role={active?"status":undefined} aria-live={active?"polite":undefined} aria-atomic={active?true:undefined}
                  aria-label={(more?"불러온 ":"")+"질문 "+groups.length+"개 중 "+(pageIndex+1)+"번째: "+question.question}>
                  {pageIndex+1} / {groups.length}{more?"+":""}
                </span>
                <button type="button" aria-label="다음 질문" aria-controls={active?"question-answers":undefined} disabled={!active||!next} onClick={()=>step(1)}><I n="right" s={16}/></button>
              </div>
            </div>
            <h3 id={active?"selected-question":undefined}>{question.question}</h3>
            {renderQuestionAction?.(answers)}
          </header>
          <div id={active?"question-answers":undefined} aria-labelledby={active?"selected-question":undefined}>
            {renderAnswers(answers)}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
