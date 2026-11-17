"use client";
import {useEffect,useRef,useState} from "react";
import {themeFor,interests,badges,introDetails,signalsWith,type Person,type Message,type Station} from "../lib/station";
import regionCatalog from "../../regions.json";

import {I} from "./icons";
import NearbyRadar from "./nearby-radar";
import AnswerHistory, {type DiscoveryAnswer} from "./answer-history";

import {ChatExchange} from "./chat-exchange";
import {ExchangeProfileEditor} from "./exchange-profile";
import {MyExchangePhotos,removeAllExchangePhotos} from "./exchange-photos";

type Tab = "discover"|"inbox"|"chat";
type Modal = {kind:"answer"|"signal"|"result"|"profile"|"setup"|"edit"|"channels"|"help"|"block"|"delete"|"person"|"privateProfile"|"privatePhotos";peer?:string;period?:string;answer?:DiscoveryAnswer};
const districts:Record<string,string[]> = regionCatalog;
const provinces=Object.keys(districts);
const navs = [{id:"discover",title:"발견",icon:"discover"},{id:"inbox",title:"신호함",icon:"signal"},{id:"chat",title:"대화",icon:"chat"}] as const;
const fmtClock=(at:number)=>new Intl.DateTimeFormat("ko-KR",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Seoul"}).format(new Date(at));
const getArt=(key:string)=>window.pajangArt[badges(key).key];
async function request<T,>(url:string,init?:RequestInit):Promise<T>{
  const params=init?.body?JSON.parse(String(init.body)):{};
  const peer=new URL(url,location.origin).searchParams.get("thread");
  const action=peer?"thread":params.action||"state";
  const {data,error}=await (await window.OjjudaGetClient()).rpc("pajang_member",{p_action:action,p_data:peer?{peer}:params});
  if(error)throw Object.assign(new Error(error.message),{code:error.code});
  return data as T;
}
function Art({interest,large=false}:{interest:string;large?:boolean}){return <span className={"avatar"+(large?" large":"")} style={{background:badges(interest).bg}}>{interest?<img src={getArt(interest)} alt=""/>:<I n="user" s={large?26:18}/> }</span>;}
function Brand(){return <span className="brand"><span className="brandmark"><I n="wave" s={24}/></span><b>파장</b><span className="wordmark">PAJANG</span></span>;}
function Blank({icon,title,body,button,onClick}:{icon:string;title:string;body:string;button?:string;onClick?:()=>void}){return <div className="empty"><span className="emptyicon"><I n={icon} s={27}/></span><h3>{title}</h3><p>{body}</p>{button&&<button className="secondary" onClick={onClick}>{button}<I n="arrow" s={16}/></button>}</div>;}
function Dialog({children,close,title}:{children:React.ReactNode;close:()=>void;title:string}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=ref.current;if(node&&!node.open)node.showModal();const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{node?.close();document.body.style.overflow=overflow;};},[]);
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===ref.current){const b=ref.current.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close();}}}>
    <button className="closebutton iconbtn" aria-label="닫기" onClick={close}><I n="close"/></button>{children}</dialog>;
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
function Meter(){return <div className="meter" aria-hidden="true"><b>FM</b><div className="ruler"><i/><div className="numbers">{["88","92","96","100","104","108"].map(x=><span key={x}>{x}</span>)}</div><strong/></div><b>MHz</b></div>;}

