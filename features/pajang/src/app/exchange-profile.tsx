import {useEffect, useRef, useState} from "react";
import regionCatalog from "../../regions.json";
import {maskedTextLength,textInputMaxLength} from "../../../../shared/content/text-length.mjs";
import {normalizeProfilePreferences,profilePreferenceGroups,type ProfilePreferences,type PreferenceGroupKey} from "../lib/profile-preferences.mjs";
import {ProfileTastesFields,blankTasteDrafts,addTaste,prepareTastes,tastePatch} from "./profile-tastes";

export type ExchangeKind = "profile"|"photos";
type Fields = Partial<Record<"relationship"|"job"|"region"|"religion"|"height"|"mbti"|"bloodType"|"skills"|"hobbies"|"drinking"|"smoking"|"bio",string|number>>;
export type SharedProfile = {fields: Fields; age:number|null; gender:string|null};
type MyProfile = SharedProfile & {showAge:boolean; showGender:boolean;person:string;interest:string;preferences:ProfilePreferences;preferencesVersion:number};
type SavedProfile = MyProfile & {masking?:Partial<Record<keyof Fields,{submitted:unknown;saved:unknown}>>};

function confirmedMask(receipt:SavedProfile["masking"],key:keyof Fields,submitted:string,saved:string) {
  const field=receipt?.[key];
  return Boolean(submitted&&saved.includes("❤️❤️")&&field&&
    field.submitted===submitted&&field.saved===saved);
}

export async function exchange<T>(action:string, options:{p_peer?:string; p_kind?:ExchangeKind; p_data?:object}={}):Promise<T> {
  const db=await window.OjjudaGetClient();
  const {data,error}=await db.rpc("pajang_exchange",{p_action:action,...options});
  if(error) throw Object.assign(new Error(error.message),{code:error.code});
  return data as T;
}

async function profileDetails(action:"mine"|"save",person:string,data:object={}):Promise<SavedProfile>{
  const db=await window.OjjudaGetClient();
  const {data:profile,error}=await db.rpc("pajang_profile_details",{p_action:action,p_data:data});
  if(error)throw Object.assign(new Error(error.message),{code:error.code});
  if(!profile||profile.person!==person||!profile.fields||typeof profile.fields!=="object"||Array.isArray(profile.fields)
    ||typeof profile.showAge!=="boolean"||typeof profile.showGender!=="boolean"||typeof profile.interest!=="string"
    ||!Number.isSafeInteger(profile.preferencesVersion)||profile.preferencesVersion<0
    ||!Array.isArray(profile.preferences?.relationship_intents)
    ||!profilePreferenceGroups.every(group=>Array.isArray(profile.preferences?.[group.key])&&Array.isArray(profile.preferences?.custom?.[group.key])))
    throw new Error(action==="save"?"저장 결과를 확인하지 못했어요. 다시 시도해 주세요.":"프로필을 불러오지 못했어요. 다시 시도해 주세요.");
  return {...profile,preferences:normalizeProfilePreferences(profile.preferences)};
}

const regions:Record<string,string[]>=regionCatalog;
const labels:{key:keyof Fields; label:string; options?:readonly string[]; limit?:number}[]=[
  {key:"relationship",label:"결혼 이력",options:["싱글","돌싱"]},
  {key:"job",label:"직업"},{key:"region",label:"사는 지역"},{key:"religion",label:"종교"},
  {key:"height",label:"키"},{key:"mbti",label:"MBTI",options:["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"]},
  {key:"bloodType",label:"혈액형",options:["A","B","O","AB"]},
  {key:"skills",label:"특기",limit:160},{key:"hobbies",label:"취미",limit:160},
  {key:"drinking",label:"음주 여부",options:["마시지 않아요","가끔 마셔요","자주 마셔요"]},
  {key:"smoking",label:"흡연 여부",options:["피우지 않아요","가끔 피워요","피워요"]},
  {key:"bio",label:"자기소개",limit:1000}
];

function RegionField({value,onChange}:{value:string; onChange:(value:string)=>void}) {
  const province=value.split(" ")[0], city=value.slice(province.length).trim();
  const cities=regions[province]||[];
  return <div className="exchange-region">
    <label>사는 지역<select aria-label="사는 지역 시·도" value={province} onChange={e=>onChange(e.target.value)}>
      <option value="">미입력</option>
      {province&&!Object.hasOwn(regions,province)&&<option value={province}>{province}</option>}
      {Object.keys(regions).map(name=><option key={name}>{name}</option>)}
    </select></label>
    {!!cities.length&&<label>시·군<select value={city} onChange={e=>onChange([province,e.target.value].filter(Boolean).join(" "))}>
      <option value="">시·도만 표시</option>
      {city&&!cities.includes(city)&&<option value={city}>{city}</option>}
      {cities.map(name=><option key={name}>{name}</option>)}
    </select></label>}
  </div>;
}

