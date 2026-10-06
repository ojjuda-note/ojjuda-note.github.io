const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite(),user=randomUUID();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema ojjuda_note_internal;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.is_banned(uuid) returns boolean language sql stable as $$select false$$;
 create table public.user_private(user_id uuid primary key,coins integer not null check(coins>=0));insert into user_private values('${user}',20);
 create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb);
 grant usage on schema public,auth to anon,authenticated;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261006032254_ju_game_help_prices.sql'),'utf8'));
 const call=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args)).rows[0].v;
 await db.exec('set role anon');await assert.rejects(()=>call('screw_upgrade_buy_v2',['box',randomUUID(),1,false]),/permission denied/);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
 const id=randomUUID();let r=await call('screw_upgrade_buy_v2',['box',id,1,false]);assert.equal(r.price,3);assert.equal(r.coins,17);
 r=await call('screw_upgrade_buy_v2',['box',id,1,false]);assert.equal(r.coins,17);
 r=await call('screw_upgrade_buy_v2',['buffer',randomUUID(),1,false]);assert.equal(r.price,1);assert.equal(r.coins,16);
 for(let i=0;i<3;i++)assert.equal((await call('screw_upgrade_buy_v2',['flat_hole',randomUUID(),2,false])).price,1);
 assert.equal((await call('screw_upgrade_buy_v2',['flat_hole',randomUUID(),2,false])).reason,'limit');
 r=await call('screw_upgrade_buy_v2',['flat_moves',randomUUID(),2,false]);assert.equal(r.extra_moves,3);assert.equal(r.price,1);
 const time=randomUUID();r=await call('spot_game_buy_v2',['time',time,1,-1,false]);assert.equal(r.price,1);assert.equal(r.extend_ms,30000);assert.equal(r.coins,11);
 assert.equal((await call('spot_game_buy_v2',['time',time,1,-1,false])).coins,11);
 assert.equal((await call('spot_game_buy_v2',['hint',time,1,0,false])).reason,'request_conflict');
 assert.equal((await call('spot_game_buy_v2',['hint',randomUUID(),1,6,false])).reason,'invalid');
 assert.equal((await call('spot_game_buy_v2',['hint',randomUUID(),1,0,true])).reason,'not_found');
 // A lost response from the old 3-ju / 60-second endpoint retains its terms.
 await db.exec('reset role');const old=randomUUID();await db.query("insert into ojjuda_note_internal.spend_requests values($1,$2,'spot_time',3,$3)",[old,user,JSON.stringify({ok:true,kind:'time',stage:1,spot:-1,price:3})]);await db.exec('set role authenticated');
 r=await call('spot_game_buy_v2',['time',old,1,-1,false]);assert.equal(r.price,3);assert.equal(r.extend_ms,undefined);assert.equal(r.coins,11);
 console.log('PASS: reduced game prices, flat limits, old receipt compatibility, exact-once retries and permission checks');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
