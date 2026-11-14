'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const {fixture} = require('./drinking-room-fixture.cjs');
const {screen, until, rpcArgs} = require('./helpers/drinking-ui-fixture.cjs');

const root = path.join(__dirname, '..');
// Add a reviewed catalog only when its individual rebuild is ready. Liar has
// its own test covering the preservation of an already-dealt secret word.
const catalogs = [
  {
    kind: 'king', migration: '20261114061002_drinking_rebuild_king.sql',
    maxLength: 80, entries: 64, moderated: true, exercise: exerciseKing
  },
  {
    kind: 'minority', migration: '20261114061003_drinking_rebuild_minority.sql',
    pair: true, maxLength: 120, entries: 60, exercise: exerciseMinority
  },
  {
    kind: 'mission', migration: '20261114061004_drinking_rebuild_mission.sql',
    pair: true, maxLength: 120, entries: 40, exercise: exerciseMission
  },
  {
    kind: 'bomb', migration: '20261114061005_drinking_rebuild_bomb.sql',
    maxLength: 120, entries: 48, exercise: exerciseBomb
  },
  {
    kind: 'fingers', migration: '20261114061007_drinking_rebuild_fingers.sql',
    maxLength: 120, entries: 64, moderated: true, exercise: exerciseFingers
  },
  {
    kind: 'imagevote', migration: '20261114061008_drinking_rebuild_imagevote.sql',
    maxLength: 120, entries: 64, moderated: true, exercise: exerciseImageVote
  },
  {
    kind: 'initial', migration: '20261114061009_drinking_rebuild_initial.sql',
    maxLength: 120, entries: 24, exercise: exerciseInitial
  }
];
const entryKeys = entries => entries.map(entry => JSON.stringify(entry)).sort();

async function otherCatalogs(db, kind) {
  return (await db.query(`select jsonb_build_object(
    'managed', (select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_content_items c where kind<>$1),
    'legacy', (select coalesce(jsonb_agg(to_jsonb(p) order by kind,slot),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_prompts p where kind<>$1),
    'queue', (select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_prompt_queue q where kind<>$1),
    'truth', (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_truth_cards t)
    ) value`, [kind])).rows[0].value;
}

for (const catalog of catalogs) {
  test(`${catalog.kind}: an individual catalog rebuild replaces its banks and preserves the other games`, {timeout: 120_000}, async t => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'games/drinking/content', catalog.kind + '.json'), 'utf8'));
    assert.equal(manifest.kind, catalog.kind);
    assert.ok(manifest.mechanic, 'the manifest records its game mechanic');
    assert.ok(Array.isArray(manifest.entries));
    assert.equal(manifest.entries.length, catalog.entries);
    for (const entry of manifest.entries) {
      const parts = catalog.pair ? entry : [entry];
      assert.ok(Array.isArray(parts));
      assert.equal(parts.length, catalog.pair ? 2 : 1);
      for (const text of parts) {
        assert.equal(typeof text, 'string');
        assert.ok(text && text === text.trim());
        assert.ok([...text].length <= catalog.maxLength, 'each entry fits the actual RPC and database limit');
      }
      if (catalog.pair) assert.notEqual(parts[0], parts[1]);
    }
    const expected = entryKeys(manifest.entries);
    assert.equal(new Set(expected).size, expected.length);

    const f = await fixture({beforeRebuild: true});
    t.after(() => f.close());
    assert.equal(f.migrations.includes(catalog.migration), false, 'keep the baseline fixture before the rebuild');
    const oldIds = (await f.db.query(
      'select id from ojjuda_arcade_internal.drinking_content_items where kind=$1 order by id', [catalog.kind]
    )).rows.map(row => row.id);
    assert.ok(oldIds.length > 0, 'the baseline has an old catalog to replace');
    const rejectedText = 'Fixture rejected ' + catalog.kind + ' suggestion';
    if (catalog.moderated) {
      await f.db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
        values($1,'',$2,ojjuda_arcade_internal.drinking_prompt_fingerprint($1,'',$2),'rejected')`, [catalog.kind, rejectedText]);
      await f.db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
        values('truth','mild',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('truth','mild',$1),'pending')`,
      ['Fixture other-game review queue for ' + catalog.kind]);
      assert.equal((await f.db.query(`select exists(select 1 from ojjuda_arcade_internal.drinking_prompt_baseline
        where fingerprint=ojjuda_arcade_internal.drinking_prompt_fingerprint($1,'',$2)) value`,
      [catalog.kind, rejectedText])).rows[0].value, false, 'the rejected fingerprint begins only in the old queue');
    }
    const otherBefore = await otherCatalogs(f.db, catalog.kind);
    await f.db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', catalog.migration), 'utf8'));

    await t.test('old catalog IDs and the legacy bank are removed completely', async () => {
      assert.deepEqual((await f.db.query(
        'select id from ojjuda_arcade_internal.drinking_content_items where id=any($1::int[])', [oldIds]
      )).rows, []);
      assert.deepEqual((await f.db.query(
        'select slot from ojjuda_arcade_internal.drinking_prompts where kind=$1', [catalog.kind]
      )).rows, []);
      const current = (await f.db.query(
        'select body,second,active from ojjuda_arcade_internal.drinking_content_items where kind=$1 order by id', [catalog.kind]
      )).rows;
      assert.ok(current.every(row => row.active));
      assert.deepEqual(entryKeys(current.map(row => row.second === null ? row.body : [row.body, row.second])), expected);
    });

    await t.test('normal and round-mix official pools both match the complete manifest', async () => {
      for (const roundMix of [false, true]) {
        const result = await f.publicRpc(f.users[0], 'drinking_content', [
          'pool', {kinds: [catalog.kind], round_mix: roundMix}
        ]);
        assert.deepEqual(Object.keys(result.banks), [catalog.kind]);
        assert.deepEqual(entryKeys(result.banks[catalog.kind]), expected, `round_mix=${roundMix}`);
      }
    });

    await t.test('all other catalogs and their review queue remain unchanged', async () => {
      assert.deepEqual(await otherCatalogs(f.db, catalog.kind), otherBefore);
    });

    if (catalog.moderated) await t.test('removing the old queue does not let a rejected suggestion return', async () => {
      assert.deepEqual((await f.db.query(
        'select id from ojjuda_arcade_internal.drinking_prompt_queue where kind=$1', [catalog.kind]
      )).rows, []);
      assert.deepEqual(await f.publicRpc(f.users[0], 'drinking_prompt_suggestions', [
        'submit', {kind: catalog.kind, text: rejectedText}
      ]), {ok: true});
      assert.deepEqual((await f.db.query(
        'select id from ojjuda_arcade_internal.drinking_prompt_queue where kind=$1', [catalog.kind]
      )).rows, [], 'the retired fingerprint is not recreated as a new pending suggestion');
      assert.deepEqual((await f.db.query(
        'select id from ojjuda_arcade_internal.drinking_content_items where kind=$1 and body=$2', [catalog.kind, rejectedText]
      )).rows, [], 'a rejected suggestion never becomes active content');
    });

    if (catalog.exercise) await catalog.exercise(t, f, manifest);
  });
}

