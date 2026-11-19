const assert = require('node:assert/strict');
const { screen, until, pause } = require('./onecard-dom-fixture.cjs');
const { fixture } = require('./onecard-online-fixture.cjs');
const screens = [], results = [];
let engine, server;
const open = async options => { const s = await screen(options); screens.push(s); return s; };
function rig(hands, options = {}) {
  hands = hands.map(hand => [...hand]);
  const occupied = new Set([options.top || 'S-4', ...hands.flat()]);
  const spare = engine.makeDeck().filter(id => !occupied.has(id) && ['3', '4', '5', '6', '8', '9', '10'].includes(engine.cardInfo(id).rank));
  while (hands.length < 5) hands.push(spare.splice(0, 2));
  const state = engine.createGame({ players: hands.map((_, i) => ({ id: i ? `bot-${i - 1}` : 'me', name: i ? `친구 ${i}` : '나', bot: i > 0 })), seed: 7211 });
  const top = options.top || 'S-4', used = new Set([top, ...hands.flat()]);
  state.players.forEach((player, i) => { player.hand = [...hands[i]]; player.calledOne = false; });
  Object.assign(state, { discard: [top], currentSuit: engine.cardInfo(top).suit, deck: engine.makeDeck().filter(id => !used.has(id)), lastEvents: [] }, options);
  return { state, opponents: hands.length - 1 };
}
async function resume(s) { s.click('#resume-solo'); await until(() => !s.find('#draw-button').disabled, 'resume ready'); }
async function createPublicRoom(s, title = '친구와 원카드') {
  s.click('#online-open');
  await until(() => s.find('[data-arcade-action="create"]') && !s.find('[data-arcade-action="create"]').disabled, 'shared room directory ready');
  assert.equal(s.find('[data-entry-panel="computer"]').hidden, true);
  assert.equal(s.find('[data-entry-panel="opponent"]').hidden, false);
  s.click('[data-arcade-action="create"]');
  assert.equal(s.find('#sheet').open, true);
  assert.equal(s.find('#arcade-room-form [name="kind"]').value, 'onecard');
  assert.equal(s.find('#arcade-room-form [name="capacity"]').value, '5');
  s.find('#arcade-room-form [name="title"]').value = title;
  s.click('#arcade-room-form button[type="submit"]');
  await until(() => !s.find('#lobby').hidden && !s.find('#sheet').open, 'created room opens the real waiting area and closes the form');
  assert.equal(s.find('#room-title').textContent, title);
  assert.equal(s.find('#room-code-display').textContent, `#${s.client.room.room_no}`);
  assert.equal(s.find('#onecard-app').hidden, true);
  return s.client.room;
}
async function joinPublicRoom(s, number) {
  s.click('#online-open');
  const selector = `[data-arcade-action="join"][data-room="${number}"]`;
  await until(() => s.find(selector) && !s.find(selector).disabled, 'join from shared native room card');
  s.click(selector); await until(() => !s.find('#lobby').hidden, 'joined real waiting area');
  assert.equal(s.client.room.room_no, number);
}
async function check(name, fn) {
  const first = screens.length;
  try { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false }); console.error(`FAIL ${name}\n${error.stack}`); }
  finally {
    for (const s of screens.slice(first)) {
      if (s.errors.length) { results.push({ name: `${name}: uncaught DOM errors`, pass: false }); console.error(s.errors); }
      s.close();
    }
  }
}

