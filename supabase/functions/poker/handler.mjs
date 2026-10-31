import {newGame,move,project} from './game.mjs';
const origins=new Set(['https://ojjuda.kr','https://www.ojjuda.kr','https://ojjuda-note.github.io']);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const errors=new Set(['not_signed_in','adult_required','member_identity_required','banned','room_in_progress','room_rate_limit','room_full','room_not_found','room_unavailable','not_room_owner','need_players','state_conflict','not_your_turn','invalid_move','invalid_options','invalid_request','gold_empty','gold_not_empty','no_account','round_in_progress','paid_confirmation_required','insufficient_zzu']);
const actions=new Set(['status','refill','list','mine','create','join','read','start','move','ready','leave']);
export function createHandler({env,fetchImpl=fetch,random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296}){
 const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY'),anon=env('SUPABASE_ANON_KEY');
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://ojjuda.kr','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
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
   if(['read','start','move','ready','leave'].includes(body.action)&&!uuid.test(body.room_id))throw Error();
   if(['refill','create','start','move','ready','leave'].includes(body.action)&&!uuid.test(body.request_id))throw Error();
   if(['start','move','ready','leave'].includes(body.action)&&(!Number.isInteger(body.version)||body.version<0))throw Error();
   if(body.action==='refill'&&typeof body.paid!=='boolean')throw Error();
   if(body.action==='join'&&(typeof body.code!=='string'||!/^[a-f0-9]{8}$/i.test(body.code)))throw Error();
   if(body.action==='move'&&(!body.command||!['discard','open','fold','check','call','raise','allin'].includes(body.command.type)))throw Error();
   if(body.action==='create'&&(!body.options||![2,3,4].includes(body.options.capacity)||typeof body.options.title!=='string'||!body.options.title.trim()||[...body.options.title.trim()].length>40||body.options.mode&&!['solo','online'].includes(body.options.mode)||body.options.difficulty&&!['easy','normal'].includes(body.options.difficulty)||body.options.mode==='solo'&&body.options.capacity!==4))throw Error();
  }catch{return reply({error:'bad_request'},400);}
  const get=(path,options)=>fetchImpl(url+path,{signal:AbortSignal.timeout(12000),...options});
  try{
   const auth=await get('/auth/v1/user',{headers:{apikey:anon,authorization}});
   if(!auth.ok)return reply({error:'not_signed_in'},401);
   const user=await auth.json();if(!uuid.test(user.id)||user.is_anonymous)return reply({error:'not_signed_in'},401);
   const rpc=async(action,values={})=>{
    const response=await get('/rest/v1/rpc/poker_online_service',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({p_actor:user.id,p_action:action,...values})});
    const data=await response.json();if(!response.ok)throw Error(errors.has(data.message)?data.message:'unavailable');return data;
   };
   const catchUp=async(result,settling=false)=>{
    if(!result.room||result.room.status!=='active'||Date.parse(result.room.deadline)>Date.now())return result;
    const r=result.room,computer=r.mode==='online'&&['discard','open','betting'].includes(r.state.phase),ai=r.state.phase==='betting'&&(computer||r.mode==='solo'&&r.state.turn>0),state=move(r.state,r.state.turn,{type:ai?'ai':'timeout'},random,r.difficulty,computer);
    try{return await rpc('commit',{p_room:r.id,p_expected:r.version,p_request:crypto.randomUUID(),p_next:{state,kind:'timeout',...(computer?{automaticSeat:r.state.turn}:{})}});}
    catch(e){if(e.message!=='state_conflict')throw e;return settling?rpc('mine'):rpc('read',{p_room:r.id});}
   };
   let result;
   if(['start','move','ready','leave'].includes(body.action)){
    result=await rpc('read',{p_room:body.room_id});
    const r=result.room;
    if(!r.requests.includes(body.request_id)){
     if(body.action==='move')result=await catchUp(result);
     if(body.action!=='leave'&&body.version!==result.room.version)throw Error('state_conflict');
     let state=null;
     if(body.action==='start'){
      if(r.host_id!==user.id||r.status!=='waiting')throw Error('not_room_owner');
      if(r.mode!=='solo'&&r.members.length<2)throw Error('need_players');state=newGame(r.names,null,random,{mode:r.mode,stacks:result.stacks});
     }else if(body.action==='move'){
      if(r.status!=='active')throw Error('room_unavailable');state=move(r.state,result.seat,body.command);
     }else if(body.action==='leave'&&r.status==='active'){
      // The seat's cards, stack and turn stay at the table. Its escrow is only
      // released by the existing final settlement, never refunded twice.
      state=r.mode==='solo'?move(r.state,result.seat,{type:'leave'}):structuredClone(r.state);
      if(r.mode==='solo'||r.departed.every((left,i)=>left||i===result.seat)){
       for(let i=0;state.phase!=='finished'&&i<200;i++)state=move(state,state.turn,{type:state.phase==='betting'?'ai':'timeout'},random,r.difficulty,true);
       if(state.phase!=='finished')throw Error('invalid_move');
      }
     }
     else if(body.action==='ready'){
      if(r.status!=='finished'||r.departed.some(Boolean))throw Error('room_unavailable');
      if(r.ready.every((ready,i)=>ready||i===result.seat))state=newGame(r.names,r.state,random,{mode:r.mode,stacks:result.stacks});
     }
     result=await rpc(body.action==='move'?'commit':body.action,{p_room:body.room_id,p_expected:result.room.version,p_request:body.request_id,p_next:{state,kind:body.action}});
    }
   }else result=await rpc(body.action,{p_room:body.room_id??null,p_code:body.code??null,p_request:body.request_id??null,p_options:body.action==='create'?body.options:body.action==='refill'?{paid:body.paid}:{}});
   if(['status','refill'].includes(body.action))return reply({ok:true,wallet:result.wallet});
   if(body.action==='create'&&result.room?.mode==='solo'&&result.room.status==='waiting'){
    const r=result.room,state=newGame(r.names,null,random,{mode:'solo',stacks:result.stacks});
    result=await rpc('start',{p_room:r.id,p_expected:r.version,p_request:body.request_id,p_next:{state,kind:'start'}});
   }
   if(body.action==='leave')return reply({ok:true,room:null,wallet:result.wallet});
   if(!result.room&&result.settlement&&Date.parse(result.settlement.deadline)<=Date.now()){
    // A waiting wallet may be the only connected client. Advance at most one
    // expired server decision; the departed account still receives no room.
    await catchUp({room:result.settlement},true);result=await rpc('mine');
   }else result=await catchUp(result);
   return reply({ok:true,room:project(result),rooms:result.rooms,wallet:result.wallet});
  }catch(e){const error=errors.has(e.message)?e.message:'unavailable';return reply({error},error==='unavailable'?503:409);}
 };
}
