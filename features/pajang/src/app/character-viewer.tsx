import {useLayoutEffect,useRef,useState,type PointerEvent,type ReactNode} from "react";
import {I} from "./icons";

type Form="mini"|"full";
type Props={
  name:string; form:Form; onForm:(form:Form)=>void; onClose:()=>void; children:ReactNode;
  previous?:()=>void; next?:()=>void; onSelect?:()=>void; actionLabel?:string;
};

export function CharacterViewer({name,form,onForm,onClose,children,previous,next,onSelect,actionLabel}:Props){
  const dialog=useRef<HTMLDialogElement>(null),viewport=useRef<HTMLDivElement>(null);
  const drag=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
  const [zoom,setZoom]=useState(false);
  useLayoutEffect(()=>{
    const node=dialog.current!;
    if(typeof node.showModal==="function")node.showModal();
    else node.setAttribute("open","");
    return ()=>{if(node.open)node.close?.();};
  },[]);
  useLayoutEffect(()=>{
    const scroll=viewport.current!;
    scroll.scrollLeft=(scroll.scrollWidth-scroll.clientWidth)/2;
    const figure=scroll.querySelector<HTMLElement>(".pj-character-figure");
    scroll.scrollTop=0;
    if(zoom&&figure)scroll.scrollTop=Math.max(0,figure.getBoundingClientRect().top-scroll.getBoundingClientRect().top-10);
    drag.current=null;
  },[zoom,name,form]);
  function start(e:PointerEvent<HTMLDivElement>){
    if(e.button!==0||e.isPrimary===false)return;
    const el=e.currentTarget;
    drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};
    el.setPointerCapture?.(e.pointerId);
  }
  function move(e:PointerEvent<HTMLDivElement>){
    const p=drag.current;
    if(!zoom||!p||p.id!==e.pointerId||e.pointerType==="touch")return;
    e.currentTarget.scrollLeft=p.left+p.x-e.clientX;
    e.currentTarget.scrollTop=p.top+p.y-e.clientY;
  }
  function finish(e:PointerEvent<HTMLDivElement>){
    const p=drag.current;
    drag.current=null;
    if(!p||p.id!==e.pointerId||zoom)return;
    const dx=e.clientX-p.x,dy=e.clientY-p.y;
    if(Math.abs(dx)>=40&&Math.abs(dx)>Math.abs(dy)*1.4)(dx<0?next:previous)?.();
  }
  return <dialog ref={dialog} className="pj-character-viewer" aria-label="캐릭터 미리보기"
    onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}}
    onKeyDown={e=>{
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onClose();}
      if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
        e.preventDefault();e.stopPropagation();(e.key==="ArrowLeft"?previous:next)?.();
      }
    }}>
    <header><strong aria-live="polite">{name}</strong>
      <button type="button" className="pj-viewer-icon" aria-label={onSelect?"목록으로":"닫기"} onClick={onClose}><I n="close" s={22}/></button></header>
    <div className="pj-viewer-stage">
      <div className="pj-viewer-scroll" ref={viewport} data-zoom={zoom} onPointerDown={start} onPointerMove={move}
        onPointerUp={finish} onPointerCancel={()=>{drag.current=null;}}>
        <div className="pj-viewer-canvas">{children}</div>
      </div>
      {onSelect&&<><button type="button" className="pj-viewer-icon pj-viewer-prev" aria-label="이전 캐릭터" disabled={!previous} onClick={previous}><I n="back"/></button>
        <button type="button" className="pj-viewer-icon pj-viewer-next" aria-label="다음 캐릭터" disabled={!next} onClick={next}><I n="right"/></button></>}
      <button type="button" className="pj-viewer-icon pj-viewer-zoom" aria-label={zoom?"전신 보기":"3배 확대"} aria-pressed={zoom} onClick={()=>setZoom(!zoom)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6"/>{!zoom&&<path d="M10 7v6"/>}
        </svg>
      </button>
    </div>
    <footer><div className="pj-viewer-forms">{(["mini","full"] as const).map(f=><button key={f} type="button"
      aria-pressed={f===form} onClick={()=>onForm(f)}>{f==="mini"?"대두형":"전신형"}</button>)}</div>
      {onSelect&&<button type="button" className="pj-viewer-select" onClick={onSelect}>{actionLabel}</button>}</footer>
  </dialog>;
}