(async () => {
  engine = await import('../games/onecard/engine.mjs');
  await check('real app creates a five-seat solo game and a shared overlapping deal', async () => {
    const s = await open({ animate: true, width: 360, height: 640 });
    assert.equal(s.find('#onecard-app').hidden, true);
    assert.equal(s.find('#setup').hidden, false);
    assert.equal(s.find('#solo-mode').getAttribute('aria-pressed'), 'true');
    assert.equal(s.find('#opponent-count'), null, 'seat count is fixed, without a selector'); s.click('#solo-start');
    await until(() => s.all('.flying-card').length === 36, '35 cards plus opening');
    const flights = s.animations.filter(animation => animation.node.classList.contains('flying-card'));
    assert.equal(flights.length, 36);
    assert.equal(new Set(flights.map(animation => animation.startTime)).size, 1);
    assert.ok(flights.slice(1).every((animation, i) => animation.options.delay - flights[i].options.delay < flights[i].options.duration));
    assert.equal(s.find('#draw-button').disabled, true);
    assert.equal(s.all('#hand .hand-card:not(:disabled)').length, 0);
    assert.equal(s.find('#previous-cards').disabled, true);
    assert.equal(s.find('#next-cards').disabled, true);
    // Hidden fan rectangles at short heights must fall back to the visible avatar.
    const opponentFlights = flights.filter((_, i) => i < 35 && i % 5 !== 0);
    assert.ok(opponentFlights.every(animation => !animation.frames.at(-1).transform.includes('translate3d(-39px,-56px,0)')), 'opponent flights never target the viewport origin');
    s.find('#draw-button').click(); assert.equal(s.saved.revision, 0, 'disabled draw cannot advance the game');
    await s.finishAnimations();
    await until(() => !s.find('#draw-button').disabled, 'deal unlocks actions');
    assert.equal(s.saved.players.length, 5);
    assert.equal(s.saved.players.filter(player => player.bot).length, 4);
    assert.equal(s.all('#opponents .seat').length, 4);
    assert.equal(s.all('#hand .hand-card').length, 7);
  });

  await check('every new solo round reshuffles five seats while my own hand stays below', async () => {
    const s = await open({ animate: true, seatRolls: [0, 0, 0, 0, .999999] });
    s.click('#solo-start'); await until(() => s.all('.flying-card').length === 36, 'first shuffled deal');
    const first = s.saved.players.map(player => player.id);
    assert.equal(first.indexOf('me'), 4); assert.equal(s.saved.turn, 0);
    assert.equal(s.find('#my-name').textContent, '나');
    assert.deepEqual(s.all('#hand .hand-card').map(node => node.dataset.card).sort(), [...s.saved.players[4].hand].sort());
    await s.finishAnimations(); s.click('#menu-button'); s.button('새 게임'); s.button('나가기');
    s.click('#solo-start'); await until(() => s.all('.flying-card').length === 36, 'second shuffled deal');
    assert.notDeepEqual(s.saved.players.map(player => player.id), first);
    assert.equal(s.saved.players[0].id, 'me'); assert.equal(s.saved.turn, 0);
    assert.equal(s.saved.players.length, 5); assert.equal(s.saved.direction, 1);
    await s.finishAnimations();
  });

  await check('old two-to-four seat saves stay stored, and five-seat reverse saves resume clockwise', async () => {
    for (const count of [2, 3, 4]) {
      const state = engine.createGame({ players: Array.from({ length: count }, (_, i) => ({ id: i ? `bot-${i}` : 'me', bot: i > 0 })), seed: count });
      const s = await open({ saved: { state, opponents: count - 1 } });
      assert.equal(s.find('#resume-solo').hidden, true);
      assert.deepEqual(s.saved, state, 'unsupported old table is not silently deleted or rewritten');
      s.close();
    }
    const saved = rig([['S-3', 'H-8'], ['D-5', 'C-6']]); saved.state.direction = -1;
    const s = await open({ saved }); await resume(s);
    assert.equal(s.saved.direction, 1); assert.match(s.find('#direction').textContent, /시계/);
  });

  await check('declare and bot progress integrate with the actual engine', async () => {
    const s = await open({ saved: rig([['S-3', 'H-8'], ['S-9', 'D-6']]) });
    await resume(s); s.click('#onecard-button'); s.click('#hand [data-card="S-3"]');
    await until(() => s.saved.revision >= 1, 'user plays');
    assert.equal(s.saved.players[0].calledOne, true);
    assert.equal(s.find('#draw-button').disabled, true);
    await until(() => s.saved.revision >= 5, 'four computers play clockwise');
    await until(() => !s.find('#draw-button').disabled, 'user turn returns');
    assert.equal(s.saved.turn, 0);
    assert.equal(s.saved.players[0].hand.length, 1, 'no missed declaration penalty');
    const revision = s.saved.revision;
    s.click('#draw-button'); await until(() => s.saved.revision > revision, 'draw commits');
    assert.equal(s.saved.players[0].hand.length, 2);
  });

  await check('suit modal cancels without playing and submits a chosen suit', async () => {
    const s = await open({ saved: rig([['D-9', 'S-7'], ['H-3', 'H-6']]) });
    await resume(s); s.click('#hand [data-card="S-7"]');
    assert.equal(s.find('#sheet').open, true);
    assert.equal(s.all('.suit-choice').length, 4);
    assert.equal(s.find('#draw-button').disabled, true);
    s.escape(); await pause();
    assert.equal(s.saved.revision, 0);
    assert.equal(s.find('#sheet').open, false);
    s.click('#hand [data-card="S-7"]'); s.click('.suit-H');
    await until(() => s.saved.revision >= 1, 'seven played');
    assert.equal(s.saved.currentSuit, 'H');
    assert.equal(s.saved.players[0].hand.includes('S-7'), false);
    assert.equal(s.find('#sheet').open, false);
  });

  await check('last card victory, restart, exit and resume stay usable', async () => {
    const s = await open({ saved: rig([['S-K', 'S-3'], ['C-9', 'D-8']]) });
    await resume(s); s.click('#onecard-button'); s.click('#hand [data-card="S-K"]');
    await until(() => !s.find('#draw-button').disabled, 'K repeats with five seats');
    s.click('#hand [data-card="S-3"]');
    await until(() => s.find('#sheet').open && s.find('#sheet-title').textContent.includes('승리'), 'result');
    assert.equal(s.saved.winnerId, 'me');
    assert.equal(s.find('#draw-button').disabled, true);
    assert.ok(s.find('#sheet.game-result-dialog .game-result-card'));
    assert.equal(s.all('.result-players > div').length, 5);
    assert.equal(s.all('.game-result-actions button').length, 3);
    s.button('다시 한 판'); await until(() => !s.find('#draw-button').disabled, 'fresh round');
    assert.equal(s.saved.players[0].hand.length, 7);
    s.click('#menu-button'); s.button('새 게임'); s.button('나가기');
    await until(() => !s.find('#entry').hidden, 'welcome');
    assert.equal(s.find('#resume-solo').hidden, false);
    await resume(s); assert.equal(s.saved.players[0].hand.length, 7);
  });

  await check('all mobile hand pages are reachable and locked during draw motion', async () => {
    const hand = engine.makeDeck().filter(id => !['S-4', 'H-8', 'D-9'].includes(id)).slice(0, 18);
    const s = await open({ saved: rig([hand, ['H-8', 'D-9']]), width: 360, height: 640, animate: true });
    await resume(s);
    const seen = new Set(s.all('#hand .hand-card').map(node => node.dataset.card));
    s.click('#next-cards'); for (const node of s.all('#hand .hand-card')) seen.add(node.dataset.card);
    s.click('#next-cards'); for (const node of s.all('#hand .hand-card')) seen.add(node.dataset.card);
    assert.equal(seen.size, 18);
    assert.equal(s.find('#next-cards').disabled, true);
    s.click('#previous-cards'); s.click('#draw-button');
    await until(() => s.find('.flying-card'), 'draw in flight');
    assert.equal(s.find('#previous-cards').disabled, true);
    assert.equal(s.find('#next-cards').disabled, true);
    await s.finishAnimations();
    assert.equal(s.saved.players[0].hand.length, 19);
  });

  await check('login failure explains multiplayer access while solo remains available', async () => {
    const s = await open(); s.click('#online-open');
    await until(() => !s.find('#login-link').hidden, 'login link');
    assert.match(s.find('#online-account-note').textContent, /로그인/);
    assert.equal(s.find('[data-entry-panel="opponent"]').hidden, false);
    s.click('#solo-mode');
    assert.equal(s.find('[data-entry-panel="computer"]').hidden, false);
    assert.equal(s.find('[data-entry-panel="opponent"]').hidden, true);
    s.click('#solo-start');
    await until(() => !s.find('#draw-button').disabled, 'solo ready');
    assert.equal(s.saved.players[0].hand.length, 7);
  });

  await check('five real app/client screens create, join, start, synchronize and rematch', async () => {
    server = await fixture();
    const ids = server.users.slice(0, 5), group = [];
    for (const actor of ids) group.push(await open({ server, actor }));
    const host = group[0], created = await createPublicRoom(host);
    for (const guest of group.slice(1)) await joinPublicRoom(guest, created.room_no);
    await host.poll(); assert.equal(host.all('#room-players .lobby-player:not(.is-bot)').length, 5);
    host.click('#start-room');
    await until(() => host.find('#onecard-app').dataset.view === 'playing', 'host game starts');
    for (const s of group) { await s.poll(); await until(() => s.all('#hand .hand-card').length === 7, 'seven own cards'); }
    assert.equal(new Set(group.map(s => s.find('#discard-card').dataset.card)).size, 1);
    for (const s of group) assert.equal(s.all('#opponents .seat').length, 4);
    const firstGame = host.client.room.game;
    const firstClient = group[ids.indexOf(firstGame.players[firstGame.turn].id)];
    await until(() => !firstClient.find('#draw-button').disabled, 'random first player turn'); firstClient.click('#draw-button');
    await until(() => !firstClient.client.busy, 'first move sent');
    const nextGame = firstClient.client.room.game, nextClient = group[ids.indexOf(nextGame.players[nextGame.turn].id)];
    await nextClient.poll(); await until(() => !nextClient.find('#draw-button').disabled, 'clockwise next client takes turn');
    assert.equal(firstClient.find('#draw-button').disabled, true);
    const room = (await server.call(ids[0], { action: 'mine' })).room;
    const game = engine.createGame({ players: room.players.map(p => ({ id: p.id, name: p.name })), seed: 404 });
    const others = [['S-3'], ['H-8'], ['D-9'], ['C-10']];
    const first = engine.makeDeck().filter(id => !['S-4', ...others.flat()].includes(id)).slice(0, 19);
    const hands = [first, ...others], used = new Set(['S-4', ...hands.flat()]);
    game.players.forEach((p, i) => { p.hand = hands[i]; p.calledOne = false; });
    Object.assign(game, { deck: engine.makeDeck().filter(id => !used.has(id)), discard: ['S-4'], currentSuit: 'S', pendingDraw: 1, turn: 0, lastEvents: [] });
    await server.db.query("update ojjuda_onecard_internal.rooms set state=$2::jsonb,version=version+1,deadline=clock_timestamp()+interval '30 seconds' where id=$1", [room.id, JSON.stringify(game)]);
    await host.poll(); await until(() => host.find('#my-count').textContent === '19장' && !host.find('#draw-button').disabled, 'near-end snapshot');
    host.click('#draw-button'); await until(() => !host.client.busy, 'host eliminated'); await group[1].poll();
    await until(() => !group[1].find('#draw-button').disabled, 'last-card turn');
    group[1].click('#hand [data-card="S-3"]'); await until(() => !group[1].client.busy, 'last-card commit');
    for (const s of group) { await s.poll(); await until(() => s.find('#sheet').open && s.find('.game-result-metric')?.textContent.includes('승리'), 'all clients receive result'); }
    assert.equal(host.find('#onecard-result-title').textContent, '게임 종료');
    assert.equal(group[1].find('#onecard-result-title').textContent, '승리!');
    host.button('대기실로');
    assert.equal(host.all('#room-players .lobby-player:not(.is-bot)').length, 5, 'elimination preserves membership');
    assert.equal(host.find('#start-room').disabled, false, 'eliminated host can rematch');
    host.click('#start-room'); await until(() => !host.client.busy, 'rematch starts');
    for (const s of group) {
      await s.poll(); await until(() => !s.find('#sheet').open && s.find('#my-count').textContent === '7장', 'old result modal closes on new round');
      assert.equal(s.all('#hand .hand-card').length, 7);
    }
    const privateCards = host.all('#hand .hand-card');
    assert.equal(privateCards.length, 7, 'a private hand was rendered before sign-out');
    host.changeActor(null); await pause();
    assert.equal(host.find('#onecard-app').dataset.view, 'welcome', 'sign-out returns to the common entry');
    assert.equal(host.find('#onecard-app').hidden, true, 'sign-out cannot leave an active private game on screen');
    assert.equal(host.find('#hand').children.length, 0, 'sign-out removes private hand nodes instead of covering them');
    assert.ok(privateCards.every(node => !node.isConnected), 'the old private card nodes are detached');
  });

  await check('one online person can start with four computers and receives server-driven turns', async () => {
    // The previous five-screen room is still occupied; a sixth person owns this room.
    const s = await open({ server, actor: server.users[5], width: 360, height: 640 });
    await createPublicRoom(s, '혼자서도 다섯 명');
    assert.equal(s.all('#room-players .lobby-player').length, 5);
    assert.equal(s.all('#room-players .is-bot').length, 4);
    assert.equal(s.find('#start-room').disabled, false); s.click('#start-room');
    await until(() => s.client.room?.status === 'active' && s.all('#hand .hand-card').length === 7, 'five-seat mixed game');
    assert.equal(s.client.room.game.players.filter(player => player.bot).length, 4);
    assert.equal(s.all('#opponents .is-bot').length, 4);
    let current = s.client.room;
    if (current.game.players[current.game.turn].id === current.myId) {
      await until(() => !s.find('#draw-button').disabled, 'human first turn'); s.click('#draw-button');
      await until(() => !s.client.busy, 'human draw completes'); current = s.client.room;
    }
    assert.equal(current.game.players[current.game.turn].bot, true);
    assert.equal(s.find('#turn-timer').hidden, true, 'computer turns do not show a human timeout');
    const revision = current.game.revision;
    await server.db.query("update ojjuda_onecard_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1", [current.id]);
    await s.poll(); await until(() => s.client.room.game.revision > revision, 'server computer move appears');
    assert.equal(s.client.room.game.revision, revision + 1);
    assert.equal(s.client.room.game.direction, 1);
    assert.equal(s.all('#opponents .seat').length, 4);
  });
})().catch(error => { results.push({ name: 'startup', pass: false }); console.error(error); }).finally(async () => {
  for (const s of screens) { try { s.close(); } catch {} }
  if (server) await server.close();
  const failed = results.filter(result => !result.pass);
  console.log(`One Card DOM integration: ${results.length - failed.length} passed, ${failed.length} failed. Layout and real frame timing require the separate Playwright suite.`);
  if (failed.length) process.exitCode = 1;
});
