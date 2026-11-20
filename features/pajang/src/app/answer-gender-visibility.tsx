import {useEffect,useRef,useState} from "react";

type Preference = {visible:boolean;hasGender:boolean};

async function visibility(visible:boolean|null):Promise<Preference> {
  const db=await window.OjjudaGetClient();
  const {data,error}=await db.rpc("pajang_discovery_visibility",{p_visible:visible});
  if(error)throw new Error(error.message);
  return data as Preference;
}

export default function AnswerGenderVisibility({onSaved}:{onSaved:()=>void}) {
  const [preference,setPreference]=useState<Preference|null>(null);
  const [saving,setSaving]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const mounted=useRef(false),pending=useRef(false);
  useEffect(()=>{
    mounted.current=true;
    let active=true;
    setError("");
    visibility(null).then(value=>{if(active)setPreference(value);}).catch(()=>{
      if(active)setError("공개 설정을 확인하지 못했어요.");
    });
    return ()=>{active=false;mounted.current=false;};
  },[retry]);

  async function change(visible:boolean) {
    if(pending.current||!preference||visible&&!preference.hasGender)return;
    pending.current=true;setSaving(true);setError("");
    try {
      const saved=await visibility(visible);
      if(mounted.current){setPreference(saved);onSaved();}
    } catch {
      if(mounted.current){setPreference(null);setError("저장 결과를 확인하지 못했어요.");}
    } finally {pending.current=false;if(mounted.current)setSaving(false);}
  }
  const enabled=preference?.visible===true;
  const hint=preference&&!preference.hasGender?"연동된 성별 정보가 없어 내 답변은 남·여 필터에 표시되지 않아요.":"켜면 공개 기간이 남아 있는 내 답변이 오쭈다 회원정보의 남·여 필터에 표시돼요.";
  return <section className="discovery-visibility-panel" aria-label="답변 공개 설정">
    <label className="discovery-visibility-control">
      <span>성별 필터에 내 답변 표시</span>
      <span className="discovery-visibility-value">{saving?"저장 중…":preference?enabled?"켜짐":"꺼짐":""}</span>
      <input type="checkbox" role="switch" aria-label="성별 필터에 내 답변 표시" aria-describedby="discovery-visibility-note"
        checked={enabled} disabled={!preference||saving||!preference.hasGender&&!enabled} onChange={e=>change(e.target.checked)}/>
    </label>
    <p id="discovery-visibility-note">{hint}</p>
    {error&&<p className="error" role="alert">{error} <button className="quiet" type="button" onClick={()=>setRetry(n=>n+1)}>다시 확인</button></p>}
    {!preference&&!error&&<p role="status">설정을 확인하고 있어요.</p>}
  </section>;
}
