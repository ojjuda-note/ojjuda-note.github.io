const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {PGlite}=require('@electric-sql/pglite');

const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261122163836_pajang_age_groups.sql'),'utf8');
const account='10000000-0000-4000-8000-000000000001';

test('Pajang age group uses verified identity and is closed to unverified or restricted accounts',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema ojjuda_account_internal; create schema ojjuda_restaurants_internal;
    create table auth.users(id uuid primary key,suspended boolean not null default false);
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select (auth.jwt()->>'sub')::uuid
    $$;
    create function ojjuda_restaurants_internal.member_allowed() returns boolean language sql stable as $$
      select exists(select from auth.users u where u.id=auth.uid() and not u.suspended)
    $$;
  `);
  await db.exec(sql);
  const row=async()=> (await db.query('select public.pajang_age_group() as value')).rows[0].value;
  const claims=async value=>db.query('select set_config($1,$2,false)',[
    'request.jwt.claims',JSON.stringify(value)]);
  const birth=async years=>db.query(`insert into ojjuda_account_internal.member_identity(user_id,birth_date)
    values($1, ((now() at time zone 'Asia/Seoul')::date - make_interval(years=>$2::int))::date)
    on conflict(user_id) do update set birth_date=excluded.birth_date`,[account,years]);
  assert.equal(await row(),'blocked','no login');
  await claims({sub:account});
  assert.equal(await row(),'blocked','nonexistent member');
  await db.query('insert into auth.users(id) values($1)',[account]);
  assert.equal(await row(),'blocked','no verified date');
  for(const [years,expected] of [[13,'blocked'],[14,'teen'],[18,'teen'],[19,'adult'],[65,'adult']]){
    await birth(years);
    assert.equal(await row(),expected,`age ${years}`);
  }
  await db.query(`update ojjuda_account_internal.member_identity
    set birth_date=((now() at time zone 'Asia/Seoul')::date - interval '19 years' + interval '1 day')::date
    where user_id=$1`,[account]);
  assert.equal(await row(),'teen','the day before the 19th birthday');
  await db.query(`update ojjuda_account_internal.member_identity
    set birth_date=((now() at time zone 'Asia/Seoul')::date - interval '14 years' + interval '1 day')::date
    where user_id=$1`,[account]);
  assert.equal(await row(),'blocked','the day before the 14th birthday');
  await birth(20);
  await claims({sub:account,is_anonymous:true});
  assert.equal(await row(),'blocked','anonymous sign-in');
  await claims({sub:account});
  await db.query('update auth.users set suspended=true where id=$1',[account]);
  assert.equal(await row(),'blocked','suspended member');
  const result=await db.query(`
    select has_function_privilege('authenticated','public.pajang_age_group()','execute') as member,
      has_function_privilege('anon','public.pajang_age_group()','execute') as guest,
      has_function_privilege('service_role','public.pajang_age_group()','execute') as service
  `);
  assert.deepEqual(result.rows[0],{member:true,guest:false,service:false});
  await db.exec('set role anon');
  try{
    await assert.rejects(()=>db.query('select public.pajang_age_group()'),/permission denied/);
  }finally{
    await db.exec('reset role');
  }
  assert.equal(await row(),'blocked');
});
