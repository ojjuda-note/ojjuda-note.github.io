const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
  const {Game,seededRandom,aiChooseCard,aiChoose,aiGoStop}=await import('../games/matgo-engine.mjs');
  const {verifyRound}=await import('../supabase/functions/matgo/verify.mjs');
  assert.equal(fs.readFileSync(path.join(__dirname,'../games/matgo-engine.mjs'),'utf8'),fs.readFileSync(path.join(__dirname,'../supabase/functions/matgo/engine.mjs'),'utf8'));
  let losses=0,zeroes=0,transcript,round;
  for(let seed=1;seed<=100;seed++){
    round={seed,gold:5000,first:seed%2,carry:1};let game;
    game=new Game({event:async()=>{},choose:async(p,ids)=>aiChoose(game,p,ids),goStop:async(p,s)=>p===1?aiGoStop(game,p,s):'stop'});
    game.random=seededRandom(seed);game.first=round.first;game.bank=[5000,5000];game.deal();
    while(!game.over){
      const p=game.turn,card=p===1?aiChooseCard(game,p):game.hand[p][0]||null;
      let bomb=null;
      if(card){const same=game.hand[p].filter(c=>c.m===card.m),matches=game.matches(card.m);
        if(same.length>=3){if(matches.length===1&&matches[0][0].length===1)bomb=same.filter(c=>c!==card).slice(0,2);else if(!game.shake[p])game.shakeCards(p,card.m);}}
      await game.play(p,card,bomb);
    }
    transcript=JSON.parse(JSON.stringify(game.actions));
    const checked=await verifyRound(round,transcript);
    assert.equal(checked.gold,game.bank[0]);assert.ok(checked.gold>=0);assert.ok(game.bank[1]>=0);
    if(checked.gold<5000)losses++;if(checked.gold===0)zeroes++;
  }
  await assert.rejects(verifyRound(round,transcript.slice(0,-1)),/unfinished/);
  const forged=structuredClone(transcript);forged.find(a=>a.type==='play').card=999;
  await assert.rejects(verifyRound(round,forged),/invalid/);
  const db=new PGlite();
  const a='00000000-0000-4000-8000-000000000001',minor='00000000-0000-4000-8000-000000000002',missing='00000000-0000-4000-8000-000000000003';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema ojjuda_account_internal;
      create table auth.users(id uuid primary key);create table public.user_private(user_id uuid primary key,coins int,updated_at timestamptz);
      create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
      create function public.is_banned(uuid) returns boolean language sql as $$select false$$;
      create function ojjuda_account_internal.age_on(p_birth date,p_today date) returns integer language sql as $$select extract(year from p_today)::integer-extract(year from p_birth)::integer-case when to_char(p_today,'MMDD')<to_char(p_birth,'MMDD') then 1 else 0 end$$;
      grant usage on schema public to anon,authenticated,service_role;`);
    const migration=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(f=>f.endsWith('_matgo_gold_wallet.sql'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',migration),'utf8'));
    const val=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
    await db.query('insert into auth.users values($1),($2),($3)',[a,minor,missing]);
    await db.query('insert into public.user_private(user_id,coins) values($1,20),($2,20),($3,20)',[a,minor,missing]);
    await db.query("insert into ojjuda_account_internal.member_identity values($1,'2000-01-01'),($2,((now() at time zone 'Asia/Seoul')::date-interval '18 years')::date)",[a,minor]);
    const rpc=(action,opts={})=>val('select public.matgo_wallet_service($1,$2,$3,$4,$5,$6,$7::smallint,$8) value',[opts.actor||a,action,opts.request||null,opts.paid||false,opts.round||null,opts.gold??null,opts.first??null,opts.carry??null]);
    for(const role of ['anon','authenticated'])assert.equal(await val("select has_function_privilege($1,'public.matgo_wallet_service(uuid,text,uuid,boolean,uuid,bigint,smallint,integer)','execute') value",[role]),false);
    await assert.rejects(rpc('status',{actor:minor}),/adult_required/);await assert.rejects(rpc('status',{actor:missing}),/member_identity_required/);
    assert.equal((await rpc('status')).gold,5000);assert.equal((await rpc('status')).gold,5000,'starting gold is only granted once');
    const start=await rpc('start');assert.equal((await rpc('start')).round.id,start.round.id,'reload resumes the same seed');
    await rpc('settle',{round:start.round.id,gold:0,first:1,carry:1});
    assert.equal((await rpc('settle',{round:start.round.id,gold:999999,first:0,carry:1})).gold,0,'duplicate settlement cannot mint gold');
    await assert.rejects(rpc('start'),/gold_empty/);
    let latest;
    for(let i=1;i<=3;i++){
      latest='00000000-0000-4000-9000-'+String(i).padStart(12,'0');
      if(i===3)await assert.rejects(rpc('refill',{request:latest}),/paid_confirmation_required/);
      const refill=await rpc('refill',{request:latest,paid:i===3});
      assert.equal(refill.gold,5000);assert.equal(refill.free_left,Math.max(0,2-i));assert.equal(refill.charged,i===3?5:0);
      assert.equal((await rpc('refill',{request:latest,paid:i===3})).duplicate,true);
      assert.equal((await rpc('status')).coins,i===3?15:20);
      if(i<3){const r=await rpc('start');await rpc('settle',{round:r.round.id,gold:0,first:0,carry:1});}
    }
    await assert.rejects(rpc('refill',{request:'00000000-0000-4000-9000-000000000004',paid:true}),/gold_not_empty/);
    const active=await rpc('start');await rpc('settle',{round:active.round.id,gold:0,first:0,carry:1});
    await db.query('update public.user_private set coins=4 where user_id=$1',[a]);
    await assert.rejects(rpc('refill',{request:'00000000-0000-4000-9000-000000000005',paid:true}),/insufficient_zzu/);
    assert.equal((await rpc('status')).gold,0);assert.equal((await rpc('status')).coins,4,'insufficient funds is atomic');
    await db.query("update ojjuda_matgo_internal.wallets set refill_day=refill_day-1 where user_id=$1",[a]);
    const fresh=await rpc('refill',{request:'00000000-0000-4000-9000-000000000006',paid:true});
    assert.equal(fresh.free_left,1);assert.equal(fresh.charged,0);assert.equal(fresh.coins,4,'midnight resets free count before any paid charge');
    assert.equal(await val("select ojjuda_account_internal.age_on('2007-10-03','2026-10-02') value"),18);
    assert.equal(await val("select ojjuda_account_internal.age_on('2007-10-03','2026-10-03') value"),19);
    await assert.rejects(db.query('update ojjuda_matgo_internal.wallets set gold=-1 where user_id=$1',[a]),/check constraint/);
  }finally{await db.close();}
  console.log(`PASS: 100 server replay rounds (${losses} losses, ${zeroes} zero balances), forged results, starting gold, 2 free refills, 5쭈 charge, idempotency, insufficient funds, KST reset and server age restriction`);
})().catch(error=>{console.error(error);process.exitCode=1});
