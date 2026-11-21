"use client";
import { useEffect, useRef, useState } from "react";
import { introDetails, themeFor, type NearbyAnswer, type NearbyPerson, type Station } from "../lib/station";
import { compassDirections, directionName, radarPosition, rangeNames, type RadarBand, type RadarCell } from "../lib/radar";
import {radarBands as bands, radarMarkers} from "../lib/radar-markers";
import {InterestArt} from "./interest-art";
import { I } from "./icons";
import { useCompass } from "./use-compass";
import {readLocationCell} from "../../location.mjs";

type LocatedPerson = NearbyPerson & { range: RadarBand };
type Props = {
  station: Station;
  sample: boolean;
  autoLocation?: {pending:boolean;message:string};
  onLocationChange?: () => void;
  onProfile: (id: string, answer?: NearbyAnswer) => void;
  onJoin: () => void;
  onSettings: (cell: RadarCell | null, accountId: string) => Promise<boolean>;
};

function bearingLabel(person: LocatedPerson) {
  if (person.bearing !== undefined) return directionName(person.bearing) + "쪽";
  return person.sameCell ? "같은 위치 구역" : "방향 비공개";
}

function Grid({heading}:{heading:number}){
  return <svg aria-hidden="true" className="radar-grid" viewBox="0 0 400 400">
    <defs>
      <radialGradient id="scope-glow"><stop offset="0" stopColor="#f6f7ea"/><stop offset="1" stopColor="#dfe9d6"/></radialGradient>
      <linearGradient id="scope-sweep" gradientUnits="userSpaceOnUse" x1="40.7" y1="96.5" x2="110.8" y2="32.2"><stop stopColor="#b9cea1" stopOpacity=".06"/><stop offset="1" stopColor="#82a07a" stopOpacity=".58"/></linearGradient>
    </defs>
    <circle cx="200" cy="200" r="196" fill="url(#scope-glow)"/>
    <g className="radar-compass" transform={`rotate(${-heading} 200 200)`}>
      {Array.from({length:60},(_,i)=><line key={i} x1="200" y1="4" x2="200" y2={i%5===0?"12":"8"}
        transform={`rotate(${i*6} 200 200)`} stroke="#8b9c83" strokeOpacity={i%5===0?".8":".45"}/>)}
      {[0,45,90,135].map(deg=><line key={deg} x1="17" y1="200" x2="383" y2="200" transform={`rotate(${deg} 200 200)`} stroke="#859b79" strokeOpacity=".23" strokeWidth=".9"/>)}
      <path d="m200 3 -3.5 8 h7 Z" fill="#a56962"/>
    </g>
    <g className="radar-sweep">
      <path d="M200 200 L40.7 96.5 A190 190 0 0 1 110.8 32.2 Z" fill="url(#scope-sweep)"/>
      <path d="M200 200 L110.8 32.2" stroke="#78936d" strokeOpacity=".63" strokeWidth="1.3"/>
    </g>
    {bands.map(b=><g key={b.limit}><circle cx="200" cy="200" r={b.ring} fill="none" stroke="#9aab90" strokeOpacity=".49" strokeWidth="1"/>
      <text x="200" y={200-b.ring+(b.limit===15?23:11)} textAnchor="middle" fill="#52664c" fontSize="10" fontWeight="650" stroke="#eef2e6" strokeWidth="3" paintOrder="stroke">{b.limit}km</text></g>)}
    <g className="radar-bearings" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" stroke="#edf2e7" strokeWidth="3" paintOrder="stroke" pointerEvents="none">
      {compassDirections.map((label,i)=>{
        const {x,y}=radarPosition(i*45,heading,184);
        return <text key={label} x={x+"%"} y={y+"%"} fill={i===0?"#874448":"#40593d"}>{label}</text>;
      })}
    </g>
  </svg>;
}

