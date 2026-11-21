import {useEffect, useMemo, useRef, useState, type PointerEvent} from "react";
import {signalsWith, type Slot, type Station} from "../lib/station";
import {relationshipIntents,type RelationshipIntentKey} from "../lib/profile-preferences.mjs";
import {InterestArt} from "./interest-art";
import {I} from "./icons";
import QuestionCarousel from "./question-carousel";

export type DiscoveryAnswer = {
  peer:string; name:string; region:string; interest:string;
  day:string; slot:Slot; at:number; question:string; body:string;
  own:boolean; sent:boolean; received:boolean;
  relationship_intents?:RelationshipIntentKey[];
};
type Cursor = Record<string, unknown>;
type Page = {items:DiscoveryAnswer[]; nextCursor:Cursor|null; total:number; remaining:number};
type Result = {key:string; items:DiscoveryAnswer[]; total:number|null; next:Cursor|null; loading:boolean; changed:boolean; error:string};
type Order = "recommend"|"latest"|"local";
type Gender = "male"|"all"|"female";
const genderOptions = [
  {value:"male", text:"남", label:"남성 답변"},
  {value:"all", text:"", label:"성별 전체"},
  {value:"female", text:"여", label:"여성 답변"},
] as const;
declare global {
  interface Window {
    pajangTakeOpeningFeed?:(scope:string,signal:AbortSignal)=>Promise<{data?:Page;error?:unknown}>|undefined;
  }
}
type Intent = "first"|"more"|"check"|"changed";
const rowKey = (row:DiscoveryAnswer) => row.peer+"/"+row.day+"/"+row.slot;
const questionKey = (row:DiscoveryAnswer) => JSON.stringify([row.day,row.slot,row.question]);
const empty = (key:string):Result => ({key,items:[],total:null,next:null,loading:true,changed:false,error:""});
type SavedPage = {until:number; result:Result};
function firstPage(cache:Map<string,SavedPage>, key:string):Result {
  const saved=cache.get(key);
  return saved && saved.until>Date.now() ? {...saved.result,loading:true} : empty(key);
}

function useAnswers(filter:string, gender:Gender, order:Order, scope:string, openingScope:string, activity:string, visible:boolean) {
  const visibleRef=useRef(visible);
  visibleRef.current=visible;
  const key = JSON.stringify([filter,gender,order,scope]);
  const cache=useMemo(()=>new Map<string,SavedPage>(),[scope]);
  const [result,setResult] = useState<Result>(()=>empty(key));
  const load = useRef<(intent:Intent)=>void>(()=>{});
  useEffect(()=>{
    let active=true, pending=false, revision=0, pages=0;
    let current=firstPage(cache,key);
    let controller:AbortController|undefined;
    function publish(next:Result) { current=next; setResult(next); }
    async function read(intent:Intent) {
      if (!visibleRef.current || document.hidden) return;
      if (intent==="changed" && pages>1) {
        if (!current.changed) publish({...current,changed:true});
        return;
      }
      if (intent!=="first" && (pending || (intent==="more" && !current.next) || (intent==="check" && pages!==1))) return;
      const append=intent==="more";
      const cursor=append?current.next:null;
      const request=++revision;
      controller?.abort();
      controller=new AbortController();
      const {signal}=controller;
      pending=true;
      if (intent==="first") { pages=0; publish(firstPage(cache,key)); }
      if (append) publish({...current,loading:true,error:""});
      try {
        const db=await window.OjjudaGetClient();
        if (signal.aborted) return;
        const opening=intent==="first" && filter==="all" && order==="latest" && gender==="all"
          ? window.pajangTakeOpeningFeed?.(openingScope,signal) : undefined;
        async function fetchPage(){
          const query=db.rpc("pajang_discovery_feed",{p_cursor:cursor,p_interest:filter,p_order:order,p_gender:gender});
          return typeof query.abortSignal==="function"?query.abortSignal(signal):query;
        }
        const {data,error}=await (opening??fetchPage());
        if (!active || request!==revision) return;
        if (error) throw error;
        const page=data as Page;
        const rows=new Map((append?current.items:[]).map(row=>[rowKey(row),row]));
        for (const row of page.items) rows.set(rowKey(row),row);
        pages=append?pages+1:1;
        const next={key,items:[...rows.values()],next:page.nextCursor,total:page.total,loading:false,changed:append&&current.changed,error:""};
        if (!append) {
          cache.delete(key);
          if (cache.size>=8) cache.delete(cache.keys().next().value!);
          cache.set(key,{until:Date.now()+15_000,result:next});
        }
        publish(next);
      } catch (cause) {
        if (!active || request!==revision) return;
        const code=typeof cause==="object" && cause!==null && "code" in cause?cause.code:"";
        const denied=code==="42501"||code==="PGRST301"||code==="PGRST303";
        if (denied) {pages=0;cache.clear();} else cache.delete(key);
        publish({...(denied||intent==="first"?empty(key):current),loading:false,error:denied?"회원 정보를 확인한 뒤 다시 열어 주세요.":"답변을 불러오지 못했어요."});
      } finally {
        if (request===revision) pending=false;
      }
    }
    load.current=read;
    void read("first");
    const onVisible=()=>{
      if (!document.hidden) {void read("first");return;}
      cache.clear();++revision;controller?.abort();pages=0;pending=false;publish(empty(key));
    };
    document.addEventListener("visibilitychange",onVisible);
    // Refresh the first page in place; scrolling back through earlier pages keeps its cursor.
    const poll=window.setInterval(()=>{if(!document.hidden)void read("check");},60000);
    return ()=>{active=false;controller?.abort();load.current=()=>{};window.clearInterval(poll);document.removeEventListener("visibilitychange",onVisible);};
  },[key,filter,gender,order,cache,openingScope]);
  const wasVisible=useRef(visible);
  useEffect(()=>{if(visible&&!wasVisible.current)load.current("changed");wasVisible.current=visible;},[visible]);
  useEffect(()=>{cache.clear();load.current("changed");},[activity,cache]);
  return {result:result.key===key?result:firstPage(cache,key),load};
}

