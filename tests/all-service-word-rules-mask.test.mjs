import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const {maskText,maskedTextLength}=createRequire(import.meta.url)('../shared/content/word-mask.js');
const clientLexicon={words:['씨발','시발','마약','fuck','개새끼'],allow:['시발점','마약김밥']};

const directory=new URL('../supabase/migrations/',import.meta.url);
const migrationName=(await readdir(directory)).find(name=>name.endsWith('_all_service_word_rules.sql'));
const migration=await readFile(new URL(migrationName,directory),'utf8');
const helper=migration.slice(migration.indexOf('create function public.mask_banned'),
  migration.indexOf('grant execute on function public.mask_banned(text) to anon,authenticated,service_role;')+
  'grant execute on function public.mask_banned(text) to anon,authenticated,service_role;'.length);

test('canonical masking preserves the common lexicon and reaches an idempotent two-heart result',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create table public.banned_base(word text primary key,active boolean not null);
    create table public.banned_words(word text primary key);
    create table public.banned_allow(phrase text primary key);
    insert into public.banned_base values('씨발',true),('시발',true),('마약',true),('fuck',true),('음란',false);
    insert into public.banned_words values('개새끼');
    insert into public.banned_allow values('시발점'),('마약김밥');
    create function public.norm_text(t text) returns text language sql immutable set search_path='pg_catalog' as $$
      select regexp_replace(lower(coalesce(t,'')),'[^가-힣ㄱ-ㅎㅏ-ㅣa-z]','','g');
    $$;
    create function public.has_banned(t text) returns boolean language plpgsql stable security definer set search_path='public' as $$
      declare n text;a record;
      begin n:=norm_text(t);if n='' then return false;end if;
        for a in select phrase from banned_allow loop n:=replace(n,norm_text(a.phrase),'');end loop;
        return exists(select from banned_base b where b.active and norm_text(b.word)<>'' and position(norm_text(b.word) in n)>0)
          or exists(select from banned_words w where norm_text(w.word)<>'' and position(norm_text(w.word) in n)>0);
      end;
    $$;
  `);
  const before=(await db.query("select pg_get_functiondef('public.has_banned(text)'::regprocedure) as definition")).rows[0].definition;
  await db.exec(helper);
  const mask=async text=>(await db.query('select public.mask_banned($1) as value',[text])).rows[0].value;
  const vectors=[
    [null,null],['',''],['오늘 산책해요','오늘 산책해요'],['❤️❤️','❤️❤️'],
    ['기독교 불교 무교 개발자 010-1234-5678 member@example.com','기독교 불교 무교 개발자 010-1234-5678 member@example.com'],
    ['안녕 씨.1발 반가워','안녕 ❤️❤️ 반가워'],['F.u.C.k!','❤️❤️!'],
    ['씨fuck발','❤️❤️'],['씨❤️❤️발','❤️❤️'],['씨시발점발','❤️❤️시발점❤️❤️'],
    ['마약김밥은 허용, 마 약은 치환','마약김밥은 허용, ❤️❤️은 치환'],
    ['생각의 시발점','생각의 시발점'],['음란 비활성 어휘','음란 비활성 어휘'],
    ['😀씨\u200b발🥰','😀❤️❤️🥰'],['e\u0301 씨 발 e\u0301','e\u0301 ❤️❤️ e\u0301'],
    ['씨발fuck개새끼','❤️❤️'],['씨발 그리고 fuck','❤️❤️ 그리고 ❤️❤️'],
    ['이미 ❤️❤️, 다음 씨발!','이미 ❤️❤️, 다음 ❤️❤️!'],
  ];
  for(const [input,expected] of vectors){
    await t.test(JSON.stringify(input),async()=>{
      const actual=await mask(input);assert.equal(actual,expected);
      assert.equal(maskText(input,clientLexicon),actual,'Agit preview agrees with the server on the same catalog');
      assert.equal(await mask(actual),actual,'a retry must not change the saved text again');
      assert.equal((await db.query('select public.has_banned($1) as value',[actual])).rows[0].value,false);
    });
  }
  await t.test('overlapping terms, normalized catalog changes and one-character entries use the same helper',async()=>{
    await db.exec("insert into public.banned_words values('abc'),('bcd'),('z')");
    clientLexicon.words.push('abc','bcd','z');
    assert.equal(await mask('앞 a-bc.d 뒤'),'앞 ❤️❤️ 뒤');
    assert.equal(await mask('abZc'),'❤️❤️');
    for(const input of ['앞 a-bc.d 뒤','abZc','시 발 점'])assert.equal(maskText(input,clientLexicon),await mask(input));
    assert.equal(await mask('시 발 점'), '시 발 점');
    await db.exec("update public.banned_base set active=false where word='fuck'");
    clientLexicon.words=clientLexicon.words.filter(word=>word!=='fuck');
    assert.equal(await mask('F.u.C.k!'),'F.u.C.k!');
    assert.equal(maskText('F.u.C.k!',clientLexicon),await mask('F.u.C.k!'));
    assert.equal(maskedTextLength('가'.repeat(11)+'❤️❤️'),12);
  });
  await t.test('guest and member canonicalization requires no catalog table grants and cannot write',async()=>{
    for(const role of ['anon','authenticated','service_role']){
      await db.exec(`set role ${role}`);
      assert.equal(await mask('개 새 끼'),'❤️❤️');
      await assert.rejects(()=>db.query('select * from public.banned_words'),{code:'42501'});
      await db.exec('reset role');
    }
    const after=(await db.query("select pg_get_functiondef('public.has_banned(text)'::regprocedure) as definition")).rows[0].definition;
    assert.equal(after,before,'boolean moderation detection stays unchanged');
    const definition=(await db.query("select provolatile,prosecdef,proconfig from pg_proc where oid='public.mask_banned(text)'::regprocedure")).rows[0];
    assert.deepEqual(definition,{provolatile:'s',prosecdef:true,proconfig:['search_path=""']});
  });
});
