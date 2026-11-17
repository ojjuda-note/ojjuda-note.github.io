"use client";
import {useEffect,useRef,useState} from "react";
import {koreaDay,themeFor,interests,regions,badges,signalsWith,emptyStation, type Person,type Message,type Station} from "../lib/station";
import {demoAction,newDemo,readDemo,saveDemo,viewDemo} from "../lib/demo";
import {I} from "./icons";
import NearbyRadar from "./nearby-radar";

type Tab = "discover"|"inbox"|"chat";
type Mode = "demo"|"member";
type Modal = {kind:"answer"|"signal"|"result"|"profile"|"setup"|"edit"|"channels"|"help"|"block"|"delete"|"person";peer?:string};
const navs = [{id:"discover",title:"발견",icon:"discover"},{id:"inbox",title:"신호함",icon:"signal"},{id:"chat",title:"대화",icon:"chat"}] as const;
const fmtClock=(at:number)=>new Intl.DateTimeFormat("ko-KR",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Seoul"}).format(new Date(at));
const getArt=(key:string)=>"./assets/"+badges(key).key+".webp";
async function request<T,>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{cache:"no-store",...init});let data;
  try{data=await response.json();}catch{throw Error("연결이 잠시 끊겼어요. 다시 시도해 주세요.");}
  if(!response.ok)throw Error(data && typeof data==="object" && "error" in data && typeof data.error==="string"?data.error:"잠시 후 다시 시도해 주세요.");
  return data as T;
}
function Art({interest,large=false}:{interest:string;large?:boolean}){return <span className={"avatar"+(large?" large":"")} style={{background:badges(interest).bg}}><img src={getArt(interest)} alt=""/></span>;}
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
  const [name,setName]=useState(person?.name||""),[age,setAge]=useState(person?String(person.age):""),[region,setRegion]=useState(person?.region||regions[0]),[interest,setInterest]=useState(person?.interest||"vinyl"),[consent,setConsent]=useState(false);
  return <form className="profileform" onSubmit={e=>{e.preventDefault();onSave({name:name.trim(),age:Number(age),region,interest,consent});}}>
    <label>닉네임<input required value={name} maxLength={12} placeholder="12자 이내" onChange={e=>setName(e.target.value)}/></label>
    <div className="fieldrow"><label>만 나이<input required type="number" inputMode="numeric" value={age} min="19" max="110" placeholder="19세 이상" onChange={e=>setAge(e.target.value)}/></label>
    <label>활동 지역<select value={region} onChange={e=>setRegion(e.target.value)}>{regions.map(v=><option key={v}>{v}</option>)}</select></label></div>
    <fieldset><legend>나를 닮은 취향</legend><div className="interestgrid">{interests.map(x=><button type="button" key={x.key} className={interest===x.key?"selected":""} aria-pressed={interest===x.key} onClick={()=>setInterest(x.key)}><Art interest={x.key}/>{x.name}</button>)}</div></fieldset>
    {isNew&&<label className="checkrow"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>만 19세 이상이며, 닉네임·나이·활동 지역·취향·오늘의 답변을 회원에게 공개하는 데 동의해요.</span></label>}
    <button className="primary wide" disabled={busy||!name.trim()||(isNew&&!consent)}>{isNew?"회원 채널 시작하기":"프로필 저장"}<I n="arrow" s={16}/></button></form>;
}
function Meter(){return <div className="meter" aria-hidden="true"><b>FM</b><div className="ruler"><i/><div className="numbers">{["88","92","96","100","104","108"].map(x=><span key={x}>{x}</span>)}</div><strong/></div><b>MHz</b></div>;}

