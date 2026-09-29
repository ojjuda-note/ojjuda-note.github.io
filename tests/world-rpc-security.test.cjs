const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260929042447_world_rpc_security_boundaries.sql'), 'utf8');

(async () => {
  const db = new PGlite();
  const alice = '00000000-0000-4000-8000-000000000001';
  const bob = '00000000-0000-4000-8000-000000000002';
  const outsider = '00000000-0000-4000-8000-000000000003';
  const game = '00000000-0000-4000-8000-000000000010';
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
      create table public.user_private(user_id uuid primary key,coins integer,owned text[] default '{}');
      create table public.coin_charges(user_id uuid,pack text,coins integer,won integer,free boolean,created_at timestamptz default now());
      create table public.app_config(key text primary key,value jsonb);
      create table public.shop_items(key text primary key,name text,price integer,active boolean default true);
      create table public.guestbook(owner_id uuid,author_id uuid default auth.uid(),author_nick text,body text,created_at timestamptz default now());
      create function public.is_friend(uuid,uuid) returns boolean language sql as $$select true$$;
      create function public.blocked_between(uuid,uuid) returns boolean language sql as $$select false$$;
      grant insert on guestbook to authenticated;
      insert into app_config values('beta_free_charge','true'),('beta_charge_daily_limit','2');
      insert into user_private values('${alice}',100,'{}'),('${bob}',10,'{}');
      insert into shop_items values('item:flower','꽃',5,true);
      insert into board_games(id,kind,status,p1,p2,turn) values('${game}','carom4','playing','${alice}','${bob}','p1');`);
    await db.exec(sql);
    await db.exec('create trigger guard before insert on guestbook for each row execute function public.guestbook_guard()');

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
    console.log('PASS World RPC security: anonymous/outsider writes, null inputs, game turns, charge cap and trusted gift receipts');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
