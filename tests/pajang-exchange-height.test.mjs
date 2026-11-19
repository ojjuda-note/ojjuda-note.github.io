import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const heightMigration = '20261119011919_pajang_exchange_decimal_height.sql';

// Production migration 20261117224836 was applied before this fix but is absent
// from the historical repository. Keep that exact state in this local fixture.
const retiredFieldFixture = `set local lock_timeout = '4s';
do $$ begin
  if (select md5(prosrc) from pg_proc where oid=to_regprocedure('pajang_private.exchange_fields(jsonb)')) is distinct from 'e00e27d684b8f263ce84afeaeadeac66' or
     (select md5(prosrc) from pg_proc where oid=to_regprocedure('pajang_private.exchange_profile(uuid,boolean)')) is distinct from '6dc35b695dd3721084cff68eaff76e04' then
    raise exception 'Pajang profile function definitions have changed; stop and review.';
  end if;
end $$;
-- Retire a profile field from new entry and all exchange responses.
create or replace function pajang_private.exchange_profile(person_id uuid, own_profile boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'fields',coalesce(p.fields,'{}'::jsonb) - 'religion',
    'age',case when own_profile or p.show_age then
      extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date))::integer end,
    'gender',case when own_profile or p.show_gender then
      case i.gender when 'male' then '남성' when 'female' then '여성' end end
  ) || case when own_profile then jsonb_build_object(
    'showAge',coalesce(p.show_age,false),'showGender',coalesce(p.show_gender,false)) else '{}'::jsonb end
  from pajang_private.people m
  left join pajang_private.exchange_profiles p on p.person=m.id
  left join ojjuda_account_internal.member_identity i on i.user_id=m.owner_id
  where m.id=person_id;
$$;

create or replace function pajang_private.exchange_fields(input jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  item record;
  txt text;
  result jsonb := '{}';
begin
  if jsonb_typeof(input) is distinct from 'object' then
    raise exception '프로필 입력 항목을 확인해 주세요.' using errcode='22023';
  end if;
  -- Ignore the retired key from clients that still have the old form open.
  input := input - 'religion';
  if input - array['relationship','job','region','height','mbti','bloodType','skills','hobbies','drinking','smoking','bio'] <> '{}' then
    raise exception '프로필 입력 항목을 확인해 주세요.' using errcode='22023';
  end if;
  for item in select key,value from jsonb_each(input) loop
    if item.value='null' then continue; end if;
    if jsonb_typeof(item.value)<>'string' and not (item.key='height' and jsonb_typeof(item.value)='number') then
      raise exception '프로필 입력 형식을 확인해 주세요.' using errcode='22023';
    end if;
    txt:=btrim(item.value #>> '{}');
    if txt='' then continue; end if;
    if char_length(txt)>(case item.key when 'bio' then 1000 when 'skills' then 160 when 'hobbies' then 160 else 80 end) then
      raise exception '프로필 글자 수를 확인해 주세요.' using errcode='22023';
    end if;
    if item.key='relationship' and txt not in ('싱글','돌싱') then
      raise exception '싱글 또는 돌싱을 선택해 주세요.' using errcode='22023';
    elsif item.key='height' then
      if txt !~ '^[0-9]{1,3}$' then raise exception '키를 센티미터 단위로 입력해 주세요.' using errcode='22023'; end if;
      if txt::integer not between 1 and 300 then raise exception '키를 확인해 주세요.' using errcode='22023'; end if;
      result:=result||jsonb_build_object(item.key,txt::integer);
      continue;
    elsif item.key in ('mbti','bloodType') then
      txt:=upper(txt);
      if (item.key='mbti' and txt !~ '^[IE][NS][FT][JP]$') or (item.key='bloodType' and txt not in ('A','B','O','AB')) then
        raise exception '선택한 프로필 값을 확인해 주세요.' using errcode='22023';
      end if;
    end if;
    result:=result||jsonb_build_object(item.key,txt);
  end loop;
  return result;
end; $$;

-- Existing saved values are not erased by this migration or by an unrelated profile edit.
-- Normal deliberate profile deletion and account deletion remain unchanged.
create function pajang_private.protect_retired_exchange_field() returns trigger
language plpgsql set search_path='' as $$
begin
  new.fields := new.fields - 'religion';
  if tg_op='UPDATE' and old.fields ? 'religion' then
    new.fields := new.fields || jsonb_build_object('religion',old.fields->'religion');
  end if;
  return new;
end; $$;
revoke all on function pajang_private.protect_retired_exchange_field() from public,anon,authenticated;

create trigger protect_retired_exchange_field
before insert or update of fields on pajang_private.exchange_profiles
for each row execute function pajang_private.protect_retired_exchange_field();
`;

