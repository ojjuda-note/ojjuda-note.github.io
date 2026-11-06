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
