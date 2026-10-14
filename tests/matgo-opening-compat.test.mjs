import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as E from '../games/matgo-engine.mjs';
import {dealSoloRound} from '../games/matgo-tazza.mjs';
import {playRound} from './matgo-opening-fixture.mjs';
const {fixture,A,B}=createRequire(import.meta.url)('./matgo-online-fixture.cjs');
const f=await fixture({adaptive:true,openingPpuk:false}),{db,call}=f;
try{
  const start=()=>call(A,{action:'start',rules_version:13,stakes_version:1});
  let old=await start();assert.equal(old.round.rules_version,11);
  await db.query('update ojjuda_matgo_internal.wallets set round_seed=5 where user_id=$1',[A]);old=await start();
  const oldPlay=await playRound(E,dealSoloRound,old.round);
  const request=crypto.randomUUID();const paid=await call(B,{action:'tazza_start',rules_version:13,stakes_version:1,request_id:request});assert.equal(paid.round.rules_version,11);
  const dir=new URL('../supabase/migrations/',import.meta.url),file=fs.readdirSync(dir).find(n=>n.endsWith('_matgo_opening_ppuk.sql'));
  await db.exec(fs.readFileSync(new URL(file,dir),'utf8'));
  const resumed=await start();assert.deepEqual(resumed.round,old.round);assert.equal(resumed.gold,old.gold);
  assert.equal((await call(A,{action:'start',rules_version:11,stakes_version:1})).round.id,old.round.id);
  assert.equal((await call(A,{action:'settle',rules_version:12,round_id:old.round.id,actions:oldPlay.g.actions})).error,'client_update_required');
  const settled=await call(A,{action:'settle',rules_version:11,round_id:old.round.id,actions:oldPlay.g.actions});assert.equal(settled.status,200);assert.equal(settled.gold,oldPlay.g.bank[0]);
  const retry=await call(B,{action:'tazza_start',rules_version:11,stakes_version:1,request_id:request});assert.equal(retry.status,200);assert.equal(retry.round.id,paid.round.id);assert.equal(retry.coins,paid.coins,'old paid retry cannot charge again');
  // No old client may start a new round, charge a purchase, or downgrade a v12 settlement.
  assert.equal((await call(A,{action:'start',rules_version:11,stakes_version:1})).error,'client_update_required');
  const coins=(await call(A,{action:'status'})).coins;
  assert.equal((await call(A,{action:'tazza_start',rules_version:11,stakes_version:1,request_id:crypto.randomUUID()})).error,'client_update_required');
  assert.equal((await call(A,{action:'status'})).coins,coins);
  let fresh=await start();assert.equal(fresh.round.rules_version,12);
  await db.query('update ojjuda_matgo_internal.wallets set round_seed=5 where user_id=$1',[A]);fresh=await start();
  const newPlay=await playRound(E,dealSoloRound,fresh.round);
  assert.equal((await call(A,{action:'settle',rules_version:11,round_id:fresh.round.id,actions:newPlay.g.actions})).error,'client_update_required');
  const body={action:'settle',rules_version:12,round_id:fresh.round.id,actions:newPlay.g.actions};
  const done=await call(A,body);assert.equal(done.status,200);assert.equal(done.gold,newPlay.g.bank[0]);
  const duplicate=await call(A,body);assert.equal(duplicate.gold,done.gold);assert.equal(duplicate.cpu_win_streak,done.cpu_win_streak);assert.equal(duplicate.cpu_loss_streak,done.cpu_loss_streak);
  const purchase=await call(A,{action:'tazza_start',rules_version:13,stakes_version:1,request_id:crypto.randomUUID()});assert.equal(purchase.status,200);assert.equal(purchase.round.rules_version,12);assert.equal(purchase.coins,coins-5);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'ojjuda_matgo_internal.wallet_service_v1(uuid,text,uuid,boolean,uuid,bigint,smallint,integer)','execute') allowed",[role])).rows[0].allowed,false);
  console.log('PASS: opening-rule migration preserves active v11 rounds and paid retries, new v12 starts/settlement, downgrade rejection, charge protection, idempotent gold/streaks and service-only access');
}finally{await f.close();}
