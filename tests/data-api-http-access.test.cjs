// Opt-in integration test for a NEW, DISPOSABLE local Supabase runtime only.
// Requires Node >= 20, psql (or PSQL), OJJUDA_LOCAL_API_TEST=1,
// SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// API and DB URLs must use literal 127.0.0.1 or ::1 and explicit ports.
// Start with api.auto_expose_new_tables=false. This test verifies that setting;
// it does not install fallback table grants or change default privileges.
//
// Creates synthetic Auth users via GoTrue, obtains real password-grant JWTs,
// and exercises PostgREST and Storage HTTP endpoints. No fabricated JWTs.
// Existing Auth/Storage infrastructure is preserved. Legacy app dependencies
// below are synthetic fixtures; this is not a full-schema or backup-restore test.
// The caller must stop/discard the isolated runtime afterward, even on failure.
// This script never resets an existing database or deletes unknown schemas/users.
// Offline safeguards only: node tests/data-api-http-access.test.cjs --check-guards
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const migrations = path.join(__dirname, '../supabase/migrations');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function localUrl(value, kind) {
  assert.ok(value, `${kind} URL is required`);
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${kind} URL`); }
  const api = kind === 'API';
  assert.ok((api ? ['http:', 'https:'] : ['postgres:', 'postgresql:']).includes(url.protocol), `Invalid ${kind} protocol`);
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), `${kind} must use a literal loopback address`);
  assert.ok(url.port && Number(url.port) > 0, `${kind} requires an explicit port`);
  assert.ok(url.search === '', `${kind} URL query options are forbidden`);
  assert.ok(url.hash === '', `${kind} URL fragments are forbidden`);
  if (api) {
    assert.ok(url.username + url.password === '', 'API credentials must be environment variables, not URL userinfo');
    assert.ok(url.pathname === '/', 'API URL must be an origin without a path');
  } else {
    assert.ok(url.username && /^\/[a-zA-Z0-9_-]+$/.test(url.pathname), 'DB user and simple database name required');
  }
  return url;
}

function setup() {
  assert.equal(process.env.OJJUDA_LOCAL_API_TEST, '1', 'Refusing to run without OJJUDA_LOCAL_API_TEST=1');
  const base = localUrl(process.env.SUPABASE_URL, 'API');
  const db = localUrl(process.env.SUPABASE_DB_URL, 'DB');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(anonKey && serviceKey && anonKey !== serviceKey, 'Distinct local API keys are required via environment only');
  const host = db.hostname.replace(/^\[|\]$/g, '');
  // Do not inherit libpq services, hostaddr, options or connection-string tricks.
  // Credentials remain in the child environment, never argv or logged SQL.
  const pgEnv = {
    PATH: process.env.PATH,
    ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}),
    PGHOST: host, PGHOSTADDR: host, PGPORT: db.port,
    PGDATABASE: db.pathname.slice(1), PGUSER: decodeURIComponent(db.username),
    PGPASSWORD: decodeURIComponent(db.password), PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '5', PGAPPNAME: 'ojjuda-disposable-api-test'
  };
  function sql(statement) {
    const result = spawnSync(process.env.PSQL || 'psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      input: statement, env: pgEnv, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024
    });
    if (result.error) throw new Error(`Local psql failed: ${result.error.code || 'process error'}`);
    if (result.status !== 0) throw new Error(`Local SQL failed: ${(result.stderr || '').trim().slice(0, 1800)}`);
    return result.stdout.trim();
  }
  async function request(route, { actor, method = 'GET', body, admin = false, bytes = false, contentType } = {}) {
    assert.ok(route.startsWith('/') && !route.startsWith('//'), 'Only local relative API routes are allowed');
    const url = new URL(route, base);
    assert.equal(url.origin, base.origin, 'API origin cannot change');
    const headers = {
      apikey: admin ? serviceKey : anonKey,
      Authorization: `Bearer ${admin ? serviceKey : actor?.token || anonKey}`
    };
    if (body !== undefined) headers['Content-Type'] = contentType || 'application/json';
    if (route.startsWith('/rest/v1/') && method !== 'GET') headers.Prefer = 'return=representation';
    const response = await fetch(url, {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
      ...(body !== undefined ? { body: contentType ? body : JSON.stringify(body) } : {})
    });
    let data;
    if (bytes && response.ok) data = Buffer.from(await response.arrayBuffer());
    else {
      const text = await response.text();
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    }
    return { status: response.status, data };
  }
  function success(response, label) {
    assert.ok([200, 201, 204].includes(response.status), `${label}: HTTP ${response.status}, code ${response.data?.code || response.data?.error || 'none'}`);
    return response.data;
  }
  const rest = (actor, resource, method = 'GET', body) => request(`/rest/v1/${resource}`, { actor, method, body });
  async function denied(actor, resource, method = 'GET', body, code = '42501') {
    const response = await rest(actor, resource, method, body);
    assert.ok([400, 401, 403].includes(response.status), `Expected denial for ${method} ${resource}, got HTTP ${response.status}`);
    assert.equal(response.data?.code, code, `Expected SQL denial for ${method} ${resource}`);
  }
  async function reload() {
    sql("notify pgrst, 'reload schema';");
    const deadline = Date.now() + 30000;
    while (true) {
      const response = await rest(null, 'photo_stages?select=id&limit=0');
      if (response.status === 200) break;
      assert.ok(['PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'].includes(response.data?.code), `Unexpected schema reload response: HTTP ${response.status}`);
      assert.ok(Date.now() < deadline, 'PostgREST schema reload timed out');
      await pause(100);
    }
  }
  return { sql, request, success, rest, denied, reload };
}

function appFixtures(sql) {
  // No auth.uid replacement, auth.users inserts, storage replacement tables,
  // service roles, or target-table privileges are introduced by this fixture.
  sql(`
    create schema fixture_private;
    revoke all on schema fixture_private from public, anon, authenticated;
    create table fixture_private.admins(user_id uuid primary key);
    create table fixture_private.blocks(a uuid,b uuid);
    create table public.profiles(id uuid primary key,nickname text,door_closed boolean default false,
      room jsonb default '{}',tv_media text,visits_today int,visits_total int,visits_day date);
    create table public.user_private(user_id uuid,banned_until timestamptz,data jsonb default '{}');
    create table public.friendships(requester uuid,addressee uuid,status text);
    alter table public.profiles enable row level security;
    alter table public.user_private enable row level security;
    alter table public.friendships enable row level security;
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
    -- These pre-existing helper interfaces are fixture prerequisites only.
    revoke all on function public.is_admin(),public.is_banned(uuid),public.door_open(uuid),public.blocked_between(uuid,uuid),public.has_banned(text) from public,anon,authenticated;
    grant execute on function public.is_admin(),public.is_banned(uuid),public.door_open(uuid),public.blocked_between(uuid,uuid),public.has_banned(text) to anon,authenticated;
    create schema ojjuda_account_internal;
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date not null);
    create function ojjuda_account_internal.age_on(date,date) returns integer language sql immutable strict as $$select extract(year from age($2,$1))::integer$$;
    create schema ojjuda_game_internal;
    create function ojjuda_game_internal.community_game_monthly_ranking(p_game text)
      returns json language plpgsql stable security definer set search_path='' as $$
      declare v_limit int; begin
  v_limit := case p_game when 'runner' then 50000 end;
      return '[]'::json; end;
    $$;
    create table public.media_folders(id uuid primary key,user_id uuid,visibility text,name text);
    create table public.house_posts(id text primary key,user_id uuid,body text,visibility text,
      folder_id uuid,created_at timestamptz default now(),deleted_at timestamptz);
    create table public.media(id text primary key,user_id uuid,type text,caption text,path text,
      folder_id uuid,visibility text,created_at timestamptz default now());
    create table public.diaries(id text primary key,user_id uuid,title text,body text,
      visibility text,created_at timestamptz default now(),likes int default 0);
    create table public.media_comments(id text primary key,body text constraint media_comments_body_check check(char_length(body) between 1 and 100));
    alter table public.media_comments enable row level security;
    grant select on public.house_posts,public.media,public.media_folders,public.diaries to authenticated;
    alter table public.house_posts enable row level security;
    create policy fixture_legacy_post_read on public.house_posts for select to authenticated using(user_id=auth.uid() or (visibility='all' and deleted_at is null));
    alter table public.diaries enable row level security;
    create policy fixture_legacy_diary_read on public.diaries for select to authenticated using(user_id=auth.uid() or visibility='all');
    alter table public.media enable row level security;
    create policy fixture_legacy_media_read on public.media for select to authenticated using(user_id=auth.uid() or visibility='all');
    alter table public.media_folders enable row level security;
    create policy fixture_legacy_folder_read on public.media_folders for select to authenticated using(user_id=auth.uid() or visibility='all');
  `);
}

function retirementFixtures(sql) {
  sql(`
    create schema ojjuda_note;
    create schema ojjuda_house_note_internal;
    create schema ojjuda_media_internal;
    create schema ojjuda_house_admin;
    create schema ojjuda_comics_internal;
    create schema ojjuda_world_private;
    create table ojjuda_house_note_internal.config(enabled boolean);
    create table ojjuda_media_internal.config(enabled boolean);
    create table ojjuda_world_private.content_archive(kind text);
    create table public.place_messages(room text);
    alter table public.place_messages enable row level security;
    do $fixture$
    begin
      if to_regclass('cron.job') is null then
        create schema if not exists cron;
        create table cron.job(jobname text);
        execute 'create function cron.unschedule(text) returns boolean language sql as ''select true''';
      end if;
    end;$fixture$;
  `);
  for (const table of [
    'public.game_scores','ojjuda_note.cards','public.house_media_trash','public.diary_likes',
    'public.guestbook','public.intros','public.house_rooms','public.house_friend_groups',
    'public.profile_visits','public.life_schedule_events','public.life_ledger_entries',
    'public.quiz_winners','public.quiz_slots','public.quiz_bank','public.quiz_words',
    'public.creative_comic_pages','public.creative_comics','public.shop_items','public.shop_sets',
    'ojjuda_house_note_internal.queue','ojjuda_media_internal.items','ojjuda_house_admin.review_ack',
    'ojjuda_comics_internal.revisions','ojjuda_world_private.media_cleanup_queue'
  ]) sql(`create table ${table}(fixture_id int); alter table ${table} enable row level security;`);
}

async function main() {
  const { sql, request, success, rest, denied, reload } = setup();
  // Read-only safety checks run before ANY account/schema mutation. A failed run
  // must be discarded and restarted fresh, not bypassed with a reset flag.
  assert.equal(sql('select count(*) from auth.users;'), '0', 'Refusing a runtime with existing Auth users');
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p');"), '0', 'Refusing existing public tables');
  assert.equal(sql("select count(*) from pg_namespace where nspname='fixture_private' or nspname like 'ojjuda_%';"), '0', 'Refusing existing app fixture schemas');
  assert.equal(sql('select count(*) from storage.buckets;'), '0', 'Refusing existing Storage buckets');
  assert.equal(sql('select count(*) from storage.objects;'), '0', 'Refusing existing Storage objects');
  assert.equal(sql("select count(*) from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls);"), '0', 'API roles must not bypass RLS');
  sql('create table public.fixture_ungranted_probe(id int); alter table public.fixture_ungranted_probe enable row level security;');
  assert.equal(sql("select count(*) from (values('anon'),('authenticated'),('service_role')) r(role) where has_table_privilege(role,'public.fixture_ungranted_probe','SELECT,INSERT,UPDATE,DELETE');"), '0', 'Automatic grants are enabled; configure api.auto_expose_new_tables=false in this disposable runtime');
  console.log('PASS: empty disposable runtime and no automatic grants verified');

  const run = crypto.randomBytes(6).toString('hex');
  const actors = {};
  for (const label of ['a', 'b', 'admin', 'minor', 'missing_birth']) {
    const email = `ojjuda-api-${label}-${run}@example.test`;
    const password = `T1!${crypto.randomBytes(24).toString('base64url')}`;
    const created = success(await request('/auth/v1/admin/users', { admin: true, method: 'POST', body: { email, password, email_confirm: true } }), `create synthetic ${label}`);
    const id = created.id || created.user?.id;
    assert.match(id || '', /^[0-9a-f-]{36}$/, 'Auth must return a user UUID');
    const session = success(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), `password sign-in ${label}`);
    assert.ok(session.access_token, 'Auth must issue the access token');
    assert.equal(session.user?.id, id, 'Password session must belong to created user');
    const actor = { id, token: session.access_token };
    const user = success(await request('/auth/v1/user', { actor }), `verify session ${label}`);
    assert.equal(user.id, id, 'Auth validates the issued session');
    actors[label] = actor;
  }
  console.log('PASS: five distinct synthetic users created and signed in through actual Auth');
  appFixtures(sql);
  for (const [label, actor] of Object.entries(actors)) {
    sql(`insert into public.profiles(id,nickname) values('${actor.id}','fixture-${label}');`);
    if (label !== 'missing_birth') sql(`insert into ojjuda_account_internal.member_identity values('${actor.id}',(now() at time zone 'Asia/Seoul')::date-interval '${label === 'minor' ? 18 : 30} years');`);
  }
  const { a, b, admin, minor, missing_birth: missingBirth } = actors;
  sql(`insert into fixture_private.admins values('${admin.id}');`);
  const replay = filename => sql(fs.readFileSync(path.join(migrations, filename), 'utf8'));
  for (const filename of [
    '20261004111608_world_board.sql','20261004131220_life_donflow.sql',
    '20261005123653_photo_ttang_stages.sql','20261006021326_photo_ttang_adult_access.sql',
    '20261006082621_photo_ttang_monthly_ranking.sql','20261007030245_photo_ttang_unlimited_uploads.sql',
    '20261009033125_world_board_comments.sql'
  ]) replay(filename);
  await reload();
  for (const actor of [null, a]) await denied(actor, 'fixture_ungranted_probe?select=id');
  const read = async (actor, resource) => success(await rest(actor, resource), `read ${resource}`);
  const write = async (actor, resource, method, body) => success(await rest(actor, resource, method, body), `${method} ${resource}`);
  const rpc = (actor, name, body) => write(actor, `rpc/${name}`, 'POST', body);
  const payload = { version: 1, tables: { transactions: [], categories: [] } };
  const revision = crypto.randomUUID(), nextRevision = crypto.randomUUID();
  for (const actor of [a, b]) {
    await write(actor, 'life_donflow_snapshots', 'POST', { revision, payload });
    assert.deepEqual(await read(actor, 'life_donflow_snapshots?select=user_id'), [{ user_id: actor.id }]);
  }
  await denied(null, 'life_donflow_snapshots?select=user_id');
  await denied(a, 'life_donflow_snapshots', 'POST', { user_id: admin.id, revision, payload });
  assert.deepEqual(await write(a, `life_donflow_snapshots?user_id=eq.${b.id}`, 'PATCH', { revision: nextRevision }), []);
  assert.equal((await write(a, `life_donflow_snapshots?user_id=eq.${a.id}`, 'PATCH', { revision: nextRevision }))[0].revision, nextRevision);
  await denied(a, `life_donflow_snapshots?user_id=eq.${a.id}`, 'PATCH', { user_id: admin.id });
  await denied(a, 'life_donflow_snapshots', 'DELETE');
  assert.equal(await rpc(a, 'life_donflow_save', { p_expected: nextRevision, p_revision: revision, p_payload: payload }), revision);
  await denied(null, 'rpc/life_donflow_save', 'POST', { p_expected: null, p_revision: revision, p_payload: payload });
  console.log('PASS: DonFlow HTTP explicit grants, ownership isolation, column restrictions and RPC');

  const stageBody = (actor, visibility) => ({ owner: actor.id, image_path: `${actor.id}/${visibility}.jpg`, mask_rle: '1', visibility, status: visibility === 'public' ? 'pending' : 'approved' });
  const stage = async (actor, visibility) => (await write(actor, 'photo_stages', 'POST', stageBody(actor, visibility)))[0];
  const pending = await stage(a, 'public'), privateStage = await stage(a, 'private'), friends = await stage(a, 'friends');
  assert.equal((await read(a, 'photo_stages?select=id')).length, 3);
  assert.deepEqual(await read(b, 'photo_stages?select=id'), []);
  await rpc(admin, 'photo_set_status', { p_id: pending.id, p_status: 'approved' });
  assert.deepEqual(await read(b, 'photo_stages?select=id'), [{ id: pending.id }]);
  await denied(b, 'rpc/photo_set_status', 'POST', { p_id: pending.id, p_status: 'hidden' }, 'P0001');
  await denied(b, 'rpc/photo_set_visibility', 'POST', { p_id: privateStage.id, p_vis: 'public' }, 'P0001');
  await denied(a, `photo_stages?id=eq.${pending.id}`, 'PATCH', { status: 'approved' });
  assert.deepEqual(await write(b, `photo_stages?id=eq.${privateStage.id}`, 'DELETE'), []);
  for (const actor of [null, minor, missingBirth]) {
    assert.deepEqual(await read(actor, 'photo_stages?select=id'), []);
    await denied(actor, 'photo_stages', 'POST', stageBody(actor || a, 'private'));
  }
  for (const actor of [null, a, b]) await denied(actor, 'photo_reports?select=stage_id');
  await denied(a, 'photo_admins', 'POST', { user_id: a.id });
  console.log('PASS: photo HTTP adult/owner/admin gates, anon/minor/missing-identity denial, no direct moderation');

  // Actual Storage upload, authorization, signed URL and byte retrieval.
  // This deliberately tests synthetic object bytes and MIME policy, not JPEG decoding.
  const objectBytes = Buffer.from('ojjuda synthetic local API security fixture\n', 'utf8');
  for (const row of [pending, privateStage, friends]) {
    success(await request(`/storage/v1/object/photo-stages/${row.image_path}`, { actor: a, method: 'POST', body: objectBytes, contentType: 'image/jpeg' }), 'Storage owner upload');
  }
  const sign = (actor, row) => request(`/storage/v1/object/sign/photo-stages/${row.image_path}`, { actor, method: 'POST', body: { expiresIn: 60 } });
  async function storageDenied(response, label) {
    // Storage deliberately masks inaccessible objects as not found on some versions.
    assert.ok([400, 401, 403, 404].includes(response.status), `${label}: expected Storage denial, got HTTP ${response.status}`);
    assert.ok(response.data?.error || response.data?.message || response.data?.code, `${label}: missing structured Storage error`);
  }
  for (const actor of [null, minor, missingBirth]) {
    await storageDenied(await sign(actor, pending), 'Restricted user cannot sign approved photo');
  }
  success(await sign(a, privateStage), 'Owner signs own private photo');
  await storageDenied(await sign(b, privateStage), 'Other adult cannot sign private photo');
  await storageDenied(await sign(b, friends), 'Non-friend cannot sign friends photo');
  const signed = success(await sign(b, pending), 'Adult signs approved public photo');
  const signedPath = signed.signedURL || signed.signedUrl;
  assert.ok(typeof signedPath === 'string' && signedPath.startsWith('/object/sign/'), 'Storage must return a local relative signed path');
  const downloaded = success(await request(`/storage/v1${signedPath}`, { bytes: true }), 'Signed object retrieval');
  assert.deepEqual(downloaded, objectBytes, 'Storage delivers the exact synthetic bytes');
  for (const actor of [minor, missingBirth]) {
    await storageDenied(await request(`/storage/v1/object/photo-stages/${actor.id}/denied.jpg`, { actor, method: 'POST', body: objectBytes, contentType: 'image/jpeg' }), 'Restricted user cannot upload');
  }
  sql(`insert into public.friendships values('${a.id}','${b.id}','accepted');`);
  success(await sign(b, friends), 'Accepted friend signs friends photo');
  assert.deepEqual((await read(b, 'photo_stages?select=id&order=id')).map(row => row.id), [pending.id, friends.id].sort());
  console.log('PASS: actual Storage uploads, signed reads, byte delivery, friend access and restricted/private denials');

  sql(`insert into public.house_posts(id,user_id,body,visibility) values
    ('public-a','${a.id}','public source','all'),('private-a','${a.id}','private source','me');
    insert into public.diaries(id,user_id,title,body,visibility) values('diary-a','${a.id}','title','diary','all');`);
  const comment = (await write(b, 'world_board_comments', 'POST', { post_id: 'public-a', body: 'synthetic comment' }))[0];
  const diaryComment = (await write(a, 'world_board_comments', 'POST', { diary_id: 'diary-a', body: 'synthetic diary comment' }))[0];
  for (const actor of [a, b]) assert.equal((await read(actor, 'world_board_comments?select=id')).length, 2);
  await denied(null, 'world_board_comments?select=id');
  await denied(b, 'world_board_comments', 'POST', { post_id: 'public-a', author_id: a.id, body: 'forged author' });
  await denied(b, 'world_board_comments', 'POST', { post_id: 'private-a', body: 'private source' });
  await denied(a, `world_board_comments?id=eq.${diaryComment.id}`, 'PATCH', { body: 'no direct edits' });
  assert.deepEqual(await write(b, `world_board_comments?id=eq.${diaryComment.id}`, 'DELETE'), []);
  sql(`insert into fixture_private.blocks values('${a.id}','${b.id}');`);
  assert.deepEqual(await read(b, 'world_board_comments?select=id'), []);
  sql('delete from fixture_private.blocks;');
  sql("update public.house_posts set visibility='me' where id='public-a';");
  assert.deepEqual(await read(b, `world_board_comments?id=eq.${comment.id}&select=id`), []);
  sql("update public.house_posts set visibility='all' where id='public-a';");
  assert.equal((await write(a, `world_board_comments?id=eq.${comment.id}`, 'DELETE'))[0].id, comment.id);
  console.log('PASS: board-comment HTTP grants, author/owner rules, blocked users and source visibility');

  retirementFixtures(sql);
  replay('20261020200500_retire_unused_world_data.sql');
  replay('20261021002639_photo_ttang_men_20.sql');
  await reload();
  for (const actor of [a, b]) {
    assert.deepEqual(await read(actor, 'life_donflow_snapshots?select=user_id'), []);
    assert.deepEqual(await read(actor, 'world_board_comments?select=id'), []);
    await denied(actor, 'life_donflow_snapshots', 'POST', { revision, payload });
    await denied(actor, 'life_donflow_snapshots', 'PATCH', { payload });
    await denied(actor, 'life_donflow_snapshots', 'DELETE');
    await denied(actor, 'rpc/life_donflow_save', 'POST', { p_expected: null, p_revision: revision, p_payload: payload });
    await denied(actor, 'world_board_comments', 'POST', { post_id: 'public-a', body: 'retired client' });
    await denied(actor, 'world_board_comments', 'PATCH', { body: 'retired edit' });
    await denied(actor, 'world_board_comments', 'DELETE');
  }
  assert.equal((await rpc(b, 'photo_game_clear', { p_stage: '39' })).ok, true);
  await denied(null, 'rpc/photo_game_clear', 'POST', { p_stage: '39' });
  await denied(minor, 'rpc/photo_game_clear', 'POST', { p_stage: '39' });
  assert.deepEqual((await read(b, 'photo_stages?select=id&order=id')).map(row => row.id), [pending.id, friends.id].sort());
  console.log('PASS: current retirement denials and active photo RPC/reads through PostgREST');
  console.log('COMPLETE: local Auth + PostgREST + Storage only; discard this synthetic runtime. No hosted project or backup restore was tested.');
}

function checkGuards() {
  // Dependency-free: no psql process, API call, account or DB mutation is made.
  for (const [value, kind] of [
    ['https://example.com:54321', 'API'], ['http://localhost:54321', 'API'],
    ['http://0.0.0.0:54321', 'API'], ['http://127.0.0.1:0', 'API'],
    ['http://127.0.0.1:54321/path', 'API'], ['file://127.0.0.1/test', 'API'],
    ['http://user:guard-secret@127.0.0.1:54321', 'API'],
    ['http://127.0.0.1:54321?token=guard-secret', 'API'],
    ['http://127.0.0.1:54321#guard-secret', 'API'],
    ['postgresql://user:pass@example.com:5432/postgres', 'DB'],
    ['postgresql://user:pass@localhost:5432/postgres', 'DB'],
    ['postgresql://user:pass@127.0.0.1/postgres', 'DB'],
    ['postgresql://user:pass@127.0.0.1:5432/postgres?host=guard-secret', 'DB'],
    ['postgresql://user:pass@127.0.0.1:5432/postgres#guard-secret', 'DB']
  ]) assert.throws(() => localUrl(value, kind), error => !error.message.includes('guard-secret'));
  assert.equal(localUrl('http://127.0.0.1:54321', 'API').hostname, '127.0.0.1');
  assert.equal(localUrl('http://[::1]:54321', 'API').hostname, '[::1]');
  assert.equal(localUrl('postgresql://user:pass@[::1]:5432/postgres', 'DB').hostname, '[::1]');
  const original = process.env.OJJUDA_LOCAL_API_TEST;
  try {
    delete process.env.OJJUDA_LOCAL_API_TEST;
    assert.throws(setup, /Refusing to run without OJJUDA_LOCAL_API_TEST=1/);
  } finally {
    if (original === undefined) delete process.env.OJJUDA_LOCAL_API_TEST;
    else process.env.OJJUDA_LOCAL_API_TEST = original;
  }
  console.log('PASS: offline local URL, credential-redaction and explicit-opt-in guards; HTTP suite NOT RUN');
}

if (require.main === module) Promise.resolve().then(() => process.argv.includes('--check-guards') ? checkGuards() : main()).catch(error => {
  // Do not dump sessions, HTTP headers, keys, connection URLs, or raw Auth replies.
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { localUrl, setup, checkGuards };