export default function StationApp({initialView,initialStation}:{initialView:"cards"|"radar";initialStation:Station}){
  const [live,setLive]=useState<Station>(initialStation);
  const [discovery,setDiscovery]=useState<"cards"|"radar">(initialView);
  const [tab,setTab]=useState<Tab>("discover"),[pendingModal,setModal]=useState<Modal|null>(null),[inbox,setInbox]=useState("received");
  const [thread,setThread]=useState(""),[messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[toast,setToast]=useState(""),[net,setNet]=useState(""),[ready,setReady]=useState(false);
  const [historyRevision,setHistoryRevision]=useState(0);
  const lock=useRef(false),serverRevision=useRef(0),threadRevision=useRef(0),bottom=useRef<HTMLDivElement>(null);
  const s=live,me=s.me,theme=s.question??themeFor(s.day,s.slot),period=s.day+"/"+s.slot;
  const slotName=s.slot==="am"?"오전":"오후";
  const nextQuestion=s.slot==="am"?"오늘 낮 12시":"내일 0시";
  const modal=(pendingModal?.period && pendingModal.period!==period) || (pendingModal?.kind==="answer" && me?.body) ? null : pendingModal;
  const row=modal?.answer;
  const peer=row?{...row,id:row.peer}:s.people.find(p=>p.id===modal?.peer);
  const active=s.people.find(p=>p.id===thread);
  const incoming=s.people.filter(p=>signalsWith(s,p.id).incoming),sent=s.people.filter(p=>signalsWith(s,p.id).outgoing),matches=s.people.filter(p=>signalsWith(s,p.id).match);
  const available=s.remaining;
  const themeText=theme.q.join(" "),date=new Date(s.day+"T12:00:00+09:00");
  async function refresh(){
    const rev=++serverRevision.current;
    try{const next=await request<Station>("/api/station");if(serverRevision.current===rev){setLive(next);setNet("");}}
    catch{if(serverRevision.current===rev)setNet("회원 채널을 불러오지 못했어요.");}
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
  async function readThread(id:string){
    const rev=++threadRevision.current;
    try{const m=await request<Message[]>("/api/station?thread="+encodeURIComponent(id));if(rev===threadRevision.current){setMessages(m);setNet("");}}catch{if(rev===threadRevision.current)setNet("대화를 불러오지 못했어요.");}
  }
  useEffect(()=>{setDraft("");setMessages([]);if(!thread||tab!=="chat")return;void readThread(thread);const t=setInterval(()=>{if(!document.hidden&&!lock.current)void readThread(thread);},4000);return()=>{clearInterval(t);threadRevision.current++;};},[thread,tab]);
  const threadMessages=messages;
  const lastMsg=threadMessages.at(-1)?.id;
  useEffect(()=>{if(tab==="chat"&&thread)bottom.current?.scrollIntoView({block:"nearest"});},[lastMsg,thread,tab]);
  useEffect(()=>{
    function fromUrl(){setDiscovery(new URLSearchParams(window.location.search).get("view")==="radar"?"radar":"cards");}
    fromUrl(); window.addEventListener("popstate",fromUrl); return()=>window.removeEventListener("popstate",fromUrl);
  },[]);
  function chooseDiscovery(view:"cards"|"radar") {
    setDiscovery(view); const url=new URL(window.location.href);
    if(view==="radar")url.searchParams.set("view","radar");else url.searchParams.delete("view");
    window.history.replaceState(window.history.state,"",url);
  }
  useEffect(()=>{
    const url = new URL(window.location.href);
    const chat = url.searchParams.get("chat");
    if (!chat) return;
    if (initialStation.people.some(person=>person.id===chat) && signalsWith(initialStation,chat).match) {
      setThread(chat); setTab("chat");
    } else {
      setToast("이 대화방을 열 수 없어요.");
    }
    url.searchParams.delete("chat");
    window.history.replaceState(window.history.state,"",url);
  },[initialStation]);
  function open(m:Modal){
    setError("");
    if(m.kind==="answer" && me?.body)return;
    setModal(m.answer||m.kind==="answer"||m.kind==="signal"?{...m,period}:m);
  }
  function close(){if(!lock.current){setModal(null);setError("");}}
  function go(t:Tab){setTab(t);setThread("");close();window.scrollTo({top:0});}
  function startChat(p:string){setModal(null);setError("");setThread(p);setTab("chat");window.scrollTo({top:0});}
  async function act(action:string,b:Record<string,any>,forceLive=false):Promise<Station|null>{
    if(lock.current)return null;lock.current=true;setBusy(true);setError("");
    try{

      if(action==="delete")await removeAllExchangePhotos();
      serverRevision.current++;const next=await request<Station>("/api/station",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...b})});serverRevision.current++;if(action==="delete"){location.replace("./");return next;}setLive(next);setNet("");
      if(action==="block"||action==="answer")setHistoryRevision(n=>n+1);
      return next;
    }catch(e){
      if(b.answerDay && e instanceof Error && "code" in e && (e.code==="PT409"||e.code==="42501")){
        setModal(null);setToast("이 답변은 더 이상 볼 수 없어요.");setHistoryRevision(n=>n+1);void refresh();
      }else if(e instanceof Error && "code" in e && e.code==="PT409"){
        setModal(null);setToast("질문 시간이 바뀌었어요. 새 질문을 확인해 주세요.");void refresh();
      }else setError(e instanceof Error?e.message:"다시 시도해 주세요.");
      return null;
    }
    finally{lock.current=false;setBusy(false);}
  }
  function signal(p:Person){const v=signalsWith(s,p.id);if(v.match){startChat(p.id);return;}if(v.outgoing){open({kind:"result",peer:p.id});return;}if(!available){setToast("오늘의 신호를 모두 썼어요. 내일 다시 만나요.");return;}open({kind:"signal",peer:p.id});}
  async function openHistoryChat(id:string) {
    if(signalsWith(s,id).match && s.people.some(person=>person.id===id)){startChat(id);return;}
    const next=await act("state",{});
    if(next && signalsWith(next,id).match)startChat(id);
    else {setToast("이 대화방을 열 수 없어요.");setHistoryRevision(n=>n+1);}
  }
  async function enterMember(){
    if(lock.current)return;setBusy(true);lock.current=true;setError("");
    try{const n=await request<Station>("/api/station");setLive(n);setNet("");if(!n.authenticated){setError("회원 채널은 로그인이 필요해요.");return;}
      if(n.me){go("discover");}else{location.replace("./");}}
    catch{setError("회원 채널에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");}finally{lock.current=false;setBusy(false);}
  }
  const signalCount=incoming.filter(p=>!signalsWith(s,p.id).match).length;
  function nav(){return navs.map(n=><button key={n.id} className={"navitem "+(tab===n.id?"active":"")} aria-current={tab===n.id?"page":undefined} onClick={()=>go(n.id)}><I n={n.icon} s={18}/>{n.title}{n.id==="inbox"&&signalCount>0&&<span className="navdot" aria-label="받은 신호 있음"/>}</button>);}
  function ListPerson({p,type}:{p:Person;type:"received"|"sent"|"chat"}){
    const v=signalsWith(s,p.id);const sig=type==="received"?v.incoming:v.outgoing;
    return <div className="listperson"><button className="person" onClick={()=>open({kind:"person",peer:p.id})}><Art interest={p.interest}/><span><strong>{p.name}</strong><small>{introDetails(p)}</small></span></button><p>{type==="chat"?"서로의 신호가 닿았어요.":sig?.note||(v.match?"서로의 신호가 닿았어요.":type==="received"?"신호를 보내왔어요.":"상대의 신호를 기다리고 있어요.")}</p><button className="secondary small" onClick={()=>signal(p)}>{v.match?"대화 열기":type==="sent"?"상태 보기":"신호 수락하기"}<I n="right" s={15}/></button></div>;
  }
  const modalTitle=modal?({answer:slotName+" 답변",signal:"신호 보내기",result:"신호 상태",profile:"내 프로필",setup:"회원 프로필 만들기",edit:"프로필 수정",channels:"채널 선택",help:"파장 이용 안내",block:"프로필 차단",delete:"데이터 삭제",person:"상대 프로필",privateProfile:"교환용 프로필",privatePhotos:"교환용 사진"}[modal.kind]):"";
  return <><header className="sitehead"><div className="headinner"><button className="brandbtn" onClick={()=>go("discover")} aria-label="파장 홈"><Brand/></button><nav className="desknav" aria-label="주 메뉴">{nav()}</nav><div className="headtools"><span className="modebtn"><span className="modedot"/>회원 채널</span><button className="profilebtn" aria-label="내 프로필" onClick={()=>open({kind:"profile"})}><I n="user" s={19}/></button></div></div></header>
  <main className="wrap">
    {net&&<div className="notice" role="status">{net}<button onClick={()=>{void refresh();if(thread)void readThread(thread);}}>다시 연결</button></div>}
    {tab==="discover"&&<div className="discover-switch" aria-label="발견 보기 방식"><button aria-pressed={discovery==="cards"} onClick={()=>chooseDiscovery("cards")}><I n="discover" s={16}/>이번 질문</button><button aria-pressed={discovery==="radar"} onClick={()=>chooseDiscovery("radar")}><I n="signal" s={16}/>주변 레이더</button></div>}
    {tab==="discover"&&discovery==="radar"&&<NearbyRadar station={s} sample={false} onProfile={id=>open({kind:"person",peer:id})} onJoin={()=>location.assign("./")} onSettings={async cell=>Boolean(await act(cell?"radar-enable":"radar-disable",cell?{...cell,consent:true,shareBearing:true}:{},true))}/>}
    {tab==="discover"&&discovery==="cards"&&<>
      <section className="hero" aria-label={slotName+(me?.body?" 답변 완료":" 질문")}>
        <div className="heroart" aria-hidden="true"><img src={window.pajangArt.radio} alt="" fetchPriority="high"/></div>
        <div className="herocopy">
          <div className="onrow"><span className="onair"><i/>ON AIR</span><span className="questionlabel">{slotName} {me?.body?"답변 완료":"질문"}</span></div>
          {me?.body?<><h1>{slotName} 답변을 남겼어요.</h1><p>다음 질문은 {nextQuestion}에 열려요.</p>
            <button className="herobtn" onClick={()=>open({kind:"profile"})}><I n="user" s={16}/>내 프로필 보기<I n="arrow" s={16}/></button></>:
            <><h1>{theme.q.map(line=><span key={line}>{line}</span>)}</h1><p>이 시간대의 질문에는 한 번 답할 수 있어요.</p>
            <button className="herobtn" disabled={!ready} onClick={()=>open({kind:me?"answer":"setup"})}><I n="pencil" s={16}/>내 답변 쓰기<I n="arrow" s={16}/></button></>}
        </div>
        <div className="herofoot"><div className="edition"><i/>{s.day.replaceAll("-",".")}<b> / </b>{new Intl.DateTimeFormat("en",{weekday:"short",timeZone:"Asia/Seoul"}).format(date).toUpperCase()}</div><Meter/></div>
      </section>
      <AnswerHistory station={s} revision={historyRevision}
        onProfile={answer=>open(answer.own?{kind:"profile"}:{kind:"person",peer:answer.peer,answer})}
        onSignal={answer=>open({kind:"signal",peer:answer.peer,answer})}
        onChat={id=>void openHistoryChat(id)}
        onWrite={()=>open({kind:"answer"})}/></>}
    {tab==="inbox"&&<section className="innerpage"><div className="pagetitle"><I n="signal" s={28}/><h1>신호함</h1></div><p className="sub">서로 신호를 보내면 둘만의 대화가 열려요.</p><div className="seg"><button className={inbox==="received"?"on":""} onClick={()=>setInbox("received")}>받은 신호 {incoming.length}</button><button className={inbox==="sent"?"on":""} onClick={()=>setInbox("sent")}>보낸 신호 {sent.length}</button></div>{(inbox==="received"?incoming:sent).length?<div className="listbox">{(inbox==="received"?incoming:sent).map(p=><ListPerson key={p.id} p={p} type={inbox==="received"?"received":"sent"}/>)}</div>:<Blank icon="signal" title={inbox==="received"?"아직 받은 신호가 없어요":"아직 보낸 신호가 없어요"} body="오늘의 답변으로 취향이 닿는 사람을 찾아보세요." button="답변 둘러보기" onClick={()=>go("discover")}/>}</section>}
    {tab==="chat"&&<section className="innerpage">{(!active||!thread||!signalsWith(s,thread).match)?<><div className="pagetitle"><I n="chat" s={28}/><h1>대화</h1></div><p className="sub">서로의 신호가 닿은 사람과 이야기를 이어가세요.</p>{matches.length?<div className="listbox">{matches.map(p=><ListPerson key={p.id} p={p} type="chat"/>)}</div>:<Blank icon="chat" title="첫 대화를 기다리고 있어요" body="받은 신호에 답장을 보내면 대화를 시작할 수 있어요." button="신호함 보기" onClick={()=>go("inbox")}/>}</>:<div className="chatbox"><div className="chatheader"><button className="iconbtn" aria-label="대화 목록" onClick={()=>setThread("")}><I n="back"/></button><button className="person" onClick={()=>open({kind:"person",peer:active.id})}><Art interest={active.interest}/><span><strong>{active.name}</strong><small>서로 신호를 보낸 회원</small></span></button><button className="quiet" onClick={()=>open({kind:"block",peer:active.id})}>차단</button></div><ChatExchange key={active.id} peer={active.id} name={active.name} lastMessage={lastMsg}/><div className="chatlog">{threadMessages.length===0?<div className="chatintro"><I n="wave" s={32}/><p>두 사람의 대화가 열렸어요.</p><small>오늘의 답변을 떠올리며 첫인사를 건네보세요.</small></div>:<>{threadMessages.length>=100&&<p className="chatnote">최근 메시지 100개</p>}{threadMessages.map(m=><div key={m.id} className={"bubbleline "+(m.src===me?.id?"mine":"")}><p>{m.body}</p><time>{fmtClock(m.at)}</time></div>)}</>}<div ref={bottom}/></div>{error&&!modal&&<p className="error">{error}</p>}<form className="composer" onSubmit={async e=>{e.preventDefault();if(!draft.trim())return;const ok=await act("message",{peer:thread,body:draft.trim(),id:crypto.randomUUID()});if(ok){setDraft("");void readThread(thread);}}}><input maxLength={500} aria-label="메시지" placeholder="메시지를 입력하세요" value={draft} onChange={e=>setDraft(e.target.value)}/><button aria-label="메시지 보내기" disabled={busy||!draft.trim()}><I n="send" s={18}/></button></form></div>}</section>}
    <footer><a href="/world.html" className="memberlink">아지트로</a><span className="footerbrand"><I n="wave" s={16}/> 파장</span><span>회원 채널 · 만 19세 이상</span><button onClick={()=>open({kind:"help"})}>이용 안내<I n="info" s={14}/></button></footer>
  </main><nav className="mobilenav" aria-label="모바일 주 메뉴">{nav()}</nav>{toast&&<div role="status" className="toast">{toast}</div>}
  {modal&&<Dialog key={modal.kind} close={close} title={modalTitle}>
    {modal.kind==="answer"&&<><span className="modalicon"><I n="pencil"/></span><h2>{slotName} 답변</h2><p className="questionbox">{themeText}</p><p className="sub">답변을 공개하면 작성일을 포함해 30일 동안 파장 회원이 질문과 내 답변을 함께 볼 수 있어요.</p><Editor max={220} label="내 이야기" hint="장소, 노래, 기억처럼 구체적인 장면을 들려주세요." submit="답변 공개하기" busy={busy} onSave={async body=>{if(!await act("answer",{body,day:s.day,slot:s.slot,questionId:s.question?.id,archive:true}))return;setModal(null);setToast(slotName+" 답변을 저장했어요.");}}/></>}
    {modal.kind==="signal"&&peer&&<><span className="modalicon"><I n="signal"/></span><h2>{peer.name}님{row?.received || signalsWith(s,peer.id).incoming?"의 신호 수락":"에게 신호 보내기"}</h2><p className="sub">서로 신호를 보내면 대화를 시작할 수 있어요.</p><div className="questionbox">{row&&<small>{row.question}</small>}{peer.body||signalsWith(s,peer.id).incoming?.note}</div><Editor max={120} label="함께 보낼 한마디 (선택)" hint="어떤 부분에 마음이 닿았나요?" submit={(row?.received || signalsWith(s,peer.id).incoming?"신호 수락하기":"신호 보내기")+" · 남은 "+available+"회"} busy={busy} optional onSave={async note=>{if(await act("signal",{peer:peer.id,note,...(row?{answerDay:row.day,answerSlot:row.slot}:{day:s.day,slot:s.slot})}))setModal({kind:"result",peer:peer.id});}}/></>}
    {modal.kind==="result"&&peer&&<div className="result"><span className="resultart"><Art interest={peer.interest} large/><i><I n={signalsWith(s,peer.id).match?"wave":"signal"}/></i></span><h2>{signalsWith(s,peer.id).match?"서로의 신호가 닿았어요":"신호를 보냈어요"}</h2><p className="sub">{signalsWith(s,peer.id).match?peer.name+"님도 당신에게 신호를 보냈어요. 이제 첫인사를 건네보세요.":peer.name+"님도 신호를 보내면 대화방이 열려요."}</p><button className="primary wide" onClick={()=>signalsWith(s,peer.id).match?startChat(peer.id):(setInbox("sent"),go("inbox"))}>{signalsWith(s,peer.id).match?"대화 시작하기":"보낸 신호 보기"}<I n="arrow" s={17}/></button></div>}
    {modal.kind==="person"&&peer&&<><Art interest={peer.interest} large/><h2>{peer.name}</h2><p className="sub">{introDetails(peer)}</p>{peer.body&&<div className="questionbox"><small>{row?.question||themeText}</small>{peer.body}</div>}<button className="primary wide" onClick={()=>{
        if(!row)return signal(peer);
        if((row.sent&&row.received)||signalsWith(s,row.peer).match)return void openHistoryChat(row.peer);
        if(row.sent||signalsWith(s,row.peer).outgoing){setInbox("sent");go("inbox");return;}
        open({kind:"signal",peer:row.peer,answer:row});
      }}>{(row?.sent&&row?.received)||signalsWith(s,peer.id).match?"대화 열기":row?.sent||signalsWith(s,peer.id).outgoing?"보낸 신호 확인":row?.received||signalsWith(s,peer.id).incoming?"신호 수락하기":"신호 보내기"}<I n="signal" s={17}/></button><button className="textbtn" onClick={()=>open({kind:"block",peer:peer.id,answer:row})}>이 프로필 차단</button></>}
    {modal.kind==="profile"&&<><span className="eyebrow">회원 채널</span>{me?<><div className="profhero"><Art interest={me.interest} large/><div><h2>{me.name}</h2><p className="sub">{introDetails(me)}</p></div></div><div className="profileanswer"><b>내 {slotName} 답변</b><p>{me.body||"아직 이 시간대에 남긴 답변이 없어요."}</p></div><div className="settings"><button onClick={()=>open({kind:"privateProfile"})}>교환용 프로필 작성<I n="right" s={17}/></button><button onClick={()=>open({kind:"privatePhotos"})}>교환용 사진 관리<I n="right" s={17}/></button><button onClick={()=>open({kind:"edit"})}>공개 소개 수정<I n="right" s={17}/></button>{!me.body&&<button onClick={()=>open({kind:"answer"})}>{slotName} 답변 작성<I n="right" s={17}/></button>}</div><button className="textbtn muted" onClick={()=>open({kind:"delete"})}>회원 프로필과 기록 삭제</button></>:<><h2>내 프로필</h2><p className="sub">회원 채널에 참여할 프로필을 만들어 주세요.</p><button className="primary wide" onClick={()=>void enterMember()}>프로필 만들기</button></>}</>}
    {modal.kind==="privateProfile"&&<ExchangeProfileEditor onSaved={()=>{open({kind:"profile"});setToast("교환용 프로필을 저장했어요.");}}/>}
    {modal.kind==="privatePhotos"&&<><h2>교환용 사진</h2><p className="sub">사진은 최대 10장까지 선택해 등록할 수 있어요. 사진을 교환한 상대에게는 나중에 추가한 사진도 보여요. 대화방에서 언제든 공유를 끝낼 수 있어요.</p><MyExchangePhotos/></>}
    {(modal.kind==="edit"||modal.kind==="setup")&&<><h2>{modal.kind==="setup"?"회원 프로필 만들기":"프로필 수정"}</h2><p className="sub">{modal.kind==="setup"?"얼굴 사진 없이 닉네임과 취향으로 시작해요.":"내 프로필에 보여줄 정보를 정해 주세요."}</p><ProfileForm person={modal.kind==="setup"?null:me} isNew={modal.kind==="setup"} busy={busy} onSave={async b=>{const setup=modal.kind==="setup";if(await act(setup?"participate":"profile",b,setup)){setModal({kind:"profile"});setToast("프로필을 저장했어요.");}}}/></>}
    {modal.kind==="block"&&peer&&<><span className="modalicon"><I n="shield"/></span><h2>{peer.name}님을 차단할까요?</h2><p className="sub">서로의 답변과 신호, 대화가 목록에서 사라져요. 이후 메시지도 보낼 수 없어요.</p><button className="primary wide" disabled={busy} onClick={async()=>{if(await act("block",{peer:peer.id})){go("discover");setToast("프로필을 차단했어요.");}}}>차단하기</button><button className="textbtn" onClick={close}>취소</button></>}
    {modal.kind==="delete"&&<><h2>프로필과 기록을 삭제할까요?</h2><p className="sub">회원 프로필과 작성한 답변, 주고받은 신호와 대화가 삭제돼요. 삭제한 내용은 복구할 수 없어요.</p><button className="primary wide" disabled={busy} onClick={async()=>{if(await act("delete",{})){location.replace("./");}}}>내 기록 삭제</button><button className="textbtn" onClick={close}>취소</button></>}
    {modal.kind==="help"&&<><span className="modalicon"><I n="headphones"/></span><h2>파장 이용 안내</h2><div className="guidelist">{[["오전과 오후에 한 번씩 답해요","한국 시간 자정과 낮 12시에 새 질문이 열려요. 한 번 답하면 다음 질문이 열릴 때까지 바로 메인으로 들어가요."],["답변에 신호를 보내요","모두의 답변에서 최근 30일의 질문과 답을 함께 읽어 보세요. 내 답을 쓰기 전에도 마음에 드는 사람에게 하루 세 번까지 신호를 보낼 수 있어요."],["서로 닿으면 대화해요","받은 신호를 수락하면 두 사람의 대화방이 열려요. 상대 프로필에서 언제든 차단할 수 있어요."],["프로필과 사진을 교환해요","이 대화방에서 각자 메시지를 5개 이상 보낸 뒤 프로필이나 사진 교환을 신청할 수 있어요. 상대가 수락하면 서로 볼 수 있어요."]].map(([a,b],i)=><div key={a}><b>{i+1}</b><div><strong>{a}</strong><p>{b}</p></div></div>)}</div><button className="primary wide" onClick={close}>알겠어요</button></>}
    {error&&<p role="alert" className="error">{error}</p>}
  </Dialog>}</>;
}
