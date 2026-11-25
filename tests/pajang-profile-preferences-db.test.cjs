const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {PGlite} = require('@electric-sql/pglite');

const directory = path.join(__dirname, '../supabase/migrations');
const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
const migrationName = fs.readdirSync(directory).find(name => name.endsWith('_pajang_public_profile_preferences.sql'));
const account = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const person = n => `10000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const today = '2026-11-19';
const selection = () => ({
  relationship_intents:['dating', 'friendship'],
  meeting_styles:['deep_talk', 'cafe_talk'], relationship_values:['trust', 'honesty'],
  affection_styles:['make_time'], life_priorities:['family'],
  custom:{meeting_styles:['새벽시장 구경'], relationship_values:[], affection_styles:[], life_priorities:[]},
});

test('public Pajang preferences save atomically and relationship discovery preserves existing access rules', async t => {
  assert.ok(migrationName, 'the migration is created with supabase migration new');
  const migration = read(migrationName);
  const catalog = await import('../features/pajang/src/lib/profile-preferences.mjs');
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, suspended boolean not null default false);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create table public.profiles(id uuid primary key,nickname text);
    create schema ojjuda_account_internal;
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date,gender text);
    create schema ojjuda_restaurants_internal;
    create function ojjuda_restaurants_internal.require_member() returns uuid
      language plpgsql security definer set search_path='' as $$
      declare actor uuid:=auth.uid();
      begin
        if actor is null or not exists(select from auth.users where id=actor and not suspended) then
          raise exception 'member_required' using errcode='42501';
        end if;
        return actor;
      end;
    $$;
    create function public.ojjuda_location_preference(
      p_enabled boolean default null,p_expected_version bigint default null,p_account_id uuid default null
    ) returns jsonb language sql as $$select '{"enabled":false,"version":0}'::jsonb$$;
  `);
  const members = read('20261117060900_pajang_members.sql');
  await db.exec(members.slice(0, members.indexOf('insert into storage.buckets')));
  await db.exec(`
    alter table pajang_private.people alter column age drop not null;
    alter table pajang_private.people add column location_enabled boolean not null default false,
      add column location_version bigint not null default 0;
    alter table pajang_private.answers add column slot text not null default 'am',
      drop constraint answers_pkey, add primary key(person,day,slot);
    create table pajang_private.region_choices(region text primary key);
    insert into pajang_private.region_choices values ('서울특별시'),('서울특별시 종로구'),('경기도');
    create table pajang_private.discovery_gender_opt_ins(person uuid primary key);
    create function pajang_private.answer_window(timestamptz) returns table(day date,slot text,next_at timestamptz)
      language sql as $$select date '${today}','pm'::text,timestamptz '${today} 21:00:00+00'$$;
    create function pajang_private.question_for_window(date,text) returns jsonb
      language sql as $$select '{"id":"synthetic-question","q":["검사용 질문"]}'::jsonb$$;
    create function pajang_private.signal_quota(uuid,date) returns jsonb
      language sql as $$select '{"remaining":13,"paidRemaining":10,"signalPrice":10}'::jsonb$$;
  `);
  const answerFeed = read('20261117180000_pajang_answer_feed.sql');
  await db.exec(answerFeed.slice(0, answerFeed.indexOf('create or replace function public.pajang_member')));
  await db.exec(read('20261118093216_pajang_answer_history_one_year.sql'));
  // Model deployed publication and purchase changes absent from the old member snapshot.
  await db.exec(`
    alter table pajang_private.answers add column publication_window_days smallint not null default 30;
    create function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)
      returns boolean language sql immutable as $$
      select $1 between $4-(case when $6=365 then 365 else 30 end-1) and $4
        and (($1=$4 and $2=$5) or ($3 and ($1<$4 or ($2='am' and $5='pm'))));
    $$;
  `);
  const addPublication = sql => sql
    .replaceAll('a.archived,today,current_slot)', 'a.archived,today,current_slot,a.publication_window_days)')
    .replaceAll('a.archived,today,active_window.slot)', 'a.archived,today,active_window.slot,a.publication_window_days)');
  const memberSource = read('20261118084120_shared_park_pajang_location.sql');
  const memberFunction = memberSource.slice(memberSource.indexOf('CREATE OR REPLACE FUNCTION public.pajang_member'),
    memberSource.indexOf('-- An older Park tab'));
  await db.exec(addPublication(memberFunction).replace('return result;', 'return result||pajang_private.signal_quota(u,today);'));
  await db.exec(addPublication(read('20261118012000_pajang_owner_answer_history.sql')));
  await db.exec(`
    create function public.pajang_discovery_feed(p_cursor jsonb default null,p_interest text default 'all',p_order text default 'latest')
      returns jsonb language sql security invoker set search_path='' as $$
      select public.pajang_discovery_feed(p_cursor,p_interest,p_order,'all');
    $$;
    revoke all on function public.pajang_discovery_feed(jsonb,text,text,text),public.pajang_discovery_feed(jsonb,text,text)
      from public,anon,authenticated,service_role;
    grant execute on function public.pajang_discovery_feed(jsonb,text,text,text),public.pajang_discovery_feed(jsonb,text,text)
      to authenticated;
  `);
  await db.exec(read('20261117200000_pajang_exchange.sql'));
  // Use the actual moderation views and guarded read patch without the unrelated admin UI RPCs.
  const moderation = read('20261119002758_pajang_admin_moderation.sql');
  await db.exec(moderation.slice(0, moderation.indexOf('-- Reuse the existing private, expiring audit log')));
  await db.exec(moderation.slice(moderation.indexOf('create view pajang_private.visible_answers'),
    moderation.indexOf('create function ojjuda_admin_internal.pajang_require_admin')));
  for (let n=1;n<=9;n++) {
    await db.query('insert into auth.users values($1,$2)',[account(n),n===8]);
    await db.query('insert into public.profiles values($1,$2)',[account(n),`회원${n}`]);
    await db.query('insert into ojjuda_account_internal.member_identity values($1,$2,$3)',
      [account(n),n===7?'2010-01-01':'1990-01-01',n%2?'female':'male']);
    if (n<9) await db.query('insert into pajang_private.people(id,owner_id,name,region,interest) values($1,$2,$3,$4,$5)',
      [person(n),account(n),`회원${n}`,n===3?'경기도':'서울특별시',n===3?'walk':'coffee']);
  }
  await db.exec(`
    insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days) values
      ('${person(2)}','${today}','pm','현재 공개 답변',600,'검사용 질문',false,30),
      ('${person(3)}',date '${today}'-40,'am','1년 공개 답변',500,'지난 질문',true,365),
      ('${person(4)}','${today}','pm','관리자가 숨긴 답변',400,'검사용 질문',false,30),
      ('${person(5)}',date '${today}'-40,'pm','공개 기한 만료',300,'지난 질문',true,30),
      ('${person(6)}',date '${today}'-1,'pm','해당 회차만 공개',200,'지난 질문',false,30);
    insert into ojjuda_admin_internal.pajang_answer_moderation(person,day,slot,reason)
      values('${person(4)}','${today}','pm','검토 숨김');
    insert into pajang_private.exchange_profiles(person,fields) values
      ('${person(2)}','{"religion":"교환할 때만 공개","job":"비공개 직업"}');
  `);
  const definitions = async () => (await db.query(`
    select p.oid::regprocedure::text as name,pg_get_functiondef(p.oid) as definition,p.proacl,p.prosecdef,p.proconfig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','pajang_private') order by p.oid::regprocedure::text
  `)).rows;
  const before = await definitions();
  // A permissive installation default must not expose new objects accidentally.
  await db.exec('alter default privileges grant execute on functions to anon,authenticated,service_role; alter default privileges grant all on tables to anon,authenticated,service_role;');
  await db.exec(migration);
  const after = await definitions();
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  const rpc = (name,args=[]) => value(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args);
  const as = async (actor,fn,role='authenticated',extra={}) => {
    await db.exec('savepoint profile_request');
    try {
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,...extra})]);
      await db.exec(`set local role ${role}`);
      const result=await fn();
      await db.exec('reset role; release savepoint profile_request');
      return result;
    } catch(error) {
      await db.exec('rollback to savepoint profile_request; reset role; release savepoint profile_request');
      throw error;
    }
  };
  const save = (data,actor=account(1),setup=false) => as(actor,()=>rpc('pajang_profile_save',[data,setup]));
  const profile = (peer=null,actor=account(1)) => as(actor,()=>rpc('pajang_profile_preferences',[peer]));
  const feed = (intent='all',cursor=null,order='latest',gender='all',actor=account(1)) =>
    as(actor,()=>rpc('pajang_discovery_feed',[cursor,intent,order,gender]));
  const store = (n,preferences) => db.query(`insert into pajang_private.public_profile_preferences(person,preferences,version)
    values($1,pajang_private.normalize_public_profile_preferences($2),1)
    on conflict(person) do update set preferences=excluded.preferences`,[person(n),preferences]);
  // Install the existing protected profile RPC and the new unified editor
  // migration on the same fixture used for public preferences and exchange.
  await db.exec(`create or replace function public.mask_banned(t text) returns text
    language sql immutable set search_path='' as $mask$ select t $mask$;`);
  // Reproduce the already-installed original RPC without replaying its one-time
  // dynamic public-save text migration, which this older PGlite fixture does not need.
  const detailsSource=read('20261119062521_pajang_profile_details_editor.sql');
  await db.exec(detailsSource.slice(detailsSource.indexOf('create function pajang_private.profile_details('),
    detailsSource.indexOf('create function public.pajang_profile_details(')));
  await db.exec(`create function public.pajang_profile_details(p_action text default 'mine',
    p_data jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path=''
    as $rpc$ select pajang_private.profile_details(p_action,p_data) $rpc$;
    revoke all on function pajang_private.profile_details(text,jsonb),public.pajang_profile_details(text,jsonb)
      from public,anon,authenticated,service_role;
    grant execute on function pajang_private.profile_details(text,jsonb),public.pajang_profile_details(text,jsonb)
      to authenticated;`);
  await db.exec(read('20261122150000_pajang_unified_profile_editor.sql'));
  await db.exec(read('20261125025306_pajang_profile_character_selection.sql'));
  await db.exec(read('20261125031145_pajang_male_profile_characters.sql'));

  await db.exec(read('20261125044350_pajang_five_tastes_per_list.sql'));

  t.beforeEach(()=>db.exec('begin'));
  t.afterEach(()=>db.exec('rollback'));

  await t.test('the member state shares only outfit IDs with self and mutually connected unblocked peers',async()=>{
    await db.exec(read('20261125041640_pajang_connected_chat_avatar_ids.sql'));
    const state = (n, input={}) => as(account(n),()=>rpc('pajang_member',['state',input]));
    const peer = (s,n) => s.people.find(p=>p.id===person(n));
    for (const [n,id] of [[1,200],[2,101],[3,131],[4,153]]) {
      await db.query('update pajang_private.people set avatar=$1::jsonb where id=$2',
        [{id,form:'mini',bg:8},person(n)]);
    }
    for (const [a,b] of [[1,2],[2,1],[1,3],[4,1]]) {
      await db.query('insert into pajang_private.signals(src,dst,day,note,at) values($1,$2,$3,$4,1000)',
        [person(a),person(b),today,'']);
    }
    const mine=await state(1);
    assert.equal(mine.me.avatarId,200);
    assert.equal(peer(mine,2).avatarId,101);
    assert.equal(peer(await state(2),1).avatarId,200);
    assert.equal((await state(5)).me.avatarId,1);
    for (const n of [3,4]) assert.ok(!Object.hasOwn(peer(mine,n),'avatarId'));
    assert.ok(!Object.hasOwn(peer(await state(5,{peer:person(1)}),2),'avatarId'),
      'an unrelated viewer cannot impersonate another person by submitting a selector');
    assert.ok(!Object.hasOwn(mine.me,'avatar') && !Object.hasOwn(peer(mine,2),'avatar'));
    assert.ok(!JSON.stringify(peer(mine,2)).includes('비공개 직업'));
    for (const [a,b] of [[1,2],[2,1]]) {
      await db.query('insert into pajang_private.blocks values($1,$2)',[person(a),person(b)]);
      assert.equal(peer(await state(1),2),undefined);
      assert.equal(peer(await state(2),1),undefined);
      await db.query('delete from pajang_private.blocks where src=$1 and dst=$2',[person(a),person(b)]);
    }
    await assert.rejects(()=>state(8),{code:'42501'});
    await assert.rejects(()=>as(account(1),()=>rpc('pajang_member',['state',{}]),'anon'),{code:'42501'});
  });

  await t.test('account gender is selected at entry and an explicit hide survives profile reads',async()=>{
    const discovery=read('20261117210000_pajang_discovery_gender.sql');
    await db.exec(discovery.slice(discovery.indexOf('create function public.pajang_discovery_visibility'),
      discovery.indexOf('create function public.pajang_discovery_feed')));
    await db.exec(read('20261125110000_pajang_member_gender_defaults.sql'));
    const entry=await as(account(1),()=>rpc('pajang_member',['entry',{}]));
    assert.equal(entry.accountGender,'female');
    assert.equal(entry.genderSharePending,true);
    const share={day:today,slot:'pm',body:'함께 걷기',questionId:'synthetic-question',shareAccountGender:true};
    await as(account(1),()=>rpc('pajang_member',['answer',share]));
    assert.equal((await as(account(1),()=>rpc('pajang_member',['entry',{}]))).genderSharePending,false);
    assert.equal((await as(account(3),()=>rpc('pajang_profile_preferences',[person(1)]))).gender,'female');
    await as(account(1),()=>rpc('pajang_discovery_visibility',[false]));
    await as(account(1),()=>rpc('pajang_member',['answer',share]));
    assert.equal((await as(account(3),()=>rpc('pajang_profile_preferences',[person(1)]))).gender,null);
    const readPublic=()=>as(account(1),()=>rpc('pajang_profile_preferences',[person(2)]));
    await as(account(2),()=>rpc('pajang_discovery_visibility',[true]));
    assert.equal((await readPublic()).gender,'male');
    await as(account(2),()=>rpc('pajang_discovery_visibility',[false]));
    assert.equal((await readPublic()).gender,null);
    assert.equal(await value('select gender_visibility_choice as value from pajang_private.people where id=$1',[person(2)]),false);
  });

  await t.test('unset members appear immediately and an explicit hide covers cards, profile, filters and state',async()=>{
    const discovery=read('20261117210000_pajang_discovery_gender.sql');
    await db.exec(discovery.slice(discovery.indexOf('create function public.pajang_discovery_visibility'),
      discovery.indexOf('create function public.pajang_discovery_feed')));
    const radar=read('20261121165547_pajang_nearby_recent_answers.sql');
    await db.exec(radar.slice(radar.indexOf('create function pajang_private.nearby_people'),radar.indexOf('revoke all on function')));
    await db.exec(read('20261125110000_pajang_member_gender_defaults.sql'));
    await db.exec(read('20261125114508_pajang_member_gender_borders.sql'));
    await db.exec(read('20261125120844_pajang_combined_visibility_defaults.sql'));
    const editor=(n,p_action,p_data={})=>as(account(n),()=>rpc('pajang_profile_details',[p_action,p_data]));
    const current=await editor(3,'mine');
    assert.equal(current.showAge,true);
    assert.equal(current.showGender,true);
    const previous=await editor(2,'mine');
    assert.equal(previous.showAge,false);
    assert.equal(previous.showGender,false);
    const edit=async(patch)=>{
      const mine=await editor(3,'mine');
      return editor(3,'save',{profilePerson:person(3),fields:{},preferencesVersion:mine.preferencesVersion,...patch});
    };
    await edit({showAge:false,showGender:false});
    assert.equal((await profile(person(3))).gender,null);
    let accepted=await value('select pajang_private.exchange_profile($1,false) as value',[person(3)]);
    assert.equal(accepted.age,null);
    assert.equal(accepted.gender,null);
    const unrelated=await edit({});
    assert.equal(unrelated.showAge,false);
    assert.equal(unrelated.showGender,false);
    await as(account(3),()=>rpc('pajang_discovery_visibility',[true]));
    assert.equal((await editor(3,'mine')).showGender,true);
    assert.equal((await editor(3,'mine')).showAge,false);
    await edit({showAge:true});
    accepted=await value('select pajang_private.exchange_profile($1,false) as value',[person(3)]);
    assert.ok(accepted.age>=19);
    assert.equal(accepted.gender,'여성');
    const card=async(n,gender='all')=>(await feed('all',null,'latest',gender)).items.find(item=>item.peer===person(n));
    const visibility=visible=>as(account(3),()=>rpc('pajang_discovery_visibility',[visible]));
    assert.equal((await card(3,'female')).gender,'female');
    assert.equal((await profile(person(3))).gender,'female');
    assert.equal((await visibility(null)).visible,true);
    assert.equal((await card(2)).gender,null,'a previous explicit hide survives migration');
    assert.equal(await card(2,'male'),undefined);
    await visibility(false);
    assert.equal((await card(3)).gender,null);
    assert.equal((await profile(person(3))).gender,null);
    assert.equal(await card(3,'female'),undefined);
    await as(account(3),()=>rpc('pajang_member',['answer',{day:today,slot:'pm',body:'함께 걷기',questionId:'synthetic-question',shareAccountGender:true}]));
    assert.equal((await visibility(null)).hidden,true,'a stale posting client cannot undo a hide');
    await visibility(true);
    const state=await as(account(1),()=>rpc('pajang_member',['state',{}]));
    assert.equal(state.people.find(p=>p.id===person(3)).gender,'female');
    assert.equal(state.me.gender,'female');
    await assert.rejects(as(account(1),()=>value('select pajang_private.visible_member_gender($1) as value',[person(3)])));
  });

  await t.test('one save updates public fields and private exchange data atomically',async()=>{
    const current=await as(account(1),()=>rpc('pajang_profile_details',['mine',{}]));
    const initialAvatar = {id:1,form:'full',bg:0};
    const pickedAvatar = {id:100,form:'mini',bg:8};
    assert.deepEqual(current.avatar,initialAvatar);
    assert.equal(current.person,person(1));
    assert.equal(current.name,'회원1');
    assert.equal(current.region,'서울특별시');
    assert.deepEqual(current.preferences.relationship_intents,[]);
    const submitted={profilePerson:person(1),avatar:pickedAvatar,previousAvatar:initialAvatar,name:'통합 회원',region:'경기도',
      interest:'book',fields:{job:'서점 직원',bio:'교환 뒤 보여요.'},
      showAge:true,showGender:false,preferences:{relationship_intents:['conversation'],meeting_styles:['deep_talk']},
      preferencesVersion:0};
    const saved=await as(account(1),()=>rpc('pajang_profile_details',['save',submitted]));
    assert.equal(saved.name,'통합 회원');
    assert.equal(saved.region,'경기도');
    assert.equal(saved.interest,'book');
    assert.equal(saved.fields.job,'서점 직원');
    assert.equal(saved.fields.bio,'교환 뒤 보여요.');
    assert.equal(saved.showAge,true);
    assert.deepEqual(saved.preferences.relationship_intents,['conversation']);
    assert.deepEqual(saved.preferences.meeting_styles,['deep_talk']);
    assert.equal(saved.preferencesVersion,1);
    const reopened=await as(account(1),()=>rpc('pajang_profile_details',['mine',{}]));
    assert.deepEqual(reopened.avatar,pickedAvatar);
    await assert.rejects(()=>as(account(1),()=>rpc('pajang_profile_details',['save',
      {...submitted,avatar:{...pickedAvatar,bg:0},preferencesVersion:1}])),{code:'40001'});
    await assert.rejects(()=>as(account(1),()=>rpc('pajang_profile_details',['save',
      {...submitted,previousAvatar:pickedAvatar,avatar:{...pickedAvatar,id:101},preferencesVersion:1}])),{code:'23514'});
    assert.equal(reopened.name,'통합 회원');
    assert.equal(reopened.region,'경기도');
    assert.equal(reopened.fields.job,'서점 직원');
    assert.equal((await profile()).preferences.relationship_intents[0],'conversation');
    assert.ok(!JSON.stringify(await profile()).includes('서점 직원'),
      'unauthorized viewers cannot retrieve exchanged details in the public preferences read');

    await assert.rejects(()=>as(account(1),()=>rpc('pajang_profile_details',['save',
      {...submitted,name:'오래된 요청',fields:{job:'변경 실패'},preferencesVersion:0}])),{code:'PT412'});
    assert.equal(await value('select name as value from pajang_private.people where id=$1',[person(1)]),'통합 회원');
    assert.equal((await as(account(1),()=>rpc('pajang_profile_details',['mine',{}]))).fields.job,'서점 직원');

    await assert.rejects(()=>as(account(1),()=>rpc('pajang_profile_details',['save',
      {...submitted,name:'저장되면 안 됨',fields:{height:'301'},preferencesVersion:1}])),{code:'22023'});
    assert.equal(await value('select name as value from pajang_private.people where id=$1',[person(1)]),'통합 회원');
    assert.equal((await as(account(1),()=>rpc('pajang_profile_details',['mine',{}]))).fields.job,'서점 직원');
    await assert.rejects(()=>as(account(2),()=>rpc('pajang_profile_details',['save',submitted])),{code:'42501'});
    await assert.rejects(()=>as(account(1),()=>rpc('pajang_profile_details',['save',
      {...submitted,preferencesVersion:1,secret:'not allowed'}])),{code:'22023'});

    // Older versions that save only exchange details keep the public fields.
    const legacy=await as(account(1),()=>rpc('pajang_profile_details',['save',{
      profilePerson:person(1),fields:{job:'이전 앱에서 수정'},showAge:true,showGender:false,
      interest:'book',preferences:{meeting_styles:['deep_talk']},preferencesVersion:1
    }]));
    assert.deepEqual(legacy.avatar,pickedAvatar);
    assert.equal(legacy.name,'통합 회원');
    assert.equal(legacy.region,'경기도');
    assert.deepEqual(legacy.preferences.relationship_intents,['conversation']);
    assert.equal(legacy.fields.job,'이전 앱에서 수정');
    const def=await db.query(`select proconfig,prosecdef from pg_proc
      where oid='pajang_private.profile_details(text,jsonb)'::regprocedure`);
    assert.equal(def.rows[0].prosecdef,true);
    assert.deepEqual(def.rows[0].proconfig,['search_path=""']);
  });

  await t.test('old and new profile editors can share male avatar state without losing a newer choice', async () => {
    const latest = {avatarCatalog:2};
    const readProfile = (opts = {}) => as(account(1), () => rpc('pajang_profile_details', ['mine',opts]));
    const saveProfile = async (patch, opts = {}) => {
      const profile = await readProfile(opts);
      return as(account(1), () => rpc('pajang_profile_details', ['save',{
        ...opts, profilePerson:profile.person, preferencesVersion:profile.preferencesVersion,
        fields:profile.fields, showAge:profile.showAge, showGender:profile.showGender, ...patch,
      }]));
    };

    const original = (await readProfile()).avatar;
    const male = {id:200,form:'mini',bg:8};
    assert.deepEqual((await readProfile(latest)).avatar,original);
    assert.deepEqual((await saveProfile({avatar:male,previousAvatar:original},latest)).avatar,male);

    const projected = (await readProfile()).avatar;
    assert.deepEqual(projected,{id:100,form:'mini',bg:8,catalogId:200});
    await saveProfile({fields:{job:'서점 직원'}});
    assert.deepEqual((await readProfile(latest)).avatar,male);
    const oldBackground = {...projected,bg:3};
    await saveProfile({previousAvatar:projected,avatar:oldBackground});
    assert.deepEqual((await readProfile(latest)).avatar,{...male,bg:3});

    // Simulate a cached tab selecting a new outfit after another tab chose a male character.
    await assert.rejects(() => saveProfile({previousAvatar:original,avatar:{...original,id:3}}), {code:'40001'});
    const current = (await readProfile(latest)).avatar;
    await assert.rejects(() => saveProfile({previousAvatar:current,avatar:{...current,id:201}},latest));
    await assert.rejects(() => saveProfile({previousAvatar:current,avatar:{...current,bg:9}},latest));
    assert.deepEqual((await readProfile(latest)).avatar,current);

    const oldCurrent = (await readProfile()).avatar;
    const oldChoice = {...oldCurrent,id:7,form:'full'};
    await saveProfile({previousAvatar:oldCurrent,avatar:oldChoice});
    assert.deepEqual((await readProfile(latest)).avatar,{id:7,form:'full',bg:3});
  });

  await t.test('patches only discovery filters and preserves member, payment, exchange and grants',async()=>{
    const feedName='pajang_discovery_feed(jsonb,text,text,text)';
    for(const original of before) {
      const current=after.find(row=>row.name===original.name);
      assert.ok(current,original.name);
      if(original.name!==feedName) assert.deepEqual(current,original,`${original.name} stays untouched`);
      else {
        assert.equal(current.prosecdef,original.prosecdef);
        assert.deepEqual(current.proacl,original.proacl);
        assert.deepEqual(current.proconfig,original.proconfig);
        assert.match(current.definition,/a\.publication_window_days/);
        assert.match(current.definition,/pajang_private\.visible_answers/g);
        assert.match(current.definition,/relationship_intents/);
      }
    }
    const state=await save({name:'새 이름'});
    assert.equal(state.me.name,'새 이름');
    assert.equal(state.remaining,13);
    assert.equal(state.paidRemaining,10);
    assert.deepEqual((await profile()).preferences.relationship_intents,[]);
    assert.equal(await value('select count(*)::int as value from pajang_private.public_profile_preferences'),0,'no inferred or backfilled selection');
  });

  await t.test('caps legacy lists on read without rewriting stored choices on a no-op',async()=>{
    const legacy=selection();
    legacy.meeting_styles=catalog.profilePreferenceGroups[0].options.slice(3,10).map(item=>item.key);
    legacy.custom.life_priorities=['첫째','둘째','셋째','넷째','다섯째'];
    await store(1,legacy);
    const capped=(await profile()).preferences;
    assert.deepEqual(capped,catalog.normalizeProfilePreferences(legacy));
    assert.deepEqual(capped.meeting_styles,legacy.meeting_styles.slice(0,5));
    assert.deepEqual(capped.custom.life_priorities,legacy.custom.life_priorities.slice(0,4));
    const noOp=await save({preferences:capped,preferencesVersion:1});
    assert.equal(noOp.me.preferencesVersion,1);
    assert.deepEqual(await value("select preferences->'meeting_styles' as value from pajang_private.public_profile_preferences where person=$1",[person(1)]),legacy.meeting_styles);
  });

  await t.test('saves five combined choices per list, custom text and basic profile in one operation',async()=>{
    const preferences=selection();
    preferences.meeting_styles.push('deep_talk');
    preferences.custom.meeting_styles=['  새벽시장 구경  ','새벽시장 구경','별 보러 가기'];
    const saved=await save({name:'바뀐 이름',region:'경기도',preferences,preferencesVersion:0});
    assert.equal(saved.me.name,'바뀐 이름');
    assert.equal(saved.me.preferencesVersion,1);
    assert.deepEqual(saved.me.preferences.meeting_styles,['deep_talk','cafe_talk']);
    assert.deepEqual(saved.me.preferences.custom.meeting_styles,['새벽시장 구경','별 보러 가기']);
    assert.deepEqual((await profile()).preferences,saved.me.preferences);
    const allChoices={relationship_intents:catalog.relationshipIntents.map(item=>item.key)};
    for(const group of catalog.profilePreferenceGroups) allChoices[group.key]=group.options.slice(0,group.key==='meeting_styles'?3:5).map(item=>item.key);
    const all=await save({preferences:allChoices,preferencesVersion:1});
    for(const group of catalog.profilePreferenceGroups) assert.deepEqual(all.me.preferences[group.key],allChoices[group.key]);
    assert.deepEqual(all.me.preferences.relationship_intents,allChoices.relationship_intents);
    assert.deepEqual(all.me.preferences.custom.meeting_styles,['새벽시장 구경','별 보러 가기'],'omitted nested choices survive');
    const cleared=await save({preferences:{relationship_intents:[],custom:{meeting_styles:[]}},preferencesVersion:2});
    assert.deepEqual(cleared.me.preferences.relationship_intents,[]);
    assert.deepEqual(cleared.me.preferences.custom.meeting_styles,[]);
    assert.equal(cleared.me.preferences.life_priorities.length,5);
    await as(account(1),()=>rpc('pajang_member',['profile',{name:'구버전 저장',interest:'walk'}]));
    assert.deepEqual((await profile()).preferences,cleared.me.preferences,'legacy profile writes preserve new choices');
    assert.equal((await profile()).version,3);
    const same=await save({preferences:{relationship_intents:[]},preferencesVersion:3});
    assert.equal(same.me.preferencesVersion,3,'unchanged selections do not advance the version');
  });

  await t.test('rejects invalid data or stale edits without partially saving the nickname',async()=>{
    const invalid=[
      null,[],{unknown:[]},{relationship_intents:['unknown']},{relationship_intents:'dating'},
      {meeting_styles:[null]},{meeting_styles:['unknown']},{life_priorities:['trust']},
      {meeting_styles:catalog.profilePreferenceGroups[0].options.slice(0,6).map(item=>item.key)},
      {meeting_styles:catalog.profilePreferenceGroups[0].options.slice(0,5).map(item=>item.key),custom:{meeting_styles:['새 취향']}},
      {custom:{meeting_styles:Array.from({length:6},(_,i)=>'취향'+i)}},
      {custom:null},{custom:{unknown:[]}},{custom:{meeting_styles:'text'}},
      {custom:{meeting_styles:['   ']}},{custom:{meeting_styles:[42]}},
      {custom:{meeting_styles:['가'.repeat(41)]}},
      {meeting_styles:catalog.profilePreferenceGroups[0].options.map(item=>item.key),custom:{meeting_styles:Array.from({length:9},(_,i)=>`직접 ${i}`)}},
    ];
    for(const preferences of invalid) {
      await assert.rejects(()=>save({name:'저장되면 안됨',preferences,preferencesVersion:0}),{code:'22023'});
      assert.equal(await value('select name as value from pajang_private.people where id=$1',[person(1)]),'회원1');
      assert.equal((await profile()).version,0);
    }
    for(const version of [undefined,null,-1,'0',0.5]) {
      const payload={name:'저장되면 안됨',preferences:selection()};
      if(version!==undefined)payload.preferencesVersion=version;
      await assert.rejects(()=>save(payload),{code:'22023'});
    }
    await save({preferences:selection(),preferencesVersion:0});
    await assert.rejects(()=>save({name:'다른 계정 초안',profilePerson:person(2),preferences:selection(),preferencesVersion:1}),{code:'42501'});
    assert.equal(await value('select name as value from pajang_private.people where id=$1',[person(1)]),'회원1');
    await assert.rejects(()=>save({name:'오래된 창',preferences:{relationship_intents:['marriage']},preferencesVersion:0}),{code:'PT412'});
    assert.equal(await value('select name as value from pajang_private.people where id=$1',[person(1)]),'회원1');
    assert.deepEqual((await profile()).preferences.relationship_intents,['dating','friendship']);
    const unicode=await save({preferences:{custom:{meeting_styles:['🌿'.repeat(40)]}},preferencesVersion:1});
    assert.equal([...unicode.me.preferences.custom.meeting_styles[0]].length,40);
  });

  await t.test('first participation is atomic, consented and harmless to retry',async()=>{
    await assert.rejects(()=>save({name:'첫 참여',preferences:selection(),preferencesVersion:0},account(9),true));
    assert.equal(await value('select count(*)::int as value from pajang_private.people where owner_id=$1',[account(9)]),0);
    await assert.rejects(()=>save({name:'첫 참여',consent:true,preferences:{meeting_styles:['invalid']},preferencesVersion:0},account(9),true),{code:'22023'});
    assert.equal(await value('select count(*)::int as value from pajang_private.people where owner_id=$1',[account(9)]),0);
    const joined=await save({name:'첫 참여',consent:true,preferences:selection(),preferencesVersion:0},account(9),true);
    assert.equal(joined.me.preferencesVersion,1);
    const retry=await save({name:'재시도 이름',consent:true,preferences:{relationship_intents:['marriage']},preferencesVersion:0},account(9),true);
    assert.equal(retry.me.name,'첫 참여');
    assert.deepEqual(retry.me.preferences,joined.me.preferences);
    assert.equal(retry.me.preferencesVersion,1);
    await db.query('delete from auth.users where id=$1',[account(9)]);
    assert.equal(await value('select count(*)::int as value from pajang_private.public_profile_preferences where person=$1',[joined.me.id]),0,'withdrawal cascades');
  });

  await t.test('requires an eligible authenticated actor and denies direct data access',async()=>{
    const operations=[()=>rpc('pajang_profile_preferences',[null]),()=>rpc('pajang_profile_save',[{name:'금지'},false])];
    for(const [actor,role,claims] of [[null,'authenticated',{}],[account(1),'anon',{}],[account(1),'service_role',{}],
      [account(7),'authenticated',{}],[account(8),'authenticated',{}],[account(1),'authenticated',{is_anonymous:true}]]) {
      for(const operation of operations)await assert.rejects(()=>as(actor,operation,role,claims),{code:'42501'});
    }
    await assert.rejects(()=>profile(null,account(9)),{code:'42501'});
    for(const role of ['anon','authenticated','service_role']) {
      await assert.rejects(()=>as(account(1),()=>db.query('select * from pajang_private.public_profile_preferences'),role),{code:'42501'});
    }
    assert.equal(await value("select relrowsecurity as value from pg_class where oid='pajang_private.public_profile_preferences'::regclass"),true);
    assert.equal(await value("select has_schema_privilege('authenticated','pajang_private','USAGE') as value"),false);
    for(const name of ['pajang_profile_preferences','pajang_profile_save']) {
      assert.equal(after.find(row=>row.name.startsWith(`${name}(`)).prosecdef,false,'public entrypoint is an invoker wrapper');
    }
    await save({owner_id:account(2),person:person(2),preferences:selection(),preferencesVersion:0});
    assert.equal(await value('select count(*)::int as value from pajang_private.public_profile_preferences where person=$1',[person(2)]),0,'caller cannot select the saved owner');
  });

  await t.test('reads only self, visible answer authors or existing signal peers and respects both block directions',async()=>{
    await store(2,{relationship_intents:['conversation'],meeting_styles:['deep_talk']});
    const visible=await profile(person(2));
    assert.equal(visible.person,person(2));
    assert.deepEqual(visible.preferences.relationship_intents,['conversation']);
    assert.deepEqual(Object.keys(visible).sort(),['person','preferences','version']);
    assert.ok(!JSON.stringify(visible).includes('교환할 때만 공개'));
    assert.equal((await profile(person(3))).person,person(3),'published past answers are still reachable');
    for(const peer of [person(4),person(5),person(6),person(99),account(2)]) {
      await assert.rejects(()=>profile(peer),{code:'42501'});
    }
    await db.query('insert into pajang_private.signals values($1,$2,$3,$4,$5)',[person(1),person(5),today,'',1]);
    assert.equal((await profile(person(5))).person,person(5),'existing signal remains a profile entrypoint');
    for(const [src,dst] of [[person(1),person(2)],[person(2),person(1)]]) {
      await db.query('insert into pajang_private.blocks values($1,$2)',[src,dst]);
      await assert.rejects(()=>profile(person(2)),{code:'42501'});
      await db.query('delete from pajang_private.blocks where src=$1 and dst=$2',[src,dst]);
    }
    await db.query('insert into pajang_private.blocks values($1,$2)',[person(5),person(1)]);
    await assert.rejects(()=>profile(person(5)),{code:'42501'});
  });

  await t.test('relationship filters run before counts and pagination and preserve legacy filters',async()=>{
    await store(2,{relationship_intents:['conversation','dating']});
    await store(3,{relationship_intents:['friendship','marriage']});
    await store(4,{relationship_intents:['dating']});
    await store(5,{relationship_intents:['dating']});
    assert.equal((await feed('dating')).total,1,'hidden and expired answers are excluded');
    assert.deepEqual((await feed('dating')).items[0].relationship_intents,['conversation','dating']);
    assert.equal((await feed('marriage')).total,1);
    assert.equal((await feed('casual')).total,0);
    assert.equal((await feed('all')).total,2);
    assert.equal((await feed('coffee')).total,1);
    assert.equal((await feed('walk')).total,1);
    assert.equal((await feed('dating',null,'latest','male')).total,0,'gender still needs its separate opt-in');
    await db.query('insert into pajang_private.discovery_gender_opt_ins values($1)',[person(2)]);
    assert.equal((await feed('dating',null,'latest','male')).total,1);
    assert.equal((await feed('all',null,'local')).items[0].peer,person(2));
    await db.query('insert into pajang_private.blocks values($1,$2)',[person(2),person(1)]);
    assert.equal((await feed('dating')).total,0);
    await db.query('delete from pajang_private.blocks where src=$1',[person(2)]);
    for(let n=20;n<50;n++) {
      await db.query('insert into auth.users(id) values($1)',[account(n)]);
      await db.query('insert into pajang_private.people(id,owner_id,name,region,interest) values($1,$2,$3,$4,$5)',
        [person(n),account(n),`친구${n}`,'서울특별시','coffee']);
      await db.query(`insert into pajang_private.answers(person,day,slot,body,at,question_prompt)
        values($1,$2,'pm','새 답변',$3,'현재 질문')`,[person(n),today,1000+n]);
      if(n!==49)await store(n,{relationship_intents:['friendship',...(n%2?['casual']:[])]});
    }
    const first=await feed('friendship');
    assert.equal(first.total,30);
    assert.equal(first.items.length,24);
    assert.equal(first.nextCursor.interest,'friendship');
    const second=await feed('friendship',first.nextCursor);
    assert.equal(second.total,30);
    assert.equal(second.items.length,6);
    assert.equal(second.nextCursor,null);
    assert.equal(new Set([...first.items,...second.items].map(item=>`${item.peer}/${item.day}/${item.slot}`)).size,30);
    assert.ok(![...first.items,...second.items].some(item=>item.peer===person(49)),'unselected members are not inferred into a relationship');
    assert.ok((await feed('all')).items.some(item=>item.peer===person(49)),'unselected members remain in All');
    await assert.rejects(()=>feed('dating',first.nextCursor),{code:'22023'});
    await assert.rejects(()=>feed('unknown'),{code:'22023'});
    const legacy=await as(account(1),()=>rpc('pajang_discovery_feed',[null,'coffee','latest']));
    assert.equal(legacy.total,31,'three-argument clients keep working');
  });

  await t.test('fails closed if the audited discovery anchors have drifted',async()=>{
    const original=before.find(row=>row.name==='pajang_discovery_feed(jsonb,text,text,text)').definition;
    await db.exec(original.replace("and (p_interest='all' or p.interest=p_interest)","and (p_interest='all' or p.interest=p_interest or false)"));
    const start=migration.indexOf('do $migration$');
    const end=migration.indexOf('$migration$;',start)+'$migration$;'.length;
    assert.ok(start>=0 && end>start);
    await db.exec('savepoint drift');
    await assert.rejects(()=>db.exec(migration.slice(start,end)),/Unexpected Pajang discovery/);
    await db.exec('rollback to savepoint drift; release savepoint drift');
    assert.equal((await definitions()).find(row=>row.name==='pajang_member(text,jsonb)').definition,
      before.find(row=>row.name==='pajang_member(text,jsonb)').definition);
  });
});
