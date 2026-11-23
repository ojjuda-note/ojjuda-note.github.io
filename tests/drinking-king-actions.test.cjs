'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const {fixture} = require('./drinking-room-fixture.cjs');
const {screen, until, rpcArgs} = require('./helpers/drinking-ui-fixture.cjs');

const root = path.join(__dirname, '..');
const migrationDir = path.join(root, 'supabase/migrations');
const sorted = values => [...values].sort();
const flavors = ['mild', 'spicy'];
const games = ['king', 'truth', 'minority', 'imagevote', 'fingers'];
const kingRows = async db => (await db.query(`
  select to_jsonb(c) as value from ojjuda_arcade_internal.drinking_content_items c
  where kind='king' order by id
`)).rows.map(row => row.value);
const unaffected = async db => (await db.query(`select jsonb_build_object(
  'other_games',(select jsonb_agg(to_jsonb(c) order by id)
    from ojjuda_arcade_internal.drinking_content_items c where kind<>'king'),
  'truth',(select jsonb_agg(to_jsonb(c) order by id)
    from ojjuda_arcade_internal.drinking_truth_cards c),
  'queue',(select jsonb_agg(to_jsonb(q) order by id)
    from ojjuda_arcade_internal.drinking_prompt_queue q),
  'legacy',(select jsonb_agg(to_jsonb(p) order by kind,slot)
    from ojjuda_arcade_internal.drinking_prompts p)
) as value`)).rows[0].value;

