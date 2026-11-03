const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {randomUUID} = require('node:crypto');
const {test} = require('node:test');
const {pathToFileURL} = require('node:url');
const {createFixture,read,definition} = require('./monthly-game-rankings-fixture.cjs');
const folder=path.join(__dirname,'../supabase/migrations');
const migration=suffix=>read(fs.readdirSync(folder).find(name=>name.endsWith(suffix)));

test('archery single launch resets every item once and ranks current cleared server runs',async t=>{
 const {db,clock,claim,actor}=await createFixture();
 let currentUser=null;
 const admin=async(sql,args=[])=>{await db.exec('reset role');try{return await db.query(sql,args)}finally{await db.exec('set role authenticated')}};
 const login=async id=>{currentUser=id;await db.exec('reset role');await claim(id);await db.exec(id?'set role authenticated':'set role anon')};
 const rpc=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const action=(kind,request=null,run=null,stage=null,score=null,epoch=4)=>rpc('archery_single_action',[kind,epoch,request,run,stage,score]);
 const start=(stage,id=randomUUID())=>action('round-start',id,null,stage);
 const complete=(run,stage,score,id=randomUUID())=>action('round-complete',id,run,stage,score);
 const patchClocks=async()=>{
  await db.exec('reset role');
  const funcs=await db.query("select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ojjuda_archery_internal'");
  for(const {definition:sql}of funcs.rows){const patched=sql.replace(/\b(?:clock_timestamp|statement_timestamp|now)\(\)/g,'fixture.clock()');if(patched!==sql)await db.exec(patched)}
  await db.exec('set role authenticated');
 };
 let instant=Date.now()+86400000;
 const tick=async()=>{instant+=10000;await admin('update fixture.clock_value set value=$1',[new Date(instant).toISOString()])};
 const round=async(stage,score)=>{await tick();const run=await start(stage);assert.equal(run.ok,true);await tick();const id=randomUUID();const result=await complete(run.run_id,stage,score,id);assert.equal(result.ok,true);return {run:run.run_id,id,result,stage,score}};
 try{
  await db.exec(`alter table public.user_private add column coins integer not null default 100;
   create schema ojjuda_note_internal;
   create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb);`);
  await db.exec(definition(read('20261022121120_game_ranking_criteria.sql'),'public.guest_game_ranking'));
  for(const suffix of ['_archery_event_ammunition.sql','_archery_fresh_start.sql','_archery_timed_coach_pricing.sql','_archery_120_stage_range.sql','_archery_records_reset_v3.sql','_archery_basic_coach.sql','_archery_220_stage_range.sql'])await db.exec(migration(suffix));
  // Retain the original compiled body under a fixture name to model an RPC
  // which entered before cutover and resumes after the new trigger is installed.
  const oldDefinition=(await db.query("select pg_get_functiondef('ojjuda_archery_internal.operate(text,uuid,uuid,integer)'::regprocedure) body")).rows[0].body;
  await db.exec(oldDefinition.replace('ojjuda_archery_internal.operate(', 'fixture.legacy_inflight('));
  await db.exec(`grant usage on schema fixture to authenticated;
   grant execute on function fixture.legacy_inflight(text,uuid,uuid,integer) to authenticated;
   create function fixture.legacy_wallet_then_ammo() returns void language plpgsql security definer set search_path='' as $$
   begin
    update public.user_private set coins=coins-5 where user_id=auth.uid();
    update ojjuda_archery_internal.accounts set paid_remaining=paid_remaining+10 where user_id=auth.uid();
   end;$$;
   grant execute on function fixture.legacy_wallet_then_ammo() to authenticated;`);
  const A=randomUUID(),B=randomUUID(),banned=randomUUID(),anonymous=randomUUID();
  for(const [id,nick]of [[A,'Alpha'],[B,'Beta'],[banned,'Banned'],[anonymous,'Anonymous']]){await actor(id,nick);await db.query('insert into public.user_private(user_id) values($1)',[id])}
  await db.query('update auth.users set is_anonymous=true where id=$1',[anonymous]);
  await login(A);
  const purchase=randomUUID();assert.equal((await rpc('archery_ammo_buy',[purchase])).ok,true);
  const oldRun=await rpc('archery_round_start',[randomUUID(),220]);
  await admin("update ojjuda_archery_internal.runs set started_at=clock_timestamp()-interval '10 seconds' where run_id=$1",[oldRun.run_id]);
  const oldCompleteId=randomUUID();assert.equal((await rpc('archery_round_complete',[oldCompleteId,oldRun.run_id,220])).ok,true);
  const oldActive=await rpc('archery_round_start',[randomUUID(),200]);
  await admin("update ojjuda_archery_internal.accounts set free_remaining=44,paid_remaining=33,main_rounds=55,milestones_granted=1,first_milestone_day='2026-10-01',daily_checked_day='2026-10-01',coach_expires_at='2099-01-01' where user_id=$1",[A]);
  await admin('insert into ojjuda_archery_internal.milestone_awards(user_id,ordinal,run_id,granted_at) values($1,1,$2,clock_timestamp())',[A,oldRun.run_id]);
  await admin("insert into public.game_scores(user_id,game,score) values($1,'archery',999),($1,'runner',123)",[A]);
  const beforeWallet=(await admin('select user_id,coins from public.user_private order by user_id')).rows;
  const beforeReceipts=(await admin('select * from ojjuda_archery_internal.receipts order by request_id')).rows;
  const beforeSpend=(await admin('select * from ojjuda_note_internal.spend_requests order by request_id')).rows;
  await db.exec('reset role');await db.exec(migration('_archery_single_launch.sql'));await patchClocks();await tick();

  await t.test('all previous progress and free/paid item entitlements reset; wallet and immutable receipts survive',async()=>{
   const account=(await admin('select * from ojjuda_archery_internal.accounts where user_id=$1',[A])).rows[0];
   for(const key of ['free_remaining','paid_remaining','main_rounds','milestones_granted'])assert.equal(account[key],0,key);
   for(const key of ['first_milestone_day','daily_checked_day','coach_expires_at'])assert.equal(account[key],null,key);
   assert.equal((await admin('select count(*)::int n from ojjuda_archery_internal.runs')).rows[0].n,0);
   assert.equal((await admin('select count(*)::int n from ojjuda_archery_internal.milestone_awards')).rows[0].n,0);
   assert.deepEqual((await admin('select user_id,coins from public.user_private order by user_id')).rows,beforeWallet);
   assert.deepEqual((await admin('select * from ojjuda_archery_internal.receipts order by request_id')).rows,beforeReceipts);
   assert.deepEqual((await admin('select * from ojjuda_note_internal.spend_requests order by request_id')).rows,beforeSpend);
   assert.deepEqual((await admin('select game,score from public.game_scores')).rows,[{game:'runner',score:123}]);
   const status=await action('status');assert.equal(status.launch_epoch,4);assert.equal(status.remaining,0);assert.equal(status.main_rounds,0);
  });
  await t.test('legacy RPCs and old receipts cannot restore progress or spend/repurchase items',async()=>{
   for(const [name,args]of [['archery_ammo_status',[]],['archery_round_start',[randomUUID(),220]],['archery_round_complete',[randomUUID(),oldActive.run_id,200]],['archery_ammo_buy',[randomUUID()]],['archery_ammo_spend',[randomUUID()]],['archery_ammo_receipt',[purchase,'buy']]]){
    const response=await rpc(name,args);assert.equal(response.reason,'update_required',name);assert.equal(response.launch_epoch,4);
   }
   assert.equal((await action('buy',purchase)).reason,'progress_reset');
   assert.equal((await complete(oldRun.run_id,220,50,oldCompleteId)).reason,'progress_reset');
   assert.equal((await complete(oldActive.run_id,200,50)).reason,'run_not_found');
   assert.equal((await rpc('archery_single_receipt',[purchase,'buy',4])).reason,'progress_reset');
   assert.equal((await action('buy',randomUUID(),null,null,null,3)).reason,'update_required');
   await assert.rejects(()=>db.query("select ojjuda_archery_internal.operate_core_v4('buy',$1)",[randomUUID()]),/permission denied/);
   await assert.rejects(()=>db.query("select fixture.legacy_inflight('round-start',$1,null,220)",[randomUUID()]),/archery_update_required/);
   await assert.rejects(()=>db.query("select fixture.legacy_inflight('buy',$1)",[randomUUID()]),/archery_update_required/);
   await assert.rejects(()=>db.query('select fixture.legacy_wallet_then_ammo()'),/archery_update_required/);
   assert.equal((await action('status')).coins,95,'an interrupted legacy purchase rolls back its wallet change');
   assert.equal((await action('status')).paid_remaining,0);
   assert.equal((await admin('select count(*)::int n from ojjuda_archery_internal.write_context')).rows[0].n,0);
   await assert.rejects(()=>db.query('insert into ojjuda_archery_internal.write_context values(txid_current(),auth.uid())'),/permission denied/);
  });
  await t.test('stage goals match all 220 client stages and freely selecting a stage remains allowed',async()=>{
   const {STAGES}=await import(pathToFileURL(path.join(__dirname,'../games/forest-archer/engine.mjs')).href);
   const goals=(await admin('select ojjuda_archery_internal.stage_goal(n) goal from generate_series(1,220) n')).rows.map(row=>row.goal);
   assert.deepEqual(goals,STAGES.map(stage=>stage.goal));
   assert.equal((await start(220)).ok,true);
   assert.equal((await start(0)).reason,'invalid');assert.equal((await start(221)).reason,'invalid');
  });
  let first;
  await t.test('only cleared authentic rounds rank and duplicate completions cannot improve scores',async()=>{
   const failed=await round(220,0);assert.equal(failed.result.ranked,false);
   assert.deepEqual(await rpc('community_game_monthly_ranking',['archery']),[]);
   first=await round(2,20);assert.equal(first.result.ranked,true);
   assert.equal((await complete(first.run,2,21,first.id)).reason,'request_conflict');
   assert.equal((await complete(first.run,2,21)).reason,'request_conflict');
   assert.equal((await complete(first.run,2,20,first.id)).replayed,true);
   assert.equal((await complete(first.run,2,20)).completed_now,false);
   assert.equal((await complete(first.run,2,51)).reason,'invalid');
   const recorded=await rpc('archery_single_receipt',[first.id,'round-complete',4]);assert.equal(recorded.receipt.score,20);assert.equal(recorded.receipt.launch_epoch,4);
   await login(B);assert.equal((await complete(first.run,2,20)).reason,'run_not_found');
   await round(1,50);await login(A);
   let ranks=await rpc('community_game_monthly_ranking',['archery']);assert.equal(ranks[0].nick,'Alpha');assert.equal(ranks[0].stage,2);assert.equal(ranks[0].score,20);assert.equal(ranks[0].source,'archery_stage_score');
   await login(B);await round(2,30);await login(A);
   ranks=await rpc('community_game_monthly_ranking',['archery']);assert.equal(ranks[0].nick,'Beta');assert.equal(ranks[0].stage,2);assert.equal(ranks[0].score,30);
   await login(banned);await round(220,50);await admin("update public.user_private set banned_until='2099-01-01' where user_id=$1",[banned]);
   await login(anonymous);await round(220,50);await login(A);
   assert.equal((await rpc('community_game_monthly_ranking',['archery'])).length,2,'banned and anonymous member identities do not rank');
   const leaders=await rpc('community_game_monthly_leaders',[['archery','runner']]);assert.equal(leaders.archery.stage,2);assert.equal(leaders.archery.score,30);assert.ok(Object.hasOwn(leaders,'runner'));
   const history=await rpc('community_game_monthly_history',[['archery'],null]);assert.equal(history.leaders.archery.stage,2);
   assert.equal((await rpc('community_game_ranking',['archery']))[0].nick,'Beta');
   assert.equal((await rpc('guest_game_ranking',['archery','month',null]))[0].nick,'Beta');
   assert.equal((await rpc('submit_guest_game_score',['archery',22050,'a'.repeat(64),randomUUID()])).reason,'invalid');
  });
  await t.test('new ammo purchases and the five-round milestone work only in the new epoch',async()=>{
   await login(A);const before=(await action('status')).coins;
   const bought=await action('buy',randomUUID());assert.equal(bought.ammo_added,10);assert.equal(bought.coins,before-5);
   const spent=await action('spend',randomUUID());assert.equal(spent.spent,1);
   while((await action('status')).main_rounds<5)await round(1,0);
   const status=await action('status');assert.equal(status.main_rounds,5);assert.equal(status.milestones_granted,1);assert.equal(status.free_remaining,20);
   assert.equal((await action('coach-buy',randomUUID())).reason,'coach_basic');
  });
  await t.test('reapplying the migration preserves all new records and item balances',async()=>{
   const before=(await admin('select to_jsonb(a) item from ojjuda_archery_internal.accounts a order by user_id')).rows;
   const runs=(await admin('select to_jsonb(r) item from ojjuda_archery_internal.runs r order by run_id')).rows;
   await db.exec('reset role');await db.exec(migration('_archery_single_launch.sql'));await patchClocks();
   assert.deepEqual((await admin('select to_jsonb(a) item from ojjuda_archery_internal.accounts a order by user_id')).rows,before);
   assert.deepEqual((await admin('select to_jsonb(r) item from ojjuda_archery_internal.runs r order by run_id')).rows,runs);
   assert.equal((await admin("select count(*)::int n from ojjuda_archery_internal.release_backups where release_key='archery-single-v4-20261103'")).rows[0].n,1);
   assert.equal((await admin('select cardinality(ojjuda_ranking_internal.catalog()) n')).rows[0].n,21,'the fixture original 20 categories gains archery once');
  });
  await t.test('new privileged functions remain private, RLS stays enabled, and public wrappers are invokers',async()=>{
   const rows=(await admin("select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in('single_operate','single_receipt','archery_single_action','archery_single_receipt')")).rows;
   assert.equal(rows.length,4);assert.ok(rows.every(r=>r.proconfig.includes('search_path=""')));
   assert.ok(rows.filter(r=>r.nspname==='public').every(r=>!r.prosecdef));
   await assert.rejects(()=>db.query('select * from ojjuda_archery_internal.accounts'),/permission denied/);
   await login(null);await assert.rejects(()=>rpc('archery_single_action',['status',4]),/permission denied/);
   assert.ok(Array.isArray(await rpc('guest_game_ranking',['archery','month',null])));
  });
 }finally{await db.close()}
});
