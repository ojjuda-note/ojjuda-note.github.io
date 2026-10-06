const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite(),a=randomUUID(),b=randomUUID(),card=randomUUID();const root=path.join(__dirname,'..');
const val=async(q,args=[])=>(await db.query(q,args)).rows[0].v;
try{
 const setup=fs.readFileSync(path.join(__dirname,'ju-shop-db.test.cjs'),'utf8').match(/await db\.exec\(`([\s\S]*?)`\);/)[1];await db.exec(new Function('a','b','card','return `'+setup+'`;')(a,b,card));
 await db.exec("create schema ojjuda_photo_internal;create function ojjuda_photo_internal.member_allowed() returns boolean language sql stable as $$select coalesce(current_setting('test.adult',true),'true')='true'$$;create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb);");
 for(const f of ['20261006032049_ju_shop_entitlements.sql','20261006075251_monthly_cosmetics_photo_help.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
 await db.exec('set role anon');await assert.rejects(()=>val('select photo_help_buy($1,$2) as v',['heart',randomUUID()]),/permission denied/);await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.exec('set role authenticated');
 const catalog=(await val('select ju_shop_state() as v')).products;assert.equal(catalog.length,7);assert.ok(catalog.every(p=>p.months===1));
 for(const p of catalog){const r=await val('select ju_shop_buy($1,$2) as v',[p.key,randomUUID()]);assert.ok(r.expires_at);assert.equal(r.spent,p.price);assert.equal((await val('select ju_shop_buy($1,$2) as v',[p.key,randomUUID()])).spent,0);}
 assert.equal((await val('select ju_shop_state() as v')).coins,60);
 for(const [kind,price,duration]of [['heart',3,0],['time',5,30],['slow',3,5]]){const id=randomUUID(),r=await val('select photo_help_buy($1,$2) as v',[kind,id]);assert.equal(r.price,price);assert.equal(r.duration_seconds,duration);const again=await val('select photo_help_buy($1,$2) as v',[kind,id]);assert.equal(again.coins,r.coins);assert.equal(again.replayed,true);assert.equal((await val('select photo_help_buy($1,$2) as v',[kind==='heart'?'time':'heart',id])).reason,'request_conflict');}
 assert.equal((await val('select ju_shop_state() as v')).coins,49);
 assert.equal((await val('select photo_help_buy($1,$2,true) as v',['heart',randomUUID()])).reason,'not_found');
 await db.exec("reset role;select set_config('test.adult','false',false);set role authenticated");assert.equal((await val('select photo_help_buy($1,$2) as v',['heart',randomUUID()])).reason,'membership');
 await db.exec("reset role;select set_config('test.adult','true',false)");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);await db.exec('set role authenticated');assert.equal((await val('select photo_help_buy($1,$2) as v',['time',randomUUID()])).reason,'coins');
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.query("select ojjuda_note_internal.upsert_card_style($1,'{\"shopSticker\":\"clover\"}')",[card]);
 const style=await val('select style as v from ojjuda_note_internal.card_visuals where card_id=$1',[card]);assert.equal(style.shopSticker,'clover');
 await db.query("update ojjuda_note_internal.card_visuals set style_until=now()-interval '1 day' where card_id=$1",[card]);assert.equal((await val('select ojjuda_note_internal.card_visual_for($1) as v',[card])).style.shopSticker,'clover');
 await db.query("update ojjuda_shop_internal.entitlements set expires_at=now()-interval '1 day' where user_id=$1 and product='card_stickers'",[a]);
 assert.equal((await val('select ojjuda_note_internal.card_visual_for($1) as v',[card])).style.shopSticker,'clover');
 await assert.rejects(()=>db.query("select ojjuda_note_internal.upsert_card_style($1,'{\"shopSticker\":\"heart\"}')",[card]),/Sticker not owned/);
 console.log('PASS: seven monthly cosmetics, applied stickers retained and new use blocked after expiry, 3/5/3 prices, exact-once retries, invalid replay, adult gate, anonymous access and insufficient balance');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
