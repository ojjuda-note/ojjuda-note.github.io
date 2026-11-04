const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('coin exchange charges allowed packs once and stores recoverable, private receipts',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema ojjuda_archery_internal;create schema ojjuda_note_internal;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.user_private(user_id uuid primary key,coins integer not null check(coins>=0),banned boolean default false);
   create function public.is_banned(id uuid) returns boolean language sql security definer set search_path='' as $$select banned from public.user_private where user_id=id$$;
   create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb);
   grant usage on schema public,auth,ojjuda_archery_internal to authenticated;`);
  const folder=path.join(__dirname,'../supabase/migrations'),migration=fs.readdirSync(folder).find(x=>x.endsWith('_archery_coin_exchange.sql'));
  await db.exec(fs.readFileSync(path.join(folder,migration),'utf8'));
  const a=randomUUID(),b=randomUUID();await db.query('insert into user_private(user_id,coins) values($1,100000),($2,9)',[a,b]);
  const auth=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');};
  const rpc=async(id,zu,action='exchange')=>(await db.query('select public.archery_coin_exchange($1,$2,$3) r',[id,zu,action])).rows[0].r;
  await auth(a);let wallet=100000;
  for(const zu of [10,50,100,500,1000,5000]){
   const id=randomUUID();let r=await rpc(id,zu);wallet-=zu;
   assert.deepEqual([r.ok,r.owner,r.zu,r.game_coins,r.coins],[true,a,zu,zu*10,wallet]);
   r=await rpc(id,zu);assert.equal(r.replayed,true);assert.equal(r.coins,wallet);
   r=await rpc(id,zu,'receipt');assert.equal(r.receipt.game_coins,zu*10);assert.equal(r.coins,wallet);
   assert.equal((await rpc(id,zu===10?50:10)).reason,'request_conflict');
   await auth(b);assert.equal((await rpc(id,zu,'receipt')).reason,'request_conflict');await auth(a);
  }
  const missing=await rpc(randomUUID(),10,'receipt');assert.equal(missing.found,false);assert.equal(missing.coins,wallet);
  for(const zu of [null,-10,0,1,11,4999,5001])assert.equal((await rpc(randomUUID(),zu)).reason,'invalid');
  assert.equal((await rpc(randomUUID(),10,'status')).reason,'invalid');
  const collision=randomUUID();await db.exec('reset role');await db.query("insert into ojjuda_note_internal.spend_requests values($1,$2,'other',1,'{}')",[collision,a]);await auth(a);
  assert.equal((await rpc(collision,10)).reason,'request_conflict');
  await assert.rejects(db.query('select * from ojjuda_archery_internal.coin_exchange_receipts'),/permission denied/);
  await assert.rejects(db.query('update user_private set coins=50000'),/permission denied/);
  await auth(b);const decline=randomUUID();assert.equal((await rpc(decline,10)).reason,'coins');
  await db.exec('reset role');await db.query('update user_private set coins=100 where user_id=$1',[b]);await auth(b);
  const retry=await rpc(decline,10);assert.equal(retry.ok,false);assert.equal(retry.coins,100);assert.equal(retry.replayed,true);
  await db.exec('reset role');await db.query('update user_private set banned=true where user_id=$1',[b]);await auth(b);assert.equal((await rpc(randomUUID(),10)).reason,'banned');
  await auth(null);assert.equal((await rpc(randomUUID(),10)).reason,'sign_in');
  await db.exec('reset role;set role anon');await assert.rejects(rpc(randomUUID(),10),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query('select coins from user_private where user_id=$1',[a])).rows[0].coins,wallet);
  assert.equal((await db.query("select count(*)::int n from ojjuda_note_internal.spend_requests where kind='archery_coin_exchange'")).rows[0].n,6);
  await db.query('delete from user_private where user_id=$1',[a]);assert.equal((await db.query('select count(*)::int n from ojjuda_archery_internal.coin_exchange_receipts where user_id=$1',[a])).rows[0].n,0);
 }finally{await db.close();}
});