export default function StationApp({initialDay,initialView,memberHome}:{initialDay:string;initialView:"cards"|"radar";memberHome?:string}){
  const [day,setDay]=useState(initialDay),[mode,setMode]=useState<Mode>("demo"),[demo,setDemo]=useState(newDemo),[live,setLive]=useState<Station>(()=>emptyStation(initialDay));
  const [discovery,setDiscovery]=useState<"cards"|"radar">(initialView);
  const [tab,setTab]=useState<Tab>("discover"),[modal,setModal]=useState<Modal|null>(null),[filter,setFilter]=useState("all"),[sort,setSort]=useState("recommend"),[inbox,setInbox]=useState("received");
  const [thread,setThread]=useState(""),[messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[toast,setToast]=useState(""),[net,setNet]=useState(""),[ready,setReady]=useState(false);
  const lock=useRef(false),serverRevision=useRef(0),threadRevision=useRef(0),bottom=useRef<HTMLDivElement>(null);
  const s=mode==="demo"?viewDemo(demo,day):live,me=s.me,theme=themeFor(s.day),peer=s.people.find(p=>p.id===modal?.peer),active=s.people.find(p=>p.id===thread);
  const incoming=s.people.filter(p=>signalsWith(s,p.id).incoming),sent=s.people.filter(p=>signalsWith(s,p.id).outgoing),matches=s.people.filter(p=>signalsWith(s,p.id).match);
  const available=s.remaining;
  const themeText=theme.q.join(" "),date=new Date(s.day+"T12:00:00+09:00");
  async function refresh(){
    const rev=++serverRevision.current;
    try{const next=await request<Station>("/api/station");if(serverRevision.current===rev){setLive(next);setNet("");}}
    catch{if(serverRevision.current===rev)setNet("회원 채널을 불러오지 못했어요.");}
  }
  useEffect(()=>{setDemo(readDemo());try{if(!memberHome && localStorage.getItem("pajang.channel")==="member")setMode("member");}catch{}setDay(koreaDay());setReady(true);if(!memberHome)void refresh();
    const sync=(e:StorageEvent)=>{if(e.key==="pajang.sample.v1")setDemo(readDemo());};window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync);},[]);
  useEffect(()=>{const tick=()=>{if(!document.hidden){setDay(koreaDay());if(mode==="member"&&!lock.current)void refresh();}};const id=setInterval(tick,12000);document.addEventListener("visibilitychange",tick);return()=>{clearInterval(id);document.removeEventListener("visibilitychange",tick);};},[mode]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(t);},[toast]);
  async function readThread(id:string){
    const rev=++threadRevision.current;
    try{const m=await request<Message[]>("/api/station?thread="+encodeURIComponent(id));if(rev===threadRevision.current){setMessages(m);setNet("");}}catch{if(rev===threadRevision.current)setNet("대화를 불러오지 못했어요.");}
  }
  useEffect(()=>{setDraft("");setMessages([]);if(mode!=="member"||!thread||tab!=="chat")return;void readThread(thread);const t=setInterval(()=>{if(!document.hidden&&!lock.current)void readThread(thread);},4000);return()=>{clearInterval(t);threadRevision.current++;};},[mode,thread,tab]);
  const threadMessages=mode==="demo"?s.messages.filter(m=>m.src===thread||m.dst===thread):messages;
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
  function open(m:Modal){setError("");setModal(m);}
  function close(){if(!lock.current){setModal(null);setError("");}}
  function go(t:Tab){setTab(t);setThread("");close();window.scrollTo({top:0});}
  function switchMode(m:Mode){
    setMode(m);try{localStorage.setItem("pajang.channel",m);}catch{}setThread("");setTab("discover");setFilter("all");setModal(null);setError("");if(m==="member")void refresh();
  }
  function startChat(p:string){setModal(null);setError("");setThread(p);setTab("chat");window.scrollTo({top:0});}
  async function act(action:string,b:Record<string,any>,forceLive=false):Promise<Station|null>{
    if(lock.current)return null;lock.current=true;setBusy(true);setError("");
    try{
      if(mode==="demo"&&!forceLive){const d=demoAction(readDemo(),action,b);saveDemo(d);setDemo(d);return viewDemo(d);}
      serverRevision.current++;const next=await request<Station>("/api/station",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...b})});serverRevision.current++;setLive(next);setNet("");return next;
    }catch(e){setError(e instanceof Error?e.message:"다시 시도해 주세요.");return null;}
    finally{lock.current=false;setBusy(false);}
  }
  function signal(p:Person){const v=signalsWith(s,p.id);if(v.match){startChat(p.id);return;}if(v.outgoing){open({kind:"result",peer:p.id});return;}if(!available){setToast("오늘의 신호를 모두 썼어요. 내일 다시 만나요.");return;}open({kind:me?.body?"signal":"answer",peer:p.id});}
  async function enterMember(){
    if(memberHome){window.open(memberHome,"_blank","noopener,noreferrer");return;}
    if(lock.current)return;setBusy(true);lock.current=true;setError("");
    try{const n=await request<Station>("/api/station");setLive(n);setNet("");if(!n.authenticated){setError("회원 채널은 로그인이 필요해요.");return;}
      if(n.me){switchMode("member");}else{setModal({kind:"setup"});}}
    catch{setError("회원 채널에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");}finally{lock.current=false;setBusy(false);}
  }
  const feed=s.people.filter(p=>p.body && (filter==="all"||p.interest===filter)).sort((a,b)=>{
    if(sort==="local")return Number(b.region===me?.region)-Number(a.region===me?.region)||(b.at||0)-(a.at||0);
    if(sort==="latest")return (b.at||0)-(a.at||0);
    return Number(b.interest===me?.interest)-Number(a.interest===me?.interest)||(b.at||0)-(a.at||0);
  });
  const signalCount=incoming.filter(p=>!signalsWith(s,p.id).match).length;
  function nav(){return navs.map(n=><button key={n.id} className={"navitem "+(tab===n.id?"active":"")} aria-current={tab===n.id?"page":undefined} onClick={()=>go(n.id)}><I n={n.icon} s={18}/>{n.title}{n.id==="inbox"&&signalCount>0&&<span className="navdot" aria-label="받은 신호 있음"/>}</button>);}
  function Card({p}:{p:Person}){
    const v=signalsWith(s,p.id),badge=badges(p.interest);
    return <article className="answercard"><div className="cardtop"><button className="person" onClick={()=>open({kind:"person",peer:p.id})}><Art interest={p.interest}/><span><strong>{p.name}</strong><small>{p.age}세<span>·</span>{p.region}</small></span></button><span className="tag" style={{background:badge.bg}}>{badge.name}</span></div>
      <div className="quotation" aria-hidden="true">“</div><p className="quote">{p.body}</p><button className={"sendlink "+(v.outgoing?"issent":"")} onClick={()=>signal(p)}><span><I n={v.match?"chat":v.outgoing?"check":"signal"} s={17}/>{v.match?"대화하기":v.outgoing?"보낸 신호":"신호 보내기"}</span><I n="up" s={15}/></button></article>;
  }
  function ListPerson({p,type}:{p:Person;type:"received"|"sent"|"chat"}){
    const v=signalsWith(s,p.id);const sig=type==="received"?v.incoming:v.outgoing;
    return <div className="listperson"><button className="person" onClick={()=>open({kind:"person",peer:p.id})}><Art interest={p.interest}/><span><strong>{p.name}</strong><small>{p.region} · {badges(p.interest).name}</small></span></button><p>{type==="chat"?"서로의 신호가 닿았어요.":sig?.note||(v.match?"서로의 신호가 닿았어요.":type==="received"?"신호를 보내왔어요.":"상대의 신호를 기다리고 있어요.")}</p><button className="secondary small" onClick={()=>signal(p)}>{v.match?"대화 열기":type==="sent"?"상태 보기":"신호 답장"}<I n="right" s={15}/></button></div>;
  }
  const modalTitle=modal?({answer:"오늘의 답변",signal:"신호 보내기",result:"신호 상태",profile:"내 프로필",setup:"회원 프로필 만들기",edit:"프로필 수정",channels:"채널 선택",help:"파장 이용 안내",block:"프로필 차단",delete:"데이터 삭제",person:"상대 프로필"}[modal.kind]):"";
  return <><header className="sitehead"><div className="headinner"><button className="brandbtn" onClick={()=>go("discover")} aria-label="파장 홈"><Brand/></button><nav className="desknav" aria-label="주 메뉴">{nav()}</nav><div className="headtools"><button className="modebtn" onClick={()=>open({kind:"channels"})}><span className="modedot"/>{mode==="demo"?"체험 채널":"회원 채널"}<I n="chevron" s={14}/></button><button className="profilebtn" aria-label="내 프로필" onClick={()=>open({kind:"profile"})}><I n="user" s={19}/></button></div></div></header>
  <main className="wrap">
    {mode==="member"&&net&&<div className="notice" role="status">{net}<button onClick={()=>{void refresh();if(thread)void readThread(thread);}}>다시 연결</button></div>}
    {tab==="discover"&&<div className="discover-switch" aria-label="발견 보기 방식"><button aria-pressed={discovery==="cards"} onClick={()=>chooseDiscovery("cards")}><I n="discover" s={16}/>답변 피드</button><button aria-pressed={discovery==="radar"} onClick={()=>chooseDiscovery("radar")}><I n="signal" s={16}/>주변 레이더</button></div>}
    {tab==="discover"&&discovery==="radar"&&<NearbyRadar key={mode} station={s} sample={mode==="demo"} onProfile={id=>open({kind:"person",peer:id})} onJoin={()=>open({kind:"channels"})} onSettings={async cell=>Boolean(await act(cell?"radar-enable":"radar-disable",cell?{...cell,consent:true,shareBearing:true}:{},true))}/>}
    {tab==="discover"&&discovery==="cards"&&<>
      <section className="hero" aria-label="오늘의 질문"><div className="heroart" aria-hidden="true"><img src="./assets/radio.webp" alt="" fetchPriority="high"/></div><div className="herocopy"><div className="onrow"><span className="onair"><i/>ON AIR</span><span className="questionlabel">오늘의 질문</span></div><h1>{theme.q.map(line=><span key={line}>{line}</span>)}</h1><p>오늘의 답변으로 취향이 맞는 인연과 첫 만남을 시작해 보세요.</p><button className="herobtn" disabled={!ready} onClick={()=>open({kind:mode==="member"&&!me?"channels":"answer"})}><I n="pencil" s={16}/>{me?.body?"내 답변 보기":"내 답변 쓰기"}<I n="arrow" s={16}/></button></div><div className="herofoot"><div className="edition"><i/>{s.day.replaceAll("-",".")}<b> / </b>{new Intl.DateTimeFormat("en",{weekday:"short",timeZone:"Asia/Seoul"}).format(date).toUpperCase()}</div><Meter/></div></section>
      <section className="feedsection"><div className="sectiontitle"><div><h2>오늘의 답변<span className="feednumber">{s.people.filter(p=>p.body).length}</span></h2><p>마음에 닿는 답변에 신호를 보내보세요.</p></div><span className="budget"><I n="signal" s={16}/>남은 신호 <b>{available}<em> / 3</em></b></span></div>
      <div className="filterrow"><div className="chips" aria-label="취향으로 필터"><button className={filter==="all"?"sel":""} aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>전체</button>{interests.map(x=><button key={x.key} className={filter===x.key?"sel":""} aria-pressed={filter===x.key} onClick={()=>setFilter(x.key)}>{x.name}</button>)}</div><label className="sort"><select aria-label="답변 정렬" value={sort} onChange={e=>setSort(e.target.value)}><option value="recommend">내 취향순</option><option value="latest">최신순</option><option value="local">같은 동네순</option></select><I n="chevron" s={13}/></label></div>
      {feed.length>0?<div className="cardgrid">{feed.map(p=><Card key={p.id} p={p}/>)}</div>:<Blank icon="headphones" title={filter==="all"?"아직 도착한 답변이 없어요":"이 취향의 답변이 아직 없어요"} body={filter==="all"?"오늘의 첫 답변을 들려주세요. 다른 회원이 남긴 답변도 여기에 모여요.":"다른 취향을 선택하면 더 많은 답변을 볼 수 있어요."} button={filter==="all"?"답변 쓰기":"전체 답변 보기"} onClick={()=>filter==="all"?open({kind:me?"answer":"channels"}):setFilter("all")}/>}</section></>}
    {tab==="inbox"&&<section className="innerpage"><div className="pagetitle"><I n="signal" s={28}/><h1>신호함</h1></div><p className="sub">서로 신호를 보내면 둘만의 대화가 열려요.</p><div className="seg"><button className={inbox==="received"?"on":""} onClick={()=>setInbox("received")}>받은 신호 {incoming.length}</button><button className={inbox==="sent"?"on":""} onClick={()=>setInbox("sent")}>보낸 신호 {sent.length}</button></div>{(inbox==="received"?incoming:sent).length?<div className="listbox">{(inbox==="received"?incoming:sent).map(p=><ListPerson key={p.id} p={p} type={inbox==="received"?"received":"sent"}/>)}</div>:<Blank icon="signal" title={inbox==="received"?"아직 받은 신호가 없어요":"아직 보낸 신호가 없어요"} body="오늘의 답변으로 취향이 닿는 사람을 찾아보세요." button="답변 둘러보기" onClick={()=>go("discover")}/>}</section>}
    {tab==="chat"&&<section className="innerpage">{(!active||!thread||!signalsWith(s,thread).match)?<><div className="pagetitle"><I n="chat" s={28}/><h1>대화</h1></div><p className="sub">서로의 신호가 닿은 사람과 이야기를 이어가세요.</p>{matches.length?<div className="listbox">{matches.map(p=><ListPerson key={p.id} p={p} type="chat"/>)}</div>:<Blank icon="chat" title="첫 대화를 기다리고 있어요" body="받은 신호에 답장을 보내면 대화를 시작할 수 있어요." button="신호함 보기" onClick={()=>go("inbox")}/>}</>:<div className="chatbox"><div className="chatheader"><button className="iconbtn" aria-label="대화 목록" onClick={()=>setThread("")}><I n="back"/></button><button className="person" onClick={()=>open({kind:"person",peer:active.id})}><Art interest={active.interest}/><span><strong>{active.name}</strong><small>{mode==="demo"?"샘플 프로필 · 예시 답장":"서로 신호를 보낸 회원"}</small></span></button><button className="quiet" onClick={()=>open({kind:"block",peer:active.id})}>차단</button></div><div className="chatlog">{threadMessages.length===0?<div className="chatintro"><I n="wave" s={32}/><p>두 사람의 대화가 열렸어요.</p><small>오늘의 답변을 떠올리며 첫인사를 건네보세요.</small></div>:<>{threadMessages.length>=100&&<p className="chatnote">최근 메시지 100개</p>}{threadMessages.map(m=><div key={m.id} className={"bubbleline "+(m.src===me?.id?"mine":"")}><p>{m.body}</p><time>{fmtClock(m.at)}</time></div>)}</>}<div ref={bottom}/></div>{error&&!modal&&<p className="error">{error}</p>}<form className="composer" onSubmit={async e=>{e.preventDefault();if(!draft.trim())return;const ok=await act("message",{peer:thread,body:draft.trim(),id:crypto.randomUUID()});if(ok){setDraft("");if(mode==="member")void readThread(thread);}}}><input maxLength={500} aria-label="메시지" placeholder="메시지를 입력하세요" value={draft} onChange={e=>setDraft(e.target.value)}/><button aria-label="메시지 보내기" disabled={busy||!draft.trim()}><I n="send" s={18}/></button></form></div>}</section>}
    <footer><span className="footerbrand"><I n="wave" s={16}/> 파장</span><span>{mode==="demo"?"체험 채널의 프로필과 대화는 예시예요.":"회원 채널 · 만 19세 이상"}</span><button onClick={()=>open({kind:"help"})}>이용 안내<I n="info" s={14}/></button></footer>
  </main><nav className="mobilenav" aria-label="모바일 주 메뉴">{nav()}</nav>{toast&&<div role="status" className="toast">{toast}</div>}
  {modal&&<Dialog key={modal.kind} close={close} title={modalTitle}>
    {modal.kind==="answer"&&<><span className="modalicon"><I n="pencil"/></span><h2>오늘의 답변</h2><p className="questionbox">{themeText}</p><Editor initial={me?.body} max={220} label="내 이야기" hint="장소, 노래, 기억처럼 구체적인 장면을 들려주세요." submit={modal.peer?"답변 저장하고 신호 보내기":"답변 저장"} busy={busy} onSave={async body=>{if(!await act("answer",{body,day:s.day}))return;if(modal.peer)setModal({kind:"signal",peer:modal.peer});else{setModal(null);setToast("오늘의 답변을 저장했어요.");}}}/></>}
    {modal.kind==="signal"&&peer&&<><span className="modalicon"><I n="signal"/></span><h2>{peer.name}님에게 신호 보내기</h2><p className="sub">서로 신호를 보내면 대화를 시작할 수 있어요.</p><p className="questionbox">{peer.body||signalsWith(s,peer.id).incoming?.note}</p><Editor max={120} label="함께 보낼 한마디 (선택)" hint="어떤 부분에 마음이 닿았나요?" submit={"신호 보내기 · 남은 "+available+"회"} busy={busy} optional onSave={async note=>{if(await act("signal",{peer:peer.id,note,day:s.day}))setModal({kind:"result",peer:peer.id});}}/></>}
    {modal.kind==="result"&&peer&&<div className="result"><span className="resultart"><Art interest={peer.interest} large/><i><I n={signalsWith(s,peer.id).match?"wave":"signal"}/></i></span><h2>{signalsWith(s,peer.id).match?"서로의 신호가 닿았어요":"신호를 보냈어요"}</h2><p className="sub">{signalsWith(s,peer.id).match?peer.name+"님도 당신에게 신호를 보냈어요. 이제 첫인사를 건네보세요.":peer.name+"님도 신호를 보내면 대화방이 열려요."}</p><button className="primary wide" onClick={()=>signalsWith(s,peer.id).match?startChat(peer.id):(setInbox("sent"),go("inbox"))}>{signalsWith(s,peer.id).match?"대화 시작하기":"보낸 신호 보기"}<I n="arrow" s={17}/></button></div>}
    {modal.kind==="person"&&peer&&<><Art interest={peer.interest} large/><h2>{peer.name}</h2><p className="sub">{peer.age}세 · {peer.region} · {badges(peer.interest).name}{mode==="demo"?" · 샘플 프로필":""}</p>{peer.body&&<div className="questionbox"><small>오늘의 답변</small>{peer.body}</div>}<button className="primary wide" onClick={()=>signal(peer)}>{signalsWith(s,peer.id).match?"대화 열기":signalsWith(s,peer.id).outgoing?"보낸 신호 확인":"신호 보내기"}<I n="signal" s={17}/></button><button className="textbtn" onClick={()=>open({kind:"block",peer:peer.id})}>이 프로필 차단</button></>}
    {modal.kind==="profile"&&<><span className="eyebrow">{mode==="demo"?"체험 채널":"회원 채널"}</span>{me?<><div className="profhero"><Art interest={me.interest} large/><div><h2>{me.name}</h2><p className="sub">{me.age}세 · {me.region} · {badges(me.interest).name}</p></div></div><div className="profileanswer"><b>오늘 내가 남긴 답변</b><p>{me.body||"아직 오늘의 답변을 작성하지 않았어요."}</p></div><div className="settings"><button onClick={()=>open({kind:"edit"})}>프로필 수정<I n="right" s={17}/></button><button onClick={()=>open({kind:"answer"})}>오늘의 답변 {me.body?"수정":"작성"}<I n="right" s={17}/></button><button onClick={()=>open({kind:"channels"})}>채널 선택<I n="right" s={17}/></button></div><button className="textbtn muted" onClick={()=>open({kind:"delete"})}>{mode==="demo"?"체험 기록 초기화":"회원 프로필과 기록 삭제"}</button></>:<><h2>내 프로필</h2><p className="sub">회원 채널에 참여할 프로필을 만들어 주세요.</p><button className="primary wide" onClick={()=>void enterMember()}>프로필 만들기</button></>}</>}
    {(modal.kind==="edit"||modal.kind==="setup")&&<><h2>{modal.kind==="setup"?"회원 프로필 만들기":"프로필 수정"}</h2><p className="sub">{modal.kind==="setup"?"얼굴 사진 없이 닉네임과 취향으로 시작해요.":"내 프로필에 보여줄 정보를 정해 주세요."}</p><ProfileForm person={modal.kind==="setup"?null:me} isNew={modal.kind==="setup"} busy={busy} onSave={async b=>{const setup=modal.kind==="setup";if(await act("profile",b,setup)){if(setup)switchMode("member");else setModal({kind:"profile"});setToast("프로필을 저장했어요.");}}}/></>}
    {modal.kind==="channels"&&<><span className="modalicon"><I n="wave"/></span><h2>채널 선택</h2><p className="sub">체험 기록과 회원 활동은 따로 보관해요.</p><button className="choice" onClick={()=>switchMode("demo")}><strong>체험 채널 {mode==="demo"&&<em>이용 중</em>}</strong><span>샘플 프로필로 신호와 대화를 경험해요. 체험 기록은 이 브라우저에 저장돼요.</span></button>{memberHome ? <a className="choice memberlink" href={memberHome} target="_blank" rel="noopener noreferrer"><strong>회원 채널 열기 ↗</strong><span>기존 파장 앱에서 열려요. 현재는 접근 권한이 있는 계정만 이용할 수 있어요.</span></a> : <button className="choice" disabled={busy} onClick={()=>void enterMember()}><strong>회원 채널</strong><span>성인 회원들과 답변과 신호를 나눠요.</span></button>}{error.includes("로그인")&&<a className="primary wide" href="/signin-with-chatgpt?return_to=%2F" target="_top">로그인하기</a>}</>}
    {modal.kind==="block"&&peer&&<><span className="modalicon"><I n="shield"/></span><h2>{peer.name}님을 차단할까요?</h2><p className="sub">서로의 답변과 신호, 대화가 목록에서 사라져요. 이후 메시지도 보낼 수 없어요.</p><button className="primary wide" disabled={busy} onClick={async()=>{if(await act("block",{peer:peer.id})){go("discover");setToast("프로필을 차단했어요.");}}}>차단하기</button><button className="textbtn" onClick={close}>취소</button></>}
    {modal.kind==="delete"&&<><h2>{mode==="demo"?"체험 기록을 초기화할까요?":"프로필과 기록을 삭제할까요?"}</h2><p className="sub">{mode==="demo"?"이 브라우저의 체험 답변, 신호, 대화가 처음 상태로 돌아가요.":"회원 프로필과 작성한 답변, 주고받은 신호와 대화가 삭제돼요. 삭제한 내용은 복구할 수 없어요."}</p><button className="primary wide" disabled={busy} onClick={async()=>{if(await act("delete",{})){switchMode("demo");setToast(mode==="demo"?"체험 기록을 초기화했어요.":"회원 기록을 삭제했어요.");}}}>{mode==="demo"?"초기화하기":"내 기록 삭제"}</button><button className="textbtn" onClick={close}>취소</button></>}
    {modal.kind==="help"&&<><span className="modalicon"><I n="headphones"/></span><h2>파장 이용 안내</h2><div className="guidelist">{[["오늘의 질문에 답해요","한국 시간 자정에 질문이 바뀌어요. 내 답변은 그날 다시 고칠 수 있어요."],["답변에 신호를 보내요","하루에 세 번, 마음에 닿은 답변에 한마디를 붙여 신호를 보낼 수 있어요."],["서로 닿으면 대화해요","두 사람 모두 신호를 보낸 뒤에 대화방이 열려요. 상대 프로필에서 언제든 차단할 수 있어요."]].map(([a,b],i)=><div key={a}><b>{i+1}</b><div><strong>{a}</strong><p>{b}</p></div></div>)}</div><button className="primary wide" onClick={close}>알겠어요</button></>}
    {error&&<p role="alert" className="error">{error}</p>}
  </Dialog>}</>;
}
