const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {randomUUID}=require('node:crypto');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migrationFile='supabase/migrations/20261101095031_spot_masterpiece_stages.sql';

(async()=>{const db=new PGlite();try{
 const user=randomUUID(),other=randomUUID(),banned=randomUUID(),guest='a'.repeat(64);
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema ojjuda_guest_internal;create schema ojjuda_shop_internal;create schema ojjuda_note_internal;
 grant usage on schema public,auth,ojjuda_guest_internal to anon,authenticated;
 grant usage on schema ojjuda_shop_internal to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,nickname text);
 create table public.user_private(user_id uuid primary key,coins integer,gold bigint default 12345,banned boolean default false);
 create function public.is_banned(uuid) returns boolean language sql stable as $$select coalesce((select banned from public.user_private where user_id=$1),false)$$;
 create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb);
 insert into profiles values('${user}','기존 회원'),('${other}','다른 회원'),('${banned}','제한 회원');
 insert into user_private(user_id,coins,banned) values('${user}',50,false),('${other}',0,false),('${banned}',50,true);`);
 const ranking=read('supabase/migrations/20261022130306_multiplayer_ranking_details.sql');
 await db.exec(ranking.slice(ranking.indexOf('create table ojjuda_guest_internal.spot_clears'),ranking.indexOf('create function ojjuda_guest_internal.spot_candidates')));
 const shop=read('supabase/migrations/20261006032254_ju_game_help_prices.sql');
 const shopStart=shop.indexOf('CREATE OR REPLACE FUNCTION ojjuda_shop_internal.spot_game_buy_v2');
 await db.exec(shop.slice(shopStart,shop.indexOf('$function$;',shopStart)+'$function$;'.length));
 const publicStart=shop.indexOf('create function public.spot_game_buy_v2');
 await db.exec(shop.slice(publicStart,shop.indexOf('$$;',publicStart)+'$$;'.length));
 await db.exec(`revoke all on function ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean),public.spot_game_buy_v2(text,uuid,integer,integer,boolean) from public,anon;
 grant execute on function ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean),public.spot_game_buy_v2(text,uuid,integer,integer,boolean) to authenticated;`);
 await db.exec(read('supabase/migrations/20261023194219_spot_photo_stages.sql'));

 // Load the shipped monthly ledger and exact spot capture patch, preserving the
 // current ranking path instead of testing an obsolete pre-archive function.
 const monthly=read('supabase/migrations/20261031085535_monthly_game_rankings_archive.sql');
 await db.exec(monthly.slice(monthly.indexOf('create schema ojjuda_ranking_internal;'),monthly.indexOf('create function ojjuda_ranking_internal.month_start')));
 const pictureStart=monthly.indexOf('create table ojjuda_ranking_internal.picture_clears');
 await db.exec(monthly.slice(pictureStart,monthly.indexOf('\n\ninsert into',pictureStart)));
 const patchStart=monthly.indexOf(" definition:=pg_get_functiondef('ojjuda_guest_internal.record_spot_clear(integer,text)'");
 const patchEnd=monthly.indexOf(" definition:=pg_get_functiondef('ojjuda_photo_internal.record_game_clear(text)'",patchStart);
 await db.exec('do $fixture$ declare definition text;updated text;begin\n'+monthly.slice(patchStart,patchEnd)+'end;$fixture$;');
 await db.exec(`alter table ojjuda_ranking_internal.picture_clears enable row level security;
 revoke all on all tables in schema ojjuda_ranking_internal from public,anon,authenticated,service_role;
 revoke all on all functions in schema ojjuda_ranking_internal from public,anon,authenticated,service_role;`);

 const claims=async(id,role)=>db.exec(`reset role;set request.jwt.claim.sub='${id||''}';set role ${role};`);
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const clear=async(stage,token=null)=>value('select public.record_spot_clear($1,$2) value',[stage,token]);
 const buy=async(stage,spot=0,id=randomUUID(),kind='hint',verify=false)=>value('select public.spot_game_buy_v2($1,$2,$3,$4,$5) value',[kind,id,stage,spot,verify]);
 const definitions=async()=>JSON.stringify((await db.query(`select oid::regprocedure::text signature,prosrc,prosecdef,proconfig,proacl,proargdefaults,proowner
  from pg_proc where pronamespace in ('ojjuda_shop_internal'::regnamespace,'ojjuda_guest_internal'::regnamespace,'ojjuda_ranking_internal'::regnamespace,'public'::regnamespace) order by signature`)).rows);
 const privileges=async()=>JSON.stringify((await db.query(`select n.nspname,c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in('public','ojjuda_guest_internal','ojjuda_note_internal','ojjuda_ranking_internal') order by n.nspname,c.relname`)).rows);
 const snapshot=async()=>{
  const data={};
  for(const [table,order] of [['public.profiles','id'],['public.user_private','user_id'],['ojjuda_note_internal.spend_requests','request_id'],['ojjuda_guest_internal.spot_clears','actor_key,stage'],['ojjuda_ranking_internal.picture_clears','actor_key,stage_key']])data[table]=(await db.query(`select * from ${table} order by ${order}`)).rows;
  return JSON.stringify(data);
 };
 await claims(null,'anon');assert.equal((await clear(62,guest)).score,1);
 await claims(user,'authenticated');assert.equal((await clear(48)).score,1);assert.equal((await clear(62)).score,2);
 const oldRequest=randomUUID(),oldReceipt=await buy(62,5,oldRequest);assert.equal(oldReceipt.coins,49);
 await db.exec('reset role');
 const before=await definitions(),beforePrivileges=await privileges(),beforeData=await snapshot();
 const migration=read(migrationFile);

 // A changed source definition must stop the whole migration, including the
 // earlier constraint and record-function changes, without partial deployment.
 const originalBuy=await value("select pg_get_functiondef('ojjuda_shop_internal.spot_game_buy_v2(text,uuid,integer,integer,boolean)'::regprocedure) value");
 await db.exec(originalBuy.replace('p_spot not between 0 and 5','not (p_spot between 0 and 5)'));
 await assert.rejects(db.exec(migration),/Expected hint boundary missing/);await db.exec('rollback');
 assert.match(await value("select pg_get_constraintdef(oid) value from pg_constraint where conrelid='ojjuda_guest_internal.spot_clears'::regclass and conname='spot_clears_stage_check'"),/62/);
 assert.match(await value("select prosrc value from pg_proc where oid='ojjuda_guest_internal.record_spot_clear(integer,text)'::regprocedure"),/p_stage not between 1 and 62/);
 await db.exec(originalBuy);assert.equal(await snapshot(),beforeData);

 await db.exec(migration);
 assert.equal(await definitions(),before.replaceAll('p_stage not between 1 and 62','p_stage not between 1 and 82').replaceAll('p_spot not between 0 and 5','p_spot not between 0 and (case when p_stage between 63 and 82 then 9 else 5 end)'),
  'only stage/hint bounds change; monthly capture, fees, receipts, search paths, owners and function ACLs remain byte-for-byte identical');
 assert.equal(await privileges(),beforePrivileges,'table grants and RLS settings stay unchanged');
 assert.equal(await snapshot(),beforeData,'existing profiles, gold, ZU, receipts and both record ledgers remain unchanged');
 assert.match(await value("select pg_get_constraintdef(oid) value from pg_constraint where conrelid='ojjuda_guest_internal.spot_clears'::regclass and conname='spot_clears_stage_check'"),/82/);

 await claims(null,'anon');
 for(let stage=63;stage<=82;stage++){
  const result=await clear(stage,guest);assert.equal(result.score,stage-61);assert.equal(result.reward,0);assert.equal(result.verified,false);
 }
 assert.equal((await clear(82,guest)).duplicate,true);assert.equal((await clear(82,'b'.repeat(64))).score,1,'guest identities remain isolated');
 for(const stage of [null,0,83,1000])assert.equal((await clear(stage,guest)).reason,'invalid');
 assert.equal((await clear(82)).reason,'invalid');
 await assert.rejects(buy(82,9),/permission denied/);
 await assert.rejects(db.query('select * from ojjuda_guest_internal.spot_clears'),/permission denied/);
 await assert.rejects(db.query('select * from ojjuda_ranking_internal.picture_clears'),/permission denied/);
 await claims(user,'authenticated');
 for(let stage=63;stage<=82;stage++)assert.equal((await clear(stage)).score,stage-60,'monthly records include each new picture once');
 assert.equal((await clear(82)).duplicate,true);assert.equal((await clear(62)).score,22);
 assert.deepEqual(await buy(62,5,oldRequest),oldReceipt,'pre-migration purchase receipts still verify without another charge');
 assert.equal((await buy(63,5,oldRequest)).reason,'request_conflict');
 for(const [stage,spot]of [[1,6],[62,6],[62,9],[63,-1],[63,10],[82,10],[83,0],[0,0]])assert.equal((await buy(stage,spot)).reason,'invalid');
 const request=randomUUID(),receipt=await buy(82,9,request);
 assert.equal(receipt.ok,true);assert.equal(receipt.price,1);assert.equal(receipt.coins,48);assert.equal(receipt.stage,82);assert.equal(receipt.spot,9);
 assert.deepEqual(await buy(82,9,request),receipt,'retry is exactly once');assert.deepEqual(await buy(82,9,request,'hint',true),receipt);
 assert.equal((await buy(82,8,request)).reason,'request_conflict');assert.equal((await buy(63,9,request)).reason,'request_conflict');
 assert.equal((await buy(82,9,randomUUID(),'hint',true)).reason,'not_found','verify-only cannot create a purchase');
 const firstMasterpiece=await buy(63,6);assert.equal(firstMasterpiece.ok,true);assert.equal(firstMasterpiece.coins,47);
 const time=await buy(63,-1,randomUUID(),'time');assert.equal(time.price,1);assert.equal(time.extend_ms,30000);assert.equal(time.coins,46);
 assert.equal((await buy(82,0,randomUUID(),'time')).reason,'invalid');assert.equal((await buy(82,9,randomUUID(),'unknown')).reason,'invalid');
 await assert.rejects(db.query('select * from ojjuda_guest_internal.spot_clears'),/permission denied/);
 await claims(other,'authenticated');assert.equal((await buy(82,9)).reason,'coins');assert.equal((await buy(82,9,request)).reason,'request_conflict');assert.equal((await clear(82)).score,1);
 await claims(banned,'authenticated');assert.equal((await clear(82)).reason,'banned');assert.equal((await buy(82,9)).reason,'banned');
 await claims(randomUUID(),'authenticated');await assert.rejects(clear(82),/not_signed_in/);assert.equal((await buy(82,9)).reason,'wallet_unavailable');
 await db.exec('reset role');
 assert.equal(await value('select coins value from public.user_private where user_id=$1',[user]),46);
 assert.equal(await value('select count(*)::int value from public.user_private where gold=12345'),3,'new clears and hints do not alter gold');
 assert.equal(await value('select count(*)::int value from ojjuda_note_internal.spend_requests'),4,'only four successful one-ZU purchases created receipts');
 assert.equal(await value("select count(*)::int value from ojjuda_ranking_internal.picture_clears where user_id=$1 and stage_key::integer between 63 and 82",[user]),20);
 await assert.rejects(db.exec('insert into ojjuda_guest_internal.spot_clears select actor_key,user_id,guest_hash,83,month_start,achieved_at from ojjuda_guest_internal.spot_clears limit 1'),/spot_clears_stage_check/);
 console.log('PASS: stages63–82, per-stage six/ten hint limits, preserved records/gold/ZU/monthly archive, unchanged ACL/RLS/fees, guest/member isolation, retry/conflict/verify-only, atomic drift rejection');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
