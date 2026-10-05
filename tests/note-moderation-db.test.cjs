const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const member = '00000000-0000-4000-8000-000000000001';
  const admin = '00000000-0000-4000-8000-000000000002';
  const other = '00000000-0000-4000-8000-000000000003';
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema ojjuda_note; create schema ojjuda_note_internal;
    grant usage on schema auth,ojjuda_note,ojjuda_note_internal to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${member}'),('${admin}'),('${other}');
    create function ojjuda_note_internal.is_world_member() returns boolean language sql stable as $$select auth.uid() is not null$$;
    create function ojjuda_note_internal.is_note_moderator() returns boolean language sql stable as $$select auth.uid()='${admin}'::uuid$$;
    create function public.is_banned(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.banned',true),'')='true'$$;
    create function ojjuda_note_internal.valid_blocked_words(text[]) returns boolean language sql immutable as $$select true$$;
    create table ojjuda_note_internal.settings(singleton boolean primary key default true,notice text default '',
      posting_enabled boolean default false,replies_enabled boolean default false,reports_enabled boolean default false,
      contact_text text default '',guidelines text default '',terms text default '',privacy text default '',blocked_words text[] default '{}',
      updated_at timestamptz,updated_by uuid);
    insert into ojjuda_note_internal.settings(singleton,notice) values(true,'기존 공지');
    create table ojjuda_note_internal.user_restrictions(user_id uuid primary key,is_restricted boolean,restricted_until timestamptz,reason text);
    create table ojjuda_note_internal.moderation_actions(moderator_id uuid,action text check(action='update_settings'),reason text,detail jsonb);
    create table ojjuda_note.cards(id uuid primary key default gen_random_uuid(),author_id uuid not null references auth.users(id),
      kind text default 'memo',body text not null,created_at timestamptz default clock_timestamp(),archived_at timestamptz);
    create table ojjuda_note_internal.event_ads(card_id uuid,center_lat double precision,center_lon double precision,radius_km integer,starts_at timestamptz,ends_at timestamptz);
    create table ojjuda_note_internal.card_moderation(card_id uuid,hidden boolean);
    create table ojjuda_note_internal.blocks(blocker_id uuid,blocked_id uuid);
    create table ojjuda_note_internal.reports(card_id uuid,reporter_id uuid,reason text,status text default 'open');
    create unique index report_once on ojjuda_note_internal.reports(reporter_id,card_id) where status='open';
    create function ojjuda_note_internal.is_card_visible(uuid) returns boolean language sql stable as $$select exists(select 1 from ojjuda_note.cards where id=$1 and archived_at is null)$$;
    create function ojjuda_note_internal.can_read_card(uuid) returns boolean language sql stable as $$select ojjuda_note_internal.is_card_visible($1)$$;
    create function ojjuda_note_internal.distance_m(double precision,double precision,double precision,double precision) returns double precision language sql immutable as $$select abs($1-$3)*100000$$;
  `);
  const migration = name => fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');
  await db.exec(migration('20260928162837_remove_note_service_toggles.sql'));
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const login = id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const insert = (body,kind='memo',author=member) => value('insert into ojjuda_note.cards(author_id,body,kind) values($1,$2,$3) returning id as value',[author,body,kind]);
  const reject = (fn,code) => assert.rejects(fn,error=>error.code===code);
  await login(member);
  assert.equal(await value("select ojjuda_note_internal.can_note_act('memo') as value"),true);
  await db.exec("select set_config('test.banned','true',false)");
  assert.equal(await value("select ojjuda_note_internal.can_note_act('comment') as value"),false);
  await db.exec("select set_config('test.banned','false',false)");
  await db.query('insert into ojjuda_note_internal.user_restrictions values($1,true,null,$2)',[member,'restriction']);
  assert.equal(await value("select ojjuda_note_internal.can_note_act('memo') as value"),false);
  await db.exec('delete from ojjuda_note_internal.user_restrictions');
  await reject(()=>value("select ojjuda_note_internal.admin_patch_service_settings('test','bad') as value"),'42501');
  await login(admin);
  await value("select ojjuda_note_internal.admin_patch_service_settings('notice test','새 공지',false,false,false) as value");
  let state=await value('select ojjuda_note_internal.get_note_state() as value');
  assert.equal(state.notice,'새 공지'); assert.equal(state.posting_enabled,true); assert.equal(state.reports_enabled,true);
  await value("select ojjuda_note_internal.admin_patch_service_settings('clear','') as value");
  assert.equal((await value('select ojjuda_note_internal.get_note_state() as value')).notice,'');
  await value("select ojjuda_note_internal.admin_update_settings('공지 유지',false,false,false) as value");
  assert.equal((await value('select ojjuda_note_internal.get_note_state() as value')).replies_enabled,true);

  // Prior history must count immediately on activation.
  await insert('이전 글','memo',other); await insert('이전 글','comment',other);
  await db.exec(migration('20260928163039_note_anti_spam.sql'));
  assert.deepEqual(await value('select ojjuda_note.admin_spam_settings() as value'),{max_consecutive:2,window_seconds:60,max_posts:2});
  await reject(()=>insert('이전 글','memo',other),'PNS01');
  await login(member);
  await db.exec('set role authenticated');
  await reject(()=>value('select ojjuda_note.admin_spam_settings() as value'),'42501');
  await reject(()=>value("select ojjuda_note.admin_update_spam_settings(3,60,3,'test') as value"),'42501');
  assert.equal(await value("select has_table_privilege('authenticated','ojjuda_note_internal.spam_state','select') as value"),false);
  await db.exec('reset role');

  const first=await insert('첫 글'); await insert('둘째 글','comment');
  await insert('이벤트 글','event');
  await reject(()=>insert('셋째 글','comment'),'PNS02');
  assert.equal(await value("select count(*)::int as value from ojjuda_note.cards where author_id=$1 and kind in ('memo','comment')",[member]),2);
  // Deleting content does not erase the rate record.
  await db.query('delete from ojjuda_note.cards where id=$1',[first]);
  await reject(()=>insert('삭제 후 글'),'PNS02');
  // Failed publications and retried IDs do not consume another slot.
  assert.equal(await value('select cardinality(recent_posts) as value from ojjuda_note_internal.spam_state where user_id=$1',[member]),2);
  await db.query("update ojjuda_note_internal.spam_state set recent_posts=ARRAY[clock_timestamp()-interval '61 seconds'] where user_id=$1",[member]);
  await insert('셋째 글');
  await login(admin);
  await reject(()=>value("select ojjuda_note.admin_update_spam_settings(0,60,2,'invalid') as value"),'22023');
  await value("select ojjuda_note.admin_update_spam_settings(2,60,100,'repeat test') as value");
  await insert('같은 글'); await insert('같은\n글','comment');
  await reject(()=>insert(' 같은 글 '),'PNS01');
  await insert('다른 글'); await insert('같은 글');
  await value("select ojjuda_note.admin_update_spam_settings(1,120,100,'updated limit') as value");
  await reject(()=>insert('같은 글'),'PNS01');
  const action=await value("select detail as value from ojjuda_note_internal.moderation_actions where detail ? 'spam_after' order by ctid desc limit 1");
  assert.equal(action.spam_after.max_consecutive,1);
  // A failing downstream operation rolls the spam counter back with publication.
  const before=await value('select consecutive_count as value from ojjuda_note_internal.spam_state where user_id=$1',[member]);
  await db.exec('begin'); await insert('rolled back'); await db.exec('rollback');
  assert.equal(await value('select consecutive_count as value from ojjuda_note_internal.spam_state where user_id=$1',[member]),before);
  // Updates are not new publications and do not increment counters.
  const timestamps=await value('select recent_posts::text as value from ojjuda_note_internal.spam_state where user_id=$1',[member]);
  await db.query("update ojjuda_note.cards set body='수정한 글' where author_id=$1",[member]);
  assert.equal(await value('select recent_posts::text as value from ojjuda_note_internal.spam_state where user_id=$1',[member]),timestamps);
  // Normal reporting remains available after retirement of the report switch.
  const target=await insert('신고 대상','memo',admin);
  await login(member);
  await value('select ojjuda_note_internal.report_card($1,$2) as value',[target,'신고 이유']);
  assert.equal(await value('select count(*)::int as value from ojjuda_note_internal.reports'),1);
  await login(''); assert.equal(await value("select ojjuda_note_internal.can_note_act('memo') as value"),false);
  await db.close();
  console.log('PASS: retired switches, notice editing, member restrictions, per-member combined limits, duplicate normalization, prior history, deletion resistance, settings permissions, audit and rollback');
})().catch(error=>{console.error(error.message, error.code, error.position);process.exit(1);});
