// Actual board SQL, RLS and game-action handler for two-browser handoff fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
async function createFixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema auth;create schema ojjuda_arcade_internal;create schema ojjuda_game_internal;create schema ojjuda_guest_internal;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated,service_role;
   create table public.board_games(id uuid primary key,kind text not null,p1 uuid not null,p2 uuid not null,p1_nick text default '',p2_nick text default '',status text not null default 'invited',moves jsonb not null default '[]',result text,reason text,created_at timestamptz default now(),updated_at timestamptz not null default now(),turn text not null default 'p1',janggi_layout jsonb not null default '{"c":"eheh","h":"hehe"}',undo_requested_by uuid,undo_requested_ply int,undo_p1_count int default 0,undo_p2_count int default 0,verified_state jsonb);
   alter table public.board_games enable row level security;
   create policy board_games_select on public.board_games for select to authenticated using(p1=(select auth.uid()) or p2=(select auth.uid()));
   grant select,insert,update,delete on public.board_games to authenticated;
   create table ojjuda_arcade_internal.rooms(match_id uuid,status text,kind text);
   create table ojjuda_game_internal.practice_results(user_id uuid,round_id uuid,game text,difficulty text,outcome text,created_at timestamptz);
   create function public.game_verified_commit(p_id uuid,p_actor uuid,p_ply int,p_updated_at timestamptz,p_move jsonb,p_turn text,p_result text,p_reason text,p_state jsonb) returns void language sql as $$select$$;
   revoke all on function public.game_verified_commit(uuid,uuid,int,timestamptz,jsonb,text,text,text,jsonb) from public,anon,authenticated;
   grant execute on function public.game_verified_commit(uuid,uuid,int,timestamptz,jsonb,text,text,text,jsonb) to service_role;`);
 const directory=path.join(__dirname,'../supabase/migrations'),migrations=fs.readdirSync(directory).filter(name=>name.endsWith('_board_computer_takeover.sql'));
 assert.equal(migrations.length,1,'exactly one board takeover migration is present');
 await db.exec(fs.readFileSync(path.join(directory,migrations[0]),'utf8'));
 let tail=Promise.resolve();
 const queue=(actor,role,operation)=>{
  const task=tail.then(async()=>{
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);
   if(role)await db.exec('set role '+role);
   try{return await operation();}finally{await db.exec('reset role');}
  });
  tail=task.catch(()=>{});return task;
 };
 const read=(actor,id)=>queue(actor,'authenticated',async()=>(await db.query('select to_jsonb(g) value from public.board_games g where id=$1',[id])).rows[0]?.value||null);
 const invoke=(actor,name,args,service=false)=>queue(actor,service?'service_role':'authenticated',async()=>{
  const parameters={
   game_leave:['p_id'],game_resign:['p_id'],game_undo_request:['p_id'],game_undo_answer:['p_id','p_accept'],
   game_computer_commit:['p_id','p_actor','p_ply','p_updated_at','p_move','p_turn','p_result','p_reason','p_state'],
   game_verified_commit:['p_id','p_actor','p_ply','p_updated_at','p_move','p_turn','p_result','p_reason','p_state']
  }[name];
  if(!parameters||(!service&&name.endsWith('_commit')))throw Error('unsupported_rpc');
  const values=parameters.map(key=>key==='p_move'||key==='p_state'?JSON.stringify(args[key]??null):args[key]??null);
  return (await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) value`,values)).rows[0]?.value??null;
 });
 const rpc=async(actor,name,args={})=>{try{return{data:await invoke(actor,name,args),error:null};}catch(error){return{data:null,error:{message:error.message,code:error.code}};}};
 const {createHandler}=await import('../supabase/functions/game-action/handler.mjs');
 const handlers=new Map();
 function handler(actor){
  if(handlers.has(actor))return handlers.get(actor);
  const result=createHandler({env:key=>({SUPABASE_URL:'https://board-fixture.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_ANON_KEY:'fixture-public'})[key],fetchImpl:async(input,options)=>{
   const url=new URL(input);
   if(url.pathname==='/auth/v1/user')return new Response(JSON.stringify({id:actor}));
   if(url.pathname==='/rest/v1/board_games'){
    const game=await read(actor,url.searchParams.get('id').replace(/^eq\./,''));
    return new Response(JSON.stringify(game?[game]:[]));
   }
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    assert.equal(options.headers.apikey,'fixture-service');
    try{await invoke(actor,url.pathname.split('/').at(-1),JSON.parse(options.body),true);return new Response('null');}
    catch(error){return new Response(JSON.stringify({message:error.message}),{status:409});}
   }
   throw Error('unsupported_fixture_request');
  }});
  handlers.set(actor,result);return result;
 }
 return {
  ids:ids.slice(),
  async create(kind){return queue(null,null,async()=>{
   const id=randomUUID();
   await db.query("insert into public.board_games(id,kind,p1,p2,p1_nick,p2_nick,status,turn) values($1,$2,$3,$4,'첫 회원','둘째 회원','playing','p1')",[id,kind,...ids]);
   await db.query("insert into ojjuda_arcade_internal.rooms values($1,'playing',$2)",[id,kind]);
   return(await db.query('select to_jsonb(g) value from public.board_games g where id=$1',[id])).rows[0].value;
  });},
  read,rpc,
  async call(actor,body){
   const response=await handler(actor)(new Request('https://edge-fixture.test',{method:'POST',headers:{Origin:'https://ojjuda.kr',Authorization:'Bearer fixture-'+actor},body:JSON.stringify(body)}));
   const data=await response.json();return response.ok?{data,error:null}:{data:null,error:{message:data.error,status:response.status}};
  },
  async close(){await tail;await db.close();}
 };
}
module.exports={createFixture};