export default function NearbyRadar({station,sample,autoLocation,onLocationChange,onProfile,onJoin,onSettings}:Props){
  const [selected,setSelected]=useState(""),[page,setPage]=useState(0);
  const [pending,setPending]=useState(false),[feedback,setFeedback]=useState("");
  const message=feedback||autoLocation?.message||(!autoLocation?station.locationNotice:"");
  const alive=useRef(true), working=useRef(false);
  const locationRead=useRef<AbortController|null>(null);
  const [locating,setLocating]=useState(false);
  useEffect(()=>{
    alive.current=true;
    const cancel=()=>locationRead.current?.abort();
    window.addEventListener('pagehide',cancel);
    return()=>{alive.current=false;cancel();window.removeEventListener('pagehide',cancel);};
  },[]);
  const candidates:NearbyPerson[]=station.nearbyPeople??station.people;
  const located=candidates.filter((p):p is LocatedPerson=>
    (sample||(station.locationEnabled!==false&&Boolean(station.radarOn)))&&Boolean(p.range&&
      (p.answers?p.answers.some(answer=>Boolean(answer.body)):p.body)));
  const grouped=bands.map(b=>located.filter(p=>p.range===b.limit));
  const pageCount=Math.max(1,...grouped.map(group=>Math.ceil(group.length/3)));
  const current=Math.min(page,pageCount-1);
  const compass=useCompass();
  const heading=compass.heading ?? 0;
  const visible=grouped.flatMap(group=>group.slice(current*3,current*3+3));
  const person=visible.find(p=>p.id===selected)||visible[0];
  const answers=person?.answers??(person?.body?[{day:station.day,slot:station.slot,
    question:(station.question??themeFor(station.day,station.slot)).q.join(" "),body:person.body,at:person.at??0}]:[]);
  const markers=radarMarkers(visible,heading);
  const enabled=sample||station.locationEnabled!==false;
  const locatedNow=sample||Boolean(station.radarOn);

  async function toggleLocation(enable:boolean){
    if(working.current)return;
    onLocationChange?.();
    working.current=true;setPending(true);setFeedback("");
    const controller=new AbortController();locationRead.current=controller;
    try {
      const db=await window.OjjudaGetClient();
      const {data:{session}}=await db.auth.getSession();
      if(!alive.current||controller.signal.aborted)return;
      if(!session?.user||session.user.is_anonymous)throw Error("회원 정보를 다시 확인해 주세요.");
      let cell:RadarCell|null=null;
      if(enable){
        setLocating(true);
        cell=await readLocationCell({db,accountId:session.user.id,allowDisabled:true,signal:controller.signal,fresh:true,
          onProgress:(message:string)=>{if(alive.current)setFeedback(message);}});
        setLocating(false);
      }
      if(!alive.current||controller.signal.aborted)return;
      setFeedback("설정을 저장하고 있어요.");
      if(!await onSettings(cell,session.user.id))throw Error("설정을 저장하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.");
      if(alive.current)setFeedback(enable?"위치 공개를 켰어요.":"위치를 숨겼어요. 다음에도 이 설정이 유지돼요.");
    }catch(e){if(alive.current)setFeedback(e instanceof Error&&e.name==='AbortError'?"위치 확인을 취소했어요. 기존 설정은 그대로예요.":e instanceof Error?e.message:"다시 시도해 주세요.");}
    finally{controller.abort();locationRead.current=null;working.current=false;if(alive.current){setPending(false);setLocating(false);}}
  }

  return <section className="nearby-section" aria-labelledby="nearby-title">
    <div className="nearby-heading"><div><div className="onrow"><span className="onair"><i/>{sample?"DEMO":"RADAR"}</span><span className="questionlabel">{sample?"예시 거리·방향":"주변 거리·방향"}</span></div><h1 id="nearby-title">주변 레이더</h1><p>{sample?"예시 답변으로 주변 레이더를 둘러보세요.":"현재 질문과 지난 질문 2개의 답변을 함께 보여요."}</p></div></div>
    {!sample&&<div className="radar-location-setting"><div><strong id="location-switch-label">내 위치 공개</strong><p>공원과 함께 적용돼요. 설정은 바꿀 때까지 유지돼요.</p></div>
      <button type="button" role="switch" aria-labelledby="location-switch-label" aria-checked={enabled} disabled={pending||!station.me} onClick={()=>void toggleLocation(!enabled)}><span aria-hidden="true"/></button></div>}
    {message&&<div className="radar-location-feedback"><p className="radar-feedback" role="status">{message}</p>{locating&&<button type="button" className="secondary small" onClick={()=>locationRead.current?.abort()}>위치 확인 취소</button>}</div>}
    <div className="radar-layout">
      <div className="dial-panel">
        <div className="dial-info"><span><i/> {sample?"체험 채널":"회원 채널"}</span><span>반경 약 15km</span></div>
        <div className="radar-scope" role="group" aria-label="거리와 방위별 프로필">
          <Grid heading={heading}/>
          <svg className="radar-links" aria-hidden="true" viewBox="0 0 100 100">
            {markers.map(({person:p,x,y,anchor})=>anchor&&<g key={p.id} opacity={Math.hypot(x-anchor.x,y-anchor.y)>2?1:0}>
              <line data-person-id={p.id} x1={anchor.x} y1={anchor.y} x2={x} y2={y}/>
              <circle cx={anchor.x} cy={anchor.y} r=".65"/>
            </g>)}
          </svg>
          <span className="scope-self">나</span>
          {markers.map(({person:p,x,y,anchor,compact})=>{
            const label=p.name+", "+bearingLabel(p)+", "+rangeNames[p.range];
            const picked=p.id===person?.id;
            return <button key={p.id} type="button" className={"scope-person"+(!anchor?" scope-same-cell":"")+(compact?" scope-person-compact":"")+(picked?" picked":"")} style={{left:x+"%",top:y+"%"}}
              aria-label={label+", 답변 보기"} aria-pressed={picked} onClick={()=>setSelected(p.id)}>
              <span className="scope-person-name" aria-hidden="true" hidden={compact}>{Array.from(p.name.trim())[0]}</span>
              {compact&&<span className="scope-person-dot" aria-hidden="true"/>}
            </button>;
          })}

        </div>
        <div className="compass-controls"><div><b>{compass.heading===null?"북쪽 고정":"화면 위 · "+directionName(heading)+"쪽"}</b><p>{compass.status==="off"?"휴대폰을 돌리는 방향에 맞춰 보세요.":compass.message}</p></div>
          {compass.status==="on"||compass.status==="waiting"?<button onClick={compass.stop}>북쪽 고정하기</button>:<button onClick={()=>void compass.start()}>휴대폰 방향 켜기</button>}</div>
        <div className="dial-foot"><span><I n="shield" s={14}/> {sample?"예시 방위 · 표식은 펼쳐 표시해요.":"8방위 기준 · 표식은 펼쳐 표시해요."}</span>{pageCount>1?<div className="scope-pages"><button aria-label="이전 레이더 페이지" disabled={current===0} onClick={()=>setPage(current-1)}>‹</button>{current+1}/{pageCount}<button aria-label="다음 레이더 페이지" disabled={current+1===pageCount} onClick={()=>setPage(current+1)}>›</button></div>:<span>{!enabled?'위치 숨김':locatedNow?'주변 '+located.length+'명':'위치 확인 필요'}</span>}</div>
      </div>
      <div className="radar-details" aria-live="polite">
        {person?<><div className="radar-kicker"><I n="signal" s={16}/>{rangeNames[person.range]} · {bearingLabel(person)}</div><div className="radar-identity"><InterestArt interest={person.interest} large/><div><h2>{person.name}</h2><p>{introDetails(person)}</p></div></div>
          <div className="radar-answer-list" aria-label="이 회원의 최근 답변">{answers.map(answer=><article className="radar-answer" key={answer.day+"/"+answer.slot}>
            <div className="radar-answer-meta"><time dateTime={answer.day}>{answer.day.replaceAll("-", ".")} · {answer.slot==="am"?"오전":"오후"}</time>{answer.day===station.day&&answer.slot===station.slot&&<span>현재 질문</span>}</div>
            <h3 className="radar-answer-question">{answer.question}</h3><p className="radar-quote">{answer.body}</p>
          </article>)}</div><button className="primary radar-primary" onClick={()=>onProfile(person.id,person.answers?.[0])}>공개 정보 보기<I n="arrow" s={17}/></button>
          {visible.length>1&&<div className="radar-alternates"><h3>주변 사람</h3><div>{visible.map(p=><button className={p.id===person.id?"sel":""} key={p.id} aria-pressed={p.id===person.id} onClick={()=>setSelected(p.id)}>{p.name}</button>)}</div></div>}</>:
          <div className="radar-empty"><span className="modalicon"><I n="pin" s={23}/></span><h2>{!enabled?"위치를 숨겼어요":locatedNow?"아직 주변 답변이 없어요":"현재 위치를 확인해 주세요"}</h2><p>{!enabled?"위 스위치를 켜면 주변 인연을 찾을 수 있어요.":locatedNow?"위치를 공개한 주변 회원이 최근 질문 3개 중 하나에 답하면 나타나요.":"위치가 확인되면 주변 인연을 보여 드려요."}</p>
          {enabled&&!locatedNow&&<button className="primary" disabled={pending||autoLocation?.pending} onClick={()=>void toggleLocation(true)}>{pending||autoLocation?.pending?"위치 확인 중…":"위치 다시 확인"}</button>}</div>}

      </div>
    </div>
    <div className="radar-consent"><I n="info" s={16}/><span>{sample?"샘플의 거리와 방위는 예시예요. 휴대폰 방향만 기기에서 읽어요.":"위치는 약 1km 구역으로 바꿔요. 위치 공개를 켜 두면 다시 들어올 때 현재 위치를 확인해요."}</span></div>
  </section>;
}
