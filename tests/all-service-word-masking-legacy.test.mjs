import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const migrations=new URL('../supabase/migrations/',import.meta.url);
const migrationName=(await readdir(migrations)).find(name=>name.endsWith('_all_service_word_rules.sql'));
const migration=await readFile(new URL(migrationName,migrations),'utf8');
const originals=JSON.parse(await readFile(new URL('./fixtures/all-service-word-masking-legacy-functions.json',import.meta.url),'utf8'));
const block=name=>{
  const start=migration.indexOf(`-- BEGIN ${name}\n`),end=migration.indexOf(`-- END ${name}`,start);
  assert.ok(start>=0&&end>start,`migration block ${name}`);
  return migration.slice(start,end);
};
const patch=signature=>block(`patch ${signature}`);
const constraints=[...block('masked length constraints').matchAll(/do \$constraint\$[\s\S]*?\$constraint\$;/gi)].map(match=>match[0]);
const HEARTS='❤️❤️';

test('existing Agit and Park paths save canonical masks without losing validation, retries or metadata',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  const actor=randomUUID(),peer=randomUUID(),admin=randomUUID();
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema ojjuda_note;create schema ojjuda_note_internal;create schema ojjuda_groups_internal;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create function public.is_banned(uuid) returns boolean language sql stable as $$select false$$;
    create function public.is_admin() returns boolean language sql stable as $$select auth.uid()='${admin}'::uuid$$;
    create function ojjuda_note_internal.friend_message_blocked(uuid) returns boolean language sql stable as $$select false$$;
    create function ojjuda_note_internal.is_world_member() returns boolean language sql stable security definer as $$select exists(select from auth.users where id=auth.uid())$$;
    create function ojjuda_note_internal.is_note_moderator() returns boolean language sql stable as $$select auth.uid()='${admin}'::uuid$$;
    create table public.banned_base(word text primary key,active boolean not null);
    create table public.banned_words(word text primary key);
    create table public.banned_allow(phrase text primary key);
    insert into public.banned_base values('씨발',true),('시발',true),('fuck',true),('마약',true),('비활성어',false);
    insert into public.banned_words values('검증금지');
    insert into public.banned_allow values('시발점'),('마약김밥');
    create function public.norm_text(t text) returns text language sql immutable set search_path='pg_catalog' as $$
      select regexp_replace(lower(coalesce(t,'')),'[^가-힣ㄱ-ㅎㅏ-ㅣa-z]','','g');
    $$;
    create table public.profiles(id uuid primary key,nickname text,bio text,mood_text text,metadata jsonb,
      constraint profiles_nickname_check check(char_length(nickname) between 1 and 12),
      constraint profiles_bio_check check(char_length(bio)<=40),constraint profiles_mood_text_check check(char_length(mood_text)<=16));
    create table public.user_private(user_id uuid primary key);
    create table public.test_admin_audit(action text,subject uuid,body text,detail jsonb);
    create function public.admin_note(p_action text,p_subject uuid,p_body text,p_detail jsonb) returns void language sql as $$
      insert into public.test_admin_audit values(p_action,p_subject,p_body,p_detail);
    $$;
    create table public.world_board_comments(id uuid primary key default gen_random_uuid(),author_id uuid,body text,metadata jsonb);
    create table public.friendships(requester uuid,addressee uuid,status text);
    create table ojjuda_note_internal.friend_messages(id uuid primary key default gen_random_uuid(),sender_id uuid,recipient_id uuid,
      body text not null,request_id uuid,created_at timestamptz default clock_timestamp(),unique(sender_id,request_id),
      constraint friend_messages_body_check check(length(body) between 1 and 1000 and octet_length(body)<=4000));
    create table ojjuda_note_internal.inquiries(id uuid primary key default gen_random_uuid(),user_id uuid,request_id uuid,body text,reply text,
      status text default 'open',created_at timestamptz default now(),updated_at timestamptz default clock_timestamp(),replied_by uuid,
      unique(user_id,request_id),constraint inquiries_body_check check(char_length(btrim(body)) between 1 and 2000),
      constraint inquiries_reply_check check(char_length(reply)<=2000));
    create table ojjuda_note_internal.moderation_actions(moderator_id uuid,subject_user_id uuid,action text,reason text,detail jsonb);
  `);
  // These are the audited production bodies, not simplified stand-ins for the legacy checks/RPCs.
  for(const row of originals)await db.exec(row.definition);
  await db.exec(`
    create table ojjuda_note.cards(id uuid primary key default gen_random_uuid(),author_id uuid,kind text default 'memo',body text,tags text[] default '{}',metadata jsonb,
      check(ojjuda_note_internal.valid_note_body(body)),check(ojjuda_note.valid_tags(tags)));
    create trigger note_card_blocked_words before insert or update of body,tags on ojjuda_note.cards
      for each row execute function ojjuda_note_internal.enforce_note_blocked_words();
    create trigger profiles_banned_words before insert or update of nickname,bio,mood_text on public.profiles
      for each row execute function public.check_banned_cols('nickname','bio','mood_text');
    alter table public.profiles enable row level security;
    create policy own_profiles on public.profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());
    alter table public.user_private enable row level security;
    create policy own_private on public.user_private to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    alter table public.world_board_comments enable row level security;
    create policy comments_read on public.world_board_comments for select to authenticated using(true);
    create policy comments_insert on public.world_board_comments for insert to authenticated
      with check(author_id=auth.uid() and not public.has_banned(body));
    create policy comments_update on public.world_board_comments for update to authenticated
      using(author_id=auth.uid()) with check(author_id=auth.uid() and not public.has_banned(body));
    grant select,insert,update on public.profiles,public.world_board_comments to authenticated;
    grant select,insert on public.user_private to authenticated;
    create function public.test_send_friend_message(p_recipient uuid,p_body text,p_request uuid) returns jsonb
      language sql security definer set search_path='' as $$select ojjuda_note_internal.send_friend_message(p_recipient,p_body,p_request)$$;
    create function public.test_submit_inquiry(p_request uuid,p_body text) returns uuid
      language sql security definer set search_path='' as $$select ojjuda_note_internal.submit_inquiry(p_request,p_body)$$;
    create function public.test_reply_inquiry(p_id uuid,p_reply text,p_expected timestamptz) returns void
      language sql security definer set search_path='' as $$select ojjuda_note_internal.admin_reply_inquiry(p_id,p_reply,p_expected)$$;
  `);
  const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
  const as=async(user,fn)=>{
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
    await db.exec('set role authenticated');
    try{return await fn();}finally{await db.exec('reset role');}
  };
  await db.query('insert into auth.users values($1),($2),($3)',[actor,peer,admin]);
  await db.query("insert into public.friendships values($1,$2,'accepted')",[actor,peer]);
  const definitionsBefore=(await db.query("select oid::regprocedure::text as name,prosecdef,proacl,proconfig from pg_proc where oid in('public.check_banned_cols()'::regprocedure,'ojjuda_note_internal.enforce_note_blocked_words()'::regprocedure)")).rows;
  const rlsBefore=(await db.query("select polname,pg_get_expr(polqual,polrelid) as qual,pg_get_expr(polwithcheck,polrelid) as checked from pg_policy where polrelid='public.world_board_comments'::regclass order by polname")).rows;
  await db.exec(migration.slice(0,migration.indexOf('-- BEGIN shared scalar trigger')));
  await db.exec(block('shared scalar trigger'));
  await db.exec(block('park trigger'));
  const memberBlock=block('changed member text trigger');
  await db.exec(memberBlock.slice(0,memberBlock.indexOf('\ncreate trigger ')));
  for(const table of ['ojjuda_note_internal.friend_messages','ojjuda_note_internal.inquiries','public.world_board_comments']){
    const statement=[...memberBlock.matchAll(/create trigger shared_word_mask[\s\S]*?;/g)].map(match=>match[0]).find(sql=>sql.includes(`on ${table}\n`));
    assert.ok(statement,`masked trigger for ${table}`);await db.exec(statement);
  }
  for(const signature of ['ojjuda_note_internal.valid_note_body(text)','ojjuda_note.valid_tags(text[])',
    'ojjuda_note_internal.send_friend_message(uuid,text,uuid)','ojjuda_note_internal.submit_inquiry(uuid,text)',
    'ojjuda_note_internal.admin_reply_inquiry(uuid,text,timestamp with time zone)',
    'ojjuda_groups_internal.activity_labels(jsonb,boolean)','public.ensure_member_for_note(text)',
    'public.admin_rename_user(uuid,text)'])await db.exec(patch(signature));
  for(const table of ['public.profiles','ojjuda_note_internal.friend_messages','ojjuda_note_internal.inquiries']){
    const changes=constraints.filter(sql=>sql.includes(`conrelid='${table}'::regclass`));
    assert.ok(changes.length,`constraints for ${table}`);for(const sql of changes)await db.exec(sql);
  }

  await t.test('the exact scalar trigger stores masks before member RLS while metadata and grants remain unchanged',async()=>{
    const metadata={evidence:'씨발',email:'member@example.com',url:'https://example.test/씨발'};
    const saved=await as(actor,()=>value('insert into public.profiles(id,nickname,bio,mood_text,metadata) values($1,$2,$3,$4,$5) returning to_jsonb(profiles) as value',
      [actor,'앞씨발뒤','기독교·010-1234-5678','좋은 날',metadata]));
    assert.equal(saved.nickname,`앞${HEARTS}뒤`);assert.equal(saved.bio,'기독교·010-1234-5678');assert.deepEqual(saved.metadata,metadata);
    const near='가'.repeat(10)+'씨발';
    await as(actor,()=>db.query('update public.profiles set nickname=$1 where id=$2',[near,actor]));
    assert.equal(await value('select nickname as value from public.profiles where id=$1',[actor]),'가'.repeat(10)+HEARTS);
    await as(actor,()=>db.query('update public.profiles set nickname=$1 where id=$2',['가'.repeat(11)+HEARTS,actor]));
    await assert.rejects(()=>as(actor,()=>db.query('update public.profiles set nickname=$1 where id=$2',['가'.repeat(13),actor])),error=>error.code==='23514');
    assert.deepEqual((await db.query("select oid::regprocedure::text as name,prosecdef,proacl,proconfig from pg_proc where oid in('public.check_banned_cols()'::regprocedure,'ojjuda_note_internal.enforce_note_blocked_words()'::regprocedure)")).rows,definitionsBefore);
  });

  await t.test('Park card, reply and event bodies/tags are masked and colliding tags are deduplicated in order',async()=>{
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    for(const kind of ['memo','comment','event']){
      const row=await value('insert into ojjuda_note.cards(author_id,kind,body,tags,metadata) values($1,$2,$3,$4,$5) returning to_jsonb(cards) as value',
        [actor,kind,'앞 씨.발 뒤',['씨발','fuck','산책','시발점'],{quote:'씨발'}]);
      assert.equal(row.body,`앞 ${HEARTS} 뒤`);assert.deepEqual(row.tags,[HEARTS,'산책','시발점']);assert.deepEqual(row.metadata,{quote:'씨발'});
      const edited=await value('update ojjuda_note.cards set body=$1,tags=$2 where id=$3 returning to_jsonb(cards) as value',
        ['수정 씨1발 끝',['안전','검증금지'],row.id]);
      assert.equal(edited.body,`수정 ${HEARTS} 끝`);assert.deepEqual(edited.tags,['안전',HEARTS]);
    }
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    assert.equal(await value('insert into ojjuda_note.cards(author_id,body) values(null,$1) returning body as value',['손님 씨발 글']),`손님 ${HEARTS} 글`);
  });

  await t.test('Park 200-character bodies and 20-character tags remain editable after masking without extending normal limits',async()=>{
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    const row=await value('insert into ojjuda_note.cards(author_id,body,tags) values($1,$2,$3) returning to_jsonb(cards) as value',
      [actor,'가'.repeat(198)+'씨발',['나'.repeat(18)+'씨발']]);
    assert.equal(row.body,'가'.repeat(198)+HEARTS);assert.deepEqual(row.tags,['나'.repeat(18)+HEARTS]);
    await db.query('update ojjuda_note.cards set body=$1,tags=$2 where id=$3',['가'.repeat(199)+HEARTS,['나'.repeat(19)+HEARTS],row.id]);
    assert.equal(await value('select ojjuda_note.valid_tags($1) as value',[[HEARTS,'산책']]),true);
    assert.equal(await value('select ojjuda_note.valid_tags($1) as value',[[HEARTS,HEARTS]]),false);
    assert.equal(await value('select ojjuda_note.valid_tags($1) as value',[['두 단어']]),false);
    await assert.rejects(()=>db.query('update ojjuda_note.cards set body=$1 where id=$2',['가'.repeat(201),row.id]),error=>error.code==='23514');
    await assert.rejects(()=>db.query('update ojjuda_note.cards set tags=$1 where id=$2',[['나'.repeat(21)],row.id]),error=>error.code==='23514');
    await assert.rejects(()=>db.query('update ojjuda_note.cards set tags=$1 where id=$2',[['산책','산책'],row.id]),error=>error.code==='23514');
  });

  await t.test('activity choices retain positions after masked collisions and accept canonical re-editing only for marker duplicates',async()=>{
    const labels=items=>value('select ojjuda_groups_internal.activity_labels($1,true) as value',[items]);
    const first=await labels(['씨발','fuck','산책']);
    assert.deepEqual(first,[HEARTS,HEARTS,'산책']);
    assert.deepEqual(await labels(first),first,'canonical choices can be opened and saved again without losing choice indices');
    await assert.rejects(()=>labels(['산책','산책']),/같은 이름/);
    await assert.rejects(()=>labels(['씨발','씨발']),/같은 이름/);
    assert.deepEqual(await labels(['가'.repeat(39)+HEARTS,'다른 항목']),['가'.repeat(39)+HEARTS,'다른 항목']);
    await assert.rejects(()=>labels(['가'.repeat(41),'다른 항목']),/1~40/);
  });

  await t.test('signup and administrator rename accept twelve logical units while preserving membership and admin checks',async()=>{
    const newcomer=randomUUID(),tooLong=randomUUID(),nickname='가'.repeat(11)+HEARTS;
    await db.query('insert into auth.users values($1),($2)',[newcomer,tooLong]);
    assert.equal(await as(newcomer,()=>value('select public.ensure_member_for_note($1) as value',[nickname])),true);
    assert.equal(await value('select nickname as value from public.profiles where id=$1',[newcomer]),nickname);
    assert.equal(await value('select user_id as value from public.user_private where user_id=$1',[newcomer]),newcomer);
    await assert.rejects(()=>as(tooLong,()=>value('select public.ensure_member_for_note($1) as value',['가'.repeat(13)])),error=>error.code==='22023');
    await assert.rejects(()=>as(null,()=>value('select public.ensure_member_for_note($1) as value',['이름'])),error=>error.code==='42501');
    await assert.rejects(()=>as(actor,()=>db.query('select public.admin_rename_user($1,$2)',[newcomer,'다른 이름'])),/not_admin/);
    const renamed='나'.repeat(11)+HEARTS;
    await as(admin,()=>db.query('select public.admin_rename_user($1,$2)',[newcomer,renamed]));
    assert.equal(await value('select nickname as value from public.profiles where id=$1',[newcomer]),renamed);
    await assert.rejects(()=>as(admin,()=>db.query('select public.admin_rename_user($1,$2)',[newcomer,'나'.repeat(13)])),/bad_nick/);
  });

  await t.test('friend messages replay the same original request once and expose only the stored canonical body',async()=>{
    const request=randomUUID(),original='앞 씨발 뒤';
    const send=body=>as(actor,()=>value('select public.test_send_friend_message($1,$2,$3) as value',[peer,body,request]));
    const first=await send(original),retry=await send(original);
    assert.equal(first.ok,true);assert.equal(retry.replayed,true);assert.equal(first.id,retry.id);
    assert.equal(await value('select count(*)::integer as value from ojjuda_note_internal.friend_messages where sender_id=$1 and request_id=$2',[actor,request]),1);
    assert.equal(await value('select body as value from ojjuda_note_internal.friend_messages where id=$1',[first.id]),`앞 ${HEARTS} 뒤`);
    await assert.rejects(()=>send('다른 내용'),error=>error.code==='22023'&&error.message==='request_conflict');
    const longRequest=randomUUID(),longBody='가'.repeat(999)+HEARTS;
    const long=await as(actor,()=>value('select public.test_send_friend_message($1,$2,$3) as value',[peer,longBody,longRequest]));
    assert.equal(await value('select body as value from ojjuda_note_internal.friend_messages where id=$1',[long.id]),longBody);
    await assert.rejects(()=>as(actor,()=>value('select public.test_send_friend_message($1,$2,$3) as value',[peer,'가'.repeat(1001),randomUUID()])),error=>error.code==='22023');
  });

  await t.test('inquiry and admin reply save canonical text, preserve retry IDs, and retain concurrency checks',async()=>{
    const request=randomUUID(),body='문의 씨발 내용';
    const submit=()=>as(actor,()=>value('select public.test_submit_inquiry($1,$2) as value',[request,body]));
    const id=await submit();assert.equal(await submit(),id);
    assert.equal(await value('select body as value from ojjuda_note_internal.inquiries where id=$1',[id]),`문의 ${HEARTS} 내용`);
    const previous=await value('select updated_at as value from ojjuda_note_internal.inquiries where id=$1',[id]);
    const reply='답변 씨.발 끝';
    await as(admin,()=>db.query('select public.test_reply_inquiry($1,$2,$3)',[id,reply,previous]));
    assert.equal(await value('select reply as value from ojjuda_note_internal.inquiries where id=$1',[id]),`답변 ${HEARTS} 끝`);
    await assert.rejects(()=>as(admin,()=>db.query('select public.test_reply_inquiry($1,$2,$3)',[id,'뒤늦은 답변',previous])),error=>error.code==='40001');
    assert.equal(await value('select count(*)::integer as value from ojjuda_note_internal.moderation_actions'),1);
    const long='가'.repeat(1999)+HEARTS;
    const longId=await as(actor,()=>value('select public.test_submit_inquiry($1,$2) as value',[randomUUID(),long]));
    assert.equal(await value('select body as value from ojjuda_note_internal.inquiries where id=$1',[longId]),long);
    const longVersion=await value('select updated_at as value from ojjuda_note_internal.inquiries where id=$1',[longId]);
    await as(admin,()=>db.query('select public.test_reply_inquiry($1,$2,$3)',[longId,long,longVersion]));
    assert.equal(await value('select reply as value from ojjuda_note_internal.inquiries where id=$1',[longId]),long);
  });

  await t.test('board-comment masking happens before unchanged NOT has_banned RLS with no private helper grants',async()=>{
    const metadata={quoted:'씨발'},original='댓글 씨발 내용';
    const row=await as(actor,()=>value('insert into public.world_board_comments(author_id,body,metadata) values($1,$2,$3) returning to_jsonb(world_board_comments) as value',[actor,original,metadata]));
    assert.equal(row.body,`댓글 ${HEARTS} 내용`);assert.deepEqual(row.metadata,metadata);
    assert.equal(await value('select public.has_banned($1) as value',[row.body]),false);
    await as(actor,()=>db.query('update public.world_board_comments set body=$1 where id=$2',['수정 씨 발 댓글',row.id]));
    assert.equal(await value('select body as value from public.world_board_comments where id=$1',[row.id]),`수정 ${HEARTS} 댓글`);
    assert.equal(await value("select has_schema_privilege('authenticated','ojjuda_note_internal','usage') as value"),false);
    assert.equal(await value("select has_function_privilege('authenticated','ojjuda_note_internal.mask_member_text()','execute') as value"),false);
    assert.deepEqual((await db.query("select polname,pg_get_expr(polqual,polrelid) as qual,pg_get_expr(polwithcheck,polrelid) as checked from pg_policy where polrelid='public.world_board_comments'::regclass order by polname")).rows,rlsBefore);
    await assert.rejects(()=>as(peer,()=>value('insert into public.world_board_comments(author_id,body) values($1,$2) returning id as value',[actor,'사칭'])),error=>error.code==='42501');
  });
});
