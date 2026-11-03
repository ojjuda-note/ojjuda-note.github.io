const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '..');
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter(name => name.endsWith('_member_restaurant_recommendations.sql'));
assert.equal(migrations.length, 1, 'exactly one member restaurant migration must exist');
const migration = path.join('supabase/migrations', migrations[0]);
const sql = file => fs.readFileSync(path.join(root, file), 'utf8');
const bucket = 'restaurant-recommendations';
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const post = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const request = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photo = (owner, id, n) => `${owner}/${id}/30000000-0000-4000-8000-${String(n).padStart(12, '0')}.jpg`;
const a = uid(1), b = uid(2), guest = uid(3), gone = uid(4), banned = uid(5), restricted = uid(6), unprofiled = uid(7);

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function storage.allow_any_operation(ops text[]) returns boolean language sql stable as $$
      select coalesce(regexp_replace(current_setting('storage.operation',true),'^storage[.]','')=any(ops),false)
    $$;
    grant usage on schema auth,storage to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),
      name text,owner uuid,owner_id text,metadata jsonb,archived_at timestamptz,is_delete_marker boolean default false,
      unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
  `);
  await db.exec(sql('tests/account-deletion-fixture.sql'));
  await db.exec(`
    create table public.user_private(user_id uuid primary key references auth.users(id) on delete cascade,banned_until timestamptz);
    create function public.is_banned(u uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
    begin
      if auth.uid() is distinct from u then raise exception 'helper_scope_denied'; end if;
      return exists(select 1 from public.user_private where user_id=u and banned_until>now());
    end; $$;
    -- Deliberately broad legacy policies exercise every new restrictive guard.
    create policy legacy_broad on storage.objects for all to anon,authenticated using(true) with check(true);
  `);
  await db.exec(sql('supabase/migrations/20261005081904_account_deletion_owned_storage_guard.sql'));
  const before = (await db.query(`select proname,proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ojjuda_account_deletion' and proname in ('assert_paths','files') order by proname`)).rows;
  await db.exec(sql(migration));
  assert.deepEqual((await db.query(`select proname,proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ojjuda_account_deletion' and proname in ('assert_paths','files') order by proname`)).rows, before,
  'account-deletion helper grants are preserved');
  for (const id of [a, b, guest, gone, banned, restricted, unprofiled]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    if (id !== unprofiled) await db.query('insert into public.profiles(id,nickname) values($1,$2)', [id, id === a ? '회원A' : '회원B']);
  }
  await db.query('update auth.users set is_anonymous=true where id=$1', [guest]);
  await db.query('update auth.users set deleted_at=now() where id=$1', [gone]);
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [banned]);
  await db.query("insert into public.user_private values($1,now()+interval '1 day')", [restricted]);
  return db;
}

async function asUser(db, id, operation = 'object.get_authenticated', role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('storage.operation',$2,false)", [id || '', operation]);
  await db.exec(`set role ${role}`);
}
async function admin(db, fn) { await db.exec('reset role'); return fn(); }
async function upload(db, owner, id, numbers) {
  await asUser(db, owner, 'object.upload');
  for (const n of numbers) {
    await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
      [bucket, photo(owner, id, n), owner, { mimetype: 'image/jpeg', size: 1200 }]);
  }
  return numbers.map(n => photo(owner, id, n));
}
function payload(owner = a, id = post(1), numbers = [1, 2, 3], revision = 1) {
  return { id, request_id: request(revision), name: '테스트식당', category: '한식', region: '대전',
    address: '대전광역시 중구 테스트로 12', menu: '추천 국수', reason: '직접 먹어 보니 추천하고 싶어요.',
    photos: numbers.map(n => photo(owner, id, n)), expected_updated_at: null };
}
async function save(db, p) {
  const { rows } = await db.query(`select public.save_restaurant_recommendation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result`,
    [p.id, p.request_id, p.name, p.category, p.region, p.address, p.menu, p.reason, p.photos, p.expected_updated_at]);
  return rows[0].result;
}
async function detail(db, id) { return (await db.query('select public.get_restaurant_recommendation($1) as result', [id])).rows[0].result; }
async function list(db, { q = '', category = null, region = null, mine = false, offset = 0, limit = 20 } = {}) {
  return (await db.query('select public.list_restaurant_recommendations($1,$2,$3,$4,$5,$6) as result', [q, category, region, mine, offset, limit])).rows[0].result;
}
async function removePost(db, id, version) {
  return (await db.query('select public.delete_restaurant_recommendation($1,$2) as result', [id, version])).rows[0].result;
}
async function readable(db, names) {
  return (await db.query('select name from storage.objects where bucket_id=$1 and name=any($2) order by name', [bucket, names])).rows.map(r => r.name);
}

