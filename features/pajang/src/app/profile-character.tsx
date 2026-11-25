import {useId,useRef,useState} from "react";
import femaleNames from "./profile-character-names.json";
import maleNames from "./profile-character-male-names.json";
import {profileGender} from "../lib/station";

export type ProfileAvatar={id:number;form:"full"|"mini";bg:number};
export const defaultAvatar:ProfileAvatar={id:1,form:"full",bg:0};
export const hiddenCharacterId=201;
const backgrounds=["없음","햇살 공방","장미 정원","재즈 라운지","등대 해변","달빛 숲","가을 골목","겨울 온실","네온 도시"];
const groups=["전체","일상복","직업 유니폼","드레스·판타지"];
const assetRoot="/features/pajang/assets/";
const backgroundUrl=(id:number)=>assetRoot+"avatar-bg-20261125-"+id+".webp";
const formName=(form:ProfileAvatar["form"])=>form==="mini"?"대두형":"전신형";
export type AvatarCollection="female"|"male";
const collectionSize=100;
const collectionFor=(id:number):AvatarCollection=>id>collectionSize?"male":"female";
const localIndex=(id:number)=>(id-1)%collectionSize;
const roster=[...femaleNames,...maleNames].map((name,index)=>{
  const id=index+1,slot=localIndex(id);
  return {id,name,collection:collectionFor(id),group:groups[slot<40?1:slot<80?2:3]};
});

export function sameAvatar(a:ProfileAvatar,b:ProfileAvatar){
  return a.id===b.id&&a.form===b.form&&a.bg===b.bg;
}
export function avatarForCollection(avatar:ProfileAvatar,collection:AvatarCollection|null):ProfileAvatar{
  if(!collection||collectionFor(avatar.id)===collection)return avatar;
  return {...avatar,id:localIndex(avatar.id)+1+(collection==="male"?collectionSize:0)};
}
export function validAvatar(value:unknown):value is ProfileAvatar{
  if(!value||typeof value!=="object")return false;
  const a=value as ProfileAvatar;
  return isCharacterId(a.id)
    &&(a.form==="mini"||a.form==="full")&&Number.isInteger(a.bg)&&a.bg>=0&&a.bg<backgrounds.length;
}
// Source sprite cells are 312 × 492. The first collection has varying headroom;
// these are the top painted rows of its miniatures, measured in atlas order.
const femaleMiniTop=[
  106,80,98,107,89,85,76,78,61,66,57,65,86,89,76,82,95,99,94,89,
  99,95,97,105,83,75,74,73,88,91,59,79,103,106,92,121,95,94,78,78,
  101,93,103,100,98,100,90,115,83,84,72,91,84,68,83,82,86,91,71,83,
  125,109,105,129,94,85,91,81,106,106,100,111,82,94,97,100,88,85,72,74,
  133,125,127,126,91,88,78,83,105,112,93,99,104,108,106,96,91,102,101,109
];
function isCharacterId(id:unknown):id is number{
  return typeof id==="number"&&Number.isInteger(id)&&id>=1&&id<=roster.length;
}
function isDisplayId(id:unknown):id is number{return id===hiddenCharacterId||isCharacterId(id);}
function characterName(id:number){return id===hiddenCharacterId?"나무 분장":roster[id-1].name;}
function characterSprite(id:number,form:ProfileAvatar["form"]){
  if(id===hiddenCharacterId)return {image:'url("'+assetRoot+'avatar-tree-20261125.webp")',
    column:form==="mini"?0:1,row:0,columns:2,rows:1};
  const index=localIndex(id);
  const prefix=collectionFor(id)==="male"?"avatars-male-20261125-":"avatars-20261125-";
  const atlas=String(Math.floor(index/4)+1).padStart(2,"0");
  return {image:'url("'+assetRoot+prefix+atlas+'.webp")',
    column:(index%2)*2+(form==="mini"?0:1),row:Math.floor((index%4)/2),columns:4,rows:2};
}
function Figure({id,form}:{id:number;form:ProfileAvatar["form"]}){
  const sprite=characterSprite(id,form);
  return <span className={"pj-character-figure "+form} aria-hidden="true" style={{
    backgroundImage:sprite.image,backgroundSize:(sprite.columns*100)+"% "+(sprite.rows*100)+"%",
    backgroundPosition:(sprite.column*100/(sprite.columns-1))+"% "+(sprite.row*100)+"%"
  }}/>;
}

export function CharacterPortrait({id,gender,large=false,fullBodyPreview=false}:{id?:number;gender?:string|null;large?:boolean;fullBodyPreview?:boolean}){
  const selected=isDisplayId(id)?id:defaultAvatar.id;
  const sprite=characterSprite(selected,"mini");
  const top=femaleMiniTop[selected-1]??113;
  const visibleGender=selected===hiddenCharacterId?undefined:profileGender(gender);
  const name=characterName(selected)+(fullBodyPreview?" 대두형 전신":" 대두형 상반신");
  const label=visibleGender?name+" · "+visibleGender.name:name;
  const width=sprite.columns*312,height=sprite.rows*492;
  if(fullBodyPreview){
    // Center the painted figure, leaving room for hair and shoes inside the circle.
    const cropTop=top-5;
    const scale=86/(492-cropTop);
    return <span className="pj-character-preview" role="img" aria-label={label} data-gender-tone={visibleGender?.tone}>
      <span className="pj-character-preview-art" aria-hidden="true" style={{
        width:312*scale,height:86,backgroundImage:sprite.image,backgroundSize:(width*scale)+"px "+(height*scale)+"px",
        backgroundPosition:(-sprite.column*312*scale)+"px "+(-(sprite.row*492+cropTop)*scale)+"px"
      }}/>
    </span>;
  }
  const size=Math.round((488-top)*0.65);
  const x=sprite.column*312+(312-size)/2;
  const y=sprite.row*492+top-9;
  return <span className={"avatar pj-character-portrait"+(large?" large":"")} role="img" data-gender-tone={visibleGender?.tone}
    aria-label={label} style={{
      backgroundImage:sprite.image,backgroundSize:(width/size*100)+"% "+(height/size*100)+"%",
      backgroundPosition:(x/(width-size)*100)+"% "+(y/(height-size)*100)+"%"
    }}/>;
}

