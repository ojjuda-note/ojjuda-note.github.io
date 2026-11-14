'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const {fixture} = require('./drinking-room-fixture.cjs');
const {screen, until, rpcArgs} = require('./helpers/drinking-ui-fixture.cjs');

const root = path.join(__dirname, '..');
const contentDir = path.join(root, 'games/drinking/content');
const migrationDir = path.join(root, 'supabase/migrations');
const manifest = file => JSON.parse(fs.readFileSync(path.join(contentDir, file), 'utf8'));
const sorted = values => [...values].sort();
const wordKey = word => word.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
const entryKeys = entries => entries.map(entry => JSON.stringify(entry)).sort();
const rowEntry = row => row.second === null ? row.body : [row.body, row.second];
// The SQL below intentionally exercises historical expansion wording. Bundled
// client files instead follow the current reviewed corrections.
const currentCatalog = async kind => (await import('../scripts/lib/drinking-catalogs.mjs')).loadDrinkingCatalog(kind);

function validateWords(entries, maxLength) {
  for (const word of entries) {
    assert.equal(typeof word, 'string');
    assert.ok(word.length > 0 && word === word.trim(), 'wording must be nonempty and trimmed');
    assert.equal(word, word.normalize('NFC'), 'store Korean wording in its canonical form');
    assert.ok([...word].length <= maxLength, 'wording fits the actual catalog limit');
    assert.doesNotMatch(word, /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u);
  }
  assert.equal(new Set(entries.map(wordKey)).size, entries.length,
    'case or spacing changes must not disguise duplicates across the two manifests');
}

function validatePairs(entries) {
  for (const pair of entries) {
    assert.ok(Array.isArray(pair));
    assert.equal(pair.length, 2, 'each choice belongs to one complete two-option pair');
    validateWords(pair, 120);
  }
  const keys = entries.map(pair => JSON.stringify(pair.map(wordKey).sort()));
  assert.equal(new Set(keys).size, entries.length,
    'reversing the choices must not disguise duplicates within or across the two manifests');
}

function expansionSql(kind) {
  const migrations = fs.readdirSync(migrationDir).filter(name =>
    new RegExp('^\\d+_drinking_expand_' + kind + '_300\\.sql$').test(name));
  assert.equal(migrations.length, 1, 'apply the single game expansion after the rebuilt baseline');
  return fs.readFileSync(path.join(migrationDir, migrations[0]), 'utf8');
}

async function catalogRows(db, kind) {
  return (await db.query(
    'select to_jsonb(c) value from ojjuda_arcade_internal.drinking_content_items c where kind=$1 order by id', [kind]
  )).rows.map(row => row.value);
}

async function checkAppend(db, kind, originalRows, addition) {
  const current = await catalogRows(db, kind);
  const originalIds = new Set(originalRows.map(row => row.id));
  assert.equal(current.length, originalRows.length + addition.length);
  assert.deepEqual(current.filter(row => originalIds.has(row.id)), originalRows,
    'append must preserve original IDs, active state, revisions and every other field');
  const added = current.filter(row => !originalIds.has(row.id));
  assert.equal(added.length, 300);
  assert.deepEqual(entryKeys(added.map(rowEntry)), entryKeys(addition));
  assert.ok(added.every(row => row.active && row.party_pick));
  assert.deepEqual(entryKeys(current.map(rowEntry)), entryKeys([...originalRows.map(rowEntry), ...addition]));
  const unclean = (await db.query(`select body,second from ojjuda_arcade_internal.drinking_content_items
    where kind=$1 and (body<>ojjuda_arcade_internal.drinking_prompt_clean(body)
      or second<>ojjuda_arcade_internal.drinking_prompt_clean(second))`, [kind])).rows;
  assert.deepEqual(unclean, [], 'stored wording agrees with the actual SQL normalizer');
  return current;
}

async function checkPools(f, kind, expected) {
  for (const roundMix of [false, true]) {
    const result = await f.publicRpc(f.users[0], 'drinking_content', [
      'pool', {kinds: [kind], round_mix: roundMix}
    ]);
    assert.deepEqual(Object.keys(result.banks), [kind]);
    assert.deepEqual(entryKeys(result.banks[kind]), entryKeys(expected), `round_mix=${roundMix}`);
  }
}

async function otherBanks(db, kind) {
  return (await db.query(`select jsonb_build_object(
    'managed', (select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_content_items c where kind<>$1),
    'legacy', (select coalesce(jsonb_agg(to_jsonb(p) order by kind,slot),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_prompts p),
    'queue', (select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_prompt_queue q),
    'truth', (select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_truth_cards c),
    'truth_history', (select coalesce(jsonb_agg(to_jsonb(h) order by fingerprint),'[]'::jsonb)
      from ojjuda_arcade_internal.drinking_truth_history h)
    ) value`, [kind])).rows[0].value;
}