export function PeerProfile({profile}:{profile:SharedProfile}) {
  const items:[string,string][]=[];
  if(profile.age!=null)items.push(["나이",`만 ${profile.age}세`]);
  if(profile.gender)items.push(["성별",profile.gender]);
  for(const field of labels) {
    const val=profile.fields[field.key];
    if(val!==undefined&&val!==null&&String(val).trim())items.push([field.label,String(val)+(field.key==="height"?" cm":field.key==="bloodType"?"형":"")]);
  }
  return items.length?<dl className="exchange-facts">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>:<p className="sub">상대가 교환용 프로필에 작성한 항목이 아직 없어요.</p>;
}

export function ExchangeProfileEditor({profileId,focusTastes=false,onSaved}:{profileId:string;focusTastes?:boolean;onSaved:(profile:SavedProfile)=>void}) {
  const [profile,setProfile]=useState<MyProfile|null>(null);
  const [drafts,setDrafts]=useState(blankTasteDrafts);
  const [error,setError]=useState(""),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
  const saving=useRef(false),mounted=useRef(false);
  const errorMessage=useRef<HTMLParagraphElement>(null);
  const tastes=useRef<HTMLElement>(null),focusedTastes=useRef(false);
  const profileReady=profile?.person===profileId;
  useEffect(()=>{
    mounted.current=true;
    let current=true;
    setError("");setProfile(null);setDrafts(blankTasteDrafts());focusedTastes.current=false;
    profileDetails("mine",profileId).then(value=>{if(current)setProfile(value);})
      .catch(()=>{if(current)setError("교환용 프로필을 불러오지 못했어요.");});
    return ()=>{current=false;mounted.current=false;};
  },[profileId,retry]);
  useEffect(()=>{
    if(!focusTastes||!profileReady||focusedTastes.current)return;
    focusedTastes.current=true;
    tastes.current?.focus({preventScroll:true});
    tastes.current?.scrollIntoView({block:"start"});
  },[focusTastes,profileReady]);
  useEffect(()=>{
    if(!error||!profile)return;
    errorMessage.current?.focus({preventScroll:true});
    errorMessage.current?.scrollIntoView({block:"nearest"});
  },[error,profile]);
  function change(key:keyof Fields,value:string) {
    setError("");
    setProfile(prior=>prior?{...prior,fields:{...prior.fields,[key]:value}}:prior);
  }
  function add(key:PreferenceGroupKey){
    if(!profileReady||!profile||busy)return;
    const result=addTaste(profile.preferences,key,drafts[key]);setError(result.error);
    if(!result.error){setProfile({...profile,preferences:result.preferences});setDrafts(previous=>({...previous,[key]:""}));}
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();
    if(!profileReady||!profile||saving.current)return;
    if(!(event.currentTarget as HTMLFormElement).reportValidity())return;
    const prepared=prepareTastes(profile.preferences,drafts);
    if(prepared.error){setError(prepared.error);return;}
    saving.current=true;setBusy(true);setError("");
    const fields=Object.fromEntries(Object.entries(profile.fields).map(([k,v])=>[k,String(v??"").trim()]).filter(([,v])=>v));
    if(fields.height)fields.height=String(Number(fields.height));
    try {
      const saved=await profileDetails("save",profileId,{profilePerson:profileId,
        fields,showAge:profile.showAge,showGender:profile.showGender,interest:profile.interest,
        preferences:tastePatch(prepared.preferences),preferencesVersion:profile.preferencesVersion});
      const changed=labels.filter(({key})=>{
        const expected=String(fields[key]??"");
        const actual=String(saved.fields[key]??"");
        if(key==="height"&&expected&&actual)return Number(expected)!==Number(actual);
        if((key==="mbti"||key==="bloodType")&&expected.toUpperCase()===actual.toUpperCase())return false;
        // Only an explicit receipt for this submitted field can explain a changed value.
        // Missing fields and unrelated server changes remain save failures.
        return expected!==actual&&!confirmedMask(saved.masking,key,expected,actual);
      }).map(({label})=>label);
      if(saved.showAge!==profile.showAge)changed.push("나이 공개 설정");
      if(saved.showGender!==profile.showGender)changed.push("성별 공개 설정");
      if(changed.length)
        throw new Error(`${changed.join(", ")} 항목이 저장되지 않았어요. 입력 내용은 이 창에 남겨 뒀어요.`);
      if(mounted.current){setProfile(saved);setDrafts(blankTasteDrafts());onSaved(saved);}
    } catch(err) {
      if(mounted.current)setError(err instanceof Error?err.message:"저장하지 못했어요. 다시 시도해 주세요.");
    } finally {saving.current=false;if(mounted.current)setBusy(false);}
  }
  return <><h2>교환용 프로필</h2><p className="sub">취향과 프로필 그림은 공개 프로필에, 나머지 입력 정보는 프로필을 교환한 상대에게 보여요. 교환용 정보 공유는 대화방에서 끝낼 수 있어요.</p>
    {error&&!profileReady&&<p className="error" role="alert">{error} <button className="quiet" onClick={()=>setRetry(n=>n+1)}>다시 시도</button></p>}
    {!profileReady&&!error&&<p className="sub" role="status">회원정보와 취향을 확인하고 있어요.</p>}
    {profileReady&&profile&&<form className="profileform exchange-editor" onSubmit={save} onInvalidCapture={event=>{
      event.preventDefault();
      const input=event.target as HTMLInputElement;
      setError(input.name==="height"?"키는 1~300cm 사이의 숫자로 입력해 주세요.":"입력한 내용을 확인해 주세요.");
    }}>
      <fieldset disabled={busy}><legend>오쭈다 회원정보</legend>
        <p className="exchange-hint">교환용 프로필에 포함할 항목을 선택하세요.</p>
        <label className="exchange-check"><input type="checkbox" disabled={profile.age==null} checked={profile.age!=null&&profile.showAge} onChange={e=>setProfile({...profile,showAge:e.target.checked})}/><span>나이</span><b>{profile.age==null?"연동 정보 없음":`만 ${profile.age}세`}</b></label>
        <label className="exchange-check"><input type="checkbox" disabled={!profile.gender} checked={!!profile.gender&&profile.showGender} onChange={e=>setProfile({...profile,showGender:e.target.checked})}/><span>성별</span><b>{profile.gender||"연동 정보 없음"}</b></label>
      </fieldset>
      <fieldset className="exchange-grid" disabled={busy}><legend>선택 항목</legend>
        {labels.filter(field=>field.key!=="bio").map(({key,label,options,limit})=>{
          const value=String(profile.fields[key]??"");
          if(key==="region")return <RegionField key={key} value={value} onChange={v=>change(key,v)}/>;
          return <label key={key}>{key==="height"?"키 (cm)":label}
            {options?<select value={value} onChange={e=>change(key,e.target.value)}><option value="">미입력</option>{value&&!options.includes(value)&&<option>{value}</option>}{options.map(v=><option key={v} value={v}>{key==="bloodType"?v+"형":v}</option>)}</select>:
             key==="height"?<input name="height" type="number" inputMode="decimal" min={1} max={300} step="any" value={value} onChange={e=>change(key,e.target.value)}/>:
             <input maxLength={textInputMaxLength(value,limit||80)} value={value} onChange={e=>change(key,e.target.value)}/>}</label>;
        })}
      </fieldset>
      <section ref={tastes} className="exchange-tastes" aria-label="나를 표현하는 취향" tabIndex={-1}>
        <ProfileTastesFields value={profile.preferences} interest={profile.interest} disabled={busy}
          onInterest={interest=>{setError("");setProfile({...profile,interest});}}
          onChange={preferences=>{setError("");setProfile({...profile,preferences});}}
          drafts={drafts} onDraft={(key,value)=>{setError("");setDrafts(previous=>({...previous,[key]:value}));}} onAdd={add}/>
      </section>
      <label className="exchange-bio">자기소개<textarea rows={4} disabled={busy}
        maxLength={textInputMaxLength(String(profile.fields.bio??""),1000)} value={String(profile.fields.bio??"")}
        onChange={e=>change("bio",e.target.value)}/><small>{maskedTextLength(String(profile.fields.bio??""))} / 1000자</small></label>
      {error&&<p ref={errorMessage} className="error" role="alert" tabIndex={-1}>{error}</p>}
      <button type="submit" className="primary wide" disabled={busy}>{busy?"저장 중…":"교환용 프로필 저장"}</button>
    </form>}</>;
}
