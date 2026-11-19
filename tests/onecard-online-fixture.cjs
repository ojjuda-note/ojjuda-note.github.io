const fs = require('node:fs');
const path = require('node:path');
const { createFixture, installYutRankings } = require('./monthly-game-rankings-fixture.cjs');

const users = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);

async function fixture() {
  // Run the real common ranking readers before the One Card migrations so the
  // room/API/UI suites exercise the same result-to-leaderboard path as production.
  const rankingFixture = await createFixture();
  const { db, clock: rankingClock, claim } = rankingFixture;
  let manualClock = false;
  await installYutRankings(db);
  await rankingClock(new Date().toISOString());
  await db.exec(`
    create table public.test_bans (id uuid primary key);
    create table public.test_blocks (a uuid, b uuid);
    create or replace function public.is_banned(uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.test_bans where id=$1)$$;
    create or replace function public.blocked_between(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.test_blocks where a=$1 and b=$2 or a=$2 and b=$1)$$;
    create function public.mask_banned(text) returns text language sql as $$select replace($1, 'badword', '❤️❤️')$$;
    grant usage on schema public to anon,authenticated,service_role;
    create schema ojjuda_arcade_internal;
    create sequence ojjuda_arcade_internal.rooms_room_no_seq start 1001;
    grant usage on schema ojjuda_arcade_internal to authenticated;
  `);
  // The One Card migration extends the existing arcade directory. Keep the
  // unrelated providers empty unless a directory regression explicitly seeds one.
  for (const game of ['poker', 'bang', 'roulette']) await db.exec(`
    create schema if not exists ojjuda_${game}_internal;
    grant usage on schema ojjuda_${game}_internal to authenticated;
    create function ojjuda_${game}_internal.arcade_rooms() returns jsonb language sql stable
      as $$select '{"ok":true,"rooms":[]}'::jsonb$$;
    revoke all on function ojjuda_${game}_internal.arcade_rooms() from public,anon;
    grant execute on function ojjuda_${game}_internal.arcade_rooms() to authenticated;
  `);
  await db.exec(`create function public.arcade_general_extra_rooms() returns jsonb language sql stable
    as $$select '{"ok":true,"rooms":[]}'::jsonb$$`);
  for (const [i, id] of users.entries()) {
    await db.query('insert into auth.users(id,is_anonymous) values($1,$2)', [id, i === 7]);
    await db.query('insert into public.profiles values($1,$2)', [id, ['하나', '두리', '세나', '네로', '다온', '여섯', '제한회원', '익명'][i]]);
  }
  await db.query('insert into public.test_bans values($1)', [users[6]]);
  const migrations = path.join(__dirname, '../supabase/migrations');
  const onecardMigrations = fs.readdirSync(migrations).filter(n => /_onecard_.*\.sql$/.test(n)).sort();
  for (const migration of onecardMigrations) await db.exec(fs.readFileSync(path.join(migrations, migration), 'utf8'));
  // Only record/ranking time is controllable. Real room expiry, CAS, turn
  // deadlines and rate limits remain untouched by the boundary-test clock.
  const clockedFunctions = await db.query(`select pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='ojjuda_ranking_internal'
       or (n.nspname='ojjuda_onecard_internal' and (p.proname='player_record' or p.prorettype='trigger'::regtype))
       or (n.nspname='public' and p.proname in('community_game_monthly_personal','community_game_monthly_ranking','community_game_monthly_leaders','community_game_monthly_history'))`);
  for (const { definition } of clockedFunctions.rows) {
    const patched = definition.replace(/\b(?:clock_timestamp|statement_timestamp|now)\(\)/g, 'fixture.clock()');
    if (patched !== definition) await db.exec(patched);
  }
  if ((await db.query("select to_regclass('ojjuda_onecard_internal.results') exists")).rows[0].exists)
    await db.exec('alter table ojjuda_onecard_internal.results alter column achieved_at set default fixture.clock()');
  const { createHandler } = await import('../supabase/functions/onecard/handler.mjs');
  let seed = 209385;
  const handler = createHandler({
    env: name => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'server-only' })[name],
    random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/auth/v1/user')) {
        const id = options.headers.authorization.slice(7);
        return new Response(JSON.stringify({ id, is_anonymous: id === users[7] }), { status: users.includes(id) ? 200 : 401 });
      }
      const p = JSON.parse(options.body);
      try {
        const result = await db.transaction(async tx => {
          await tx.exec('set local role service_role');
          return tx.query('select public.onecard_online_service($1,$2,$3,$4,$5,$6,$7,$8) value',
            [p.p_actor, p.p_action, p.p_room ?? null, p.p_code ?? null, p.p_request ?? null, p.p_expected ?? null, p.p_options ?? {}, p.p_next ?? null]);
        });
        return new Response(JSON.stringify(result.rows[0].value));
      } catch (error) { return new Response(JSON.stringify({ message: error.message }), { status: 400 }); }
    },
  });
  async function call(id, body, options = {}) {
    if (!manualClock) await rankingClock(new Date().toISOString());
    const clientVersion = options.clientVersion === undefined ? '1.4.0' : options.clientVersion;
    const response = await handler(new Request('https://edge.invalid', {
      method: 'POST', headers: { authorization: `Bearer ${id}`, origin: 'https://ojjuda.kr', ...options.headers },
      body: JSON.stringify({ ...(clientVersion ? { clientVersion } : {}), ...body }),
    }));
    return { httpStatus: response.status, ...await response.json() };
  }
  const clock = async value => { manualClock = true; await rankingClock(value); };
  async function stageWin(roomId, winnerId) {
    const row = (await db.query('select state from ojjuda_onecard_internal.rooms where id=$1', [roomId])).rows[0];
    const state = row.state, winner = state.players.find(player => player.id === winnerId);
    if (!winner || winner.active === false) throw Error('fixture winner must be an active existing seat');
    // Preserve the actual round's deck, including a pre-update 54-card round.
    const remaining = [...state.deck, ...state.discard, ...state.players.flatMap(player => player.hand)]
      .filter(id => !['S-4', 'S-3'].includes(id));
    for (const player of state.players) {
      player.hand = player === winner ? ['S-3'] : player.active === false ? [] : remaining.splice(0, 2);
      player.calledOne = player === winner;
    }
    Object.assign(state, { deck: remaining, discard: ['S-4'], currentSuit: 'S', pendingDraw: 0, pendingOneId: null,
      turn: state.players.indexOf(winner), status: 'playing', winnerId: null, winnerIds: [], finishReason: null,
      dryPasses: 0, lastEvents: [], revision: state.revision + 1 });
    await db.query("update ojjuda_onecard_internal.rooms set state=$2,version=version+1,deadline=clock_timestamp()+interval '1 minute' where id=$1", [roomId, state]);
    return state;
  }
  return { db, call, users, handler, clock, claim, stageWin, close: () => db.close() };
}

module.exports = { fixture, users };
