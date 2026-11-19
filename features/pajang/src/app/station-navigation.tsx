import type {MouseEvent} from "react";
import {I} from "./icons";

declare global {
  interface Window {
    OjjudaSectionNavigation?: {back:()=>void;hasPreviousPage:boolean};
  }
}

export const destinations=[
  {id:"today",label:"오늘",icon:"letter"},
  {id:"inbox",label:"마음함",icon:"heart"},
  {id:"profile",label:"내 파장",icon:"user"},
] as const;
export type Tab=typeof destinations[number]["id"]|"radar"|"chat";
export type Route={tab:Tab;thread:string};

export function readRoute():Route {
  const params=new URLSearchParams(location.search);
  const thread=params.get("chat")||"";
  if(thread)return {tab:"chat",thread};
  if(params.get("tab")==="radar")return {tab:"radar",thread:""};
  if(params.get("tab")==="chat")return {tab:"inbox",thread:""};
  const tab=destinations.find(item=>item.id===params.get("tab"))?.id;
  return {tab:tab??(params.get("view")==="radar"?"radar":"today"),thread:""};
}

export function routeHref(tab:Tab,thread="",answers=false){
  const url=new URL(location.href);
  for(const key of ["tab","view","chat"])url.searchParams.delete(key);
  if(tab!=="today")url.searchParams.set("tab",tab);
  if(tab==="chat"&&thread)url.searchParams.set("chat",thread);
  url.hash=answers?"answers":"";
  return url.pathname+url.search+url.hash;
}

export function StationNavigation({tab,onGo,pending}:{tab:Tab;onGo:(tab:Tab)=>void;pending:number}){
  const current=tab==="chat"?"inbox":tab==="radar"?"today":tab;
  function follow(event:MouseEvent<HTMLAnchorElement>,next:Tab){
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();onGo(next);
  }
  return <nav className="station-nav" aria-label="파장 메뉴">
    {destinations.map(item=><a key={item.id} href={routeHref(item.id)} onClick={e=>follow(e,item.id)}
      aria-label={item.label} aria-description={item.id==="inbox"&&pending>0?"받은 신호 "+pending+"개":undefined}
      aria-current={current===item.id?"page":undefined}><span className="station-nav-icon"><I n={item.icon} s={21}/>
      {item.id==="inbox"&&pending>0&&<i aria-hidden="true"/>}</span><span>{item.label}</span></a>)}
  </nav>;
}
