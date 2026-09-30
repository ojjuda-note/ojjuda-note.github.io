const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260929042447_world_rpc_security_boundaries.sql'), 'utf8');
const helperSql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260930230517_scope_world_privacy_helpers.sql'), 'utf8');

(async () => {
  const db = new PGlite();
  const alice = '00000000-0000-4000-8000-000000000001';
  const bob = '00000000-0000-4000-8000-000000000002';
  const outsider = '00000000-0000-4000-8000-000000000003';
  const banned = '00000000-0000-4000-8000-000000000004';
  const game = '00000000-0000-4000-8000-000000000010';
  const friendsFolder = '00000000-0000-4000-8000-000000000011';
  const privateFolder = '00000000-0000-4000-8000-000000000012';
  const chosenFolder = '00000000-0000-4000-8000-000000000013';
  const closedFolder = '00000000-0000-4000-8000-000000000014';
  const value = async (query, args = []) => (await db.query(query, args)).rows[0]?.value;
  const signIn = async id => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
    await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
  };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table public.board_games(id uuid primary key,kind text,status text,p1 uuid,p2 uuid,
        turn text,moves jsonb default '[]',updated_at timestamptz default now(),result text,reason text,undo_requested_by uuid);
      create table public.user_private(user_id uuid primary key,coins integer,owned text[] default '{}',banned_until timestamptz);
      create table public.coin_charges(user_id uuid,pack text,coins integer,won integer,free boolean,created_at timestamptz default now());
      create table public.app_config(key text primary key,value jsonb);
      create table public.shop_items(key text primary key,name text,price integer,active boolean default true);
      create table public.guestbook(owner_id uuid,author_id uuid default auth.uid(),author_nick text,body text,created_at timestamptz default now());
      create table public.profiles(id uuid primary key,door_closed boolean default false);
      create table public.friendships(requester uuid,addressee uuid,status text);
      create table public.blocks(blocker uuid,blocked uuid);
      create table public.media_folders(id uuid primary key,user_id uuid,visibility text,allowed uuid[] default '{}');
      create function public.door_open(uid uuid) returns boolean language sql stable security definer
        set search_path to '' as $$select not coalesce((select door_closed from public.profiles where id=uid),false)$$;
      grant insert on guestbook to authenticated;
      insert into app_config values('beta_free_charge','true'),('beta_charge_daily_limit','2');
      insert into user_private(user_id,coins) values('${alice}',100),('${bob}',10);
      insert into user_private(user_id,coins,banned_until) values('${banned}',0,now()+interval '1 day');
      insert into profiles values('${alice}',false),('${bob}',false),('${outsider}',false),('${banned}',true);
      insert into friendships values('${alice}','${bob}','accepted'),('${bob}','${banned}','accepted');
      insert into blocks values('${bob}','${outsider}'),('${alice}','${banned}');
      insert into media_folders values
        ('${friendsFolder}','${bob}','friends','{}'),('${privateFolder}','${bob}','private','{}'),
        ('${chosenFolder}','${bob}','chosen',array['${alice}'::uuid]),('${closedFolder}','${banned}','all','{}');
      insert into shop_items values('item:flower','꽃',5,true);
      insert into board_games(id,kind,status,p1,p2,turn) values('${game}','carom4','playing','${alice}','${bob}','p1');`);
    await db.exec(helperSql);
    await db.exec(sql);
    await db.exec('create trigger guard before insert on guestbook for each row execute function public.guestbook_guard()');

    // Real policy paths retain authenticated EXECUTE; an arbitrary viewer cannot
    // ask the same definer helpers about two other members or impersonate an owner.
    await db.exec(`
      alter table friendships enable row level security;
      create policy friendships_select on friendships for select to authenticated
        using(requester=(select auth.uid()) or addressee=(select auth.uid()));
      alter table blocks enable row level security;
      create policy blocks_select on blocks for select to authenticated using(blocker=(select auth.uid()));
      alter table media_folders enable row level security;
      create policy media_folders_select on media_folders for select to authenticated
        using(user_id=(select auth.uid()) or public.folder_can_see(id,(select auth.uid())));
      create table public.helper_diaries(user_id uuid,visibility text);
      alter table helper_diaries enable row level security;
      create policy diaries_select on helper_diaries for select to authenticated
        using(user_id=(select auth.uid()) or (public.door_open(user_id) and
          (visibility='all' or (visibility='friends' and public.is_friend(user_id,(select auth.uid()))))));
      create policy diaries_insert on helper_diaries for insert to authenticated
        with check(user_id=(select auth.uid()) and not public.is_banned((select auth.uid())));
      create table public.helper_messages(author_id uuid);
      alter table helper_messages enable row level security;
      create policy messages_select on helper_messages for select to authenticated
        using(author_id=(select auth.uid()) or not public.blocked_between(author_id,(select auth.uid())));
      grant select on friendships,blocks,media_folders,helper_diaries,helper_messages to authenticated;
      grant insert on helper_diaries to authenticated;
      insert into helper_diaries values('${bob}','friends'),('${bob}','private'),('${banned}','all');
      insert into helper_messages values('${bob}'),('${banned}');
      create function public.test_definer_friend(a uuid,b uuid) returns boolean
        language sql stable security definer set search_path to '' as $$select public.is_friend(a,b)$$;
      create function public.test_definer_ban(u uuid) returns boolean
        language sql stable security definer set search_path to '' as $$select not public.is_banned(u)$$;
      revoke all on function test_definer_friend(uuid,uuid),test_definer_ban(uuid) from public;
      grant execute on function test_definer_friend(uuid,uuid),test_definer_ban(uuid) to authenticated,service_role;
    `);
    const helperCalls = [
      ['select public.is_friend($1,$2) as value', [alice,bob]],
      ['select public.blocked_between($1,$2) as value', [alice,banned]],
      ['select public.is_banned($1) as value', [banned]],
      ['select public.folder_can_see($1,$2) as value', [privateFolder,bob]]
    ];
    await signIn(null);
    for (const [query,args] of helperCalls) await assert.rejects(() => db.query(query,args), /permission denied/);
    await signIn(alice);
    assert.equal(await value('select is_friend($1,$2) as value',[alice,bob]),true);
    assert.equal(await value('select is_friend($1,$2) as value',[bob,alice]),true);
    assert.equal(await value('select blocked_between($1,$2) as value',[banned,alice]),true);
    assert.equal(await value('select is_banned($1) as value',[alice]),false);
    assert.equal(await value('select folder_can_see($1,$2) as value',[friendsFolder,alice]),true);
    assert.equal(await value('select folder_can_see($1,$2) as value',[privateFolder,alice]),false);
    assert.equal(await value('select folder_can_see($1,$2) as value',[chosenFolder,alice]),true);
    assert.equal(await value('select folder_can_see($1,$2) as value',[closedFolder,alice]),false);
    for (const [query,args] of [
      ['select is_friend($1,$2)',[bob,banned]],['select blocked_between($1,$2)',[bob,outsider]],
      ['select is_banned($1)',[banned]],['select folder_can_see($1,$2)',[privateFolder,bob]],
      ['select test_definer_friend($1,$2)',[bob,banned]],['select test_definer_ban($1)',[banned]],
      ['select is_friend(null,null)',[]],['select is_banned(null)',[]]
    ]) await assert.rejects(() => db.query(query,args), error => error.code==='42501' && /helper_scope_denied/.test(error.message));
    assert.equal(await value('select test_definer_friend($1,$2) as value',[alice,bob]),true,
      'trusted definer callers retain the caller identity instead of gaining their owner scope');
    assert.equal(await value('select count(*)::int as value from media_folders'),2,'friend/chosen folders remain visible');
    assert.equal(await value('select count(*)::int as value from helper_diaries'),1,'friends only and closed-home filters remain effective');
    assert.equal(await value('select count(*)::int as value from helper_messages'),1,'blocked author remains hidden');
    await db.query("insert into helper_diaries values($1,'all')",[alice]);
    await signIn(outsider);
    assert.equal(await value('select count(*)::int as value from media_folders'),0,'an unrelated viewer gets no private/friend folder');
    await signIn(bob);
    assert.equal(await value('select folder_can_see($1,$2) as value',[privateFolder,bob]),true,'owner access retained');
    await signIn(banned);
    assert.equal(await value('select is_banned($1) as value',[banned]),true);
    assert.equal(await value('select test_definer_ban($1) as value',[banned]),false,'NOT is_banned retains own ban restriction');
    await assert.rejects(() => db.query("insert into helper_diaries values($1,'all')",[banned]),/row-level security/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    for(const [query,args] of helperCalls) assert.equal(await value(query,args),true,'direct DB maintenance retains access');
    await db.exec('set role service_role');
    for(const [query,args] of helperCalls) assert.equal(await value(query,args),true,'service role works without a member uid');
    assert.equal(await value('select test_definer_ban($1) as value',[banned]),false,'nested service-role ban check retained');
    await db.exec('set role authenticated');
    await assert.rejects(() => db.query('select is_friend($1,$2)',[alice,bob]),/helper_scope_denied/,
      'an authenticated role without a uid does not inherit the session owner privilege');

    await signIn(null);
    for (const call of [
      "select game_shot($1,0,'{\"x\":1}','p2')", "select game_move($1,0,'{\"x\":1}')", "select game_finish($1,'p1','test')"
    ]) await assert.rejects(() => db.query(call, [game]), /permission denied/);
    await signIn(outsider);
    await assert.rejects(() => db.query("select game_shot($1,0,'{}','p2')", [game]), /not_your_turn/);
    await signIn(alice);
    for (const [ply, move, next, error] of [[null, {}, 'p2', /out_of_sync/], [0, null, 'p2', /bad_move/],
      [0, [], 'p2', /bad_move/], [0, {}, null, /bad_next/], [1, {}, 'p2', /out_of_sync/]]) {
      await assert.rejects(() => db.query('select game_shot($1,$2,$3,$4)', [game, ply, move, next]), error);
    }
    await db.query("select game_shot($1,0,'{\"x\":1}','p2')", [game]);
    await assert.rejects(() => db.query("select game_shot($1,1,'{}','p1')", [game]), /not_your_turn/);
    await signIn(bob);
    await db.query("select game_shot($1,1,'{\"x\":2}','p1')", [game]);
    await assert.rejects(() => db.query("select game_finish($1,null,'test')", [game]), /bad_result/);
    await db.exec('reset role');
    assert.equal(await value('select jsonb_array_length(moves) as value from board_games'), 2);
    await db.exec("update board_games set kind='chess',moves='[]',turn='p1'");
    await signIn(alice);
    await assert.rejects(() => db.query("select game_move($1,null,'{}')", [game]), /out_of_sync/);
    await assert.rejects(() => db.query('select game_move($1,0,null)', [game]), /bad_move/);
    await db.query("select game_move($1,0,'{\"from\":1,\"to\":2}')", [game]);
    await signIn(bob);
    await db.query("select game_move($1,1,'{\"from\":2,\"to\":3}')", [game]);
    await db.query("select game_finish($1,'draw','agreement')", [game]);
    await db.exec('reset role');
    assert.equal(await value('select result as value from board_games'), 'draw');

    await signIn(alice);
    assert.equal((await value("select beta_charge('p1000') as value")).ok, true);
    assert.equal((await value("select beta_charge('p1000') as value")).ok, true);
    assert.equal((await value("select beta_charge('p1000') as value")).reason, 'limit');
    await signIn(outsider);
    assert.equal((await value("select beta_charge('p1000') as value")).reason, 'no_account');
    await db.exec('reset role');
    assert.equal(await value('select count(*)::int as value from coin_charges'), 2);
    assert.equal(await value('select coins as value from user_private where user_id=$1', [alice]), 120);
    // PGlite serializes queries; separately enforce the production row-lock ordering.
    const charge = sql.split('CREATE OR REPLACE FUNCTION public.beta_charge')[1].split('$function$;')[0];
    assert.ok(charge.indexOf('for update') < charge.indexOf('select count(*) into used'));

    await signIn(alice);
    await db.query("insert into guestbook(owner_id,body) values($1,'안녕하세요')", [bob]);
    await assert.rejects(() => db.query("insert into guestbook(owner_id,body) values($1,'🎁 가짜 선물을 보냈어요')", [bob]), /gb_fast/);
    assert.equal((await value("select gift_item('item:flower',$1) as value", [bob])).ok, true,
      'a real purchase can still create its receipt during the normal posting cooldown');
    assert.equal(await value("select current_setting('ojjuda.gift_receipt',true) as value"), '', 'receipt privilege cannot leak');
    await assert.rejects(() => db.query("insert into guestbook(owner_id,body) values($1,'🎁 또 가짜 선물을 보냈어요')", [bob]), /gb_fast/);
    await db.exec('reset role');
    assert.equal(await value('select count(*)::int as value from guestbook'), 2);
    assert.equal(await value('select coins as value from user_private where user_id=$1', [alice]), 115);
    assert.deepEqual(await value('select owned as value from user_private where user_id=$1', [bob]), ['item:flower']);
    console.log('PASS World RPC security: scoped privacy helpers, RLS, nested definers, service role, anonymous/outsider writes, game turns, charge cap and trusted gift receipts');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
