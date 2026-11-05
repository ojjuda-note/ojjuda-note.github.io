const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),P=require('../screw-flat-physics.js'),G=require('../screw-flat.js');
const {verifyClear}=require('../supabase/functions/flat-drill-clear/replay.cjs');
const store=new Map();global.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
const wait=()=>new Promise(r=>setImmediate(r));
async function main(){
 const db=new PGlite(),member=randomUUID(),other=randomUUID();
 await db.exec(`
 create role authenticated;create role anon;create role service_role;create schema auth;create schema ojjuda_note_internal;create schema ojjuda_shop_internal;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.is_banned(uuid) returns boolean language sql as $$select false$$;
 create table public.user_private(user_id uuid primary key,coins integer);create table public.game_scores(user_id uuid,game text,score integer,id bigint generated always as identity,created_at timestamptz default now());
 create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb,created_at timestamptz default now());
 insert into auth.users values('${member}'),('${other}');insert into public.user_private values('${member}',10),('${other}',0);
 insert into public.game_scores(user_id,game,score) values('${member}','screw_flat',380);
 insert into ojjuda_note_internal.spend_requests values('${randomUUID()}','${member}','screw_flat_moves',1,'{"stage":3}'),('${randomUUID()}','${member}','screw_flat_hole',1,'{"stage":6}');
 `);
 const folder=path.join(__dirname,'../supabase/migrations');
 await db.exec(fs.readFileSync(path.join(folder,fs.readdirSync(folder).find(n=>n.endsWith('_flat_drill_inventory.sql'))),'utf8'));
 const rpc=async(action,run,e={})=>(await db.query('select public.flat_drill_action($1,$2,$3,$4,$5,$6,$7) as r',[action,run.stage,run.run,run.attempt,e.request||null,e.device||null,e.legacy||0])).rows[0].r;
 const verify=async(p)=>(await db.query('select public.flat_drill_verified_clear($1,$2,$3,$4,$5) as r',[member,p.stage,p.run,p.events?.length||2,p.attempt])).rows[0].r;
 const run=stage=>({stage,run:randomUUID(),attempt:randomUUID()});
 await db.query("select set_config('test.uid',$1,false)",[member]);
 const past=run(7),device=randomUUID();assert.equal((await rpc('start',past)).balance,4);
 assert.equal((await rpc('start',past,{device,legacy:7})).balance,5,'the historical delta excludes item stages 3 and 6');
 assert.equal((await rpc('start',past,{device,legacy:7})).legacy_added,0);
 assert.equal((await verify(past)).reward,'legacy');
 const r=run(8);await rpc('start',r);assert.equal((await verify(r)).added,1);assert.equal((await verify(r)).added,0);
 const retry=run(8);await rpc('start',retry);assert.equal((await verify(retry)).reward,'retry');
 const lost=run(9);await rpc('start',lost);await rpc('fail',lost);assert.equal((await verify(lost)).reward,'retry');
 const used=run(10);await rpc('start',used);const receipt=randomUUID();
 let a=await rpc('use',used,{request:receipt});assert.equal(a.count,1);assert.equal(a.balance,5);
 a=await rpc('use',used,{request:receipt});assert.equal(a.count,1);assert.equal(a.balance,5);
 assert.equal((await verify(used)).reward,'items_used');
 const paid=run(11);await rpc('start',paid);
 await db.query('insert into ojjuda_note_internal.spend_requests values($1,$2,$3,1,$4)',[randomUUID(),member,'screw_flat_moves',JSON.stringify({stage:11,attempt_id:paid.attempt})]);
 assert.equal((await verify(paid)).reward,'items_used');
 assert.equal((await db.query('select coins from public.user_private where user_id=$1',[member])).rows[0].coins,10);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.flat_drill_verified_clear(uuid,integer,uuid,integer,uuid)','execute') as ok")).rows[0].ok,false);
 await db.query("select set_config('test.uid',$1,false)",[other]);assert.equal((await rpc('start',run(8),{device,legacy:7})).balance,0);
 // The older scorer recorded every fallen piece and a separate stage bonus.
 // Two complete successive runs establish stages 6 and 7 on the server.
 await db.query(`insert into public.game_scores(user_id,game,score,created_at)
   select $1,'screw_flat',v,'2026-11-02 12:00+00'::timestamptz+i*interval '1 second'
   from unnest(array[10,20,30,100,110,120,130,210]) with ordinality a(v,i)`,[member]);
 await db.exec(fs.readFileSync(path.join(folder,fs.readdirSync(folder).find(n=>n.endsWith('_reconcile_flat_drill_history.sql'))),'utf8'));
 assert.equal((await db.query('select confirmed_stage from ojjuda_shop_internal.flat_drill_legacy_evidence where user_id=$1',[member])).rows[0].confirmed_stage,7);
 await db.query("select set_config('test.uid',$1,false)",[member]);
 const before=(await rpc('status',past)).balance;
 assert.equal((await rpc('start',run(34),{device,legacy:35})).balance,before,'an unsigned browser record cannot mint unsupported ranks');
 assert.equal((await db.query('select device_claim from ojjuda_shop_internal.flat_drill_legacy_evidence where user_id=$1',[member])).rows[0].device_claim,35);
 await db.close();
 let score=0,rankSaves=0,proof;
 const api={getUserId:()=>member,setScore:n=>{score=n;},saveScore:()=>rankSaves++,
  drillAction:async()=>({ok:true,balance:0}),verifyDrill:async p=>{proof=p;return {ok:true,reward:'earned',balance:1};}};
 const play=g=>{
  const st=g.state;
  for(const [i,id] of st.level.order.entries()){
   const h=st.level.screws[id].hole,to=st.level.holes[i];
   g.onDown(h.x,h.y,1);g.onUp(h.x,h.y,1);g.onDown(to.x,to.y,1);g.onUp(to.x,to.y,1);
   for(let t=0;t<34;t++)g.update(.05);
  }
  for(let t=0;t<100&&!st.complete;t++)g.update(.05);
  assert.equal(st.complete,true);
 };
 const g=G.flat(api,1);play(g);await wait();await wait();
 assert.ok(score>0&&rankSaves===1);assert.equal(g.drillState.result,'드릴 1개 획득');
 assert.equal(proof.physics,'whole-plates-v2');assert.ok(verifyClear(proof.stage,proof.events,proof.endTick));assert.equal(verifyClear(1,proof.events.slice(0,1),proof.endTick),false);
 g.destroy();store.clear();proof=null;const aided=G.flat(api,1);aided.state.extraMoves=3;play(aided);await wait();
 assert.equal(rankSaves,2,'an assisted clear is still ranked');assert.equal(proof,null,'no award requested for a purchased item');
 assert.match(aided.drillState.result,/아이템 사용/);aided.destroy();
 store.clear();const guest=G.flat({setScore(){}},1);await wait();play(guest);await wait();assert.equal(guest.drillState.balance,1);guest.destroy();
 const later=G.flat({setScore(){}},2);await wait();await later.useDrill();assert.equal(later.drillState.balance,0);assert.equal(later.state.extraHoles,1);later.destroy();
 console.log('PASS: legacy top-ups, first attempt, retry/failure, assisted rankings, idempotent spending, guest carryover and verified physical replay.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
