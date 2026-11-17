const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema ojjuda_account_internal;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
    create table auth.identities(user_id uuid references auth.users,provider text,identity_data jsonb);
    create table public.profiles(id uuid primary key references auth.users on delete cascade,
      nickname text not null unique check(char_length(nickname) between 1 and 12));
    create table public.test_banned(word text);
    create function public.has_banned(t text) returns boolean language sql stable as $$
      select exists(select from public.test_banned where t like '%'||word||'%');
    $$;
    create function public.check_banned() returns trigger language plpgsql as $$ begin
      if public.has_banned(new.nickname) then raise exception 'banned_nickname'; end if; return new;
    end; $$;
    create trigger banned_check before insert or update on public.profiles for each row execute function public.check_banned();
  `);
  const migration = fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(n=>n.endsWith('_signup_korean_nickname_allocation.sql'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',migration),'utf8'));
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  let serial=0;
  const signup = async (name,automatic=true) => {
    const id='00000000-0000-4000-8000-'+String(++serial).padStart(12,'0');
    await db.query('insert into auth.users values($1,$2)',[id,{nickname:name,nickname_auto:automatic}]);
    return {id,name:await value("select raw_user_meta_data->>'nickname' as value from auth.users where id=$1",[id])};
  };
  const profile = (user,name=user.name) => db.query('insert into public.profiles values($1,$2)',[user.id,name]);
  const countClaims = () => value('select count(*)::int as value from ojjuda_account_internal.signup_nickname_claims');
  const source=fs.readFileSync(path.join(__dirname,'../app/portal/portal.js'),'utf8');
  const words={};
  for(const key of ['actions','things','animals']) words[key]=vm.runInNewContext('['+source.match(new RegExp('const '+key+' = \\[([\\s\\S]*?)\\];'))[1]+']');
  const expected=[...words.actions,...words.things].flatMap(a=>[...words.animals,...words.things].filter(b=>a!==b).map(b=>a+' '+b));
  assert.equal(expected.length,12448);
  const pool=(await db.query('select nickname from ojjuda_account_internal.signup_nickname_bases')).rows.map(r=>r.nickname);
  assert.deepEqual(new Set(pool),new Set(expected),'server pool matches every client combination');
  for(const name of ['노래하는 딸기','춤추는 고래','딸기 고래','우주 하마']){
    const user=await signup(name); assert.equal(user.name,name); await profile(user);
  }
  const occupied=await signup('노래하는 딸기');
  assert.match(occupied.name,/^[가-힣]{1,4} [가-힣]{1,4}$/,'a collision uses another plain pair');
  assert.notEqual(occupied.name,'노래하는 딸기');
  await profile(occupied,'노래하는 딸기');
  assert.equal(await value('select nickname as value from public.profiles where id=$1',[occupied.id]),occupied.name,'stale Auth responses use the reserved name');
  assert.equal(await countClaims(),0);

  // Use a tiny pool to exercise genuine exhaustion without production data.
  await db.exec("delete from auth.users; delete from ojjuda_account_internal.signup_nickname_bases where nickname not in ('노래하는 딸기','춤추는 고래','우주 하마')");
  const a=await signup('노래하는 딸기'),b=await signup('춤추는 고래');
  const c=await signup('노래하는 딸기'); assert.equal(c.name,'우주 하마','the last plain pair must be used before any suffix');
  const d=await signup('노래하는 딸기'); assert.equal(d.name,'노래하는 딸기1');
  const e=await signup('노래하는 딸기'); assert.equal(e.name,'노래하는 딸기2');
  const batch=await Promise.all(Array.from({length:12},()=>signup('노래하는 딸기')));
  assert.deepEqual(batch.map(x=>Number(x.name.replace('노래하는 딸기',''))).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i+3));
  assert.equal(new Set([a,b,c,d,e,...batch].map(x=>x.name)).size,17,'pending signups also occupy their names');
  await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{nickname:'노래하는 딸기',nickname_auto:true,other:'kept'},e.id]);
  assert.deepEqual(await value('select raw_user_meta_data as value from auth.users where id=$1',[e.id]),{nickname:e.name,other:'kept'});
  await db.query("insert into auth.identities values($1,'email',$2)",[e.id,{nickname:'노래하는 딸기',nickname_auto:true}]);
  assert.equal(await value("select identity_data->>'nickname' as value from auth.identities where user_id=$1",[e.id]),e.name);
  await db.query("update auth.identities set identity_data=$1 where user_id=$2",[{nickname:'stale'},e.id]);
  assert.equal(await value("select identity_data->>'nickname' as value from auth.identities where user_id=$1",[e.id]),e.name);
  await profile(e,'노래하는 딸기');
  assert.equal(await value('select nickname as value from public.profiles where id=$1',[e.id]),'노래하는 딸기2');
  assert.equal(await countClaims(),16);
  const manual=await signup('직접 정한이름',false); assert.equal(manual.name,'직접 정한이름');
  await assert.rejects(()=>profile(manual,a.name),error=>error.code==='23505');
  await profile(manual);
  await assert.rejects(()=>db.query('update public.profiles set nickname=$1 where id=$2',[b.name,manual.id]),error=>error.code==='23505');
  await db.query('delete from auth.users where id=$1',[c.id]);
  assert.equal((await signup('노래하는 딸기')).name,'우주 하마','released plain names take priority over numbers');
  await db.exec('begin');
  const rolledBack=await signup('노래하는 딸기'); assert.equal(rolledBack.name,'노래하는 딸기15');
  await db.exec('rollback');
  assert.equal((await signup('노래하는 딸기')).name,'노래하는 딸기15','failed signups do not consume suffix numbers');
  const explicit=await signup('춤추는 고래');
  await profile(explicit,'새로 정한이름');
  assert.equal(await value('select nickname as value from public.profiles where id=$1',[explicit.id]),'새로 정한이름');
  assert.equal(await value("select raw_user_meta_data->>'nickname' as value from auth.users where id=$1",[explicit.id]),'새로 정한이름');

  await db.exec("delete from auth.identities; delete from auth.users; update ojjuda_account_internal.signup_nickname_bases set next_suffix=1; insert into public.test_banned values('노래하는')");
  const protectedClaim=await signup('춤추는 고래');
  const beforeRejectedProfile=await countClaims();
  await assert.rejects(()=>profile(protectedClaim,'노래하는 이름'),/banned_nickname/);
  assert.equal(await countClaims(),beforeRejectedProfile,'failed profile writes preserve the pending claim');
  await db.query('delete from auth.users where id=$1',[protectedClaim.id]);
  const allowed=await signup('노래하는 딸기'); assert.notEqual(allowed.name,'노래하는 딸기'); await profile(allowed);
  await signup('춤추는 고래');
  assert.match((await signup('노래하는 딸기')).name,/^(춤추는 고래|우주 하마)1$/,'banned bases are never used for numeric names');
  await db.exec("delete from auth.users; delete from public.test_banned; delete from ojjuda_account_internal.signup_nickname_bases; insert into ojjuda_account_internal.signup_nickname_bases(nickname,next_suffix) values('반짝이는 비눗방울',999),('우주 하마',1)");
  await profile(await signup('반짝이는 비눗방울')); await profile(await signup('우주 하마'));
  assert.equal((await signup('반짝이는 비눗방울')).name,'반짝이는 비눗방울999');
  const lengthFallback=await signup('반짝이는 비눗방울');
  assert.equal(lengthFallback.name,'우주 하마1','exhausted length capacity moves to another pair');
  assert.ok(lengthFallback.name.length<=12);
  for(const role of ['anon','authenticated']){
    for(const table of ['signup_nickname_bases','signup_nickname_claims']){
      assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,'ojjuda_account_internal.'+table,'select']),false);
      assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,'ojjuda_account_internal.'+table,'insert']),false);
    }
    for(const fn of ['pick_signup_nickname(text)','claim_signup_nickname()','keep_claimed_signup_nickname()','protect_signup_nickname_claim()']){
      assert.equal(await value('select has_function_privilege($1,$2,$3) as value',[role,'ojjuda_account_internal.'+fn,'execute']),false);
    }
  }
  assert.equal(await value("select bool_and(relrowsecurity) as value from pg_class where relname in ('signup_nickname_bases','signup_nickname_claims')"),true);
  await db.close();
  console.log('PASS: 12,448 Korean pairs, full-pool exhaustion, sequential suffixes, pending-account claims, rollback, metadata replay, profile handoff, manual names, moderation, length and private permissions');
})().catch(error=>{console.error(error);process.exitCode=1;});
