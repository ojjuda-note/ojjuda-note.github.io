import {useEffect, useRef, useState} from "react";
import {badges, interests, signalsWith, type Slot, type Station} from "../lib/station";
import {I} from "./icons";

export type DiscoveryAnswer = {
  peer:string; name:string; age:number; region:string; interest:string;
  day:string; slot:Slot; at:number; question:string; body:string;
  own:boolean; sent:boolean; received:boolean;
};
type Cursor = Record<string, unknown>;
type Page = {items:DiscoveryAnswer[]; nextCursor:Cursor|null; total:number; remaining:number};
type Result = {key:string; items:DiscoveryAnswer[]; total:number|null; next:Cursor|null; loading:boolean; changed:boolean; error:string};
type Order = "recommend"|"latest"|"local";
type Intent = "first"|"more"|"check"|"changed";
const rowKey = (row:DiscoveryAnswer) => row.peer+"/"+row.day+"/"+row.slot;
const empty = (key:string):Result => ({key,items:[],total:null,next:null,loading:true,changed:false,error:""});

function useAnswers(filter:string, order:Order, scope:string, activity:string) {
  const key = JSON.stringify([filter,order,scope]);
  const [result,setResult] = useState<Result>(()=>empty(key));
  const load = useRef<(intent:Intent)=>void>(()=>{});
  useEffect(()=>{
    let active=true, pending=false, revision=0, pages=0;
    let current=empty(key);
    function publish(next:Result) { current=next; setResult(next); }
    async function read(intent:Intent) {
      if (intent==="changed" && pages>1) {
        if (!current.changed) publish({...current,changed:true});
        return;
      }
      if (intent!=="first" && (pending || (intent==="more" && !current.next) || (intent==="check" && pages!==1))) return;
      const append=intent==="more";
      const cursor=append?current.next:null;
      const request=++revision;
      pending=true;
      if (intent==="first") { pages=0; publish(empty(key)); }
      if (append) publish({...current,loading:true,error:""});
      try {
        const db=await window.OjjudaGetClient();
        const {data,error}=await db.rpc("pajang_discovery_feed",{p_cursor:cursor,p_interest:filter,p_order:order});
        if (!active || request!==revision) return;
        if (error) throw error;
        const page=data as Page;
        const rows=new Map((append?current.items:[]).map(row=>[rowKey(row),row]));
        for (const row of page.items) rows.set(rowKey(row),row);
        pages=append?pages+1:1;
        publish({key,items:[...rows.values()],next:page.nextCursor,total:page.total,loading:false,changed:append&&current.changed,error:""});
      } catch (cause) {
        if (!active || request!==revision) return;
        const denied=typeof cause==="object" && cause!==null && "code" in cause && cause.code==="42501";
        if (denied) pages=0;
        publish({...(denied?empty(key):current),loading:false,error:denied?"회원 정보를 확인한 뒤 다시 열어 주세요.":"답변을 불러오지 못했어요."});
      } finally {
        if (request===revision) pending=false;
      }
    }
    load.current=read;
    void read("first");
    const onVisible=()=>{if (!document.hidden) void read("first");};
    document.addEventListener("visibilitychange",onVisible);
    // Refresh the first page in place; scrolling back through earlier pages keeps its cursor.
    const poll=window.setInterval(()=>{if(!document.hidden)void read("check");},60000);
    return ()=>{active=false;load.current=()=>{};window.clearInterval(poll);document.removeEventListener("visibilitychange",onVisible);};
  },[key,filter,order]);
  useEffect(()=>{load.current("changed");},[activity]);
  return {result:result.key===key?result:empty(key),load};
}

