"use client";
import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {themeFor,introDetails,signalsWith,type Person,type Message,type Station,type NearbyAnswer} from "../lib/station";

import {InterestArt as Art} from "./interest-art";
import {I} from "./icons";
import NearbyRadar from "./nearby-radar";
import {prepareLocation} from "../../location.mjs";
import {maskedTextLength,textInputMaxLength} from "../../../../shared/content/text-length.mjs";
import MyAnswers from "./my-answers";
import AnswerHistory, {type DiscoveryAnswer} from "./answer-history";

import {ChatExchange} from "./chat-exchange";
import {ExchangeProfileEditor} from "./exchange-profile";
import {MyExchangePhotos,removeAllExchangePhotos} from "./exchange-photos";
import {AccountSettings,AccountActionForm} from "./account-settings";
import {QuestionSuggestionForm} from "./question-suggestion";
import {AnswerEditForm,type AnswerEditTarget} from "./answer-edit";
import {AnswerLike,AnswerLikesProvider} from "./answer-likes";
import {PastAnswerForm,PastQuestions,type PastQuestion} from "./past-questions";
import {ProfileForm,PublicProfilePreferences} from "./public-profile";
import {SignalPurchaseForm} from "./signal-purchase";
import {type SignalCounts,type SignalWallet} from "../lib/signal-wallet";

