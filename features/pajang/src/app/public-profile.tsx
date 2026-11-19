import {useEffect,useState} from "react";
import {interests,type Person} from "../lib/station";
import {
  relationshipIntents,profilePreferenceGroups,emptyProfilePreferences,normalizeProfilePreferences,
  MAX_PROFILE_CUSTOM_LENGTH,MAX_PROFILE_GROUP_SELECTIONS,
} from "../lib/profile-preferences.mjs";
import regionCatalog from "../../regions.json";
import {InterestArt} from "./interest-art";
import {I} from "./icons";

type Preferences=ReturnType<typeof emptyProfilePreferences>;
type GroupKey="meeting_styles"|"relationship_values"|"affection_styles"|"life_priorities";
type PreferenceRead={scope:string;status:"loading"|"ready"|"error";preferences:Preferences;version:number};
const districts:Record<string,string[]>=regionCatalog;
const provinces=Object.keys(districts);
const blankDrafts=():Record<GroupKey,string>=>({meeting_styles:"",relationship_values:"",affection_styles:"",life_priorities:""});

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

function labelsFor(preferences:Preferences,key:GroupKey):string[]{
  const group=profilePreferenceGroups.find(group=>group.key===key)!;
  return [...group.options.filter(option=>preferences[key].includes(option.key)).map(option=>option.label),...preferences.custom[key]];
}
function addCustom(preferences:Preferences,key:GroupKey,draft:string):{preferences:Preferences;error:string}{
  const value=draft.trim();
  if(!value)return {preferences,error:""};
  if([...value].length>MAX_PROFILE_CUSTOM_LENGTH)return {preferences,error:"직접 입력은 40자까지 적어 주세요."};
  const preset=profilePreferenceGroups.find(group=>group.key===key)!.options.find(option=>option.label===value);
  if(preset?preferences[key].includes(preset.key):preferences.custom[key].includes(value))return {preferences,error:""};
  if(preferences[key].length+preferences.custom[key].length>=MAX_PROFILE_GROUP_SELECTIONS)return {preferences,error:"이 항목은 32개까지 고를 수 있어요."};
  return {preferences:preset?{...preferences,[key]:[...preferences[key],preset.key]}:
    {...preferences,custom:{...preferences.custom,[key]:[...preferences.custom[key],value]}},error:""};
}

function PreferenceFields({value,onChange,drafts,onDraft,onAdd,disabled}:{
  value:Preferences;onChange:(value:Preferences)=>void;drafts:Record<GroupKey,string>;
  onDraft:(key:GroupKey,value:string)=>void;onAdd:(key:GroupKey)=>void;disabled:boolean;
}){
  return <div className="preference-editor">
    <fieldset className="profile-intent-field" disabled={disabled}>
      <legend>원하는 인연</legend>
      <p className="preference-help">여러 개 골라도 괜찮아요. 선택한 내용은 파장 회원에게 보여요.</p>
      <div className="preference-chips intent-choices">{relationshipIntents.map(intent=><button key={intent.key} type="button"
        aria-pressed={value.relationship_intents.includes(intent.key)} title={intent.description}
        onClick={()=>onChange({...value,relationship_intents:value.relationship_intents.includes(intent.key)?value.relationship_intents.filter(key=>key!==intent.key):[...value.relationship_intents,intent.key]})}>
        {intent.label}</button>)}</div>
    </fieldset>
    <div className="preference-section-heading"><h3>나를 표현하는 취향</h3><span>모두 선택 사항</span></div>
    {profilePreferenceGroups.map(group=>{
      const key=group.key as GroupKey,selected=labelsFor(value,key);
      return <details className="preference-group" key={key} name="profile-preference-group">
        <summary><span><strong>{group.label}</strong><small>{selected.length?selected.slice(0,2).join(" · ")+(selected.length>2?` 외 ${selected.length-2}개`:""):"나와 맞는 보기를 골라 주세요"}</small></span><I n="chevron" s={16}/></summary>
        <fieldset className="preference-group-body" disabled={disabled} aria-label={group.label}>
          <div className="preference-chips">{group.options.map(option=>{
            const selected=value[key].includes(option.key);
            return <button type="button" key={option.key} aria-pressed={selected}
              disabled={!selected&&value[key].length+value.custom[key].length>=MAX_PROFILE_GROUP_SELECTIONS}
              onClick={()=>onChange({...value,[key]:selected?value[key].filter(item=>item!==option.key):[...value[key],option.key]})}>{option.label}</button>;
          })}</div>
          {value.custom[key].length>0&&<div className="preference-chips custom-choices">{value.custom[key].map(label=><button key={label} type="button" aria-label={label+" 삭제"} aria-pressed="true"
            onClick={()=>onChange({...value,custom:{...value.custom,[key]:value.custom[key].filter(item=>item!==label)}})}>{label}<I n="close" s={12}/></button>)}</div>}
          <div className="preference-custom"><input aria-label={group.label+" 직접 입력"} value={drafts[key]} placeholder="보기 외 항목 직접 추가"
            onChange={event=>onDraft(key,event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();onAdd(key);}}}/>
            <button type="button" aria-label={group.label+" 추가"} disabled={!drafts[key].trim()} onClick={()=>onAdd(key)}>추가</button></div>
        </fieldset>
      </details>;
    })}
  </div>;
}