type Props = {
  station:Station; revision:number; onProfile:(row:DiscoveryAnswer)=>void;
  onSignal:(row:DiscoveryAnswer)=>void; onChat:(id:string)=>void; onWrite:()=>void;
};
export default function AnswerHistory({station,revision,onProfile,onSignal,onChat,onWrite}:Props) {
  const [filter,setFilter]=useState("all");
  const [order,setOrder]=useState<Order>("recommend");
  const scope=JSON.stringify([station.me?.id,station.me?.region,station.me?.interest,station.me?.at,station.day,station.slot,revision]);
  const activity=station.people.filter(p=>p.body).map(p=>p.id+":"+p.at).join(",");
  const {result,load}=useAnswers(filter,order,scope,activity);
  useEffect(()=>{
    if (window.location.hash==="#answers") document.getElementById("answers")?.scrollIntoView({block:"start"});
  },[]);
  return <section id="answers" className="feedsection" aria-labelledby="all-answers-title">
    <div className="sectiontitle">
      <div><h2 id="all-answers-title">모두의 답변{result.total!==null&&<span className="feednumber">{result.total}</span>}</h2>
      <p>최근 30일의 질문과 답변이에요. 마음에 드는 답변에 신호를 보내 보세요.</p></div>
      <span className="budget"><I n="signal" s={16}/>남은 신호 <b>{station.remaining}<em> / 3</em></b></span>
    </div>
    <div className="filterrow">
      <div className="chips" aria-label="취향으로 필터">
        <button className={filter==="all"?"sel":""} aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>전체</button>
        {interests.map(x=><button key={x.key} className={filter===x.key?"sel":""} aria-pressed={filter===x.key} onClick={()=>setFilter(x.key)}>{x.name}</button>)}
      </div>
      <label className="sort"><select aria-label="답변 정렬" value={order} onChange={e=>setOrder(e.target.value as Order)}>
        <option value="recommend">내 취향순</option><option value="latest">최신순</option><option value="local">같은 지역순</option>
      </select><I n="chevron" s={13}/></label>
    </div>
    {result.changed&&<p className="notice" role="status">답변 목록이 바뀌었어요.<button onClick={()=>load.current("first")}>새로고침</button></p>}
    <div className="cardgrid" aria-busy={result.loading}>
      {result.items.map(row=>{
        const relation=signalsWith(station,row.peer);
        const sent=row.sent||!!relation.outgoing, received=row.received||!!relation.incoming, matched=sent&&received;
        const badge=badges(row.interest);
        return <article key={rowKey(row)} className="answercard">
          <div className="cardtop"><button className="person" onClick={()=>onProfile(row)}>
            <span className="avatar" style={{background:badge.bg}}><img src={window.pajangArt[badge.key]} alt=""/></span>
            <span><strong>{row.name}{row.own?" · 내 답변":""}</strong><small>{row.age}세<span>·</span>{row.region}</small></span>
          </button><span className="tag" style={{background:badge.bg}}>{badge.name}</span></div>
          <time className="answerdate" dateTime={row.day}>{row.day.replaceAll("-",".")} · {row.slot==="am"?"오전":"오후"}</time>
          <h3 className="cardquestion">{row.question}</h3><p className="quote">{row.body}</p>
          {!row.own&&<button className={"sendlink "+(sent?"issent":"")} disabled={!matched&&(sent||station.remaining===0)}
            onClick={()=>matched?onChat(row.peer):onSignal(row)}>
            <span><I n={matched?"chat":sent?"check":"signal"} s={17}/>{matched?"대화하기":sent?"보낸 신호":received?"신호 수락하기":"신호 보내기"}</span>
            {!sent&&<I n="up" s={15}/>}
          </button>}
        </article>;
      })}
    </div>
    {result.error&&<p className="notice" role="alert">{result.error}<button onClick={()=>load.current(result.next&&result.items.length?"more":"first")}>다시 시도</button></p>}
    {result.loading&&<p className="history-status" role="status">답변을 불러오고 있어요.</p>}
    {!result.loading&&!result.error&&!result.items.length&&<div className="empty"><span className="emptyicon"><I n="headphones" s={27}/></span>
      <h3>{filter==="all"?"최근 30일 동안 공개된 답변이 없어요":"이 취향의 답변이 아직 없어요"}</h3>
      {filter!=="all"?<button className="secondary" onClick={()=>setFilter("all")}>전체 답변 보기<I n="arrow" s={16}/></button>:
        !station.me?.body&&<button className="secondary" onClick={onWrite}>첫 답변 쓰기<I n="pencil" s={16}/></button>}
    </div>}
    {result.next&&!result.error&&<button className="secondary history-more" disabled={result.loading} onClick={()=>load.current("more")}>답변 더 보기<I n="chevron" s={16}/></button>}
  </section>;
}
