/* Actual browser UI + real rules/Edge/SQL fixture. No production test hooks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { fixture } = require('./onecard-online-fixture.cjs');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = path.join(__dirname, 'onecard-artifacts');
const STORAGE = 'ojjuda-onecard-solo-v1';
const results = [], browserErrors = [], contexts = [];
let browser, server, origin, engine, network;
fs.mkdirSync(ARTIFACTS, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.png': 'image/png' };

async function startServer() {
  server = http.createServer((request, response) => {
    let file;
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      file = path.resolve(ROOT, `.${pathname}`);
      if (!file.startsWith(ROOT + path.sep)) throw Error('outside root');
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.statSync(file).isFile()) throw Error('not a file');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
}

function setup(hands, options = {}) {
  hands = hands.map(hand => [...hand]);
  const occupied = new Set([...(options.discard || [options.top || 'S-4']), ...hands.flat()]);
  const spare = engine.makeDeck().filter(id => !occupied.has(id) && ['3', '4', '5', '6', '8', '9', '10'].includes(engine.cardInfo(id).rank));
  while (hands.length < 5) hands.push(spare.splice(0, 2));
  const participants = hands.map((_, index) => ({ id: index ? `bot-${index - 1}` : 'me', name: index ? `친구 ${index}` : '나', bot: index > 0 }));
  const state = engine.createGame({ players: participants, seed: 2811 });
  const discard = options.discard || [options.top || 'S-4'];
  const used = new Set([...discard, ...hands.flat()]);
  state.players.forEach((player, index) => { player.hand = [...hands[index]]; player.calledOne = false; });
  state.discard = discard;
  state.deck = engine.makeDeck().filter(id => !used.has(id));
  state.currentSuit = engine.cardInfo(discard.at(-1)).suit;
  state.lastEvents = [];
  Object.assign(state, options);
  return { state, opponents: hands.length - 1 };
}

function clientScript(userId) {
  return `window.OjjudaGetClient=async()=>({auth:{
    getSession:async()=>({data:{session:${userId ? `{access_token:'fixture',user:{id:${JSON.stringify(userId)},is_anonymous:false}}` : 'null'}}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
  },functions:{invoke:async(_name,{body})=>{
    const response=await fetch('/__onecard_test_edge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();return {data,error:data.ok?null:{context:{json:async()=>data}}};
  }}});`;
}

async function pageFor({ width = 750, height = 750, saved, animated = false, userId = null, query = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: animated ? 'no-preference' : 'reduce', hasTouch: width < 500, isMobile: width < 500 });
  contexts.push(context);
  // Keep the human first in ordinary layout fixtures; separate DOM and SQL
  // scenarios exercise random seat orders and bot-selected starting turns.
  await context.addInitScript(() => { Math.random = () => .999999; });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: clientScript(userId) });
    if (url.pathname === '/__onecard_test_edge') {
      const data = await network.call(userId, route.request().postDataJSON());
      return route.fulfill({ status: data.httpStatus, contentType: 'application/json', body: JSON.stringify(data) });
    }
    return route.continue();
  });
  if (saved) await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE, value: saved });
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push({ page: page.url(), message: error.message }));
  await page.goto(`${origin}/games/onecard/${query}`, { waitUntil: 'networkidle' });
  await page.locator('#solo-start').waitFor({ state: query ? 'attached' : 'visible' });
  return page;
}
async function snapshot(page, name) { await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true }); }
async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, STORAGE); }
async function resizePage(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, { width, height });
  // Viewport-unit styles and native modal placement need a rendering boundary
  // after device metrics change; retain the same strict geometry assertions.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function resume(page) {
  await page.locator('#resume-solo').click();
  await page.waitForFunction(() => document.querySelector('#onecard-app').dataset.view === 'playing' && !document.querySelector('#draw-button').disabled);
}
async function pressCard(page, id) {
  const node = page.locator(`#hand [data-card="${id}"]`);
  await node.focus();
  await node.press('Enter');
}
async function stableBoard(page) {
  await page.waitForFunction(() => document.querySelector('#onecard-app').dataset.view === 'playing' && document.querySelectorAll('.flying-card').length === 0);
}
async function createPublicRoom(page, title = '친구와 원카드') {
  await page.locator('#online-open').click();
  await page.locator('[data-arcade-action="create"]').click();
  const form = page.locator('#arcade-room-form'); await form.waitFor({ state: 'visible' });
  assert.equal(await form.locator('[name="kind"]').inputValue(), 'onecard');
  assert.equal(await form.locator('[name="capacity"]').inputValue(), '5');
  assert.equal(await form.locator('[data-create-capacity]').isVisible(), false, 'the shared form keeps the table fixed at five');
  await form.locator('[name="title"]').fill(title);
  await form.getByRole('button', { name: '방 만들고 기다리기', exact: true }).click();
  await page.locator('#lobby').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#sheet').open);
  assert.equal(await page.locator('#room-title').textContent(), title);
  assert.equal(await page.locator('#onecard-app').isVisible(), false);
  const number = (await page.locator('#room-code-display').textContent()).trim();
  assert.match(number, /^#[1-9]\d+$/); return Number(number.slice(1));
}
async function joinPublicRoom(page, number) {
  await page.locator('#online-open').click();
  await page.locator(`[data-arcade-action="join"][data-room="${number}"]`).click();
  await page.locator('#lobby').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#room-code-display').textContent(), `#${number}`);
}
async function oneScreen(page, label, playing = false) {
  const report = await page.evaluate(({ playing }) => {
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const ids = playing ? ['onecard-app', 'game-table', 'hand-area', 'game-controls', 'draw-button', 'onecard-button', 'status'] : ['setup', 'entry', 'entry-title', 'solo-mode', 'solo-start', 'online-open', 'entry-rules'];
    return { viewport: { width: innerWidth, height: innerHeight }, document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }, boxes: Object.fromEntries(ids.map(id => [id, rect(document.getElementById(id))])), hand: [...document.querySelectorAll('#hand .hand-card')].map(rect) };
  }, { playing });
  assert.ok(report.document.width <= report.viewport.width + 1, `${label}: document must not scroll sideways`);
  assert.ok(report.document.height <= report.viewport.height + 1, `${label}: document must fit one screen`);
  for (const [id, box] of Object.entries(report.boxes)) {
    assert.ok(box.width > 0 && box.height > 0, `${label}: ${id} is visible`);
    assert.ok(box.left >= -1 && box.right <= report.viewport.width + 1 && box.top >= -1 && box.bottom <= report.viewport.height + 1, `${label}: ${id} fits viewport: ${JSON.stringify(box)}`);
  }
  if (playing) {
    for (const box of report.hand) assert.ok(box.left >= -4 && box.right <= report.viewport.width + 4, `${label}: hand card stays in the screen`);
    assert.ok(report.boxes.status.bottom <= report.boxes['game-controls'].bottom, `${label}: instructions do not spill below controls`);
  }
  return report;
}
async function visibleResultActions(page, label) {
  const layout = await page.evaluate(() => {
    const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const dialog = document.querySelector('#sheet');
    return { width: innerWidth, height: innerHeight, dialog: box(dialog), scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight,
      title: box(document.querySelector('#onecard-result-title')),
      actions: [...document.querySelectorAll('.game-result-actions button')].map(node => ({ ...box(node), text: node.textContent, enabled: !node.disabled })) };
  });
  assert.equal(layout.actions.length, 3);
  assert.ok(layout.scrollHeight <= layout.clientHeight + 1, `${label}: result fits without internal scrolling`);
  for (const box of [layout.dialog, layout.title, ...layout.actions]) {
    assert.ok(box.width > 0 && box.height > 0 && box.left >= -1 && box.top >= -1 && box.right <= layout.width + 1 && box.bottom <= layout.height + 1, `${label}: result control fits viewport: ${JSON.stringify(box)}`);
  }
  for (const action of layout.actions) assert.equal(action.enabled, true, `${label}: ${action.text} remains available`);
  return layout;
}
async function visibleLobby(page, label) {
  const lobby = await page.evaluate(() => {
    const selectors = ['#setup', '#lobby', '#lobby-title', '#room-title', '#room-code-display', '#copy-invite', '#start-room', '#lobby-back'];
    const nodes = [...selectors.map(selector => document.querySelector(selector)), ...document.querySelectorAll('#room-players .lobby-player')];
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      boxes: nodes.map(node => { const r = node.getBoundingClientRect(); return { text: node.textContent, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }) };
  });
  assert.ok(lobby.scrollWidth <= lobby.width + 1 && lobby.scrollHeight <= lobby.height + 1, `${label}: online lobby fits one screen`);
  for (const box of lobby.boxes) assert.ok(box.width > 0 && box.height > 0 && box.left >= -1 && box.top >= -1 && box.right <= lobby.width + 1 && box.bottom <= lobby.height + 1, `${label}: online lobby control fits: ${JSON.stringify(box)}`);
  return lobby;
}
async function centralLayout(page, label) {
  const layout = await page.evaluate(() => {
    const selectors = { stock: '#stock-card > .playing-card', discard: '#discard-card > .playing-card', stockLabel: '#draw-pile .pile-label', discardLabel: '.discard .pile-label', suit: '#suit-indicator', direction: '#direction' };
    return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
      const node = document.querySelector(selector), r = node.getBoundingClientRect(), style = getComputedStyle(node);
      return [key, { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, visible: style.display !== 'none' && r.width > 0 && r.height > 0 }];
    }));
  });
  for (const key of ['stock', 'discard', 'suit', 'direction']) assert.equal(layout[key].visible, true, `${label}: ${key} remains visible`);
  if (page.viewportSize().height > 430) for (const key of ['stockLabel', 'discardLabel']) assert.equal(layout[key].visible, true, `${label}: ${key} remains visible`);
  const boxes = Object.entries(layout).filter(([, box]) => box.visible);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [aName, a] = boxes[i], [bName, b] = boxes[j];
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left), overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    assert.ok(overlapX <= 1 || overlapY <= 1, `${label}: ${aName} must not overlap ${bName}: ${JSON.stringify({ a, b })}`);
  }
  return layout;
}
async function scenario(name, fn) {
  const start = Date.now();
  try { const details = await fn(); results.push({ name, status: 'passed', durationMs: Date.now() - start, details }); console.log(`PASS ${name}`); }
  catch (error) {
    results.push({ name, status: 'failed', durationMs: Date.now() - start, error: error.stack });
    console.error(`FAIL ${name}\n${error.stack}`);
    let index = 0;
    for (const context of contexts) for (const page of context.pages()) {
      if (!page.isClosed()) await snapshot(page, `failure-${results.length}-${index++}`).catch(() => {});
    }
  }
}

(async () => {
  engine = await import('../games/onecard/engine.mjs');
  await startServer();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  await scenario('750px five-seat deal shares one overlapping browser timeline', async () => {
    const page = await pageFor({ animated: true });
    await oneScreen(page, 'desktop welcome'); await snapshot(page, 'desktop-welcome');
    assert.equal(await page.locator('#onecard-app').isVisible(), false, 'common entry opens before the game table');
    assert.equal(await page.locator('#solo-mode').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#opponent-count').count(), 0, 'all games use five seats without a capacity selector');
    await page.locator('#solo-start').click();
    await page.waitForFunction(() => document.querySelectorAll('.flying-card').length >= 30);
    const timeline = await page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.classList.contains('flying-card')).map(a => ({ start: a.startTime, delay: a.effect.getTiming().delay, duration: a.effect.getTiming().duration })));
    assert.equal(timeline.length, 36, '35 dealt cards and an opening card animate');
    assert.ok(Math.max(...timeline.map(a => a.start)) - Math.min(...timeline.map(a => a.start)) < 1, 'all cards share a single timeline origin');
    const ordered = timeline.sort((a, b) => a.delay - b.delay);
    assert.ok(ordered.slice(1).every((item, i) => item.delay - ordered[i].delay < ordered[i].duration), 'card flights overlap instead of waiting for one another');
    assert.equal(await page.locator('#draw-button').isDisabled(), true);
    assert.equal(await page.locator('#onecard-button').isDisabled(), true);
    assert.equal(await page.locator('#hand .hand-card:not(:disabled)').count(), 0, 'no keyboard card actions during dealing');
    const frames = await page.evaluate(async () => {
      const samples = []; let last = performance.now();
      while (document.querySelector('.flying-card')) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const now = performance.now(); samples.push(now - last); last = now;
      }
      return { frames: samples.length, maximumGapMs: Math.max(...samples), medianGapMs: samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)] };
    });
    assert.ok(frames.frames > 12, 'the browser continues painting during the deal');
    await page.waitForFunction(() => !document.querySelector('#draw-button').disabled);
    assert.equal(await page.locator('#opponents .seat').count(), 4);
    assert.equal(await page.locator('#hand .hand-card').count(), 7);
    assert.equal((await stored(page)).players.length, 5);
    assert.equal((await stored(page)).players.filter(player => player.bot).length, 4);
    assert.equal((await stored(page)).revision, 0, 'blocked controls did not advance the game');
    await oneScreen(page, 'desktop five seats', true); await snapshot(page, 'desktop-five-seats');
    await page.context().close();
    return { flights: timeline.length, ...frames };
  });

  for (const [width, height] of [[390, 844], [360, 640]]) await scenario(`${width}x${height} welcome and five-seat table fit one screen`, async () => {
    const page = await pageFor({ width, height });
    await oneScreen(page, `${width}px welcome`); await snapshot(page, `mobile-${width}-welcome`);
    await page.locator('#solo-start').click(); await stableBoard(page);
    await page.waitForFunction(() => !document.querySelector('#draw-button').disabled);
    const layout = await oneScreen(page, `${width}px five seats`, true);
    await snapshot(page, `mobile-${width}-five-seats`);
    await page.context().close(); return layout;
  });

  for (const [width, height] of [[680, 469], [844, 390]]) await scenario(`${width}x${height} landscape has no central card, label or suit overlap`, async () => {
    const page = await pageFor({ width, height, saved: setup([['S-3', 'H-8'], ['D-6', 'C-9']]) });
    await oneScreen(page, `${width}x${height} landscape welcome`);
    await snapshot(page, `landscape-${width}x${height}-welcome`);
    await resume(page);
    const screen = await oneScreen(page, `${width}x${height} landscape table`, true);
    const center = await centralLayout(page, `${width}x${height} center`);
    await snapshot(page, `landscape-${width}x${height}`);
    await page.context().close(); return { screen, center };
  });

  await scenario('declare, valid keyboard play and bot progress work from a saved game', async () => {
    const page = await pageFor({ saved: setup([['S-3', 'H-8'], ['S-9', 'D-6']]) });
    await resume(page);
    await page.locator('#onecard-button').click();
    assert.equal(await page.locator('#onecard-button').getAttribute('aria-pressed'), 'true');
    await pressCard(page, 'S-3');
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).state.revision >= 1, STORAGE);
    assert.equal((await stored(page)).players[0].calledOne, true);
    assert.equal(await page.locator('#hand .hand-card:not(:disabled)').count(), 0, 'opponent turn disables hand keyboard activation');
    await page.waitForFunction(key => {
      const state = JSON.parse(localStorage.getItem(key)).state;
      return state.revision >= 5 && state.turn === 0 && !document.querySelector('#draw-button').disabled;
    }, STORAGE);
    const after = await stored(page);
    assert.equal(after.players[0].hand.length, 1, 'declared card avoids missed-call penalty');
    assert.equal(after.turn, 0, 'four computers finish their clockwise turns');
    await page.waitForFunction(() => !document.querySelector('#draw-button').disabled);
    await page.locator('#draw-button').click();
    assert.equal((await stored(page)).players[0].hand.length, 2);
    await page.context().close();
  });

  await scenario('suit chooser cancels cleanly and applies the chosen suit', async () => {
    const page = await pageFor({ saved: setup([['D-9', 'S-7'], ['H-3', 'H-6']]) });
    await resume(page); await pressCard(page, 'S-7');
    await page.locator('#sheet[open]').waitFor();
    assert.equal(await page.locator('.suit-choice').count(), 4);
    assert.equal(await page.locator('#draw-button').isDisabled(), true);
    assert.equal(await page.locator('#hand .hand-card:not(:disabled)').count(), 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.equal((await stored(page)).revision, 0, 'cancel does not consume a card');
    await pressCard(page, 'S-7'); await page.locator('.suit-H').click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).state.revision >= 1, STORAGE);
    assert.equal((await stored(page)).currentSuit, 'H');
    assert.equal((await stored(page)).players[0].hand.includes('S-7'), false);
    await page.context().close();
  });

  await scenario('two-card round finishes, result is visible, restart and resume work', async () => {
    const page = await pageFor({ saved: setup([['S-K', 'S-3'], ['C-9', 'D-8']]) });
    await resume(page); await page.locator('#onecard-button').click(); await pressCard(page, 'S-K');
    await page.waitForFunction(() => !document.querySelector('#draw-button').disabled);
    assert.equal((await stored(page)).turn, 0, 'K grants another turn at the five-seat table');
    await pressCard(page, 'S-3'); await page.locator('#sheet[open]').waitFor();
    assert.match(await page.locator('#sheet-title').textContent(), /승리/);
    assert.equal((await stored(page)).winnerId, 'me');
    assert.equal(await page.locator('#draw-button').isDisabled(), true);
    assert.equal(await page.locator('#sheet.game-result-dialog .game-result-card').count(), 1);
    assert.equal(await page.locator('.result-players > div').count(), 5);
    assert.equal(await page.locator('.game-result-actions button').count(), 3);
    await visibleResultActions(page, 'desktop result');
    await snapshot(page, 'solo-victory');
    for (const [width, height] of [[360, 640], [844, 390]]) {
      await resizePage(page, width, height);
      await visibleResultActions(page, `${width}x${height} result`);
      await snapshot(page, `solo-victory-${width}x${height}`);
    }
    await resizePage(page, 750, 750);
    await page.getByRole('button', { name: '다시 한 판', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#draw-button').disabled);
    assert.equal((await stored(page)).players[0].hand.length, 7);
    await page.locator('#menu-button').click(); await page.getByRole('button', { name: '새 게임', exact: true }).click();
    await page.getByRole('button', { name: '나가기', exact: true }).click();
    await page.locator('#entry').waitFor({ state: 'visible' });
    await resume(page); assert.equal((await stored(page)).players[0].hand.length, 7);
    await page.context().close();
  });

  await scenario('mobile pagination reaches every card and locks while drawing', async () => {
    const mine = engine.makeDeck().filter(id => !['S-4', 'H-8', 'D-9'].includes(id)).slice(0, 18);
    const saved = setup([mine, ['H-8', 'D-9']]);
    const longName = '오쭈다원카드를함께즐기는친구'.repeat(3).slice(0, 32);
    saved.state.players[0].name = longName;
    const page = await pageFor({ width: 360, height: 640, animated: true, saved });
    await resume(page); assert.equal(await page.locator('#hand .hand-card').count(), 8);
    const shown = new Set(await page.locator('#hand .hand-card').evaluateAll(nodes => nodes.map(node => node.dataset.card)));
    await page.locator('#next-cards').click();
    for (const id of await page.locator('#hand .hand-card').evaluateAll(nodes => nodes.map(node => node.dataset.card))) shown.add(id);
    await page.locator('#next-cards').click();
    for (const id of await page.locator('#hand .hand-card').evaluateAll(nodes => nodes.map(node => node.dataset.card))) shown.add(id);
    assert.equal(shown.size, 18, 'all held cards are reachable without scrolling the page');
    assert.equal(await page.locator('#next-cards').isDisabled(), true);
    await page.locator('#previous-cards').click();
    const headerLayout = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, centerY: r.top + r.height / 2 }; };
      const name = document.querySelector('#my-name'), style = getComputedStyle(name), turn = document.querySelector('#turn-label');
      return { row: box('.hand-meta'), nameGroup: box('.my-name'), name: box('#my-name'), turn: box('#turn-label'), pager: box('#hand-pager'), previous: box('#previous-cards'), next: box('#next-cards'),
        nameText: name.textContent, nameWidth: name.clientWidth, nameScrollWidth: name.scrollWidth,
        nameOverflow: style.textOverflow, nameWhiteSpace: style.whiteSpace, turnWidth: turn.clientWidth, turnScrollWidth: turn.scrollWidth };
    });
    assert.equal(headerLayout.nameText, longName, 'the full 32-character nickname remains in the DOM');
    assert.equal(headerLayout.nameOverflow, 'ellipsis');
    assert.equal(headerLayout.nameWhiteSpace, 'nowrap');
    assert.ok(headerLayout.nameScrollWidth > headerLayout.nameWidth, 'a long nickname is visually shortened');
    for (const key of ['nameGroup', 'name', 'turn', 'pager', 'previous', 'next']) {
      const box = headerLayout[key];
      assert.ok(box.width > 0 && box.left >= headerLayout.row.left - 1 && box.right <= headerLayout.row.right + 1, `${key} stays inside the hand header`);
      assert.ok(Math.abs(box.centerY - headerLayout.row.centerY) <= 1, `${key} stays on the same line`);
    }
    assert.ok(headerLayout.nameGroup.right <= headerLayout.turn.left + 1, 'nickname does not overlap the turn label');
    assert.ok(headerLayout.turn.right <= headerLayout.pager.left + 1, 'turn label does not overlap the page buttons');
    assert.ok(headerLayout.turnScrollWidth <= headerLayout.turnWidth + 1, 'my-turn text remains fully readable');
    await oneScreen(page, '18-card pagination', true); await snapshot(page, 'mobile-many-cards');
    await page.locator('#draw-button').click();
    await page.waitForFunction(() => document.querySelectorAll('.flying-card').length > 0);
    assert.equal(await page.locator('#previous-cards').isDisabled(), true, 'cannot invalidate an in-flight target');
    assert.equal(await page.locator('#next-cards').isDisabled(), true, 'both pager directions lock during motion');
    await stableBoard(page);
    assert.equal((await stored(page)).players[0].hand.length, 19);
    await page.context().close();
    return { nicknameLength: longName.length, headerLayout };
  });

  await scenario('multiplayer login failure stays usable and explains how to continue', async () => {
    const page = await pageFor({ width: 390, height: 844 });
    await page.locator('#online-open').click();
    await page.locator('#login-link').waitFor({ state: 'visible' });
    assert.match(await page.locator('#online-account-note').textContent(), /로그인/);
    assert.equal(await page.locator('[data-entry-panel="opponent"]').isVisible(), true);
    await page.locator('#solo-mode').click();
    assert.equal(await page.locator('[data-entry-panel="computer"]').isVisible(), true);
    assert.equal(await page.locator('[data-entry-panel="opponent"]').isVisible(), false);
    await page.locator('#solo-start').click(); await stableBoard(page);
    assert.equal(await page.locator('#hand .hand-card').count(), 7, 'solo remains available after auth failure');
    await page.context().close();
  });

  await scenario('five real browser clients share turns, finish and rematch after host elimination', async () => {
    network = await fixture();
    const ids = network.users.slice(0, 5), pages = [];
    for (const [i, userId] of ids.entries()) pages.push(await pageFor({ width: i ? 390 : 750, height: i ? 844 : 750, userId }));
    const host = pages[0], number = await createPublicRoom(host);
    for (const page of pages.slice(1)) await joinPublicRoom(page, number);
    await host.waitForFunction(() => document.querySelectorAll('#room-players .lobby-player:not(.is-bot)').length === 5);
    await snapshot(host, 'online-five-player-lobby');
    await host.locator('#start-room').click();
    for (const page of pages) { await stableBoard(page); await page.waitForFunction(() => document.querySelectorAll('#hand .hand-card').length === 7); }
    const top = await host.locator('#discard-card').getAttribute('data-card');
    for (const page of pages) {
      assert.equal(await page.locator('#opponents .seat').count(), 4);
      assert.equal(await page.locator('#discard-card').getAttribute('data-card'), top);
    }
    const startRoom = (await network.call(ids[0], { action: 'mine' })).room;
    const firstPage = pages[ids.indexOf(startRoom.game.players[startRoom.game.turn].id)];
    await firstPage.waitForFunction(() => !document.querySelector('#draw-button').disabled);
    await firstPage.locator('#draw-button').click();
    await firstPage.waitForFunction(() => document.querySelector('#my-count').textContent === '8장');
    const nextRoom = (await network.call(ids[0], { action: 'mine' })).room;
    const next = pages[ids.indexOf(nextRoom.game.players[nextRoom.game.turn].id)];
    await next.waitForFunction(() => !document.querySelector('#draw-button').disabled);
    assert.equal(await firstPage.locator('#draw-button').isDisabled(), true);
    await snapshot(next, 'online-mobile-turn');

    // Construct a complete, card-conserving near-end game in the isolated SQL fixture.
    // This tests UI rematch/membership, while the independent engine suite tests rules.
    const room = (await network.call(ids[0], { action: 'mine' })).room;
    const game = engine.createGame({ players: room.players.map(p => ({ id: p.id, name: p.name })), seed: 404 });
    const others = [['S-3'], ['H-8'], ['D-9'], ['C-10']];
    const first = engine.makeDeck().filter(id => !['S-4', ...others.flat()].includes(id)).slice(0, 19);
    const hands = [first, ...others], used = new Set(['S-4', ...hands.flat()]);
    game.players.forEach((p, i) => { p.hand = hands[i]; p.calledOne = false; });
    Object.assign(game, { deck: engine.makeDeck().filter(id => !used.has(id)), discard: ['S-4'], currentSuit: 'S', pendingDraw: 1, turn: 0, lastEvents: [] });
    await network.db.query("update ojjuda_onecard_internal.rooms set state=$2::jsonb,version=version+1,deadline=clock_timestamp()+interval '30 seconds' where id=$1", [room.id, JSON.stringify(game)]);
    await host.waitForFunction(() => document.querySelector('#my-count').textContent === '19장' && !document.querySelector('#draw-button').disabled);
    await host.locator('#draw-button').click();
    await pages[1].waitForFunction(() => !document.querySelector('#draw-button').disabled && document.querySelector('#my-count').textContent === '1장');
    await pressCard(pages[1], 'S-3');
    for (const page of pages) await page.waitForFunction(() => document.querySelector('#sheet').open && document.querySelector('.game-result-metric')?.textContent.includes('승리'));
    assert.equal(await host.locator('#onecard-result-title').textContent(), '게임 종료');
    assert.equal(await pages[1].locator('#onecard-result-title').textContent(), '승리!');
    await host.getByRole('button', { name: '대기실로', exact: true }).click();
    assert.equal(await host.locator('#room-players .lobby-player:not(.is-bot)').count(), 5, 'elimination does not remove room membership');
    assert.equal(await host.locator('#start-room').isDisabled(), false, 'eliminated host can start the next round');
    await host.locator('#start-room').click();
    for (const page of pages) {
      await page.waitForFunction(() => document.querySelector('#onecard-app').dataset.view === 'playing' && !document.querySelector('#sheet').open && document.querySelector('#my-count').textContent === '7장');
      assert.equal(await page.locator('#hand .hand-card').count(), 7);
    }
    await snapshot(host, 'online-rematch');
    for (const page of pages) await page.context().close();
    await network.close(); network = null;
  });

  await scenario('360x640 and 680x469 one-person online lobby fits and four server computers take turns', async () => {
    network = await fixture(); const userId = network.users[0];
    const page = await pageFor({ width: 360, height: 640, userId });
    await createPublicRoom(page, '혼자서도 다섯 명');
    assert.equal(await page.locator('#room-players .lobby-player').count(), 5);
    assert.equal(await page.locator('#room-players .is-bot').count(), 4);
    assert.equal(await page.locator('#start-room').isDisabled(), false);
    const lobby = await visibleLobby(page, '360x640');
    await snapshot(page, 'online-one-human-four-computers-lobby');
    await resizePage(page, 680, 469);
    const landscapeLobby = await visibleLobby(page, '680x469');
    assert.equal(await page.locator('#room-players .lobby-player').count(), 5);
    assert.equal(await page.locator('#room-players .is-bot').count(), 4);
    assert.equal(await page.locator('#start-room').isDisabled(), false);
    await snapshot(page, 'online-one-human-four-computers-lobby-680x469');
    await resizePage(page, 360, 640);
    await page.locator('#start-room').click(); await stableBoard(page);
    await page.waitForFunction(() => document.querySelectorAll('#hand .hand-card').length === 7);
    let room = (await network.call(userId, { action: 'mine' })).room;
    assert.equal(room.game.players.length, 5); assert.equal(room.game.players.filter(player => player.bot).length, 4);
    if (room.game.players[room.game.turn].id === userId) {
      await page.waitForFunction(() => !document.querySelector('#draw-button').disabled);
      await page.locator('#draw-button').click(); await page.waitForFunction(() => document.querySelector('#my-count').textContent === '8장');
      room = (await network.call(userId, { action: 'mine' })).room;
    }
    const bot = room.game.players[room.game.turn]; assert.equal(bot.bot, true);
    const count = await page.locator(`#opponents [data-player="${bot.id}"] .seat-count`).textContent();
    await network.db.query("update ojjuda_onecard_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1", [room.id]);
    await page.waitForFunction(({ id, count }) => document.querySelector(`#opponents [data-player="${id}"] .seat-count`).textContent !== count, { id: bot.id, count });
    const advanced = (await network.db.query('select state,version from ojjuda_onecard_internal.rooms where id=$1', [room.id])).rows[0];
    assert.ok(advanced.version > room.version, 'normal polling advances a server computer without human action');
    assert.equal(advanced.state.direction, 1);
    assert.equal(await page.locator('#opponents .seat.is-bot').count(), 4);
    await oneScreen(page, 'one human and four computers', true);
    await snapshot(page, 'online-one-human-four-computers-game');
    await page.context().close(); await network.close(); network = null;
    return { lobby, landscapeLobby };
  });

  await scenario('no uncaught browser errors', async () => assert.deepEqual(browserErrors, []));
})().catch(error => {
  results.push({ name: 'suite startup', status: 'failed', error: error.stack });
  console.error(error);
}).finally(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  if (network) await network.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(ARTIFACTS, 'results.json'), JSON.stringify({ results, browserErrors }, null, 2));
  const failed = results.filter(result => result.status === 'failed');
  console.log(`One Card UI: ${results.length - failed.length} passed, ${failed.length} failed. Artifacts: ${ARTIFACTS}`);
  if (failed.length) process.exitCode = 1;
});
