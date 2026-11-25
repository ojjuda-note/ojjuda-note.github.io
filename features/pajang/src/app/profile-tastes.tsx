import {interests} from "../lib/station";
import {
  profilePreferenceGroups,MAX_PROFILE_CUSTOM_LENGTH,MAX_PROFILE_GROUP_SELECTIONS,
  type ProfilePreferences,type PreferenceGroupKey,
} from "../lib/profile-preferences.mjs";
import {maskedTextLength} from "../../../../shared/content/text-length.mjs";
import {InterestArt} from "./interest-art";
import {I} from "./icons";

export type TasteDrafts=Record<PreferenceGroupKey,string>;
export const blankTasteDrafts=():TasteDrafts=>({meeting_styles:"",relationship_values:"",affection_styles:"",life_priorities:""});

export function tasteLabels(preferences:ProfilePreferences,key:PreferenceGroupKey):string[]{
  const group=profilePreferenceGroups.find(group=>group.key===key)!;
  return [...group.options.filter(option=>preferences[key].includes(option.key)).map(option=>option.label),...preferences.custom[key]];
}

export function addTaste(preferences:ProfilePreferences,key:PreferenceGroupKey,draft:string):{preferences:ProfilePreferences;error:string}{
  const value=draft.trim();
  if(!value)return {preferences,error:""};
  if(maskedTextLength(value)>MAX_PROFILE_CUSTOM_LENGTH)return {preferences,error:"직접 입력은 40자까지 적어 주세요."};
  const preset=profilePreferenceGroups.find(group=>group.key===key)!.options.find(option=>option.label===value);
  if(preset?preferences[key].includes(preset.key):preferences.custom[key].includes(value))return {preferences,error:""};
  if(preferences[key].length+preferences.custom[key].length>=MAX_PROFILE_GROUP_SELECTIONS)return {preferences,error:`한 목록에서 최대 ${MAX_PROFILE_GROUP_SELECTIONS}개까지 고를 수 있어요.`};
  return {preferences:preset?{...preferences,[key]:[...preferences[key],preset.key]}:
    {...preferences,custom:{...preferences.custom,[key]:[...preferences.custom[key],value]}},error:""};
}

export function prepareTastes(preferences:ProfilePreferences,drafts:TasteDrafts){
  let next=preferences;
  for(const group of profilePreferenceGroups){
    const result=addTaste(next,group.key,drafts[group.key]);
    if(result.error)return result;
    next=result.preferences;
  }
  return {preferences:next,error:""};
}

export function tastePatch(preferences:ProfilePreferences){
  const {relationship_intents,...tastes}=preferences;
  return tastes;
}

export function ProfileTastesFields({value,interest,onInterest,onChange,drafts,onDraft,onAdd,disabled}:{
  value:ProfilePreferences;interest:string;onInterest:(value:string)=>void;onChange:(value:ProfilePreferences)=>void;
  drafts:TasteDrafts;onDraft:(key:PreferenceGroupKey,value:string)=>void;onAdd:(key:PreferenceGroupKey)=>void;disabled:boolean;
}){
  return <div className="preference-editor">
    <div className="preference-section-heading"><h3>나를 표현하는 취향</h3><span>목록별 최대 {MAX_PROFILE_GROUP_SELECTIONS}개</span></div>
    {profilePreferenceGroups.map(group=>{
      const key=group.key,selected=tasteLabels(value,key);
      const full=selected.length>=MAX_PROFILE_GROUP_SELECTIONS;
      return <details className="preference-group" key={key} name="profile-preference-group">
        <summary><span><strong>{group.label}</strong><small>{selected.length?selected.slice(0,2).join(" · ")+(selected.length>2?` 외 ${selected.length-2}개`:""):"나와 맞는 보기를 골라 주세요"}</small></span><I n="chevron" s={16}/></summary>
        <fieldset className="preference-group-body" disabled={disabled} aria-label={group.label}>
          <div className="preference-chips">{group.options.map(option=>{
            const selected=value[key].includes(option.key);
            return <button type="button" key={option.key} aria-label={option.label} aria-pressed={selected}
              disabled={!selected&&full}
              onClick={()=>onChange({...value,[key]:selected?value[key].filter(item=>item!==option.key):[...value[key],option.key]})}>{option.label}</button>;
          })}</div>
          {value.custom[key].length>0&&<div className="preference-chips custom-choices">{value.custom[key].map(label=><button key={label} type="button" aria-label={label+" 삭제"} aria-pressed="true"
            onClick={()=>onChange({...value,custom:{...value.custom,[key]:value.custom[key].filter(item=>item!==label)}})}>{label}</button>)}</div>}
          <div className="preference-custom"><input aria-label={group.label+" 직접 입력"} value={drafts[key]} disabled={full&&!drafts[key]} placeholder="보기 외 항목 직접 추가"
            onChange={event=>onDraft(key,event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();onAdd(key);}}}/>
            <button type="button" aria-label={group.label+" 추가"} disabled={full||!drafts[key].trim()} onClick={()=>onAdd(key)}>추가</button></div>
        </fieldset>
      </details>;
    })}
    <details className="preference-group profile-art-choice"><summary><span><strong>대표 취향</strong><small>{interests.find(option=>option.key===interest)?.name||"선택 안 함"}</small></span><I n="chevron" s={16}/></summary>
      <fieldset disabled={disabled} aria-label="대표 취향"><div className="interestgrid">{interests.map(option=><button type="button" key={option.key} aria-label={option.name} className={interest===option.key?"selected":""} aria-pressed={interest===option.key} onClick={()=>onInterest(interest===option.key?"":option.key)}><InterestArt interest={option.key}/>{option.name}</button>)}</div></fieldset>
    </details>
  </div>;
}