test('exchange profile edits persist decimal heights without changing privacy or other members', async t => {
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

  const person = async (name, gender) => {
    const account = randomUUID();
    const id = randomUUID();
    await db.query('insert into auth.users(id) values ($1)', [account]);
    await db.query('insert into public.profiles values ($1,$2)', [account,name]);
    await db.query("insert into ojjuda_account_internal.member_identity values ($1,'1990-01-01',$2)", [account,gender]);
    await db.query('insert into pajang_private.people(id,owner_id,name,age,region,interest) values ($1,$2,$3,30,$4,$5)',
      [id,account,name,'서울특별시','walk']);
    return { account, id };
  };
  const login = async (member, anonymous = false) => {
    await db.query("select set_config('request.jwt.claims',$1,false)",
      [JSON.stringify({sub:member.account,role:'authenticated',is_anonymous:anonymous})]);
    await db.exec('set role authenticated');
  };
  const rpc = async (action, data = {}, peer = null, kind = null) => {
    const result = await db.query('select public.pajang_exchange($1,$2,$3,$4) as result', [action,peer?.id ?? null,kind,data]);
    return result.rows[0].result;
  };

  const a = await person('가을', 'male');
  const b = await person('겨울', 'female');
  await db.query('insert into pajang_private.exchange_profiles(person,fields) values ($1,$2),($3,$4)',
    [a.id,{height:170,job:'이전 직업',religion:'기존 값'},b.id,{height:180,job:'다른 회원 직업'}]);
  await db.query("insert into pajang_private.signals(src,dst,day,note,at) values ($1,$2,current_date,'',1),($2,$1,current_date,'',2)", [a.id,b.id]);
  await db.query("insert into pajang_private.messages(id,src,dst,body,at) select gen_random_uuid(),$1,$2,'안녕하세요',n from generate_series(1,5) n", [a.id,b.id]);
  await db.query("insert into pajang_private.messages(id,src,dst,body,at) select gen_random_uuid(),$1,$2,'반가워요',n from generate_series(1,5) n", [b.id,a.id]);
  await db.query("insert into pajang_private.exchanges(first_person,second_person,kind,requester,accepted) values (least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),'profile',$1,true)", [a.id,b.id]);

  await db.exec(retiredFieldFixture);
  await login(a);
  // Reproduce the old server rejection before applying the actual fix.
  await assert.rejects(() => rpc('save',{fields:{height:'175.5'}}), {code:'22023'});
  assert.equal((await rpc('mine')).fields.height,170);
  await db.exec('reset role');
  await db.exec(await migration(heightMigration));
  await login(a);

  await t.test('integer and decimal edits return the saved values and survive reopening', async () => {
    const integer = await rpc('save',{fields:{height:'175',job:'책방지기',mbti:'infp',bloodType:'ab'},showAge:true,showGender:false});
    assert.deepEqual(integer.fields,{height:175,job:'책방지기',mbti:'INFP',bloodType:'AB'});
    const updated = await rpc('save',{fields:{height:' 175.5 ',job:'새 직업'},showAge:false,showGender:true});
    assert.deepEqual(updated.fields,{height:175.5,job:'새 직업'});
    assert.equal(updated.showAge,false);
    assert.equal(updated.showGender,true);
    assert.deepEqual(await rpc('mine'),updated);
  });

  await t.test('numeric input and inclusive height boundaries retain their numeric values', async () => {
    for (const height of [175.25,1,'300',299.99]) {
      const saved = await rpc('save',{fields:{height}});
      assert.equal(saved.fields.height,Number(height));
      assert.equal((await rpc('mine')).fields.height,Number(height));
    }
  });

  await t.test('clearing an optional height removes it on the next load', async () => {
    for (const fields of [{job:'유지할 직업'},{height:'   ',job:'유지할 직업'},{height:null,job:'유지할 직업'}]) {
      await rpc('save',{fields:{height:'175.5',job:'이전 값'}});
      const saved = await rpc('save',{fields});
      assert.deepEqual(saved.fields,{job:'유지할 직업'});
      assert.deepEqual((await rpc('mine')).fields,saved.fields);
    }
  });

  await t.test('invalid heights fail without partially saving the accompanying edits', async () => {
    const prior = await rpc('save',{fields:{height:'175.5',job:'보존할 직업'},showAge:true});
    for (const height of ['0','300.1','-1','175,5','1e2','NaN','Infinity','175cm','175..5',true,{},[]]) {
      await assert.rejects(() => rpc('save',{fields:{height,job:'실패해야 하는 변경'},showGender:true}), {code:'22023'});
      assert.deepEqual(await rpc('mine'),prior);
    }
  });

  await t.test('unrecognized fields and existing field validations still reject the whole edit', async () => {
    const prior = await rpc('mine');
    for (const fields of [
      {height:'175.5',ownerId:b.id},{height:'175.5',relationship:'기혼'},
      {height:'175.5',mbti:'INVALID'},{height:'175.5',bloodType:'C'},
      {height:'175.5',job:{}},{height:'175.5',bio:'가'.repeat(1001)}
    ]) {
      await assert.rejects(() => rpc('save',{fields}), {code:'22023'});
      assert.deepEqual(await rpc('mine'),prior);
    }
    await assert.rejects(() => rpc('save',{fields:{height:'175.5'},person:b.id}), {code:'22023'});
    assert.deepEqual(await rpc('mine'),prior);
  });

  await t.test('a profile save remains scoped to the authenticated member', async () => {
    await login(b);
    const otherBefore = await rpc('mine');
    await login(a);
    const saved = await rpc('save',{fields:{height:'176.5',job:'내 수정'}},b);
    assert.equal(saved.fields.height,176.5);
    await login(b);
    assert.deepEqual(await rpc('mine'),otherBefore);
    await assert.rejects(() => db.query('select fields from pajang_private.exchange_profiles'),{code:'42501'});
  });

  await t.test('retired fields stay hidden and unchanged while shared profiles show the decimal edit', async () => {
    await login(a);
    const saved = await rpc('save',{fields:{height:'177.5',religion:'새 값'},showAge:false,showGender:true});
    assert.deepEqual(saved.fields,{height:177.5});
    assert.deepEqual((await rpc('mine')).fields,saved.fields);
    await login(b);
    const peerState = await rpc('state',{},a);
    assert.deepEqual(peerState.peerProfile.fields,{height:177.5});
    assert.equal(peerState.peerProfile.age,null);
    assert.equal(peerState.peerProfile.gender,'남성');
    await db.exec('reset role');
    const stored = await db.query('select fields from pajang_private.exchange_profiles where person=$1',[a.id]);
    assert.equal(stored.rows[0].fields.religion,'기존 값');
    assert.equal(stored.rows[0].fields.height,177.5);
  });

  await t.test('anonymous and unauthenticated callers do not gain write access', async () => {
    await db.exec('set role anon');
    await assert.rejects(() => rpc('save',{fields:{height:'175.5'}}),{code:'42501'});
    await db.exec('reset role');
    await login(a,true);
    await assert.rejects(() => rpc('save',{fields:{height:'175.5'}}),{code:'42501'});
  });
});

