const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migrations=path.join(__dirname,'../supabase/migrations');
const readMigration=suffix=>fs.readFileSync(path.join(migrations,fs.readdirSync(migrations).find(name=>name.endsWith(suffix))),'utf8');
const sql=readMigration('_retire_legacy_world_assets.sql');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;
   create table public.profiles(id text primary key,nickname text,avatar jsonb,room jsonb,tv_media text);
   create table public.user_private(user_id text primary key,coins integer,owned text[],data jsonb);
   create table public.shop_items(key text primary key);
   create table public.shop_sets(id text primary key);
   insert into shop_items values('item:cat'),('new:furniture');
   insert into shop_sets values('chuseok'),('new-set');
   insert into profiles values('a','member','{"hair":"bob"}',
    '{"id":"main","wall":"#ffffff","wp":"wp:cream","items":[{"type":"sofa"},{"type":"new-furniture"}],"rooms":[{"id":"second","items":[{"type":"dog"}]}]}','video-1');
   insert into user_private values('a',321,array['item:cat','new:entitlement'],
    '{"petBank":{"cat":[{}]},"tvMedia":"video-1","settings":{"theme":"dark"},"album":[{"id":"photo-1"}],"friends":[{"id":"real-friend","nick":"Friend"}]}');`);
  for(const signature of ['purchase_item(text)','gift_item(text,uuid)','buy_set(text)','admin_set_price(text,integer,boolean)','admin_sync_catalog(jsonb,jsonb)','admin_update_set(text,integer,boolean)','admin_grant_item(uuid,text,boolean)']){
   await db.exec(`create function public.${signature} returns boolean language sql as 'select false'`);
  }
  await db.exec('begin;'+sql+'commit;');
  const row=(await db.query('select * from public.user_private')).rows[0];
  assert.equal(row.coins,321);
  assert.deepEqual(row.owned,['item:cat','new:entitlement'],'ownership receipts stay intact');
  assert.deepEqual(row.data,{tvMedia:'video-1',settings:{theme:'dark'},album:[{id:'photo-1'}],friends:[{id:'real-friend',nick:'Friend'}]});
  const profile=(await db.query('select * from public.profiles')).rows[0];
  assert.deepEqual([profile.nickname,profile.avatar,profile.tv_media],['member',{hair:'bob'},'video-1']);
  assert.deepEqual(profile.room,{id:'main',wall:'#ffffff',wp:'wp:cream',items:[{type:'new-furniture'}],rooms:[{id:'second',items:[]}]});
  assert.deepEqual((await db.query('select key from shop_items')).rows,[{key:'new:furniture'}]);
  assert.deepEqual((await db.query('select id from shop_sets')).rows,[{id:'new-set'}]);
  for(const role of ['anon','authenticated'])for(const name of ['purchase_item(text)','gift_item(text,uuid)','admin_sync_catalog(jsonb,jsonb)']){
   assert.equal((await db.query("select has_function_privilege($1,$2,'execute') as allowed",[role,name])).rows[0].allowed,false);
  }
  // No broad trigger may erase future room or profile changes.
  await db.exec(`update profiles set avatar='{"newStyle":1}',room='{"items":[{"type":"new-desk"}]}';`);
  assert.deepEqual((await db.query('select avatar,room from profiles')).rows[0],{avatar:{newStyle:1},room:{items:[{type:'new-desk'}]}});
  console.log('PASS: exact legacy catalogs/placements and pet bank removed; old RPC access revoked; new assets, wallets, receipts, photos, appearance and friendships preserved');
 }finally{await db.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
