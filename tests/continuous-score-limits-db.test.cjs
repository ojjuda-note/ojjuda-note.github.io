const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const readMigration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
const beforeFunctions = fs.readFileSync(path.join(__dirname, 'fixtures/continuous-score-functions-before.sql'), 'utf8');
const migration = readMigration('20261111082841_continuous_game_score_limits.sql');
const longGameMigration = readMigration('20261111083715_arcade_long_game_score_limits.sql');
const maxScore = 1999999999;
const games = [['runner', 50012], ['screw_flat', 1001280]];
const longGames = [
  { game: 'stacker', score: 302, oldLimit: 300, rankingModes: [false, true] },
  { game: 'chacha_rush', score: 10000183, oldLimit: 9999999, rankingModes: [false] }
];
const member = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const missing = '10000000-0000-0000-0000-000000000003';
const guest = 'ab'.repeat(32);

// These are the actual pre-fix function definitions, with synthetic local rows.
// No test contacts Supabase or writes a real member/guest score.
test('continuous score limits preserve saving, rankings and security', async t => {
  const db = new PGlite();
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
  const save = (game, score) => scalar('select public.submit_score($1,$2) value', [game, score]);
  const saveGuest = (game, score, request = randomUUID(), token = guest) =>
    scalar('select public.submit_guest_game_score($1,$2,$3,$4) value', [game, score, token, request]);
  const rank = (game, monthly = false, internal = false) => scalar(
    `select ${internal ? 'ojjuda_game_internal' : 'public'}.community_game_${monthly ? 'monthly_' : ''}ranking($1) value`, [game]);
  const guestRank = (game, period) => scalar('select public.guest_game_ranking($1,$2,$3) value', [game, period, guest]);
  const authenticate = async (id = member) => db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`);
  const anonymous = async () => db.exec("reset role;set role anon;set request.jwt.claim.sub=''");
  const catalog = async () => (await db.query(`
    select n.nspname || '.' || p.proname as name, pg_get_functiondef(p.oid) as definition,
      p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text as owner,p.proacl::text as grants
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='ojjuda_game_internal' and p.proname in
      ('submit_score','community_game_ranking','community_game_monthly_ranking'))
      or (n.nspname='ojjuda_guest_internal' and p.proname='score_limit')
    order by n.nspname,p.proname`)).rows;
  const policy = async () => (await db.query(`select polname,polpermissive,polroles,polcmd,
    pg_get_expr(polqual,polrelid) as using_expression,pg_get_expr(polwithcheck,polrelid) as check_expression
    from pg_policy where polrelid='ojjuda_guest_internal.scores'::regclass order by polname`)).rows;
  const expectedDefinition = definition => definition
    .replace(/('runner'\s+then\s+)50000(?=\s|$)/gi, (_, prefix) => prefix + maxScore)
    .replace(/('screw_flat'\s+then\s+)1000000(?=\s|$)/gi, (_, prefix) => prefix + maxScore);
  try {
    await db.exec(`
      create role anon;create role authenticated;
      create schema auth;create schema ojjuda_game_internal;create schema ojjuda_matgo_internal;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key,nickname text);
      create table public.user_private(user_id uuid primary key,coins integer,banned_until timestamptz);
      create function public.is_banned(uuid) returns boolean language sql stable as
        $$select exists(select 1 from public.user_private where user_id=$1 and banned_until>now())$$;
      create table public.board_games(id uuid primary key,kind text,p1 uuid,p2 uuid,status text,result text,updated_at timestamptz);
      create table public.game_scores(user_id uuid,nick text,game text,score integer,reward integer,
        verified boolean default false,created_at timestamptz default now());
      create table ojjuda_matgo_internal.wallets(user_id uuid,gold bigint,updated_at timestamptz);
      create table ojjuda_game_internal.practice_results(user_id uuid,round_id uuid,game text,difficulty text,outcome text,created_at timestamptz);
      insert into public.profiles values('${member}','테스트 회원'),('${other}','테스트 비교 회원');
      insert into public.user_private values('${member}',100,null),('${other}',200,null);
      grant usage on schema auth,public,ojjuda_game_internal to authenticated;
      insert into public.game_scores(user_id,nick,game,score,reward,created_at) values
        ('${other}','테스트 비교 회원','runner',50123,0,now()),
        ('${other}','테스트 비교 회원','screw_flat',1001280,0,now());
    `);
    // The unchanged guest submission/ranking contracts come from their original
    // migrations; the fixture replaces only the four current function bodies.
    await db.exec(readMigration('20261006164811_guest_game_rankings.sql'));
    await db.exec(readMigration('20261006165024_guest_score_table_policy.sql'));
    await db.exec(beforeFunctions);
    await db.exec(`
      revoke all on function ojjuda_game_internal.submit_score(text,integer),
        ojjuda_game_internal.community_game_ranking(text),
        ojjuda_game_internal.community_game_monthly_ranking(text) from public,anon;
      grant execute on function ojjuda_game_internal.submit_score(text,integer),
        ojjuda_game_internal.community_game_ranking(text),
        ojjuda_game_internal.community_game_monthly_ranking(text) to authenticated;
      create function public.submit_score(p_game text,p_score integer) returns json
        language sql security invoker set search_path='' as
        $$select ojjuda_game_internal.submit_score(p_game,p_score)$$;
      revoke all on function public.submit_score(text,integer) from public,anon;
      grant execute on function public.submit_score(text,integer) to authenticated;
    `);

    await t.test('reproduces valid long-game scores rejected or hidden by old bounds', async () => {
      await authenticate();
      for (const [game, score] of games) {
        assert.deepEqual(await save(game, score), { ok: false, reason: 'invalid' });
        for (const monthly of [false, true]) {
          assert.deepEqual(await rank(game, monthly), []);
          assert.deepEqual(await rank(game, monthly, true), []);
        }
      }
      await anonymous();
      for (const [game, score] of games) assert.equal((await saveGuest(game, score)).reason, 'invalid');
    });

    await t.test('changes exactly eight limits, keeps grants/settings/policies, and can run twice', async () => {
      await db.exec('reset role');
      const before = await catalog(), beforePolicy = await policy();
      assert.equal(before.length, 4);
      await db.exec(migration);
      const after = await catalog();
      for (let i = 0; i < before.length; i++) {
        assert.notEqual(after[i].definition, before[i].definition, before[i].name);
        assert.equal(after[i].definition, expectedDefinition(before[i].definition),
          `${before[i].name}: only runner and screw_flat numeric limits may change`);
        const { definition: oldDefinition, ...oldSecurity } = before[i];
        const { definition: newDefinition, ...newSecurity } = after[i];
        assert.deepEqual(newSecurity, oldSecurity);
      }
      assert.deepEqual(await policy(), beforePolicy);
      await db.exec(migration);
      assert.deepEqual(await catalog(), after);
    });

    await t.test('saves member long-game scores and shows daily/monthly combined and fallback rankings', async () => {
      await authenticate();
      for (const [game, score] of games) {
        const receipt = await save(game, score);
        assert.equal(receipt.ok, true);
        assert.equal(receipt.best, score);
        assert.equal(receipt.reward, 0);
        assert.equal(receipt.coins, 100);
        assert.equal(receipt.verified, false);
        assert.equal(receipt.rank, null);
        assert.equal(receipt.left, 0);
        for (const monthly of [false, true]) for (const internal of [false, true]) {
          const rows = await rank(game, monthly, internal);
          assert.equal(rows.length, 2);
          assert.equal(rows.find(row => row.me).score, score);
        }
        assert.equal((await save(game, score)).reason, 'too_fast');
        for (const invalid of [maxScore + 1, -1, null]) assert.equal((await save(game, invalid)).reason, 'invalid');
      }
      await db.exec(`reset role;update public.game_scores set created_at=clock_timestamp()-interval '6 seconds'
        where user_id='${member}' and game in ('runner','screw_flat')`);
      await authenticate();
      for (const [game] of games) {
        assert.equal((await save(game, maxScore)).best, maxScore);
        assert.equal((await rank(game)).find(row => row.me).score, maxScore);
        assert.equal((await rank(game, true, true)).find(row => row.me).score, maxScore);
      }
    });

    await t.test('keeps every other game limit and the separate general screw-box bound', async () => {
      await authenticate();
      const unchanged = [
        ['mole',3999],['stacker',300],['breakout',550000],['screw',1000000],['screw_box',1000000],
        ['tour',1000000],['saetbyeol',60000],['mines',89999],['solitaire',299999999],
        ['chacha_rush',9999999],['sacheonseong_1',maxScore],['sacheonseong_200',maxScore]
      ];
      for (const [game, limit] of unchanged) {
        assert.equal((await save(game, limit + 1)).reason, 'invalid', game);
        assert.equal((await save(game, limit)).ok, true, game);
      }
      await anonymous();
      for (const [game, memberLimit] of unchanged) {
        const limit = game === 'screw_box' ? maxScore : memberLimit;
        assert.equal(await scalar('select ojjuda_guest_internal.score_limit($1) value', [game]), limit, game);
        assert.equal((await saveGuest(game, limit + 1)).reason, 'invalid', game);
        assert.equal((await saveGuest(game, limit)).ok, true, game);
      }
    });

    await t.test('accepts guest long games with idempotency, cooldown and both ranking periods', async () => {
      await anonymous();
      for (const [game, score] of games) {
        const request = randomUUID(), receipt = await saveGuest(game, score, request);
        assert.deepEqual(receipt, { ok: true, guest: true, best: score, rank: null, reward: 0, verified: false });
        assert.deepEqual(await saveGuest(game, score, request), receipt);
        assert.equal((await saveGuest(game, score + 1, request)).reason, 'request_conflict');
        assert.equal((await saveGuest(game, score)).reason, 'too_fast');
        for (const invalid of [maxScore + 1, -1, null]) assert.equal((await saveGuest(game, invalid)).reason, 'invalid');
        for (const period of ['day','month']) {
          assert.equal((await guestRank(game, period)).find(row => row.me && row.source === 'guest_record').score, score);
        }
        assert.ok((await rank(game)).some(row => row.source === 'guest_record' && row.score === score));
      }
      assert.equal((await saveGuest('runner', 1, null)).reason, 'invalid');
      assert.equal((await saveGuest('runner', 1, randomUUID(), 'invalid-token')).reason, 'invalid');
      await db.exec("reset role;update ojjuda_guest_internal.scores set last_submitted_at=clock_timestamp()-interval '6 seconds'");
      await anonymous();
      for (const [game] of games) {
        assert.equal((await saveGuest(game, maxScore)).best, maxScore);
        for (const period of ['day','month']) {
          assert.equal((await guestRank(game, period)).find(row => row.me && row.source === 'guest_record').score, maxScore);
        }
      }
    });

    await t.test('retains account, ban and privacy checks without changing coins or verified rewards', async () => {
      await authenticate('');
      await assert.rejects(save('runner', 10), /not_signed_in/);
      await authenticate(missing);
      await assert.rejects(save('runner', 10), /no_account/);
      await db.exec(`reset role;update public.user_private set banned_until=now()+interval '1 hour' where user_id='${member}'`);
      await authenticate();
      assert.equal((await save('runner', 10)).reason, 'banned');
      assert.equal((await saveGuest('runner', 10)).reason, 'banned');
      await assert.rejects(db.query('select * from public.game_scores'), /permission denied/);
      await assert.rejects(db.query('select * from ojjuda_guest_internal.scores'), /permission denied/);
      await anonymous();
      await assert.rejects(save('runner', 10), /permission denied/);
      await assert.rejects(rank('runner', false, true), /permission denied/);
      await assert.rejects(db.query('select * from ojjuda_guest_internal.scores'), /permission denied/);
      await db.exec('reset role');
      assert.deepEqual((await db.query('select coins from public.user_private order by user_id')).rows.map(row => row.coins), [100,200]);
      assert.equal(await scalar('select count(*)::integer value from public.game_scores where reward<>0 or verified is distinct from false'), 0);
      assert.equal(await scalar('select max(score) value from public.game_scores'), maxScore);
      assert.equal(await scalar('select max(score) value from ojjuda_guest_internal.scores'), maxScore);
    });

    await t.test('rejects unexpected bounds atomically, including a value beginning with the old digits', async () => {
      await db.exec('reset role');
      await db.exec(beforeFunctions);
      const baseline = await catalog();
      const guestFunction = baseline.find(row => row.name === 'ojjuda_guest_internal.score_limit');
      const drifted = guestFunction.definition.replace(/('runner'\s+then\s+)50000(?=\s|$)/i, (_, prefix) => prefix + '500000');
      assert.notEqual(drifted, guestFunction.definition);
      await db.exec(drifted);
      const before = await catalog();
      await assert.rejects(db.exec(migration), /Unexpected runner score limit in ojjuda_guest_internal\.score_limit/);
      assert.deepEqual(await catalog(), before, 'a late mismatch rolls back the earlier function changes in the same DO block');
    });

    await t.test('can finish a partially updated boundary without touching the remaining function text', async () => {
      await db.exec(beforeFunctions);
      const before = await catalog();
      const partial = before.find(row => row.name === 'ojjuda_game_internal.submit_score');
      await db.exec(partial.definition.replace(/('runner'\s+then\s+)50000(?=\s|$)/i, (_, prefix) => prefix + maxScore));
      await db.exec(migration);
      const after = await catalog();
      for (let i = 0; i < before.length; i++) assert.equal(after[i].definition, expectedDefinition(before[i].definition));
    });

    await t.test('reproduces independent stacker and Chacha limits after the first migration', async () => {
      await db.exec(`reset role;update public.user_private set banned_until=null;
        update public.game_scores set created_at=clock_timestamp()-interval '6 seconds'
          where user_id='${member}' and game in ('stacker','chacha_rush');
        update ojjuda_guest_internal.scores set last_submitted_at=clock_timestamp()-interval '6 seconds'
          where game in ('stacker','chacha_rush')`);
      for (const { game, score } of longGames) await db.query(
        'insert into public.game_scores(user_id,nick,game,score,reward) values($1,$2,$3,$4,0)',
        [other, '테스트 비교 회원', game, score]);
      await authenticate();
      for (const { game, score, oldLimit, rankingModes } of longGames) {
        assert.equal((await save(game, score)).reason, 'invalid');
        for (const monthly of [false, true]) for (const internal of rankingModes) {
          assert.ok((await rank(game, monthly, internal)).every(row => row.score <= oldLimit));
        }
      }
      await anonymous();
      for (const { game, score } of longGames) assert.equal((await saveGuest(game, score)).reason, 'invalid');
    });

    await t.test('the follow-up changes six values and preserves security and all other game definitions', async () => {
      await db.exec('reset role');
      const before = await catalog(), beforePolicy = await policy();
      assert.equal(before.reduce((count, row) => count +
        (row.definition.match(/'stacker'\s+then\s+300(?=\s|$)|'chacha_rush'\s+then\s+9999999(?=\s|$)/gi) || []).length, 0), 6);
      await db.exec(longGameMigration);
      const after = await catalog();
      for (let i = 0; i < before.length; i++) {
        assert.notEqual(after[i].definition, before[i].definition, before[i].name);
        assert.equal(after[i].definition, before[i].definition
          .replace(/('stacker'\s+then\s+)300(?=\s|$)/gi, (_, prefix) => prefix + maxScore)
          .replace(/('chacha_rush'\s+then\s+)9999999(?=\s|$)/gi, (_, prefix) => prefix + maxScore));
        const { definition: oldDefinition, ...oldSecurity } = before[i];
        const { definition: newDefinition, ...newSecurity } = after[i];
        assert.deepEqual(newSecurity, oldSecurity);
      }
      assert.deepEqual(await policy(), beforePolicy);
      await db.exec(longGameMigration);
      assert.deepEqual(await catalog(), after);
      for (const [game, limit] of [
        ['runner',maxScore],['screw_flat',maxScore],['stacker',maxScore],['chacha_rush',maxScore],
        ['mole',3999],['breakout',550000],['screw',1000000],['screw_box',maxScore]
      ]) assert.equal(await scalar('select ojjuda_guest_internal.score_limit($1) value', [game]), limit, game);
    });

    await t.test('saves real long-game scores and upper boundaries for members, guests and rankings', async () => {
      for (const { game, score, rankingModes } of longGames) {
        await authenticate();
        const receipt = await save(game, score);
        assert.equal(receipt.ok, true);
        assert.equal(receipt.best, score);
        assert.equal(receipt.reward, 0);
        assert.equal(receipt.verified, false);
        assert.equal(receipt.coins, 100);
        for (const monthly of [false, true]) for (const internal of rankingModes) {
          const rows = await rank(game, monthly, internal);
          assert.equal(rows.find(row => row.me).score, score);
          assert.equal(rows.filter(row => row.source === 'member_record' && row.score === score).length, 2);
        }
        assert.equal((await save(game, score + 1)).reason, 'too_fast');
        for (const invalid of [maxScore + 1, -1, null]) assert.equal((await save(game, invalid)).reason, 'invalid');
        await anonymous();
        const request = randomUUID(), guestReceipt = await saveGuest(game, score, request);
        assert.deepEqual(guestReceipt, { ok: true, guest: true, best: score, rank: null, reward: 0, verified: false });
        assert.deepEqual(await saveGuest(game, score, request), guestReceipt);
        assert.equal((await saveGuest(game, score + 1, request)).reason, 'request_conflict');
        assert.equal((await saveGuest(game, score + 1)).reason, 'too_fast');
        for (const invalid of [maxScore + 1, -1, null]) assert.equal((await saveGuest(game, invalid)).reason, 'invalid');
        for (const period of ['day','month']) {
          assert.equal((await guestRank(game, period)).find(row => row.me && row.source === 'guest_record').score, score);
        }
        await db.exec('reset role');
        await db.query("update public.game_scores set created_at=clock_timestamp()-interval '6 seconds' where user_id=$1 and game=$2", [member, game]);
        await db.query("update ojjuda_guest_internal.scores set last_submitted_at=clock_timestamp()-interval '6 seconds' where game=$1", [game]);
        await authenticate();
        assert.equal((await save(game, maxScore)).best, maxScore);
        for (const monthly of [false, true]) for (const internal of rankingModes) {
          assert.equal((await rank(game, monthly, internal)).find(row => row.me).score, maxScore);
        }
        await anonymous();
        assert.equal((await saveGuest(game, maxScore)).best, maxScore);
        for (const period of ['day','month']) {
          assert.equal((await guestRank(game, period)).find(row => row.me && row.source === 'guest_record').score, maxScore);
        }
        await assert.rejects(save(game, 1), /permission denied/);
      }
      await assert.rejects(db.query('select * from ojjuda_guest_internal.scores'), /permission denied/);
      await db.exec('reset role');
      assert.deepEqual((await db.query('select coins from public.user_private order by user_id')).rows.map(row => row.coins), [100,200]);
      assert.equal(await scalar('select count(*)::integer value from public.game_scores where reward<>0 or verified is distinct from false'), 0);
    });

    await t.test('either unexpected follow-up bound rolls back all changes, including numeric prefixes', async () => {
      for (const { game, oldLimit } of longGames) {
        await db.exec('reset role');
        await db.exec(beforeFunctions);
        await db.exec(migration);
        const baseline = await catalog();
        const guestFunction = baseline.find(row => row.name === 'ojjuda_guest_internal.score_limit');
        await db.exec(guestFunction.definition.replace(
          new RegExp(`('${game}'\\s+then\\s+)${oldLimit}(?=\\s|$)`, 'i'), (_, prefix) => prefix + (oldLimit * 10)));
        const before = await catalog();
        await assert.rejects(db.exec(longGameMigration), new RegExp(`Unexpected ${game} score limit in ojjuda_guest_internal\\.score_limit`));
        assert.deepEqual(await catalog(), before);
      }
    });
  } finally {
    await db.close();
  }
});
