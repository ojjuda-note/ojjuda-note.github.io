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
const a = uid(1), b = uid(2), guest = uid(3), gone = uid(4), banned = uid(5), restricted = uid(6), unprofiled = uid(7), quota = uid(8), withdrawing = uid(9);
const scoreValues = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

async function asUser(db, id, role = 'authenticated', operation = 'object.get_authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('storage.operation',$2,false)", [id || '', operation]);
  await db.exec(`set role ${role}`);
}
const summaries = async (db, kind, ids) => (await db.query('select public.get_restaurant_rating_summaries($1,$2) as result', [kind, ids])).rows[0].result;
const setScore = async (db, kind, id, score) => (await db.query('select public.set_restaurant_rating($1,$2,$3) as result', [kind, id, score])).rows[0].result;
const noScore = id => ({ id, average: null, count: 0, my_rating: null });

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
  for (const id of [a, b, guest, gone, banned, restricted, unprofiled, quota, withdrawing]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    if (id !== unprofiled) await db.query('insert into public.profiles(id,nickname) values($1,$2)', [id, `회원 ${id.slice(-1)}`]);
  }
  await db.query('update auth.users set is_anonymous=true where id=$1', [guest]);
  await db.query('update auth.users set deleted_at=now() where id=$1', [gone]);
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [banned]);
  await db.query("insert into public.user_private values($1,now()+interval '1 day')", [restricted]);
  return db;
}

async function recommend(db, owner, number) {
  const id = postId(number), photo = `${owner}/${id}/30000000-0000-4000-8000-000000000001.jpg`;
  await asUser(db, owner, 'authenticated', 'object.upload');
  await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
    ['restaurant-recommendations', photo, owner, { mimetype: 'image/jpeg', size: 1200 }]);
  return (await db.query('select public.save_restaurant_recommendation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',
    [id, `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`, '회원 추천 국수집', '한식', '대전',
      '대전광역시 중구 테스트로 12', '추천 국수', '직접 먹어 보니 추천하고 싶어요.', [photo], null])).rows[0].result.item;
}

