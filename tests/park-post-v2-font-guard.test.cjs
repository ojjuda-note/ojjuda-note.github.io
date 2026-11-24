const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const bot = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const botCard = '00000000-0000-4000-8000-000000000003';
const memberCard = '00000000-0000-4000-8000-000000000004';
const migrationFiles = ["20261124065343_park_post_v2_font_entitlement_guard.sql","20261124065437_park_post_v2_font_guard_restore_compatibility.sql"];
(async()=>{
 const db = new PGlite();
 try {
  await db.exec(`
   CREATE SCHEMA auth; CREATE SCHEMA ojjuda_note; CREATE SCHEMA ojjuda_note_internal; CREATE SCHEMA ojjuda_shop_internal;
   CREATE ROLE anon; CREATE ROLE authenticated;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
   INSERT INTO auth.users VALUES ('${bot}','{"ojjuda_note_auto_card_bot":true}','{}'),('${member}','{}','{"ojjuda_note_auto_card_bot":true}');
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE ojjuda_note.cards(id uuid PRIMARY KEY,author_id uuid);
   INSERT INTO ojjuda_note.cards VALUES ('${botCard}','${bot}'),('${memberCard}','${member}');
   CREATE TABLE ojjuda_note_internal.auto_card_config(singleton boolean,enabled boolean,author_id uuid);
   INSERT INTO ojjuda_note_internal.auto_card_config VALUES (true,false,'${bot}');
   CREATE TABLE ojjuda_note_internal.card_font_entitlements(user_id uuid,font text,expires_at timestamptz);
   CREATE TABLE ojjuda_note_internal.card_visuals(card_id uuid PRIMARY KEY,style jsonb,style_until timestamptz,updated_at timestamptz);
   CREATE TABLE ojjuda_shop_internal.entitlements(user_id uuid,product text,expires_at timestamptz);
   CREATE FUNCTION ojjuda_shop_internal.owns(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
   CREATE FUNCTION ojjuda_note_internal.valid_card_style(jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
   CREATE FUNCTION ojjuda_note_internal.upsert_card_style(p_card_id uuid,p_style jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
   REVOKE ALL ON FUNCTION ojjuda_note_internal.upsert_card_style(uuid,jsonb) FROM PUBLIC,anon,authenticated;
  `);
  for(const file of migrationFiles) await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  const actor=id=>db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
  const style=(card,font)=>db.query("SELECT ojjuda_note_internal.upsert_card_style($1,jsonb_build_object('font',$2::text))",[card,font]);
  const denied=(card,font)=>assert.rejects(()=>style(card,font),e=>e.code==='42501'&&e.message.includes('Font entitlement required'));
  const getFont=async card=>(await db.query("SELECT style->>'font' AS font FROM ojjuda_note_internal.card_visuals WHERE card_id=$1",[card])).rows[0]?.font;
  await actor(member);
  await style(memberCard,'round');
  await denied(memberCard,'handwriting');
  await actor(bot); await denied(botCard,'heart'); // legacy is disabled; V2 is absent
  await db.exec("UPDATE ojjuda_note_internal.auto_card_config SET enabled=true");
  await style(botCard,'heart');assert.equal(await getFont(botCard),'heart');
  await db.exec("UPDATE ojjuda_note_internal.auto_card_config SET enabled=false");
  await db.exec(`CREATE TABLE ojjuda_note_internal.park_post_v2_config(singleton boolean,enabled boolean,author_id uuid);
    INSERT INTO ojjuda_note_internal.park_post_v2_config VALUES(true,true,'${bot}')`);
  for(const font of ['default','round','serif','handwriting','nanum-myeongjo','mono','calligraphy','heart']){
   await style(botCard,font);assert.equal(await getFont(botCard),font);
  }
  await denied(memberCard,'handwriting'); // bot cannot exempt another owner's card
  await actor(member);await denied(botCard,'mono');await denied(memberCard,'mono');
  await db.exec(`UPDATE ojjuda_note_internal.park_post_v2_config SET author_id='${member}'`);
  await denied(memberCard,'calligraphy'); // editable metadata cannot make a member a bot
  await db.exec(`INSERT INTO ojjuda_note_internal.card_font_entitlements VALUES('${member}','mono',now()+interval '1 day')`);
  await style(memberCard,'mono'); assert.equal(await getFont(memberCard),'mono');
  assert.equal((await db.query("SELECT style_until <= now()+interval '1 day' AS ok FROM ojjuda_note_internal.card_visuals WHERE card_id=$1",[memberCard])).rows[0].ok,true);
  await db.exec(`UPDATE ojjuda_note_internal.park_post_v2_config SET author_id='${bot}',enabled=false`);
  await actor(bot);await denied(botCard,'handwriting');
  const perms=(await db.query("SELECT has_function_privilege('anon','ojjuda_note_internal.upsert_card_style(uuid,jsonb)','EXECUTE') AS anon,has_function_privilege('authenticated','ojjuda_note_internal.upsert_card_style(uuid,jsonb)','EXECUTE') AS member")).rows[0];
  assert.deepEqual(perms,{anon:false,member:false});
  console.log('PASS: V2 and legacy bot fonts, missing V2 schema, ownership, member metadata spoofing, paid expiry, and private function permissions.');
 } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
