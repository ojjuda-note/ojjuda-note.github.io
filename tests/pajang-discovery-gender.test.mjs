import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

test('discovery filtering uses its own opt-in and keeps dated answers paginated within it', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create schema ojjuda_restaurants_internal; create schema ojjuda_account_internal;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key, nickname text);
    create table ojjuda_account_internal.member_identity(user_id uuid primary key, birth_date date, gender text);
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function ojjuda_restaurants_internal.member_allowed() returns boolean language sql stable
      as $$select exists(select from auth.users where id=auth.uid())$$;
    create function ojjuda_restaurants_internal.require_member() returns uuid language plpgsql stable as $$
      begin
        if not ojjuda_restaurants_internal.member_allowed() then raise exception 'member required' using errcode='42501'; end if;
        return auth.uid();
      end; $$;
  `);
  const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
  for (const file of migrations.filter(name => name.startsWith('20261117') && name.includes('_pajang_') &&
      name <= '20261117210000_pajang_discovery_gender.sql' && !name.includes('_exchange_photos')).sort()) {
    await db.exec(await migration(file));
  }
  await db.exec(await migration("20261117235000_pajang_my_answers.sql"));
  const account = randomUUID();
  const writer = randomUUID();
  await db.query('insert into auth.users values ($1)', [account]);
  await db.query('insert into public.profiles values ($1,$2)', [account,'회원']);
  await db.query("insert into ojjuda_account_internal.member_identity values ($1,date '1990-02-01','female')", [account]);
  await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values ($1,$2,'회원','경기도','walk')", [writer,account]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:account})]);
  // The oldest answer falls outside the 30 calendar dates. Every other row has the same author.
  await db.query(`insert into pajang_private.answers(person,day,slot,at,body,question_prompt,archived)
    select $1,(now() at time zone 'Asia/Seoul')::date-n,'am',100-n,'답변 '||n,'질문 '||n,true
    from generate_series(0,30) n`, [writer]);
  const value = async (sql, params = []) => (await db.query(sql, params)).rows[0].v;
  const feed = (gender, cursor = null) => value("select public.pajang_discovery_feed($1,'walk','latest',$2) as v", [cursor,gender]);
  const preference = visible => value('select public.pajang_discovery_visibility($1) as v',[visible]);
  await value("select public.pajang_exchange('save',null,null,$1) as v", [{fields:{},showGender:true}]);
  assert.deepEqual(await preference(null), {visible:false,hasGender:true});
  assert.equal((await feed('female')).total, 0);
  assert.equal((await feed('all')).total, 30);

  const mine=()=>value("select public.pajang_my_answers() as v");
  assert.equal((await mine()).length,30);
  assert.equal((await mine())[0].body,"답변 0");
  await preference(true);
  const first = await feed('female');
  assert.equal(first.total, 30);
  assert.equal(first.items.length, 24);
  assert.equal(first.items.some(row => 'gender' in row || 'age' in row), false);
  assert.equal((await feed('female',first.nextCursor)).items.length, 6);
  await assert.rejects(() => feed('male',first.nextCursor), {code:'22023'});
  assert.equal((await feed('male')).total, 0);
  await preference(false);
  assert.equal((await feed('female',first.nextCursor)).total, 0);
  assert.equal((await value('select public.pajang_discovery_feed() as v')).total, 30);
  assert.equal((await value("select public.pajang_exchange('mine') as v")).showGender, true);
  const stranger=randomUUID();
  await db.query("insert into auth.users values ($1)",[stranger]);
  await db.query("insert into ojjuda_account_internal.member_identity values ($1,date '1990-02-01','male')",[stranger]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:stranger})]);
  await assert.rejects(mine,{code:'42501'});
  await db.query("insert into pajang_private.people(id,owner_id,name,region,interest) values ($1,$2,'다른 회원','','')",[randomUUID(),stranger]);
  assert.deepEqual(await mine(),[]);
});