(async () => {
  const db = await setup();
  try {
    const config = (await db.query('select public,file_size_limit,allowed_mime_types from storage.buckets where id=$1', [bucket])).rows[0];
    assert.deepEqual(config, { public: false, file_size_limit: 5242880, allowed_mime_types: ['image/jpeg'] });
    const tables = (await db.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='ojjuda_restaurants_internal' and c.relkind='r' order by c.relname`)).rows;
    assert.equal(tables.length, 2); assert.ok(tables.every(t => t.relrowsecurity));
    assert.equal((await db.query("select has_table_privilege('authenticated','ojjuda_restaurants_internal.recommendations','INSERT') as allowed")).rows[0].allowed, false);

    await asUser(db, null, 'object.get_authenticated', 'anon');
    await assert.rejects(() => list(db), /permission denied/);
    await assert.rejects(() => save(db, payload()), /permission denied/);
    for (const id of [null, guest, gone, banned, restricted, unprofiled, uid(999)]) {
      await asUser(db, id);
      await assert.rejects(() => list(db), /sign_in_required|member_unavailable/);
      await assert.rejects(() => save(db, payload(id || a)), /sign_in_required|member_unavailable/);
    }

    const p = payload();
    await upload(db, a, p.id, [1, 2, 3]);
    await asUser(db, a);
    assert.deepEqual(await readable(db, p.photos), p.photos, 'owner can inspect own uncommitted photos');
    await asUser(db, b);
    assert.deepEqual(await readable(db, p.photos), [], 'another member cannot view draft photos');
    await asUser(db, null, 'object.get_authenticated', 'anon');
    assert.deepEqual(await readable(db, p.photos), [], 'broad legacy policy does not allow anonymous photo reads');
    await asUser(db, a, 'object.sign');
    assert.deepEqual(await readable(db, p.photos), [], 'signed bearer URLs are blocked');
    await asUser(db, a, 'object.list');
    assert.deepEqual(await readable(db, p.photos), [], 'bucket listing is not a member gallery');

    await asUser(db, a);
    for (const photos of [[], p.photos.slice(0, 2), Array(10).fill(p.photos[0])]) {
      await assert.rejects(() => save(db, { ...p, photos }), /recommendation_photos_required/);
    }
    for (const photos of [[p.photos[0], p.photos[0], p.photos[1]], [null, ...p.photos.slice(1)],
      [photo(b, p.id, 1), ...p.photos.slice(1)], [photo(a, post(99), 1), ...p.photos.slice(1)],
      [p.photos[0] + '/..', ...p.photos.slice(1)]]) {
      await assert.rejects(() => save(db, { ...p, photos }), /recommendation_photo_invalid/);
    }
    for (const bad of [{ name: ' '.repeat(4) }, { name: '가'.repeat(81) }, { address: '짧음' },
      { address: '가'.repeat(201) }, { menu: '' }, { menu: '가'.repeat(161) }, { reason: '짧음' },
      { reason: '가'.repeat(1001) }, { category: '인증맛집' }, { region: '없는지역' }, { request_id: null }]) {
      await assert.rejects(() => save(db, { ...p, ...bad }), /recommendation_invalid_input/);
    }
    assert.equal((await list(db)).total, 0, 'failed submissions never publish a partial post');
    const created = await save(db, p);
    assert.equal(created.item.author_name, '회원A');
    assert.equal(created.item.is_owner, true); assert.equal(created.item.request_id, p.request_id);
    assert.deepEqual(created.item.photos, p.photos); assert.deepEqual(created.removed_paths, []);
    assert.deepEqual(await save(db, p), created, 'same request and payload are an idempotent retry');
    await assert.rejects(() => save(db, { ...p, name: '바뀐내용' }), /recommendation_request_conflict/);
    await assert.rejects(() => save(db, { ...p, request_id: request(2) }), /recommendation_conflict/);
    await assert.rejects(() => db.query('update ojjuda_restaurants_internal.recommendations set owner_id=$1', [b]), /permission denied/);
    await assert.rejects(() => db.query('select * from ojjuda_restaurants_internal.recommendations'), /permission denied/);

    await asUser(db, b);
    const readByB = await detail(db, p.id);
    assert.equal(readByB.is_owner, false); assert.equal(readByB.request_id, null);
    assert.deepEqual(Object.keys(readByB).sort(), ['address','author_name','category','created_at','id','is_owner','menu','name','owner_id','photos','reason','region','request_id','updated_at'].sort());
    assert.deepEqual(await readable(db, p.photos), p.photos, 'published photos are readable by other active members');
    await assert.rejects(() => save(db, { ...payload(b), expected_updated_at: created.item.updated_at }), /recommendation_not_owner/);
    await assert.rejects(() => removePost(db, p.id, created.item.updated_at), /recommendation_not_owner/);
    await asUser(db, b, 'object.delete');
    assert.equal((await db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning name', [bucket, p.photos[0]])).rows.length, 0);
    await asUser(db, a, 'object.delete');
    assert.equal((await db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning name', [bucket, p.photos[0]])).rows.length, 0, 'even owner cannot delete a referenced photo');
    await asUser(db, a, 'object.get_authenticated');
    assert.equal((await db.query("update storage.objects set metadata='{}' where bucket_id=$1 returning name", [bucket])).rows.length, 0, 'no overwrite/move through a broad legacy UPDATE policy');
    await asUser(db, a, 'object.upload');
    for (const name of [photo(b, post(8), 8), a + '/bad/photo.jpg', a + '/' + p.id + '/../photo.jpg']) {
      await assert.rejects(() => db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)', [bucket, name, a]), /row-level security/);
    }

    // Missing, forged, wrong-format and inactive Storage metadata cannot publish.
    const partial = payload(a, post(2), [1, 2, 3], 20);
    await upload(db, a, partial.id, [1, 2]);
    await asUser(db, a);
    await assert.rejects(() => save(db, partial), /recommendation_photo_invalid/);
    assert.equal(await detail(db, partial.id), null);
    const malformed = [
      { owner_id: b, metadata: { mimetype: 'image/jpeg', size: 100 } },
      { owner_id: a, metadata: { mimetype: 'image/png', size: 100 } },
      { owner_id: a, metadata: { mimetype: 'image/jpeg', size: 0 } },
      { owner_id: a, metadata: { mimetype: 'image/jpeg', size: 5242881 } },
      { owner_id: a, metadata: { mimetype: 'image/jpeg', size: '100' } },
      { owner_id: a, metadata: { mimetype: 'image/jpeg' } },
      { owner_id: a, metadata: { mimetype: 'image/jpeg', size: 100 }, marker: true },
      { owner_id: a, metadata: { mimetype: 'image/jpeg', size: 100 }, archived: '2026-01-01' },
    ];
    for (const bad of malformed) {
      await admin(db, () => db.query(`insert into storage.objects(bucket_id,name,owner_id,metadata,is_delete_marker,archived_at)
        values($1,$2,$3,$4,$5,$6) on conflict(bucket_id,name) do update set owner_id=excluded.owner_id,
        metadata=excluded.metadata,is_delete_marker=excluded.is_delete_marker,archived_at=excluded.archived_at`,
      [bucket, partial.photos[2], bad.owner_id, bad.metadata, Boolean(bad.marker), bad.archived || null]));
      await asUser(db, a);
      await assert.rejects(() => save(db, partial), /recommendation_photo_invalid/);
    }
    await admin(db, () => db.query('delete from storage.objects where bucket_id=$1 and name=$2', [bucket, partial.photos[2]]));
    await upload(db, a, partial.id, [3]);
    await asUser(db, a); await save(db, partial);

    // Atomic replacement keeps the old post intact on rejection and releases only removed paths.
    await upload(db, a, p.id, [4]);
    await asUser(db, a);
    const updatedPayload = { ...p, request_id: request(3), photos: [p.photos[1], p.photos[2], photo(a, p.id, 4)], expected_updated_at: created.item.updated_at };
    await assert.rejects(() => save(db, { ...updatedPayload, photos: updatedPayload.photos.slice(0, 2) }), /recommendation_photos_required/);
    assert.deepEqual((await detail(db, p.id)).photos, p.photos);
    const updated = await save(db, updatedPayload);
    assert.deepEqual(updated.removed_paths, [p.photos[0]]);
    assert.notEqual(updated.item.updated_at, created.item.updated_at);
    assert.deepEqual(await save(db, updatedPayload), updated, 'update retry preserves its original cleanup result');
    await assert.rejects(() => save(db, { ...updatedPayload, request_id: request(4) }), /recommendation_conflict/);
    await asUser(db, b); assert.deepEqual(await readable(db, [p.photos[0]]), []);
    await asUser(db, a, 'object.delete');
    assert.deepEqual((await db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning name', [bucket, p.photos[0]])).rows, [{ name: p.photos[0] }]);

    const other = { ...payload(b, post(3), [1, 2, 3], 30), name: '바다카페', category: '디저트', region: '부산', address: '부산광역시 중구 바다로 123', menu: '케이크' };
    await upload(db, b, other.id, [1, 2, 3]); await asUser(db, b); await save(db, other);
    const maximum = payload(b, post(4), [1,2,3,4,5,6,7,8,9], 40);
    await upload(db, b, maximum.id, [1,2,3,4,5,6,7,8,9]); await asUser(db, b); await save(db, maximum);
    const page = await list(db, { limit: 1 }); assert.equal(page.rows.length, 1); assert.equal(page.total, 4);
    assert.equal((await list(db, { mine: true })).total, 2);
    assert.equal((await list(db, { category: '디저트', region: '부산', q: '케이크' })).rows[0].id, other.id);
    assert.equal((await list(db, { category: '디저트', region: '대전' })).total, 0);
    assert.equal((await list(db, { q: '%' })).total, 0, 'search treats wildcard characters as literal text');
    await assert.rejects(() => list(db, { limit: 51 }), /recommendation_invalid_input/);
    await assert.rejects(() => list(db, { offset: -1 }), /recommendation_invalid_input/);

    await asUser(db, a);
    await assert.rejects(() => removePost(db, p.id, created.item.updated_at), /recommendation_conflict/);
    const deleted = await removePost(db, p.id, updated.item.updated_at);
    assert.deepEqual(deleted.removed_paths, updated.item.photos); assert.equal(await detail(db, p.id), null);
    assert.deepEqual(await removePost(db, p.id, updated.item.updated_at), deleted, 'delete retry returns the same cleanup paths');
    await assert.rejects(() => save(db, updatedPayload), /recommendation_not_found/, 'delayed writes do not resurrect deleted posts');
    await asUser(db, a, 'object.delete');
    assert.equal((await db.query('delete from storage.objects where bucket_id=$1 and name=any($2) returning name', [bucket, deleted.removed_paths])).rows.length, 3);

    // Existing withdrawal flow accepts this bucket, hides the post first, drains
    // only its owner's objects and then cascades both recommendation tables.
    await asUser(db, a);
    await db.query('select public.prepare_my_account_deletion($1)', [a]);
    await assert.rejects(() => list(db), /member_unavailable/);
    await assert.rejects(() => save(db, partial), /member_unavailable/);
    await asUser(db, a, 'object.upload');
    await assert.rejects(() => db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)', [bucket, photo(a, post(9), 1), a]), /row-level security/);
    await asUser(db, b);
    assert.equal(await detail(db, partial.id), null, 'pending author is hidden without cross-member pending() helper calls');
    assert.deepEqual(await readable(db, partial.photos), []);
    await asUser(db, a);
    const pendingFiles = (await db.query('select * from public.my_account_deletion_files($1,100)', [a])).rows;
    assert.equal(pendingFiles.length, 3); assert.ok(pendingFiles.every(r => r.bucket_id === bucket && r.photo_path.startsWith(a + '/')));
    await asUser(db, a, 'object.delete_many');
    assert.equal((await db.query('delete from storage.objects where bucket_id=$1 returning name', [bucket])).rows.length, 3,
      'withdrawal can delete referenced own photos but never another member’s photos');
    await db.query('select public.delete_my_account($1)', [a]);
    await admin(db, async () => {
      assert.equal((await db.query('select * from ojjuda_restaurants_internal.recommendations where owner_id=$1', [a])).rows.length, 0);
      assert.equal((await db.query('select * from ojjuda_restaurants_internal.deleted_recommendations where owner_id=$1', [a])).rows.length, 0);
      assert.equal((await db.query('select count(*)::int n from storage.objects where bucket_id=$1', [bucket])).rows[0].n, 12);
      const paths = await db.query(`select proname,provolatile,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='ojjuda_restaurants_internal' and proname in ('save_item','delete_item','photo_delete_allowed')`);
      assert.ok(paths.rows.every(r => r.provolatile === 'v' && r.proconfig.includes('search_path=pg_catalog')));
    });
    console.log('PASS: member-only RPCs; strict 3–9 owned Storage JPEGs; atomic publication/replacement; input bounds; ownership; idempotency/version conflicts; private draft/session-only photo access; immutable referenced files; filters/pagination; account-withdrawal cleanup/cascades; restrictive guards against broad legacy policies.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
