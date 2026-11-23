import {useEffect,useState} from "react";
import {type Person} from "../lib/station";
import {
  relationshipIntents,profilePreferenceGroups,emptyProfilePreferences,normalizeProfilePreferences,
} from "../lib/profile-preferences.mjs";
import regionCatalog from "../../regions.json";
import {textInputMaxLength} from "../../../../shared/content/text-length.mjs";
import {tasteLabels} from "./profile-tastes";
import {I} from "./icons";

type Preferences=ReturnType<typeof emptyProfilePreferences>;
type GroupKey="meeting_styles"|"relationship_values"|"affection_styles"|"life_priorities";
type PreferenceRead={scope:string;status:"loading"|"ready"|"error";preferences:Preferences;version:number};
const districts:Record<string,string[]>=regionCatalog;
const provinces=Object.keys(districts);

function usePublicPreferences(viewer:string,person:string,revision=0,enabled=true){
  const [attempt,setAttempt]=useState(0);
  const scope=JSON.stringify([viewer,person,revision,attempt]);
  const pending:PreferenceRead={scope,status:enabled?"loading":"ready",preferences:emptyProfilePreferences(),version:0};
  const [result,setResult]=useState<PreferenceRead>(pending);
  useEffect(()=>{
    if(!enabled)return;
    let active=true;
    const controller=new AbortController();
    setResult({scope,status:"loading",preferences:emptyProfilePreferences(),version:0});
    void (async()=>{
      try{
        if(!viewer||!person)throw new Error("missing profile");
        const db=await window.OjjudaGetClient();
        if(!active)return;
        const query=db.rpc("pajang_profile_preferences",{p_peer:person===viewer?null:person});
        const {data,error}=await (typeof query.abortSignal==="function"?query.abortSignal(controller.signal):query);
        if(!active)return;
        if(error||data?.person!==person||!Number.isSafeInteger(data?.version)||data.version<0||!data.preferences)throw error||new Error("invalid profile");
        setResult({scope,status:"ready",preferences:normalizeProfilePreferences(data.preferences),version:data.version});
      }catch{
        if(active)setResult({scope,status:"error",preferences:emptyProfilePreferences(),version:0});
      }
    })();
    return()=>{active=false;controller.abort();};
  },[scope,enabled]);
  return {...(enabled&&result.scope===scope?result:pending),reload:()=>setAttempt(n=>n+1)};
}

function ReadStatus({read}:{read:ReturnType<typeof usePublicPreferences>}){
  return read.status==="loading"?<p className="preference-status" role="status">프로필 선택항목을 불러오고 있어요.</p>:
    read.status==="error"?<div className="preference-status" role="alert"><p>프로필 선택항목을 불러오지 못했어요.</p><button type="button" className="textbtn" onClick={read.reload}>다시 불러오기</button></div>:null;
}

