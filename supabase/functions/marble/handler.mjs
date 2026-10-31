import {newGame,advance,automaticTurn,prompt,assets} from './engine.mjs';
const origins=new Set(['https://ojjuda.kr','https://www.ojjuda.kr','https://ojjuda-note.github.io']);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const errors=new Set(['not_signed_in','banned','room_in_progress','room_rate_limit','room_full','room_not_found','room_unavailable','room_already_started','not_room_owner','need_players','state_conflict','not_your_turn','invalid_choice','invalid_move','invalid_options','invalid_request']);
const actions=new Set(['mine','create','join','read','start','move','surrender','leave']);
function view({room:r,seat}){
 if(!r)return null;
 const computerSeats=r.computer_seats||[],game=r.state&&computerSeats.length?{...r.state,players:r.state.players.map((player,i)=>({...player,name:player.name+(computerSeats.includes(i)?' (컴퓨터)':'')}))}:r.state;
 return {id:r.id,code:r.code,title:r.title,capacity:r.capacity,maxRound:r.max_round,names:r.names,
  seat,hostSeat:r.members.indexOf(r.host_id),status:r.status,version:r.version,deadline:r.deadline,
  serverTime:Date.now(),game,prompt:r.state?prompt(r.state):null,computerSeats,rankExcluded:r.rank_excluded||[],ranked:!!r.ranked_at};
}
const next=g=>({state:g,scores:g.over?g.players.map((_,i)=>Math.max(0,Math.min(1000000,assets(g,i)))):null});
export function createHandler({env,fetchImpl=fetch,random}){
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
   if(['read','start','move','surrender','leave'].includes(body.action)&&!uuid.test(body.room_id))throw Error();
   if(['create','start','move','surrender'].includes(body.action)&&!uuid.test(body.request_id))throw Error();
   if(['start','move','surrender'].includes(body.action)&&(!Number.isInteger(body.version)||body.version<0))throw Error();
   if(body.action==='join'&&(typeof body.code!=='string'||!/^[a-f0-9]{8}$/i.test(body.code)))throw Error();
   if(body.action==='move'&&(!body.command||!['roll','choose'].includes(body.command.type)))throw Error();
   if(body.action==='create'&&(!body.options||![2,3,4,5,6,7,8].includes(body.options.capacity)||![0,15,25].includes(body.options.maxRound)||typeof body.options.title!=='string'||!body.options.title.trim()||[...body.options.title.trim()].length>40))throw Error();
  }catch{return reply({error:'bad_request'},400);}
  const get=(path,options)=>fetchImpl(url+path,{signal:AbortSignal.timeout(12000),...options});
  try{
   // The publishable key is not identity: validate the session with Auth on every call.
   const auth=await get('/auth/v1/user',{headers:{apikey:anon,authorization}});
   if(!auth.ok)return reply({error:'not_signed_in'},401);
   const user=await auth.json();if(!uuid.test(user.id)||user.is_anonymous)return reply({error:'not_signed_in'},401);
   const rpc=async(action,values={})=>{
    const response=await get('/rest/v1/rpc/marble_online_service',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({p_actor:user.id,p_action:action,...values})});
    const data=await response.json();if(!response.ok)throw Error(errors.has(data.message)?data.message:'unavailable');return data;
   };
   const catchUp=async state=>{
    if(!state.room||state.room.status!=='active'||Date.parse(state.room.deadline)>Date.now())return state;
    const g=automaticTurn(state.room.state,random,(state.room.computer_seats||[]).includes(state.room.state.turn));
    try{return await rpc('commit',{p_room:state.room.id,p_expected:state.room.version,p_request:crypto.randomUUID(),p_next:{...next(g),automaticSeat:state.room.state.turn}});}
    catch(e){if(e.message!=='state_conflict'&&e.message!=='room_unavailable')throw e;return rpc('read',{p_room:state.room.id});}
   };
   let state;
   if(['start','move','surrender'].includes(body.action)){
    state=await rpc('read',{p_room:body.room_id});
    if(!state.room.requests.includes(body.request_id)){
     state=await catchUp(state);
     if(body.version!==state.room.version)throw Error('state_conflict');
     let g;
     if(body.action==='start'){
      if(state.room.host_id!==user.id||state.room.status!=='waiting')throw Error('not_room_owner');
      if(state.room.names.length<2)throw Error('need_players');
      g=newGame(state.room.names,{runId:state.room.id,maxRound:state.room.max_round});
     }else{
      if(state.room.status!=='active')throw Error('room_unavailable');
      g=advance(state.room.state,state.seat,body.action==='surrender'?{type:'surrender'}:body.command,random);
     }
     state=await rpc(body.action==='start'?'start':'commit',{p_room:body.room_id,p_expected:body.version,p_request:body.request_id,p_next:next(g)});
    }
   }else state=await rpc(body.action,{p_room:body.room_id??null,p_code:body.code??null,p_request:body.request_id??null,p_options:body.action==='create'?body.options:{}});
   state=await catchUp(state);
   return reply({ok:true,room:view(state)});
  }catch(e){const error=errors.has(e.message)?e.message:'unavailable';return reply({error},error==='unavailable'?503:409);}
 };
}
