import '../../shared/analytics/site-usage.js?v=20261121-pajang-visits1';
import {client} from './member.mjs?v=20261126-adult-service1';

export function installPajangUsage() {
  let pending=null,db=null,host=null,frame=null,observer=null;
  try{
    if(window.parent!==window&&window.parent.location.origin===location.origin){
      host=window.parent;frame=window.frameElement;
    }
  }catch{/* Cross-origin embeds use the page's existing visibility checks. */}
  const canRecord=()=>!document.hidden&&(!host||!host.document.hidden
    &&host.OjjudaAdminPreview?.isEnabled?.()!==true
    &&!frame?.closest('[hidden]')
    &&(!frame?.closest('dialog')||frame.closest('dialog').open));
  const resume=()=>{
    if(!canRecord()||pending)return;
    if(db){window.OjjudaSiteUsage.configure({client:db,canRecord});return;}
    pending=Promise.resolve().then(()=>client()).then(value=>{
      db=value;
      if(canRecord())window.OjjudaSiteUsage.configure({client:db,canRecord});
    }).catch(()=>{}).finally(()=>{pending=null;});
  };
  window.addEventListener('pageshow',resume);
  window.addEventListener('online',resume);
  document.addEventListener('visibilitychange',resume);
  if(frame){
    observer=new MutationObserver(resume);
    for(let node=frame;node;node=node.parentElement){
      observer.observe(node,{attributes:true,attributeFilter:['hidden','open']});
    }
  }
  window.addEventListener('pagehide',event=>{if(!event.persisted)observer?.disconnect();});
  resume();
}
