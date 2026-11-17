"use client";
import {useEffect,useRef,useState} from "react";
import {screenHeading, type OrientationSample} from "../lib/compass";

type PermissionAPI = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<"granted"|"denied">;
};
type CompassState = {heading:number|null; status:"off"|"waiting"|"on"|"error"; message:string};
const northUp:CompassState = {heading:null,status:"off",message:"북쪽 고정"};

export function useCompass(){
  const [state,setState]=useState<CompassState>(northUp);
  const cleanup=useRef<() => void>(()=>{});
  const version=useRef(0);
  function stop(){
    version.current++;
    cleanup.current();
    setState(northUp);
  }
  useEffect(()=>()=>{version.current++;cleanup.current();},[]);

  async function start(){
    cleanup.current();
    const attempt=++version.current;
    function problem(message:string){
      if(version.current!==attempt)return;
      cleanup.current();
      setState({status:"error",heading:null,message});
    }
    const api=window.DeviceOrientationEvent as PermissionAPI|undefined;
    if(!api){problem("방향 센서를 사용할 수 없어 북쪽을 위로 표시해요.");return;}
    setState({status:"waiting",heading:null,message:"휴대폰을 수평에 가깝게 들고 살짝 돌려주세요."});
    try{
      if(api.requestPermission && await api.requestPermission(true)!=="granted"){
        problem("방향 권한이 꺼져 있어 북쪽을 위로 표시해요.");return;
      }
    }catch{problem("방향 권한을 사용할 수 없어 북쪽을 위로 표시해요.");return;}
    if(version.current!==attempt)return;

    let timer=0, frame=0, last:OrientationSample|null=null, previous=-1;
    function timeout(){
      clearTimeout(timer);
      timer=window.setTimeout(()=>problem("나침반 값을 받지 못했어요. 북쪽을 위로 표시해요."),9000);
    }
    function render(){
      frame=0;
      if(!last||document.hidden)return;
      const angle=window.screen.orientation?.angle ?? window.orientation ?? 0;
      const value=screenHeading(last,angle);
      if(value===null){
        if(previous!==-1){
          previous=-1;setState({status:"waiting",heading:null,message:"휴대폰을 조금 더 수평으로 들어주세요."});timeout();
        }
        return;
      }
      clearTimeout(timer);
      const heading=Math.round(value)%360;
      if(heading!==previous){previous=heading;setState({status:"on",heading,message:"휴대폰 방향 연동 중"});}
    }
    function redraw(){if(!frame)frame=window.requestAnimationFrame(render);}
    function reading(event:Event){
      const sample=event as DeviceOrientationEvent & OrientationSample;
      if(!sample.absolute && event.type!=="deviceorientationabsolute" && sample.webkitCompassHeading===undefined)return;
      last=sample;redraw();
    }
    function visibility(){
      clearTimeout(timer);last=null;previous=-1;
      setState({status:"waiting",heading:null,message:"휴대폰 방향을 확인하고 있어요."});
      if(!document.hidden)timeout();
    }
    window.addEventListener("deviceorientationabsolute",reading);
    window.addEventListener("deviceorientation",reading);
    window.screen.orientation?.addEventListener?.("change",redraw);
    window.addEventListener("orientationchange",redraw);
    document.addEventListener("visibilitychange",visibility);
    cleanup.current=()=>{
      clearTimeout(timer);cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientationabsolute",reading);
      window.removeEventListener("deviceorientation",reading);
      window.screen.orientation?.removeEventListener?.("change",redraw);
      window.removeEventListener("orientationchange",redraw);
      document.removeEventListener("visibilitychange",visibility);
      cleanup.current=()=>{};
    };
    timeout();
  }
  return {...state,start,stop};
}
