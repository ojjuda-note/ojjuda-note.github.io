const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '..');
const sql = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = suffix => {
  const matches = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith(suffix));
  assert.equal(matches.length, 1, `exactly one ${suffix} migration must exist`);
  return path.join('supabase/migrations', matches[0]);
};
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const postId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const requestId = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photoPath = (owner, id, n) => `${owner}/${id}/30000000-0000-4000-8000-${String(n).padStart(12, '0')}.jpg`;
const a = uid(1), b = uid(2), guest = uid(3), gone = uid(4), banned = uid(5), restricted = uid(6), unprofiled = uid(7);
const omitted = Symbol('omitted location');
const pointA = { latitude: 37.52535, longitude: 127.04426 };
const pointB = { latitude: 35.1795543, longitude: 129.0756416 };
const emptyPoint = { latitude: null, longitude: null };

async function asUser(db, id, role = 'authenticated', operation = 'object.get_authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('storage.operation',$2,false)", [id || '', operation]);
  await db.exec(`set role ${role}`);
}
function payload(owner = a, id = postId(1), revision = 1, numbers = [1, 2]) {
  return { id, request_id: requestId(revision), name: '회원 추천 국수집', category: '한식', region: '대전',
    address: '대전광역시 중구 테스트로 12', menu: '추천 국수', reason: '직접 먹어 보니 추천하고 싶어요.',
    photos: numbers.map(n => photoPath(owner, id, n)), expected_updated_at: null };
}
const parameters = p => [p.id, p.request_id, p.name, p.category, p.region, p.address, p.menu, p.reason, p.photos, p.expected_updated_at];
const detail = async (db, id) => (await db.query('select public.get_restaurant_recommendation($1) as result', [id])).rows[0].result;
const list = async db => (await db.query('select public.list_restaurant_recommendations() as result')).rows[0].result;
const legacySave = async (db, p) => (await db.query('select public.save_restaurant_recommendation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result', parameters(p))).rows[0].result;
async function save(db, p, location = omitted) {
  const values = parameters(p);
  if (location !== omitted) values.push(location === null ? null : JSON.stringify(location));
  return (await db.query(`select public.save_restaurant_recommendation_with_location($1,$2,$3,$4,$5,$6,$7,$8,$9,$10${location === omitted ? '' : ',$11::jsonb'}) as result`, values)).rows[0].result;
}
const saveRawLocation = async (db, p, raw) => (await db.query('select public.save_restaurant_recommendation_with_location($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) as result', [...parameters(p), raw])).rows[0].result;
async function upload(db, owner, id, numbers) {
  await asUser(db, owner, 'authenticated', 'object.upload');
  for (const number of numbers) await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
    ['restaurant-recommendations', photoPath(owner, id, number), owner, { mimetype: 'image/jpeg', size: 1200 }]);
}
const point = row => ({ latitude: row.latitude, longitude: row.longitude });
const newRevision = (p, saved, number, changes = {}) => ({ ...p, request_id: requestId(number), expected_updated_at: saved.item.updated_at, ...changes });

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
      name text,owner uuid,owner_id text,metadata jsonb,archived_at timestamptz,is_delete_marker boolean default false,unique(bucket_id,name));
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
  `);
  await db.exec(sql('supabase/migrations/20261005081904_account_deletion_owned_storage_guard.sql'));
  await db.exec(sql(migration('_member_restaurant_recommendations.sql')));
  await db.exec(sql(migration('_member_restaurant_photo_limits.sql')));
  await db.exec(sql(migration('_restaurant_member_ratings.sql')));
  for (const id of [a, b, guest, gone, banned, restricted, unprofiled]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    if (id !== unprofiled) await db.query('insert into public.profiles(id,nickname) values($1,$2)', [id, `회원 ${id.slice(-1)}`]);
  }
  await db.query('update auth.users set is_anonymous=true where id=$1', [guest]);
  await db.query('update auth.users set deleted_at=now() where id=$1', [gone]);
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [banned]);
  await db.query("insert into public.user_private values($1,now()+interval '1 day')", [restricted]);
  return db;
}

(async () => {
  const db = await setup();
  try {
    // Upgrade a published legacy post while preserving all original function ACLs
    // and the exact content/photo save implementation.
    const legacy = payload(a, postId(90), 900, [1]);
    await upload(db, a, legacy.id, [1]);
    const legacySaved = await legacySave(db, legacy);
    await db.exec('reset role');
    const security = async () => (await db.query(`select p.oid::regprocedure::text as signature,p.proowner,p.proacl::text,p.prosecdef,p.provolatile,p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='ojjuda_restaurants_internal' or (n.nspname='public' and p.proname like '%restaurant%') order by signature`)).rows;
    const beforeSecurity = await security();
    const coreBody = (await db.query("select prosrc from pg_proc where oid='ojjuda_restaurants_internal.save_item(uuid,uuid,text,text,text,text,text,text,text[],timestamptz)'::regprocedure")).rows[0].prosrc;
    await db.exec(sql(migration('_member_restaurant_location.sql')));
    const afterSecurity = new Map((await security()).map(fn => [fn.signature, fn]));
    assert.deepEqual(beforeSecurity.map(fn => afterSecurity.get(fn.signature)), beforeSecurity, 'upgrade preserves every existing function privilege and security mode');
    assert.equal((await db.query("select prosrc from pg_proc where oid='ojjuda_restaurants_internal.save_item(uuid,uuid,text,text,text,text,text,text,text[],timestamptz)'::regprocedure")).rows[0].prosrc, coreBody, 'the original content/photo save was not rewritten');
    const signatures = (await db.query(`select p.proname,p.pronargs,p.pronargdefaults,p.prosecdef,p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('save_restaurant_recommendation','save_restaurant_recommendation_with_location') order by p.proname`)).rows;
    assert.equal(signatures.length, 2, 'one unambiguous signature exists for each RPC name');
    assert.deepEqual(signatures.map(fn => [fn.pronargs, fn.pronargdefaults]), [[10, 1], [11, 2]]);
    assert.ok(signatures.every(fn => !fn.prosecdef && fn.proconfig.includes('search_path=pg_catalog')));
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query("select has_table_privilege($1,'ojjuda_restaurants_internal.recommendations','UPDATE') as allowed", [role])).rows[0].allowed, false);
      assert.equal((await db.query("select has_function_privilege($1,'public.save_restaurant_recommendation_with_location(uuid,uuid,text,text,text,text,text,text,text[],timestamptz,jsonb)','EXECUTE') as allowed", [role])).rows[0].allowed, role === 'authenticated');
    }
    await asUser(db, a);
    assert.deepEqual(await detail(db, legacy.id), { ...legacySaved.item, ...emptyPoint }, 'legacy content, timestamps and identifiers survive the migration unchanged');
    assert.deepEqual((await legacySave(db, legacy)).item, { ...legacySaved.item, ...emptyPoint }, 'old cached RPC retries still work after the upgrade');

    const p = payload();
    await upload(db, a, p.id, [1, 2]);
    await asUser(db, null, 'anon');
    await assert.rejects(() => save(db, p, pointA), /permission denied/);
    for (const id of [null, guest, gone, banned, restricted, unprofiled]) {
      await asUser(db, id);
      await assert.rejects(() => save(db, p, pointA), /sign_in_required|member_unavailable/);
    }
    await asUser(db, a);
    for (const invalid of [[], '37,127', 37, false, {}, { latitude: 37 }, { longitude: 127 },
      { latitude: null, longitude: 127 }, { latitude: 37, longitude: null },
      { latitude: '37', longitude: 127 }, { latitude: 37, longitude: '127' },
      { latitude: true, longitude: 127 }, { latitude: 91, longitude: 127 },
      { latitude: -91, longitude: 127 }, { latitude: 37, longitude: 181 },
      { latitude: 37, longitude: -181 }, { ...pointA, unexpected: true },
      { latitude: 'NaN', longitude: 'Infinity' }]) {
      await assert.rejects(() => save(db, p, invalid), /recommendation_location_invalid/);
    }
    await assert.rejects(() => saveRawLocation(db, p, 'null'), /recommendation_location_invalid/);
    await assert.rejects(() => saveRawLocation(db, p, '{"latitude":90.00000000000000001,"longitude":127}'), /recommendation_location_invalid/);
    await assert.rejects(() => saveRawLocation(db, p, '{"latitude":1e1000,"longitude":127}'), /recommendation_location_invalid/);
    await assert.rejects(() => save(db, { ...p, id: null }, pointA), /recommendation_invalid_input/);
    await assert.rejects(() => save(db, { ...p, request_id: null }, pointA), /recommendation_invalid_input/);
    await assert.rejects(() => save(db, { ...p, name: '' }, pointA), /recommendation_invalid_input/);
    await assert.rejects(() => save(db, { ...p, photos: [photoPath(a, p.id, 99)] }, pointA), /recommendation_photo_invalid/);
    assert.equal(await detail(db, p.id), null, 'location/content/photo validation never leaves a partial post');

    const created = await save(db, p, pointA);
    assert.deepEqual(point(created.item), pointA);
    assert.deepEqual(created.removed_paths, []);
    assert.deepEqual(await detail(db, p.id), created.item);
    assert.deepEqual((await list(db)).rows.find(row => row.id === p.id), created.item, 'list/detail/save expose the same persisted coordinate pair');
    await db.exec('reset role');
    const rowBeforeRetry = (await db.query('select xmin::text,updated_at,last_request_id,latitude,longitude from ojjuda_restaurants_internal.recommendations where id=$1', [p.id])).rows[0];
    await asUser(db, a);
    assert.deepEqual(await save(db, p, pointA), created);
    assert.deepEqual(await save(db, p), created, 'omitting location on an otherwise identical retry preserves it');
    assert.deepEqual(await legacySave(db, p), created, 'legacy retry cannot erase a newly selected position');
    await assert.rejects(() => save(db, p, pointB), /recommendation_request_conflict/);
    await assert.rejects(() => save(db, p, emptyPoint), /recommendation_request_conflict/);
    await assert.rejects(() => save(db, { ...p, name: '다른 가게 이름' }, pointA), /recommendation_request_conflict/);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select xmin::text,updated_at,last_request_id,latitude,longitude from ojjuda_restaurants_internal.recommendations where id=$1', [p.id])).rows[0], rowBeforeRetry, 'retries and conflicts do not issue a coordinate update');
    await asUser(db, b);
    await assert.rejects(() => save(db, p, pointB), /recommendation_not_owner/);
    await assert.rejects(() => db.query('update ojjuda_restaurants_internal.recommendations set latitude=37,longitude=127 where id=$1', [p.id]), /permission denied/);

    // A coordinate-only second UPDATE must retain the exact version generated by
    // the content save. An audit trigger observes both actual writes in this test.
    await db.exec('reset role');
    await db.exec(`create table public.fixture_location_versions(post_id uuid,before_version timestamptz,after_version timestamptz);
      create function public.fixture_location_audit() returns trigger language plpgsql set search_path=pg_catalog as $$begin
        insert into public.fixture_location_versions values(new.id,old.updated_at,new.updated_at); return new;
      end;$$;
      create trigger fixture_location_audit after update on ojjuda_restaurants_internal.recommendations
      for each row execute function public.fixture_location_audit();`);
    await asUser(db, a);
    const editedPayload = newRevision(p, created, 2, { name: '수정한 국수집', photos: [p.photos[1]] });
    const edited = await save(db, editedPayload, pointB);
    assert.deepEqual(point(edited.item), pointB);
    assert.deepEqual(edited.removed_paths, [p.photos[0]]);
    assert.notEqual(edited.item.updated_at, created.item.updated_at);
    assert.deepEqual(await save(db, editedPayload, pointB), edited, 'update retry retains the original omitted-photo cleanup result');
    await assert.rejects(() => save(db, newRevision(editedPayload, created, 3), pointA), /recommendation_conflict/);
    assert.deepEqual(await detail(db, p.id), edited.item, 'a stale edit cannot replace either body or coordinates');
    await db.exec('reset role');
    const versions = (await db.query('select before_version::text as before_version,after_version::text as after_version from public.fixture_location_versions where post_id=$1', [p.id])).rows;
    assert.equal(versions.length, 2, 'one content write and one coordinate write; retries add none');
    assert.equal(versions.filter(row => row.before_version !== row.after_version).length, 1);
    assert.equal(versions[0].after_version, versions[1].after_version, 'both writes use exactly the core-generated version');
    await db.exec('drop trigger fixture_location_audit on ojjuda_restaurants_internal.recommendations; drop function public.fixture_location_audit(); drop table public.fixture_location_versions;');

    await asUser(db, a);
    const oldClientPayload = newRevision(editedPayload, edited, 4, { address: '부산광역시 중구 새주소로 12' });
    const oldClientEdit = await legacySave(db, oldClientPayload);
    assert.deepEqual(point(oldClientEdit.item), pointB, 'old clients preserve a selected location even when editing address text');
    const omittedPayload = newRevision(oldClientPayload, oldClientEdit, 5, { menu: '새 추천 메뉴' });
    const omittedEdit = await save(db, omittedPayload);
    assert.deepEqual(point(omittedEdit.item), pointB);
    const nullPayload = newRevision(omittedPayload, omittedEdit, 6, { reason: '다시 가 보아도 추천하고 싶어요.' });
    const nullEdit = await save(db, nullPayload, null);
    assert.deepEqual(point(nullEdit.item), pointB, 'SQL NULL also preserves the existing pair');
    const clearPayload = newRevision(nullPayload, nullEdit, 7);
    const cleared = await save(db, clearPayload, emptyPoint);
    assert.deepEqual(point(cleared.item), emptyPoint);
    assert.deepEqual(await save(db, clearPayload, emptyPoint), cleared);
    await assert.rejects(() => save(db, clearPayload, pointB), /recommendation_request_conflict/);
    const locationOnlyPayload = newRevision(clearPayload, cleared, 8);
    const restored = await save(db, locationOnlyPayload, pointA);
    assert.deepEqual(point(restored.item), pointA);
    assert.notEqual(restored.item.updated_at, cleared.item.updated_at, 'changing only the selected location advances the normal edit version');
    const boundaryPayload = newRevision(locationOnlyPayload, restored, 9);
    const boundary = await save(db, boundaryPayload, { latitude: 90, longitude: -180 });
    assert.deepEqual(point(boundary.item), { latitude: 90, longitude: -180 });
    const secondBoundaryPayload = newRevision(boundaryPayload, boundary, 10);
    const secondBoundary = await save(db, secondBoundaryPayload, { latitude: -90, longitude: 180 });
    assert.deepEqual(point(secondBoundary.item), { latitude: -90, longitude: 180 });

    await db.exec('reset role');
    for (const [latitude, longitude] of [[null, 127], [37, null], [91, 127], [37, 181], ['NaN', 127], [37, 'Infinity']]) {
      await assert.rejects(() => db.query('update ojjuda_restaurants_internal.recommendations set latitude=$1,longitude=$2 where id=$3', [latitude, longitude, p.id]), /restaurant_recommendation_location_pair/);
    }
    // Force failure after the original content save has executed. The enclosing
    // RPC must roll back the body, request/version and photo-reference changes.
    await db.exec(`create function public.fixture_location_failure() returns trigger language plpgsql set search_path=pg_catalog as $$begin
      raise exception 'fixture_location_write_failed';
    end;$$;
    create trigger fixture_location_failure before update of latitude,longitude on ojjuda_restaurants_internal.recommendations
    for each row execute function public.fixture_location_failure();`);
    await asUser(db, a);
    const failedEdit = newRevision(secondBoundaryPayload, secondBoundary, 11, { name: '롤백되어야 하는 변경', photos: p.photos });
    await assert.rejects(() => save(db, failedEdit, pointB), /fixture_location_write_failed/);
    assert.deepEqual(await detail(db, p.id), secondBoundary.item, 'coordinate-write failure atomically rolls back a completed core edit');
    const failedCreate = payload(a, postId(2), 20, [1]);
    await upload(db, a, failedCreate.id, [1]);
    await assert.rejects(() => save(db, failedCreate, pointA), /fixture_location_write_failed/);
    assert.equal(await detail(db, failedCreate.id), null, 'coordinate-write failure also rolls back a new post');
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from storage.objects where name=any($1)', [failedCreate.photos])).rows[0].n, 1, 'uploaded draft photos remain available for a safe retry');
    await db.exec('drop trigger fixture_location_failure on ojjuda_restaurants_internal.recommendations; drop function public.fixture_location_failure();');
    await asUser(db, a);
    const retriedCreate = await save(db, failedCreate, pointA);
    assert.deepEqual(point(retriedCreate.item), pointA, 'the original request can be retried after its whole transaction rolled back');
    await db.query('select public.prepare_my_account_deletion($1)', [a]);
    await assert.rejects(() => save(db, newRevision(failedCreate, retriedCreate, 21), pointB), /member_unavailable/);
    await asUser(db, b);
    assert.equal(await detail(db, failedCreate.id), null, 'pending-author posts remain hidden with coordinates');
    await db.exec('reset role');
    await db.query('delete from ojjuda_account_deletion.requests where user_id=$1', [a]);
    await asUser(db, a);
    await db.query('select public.delete_restaurant_recommendation($1,$2)', [p.id, secondBoundary.item.updated_at]);
    await assert.rejects(() => save(db, secondBoundaryPayload, pointA), /recommendation_not_found/);
    assert.equal(await detail(db, p.id), null);
    console.log('PASS: migration/legacy RPC compatibility; exact nullable coordinate pairs; list/detail/save persistence; member/owner permissions; core save unchanged; atomic body/photo/location rollback; same-request coordinate conflicts and no-op retries; original cleanup/version behavior; stale edits; explicit clearing; legacy/omitted/SQL-NULL preservation; pending/deleted post protection.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
