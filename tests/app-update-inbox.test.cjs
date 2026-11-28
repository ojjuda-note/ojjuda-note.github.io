const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

const migration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    INSERT INTO auth.users VALUES('${userA}'),('${userB}');
  `);
  await db.exec(migration('20261106081807_daily_update_notices.sql'));
  await db.exec(migration('20261106082348_daily_update_notice_24h_window.sql'));
  await db.exec(`
    CREATE SCHEMA ojjuda_note_internal;
    CREATE SCHEMA ojjuda_groups_internal;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,nickname text);
    CREATE TABLE public.friendships(id text PRIMARY KEY,requester uuid,addressee uuid,status text,created_at timestamptz,accepted_at timestamptz);
    CREATE FUNCTION public.blocked_between(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE ojjuda_note_internal.friend_messages(id uuid,recipient_id uuid,sender_id uuid,created_at timestamptz);
    CREATE FUNCTION ojjuda_note_internal.friend_message_blocked(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE ojjuda_note_internal.world_notification_reads(user_id uuid,event_id text,event_created_at timestamptz,read_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,event_id,event_created_at));
    CREATE FUNCTION ojjuda_note_internal.visible_notifications()
      RETURNS TABLE(id uuid,kind text,card_id uuid,inquiry_id uuid,created_at timestamptz,read_at timestamptz)
      LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::timestamptz WHERE false $$;
    CREATE FUNCTION ojjuda_note_internal.mark_notifications_read(uuid[],timestamptz,timestamptz)
      RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
    CREATE TABLE ojjuda_groups_internal.rooms(id uuid,owner_id uuid,deleting boolean,name text);
    CREATE TABLE ojjuda_groups_internal.invitations(id uuid,recipient_id uuid,room_id uuid,sender_id uuid,status text,created_at timestamptz);
    CREATE TABLE ojjuda_groups_internal.members(room_id uuid,user_id uuid);
    CREATE FUNCTION ojjuda_groups_internal.allowed() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION ojjuda_groups_internal.invitable_peer(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  `);
  await db.exec(migration('20261106225332_app_daily_update_inbox.sql'));
  await db.exec(`CREATE FUNCTION ojjuda_note_internal.app_notification_unread_count()
    RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT count(*)::integer FROM ojjuda_note_internal.visible_app_notifications() n WHERE n.read_at IS NULL $$;`);
  return db;
}

test('a daily change and one-off recap appear once per member, without a popup', async () => {
  const db = await fixture();
  try {
    const yesterday = (await db.query("SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date - 1)::text AS day")).rows[0].day;
    const changes = [{category:'games',text:'솔리테어 게임 추가',source_sha:'a'.repeat(40),deployment_url:'https://github.com/ojjuda-note/ojjuda-note.github.io/actions/runs/123'}];
    await db.query('SELECT ojjuda_updates_internal.publish_daily_notice($1,$2::jsonb)',[yesterday,JSON.stringify(changes)]);
    await db.query(`INSERT INTO ojjuda_updates_internal.broadcast_notices
      (id,summary,expires_at,source_sha,deployment_url) VALUES
      ('month-2026-10-07','오락실 게임·순위 개선 · 축제·스포츠 일정 확대',now()+interval '30 days',$1,$2)`,
    ['b'.repeat(40),'https://github.com/ojjuda-note/ojjuda-note.github.io/actions/runs/123']);
    const q = sql => db.query(sql);
    await q(`SELECT set_config('request.jwt.claim.sub','${userA}',false)`);
    let inbox = (await q('SELECT ojjuda_note_internal.list_app_notifications() AS data')).rows[0].data;
    assert.equal(inbox.unread_count,2);
    assert.deepEqual(inbox.items.map(i=>i.kind).sort(),['broadcast_update','daily_update']);
    assert.ok(inbox.items.every(i=>i.source==='updates' && i.read_at===null));
    assert.ok(inbox.items.some(i=>i.summary==='솔리테어 게임 추가'));
    assert.ok(inbox.items.some(i=>i.summary.includes('축제·스포츠')));
    assert.ok(!JSON.stringify(inbox).includes('source_sha'),'source evidence is private');
    const broadcast = inbox.items.find(i=>i.kind==='broadcast_update');
    assert.equal((await db.query('SELECT ojjuda_note_internal.mark_app_notifications_read($1,$2,$3) AS changed',[[broadcast.id],broadcast.created_at,null])).rows[0].changed,1);
    inbox = (await q('SELECT ojjuda_note_internal.list_app_notifications() AS data')).rows[0].data;
    assert.equal(inbox.unread_count,1);
    assert.ok(inbox.items.find(i=>i.id===broadcast.id).read_at);
    assert.equal((await db.query('SELECT ojjuda_note_internal.mark_app_notifications_read($1,$2,$3) AS changed',[null,null,inbox.as_of])).rows[0].changed,1);
    assert.equal((await q('SELECT ojjuda_note_internal.app_notification_unread_count() AS count')).rows[0].count,0);
    await q(`SELECT set_config('request.jwt.claim.sub','${userB}',false)`);
    assert.equal((await q('SELECT ojjuda_note_internal.app_notification_unread_count() AS count')).rows[0].count,2,'another member still has both unread');
    await q("SELECT set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(q('SELECT ojjuda_note_internal.list_app_notifications()'));
  } finally { await db.close(); }
});

test('one-off notices reject administrative content, unsafe text and duplicate publication', async () => {
  const db = await fixture();
  try {
    const insert = text => db.query(`INSERT INTO ojjuda_updates_internal.broadcast_notices
      (id,summary,expires_at,source_sha,deployment_url)
      VALUES ('month-2026-10-07',$1,now()+interval '30 days',$2,$3)`,
    [text,'a'.repeat(40),'https://github.com/ojjuda-note/ojjuda-note.github.io/actions/runs/123']);
    for (const summary of ['관리자 모드 개선','원고실 수정','<img>','', 'X'.repeat(181)]) {
      await assert.rejects(insert(summary));
    }
    await insert('오락실 게임 개선');
    await assert.rejects(insert('오락실 게임 개선'),'broadcast cannot be resent with the same ID');
  } finally { await db.close(); }
});

test('visit gifts reserve once and credit only the confirming account', async () => {
  const db = await fixture();
  const newId = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
  const balance = async id => (await db.query('select coins from public.user_private where user_id=$1',[id])).rows[0].coins;
  const login = id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const claim = id => db.query('select public.claim_visit_gift($1) as gift',[id]);
  const notice = async () => (await db.query('select ojjuda_note_internal.list_app_notifications() as inbox')).rows[0].inbox.items.find(i=>i.kind==='visit_gift');
  try {
    await db.exec(`alter table auth.users add last_sign_in_at timestamptz, add is_anonymous boolean default false;
      create schema ojjuda_rewards_internal; create schema ojjuda_account_internal;
      create table ojjuda_account_internal.member_navigation_history(user_id uuid,created_at timestamptz);
      create table ojjuda_rewards_internal.activity_days(user_id uuid, active_day date);
      create table public.app_config(key text primary key,value jsonb,updated_at timestamptz default now());
      create table public.user_private(user_id uuid primary key references auth.users(id),coins integer default 20,
        owned text[] default '{}',last_checkin date,last_seen_at timestamptz);
      create function public.is_admin() returns boolean language sql as $$ select auth.uid()='${userA}'::uuid $$;
      create function public.is_banned(uuid) returns boolean language sql as $$ select false $$;
      create function public.user_private_defaults() returns trigger language plpgsql as $$begin return new;end;$$;
      create trigger user_private_defaults before insert on public.user_private for each row execute function public.user_private_defaults();
      update auth.users set last_sign_in_at='2026-11-12T12:00:00+09' where id='${userA}';
      insert into public.user_private(user_id,coins) values('${userA}',75);
      create schema test_clock;
      create function test_clock.at_visit() returns timestamptz language sql stable as $$
        select current_setting('test.visit_time')::timestamptz $$;
      set test.visit_time='2026-11-15 23:59:59.999+09';`);
    // Inject the boundary clock so CI can repeat this test after the event.
    const script=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(n=>n.endsWith('_configurable_first_visit_ju.sql'));
    await db.exec(migration(script).replaceAll('statement_timestamp()', 'test_clock.at_visit()'));
    await login(userA);
    let gift=await notice();assert.deepEqual([gift.first_visit_ju,gift.launch_ju,gift.claimed],[0,10000,false]);
    assert.equal(await balance(userA),75);
    await db.exec("select ojjuda_note_internal.mark_app_notifications_read(null,null,timestamptz '2030-01-01')");
    assert.equal((await notice()).claimed,false);assert.equal(await balance(userA),75);
    await db.query('insert into public.user_private(user_id,coins) values($1,700000)',[userB]);
    await db.exec('select public.admin_set_first_visit_ju(5500)');
    await assert.rejects(db.exec('select public.admin_set_first_visit_ju(-1)'));
    await login(userB);await assert.rejects(db.exec('select public.admin_set_first_visit_ju(9)'));
    gift=await notice();assert.deepEqual([gift.first_visit_ju,gift.launch_ju],[10000,10000]);assert.equal(await balance(userB),0);
    await assert.rejects(claim(userA));assert.equal(await balance(userA),75);
    const later=newId(3), delayed=newId(4);
    await db.query('insert into auth.users(id) values($1),($2)',[later,delayed]);
    await db.query("update auth.users set last_sign_in_at='2026-11-15 23:59:59.999+09' where id=$1",[delayed]);
    await db.exec("set test.visit_time='2026-11-16 00:00:00+09'");
    for(const id of [later,delayed])await db.query('insert into public.user_private(user_id) values($1)',[id]);
    await login(later);gift=await notice();assert.deepEqual([gift.first_visit_ju,gift.launch_ju],[5500,0]);
    await login(delayed);gift=await notice();assert.deepEqual([gift.first_visit_ju,gift.launch_ju],[5500,10000]);
    await login(userB);
    assert.equal((await claim(userB)).rows[0].gift.replayed,false);
    await db.query('insert into public.user_private(user_id) values($1) on conflict(user_id) do nothing',[userB]);
    assert.equal((await claim(userB)).rows[0].gift.replayed,true);
    assert.equal((await notice()).claimed,true);assert.equal(await balance(userB),20000);
    await login(userA);await claim(userA);assert.equal(await balance(userA),10075);
    assert.equal((await db.query("select has_function_privilege('anon','public.claim_visit_gift(uuid)','execute') as allowed")).rows[0].allowed,false);
  } finally {await db.close();}
});

test('a drinking invite shows its sender and room only in the eligible recipient inbox',async t=>{
  const db=await fixture();t.after(()=>db.close());
  await db.exec(`
    create schema ojjuda_arcade_internal;
    create table ojjuda_arcade_internal.drinking_rooms(code text primary key,title text);
    create table public.arcade_friend_invites(id uuid primary key,room_code text,sender_id uuid,recipient_id uuid,
      kind text,status text,created_at timestamptz default now(),expires_at timestamptz);
    create function public.is_friend(uuid,uuid) returns boolean language sql as $$select true$$;
    create function ojjuda_arcade_internal.drinking_invitable_room(text,uuid,uuid) returns boolean language sql as
      $$select exists(select 1 from ojjuda_arcade_internal.drinking_rooms where code=$1)$$;
    insert into ojjuda_arcade_internal.drinking_rooms values ('ABC123','수달의 테이블');
  `);
  await db.exec(migration('20261115025215_drinking_friend_invite_inbox.sql'));
  await db.query("insert into public.profiles(id,nickname) values($1,'초대하는 친구')",[userA]);
  await db.query("insert into public.arcade_friend_invites(id,room_code,sender_id,recipient_id,kind,status,expires_at) values(gen_random_uuid(),'ABC123',$1,$2,'drinking','pending',now()+interval '1 minute')",[userA,userB]);
  async function inbox(actor){
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    return (await db.query('select ojjuda_note_internal.list_app_notifications() as result')).rows[0].result;
  }
  assert.equal((await inbox(userA)).items.length,0);
  const incoming=await inbox(userB);
  assert.equal(incoming.unread_count,1);
  assert.deepEqual([incoming.items[0].kind,incoming.items[0].sender_name,incoming.items[0].room_title],
    ['drinking_invite','초대하는 친구','수달의 테이블']);
  assert.doesNotMatch(JSON.stringify(incoming),/ABC123/);
  await db.exec("update public.arcade_friend_invites set status='accepted'");
  assert.equal((await inbox(userB)).unread_count,0);
});

test('service inbox scopes pages, badge and bulk reads before pagination and preserves common receipts',async t=>{
  const db=await fixture();t.after(()=>db.close());
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const login=user=>scalar("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  const page=(app,limit=30,cursor=null)=>scalar('select public.list_app_notifications($1::text,$2::integer,$3::timestamptz,$4::text)',
    [app,limit,cursor?.created_at||null,cursor?.id||null]);
  const summary=app=>scalar('select public.app_notification_summary($1::text)',[app]);
  const bulk=(app,time)=>scalar('select public.mark_app_notifications_read($1::text,null,null,$2::timestamptz)',[app,time]);
  await db.exec(`
    create schema ojjuda_note;create schema ojjuda_rewards_internal;create schema ojjuda_arcade_internal;
    create table ojjuda_rewards_internal.visit_gifts(user_id uuid,first_visit_ju integer,launch_ju integer,claimed_at timestamptz);
    create table ojjuda_arcade_internal.drinking_rooms(code text,title text);
    create table public.arcade_friend_invites(id uuid,room_code text,sender_id uuid,recipient_id uuid);
    create table ojjuda_note_internal.cards_test(recipient uuid,id uuid primary key default gen_random_uuid(),
      kind text,card_id uuid default gen_random_uuid(),inquiry_id uuid,created_at timestamptz default now(),read_at timestamptz);
    create or replace function ojjuda_note_internal.visible_notifications()
      returns table(id uuid,kind text,card_id uuid,inquiry_id uuid,created_at timestamptz,read_at timestamptz)
      language sql stable as $$select id,kind,card_id,inquiry_id,created_at,read_at from ojjuda_note_internal.cards_test where recipient=auth.uid()$$;
    create or replace function ojjuda_note_internal.mark_notifications_read(uuid[],timestamptz,timestamptz)
      returns integer language sql as $$with changed as (update ojjuda_note_internal.cards_test set read_at=now()
      where recipient=auth.uid() and read_at is null and ($1 is null or id=any($1))
      and ($2 is null or created_at=$2) and ($3 is null or created_at<=$3) returning 1) select count(*)::integer from changed$$;
    create function ojjuda_note.list_retention_alerts() returns table(id uuid,card_id uuid,created_at timestamptz,archive_due_at timestamptz,read_at timestamptz)
      language sql stable as $$select gen_random_uuid(),gen_random_uuid(),now(),now(),null::timestamptz where auth.uid()='${userA}'::uuid$$;
    grant usage on schema auth,ojjuda_note,ojjuda_note_internal to authenticated;
    insert into ojjuda_note_internal.cards_test(recipient,kind,created_at)
      select '${userA}','reply',now()-interval '1 minute' from generate_series(1,104);
    insert into ojjuda_note_internal.cards_test(recipient,kind,created_at) values
      ('${userA}','inquiry_reply',now()-interval '1 day'),('${userB}','reply',now());
    insert into ojjuda_groups_internal.rooms values ('${userB}','${userB}',false,'그룹');
    insert into ojjuda_groups_internal.invitations values ('${userB}','${userA}','${userB}','${userB}','pending',now()-interval '2 hours');
    insert into ojjuda_note_internal.friend_messages values ('${userB}','${userA}','${userB}',now()-interval '1 hour');
  `);
  const script=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(n=>n.endsWith('_app_scoped_notifications.sql'));
  await db.exec(migration(script));await login(userA);
  await db.exec('set role authenticated');
  const first=await page('agit',1);
  assert.deepEqual(first.items.map(i=>i.kind),['world_message']);assert.equal(first.unread_count,3);
  const second=await page('agit',1,first.next_cursor);
  assert.deepEqual(second.items.map(i=>i.kind),['group_invite']);
  assert.deepEqual((await page('pajang')).items.map(i=>i.kind),['inquiry_reply']);
  const park=await page('park',1);
  assert.deepEqual(park.items.map(i=>i.kind),['reply']);
  assert.deepEqual(await summary('park'),{notifications:106,retention:1});
  assert.deepEqual(await summary('agit'),{notifications:3,retention:0});
  assert.deepEqual(await summary('pajang'),{notifications:1,retention:0});
  assert.equal(await scalar("select public.mark_app_notifications_read('agit',$1::text[],$2::timestamptz,null)",
    [[park.items[0].id],park.items[0].created_at]),0);
  assert.deepEqual((await page(null)).items,[]);
  assert.equal(await bulk('pajang',first.as_of),1);
  assert.equal((await summary('agit')).notifications,2);
  await db.exec('reset role');
  await db.query("insert into ojjuda_note_internal.cards_test(recipient,kind) values ($1,'like')",[userA]);
  await db.exec('set role authenticated');
  assert.equal(await bulk('park',park.as_of),105);
  assert.equal(await bulk('park',park.as_of),0);
  assert.deepEqual(await summary('park'),{notifications:1,retention:1});
  assert.equal((await summary('agit')).notifications,1,'Agit group invite is still unread');
  assert.equal((await summary('pajang')).notifications,0);
  await login(userB);assert.deepEqual(await summary('park'),{notifications:1,retention:0});
  assert.deepEqual(await summary('pajang'),{notifications:0,retention:0});
  assert.equal(await scalar("select has_function_privilege('anon','public.app_notification_summary(text)','execute')"),false);
  await login('');await assert.rejects(page('agit'),/Sign in required/);
});
