import {useEffect, useRef, useState} from "react";
import regionCatalog from "../../regions.json";

export type ExchangeKind = "profile"|"photos";
type Fields = Partial<Record<"relationship"|"job"|"region"|"height"|"mbti"|"bloodType"|"skills"|"hobbies"|"drinking"|"smoking"|"bio",string|number>>;
export type SharedProfile = {fields: Fields; age:number|null; gender:string|null};
type MyProfile = SharedProfile & {showAge:boolean; showGender:boolean};

export async function exchange<T>(action:string, options:{p_peer?:string; p_kind?:ExchangeKind; p_data?:object}={}):Promise<T> {
  const db=await window.OjjudaGetClient();
  const {data,error}=await db.rpc("pajang_exchange",{p_action:action,...options});
  if(error) throw Object.assign(new Error(error.message),{code:error.code});
  return data as T;
}

const regions:Record<string,string[]>=regionCatalog;
const labels:{key:keyof Fields; label:string; options?:readonly string[]; limit?:number}[]=[
  {key:"relationship",label:"결혼 이력",options:["싱글","돌싱"]},
  {key:"job",label:"직업"},{key:"region",label:"사는 지역"},
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

export function ExchangeProfileEditor({onSaved}:{onSaved:()=>void}) {
  const [profile,setProfile]=useState<MyProfile|null>(null);
  const [error,setError]=useState(""),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
  const saving=useRef(false),mounted=useRef(false);
  useEffect(()=>{
    mounted.current=true;
    let current=true;
    setError("");
    exchange<MyProfile>("mine").then(value=>{if(current)setProfile(value);})
      .catch(()=>{if(current)setError("교환용 프로필을 불러오지 못했어요.");});
    return ()=>{current=false;mounted.current=false;};
  },[retry]);
  function change(key:keyof Fields,value:string) {
    setProfile(prior=>prior?{...prior,fields:{...prior.fields,[key]:value}}:prior);
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();
    if(!profile||saving.current)return;
    saving.current=true;setBusy(true);setError("");
    const fields=Object.fromEntries(labels.map(({key})=>[key,String(profile.fields[key]??"").trim()]).filter(([,v])=>v));
    try {
      await exchange<MyProfile>("save",{p_data:{fields,showAge:profile.showAge,showGender:profile.showGender}});
      if(mounted.current)onSaved();
    } catch(err) {
      if(mounted.current)setError(err instanceof Error?err.message:"저장하지 못했어요. 다시 시도해 주세요.");
    } finally {saving.current=false;if(mounted.current)setBusy(false);}
  }
  return <><h2>교환용 프로필</h2><p className="sub">원하는 항목만 채워 주세요. 프로필을 교환한 상대는 나중에 수정한 내용도 볼 수 있어요. 대화방에서 언제든 공유를 끝낼 수 있어요.</p>
    {error&&<p className="error" role="alert">{error} {!profile&&<button className="quiet" onClick={()=>setRetry(n=>n+1)}>다시 시도</button>}</p>}
    {!profile&&!error&&<p className="sub" role="status">회원정보를 확인하고 있어요.</p>}
    {profile&&<form className="profileform exchange-editor" onSubmit={save}>
      <fieldset disabled={busy}><legend>오쭈다 회원정보</legend>
        <p className="exchange-hint">교환용 프로필에 포함할 항목을 선택하세요.</p>
        <label className="exchange-check"><input type="checkbox" disabled={profile.age==null} checked={profile.age!=null&&profile.showAge} onChange={e=>setProfile({...profile,showAge:e.target.checked})}/><span>나이</span><b>{profile.age==null?"연동 정보 없음":`만 ${profile.age}세`}</b></label>
        <label className="exchange-check"><input type="checkbox" disabled={!profile.gender} checked={!!profile.gender&&profile.showGender} onChange={e=>setProfile({...profile,showGender:e.target.checked})}/><span>성별</span><b>{profile.gender||"연동 정보 없음"}</b></label>
      </fieldset>
      <fieldset className="exchange-grid" disabled={busy}><legend>선택 항목</legend>
        {labels.map(({key,label,options,limit})=>{
          const value=String(profile.fields[key]??"");
          if(key==="region")return <RegionField key={key} value={value} onChange={v=>change(key,v)}/>;
          if(key==="bio")return <label key={key} className="exchange-bio">{label}<textarea rows={4} maxLength={limit} value={value} onChange={e=>change(key,e.target.value)}/><small>{value.length} / {limit}자</small></label>;
          return <label key={key}>{key==="height"?"키 (cm)":label}
            {options?<select value={value} onChange={e=>change(key,e.target.value)}><option value="">미입력</option>{value&&!options.includes(value)&&<option>{value}</option>}{options.map(v=><option key={v} value={v}>{key==="bloodType"?v+"형":v}</option>)}</select>:
             key==="height"?<input type="number" inputMode="numeric" min={1} max={300} step={1} value={value} onChange={e=>change(key,e.target.value)}/>:
             <input maxLength={limit||80} value={value} onChange={e=>change(key,e.target.value)}/>}</label>;
        })}
      </fieldset>
      <button className="primary wide" disabled={busy}>{busy?"저장 중…":"교환용 프로필 저장"}</button>
    </form>}</>;
}
