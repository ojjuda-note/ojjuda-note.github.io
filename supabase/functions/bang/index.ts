import {createOnline,createSolo,soloOptions,soloNeedsMove,advanceSolo,moveOnline,automaticOnline,visibleState} from './online-engine.js';
const url=Deno.env.get('SUPABASE_URL')||'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
async function rpc(body:Record<string,unknown>){
 const result=await fetch(`${url}/rest/v1/rpc/bang_online_service`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await result.json();if(!result.ok)throw Error(data.message||'unavailable');return data;
}
function publicRoom(raw:any,seat:number,record:any=null){
 if(!raw)return null;
 return {id:raw.id,code:raw.code,title:raw.title,names:raw.names,capacity:raw.capacity,status:raw.status,version:raw.version,
  mode:raw.mode||'multiplayer',record,seat,hostSeat:raw.members.indexOf(raw.host_id),deadline:raw.mode==='solo'?null:raw.deadline,computerSeats:raw.computer_seats||[],rankExcluded:raw.rank_excluded||[],state:visibleState(raw.state,seat)};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return response({ok:false,error:'method_not_allowed'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>4096)return response({ok:false,error:'invalid_request'},400);
  const text=await req.text();if(text.length>4096)return response({ok:false,error:'invalid_request'},400);
  const body=JSON.parse(text);
  if(!body||!['mine','create','solo','join','read','start','move','leave','surrender'].includes(body.action))throw Error('invalid_action');
  const authorization=req.headers.get('authorization')||'';
  if(!/^Bearer \S+$/i.test(authorization))return response({ok:false,error:'not_signed_in'},401);
  const auth=await fetch(`${url}/auth/v1/user`,{headers:{apikey:service,Authorization:authorization}});
  if(!auth.ok)return response({ok:false,error:'not_signed_in'},401);
  const user=await auth.json();if(!uuid(user.id)||user.is_anonymous)return response({ok:false,error:'not_signed_in'},401);
  const actor=user.id,action=body.action;
  if(!['mine','create','solo','join'].includes(action)&&!uuid(body.room_id))throw Error('invalid_request');
  if(action==='join'&&(typeof body.code!=='string'||!/^[A-F0-9]{8}$/i.test(body.code)))throw Error('invalid_code');
  if(['create','solo','start','move','surrender'].includes(action)&&!uuid(body.request_id))throw Error('invalid_request');
  if(['start','move','surrender'].includes(action)&&!Number.isInteger(body.version))throw Error('invalid_request');
  const base={p_actor:actor,p_room:body.room_id||null};
  let current;
  if(['mine','create','solo','join','leave'].includes(action)){
   const options=action==='solo'?{...soloOptions(body.options),capacity:body.options.count,mode:'solo'}:action==='create'?{capacity:body.options?.capacity,title:body.options?.title,mode:'multiplayer'}:{};
   current=await rpc({...base,p_action:action==='solo'?'create':action,p_code:body.code||null,p_request:body.request_id||null,p_options:options});
  }else{
   current=await rpc({...base,p_action:'read'});
   const r=current.room,seat=current.seat;
   if(['start','move','surrender'].includes(action)){
    if(r.requests.includes(body.request_id))return response({ok:true,room:publicRoom(r,seat,current.record)});
    if(r.version!==body.version)throw Error('state_conflict');
    let state;
    if(action==='start'){
     if(r.host_id!==actor||r.status!=='waiting')throw Error('not_room_owner');
     state=r.mode==='solo'?createSolo(r.names[0],r.id,r.options,random):createOnline(r.names,r.id,random);
    }else{
     if(r.status!=='active')throw Error('room_unavailable');
     state=moveOnline(r.state,seat,action==='surrender'?{type:'surrender'}:body.move,random);
     if(r.mode==='solo')state=advanceSolo(state,random);
    }
    current=await rpc({...base,p_action:action==='start'?'start':'commit',p_request:body.request_id,p_expected:r.version,p_next:{state}});
   }
  }
  // A retried create or a reload also finishes an interrupted solo start.
  if(current.room?.mode==='solo'&&current.room.status==='waiting'){
   const r=current.room;
   try{current=await rpc({...base,p_room:r.id,p_action:'start',p_request:r.create_request,p_expected:r.version,p_next:{state:createSolo(r.names[0],r.id,r.options,random)}});}
   catch(error){if(error.message!=='state_conflict')throw error;current=await rpc({...base,p_room:r.id,p_action:'read'});}
  }
  if(current.room?.status==='active'&&(current.room.mode==='solo'?soloNeedsMove(current.room.state):Date.parse(current.room.deadline)<=Date.now())){
   const r=current.room;
   const computer=(r.computer_seats||[]).includes(r.state.pending?.player??r.state.current);
   try{current=await rpc({...base,p_room:r.id,p_action:'commit',p_request:crypto.randomUUID(),p_expected:r.version,p_next:{state:r.mode==='solo'?advanceSolo(r.state,random):automaticOnline(r.state,random,computer),...(r.mode==='solo'?{}:{automaticSeat:r.state.pending?.player??r.state.current})}});}
   catch(error){if(error.message!=='state_conflict')throw error;current=await rpc({...base,p_room:r.id,p_action:'read'});}
  }
  return response({ok:true,room:publicRoom(current.room,current.seat,current.record)});
 }catch(error){
  const code=String(error?.message||'unavailable');
  const known=['not_signed_in','banned','invalid_action','invalid_request','invalid_options','invalid_code','not_your_turn','room_not_found','room_unavailable','room_in_progress','room_already_started','room_full','room_rate_limit','not_room_owner','need_players','state_conflict','game_finished','already_eliminated','use_surrender'];
  return response({ok:false,error:known.includes(code)?code:'unavailable'},known.includes(code)?400:500);
 }
});
