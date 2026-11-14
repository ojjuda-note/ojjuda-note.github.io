'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const {fixture} = require('./drinking-room-fixture.cjs');
const {screen, until, rpcArgs} = require('./helpers/drinking-ui-fixture.cjs');

const root = path.join(__dirname, '..');
const epoch = '20261114-drinking-rebuild1';
const migrations = [
  '20261114061006_drinking_rebuild_truth.sql',
  '20261114061106_drinking_truth_catalog_epoch.sql'
];
const plain = value => JSON.parse(JSON.stringify(value));
const sortedDeck = deck => ({mild: [...deck.mild].sort(), spicy: [...deck.spicy].sort()});

test('truth replaces its catalog without resurrecting legacy decks or changing a selected question', {timeout: 120_000}, async t => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'games/drinking/content/truth.json'), 'utf8'));
  assert.equal(manifest.kind, 'truth');
  assert.equal(manifest.entries.length, 128);
  const official = {mild: [], spicy: []};
  for (const item of manifest.entries) {
    assert.ok(Object.hasOwn(official, item.flavor));
    assert.equal(typeof item.body, 'string');
    assert.ok(item.body && item.body === item.body.trim() && [...item.body].length <= 240);
    official[item.flavor].push(item.body);
  }
  assert.equal(official.mild.length, 48);
  assert.equal(official.spicy.length, 80);
  for (const flavor of ['mild', 'spicy']) assert.equal(new Set(official[flavor]).size, official[flavor].length);

  const f = await fixture({beforeRebuild: true});
  t.after(() => f.close());
  for (const migration of migrations) assert.equal(f.migrations.includes(migration), false);
  const {db, users, publicRpc} = f;
  const truth = (actor, action, code = '', options = {}) =>
    publicRpc(actor, 'party_live_multiplayer', ['truth', action, code, options]);
  const act = (actor, action, state, options = {}) => truth(actor, action, state.code, {
    round: state.round, revision: state.revision, request_id: randomUUID(), ...options
  });
  const stored = async code => (await db.query(
    "select phase,round,revision,game_state from ojjuda_arcade_internal.party_vote_rooms where kind='truth' and code=$1", [code]
  )).rows[0];
  async function createRoom(actors) {
    let state = await truth(actors[0], 'create', '', {
      title: '진실게임 교체 검증', capacity: actors.length, password: 'truth-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) state = await truth(actor, 'join', state.code, {password: 'truth-test'});
    assert.equal(state.phase, 'setup');
    return state;
  }
  async function playRound(state, actors, mode, checkQuestion) {
    for (let seat = 0; seat < actors.length; seat++) {
      assert.equal(state.phase, 'pick');
      assert.equal(state.game.turn, seat);
      const flavor = mode === 'mixed' ? (seat % 2 ? 'spicy' : 'mild') : mode;
      const side = state.game.cardFlavors.indexOf(flavor);
      assert.ok(side >= 0);
      state = await act(actors[seat], 'truth_pick', state, {turn: seat, side});
      assert.equal(state.phase, 'answer');
      assert.equal(state.game.flavor, flavor);
      checkQuestion(state.game.question, flavor);
      state = await act(actors[seat], 'truth_pass', state, {turn: seat});
    }
    assert.equal(state.phase, 'done');
    return state;
  }
  const otherBanks = async () => (await db.query(`select jsonb_build_object(
    'managed',(select jsonb_agg(to_jsonb(c) order by id) from ojjuda_arcade_internal.drinking_content_items c),
    'legacy',(select jsonb_agg(to_jsonb(p) order by kind,slot) from ojjuda_arcade_internal.drinking_prompts p),
    'queue',(select jsonb_agg(to_jsonb(q) order by id) from ojjuda_arcade_internal.drinking_prompt_queue q where kind<>'truth')
  ) value`)).rows[0].value;

  const oldCards = (await db.query('select id,flavor,body from ojjuda_arcade_internal.drinking_truth_cards order by id')).rows;
  assert.ok(oldCards.length > 0);
  const oldDeck = Object.fromEntries(['mild', 'spicy'].map(flavor => {
    const retired = oldCards.find(card => card.flavor === flavor && !official[flavor].includes(card.body));
    assert.ok(retired, `the baseline has a retired ${flavor} question`);
    return [flavor, [retired.body]];
  }));
  const rejected = 'Fixture previously rejected truth question';
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('truth','spicy',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('truth','spicy',$1),'rejected')`, [rejected]);
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint)
    values('king','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$1))`, ['Fixture unaffected review record']);
  const oldFingerprints = (await db.query(`select encode(fingerprint,'hex') value from ojjuda_arcade_internal.drinking_truth_history
    union select encode(fingerprint,'hex') from ojjuda_arcade_internal.drinking_prompt_queue where kind='truth'`)).rows.map(row => row.value);
  const otherBefore = await otherBanks();

  const existingActors = users.slice(0, 2);
  let existing = await createRoom(existingActors);
  existing = await act(existingActors[0], 'truth_begin', existing, {deck: oldDeck, mode: 'spicy', showFlavor: true});
  existing = await act(existingActors[0], 'truth_pick', existing, {turn: 0, side: 0});
  assert.equal(existing.game.question, oldDeck.spicy[0]);
  const existingStored = await stored(existing.code);
  const existingViews = await Promise.all(existingActors.map(actor => truth(actor, 'state', existing.code)));

  for (const migration of migrations) await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', migration), 'utf8'));

  await t.test('all old cards are physically removed, fingerprints retained and other banks preserved', async () => {
    assert.deepEqual((await db.query(
      'select id from ojjuda_arcade_internal.drinking_truth_cards where id=any($1::int[])', [oldCards.map(card => card.id)]
    )).rows, []);
    const rows = (await db.query('select flavor,body,active from ojjuda_arcade_internal.drinking_truth_cards')).rows;
    assert.equal(rows.length, 128);
    assert.ok(rows.every(row => row.active));
    for (const flavor of ['mild', 'spicy']) {
      assert.deepEqual(rows.filter(row => row.flavor === flavor).map(row => row.body).sort(), [...official[flavor]].sort());
    }
    assert.equal((await db.query(`select count(*)::int value from ojjuda_arcade_internal.drinking_prompt_baseline
      where encode(fingerprint,'hex')=any($1::text[])`, [oldFingerprints])).rows[0].value, oldFingerprints.length);
    assert.equal((await db.query('select count(*)::int value from ojjuda_arcade_internal.drinking_truth_history')).rows[0].value, 128);
    assert.deepEqual(await otherBanks(), otherBefore);
  });

  await t.test('retired and rejected truth questions cannot return through the suggestion queue', async () => {
    for (const [flavor, body] of [['mild', oldDeck.mild[0]], ['spicy', oldDeck.spicy[0]], ['spicy', rejected]]) {
      assert.deepEqual(await publicRpc(users[0], 'drinking_prompt_suggestions', ['submit', {kind: 'truth', flavor, text: body}]), {ok: true});
    }
    assert.deepEqual((await db.query("select id from ojjuda_arcade_internal.drinking_prompt_queue where kind='truth'")).rows, []);
  });

  await t.test('both official pool modes return exactly the new mild and spicy questions', async () => {
    for (const roundMix of [false, true]) {
      const result = await publicRpc(users[0], 'drinking_content', ['pool', {kinds: ['truth'], round_mix: roundMix}]);
      assert.deepEqual(sortedDeck(result.banks.truth), sortedDeck(official));
    }
  });

  await t.test('an already selected question and its round snapshot survive both migrations', async () => {
    assert.deepEqual(await stored(existing.code), existingStored);
    const after = await Promise.all(existingActors.map(actor => truth(actor, 'state', existing.code)));
    const withoutClock = ({serverMs, ...view}) => view;
    assert.deepEqual(after.map(withoutClock), existingViews.map(withoutClock));
  });

  await t.test('missing and old catalog revisions cannot restore a client deck in any flavor mode', async () => {
    const actors = users.slice(2, 4);
    let state = await createRoom(actors);
    for (const revision of [undefined, 'legacy-before-rebuild']) {
      for (const mode of ['mild', 'spicy', 'mixed']) {
        if (state.phase === 'done') state = await act(actors[0], 'again', state);
        const options = {deck: oldDeck, mode, showFlavor: true};
        if (revision !== undefined) options.catalog_revision = revision;
        state = await act(actors[0], 'truth_begin', state, options);
        assert.deepEqual(sortedDeck((await stored(state.code)).game_state.deck), sortedDeck(official));
        state = await playRound(state, actors, mode, (question, flavor) => {
          assert.ok(official[flavor].includes(question));
          assert.equal(oldDeck[flavor].includes(question), false);
        });
      }
    }
  });

  await t.test('newly submitted room cards survive fallback and a current revision can use new personal decks', async () => {
    const actors = users.slice(4, 6);
    let state = await createRoom(actors);
    const added = '이 방에서 지금 새로 등록한 개인 질문';
    state = await act(actors[1], 'truth_add', state, {flavor: 'spicy', question: added});
    assert.equal(state.game.added.spicy, 1);
    state = await act(actors[0], 'truth_begin', state, {deck: oldDeck, mode: 'spicy', showFlavor: true});
    const merged = (await stored(state.code)).game_state;
    assert.deepEqual([...merged.deck.spicy].sort(), [...official.spicy, added].sort());
    assert.deepEqual(merged.personal.spicy, [added]);
    state = await playRound(state, actors, 'spicy', question => assert.ok([...official.spicy, added].includes(question)));

    state = await act(actors[0], 'again', state);
    const currentDeck = {mild: ['새 버전 개인 순한맛 질문'], spicy: ['새 버전 개인 빨간맛 질문']};
    state = await act(actors[0], 'truth_begin', state, {
      catalog_revision: epoch, deck: currentDeck, mode: 'mixed', showFlavor: true
    });
    assert.deepEqual((await stored(state.code)).game_state.deck, currentDeck);
    await playRound(state, actors, 'mixed', (question, flavor) => assert.equal(question, currentDeck[flavor][0]));
  });

  await t.test('the real UI ignores legacy storage, keeps member v2 cards and sends the new catalog revision', async st => {
    const actors = users.slice(6, 8);
    const state = await createRoom(actors);
    const oldCard = '구형 회원 저장 카드';
    const oldEdit = '구형 공통 편집 카드';
    const foreignCard = '다른 회원의 새 개인 카드';
    const currentCard = '현재 회원의 새 저장 카드';
    const newCard = '화면에서 지금 추가한 새 질문';
    const oldQueued = '구형 저장소의 미전송 질문';
    const currentQueued = '새 저장소의 미전송 질문';
    const foreignQueued = '다른 회원의 미전송 질문';
    const queueKey = (prefix, text) => prefix + JSON.stringify(['truth', 'spicy', text]);
    const queuedValue = text => JSON.stringify({kind: 'truth', flavor: 'spicy', text});
    const ui = await screen({
      url: '/games/truth/?room=' + state.code,
      actor: actors[0],
      scripts: ['/games/drinking/community-prompts.js', '/games/drinking/prompt-submissions.js', '/games/party-live/truth.js', '/games/party-live/room.js'],
      prepare(w) {
        w.document.getElementById('access-content').dataset.member = actors[0];
        w.localStorage.setItem(`oj.party.${actors[0]}.truth.card.spicy.${oldCard}`, '1');
        w.localStorage.setItem('oj.party.live.truth.edits.v1', JSON.stringify([['c0', {flavor: 'spicy', question: oldEdit}]]));
        w.localStorage.setItem(`oj.party.${actors[0]}.truth.v2.card.spicy.${currentCard}`, '1');
        w.localStorage.setItem(`oj.party.${users[8]}.truth.v2.card.spicy.${foreignCard}`, '1');
        w.localStorage.setItem(queueKey(`oj.party.suggestions.${actors[0]}.`, oldQueued), queuedValue(oldQueued));
        w.localStorage.setItem(queueKey(`oj.party.suggestions.v2.${actors[0]}.`, currentQueued), queuedValue(currentQueued));
        w.localStorage.setItem(queueKey(`oj.party.suggestions.v2.${users[8]}.`, foreignQueued), queuedValue(foreignQueued));
      },
      rpc(name, args, call) {
        const values = name === 'drinking_content' || name === 'drinking_prompt_suggestions'
          ? [args.p_action, args.p_options || {}] : rpcArgs(name, args);
        return publicRpc(call.actor, name, values);
      }
    });
    st.after(() => ui.close());
    await until(() => ui.find('#truth-begin'), 'truth setup screen');
    assert.equal(ui.find('[name="truth-mode"]:checked').value, 'spicy');
    assert.equal(ui.find('#truth-flavor').value, 'spicy');
    assert.equal(await ui.w.DrinkingPrompts.refresh('truth'), true);
    assert.deepEqual(sortedDeck(plain(ui.w.DrinkingPromptCatalog)), sortedDeck(official));
    const personal = plain(ui.w.PartyTruthCards.deck());
    assert.deepEqual(sortedDeck(personal), sortedDeck({mild: official.mild, spicy: [...official.spicy, currentCard]}));
    for (const forbidden of [oldCard, oldEdit, foreignCard]) assert.equal(personal.spicy.includes(forbidden), false);

    await until(() => ui.calls.some(call => call.name === 'drinking_prompt_suggestions' && call.args.p_options.text === currentQueued && call.settled), 'new suggestion queue delivery');
    assert.deepEqual((await db.query(
      'select body from ojjuda_arcade_internal.drinking_prompt_queue where body=any($1::text[]) order by body',
      [[oldQueued, currentQueued, foreignQueued]]
    )).rows, [{body: currentQueued}]);

    ui.find('#truth-question').value = newCard;
    ui.find('#truth-question').dispatchEvent(new ui.w.Event('input', {bubbles: true}));
    ui.submit('#truth-form');
    await until(async () => (await truth(actors[0], 'state', state.code)).game.added?.spicy === 1 &&
      ui.find('#truth-begin') && !ui.find('#truth-begin').disabled, 'new personal room card');
    assert.equal(ui.w.localStorage.getItem(`oj.party.${actors[0]}.truth.v2.card.spicy.${newCard}`), '1');
    ui.click('#truth-begin');
    await until(() => ui.find('[data-truth-side]'), 'truth starts with new deck');
    const begin = ui.calls.find(call => call.name === 'party_live_multiplayer' && call.args.p_action === 'truth_begin');
    assert.equal(begin.args.p_options.catalog_revision, epoch);
    assert.equal(begin.args.p_options.mode, 'spicy');
    const expectedSpicy = [...official.spicy, currentCard, newCard];
    assert.deepEqual(sortedDeck(plain(begin.args.p_options.deck)), sortedDeck({mild: official.mild, spicy: expectedSpicy}));
    assert.deepEqual([...(await stored(state.code)).game_state.deck.spicy].sort(), expectedSpicy.sort());
    ui.click('[data-truth-side="0"]');
    await until(() => ui.find('.truth-face strong'), 'new truth question appears');
    assert.ok(expectedSpicy.includes(ui.find('.truth-face strong').textContent));
    ui.click('[data-truth-next="truth_pass"]');
    await until(async () => {
      const current = await truth(actors[0], 'state', state.code);
      return current.phase === 'pick' && current.game.turn === 1 && !ui.find('.truth-face');
    }, 'passing moves to the next member');
    assert.deepEqual(ui.errors, []);
  });
});
