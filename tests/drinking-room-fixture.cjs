'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {pgcrypto} = require('@electric-sql/pglite/contrib/pgcrypto');

const users = Object.freeze(Array.from({length: 16}, (_, i) =>
  `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`));
const names = Object.freeze(users.map((_, i) => `참가자 ${i + 1}`));
const migrationDir = path.join(__dirname, '../supabase/migrations');
// Preserve the applied dependency order: king_pair_orders has an earlier live
// migration version than its repository filename. All game SQL runs unchanged.
const baseMigrationNames = [
  '20261113115500_croc_multiplayer.sql',
  '20261113143000_liar_multiplayer.sql',
  '20261113144500_king_multiplayer.sql',
  '20261114000100_king_pair_orders.sql',
  '20261113162551_party_vote_multiplayer.sql',
  '20261113164519_remaining_party_multiplayer.sql',
  '20261113165949_drinking_fingers_and_imagevote.sql',
  '20261113170944_drinking_updown.sql',
  '20261113173134_shared_drinking_room_and_game_handoff.sql',
  '20261113174950_adult_only_drinking_games.sql',
  '20261113190222_drinking_game_prompt_banks.sql',
  '20261113190224_drinking_prompt_review_and_truth_management.sql',
  '20261113192019_truth_card_flavor_and_visibility.sql',
  '20261114032419_drinking_room_random_host_handoff.sql',
  '20261114032639_drinking_standalone_host_handoff.sql',
  '20261114034455_drinking_admin_content_library.sql',
  '20261114034457_drinking_managed_game_draws.sql',
  '20261114051146_drinking_adult_party_rounds_and_king_responses.sql'
];
const rebuildMigrationNames = [
  '20261114061001_drinking_rebuild_liar.sql',
  '20261114061002_drinking_rebuild_king.sql',
  '20261114061003_drinking_rebuild_minority.sql',
  '20261114061004_drinking_rebuild_mission.sql',
  '20261114061005_drinking_rebuild_bomb.sql',
  '20261114061006_drinking_rebuild_truth.sql',
  '20261114061007_drinking_rebuild_fingers.sql',
  '20261114061008_drinking_rebuild_imagevote.sql',
  '20261114061009_drinking_rebuild_initial.sql',
  '20261114061106_drinking_truth_catalog_epoch.sql'
];

const expansionMigrationNames = fs.readdirSync(migrationDir)
  .filter(name => /^\d+_drinking_expand_[a-z]+_300\.sql$/.test(name)).sort();
const polishMigrationNames = fs.readdirSync(migrationDir)
  .filter(name => /^\d+_drinking_polish_[a-z]+\.sql$/.test(name)).sort();

async function fixture({beforeRebuild = false, beforeExpansion = false, beforePolish = false} = {}) {
  const migrationNames = beforeRebuild ? baseMigrationNames : [
    ...baseMigrationNames, ...rebuildMigrationNames,
    ...(beforeExpansion ? [] : expansionMigrationNames),
    ...(beforeExpansion || beforePolish ? [] : polishMigrationNames)
  ];
  const db = new PGlite({extensions: {pgcrypto}});
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema extensions;
      create extension pgcrypto with schema extensions;
      create schema auth; create schema ojjuda_account_internal;
      create schema ojjuda_arcade_internal; create schema ojjuda_poker_internal;
      create schema ojjuda_bang_internal; create schema ojjuda_roulette_internal;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table auth.users(id uuid primary key, is_anonymous boolean not null default false);
      create table public.profiles(id uuid primary key, nickname text not null);
      create table public.user_private(user_id uuid primary key, banned_until timestamptz);
      create table public.blocks(blocker uuid not null, blocked uuid not null, primary key(blocker,blocked));
      create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
      create function public.is_banned(actor uuid) returns boolean language sql stable as
        $$select exists(select 1 from public.user_private where user_id=actor and banned_until>now())$$;
      create function public.blocked_between(a uuid,b uuid) returns boolean language sql stable as
        $$select exists(select 1 from public.blocks where (blocker=a and blocked=b) or (blocker=b and blocked=a))$$;
      create function public.is_admin() returns boolean language sql stable as $$select false$$;
      create function ojjuda_account_internal.age_on(date,date) returns integer language sql immutable as
        $$select extract(year from age($2,$1))::integer$$;
      create function ojjuda_poker_internal.arcade_rooms() returns jsonb language sql as $$select '{"rooms":[]}'::jsonb$$;
      create function ojjuda_bang_internal.arcade_rooms() returns jsonb language sql as $$select '{"rooms":[]}'::jsonb$$;
      create function ojjuda_roulette_internal.arcade_rooms() returns jsonb language sql as $$select '{"rooms":[]}'::jsonb$$;
      create function public.arcade_extra_rooms() returns jsonb language sql as $$
        select jsonb_build_object('rooms',coalesce(ojjuda_poker_internal.arcade_rooms()->'rooms','[]'::jsonb)
        ||coalesce(ojjuda_bang_internal.arcade_rooms()->'rooms','[]'::jsonb)
        ||coalesce(ojjuda_roulette_internal.arcade_rooms()->'rooms','[]'::jsonb));
      $$;
      grant usage on schema auth,public,ojjuda_arcade_internal to anon,authenticated,service_role;
    `);
    // Use the actual shared membership gate, rather than bypassing age checks.
    const pokerSql = fs.readFileSync(path.join(migrationDir, '20261021004126_poker_online_rooms.sql'), 'utf8');
    const memberGate = pokerSql.match(/create function ojjuda_poker_internal\.check_member\(p_actor uuid\)[\s\S]*?revoke all on function ojjuda_poker_internal\.check_member\(uuid\)[^;]*;/);
    if (!memberGate) throw Error('Poker membership gate was not found');
    await db.exec(memberGate[0]);
    for (const [i, id] of users.entries()) {
      await db.query('insert into auth.users values($1,$2)', [id, i === 15]);
      await db.query('insert into public.profiles values($1,$2)', [id, names[i]]);
      await db.query('insert into public.user_private(user_id) values($1)', [id]);
      await db.query("insert into ojjuda_account_internal.member_identity values($1,(clock_timestamp() at time zone 'Asia/Seoul')::date-make_interval(years=>$2))", [id, i === 14 ? 18 : 25]);
    }
    for (const migration of migrationNames) {
      try { await db.exec(fs.readFileSync(path.join(migrationDir, migration), 'utf8')); }
      catch (error) { error.message = `${migration}: ${error.message}`; throw error; }
    }
    // Each call owns a transaction and a distinct simulated JWT subject. PGlite
    // queues overlapping calls on one connection; this is not a load benchmark.
    async function publicRpc(actor, fn, args = [], role = 'authenticated') {
      if (!/^[a-z][a-z0-9_]*$/.test(fn)) throw Error('Invalid fixture RPC name');
      if (!['authenticated', 'anon'].includes(role)) throw Error('Invalid fixture role');
      return db.transaction(async tx => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor || '']);
        await tx.exec(`set local role ${role}`);
        const placeholders = args.map((_, i) => '$' + (i + 1)).join(',');
        return (await tx.query(`select public.${fn}(${placeholders}) value`, args)).rows[0].value;
      });
    }
    return {db, users, names, publicRpc, migrations: [...migrationNames], close: () => db.close()};
  } catch (error) {
    await db.close();
    throw error;
  }
}

module.exports = {fixture, users, names};