test('liar: 300 appended words preserve the existing catalog and a live three-player round', {timeout: 120_000}, async t => {
  const base = manifest('liar.json');
  const expansion = manifest('expansions/party300/liar.json');
  assert.equal(base.kind, 'liar');
  assert.equal(expansion.kind, 'liar');
  assert.equal(base.entries.length, 64, 'the original reviewed catalog remains unchanged');
  assert.equal(expansion.entries.length, 300, 'this expansion contains exactly 300 additional words');
  const expected = [...base.entries, ...expansion.entries];
  const expectedSet = new Set(expected);
  const extraSet = new Set(expansion.entries);

  await t.test('additional words are valid and distinct from each other and the original 64', () => {
    validateWords(expected, 120);
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061001_drinking_rebuild_liar.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false,
    'the transition fixture stops before expansions');
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const liar = (actor, action, code = '', options = {}) => publicRpc(actor, 'liar_multiplayer', [action, code, options]);
  const views = code => Promise.all(actors.map(actor => liar(actor, 'state', code)));
  const stored = async code => (await db.query(
    'select to_jsonb(r) value from ojjuda_arcade_internal.liar_rooms r where code=$1', [code]
  )).rows[0].value;
  const originalRows = await catalogRows(db, 'liar');
  assert.deepEqual(sorted(originalRows.map(row => row.body)), sorted(base.entries));
  assert.ok(originalRows.every(row => row.active));
  const untouchedQueueText = 'Fixture review item preserved across the liar expansion';
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('king','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$1),'pending')`, [untouchedQueueText]);
  const otherBefore = await otherBanks(db, 'liar');

  let room = await liar(actors[0], 'create', '', {
    title: '라이어 300개 추가 검증', capacity: 3, password: 'expand-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await liar(actor, 'join', room.code, {password: 'expand-test'});
  room = await liar(actors[0], 'hint', room.code, {round: room.round, hint: '확장 전에 남긴 힌트'});
  assert.equal(room.phase, 'hints');
  assert.equal(room.turn, 1);
  const liveBefore = await stored(room.code);
  const viewsBefore = await views(room.code);
  assert.ok(base.entries.includes(liveBefore.secret_word));

  // Run the append migration unchanged while a real game still holds an answer.
  await db.exec(expansionSql('liar'));

  await t.test('all original rows remain byte-for-byte equivalent and precisely 300 new rows appear', async () => {
    await checkAppend(db, 'liar', originalRows, expansion.entries);
  });

  await t.test('the live answer, hints, turn, revision and all private player views survive the append', async () => {
    assert.deepEqual(await stored(room.code), liveBefore);
    assert.deepEqual(await views(room.code), viewsBefore);
  });

  await t.test('other games, legacy banks, truth history and the pending review item stay unchanged', async () => {
    assert.deepEqual(await otherBanks(db, 'liar'), otherBefore);
  });

  await t.test('normal and round-mix official pools expose the original and additional words together', async () => {
    await checkPools(f, 'liar', expected);
  });

  await t.test('the actual draw function reaches appended words and does not repeat its preceding word', async () => {
    // Seed only the fixture RNG so sampling is repeatable without depending on a
    // particular word or draw order. Do not change the game function or catalog.
    await db.query('select setseed(0.314159)');
    let previous = liveBefore.secret_word;
    let sawAdditionalWord = false;
    for (let draw = 0; draw < 32; draw++) {
      const selected = (await db.query(
        "select ojjuda_arcade_internal.drinking_draw_prompt('liar',$1::text[]) value", [[previous]]
      )).rows[0].value;
      assert.equal(selected.length, 1);
      assert.ok(expectedSet.has(selected[0]), 'draws stay within the complete 364-word catalog');
      assert.notEqual(selected[0], previous);
      sawAdditionalWord ||= extraSet.has(selected[0]);
      previous = selected[0];
    }
    assert.equal(sawAdditionalWord, true, 'the server actually uses the new rows, not a cached old bank');
  });

  await t.test('the existing round finishes normally and the next deal preserves citizen/liar secrecy', async () => {
    while (room.phase === 'hints') {
      const seat = room.turn;
      room = await liar(actors[seat], 'hint', room.code, {
        round: room.round, hint: `확장 후 이어진 힌트 ${seat}`
      });
    }
    assert.equal(room.phase, 'voting');
    for (const [seat, actor] of actors.entries()) {
      room = await liar(actor, 'vote', room.code, {round: room.round, target: (seat + 1) % actors.length});
    }
    assert.equal(room.phase, 'done');
    for (const view of await views(room.code)) assert.equal(view.word, liveBefore.secret_word);
    room = await liar(actors[0], 'again', room.code, {round: room.round});
    assert.equal(room.phase, 'hints');
    const nextViews = await views(room.code);
    const citizens = nextViews.filter(view => view.role === 'citizen');
    const liars = nextViews.filter(view => view.role === 'liar');
    assert.equal(citizens.length, 2);
    assert.equal(liars.length, 1);
    const word = citizens[0].word;
    assert.ok(expectedSet.has(word));
    assert.notEqual(word, liveBefore.secret_word);
    assert.equal(citizens[1].word, word);
    assert.equal(Object.hasOwn(liars[0], 'word'), false);
    for (const view of nextViews) {
      assert.equal(view.round, room.round);
      assert.equal(Object.hasOwn(view, 'liar'), false);
      assert.equal(Object.hasOwn(view, 'totals'), false);
    }
  });
});

test('king: 300 appended missions preserve existing orders and work with two-player recommendations', {timeout: 120_000}, async t => {
  const base = manifest('king.json');
  const expansion = manifest('expansions/party300/king.json');
  assert.equal(base.kind, 'king');
  assert.equal(expansion.kind, 'king');
  assert.equal(base.entries.length, 64);
  assert.equal(expansion.entries.length, 300);
  const expected = [...base.entries, ...expansion.entries];
  const extraSet = new Set(expansion.entries);
  const paired = entries => entries.filter(entry => entry.startsWith('둘이 '));

  await t.test('the 300 distinct new missions add exactly 150 solo and 150 two-player choices', () => {
    validateWords(expected, 80);
    assert.equal(paired(base.entries).length, 32);
    assert.equal(paired(expansion.entries).length, 150);
    assert.equal(paired(expected).length, 182);
    assert.equal(expected.length - paired(expected).length, 182);
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061002_drinking_rebuild_king.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false);
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const king = (actor, action, code = '', options = {}) => publicRpc(actor, 'king_multiplayer', [action, code, options]);
  const originalRows = await catalogRows(db, 'king');
  assert.deepEqual(sorted(originalRows.map(row => row.body)), sorted(base.entries));
  assert.ok(originalRows.every(row => row.active));
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('imagevote','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('imagevote','',$1),'pending')`,
  ['Fixture review item preserved across the king expansion']);
  const otherBefore = await otherBanks(db, 'king');

  let room = await king(actors[0], 'create', '', {
    title: '왕게임 300개 추가 검증', capacity: 3, password: 'expand-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await king(actor, 'join', room.code, {password: 'expand-test'});
  const views = () => Promise.all(actors.map(actor => king(actor, 'state', room.code)));
  const stored = async () => (await db.query(
    'select to_jsonb(r) value from ojjuda_arcade_internal.king_rooms r where code=$1', [room.code]
  )).rows[0].value;
  async function readyDeal() {
    const dealt = await views();
    assert.deepEqual(dealt.map(view => view.card).sort(), [0, 1, 2]);
    const byCard = new Map(dealt.map((view, seat) => [view.card, {actor: actors[seat], seat}]));
    for (const actor of actors) room = await king(actor, 'ready', room.code, {round: room.round});
    assert.equal(room.phase, 'order');
    return byCard;
  }
  const originalCards = await readyDeal();
  const existingMission = paired(base.entries)[0];
  room = await king(originalCards.get(0).actor, 'order', room.code, {
    round: room.round, number: 1, second: 2, mission: existingMission
  });
  room = await king(originalCards.get(1).actor, 'accept', room.code, {round: room.round});
  assert.equal(room.phase, 'response');
  assert.deepEqual(room.accepted, [1]);
  const liveBefore = await stored();
  const viewsBefore = await views();

  await db.exec(expansionSql('king'));

  await t.test('all original rows survive and the SQL catalog has 182 solo plus 182 two-player missions', async () => {
    const current = await checkAppend(db, 'king', originalRows, expansion.entries);
    assert.equal(current.length, 364);
    assert.equal(paired(current.map(row => row.body)).length, 182);
    assert.equal(current.filter(row => !row.body.startsWith('둘이 ')).length, 182);
  });

  await t.test('the selected old mission and one pending recipient consent survive without revision changes', async () => {
    assert.deepEqual(await stored(), liveBefore);
    assert.deepEqual(await views(), viewsBefore);
  });

  await t.test('the append preserves other catalogs and queues while both official pools contain all 364 missions', async () => {
    assert.deepEqual(await otherBanks(db, 'king'), otherBefore);
    await checkPools(f, 'king', expected);
  });

  await t.test('the real recommendation UI submits new two-player missions for both acceptance and a pass', async st => {
    // Finish the already selected old mission before dealing new cards. Its
    // second recipient can still accept after the catalog has been extended.
    room = await king(originalCards.get(2).actor, 'accept', room.code, {round: room.round});
    assert.equal(room.phase, 'done');
    assert.equal(room.mission, existingMission);
    assert.deepEqual([...room.accepted].sort(), [1, 2]);

    for (const outcome of ['accept', 'decline']) {
      room = await king(actors[0], 'again', room.code, {round: room.round});
      const byCard = await readyDeal();
      const kingActor = byCard.get(0).actor;
      const ui = await screen({
        url: '/games/king/?room=' + room.code,
        actor: kingActor,
        scripts: ['/games/drinking/community-prompts.js', '/games/drinking/prompt-submissions.js', '/games/king/room.js'],
        prepare(w) { w.document.getElementById('access-content').dataset.member = kingActor; },
        rpc(name, args, call) {
          const values = name === 'drinking_content' || name === 'drinking_prompt_suggestions'
            ? [args.p_action, args.p_options || {}] : rpcArgs(name, args);
          return publicRpc(call.actor, name, values);
        }
      });
      st.after(() => ui.close());
      await until(() => ui.find('#order [name="mission"]')?.value, 'king solo recommendation');
      assert.deepEqual(sorted(ui.w.DrinkingPromptCatalog.king), sorted(await currentCatalog('king')), 'the bundled client bank follows current reviewed wording');
      const solo = ui.find('#order [name="mission"]').value;
      // The fixture uses Math.random()=.5. Each filtered bank begins with its
      // 32 original entries, so its midpoint deterministically selects a new one.
      assert.ok(extraSet.has(solo));
      assert.equal(solo.startsWith('둘이 '), false);
      const second = ui.find('#order [name="second"]');
      second.value = '2';
      second.dispatchEvent(new ui.w.Event('change', {bubbles: true}));
      await until(() => ui.find('#order [name="mission"]')?.value.startsWith('둘이 '), 'king two-player recommendation');
      const suggested = ui.find('#order [name="mission"]').value;
      assert.ok(extraSet.has(suggested));
      ui.click('[data-do="suggest"]');
      await until(() => ui.find('#order [name="mission"]')?.value !== suggested, 'another king two-player recommendation');
      const selected = ui.find('#order [name="mission"]').value;
      assert.ok(extraSet.has(selected));
      assert.ok(selected.startsWith('둘이 '));
      ui.submit('#order');
      await until(() => ui.find('.king-order h1')?.textContent === selected, 'new king mission reaches the SQL response phase');
      for (const view of await views()) {
        assert.equal(view.phase, 'response');
        assert.equal(view.mission, selected);
        assert.equal(view.number, 1);
        assert.equal(view.second, 2);
        assert.deepEqual(view.accepted, []);
      }

      room = await king(byCard.get(1).actor, 'accept', room.code, {round: room.round});
      assert.equal(room.phase, 'response', 'one recipient cannot complete a two-player mission alone');
      assert.deepEqual(room.accepted, [1]);
      room = await king(byCard.get(2).actor, outcome, room.code, {round: room.round});
      assert.equal(room.phase, 'done');
      for (const view of await views()) {
        assert.equal(view.phase, 'done');
        assert.equal(view.revision, room.revision);
        assert.equal(view.mission, selected);
        assert.deepEqual([...view.accepted].sort(), outcome === 'accept' ? [1, 2] : [1]);
        if (outcome === 'decline') assert.equal(view.declined, byCard.get(2).seat);
        else assert.equal(Object.hasOwn(view, 'declined'), false);
      }
      assert.deepEqual(ui.errors, []);
      assert.equal(ui.calls.some(call => call.name === 'drinking_prompt_suggestions'), false,
        'official expanded recommendations must not be resubmitted as new community suggestions');
      ui.close();
    }
    assert.deepEqual(await otherBanks(db, 'king'), otherBefore);
  });
});

test('minority: 300 appended pairs preserve a private vote and remain usable in following rounds', {timeout: 120_000}, async t => {
  const base = manifest('minority.json');
  const expansion = manifest('expansions/party300/minority.json');
  assert.equal(base.kind, 'minority');
  assert.equal(expansion.kind, 'minority');
  assert.equal(base.entries.length, 60);
  assert.equal(expansion.entries.length, 300);
  const expected = [...base.entries, ...expansion.entries];
  const expectedSet = new Set(entryKeys(expected));
  const extraSet = new Set(entryKeys(expansion.entries));

  await t.test('the expansion has 300 intact new pairs without normalized or reversed duplicates', () => {
    validatePairs(expected);
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061003_drinking_rebuild_minority.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false);
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const vote = (actor, action, code = '', options = {}) =>
    publicRpc(actor, 'party_vote_multiplayer', ['minority', action, code, options]);
  const originalRows = await catalogRows(db, 'minority');
  assert.deepEqual(entryKeys(originalRows.map(rowEntry)), entryKeys(base.entries));
  assert.ok(originalRows.every(row => row.active));
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('king','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$1),'pending')`,
  ['Fixture review item preserved across the minority expansion']);
  const otherBefore = await otherBanks(db, 'minority');

  let room = await vote(actors[0], 'create', '', {
    title: '소수결 300쌍 추가 검증', capacity: 3, password: 'expand-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await vote(actor, 'join', room.code, {password: 'expand-test'});
  const views = () => Promise.all(actors.map(actor => vote(actor, 'state', room.code)));
  const stored = async () => (await db.query(
    "select to_jsonb(r) value from ojjuda_arcade_internal.party_vote_rooms r where kind='minority' and code=$1", [room.code]
  )).rows[0].value;
  function privateVotes(snapshots, choices, count) {
    for (const view of snapshots) {
      assert.equal(view.phase, 'vote');
      assert.deepEqual(view.choices, choices);
      assert.equal(view.voteCount, count);
      assert.equal(Object.hasOwn(view, 'votes'), false, 'ballot choices stay private until the final vote');
      assert.equal(Object.hasOwn(view, 'totals'), false);
    }
  }
  room = await vote(actors[0], 'vote', room.code, {round: room.round, target: 0});
  const liveBefore = await stored();
  const viewsBefore = await views();
  assert.ok(entryKeys(base.entries).includes(JSON.stringify(liveBefore.pair)));
  assert.deepEqual(liveBefore.votes, [0, -1, -1]);
  privateVotes(viewsBefore, liveBefore.pair, 1);

  await db.exec(expansionSql('minority'));

  await t.test('the 60 original rows remain identical and exactly 300 complete pairs are appended', async () => {
    const current = await checkAppend(db, 'minority', originalRows, expansion.entries);
    assert.equal(current.length, 360);
    assert.ok(current.every(row => typeof row.second === 'string' && row.second.length > 0));
  });

  await t.test('the existing pair, hidden ballot and all participant snapshots survive the append', async () => {
    assert.deepEqual(await stored(), liveBefore);
    assert.deepEqual(await views(), viewsBefore);
  });

  await t.test('both official pools contain 360 pairs while other games and the review queue stay unchanged', async () => {
    await checkPools(f, 'minority', expected);
    assert.deepEqual(await otherBanks(db, 'minority'), otherBefore);
  });

  await t.test('actual SQL draws reach appended pairs without splitting, reversing or immediately repeating them', async () => {
    await db.query('select setseed(0.314159)');
    let previous = liveBefore.pair;
    let sawAdditionalPair = false;
    for (let draw = 0; draw < 32; draw++) {
      const selected = (await db.query(
        "select ojjuda_arcade_internal.drinking_draw_prompt('minority',$1::text[]) value", [previous]
      )).rows[0].value;
      assert.equal(selected.length, 2);
      assert.ok(expectedSet.has(JSON.stringify(selected)));
      assert.notDeepEqual(selected, previous);
      sawAdditionalPair ||= extraSet.has(JSON.stringify(selected));
      previous = selected;
    }
    assert.equal(sawAdditionalPair, true, 'the actual server draw uses the appended pairs');
  });

  await t.test('the preserved vote finishes correctly and the following pair produces one shared 2-to-1 result', async () => {
    room = await vote(actors[1], 'vote', room.code, {round: room.round, target: 0});
    privateVotes(await views(), liveBefore.pair, 2);
    room = await vote(actors[2], 'vote', room.code, {round: room.round, target: 1});
    assert.equal(room.phase, 'done');
    for (const view of await views()) {
      assert.deepEqual(view.choices, liveBefore.pair);
      assert.deepEqual(view.votes, [0, 0, 1]);
    }

    room = await vote(actors[0], 'again', room.code, {round: room.round});
    const nextChoices = room.choices;
    assert.ok(expectedSet.has(JSON.stringify(nextChoices)), 'a newly dealt round uses one intact pair from the expanded catalog');
    assert.notDeepEqual(nextChoices, liveBefore.pair);
    privateVotes(await views(), nextChoices, 0);
    room = await vote(actors[0], 'vote', room.code, {round: room.round, target: 0});
    room = await vote(actors[1], 'vote', room.code, {round: room.round, target: 0});
    privateVotes(await views(), nextChoices, 2);
    room = await vote(actors[2], 'vote', room.code, {round: room.round, target: 1});
    for (const view of await views()) {
      assert.equal(view.phase, 'done');
      assert.equal(view.revision, room.revision);
      assert.equal(view.voteCount, 3);
      assert.deepEqual(view.choices, nextChoices);
      assert.deepEqual(view.votes, [0, 0, 1]);
      assert.deepEqual(view.votes.map((choice, seat) => choice === 1 ? view.players[seat] : null).filter(Boolean), [f.names[2]]);
    }
  });
});

test('mission: 300 appended pairs preserve private assignments and reveal the result only after voting', {timeout: 120_000}, async t => {
  const base = manifest('mission.json');
  const expansion = manifest('expansions/party300/mission.json');
  assert.equal(base.kind, 'mission');
  assert.equal(expansion.kind, 'mission');
  assert.equal(base.entries.length, 40);
  assert.equal(expansion.entries.length, 300);
  const expected = [...base.entries, ...expansion.entries];
  const expectedSet = new Set(entryKeys(expected));
  const extraSet = new Set(entryKeys(expansion.entries));

  await t.test('all 300 additional pairs are valid and distinct from the original 40 in either order', () => {
    validatePairs(expected);
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061004_drinking_rebuild_mission.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false);
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const mission = (actor, action, code = '', options = {}) =>
    publicRpc(actor, 'party_vote_multiplayer', ['mission', action, code, options]);
  const originalRows = await catalogRows(db, 'mission');
  assert.deepEqual(entryKeys(originalRows.map(rowEntry)), entryKeys(base.entries));
  assert.ok(originalRows.every(row => row.active));
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('king','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$1),'pending')`,
  ['Fixture review item preserved across the mission expansion']);
  const otherBefore = await otherBanks(db, 'mission');

  let room = await mission(actors[0], 'create', '', {
    title: '다른 미션 300쌍 추가 검증', capacity: 3, password: 'expand-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await mission(actor, 'join', room.code, {password: 'expand-test'});
  const views = () => Promise.all(actors.map(actor => mission(actor, 'state', room.code)));
  const stored = async () => (await db.query(
    "select to_jsonb(r) value from ojjuda_arcade_internal.party_vote_rooms r where kind='mission' and code=$1", [room.code]
  )).rows[0].value;
  function privateDeal(snapshots, phase) {
    const counts = new Map();
    for (const view of snapshots) {
      assert.equal(view.phase, phase);
      assert.equal(typeof view.word, 'string');
      counts.set(view.word, (counts.get(view.word) || 0) + 1);
      for (const field of ['choices', 'odd', 'totals', 'votes']) {
        assert.equal(Object.hasOwn(view, field), false, `${field} stays private before the final vote`);
      }
    }
    assert.deepEqual([...counts.values()].sort(), [1, 2]);
    const common = [...counts].find(([, count]) => count === 2)[0];
    const different = [...counts].find(([, count]) => count === 1)[0];
    const pair = [common, different];
    assert.ok(expectedSet.has(JSON.stringify(pair)), 'private words come from one intact official pair');
    return {pair, odd: snapshots.findIndex(view => view.word === different)};
  }
  room = await mission(actors[0], 'ready', room.code, {round: room.round});
  const liveBefore = await stored();
  const viewsBefore = await views();
  const originalDeal = privateDeal(viewsBefore, 'cards');
  assert.ok(entryKeys(base.entries).includes(JSON.stringify(originalDeal.pair)));
  assert.equal(viewsBefore.filter(view => view.ready).length, 1);

  await db.exec(expansionSql('mission'));

  await t.test('all 40 original rows remain unchanged and exactly 300 new pairs appear', async () => {
    const current = await checkAppend(db, 'mission', originalRows, expansion.entries);
    assert.equal(current.length, 340);
    assert.ok(current.every(row => typeof row.second === 'string' && row.second.length > 0));
  });

  await t.test('the in-progress 2-to-1 private assignment and readiness state survive unchanged', async () => {
    assert.deepEqual(await stored(), liveBefore);
    assert.deepEqual(await views(), viewsBefore);
  });

  await t.test('both official pools contain all 340 pairs and other games and review entries are untouched', async () => {
    await checkPools(f, 'mission', expected);
    assert.deepEqual(await otherBanks(db, 'mission'), otherBefore);
  });

  await t.test('the actual server draw reaches complete new pairs while avoiding the preceding pair', async () => {
    await db.query('select setseed(0.314159)');
    let previous = originalDeal.pair;
    let sawAdditionalPair = false;
    for (let draw = 0; draw < 32; draw++) {
      const selected = (await db.query(
        "select ojjuda_arcade_internal.drinking_draw_prompt('mission',$1::text[]) value", [previous]
      )).rows[0].value;
      assert.equal(selected.length, 2);
      assert.ok(expectedSet.has(JSON.stringify(selected)));
      assert.notDeepEqual(selected, previous);
      sawAdditionalPair ||= extraSet.has(JSON.stringify(selected));
      previous = selected;
    }
    assert.equal(sawAdditionalPair, true);
  });

  await t.test('three real room UIs show only the personal word and publish the pair and outlier after the final vote', async st => {
    for (const actor of actors.slice(1)) room = await mission(actor, 'ready', room.code, {round: room.round});
    assert.equal(room.phase, 'act');
    room = await mission(actors[0], 'start_vote', room.code, {round: room.round});
    for (const [seat, actor] of actors.entries()) {
      room = await mission(actor, 'vote', room.code, {
        round: room.round, target: seat === originalDeal.odd ? (seat + 1) % actors.length : originalDeal.odd
      });
    }
    assert.equal(room.phase, 'done');
    assert.deepEqual(room.choices, originalDeal.pair, 'the pre-expansion round finishes with its original answer');
    assert.equal(room.odd, originalDeal.odd);
    // Use a repeatable fixture draw that selects the appended part of the bank;
    // the actual room function and all 340 active pairs remain unchanged.
    await db.query('select setseed(0.5)');
    room = await mission(actors[0], 'again', room.code, {round: room.round});
    const nextViews = await views();
    const nextDeal = privateDeal(nextViews, 'cards');
    assert.ok(extraSet.has(JSON.stringify(nextDeal.pair)), 'the three screens exercise an actually appended pair');
    assert.notDeepEqual(nextDeal.pair, originalDeal.pair);

    const uis = await Promise.all(actors.map(async actor => {
      const ui = await screen({
        url: '/games/mission/?room=' + room.code,
        actor,
        scripts: ['/games/party-vote/room.js'],
        rpc: (name, args, call) => publicRpc(call.actor, name, rpcArgs(name, args))
      });
      st.after(() => ui.close());
      await until(() => ui.find('[data-do="reveal"]'), 'mission private card UI');
      return ui;
    }));
    function noResult(ui) {
      assert.equal(ui.find('.breakdown'), null, 'the result section is absent before the final vote');
      assert.equal(ui.find('#view').textContent.includes('다른 미션을 받은 사람은'), false);
    }
    function noWords(ui) {
      for (const word of nextDeal.pair) assert.equal(ui.find('#view').textContent.includes(word), false);
    }
    for (const [seat, ui] of uis.entries()) {
      noResult(ui);
      noWords(ui);
      ui.click('[data-do="reveal"]');
      assert.equal(ui.find('.secret').textContent, nextViews[seat].word);
      assert.equal(ui.w.document.querySelectorAll('.secret').length, 1);
      const rest = ui.find('#view').cloneNode(true);
      rest.querySelectorAll('.secret').forEach(node => node.remove());
      for (const word of nextDeal.pair) assert.equal(rest.textContent.includes(word), false);
      noResult(ui);
      ui.click('[data-do="ready"]');
      await until(() => !ui.find('.secret') && !ui.find('[data-do="ready"]'), 'mission ready clears the private card');
    }

    for (const ui of uis) {
      await ui.wake();
      await until(() => ui.find('#view h1')?.textContent === '하나, 둘, 셋! 동시에 흉내 내요', 'mission act UI');
      noResult(ui);
      noWords(ui);
    }
    assert.deepEqual(privateDeal(await views(), 'act'), nextDeal);
    uis[0].click('[data-do="start_vote"]');
    await until(() => uis[0].find('[data-do="vote"]'), 'host starts mission vote');
    for (const ui of uis.slice(1)) {
      await ui.wake();
      await until(() => ui.find('[data-do="vote"]'), 'mission vote UI');
    }
    const targets = actors.map((_, seat) => seat === nextDeal.odd ? (seat + 1) % actors.length : nextDeal.odd);
    for (const [seat, ui] of uis.entries()) {
      noResult(ui);
      noWords(ui);
      ui.click(`[data-do="vote"][data-slot="${targets[seat]}"]`);
      if (seat < actors.length - 1) {
        await until(() => ui.find('#view h1')?.textContent === '투표를 마쳤어요', 'mission private ballot accepted');
        assert.deepEqual(privateDeal(await views(), 'vote'), nextDeal);
        for (const otherUi of uis) noResult(otherUi);
      } else {
        await until(() => ui.find('.breakdown'), 'mission final vote publishes the result');
      }
    }
    const finalViews = await views();
    const totals = actors.map((_, seat) => targets.filter(target => target === seat).length);
    for (const [seat, ui] of uis.entries()) {
      await ui.wake();
      await until(() => ui.find('.breakdown'), 'all mission screens receive the completed result');
      assert.deepEqual(Array.from(ui.w.document.querySelectorAll('.breakdown strong'), node => node.textContent), nextDeal.pair);
      assert.ok(ui.find('#view').textContent.includes('다른 미션을 받은 사람은 ' + f.names[nextDeal.odd] + '님이에요.'));
      assert.equal(finalViews[seat].phase, 'done');
      assert.equal(finalViews[seat].revision, finalViews[0].revision);
      assert.equal(finalViews[seat].odd, nextDeal.odd);
      assert.deepEqual(finalViews[seat].choices, nextDeal.pair);
      assert.deepEqual(finalViews[seat].totals, totals);
      assert.deepEqual(ui.errors, []);
      ui.close();
    }
    st.diagnostic('Three independent JSDOM realms rendered the real room script against actual SQL; this is not a Chromium or production-network test.');
  });
});

test('bomb: quick categories correct 48 existing cards and add 300 without changing an active bomb', {timeout: 120_000}, async t => {
  const base = manifest('bomb.json');
  const corrections = manifest('corrections/bomb-quick-categories.json');
  const expansion = manifest('expansions/party300/bomb.json');
  assert.equal(base.kind, 'bomb');
  assert.equal(corrections.kind, 'bomb');
  assert.equal(expansion.kind, 'bomb');
  assert.equal(base.entries.length, 48);
  assert.equal(corrections.entries.length, 48);
  assert.equal(expansion.entries.length, 300);
  const replacements = new Map(corrections.entries.map(entry => [entry.from, entry.to]));
  const expected = [...corrections.entries.map(entry => entry.to), ...expansion.entries];
  const expectedSet = new Set(expected);
  const oldTopics = new Set(base.entries);

  await t.test('the correction map covers all 48 historical topics and the resulting 348 categories are distinct', () => {
    assert.deepEqual(sorted(corrections.entries.map(entry => entry.from)), sorted(base.entries));
    assert.equal(replacements.size, 48);
    for (const {from, to} of corrections.entries) validateWords([from, to], 120);
    validateWords(expected, 120);
    for (const topic of expected) assert.equal(oldTopics.has(topic), false, 'future rounds must not reuse the replaced dialogue topics');
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061005_drinking_rebuild_bomb.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false);
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const bomb = (actor, action, code = '', options = {}) =>
    publicRpc(actor, 'party_live_multiplayer', ['bomb', action, code, options]);
  const command = (actor, action, state, options = {}) => bomb(actor, action, state.code, {
    round: state.round, revision: state.revision, request_id: randomUUID(), ...options
  });
  const originalRows = await catalogRows(db, 'bomb');
  const originalIds = new Set(originalRows.map(row => row.id));
  assert.deepEqual(sorted(originalRows.map(row => row.body)), sorted(base.entries));
  assert.ok(originalRows.every(row => row.active));
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('king','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$1),'pending')`,
  ['Fixture review item preserved across the bomb expansion']);
  const otherBefore = await otherBanks(db, 'bomb');

  // Only the shared RPC's clock input is replaced inside this isolated fixture.
  // Real bomb transitions, pass handling and the private deadline stay intact.
  await db.exec(`
    create schema drinking_expansion_fixture;
    create table drinking_expansion_fixture.clock_value(ms bigint not null);
    insert into drinking_expansion_fixture.clock_value
      select floor(extract(epoch from clock_timestamp())*1000)::bigint;
    create function drinking_expansion_fixture.clock() returns timestamptz
      language sql stable set search_path='' as $$
        select pg_catalog.to_timestamp(ms/1000.0) from drinking_expansion_fixture.clock_value
      $$;
  `);
  const definition = (await db.query(`select pg_get_functiondef(
    'ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure) value`)).rows[0].value;
  const clocked = definition.replace(/\bclock_timestamp\(\)/g, 'drinking_expansion_fixture.clock()');
  assert.notEqual(clocked, definition);
  await db.exec(clocked);
  const setTime = ms => db.query('update drinking_expansion_fixture.clock_value set ms=$1', [ms]);

  let room = await bomb(actors[0], 'create', '', {
    title: '폭탄 즉답 범주 추가 검증', capacity: 3, password: 'expand-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await bomb(actor, 'join', room.code, {password: 'expand-test'});
  const views = () => Promise.all(actors.map(actor => bomb(actor, 'state', room.code)));
  const stored = async () => (await db.query(
    "select to_jsonb(r) value from ojjuda_arcade_internal.party_vote_rooms r where kind='bomb' and code=$1", [room.code]
  )).rows[0].value;
  room = await command(actors[0], 'configure', room, {random: false, baseSeconds: 25});
  room = await command(actors[0], 'start', room);
  await setTime(room.serverMs + 1000);
  room = await command(actors[0], 'pass', room, {turn: room.game.turn});
  assert.equal(room.phase, 'active');
  assert.equal(room.game.holder, 1);
  assert.equal(room.game.turn, 1);
  const liveBefore = await stored();
  const viewsBefore = await views();
  assert.ok(oldTopics.has(liveBefore.game_state.topic));

  await db.exec(expansionSql('bomb'));

  await t.test('48 IDs and flags survive with the mapped body and one revision bump, plus exactly 300 new rows', async () => {
    const current = await catalogRows(db, 'bomb');
    assert.equal(current.length, 348);
    const byId = new Map(current.map(row => [row.id, row]));
    for (const previous of originalRows) {
      const updated = byId.get(previous.id);
      assert.ok(updated, 'every historical card ID survives');
      assert.equal(updated.body, replacements.get(previous.body));
      assert.equal(updated.revision, previous.revision + 1, 'stale administrator edits cannot silently overwrite the correction');
      const omitChanged = ({body, revision, updated_at, ...unchanged}) => unchanged;
      assert.deepEqual(omitChanged(updated), omitChanged(previous), 'kind, second, flags, queue links and any creation timestamp remain unchanged');
    }
    const added = current.filter(row => !originalIds.has(row.id));
    assert.equal(added.length, 300);
    assert.deepEqual(sorted(added.map(row => row.body)), sorted(expansion.entries));
    assert.ok(added.every(row => row.active && row.party_pick && row.second === null));
    assert.deepEqual(sorted(current.map(row => row.body)), sorted(expected));
  });

  await t.test('the currently held topic, deadline, holder, turn and all player snapshots remain unchanged', async () => {
    assert.deepEqual(await stored(), liveBefore);
    assert.deepEqual(await views(), viewsBefore);
  });

  await t.test('SQL pools and the bundled bank contain only the 348 quick categories, with unrelated data untouched', async () => {
    await checkPools(f, 'bomb', expected);
    const context = {window: {}};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'games/drinking/round-prompts.js'), 'utf8'), context);
    assert.deepEqual(sorted(context.window.DrinkingPromptCatalog.bomb), sorted(await currentCatalog('bomb')));
    assert.equal(context.window.DrinkingPromptCatalog.bomb.some(topic => oldTopics.has(topic)), false);
    assert.deepEqual(await otherBanks(db, 'bomb'), otherBefore);
  });

  await t.test('the already active bomb expires at its original deadline with its original topic and holder', async () => {
    const deadline = liveBefore.game_state.endsAt;
    await setTime(deadline - 1);
    room = await bomb(actors[0], 'state', room.code);
    assert.equal(room.phase, 'active');
    assert.deepEqual((await stored()).game_state, liveBefore.game_state);
    await setTime(deadline);
    room = await bomb(actors[0], 'state', room.code);
    assert.equal(room.phase, 'done');
    for (const view of await views()) {
      assert.equal(view.phase, 'done');
      assert.equal(view.game.topic, liveBefore.game_state.topic);
      assert.equal(view.game.loser, liveBefore.game_state.holder);
    }
  });

  await t.test('a quick category stays on three actual room screens through passes, reconnection and deadline expiry', async st => {
    room = await command(actors[0], 'again', room);
    room = await command(actors[0], 'configure', room, {random: false, baseSeconds: 25});
    room = await command(actors[0], 'start', room);
    assert.equal(room.phase, 'active');
    const topic = room.game.topic;
    const startedAt = room.serverMs;
    const initial = (await stored()).game_state;
    const deadline = initial.endsAt;
    assert.ok(expectedSet.has(topic));
    assert.equal(oldTopics.has(topic), false);
    assert.ok(deadline - startedAt >= 10_000 && deadline - startedAt <= 25_000);
    const uis = await Promise.all(actors.map(async actor => {
      const ui = await screen({
        url: '/games/bomb/?room=' + room.code,
        actor,
        scripts: ['/games/drinking/round-prompts.js', '/games/party-live/bomb.js', '/games/party-live/room.js'],
        rpc: (name, args, call) => publicRpc(call.actor, name, rpcArgs(name, args))
      });
      st.after(() => ui.close());
      await until(() => ui.find('#game h1')?.textContent === topic, 'bomb quick category display');
      return ui;
    }));
    await uis[2].online(false);
    const offlineCalls = uis[2].calls.length;
    for (const seat of [0, 1]) {
      await setTime(startedAt + (seat + 1) * 1000);
      await uis[seat].wake();
      await until(() => uis[seat].find('#bomb-pass'), 'the current bomb holder can answer');
      assert.equal(uis[seat].find('#game h1').textContent, topic);
      assert.doesNotMatch(uis[seat].find('#game p').textContent, /대사|상상/u, 'instructions ask for an immediate category answer');
      uis[seat].click('#bomb-pass');
      await until(() => !uis[seat].find('#bomb-pass'), 'passing advances the bomb holder');
      room = await bomb(actors[0], 'state', room.code);
      assert.equal(room.game.holder, seat + 1);
      assert.equal(room.game.turn, seat + 1);
      assert.deepEqual({...((await stored()).game_state), holder: initial.holder, turn: initial.turn}, initial,
        'passing changes only the holder and turn, preserving the topic and deadline');
    }
    await uis[2].advance(2500);
    assert.equal(uis[2].calls.length, offlineCalls);
    assert.equal(uis[2].find('#game h1').textContent, topic);
    await uis[2].online(true);
    await until(() => uis[2].find('#bomb-pass'), 'the returning player receives the current bomb without a new round');
    assert.equal(uis[2].find('#game h1').textContent, topic);
    assert.equal(uis[2].calls.some(call => ['create', 'join'].includes(call.args.p_action)), false);
    await setTime(startedAt + 3000);
    uis[2].click('#bomb-pass');
    await until(() => !uis[2].find('#bomb-pass'), 'the reconnected player passes the same bomb');
    const passed = (await stored()).game_state;
    assert.deepEqual({...passed, holder: initial.holder, turn: initial.turn}, initial);
    assert.equal(passed.holder, 0);
    assert.equal(passed.turn, 3);
    for (const view of await views()) {
      assert.equal(view.game.topic, topic);
      assert.equal(view.game.holder, 0);
      assert.equal(view.game.turn, 3);
      assert.equal(Object.hasOwn(view.game, 'endsAt'), false);
    }
    await setTime(deadline - 1);
    room = await bomb(actors[0], 'state', room.code);
    assert.equal(room.phase, 'active');
    await setTime(deadline);
    room = await bomb(actors[0], 'state', room.code);
    assert.equal(room.phase, 'done');
    for (const ui of uis) {
      await ui.wake();
      await until(() => ui.find('#game h1')?.textContent.includes(f.names[0] + '님 당첨!'), 'all bomb screens agree on the deadline result');
      assert.deepEqual(ui.errors, []);
      ui.close();
    }
    for (const view of await views()) {
      assert.equal(view.phase, 'done');
      assert.equal(view.game.topic, topic);
      assert.equal(view.game.loser, 0);
    }
    room = await command(actors[0], 'again', room);
    room = await command(actors[0], 'configure', room, {random: false, baseSeconds: 25});
    room = await command(actors[0], 'start', room);
    assert.ok(expectedSet.has(room.game.topic));
    assert.notEqual(room.game.topic, topic, 'the following bomb avoids the previous quick category');
    st.diagnostic('Three independent JSDOM realms used real SQL and controlled clock/offline inputs; this is not a Chromium or production-network test.');
  });
});

test('truth: 300 appended questions preserve existing histories and live hands while extending both flavors', {timeout: 120_000}, async t => {
  const base = manifest('truth.json');
  const expansion = manifest('expansions/party300/truth.json');
  const epoch = '20261114-drinking-rebuild1';
  const flavors = ['mild', 'spicy'];
  assert.equal(base.kind, 'truth');
  assert.equal(expansion.kind, 'truth');
  assert.equal(base.entries.length, 128);
  assert.equal(expansion.entries.length, 300);
  const expected = [...base.entries, ...expansion.entries];
  const deckFor = entries => Object.fromEntries(flavors.map(flavor => [flavor,
    entries.filter(entry => entry.flavor === flavor).map(entry => entry.body)
  ]));
  const cardKeys = entries => entryKeys(entries.map(({flavor, body}) => [flavor, body]));
  const sortedDeck = deck => Object.fromEntries(flavors.map(flavor => [flavor, sorted(deck[flavor])]));
  const originalDeck = deckFor(base.entries);
  const official = deckFor(expected);
  const additional = deckFor(expansion.entries);

  await t.test('300 new questions add 60 mild and 240 spicy cards without normalized duplicates', () => {
    for (const entry of expected) assert.ok(flavors.includes(entry.flavor));
    validateWords(expected.map(entry => entry.body), 240);
    assert.equal(additional.mild.length, 60);
    assert.equal(additional.spicy.length, 240);
    assert.equal(official.mild.length, 108);
    assert.equal(official.spicy.length, 320);
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061106_drinking_truth_catalog_epoch.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false);
  const {db, users, publicRpc} = f;
  const truth = (actor, action, code = '', options = {}) =>
    publicRpc(actor, 'party_live_multiplayer', ['truth', action, code, options]);
  const act = (actor, action, state, options = {}) => truth(actor, action, state.code, {
    round: state.round, revision: state.revision, request_id: randomUUID(), ...options
  });
  const stored = async code => (await db.query(
    "select to_jsonb(r) value from ojjuda_arcade_internal.party_vote_rooms r where kind='truth' and code=$1", [code]
  )).rows[0].value;
  const views = (actors, code) => Promise.all(actors.map(actor => truth(actor, 'state', code)));
  const readCards = async () => (await db.query(
    'select to_jsonb(c) value from ojjuda_arcade_internal.drinking_truth_cards c order by id'
  )).rows.map(row => row.value);
  const readHistory = async () => (await db.query(
    "select encode(fingerprint,'hex') fingerprint,card_id from ojjuda_arcade_internal.drinking_truth_history order by fingerprint"
  )).rows;
  async function unaffected() {
    const banks = await otherBanks(db, 'truth');
    delete banks.truth;
    delete banks.truth_history;
    banks.retiredFingerprints = (await db.query(`select count(*)::int size,
      md5(string_agg(encode(fingerprint,'hex'),',' order by fingerprint)) digest
      from ojjuda_arcade_internal.drinking_prompt_baseline`)).rows[0];
    return banks;
  }
  async function createRoom(actors) {
    let state = await truth(actors[0], 'create', '', {
      title: '진실게임 300개 추가 검증', capacity: actors.length, password: 'expand-test', request_id: randomUUID()
    });
    for (const actor of actors.slice(1)) state = await truth(actor, 'join', state.code, {password: 'expand-test'});
    assert.equal(state.phase, 'setup');
    return state;
  }
  function privateGame(view, phase, turn, hiddenFlavor = true) {
    assert.equal(view.phase, phase);
    assert.equal(view.game.turn, turn);
    for (const field of ['deck', 'remaining', 'personal', 'spicySide', 'hand']) {
      assert.equal(Object.hasOwn(view.game, field), false, `${field} is never sent with a player's room snapshot`);
    }
    if (hiddenFlavor) assert.equal(Object.hasOwn(view.game, 'cardFlavors'), false);
    if (phase === 'pick') {
      assert.equal(Object.hasOwn(view.game, 'question'), false);
      assert.equal(Object.hasOwn(view.game, 'flavor'), false);
    }
  }
  const originalCards = await readCards();
  const originalIds = new Set(originalCards.map(card => card.id));
  const originalHistory = await readHistory();
  assert.deepEqual(cardKeys(originalCards), cardKeys(base.entries));
  assert.ok(originalCards.every(card => card.active));
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('truth','spicy',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('truth','spicy',$1),'pending')`,
  ['Fixture pending review item preserved across the truth expansion']);
  const unrelatedBefore = await unaffected();

  const livePickActors = users.slice(0, 3);
  let livePick = await createRoom(livePickActors);
  livePick = await act(livePickActors[1], 'truth_add', livePick, {flavor: 'mild', question: '이 진행 중인 방에만 더한 개인 질문'});
  livePick = await act(livePickActors[0], 'truth_begin', livePick, {
    catalog_revision: epoch, deck: originalDeck, mode: 'mixed', showFlavor: false
  });
  livePick = await act(livePickActors[0], 'truth_pick', livePick, {turn: 0, side: 0});
  livePick = await act(livePickActors[0], 'truth_answer', livePick, {turn: 0});
  assert.equal(livePick.phase, 'pick');
  assert.equal(livePick.game.turn, 1);
  const liveAnswerActors = users.slice(3, 6);
  let liveAnswer = await createRoom(liveAnswerActors);
  liveAnswer = await act(liveAnswerActors[0], 'truth_begin', liveAnswer, {
    catalog_revision: epoch, deck: originalDeck, mode: 'spicy', showFlavor: true
  });
  liveAnswer = await act(liveAnswerActors[0], 'truth_pick', liveAnswer, {turn: 0, side: 1});
  assert.equal(liveAnswer.phase, 'answer');
  assert.ok(originalDeck.spicy.includes(liveAnswer.game.question));
  const liveSnapshots = await Promise.all([
    [livePick, livePickActors], [liveAnswer, liveAnswerActors]
  ].map(async ([state, actors]) => ({
    code: state.code, actors, raw: await stored(state.code), public: await views(actors, state.code)
  })));

  await db.exec(expansionSql('truth'));

  await t.test('all 128 existing cards and history entries survive and every new fingerprint refers to its exact card', async () => {
    const current = await readCards();
    assert.equal(current.length, 428);
    assert.deepEqual(current.filter(card => originalIds.has(card.id)), originalCards);
    const added = current.filter(card => !originalIds.has(card.id));
    assert.equal(added.length, 300);
    assert.ok(added.every(card => card.active && card.party_pick));
    assert.deepEqual(cardKeys(added), cardKeys(expansion.entries));
    assert.deepEqual((await db.query(`select id,body from ojjuda_arcade_internal.drinking_truth_cards
      where body<>ojjuda_arcade_internal.drinking_prompt_clean(body)`)).rows, []);
    const history = await readHistory();
    assert.equal(history.length, originalHistory.length + 300);
    assert.deepEqual(history.filter(row => originalIds.has(row.card_id)), originalHistory);
    const newIds = added.map(card => card.id);
    const expectedHistory = (await db.query(`select
      encode(ojjuda_arcade_internal.drinking_prompt_fingerprint('truth',flavor,body),'hex') fingerprint,id card_id
      from ojjuda_arcade_internal.drinking_truth_cards where id=any($1::int[]) order by fingerprint`, [newIds])).rows;
    assert.deepEqual(history.filter(row => newIds.includes(row.card_id)), expectedHistory);
    for (const flavor of flavors) {
      assert.deepEqual(await publicRpc(users[0], 'drinking_prompt_suggestions', ['submit', {
        kind: 'truth', flavor, text: additional[flavor][0]
      }]), {ok: true});
    }
    assert.deepEqual(await unaffected(), unrelatedBefore, 'new official questions do not re-enter the review queue');
  });

  await t.test('both a hidden hand and a selected question preserve their complete live decks, settings and turns', async () => {
    const withoutClock = ({serverMs, ...view}) => view;
    for (const before of liveSnapshots) {
      assert.deepEqual(await stored(before.code), before.raw);
      assert.deepEqual((await views(before.actors, before.code)).map(withoutClock), before.public.map(withoutClock));
    }
  });

  await t.test('both pool filters and the bundled client catalog contain 108 mild and 320 spicy questions', async () => {
    for (const roundMix of [false, true]) {
      const reply = await publicRpc(users[0], 'drinking_content', ['pool', {kinds: ['truth'], round_mix: roundMix}]);
      assert.deepEqual(Object.keys(reply.banks), ['truth']);
      assert.deepEqual(sortedDeck(reply.banks.truth), sortedDeck(official));
    }
    const context = {window: {}};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'games/drinking/community-prompts.js'), 'utf8'), context);
    const currentTruth = await currentCatalog('truth');
    const currentOfficial = Object.fromEntries(['mild', 'spicy'].map(flavor =>
      [flavor, currentTruth.filter(entry => entry.flavor === flavor).map(entry => entry.body)]));
    assert.deepEqual(sortedDeck(context.window.DrinkingPromptCatalog), sortedDeck(currentOfficial));
    assert.deepEqual(await unaffected(), unrelatedBefore);
  });

  await t.test('new mild, spicy and mixed rounds all draw appended questions through the unchanged server catalog path', async () => {
    const actors = users.slice(6, 9);
    let state = await createRoom(actors);
    for (const mode of ['mild', 'spicy', 'mixed']) {
      if (state.phase === 'done') state = await act(actors[0], 'again', state);
      state = await act(actors[0], 'truth_begin', state, {mode, showFlavor: true});
      assert.deepEqual(sortedDeck((await stored(state.code)).game_state.deck), sortedDeck(official));
      const seen = new Set();
      for (const [seat, actor] of actors.entries()) {
        privateGame(state, 'pick', seat, false);
        const flavor = mode === 'mixed' ? (seat === 1 ? 'spicy' : 'mild') : mode;
        const side = state.game.cardFlavors.indexOf(flavor);
        assert.ok(side >= 0);
        // The fixed fixture sample selects near the end of each complete deck,
        // where appended cards live, without replacing the actual draw function.
        await db.query('select setseed(0.5)');
        state = await act(actor, 'truth_pick', state, {turn: seat, side});
        assert.equal(state.phase, 'answer');
        assert.equal(state.game.flavor, flavor);
        assert.ok(additional[flavor].includes(state.game.question));
        assert.equal(seen.has(state.game.question), false);
        seen.add(state.game.question);
        state = await act(actor, seat === 1 ? 'truth_pass' : 'truth_answer', state, {turn: seat});
      }
      assert.equal(state.phase, 'done');
    }
  });

  await t.test('three real UIs merge personal cards once and keep the hidden hand private through answer, pass and the next turn', async st => {
    const actors = users.slice(9, 12);
    let state = await createRoom(actors);
    const currentCard = '확장 후에도 이 회원에게만 남는 개인 질문';
    const legacyCard = '구 버전 저장소에만 있는 질문';
    const legacyEdit = '이전 공통 편집본에만 있는 질문';
    const foreignCard = '다른 회원 소유의 개인 질문';
    const uis = await Promise.all(actors.map(async actor => {
      const ui = await screen({
        url: '/games/truth/?room=' + state.code,
        actor,
        scripts: ['/games/drinking/community-prompts.js', '/games/drinking/prompt-submissions.js', '/games/party-live/truth.js', '/games/party-live/room.js'],
        prepare(w) {
          w.document.getElementById('access-content').dataset.member = actor;
          if (actor !== actors[0]) return;
          w.localStorage.setItem(`oj.party.${actor}.truth.v2.card.spicy.${currentCard}`, '1');
          w.localStorage.setItem(`oj.party.${actor}.truth.v2.card.spicy.${additional.spicy[0]}`, '1');
          w.localStorage.setItem(`oj.party.${actor}.truth.v2.card.spicy.${additional.mild[0]}`, '1');
          w.localStorage.setItem(`oj.party.${actor}.truth.card.spicy.${legacyCard}`, '1');
          w.localStorage.setItem('oj.party.live.truth.edits.v1', JSON.stringify([['old', {flavor: 'spicy', question: legacyEdit}]]));
          w.localStorage.setItem(`oj.party.${users[12]}.truth.v2.card.spicy.${foreignCard}`, '1');
        },
        rpc(name, args, call) {
          const values = name === 'drinking_content' || name === 'drinking_prompt_suggestions'
            ? [args.p_action, args.p_options || {}] : rpcArgs(name, args);
          return publicRpc(call.actor, name, values);
        }
      });
      st.after(() => ui.close());
      await until(() => ui.find('#truth-form'), 'truth setup UI');
      return ui;
    }));
    const host = uis[0];
    await until(() => host.find('#truth-begin'), 'truth host settings');
    assert.equal(await host.w.DrinkingPrompts.refresh('truth'), true);
    const personal = host.w.PartyTruthCards.deck();
    const expectedPersonal = {mild: official.mild, spicy: [...official.spicy, currentCard]};
    assert.deepEqual(sortedDeck(personal), sortedDeck(expectedPersonal));
    for (const text of [legacyCard, legacyEdit, foreignCard]) {
      assert.equal(personal.mild.includes(text) || personal.spicy.includes(text), false);
    }
    assert.equal(personal.spicy.filter(text => text === additional.spicy[0]).length, 1);
    assert.equal(personal.mild.filter(text => text === additional.mild[0]).length, 1);
    assert.equal(personal.spicy.includes(additional.mild[0]), false, 'a newly official mild card is not duplicated under its old personal flavor');
    const afterRemoval = host.w.PartyTruthCards.deck({
      mild: official.mild, spicy: official.spicy.filter(text => text !== additional.spicy[0])
    });
    assert.equal(afterRemoval.spicy.includes(additional.spicy[0]), false,
      'a newly official card later absent from the pool is not restored from an old personal copy');
    const mixed = host.find('[name="truth-mode"][value="mixed"]');
    mixed.checked = true;
    mixed.dispatchEvent(new host.w.Event('change', {bubbles: true}));
    assert.equal(host.find('[name="truth-visibility"][value="hide"]').checked, true);
    host.click('#truth-begin');
    await until(() => host.find('[data-truth-side]'), 'truth begins with the expanded personal deck');
    const begin = host.calls.find(call => call.args.p_action === 'truth_begin');
    assert.equal(begin.args.p_options.catalog_revision, epoch, 'this append keeps the existing catalog epoch');
    assert.deepEqual(sortedDeck(begin.args.p_options.deck), sortedDeck(expectedPersonal));
    const begun = (await stored(state.code)).game_state;
    assert.deepEqual(sortedDeck(begun.deck), sortedDeck(expectedPersonal));
    assert.equal(begun.mode, 'mixed');
    assert.equal(begun.showFlavor, false);

    for (let seat = 0; seat < actors.length; seat++) {
      for (const ui of uis) {
        await ui.wake();
        await until(() => ui.find('.truth-hand'), 'all truth screens show the unselected cards');
        assert.equal(ui.find('.truth-face'), null);
        assert.equal(ui.find('.truth-hand').textContent.trim(), '');
        const buttons = [...ui.w.document.querySelectorAll('.truth-hand button')];
        assert.equal(buttons.length, 2);
        for (const button of buttons) assert.doesNotMatch(button.getAttribute('aria-label'), /순한맛|빨간맛/u);
      }
      for (const view of await views(actors, state.code)) privateGame(view, 'pick', seat);
      assert.equal(uis[seat].w.document.querySelectorAll('[data-truth-side]').length, 2);
      await db.query('select setseed(0.5)');
      uis[seat].click('[data-truth-side="0"]');
      await until(() => uis[seat].find('.truth-face strong'), 'the current player reveals one truth question');
      state = await truth(actors[0], 'state', state.code);
      const question = state.game.question;
      assert.ok(additional[state.game.flavor].includes(question), 'the UI also reveals an actually appended question');
      for (const ui of uis) {
        await ui.wake();
        await until(() => ui.find('.truth-face strong')?.textContent === question, 'all truth screens show the selected question');
        assert.equal(ui.find('.truth-hand'), null);
      }
      for (const view of await views(actors, state.code)) {
        privateGame(view, 'answer', seat);
        assert.equal(view.game.question, question);
      }
      const action = seat === 1 ? 'truth_pass' : 'truth_answer';
      uis[seat].click(`[data-truth-next="${action}"]`);
      await until(() => !uis[seat].find('.truth-face'), 'answer or pass clears the current question');
      state = await truth(actors[0], 'state', state.code);
      assert.equal(state.phase, seat === actors.length - 1 ? 'done' : 'pick');
      if (state.phase === 'pick') assert.equal(state.game.turn, seat + 1);
    }
    for (const ui of uis) {
      await ui.wake();
      await until(() => ui.find('#game h1')?.textContent === '모두 한 번씩 마쳤어요!', 'all truth screens finish the same round');
      assert.equal(ui.find('.truth-face'), null);
      assert.equal(ui.find('.truth-hand'), null);
      assert.deepEqual(ui.errors, []);
      ui.close();
    }
    assert.deepEqual(await unaffected(), unrelatedBefore);
    st.diagnostic('Three independent JSDOM realms rendered the real truth UI against actual SQL; this is not a Chromium or production-network test.');
  });
});

test('fingers: 300 appended conditions preserve partial private responses and each player chooses whether to fold', {timeout: 120_000}, async t => {
  const base = manifest('fingers.json');
  const expansion = manifest('expansions/party300/fingers.json');
  assert.equal(base.kind, 'fingers');
  assert.equal(expansion.kind, 'fingers');
  assert.equal(base.entries.length, 64);
  assert.equal(expansion.entries.length, 300);
  const expected = [...base.entries, ...expansion.entries];
  const extraSet = new Set(expansion.entries);

  await t.test('300 distinct additional conditions fit the catalog and describe the person answering', () => {
    validateWords(expected, 120);
    assert.ok(expected.every(condition => condition.endsWith('사람')));
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061007_drinking_rebuild_fingers.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false);
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const fingers = (actor, action, code = '', options = {}) =>
    publicRpc(actor, 'party_live_multiplayer', ['fingers', action, code, options]);
  const act = (actor, action, state, options = {}) => fingers(actor, action, state.code, {
    round: state.round, revision: state.revision, request_id: randomUUID(), turn: state.game.turn, ...options
  });
  const readBaseline = async () => (await db.query(
    "select encode(fingerprint,'hex') value from ojjuda_arcade_internal.drinking_prompt_baseline order by fingerprint"
  )).rows.map(row => row.value);
  const originalRows = await catalogRows(db, 'fingers');
  const originalIds = new Set(originalRows.map(row => row.id));
  assert.deepEqual(sorted(originalRows.map(row => row.body)), sorted(base.entries));
  assert.ok(originalRows.every(row => row.active));
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('fingers','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('fingers','',$1),'rejected'),
          ('king','',$2,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$2),'pending')`,
  ['Fixture rejected fingers condition', 'Fixture unrelated pending review item']);
  const otherBefore = await otherBanks(db, 'fingers');
  const baselineBefore = await readBaseline();

  let room = await fingers(actors[0], 'create', '', {
    title: '손가락 300개 조건 추가 검증', capacity: 3, password: 'expand-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await fingers(actor, 'join', room.code, {password: 'expand-test'});
  const views = () => Promise.all(actors.map(actor => fingers(actor, 'state', room.code)));
  const stored = async () => (await db.query(
    "select to_jsonb(r) value from ojjuda_arcade_internal.party_vote_rooms r where kind='fingers' and code=$1", [room.code]
  )).rows[0].value;
  room = await act(actors[0], 'finger_prompt', room, {question: base.entries[0]});
  room = await act(actors[0], 'finger_answer', room, {fold: true});
  room = await act(actors[1], 'finger_answer', room, {fold: false});
  const liveBefore = await stored();
  const viewsBefore = await views();
  assert.equal(room.phase, 'answer');
  assert.deepEqual(liveBefore.game_state.responses, {'0': true, '1': false});
  assert.deepEqual(room.game.fingers, [5, 5, 5]);
  for (const view of viewsBefore) assert.equal(Object.hasOwn(view.game, 'responses'), false);

  await db.exec(expansionSql('fingers'));

  await t.test('all 64 existing rows remain unchanged and exactly 300 active conditions are appended', async () => {
    const current = await checkAppend(db, 'fingers', originalRows, expansion.entries);
    assert.equal(current.length, 364);
  });

  await t.test('all previous fingerprints and review entries survive and new official conditions cannot be requeued', async () => {
    const current = await catalogRows(db, 'fingers');
    const newIds = current.filter(row => !originalIds.has(row.id)).map(row => row.id);
    const addedFingerprints = (await db.query(`select
      encode(ojjuda_arcade_internal.drinking_prompt_fingerprint('fingers','',body),'hex') value
      from ojjuda_arcade_internal.drinking_content_items where id=any($1::int[])`, [newIds])).rows.map(row => row.value);
    assert.deepEqual(await readBaseline(), sorted(new Set([...baselineBefore, ...addedFingerprints])));
    assert.deepEqual(await publicRpc(actors[0], 'drinking_prompt_suggestions', ['submit', {
      kind: 'fingers', text: expansion.entries[0]
    }]), {ok: true});
    assert.deepEqual(await otherBanks(db, 'fingers'), otherBefore);
  });

  await t.test('the active condition, finger counts, partial private answers, author and turn survive unchanged', async () => {
    assert.deepEqual(await stored(), liveBefore);
    const withoutClock = ({serverMs, ...view}) => view;
    assert.deepEqual((await views()).map(withoutClock), viewsBefore.map(withoutClock));
  });

  await t.test('both official pools and the bundled bank contain exactly the original plus 300 new conditions', async () => {
    await checkPools(f, 'fingers', expected);
    const context = {window: {}};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'games/drinking/community-prompts.js'), 'utf8'), context);
    assert.deepEqual(sorted(context.window.DrinkingPromptCatalog.fingers), sorted(await currentCatalog('fingers')));
  });

  await t.test('three real UIs recommend new conditions, keep partial choices private and honor a pass until the five-finger result', async st => {
    room = await act(actors[2], 'finger_answer', room, {fold: true});
    assert.equal(room.phase, 'prompt');
    assert.equal(room.game.turn, 1);
    assert.equal(room.game.current, 1);
    let remaining = [4, 5, 4];
    assert.deepEqual(room.game.fingers, remaining);
    const uis = await Promise.all(actors.map(async actor => {
      const ui = await screen({
        url: '/games/fingers/?room=' + room.code,
        actor,
        scripts: ['/games/drinking/community-prompts.js', '/games/drinking/prompt-submissions.js',
          '/games/party-live/prompt.js', '/games/party-live/fingers.js', '/games/party-live/room.js'],
        prepare(w) { w.document.getElementById('access-content').dataset.member = actor; },
        rpc(name, args, call) {
          const values = name === 'drinking_content' || name === 'drinking_prompt_suggestions'
            ? [args.p_action, args.p_options || {}] : rpcArgs(name, args);
          return publicRpc(call.actor, name, values);
        }
      });
      st.after(() => ui.close());
      await until(() => ui.find('.pair-scores'), 'fingers score UI');
      return ui;
    }));
    const scoresOn = ui => Array.from(ui.w.document.querySelectorAll('.pair-scores b'), node => Number.parseInt(node.textContent, 10));
    const folds = [[true, false, true], [false, true, true], [false, false, true], [false, false, true]];
    const seenConditions = new Set();
    for (const [index, choices] of folds.entries()) {
      const author = room.game.current;
      const previousTurn = room.game.turn;
      const owner = uis[author];
      owner.w.Math.random = () => 0.5 + index * 0.1;
      await owner.wake();
      await until(() => owner.find('#pair-question')?.value, 'the current author receives a condition recommendation');
      const previous = owner.find('#pair-question').value;
      owner.click('#pair-suggest');
      await until(() => owner.find('#pair-question')?.value !== previous, 'another fingers condition recommendation');
      const question = owner.find('#pair-question').value;
      assert.ok(extraSet.has(question), 'each tested condition is one of the 300 appended entries');
      assert.equal(seenConditions.has(question), false);
      seenConditions.add(question);
      owner.submit('#pair-form');
      await until(() => owner.find('#game h1')?.textContent === question, 'the new condition is published');

      async function privateResponses(submitted) {
        for (const ui of uis) {
          await ui.wake();
          await until(() => ui.find('.pair-status')?.textContent === `응답 ${submitted} / 3명`, 'all fingers screens receive the response count');
          assert.equal(ui.find('#game h1').textContent, question);
          assert.deepEqual(scoresOn(ui), remaining, 'scores cannot reveal another person\'s partial answer');
        }
        for (const [seat, view] of (await views()).entries()) {
          assert.equal(view.phase, 'answer');
          assert.equal(view.game.question, question);
          assert.equal(view.game.submitted, submitted);
          assert.equal(view.game.mine, seat < submitted);
          assert.equal(Object.hasOwn(view.game, 'responses'), false);
          assert.deepEqual(view.game.fingers, remaining);
        }
      }
      await privateResponses(0);
      for (const [seat, choice] of choices.entries()) {
        const ui = uis[seat];
        assert.match(ui.find('[data-fold="no"]').textContent, /패스/u);
        ui.click(`[data-fold="${choice ? 'yes' : 'no'}"]`);
        if (seat < actors.length - 1) {
          await until(() => ui.find('[data-submitted]'), 'the player submits their own fold or pass');
          await privateResponses(seat + 1);
        } else {
          await until(() => !ui.find('[data-fold]') && !ui.find('[data-submitted]'), 'the last response settles the condition');
        }
      }
      remaining = remaining.map((count, seat) => count - Number(choices[seat]));
      room = await fingers(actors[0], 'state', room.code);
      assert.deepEqual(room.game.fingers, remaining);
      for (const view of await views()) {
        assert.deepEqual(view.game.fingers, remaining);
        assert.equal(Object.hasOwn(view.game, 'responses'), false);
        assert.equal(view.revision, room.revision);
      }
      if (index < folds.length - 1) {
        assert.equal(room.phase, 'prompt');
        assert.equal(room.game.turn, previousTurn + 1);
        assert.equal(room.game.current, (author + 1) % actors.length);
      } else {
        assert.equal(room.phase, 'done');
        assert.deepEqual(room.game.losers, [2]);
        assert.deepEqual(remaining, [3, 4, 0]);
      }
    }
    for (const ui of uis) {
      await ui.wake();
      await until(() => ui.find('[data-result]'), 'all fingers screens show the same five-finger result');
      assert.ok(ui.find('[data-result]').textContent.includes(f.names[2]));
      assert.deepEqual(scoresOn(ui), [3, 4, 0]);
      assert.equal(ui.calls.some(call => call.name === 'drinking_prompt_suggestions'), false,
        'official newly recommended conditions do not become community submissions');
      assert.deepEqual(ui.errors, []);
      ui.close();
    }
    assert.deepEqual(await otherBanks(db, 'fingers'), otherBefore);
    st.diagnostic('Three independent JSDOM realms rendered the real fingers UI against actual SQL; this is not a Chromium or production-network test.');
  });
});

test('imagevote: 300 appended questions preserve an unfinished private ballot and new recommendations score identically', {timeout: 120_000}, async t => {
  const base = manifest('imagevote.json');
  const expansion = manifest('expansions/party300/imagevote.json');
  assert.equal(base.kind, 'imagevote');
  assert.equal(expansion.kind, 'imagevote');
  assert.equal(base.entries.length, 64);
  assert.equal(expansion.entries.length, 300);
  const expected = [...base.entries, ...expansion.entries];
  const extraSet = new Set(expansion.entries);

  await t.test('300 distinct additional questions fit the existing one-person choice format', () => {
    validateWords(expected, 120);
    assert.ok(expected.every(question => question.endsWith('사람은?')));
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061008_drinking_rebuild_imagevote.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false);
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const imageVote = (actor, action, code = '', options = {}) =>
    publicRpc(actor, 'party_live_multiplayer', ['imagevote', action, code, options]);
  const act = (actor, action, state, options = {}) => imageVote(actor, action, state.code, {
    round: state.round, revision: state.revision, request_id: randomUUID(), turn: state.game.turn, ...options
  });
  const readBaseline = async () => (await db.query(
    "select encode(fingerprint,'hex') value from ojjuda_arcade_internal.drinking_prompt_baseline order by fingerprint"
  )).rows.map(row => row.value);
  const originalRows = await catalogRows(db, 'imagevote');
  const originalIds = new Set(originalRows.map(row => row.id));
  assert.deepEqual(sorted(originalRows.map(row => row.body)), sorted(base.entries));
  assert.ok(originalRows.every(row => row.active));
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('imagevote','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('imagevote','',$1),'rejected'),
          ('king','',$2,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$2),'pending')`,
  ['Fixture rejected image question', 'Fixture unrelated image expansion review item']);
  const otherBefore = await otherBanks(db, 'imagevote');
  const baselineBefore = await readBaseline();

  let room = await imageVote(actors[0], 'create', '', {
    title: '이미지 지목 300개 질문 추가 검증', capacity: 3, password: 'expand-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await imageVote(actor, 'join', room.code, {password: 'expand-test'});
  const views = () => Promise.all(actors.map(actor => imageVote(actor, 'state', room.code)));
  const stored = async () => (await db.query(
    "select to_jsonb(r) value from ojjuda_arcade_internal.party_vote_rooms r where kind='imagevote' and code=$1", [room.code]
  )).rows[0].value;
  room = await act(actors[0], 'image_prompt', room, {question: base.entries[0]});
  room = await act(actors[0], 'image_vote', room, {target: 1});
  const liveBefore = await stored();
  const viewsBefore = await views();
  assert.equal(room.phase, 'vote');
  assert.deepEqual(liveBefore.game_state.votes, {'0': 1});
  for (const view of viewsBefore) {
    for (const key of ['votes', 'responses', 'counts', 'winners']) assert.equal(Object.hasOwn(view.game, key), false);
  }

  await db.exec(expansionSql('imagevote'));

  await t.test('all 64 original rows survive unchanged and precisely 300 active questions are appended', async () => {
    const current = await checkAppend(db, 'imagevote', originalRows, expansion.entries);
    assert.equal(current.length, 364);
  });

  await t.test('previous fingerprints and review entries survive while the new official questions cannot be requeued', async () => {
    const current = await catalogRows(db, 'imagevote');
    const newIds = current.filter(row => !originalIds.has(row.id)).map(row => row.id);
    const addedFingerprints = (await db.query(`select
      encode(ojjuda_arcade_internal.drinking_prompt_fingerprint('imagevote','',body),'hex') value
      from ojjuda_arcade_internal.drinking_content_items where id=any($1::int[])`, [newIds])).rows.map(row => row.value);
    assert.deepEqual(await readBaseline(), sorted(new Set([...baselineBefore, ...addedFingerprints])));
    assert.deepEqual(await publicRpc(actors[0], 'drinking_prompt_suggestions', ['submit', {
      kind: 'imagevote', text: expansion.entries[0]
    }]), {ok: true});
    assert.deepEqual(await otherBanks(db, 'imagevote'), otherBefore);
  });

  await t.test('the active question, partial private ballot, turn and every stored room field remain unchanged', async () => {
    assert.deepEqual(await stored(), liveBefore);
    const withoutClock = ({serverMs, ...view}) => view;
    assert.deepEqual((await views()).map(withoutClock), viewsBefore.map(withoutClock));
  });

  await t.test('both official pools and the bundled bank contain exactly the original plus 300 new questions', async () => {
    await checkPools(f, 'imagevote', expected);
    const context = {window: {}};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'games/drinking/community-prompts.js'), 'utf8'), context);
    assert.deepEqual(sorted(context.window.DrinkingPromptCatalog.imagevote), sorted(await currentCatalog('imagevote')));
  });

  await t.test('three real UIs recommend new questions and reveal only identical totals after the last vote', async st => {
    room = await act(actors[1], 'image_vote', room, {target: 0});
    room = await act(actors[2], 'image_vote', room, {target: 1});
    assert.equal(room.phase, 'done');
    assert.deepEqual(room.game.counts, [1, 2, 0]);
    const uis = await Promise.all(actors.map(async actor => {
      const ui = await screen({
        url: '/games/imagevote/?room=' + room.code,
        actor,
        scripts: ['/games/drinking/community-prompts.js', '/games/drinking/prompt-submissions.js',
          '/games/party-live/prompt.js', '/games/party-live/imagevote.js', '/games/party-live/room.js'],
        prepare(w) { w.document.getElementById('access-content').dataset.member = actor; },
        rpc(name, args, call) {
          const values = name === 'drinking_content' || name === 'drinking_prompt_suggestions'
            ? [args.p_action, args.p_options || {}] : rpcArgs(name, args);
          return publicRpc(call.actor, name, values);
        }
      });
      st.after(() => ui.close());
      await until(() => ui.find('[data-result]'), 'the preserved image ballot finishes normally');
      return ui;
    }));
    const owner = uis[0];
    const seenQuestions = new Set();
    for (const [index, targets] of [[1, 0, 1], [1, 2, 0]].entries()) {
      owner.w.Math.random = () => 0.5 + index * 0.2;
      owner.click('[data-do="again"]');
      await until(() => owner.find('#pair-question')?.value, 'a new image round recommends a question');
      const previous = owner.find('#pair-question').value;
      owner.click('#pair-suggest');
      await until(() => owner.find('#pair-question')?.value !== previous, 'another image question recommendation');
      const question = owner.find('#pair-question').value;
      assert.ok(extraSet.has(question), 'the actual recommendation comes from the 300 additional questions');
      assert.equal(seenQuestions.has(question), false);
      seenQuestions.add(question);
      owner.submit('#pair-form');
      await until(() => owner.find('#game h1')?.textContent === question, 'the recommended question starts voting');
      room = await imageVote(actors[0], 'state', room.code);

      async function pending(submitted) {
        for (const [seat, ui] of uis.entries()) {
          await ui.wake();
          await until(() => ui.find('.pair-status')?.textContent === `투표 ${submitted} / 3명`, 'each image screen receives the ballot count');
          assert.equal(ui.find('#game h1').textContent, question);
          assert.equal(ui.find('[data-result]'), null);
          assert.equal(ui.find('.pair-scores'), null);
          assert.equal(ui.find('.pair-caption').textContent, '질문에 가장 잘 어울리는 한 사람을 골라요.');
          assert.equal(ui.find(`[data-seat="${seat}"]`), null, 'three-person choices omit the current voter');
          assert.equal(ui.w.document.querySelectorAll('#game [data-seat]').length, seat < submitted ? 0 : 2);
        }
        for (const [seat, view] of (await views()).entries()) {
          assert.equal(view.phase, 'vote');
          assert.equal(view.game.question, question);
          assert.equal(view.game.submitted, submitted);
          assert.equal(view.game.mine, seat < submitted);
          for (const key of ['votes', 'responses', 'counts', 'winners']) {
            assert.equal(Object.hasOwn(view.game, key), false, `${key} stays private before the last ballot`);
          }
        }
      }
      await pending(0);
      await assert.rejects(act(actors[0], 'image_vote', room, {target: 0}), /invalid_target/);
      for (const [seat, target] of targets.entries()) {
        uis[seat].click(`[data-seat="${target}"]`);
        if (seat < actors.length - 1) {
          await until(() => uis[seat].find('[data-submitted]'), 'the player records one private image ballot');
          await pending(seat + 1);
        } else {
          await until(() => uis[seat].find('[data-result]'), 'the final image ballot reveals the totals');
        }
      }
      room = await imageVote(actors[0], 'state', room.code);
      const counts = actors.map((_, seat) => targets.filter(target => target === seat).length);
      const winners = counts.flatMap((count, seat) => count === Math.max(...counts) ? [seat] : []);
      assert.equal(room.phase, 'done');
      assert.deepEqual(room.game.counts, counts);
      assert.deepEqual(room.game.winners, winners);
      const scoreRows = actors.map((_, seat) => [f.names[seat], counts[seat]]).sort((a, b) => b[1] - a[1]);
      for (const [seat, ui] of uis.entries()) {
        await ui.wake();
        await until(() => ui.find('[data-result]'), 'all image screens show the final result');
        assert.equal(ui.find('.pair-caption').textContent, question);
        const actualScores = Array.from(ui.w.document.querySelectorAll('.pair-scores li'), row => [
          row.querySelector('span').textContent.replace(/ \(나\)$/u, ''),
          Number.parseInt(row.querySelector('b').textContent, 10)
        ]);
        assert.deepEqual(actualScores, scoreRows);
        for (const winner of winners) assert.ok(ui.find('[data-result]').textContent.includes(f.names[winner]));
        const view = await imageVote(actors[seat], 'state', room.code);
        assert.deepEqual(view.game, room.game, 'final public data is identical for every player');
        assert.equal(view.revision, room.revision);
        assert.equal(Object.hasOwn(view.game, 'votes'), false, 'completed results still do not identify anyone\'s ballot');
        assert.equal(Object.hasOwn(view.game, 'responses'), false);
      }
      assert.equal(Object.hasOwn((await stored()).game_state, 'votes'), false, 'the scored room also discards identifiable ballots');
    }
    for (const ui of uis) {
      assert.equal(ui.calls.some(call => call.name === 'drinking_prompt_suggestions'), false,
        'new official recommendations do not create review submissions');
      assert.deepEqual(ui.errors, []);
      ui.close();
    }
    assert.deepEqual(await otherBanks(db, 'imagevote'), otherBefore);
    st.diagnostic('Three independent JSDOM realms rendered the real imagevote UI against actual SQL; this is not a Chromium or production-network test.');
  });

  await t.test('two players retain the existing option to choose themselves for a newly appended question', async () => {
    const pair = users.slice(3, 5);
    let state = await imageVote(pair[0], 'create', '', {
      title: '이미지 지목 두 명 검증', capacity: 2, password: 'pair-test', request_id: randomUUID()
    });
    state = await imageVote(pair[1], 'join', state.code, {password: 'pair-test'});
    state = await act(pair[0], 'image_prompt', state, {question: expansion.entries[0]});
    state = await act(pair[0], 'image_vote', state, {target: 0});
    assert.equal(state.phase, 'vote');
    assert.equal(state.game.submitted, 1);
    assert.equal(Object.hasOwn(state.game, 'votes'), false);
    assert.equal(Object.hasOwn(state.game, 'counts'), false);
    state = await act(pair[1], 'image_vote', state, {target: 1});
    assert.equal(state.phase, 'done');
    assert.deepEqual(state.game.counts, [1, 1]);
    assert.deepEqual(state.game.winners, [0, 1]);
    for (const actor of pair) {
      const view = await imageVote(actor, 'state', state.code);
      assert.deepEqual(view.game, state.game);
      assert.equal(Object.hasOwn(view.game, 'votes'), false);
    }
    assert.deepEqual(await otherBanks(db, 'imagevote'), otherBefore);
  });
});

test('initial: 300 private seed words become 60 playable initial keys without changing the five-second game', {timeout: 120_000}, async t => {
  const base = manifest('initial.json');
  const expansion = manifest('expansions/party300/initial.json');
  const leading = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
  const keyPattern = /^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$/u;
  const keyFor = word => [...word].map(syllable => leading[Math.floor((syllable.codePointAt(0) - 0xAC00) / 588)]).join('');
  assert.equal(base.kind, 'initial');
  assert.equal(expansion.kind, 'initial');
  assert.equal(base.entries.length, 24);
  assert.equal(expansion.entries.length, 300);
  const words = new Set(expansion.entries);
  const groups = new Map();
  for (const word of expansion.entries) {
    const key = keyFor(word);
    groups.set(key, [...(groups.get(key) || []), word]);
  }
  const expectedKeys = sorted(groups.keys());
  const newKeys = new Set(expectedKeys.filter(key => !base.entries.includes(key)));

  await t.test('300 distinct two-syllable words cover 60 keys evenly, with eight independent examples per key', () => {
    validateWords(expansion.entries, 2);
    assert.ok(expansion.entries.every(word => /^[가-힣]{2}$/u.test(word)));
    assert.equal(groups.size, 60);
    assert.equal(newKeys.size, 36);
    assert.ok(base.entries.every(key => groups.has(key)));
    assert.deepEqual(Object.keys(expansion.examples).sort(), expectedKeys);
    for (const [key, seeds] of groups) {
      assert.match(key, keyPattern);
      assert.equal(seeds.length, 5);
      const examples = expansion.examples[key];
      assert.ok(Array.isArray(examples) && examples.length >= 8);
      validateWords(examples, 2);
      for (const word of examples) {
        assert.match(word, /^[가-힣]{2}$/u);
        assert.equal(keyFor(word), key);
      }
      assert.ok(examples.some(word => !words.has(word)), 'review examples include valid answers beyond the stored seed words');
    }
  });

  const f = await fixture({beforeExpansion: true});
  t.after(() => f.close());
  assert.ok(f.migrations.includes('20261114061009_drinking_rebuild_initial.sql'));
  assert.equal(f.migrations.some(name => /_drinking_expand_/.test(name)), false);
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const initial = (actor, action, code = '', options = {}) =>
    publicRpc(actor, 'party_live_multiplayer', ['initial', action, code, options]);
  const act = (actor, action, state, options = {}) => initial(actor, action, state.code, {
    round: state.round, revision: state.revision, request_id: randomUUID(), turn: state.game.turn, ...options
  });
  const content = (actor, action, options = {}) => publicRpc(actor, 'drinking_content', [action, {kind: 'initial', ...options}]);
  const originalRows = await catalogRows(db, 'initial');
  assert.deepEqual(sorted(originalRows.map(row => row.body)), sorted(base.entries));
  await db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue(kind,flavor,body,fingerprint,status)
    values('king','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$1),'pending')`,
  ['Fixture review item preserved across the initial word expansion']);
  const otherBefore = await otherBanks(db, 'initial');
  const baseline = async () => (await db.query(
    "select encode(fingerprint,'hex') value from ojjuda_arcade_internal.drinking_prompt_baseline order by fingerprint"
  )).rows.map(row => row.value);
  const baselineBefore = await baseline();
  const liveDefinition = (await db.query(`select pg_get_functiondef(
    'ojjuda_arcade_internal.live_initial(jsonb,text,jsonb,integer,integer,bigint)'::regprocedure) value`)).rows[0].value;

  // Advance only the clock entering the real RPC. The timer and game rules run unchanged.
  await db.exec(`
    create schema drinking_initial_expansion_fixture;
    create table drinking_initial_expansion_fixture.clock_value(ms bigint not null);
    insert into drinking_initial_expansion_fixture.clock_value
      select floor(extract(epoch from clock_timestamp())*1000)::bigint;
    create function drinking_initial_expansion_fixture.clock() returns timestamptz
      language sql stable set search_path='' as $$
        select pg_catalog.to_timestamp(ms/1000.0) from drinking_initial_expansion_fixture.clock_value
      $$;
  `);
  const definition = (await db.query(`select pg_get_functiondef(
    'ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure) value`)).rows[0].value;
  const clocked = definition.replace(/\bclock_timestamp\(\)/g, 'drinking_initial_expansion_fixture.clock()');
  assert.notEqual(clocked, definition);
  await db.exec(clocked);
  const setTime = ms => db.query('update drinking_initial_expansion_fixture.clock_value set ms=$1', [ms]);
  let room = await initial(actors[0], 'create', '', {
    title: '초성 300개 단어 추가 검증', capacity: 3, password: 'expand-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await initial(actor, 'join', room.code, {password: 'expand-test'});
  const views = () => Promise.all(actors.map(actor => initial(actor, 'state', room.code)));
  const stored = async () => (await db.query(
    "select to_jsonb(r) value from ojjuda_arcade_internal.party_vote_rooms r where kind='initial' and code=$1", [room.code]
  )).rows[0].value;
  room = await act(actors[0], 'start', room);
  assert.equal(room.phase, 'active');
  assert.equal(room.game.endsAt, room.serverMs + 5000);
  assert.ok(base.entries.includes(room.game.initial));
  const liveBefore = await stored();
  const viewsBefore = await views();

  await db.exec(expansionSql('initial'));

  await t.test('the original 24 jamo rows survive and exactly 300 private word rows are appended without unrelated changes', async () => {
    const current = await checkAppend(db, 'initial', originalRows, expansion.entries);
    assert.equal(current.length, 324);
    assert.deepEqual(await otherBanks(db, 'initial'), otherBefore);
    assert.deepEqual(await baseline(), baselineBefore);
  });

  await t.test('the private converter handles all 19 initials and rejects malformed values at the helper and table boundary', async () => {
    const samples = leading.map((letter, i) => {
      const next = (i + 1) % leading.length;
      return [String.fromCodePoint(0xAC00 + i * 588 + 587, 0xAC00 + next * 588), letter + leading[next]];
    });
    samples.push(['까따', 'ㄲㄸ'], ['빵쌈', 'ㅃㅆ'], ['쫄면', 'ㅉㅁ'], ['ㄲㄸ', 'ㄲㄸ'], ['ㅎㄱ', 'ㅎㄱ']);
    for (const [input, expected] of samples) {
      const result = (await db.query('select ojjuda_arcade_internal.drinking_initial_key($1) value', [input])).rows[0].value;
      assert.equal(result, expected, input);
    }
    const invalid = ['', '가', '가나다', 'ab', '가a', '😀😀', 'ㄱ가', 'ㅏㅣ', 'ㄱ ㄴ', ' 가나', null];
    for (const input of invalid) {
      const result = (await db.query('select ojjuda_arcade_internal.drinking_initial_key($1) value', [input])).rows[0].value;
      assert.equal(result, null, String(input));
    }
    for (const body of ['가', '가나다', 'ab', '😀😀', 'ㄱ가']) {
      await assert.rejects(db.query(
        "insert into ojjuda_arcade_internal.drinking_content_items(kind,body) values('initial',$1)", [body]
      ), {code: '23514'});
    }
    const properties = (await db.query(`select proisstrict,provolatile,prosecdef,proconfig,
      has_function_privilege('authenticated',oid,'EXECUTE') member_execute,
      has_function_privilege('anon',oid,'EXECUTE') anon_execute
      from pg_proc where oid='ojjuda_arcade_internal.drinking_initial_key(text)'::regprocedure`)).rows[0];
    assert.equal(properties.proisstrict, true);
    assert.equal(properties.provolatile, 'i');
    assert.equal(properties.prosecdef, false);
    assert.deepEqual(properties.proconfig, ['search_path=""']);
    assert.equal(properties.member_execute, false);
    assert.equal(properties.anon_execute, false);
    for (const role of ['authenticated', 'anon']) {
      await assert.rejects(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`);
        await tx.query("select ojjuda_arcade_internal.drinking_initial_key('가나')");
      }), /permission denied/);
    }
  });

  await t.test('the active initial, five-second deadline, turn and all player snapshots remain unchanged', async () => {
    assert.deepEqual(await stored(), liveBefore);
    assert.deepEqual(await views(), viewsBefore);
    assert.equal((await db.query(`select pg_get_functiondef(
      'ojjuda_arcade_internal.live_initial(jsonb,text,jsonb,integer,integer,bigint)'::regprocedure) value`)).rows[0].value,
    liveDefinition, 'adding seed words does not replace the initial game rules');
  });

  await t.test('both member pools and the existing client refresh expose only 60 deduplicated keys while raw words remain private', async () => {
    await checkPools(f, 'initial', expectedKeys);
    const ui = await screen({
      url: '/games/initial/', actor: actors[1],
      scripts: ['/games/drinking/prompt-submissions.js'],
      prepare(w) { w.document.getElementById('access-content').dataset.member = actors[1]; },
      rpc(name, args, call) {
        const values = name === 'drinking_content' ? [args.p_action, args.p_options || {}] : rpcArgs(name, args);
        return publicRpc(call.actor, name, values);
      }
    });
    try {
      assert.equal(await ui.w.DrinkingPrompts.refresh('initial'), true);
      const received = ui.w.DrinkingPrompts.list('initial');
      assert.deepEqual(sorted(received), expectedKeys, 'the existing local client receives the expanded key-only pool');
      assert.ok(received.every(key => keyPattern.test(key)));
      assert.deepEqual(ui.errors, []);
    } finally {
      ui.close();
    }
    await assert.rejects(content(actors[1], 'list'), /not_admin/);
    await assert.rejects(content(users[14], 'pool', {kinds: ['initial']}), /adult_required/);
    await assert.rejects(content(users[15], 'pool', {kinds: ['initial']}), /not_signed_in/);
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      await tx.query("select body from ojjuda_arcade_internal.drinking_content_items where kind='initial'");
    }), /permission denied/);
  });

  await t.test('real draws choose only derived keys and exclude the previous key even when supplied as a different word', async () => {
    await db.query('select setseed(0.314159)');
    const sampled = new Set();
    for (const key of expectedKeys) {
      for (const previous of [key, groups.get(key)[0]]) {
        const draw = (await db.query(
          "select ojjuda_arcade_internal.drinking_draw_prompt('initial',$1::text[]) value", [[previous]]
        )).rows[0].value;
        assert.equal(draw.length, 1);
        assert.match(draw[0], keyPattern);
        assert.ok(groups.has(draw[0]));
        assert.notEqual(draw[0], key, 'different stored words cannot repeat the same displayed initials');
        sampled.add(draw[0]);
      }
    }
    assert.ok([...sampled].some(key => newKeys.has(key)));
  });

  await t.test('three real UIs preserve an answer, time out at five seconds and play a newly derived key through the winner', async st => {
    const uis = await Promise.all(actors.map(async actor => {
      const ui = await screen({
        url: '/games/initial/?room=' + room.code, actor,
        scripts: ['/games/party-live/initial.js', '/games/party-live/room.js'],
        rpc: (name, args, call) => publicRpc(call.actor, name, rpcArgs(name, args))
      });
      st.after(() => ui.close());
      await until(() => ui.find('.initial-word')?.textContent === liveBefore.game_state.initial, 'the existing initial remains visible');
      return ui;
    }));
    const publicFields = new Set(['phase', 'initial', 'alive', 'current', 'turn', 'endsAt', 'lastOut', 'reason', 'winner']);
    async function safeViews(phase) {
      const current = await views();
      for (const view of current) {
        assert.equal(view.phase, phase);
        assert.ok(Object.keys(view.game).every(key => publicFields.has(key)), 'no seed words or answer dictionary enter public game state');
        if (view.game.initial) {
          assert.match(view.game.initial, keyPattern);
          assert.ok(groups.has(view.game.initial));
        }
      }
      return current;
    }
    async function showKey(key, phase) {
      for (const ui of uis) {
        await ui.wake();
        await until(() => ui.find('.initial-word')?.textContent === key, 'all initial screens show only the current key');
        assert.match(ui.find('.initial-word').textContent, keyPattern);
      }
      const current = await safeViews(phase);
      assert.ok(current.every(view => view.game.initial === key));
    }
    const oldKey = room.game.initial;
    uis[0].click('#initial-answer');
    await until(() => !uis[0].find('#initial-answer'), 'answering passes the preserved key to the next player');
    room = await initial(actors[0], 'state', room.code);
    assert.equal(room.phase, 'ready');
    assert.equal(room.game.current, 1);
    assert.equal(room.game.turn, 1);
    assert.deepEqual(room.game.alive, [0, 1, 2]);
    await showKey(oldKey, 'ready');
    uis[1].click('#initial-start');
    await until(() => uis[1].find('#initial-answer'), 'the next player starts the unchanged five-second timer');
    room = await initial(actors[0], 'state', room.code);
    const deadline = room.game.endsAt;
    assert.equal(deadline, room.serverMs + 5000);
    await setTime(deadline - 1);
    const almost = await initial(actors[0], 'state', room.code);
    assert.equal(almost.phase, 'active');
    assert.equal(almost.game.initial, oldKey);
    assert.deepEqual(almost.game.alive, [0, 1, 2]);

    // Choose a deterministic RNG seed whose next actual draw is one of the 36 new keys.
    // Resetting only the RNG leaves the real timeout and draw implementation intact.
    let seed, predicted;
    for (let i = 0; i < 20 && seed === undefined; i++) {
      const candidate = -0.95 + i * 0.1;
      await db.query('select setseed($1)', [candidate]);
      const draw = (await db.query(
        "select ojjuda_arcade_internal.drinking_draw_prompt('initial',$1::text[]) value", [[oldKey]]
      )).rows[0].value[0];
      if (newKeys.has(draw)) { seed = candidate; predicted = draw; }
    }
    assert.notEqual(seed, undefined);
    await db.query('select setseed($1)', [seed]);
    await setTime(deadline);
    uis[1].click('#initial-answer');
    await until(() => uis[1].find('#game h1')?.textContent === f.names[1] + '님 탈락', 'an answer at the deadline is a timeout');
    room = await initial(actors[0], 'state', room.code);
    assert.equal(room.phase, 'intermission');
    assert.equal(room.game.reason, '시간 초과');
    assert.equal(room.game.lastOut, 1);
    assert.equal(room.game.current, 2);
    assert.deepEqual(room.game.alive, [0, 2]);
    assert.equal(room.game.initial, predicted);
    assert.ok(newKeys.has(room.game.initial));
    assert.notEqual(room.game.initial, oldKey);
    await safeViews('intermission');

    await uis[2].wake();
    await until(() => uis[2].find('#initial-next'), 'the surviving next player can continue');
    uis[2].click('#initial-next');
    await until(() => uis[2].find('#initial-start'), 'the new derived key is ready');
    await showKey(predicted, 'ready');
    const outsideSeedBank = expansion.examples[predicted].find(word => !words.has(word));
    assert.ok(outsideSeedBank && keyFor(outsideSeedBank) === predicted);
    uis[2].click('#initial-start');
    await until(() => uis[2].find('#initial-answer'), 'a new-key player starts their five seconds');
    uis[2].click('#initial-answer');
    await until(() => !uis[2].find('#initial-answer'), 'a spoken answer can pass a new key without being a catalog seed');
    const answer = uis[2].calls.findLast(call => call.args.p_action === 'answer');
    assert.ok(answer);
    assert.equal(Object.hasOwn(answer.args.p_options, 'word'), false);
    assert.equal(Object.hasOwn(answer.args.p_options, 'answer'), false,
      'the server accepts the participant confirmation rather than narrowing answers to a seed dictionary');
    room = await initial(actors[0], 'state', room.code);
    assert.equal(room.phase, 'ready');
    assert.equal(room.game.current, 0);
    assert.equal(room.game.initial, predicted);
    assert.deepEqual(room.game.alive, [0, 2]);
    await showKey(predicted, 'ready');
    uis[0].click('#initial-start');
    await until(() => uis[0].find('#initial-out'), 'the remaining player can mark a duplicate or wrong answer');
    uis[0].click('#initial-out');
    await until(() => uis[0].find('#game h1')?.textContent === f.names[2] + '님 승리!', 'one player remains after an explicit wrong answer');
    for (const ui of uis) {
      await ui.wake();
      await until(() => ui.find('#game h1')?.textContent === f.names[2] + '님 승리!', 'all initial screens agree on the winner');
      assert.equal(ui.find('.initial-word'), null);
      assert.deepEqual(ui.errors, []);
      ui.close();
    }
    for (const view of await safeViews('done')) {
      assert.equal(view.game.winner, 2);
      assert.equal(view.game.lastOut, 0);
      assert.equal(view.game.reason, '중복·오답');
      assert.deepEqual(view.game.alive, [2]);
    }
    assert.deepEqual(await otherBanks(db, 'initial'), otherBefore);
    st.diagnostic('Three independent JSDOM realms used the actual initial UI and SQL with a controlled RPC clock; this is not a Chromium or production-network test.');
  });

  await t.test('administrators can add and edit raw words or old-style initials while authorization, revisions and the last-row guard remain intact', async () => {
    const adminDefinition = (await db.query("select pg_get_functiondef('public.is_admin()'::regprocedure) value")).rows[0].value;
    await db.exec(`create or replace function public.is_admin() returns boolean language sql stable as
      $$select auth.uid()='${actors[0]}'::uuid$$`);
    try {
      for (const action of ['list', 'add', 'edit', 'delete']) {
        await assert.rejects(content(actors[1], action, {text: '가나', id: originalRows[0].id, revision: 1}), /not_admin/);
      }
      await assert.rejects(content(users[14], 'add', {text: '가나'}), /adult_required/);
      for (const text of ['가', '가나다', 'ab', '가a', '😀😀', 'ㄱ가', 'ㅏㅣ', 42, null]) {
        await assert.rejects(content(actors[0], 'add', {text}), /invalid_prompt/);
      }
      const candidates = ['쐐기', '뚜껑', '땅콩', '까치', '쌈밥', '쫄면', '꼬막', '떡국', '뿌리'];
      const [firstWord, editedWord] = candidates.filter(word => !words.has(word));
      assert.ok(firstWord && editedWord);
      assert.deepEqual(await content(actors[0], 'add', {text: firstWord}), {ok: true});
      let item = (await content(actors[0], 'list', {q: firstWord})).items.find(row => row.text === firstWord);
      assert.ok(item, 'the authorized admin list keeps the raw stored word');
      const originalRevision = item.revision;
      assert.deepEqual(await content(actors[0], 'edit', {id: item.id, revision: item.revision, text: editedWord}), {ok: true});
      item = (await content(actors[0], 'list', {q: editedWord})).items.find(row => row.id === item.id);
      assert.equal(item.text, editedWord);
      assert.equal(item.revision, originalRevision + 1);
      const newJamo = leading.flatMap(first => leading.map(second => first + second)).find(key => !base.entries.includes(key));
      await assert.rejects(content(actors[0], 'edit', {id: item.id, revision: originalRevision, text: newJamo}), /stale_revision/);
      await assert.rejects(content(actors[0], 'delete', {id: item.id, revision: originalRevision}), /stale_revision/);
      assert.deepEqual(await content(actors[0], 'edit', {id: item.id, revision: item.revision, text: newJamo}), {ok: true});
      item = (await content(actors[0], 'list', {q: newJamo})).items.find(row => row.id === item.id);
      assert.equal(item.text, newJamo, 'old two-jamo admin edits remain supported');
      assert.deepEqual(await content(actors[0], 'add', {text: firstWord}), {ok: true});
      await assert.rejects(content(actors[0], 'add', {text: base.entries[0]}), /duplicate_prompt/);

      // The isolated fixture now leaves two raw rows sharing one key. The existing
      // guard protects the final active row, rather than blocking every duplicate-key deletion.
      const keptWords = groups.get(expectedKeys[0]).slice(0, 2);
      const kept = (await db.query(`select id,revision from ojjuda_arcade_internal.drinking_content_items
        where kind='initial' and body=any($1::text[]) order by id`, [keptWords])).rows;
      assert.equal(kept.length, 2);
      await db.query("update ojjuda_arcade_internal.drinking_content_items set active=(id=any($1::int[])) where kind='initial'", [kept.map(row => row.id)]);
      assert.deepEqual(await content(actors[0], 'delete', kept[0]), {ok: true});
      await assert.rejects(content(actors[0], 'delete', kept[1]), /last_prompt/);
      const remaining = await content(actors[1], 'pool', {kinds: ['initial'], round_mix: true});
      assert.deepEqual(remaining.banks.initial, [expectedKeys[0]]);
      assert.deepEqual((await db.query(
        "select ojjuda_arcade_internal.drinking_draw_prompt('initial',$1::text[]) value", [[keptWords[1]]]
      )).rows[0].value, [expectedKeys[0]], 'the sole-key fallback retains the existing playable-last-prompt behavior');
      assert.deepEqual(await otherBanks(db, 'initial'), otherBefore);
      assert.deepEqual(await baseline(), baselineBefore);
    } finally {
      await db.exec(adminDefinition);
    }
  });
});
