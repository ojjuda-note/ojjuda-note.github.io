import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

test('profile and photo exchange require five messages in each direction and separate mutual consent', async t => {
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
  await db.exec(await migration('20261117060900_pajang_members.sql'));
  await db.exec(await migration('20261117200000_pajang_exchange.sql'));

  const person = async name => {
    const account = randomUUID();
    const id = randomUUID();
    await db.query('insert into auth.users(id) values ($1)', [account]);
    await db.query('insert into public.profiles values ($1,$2)', [account,name]);
    await db.query('insert into pajang_private.people(id,owner_id,name,age,region,interest) values ($1,$2,$3,30,$4,$5)',
      [id,account,name,'서울특별시','walk']);
    return { account, id };
  };
  const login = member => db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:member.account})]);
  const rpc = async (action, peer = null, kind = null, data = {}) => {
    const result = await db.query('select public.pajang_exchange($1,$2,$3,$4) as result', [action,peer?.id ?? null,kind,data]);
    return result.rows[0].result;
  };
  const messages = async (from, to, count) => {
    await db.query('insert into pajang_private.messages(id,src,dst,body,at) select gen_random_uuid(),$1,$2,$3,n from generate_series(1,$4::int) n',
      [from.id,to.id,'안녕하세요',count]);
  };

  const a = await person('가을');
  const b = await person('겨울');
  await login(a);
  // Model an existing record created before the field was retired.
  await rpc('save', null, null, {fields:{job:'책방지기',religion:'legacy-test-value'}});
  assert.equal((await rpc('mine')).fields.religion,'legacy-test-value');
  await db.exec(await migration('20261118080000_pajang_retire_exchange_religion.sql'));
  assert.deepEqual((await rpc('mine')).fields,{job:'책방지기'});
  assert.deepEqual((await rpc('save',null,null,{fields:{job:'책방지기',religion:{stale:true}}})).fields,{job:'책방지기'});
  const storedFields=async member=>(await db.query(
    'select fields from pajang_private.exchange_profiles where person=$1',[member.id])).rows[0].fields;
  assert.equal((await storedFields(a)).religion,'legacy-test-value');
  await assert.rejects(() => rpc('save',null,null,{fields:{unknown:'still rejected'}}), {code:'22023'});
  await login(b);
  assert.deepEqual((await rpc('save',null,null,{fields:{religion:'not stored',height:170}})).fields,{height:170});
  assert.deepEqual(await storedFields(b),{height:170});
  await login(a);
  await assert.rejects(() => rpc('state',b), {code:'42501'});
  await db.query("insert into pajang_private.signals(src,dst,day,note,at) values ($1,$2,current_date,'',1),($2,$1,current_date,'',2)", [a.id,b.id]);
  await messages(a,b,5);
  await messages(b,a,4);
  await login(b);
  assert.equal((await rpc('state',a)).eligible,false);
  await assert.rejects(() => rpc('request',a,'profile'), {code:'42501'});
  await messages(b,a,1);
  const unlocked = await rpc('state',a);
  assert.deepEqual([unlocked.myCount,unlocked.peerCount,unlocked.eligible,unlocked.peerProfile], [5,5,true,null]);
  const pending = await rpc('request',a,'profile');
  assert.equal(pending.profile,'sent');
  assert.equal(pending.peerProfile,null);
  await assert.rejects(() => rpc('accept',a,'profile'), {code:'42501'});
  await login(a);
  await rpc('accept',b,'profile');
  await login(b);
  assert.deepEqual((await rpc('state',a)).peerProfile.fields,{job:'책방지기'});
  const canReadPhotos = async () => (await db.query(
    "select pajang_private.exchange_can_view($1,$2,'photos') as allowed", [b.id,a.id])).rows[0].allowed;
  assert.equal(await canReadPhotos(),false);
  await rpc('request',a,'photos');
  await login(a);
  await rpc('accept',b,'photos');
  await login(b);
  await rpc('revoke',a,'profile');
  assert.equal((await rpc('state',a)).peerProfile,null);
  assert.equal(await canReadPhotos(),true);
  await rpc('revoke',a,'photos');
  assert.equal(await canReadPhotos(),false);
  // The normal explicit profile deletion still removes the entire record.
  await db.query('delete from pajang_private.people where id=$1',[a.id]);
  assert.equal((await db.query('select count(*)::int n from pajang_private.exchange_profiles where person=$1',[a.id])).rows[0].n,0);
});
