const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {PGlite}=require('@electric-sql/pglite');

const sql=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations/',name),'utf8');
const account='10000000-0000-4000-8000-000000000001';
const person='20000000-0000-4000-8000-000000000001';

test('all legacy Pajang adult entry points reject teens, unknown age and blocked accounts',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema ojjuda_restaurants_internal; create schema ojjuda_account_internal;
    create schema pajang_private;
    create table auth.users(id uuid primary key,suspended boolean not null default false);
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
    create table pajang_private.people(id uuid primary key,owner_id uuid not null unique);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select (auth.jwt()->>'sub')::uuid
    $$;
    create function ojjuda_restaurants_internal.member_allowed() returns boolean language sql stable as $$
      select exists(select from auth.users where id=auth.uid() and not suspended)
    $$;
    create function ojjuda_restaurants_internal.require_member() returns uuid language plpgsql stable as $$
    begin
      if not ojjuda_restaurants_internal.member_allowed() then
        raise exception '회원 확인 필요' using errcode='42501';
      end if;
      return auth.uid();
    end;
    $$;
    create function public.pajang_member(p_action text default 'state',p_data jsonb default '{}'::jsonb)
    returns jsonb language plpgsql security definer set search_path='' as $function$
    declare
      u uuid:=ojjuda_restaurants_internal.require_member();
      known_age int;
    begin
      select extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date))::int
        into known_age from ojjuda_account_internal.member_identity i where i.user_id=u;
      if known_age is not null and known_age<19 then raise exception '파장은 만 19세 이상 회원만 이용할 수 있어요.' using errcode='42501'; end if;
      return jsonb_build_object('authenticated',true,'age',known_age);
    end; $function$;
    create function pajang_private.exchange_actor() returns uuid language plpgsql
      security definer set search_path='' as $function$
    declare
      account uuid:=ojjuda_restaurants_internal.require_member();
      actor uuid;
begin
  select p.id into actor from pajang_private.people p
      left join ojjuda_account_internal.member_identity i on i.user_id=p.owner_id
      where p.owner_id=account
        and (i.birth_date is null or extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date))>=19);
      if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
        raise exception '성인 파장 회원만 이용할 수 있어요.' using errcode='42501';
      end if;
      return actor;
    end; $function$;
    create function pajang_private.require_signal_member() returns uuid language plpgsql set search_path='' as $function$
    declare
      u uuid := ojjuda_restaurants_internal.require_member();
begin
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
        raise exception '회원 로그인이 필요해요.' using errcode='42501';
      end if;
      if exists(select from ojjuda_account_internal.member_identity i where i.user_id=u
        and extract(year from age((clock_timestamp() at time zone 'Asia/Seoul')::date,i.birth_date))<19) then
        raise exception '파장은 만 19세 이상 회원만 이용할 수 있어요.' using errcode='42501';
      end if;
      if not exists(select from pajang_private.people where owner_id=u) then
        raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
      end if;
      return u;
    end; $function$;
    create function public.pajang_art_allowed() returns boolean language sql stable security definer
      set search_path='' as $function$
      select ojjuda_restaurants_internal.member_allowed() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
        and not exists(select from ojjuda_account_internal.member_identity where user_id=auth.uid()
          and birth_date>(now() at time zone 'Asia/Seoul')::date-interval '19 years');
    $function$;
  `);
  await db.exec(sql('20261122163836_pajang_age_groups.sql'));
  await db.exec(sql('20261122171100_pajang_adult_endpoint_guards.sql'));

  await db.query('insert into auth.users(id) values($1)',[account]);
  await db.query('insert into pajang_private.people(id,owner_id) values($1,$2)',[person,account]);

  const login=async claims=>db.query('select set_config($1,$2,false)',[
    'request.jwt.claims',JSON.stringify(claims)]);
  const birth=async years=>db.query(`insert into ojjuda_account_internal.member_identity(user_id,birth_date)
    values($1,((now() at time zone 'Asia/Seoul')::date-make_interval(years=>$2::int))::date)
    on conflict(user_id) do update set birth_date=excluded.birth_date`,[account,years]);
  const check=async permitted=>{
    if(permitted){
      assert.equal((await db.query("select public.pajang_member('entry') as value")).rows[0].value.authenticated,true);
      assert.equal((await db.query('select pajang_private.exchange_actor() as value')).rows[0].value,person);
      assert.equal((await db.query('select pajang_private.require_signal_member() as value')).rows[0].value,account);
      assert.equal((await db.query('select public.pajang_art_allowed() as value')).rows[0].value,true);
    }else{
      for(const query of [
        "select public.pajang_member('entry')",
        'select pajang_private.exchange_actor()',
        'select pajang_private.require_signal_member()'
      ])await assert.rejects(()=>db.query(query),error=>error.code==='42501',query);
      assert.equal((await db.query('select public.pajang_art_allowed() as value')).rows[0].value,false);
    }
  };
  await login({sub:account});
  await check(false); // no identity: old implementations erroneously accepted this case
  await birth(18);
  await check(false); // teen account, even when its private person record already exists
  await birth(19);
  await check(true);
  await birth(20);
  await check(true);
  await login({sub:account,is_anonymous:true});
  await check(false);
  await login({sub:account});
  await db.query('update auth.users set suspended=true where id=$1',[account]);
  await check(false);
  await db.query('update auth.users set suspended=false where id=$1',[account]);
  await check(true);
  const definitions=await db.query(`select p.oid::regprocedure::text as signature,p.prosecdef,coalesce(p.proconfig::text,'') as config
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('pajang_member','pajang_art_allowed'))
      or(n.nspname='pajang_private' and p.proname in ('exchange_actor','require_signal_member'))`);
  assert.equal(definitions.rows.length,4);
  for(const row of definitions.rows)assert.ok(row.config.includes('search_path='),row.signature);
  assert.equal(definitions.rows.filter(row=>row.prosecdef).length,3);
});
