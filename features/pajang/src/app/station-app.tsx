"use client";
import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {themeFor,interests,introDetails,signalsWith,type Person,type Message,type Station} from "../lib/station";
import regionCatalog from "../../regions.json";

import {InterestArt as Art} from "./interest-art";
import {I} from "./icons";
import NearbyRadar from "./nearby-radar";
import {prepareLocation} from "../../location.mjs";
import MyAnswers from "./my-answers";
import AnswerHistory, {type DiscoveryAnswer} from "./answer-history";
import AnswerGenderVisibility from "./answer-gender-visibility";

import {ChatExchange} from "./chat-exchange";
import {ExchangeProfileEditor} from "./exchange-profile";
import {MyExchangePhotos,removeAllExchangePhotos} from "./exchange-photos";

import {StationNavigation,readRoute,routeHref,type Tab} from "./station-navigation";
type Modal = {kind:"answer"|"signal"|"result"|"setup"|"edit"|"channels"|"help"|"block"|"delete"|"person"|"privateProfile"|"privatePhotos";peer?:string;period?:string;originalBody?:string;questionId?:number;answer?:DiscoveryAnswer};
const districts:Record<string,string[]> = regionCatalog;
const provinces=Object.keys(districts);
const fmtClock=(at:number)=>new Intl.DateTimeFormat("ko-KR",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Seoul"}).format(new Date(at));
async function request<T,>(url:string,init?:RequestInit):Promise<T>{
  const params=init?.body?JSON.parse(String(init.body)):{};
  const peer=new URL(url,location.origin).searchParams.get("thread");
  const action=peer?"thread":params.action||"state";
  const query=(await window.OjjudaGetClient()).rpc("pajang_member",{p_action:action,p_data:peer?{peer}:params});
  const {data,error}=await (init?.signal && query.abortSignal?query.abortSignal(init.signal):query);
  if(error)throw Object.assign(new Error(error.message),{code:error.code});
  return data as T;
}
function Blank({icon,title,body,button,onClick}:{icon:string;title:string;body:string;button?:string;onClick?:()=>void}){return <div className="empty"><span className="emptyicon"><I n={icon} s={27}/></span><h3>{title}</h3>{body&&<p>{body}</p>}{button&&<button className="secondary" onClick={onClick}>{button}<I n="arrow" s={16}/></button>}</div>;}
function Dialog({children,close,title}:{children:React.ReactNode;close:()=>void;title:string}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=ref.current;if(node&&!node.open)node.showModal();const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{node?.close();document.body.style.overflow=overflow;};},[]);
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===ref.current){const b=ref.current.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close();}}}>
    <div className="sheet-bar"><a href="/world.html" target="_top"><I n="back" s={15}/>아지트로</a><button className="iconbtn" aria-label="닫기" onClick={close}><I n="close"/></button></div>{children}</dialog>;
}
function Editor({initial="",max,label,submit,onSave,busy,hint,optional=false}:{initial?:string;max:number;label:string;submit:string;onSave:(v:string)=>void;busy:boolean;hint:string;optional?:boolean}){
  const [value,setValue]=useState(initial);
  return <form onSubmit={e=>{e.preventDefault();if(optional||value.trim())onSave(value.trim());}}>
    <label className="formlabel" htmlFor="editor">{label}</label><textarea id="editor" value={value} onChange={e=>setValue(e.target.value)} placeholder={hint} maxLength={max} rows={4} required={!optional}/><div className="counter">{value.length} / {max}</div>
    <button className="primary wide" disabled={busy||(!optional&&!value.trim())}>{submit}<I n="arrow" s={17}/></button></form>;
}
function ProfileForm({person,isNew,onSave,busy}:{person:Person|null;isNew:boolean;onSave:(x:Record<string,unknown>)=>void;busy:boolean}){
  const [name,setName]=useState(person?.name||""),[region,setRegion]=useState(person?.region||""),[interest,setInterest]=useState(person?.interest||""),[consent,setConsent]=useState(false);
  const [province,city=""]=region.split(" ");
  const knownProvince=Object.hasOwn(districts,province);
  const previousRegion=person?.region;
  const legacyRegion=previousRegion && !Object.hasOwn(districts,previousRegion.split(" ")[0]);
  return <form className="profileform" onSubmit={e=>{e.preventDefault();onSave({name:name.trim(),region,interest,consent});}}>
    <label>닉네임<input value={name} maxLength={12} placeholder="오쭈다 닉네임 사용" onChange={e=>setName(e.target.value)}/></label>
    <div className="fieldrow">
      <label>공개할 활동 지역<select value={knownProvince?province:region} onChange={e=>setRegion(e.target.value)}>
        <option value="">공개하지 않음</option>
        {legacyRegion&&<option value={previousRegion}>기존 지역 · {previousRegion}</option>}
        {provinces.map(name=><option key={name}>{name}</option>)}
      </select></label>
      {knownProvince&&districts[province].length>0&&<label>시·군 (선택)<select value={city} onChange={e=>setRegion(e.target.value?province+" "+e.target.value:province)}>
        <option value="">시·도만 표시</option>
        {districts[province].map(name=><option key={name}>{name}</option>)}
      </select></label>}
    </div>
    <fieldset><legend>공개할 취향 (선택)</legend><div className="interestgrid">{interests.map(x=><button type="button" key={x.key} className={interest===x.key?"selected":""} aria-pressed={interest===x.key} onClick={()=>setInterest(interest===x.key?"":x.key)}><Art interest={x.key}/>{x.name}</button>)}</div></fieldset>
    {isNew&&<label className="checkrow"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>만 19세 이상이며 파장 회원에게 닉네임과 내가 선택한 공개 정보를 보여 주는 데 동의해요.</span></label>}
    <button className="primary wide" disabled={busy||(isNew&&!consent)}>{isNew?"회원 채널 시작하기":"프로필 저장"}<I n="arrow" s={16}/></button></form>;
}

