const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260929181317_auto_cards_hourly.sql'),'utf8');
(async()=>{
const db=new PGlite();
try {
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth; CREATE SCHEMA ojjuda_note; CREATE SCHEMA ojjuda_note_internal; CREATE SCHEMA cron;
CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb);
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001','{"ojjuda_note_auto_card_bot":true}');
CREATE TABLE public.profiles(id uuid); CREATE TABLE public.user_private(user_id uuid);
INSERT INTO public.profiles SELECT id FROM auth.users; INSERT INTO public.user_private SELECT id FROM auth.users;
CREATE TABLE ojjuda_note_internal.auto_card_config(singleton boolean,author_id uuid,enabled boolean,starts_on date);
INSERT INTO ojjuda_note_internal.auto_card_config SELECT true,id,true,current_date-10 FROM auth.users;
CREATE TABLE ojjuda_note.cards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),body text);
CREATE TABLE ojjuda_note_internal.card_gender(card_id uuid,gender text);
CREATE TABLE ojjuda_note_internal.auto_card_copy(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,body text UNIQUE,
 local_day date,slot smallint,ready_at timestamptz,content_source text,UNIQUE(local_day,slot));
CREATE TABLE ojjuda_note_internal.auto_card_sites(id bigint PRIMARY KEY,lat float8,lon float8);
INSERT INTO ojjuda_note_internal.auto_card_sites SELECT n,37,127 FROM generate_series(1,17)n;
CREATE TABLE ojjuda_note_internal.auto_card_schedule(local_day date,slot smallint,planned_at timestamptz,copy_id bigint,
 site_id bigint,gender text,request_id uuid DEFAULT gen_random_uuid(),card_id uuid,posted_at timestamptz,PRIMARY KEY(local_day,slot));
CREATE TABLE cron.job(jobid bigint,jobname text,schedule text,active boolean);
INSERT INTO cron.job VALUES(8,'ojjuda_note_daily_auto_cards','1,31 * * * *',true);
CREATE FUNCTION cron.alter_job(job_id bigint,schedule text) RETURNS void LANGUAGE sql AS
 $$ UPDATE cron.job SET schedule=$2 WHERE jobid=$1 $$;
CREATE FUNCTION ojjuda_note_internal.valid_note_body(text) RETURNS boolean LANGUAGE sql AS
 $$ SELECT length($1) BETWEEN 1 AND 200 $$;