(async () => {
  const db = await setup();
  try {
    // Security is verified using the same authenticated/anonymous roles as RPCs.
    const table = (await db.query(`select relrowsecurity from pg_class where oid='ojjuda_restaurants_internal.ratings'::regclass`)).rows[0];
    assert.equal(table.relrowsecurity, true);
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal((await db.query("select has_table_privilege($1,'ojjuda_restaurants_internal.ratings',$2) as allowed", [role, privilege])).rows[0].allowed, false);
      }
    }
    const functions = (await db.query(`select n.nspname,p.proname,p.prosecdef,p.provolatile,p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='public' and p.proname in ('get_restaurant_rating_summaries','set_restaurant_rating'))
       or (n.nspname='ojjuda_restaurants_internal' and p.proname in ('rating_summaries','set_rating'))`)).rows;
    assert.equal(functions.length, 4);
    for (const fn of functions) {
      assert.equal(fn.prosecdef, fn.nspname !== 'public');
      assert.ok(fn.proconfig.includes('search_path=pg_catalog'));
      assert.equal(fn.provolatile, fn.proname.startsWith('set_') ? 'v' : 's');
    }
    await asUser(db, null, 'anon');
    await assert.rejects(() => summaries(db, 'certified', ['mingles']), /permission denied/);
    await assert.rejects(() => setScore(db, 'certified', 'mingles', 4), /permission denied/);
    for (const id of [null, guest, gone, banned, restricted, unprofiled]) {
      await asUser(db, id);
      await assert.rejects(() => summaries(db, 'certified', ['mingles']), /sign_in_required|member_unavailable/);
      await assert.rejects(() => setScore(db, 'certified', 'mingles', 4), /sign_in_required|member_unavailable/);
    }

    await asUser(db, a);
    assert.deepEqual(await summaries(db, 'certified', []), []);
    assert.deepEqual(await summaries(db, 'certified', ['mingles']), [noScore('mingles')]);
    for (const [index, score] of scoreValues.entries()) {
      const id = `score-${index}`;
      assert.deepEqual(await setScore(db, 'certified', id, score), { id, average: score, count: 1, my_rating: score });
    }
    for (const score of [-1, 0, 0.5, 1.25, 5.5, 6, null, 'NaN', 'Infinity', '-Infinity', '1.000001']) {
      await assert.rejects(() => setScore(db, 'certified', 'invalid-score', score), /restaurant_rating_invalid_input/);
    }
    assert.deepEqual(await summaries(db, 'certified', ['invalid-score']), [noScore('invalid-score')]);
    for (const id of [null, '', ' ', 'UPPERCASE', '../mingles', 'mingles/other', 'mingles?score=5', 'a--b', '-mingles', 'mingles-', 'a'.repeat(81)]) {
      await assert.rejects(() => setScore(db, 'certified', id, 4), /restaurant_rating_invalid_input/);
      await assert.rejects(() => summaries(db, 'certified', [id]), /restaurant_rating_invalid_input/);
    }
    for (const kind of [null, '', 'curated', 'recommendation', 'other']) {
      await assert.rejects(() => setScore(db, kind, 'mingles', 4), /restaurant_rating_invalid_input/);
      await assert.rejects(() => summaries(db, kind, ['mingles']), /restaurant_rating_invalid_input/);
    }
    await assert.rejects(() => summaries(db, 'certified', null), /restaurant_rating_invalid_input/);
    await assert.rejects(() => summaries(db, 'certified', Array.from({ length: 101 }, (_, i) => `batch-${i}`)), /restaurant_rating_invalid_input/);
    await assert.rejects(() => db.query("select public.get_restaurant_rating_summaries('certified','[0:0]={mingles}'::text[])"), /restaurant_rating_invalid_input/);
    await assert.rejects(() => db.query("select public.get_restaurant_rating_summaries('certified',array[['mingles','jin-jin']])"), /restaurant_rating_invalid_input/);
    const koreanId = 'blue-add-벽제갈비더청담';
    assert.equal((await setScore(db, 'certified', koreanId, 1.5)).my_rating, 1.5);
    assert.equal((await setScore(db, 'certified', '가'.repeat(80), 5)).my_rating, 5);
    const catalog = JSON.parse(sql('games/certified-restaurants/restaurants.json')).restaurants;
    for (let offset = 0; offset < catalog.length; offset += 100) {
      const ids = catalog.slice(offset, offset + 100).map(item => item.id);
      assert.deepEqual((await summaries(db, 'certified', ids)).map(item => item.id), ids, 'every current directory ID is accepted, including Korean IDs');
    }

    assert.deepEqual(await setScore(db, 'certified', 'mingles', 1.5), { id: 'mingles', average: 1.5, count: 1, my_rating: 1.5 });
    await db.exec('reset role');
    const original = (await db.query("select * from ojjuda_restaurants_internal.ratings where target_kind='certified' and target_id='mingles' and member_id=$1", [a])).rows[0];
    await asUser(db, a);
    await setScore(db, 'certified', 'mingles', 1.5);
    await db.exec('reset role');
    assert.deepEqual((await db.query("select * from ojjuda_restaurants_internal.ratings where target_kind='certified' and target_id='mingles' and member_id=$1", [a])).rows[0], original, 'same score is a true retry with no timestamp change');
    await asUser(db, b);
    assert.deepEqual(await setScore(db, 'certified', 'mingles', 4.5), { id: 'mingles', average: 3, count: 2, my_rating: 4.5 });
    await asUser(db, a);
    assert.deepEqual(await setScore(db, 'certified', 'mingles', 2), { id: 'mingles', average: 3.25, count: 2, my_rating: 2 });
    assert.deepEqual(await summaries(db, 'certified', ['mingles', 'jin-jin', 'mingles']), [
      { id: 'mingles', average: 3.25, count: 2, my_rating: 2 }, noScore('jin-jin')
    ]);
    await asUser(db, b);
    assert.equal((await summaries(db, 'certified', ['mingles']))[0].my_rating, 4.5, 'editing one member score leaves the other member score intact');
    await assert.rejects(() => db.query('select * from ojjuda_restaurants_internal.ratings'), /permission denied/);
    await assert.rejects(() => db.query('update ojjuda_restaurants_internal.ratings set score_half_units=10 where member_id=$1', [a]), /permission denied/);
    await assert.rejects(() => db.query('delete from ojjuda_restaurants_internal.ratings where member_id=$1', [a]), /permission denied/);
    await assert.rejects(() => db.query("insert into ojjuda_restaurants_internal.ratings(target_kind,target_id,member_id,score_half_units) values('certified','spoofed',$1,10)", [a]), /permission denied/);

    const firstPost = await recommend(db, a, 1), secondPost = await recommend(db, b, 2);
    await asUser(db, a);
    const missingPost = postId(999);
    assert.deepEqual(await summaries(db, 'recommended', [missingPost]), []);
    await assert.rejects(() => setScore(db, 'recommended', missingPost, 3), /restaurant_rating_target_unavailable/);
    await assert.rejects(() => setScore(db, 'recommended', 'mingles', 3), /restaurant_rating_invalid_input/);
    assert.deepEqual(await setScore(db, 'recommended', firstPost.id, 4.5), { id: firstPost.id, average: 4.5, count: 1, my_rating: 4.5 });
    await setScore(db, 'recommended', secondPost.id, 3.5);
    await asUser(db, b);
    assert.deepEqual(await setScore(db, 'recommended', firstPost.id, 1.5), { id: firstPost.id, average: 3, count: 2, my_rating: 1.5 });
    await setScore(db, 'certified', firstPost.id, 5);
    assert.equal((await summaries(db, 'recommended', [firstPost.id]))[0].count, 2, 'kind separates a certified string ID from a recommendation UUID');
    await db.exec('reset role');
    await assert.rejects(() => db.query("insert into ojjuda_restaurants_internal.ratings(target_kind,target_id,member_id,score_half_units) values('recommended',$1,$2,2)", [secondPost.id, b]), /check constraint/);
    await assert.rejects(() => db.query("insert into ojjuda_restaurants_internal.ratings(target_kind,target_id,member_id,recommendation_id,score_half_units) values('recommended',$1,$2,$3,2)", [secondPost.id, b, firstPost.id]), /check constraint/);
    await assert.rejects(() => db.query("insert into ojjuda_restaurants_internal.ratings(target_kind,target_id,member_id,score_half_units) values('certified','bad-half-units',$1,1)", [a]), /check constraint/);
    await assert.rejects(() => db.query("insert into ojjuda_restaurants_internal.ratings(target_kind,target_id,member_id,recommendation_id,score_half_units) values('recommended',$1,$2,$3,2)", [missingPost, a, missingPost]), /foreign key constraint/);

    // New-target quota is UTC-based, shared by both kinds, and never blocks edits.
    await db.query(`insert into ojjuda_restaurants_internal.ratings(target_kind,target_id,member_id,score_half_units,created_at)
      select 'certified','quota-fill-'||n,$1,6,(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')+interval '1 microsecond'
      from generate_series(1,499) n`, [quota]);
    await db.exec("set timezone='Pacific/Kiritimati'");
    await asUser(db, quota);
    assert.equal((await setScore(db, 'certified', 'quota-last', 3.5)).my_rating, 3.5);
    await assert.rejects(() => setScore(db, 'certified', 'quota-over', 4), /restaurant_rating_daily_limit/);
    await assert.rejects(() => setScore(db, 'recommended', secondPost.id, 4), /restaurant_rating_daily_limit/);
    assert.equal((await setScore(db, 'certified', 'quota-last', 3.5)).my_rating, 3.5);
    assert.equal((await setScore(db, 'certified', 'quota-last', 5)).my_rating, 5);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from ojjuda_restaurants_internal.ratings where member_id=$1', [quota])).rows[0].n, 500);
    await db.query("update ojjuda_restaurants_internal.ratings set created_at=(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '1 second' where member_id=$1", [quota]);
    await asUser(db, quota);
    assert.equal((await setScore(db, 'recommended', secondPost.id, 4)).my_rating, 4, 'the next UTC day permits new restaurant targets');
    await db.exec("set timezone='UTC'");

    // Pending-account visibility applies to both raters and recommendation authors.
    await asUser(db, a);
    await setScore(db, 'certified', 'withdrawal-check', 2);
    await asUser(db, withdrawing);
    assert.deepEqual(await setScore(db, 'certified', 'withdrawal-check', 4), { id: 'withdrawal-check', average: 3, count: 2, my_rating: 4 });
    await setScore(db, 'recommended', firstPost.id, 5);
    await db.query('select public.prepare_my_account_deletion($1)', [withdrawing]);
    await assert.rejects(() => setScore(db, 'certified', 'withdrawal-check', 5), /member_unavailable/);
    await assert.rejects(() => summaries(db, 'certified', ['withdrawal-check']), /member_unavailable/);
    await asUser(db, a);
    assert.deepEqual(await summaries(db, 'certified', ['withdrawal-check']), [{ id: 'withdrawal-check', average: 2, count: 1, my_rating: 2 }]);
    assert.equal((await summaries(db, 'recommended', [firstPost.id]))[0].count, 2, 'pending member ratings are excluded without cross-member is_banned calls');
    await asUser(db, withdrawing);
    await db.query('select public.delete_my_account($1)', [withdrawing]);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from ojjuda_restaurants_internal.ratings where member_id=$1', [withdrawing])).rows[0].n, 0, 'auth deletion cascades all of the member ratings');
    await asUser(db, b);
    await db.query('select public.prepare_my_account_deletion($1)', [b]);
    await asUser(db, a);
    assert.deepEqual((await summaries(db, 'recommended', [firstPost.id, secondPost.id])).map(item => item.id), [firstPost.id]);
    await assert.rejects(() => setScore(db, 'recommended', secondPost.id, 2), /restaurant_rating_target_unavailable/);
    assert.deepEqual(await summaries(db, 'certified', ['mingles']), [{ id: 'mingles', average: 2, count: 1, my_rating: 2 }]);
    await db.exec('reset role');
    await db.query('delete from ojjuda_account_deletion.requests where user_id=$1', [b]);

    await asUser(db, a);
    await db.query('select public.delete_restaurant_recommendation($1,$2)', [firstPost.id, firstPost.updated_at]);
    assert.deepEqual(await summaries(db, 'recommended', [firstPost.id]), []);
    await assert.rejects(() => setScore(db, 'recommended', firstPost.id, 4.5), /restaurant_rating_target_unavailable/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from ojjuda_restaurants_internal.ratings where recommendation_id=$1', [firstPost.id])).rows[0].n, 0, 'recommendation deletion cascades every member rating');
    await asUser(db, b);
    assert.deepEqual(await summaries(db, 'certified', [firstPost.id]), [{ id: firstPost.id, average: 5, count: 1, my_rating: 5 }], 'cascade remains scoped to the recommended kind');
    console.log('PASS: exact nine half-step scores; Korean/current catalog IDs; bounded batch reads; member-only RPC/role isolation; per-member updates and idempotent retries; averages and private own-score reads; recommended target validation; UTC daily new-target quota without edit throttling; pending-member visibility; account/recommendation deletion cascades.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