function ListPerson({p,type,station,busy,onProfile,onAction}:{
  p:Person;type:"received"|"sent"|"chat";station:Station;busy:boolean;
  onProfile:()=>void;onAction:()=>void;
}){
    const v=signalsWith(station,p.id);const sig=type==="received"?v.incoming:v.outgoing;
    return <div className="listperson"><button className="person" onClick={onProfile}><Art interest={p.interest}/><span><strong>{p.name}</strong><small>{introDetails(p)}</small></span></button><p>{type==="chat"?"서로의 신호가 닿았어요.":sig?.note||(v.match?"서로의 신호가 닿았어요.":type==="received"?"신호를 보내왔어요.":"상대의 신호를 기다리고 있어요.")}</p><button className="secondary small" disabled={busy||(!station.remaining&&type==="received")} onClick={onAction}>{v.match?"대화 열기":type==="sent"?"상태 보기":"수락하고 대화하기"}<I n="right" s={15}/></button></div>;
  }

export default function StationApp({initialStation}:{initialStation:Station}){
  const [live,setLive]=useState<Station>(initialStation);
  const [route,setRoute]=useState(readRoute);
  const {tab,thread}=route;
  const [visitedToday,setVisitedToday]=useState(tab==="today");
  const scrollPositions=useRef(new Map<string,number>());
  const routeKey=tab+"/"+thread;
  const currentRoute=useRef(routeKey);
  const scrollTarget=useRef<"answers"|"restore">(location.hash==="#answers"?"answers":"restore");
  const navigationId=useRef(0),refreshInFlight=useRef(false),threadRead=useRef<AbortController|null>(null);
  const pendingMessages=useRef(new Map<string,{body:string;id:string}>());
  const draftByPeer=useRef(new Map<string,string>());
  const currentPeer=useRef(thread);
  currentPeer.current=thread;
  const [pendingModal,setModal]=useState<Modal|null>(null),[inbox,setInbox]=useState("received");
  const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[toast,setToast]=useState(initialStation.locationNotice||""),[net,setNet]=useState(""),[ready,setReady]=useState(false);
  const [historyRevision,setHistoryRevision]=useState(0);
  const lock=useRef(false),serverRevision=useRef(0),bottom=useRef<HTMLDivElement>(null);
  const liveRef=useRef(live);liveRef.current=live;
  const locationAccount=useRef("");
  useEffect(()=>{
    let closed=false,unsubscribe=()=>{};
    void window.OjjudaGetClient().then(async db=>{
      const {data:{session}}=await db.auth.getSession();
      if(closed||!session?.user||session.user.is_anonymous)return;
      const accountId=session.user.id;locationAccount.current=accountId;
      const service=(window as any).OjjudaLocation;
      const current=liveRef.current;
      service.acceptPreference(accountId,{enabled:current.locationEnabled!==false,version:current.locationVersion??0},true);
      unsubscribe=service.subscribe(accountId,(choice:{enabled:boolean;version:number})=>{
        const previous=liveRef.current;
        if(closed||choice.version<(previous.locationVersion??0)||
          (choice.version===previous.locationVersion&&choice.enabled===previous.locationEnabled))return;
        const next={...previous,locationEnabled:choice.enabled,locationVersion:choice.version,
          radarOn:choice.enabled?previous.radarOn:false};
        liveRef.current=next;setLive(next);
        const revision=++serverRevision.current;
        if(choice.enabled&&previous.locationEnabled===false){
          void prepareLocation({...next,locationChecked:false},db,accountId).then(result=>{
            if(!closed&&serverRevision.current===revision)setLive(result);
          });
        }
      });
    }).catch(()=>{});
    return()=>{closed=true;unsubscribe();};
  },[]);
  useEffect(()=>{
    if(locationAccount.current)(window as any).OjjudaLocation.acceptPreference(locationAccount.current,
      {enabled:live.locationEnabled!==false,version:live.locationVersion??0},true);
  },[live.locationEnabled,live.locationVersion]);
  const s=live,me=s.me,theme=s.question??themeFor(s.day,s.slot),period=s.day+"/"+s.slot;
  const slotName=s.slot==="am"?"오전":"오후";
  const obsoleteAnswer=pendingModal?.kind==="answer" && (pendingModal.questionId!==s.question?.id ||
    (pendingModal.originalBody===undefined && Boolean(me?.body)));
  const modal=(pendingModal?.period && pendingModal.period!==period) || obsoleteAnswer ? null : pendingModal;
  const editingAnswer=modal?.kind==="answer" && modal.originalBody!==undefined;
  const answerTitle=slotName+(editingAnswer?" 답변 수정":" 답변");
  const row=modal?.answer;
  const peer=row?{...row,id:row.peer}:s.people.find(p=>p.id===modal?.peer);
  const active=s.people.find(p=>p.id===thread);
  const incoming=s.people.filter(p=>signalsWith(s,p.id).incoming),sent=s.people.filter(p=>signalsWith(s,p.id).outgoing),matches=s.people.filter(p=>signalsWith(s,p.id).match);
  const validThread=Boolean(active&&signalsWith(s,thread).match);
  const available=s.remaining;
  const themeText=theme.q.join(" ");
  async function refresh(){
    if(refreshInFlight.current)return;
    refreshInFlight.current=true;
    const rev=++serverRevision.current;
    try{const next=await request<Station>("/api/station");if(serverRevision.current===rev){setLive(next);setNet("");}}
    catch{if(serverRevision.current===rev)setNet("회원 채널을 불러오지 못했어요.");}
    finally{refreshInFlight.current=false;}
  }
  useEffect(()=>{setReady(true);},[]);
  useEffect(()=>{
    const tick=()=>{if(!document.hidden&&!lock.current)void refresh();};
    const poll=setInterval(tick,12000);
    const boundary=setTimeout(tick,Math.max(0,Date.parse(s.nextAt)-Date.now())+100);
    document.addEventListener("visibilitychange",tick);
    return()=>{clearInterval(poll);clearTimeout(boundary);document.removeEventListener("visibilitychange",tick);};
  },[s.nextAt]);
  useEffect(()=>{if(pendingModal&&!modal){setModal(null);setError("");}},[pendingModal,modal]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(t);},[toast]);
  const [threadError,setThreadError]=useState("");
  async function readThread(id:string,replace=false){
    if(threadRead.current&&!replace)return;
    threadRead.current?.abort();
    const controller=new AbortController();
    threadRead.current=controller;
    try{
      const rows=await request<Message[]>("/api/station?thread="+encodeURIComponent(id),{signal:controller.signal});
      if(!controller.signal.aborted){setMessages(rows);setThreadError("");}
    }catch{
      if(!controller.signal.aborted)setThreadError("대화를 불러오지 못했어요.");
    }finally{if(threadRead.current===controller)threadRead.current=null;}
  }
  useLayoutEffect(()=>{
    setDraft(validThread?(draftByPeer.current.get(thread)??""):"");
    setMessages([]);setThreadError("");
    if(!validThread||tab!=="chat")return;
    void readThread(thread);
    const tick=()=>{if(!document.hidden&&!lock.current)void readThread(thread);};
    const timer=window.setInterval(tick,4000);
    document.addEventListener("visibilitychange",tick);
    return ()=>{
      window.clearInterval(timer);document.removeEventListener("visibilitychange",tick);
      threadRead.current?.abort();threadRead.current=null;
    };
  },[thread,tab,validThread]);
  const threadMessages=messages;
  const lastMsg=threadMessages.at(-1)?.id;
  const followChat=useRef(true);
  useLayoutEffect(()=>{followChat.current=true;},[thread]);
  useEffect(()=>{
    const log=bottom.current?.parentElement;
    if(log && lastMsg && followChat.current)log.scrollTop=log.scrollHeight;
  },[lastMsg,thread]);
  useEffect(()=>{
    const permitted=new Set(matches.map(person=>person.id));
    for(const map of [draftByPeer.current,pendingMessages.current])
      for(const id of map.keys())if(!permitted.has(id))map.delete(id);
  },[s]);
  useLayoutEffect(()=>{
    currentRoute.current=routeKey;
    if(scrollTarget.current==="answers" && tab==="today")
      document.getElementById("answers")?.scrollIntoView({block:"start"});
    else window.scrollTo(0,scrollPositions.current.get(routeKey)??0);
  },[route]);
  useEffect(()=>{
    const previous=history.scrollRestoration;
    history.scrollRestoration="manual";
    function restore(){
      navigationId.current++;
      scrollPositions.current.set(currentRoute.current,window.scrollY);
      const next=readRoute();
      scrollTarget.current=location.hash==="#answers"?"answers":"restore";
      if(next.tab==="today")setVisitedToday(true);
      setModal(null);setError("");setRoute(next);
    }
    window.addEventListener("popstate",restore);
    return ()=>{history.scrollRestoration=previous;window.removeEventListener("popstate",restore);};
  },[]);
  function navigate(next:Tab,peer="",answers=false,replace=false){
    navigationId.current++;
    const href=routeHref(next,peer,answers);
    scrollPositions.current.set(currentRoute.current,window.scrollY);
    scrollTarget.current=answers?"answers":"restore";
    if(href!==location.pathname+location.search+location.hash){
      if(replace)history.replaceState(history.state,"",href);else history.pushState(null,"",href);
    }
    if(next==="today")setVisitedToday(true);
    setModal(null);setError("");setRoute({tab:next,thread:peer});
  }
  useEffect(()=>{
    if(thread&&!validThread){
      navigate("inbox","",false,true);
      setToast("이 대화방을 열 수 없어요.");
    }
  },[thread,validThread]);
  function open(m:Modal){
    setError("");
    if(m.kind==="answer"){
      if(m.originalBody!==(me?.body||undefined))return;
      setModal({...m,period,questionId:s.question?.id});
      return;
    }
    setModal(m.answer||m.kind==="signal"?{...m,period}:m);
  }
  function close(){if(!lock.current){setModal(null);setError("");}}
  function go(t:Tab){navigate(t);}
  function startChat(p:string){navigate("chat",p);}
  async function act(action:string,b:Record<string,any>,forceLive=false):Promise<Station|null>{
    if(lock.current)return null;
    const origin=navigationId.current;lock.current=true;setBusy(true);setError("");
    try{

      if(action==="delete")await removeAllExchangePhotos();
      serverRevision.current++;const next=await request<Station>("/api/station",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...b})});serverRevision.current++;if(action==="delete"){location.replace("./");return next;}setLive(next);setNet("");
      if(action==="block"||action==="answer"||action==="edit-answer")setHistoryRevision(n=>n+1);
      return next;
    }catch(e){
      if(action==='radar-enable'||action==='radar-disable'){
        if(e instanceof Error && 'code' in e && e.code==='PT412')await refresh();
        throw e;
      }
      if(origin!==navigationId.current)return null;
      if(b.answerDay && e instanceof Error && "code" in e && (e.code==="PT409"||e.code==="42501")){
        setModal(null);setToast("이 답변은 더 이상 볼 수 없어요.");setHistoryRevision(n=>n+1);void refresh();
      }else if(e instanceof Error && "code" in e && e.code==="PT409"){
        setModal(null);setToast("질문 시간이 바뀌었어요. 새 질문을 확인해 주세요.");void refresh();
      }else{
        setError(e instanceof Error?e.message:"다시 시도해 주세요.");
        if(e instanceof Error && "code" in e && e.code==="PT412")await refresh();
      }
      return null;
    }
    finally{lock.current=false;setBusy(false);}
  }
  function signal(p:Person){const v=signalsWith(s,p.id);if(v.match){startChat(p.id);return;}if(v.outgoing){open({kind:"result",peer:p.id});return;}if(!available){setToast("오늘의 신호를 모두 썼어요. 내일 다시 만나요.");return;}open({kind:"signal",peer:p.id});}
  async function openHistoryChat(id:string) {
    if(signalsWith(s,id).match && s.people.some(person=>person.id===id)){startChat(id);return;}
    const origin=navigationId.current;
    const next=await act("state",{});
    if(origin!==navigationId.current)return;
    if(next && signalsWith(next,id).match)startChat(id);
    else {setToast("이 대화방을 열 수 없어요.");setHistoryRevision(n=>n+1);}
  }
  async function enterMember(){
    if(lock.current)return;setBusy(true);lock.current=true;setError("");
    try{const n=await request<Station>("/api/station");setLive(n);setNet("");if(!n.authenticated){setError("회원 채널은 로그인이 필요해요.");return;}
      if(n.me){go("today");}else{location.replace("./");}}
    catch{setError("회원 채널에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");}finally{lock.current=false;setBusy(false);}
  }
  const waiting=incoming.filter(p=>!signalsWith(s,p.id).match);
  const signalCount=waiting.length;
  const shownSignals=inbox==="received"?waiting:sent;
  async function deliver(peerId:string,note:string,answer?:DiscoveryAnswer){
    const origin=navigationId.current;
    const next=await act("signal",{peer:peerId,note,...(answer?{answerDay:answer.day,answerSlot:answer.slot}:{day:s.day,slot:s.slot})});
    if(!next)return;
    setHistoryRevision(n=>n+1);
    if(origin!==navigationId.current)return;
    if(signalsWith(next,peerId).match)startChat(peerId);
    else setModal({kind:"result",peer:peerId});
  }
  async function sendMessage(){
    const submitted=draft,body=submitted.trim(),peerId=thread;
    if(!body||lock.current||!validThread)return;
    let message=pendingMessages.current.get(peerId);
    if(!message||message.body!==body){
      message={body,id:crypto.randomUUID()};pendingMessages.current.set(peerId,message);
    }
    const saved=await act("message",{peer:peerId,...message});
    if(!saved)return;
    pendingMessages.current.delete(peerId);
    if(draftByPeer.current.get(peerId)===submitted){
      draftByPeer.current.delete(peerId);
      if(currentPeer.current===peerId)setDraft("");
    }
    if(currentPeer.current===peerId){followChat.current=true;void readThread(peerId,true);}
  }
  const modalTitle=modal?({answer:answerTitle,signal:"신호 보내기",result:"신호 상태",setup:"회원 프로필 만들기",edit:"프로필 수정",channels:"채널 선택",help:"파장 이용 안내",block:"프로필 차단",delete:"데이터 삭제",person:"상대 프로필",privateProfile:"교환용 프로필",privatePhotos:"교환용 사진"}[modal.kind]):"";
  return <div className="station-layout">
    <StationNavigation tab={tab} onGo={go} pending={signalCount}/>
    <main className="wrap station-content" id="station-content">
    {(net||threadError)&&<div className="notice" role="status">{net||threadError}<button onClick={()=>{void refresh();if(thread)void readThread(thread);}}>다시 연결</button></div>}
    {tab==="radar"&&<><button className="return-today" onClick={()=>go("today")}><I n="back" s={15}/>오늘</button><NearbyRadar station={s} sample={false} onProfile={id=>open({kind:"person",peer:id})} onJoin={()=>location.assign("./")} onSettings={async (cell,accountId)=>Boolean(await act(cell?"radar-enable":"radar-disable",cell?{...cell,consent:true,shareBearing:true,accountId,locationVersion:s.locationVersion}:{accountId,locationVersion:s.locationVersion},true))}/></>}
    {visitedToday&&<div className="today-page" hidden={tab!=="today"}>
      <section className="letter-hero" aria-label={slotName+" 질문"}>
        <div className="letter-copy">
          <div className="letter-date">오늘의 질문 <time dateTime={s.day}>{s.day.replaceAll("-",".")} · {slotName}</time></div>
          <h1>{themeText}</h1>
          <button className={me?.body?"secondary":"primary"} disabled={!ready} onClick={()=>open(me?{kind:"answer",originalBody:me.body||undefined}:{kind:"setup"})}>
            <I n="pencil" s={16}/>{me?.body?"내 답변 수정하기":"내 답변 쓰기"}
          </button>
        </div>
      </section>
      <button className="mobile-near" onClick={()=>go("radar")}><I n="radar" s={16}/>내 주변<I n="right" s={14}/></button>
      <div className="today-columns">
      <AnswerHistory active={tab==="today"} station={s} revision={historyRevision}
        onProfile={answer=>answer.own?go("profile"):open({kind:"person",peer:answer.peer,answer})}
        onSignal={answer=>open({kind:"signal",peer:answer.peer,answer})}
        onChat={id=>void openHistoryChat(id)}
        onWrite={()=>open({kind:"answer"})}/>
        <aside className="today-rail">
          <section className="rail-paper"><div className="rail-title"><h2>마음함</h2><I n="heart" s={23}/></div>
            <p>{waiting.length?waiting[0].name+"님이 신호를 보냈어요.":matches.length?"이야기를 이어 갈 대화가 있어요.":"받은 신호와 대화를 모아 봐요."}</p>
            <button onClick={()=>go("inbox")}>마음함 열기<I n="arrow" s={16}/></button>
          </section>
          <button className="rail-near" onClick={()=>go("radar")}><strong>내 주변</strong><span>가까운 곳에서 남긴 답변</span><b>레이더 보기<I n="arrow" s={16}/></b><i aria-hidden="true"/></button>
        </aside>
      </div></div>}
    {tab==="inbox"&&<section className="innerpage inbox-page">
      <div className="channel-heading"><h1>마음함</h1></div>
      <div className="seg">{(["received","sent"] as const).map(key=><button key={key} aria-pressed={inbox===key} className={inbox===key?"on":""} onClick={()=>setInbox(key)}>{key==="received"?"받은 신호 "+waiting.length:"보낸 신호 "+sent.length}</button>)}</div>
      {shownSignals.length?<div className="listbox">{shownSignals.map(p=><ListPerson key={p.id} p={p} station={s} busy={busy} onProfile={()=>open({kind:"person",peer:p.id})} onAction={()=>inbox==="received"?void deliver(p.id,""):signal(p)} type={inbox==="received"?"received":"sent"}/>)}</div>:
        <Blank icon="letter" title={inbox==="received"?"아직 받은 신호가 없어요":"아직 보낸 신호가 없어요"} body="" button="답변 둘러보기" onClick={()=>navigate("today","",true)}/>}
      {inbox==="received"&&waiting.length>0&&<small className="accept-note">수락할 때 신호 1회를 사용해요. 오늘 남은 신호 {available}회</small>}
      {error&&!modal&&<p className="error" role="alert">{error}</p>}
      <h2 className="inbox-chats">이어지는 대화</h2>
      {matches.length?<div className="listbox">{matches.map(p=><ListPerson key={p.id} p={p} station={s} busy={busy} onProfile={()=>open({kind:"person",peer:p.id})} onAction={()=>startChat(p.id)} type="chat"/>)}</div>:<Blank icon="chat" title="아직 열린 대화가 없어요" body="서로 신호를 보내면 여기서 대화를 이어 갈 수 있어요."/>}
    </section>}
    {tab==="chat"&&active&&validThread&&<section className="innerpage" key={thread}><div className="chatbox"><div className="chatheader"><button className="iconbtn" aria-label="대화 목록" onClick={()=>go("inbox")}><I n="back"/></button><button className="person" onClick={()=>open({kind:"person",peer:active.id})}><Art interest={active.interest}/><span><strong>{active.name}</strong><small>서로 신호를 보낸 회원</small></span></button><button className="quiet" onClick={()=>open({kind:"block",peer:active.id})}>차단</button></div><ChatExchange key={active.id} peer={active.id} name={active.name} lastMessage={lastMsg}/><div className="chatlog" onScroll={event=>{const log=event.currentTarget;followChat.current=log.scrollHeight-log.scrollTop-log.clientHeight<64;}}>{threadMessages.length===0?<div className="chatintro"><I n="wave" s={32}/><p>두 사람의 대화가 열렸어요.</p><small>오늘의 답변을 떠올리며 첫인사를 건네보세요.</small></div>:<>{threadMessages.length>=100&&<p className="chatnote">최근 메시지 100개</p>}{threadMessages.map(m=><div key={m.id} className={"bubbleline "+(m.src===me?.id?"mine":"")}><p>{m.body}</p><time>{fmtClock(m.at)}</time></div>)}</>}<div ref={bottom}/></div>{error&&!modal&&<p className="error">{error}</p>}<form className="composer" onSubmit={e=>{e.preventDefault();void sendMessage();}}><input maxLength={500} aria-label="메시지" placeholder="메시지를 입력하세요" value={draft} onChange={e=>{setDraft(e.target.value);draftByPeer.current.set(thread,e.target.value);}}/><button aria-label="메시지 보내기" disabled={busy||!draft.trim()}><I n="send" s={18}/></button></form></div></section>}
    {tab==="profile"&&<section className="station-account innerpage">
      <div className="channel-heading"><div className="pagetitle"><I n="user" s={27}/><h1>내 파장</h1></div></div>
      {me?<><section className="account-summary"><Art interest={me.interest} large/><div><h2>{me.name}</h2><p>{introDetails(me)}</p></div><button className="secondary small" onClick={()=>open({kind:"edit"})}>공개 소개 수정</button></section>
        <section className="account-section"><h2>프로필과 사진 교환</h2><p>대화방에서 각자 메시지를 5개 이상 보낸 뒤, 둘 다 동의한 항목을 교환해요.</p>
          <div className="settings"><button onClick={()=>open({kind:"privateProfile"})}>교환용 프로필 작성<I n="right" s={17}/></button>
          <button onClick={()=>open({kind:"privatePhotos"})}>교환용 사진 관리<I n="right" s={17}/></button></div></section>
        <MyAnswers key={me.id+period} answered={Boolean(me.body)} onWrite={()=>open({kind:"answer"})}/>
        <section className="account-section"><h2>공개 설정</h2><AnswerGenderVisibility key={me.id} onSaved={()=>setHistoryRevision(n=>n+1)}/></section>
        <div className="account-tools"><button className="quiet" onClick={()=>open({kind:"help"})}>이용 안내</button><button className="quiet" onClick={()=>open({kind:"delete"})}>파장 기록 삭제</button></div></>:
        <Blank icon="user" title="파장에 참여해 주세요" body="오쭈다 회원 정보로 시작할 수 있어요." button="참여하기" onClick={()=>void enterMember()}/>}</section>}
    </main>{toast&&<div role="status" className="toast">{toast}</div>}
  {modal&&<Dialog key={modal.kind} close={close} title={modalTitle}>
    {modal.kind==="answer"&&<><span className="modalicon"><I n="pencil"/></span><h2>{answerTitle}</h2><p className="questionbox">{themeText}</p>
      <p className="sub">{editingAnswer?"저장하면 모두의 답변에도 수정한 내용이 보여요.":"답변을 공개하면 작성일을 포함해 30일 동안 파장 회원이 질문과 내 답변을 함께 볼 수 있어요."}</p>
      <Editor initial={modal.originalBody} max={220} label="내 이야기" hint="장소, 노래, 기억처럼 구체적인 장면을 들려주세요."
        submit={editingAnswer?"수정 저장하기":"답변 공개하기"} busy={busy} onSave={async body=>{
          const data={body,day:s.day,slot:s.slot,questionId:modal.questionId};
          const next=editingAnswer?await act("edit-answer",{...data,previousBody:modal.originalBody}):await act("answer",{...data,archive:true});
          if(!next)return;
          setModal(null);setToast(slotName+(editingAnswer?" 답변을 수정했어요.":" 답변을 저장했어요."));
        }}/>
    </>}
    {modal.kind==="signal"&&peer&&<><span className="modalicon"><I n="signal"/></span><h2>{peer.name}님{row?.received || signalsWith(s,peer.id).incoming?"의 신호 수락":"에게 신호 보내기"}</h2><p className="sub">서로 신호를 보내면 대화를 시작할 수 있어요.</p><div className="questionbox">{row&&<small>{row.question}</small>}{peer.body||signalsWith(s,peer.id).incoming?.note}</div><Editor max={120} label="함께 보낼 한마디 (선택)" hint="어떤 부분에 마음이 닿았나요?" submit={(row?.received || signalsWith(s,peer.id).incoming?"신호 수락하기":"신호 보내기")+" · 남은 "+available+"회"} busy={busy} optional onSave={note=>void deliver(peer.id,note,row)}/></>}
    {modal.kind==="result"&&peer&&<div className="result"><span className="resultart"><Art interest={peer.interest} large/><i><I n={signalsWith(s,peer.id).match?"wave":"signal"}/></i></span><h2>{signalsWith(s,peer.id).match?"서로의 신호가 닿았어요":"신호를 보냈어요"}</h2><p className="sub">{signalsWith(s,peer.id).match?peer.name+"님도 당신에게 신호를 보냈어요. 이제 첫인사를 건네보세요.":peer.name+"님도 신호를 보내면 대화방이 열려요."}</p><button className="primary wide" onClick={()=>signalsWith(s,peer.id).match?startChat(peer.id):(setInbox("sent"),go("inbox"))}>{signalsWith(s,peer.id).match?"대화 시작하기":"보낸 신호 보기"}<I n="arrow" s={17}/></button></div>}
    {modal.kind==="person"&&peer&&<><Art interest={peer.interest} large/><h2>{peer.name}</h2><p className="sub">{introDetails(peer)}</p>{peer.body&&<div className="questionbox"><small>{row?.question||themeText}</small>{peer.body}</div>}<button className="primary wide" onClick={()=>{
        if(!row)return signal(peer);
        if((row.sent&&row.received)||signalsWith(s,row.peer).match)return void openHistoryChat(row.peer);
        if(row.sent||signalsWith(s,row.peer).outgoing){setInbox("sent");go("inbox");return;}
        open({kind:"signal",peer:row.peer,answer:row});
      }}>{(row?.sent&&row?.received)||signalsWith(s,peer.id).match?"대화 열기":row?.sent||signalsWith(s,peer.id).outgoing?"보낸 신호 확인":row?.received||signalsWith(s,peer.id).incoming?"신호 수락하기":"신호 보내기"}<I n="signal" s={17}/></button><button className="textbtn" onClick={()=>open({kind:"block",peer:peer.id,answer:row})}>이 프로필 차단</button></>}
    {modal.kind==="privateProfile"&&<ExchangeProfileEditor onSaved={()=>{close();setToast("교환용 프로필을 저장했어요.");}}/>}
    {modal.kind==="privatePhotos"&&<><h2>교환용 사진</h2><p className="sub">사진은 최대 10장까지 선택해 등록할 수 있어요. 사진을 교환한 상대에게는 나중에 추가한 사진도 보여요. 대화방에서 언제든 공유를 끝낼 수 있어요.</p><MyExchangePhotos/></>}
    {(modal.kind==="edit"||modal.kind==="setup")&&<><h2>{modal.kind==="setup"?"회원 프로필 만들기":"프로필 수정"}</h2><p className="sub">{modal.kind==="setup"?"얼굴 사진 없이 닉네임과 취향으로 시작해요.":"내 프로필에 보여줄 정보를 정해 주세요."}</p><ProfileForm person={modal.kind==="setup"?null:me} isNew={modal.kind==="setup"} busy={busy} onSave={async b=>{const setup=modal.kind==="setup";if(await act(setup?"participate":"profile",b,setup)){go("profile");setToast("프로필을 저장했어요.");}}}/></>}
    {modal.kind==="block"&&peer&&<><span className="modalicon"><I n="shield"/></span><h2>{peer.name}님을 차단할까요?</h2><p className="sub">서로의 답변과 신호, 대화가 목록에서 사라져요. 이후 메시지도 보낼 수 없어요.</p><button className="primary wide" disabled={busy} onClick={async()=>{if(await act("block",{peer:peer.id})){go("today");setToast("프로필을 차단했어요.");}}}>차단하기</button><button className="textbtn" onClick={close}>취소</button></>}
    {modal.kind==="delete"&&<><h2>프로필과 기록을 삭제할까요?</h2><p className="sub">회원 프로필과 작성한 답변, 주고받은 신호와 대화가 삭제돼요. 삭제한 내용은 복구할 수 없어요.</p><button className="primary wide" disabled={busy} onClick={async()=>{if(await act("delete",{})){location.replace("./");}}}>내 기록 삭제</button><button className="textbtn" onClick={close}>취소</button></>}
    {modal.kind==="help"&&<><span className="modalicon"><I n="headphones"/></span><h2>파장 이용 안내</h2><div className="guidelist">{[["오전과 오후에 한 번씩 답해요","한국 시간 자정과 낮 12시에 새 질문이 열려요. 한 번 답하면 다음 질문이 열릴 때까지 바로 메인으로 들어가요."],["답변에 신호를 보내요","모두의 답변에서 최근 30일의 질문과 답을 함께 읽어 보세요. 내 답을 쓰기 전에도 마음에 드는 사람에게 하루 세 번까지 신호를 보낼 수 있어요."],["서로 닿으면 대화해요","받은 신호를 수락하면 두 사람의 대화방이 열려요. 상대 프로필에서 언제든 차단할 수 있어요."],["프로필과 사진을 교환해요","이 대화방에서 각자 메시지를 5개 이상 보낸 뒤 프로필이나 사진 교환을 신청할 수 있어요. 상대가 수락하면 서로 볼 수 있어요."]].map(([a,b],i)=><div key={a}><b>{i+1}</b><div><strong>{a}</strong><p>{b}</p></div></div>)}</div><button className="primary wide" onClick={close}>알겠어요</button></>}
    {error&&<p role="alert" className="error">{error}</p>}
  </Dialog>}</div>;
}
