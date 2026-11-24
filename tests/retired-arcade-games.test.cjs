'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('retired games cannot be launched; both historical ranking entries and active games remain',()=>{
 const world=read('world.html'),guide=read('guide.html'),assets=read('shared/games/world-game-assets.js'),ranks=read('features/arcade/all-rankings.js');
 for(const game of ['poker','roulette']){
  assert.equal(fs.existsSync(path.join(root,'games',game,'index.html')),false);
  assert.doesNotMatch(assets,new RegExp('/games/'+game+'/'));
  assert.doesNotMatch(guide,new RegExp('id="game-'+game+'"'));
  assert.match(ranks,new RegExp("\\['"+game+"',"));
 }
 assert.match(world,/if\(t==='poker'\|\|t==='roulette'\)return M\('운영이 종료된 게임/);
 for(const game of ['matgo','onecard','yut','bang','tank'])assert.match(ranks,new RegExp("\\['"+game+"',"));
 assert.ok(fs.existsSync(path.join(root,'games/partyroulette/index.html')),'the separate party activity is not retired');
});

test('retired Poker edge entry always returns a refusal without running a game',async()=>{
 let handler;
 vm.runInNewContext(read('supabase/functions/poker/index.ts'),{Deno:{serve:fn=>{handler=fn;}},Response});
 assert.equal(typeof handler,'function');
 const response=await handler(new Request('https://fixture.invalid/poker',{method:'POST',body:'{"action":"create"}'}));
 assert.equal(response.status,410);
 assert.deepEqual(await response.json(),{ok:false,error:'game_retired'});
});

test('actual retirement migration revokes gameplay permissions and preserves stored history',async()=>{
 const db=new PGlite();
 const pokerArgs='uuid,text,uuid,text,uuid,integer,jsonb,jsonb';
 const signatures=['public.poker_online_service('+pokerArgs+')','ojjuda_poker_internal.room_service('+pokerArgs+')','public.roulette_action(text,jsonb)','ojjuda_roulette_internal.action(text,jsonb)'];
 const roles=['anon','authenticated','service_role'];
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;');
  for(const schema of ['ojjuda_poker_internal','ojjuda_roulette_internal','ojjuda_bang_internal','ojjuda_arcade_internal','ojjuda_yut_internal'])await db.exec('create schema '+schema);
  for(const sig of signatures)await db.exec("create function "+sig+" returns jsonb language sql as $$select '{\"ok\":true}'::jsonb$$; grant execute on function "+sig+" to anon, authenticated, service_role;");
  const roomFunctions=[['ojjuda_poker_internal.arcade_rooms','poker'],['ojjuda_roulette_internal.arcade_rooms','roulette'],['ojjuda_bang_internal.arcade_rooms','bang'],['ojjuda_arcade_internal.onecard_rooms','onecard'],['ojjuda_yut_internal.directory','yut']];
  for(const [fn,kind] of roomFunctions)await db.exec("create function "+fn+"() returns jsonb language sql stable as $$select jsonb_build_object('rooms',jsonb_build_array(jsonb_build_object('kind','"+kind+"')))$$;");
  await db.exec("create function public.arcade_general_extra_rooms() returns jsonb language sql stable as $$select jsonb_build_object('ok',true,'rooms',ojjuda_poker_internal.arcade_rooms()->'rooms'||ojjuda_roulette_internal.arcade_rooms()->'rooms'||ojjuda_bang_internal.arcade_rooms()->'rooms'||ojjuda_arcade_internal.onecard_rooms()->'rooms'||ojjuda_yut_internal.directory()->'rooms')$$;");
  for(const kind of ['poker','roulette']){
   await db.exec("create table ojjuda_"+kind+"_internal.wallets(id integer primary key,gold integer);insert into ojjuda_"+kind+"_internal.wallets values(1,12500);create table ojjuda_"+kind+"_internal.rounds(id integer primary key,score integer);insert into ojjuda_"+kind+"_internal.rounds values(1,456),(2,789);");
   await db.exec("create function ojjuda_"+kind+"_internal.ranking() returns jsonb language sql stable as $$select jsonb_agg(score order by score desc) from ojjuda_"+kind+"_internal.rounds$$;");
  }
  const snapshot=async()=>{const out=[];for(const kind of ['poker','roulette']){
   out.push((await db.query("select (select jsonb_agg(w order by id) from ojjuda_"+kind+"_internal.wallets w) wallets,(select jsonb_agg(r order by id) from ojjuda_"+kind+"_internal.rounds r) rounds,ojjuda_"+kind+"_internal.ranking() ranking")).rows[0]);
  }return out;};
  const check=async(expected)=>{for(const role of roles)for(const sig of signatures)assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,sig])).rows[0].allowed,expected,role+' '+sig);};
  const before=await snapshot();
  await check(true);
  await db.exec(read('supabase/migrations/20261124181229_retire_arcade_poker_and_roulette_preserve_rankings.sql'));
  await check(false);
  assert.deepEqual(await snapshot(),before,'no wallet, round or ranking history changes');
  const result=(await db.query('select public.arcade_general_extra_rooms() value')).rows[0].value;
  assert.equal(result.ok,true);
  assert.deepEqual(result.rooms.map(r=>r.kind),['bang','onecard','yut']);
 }finally{await db.close();}
});
