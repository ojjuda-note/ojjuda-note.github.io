// Focused SQL replay, not a full Supabase/PostgREST, Storage, or backup-restore test.
// Existing service schemas/helpers and unrelated retirement dependencies are local
// fixtures. Target tables, ACLs, RLS, views, and RPCs come from repository SQL.
// No fixture grants access to photo_* / life_donflow_snapshots /
// world_board_comments, and no ALTER DEFAULT PRIVILEGES grants are installed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migrations = path.join(__dirname, '../supabase/migrations');
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const ADMIN = '00000000-0000-4000-8000-000000000003';
const MINOR = '00000000-0000-4000-8000-000000000004';
const ANONYMOUS_MEMBER = '00000000-0000-4000-8000-000000000005';
const MISSING_BIRTH = '00000000-0000-4000-8000-000000000006';
const R1 = '10000000-0000-4000-8000-000000000001';
const R2 = '10000000-0000-4000-8000-000000000002';
const payload = { version: 1, tables: { transactions: [], categories: [] } };

async function replay(db, filename) {
  let sql = fs.readFileSync(path.join(migrations, filename), 'utf8');
  // PGlite already supplies gen_random_uuid; it cannot install pgcrypto here.
  // This is the only rewrite: every GRANT, REVOKE, policy, and function survives.
  sql = sql.replace(/^create extension if not exists pgcrypto;$/m, '');
  await db.exec(sql);
}

async function fixture(db) {
  await db.exec(`
    create role anon nosuperuser nobypassrls;
    create role authenticated nosuperuser nobypassrls;
    create role service_role nosuperuser bypassrls;
    alter default privileges revoke all on tables from public, anon, authenticated, service_role;
    alter default privileges in schema public revoke all on tables from public, anon, authenticated, service_role;
    create schema auth;
    create schema storage;
    create schema fixture_private;
    create table auth.users(id uuid primary key, is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    create table fixture_private.admins(user_id uuid primary key);
    create table fixture_private.blocks(a uuid, b uuid);
    create table public.profiles(
      id uuid primary key, nickname text, door_closed boolean default false,
      room jsonb default '{}', tv_media text, visits_today int, visits_total int, visits_day date
    );
    create table public.user_private(user_id uuid, banned_until timestamptz, data jsonb default '{}');
    create table public.friendships(requester uuid, addressee uuid, status text);
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from fixture_private.admins where user_id=auth.uid())
    $$;
    create function public.is_banned(uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.user_private where user_id=$1 and banned_until>now())
    $$;
    create function public.door_open(uuid) returns boolean language sql stable security definer set search_path='' as $$
      select not door_closed from public.profiles where id=$1
    $$;
    create function public.blocked_between(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from fixture_private.blocks where (a=$1 and b=$2) or (a=$2 and b=$1))
    $$;
    create function public.has_banned(text) returns boolean language sql immutable as $$select $1 like '%fixture-banned-word%'$$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1, '/')$$;
    alter table storage.objects enable row level security;
    grant select, insert, delete on storage.objects to anon, authenticated;
    create schema ojjuda_account_internal;
    create table ojjuda_account_internal.member_identity(user_id uuid primary key, birth_date date not null);
    create function ojjuda_account_internal.age_on(date,date) returns integer language sql immutable strict as $$
      select extract(year from age($2,$1))::integer
    $$;
    create schema ojjuda_game_internal;
    create function ojjuda_game_internal.community_game_monthly_ranking(p_game text)
      returns json language plpgsql stable security definer set search_path='' as $$
      declare v_limit int; begin
  v_limit := case p_game when 'runner' then 50000 end;
      return '[]'::json; end;
    $$;
    insert into auth.users(id) values('${A}'),('${B}'),('${ADMIN}'),('${MINOR}'),('${ANONYMOUS_MEMBER}'),('${MISSING_BIRTH}');
    update auth.users set is_anonymous=true where id='${ANONYMOUS_MEMBER}';
    insert into public.profiles(id,nickname) select id,'fixture-'||id::text from auth.users;
    insert into ojjuda_account_internal.member_identity
      select id,(now() at time zone 'Asia/Seoul')::date - case when id='${MINOR}' then interval '18 years' else interval '30 years' end
      from auth.users where id<>'${MISSING_BIRTH}';
    insert into fixture_private.admins values('${ADMIN}');

    -- Legacy board source fixtures, not replacement comment policies. The real
    -- security_invoker board projection and comment RLS run over these sources.
    create table public.media_folders(id uuid primary key, user_id uuid, visibility text, name text);
    create table public.house_posts(id text primary key, user_id uuid, body text, visibility text,
      folder_id uuid, created_at timestamptz default now(), deleted_at timestamptz);
    create table public.media(id text primary key, user_id uuid, type text, caption text, path text,
      folder_id uuid, visibility text, created_at timestamptz default now());
    create table public.diaries(id text primary key, user_id uuid, title text, body text,
      visibility text, created_at timestamptz default now(), likes int default 0);
    create table public.media_comments(id text primary key, body text constraint media_comments_body_check check(char_length(body) between 1 and 100));
    grant select on public.house_posts, public.media, public.media_folders, public.diaries to authenticated;
    alter table public.house_posts enable row level security;
    create policy fixture_legacy_post_read on public.house_posts for select to authenticated
      using(user_id=auth.uid() or (visibility='all' and deleted_at is null));
    alter table public.diaries enable row level security;
    create policy fixture_legacy_diary_read on public.diaries for select to authenticated
      using(user_id=auth.uid() or visibility='all');
    alter table public.media enable row level security;
    create policy fixture_legacy_media_read on public.media for select to authenticated
      using(user_id=auth.uid() or visibility='all');
    alter table public.media_folders enable row level security;
    create policy fixture_legacy_folder_read on public.media_folders for select to authenticated
      using(user_id=auth.uid() or visibility='all');
  `);
}

