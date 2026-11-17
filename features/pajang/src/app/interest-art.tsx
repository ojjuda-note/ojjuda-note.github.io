import {useEffect,useState} from "react";
import {badges} from "../lib/station";
import {I} from "./icons";

export function InterestArt({interest,large=false}:{interest:string;large?:boolean}){
  const badge=badges(interest);
  const [,setReady]=useState("");
  useEffect(()=>{
    let current=true;
    if(badge.key && !window.pajangArt[badge.key]){
      window.pajangLoadArt?.(badge.key).then(url=>{if(current&&url)setReady(url);});
    }
    return ()=>{current=false;};
  },[badge.key]);
  const url=window.pajangArt[badge.key];
  return <span className={"avatar"+(large?" large":"")} style={{background:badge.bg}}>
    {url?<img src={url} alt=""/>:<I n="user" s={large?26:16}/>}
  </span>;
}

declare global {
  interface Window {
    pajangLoadArt?:(key:string)=>Promise<string|undefined>;
  }
}
