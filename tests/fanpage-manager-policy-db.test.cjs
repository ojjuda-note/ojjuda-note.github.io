const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const migrations = path.join(__dirname, '../supabase/migrations');
const migration = suffix => fs.readFileSync(path.join(migrations,
  fs.readdirSync(migrations).find(file => file.endsWith(suffix))), 'utf8');

test('manager reads and administrator writes keep their original scope', async () => {
  const db = new PGlite();
  const manager = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as
        $$select current_setting('test.actor')::uuid$$;
      create function public.is_admin() returns boolean language sql stable as
        $$select current_setting('test.admin')::boolean$$;
      create function public.is_banned(uuid) returns boolean language sql stable as
        $$select current_setting('test.banned')::boolean$$;
      create table public.profiles(id uuid primary key);
      create schema storage;
      create table storage.buckets(id text, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(bucket_id text, owner_id text, name text);`);
    await db.exec(migration('_fanpage_artist_management.sql'));
    await db.exec(migration('_fanpage_manager_write_policies.sql'));
    await db.query('insert into public.profiles values ($1),($2)', [manager,other]);
    await db.query("insert into public.fanpage_managers values ('ive',$1),('aespa',$2)", [manager,other]);
    await db.exec("set role authenticated; set test.admin='false'; set test.banned='false'");
    await db.query("select set_config('test.actor',$1,false)", [manager]);
    const visible = async () => (await db.query('select artist_id from public.fanpage_managers order by 1')).rows.map(row=>row.artist_id);
    assert.deepEqual(await visible(),['ive']);
    assert.equal((await db.query("delete from public.fanpage_managers where artist_id='ive'")).affectedRows,0);
    await assert.rejects(db.query("insert into public.fanpage_managers values ('twice',$1)",[manager]), /row-level security/);
    await db.exec("set test.admin='true'; set test.banned='true'");
    assert.deepEqual(await visible(),['aespa','ive']);
    assert.equal((await db.query("update public.fanpage_managers set member_id=$1 where artist_id='ive'",[other])).affectedRows,0);
    await assert.rejects(db.exec("insert into public.fanpage_pages(artist_id) values ('new-test')"), /row-level security/);
    await db.exec("set test.banned='false'");
    await db.query("select public.create_fanpage('new-test','New','mixed',$1)",[manager]);
    await db.query("select public.assign_fanpage_manager('new-test',$1)",[other]);
    assert.deepEqual((await db.query("select member_id from public.fanpage_managers where artist_id='new-test'")).rows,[{member_id:other}]);
    await db.query("select public.assign_fanpage_manager('new-test',null)");
    assert.deepEqual(await visible(),['aespa','ive']);
  } finally { await db.close(); }
});