test('king action catalog reaches both recipient modes without changing live rounds or other games', {timeout: 120_000}, async t => {
  const {createKingActionsPlan} = await import('../scripts/build-drinking-king-actions.mjs');
  const plan = createKingActionsPlan();
  assert.equal(fs.readFileSync(plan.migrationPath, 'utf8'), plan.sql);
  const expectedBodies = sorted(plan.entries.map(entry => entry.body));
  const expectedFlavors = new Map(plan.entries.map(entry => [entry.body, entry.flavor]));
  assert.equal(expectedBodies.length, 80);
  assert.equal(new Set(expectedBodies).size, 80);
  for (const flavor of flavors) {
    for (const pair of [false, true]) {
      assert.equal(plan.catalog[flavor].filter(body => body.startsWith('둘이 ') === pair).length, 20);
    }
  }

  const f = await fixture();
  t.after(() => f.close());
  const migrations = fs.readdirSync(migrationDir);
  for (const suffix of [
    'drinking_prompt_flavors', ...games.map(kind => 'drinking_flavor500_' + kind),
    'drinking_flavor500_reread', 'drinking_king_pair_moves', 'drinking_king_pair_wording'
  ]) {
    const matches = migrations.filter(name => name.endsWith('_' + suffix + '.sql'));
    assert.equal(matches.length, 1, suffix);
    await f.db.exec(fs.readFileSync(path.join(migrationDir, matches[0]), 'utf8'));
  }
  const original = await kingRows(f.db);
  assert.equal(original.filter(row => row.active).length, 1364, 'exercise the full deployed catalog');
  for (const status of ['pending', 'rejected']) {
    const body = 'Fixture preserved king review ' + status;
    await f.db.query(`insert into ojjuda_arcade_internal.drinking_prompt_queue
      (kind,flavor,body,fingerprint,status)
      values('king','',$1,ojjuda_arcade_internal.drinking_prompt_fingerprint('king','',$1),$2)`, [body, status]);
  }

  const actors = f.users.slice(0, 3);
  const king = (actor, action, code = '', options = {}) => f.publicRpc(actor, 'king_multiplayer', [action, code, options]);
  let room = await king(actors[0], 'create', '', {
    title: '왕게임 행동 미션 검증', capacity: 3, password: 'action-test', request_id: randomUUID()
  });
  for (const actor of actors.slice(1)) room = await king(actor, 'join', room.code, {password: 'action-test'});
  const views = () => Promise.all(actors.map(actor => king(actor, 'state', room.code)));
  const stored = async () => (await f.db.query(
    'select to_jsonb(r) as value from ojjuda_arcade_internal.king_rooms r where code=$1', [room.code]
  )).rows[0].value;
  async function readyDeal() {
    const dealt = await views();
    const byCard = new Map(dealt.map((view, seat) => [view.card, actors[seat]]));
    assert.deepEqual([...byCard.keys()].sort(), [0, 1, 2]);
    for (const actor of actors) room = await king(actor, 'ready', room.code, {round: room.round});
    assert.equal(room.phase, 'order');
    return byCard;
  }
  const byCard = await readyDeal();
  const oldMission = original.find(row => row.active && row.body.startsWith('둘이 ') && !expectedFlavors.has(row.body)).body;
  room = await king(byCard.get(0), 'order', room.code, {round: room.round, number: 1, second: 2, mission: oldMission});
  room = await king(byCard.get(1), 'accept', room.code, {round: room.round});
  assert.equal(room.phase, 'response');
  assert.deepEqual(room.accepted, [1]);
  const liveBefore = await stored();
  const untouchedBefore = await unaffected(f.db);

  await f.db.exec(plan.sql);

  await t.test('only the reviewed actions are active and retired rows retain their identity', async () => {
    const rows = await kingRows(f.db);
    const active = rows.filter(row => row.active);
    assert.deepEqual(sorted(active.map(row => row.body)), expectedBodies);
    for (const row of active) {
      assert.equal(row.prompt_flavor, expectedFlavors.get(row.body));
      assert.equal(row.party_pick, true);
      assert.equal(row.second, null);
    }
    for (const old of original) {
      const current = rows.find(row => row.id === old.id);
      assert.ok(current, 'retired IDs survive');
      assert.equal(current.body, old.body);
      assert.equal(current.queue_id, old.queue_id);
      if (!expectedFlavors.has(old.body)) assert.equal(current.active, false);
    }
  });

  await t.test('an existing mission, consent and all unrelated content survive the replacement', async () => {
    assert.deepEqual(await stored(), liveBefore);
    assert.deepEqual(await unaffected(f.db), untouchedBefore);
    room = await king(byCard.get(2), 'accept', room.code, {round: room.round});
    assert.equal(room.phase, 'done');
    assert.equal(room.mission, oldMission);
    assert.deepEqual(sorted(room.accepted), [1, 2]);
  });

  await t.test('normal and round-mix public pools expose exactly 80 actions with matching flavor labels', async () => {
    for (const roundMix of [false, true]) {
      const result = await f.publicRpc(actors[0], 'drinking_content', [
        'pool', {kinds: ['king'], round_mix: roundMix, include_flavors: true}
      ]);
      assert.deepEqual(Object.keys(result.banks), ['king']);
      assert.deepEqual(sorted(result.banks.king), expectedBodies);
      assert.equal(result.flavors.king.length, result.banks.king.length);
      result.banks.king.forEach((body, i) => assert.equal(result.flavors.king[i], expectedFlavors.get(body)));
    }
    const legacy = await f.publicRpc(actors[0], 'drinking_content', ['pool', {kinds: ['king']}]);
    assert.equal(legacy.flavors, undefined, 'older clients retain their response format');
    assert.deepEqual(sorted(legacy.banks.king), expectedBodies);
  });

  await t.test('the shared one-device selector retains choices for both flavors and recipient counts', async st => {
    const ui = await screen({
      actor: actors[0], url: '/games/drinking/local/',
      scripts: ['/games/drinking/community-prompts.js', '/games/drinking/prompt-flavors.js', '/games/drinking/prompt-submissions.js'],
      rpc: (name, args) => f.publicRpc(actors[0], name, rpcArgs(name, args))
    });
    st.after(() => ui.close());
    const prompts = ui.w.DrinkingPrompts;
    const tastes = ui.w.PartyPromptFlavors;
    assert.equal(await prompts.refresh('king'), true);
    assert.deepEqual(sorted(ui.w.DrinkingPromptCatalog.king), expectedBodies, 'the shipped fallback uses the current actions too');
    for (const flavor of flavors) {
      for (const pair of [false, true]) {
        const choices = tastes.filter('king', prompts.kingChoices(prompts.list('king'), pair), flavor);
        assert.deepEqual(sorted(choices), sorted(plan.catalog[flavor].filter(body => body.startsWith('둘이 ') === pair)));
        assert.equal(choices.length, 20);
        assert.ok(choices.includes(tastes.recommend('king', choices, undefined, flavor)));
      }
    }
    assert.deepEqual(ui.errors, []);
  });

  await t.test('the multiplayer picker sends a new action and every member sees the same mission', async st => {
    const currentViews = await views();
    const host = actors[currentViews.findIndex(view => view.me === view.hostSeat)];
    room = await king(host, 'again', room.code, {round: room.round});
    const nextCards = await readyDeal();
    const kingActor = nextCards.get(0);
    const ui = await screen({
      actor: kingActor, url: '/games/king/?room=' + room.code,
      scripts: ['/games/drinking/community-prompts.js', '/games/drinking/prompt-submissions.js', '/games/king/room.js'],
      rpc: (name, args, call) => f.publicRpc(call.actor, name, rpcArgs(name, args))
    });
    st.after(() => ui.close());
    await until(() => ui.find('#order [data-selected]')?.textContent, 'action selector');
    const flavor = ui.find('[data-prompt-flavor]');
    flavor.value = 'spicy';
    flavor.dispatchEvent(new ui.w.Event('change', {bubbles: true}));
    const second = ui.find('#order [name="second"]');
    second.value = '2';
    second.dispatchEvent(new ui.w.Event('change', {bubbles: true}));
    const pairChoices = plan.catalog.spicy.filter(body => body.startsWith('둘이 '))
      .map(body => ui.w.DrinkingQuestionMenu.kingMission(body, 1, 2));
    await until(() => pairChoices.includes(ui.find('#order [data-selected]')?.textContent), 'two-person action selector');
    const selected = ui.find('#order [data-selected]').textContent;
    assert.ok(pairChoices.includes(selected));
    ui.submit('#order');
    await until(() => ui.find('.king-order h1')?.textContent === selected, 'new action submitted');
    for (const view of await views()) {
      assert.equal(view.phase, 'response');
      assert.equal(view.mission, selected);
      assert.equal(view.number, 1);
      assert.equal(view.second, 2);
    }
    assert.deepEqual(ui.errors, []);
  });

  await t.test('reapplying the migration leaves catalog rows and the live action unchanged', async () => {
    const beforeRows = await kingRows(f.db);
    const beforeRoom = await stored();
    await f.db.exec(plan.sql);
    assert.deepEqual(await kingRows(f.db), beforeRows);
    assert.deepEqual(await stored(), beforeRoom);
    assert.deepEqual(await unaffected(f.db), untouchedBefore);
  });
});