import {StationNavigation,readRoute,routeHref,type Tab} from "./station-navigation";
import {createStationHistory} from "../lib/navigation.mjs";
type Modal = {kind:"answer"|"historyAnswer"|"pastQuestions"|"pastAnswer"|"suggestion"|"signal"|"buySignals"|"result"|"setup"|"edit"|"channels"|"help"|"block"|"delete"|"person"|"privateProfile"|"privatePhotos"|"answers"|"logout"|"withdraw";peer?:string;period?:string;originalBody?:string;questionId?:number;answer?:DiscoveryAnswer;editTarget?:AnswerEditTarget;pastQuestion?:PastQuestion;pastOwner?:string;focusTastes?:boolean};
const fmtClock=(at:number)=>new Intl.DateTimeFormat("ko-KR",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Seoul"}).format(new Date(at));
async function request<T,>(url:string,init?:RequestInit):Promise<T>{
  const params=init?.body?JSON.parse(String(init.body)):{};
  const peer=new URL(url,location.origin).searchParams.get("thread");
  const action=peer?"thread":params.action||"state";
  const db=await window.OjjudaGetClient();
  const query=action==="profile"||action==="participate"
    ?db.rpc("pajang_profile_save",{p_data:params,p_setup:action==="participate"})
    :db.rpc("pajang_member",{p_action:action,p_data:peer?{peer}:params});
  const {data,error}=await (init?.signal && query.abortSignal?query.abortSignal(init.signal):query);
  if(error)throw Object.assign(new Error(error.message),{code:error.code});
  return data as T;
}
function Blank({icon,title,body,button,onClick}:{icon:string;title:string;body:string;button?:string;onClick?:()=>void}){return <div className="empty"><span className="emptyicon"><I n={icon} s={27}/></span><h3>{title}</h3>{body&&<p>{body}</p>}{button&&<button className="secondary" onClick={onClick}>{button}<I n="arrow" s={16}/></button>}</div>;}
function Dialog({children,close,title,busy=false}:{children:React.ReactNode;close:()=>void;title:string;busy?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=ref.current;if(node&&!node.open)node.showModal();node?.querySelector<HTMLElement>('[data-autofocus]')?.focus({preventScroll:true});const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{node?.close();document.body.style.overflow=overflow;};},[]);
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===ref.current){const b=ref.current.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close();}}}>
    <div className="sheet-bar"><button className="iconbtn" aria-label="닫기" disabled={busy} onClick={close}><I n="close"/></button></div>{children}</dialog>;
}
function Editor({initial="",max,label,submit,onSave,busy,hint,optional=false,publicationNote=false,onDraftChange,choices}:{initial?:string;max:number;label:string;submit:string;onSave:(v:string)=>void;busy:boolean;hint:string;optional?:boolean;publicationNote?:boolean;choices?:string[];onDraftChange?:(v:string)=>void}){
  const options=choices?.filter(text=>text.trim()&&maskedTextLength(text)<=max)??[];
  const [selected,setSelected]=useState(options.includes(initial)?initial:"");
  const [value,setValue]=useState(selected?"":initial);
  const body=selected||value;
  const field=<><label className="formlabel" htmlFor="editor">{options.length?"주관식":label}</label><textarea id="editor" aria-describedby={publicationNote?"member-publication-note":undefined} value={value} onChange={e=>{setSelected("");setValue(e.target.value);onDraftChange?.(e.target.value);}} placeholder={options.length?"직접 쓰기":hint} maxLength={textInputMaxLength(value,max)} rows={4} required={!optional&&!selected}/><div className="counter">{maskedTextLength(value)} / {max}</div></>;
  return <form onSubmit={e=>{e.preventDefault();if(!busy&&maskedTextLength(body)<=max&&(optional||body.trim()))onSave(body.trim());}}>
    {options.length?<div className="pajang-answer-split"><fieldset className="pajang-choices" disabled={busy}><legend>객관식</legend>
      {options.map(option=><label className="pajang-option" key={option}><input type="radio" name="sample-answer" checked={selected===option} onChange={()=>{setValue("");setSelected(option);onDraftChange?.(option);}}/>{option}</label>)}</fieldset>
      <div className="pajang-written">{field}</div></div>:field}
    {publicationNote&&<p className="publication-note" id="member-publication-note">질문과 답변은 질문이 올라온 날부터 최대 365일간 파장 회원에게 보여요.</p>}
    <button className="primary wide" disabled={busy||maskedTextLength(body)>max||(!optional&&!body.trim())}>{submit}<I n="arrow" s={17}/></button></form>;
}
function ListPerson({p,type,station,busy,onProfile,onAction}:{
  p:Person;type:"received"|"sent"|"chat";station:Station;busy:boolean;
  onProfile:()=>void;onAction:()=>void;
}){
    const v=signalsWith(station,p.id);const sig=type==="received"?v.incoming:v.outgoing;
    return <div className="listperson"><button className="person" onClick={onProfile}><Art personId={p.id} interest={p.interest}/><span><strong>{p.name}</strong><small>{introDetails(p)}</small></span></button><p>{type==="chat"?"서로의 신호가 닿았어요.":sig?.note||(v.match?"서로의 신호가 닿았어요.":type==="received"?"신호를 보내왔어요.":"상대의 신호를 기다리고 있어요.")}</p><button className="secondary small" disabled={busy||(!station.remaining&&type==="received"&&!station.purchasingEnabled)} onClick={onAction}>{v.match?"대화 열기":type==="sent"?"상태 보기":"수락하고 대화하기"}<I n="right" s={15}/></button></div>;
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
  const navigation=useRef<ReturnType<typeof createStationHistory>|null>(null);
  const restoredScroll=useRef<number|null>(null);
  const pendingMessages=useRef(new Map<string,{body:string;id:string}>());
  const draftByPeer=useRef(new Map<string,string>());
  const signalDrafts=useRef(new Map<string,string>());
  const historyEditDirty=useRef(false);
  const currentPeer=useRef(thread);
  currentPeer.current=thread;
  const [pendingModal,setModal]=useState<Modal|null>(null),[inbox,setInbox]=useState("received");
  const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[toast,setToast]=useState(initialStation.locationNotice||""),[net,setNet]=useState(""),[ready,setReady]=useState(false);
  const [historyRevision,setHistoryRevision]=useState(0);
  const lock=useRef(false),serverRevision=useRef(0),bottom=useRef<HTMLDivElement>(null);
  const liveRef=useRef(live);liveRef.current=live;
  const locationAccount=useRef("");
  const locationDay=useRef(initialStation.day);
  const locationRead=useRef<AbortController|null>(null);
  const [autoLocation,setAutoLocation]=useState({pending:false,message:initialStation.locationNotice||""});
  function cancelAutoLocation(){
    locationRead.current?.abort();locationRead.current=null;
    setAutoLocation({pending:false,message:""});
  }
  useEffect(()=>{
    let closed=false,unsubscribe=()=>{};
    const day=live.day,changedDay=locationDay.current!==day;
    locationDay.current=day;
    if(changedDay)setAutoLocation({pending:false,message:""});
    void window.OjjudaGetClient().then(async db=>{
      const {data:{session}}=await db.auth.getSession();
      if(closed||liveRef.current.day!==day||!session?.user||session.user.is_anonymous)return;
      const accountId=session.user.id;
      if(locationAccount.current&&locationAccount.current!==accountId)return;
      locationAccount.current=accountId;
      const service=(window as any).OjjudaLocation;
      const current=liveRef.current;
      service.acceptPreference(accountId,{enabled:current.locationEnabled!==false,version:current.locationVersion??0},true);
      function locate(state:Station){
        if(state.locationEnabled===false||locationRead.current)return;
        const controller=new AbortController();locationRead.current=controller;
        const revision=serverRevision.current;
        setAutoLocation({pending:true,message:"위치를 확인하고 있어요."});
        void prepareLocation(state,db,accountId,{signal:controller.signal,onProgress:(message:string)=>{
          if(!closed&&!controller.signal.aborted)setAutoLocation({pending:true,message});
        }}).then(result=>{
          if(closed||controller.signal.aborted)return;
          setAutoLocation({pending:false,message:result.locationNotice||""});
          // A slow position must not replace an answer or setting changed after entry.
          if(serverRevision.current===revision){
            serverRevision.current++;liveRef.current=result;setLive(result);
          }else if(!lock.current)void refresh();
        }).finally(()=>{if(locationRead.current===controller)locationRead.current=null;});
      }
      unsubscribe=service.subscribe(accountId,(choice:{enabled:boolean;version:number})=>{
        const previous=liveRef.current;
        if(closed||choice.version<(previous.locationVersion??0)||
          (choice.version===previous.locationVersion&&choice.enabled===previous.locationEnabled))return;
        const next={...previous,locationEnabled:choice.enabled,locationVersion:choice.version,
          radarOn:choice.enabled?previous.radarOn:false};
        cancelAutoLocation();
        liveRef.current=next;setLive(next);
        serverRevision.current++;
        if(choice.enabled)locate({...next,locationChecked:false} as Station);
      });
      // A checked position belongs to its question date. Refresh it once when
      // the server advances the day, without restarting at noon or on polls.
      locate(changedDay?{...liveRef.current,locationChecked:false} as Station:liveRef.current);
    }).catch(()=>{});
    return()=>{
      closed=true;unsubscribe();
      const pending=locationRead.current;locationRead.current=null;pending?.abort();
    };
  },[live.day]);
  useEffect(()=>{
    if(locationAccount.current)(window as any).OjjudaLocation.acceptPreference(locationAccount.current,
      {enabled:live.locationEnabled!==false,version:live.locationVersion??0},true);
  },[live.locationEnabled,live.locationVersion]);
  const s=live,me=s.me,theme=s.question??themeFor(s.day,s.slot),period=s.day+"/"+s.slot;
  const slotName=s.slot==="am"?"오전":"오후";
  const obsoleteAnswer=pendingModal?.kind==="answer" && (pendingModal.questionId!==s.question?.id ||
    (pendingModal.originalBody===undefined && Boolean(me?.body)));
  const modal=(pendingModal?.period && pendingModal.period!==period) || obsoleteAnswer ||
    (pendingModal?.pastOwner&&pendingModal.pastOwner!==me?.id) ? null : pendingModal;
  const editingAnswer=modal?.kind==="answer" && modal.originalBody!==undefined;
  const answerTitle=slotName+(editingAnswer?" 답변 수정":" 답변");
  const row=modal?.answer;
  const peer=row?{...row,id:row.peer}:s.people.find(p=>p.id===modal?.peer)??s.nearbyPeople?.find(p=>p.id===modal?.peer);
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
  useEffect(()=>{if(pendingModal&&!modal)dismiss();},[pendingModal,modal]);
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
    else window.scrollTo(0,restoredScroll.current??scrollPositions.current.get(routeKey)??0);
    restoredScroll.current=null;
  },[route]);
  useEffect(()=>{
    const previous=history.scrollRestoration;
    history.scrollRestoration="manual";
    const controller=createStationHistory(window,(dialog:Modal|null,scroll:number,cause:string)=>{
      navigationId.current++;
      scrollPositions.current.set(currentRoute.current,window.scrollY);
      const next=readRoute();
      scrollTarget.current=cause==="route"&&location.hash==="#answers"?"answers":"restore";
      restoredScroll.current=Number.isFinite(scroll)?scroll:null;
      if(next.tab==="today")setVisitedToday(true);
      setModal(dialog);setError("");setRoute(next);
    },{
      canLeave:canLeaveDialog,
      persistDialog:(dialog:Modal|null)=>dialog?.kind==="suggestion"?"suggestion":null,
      restoreDialog:(kind:string)=>kind==="suggestion"&&readRoute().tab==="today"&&liveRef.current.me?{kind:"suggestion"}:null
    });
    navigation.current=controller;
    const bridge={openExternal:controller.openExternal,closeExternal:controller.closeExternal,canLeave:controller.canLeave};
    (window as any).OjjudaPajangHistory=bridge;
    window.dispatchEvent(new Event("pajang:history-ready"));
    const beforeUnload=(event:BeforeUnloadEvent)=>{
      if(!historyEditDirty.current)return;
      event.preventDefault();event.returnValue="";
    };
    window.addEventListener("beforeunload",beforeUnload);
    return ()=>{
      window.removeEventListener("beforeunload",beforeUnload);
      history.scrollRestoration=previous;controller.dispose();navigation.current=null;
      if((window as any).OjjudaPajangHistory===bridge)delete (window as any).OjjudaPajangHistory;
    };
  },[]);
  function canLeaveDialog(){
    if(lock.current)return false;
    if(!historyEditDirty.current)return true;
    if(!window.confirm("수정한 내용을 저장하지 않고 닫을까요?"))return false;
    historyEditDirty.current=false;
    return true;
  }
  function navigate(next:Tab,peer="",answers=false,replace=false){
    if(historyEditDirty.current&&!canLeaveDialog())return;
    const href=routeHref(next,peer,answers);
    if(navigation.current?.visit(href,replace))return;
    navigationId.current++;
    scrollPositions.current.set(currentRoute.current,window.scrollY);
    scrollTarget.current=answers?"answers":"restore";
    if(href!==location.pathname+location.search+location.hash){
      if(replace)history.replaceState(history.state,"",href);else history.pushState(history.state,"",href);
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
    if(historyEditDirty.current&&!canLeaveDialog())return;
    setError("");
    if(m.kind==="suggestion"&&(lock.current||pendingModal?.kind==="suggestion"||!me))return;
    if(m.kind==="answer"){
      if(m.originalBody!==(me?.body||undefined))return;
      const next={...m,period,questionId:s.question?.id};
      if(!navigation.current?.open(next))setModal(next);
      return;
    }
    const next=m.answer||m.kind==="signal"?{...m,period}:m;
    if(!navigation.current?.open(next))setModal(next);
  }
  function editHistoryAnswer(answer:AnswerEditTarget,stack=false){
    if(!liveRef.current.authenticated||answer.owner!==liveRef.current.me?.id||!canLeaveDialog())return;
    const next:Modal={kind:"historyAnswer",editTarget:answer};
    setError("");
    if(!navigation.current?.open(next,null,{stack}))setModal(next);
  }
  function answerPastQuestion(question:PastQuestion,stack=false){
    const owner=liveRef.current.me?.id;
    if(!owner||!liveRef.current.authenticated||!canLeaveDialog())return;
    if(question.answered){
      if(question.canEdit&&typeof question.body==="string")editHistoryAnswer({...question,body:question.body,owner},stack);
      return;
    }
    const next:Modal={kind:"pastAnswer",pastQuestion:question,pastOwner:owner};setError("");
    if(!navigation.current?.open(next,null,{stack}))setModal(next);
  }
  function dismiss(){if(historyEditDirty.current&&!canLeaveDialog())return;if(!navigation.current?.close())setModal(null);setError("");}
  function close(){if(!lock.current)dismiss();}
  function accountBusy(value:boolean){
    lock.current=value;setBusy(value);
    if(value){cancelAutoLocation();threadRead.current?.abort();}
  }
  function signalDraftKey(peerId:string,answer?:DiscoveryAnswer){return me?.id+"/"+peerId+"/"+(answer?.day??s.day)+"/"+(answer?.slot??s.slot);}
  function applySignalQuota(value:SignalCounts|SignalWallet,profileId:string){
    const previous=liveRef.current;
    if(previous.me?.id!==profileId)return;
    const next={...previous,remaining:value.remaining,freeRemaining:value.freeRemaining,paidRemaining:value.paidRemaining,
      ...("purchasingEnabled" in value?{purchasingEnabled:value.purchasingEnabled}:{})};
    serverRevision.current++;liveRef.current=next;setLive(next);
  }
  function go(t:Tab){navigate(t);}
  function startChat(p:string){navigate("chat",p);}
  function goBack(fallback:Tab){
    if(navigation.current)navigation.current.back(routeHref(fallback));
    else navigate(fallback,"",false,true);
  }
  async function act(action:string,b:Record<string,any>,forceLive=false):Promise<Station|null>{
    if(lock.current)return null;
    const origin=navigationId.current;lock.current=true;setBusy(true);setError("");
    try{

      if(action==="delete")await removeAllExchangePhotos();
      serverRevision.current++;const next=await request<Station>("/api/station",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...b})});serverRevision.current++;if(action==="delete"){location.replace("./");return next;}setLive(next);setNet("");
      if(action==="block"||action==="answer"||action==="edit-answer"||action==="profile"||action==="participate")setHistoryRevision(n=>n+1);
      return next;
    }catch(e){
      if(action==='radar-enable'||action==='radar-disable'){
        if(e instanceof Error && 'code' in e && e.code==='PT412')await refresh();
        throw e;
      }
      if(origin!==navigationId.current)return null;
      if(b.answerDay && e instanceof Error && "code" in e && (e.code==="PT409"||e.code==="42501")){
        dismiss();setToast("이 답변은 더 이상 볼 수 없어요.");setHistoryRevision(n=>n+1);void refresh();
      }else if(e instanceof Error && "code" in e && e.code==="PT409"){
        dismiss();setToast("질문 시간이 바뀌었어요. 새 질문을 확인해 주세요.");void refresh();
      }else{
        setError(e instanceof Error?e.message:"다시 시도해 주세요.");
        if(e instanceof Error && "code" in e && e.code==="PT412")await refresh();
      }
      return null;
    }
    finally{lock.current=false;setBusy(false);}
  }
  function signal(p:Person){const v=signalsWith(s,p.id);if(v.match){startChat(p.id);return;}if(v.outgoing){open({kind:"result",peer:p.id});return;}if(!available&&!s.purchasingEnabled){setToast("오늘의 신호를 모두 썼어요. 내일 다시 만나요.");return;}open({kind:"signal",peer:p.id});}
  function openNearbyProfile(id:string,answer?:NearbyAnswer){
    const person=(s.nearbyPeople??s.people).find(item=>item.id===id);
    if(!person)return;
    if(!answer){open({kind:"person",peer:id});return;}
    const relation=signalsWith(s,id);
    open({kind:"person",peer:id,answer:{...answer,peer:id,name:person.name,region:person.region,
      interest:person.interest,own:id===me?.id,sent:!!relation.outgoing,received:!!relation.incoming}});
  }
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
    const draftKey=signalDraftKey(peerId,answer);signalDrafts.current.set(draftKey,note);
    if(!available){
      if(s.purchasingEnabled)open({kind:"signal",peer:peerId,answer});
      else setToast("오늘의 신호를 모두 썼어요. 내일 다시 만나요.");
      return;
    }
    const origin=navigationId.current;
    const next=await act("signal",{peer:peerId,note,...(answer?{answerDay:answer.day,answerSlot:answer.slot}:{day:s.day,slot:s.slot})});
    if(!next)return;
    signalDrafts.current.delete(draftKey);
    setHistoryRevision(n=>n+1);
    if(origin!==navigationId.current)return;
    if(signalsWith(next,peerId).match)startChat(peerId);
    else open({kind:"result",peer:peerId});
  }
  async function sendMessage(){
    const submitted=draft,body=submitted.trim(),peerId=thread;
    if(!body||maskedTextLength(body)>500||lock.current||!validThread)return;
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
  const modalTitle=modal?({answer:answerTitle,historyAnswer:"답변 수정",pastQuestions:"지난 질문",pastAnswer:"지난 질문에 답변하기",suggestion:"이 질문 어때요?",signal:"신호 보내기",buySignals:"추가 신호 구매",result:"신호 상태",setup:"회원 프로필 만들기",edit:"내 프로필 수정",channels:"채널 선택",help:"파장 이용 안내",block:"프로필 차단",delete:"파장 기록 삭제",person:"상대 프로필",privateProfile:"내 프로필 수정",privatePhotos:"교환용 사진",answers:"내가 남긴 답변",logout:"로그아웃",withdraw:"오쭈다 회원탈퇴"}[modal.kind]):"";
  return <AnswerLikesProvider key={s.authenticated?me?.id:"guest"} owner={me?.id??""}><div className="station-layout">
    <StationNavigation tab={tab} onGo={go} pending={signalCount}/>
    <main className="wrap station-content" id="station-content">
    {(net||threadError)&&<div className="notice" role="status">{net||threadError}<button onClick={()=>{void refresh();if(thread)void readThread(thread);}}>다시 연결</button></div>}
    {tab==="radar"&&<><button className="return-today" onClick={()=>go("today")}><I n="back" s={15}/>오늘</button><NearbyRadar station={s} sample={false} autoLocation={autoLocation} onLocationChange={cancelAutoLocation} onProfile={openNearbyProfile} onJoin={()=>location.assign("./")} onSettings={async (cell,accountId)=>Boolean(await act(cell?"radar-enable":"radar-disable",cell?{...cell,consent:true,shareBearing:true,accountId,locationVersion:s.locationVersion}:{accountId,locationVersion:s.locationVersion},true))}/></>}
    {visitedToday&&<div className="today-page" hidden={tab!=="today"}>
      <section className="letter-hero" aria-label={slotName+" 질문"}>
        <div className="letter-copy">
          <div className="letter-date">오늘의 질문 <time dateTime={s.day}>{s.day.replaceAll("-",".")} · {slotName}</time></div>
          <h1>{themeText}</h1>
          <div className="letter-actions"><button className={me?.body?"secondary":"primary"} disabled={!ready} onClick={()=>open(me?{kind:"answer",originalBody:me.body||undefined}:{kind:"setup"})}>
            <I n="pencil" s={16}/>{me?.body?"내 답변 수정하기":"내 답변 쓰기"}
          </button>
          <button type="button" className="past-questions-open" aria-haspopup="dialog" disabled={!ready||!me} onClick={()=>open({kind:"pastQuestions",pastOwner:me?.id})}>
            <I n="clock" s={16}/>지난 질문<I n="right" s={14}/>
          </button></div>
        </div>
      </section>
      <div className="today-actions">
        <button type="button" className="question-suggest" aria-haspopup="dialog" disabled={!ready||!me} onClick={()=>open({kind:"suggestion"})}><I n="chat" s={17}/><span>이 질문 어때요?</span><I n="right" s={13}/></button>
        <button className="mobile-near" onClick={()=>go("radar")}><I n="radar" s={16}/>내 주변<I n="right" s={14}/></button>
      </div>
      <div className="today-columns">
      <AnswerHistory active={tab==="today"} station={s} revision={historyRevision}
        onProfile={answer=>answer.own?go("profile"):open({kind:"person",peer:answer.peer,answer})}
        onSignal={answer=>open({kind:"signal",peer:answer.peer,answer})}
        onBuySignals={()=>open({kind:"buySignals"})}
        onChat={id=>void openHistoryChat(id)}
        onEdit={answer=>{if(answer.own&&answer.peer===me?.id)editHistoryAnswer({...answer,owner:answer.peer});}}
        onPastQuestion={answer=>answerPastQuestion({day:answer.day,slot:answer.slot,question:answer.question})}
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
      {inbox==="received"&&waiting.length>0&&<small className="accept-note">수락할 때 신호 1개를 사용해요. 남은 신호 {available}개{!!s.paidRemaining&&` (무료 ${s.freeRemaining??0} · 구매 ${s.paidRemaining})`}</small>}
      {error&&!modal&&<p className="error" role="alert">{error}</p>}
      <h2 className="inbox-chats">이어지는 대화</h2>
      {matches.length?<div className="listbox">{matches.map(p=><ListPerson key={p.id} p={p} station={s} busy={busy} onProfile={()=>open({kind:"person",peer:p.id})} onAction={()=>startChat(p.id)} type="chat"/>)}</div>:<Blank icon="chat" title="아직 열린 대화가 없어요" body="서로 신호를 보내면 여기서 대화를 이어 갈 수 있어요."/>}
    </section>}
    {tab==="chat"&&active&&validThread&&<section className="innerpage" key={thread}><ChatExchange key={active.id} peer={active.id} owner={me?.id||""} name={active.name} region={active.region} lastMessage={lastMsg}>{({notification,actions})=><><div className="chatbox"><div className="chatheader"><button className="iconbtn" aria-label="뒤로가기" onClick={()=>goBack("inbox")}><I n="back"/></button><button className="person" onClick={()=>open({kind:"person",peer:active.id})}><Art personId={active.id} interest={active.interest}/><span><strong>{active.name}</strong><small>서로 신호를 보낸 회원</small></span></button><button className="quiet" onClick={()=>open({kind:"block",peer:active.id})}>차단</button></div><div className="chatlog" onScroll={event=>{const log=event.currentTarget;followChat.current=log.scrollHeight-log.scrollTop-log.clientHeight<64;}}>{threadMessages.length===0?<div className="chatintro"><I n="wave" s={32}/><p>두 사람의 대화가 열렸어요.</p><small>오늘의 답변을 떠올리며 첫인사를 건네보세요.</small></div>:<>{threadMessages.length>=100&&<p className="chatnote">최근 메시지 100개</p>}{threadMessages.map(m=><div key={m.id} className={"bubbleline "+(m.src===me?.id?"mine":"")}><p>{m.body}</p><time>{fmtClock(m.at)}</time></div>)}</>}{notification}<div ref={bottom}/></div>{error&&!modal&&<p className="error" role="alert">{error}</p>}<form className="composer" onSubmit={e=>{e.preventDefault();void sendMessage();}}><input maxLength={textInputMaxLength(draft,500)} aria-label="메시지" placeholder="메시지를 입력하세요" value={draft} onChange={e=>{setDraft(e.target.value);draftByPeer.current.set(thread,e.target.value);}}/><button aria-label="메시지 보내기" disabled={busy||!draft.trim()||maskedTextLength(draft.trim())>500}><I n="send" s={18}/></button></form></div>{actions}</>}</ChatExchange></section>}
    {tab==="profile"&&<section className="station-account innerpage">
      <div className="channel-heading account-heading"><h1>{me&&<Art personId={me.id} interest={me.interest}/>} 내 파장</h1><button type="button" className="account-settings-close" aria-label="설정 닫기" onClick={()=>goBack("today")}><I n="close"/></button></div>
      <div className="ojjuda-settings">
          {me?<AccountSettings profileId={me.id} onOpen={kind=>open({kind})}/>:
        <Blank icon="user" title="파장에 참여해 주세요" body="오쭈다 회원 정보로 시작할 수 있어요." button="참여하기" onClick={()=>void enterMember()}/>}</div></section>}
    </main>{toast&&<div role="status" className="toast">{toast}</div>}
  {modal&&<Dialog key={modal.kind} close={close} title={modalTitle} busy={busy}>
    {(modal.kind==="buySignals"||(modal.kind==="signal"&&available===0&&s.purchasingEnabled))&&me&&<SignalPurchaseForm key={me.id}
      onBusyChange={accountBusy} onWallet={wallet=>applySignalQuota(wallet,me.id)}
      onPurchased={receipt=>{applySignalQuota(receipt,me.id);setError("");if(modal.kind==="buySignals")close();setToast(`신호 ${receipt.quantity}개를 구매했어요. 남은 신호 ${receipt.remaining}개`);}}/>}
    {modal.kind==="suggestion"&&me&&<QuestionSuggestionForm key={me.id} period={period} onBusyChange={accountBusy} onSaved={()=>{close();setToast("질문을 보냈어요. 고마워요!");}}/>}
    {(modal.kind==="logout"||modal.kind==="withdraw")&&<AccountActionForm action={modal.kind} close={close} onBusyChange={accountBusy}/>}
    {modal.kind==="answers"&&me&&<MyAnswers key={me.id+period} owner={me.id} answered={Boolean(me.body)} revision={historyRevision}
      onEdit={answer=>editHistoryAnswer({...answer,owner:me.id},true)} onWrite={()=>open({kind:"answer"})}/>}
    {modal.kind==="pastQuestions"&&me&&<PastQuestions key={me.id} owner={me.id} revision={historyRevision} onChoose={question=>answerPastQuestion(question,true)}/>}
    {modal.kind==="pastAnswer"&&modal.pastQuestion&&modal.pastOwner&&<PastAnswerForm
      key={modal.pastOwner+"/"+modal.pastQuestion.day+"/"+modal.pastQuestion.slot} question={modal.pastQuestion} owner={modal.pastOwner}
      onBusyChange={accountBusy} onDirtyChange={dirty=>{historyEditDirty.current=dirty;}}
      onExisting={answer=>editHistoryAnswer(answer)} onMyAnswers={()=>open({kind:"answers"})}
      onSaved={()=>{
        if(liveRef.current.me?.id!==modal.pastOwner)return false;
        setHistoryRevision(value=>value+1);dismiss();setToast("답변을 남겼어요.");void refresh();return true;
      }}/>}
    {modal.kind==="historyAnswer"&&modal.editTarget&&<AnswerEditForm
      key={modal.editTarget.owner+"/"+modal.editTarget.day+"/"+modal.editTarget.slot} answer={modal.editTarget}
      onBusyChange={accountBusy} onDirtyChange={dirty=>{historyEditDirty.current=dirty;}}
      onSaved={next=>{
        if(next.me?.id!==modal.editTarget?.owner||liveRef.current.me?.id!==modal.editTarget.owner)return false;
        serverRevision.current++;liveRef.current=next;setLive(next);setNet("");setHistoryRevision(value=>value+1);
        dismiss();setToast("답변을 수정했어요.");return true;
      }}/>}
    {modal.kind==="answer"&&<><span className="modalicon"><I n="pencil"/></span><h2>{answerTitle}</h2><p className="questionbox">{themeText}</p>
      {editingAnswer&&<p className="sub">저장하면 공개 기간이 남아 있는 답변에 수정한 내용이 보여요. 공개 기간은 바뀌지 않아요.</p>}
      <Editor key={period+themeText} initial={modal.originalBody} choices={theme.answers} max={220} label="내 이야기" hint="평소 내 생각이나 행동을 편하게 적어 주세요."
        publicationNote={!editingAnswer} submit={editingAnswer?"수정 저장하기":s.genderSharePending?"답변·가입 성별을 파장 회원에게 공개":"답변하기"} busy={busy} onSave={async body=>{
          const origin=navigationId.current;
          const data={body,day:s.day,slot:s.slot,questionId:modal.questionId};
          const next=editingAnswer?await act("edit-answer",{...data,previousBody:modal.originalBody}):await act("answer",{...data,archive:true,publicationPolicy:"year-v1",shareAccountGender:s.genderSharePending===true});
          if(!next||origin!==navigationId.current)return;
          dismiss();setToast(slotName+(editingAnswer?" 답변을 수정했어요.":" 답변을 저장했어요."));
        }}/>
    </>}
    {modal.kind==="signal"&&peer&&!(available===0&&s.purchasingEnabled)&&<><span className="modalicon"><I n="signal"/></span><h2>{peer.name}님{row?.received || signalsWith(s,peer.id).incoming?"의 신호 수락":"에게 신호 보내기"}</h2><p className="sub">{available?"서로 신호를 보내면 대화를 시작할 수 있어요.":"오늘의 신호를 모두 썼어요. 내일 다시 만나요."}</p><div className="questionbox">{row&&<small>{row.question}</small>}{peer.body||signalsWith(s,peer.id).incoming?.note}</div><Editor key={signalDraftKey(peer.id,row)} initial={signalDrafts.current.get(signalDraftKey(peer.id,row))} onDraftChange={value=>signalDrafts.current.set(signalDraftKey(peer.id,row),value)} max={120} label="함께 보낼 한마디 (선택)" hint="어떤 부분에 마음이 닿았나요?" submit={(row?.received || signalsWith(s,peer.id).incoming?"신호 수락하기":"신호 보내기")+" · 남은 "+available+"개"} busy={busy||available===0} optional onSave={note=>void deliver(peer.id,note,row)}/></>}
    {modal.kind==="result"&&peer&&<div className="result"><span className="resultart"><Art personId={peer.id} interest={peer.interest} large/><i><I n={signalsWith(s,peer.id).match?"wave":"signal"}/></i></span><h2>{signalsWith(s,peer.id).match?"서로의 신호가 닿았어요":"신호를 보냈어요"}</h2><p className="sub">{signalsWith(s,peer.id).match?peer.name+"님도 당신에게 신호를 보냈어요. 이제 첫인사를 건네보세요.":peer.name+"님도 신호를 보내면 대화방이 열려요."}</p><button className="primary wide" onClick={()=>signalsWith(s,peer.id).match?startChat(peer.id):(setInbox("sent"),go("inbox"))}>{signalsWith(s,peer.id).match?"대화 시작하기":"보낸 신호 보기"}<I n="arrow" s={17}/></button></div>}
    {modal.kind==="person"&&peer&&<><Art personId={peer.id} interest={peer.interest} large/><h2>{peer.name}</h2><p className="sub">{introDetails(peer)}</p>{peer.body&&<div className="questionbox"><small>{row?.question||themeText}</small>{peer.body}</div>}{row&&<AnswerLike answer={row}/>} {me&&<PublicProfilePreferences key={me.id+peer.id} viewer={me.id} person={peer.id}/>}<button className="primary wide" onClick={()=>{
        if(!row)return signal(peer);
        if((row.sent&&row.received)||signalsWith(s,row.peer).match)return void openHistoryChat(row.peer);
        if(row.sent||signalsWith(s,row.peer).outgoing){setInbox("sent");go("inbox");return;}
        open({kind:"signal",peer:row.peer,answer:row});
      }}>{(row?.sent&&row?.received)||signalsWith(s,peer.id).match?"대화 열기":row?.sent||signalsWith(s,peer.id).outgoing?"보낸 신호 확인":row?.received||signalsWith(s,peer.id).incoming?"신호 수락하기":"신호 보내기"}<I n="signal" s={17}/></button><button className="textbtn" onClick={()=>open({kind:"block",peer:peer.id,answer:row})}>이 프로필 차단</button></>}
    {(modal.kind==="edit"||modal.kind==="privateProfile")&&me&&<ExchangeProfileEditor key={me.id} profileId={me.id} onVisibilitySaved={()=>{setHistoryRevision(n=>n+1);void refresh();}} focusTastes={modal.focusTastes} onSaved={saved=>{
      const current=liveRef.current;if(current.me?.id!==saved.person)return;
      const next={...current,me:{...current.me,name:saved.name,region:saved.region,interest:saved.interest}};
      serverRevision.current++;liveRef.current=next;setLive(next);setHistoryRevision(n=>n+1);
      close();setToast("프로필을 저장했어요.");void refresh();
    }}/>}
    {modal.kind==="privatePhotos"&&<><h2>교환용 사진</h2><p className="sub">사진은 최대 10장까지 선택해 등록할 수 있어요. 사진을 교환한 상대에게는 나중에 추가한 사진도 보여요. 대화방에서 언제든 공유를 끝낼 수 있어요.</p><MyExchangePhotos/></>}
    {modal.kind==="setup"&&<><h2>회원 프로필 만들기</h2><p className="sub">닉네임과 활동 지역, 원하는 인연을 정해 주세요.</p><ProfileForm key="new" person={null} isNew busy={busy} onSave={async b=>{if(await act("participate",b,true)){go("profile");setToast("프로필을 저장했어요.");}}}/></>}
    {modal.kind==="block"&&peer&&<><span className="modalicon"><I n="shield"/></span><h2>{peer.name}님을 차단할까요?</h2><p className="sub">서로의 답변과 신호, 대화가 목록에서 사라져요. 이후 메시지도 보낼 수 없어요.</p><button className="primary wide" disabled={busy} onClick={async()=>{if(await act("block",{peer:peer.id})){go("today");setToast("프로필을 차단했어요.");}}}>차단하기</button><button className="textbtn" onClick={close}>취소</button></>}
    {modal.kind==="delete"&&<><h2>파장 기록을 삭제할까요?</h2><p className="sub">파장 프로필과 답변, 신호·대화·교환용 사진을 삭제해요. 삭제한 내용은 복구할 수 없으며, 오쭈다 계정은 유지돼요.</p><button className="primary wide" disabled={busy} onClick={async()=>{if(await act("delete",{})){location.replace("./");}}}>파장 기록 삭제</button><button className="textbtn" onClick={close}>취소</button></>}
    {modal.kind==="help"&&<><span className="modalicon"><I n="headphones"/></span><h2>파장 이용 안내</h2><div className="guidelist">{[["오전과 오후에 한 번씩 답해요","한국 시간 자정과 낮 12시에 새 질문이 열려요. 한 번 답하면 다음 질문이 열릴 때까지 바로 메인으로 들어가요."],["답변에 신호를 보내요","모두의 답변에서 공개 기간이 남아 있는 질문과 답을 함께 읽어 보세요. 내 답을 쓰기 전에도 마음에 드는 사람에게 하루 무료 신호 3개를 보낼 수 있어요."],["서로 닿으면 대화해요","받은 신호를 수락하면 두 사람의 대화방이 열려요. 상대 프로필에서 언제든 차단할 수 있어요."],["프로필과 사진을 교환해요","이 대화방에서 각자 메시지를 5개 이상 보낸 뒤 프로필이나 사진 교환을 신청할 수 있어요. 상대가 수락하면 서로 볼 수 있어요."]].map(([a,b],i)=><div key={a}><b>{i+1}</b><div><strong>{a}</strong><p>{b}</p></div></div>)}</div><button className="primary wide" onClick={close}>알겠어요</button></>}
    {error&&<p role="alert" className="error">{error}</p>}
  </Dialog>}</div></AnswerLikesProvider>;
}
