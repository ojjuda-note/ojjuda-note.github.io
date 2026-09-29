const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260929083441_auto_card_visual_variety.sql'), 'utf8');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE SCHEMA ojjuda_note; CREATE SCHEMA ojjuda_note_internal;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb);
      INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001','{"ojjuda_note_auto_card_bot":true}');
      CREATE TABLE public.profiles(id uuid); CREATE TABLE public.user_private(user_id uuid);
      INSERT INTO public.profiles SELECT id FROM auth.users; INSERT INTO public.user_private SELECT id FROM auth.users;
      CREATE TABLE ojjuda_note_internal.auto_card_config(singleton boolean,author_id uuid,enabled boolean,starts_on date);
      INSERT INTO ojjuda_note_internal.auto_card_config SELECT true,id,true,current_date-10 FROM auth.users;
      CREATE TABLE ojjuda_note.cards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),author_id uuid,body text,
        background_key text DEFAULT '42',archived_at timestamptz);
      CREATE TABLE ojjuda_note_internal.card_visuals(card_id uuid PRIMARY KEY,style jsonb,
        style_until timestamptz,photo_key text,photo_until timestamptz,updated_at timestamptz);
      CREATE TABLE ojjuda_note_internal.card_gender(card_id uuid PRIMARY KEY,gender text);
      CREATE TABLE ojjuda_note_internal.auto_card_copy(id bigint PRIMARY KEY,body text);
      CREATE TABLE ojjuda_note_internal.auto_card_sites(id bigint PRIMARY KEY,lat float8,lon float8);
      INSERT INTO ojjuda_note_internal.auto_card_sites VALUES (1,37,127);
      CREATE TABLE ojjuda_note_internal.auto_card_schedule(local_day date,slot smallint,planned_at timestamptz,
        copy_id bigint,site_id bigint DEFAULT 1,gender text DEFAULT 'private',request_id uuid DEFAULT gen_random_uuid(),
        card_id uuid,posted_at timestamptz,PRIMARY KEY(local_day,slot));
      CREATE FUNCTION ojjuda_note_internal.plan_auto_cards(date) RETURNS integer LANGUAGE sql AS $$
        SELECT count(*)::integer FROM ojjuda_note_internal.auto_card_schedule WHERE local_day=$1 $$;
      CREATE FUNCTION ojjuda_note_internal.auto_card_tags(integer,date,text) RETURNS text[] LANGUAGE sql AS $$ SELECT ARRAY['합성 시험'] $$;
      CREATE FUNCTION ojjuda_note.publish_card(uuid,text,text[],text,jsonb,float8,float8,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE v_id uuid;
      BEGIN
        INSERT INTO ojjuda_note.cards(author_id,body) VALUES(current_setting('request.jwt.claim.sub')::uuid,$2) RETURNING id INTO v_id;
        INSERT INTO ojjuda_note_internal.card_visuals VALUES(v_id,$5 || '{"boxTransparency":37}',now()+interval '1 month',NULL,NULL,now());
        INSERT INTO ojjuda_note_internal.card_gender VALUES(v_id,'private');
        RETURN jsonb_build_object('card_id',v_id);
      END $$;
      -- Full-hour and half-hour slot IDs are interleaved in real publication order.
      INSERT INTO ojjuda_note_internal.auto_card_schedule(local_day,slot,planned_at,copy_id)
      SELECT (statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date-d,
        CASE WHEN n%2=1 THEN (n+1)/2 ELSE 24+n/2 END,
        statement_timestamp()-interval '1 hour'-d*interval '1 day'+n*interval '1 second',d*48+n
      FROM generate_series(0,2) d CROSS JOIN generate_series(1,48) n;
      INSERT INTO ojjuda_note_internal.auto_card_copy SELECT copy_id,'合成 카드 '||copy_id FROM ojjuda_note_internal.auto_card_schedule;
      DO $$ DECLARE r record; v_id uuid; BEGIN
        FOR r IN SELECT * FROM ojjuda_note_internal.auto_card_schedule WHERE local_day<(statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date LOOP
          INSERT INTO ojjuda_note.cards(author_id,body) VALUES('00000000-0000-4000-8000-000000000001','보존할 글 '||r.copy_id) RETURNING id INTO v_id;
          INSERT INTO ojjuda_note_internal.card_visuals VALUES(v_id,'{"font":"round","boxColor":"yellow","textColor":"black","boxTransparency":37}',now()+interval '20 days','65',now()+interval '9 days',now());
          UPDATE ojjuda_note_internal.auto_card_schedule SET card_id=v_id,posted_at=r.planned_at WHERE local_day=r.local_day AND slot=r.slot;
        END LOOP;
      END $$;
      -- Ordinary, archived and expired cards must not be repaired.
      INSERT INTO ojjuda_note.cards(id,author_id,body,archived_at) VALUES
        ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','사람 글',NULL),
        ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','보관된 글',now()),
        ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','꾸미기 만료',NULL);
      INSERT INTO ojjuda_note_internal.card_visuals SELECT id,'{"font":"round","boxColor":"yellow"}',
        CASE WHEN body='꾸미기 만료' THEN now()-interval '1 day' ELSE now()+interval '1 month' END,NULL,NULL,now()
        FROM ojjuda_note.cards WHERE body IN ('사람 글','보관된 글','꾸미기 만료');
      INSERT INTO ojjuda_note_internal.auto_card_schedule(local_day,slot,planned_at,card_id,posted_at)
        SELECT (statement_timestamp() AT TIME ZONE 'Asia/Seoul')::date-3,row_number() OVER()::smallint,now()-interval '3 days',id,now()-interval '3 days'
        FROM ojjuda_note.cards WHERE body IN ('사람 글','보관된 글','꾸미기 만료');
    `);
    const protectedFields = `SELECT c.id,c.body,c.background_key,v.style_until,v.photo_key,v.photo_until,v.style->'boxTransparency' AS transparency
      FROM ojjuda_note.cards c JOIN ojjuda_note_internal.card_visuals v ON v.card_id=c.id ORDER BY c.id`;
    const before = (await db.query(protectedFields)).rows;
    const untouched = (await db.query("SELECT * FROM ojjuda_note_internal.card_visuals WHERE card_id::text LIKE '00000000-%' ORDER BY card_id")).rows;
    await db.exec(sql);
    assert.deepEqual((await db.query(protectedFields)).rows,before,'repair preserves text, photo, expiry and transparency');
    assert.deepEqual((await db.query("SELECT * FROM ojjuda_note_internal.card_visuals WHERE card_id::text LIKE '00000000-%' ORDER BY card_id")).rows,untouched);
    assert.equal((await db.query('SELECT ojjuda_note_internal.run_auto_cards() AS n')).rows[0].n,48);
    assert.equal((await db.query('SELECT ojjuda_note_internal.run_auto_cards() AS n')).rows[0].n,0,'rerun never publishes duplicates');
    const styles=(await db.query(`SELECT v.style FROM ojjuda_note_internal.auto_card_schedule q
      JOIN ojjuda_note_internal.card_visuals v ON v.card_id=q.card_id
      WHERE q.copy_id IS NOT NULL ORDER BY q.planned_at,q.slot`)).rows.map(r=>r.style);
    assert.equal(styles.length,144);
    for(let i=0;i<styles.length;i++) {
      for(const prev of styles.slice(Math.max(0,i-3),i)) assert.notEqual(styles[i].font,prev.font,`font at ${i}`);
      for(const prev of styles.slice(Math.max(0,i-4),i)) assert.notEqual(styles[i].boxColor,prev.boxColor,`color at ${i}`);
      assert.equal(styles[i].textColor,['yellow','green','white'].includes(styles[i].boxColor)?'black':'white');
    }
    assert.equal(new Set(styles.map(s=>s.font)).size,5);
    assert.equal(new Set(styles.map(s=>s.boxColor)).size,7);
    await db.exec("UPDATE ojjuda_note_internal.auto_card_config SET enabled=false");
    assert.equal((await db.query('SELECT ojjuda_note_internal.run_auto_cards() AS n')).rows[0].n,0);
    await db.exec('GRANT USAGE ON SCHEMA ojjuda_note_internal TO anon,authenticated; SET ROLE authenticated');
    await assert.rejects(()=>db.query("SELECT ojjuda_note_internal.auto_card_style(1,current_date)"),e=>e.code==='42501');
    console.log('PASS: 144 automatic cards avoid recent fonts/colors across day boundaries and catch-up; repeat runs, permissions and human/photo/expiry preservation.');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