async function retirementFixtures(db) {
  // These empty placeholders let the *entire* actual retirement migration run.
  // They are not claims that this test replays the complete production schema.
  await db.exec(`
    create schema ojjuda_note;
    create schema ojjuda_house_note_internal;
    create schema ojjuda_media_internal;
    create schema ojjuda_house_admin;
    create schema ojjuda_comics_internal;
    create schema ojjuda_world_private;
    create schema cron;
    create table cron.job(jobname text);
    create function cron.unschedule(text) returns boolean language sql as $$select true$$;
    create table ojjuda_house_note_internal.config(enabled boolean);
    create table ojjuda_media_internal.config(enabled boolean);
    create table ojjuda_world_private.content_archive(kind text);
    create table public.place_messages(room text);
  `);
  const emptyDependencies = [
    'public.game_scores', 'ojjuda_note.cards', 'public.house_media_trash',
    'public.diary_likes', 'public.guestbook', 'public.intros', 'public.house_rooms',
    'public.house_friend_groups', 'public.profile_visits', 'public.life_schedule_events',
    'public.life_ledger_entries', 'public.quiz_winners', 'public.quiz_slots',
    'public.quiz_bank', 'public.quiz_words', 'public.creative_comic_pages',
    'public.creative_comics', 'public.shop_items', 'public.shop_sets',
    'ojjuda_house_note_internal.queue', 'ojjuda_media_internal.items',
    'ojjuda_house_admin.review_ack', 'ojjuda_comics_internal.revisions',
    'ojjuda_world_private.media_cleanup_queue'
  ];
  for (const table of emptyDependencies) await db.exec(`create table ${table}(fixture_id int)`);
}