export function ChatScenery({self,peer}:{self?:number;peer?:number}){
  const [scene]=useState(()=>1+Math.floor(Math.random()*(backgrounds.length-1)));
  return <div className="pj-chat-scenery" aria-hidden="true">
    <div className="pj-chat-backdrop" style={{backgroundImage:'url("'+backgroundUrl(scene)+'")'}}/>
    {isDisplayId(peer)&&<div className="pj-chat-peer"><Figure id={peer} form="full"/></div>}
    {isDisplayId(self)&&<div className="pj-chat-self"><Figure id={self} form="full"/></div>}
  </div>;
}
export function ProfileCharacter({avatar,collection,showGender,onChange,disabled}:{avatar:ProfileAvatar;collection:AvatarCollection|null;showGender:boolean;onChange:(avatar:ProfileAvatar)=>void;disabled:boolean}){
  const [panel,setPanel]=useState<"background"|"character"|null>(null);
  const [group,setGroup]=useState("전체"),[query,setQuery]=useState(""),[page,setPage]=useState(0);
  const id=useId(),charButton=useRef<HTMLButtonElement>(null),bgButton=useRef<HTMLButtonElement>(null);
  const search=query.trim().replace(/\s/g,"");
  const filtered=roster.filter(c=>c.collection===collection&&(group==="전체"||group===c.group)&&c.name.replace(/\s/g,"").includes(search));
  const pageSize=8,pageCount=Math.ceil(filtered.length/pageSize);
  const previewId=showGender?avatar.id:hiddenCharacterId;
  function choose(next:ProfileAvatar){
    if(disabled)return;
    if((next.id!==avatar.id||next.form!==avatar.form)&&collectionFor(next.id)!==collection)return;
    onChange(next);setPanel(null);
    (panel==="background"?bgButton:charButton).current?.focus();
  }
  function openCharacter(){
    if(!collection)return;
    if(panel==="character"){setPanel(null);return;}
    setGroup("전체");setQuery("");setPage(Math.floor(localIndex(avatar.id)/pageSize));setPanel("character");
  }
  return <section aria-label="내 캐릭터" className="pj-avatar">
    <div className="pj-avatar-stage" role="img" aria-label={characterName(previewId)+" "+formName(avatar.form)+" · 배경 "+backgrounds[avatar.bg]}>
      {avatar.bg>0&&<span className="pj-avatar-backdrop" style={{backgroundImage:'url("'+backgroundUrl(avatar.bg)+'")'}}/>}
      <Figure id={previewId} form={avatar.form}/>
    </div>
    <div className="pj-avatar-actions">
      <button ref={bgButton} type="button" disabled={disabled} aria-expanded={panel==="background"} aria-controls={id+"-bg"} onClick={()=>setPanel(panel==="background"?null:"background")}>배경 선택</button>
      <button ref={charButton} type="button" disabled={disabled||!collection} aria-expanded={panel==="character"} aria-controls={id+"-character"} aria-describedby={collection?undefined:id+"-collection-note"} onClick={openCharacter}>캐릭터 선택</button>
    </div>
    {!collection&&<small id={id+"-collection-note"}>가입 성별을 확인해야 캐릭터를 선택할 수 있어요.</small>}
    {panel==="background"&&<div id={id+"-bg"} className="pj-avatar-scenes" aria-label="배경 목록">
      {backgrounds.map((name,bg)=><button key={bg} type="button" disabled={disabled} aria-pressed={avatar.bg===bg} onClick={()=>choose({...avatar,bg})}>
        <span className="pj-avatar-swatch">{bg>0&&<img loading="lazy" src={backgroundUrl(bg)} alt=""/>}</span>{name}</button>)}
    </div>}
    {panel==="character"&&collection&&<div id={id+"-character"} className="pj-avatar-picker" aria-label="캐릭터 목록">
      <div className="pj-avatar-filters"><select aria-label="의상 분류" value={group} disabled={disabled} onChange={e=>{setGroup(e.target.value);setPage(0);}}>{groups.map(g=><option key={g}>{g}</option>)}</select>
      <input aria-label="캐릭터 검색" type="search" placeholder="이름 검색" value={query} disabled={disabled} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div>
      <div className="pj-avatar-grid" data-collection={collection==="male"?"남자":"여자"}>{filtered.slice(page*pageSize,(page+1)*pageSize).map(c=><div className="pj-avatar-card" key={c.id}>
        <div className="pj-avatar-pair">{(["mini","full"] as const).map(form=><button type="button" key={form} disabled={disabled} aria-pressed={avatar.id===c.id&&avatar.form===form} aria-label={c.name+" "+formName(form)} onClick={()=>choose({...avatar,id:c.id,form})}><Figure id={c.id} form={form}/><span>{formName(form)}</span></button>)}</div>
        <strong>{c.name}</strong></div>)}</div>
      {!filtered.length&&<p>검색 결과가 없어요.</p>}
      {pageCount>1&&<div className="pj-avatar-pages"><button type="button" disabled={disabled||page===0} onClick={()=>setPage(page-1)}>이전</button><span>{page+1} / {pageCount}</span><button type="button" disabled={disabled||page+1===pageCount} onClick={()=>setPage(page+1)}>다음</button></div>}
    </div>}
  </section>;
}
