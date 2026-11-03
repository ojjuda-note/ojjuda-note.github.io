const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {fixture}=require('./matgo-online-fixture.cjs');
const migrations=path.resolve(__dirname,'../supabase/migrations');
const read=name=>fs.readFileSync(path.join(migrations,name),'utf8');

test('Matgo settlement receipts describe the exact server-settled round without changing money or access',async t=>{
  const f=await fixture({basic:true,fresh:true}),{db,call,A,B,C,MINOR}=f;
  const service=async(actor,action,{request=null,paid=false,round=null,gold=null,first=null,carry=null}={})=>(await db.query(
    'select public.matgo_wallet_service($1,$2,$3,$4,$5,$6,$7::smallint,$8) value',
    [actor,action,request,paid,round,gold,first,carry])).rows[0].value;
  const ranked=async(actor,round,gold,outcome)=>(await db.query(
    'select public.matgo_ranked_settle($1,$2,$3,0::smallint,1,$4) value',[actor,round,gold,outcome])).rows[0].value;
  const start=actor=>call(actor,{action:'start',stakes_version:1,rules_version:13});
  const settle=(actor,round,gold,extra={})=>service(actor,'settle',{round,gold,first:0,carry:1,...extra});
  const replay=(actor,round,extra={})=>call(actor,{action:'settle',round_id:round,actions:[],rules_version:13,...extra});
  const wallet=async actor=>(await db.query("select to_jsonb(w)-'updated_at' value from ojjuda_matgo_internal.wallets w where user_id=$1",[actor])).rows[0].value;
  const access=async()=>(await db.query(`select p.oid::regprocedure::text signature,p.proacl,p.prosecdef,p.proconfig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ojjuda_matgo_internal' or (n.nspname='public' and p.proname like 'matgo_%') order by signature`)).rows;
  const receipt=(round,before,after)=>({round_id:round,before_gold:before,after_gold:after,net:after-before});
  const reset=async(actor,gold=10000)=>{
    await service(actor,'status');
    await db.query(`update ojjuda_matgo_internal.wallets set gold=$2,round_id=null,round_seed=null,
      round_cpu_level=null,round_rules_version=null,last_round=null,last_settlement=null,
      next_first=0,next_carry=1,stake_rate=100,stake_seen=100,cpu_level=1,cpu_win_streak=0,cpu_loss_streak=0,
      free_used=0 where user_id=$1`,[actor,gold]);
  };
  try{
    // Use the deployed legacy paid-round counting rule as well as the wallet
    // fixture; the rest of this ranking migration needs unrelated game tables.
    const legacyPatch=read('20261022130306_multiplayer_ranking_details.sql').match(
      /if to_regprocedure\('ojjuda_matgo_internal\.ranked_settle[\s\S]*?\n end if;/)?.[0];
    assert.ok(legacyPatch,'current legacy settlement prerequisite is present');
    await db.exec('do $legacy$ declare definition text;updated text;begin '+legacyPatch+' end;$legacy$;');
    for(const actor of [A,B,C])await service(actor,'status');
    const oldRound=crypto.randomUUID();
    await db.query('update ojjuda_matgo_internal.wallets set last_round=$2 where user_id=$1',[C,oldRound]);
    const beforeWallets=await Promise.all([A,B,C].map(wallet)),beforeAccess=await access();
    const tableAccess=(await db.query("select relacl,relrowsecurity from pg_class where oid='ojjuda_matgo_internal.wallets'::regclass")).rows;
    await db.exec(read('20261103053820_matgo_result_receipts.sql'));

    await t.test('migration preserves existing wallet rows and privileges and does not invent historical receipts',async()=>{
      for(const [index,actor] of [A,B,C].entries()){
        const after=await wallet(actor);assert.equal(after.last_settlement,null);delete after.last_settlement;
        assert.deepEqual(after,beforeWallets[index]);
      }
      assert.deepEqual(await access(),beforeAccess,'function grants, definer flags and search paths are unchanged');
      assert.deepEqual((await db.query("select relacl,relrowsecurity from pg_class where oid='ojjuda_matgo_internal.wallets'::regclass")).rows,tableAccess);
      const historical=await replay(C,oldRound);assert.equal(historical.status,200);assert.equal(historical.settled,true);
      assert.equal(historical.settlement,null,'a pre-migration balance cannot reconstruct its old delta');
    });

    await t.test('first gain and duplicate settlement return the same authoritative before/after/net',async()=>{
      await reset(A);const started=await start(A),id=started.round.id;
      const done=await settle(A,id,12500,{first:1,carry:2});
      assert.equal(done.gold,12500);assert.equal(done.coins,started.coins);assert.equal(done.charged,0);
      assert.equal(done.free_left,started.free_left);assert.equal(done.stake_rate,started.stake_rate);
      assert.deepEqual(done.settlement,receipt(id,10000,12500));assert.equal(done.settled,true);
      const saved=await wallet(A);
      const duplicate=await settle(A,id,999999999,{first:0,carry:9});
      assert.deepEqual(duplicate.settlement,done.settlement);assert.equal(duplicate.gold,12500);
      assert.deepEqual(await wallet(A),saved,'duplicate proposals cannot rewrite money, receipt or next-round state');
      const resumed=await replay(A,id,{gold:999999999,user_id:B,net:999999999});
      assert.equal(resumed.status,200);assert.deepEqual(resumed.settlement,done.settlement);
      assert.equal(resumed.gold,12500);assert.deepEqual(await wallet(A),saved);
      assert.ok(f.calls.filter(p=>p.p_round===id).every(p=>p.p_actor===A&&!Object.hasOwn(p,'p_gold')),
        'completed Edge retries use the authenticated actor and never forward forged money');
    });

    await t.test('receipt is scoped to its round while status, starts, active rounds and other actors expose none',async()=>{
      await reset(A);await reset(B);const first=await start(A),done=await settle(A,first.round.id,12000);
      for(const response of [await service(A,'status'),await service(A,'status',{round:first.round.id})])assert.equal(response.settlement,null);
      const second=await start(A);assert.equal(second.settlement,null);assert.notEqual(second.round.id,first.round.id);
      const current=await service(A,'round',{round:second.round.id});assert.equal(current.settled,false);assert.equal(current.settlement,null);
      const beforeA=await wallet(A),beforeB=await wallet(B);
      const old=await replay(A,first.round.id);assert.deepEqual(old.settlement,done.settlement);assert.equal(old.round.id,second.round.id);
      assert.deepEqual(await wallet(A),beforeA,'looking up the last result cannot disturb a newer live round');
      const wrongActor=await replay(B,first.round.id);assert.equal(wrongActor.error,'round_mismatch');assert.equal(wrongActor.settlement,undefined);
      assert.deepEqual(await wallet(A),beforeA);assert.deepEqual(await wallet(B),beforeB);
      const unknown=await replay(A,crypto.randomUUID());assert.equal(unknown.error,'round_mismatch');assert.equal(unknown.settlement,undefined);
      const forgery=await replay(A,second.round.id,{gold:1e9,net:1e9,user_id:B});assert.equal(forgery.error,'invalid_round');
      assert.deepEqual(await wallet(A),beforeA,'an incomplete transcript cannot settle a live round');
    });

    await t.test('zero result is explicit and only the latest completed round remains eligible',async()=>{
      await reset(A);const first=await start(A);await settle(A,first.round.id,12500);
      const second=await start(A),done=await settle(A,second.round.id,12500);
      assert.deepEqual(done.settlement,receipt(second.round.id,12500,12500));assert.equal(done.gold,12500);
      const old=await replay(A,first.round.id);assert.equal(old.error,'round_mismatch');assert.equal(old.settlement,undefined);
      assert.deepEqual((await replay(A,second.round.id)).settlement,done.settlement);
    });

    await t.test('loss receipt survives free refill, a duplicate refill, a new round and abandonment',async()=>{
      await reset(A,12500);const first=await start(A),done=await settle(A,first.round.id,0);
      assert.deepEqual(done.settlement,receipt(first.round.id,12500,0));
      const request=crypto.randomUUID(),refilled=await call(A,{action:'refill',request_id:request,paid:false});
      assert.equal(refilled.status,200);assert.equal(refilled.gold,5000);assert.equal(refilled.charged,0);
      assert.equal(refilled.coins,done.coins);assert.equal(refilled.free_left,1);assert.equal(refilled.settlement,null);
      const afterRefill=await wallet(A);
      const duplicate=await call(A,{action:'refill',request_id:request,paid:false});
      assert.equal(duplicate.duplicate,true);assert.deepEqual(await wallet(A),afterRefill);
      let retry=await replay(A,first.round.id);assert.equal(retry.gold,5000);assert.deepEqual(retry.settlement,done.settlement);
      const second=await start(A);assert.equal(second.settlement,null);assert.equal(second.round.gold,5000);
      retry=await replay(A,first.round.id);assert.deepEqual(retry.settlement,done.settlement);assert.equal(retry.round.id,second.round.id);
      const active=await service(A,'round',{round:second.round.id});assert.equal(active.settlement,null);
      const abandoned=await call(A,{action:'abandon',round_id:second.round.id});assert.equal(abandoned.abandoned,true);
      assert.equal(abandoned.gold,5000);assert.equal(abandoned.settlement,null);
      assert.deepEqual((await wallet(A)).last_settlement,done.settlement);
    });

    await t.test('paid refill retains the original net and existing five-coin charge and idempotency',async()=>{
      await reset(A,5000);const first=await start(A),done=await settle(A,first.round.id,0);
      await db.query('update ojjuda_matgo_internal.wallets set free_used=2 where user_id=$1',[A]);
      const request=crypto.randomUUID();
      const refused=await call(A,{action:'refill',request_id:request,paid:false});assert.equal(refused.error,'paid_confirmation_required');
      const refilled=await call(A,{action:'refill',request_id:request,paid:true});
      assert.equal(refilled.gold,5000);assert.equal(refilled.charged,5);assert.equal(refilled.coins,done.coins-5);
      assert.equal(refilled.free_left,0);assert.equal(refilled.settlement,null);
      const saved=await wallet(A),again=await call(A,{action:'refill',request_id:request,paid:true});
      assert.equal(again.duplicate,true);assert.equal(again.coins,refilled.coins);assert.deepEqual(await wallet(A),saved);
      const retry=await replay(A,first.round.id);assert.deepEqual(retry.settlement,done.settlement);assert.equal(retry.coins,refilled.coins);
    });

    await t.test('invalid settlements preserve the previous receipt and current wallet',async()=>{
      await reset(A);const first=await start(A),done=await settle(A,first.round.id,12000),second=await start(A);
      const before=await wallet(A);
      for(const invalid of [{gold:-1},{gold:9007199254740992},{first:2},{carry:0},{carry:1025}]){
        await assert.rejects(settle(A,second.round.id,12000,invalid),/invalid_result/);
        assert.deepEqual(await wallet(A),before);
      }
      assert.deepEqual((await replay(A,first.round.id)).settlement,done.settlement);
    });

    for(const rulesVersion of [11,12,13])await t.test('real Edge replay returns its first receipt for rules '+rulesVersion+' and ignores client balances',async()=>{
      const [E,{dealSoloRound},{playRound}]=await Promise.all([
        import('../games/matgo-engine.mjs'),import('../games/matgo-tazza.mjs'),import('./matgo-opening-fixture.mjs')]);
      await reset(B);const begun=await start(B);
      // Historical browsers retain these server snapshots after a rules update.
      await db.query('update ojjuda_matgo_internal.wallets set round_rules_version=$2,round_cpu_level=2,round_seed=1 where user_id=$1',[B,rulesVersion]);
      const snapshot=await service(B,'round',{round:begun.round.id}),{g}=await playRound(E,dealSoloRound,snapshot.round);
      assert.notEqual(g.bank[0],snapshot.gold,'fixed transcript exercises a counted win rather than a draw');
      const beforeCalls=f.calls.length;
      const done=await call(B,{action:'settle',round_id:begun.round.id,rules_version:rulesVersion,actions:g.actions,
        gold:999999999,user_id:A,net:999999999,outcome:'loss',cpu_level:10});
      assert.equal(done.status,200,JSON.stringify(done));assert.equal(done.gold,g.bank[0]);
      assert.deepEqual(done.settlement,receipt(begun.round.id,snapshot.gold,g.bank[0]));
      const forwarded=f.calls.slice(beforeCalls).find(p=>Object.hasOwn(p,'p_gold'));
      assert.equal(forwarded.p_actor,B);assert.equal(forwarded.p_gold,g.bank[0]);
      assert.equal(Object.hasOwn(forwarded,'p_outcome'),rulesVersion<13,'the historical ranked RPC is exercised');
      const duplicate=await replay(B,begun.round.id,{rules_version:rulesVersion});assert.deepEqual(duplicate.settlement,done.settlement);
      if(rulesVersion<13){
        const original=await wallet(B),directRetry=await ranked(B,begun.round.id,999999999,'loss');
        assert.deepEqual(directRetry.settlement,done.settlement);assert.deepEqual(await wallet(B),original);
      }
    });

    await t.test('legacy ranked loss and draw preserve receipts without changing their settlement calculation',async()=>{
      for(const [outcome,after] of [['loss',8000],['draw',10000]]){
        await reset(B);const begun=await start(B);
        await db.query('update ojjuda_matgo_internal.wallets set round_rules_version=12,round_cpu_level=2 where user_id=$1',[B]);
        const done=await ranked(B,begun.round.id,after,outcome);
        assert.equal(done.gold,after);assert.equal(done.coins,begun.coins);
        assert.deepEqual(done.settlement,receipt(begun.round.id,10000,after));
      }
    });

    await t.test('receipts keep authenticated actor, age, ban, table privacy and service-only settlement boundaries',async()=>{
      await reset(A);const begun=await start(A),done=await settle(A,begun.round.id,11000);
      assert.equal((await replay('not-signed-in',begun.round.id)).status,401);
      assert.equal((await replay(MINOR,begun.round.id)).error,'adult_required');
      await db.query("update public.user_private set banned_until=now()+interval '1 hour' where user_id=$1",[C]);
      assert.equal((await replay(C,begun.round.id)).error,'banned');
      for(const role of ['anon','authenticated']){
        await assert.rejects(db.transaction(async tx=>{
          await tx.exec('set local role '+role);
          await tx.query("select public.matgo_wallet_service($1,'round',null,false,$2)",[A,begun.round.id]);
        }),/permission denied/);
        await assert.rejects(db.transaction(async tx=>{
          await tx.exec('set local role '+role);
          await tx.query('select last_settlement from ojjuda_matgo_internal.wallets where user_id=$1',[A]);
        }),/permission denied/);
      }
      const trusted=await db.transaction(async tx=>{
        await tx.exec('set local role service_role');
        return tx.query("select public.matgo_wallet_service($1,'round',null,false,$2) value",[A,begun.round.id]);
      });
      assert.deepEqual(trusted.rows[0].value.settlement,done.settlement);
      assert.deepEqual(await access(),beforeAccess);
    });
  }finally{await f.close();}
});