function GenderSwitch({value,onChange}:{value:Gender;onChange:(next:Gender)=>void}) {
  const start=useRef<{id:number;x:number;y:number;dragging:boolean}|null>(null);
  const suppressClick=useRef(false);
  const [preview,setPreview]=useState<Gender|null>(null);
  const lit=preview??value;
  function position(e:PointerEvent<HTMLDivElement>):Gender {
    const rect=e.currentTarget.getBoundingClientRect();
    const index=Math.max(0,Math.min(2,Math.floor((e.clientX-rect.left)/rect.width*3)));
    return genderOptions[index].value;
  }
  function cancel(){start.current=null;setPreview(null);}
  return <div className="answer-genders" data-position={lit} role="radiogroup" aria-label="답변 작성자 성별"
    onPointerDown={e=>{
      if (!e.isPrimary||e.button!==0) return;
      suppressClick.current=false;start.current={id:e.pointerId,x:e.clientX,y:e.clientY,dragging:false};
    }}
    onPointerMove={e=>{
      const p=start.current;if (!p||p.id!==e.pointerId) return;
      if (!p.dragging) {
        const dx=Math.abs(e.clientX-p.x),dy=Math.abs(e.clientY-p.y);
        if (dy>6 && dy>dx){cancel();return;}
        if (dx<6) return;
        p.dragging=true;e.currentTarget.setPointerCapture(e.pointerId);
      }
      setPreview(position(e));
    }}
    onPointerUp={e=>{
      const p=start.current;if (!p||p.id!==e.pointerId) return;
      if (p.dragging) {
        const next=position(e);suppressClick.current=true;
        e.currentTarget.querySelector<HTMLInputElement>('input[value="'+next+'"]')?.focus({preventScroll:true});
        onChange(next);
      }
      cancel();
    }}
    onPointerCancel={cancel} onLostPointerCapture={e=>{if(e.target===e.currentTarget)cancel();}}
    onClickCapture={e=>{if(e.detail && suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}>
    {genderOptions.map(option=><label key={option.value} className={"answer-gender "+option.value} data-lit={lit===option.value} title={option.label}>
      <input type="radio" name="answer-gender" value={option.value} aria-label={option.label}
        checked={value===option.value} onChange={()=>onChange(option.value)}/><span aria-hidden="true">{option.text}</span>
    </label>)}
  </div>;
}

type Props = {
  active:boolean; station:Station; revision:number; onProfile:(row:DiscoveryAnswer)=>void;
  onSignal:(row:DiscoveryAnswer)=>void; onChat:(id:string)=>void; onWrite:()=>void; onEdit:(row:DiscoveryAnswer)=>void; onBuySignals?:()=>void;
};
export default function AnswerHistory({active,station,revision,onProfile,onSignal,onChat,onWrite,onEdit,onBuySignals}:Props) {
  const [filter,setFilter]=useState("all");
  const [gender,setGender]=useState<Gender>("all");
  const [order,setOrder]=useState<Order>("latest");
  const scope=JSON.stringify([station.authenticated,station.me?.id,station.me?.region,station.me?.interest,station.me?.at,station.day,station.slot,revision]);
  const activity=station.people.filter(p=>p.body).map(p=>p.id+":"+p.at).join(",");
  const openingScope=JSON.stringify([station.me?.id,station.day,station.slot]);
  const {result,load}=useAnswers(filter,gender,order,scope,openingScope,activity,active);
  const groups=useMemo(()=>{
    const questions=new Map<string,DiscoveryAnswer[]>();
    for(const answer of result.items){
      const key=questionKey(answer),group=questions.get(key);
      if(group)group.push(answer);else questions.set(key,[answer]);
    }
    return [...questions.values()];
  },[result.items]);
  const selectionScope=JSON.stringify([station.me?.id,station.day,station.slot,filter,gender,order]);
  const [selection,setSelection]=useState({scope:selectionScope,question:""});
  const advance=useRef<{scope:string;question:string}|null>(null);
  const index=Math.max(0,selection.scope===selectionScope?groups.findIndex(group=>questionKey(group[0])===selection.question):0);
  const selected=groups[index];
  useEffect(()=>{
    if(result.loading)return;
    const pending=advance.current;
    if(pending?.scope===selectionScope&&!result.error){
      const after=groups.findIndex(group=>questionKey(group[0])===pending.question)+1;
      if(after>0&&groups[after]){
        advance.current=null;
        setSelection({scope:selectionScope,question:questionKey(groups[after][0])});
        return;
      }
      // One question may fill several pages. Keep looking until the next question
      // arrives, without ever showing another question's answers under this heading.
      if(after>0&&result.next){load.current("more");return;}
    }
    advance.current=null;
    if(selected&&(selection.scope!==selectionScope||!groups.some(group=>questionKey(group[0])===selection.question)))
      setSelection({scope:selectionScope,question:questionKey(selected[0])});
  },[groups,result.loading,result.error,result.next,selectionScope,selection,selected,load]);
  function stepQuestion(direction:number){
    advance.current=null;
    const group=groups[index+direction];
    if(group)setSelection({scope:selectionScope,question:questionKey(group[0])});
    else if(direction>0&&selected&&result.next&&!result.loading){
      advance.current={scope:selectionScope,question:questionKey(selected[0])};
      load.current("more");
    }
  }
  return <section id="answers" className="feedsection" aria-labelledby="all-answers-title">
    <div className="sectiontitle history-head">
      <div className="history-heading">
        <h2 id="all-answers-title">모두의 답변</h2>
        <GenderSwitch value={gender} onChange={setGender}/>
        <span className="feednumber" aria-label={result.total===null?undefined:"답변 "+result.total+"개"}>{result.total}</span>
      </div>
      <div className="signal-budget"><span className="budget"><I n="signal" s={16}/>남은 신호 <b>{station.remaining}{station.paidRemaining?<em>개</em>:<em> / 3</em>}</b></span>
        {!!station.paidRemaining&&<small>무료 {station.freeRemaining??0} · 구매 {station.paidRemaining}</small>}
        {station.purchasingEnabled&&(station.freeRemaining??station.remaining)===0&&onBuySignals&&<button type="button" className="signal-buy" onClick={onBuySignals}>신호 더하기<I n="right" s={13}/></button>}
      </div>
    </div>
    <div className="filterrow">
      <div className="chips relationship-filters" aria-label="원하는 인연으로 필터">
        <button className={filter==="all"?"sel":""} aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>전체</button>
        {relationshipIntents.map(x=><button key={x.key} className={filter===x.key?"sel":""} aria-pressed={filter===x.key} onClick={()=>setFilter(x.key)} title={x.description}>{x.shortLabel}</button>)}
      </div>
      <label className="sort"><select aria-label="답변 정렬" value={order} onChange={e=>setOrder(e.target.value as Order)}>
        <option value="recommend">대표 취향순</option><option value="latest">최신순</option><option value="local">같은 지역순</option>
      </select><I n="chevron" s={13}/></label>
    </div>
    {result.changed&&<p className="notice" role="status">답변 목록이 바뀌었어요.<button onClick={()=>load.current("first")}>새로고침</button></p>}
    {result.loading&&result.total===null&&<span className="answer-sr" role="status">답변을 불러오고 있어요.</span>}
    <div className="cardgrid" aria-busy={result.loading}>
      {result.loading&&result.total===null&&[0,1,2].map(i=><div className="answer-skeleton" key={i} aria-hidden="true"><i/><i/><i/><i/></div>)}
      {selected&&<QuestionCarousel groups={groups} index={index} scope={selectionScope} more={Boolean(result.next)} loading={result.loading} onStep={stepQuestion}
        renderAnswers={answers=>answers.map(row=>{
        const relation=signalsWith(station,row.peer);
        const sent=row.sent||!!relation.outgoing, received=row.received||!!relation.incoming, matched=sent&&received;
        const intents=relationshipIntents.filter(intent=>row.relationship_intents?.includes(intent.key));
        return <article key={rowKey(row)} className="answercard">
          <button className="person" onClick={()=>onProfile(row)}>
            <InterestArt interest={row.interest}/>
            <span><strong>{row.name}{row.own?" · 내 답변":""}</strong>{row.region&&<small>{row.region}</small>}</span>
          </button>
          <p className="quote">{row.body}</p>
          <div className="answer-foot"><div className="answer-intents" aria-label="원하는 인연">{intents.map(intent=><span key={intent.key} className="tag">{intent.shortLabel}</span>)}</div>
          {row.own&&row.peer===station.me?.id&&<button type="button" className="sendlink" aria-haspopup="dialog" onClick={()=>onEdit(row)}>
            <span><I n="pencil" s={17}/>답변 수정</span>
          </button>}
          {!row.own&&<button className={"sendlink "+(sent?"issent":"")} disabled={!matched&&(sent||(station.remaining===0&&!station.purchasingEnabled))}
            onClick={()=>matched?onChat(row.peer):onSignal(row)}>
            <span><I n={matched?"chat":sent?"check":"signal"} s={17}/>{matched?"대화하기":sent?"보낸 신호":received?"신호 수락하기":"신호 보내기"}</span>
          </button>}</div>
        </article>;
      })}/>}
    </div>
    {result.error&&<p className="notice" role="alert">{result.error}<button onClick={()=>load.current(result.next&&result.items.length?"more":"first")}>다시 시도</button></p>}
    {result.total!==null&&!result.error&&!result.items.length&&<div className="empty"><span className="emptyicon" aria-hidden="true"><I n="wave" s={22}/></span>
      <h3>{gender!=="all"?"선택한 조건에 맞는 답변이 없어요":filter==="all"?"지금 공개 중인 답변이 없어요":"이 인연을 원하는 회원의 답변이 아직 없어요"}</h3>
      {gender!=="all"||filter!=="all"?<button className="secondary" onClick={()=>{setGender("all");setFilter("all");}}>전체 답변 보기<I n="arrow" s={16}/></button>:
        !station.me?.body&&<button className="secondary" onClick={onWrite}>첫 답변 쓰기<I n="pencil" s={16}/></button>}
    </div>}
    {result.next&&!result.error&&<button className="secondary history-more" disabled={result.loading} onClick={()=>load.current("more")}>답변 더 보기<I n="chevron" s={16}/></button>}
  </section>;
}