export function ProfileForm({person,isNew,onSave,busy}:{person:Person|null;isNew:boolean;onSave:(value:Record<string,unknown>)=>void;busy:boolean}){
  const [name,setName]=useState(person?.name||""),[region,setRegion]=useState(person?.region||""),[interest,setInterest]=useState(person?.interest||""),[consent,setConsent]=useState(false);
  const read=usePublicPreferences(person?.id||"",person?.id||"",0,!isNew);
  const [preferences,setPreferences]=useState<Preferences>(emptyProfilePreferences);
  const [drafts,setDrafts]=useState(blankDrafts),[customError,setCustomError]=useState("");
  useEffect(()=>{
    if(read.status==="ready"){setPreferences(read.preferences);setDrafts(blankDrafts());setCustomError("");}
  },[read.scope,read.status]);
  const [province,city=""]=region.split(" ");
  const knownProvince=Object.hasOwn(districts,province);
  const previousRegion=person?.region;
  const legacyRegion=previousRegion&&!Object.hasOwn(districts,previousRegion.split(" ")[0]);
  const disabled=busy||read.status!=="ready";
  function add(key:GroupKey){
    const result=addCustom(preferences,key,drafts[key]);setCustomError(result.error);
    if(!result.error){setPreferences(result.preferences);setDrafts(previous=>({...previous,[key]:""}));}
  }
  function submit(event:React.FormEvent){
    event.preventDefault();if(disabled)return;
    let next=preferences;
    for(const group of profilePreferenceGroups){
      const key=group.key as GroupKey,result=addCustom(next,key,drafts[key]);
      if(result.error){setCustomError(result.error);return;}
      next=result.preferences;
    }
    setPreferences(next);setDrafts(blankDrafts());setCustomError("");
    onSave({name:name.trim(),region,interest,consent,profilePerson:person?.id??null,preferences:next,preferencesVersion:read.version});
  }
  return <form className="profileform public-profile-form" onSubmit={submit}>
    <label>닉네임<input value={name} maxLength={12} placeholder="오쭈다 닉네임 사용" disabled={busy} onChange={event=>setName(event.target.value)}/></label>
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
    {read.status==="ready"&&<PreferenceFields value={preferences} onChange={setPreferences} drafts={drafts}
      onDraft={(key,value)=>{setDrafts(previous=>({...previous,[key]:value}));setCustomError("");}} onAdd={add} disabled={busy}/>}
    {customError&&<p className="error" role="alert">{customError}</p>}
    <details className="preference-group profile-art-choice"><summary><span><strong>대표 취향 · 프로필 그림</strong><small>{interests.find(option=>option.key===interest)?.name||"선택하지 않음"}</small></span><I n="chevron" s={16}/></summary>
      <fieldset disabled={busy} aria-label="대표 취향"><div className="interestgrid">{interests.map(option=><button type="button" key={option.key} className={interest===option.key?"selected":""} aria-pressed={interest===option.key} onClick={()=>setInterest(interest===option.key?"":option.key)}><InterestArt interest={option.key}/>{option.name}</button>)}</div></fieldset>
    </details>
    {isNew&&<label className="checkrow"><input type="checkbox" required disabled={busy} checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>만 19세 이상이며 파장 회원에게 닉네임과 내가 선택한 공개 정보를 보여 주는 데 동의해요.</span></label>}
    <button className="primary wide" disabled={disabled||(isNew&&!consent)}>{isNew?"회원 채널 시작하기":"프로필 저장"}<I n="arrow" s={16}/></button>
  </form>;
}

export function PublicProfilePreferences({viewer,person,revision=0,onEdit}:{viewer:string;person:string;revision?:number;onEdit?:()=>void}){
  const read=usePublicPreferences(viewer,person,revision);
  const selectedIntents=relationshipIntents.filter(intent=>read.preferences.relationship_intents.includes(intent.key));
  const selectedGroups=profilePreferenceGroups.map(group=>({...group,labels:labelsFor(read.preferences,group.key as GroupKey)})).filter(group=>group.labels.length);
  return <section className="public-preference-summary" aria-label="공개 프로필">
    <div className="preference-section-heading"><h3>공개 프로필</h3>{onEdit&&<button type="button" onClick={onEdit}>수정<I n="pencil" s={13}/></button>}</div>
    <ReadStatus read={read}/>
    {read.status==="ready"&&<>
      {selectedIntents.length>0&&<div className="public-intents"><h4>원하는 인연</h4><div className="preference-tags">{selectedIntents.map(intent=><span key={intent.key}>{intent.label}</span>)}</div></div>}
      {selectedGroups.map(group=><details key={group.key} className="preference-group public-preference-group"><summary><span><strong>{group.label}</strong><small>{group.labels.slice(0,2).join(" · ")}{group.labels.length>2?` 외 ${group.labels.length-2}개`:""}</small></span><I n="chevron" s={16}/></summary><div className="preference-tags">{group.labels.map(label=><span key={label}>{label}</span>)}</div></details>)}
      {!selectedIntents.length&&!selectedGroups.length&&<p className="preference-help">{onEdit?"원하는 인연과 나다운 취향을 골라 보세요.":"아직 선택한 소개가 없어요."}</p>}
    </>}
  </section>;
}
