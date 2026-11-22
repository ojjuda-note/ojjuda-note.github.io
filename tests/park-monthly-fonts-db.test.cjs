const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
 const db = new PGlite(), a = randomUUID(), b = randomUUID(), card = randomUUID(), other = randomUUID();
 const value = async (sql, args=[]) => (await db.query(sql,args)).rows[0].v;
 const login = async user => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user || '']);
  await db.exec('set role '+(user ? 'authenticated' : 'anon'));
 };
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create schema ojjuda_note; create schema ojjuda_note_internal;
   create table auth.users(id uuid primary key); insert into auth.users values('${a}'),('${b}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.user_private(user_id uuid primary key,coins integer check(coins>=0));
   insert into public.user_private values('${a}',100),('${b}',0);
   create function ojjuda_note_internal.can_note_act(text) returns boolean language sql stable as $$select auth.uid() is not null and coalesce(current_setting('test.banned',true),'false')='false'$$;
   create table ojjuda_note.cards(id uuid primary key,author_id uuid);
   insert into ojjuda_note.cards values('${card}','${a}'),('${other}','${a}');
   create table ojjuda_note_internal.card_visuals(card_id uuid primary key,style jsonb,style_until timestamptz,updated_at timestamptz);
   create schema ojjuda_shop_internal;
   create function ojjuda_shop_internal.owns(uuid,text) returns boolean language sql as $$select false$$;
   create table ojjuda_shop_internal.entitlements(user_id uuid,product text,expires_at timestamptz);
   create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,target_id uuid,coins integer,result jsonb);
   create function ojjuda_note_internal.upsert_card_style(p_card_id uuid,p_style jsonb) returns void language sql as $$
    insert into ojjuda_note_internal.card_visuals values(p_card_id,p_style,statement_timestamp()+interval '1 month')
    on conflict(card_id) do update set style=excluded.style,style_until=excluded.style_until;
   $$;
   grant usage on schema auth,ojjuda_note to anon,authenticated;`);
  await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261119193623_park_nanum_myeongjo_font.sql'),'utf8')+';');
  await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261121035010_park_monthly_font_entitlements.sql'),'utf8'));
  await login(null);
  await assert.rejects(()=>value('select ojjuda_note.purchase_card_font($1,$2) as v',['heart',randomUUID()]),/permission denied/);
  await login(a);
  await assert.rejects(()=>db.exec('select * from ojjuda_note_internal.card_font_entitlements'),/permission denied/);
  await assert.rejects(()=>value('select ojjuda_note.purchase_card_font($1,$2) as v',['default',randomUUID()]),/Invalid font purchase/);
  const req=randomUUID();
  const bought=await value('select ojjuda_note.purchase_card_font($1,$2) as v',['heart',req]);
  assert.equal(bought.cost_coins,10); assert.equal(bought.coins_after,90);
  assert.deepEqual(await value('select ojjuda_note.purchase_card_font($1,$2) as v',['heart',req]),bought);
  const reused=await value('select ojjuda_note.purchase_card_font($1,$2) as v',['heart',randomUUID()]);
  assert.equal(reused.cost_coins,0); assert.equal(new Date(reused.expires_at).toISOString(),new Date(bought.expires_at).toISOString());
  await assert.rejects(()=>value('select ojjuda_note.purchase_card_font($1,$2) as v',['mono',req]),/Request ID already used/);
  for(const font of ['nanum-myeongjo','handwriting','calligraphy','mono'])
   assert.equal((await value('select ojjuda_note.purchase_card_font($1,$2) as v',[font,randomUUID()])).cost_coins,10);
  assert.equal((await db.query('select * from ojjuda_note.list_my_card_font_entitlements()')).rows.length,5);
  await login(b);
  await assert.rejects(()=>value('select ojjuda_note.purchase_card_font($1,$2) as v',['heart',req]),/Request ID already used/);
  await assert.rejects(()=>value('select ojjuda_note.purchase_card_font($1,$2) as v',['heart',randomUUID()]),/Insufficient coins/);
  assert.equal((await db.query('select * from ojjuda_note.list_my_card_font_entitlements()')).rows.length,0);
  await login(a); await db.exec("reset role; select set_config('test.banned','true',false); set role authenticated");
  await assert.rejects(()=>value('select ojjuda_note.purchase_card_font($1,$2) as v',['heart',randomUUID()]),/unavailable/);
  await db.exec("reset role; select set_config('test.banned','false',false)");
  await db.query("select ojjuda_note_internal.upsert_card_style($1,'{\"font\":\"heart\"}')",[card]);
  assert.equal(new Date(await value('select style_until as v from ojjuda_note_internal.card_visuals where card_id=$1',[card])).toISOString(),new Date(bought.expires_at).toISOString());
  // Editing does not extend an existing monthly font's display period.
  await db.query("select ojjuda_note_internal.upsert_card_style($1,'{\"font\":\"heart\"}')",[card]);
  assert.equal(new Date(await value('select style_until as v from ojjuda_note_internal.card_visuals where card_id=$1',[card])).toISOString(),new Date(bought.expires_at).toISOString());
  await db.query("update ojjuda_note_internal.card_font_entitlements set purchased_at=now()-interval '2 months',expires_at=now()-interval '1 month' where user_id=$1 and font='heart'",[a]);
  await assert.rejects(()=>db.query("select ojjuda_note_internal.upsert_card_style($1,'{\"font\":\"heart\"}')",[other]),/Font entitlement required/);
  await db.query("update ojjuda_note_internal.card_visuals set style_until=now()-interval '1 day' where card_id=$1",[card]);
  await assert.rejects(()=>db.query("select ojjuda_note_internal.upsert_card_style($1,'{\"font\":\"heart\"}')",[card]),/Font entitlement required/);
  for(const font of ['default','round','serif']) await db.query('select ojjuda_note_internal.upsert_card_style($1,$2)',[card,{font}]);
  await login(a);
  assert.equal((await value('select ojjuda_note.purchase_card_font($1,$2) as v',['heart',randomUUID()])).cost_coins,10);
  console.log('PASS monthly fonts: 10 coins per font, one calendar month, reuse, exact-once retries, renewal, free fonts, expiry and account restrictions');
 } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