(async () => {
  const db = new PGlite();
  try {
    await fixture(db);
    async function as(actor, sql, params = [], role = 'authenticated') {
      assert.ok(['anon', 'authenticated'].includes(role), 'exercise API roles, never the owner or service role');
      return db.transaction(async tx => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor || '']);
        await tx.exec(`set local role ${role}`);
        const caller = (await tx.query('select current_user as role, auth.uid() as id')).rows[0];
        assert.deepEqual(caller, { role, id: actor || null }, 'role and identity really changed');
        return tx.query(sql, params);
      });
    }
    const denied = (actor, sql, params = [], role = 'authenticated') =>
      assert.rejects(() => as(actor, sql, params, role), error => error.code === '42501', 'SQL privilege/RLS denial');

    await db.exec('create table public.fixture_ungranted_probe(id int)');
    for (const role of ['anon', 'authenticated']) {
      await denied(null, 'select * from public.fixture_ungranted_probe', [], role);
      const privileges = (await db.query(`select has_table_privilege($1,'public.fixture_ungranted_probe','SELECT,INSERT,UPDATE,DELETE') as allowed`, [role])).rows[0];
      assert.equal(privileges.allowed, false, `${role} has no automatic table grant`);
    }
    await db.exec('drop table public.fixture_ungranted_probe');

    for (const filename of [
      '20261004111608_world_board.sql',
      '20261004131220_life_donflow.sql',
      '20261005123653_photo_ttang_stages.sql',
      '20261006021326_photo_ttang_adult_access.sql',
      '20261006082621_photo_ttang_monthly_ranking.sql',
      '20261007030245_photo_ttang_unlimited_uploads.sql',
      '20261009033125_world_board_comments.sql'
    ]) await replay(db, filename);

    // DonFlow creation-time contract: explicit grants plus ownership isolation.
    for (const actor of [A, B]) {
      await as(actor, 'insert into public.life_donflow_snapshots(revision,payload) values($1,$2)', [R1, payload]);
      assert.deepEqual((await as(actor, 'select user_id from public.life_donflow_snapshots')).rows, [{ user_id: actor }]);
    }
    await denied(null, 'select * from public.life_donflow_snapshots', [], 'anon');
    await denied(null, 'insert into public.life_donflow_snapshots(revision,payload) values($1,$2)', [R1, payload], 'anon');
    await denied(A, 'insert into public.life_donflow_snapshots(user_id,revision,payload) values($1,$2,$3)', [ADMIN, R1, payload]);
    assert.equal((await as(A, 'update public.life_donflow_snapshots set revision=$1 where user_id=$2 returning user_id', [R2, B])).rows.length, 0);
    assert.equal((await as(A, 'update public.life_donflow_snapshots set revision=$1 where user_id=$2 returning user_id', [R2, A])).rows.length, 1);
    await denied(A, 'update public.life_donflow_snapshots set user_id=$1 where user_id=$2', [ADMIN, A]);
    await denied(A, 'delete from public.life_donflow_snapshots where user_id=$1', [A]);
    assert.equal((await as(A, 'select public.life_donflow_save($1,$2,$3) as revision', [R2, R1, payload])).rows[0].revision, R1);
    assert.equal((await as(A, 'select public.life_donflow_save($1,$2,$3) as revision', [R2, R1, payload])).rows[0].revision, R1, 'retry is idempotent');
    await denied(null, 'select public.life_donflow_save($1,$2,$3)', [null, R1, payload], 'anon');

    // Photo-stage creation plus subsequent adult/storage restrictions.
    async function stage(actor, visibility) {
      return (await as(actor, `insert into public.photo_stages(owner,image_path,mask_rle,visibility,status)
        values($1,$2,'1',$3,$4) returning id`, [actor, `${actor}/${visibility}.jpg`, visibility, visibility === 'public' ? 'pending' : 'approved'])).rows[0].id;
    }
    const pending = await stage(A, 'public');
    const privateStage = await stage(A, 'private');
    const friends = await stage(A, 'friends');
    await db.exec(`insert into storage.objects(bucket_id,name) select 'photo-stages',image_path from public.photo_stages;
      insert into public.photo_admins values('${ADMIN}');`);
    assert.equal((await as(A, 'select id from public.photo_stages')).rows.length, 3);
    assert.equal((await as(B, 'select id from public.photo_stages')).rows.length, 0, 'unrelated adult sees no private/friends/pending rows');
    assert.equal((await as(null, 'select id from public.photo_stages', [], 'anon')).rows.length, 0);
    await as(ADMIN, 'select public.photo_set_status($1,$2)', [pending, 'approved']);
    assert.deepEqual((await as(B, 'select id from public.photo_stages')).rows, [{ id: pending }]);
    await db.exec(`insert into public.friendships values('${A}','${B}','accepted')`);
    assert.deepEqual((await as(B, 'select id from public.photo_stages order by id')).rows.map(row => row.id), [pending, friends].sort());
    for (const actor of [MINOR, ANONYMOUS_MEMBER, MISSING_BIRTH, null]) {
      const role = actor ? 'authenticated' : 'anon';
      assert.equal((await as(actor, 'select id from public.photo_stages', [], role)).rows.length, 0);
      assert.equal((await as(actor, 'select name from storage.objects', [], role)).rows.length, 0);
      if (actor) await denied(actor, `insert into public.photo_stages(owner,image_path,mask_rle,visibility,status) values($1,$2,'1','private','approved')`, [actor, `${actor}/denied.jpg`]);
    }
    assert.equal((await as(B, 'select name from storage.objects')).rows.length, 2, 'storage policy follows the stage visibility');
    await denied(null, `insert into public.photo_stages(owner,image_path,mask_rle) values($1,$2,'1')`, [A, `${A}/denied.jpg`], 'anon');
    await denied(A, 'update public.photo_stages set status=$1 where id=$2', ['approved', pending]);
    assert.equal((await as(B, 'delete from public.photo_stages where id=$1 returning id', [privateStage])).rows.length, 0, 'other member cannot delete owner row');
    await assert.rejects(() => as(B, 'select public.photo_set_visibility($1,$2)', [privateStage, 'public']), /not allowed/);
    await assert.rejects(() => as(B, 'select public.photo_set_status($1,$2)', [pending, 'hidden']), /not allowed/);
    await denied(null, 'select public.photo_set_visibility($1,$2)', [privateStage, 'public'], 'anon');
    for (const role of ['anon', 'authenticated']) {
      await denied(role === 'anon' ? null : A, 'select * from public.photo_reports', [], role);
      await denied(role === 'anon' ? null : A, 'insert into public.photo_admins(user_id) values($1)', [A], role);
    }
    assert.equal((await as(A, 'select * from public.photo_admins')).rows.length, 0);
    assert.deepEqual((await as(ADMIN, 'select user_id from public.photo_admins')).rows, [{ user_id: ADMIN }]);
    const removable = await stage(B, 'private');
    assert.deepEqual((await as(B, 'delete from public.photo_stages where id=$1 returning id', [removable])).rows, [{ id: removable }]);

    // Board comments are visible only through the actual invoker board view.
    await db.exec(`insert into public.house_posts(id,user_id,body,visibility) values
      ('public-a','${A}','public source','all'),('private-a','${A}','private source','me'),('public-b','${B}','other source','all');
      insert into public.diaries(id,user_id,title,body,visibility) values('diary-a','${A}','title','diary source','all');`);
    const comment = (await as(B, "insert into public.world_board_comments(post_id,body) values('public-a','member comment') returning id")).rows[0].id;
    const diaryComment = (await as(A, "insert into public.world_board_comments(diary_id,body) values('diary-a','diary comment') returning id")).rows[0].id;
    for (const actor of [A, B]) assert.equal((await as(actor, 'select id from public.world_board_comments')).rows.length, 2);
    await denied(null, 'select * from public.world_board_comments', [], 'anon');
    await denied(null, "insert into public.world_board_comments(post_id,body) values('public-a','guest')", [], 'anon');
    await denied(B, "insert into public.world_board_comments(post_id,author_id,body) values('public-a',$1,'forged')", [A]);
    await denied(B, "insert into public.world_board_comments(post_id,body) values('private-a','hidden source')");
    await denied(A, 'update public.world_board_comments set body=$1 where id=$2', ['no direct edits', diaryComment]);
    assert.equal((await as(B, 'delete from public.world_board_comments where id=$1 returning id', [diaryComment])).rows.length, 0, 'non-author/non-owner cannot delete');
    await db.exec(`insert into fixture_private.blocks values('${A}','${B}')`);
    assert.equal((await as(A, 'select id from public.world_board_comments where id=$1', [comment])).rows.length, 0, 'blocked author is excluded');
    assert.equal((await as(B, 'select id from public.world_board_comments')).rows.length, 0, 'blocked source owner is excluded by real board projection');
    await db.exec('delete from fixture_private.blocks');
    await db.exec("update public.house_posts set visibility='me' where id='public-a'");
    assert.equal((await as(B, 'select id from public.world_board_comments where id=$1', [comment])).rows.length, 0, 'source privacy change hides old comments');
    await db.exec("update public.house_posts set visibility='all' where id='public-a'");
    await db.exec(`insert into public.user_private(user_id,banned_until) values('${B}',now()+interval '1 day')`);
    await denied(B, "insert into public.world_board_comments(post_id,body) values('public-a','banned member')");
    await db.exec('delete from public.user_private');
    await denied(B, "insert into public.world_board_comments(post_id,body) values('public-a','fixture-banned-word')");
    assert.deepEqual((await as(A, 'delete from public.world_board_comments where id=$1 returning id', [comment])).rows, [{ id: comment }], 'source owner may remove a comment');
    assert.deepEqual((await as(A, 'delete from public.world_board_comments where id=$1 returning id', [diaryComment])).rows, [{ id: diaryComment }], 'author may remove own comment');
    console.log('PASS: creation-time explicit grants work without automatic grants; anon, owner, other member and restricted-member denials remain enforced');

    // Latest state matters: DonFlow and board writes were retired on 2026-10-20.
    // Never "fix" their missing write privileges by restoring old creation ACLs.
    await retirementFixtures(db);
    await replay(db, '20261020200500_retire_unused_world_data.sql');
    await replay(db, '20261021002639_photo_ttang_men_20.sql');
    for (const actor of [A, B]) {
      assert.deepEqual((await as(actor, 'select * from public.life_donflow_snapshots')).rows, []);
      assert.deepEqual((await as(actor, 'select * from public.world_board_comments')).rows, []);
      await denied(actor, 'insert into public.life_donflow_snapshots(revision,payload) values($1,$2)', [R1, payload]);
      await denied(actor, 'update public.life_donflow_snapshots set payload=$1', [payload]);
      await denied(actor, 'delete from public.life_donflow_snapshots');
      assert.equal((await as(actor, "select has_column_privilege(current_user,'public.life_donflow_snapshots','payload','UPDATE') as allowed")).rows[0].allowed, false, 'retirement also removes the former column-level update grant');
      await denied(actor, 'select public.life_donflow_save($1,$2,$3)', [null, R1, payload]);
      await denied(actor, "insert into public.world_board_comments(post_id,body) values('public-a','retired client')");
      await denied(actor, 'delete from public.world_board_comments');
      await denied(actor, 'update public.world_board_comments set body=$1', ['retired client']);
    }
    await denied(null, 'select * from public.life_donflow_snapshots', [], 'anon');
    await denied(null, 'select * from public.world_board_comments', [], 'anon');
    assert.deepEqual((await as(B, 'select id from public.photo_stages order by id')).rows.map(row => row.id), [pending, friends].sort(), 'active photo permissions survive retirement');
    assert.equal((await as(B, "select public.photo_game_clear('39') as result")).rows[0].result.ok, true, 'latest photo RPC still works with explicit grants');
    await denied(null, "select public.photo_game_clear('39')", [], 'anon');
    await denied(A, 'select * from ojjuda_photo_internal.game_clears');
    await denied(MINOR, "select public.photo_game_clear('39')");
    console.log('PASS: current retired DonFlow save/write and board-comment write denials; read compatibility and active photo access remain intact');
  } finally {
    await db.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