export function ProfileForm({person,isNew,onSave,busy}:{person:Person|null;isNew:boolean;onSave:(value:Record<string,unknown>)=>void;busy:boolean}){
  const [name,setName]=useState(person?.name||""),[region,setRegion]=useState(person?.region||""),[consent,setConsent]=useState(false);
  const read=usePublicPreferences(person?.id||"",person?.id||"",0,!isNew);
  const [preferenceDraft,setPreferenceDraft]=useState(()=>({scope:"",value:emptyProfilePreferences()}));
  const preferences=preferenceDraft.value;
  const setPreferences=(value:Preferences)=>setPreferenceDraft(previous=>({...previous,value}));
  useEffect(()=>{
    if(read.status==="ready"){setPreferenceDraft({scope:read.scope,value:read.preferences});}
  },[read.scope,read.status]);
  const [province,city=""]=region.split(" ");
  const knownProvince=Object.hasOwn(districts,province);
  const previousRegion=person?.region;
  const legacyRegion=previousRegion&&!Object.hasOwn(districts,previousRegion.split(" ")[0]);
  const choicesReady=read.status==="ready"&&preferenceDraft.scope===read.scope;
  const disabled=busy||!choicesReady;
  function submit(event:React.FormEvent){
    event.preventDefault();if(disabled)return;
    onSave({name:name.trim(),region,consent,profilePerson:person?.id??null,
      preferences:{relationship_intents:preferences.relationship_intents},preferencesVersion:read.version});
  }
  return <form className="profileform public-profile-form" onSubmit={submit}>
    <label>닉네임<input value={name} maxLength={textInputMaxLength(name,12)} placeholder="오쭈다 닉네임 사용" disabled={busy} onChange={event=>setName(event.target.value)}/></label>
    <div className="fieldrow">
      <label>공개할 활동 지역<select value={knownProvince?province:region} disabled={busy} onChange={event=>setRegion(event.target.value)}>
        <option value="">공개하지 않음</option>
        {legacyRegion&&<option value={previousRegion}>기존 지역 · {previousRegion}</option>}
        {provinces.map(name=><option key={name}>{name}</option>)}
      </select></label>
      {knownProvince&&districts[province].length>0&&<label>시·군 (선택)<select value={city} disabled={busy} onChange={event=>setRegion(event.target.value?province+" "+event.target.value:province)}>
        <option value="">시·도만 표시</option>{districts[province].map(name=><option key={name}>{name}</option>)}
      </select></label>}
    </div>
    <ReadStatus read={read}/>
    {choicesReady&&<fieldset className="profile-intent-field" disabled={busy}>
      <legend>원하는 인연</legend>
      <p className="preference-help">여러 개 골라도 괜찮아요. 선택한 내용은 파장 회원에게 보여요.</p>
      <div className="preference-chips intent-choices">{relationshipIntents.map(intent=><button key={intent.key} type="button"
        aria-label={intent.label} aria-pressed={preferences.relationship_intents.includes(intent.key)} title={intent.description}
        onClick={()=>setPreferences({...preferences,relationship_intents:preferences.relationship_intents.includes(intent.key)?preferences.relationship_intents.filter(key=>key!==intent.key):[...preferences.relationship_intents,intent.key]})}>
        {intent.label}</button>)}</div>
    </fieldset>}
    {isNew&&<label className="checkrow"><input type="checkbox" required disabled={busy} checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>만 19세 이상이며 파장 회원에게 닉네임과 내가 선택한 공개 정보를 보여 주는 데 동의해요.</span></label>}
    <button className="primary wide" disabled={disabled||(isNew&&!consent)}>{isNew?"회원 채널 시작하기":"프로필 저장"}<I n="arrow" s={16}/></button>
  </form>;
}

export function PublicProfilePreferences({viewer,person,revision=0,onEdit,onEditTastes}:{viewer:string;person:string;revision?:number;onEdit?:()=>void;onEditTastes?:()=>void}){
  const read=usePublicPreferences(viewer,person,revision);
  const selectedIntents=relationshipIntents.filter(intent=>read.preferences.relationship_intents.includes(intent.key));
  const selectedGroups=profilePreferenceGroups.map(group=>({...group,labels:tasteLabels(read.preferences,group.key as GroupKey)})).filter(group=>group.labels.length);
  return <section className="public-preference-summary" aria-label="공개 프로필">
    <div className="preference-section-heading"><h3>공개 프로필</h3>{onEdit&&<button type="button" onClick={onEdit}>기본 정보 수정<I n="pencil" s={13}/></button>}</div>
    <ReadStatus read={read}/>
    {read.status==="ready"&&<>
      {selectedIntents.length>0&&<div className="public-intents"><h4>원하는 인연</h4><div className="preference-tags">{selectedIntents.map(intent=><span key={intent.key}>{intent.label}</span>)}</div></div>}
      <section className="public-profile-tastes" aria-label="나를 표현하는 취향">
        <div className="public-tastes-heading"><h4>나를 표현하는 취향</h4>{onEditTastes&&<button type="button" onClick={onEditTastes}>취향·그림 수정<I n="pencil" s={13}/></button>}</div>
        {selectedGroups.length?selectedGroups.map(group=><div key={group.key} className="public-preference-group"><h5>{group.label}</h5><div className="preference-tags">{group.labels.map(label=><span key={label}>{label}</span>)}</div></div>):
          <p className="preference-help">{onEditTastes?"취향·그림 수정에서 나와 맞는 보기를 골라 보세요.":"아직 선택한 취향이 없어요."}</p>}
      </section>
    </>}
  </section>;
}
