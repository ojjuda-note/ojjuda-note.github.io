const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{test}=require('node:test');
const {createFixture,read,definition}=require('./monthly-game-rankings-fixture.cjs');
const folder=path.join(__dirname,'../supabase/migrations');
const migration=suffix=>read(fs.readdirSync(folder).find(name=>name.endsWith(suffix)));
test('archery epoch 5 resets all game records and purchases once, blocks old writers and keeps shared ZU intact',async()=>{
 const {db,claim,actor}=await createFixture();const user=randomUUID();
 const admin=async(sql,args=[])=>{await db.exec('reset role');try{return await db.query(sql,args)}finally{await db.exec('set role authenticated')}};
 const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const action=(kind,epoch=5,id=null,run=null,stage=null,score=null)=>rpc('archery_single_action',[kind,epoch,id,run,stage,score]);
 const coin=(id,amount,kind='exchange',epoch=5)=>rpc('archery_coin_exchange_v5',[id,amount,epoch,kind]);
 try{
  await db.exec(`alter table public.user_private add column coins integer not null default 1000;create schema ojjuda_note_internal;create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb);`);
  await db.exec(definition(read('20261022121120_game_ranking_criteria.sql'),'public.guest_game_ranking'));
  for(const suffix of ['_archery_event_ammunition.sql','_archery_fresh_start.sql','_archery_timed_coach_pricing.sql','_archery_120_stage_range.sql','_archery_records_reset_v3.sql','_archery_basic_coach.sql','_archery_220_stage_range.sql','_archery_single_launch.sql','_archery_burst_score_sum.sql','_archery_coin_exchange.sql'])await db.exec(migration(suffix));
  await actor(user,'Archer');await db.query('insert into user_private(user_id) values($1)',[user]);await claim(user);
  for(const [signature,oldName,newName]of [['ojjuda_archery_internal.single_operate(text,integer,uuid,uuid,integer,integer)','ojjuda_archery_internal.single_operate(','fixture.inflight_v4('],['ojjuda_archery_internal.exchange_coins(text,uuid,integer)','ojjuda_archery_internal.exchange_coins(','fixture.inflight_coin_v4(']]){
   const sql=(await db.query('select pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body;await db.exec(sql.replace(oldName,newName));
  }
  await db.exec('grant usage on schema fixture to authenticated;grant execute on all functions in schema fixture to authenticated;set role authenticated');
  const oldRun=await action('round-start',4,randomUUID(),null,1);assert.equal(oldRun.ok,true);
  await admin("update ojjuda_archery_internal.runs set started_at=clock_timestamp()-interval '10 seconds' where run_id=$1",[oldRun.run_id]);
  assert.equal((await action('round-complete',4,randomUUID(),oldRun.run_id,1,50)).ok,true);
  const oldPurchase=randomUUID();assert.equal((await rpc('archery_coin_exchange',[oldPurchase,10,'exchange'])).ok,true);
  await admin("insert into public.game_scores(user_id,game,score) values($1,'archery',50),($1,'runner',123)",[user]);
  await admin("insert into ojjuda_note_internal.spend_requests values($1,$2,'other-game',1,'{}')",[randomUUID(),user]);
  const wallet=(await admin('select coins from user_private where user_id=$1',[user])).rows[0].coins;
  const reset=migration('_archery_full_reset_v5.sql');await db.exec('reset role');await db.exec(reset);await db.exec('set role authenticated');
  for(const table of ['runs','milestone_awards','receipts','coin_exchange_receipts'])assert.equal((await admin('select count(*)::int n from ojjuda_archery_internal.'+table)).rows[0].n,0,table);
  assert.equal((await admin("select count(*)::int n from ojjuda_note_internal.spend_requests where kind like 'archery%'")).rows[0].n,0);
  assert.equal((await admin("select count(*)::int n from ojjuda_note_internal.spend_requests where kind='other-game'")).rows[0].n,1);
  assert.deepEqual((await admin('select game,score from game_scores')).rows,[{game:'runner',score:123}]);
  assert.equal((await admin('select coins from user_private where user_id=$1',[user])).rows[0].coins,wallet);
  const account=await action('status');assert.equal(account.launch_epoch,5);assert.equal(account.main_rounds,0);assert.equal(account.remaining,0);
  assert.equal((await action('round-start',4,randomUUID(),null,1)).reason,'update_required');
  assert.equal((await rpc('archery_coin_exchange',[oldPurchase,10,'exchange'])).reason,'update_required');
  assert.equal((await coin(randomUUID(),10,'exchange',4)).reason,'update_required');
  assert.equal((await coin(oldPurchase,10,'receipt')).found,false);
  await assert.rejects(db.query("select fixture.inflight_v4('round-start',4,$1,null,1,null)",[randomUUID()]),/archery_update_required/);
  await assert.rejects(db.query("select fixture.inflight_coin_v4('exchange',$1,10)",[randomUUID()]),/archery_update_required/);
  assert.equal((await admin('select coins from user_private where user_id=$1',[user])).rows[0].coins,wallet,'queued old purchase rolls back its debit');
  const boughtId=randomUUID(),bought=await coin(boughtId,10);assert.equal(bought.ok,true);assert.equal(bought.game_coins,100);assert.equal(bought.coins,wallet-10);
  assert.equal((await coin(boughtId,10)).replayed,true);assert.equal((await coin(boughtId,10,'receipt')).receipt.game_coins,100);
  const run=await action('round-start',5,randomUUID(),null,1);assert.equal(run.ok,true);
  await admin("update ojjuda_archery_internal.runs set started_at=clock_timestamp()-interval '10 seconds' where run_id=$1",[run.run_id]);
  assert.equal((await action('round-complete',5,randomUUID(),run.run_id,1,150)).ranked,true);
  const ranking=await rpc('community_game_ranking',['archery']);assert.equal(ranking.length,1);assert.equal(ranking[0].score,150);
  await db.exec('reset role');await db.exec(reset);await db.exec('set role authenticated');
  assert.equal((await action('status')).main_rounds,1,'redeploy never resets new progress');assert.equal((await coin(boughtId,10,'receipt')).receipt.game_coins,100);
  assert.equal((await admin('select coins from user_private where user_id=$1',[user])).rows[0].coins,wallet-10);
  await assert.rejects(db.query('select * from ojjuda_archery_internal.coin_exchange_receipts'),/permission denied/);
  await db.exec('reset role;set role anon');await assert.rejects(coin(randomUUID(),10),/permission denied/);
 }finally{await db.close();}
});
