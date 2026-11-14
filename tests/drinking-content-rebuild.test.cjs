'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const {fixture} = require('./drinking-room-fixture.cjs');

const root = path.join(__dirname, '..');
const migrationDir = path.join(root, 'supabase/migrations');

test('the rebuilt liar catalog replaces future draws without changing a live round', {timeout: 120_000}, async t => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'games/drinking/content/liar.json'), 'utf8'));
  assert.equal(manifest.kind, 'liar');
  assert.ok(manifest.mechanic, 'the manifest describes the game mechanic');
  assert.ok(Array.isArray(manifest.entries) && manifest.entries.length > 1, 'liar needs alternative secret words');
  for (const word of manifest.entries) {
    assert.equal(typeof word, 'string');
    assert.ok(word.length > 0 && word === word.trim(), 'manifest entries are nonempty, trimmed words');
  }
  const expectedWords = [...manifest.entries].sort();
  const expectedSet = new Set(expectedWords);
  assert.equal(expectedSet.size, expectedWords.length, 'the manifest has no duplicate words');

  const migrations = fs.readdirSync(migrationDir).filter(name => /^\d+_drinking_rebuild_liar\.sql$/.test(name));
  assert.equal(migrations.length, 1, 'apply exactly the liar rebuild migration after the baseline fixture');
  const f = await fixture({beforeRebuild: true});
  t.after(() => f.close());
  assert.equal(f.migrations.includes(migrations[0]), false, 'the fixture must still represent the catalog before this rebuild');
  const {db, users, publicRpc} = f;
  const actors = users.slice(0, 3);
  const liar = (actor, action, code = '', options = {}) => publicRpc(actor, 'liar_multiplayer', [action, code, options]);
  const pool = (actor, roundMix, role = 'authenticated') =>
    publicRpc(actor, 'drinking_content', ['pool', {kinds: ['liar'], round_mix: roundMix}], role);
  const states = code => Promise.all(actors.map(actor => liar(actor, 'state', code)));
  const storedRoom = async code => (await db.query(
    'select to_jsonb(r) value from ojjuda_arcade_internal.liar_rooms r where code=$1', [code]
  )).rows[0].value;
  const otherCatalogs = async () => (await db.query(
    "select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]'::jsonb) value from ojjuda_arcade_internal.drinking_content_items c where kind<>'liar'"
  )).rows[0].value;

  const oldItems = (await db.query(
    "select id,body from ojjuda_arcade_internal.drinking_content_items where kind='liar' and active order by id"
  )).rows;
  assert.ok(oldItems.length > 0, 'the baseline contains the legacy liar catalog');
  const oldIds = oldItems.map(item => item.id);
  const otherCatalogsBefore = await otherCatalogs();

  let room = await liar(actors[0], 'create', '', {
    title: '라이어 콘텐츠 교체 검증', capacity: 3, password: 'liar-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await liar(actor, 'join', room.code, {password: 'liar-test'});
  assert.equal(room.phase, 'hints');
  room = await liar(actors[0], 'hint', room.code, {round: room.round, hint: '교체 전에 남긴 힌트'});
  assert.equal(room.turn, 1);
  const snapshotsBefore = await states(room.code);
  const storedBefore = await storedRoom(room.code);
  assert.ok(oldItems.some(item => item.body === storedBefore.secret_word));

  // The baseline fixture deliberately stops before this migration. Execute the
  // real SQL unchanged so both sides of the content transition are observable.
  await db.exec(fs.readFileSync(path.join(migrationDir, migrations[0]), 'utf8'));

  await t.test('all prior active IDs are retired and the active catalog matches the manifest', async () => {
    const remainingLegacy = await db.query(
      'select id from ojjuda_arcade_internal.drinking_content_items where active and id=any($1::int[])', [oldIds]
    );
    assert.deepEqual(remainingLegacy.rows, []);
    const active = (await db.query(
      "select id,body,second from ojjuda_arcade_internal.drinking_content_items where kind='liar' and active order by id"
    )).rows;
    assert.deepEqual(active.map(item => item.body).sort(), expectedWords);
    assert.ok(active.every(item => item.second === null), 'liar retains one shared word per round');
    assert.deepEqual(await otherCatalogs(), otherCatalogsBefore, 'this migration leaves the other game catalogs unchanged');
  });

  await t.test('an existing three-player round keeps its exact state and private snapshots', async () => {
    assert.deepEqual(await storedRoom(room.code), storedBefore);
    assert.deepEqual(await states(room.code), snapshotsBefore);
  });

  await t.test('both normal and round-mix pools contain only the rebuilt words', async () => {
    for (const roundMix of [false, true]) {
      const reply = await pool(actors[0], roundMix);
      assert.deepEqual(Object.keys(reply.banks), ['liar']);
      const words = reply.banks.liar;
      assert.ok(Array.isArray(words) && words.length > 0);
      assert.equal(new Set(words).size, words.length);
      for (const word of words) assert.ok(expectedSet.has(word), `unexpected round_mix=${roundMix} word: ${word}`);
      if (!roundMix) assert.deepEqual([...words].sort(), expectedWords);
    }
  });

  await t.test('repeated actual SQL draws avoid the previous word and stay in the rebuilt catalog', async () => {
    let previous = storedBefore.secret_word;
    for (let draw = 0; draw < 32; draw++) {
      const result = (await db.query(
        "select ojjuda_arcade_internal.drinking_draw_prompt('liar',$1::text[]) value", [[previous]]
      )).rows[0].value;
      assert.equal(result.length, 1);
      assert.ok(expectedSet.has(result[0]), 'every draw uses the rebuilt catalog');
      assert.notEqual(result[0], previous, 'an available alternative must beat an immediate repeat');
      previous = result[0];
    }
  });

  await t.test('actual three-player rounds hide the word from the liar until every vote is complete', async () => {
    async function finishHints(current) {
      while (current.phase === 'hints') {
        const seat = current.turn;
        current = await liar(actors[seat], 'hint', current.code, {
          round: current.round, hint: `검증 힌트 ${current.round}-${seat}`
        });
      }
      assert.equal(current.phase, 'voting');
      return current;
    }
    async function vote(actor, current, seat) {
      return liar(actor, 'vote', current.code, {round: current.round, target: (seat + 1) % actors.length});
    }
    function privateDeal(snapshots, expectedWord) {
      const liarViews = snapshots.filter(view => view.role === 'liar');
      const citizens = snapshots.filter(view => view.role === 'citizen');
      assert.equal(liarViews.length, 1);
      assert.equal(citizens.length, 2);
      assert.equal(Object.hasOwn(liarViews[0], 'word'), false, 'the liar cannot read the secret word before completion');
      for (const view of citizens) assert.equal(view.word, expectedWord);
      for (const [seat, view] of snapshots.entries()) {
        assert.equal(view.me, seat);
        assert.equal(Object.hasOwn(view, 'liar'), false, 'other players cannot read the liar seat');
        assert.equal(Object.hasOwn(view, 'totals'), false, 'vote totals remain hidden until completion');
      }
      return liarViews[0].me;
    }

    // Finish the already-dealt legacy round normally; catalog replacement must
    // not change its answer, even when the answer is no longer active.
    room = await finishHints(await liar(actors[0], 'state', room.code));
    for (const [seat, actor] of actors.entries()) room = await vote(actor, room, seat);
    assert.equal(room.phase, 'done');
    for (const view of await states(room.code)) assert.equal(view.word, storedBefore.secret_word);

    room = await liar(actors[0], 'again', room.code, {round: room.round});
    assert.equal(room.phase, 'hints');
    const dealt = await states(room.code);
    const word = dealt.find(view => view.role === 'citizen').word;
    assert.ok(expectedSet.has(word), 'the next round uses the rebuilt catalog');
    assert.notEqual(word, storedBefore.secret_word);
    const liarSeat = privateDeal(dealt, word);

    room = await finishHints(room);
    privateDeal(await states(room.code), word);
    for (const [seat, actor] of actors.slice(0, 2).entries()) room = await vote(actor, room, seat);
    assert.equal(room.phase, 'voting');
    assert.equal(room.voteCount, 2);
    privateDeal(await states(room.code), word);

    room = await vote(actors[2], room, 2);
    assert.equal(room.phase, 'done');
    for (const view of await states(room.code)) {
      assert.equal(view.phase, 'done');
      assert.equal(view.word, word, 'all three players see the same answer after the final vote');
      assert.equal(view.liar, liarSeat);
      assert.equal(view.voteCount, 3);
      assert.deepEqual(view.totals, [1, 1, 1]);
    }

    room = await liar(actors[0], 'again', room.code, {round: room.round});
    const next = await states(room.code);
    const nextWord = next.find(view => view.role === 'citizen').word;
    assert.ok(expectedSet.has(nextWord));
    assert.notEqual(nextWord, word, 'a subsequent RPC round also avoids repeating the previous word');
    privateDeal(next, nextWord);
  });

  await t.test('the pool remains unavailable to signed-out, anonymous and underage accounts', async () => {
    for (const roundMix of [false, true]) {
      await assert.rejects(pool('', roundMix, 'anon'), /permission denied/);
      await assert.rejects(pool('', roundMix), /not_signed_in/);
      await assert.rejects(pool(users[15], roundMix), /not_signed_in/);
      await assert.rejects(pool(users[14], roundMix), /adult_required/);
    }
    const reply = await pool(actors[1], false);
    assert.deepEqual([...reply.banks.liar].sort(), expectedWords, 'an ordinary verified adult member still has access');
  });
});