async function exerciseKing(t, f, manifest) {
  const pairMissions = manifest.entries.filter(text => text.startsWith('둘이 '));
  const soloMissions = manifest.entries.filter(text => !text.startsWith('둘이 '));
  await t.test('king has 32 solo and 32 paired missions within the 80-character limit', () => {
    assert.equal(soloMissions.length, 32);
    assert.equal(pairMissions.length, 32);
    assert.ok(manifest.entries.every(text => [...text].length <= 80));
  });

  const king = (actor, action, code = '', options = {}) => f.publicRpc(actor, 'king_multiplayer', [action, code, options]);
  async function pairedOrder(actors, mission) {
    let room = await king(actors[0], 'create', '', {
      title: '왕게임 콘텐츠 검증', capacity: 3, password: 'king-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) room = await king(actor, 'join', room.code, {password: 'king-test'});
    assert.equal(room.phase, 'cards');
    const states = () => Promise.all(actors.map(actor => king(actor, 'state', room.code)));
    const dealt = await states();
    assert.deepEqual(dealt.map(view => view.card).sort(), [0, 1, 2]);
    const byCard = new Map(dealt.map((view, seat) => [view.card, {actor: actors[seat], seat}]));
    for (const actor of actors) room = await king(actor, 'ready', room.code, {round: room.round});
    assert.equal(room.phase, 'order');
    room = await king(byCard.get(0).actor, 'order', room.code, {round: room.round, number: 1, second: 2, mission});
    assert.equal(room.phase, 'response');
    assert.equal(room.recipient, byCard.get(1).seat);
    assert.equal(room.secondRecipient, byCard.get(2).seat);
    assert.deepEqual(room.accepted, []);
    return {room, states, byCard};
  }

  await t.test('two recipients must accept independently before the actual three-player round completes', async () => {
    const {room, states, byCard} = await pairedOrder(f.users.slice(0, 3), pairMissions[0]);
    let response = await king(byCard.get(1).actor, 'accept', room.code, {round: room.round});
    assert.equal(response.phase, 'response');
    assert.deepEqual(response.accepted, [1]);
    for (const view of await states()) {
      assert.equal(view.phase, 'response');
      assert.deepEqual(view.accepted, [1]);
    }
    const repeated = await king(byCard.get(1).actor, 'accept', room.code, {round: room.round});
    assert.equal(repeated.phase, 'response', 'retrying one consent cannot count as the other person');
    assert.equal(repeated.revision, response.revision);
    assert.deepEqual(repeated.accepted, [1]);

    response = await king(byCard.get(2).actor, 'accept', room.code, {round: room.round});
    assert.equal(response.phase, 'done');
    for (const view of await states()) {
      assert.equal(view.phase, 'done');
      assert.deepEqual([...view.accepted].sort(), [1, 2]);
      assert.equal(view.mission, pairMissions[0]);
      assert.equal(Object.hasOwn(view, 'declined'), false);
    }
  });

  await t.test('a recipient can decline after the other accepts and the UI imposes no drinking penalty', async st => {
    const {room, states, byCard} = await pairedOrder(f.users.slice(3, 6), pairMissions[1]);
    await king(byCard.get(1).actor, 'accept', room.code, {round: room.round});
    // The real room script renders real SQL snapshots; only the network and
    // unrelated recommendation service are replaced by local test adapters.
    const ui = await screen({
      url: '/games/king/?room=' + room.code,
      actor: byCard.get(2).actor,
      scripts: ['/games/king/room.js'],
      prepare(w) {
        w.DrinkingPrompts = {recommendations: () => async () => '', submit() {}};
      },
      rpc: (name, args, call) => f.publicRpc(call.actor, name, rpcArgs(name, args))
    });
    st.after(() => ui.close());
    await until(() => ui.find('[data-do="decline"]'), 'king recipient response UI');
    assert.doesNotMatch(ui.find('[data-do="decline"]').textContent, /술|모금|벌주/u);
    ui.click('[data-do="decline"]');
    await until(() => ui.find('.king-order') && !ui.find('[data-do="decline"]'), 'declined king round completes');
    const instructions = [...ui.w.document.querySelectorAll('#view p')].map(node => node.textContent).join(' ');
    assert.doesNotMatch(instructions, /술\s*한\s*모금|벌주|술(?:을)?\s*(?:마셔|마시세요|드세요)/u);
    for (const view of await states()) {
      assert.equal(view.phase, 'done');
      assert.equal(view.declined, byCard.get(2).seat);
      assert.deepEqual(view.accepted, [1]);
      assert.equal(view.mission, pairMissions[1]);
    }
    assert.deepEqual(ui.errors, []);
  });
}

async function exerciseMinority(t, f, manifest) {
  await t.test('three actual voters publish a consistent 2-to-1 result once and begin a new catalog round', async () => {
    const actors = f.users.slice(0, 3);
    const choices = new Set(entryKeys(manifest.entries));
    const voteRoom = (actor, action, code = '', options = {}) =>
      f.publicRpc(actor, 'party_vote_multiplayer', ['minority', action, code, options]);
    let room = await voteRoom(actors[0], 'create', '', {
      title: '소수파 콘텐츠 검증', capacity: 3, password: 'minority-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) room = await voteRoom(actor, 'join', room.code, {password: 'minority-test'});
    assert.equal(room.phase, 'vote');
    assert.ok(choices.has(JSON.stringify(room.choices)), 'the first round deals one complete rebuilt pair');
    const firstPair = room.choices;
    const firstRound = room.round;
    const states = () => Promise.all(actors.map(actor => voteRoom(actor, 'state', room.code)));
    function votingSnapshot(view, count) {
      assert.equal(view.phase, 'vote');
      assert.equal(view.voteCount, count);
      assert.equal(Object.hasOwn(view, 'votes'), false, 'individual ballots are hidden until every player votes');
    }
    for (const view of await states()) {
      votingSnapshot(view, 0);
      assert.deepEqual(view.choices, firstPair);
      assert.equal(view.voted, false);
    }

    const firstBallot = {round: firstRound, target: 0};
    room = await voteRoom(actors[0], 'vote', room.code, firstBallot);
    votingSnapshot(room, 1);
    assert.equal(room.voted, true);
    const repeatedFirst = await voteRoom(actors[0], 'vote', room.code, firstBallot);
    assert.equal(repeatedFirst.revision, room.revision);
    votingSnapshot(repeatedFirst, 1);
    await assert.rejects(voteRoom(actors[0], 'vote', room.code, {round: firstRound, target: 1}), /already_voted/);

    room = await voteRoom(actors[1], 'vote', room.code, {round: firstRound, target: 0});
    for (const view of await states()) {
      votingSnapshot(view, 2);
      assert.deepEqual(view.choices, firstPair);
    }
    const lastBallot = {round: firstRound, target: 1};
    room = await voteRoom(actors[2], 'vote', room.code, lastBallot);
    assert.equal(room.phase, 'done');
    // Minority exposes the final per-seat votes, not the mission game's
    // `totals` field. The clients derive each choice's group from these votes.
    for (const [seat, view] of (await states()).entries()) {
      assert.equal(view.me, seat);
      assert.equal(view.phase, 'done');
      assert.equal(view.round, firstRound);
      assert.equal(view.revision, room.revision);
      assert.equal(view.voteCount, 3);
      assert.equal(view.voted, true);
      assert.deepEqual(view.choices, firstPair);
      assert.deepEqual(view.votes, [0, 0, 1]);
      assert.equal(Object.hasOwn(view, 'totals'), false);
      assert.deepEqual(view.votes.map((option, index) => option === 1 ? view.players[index] : null).filter(Boolean), [f.names[2]]);
    }
    const repeatedLast = await voteRoom(actors[2], 'vote', room.code, lastBallot);
    assert.equal(repeatedLast.revision, room.revision);
    assert.equal(repeatedLast.voteCount, 3);
    assert.deepEqual(repeatedLast.votes, [0, 0, 1]);

    room = await voteRoom(actors[0], 'again', room.code, {round: firstRound});
    assert.equal(room.round, firstRound + 1);
    assert.ok(choices.has(JSON.stringify(room.choices)), 'the following round also deals an intact rebuilt pair');
    assert.notDeepEqual(room.choices, firstPair, 'an alternative pair is available for the next round');
    for (const view of await states()) {
      votingSnapshot(view, 0);
      assert.equal(view.round, room.round);
      assert.deepEqual(view.choices, room.choices);
      assert.equal(view.voted, false);
    }
    await assert.rejects(voteRoom(actors[2], 'vote', room.code, lastBallot), /stale_round/);
    assert.equal((await voteRoom(actors[0], 'state', room.code)).voteCount, 0);
  });
}

async function exerciseMission(t, f, manifest) {
  await t.test('one private outlier is revealed only after all three players finish the mission vote', async () => {
    const actors = f.users.slice(0, 3);
    const pairs = new Set(entryKeys(manifest.entries));
    const mission = (actor, action, code = '', options = {}) =>
      f.publicRpc(actor, 'party_vote_multiplayer', ['mission', action, code, options]);
    let room = await mission(actors[0], 'create', '', {
      title: '다른 미션 콘텐츠 검증', capacity: 3, password: 'mission-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) room = await mission(actor, 'join', room.code, {password: 'mission-test'});
    const states = () => Promise.all(actors.map(actor => mission(actor, 'state', room.code)));
    function privateDeal(snapshots, phase) {
      const counts = new Map();
      for (const [seat, view] of snapshots.entries()) {
        assert.equal(view.me, seat);
        assert.equal(view.phase, phase);
        assert.equal(typeof view.word, 'string');
        counts.set(view.word, (counts.get(view.word) || 0) + 1);
        for (const secret of ['choices', 'odd', 'totals', 'votes']) {
          assert.equal(Object.hasOwn(view, secret), false, `${secret} remains private before the final vote`);
        }
      }
      assert.equal(counts.size, 2, 'the three players receive exactly two different words');
      assert.deepEqual([...counts.values()].sort(), [1, 2], 'only one player gets the other word');
      const commonWord = [...counts].find(([, count]) => count === 2)[0];
      const oddWord = [...counts].find(([, count]) => count === 1)[0];
      const pair = [commonWord, oddWord];
      assert.ok(pairs.has(JSON.stringify(pair)), 'the private words come from the same rebuilt pair');
      return {pair, odd: snapshots.findIndex(view => view.word === oddWord)};
    }
    const initial = await states();
    const firstDeal = privateDeal(initial, 'cards');
    const firstRound = room.round;
    for (const view of initial) {
      assert.equal(view.ready, false);
      assert.equal(view.readyCount, 0);
      assert.equal(view.voteCount, 0);
    }

    room = await mission(actors[0], 'ready', room.code, {round: firstRound});
    assert.equal(room.phase, 'cards');
    assert.equal(room.readyCount, 1);
    const repeatedReady = await mission(actors[0], 'ready', room.code, {round: firstRound});
    assert.equal(repeatedReady.revision, room.revision);
    assert.equal(repeatedReady.readyCount, 1);
    for (const actor of actors.slice(1)) room = await mission(actor, 'ready', room.code, {round: firstRound});
    const acting = await states();
    assert.deepEqual(privateDeal(acting, 'act'), firstDeal);
    assert.ok(acting.every(view => view.ready && view.readyCount === 3));

    room = await mission(actors[0], 'start_vote', room.code, {round: firstRound});
    assert.deepEqual(privateDeal(await states(), 'vote'), firstDeal);
    // A player cannot vote for themselves. The two matching players identify
    // the outlier; the outlier votes for one of the other seats.
    const targets = actors.map((_, seat) => seat === firstDeal.odd ? (seat + 1) % actors.length : firstDeal.odd);
    const ballot = seat => ({round: firstRound, target: targets[seat]});
    room = await mission(actors[0], 'vote', room.code, ballot(0));
    assert.equal(room.phase, 'vote');
    assert.equal(room.voteCount, 1);
    const repeatedFirst = await mission(actors[0], 'vote', room.code, ballot(0));
    assert.equal(repeatedFirst.revision, room.revision);
    assert.equal(repeatedFirst.voteCount, 1);
    room = await mission(actors[1], 'vote', room.code, ballot(1));
    const pending = await states();
    assert.deepEqual(privateDeal(pending, 'vote'), firstDeal);
    assert.ok(pending.every(view => view.voteCount === 2));

    room = await mission(actors[2], 'vote', room.code, ballot(2));
    const totals = actors.map((_, seat) => targets.filter(target => target === seat).length);
    for (const view of await states()) {
      assert.equal(view.phase, 'done');
      assert.equal(view.round, firstRound);
      assert.equal(view.revision, room.revision);
      assert.equal(view.voteCount, 3);
      assert.equal(view.voted, true);
      assert.deepEqual(view.choices, firstDeal.pair);
      assert.equal(view.odd, firstDeal.odd);
      assert.deepEqual(view.totals, totals);
      assert.equal(view.totals[view.odd], 2);
      assert.equal(Object.hasOwn(view, 'word'), false);
      assert.equal(Object.hasOwn(view, 'votes'), false, 'mission publishes totals rather than individual ballots');
    }
    const repeatedLast = await mission(actors[2], 'vote', room.code, ballot(2));
    assert.equal(repeatedLast.revision, room.revision);
    assert.equal(repeatedLast.voteCount, 3);
    assert.deepEqual(repeatedLast.totals, totals);

    room = await mission(actors[0], 'again', room.code, {round: firstRound});
    assert.equal(room.round, firstRound + 1);
    const nextViews = await states();
    const nextDeal = privateDeal(nextViews, 'cards');
    assert.notDeepEqual(nextDeal.pair, firstDeal.pair);
    for (const view of nextViews) {
      assert.equal(view.ready, false);
      assert.equal(view.readyCount, 0);
      assert.equal(view.voteCount, 0);
      assert.equal(view.voted, false);
    }
    await assert.rejects(mission(actors[2], 'vote', room.code, ballot(2)), /stale_round/);
    assert.equal((await mission(actors[0], 'state', room.code)).voteCount, 0);
  });
}

async function exerciseBomb(t, f, manifest) {
  await t.test('passing preserves the bomb topic and deadline until expiry, then the next round draws a different new topic', async () => {
    // Follow the existing SQL clock-fixture pattern: change only the RPC's
    // clock input in this isolated database. The real bomb transitions and
    // generated deadline remain intact, and the test never waits in real time.
    await f.db.exec(`
      create schema drinking_content_fixture;
      create table drinking_content_fixture.clock_value(ms bigint not null);
      insert into drinking_content_fixture.clock_value
        select floor(extract(epoch from clock_timestamp())*1000)::bigint;
      create function drinking_content_fixture.clock() returns timestamptz
        language sql stable set search_path='' as $$
          select pg_catalog.to_timestamp(ms/1000.0) from drinking_content_fixture.clock_value
        $$;
    `);
    const definition = (await f.db.query(`select pg_get_functiondef(
      'ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure) value`)).rows[0].value;
    const clocked = definition.replace(/\bclock_timestamp\(\)/g, 'drinking_content_fixture.clock()');
    assert.notEqual(clocked, definition, 'the fixture controls the real RPC timer');
    await f.db.exec(clocked);
    const setTime = ms => f.db.query('update drinking_content_fixture.clock_value set ms=$1', [ms]);
    const actors = f.users.slice(0, 3);
    const topics = new Set(manifest.entries);
    const bomb = (actor, action, code = '', options = {}) =>
      f.publicRpc(actor, 'party_live_multiplayer', ['bomb', action, code, options]);
    const command = (actor, action, state, options = {}) => bomb(actor, action, state.code, {
      round: state.round, revision: state.revision, request_id: randomUUID(), ...options
    });
    let room = await bomb(actors[0], 'create', '', {
      title: '폭탄 주제 검증', capacity: 3, password: 'bomb-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) room = await bomb(actor, 'join', room.code, {password: 'bomb-test'});
    const states = () => Promise.all(actors.map(actor => bomb(actor, 'state', room.code)));
    const storedGame = async () => (await f.db.query(
      "select game_state value from ojjuda_arcade_internal.party_vote_rooms where kind='bomb' and code=$1", [room.code]
    )).rows[0].value;

    assert.equal(room.phase, 'setup');
    room = await command(actors[0], 'configure', room, {random: false, baseSeconds: 25});
    assert.equal(room.phase, 'ready');
    room = await command(actors[0], 'start', room);
    assert.equal(room.phase, 'active');
    const firstRound = room.round;
    const firstTopic = room.game.topic;
    const startedAt = room.serverMs;
    const initial = await storedGame();
    const deadline = initial.endsAt;
    assert.ok(topics.has(firstTopic));
    assert.equal(initial.topic, firstTopic);
    assert.ok(deadline - startedAt >= 10_000 && deadline - startedAt <= 25_000);
    assert.equal(room.game.holder, 0);
    assert.equal(room.game.turn, 0);

    for (let pass = 1; pass <= actors.length; pass++) {
      await setTime(startedAt + pass * 1000);
      room = await command(actors[room.game.holder], 'pass', room, {turn: room.game.turn});
      assert.equal(room.phase, 'active');
      assert.equal(room.game.topic, firstTopic);
      assert.equal(room.game.holder, pass % actors.length);
      assert.equal(room.game.turn, pass);
      const current = await storedGame();
      assert.equal(current.endsAt, deadline, 'passing does not restart or extend the bomb timer');
      assert.deepEqual({...current, holder: initial.holder, turn: initial.turn}, initial,
        'a valid pass changes only the holder and turn inside the bomb state');
    }
    const beforeStale = await storedGame();
    await assert.rejects(command(actors[room.game.holder], 'pass', room, {turn: room.game.turn - 1}), /stale_turn/);
    assert.deepEqual(await storedGame(), beforeStale);
    for (const view of await states()) {
      assert.equal(view.game.topic, firstTopic);
      assert.equal(view.game.holder, room.game.holder);
      assert.equal(view.game.turn, room.game.turn);
      assert.equal(Object.hasOwn(view.game, 'endsAt'), false, 'the private deadline is not exposed to players');
    }

    await setTime(deadline - 1);
    room = await bomb(actors[1], 'state', room.code);
    assert.equal(room.phase, 'active', 'a state tick before the deadline keeps the bomb active');
    const lastHolder = room.game.holder;
    await setTime(deadline);
    room = await bomb(actors[1], 'state', room.code);
    assert.equal(room.phase, 'done', 'the normal state RPC settles the bomb exactly at the deadline');
    for (const view of await states()) {
      assert.equal(view.phase, 'done');
      assert.equal(view.game.topic, firstTopic);
      assert.equal(view.game.loser, lastHolder);
    }

    room = await command(actors[0], 'again', room);
    assert.equal(room.round, firstRound + 1);
    assert.equal(room.phase, 'setup');
    room = await command(actors[0], 'configure', room, {random: false, baseSeconds: 25});
    room = await command(actors[0], 'start', room);
    assert.equal(room.phase, 'active');
    assert.ok(topics.has(room.game.topic));
    assert.notEqual(room.game.topic, firstTopic, 'the previous topic is excluded when another new topic is available');
    assert.ok((await storedGame()).endsAt > deadline);
    for (const view of await states()) {
      assert.equal(view.round, room.round);
      assert.equal(view.game.topic, room.game.topic);
      assert.equal(view.game.holder, 0);
      assert.equal(view.game.turn, 0);
    }
  });
}

async function exerciseFingers(t, f, manifest) {
  await t.test('all 64 conditions describe the person who chooses whether to fold', () => {
    assert.ok(manifest.entries.every(condition => condition.endsWith('사람')));
  });

  await t.test('three members answer privately once per condition and only matching answers fold a finger', async () => {
    const actors = f.users.slice(0, 3);
    const fingers = (actor, action, code = '', options = {}) =>
      f.publicRpc(actor, 'party_live_multiplayer', ['fingers', action, code, options]);
    const options = (state, extra = {}) => ({
      round: state.round, revision: state.revision, request_id: randomUUID(), turn: state.game.turn, ...extra
    });
    let room = await fingers(actors[0], 'create', '', {
      title: '손가락 조건 검증', capacity: 3, password: 'fingers-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) room = await fingers(actor, 'join', room.code, {password: 'fingers-test'});
    const remaining = [5, 5, 5];
    async function views(phase, submitted, answered) {
      const snapshots = await Promise.all(actors.map(actor => fingers(actor, 'state', room.code)));
      for (const [seat, view] of snapshots.entries()) {
        assert.equal(view.phase, phase);
        assert.deepEqual(view.game.fingers, remaining);
        assert.equal(view.game.submitted, submitted);
        assert.equal(view.game.mine, phase === 'done' || answered.includes(seat));
        assert.equal(Object.hasOwn(view.game, 'responses'), false, 'a member never receives the response map');
      }
      return snapshots;
    }
    await views('prompt', 0, []);
    await assert.rejects(fingers(actors[1], 'finger_prompt', room.code,
      options(room, {question: manifest.entries[0]})), /not_your_turn/);

    for (let turn = 0; turn < 5; turn++) {
      assert.equal(room.phase, 'prompt');
      assert.equal(room.game.turn, turn);
      const author = room.game.current;
      const question = manifest.entries[turn];
      room = await fingers(actors[author], 'finger_prompt', room.code, options(room, {question}));
      assert.equal(room.phase, 'answer');
      assert.equal(room.game.question, question);
      const prompt = room;
      const fold = [true, false, turn % 2 === 0];
      const first = options(prompt, {fold: fold[0], seat: 1, target: 1});
      room = await fingers(actors[0], 'finger_answer', room.code, first);
      await views('answer', 1, [0]);
      const firstAgain = await fingers(actors[0], 'finger_answer', room.code, first);
      assert.equal(firstAgain.revision, room.revision);
      assert.equal(firstAgain.game.submitted, 1);
      assert.deepEqual(firstAgain.game.fingers, remaining);
      await assert.rejects(fingers(actors[0], 'finger_answer', room.code,
        options(room, {fold: false})), /already_answered/);

      // Each phone can answer from the same prompt revision. The RPC uses the
      // authenticated member's seat; the first caller's forged target did not
      // consume this second member's independent response.
      room = await fingers(actors[1], 'finger_answer', room.code, options(prompt, {fold: fold[1]}));
      await views('answer', 2, [0, 1]);
      await assert.rejects(fingers(f.users[13], 'finger_answer', room.code,
        options(room, {fold: true, seat: 2, target: 2})), /not_room_member/);

      const last = options(prompt, {fold: fold[2]});
      room = await fingers(actors[2], 'finger_answer', room.code, last);
      for (let seat = 0; seat < remaining.length; seat++) remaining[seat] -= Number(fold[seat]);
      assert.deepEqual(room.game.fingers, remaining);
      const lastAgain = await fingers(actors[2], 'finger_answer', room.code, last);
      assert.equal(lastAgain.revision, room.revision);
      assert.deepEqual(lastAgain.game.fingers, remaining, 'retrying the settling response never folds twice');
      if (turn < 4) {
        assert.equal(room.phase, 'prompt');
        assert.equal(room.game.turn, turn + 1);
        assert.equal(room.game.current, (author + 1) % actors.length);
        await views('prompt', 0, []);
      }
    }

    assert.deepEqual(remaining, [0, 5, 2]);
    for (const view of await views('done', 3, [0, 1, 2])) {
      assert.deepEqual(view.game.losers, [0]);
      assert.equal(view.game.fingers[1], 5, 'choosing not to fold leaves all five fingers intact');
      assert.equal(view.game.question, manifest.entries[4]);
    }
  });
}

async function exerciseImageVote(t, f, manifest) {
  await t.test('all 64 prompts ask which person matches the image', () => {
    assert.ok(manifest.entries.every(question => question.endsWith('사람은?')));
  });

  await t.test('three image votes reveal matching totals and winners without revealing identifiable ballots', async () => {
    const actors = f.users.slice(0, 3);
    const imageVote = (actor, action, code = '', options = {}) =>
      f.publicRpc(actor, 'party_live_multiplayer', ['imagevote', action, code, options]);
    const options = (state, extra = {}) => ({
      round: state.round, revision: state.revision, request_id: randomUUID(), turn: state.game.turn, ...extra
    });
    let room = await imageVote(actors[0], 'create', '', {
      title: '이미지 지목 콘텐츠 검증', capacity: 3, password: 'image-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) room = await imageVote(actor, 'join', room.code, {password: 'image-test'});
    assert.equal(room.phase, 'prompt');
    const question = manifest.entries[0];
    room = await imageVote(actors[0], 'image_prompt', room.code, options(room, {question}));
    assert.equal(room.phase, 'vote');
    assert.equal(room.game.question, question);
    const prompt = room;
    async function pending(submitted, voters) {
      for (const [seat, actor] of actors.entries()) {
        const view = await imageVote(actor, 'state', room.code);
        assert.equal(view.phase, 'vote');
        assert.equal(view.game.question, question);
        assert.equal(view.game.submitted, submitted);
        assert.equal(view.game.mine, voters.includes(seat));
        for (const privateKey of ['votes', 'responses', 'counts', 'winners']) {
          assert.equal(Object.hasOwn(view.game, privateKey), false, `${privateKey} is hidden before the final ballot`);
        }
      }
    }
    await pending(0, []);
    await assert.rejects(imageVote(actors[0], 'image_vote', room.code,
      options(prompt, {target: 0})), /invalid_target/, 'three-player rounds require choosing another person');

    const first = options(prompt, {target: 1});
    room = await imageVote(actors[0], 'image_vote', room.code, first);
    await pending(1, [0]);
    const repeatedFirst = await imageVote(actors[0], 'image_vote', room.code, first);
    assert.equal(repeatedFirst.revision, room.revision);
    assert.equal(repeatedFirst.game.submitted, 1);
    await assert.rejects(imageVote(actors[0], 'image_vote', room.code,
      options(room, {target: 2})), /already_answered/);

    room = await imageVote(actors[1], 'image_vote', room.code, options(prompt, {target: 0}));
    await pending(2, [0, 1]);
    const last = options(prompt, {target: 1});
    room = await imageVote(actors[2], 'image_vote', room.code, last);
    assert.equal(room.phase, 'done');
    for (const [seat, actor] of actors.entries()) {
      const view = await imageVote(actor, 'state', room.code);
      assert.equal(view.me, seat);
      assert.equal(view.phase, 'done');
      assert.equal(view.revision, room.revision);
      assert.equal(view.game.question, question);
      assert.equal(view.game.submitted, 3);
      assert.deepEqual(view.game.counts, [1, 2, 0]);
      assert.deepEqual(view.game.winners, [1]);
      assert.equal(view.players[view.game.winners[0]], f.names[1]);
      assert.equal(Object.hasOwn(view.game, 'votes'), false, 'completed snapshots still hide who chose whom');
      assert.equal(Object.hasOwn(view.game, 'responses'), false);
    }
    const stored = (await f.db.query(
      "select game_state value from ojjuda_arcade_internal.party_vote_rooms where kind='imagevote' and code=$1", [room.code]
    )).rows[0].value;
    assert.equal(Object.hasOwn(stored, 'votes'), false, 'scoring also discards the identifiable ballots from room state');
    const repeatedLast = await imageVote(actors[2], 'image_vote', room.code, last);
    assert.equal(repeatedLast.revision, room.revision);
    assert.equal(repeatedLast.game.submitted, 3);
    assert.deepEqual(repeatedLast.game.counts, [1, 2, 0]);
    assert.deepEqual(repeatedLast.game.winners, [1]);
    assert.equal(Object.hasOwn(repeatedLast.game, 'votes'), false);
  });
}

async function exerciseInitial(t, f, manifest) {
  await t.test('each initial has at least eight distinct two-syllable examples with matching Hangul initials', () => {
    const leading = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
    assert.ok(manifest.examples && !Array.isArray(manifest.examples));
    assert.deepEqual(Object.keys(manifest.examples).sort(), [...manifest.entries].sort());
    for (const initial of manifest.entries) {
      assert.match(initial, /^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$/u);
      const examples = manifest.examples[initial];
      assert.ok(Array.isArray(examples) && examples.length >= 8, initial + ' has multiple possible answers');
      assert.equal(new Set(examples.map(word => word.normalize('NFC'))).size, examples.length);
      for (const word of examples) {
        assert.match(word, /^[가-힣]{2}$/u, initial + ' examples contain two complete Hangul syllables');
        const actual = [...word].map(syllable => leading[Math.floor((syllable.codePointAt(0) - 0xAC00) / 588)]).join('');
        assert.equal(actual, initial, word + ' matches its advertised initials');
      }
    }
  });

  await t.test('correct answers keep the initials, eliminations change them and a five-second timeout leaves one eventual winner', async () => {
    // As in the bomb fixture, advance only the RPC clock. Keep the actual
    // initial-game timer, draw and elimination functions unchanged.
    await f.db.exec(`
      create schema drinking_initial_fixture;
      create table drinking_initial_fixture.clock_value(ms bigint not null);
      insert into drinking_initial_fixture.clock_value
        select floor(extract(epoch from clock_timestamp())*1000)::bigint;
      create function drinking_initial_fixture.clock() returns timestamptz
        language sql stable set search_path='' as $$
          select pg_catalog.to_timestamp(ms/1000.0) from drinking_initial_fixture.clock_value
        $$;
    `);
    const definition = (await f.db.query(`select pg_get_functiondef(
      'ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure) value`)).rows[0].value;
    const clocked = definition.replace(/\bclock_timestamp\(\)/g, 'drinking_initial_fixture.clock()');
    assert.notEqual(clocked, definition);
    await f.db.exec(clocked);
    const setTime = ms => f.db.query('update drinking_initial_fixture.clock_value set ms=$1', [ms]);
    const actors = f.users.slice(0, 4);
    const initials = new Set(manifest.entries);
    const initial = (actor, action, code = '', options = {}) =>
      f.publicRpc(actor, 'party_live_multiplayer', ['initial', action, code, options]);
    const command = (actor, action, state) => initial(actor, action, state.code, {
      round: state.round, revision: state.revision, request_id: randomUUID(), turn: state.game.turn
    });
    let room = await initial(actors[0], 'create', '', {
      title: '초성 콘텐츠 검증', capacity: 4, password: 'initial-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) room = await initial(actor, 'join', room.code, {password: 'initial-test'});
    assert.equal(room.phase, 'ready');
    assert.ok(initials.has(room.game.initial));
    assert.deepEqual(room.game.alive, [0, 1, 2, 3]);
    assert.equal(room.game.current, 0);
    const firstInitial = room.game.initial;
    room = await command(actors[0], 'start', room);
    assert.equal(room.phase, 'active');
    assert.equal(room.game.endsAt, room.serverMs + 5000);
    await setTime(room.serverMs + 2000);
    room = await command(actors[0], 'answer', room);
    assert.equal(room.phase, 'ready');
    assert.equal(room.game.initial, firstInitial);
    assert.equal(room.game.current, 1);
    assert.equal(room.game.turn, 1);
    assert.deepEqual(room.game.alive, [0, 1, 2, 3]);

    room = await command(actors[1], 'start', room);
    room = await command(actors[1], 'out', room);
    assert.equal(room.phase, 'intermission');
    assert.equal(room.game.reason, '중복·오답');
    assert.equal(room.game.lastOut, 1);
    assert.deepEqual(room.game.alive, [0, 2, 3]);
    assert.equal(room.game.current, 2);
    assert.ok(initials.has(room.game.initial));
    assert.notEqual(room.game.initial, firstInitial);
    const afterMistake = room.game.initial;

    room = await command(actors[2], 'next', room);
    assert.equal(room.phase, 'ready');
    assert.equal(room.game.initial, afterMistake);
    room = await command(actors[2], 'start', room);
    const deadline = room.game.endsAt;
    assert.equal(deadline, room.serverMs + 5000);
    await setTime(deadline - 1);
    room = await initial(actors[0], 'state', room.code);
    assert.equal(room.phase, 'active');
    assert.deepEqual(room.game.alive, [0, 2, 3]);
    assert.equal(room.game.initial, afterMistake);
    await setTime(deadline);
    room = await initial(actors[0], 'state', room.code);
    assert.equal(room.phase, 'intermission');
    assert.equal(room.game.reason, '시간 초과');
    assert.equal(room.game.lastOut, 2);
    assert.deepEqual(room.game.alive, [0, 3]);
    assert.equal(room.game.current, 3);
    assert.ok(initials.has(room.game.initial));
    assert.notEqual(room.game.initial, afterMistake);
    for (const actor of actors) {
      const view = await initial(actor, 'state', room.code);
      assert.equal(view.game.initial, room.game.initial);
      assert.deepEqual(view.game.alive, [0, 3]);
      assert.equal(Object.hasOwn(view.game, 'examples'), false, 'review examples are not game hints or an exhaustive answer list');
    }

    room = await command(actors[3], 'next', room);
    room = await command(actors[3], 'start', room);
    room = await command(actors[3], 'out', room);
    for (const actor of actors) {
      const view = await initial(actor, 'state', room.code);
      assert.equal(view.phase, 'done');
      assert.equal(view.game.winner, 0);
      assert.equal(view.players[view.game.winner], f.names[0]);
      assert.deepEqual(view.game.alive, [0]);
      assert.equal(view.game.lastOut, 3);
      assert.equal(Object.hasOwn(view.game, 'examples'), false);
    }
  });
}
