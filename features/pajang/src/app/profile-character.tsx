import {useId,useRef,useState} from "react";
import names from "./profile-character-names.json";

export type ProfileAvatar={id:number;form:"full"|"mini";bg:number};
export const defaultAvatar:ProfileAvatar={id:1,form:"full",bg:0};
const backgrounds=["없음","햇살 공방","장미 정원","재즈 라운지","등대 해변","달빛 숲","가을 골목","겨울 온실","네온 도시"];
const groups=["전체","일상복","직업 유니폼","드레스·판타지"];
const assetRoot="/features/pajang/assets/";
const backgroundUrl=(id:number)=>assetRoot+"avatar-bg-20261125-"+id+".webp";
const formName=(form:ProfileAvatar["form"])=>form==="mini"?"대두형":"전신형";
const roster=names.map((name,index)=>({id:index+1,name,group:groups[index<40?1:index<80?2:3]}));

export function sameAvatar(a:ProfileAvatar,b:ProfileAvatar){
  return a.id===b.id&&a.form===b.form&&a.bg===b.bg;
}
export function validAvatar(value:unknown):value is ProfileAvatar{
  if(!value||typeof value!=="object")return false;
  const a=value as ProfileAvatar;
  return Number.isInteger(a.id)&&a.id>=1&&a.id<=roster.length
    &&(a.form==="mini"||a.form==="full")&&Number.isInteger(a.bg)&&a.bg>=0&&a.bg<backgrounds.length;
}
function Figure({id,form}:{id:number;form:ProfileAvatar["form"]}){
  const index=id-1,col=(index%2)*2+(form==="mini"?0:1),row=Math.floor((index%4)/2);
  const atlas=String(Math.floor(index/4)+1).padStart(2,"0");
  return <span className={"pj-character-figure "+form} aria-hidden="true" style={{
    backgroundImage:'url("'+assetRoot+'avatars-20261125-'+atlas+'.webp")',
    backgroundPosition:(col*100/3)+'% '+(row*100)+'%'
  }}/>;
}
export function ProfileCharacter({avatar,onChange,disabled}:{avatar:ProfileAvatar;onChange:(avatar:ProfileAvatar)=>void;disabled:boolean}){
  const [panel,setPanel]=useState<"background"|"character"|null>(null);
  const [group,setGroup]=useState("전체"),[query,setQuery]=useState(""),[page,setPage]=useState(0);
  const id=useId(),charButton=useRef<HTMLButtonElement>(null),bgButton=useRef<HTMLButtonElement>(null);
  const filtered=roster.filter(c=>(group==="전체"||group===c.group)&&c.name.replace(/\s/g,"").includes(query.trim().replace(/\s/g,"")));
  const pageSize=8,pageCount=Math.ceil(filtered.length/pageSize);
  function choose(next:ProfileAvatar){
    if(disabled)return;
    onChange(next);setPanel(null);
    (panel==="background"?bgButton:charButton).current?.focus();
  }
  function openCharacter(){
    if(panel==="character"){setPanel(null);return;}
    setGroup("전체");setQuery("");setPage(Math.floor((avatar.id-1)/pageSize));setPanel("character");
  }
  return <section aria-label="내 캐릭터" className="pj-avatar">
    <div className="pj-avatar-stage" role="img" aria-label={names[avatar.id-1]+" "+formName(avatar.form)+" · 배경 "+backgrounds[avatar.bg]}>
      {avatar.bg>0&&<span className="pj-avatar-backdrop" style={{backgroundImage:'url("'+backgroundUrl(avatar.bg)+'")'}}/>}
      <Figure id={avatar.id} form={avatar.form}/>
    </div>
    <div className="pj-avatar-actions">
      <button ref={bgButton} type="button" disabled={disabled} aria-expanded={panel==="background"} aria-controls={id+"-bg"} onClick={()=>setPanel(panel==="background"?null:"background")}>배경 선택</button>
      <button ref={charButton} type="button" disabled={disabled} aria-expanded={panel==="character"} aria-controls={id+"-character"} onClick={openCharacter}>캐릭터 선택</button>
    </div>
    {panel==="background"&&<div id={id+"-bg"} className="pj-avatar-scenes" aria-label="배경 목록">
      {backgrounds.map((name,bg)=><button key={bg} type="button" disabled={disabled} aria-pressed={avatar.bg===bg} onClick={()=>choose({...avatar,bg})}>
        <span className="pj-avatar-swatch">{bg>0&&<img loading="lazy" src={backgroundUrl(bg)} alt=""/>}</span>{name}</button>)}
    </div>}
    {panel==="character"&&<div id={id+"-character"} className="pj-avatar-picker" aria-label="캐릭터 목록">
      <div className="pj-avatar-filters"><select aria-label="의상 분류" value={group} disabled={disabled} onChange={e=>{setGroup(e.target.value);setPage(0);}}>{groups.map(g=><option key={g}>{g}</option>)}</select>
      <input aria-label="캐릭터 검색" type="search" placeholder="이름 검색" value={query} disabled={disabled} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div>
      <div className="pj-avatar-grid">{filtered.slice(page*pageSize,(page+1)*pageSize).map(c=><div className="pj-avatar-card" key={c.id}>
        <div className="pj-avatar-pair">{(["mini","full"] as const).map(form=><button type="button" key={form} disabled={disabled} aria-pressed={avatar.id===c.id&&avatar.form===form} aria-label={c.name+" "+formName(form)} onClick={()=>choose({...avatar,id:c.id,form})}><Figure id={c.id} form={form}/><span>{formName(form)}</span></button>)}</div>
        <strong>{c.name}</strong></div>)}</div>
      {!filtered.length&&<p>검색 결과가 없어요.</p>}
      {pageCount>1&&<div className="pj-avatar-pages"><button type="button" disabled={disabled||page===0} onClick={()=>setPage(page-1)}>이전</button><span>{page+1} / {pageCount}</span><button type="button" disabled={disabled||page+1===pageCount} onClick={()=>setPage(page+1)}>다음</button></div>}
    </div>}
  </section>;
}
