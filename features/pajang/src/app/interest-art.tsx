import {useEffect,useState} from "react";
import {badges,interests,profileGender} from "../lib/station";
import {I} from "./icons";

export function InterestArt({interest,personId,gender,large=false}:{interest:string;personId?:string;gender?:string|null;large?:boolean}){
  const randomPrefix=personId&&/^[0-9a-f]{8}-/i.test(personId)?parseInt(personId.slice(0,8),16):null;
  const fallback=randomPrefix===null?"":interests[randomPrefix%interests.length].key;
  const badge=badges(interest||fallback);
  const [,setReady]=useState("");
  useEffect(()=>{
    let current=true;
    if(badge.key && !window.pajangArt[badge.key]){
      window.pajangLoadArt?.(badge.key).then(url=>{if(current&&url)setReady(url);});
    }
    return ()=>{current=false;};
  },[badge.key]);
  const url=window.pajangArt[badge.key];
  const visibleGender=profileGender(gender);
  return <span className={"avatar"+(large?" large":"")} data-gender-tone={visibleGender?.tone}
    role={visibleGender?"img":undefined} aria-label={visibleGender?.name} style={{background:badge.bg}}>
    {url?<img src={url} alt=""/>:<I n="user" s={large?26:16}/>}
  </span>;
}

declare global {
  interface Window {
    pajangLoadArt?:(key:string)=>Promise<string|undefined>;
  }
}
