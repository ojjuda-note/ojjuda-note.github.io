const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const migrationName = fs.readdirSync(path.join(root, 'supabase/migrations')).find(name => name.endsWith('_monthly_game_rankings_archive.sql'));
const participantsMigrationName = fs.readdirSync(path.join(root, 'supabase/migrations')).find(name => name.endsWith('_show_zero_streak_participants.sql'));
const bestStreakMigrationName = fs.readdirSync(path.join(root, 'supabase/migrations')).find(name => name.endsWith('_monthly_best_win_streaks.sql'));
const excludeZeroMigrationName = fs.readdirSync(path.join(root, 'supabase/migrations')).find(name => name.endsWith('_exclude_zero_ranking_records.sql'));
function definition(source, name) {
  const start = source.search(new RegExp('create(?: or replace)? function ' + name.replaceAll('.', '\\.') + '\\(', 'i'));
  if (start < 0) throw Error('missing function ' + name);
  const text = source.slice(start), tag = text.match(/\bas\s+(\$[a-z_]*\$)/i)?.[1];
  if (!tag) throw Error('missing body ' + name);
  const body = text.indexOf(tag), end = text.indexOf(tag, body + tag.length);
  return text.slice(0, end + tag.length + 1);
}
async function createFixture(existingDb, { participants = true, latestBest = participants, excludeZero = latestBest } = {}) {
  const db = existingDb || new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema ojjuda_guest_internal; create schema ojjuda_game_internal;
    create schema ojjuda_account_internal; create schema ojjuda_photo_internal;
    create schema ojjuda_bang_internal; create schema ojjuda_poker_internal; create schema fixture;
    grant usage on schema public,auth,ojjuda_guest_internal,ojjuda_photo_internal,ojjuda_bang_internal to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key,is_anonymous boolean default false);
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,nickname text not null);
    create table public.user_private(user_id uuid primary key,banned_until timestamptz);
    create table fixture.blocks(a uuid,b uuid);
    create table ojjuda_account_internal.member_identity(user_id uuid primary key,birth_date date);
    create function public.is_banned(uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.user_private where user_id=$1 and banned_until>now())$$;
    create function public.blocked_between(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from fixture.blocks where (a=$1 and b=$2) or (b=$1 and a=$2))$$;
    create function ojjuda_account_internal.age_on(date,date) returns int language sql immutable as $$select extract(year from age($2,$1))::int$$;
    create function public.photo_is_admin() returns boolean language sql as $$select false$$;
    create function public.photo_is_friend(uuid,uuid) returns boolean language sql as $$select false$$;
    create table public.photo_stages(id uuid primary key,status text,owner uuid,visibility text);
    create table public.game_scores(user_id uuid references public.profiles(id) on delete cascade,game text,score int,created_at timestamptz default now());
    create table public.board_games(id uuid primary key,p1 uuid,p2 uuid,kind text,status text,result text,updated_at timestamptz,rank_excluded text[] not null default '{}');
    create table ojjuda_game_internal.practice_results(user_id uuid,round_id uuid,game text,difficulty text,outcome text,created_at timestamptz);
    create table ojjuda_guest_internal.scores(day date not null,game text not null,guest_hash text not null,score int not null,achieved_at timestamptz not null,
      last_submitted_at timestamptz not null,last_request_id uuid not null,last_score int not null,primary key(day,game,guest_hash));
    create table ojjuda_guest_internal.round_records(game text,actor_key text,user_id uuid references public.profiles(id) on delete cascade,guest_hash text,round_id uuid,round_no int default 1,value bigint,source text,achieved_at timestamptz default clock_timestamp(),opponents smallint);
    create table ojjuda_guest_internal.spot_clears(actor_key text,user_id uuid references public.profiles(id) on delete cascade,guest_hash text,stage smallint,month_start date,achieved_at timestamptz,primary key(actor_key,month_start,stage));
    create table ojjuda_photo_internal.game_clears(user_id uuid references auth.users(id) on delete cascade,month_start date,stage_key text,cleared_at timestamptz default now(),primary key(user_id,month_start,stage_key));
    create table ojjuda_bang_internal.results(room_id uuid,user_id uuid references auth.users(id) on delete cascade,won boolean,achieved_at timestamptz,primary key(room_id,user_id));
    create function ojjuda_game_internal.community_game_monthly_ranking(text) returns json language sql as $$select '[]'::json$$;
    create table fixture.economy(wallet_gold bigint,coupon_count int);
    insert into fixture.economy values(12345,7);
    create table fixture.clock_value(value timestamptz);
    insert into fixture.clock_value values('2026-10-31 12:00:00Z');
    create function fixture.clock() returns timestamptz language sql stable security definer set search_path='' as $$select value from fixture.clock_value$$;
  `);
  const install = async (file, name, transform = x => x) => db.exec(transform(definition(read(file), name)));
  await install('20261006164811_guest_game_rankings.sql','ojjuda_guest_internal.score_limit', sql => sql.replace("when 'mole'", "when 'saetbyeol' then 60000 when 'mines' then 89999 " + Array.from({length:15},(_,i)=>`when 'sacheonseong_${i+1}' then 1999999999 `).join('') + "when 'mole'"));
  await install('20261006164811_guest_game_rankings.sql','ojjuda_guest_internal.submit_score');
  await install('20261006164811_guest_game_rankings.sql','public.submit_guest_game_score');
  await install('20261028100203_sacheonseong_best_stage_ranking.sql','ojjuda_guest_internal.ranking');
  await install('20261022121120_game_ranking_criteria.sql','ojjuda_guest_internal.round_leaders');
  await install('20261022121120_game_ranking_criteria.sql','ojjuda_guest_internal.criteria_ranking');
  await install('20261022130306_multiplayer_ranking_details.sql','ojjuda_guest_internal.tank_candidates');
  await install('20261022130306_multiplayer_ranking_details.sql','ojjuda_guest_internal.spot_candidates');
  // Use the shipped current daily/all-time branches as well as the monthly
  // dispatcher. The original criteria fixture predates tank opponent fields.
  const details = read('20261022130306_multiplayer_ranking_details.sql');
  const criteriaStart = details.indexOf('do $patch$');
  const criteriaEnd = details.indexOf(' foreach signature in array', criteriaStart);
  if (criteriaStart < 0 || criteriaEnd <= criteriaStart) throw Error('missing current criteria patch');
  await db.exec(details.slice(criteriaStart, criteriaEnd) + 'end;$patch$;');
  await db.exec(read('20261024090740_ranking_member_visibility.sql'));
  await install('20261022130306_multiplayer_ranking_details.sql','ojjuda_guest_internal.record_spot_clear', sql => sql.replace('not between 1 and 48','not between 1 and 62'));
  await install('20261022130306_multiplayer_ranking_details.sql','public.record_spot_clear');
  await install('20261031074908_board_computer_takeover.sql','ojjuda_guest_internal.streak_candidates');
  await install('20261021004126_poker_online_rooms.sql','ojjuda_poker_internal.check_member');
  await install('20261006021326_photo_ttang_adult_access.sql','ojjuda_photo_internal.member_allowed');
  await install('20261021002639_photo_ttang_men_20.sql','ojjuda_photo_internal.record_game_clear');
  await install('20261006082621_photo_ttang_monthly_ranking.sql','public.photo_game_clear');
  await install('20261006082621_photo_ttang_monthly_ranking.sql','ojjuda_photo_internal.game_monthly_ranking');
  await install('20261029033602_bang_multiplayer_streaks.sql','ojjuda_bang_internal.ranking');
  await install('20261029072338_bang_solo_streaks.sql','ojjuda_bang_internal.player_record');
  await install('20261028100203_sacheonseong_best_stage_ranking.sql','public.community_game_monthly_ranking', sql => sql.replace('begin\n', "begin\n if p_game='bang' then return ojjuda_bang_internal.ranking();end if;\n if p_game='photo_ttang' then return ojjuda_photo_internal.game_monthly_ranking();end if;\n"));
  await install('20261021015125_poker_wallet_ranking_lobby.sql','public.community_game_ranking', sql => sql.replace('begin\n', "begin\n if p_game='bang' then return ojjuda_bang_internal.ranking();end if;\n   if p_game in ('tour','tank','ttang','spot','matgo','poker','billiards','carom4','carom3','pool8','janggi','chess') then\n    return ojjuda_guest_internal.criteria_ranking(p_game,case when p_game='tour' then 'day' else 'all' end,null);end if;\n"));
  await db.exec('grant execute on all functions in schema ojjuda_guest_internal to anon,authenticated;');
  // Apply the shipped migration verbatim before adding a deterministic test clock.
  await db.exec(read(migrationName));
  const memberIndex = fs.readdirSync(path.join(root, 'supabase/migrations')).find(name => name.endsWith('_monthly_game_rankings_member_index.sql'));
  await db.exec(read(memberIndex));
  if (participants) await db.exec(read(participantsMigrationName));
  if (latestBest) await db.exec(read(bestStreakMigrationName));
  if (excludeZero) await db.exec(read(excludeZeroMigrationName));
  await db.exec("update ojjuda_ranking_internal.settings set first_month='2026-10-01'");
  const funcs = await db.query(`select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in('ojjuda_guest_internal','ojjuda_ranking_internal','ojjuda_photo_internal','ojjuda_poker_internal','ojjuda_bang_internal')
      or (n.nspname='public' and p.proname in('is_banned','blocked_between'))`);
  for (const {definition: sql} of funcs.rows) {
    const patched = sql.replace(/\b(?:clock_timestamp|statement_timestamp|now)\(\)/g, 'fixture.clock()');
    if (patched !== sql) await db.exec(patched);
  }
  const clock = value => db.query('update fixture.clock_value set value=$1', [value]);
  const claim = async id => db.exec(`set request.jwt.claim.sub='${id || ''}'`);
  const actor = async (id, nick, birth='1990-01-01') => {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query('insert into public.profiles values($1,$2)',[id,nick]);
    await db.query('insert into ojjuda_account_internal.member_identity values($1,$2)',[id,birth]);
  };
  return {db,clock,claim,actor,migrationName};
}
module.exports = {createFixture,definition,read,migrationName,participantsMigrationName,bestStreakMigrationName,excludeZeroMigrationName};
