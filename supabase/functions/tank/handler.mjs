import {newGame,advance,validateCommand} from './engine.mjs';
import {computerCommand} from './computer.mjs';
const origins=new Set(['https://ojjuda.kr','https://www.ojjuda.kr','https://ojjuda-note.github.io']);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const errors=new Set(['not_signed_in','banned','room_in_progress','room_rate_limit','room_full','room_not_found','room_unavailable','room_already_started','not_room_owner','need_players','state_conflict','not_your_turn','invalid_move','invalid_options','invalid_request','coins','wallet_unavailable','already_eliminated']);
const actions=new Set(['list','mine','create','join','read','start','fire','cpu','surrender','leave']);
function view({room:r,seat,coins}){
 if(!r)return null;
 return {id:r.id,code:r.code,title:r.title,capacity:r.capacity,mode:r.mode||'online',names:r.names,seat,
  hostSeat:r.members.indexOf(r.host_id),status:r.status,version:r.version,deadline:r.deadline,
  serverTime:Date.now(),game:r.state,event:r.last_event,coins};
}
export function createHandler({env,fetchImpl=fetch,seed=()=>crypto.getRandomValues(new Uint32Array(1))[0]}){
 const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY'),anon=env('SUPABASE_ANON_KEY');
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin',
   'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://ojjuda.kr',
   'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!origins.has(origin))return reply({error:'origin_not_allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  const authorization=request.headers.get('authorization');
  if(!authorization?.startsWith('Bearer '))return reply({error:'not_signed_in'},401);
  if(!url||!service||!anon)return reply({error:'unavailable'},503);
  let body;
  try{
   const reader=request.body?.getReader();if(!reader)throw Error();
   const chunks=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw Error();}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
   body=JSON.parse(new TextDecoder().decode(bytes));
   if(!actions.has(body.action))throw Error();
   if(['read','start','fire','cpu','surrender','leave'].includes(body.action)&&!uuid.test(body.room_id))throw Error();
   if(['create','start','fire','cpu','surrender'].includes(body.action)&&!uuid.test(body.request_id))throw Error();
   if(['start','fire','cpu','surrender'].includes(body.action)&&(!Number.isInteger(body.version)||body.version<0))throw Error();
   if(body.action==='join'&&(typeof body.code!=='string'||!/^[a-f0-9]{8}$/i.test(body.code)))throw Error();
   if(body.action==='fire')validateCommand(body.command);
   if(body.action==='create'&&(!body.options||!Number.isInteger(body.options.capacity)||body.options.capacity<2||body.options.capacity>12||typeof body.options.title!=='string'||!body.options.title.trim()||[...body.options.title.trim()].length>40))throw Error();
   if(body.action==='create'&&!['online','solo'].includes(body.options.mode??'online'))throw Error();
  }catch{return reply({error:'bad_request'},400);}
  const get=(path,options)=>fetchImpl(url+path,{signal:AbortSignal.timeout(12000),...options});
  try{
   const auth=await get('/auth/v1/user',{headers:{apikey:anon,authorization}});
   if(!auth.ok)return reply({error:'not_signed_in'},401);
   const user=await auth.json();if(!uuid.test(user.id)||user.is_anonymous)return reply({error:'not_signed_in'},401);
   const rpc=async(action,values={})=>{
    const response=await get('/rest/v1/rpc/tank_online_service',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({p_actor:user.id,p_action:action,...values})});
    const data=await response.json();if(!response.ok)throw Error(errors.has(data.message)?data.message:'unavailable');return data;
   };
   const catchUp=async result=>{
    if(!result.room||result.room.mode==='solo'||result.room.status!=='active'||Date.parse(result.room.deadline)>Date.now())return result;
    const command={type:'timeout'},next=advance(result.room.state,result.room.state.turn,command);
    try{return await rpc('commit',{p_room:result.room.id,p_expected:result.room.version,p_request:crypto.randomUUID(),p_next:{...next,event:{type:'timeout',fromVersion:result.room.version,actor:result.room.state.turn}}});}
    catch(e){if(e.message!=='state_conflict'&&e.message!=='room_unavailable')throw e;return rpc('read',{p_room:result.room.id});}
   };
   let result;
   if(['start','fire','cpu','surrender'].includes(body.action)){
    result=await rpc('read',{p_room:body.room_id});
    if(!result.room.requests.includes(body.request_id)){
     result=await catchUp(result);
     if(body.version!==result.room.version)throw Error('state_conflict');
     let next,event={type:body.action,actor:result.seat,fromVersion:body.version};
     if(body.action==='start'){
      if(result.room.host_id!==user.id||result.room.status!=='waiting')throw Error('not_room_owner');
      const names=result.room.mode==='solo'?[result.room.names[0],...Array.from({length:result.room.capacity-1},(_,i)=>`컴퓨터 ${i+1}`)]:result.room.names;
      next={state:newGame(names,result.room.id,seed()),price:0};
     }else if(body.action==='cpu'){
      if(result.room.mode!=='solo'||result.room.status!=='active'||result.room.state.turn===result.seat)throw Error('not_your_turn');
      const command=computerCommand(result.room.state);
      next=advance(result.room.state,result.room.state.turn,command);
      event={type:'fire',actor:result.room.state.turn,fromVersion:body.version,computer:true,command};
     }else{
      if(result.room.status!=='active')throw Error('room_unavailable');
      // Ignore all client state, cost, weapon metadata and command.type fields.
      const command=body.action==='surrender'?{type:'surrender'}:{type:'fire',weapon:body.command.weapon,angle:body.command.angle,power:body.command.power,moves:body.command.moves};
      next=advance(result.room.state,result.seat,command);event.command=command;
     }
     if(result.room.mode==='solo'&&next.state.tanks[0].hp<=0)next.state.over=true;
     result=await rpc(body.action==='start'?'start':'commit',{p_room:body.room_id,p_expected:body.version,p_request:body.request_id,p_next:{...next,event}});
    }
   }else result=await rpc(body.action,{p_room:body.room_id??null,p_code:body.code??null,p_request:body.request_id??null,p_options:body.action==='create'?body.options:{}});
   result=await catchUp(result);
   return reply({ok:true,room:view(result),rooms:result.rooms,coins:result.coins});
  }catch(e){const error=errors.has(e.message)?e.message:'unavailable';return reply({error},error==='unavailable'?503:409);}
 };
}
