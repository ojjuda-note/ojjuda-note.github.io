import { verifyAction } from './rules.mjs';
const origins = new Set(['https://ojjuda.kr','https://www.ojjuda.kr','https://ojjuda-note.github.io']);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function createHandler({env,fetchImpl=fetch}) {
  const url=env('SUPABASE_URL'), service=env('SUPABASE_SERVICE_ROLE_KEY'), anon=env('SUPABASE_ANON_KEY');
  return async request => {
    const origin=request.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
      'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://ojjuda.kr',
      'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
    const reply=(data,status=200)=>new Response(JSON.stringify(data),{headers,status});
    if (origin && !origins.has(origin)) return reply({error:'origin_not_allowed'},403);
    if (request.method==='OPTIONS') return new Response(null,{headers,status:204});
    if (request.method!=='POST') return reply({error:'method_not_allowed'},405);
    if (!url || !service || !anon) return reply({error:'game_unavailable'},503);
    const authorization=request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply({error:'not_signed_in'},401);
    let body;
    try {
      const reader=request.body?.getReader(); if(!reader) throw Error();
      const chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw Error();}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      body=JSON.parse(new TextDecoder().decode(bytes));
      if(!uuid.test(body.p_id)||!['game_move','game_shot'].includes(body.action))throw Error();
    } catch {return reply({error:'bad_request'},400);}
    const get=(path,options={})=>fetchImpl(url+path,{signal:AbortSignal.timeout(10000),...options});
    try {
      // Validate the live session with Auth, then use the same session for RLS.
      // A user ID supplied in the request is never trusted.
      const auth=await get('/auth/v1/user',{headers:{apikey:anon,authorization}});
      if(!auth.ok)return reply({error:'not_signed_in'},401);
      const user=await auth.json();if(!uuid.test(user.id))return reply({error:'not_signed_in'},401);
      const response=await get(`/rest/v1/board_games?id=eq.${body.p_id}&select=*`,{headers:{apikey:anon,authorization}});
      if(!response.ok)return reply({error:'game_unavailable'},503);
      const game=(await response.json())[0];
      if(!game||![game.p1,game.p2].includes(user.id))return reply({error:'not_a_player'},403);
      let checked;try{checked=verifyAction(game,user.id,body);}catch(error){return reply({error:error.message},409);}
      const saved=await get('/rest/v1/rpc/game_verified_commit',{method:'POST',
        headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},
        body:JSON.stringify({p_id:game.id,p_actor:user.id,p_ply:body.p_ply,p_updated_at:game.updated_at,
          p_move:checked.move,p_turn:checked.turn,p_result:checked.result,p_reason:checked.reason,p_state:checked.state})});
      if(!saved.ok)return reply({error:'out_of_sync'},409);
      return reply({ok:true,move:checked.move,result:checked.result});
    }catch{return reply({error:'game_unavailable'},503);}
  };
}