CREATE FUNCTION public.has_banned(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION ojjuda_note_internal.auto_card_tags(integer,date,text) RETURNS text[] LANGUAGE sql AS
 $$ SELECT CASE WHEN $1>24 THEN ARRAY['유머'] ELSE ARRAY['위로'] END $$;
CREATE FUNCTION ojjuda_note_internal.auto_card_style(integer,date) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION ojjuda_note.publish_card(uuid,text,text[],text,jsonb,float8,float8,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
 INSERT INTO ojjuda_note.cards(body) VALUES($2) RETURNING id INTO v_id;
 INSERT INTO ojjuda_note_internal.card_gender VALUES(v_id,'private');
 RETURN jsonb_build_object('card_id',v_id);
END $$;
INSERT INTO ojjuda_note_internal.auto_card_copy(body,local_day,slot,ready_at,content_source)
 SELECT '기존 시험 글 '||n,(now() AT TIME ZONE 'Asia/Seoul')::date,n,now(),'editor' FROM generate_series(1,48)n;
INSERT INTO ojjuda_note_internal.auto_card_schedule(local_day,slot,planned_at,copy_id,site_id,gender)
 SELECT local_day,slot,(local_day::timestamp+(CASE WHEN slot<=24 THEN slot-1 ELSE slot-25 END)*interval '1 hour'
 +(CASE WHEN slot<=24 THEN 0 ELSE 30 END)*interval '1 minute') AT TIME ZONE 'Asia/Seoul',id,1,'private'
 FROM ojjuda_note_internal.auto_card_copy;
INSERT INTO ojjuda_note.cards VALUES('00000000-0000-4000-8000-000000000009','보존할 게시 카드');
UPDATE ojjuda_note_internal.auto_card_schedule SET card_id='00000000-0000-4000-8000-000000000009',posted_at=now()-interval '2 hours' WHERE slot=25;
`);
const baseline=(await db.query('SELECT * FROM ojjuda_note.cards')).rows;
const drafts=(await db.query('SELECT * FROM ojjuda_note_internal.auto_card_copy ORDER BY id')).rows;
await db.exec(sql);
assert.deepEqual((await db.query('SELECT * FROM ojjuda_note.cards')).rows,baseline);
assert.deepEqual((await db.query('SELECT * FROM ojjuda_note_internal.auto_card_copy ORDER BY id')).rows,drafts);
assert.equal((await db.query("SELECT count(*)::int n FROM ojjuda_note_internal.auto_card_schedule WHERE cancelled_at IS NOT NULL")).rows[0].n,23);
assert.equal((await db.query("SELECT count(*)::int n FROM ojjuda_note_internal.auto_card_schedule WHERE posted_at IS NOT NULL AND cancelled_at IS NOT NULL")).rows[0].n,0);
assert.equal((await db.query("SELECT schedule FROM cron.job")).rows[0].schedule,'1 * * * *');
const bodies=Array.from({length:24},(_,i)=>'내일 시험용 서로 다른 문장 '+i);
const tomorrow="((now() AT TIME ZONE 'Asia/Seoul')::date+1)";
await assert.rejects(()=>db.query("SELECT ojjuda_note_internal.stage_auto_cards("+tomorrow+",$1::text[])",[Array.from({length:48},(_,i)=>'거절할 48개 '+i)]),e=>e.code==='22023');
assert.equal((await db.query("SELECT ojjuda_note_internal.stage_auto_cards("+tomorrow+",$1::text[]) n",[bodies])).rows[0].n,24);
assert.equal((await db.query("SELECT ojjuda_note_internal.plan_auto_cards("+tomorrow+") n")).rows[0].n,24);
assert.equal((await db.query("SELECT ojjuda_note_internal.plan_auto_cards("+tomorrow+") n")).rows[0].n,24);
const planned=(await db.query("SELECT extract(hour from planned_at AT TIME ZONE 'Asia/Seoul')::int as hour_of_day,extract(minute from planned_at AT TIME ZONE 'Asia/Seoul')::int as minute_of_hour,slot,gender FROM ojjuda_note_internal.auto_card_schedule WHERE local_day="+tomorrow+" ORDER BY planned_at")).rows;
assert.deepEqual(planned.map(r=>r.hour_of_day),Array.from({length:24},(_,i)=>i));
assert(planned.every(r=>r.minute_of_hour===0&&r.gender==='private'));
assert(planned.every((r,i)=>(i%2===0?r.slot<=12:r.slot>=25)));
await assert.rejects(()=>db.query("SELECT ojjuda_note_internal.stage_auto_cards("+tomorrow+",$1::text[])",[bodies]),e=>e.code==='23505');
await db.exec(`
DELETE FROM ojjuda_note_internal.auto_card_schedule WHERE local_day=(now() AT TIME ZONE 'Asia/Seoul')::date;
INSERT INTO ojjuda_note_internal.auto_card_schedule(local_day,slot,planned_at,copy_id,site_id,gender)
 SELECT (now() AT TIME ZONE 'Asia/Seoul')::date,n,
 (date_trunc('hour',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
 +CASE WHEN n=1 THEN interval '-1 hour' ELSE interval '0' END,n,1,'private' FROM generate_series(1,3)n;
`);
assert.equal((await db.query('SELECT ojjuda_note_internal.run_auto_cards() n')).rows[0].n,1,'a delayed run publishes at most one current-hour card');
assert.equal((await db.query('SELECT ojjuda_note_internal.run_auto_cards() n')).rows[0].n,0,'repeat run in the same hour publishes none');
assert.equal((await db.query("SELECT cancel_reason FROM ojjuda_note_internal.auto_card_schedule WHERE local_day=(now() AT TIME ZONE 'Asia/Seoul')::date AND slot=1")).rows[0].cancel_reason,'missed_hour');
assert.equal((await db.query("SELECT count(*)::int n FROM ojjuda_note_internal.auto_card_schedule WHERE posted_at>=date_trunc('hour',now())")).rows[0].n,1);
await db.exec('GRANT USAGE ON SCHEMA ojjuda_note_internal TO anon,authenticated; SET ROLE authenticated');
await assert.rejects(()=>db.query('SELECT ojjuda_note_internal.run_auto_cards()'),e=>e.code==='42501');
console.log('PASS: 24 hourly slots, mixed categories, preserved cards/copy, half-hour cancellation, no catch-up burst, same-hour deduplication, idempotent planning, private functions.');
}finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
