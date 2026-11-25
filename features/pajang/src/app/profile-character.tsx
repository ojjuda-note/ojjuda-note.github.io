import {useId,useRef,useState} from "react";
import femaleNames from "./profile-character-names.json";
import maleNames from "./profile-character-male-names.json";
import {characterSearchIndex,characterSearchTerms,matchesCharacter} from "./profile-character-search.mjs";
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
// IDs 1–200 belong to the original atlases. ID 201 is reserved for the public disguise.
const collections={
  female:[...femaleNames.map((name,index)=>({id:index+1,name})),{id:202,name:"정류장의 오후"},{id:204,name:"갤러리 산책"}],
  male:[...maleNames.map((name,index)=>({id:index+101,name})),{id:203,name:"정류장의 오후"},{id:205,name:"갤러리 산책"}]
};
const roster=(["female","male"] as const).flatMap(collection=>
  collections[collection].map((entry,slot)=>({...entry,slot,collection,
    group:groups[slot<40||slot>=100?1:slot<80?2:3]})));
const searchById=new Map(roster.map(c=>[c.id,characterSearchIndex(c)]));
const byId=new Map(roster.map(entry=>[entry.id,entry]));

export function sameAvatar(a:ProfileAvatar,b:ProfileAvatar){
  return a.id===b.id&&a.form===b.form&&a.bg===b.bg;
}
export function avatarForCollection(avatar:ProfileAvatar,collection:AvatarCollection|null):ProfileAvatar{
  const entry=byId.get(avatar.id);
  if(!entry||!collection||entry.collection===collection)return avatar;
  return {...avatar,id:collections[collection][entry.slot].id};
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
  return typeof id==="number"&&byId.has(id);
}
function isDisplayId(id:unknown):id is number{return id===hiddenCharacterId||isCharacterId(id);}
function characterName(id:number){return id===hiddenCharacterId?"나무 분장":byId.get(id)!.name;}
function characterSprite(id:number,form:ProfileAvatar["form"]){
  if(id===hiddenCharacterId)return {image:'url("'+assetRoot+'avatar-tree-20261125.webp")',
    column:form==="mini"?0:1,row:0,columns:2,rows:1};
  const {slot:index,collection}=byId.get(id)!;
  const prefix=collection==="male"?"avatars-male-20261125-":"avatars-20261125-";
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
    const cropHeight=492-cropTop;
    return <span className="pj-character-preview" role="img" aria-label={label} data-gender-tone={visibleGender?.tone}>
      <span className="pj-character-preview-art" aria-hidden="true" style={{
        aspectRatio:"312 / "+cropHeight,backgroundImage:sprite.image,
        backgroundSize:(sprite.columns*100)+"% "+(height/cropHeight*100)+"%",
        backgroundPosition:(sprite.column/(sprite.columns-1)*100)+"% "+((sprite.row*492+cropTop)/(height-cropHeight)*100)+"%"
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
export function ProfileCharacter({avatar,collection,showGender,onChange,disabled,owned,coins,onPurchase}:{owned:number[];coins:number|null;onPurchase:(avatar:ProfileAvatar,request:string)=>Promise<void>;avatar:ProfileAvatar;collection:AvatarCollection|null;showGender:boolean;onChange:(avatar:ProfileAvatar)=>void;disabled:boolean}){
  const [panel,setPanel]=useState<"background"|"character"|null>(null);
  const [group,setGroup]=useState("전체"),[query,setQuery]=useState(""),[page,setPage]=useState(0);
  const id=useId(),charButton=useRef<HTMLButtonElement>(null),bgButton=useRef<HTMLButtonElement>(null);
  const [pending,setPending]=useState<{avatar:ProfileAvatar;request:string}|null>(null);
  const [purchaseError,setPurchaseError]=useState("");
  const confirming=useRef(false);
  const search=characterSearchTerms(query);
  const isFree=(outfit:number)=>outfit===1||outfit===101;
  function pick(next:ProfileAvatar){
    if(isFree(next.id)||owned.includes(next.id)){choose(next);return;}
    setPurchaseError("");setPending({avatar:next,request:crypto.randomUUID()});
  }
  async function confirm(){
    if(!pending||confirming.current||disabled)return;
    confirming.current=true;setPurchaseError("");
    try{
      await onPurchase(pending.avatar,pending.request);
      setPending(null);setPanel(null);charButton.current?.focus();
    }catch(err){setPurchaseError(err instanceof Error?err.message:"구매 결과를 확인해 주세요.");}
    finally{confirming.current=false;}
  }
  const filtered=roster.filter(c=>c.collection===collection&&(group==="전체"||group===c.group)&&matchesCharacter(searchById.get(c.id),search));
  const pageSize=8,pageCount=Math.ceil(filtered.length/pageSize);
  const previewId=showGender?avatar.id:hiddenCharacterId;
  function choose(next:ProfileAvatar){
    if(disabled)return;
    if((next.id!==avatar.id||next.form!==avatar.form)&&byId.get(next.id)?.collection!==collection)return;
    onChange(next);setPanel(null);
    (panel==="background"?bgButton:charButton).current?.focus();
  }
  function openCharacter(){
    if(!collection)return;
    setPending(null);setPurchaseError("");
    if(panel==="character"){setPanel(null);return;}
    setGroup("전체");setQuery("");setPage(Math.floor((byId.get(avatar.id)?.slot??0)/pageSize));setPanel("character");
  }
  return <section aria-label="내 캐릭터" className="pj-avatar">
    <div className="pj-avatar-stage" role="img" aria-label={characterName(previewId)+" "+formName(avatar.form)+" · 배경 "+backgrounds[avatar.bg]}>
      {avatar.bg>0&&<span className="pj-avatar-backdrop" style={{backgroundImage:'url("'+backgroundUrl(avatar.bg)+'")'}}/>}
      <Figure id={previewId} form={avatar.form}/>
    </div>
    <div className="pj-avatar-actions">
      <button ref={bgButton} type="button" disabled={disabled} aria-expanded={panel==="background"} aria-controls={id+"-bg"} onClick={()=>{setPending(null);setPanel(panel==="background"?null:"background");}}>배경 선택</button>
      <button ref={charButton} type="button" disabled={disabled||!collection} aria-expanded={panel==="character"} aria-controls={id+"-character"} aria-describedby={collection?undefined:id+"-collection-note"} onClick={openCharacter}>캐릭터 선택</button>
    </div>
    {!collection&&<small id={id+"-collection-note"}>가입 성별을 확인해야 캐릭터를 선택할 수 있어요.</small>}
    {panel==="background"&&<div id={id+"-bg"} className="pj-avatar-scenes" aria-label="배경 목록">
      {backgrounds.map((name,bg)=><button key={bg} type="button" disabled={disabled} aria-pressed={avatar.bg===bg} onClick={()=>choose({...avatar,bg})}>
        <span className="pj-avatar-swatch">{bg>0&&<img loading="lazy" src={backgroundUrl(bg)} alt=""/>}</span>{name}</button>)}
    </div>}
    {panel==="character"&&collection&&<div id={id+"-character"} className="pj-avatar-picker" aria-label="캐릭터 목록">
      {pending?<div className="pj-avatar-purchase" role="group" aria-label="캐릭터 구매">
        <strong>{characterName(pending.avatar.id)}</strong>
        <p>10쭈에 구매하면 두 가지 모습 모두 쓸 수 있어요.{coins!=null&&" · 보유 "+coins+"쭈"}</p>
        {purchaseError&&<p className="error" role="alert">{purchaseError}</p>}
        <div className="pj-avatar-actions"><button type="button" className="primary" disabled={disabled} onClick={confirm}>{disabled?"구매 중…":"10쭈로 구매"}</button>
          <button type="button" disabled={disabled} onClick={()=>setPending(null)}>취소</button></div>
      </div>:<><div className="pj-avatar-filters"><select aria-label="의상 분류" value={group} disabled={disabled} onChange={e=>{setGroup(e.target.value);setPage(0);}}>{groups.map(g=><option key={g}>{g}</option>)}</select>
      <input aria-label="캐릭터 검색" type="search" placeholder="이름·색상·의상·분위기" onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}} value={query} disabled={disabled} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div>
      <div className="pj-avatar-grid" data-collection={collection==="male"?"남자":"여자"}>{filtered.slice(page*pageSize,(page+1)*pageSize).map(c=><div className="pj-avatar-card" key={c.id}>
        <div className="pj-avatar-pair" data-equal-frames={c.collection==="male"||c.slot>=100?true:undefined}>{(["mini","full"] as const).map(form=><button type="button" key={form} disabled={disabled} aria-pressed={avatar.id===c.id&&avatar.form===form} aria-label={c.name+" "+formName(form)} onClick={()=>pick({...avatar,id:c.id,form})}><Figure id={c.id} form={form}/><span>{formName(form)}</span></button>)}</div>
        <strong>{c.name}</strong><small>{isFree(c.id)?"기본":owned.includes(c.id)?"보유":"10쭈"}</small></div>)}</div>
      {!filtered.length&&<p>검색 결과가 없어요.</p>}
      {pageCount>1&&<div className="pj-avatar-pages"><button type="button" disabled={disabled||page===0} onClick={()=>setPage(page-1)}>이전</button><span>{page+1} / {pageCount}</span><button type="button" disabled={disabled||page+1===pageCount} onClick={()=>setPage(page+1)}>다음</button></div>}</>}
    </div>}
  </section>;
}
