/* Actual browser UI + real rules/Edge/SQL fixture. No production test hooks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { fixture } = require('./onecard-online-fixture.cjs');
const handCases = require('./onecard-hand-cases.cjs');

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
async function handLayout(page) {
  return page.evaluate(() => {
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const scroller = document.querySelector('#hand-scroll');
    return { viewport: rect(scroller), left: scroller.scrollLeft, maximum: scroller.scrollWidth - scroller.clientWidth,
      pageX: scrollX, pageY: scrollY, cards: [...document.querySelectorAll('#hand .hand-card')].map(node => ({ ...rect(node), id: node.dataset.card, disabled: node.disabled })) };
  });
}
async function settleHandScroll(page) {
  await page.evaluate(() => new Promise(resolve => {
    const scroller = document.querySelector('#hand-scroll'), start = performance.now(); let last = scroller.scrollLeft, stable = 0;
    function frame() {
      const now = scroller.scrollLeft; stable = Math.abs(now - last) < .2 ? stable + 1 : 0; last = now;
      if (stable >= 4 || performance.now() - start > 1200) resolve(); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
}
async function touchHand(page, direction) {
  const session = await page.context().newCDPSession(page), { viewport } = await handLayout(page);
  const from = direction > 0 ? viewport.right - 30 : viewport.left + 30, to = direction > 0 ? viewport.left + 30 : viewport.right - 30;
  const y = viewport.top + Math.min(viewport.height / 2, 55), point = x => ({ x, y, id: 7, radiusX: 3, radiusY: 3, force: 1 });
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from)] });
    for (let step = 1; step <= 10; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(from + (to - from) * step / 10)] });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
  await settleHandScroll(page);
}
async function dragHand(page, { disabled = false, small = false } = {}) {
  const layout = await handLayout(page), box = layout.viewport;
  const candidates = layout.cards.filter(card => card.disabled === disabled && card.left >= box.left + 10 && card.left + 24 < box.right - 10);
  const card = candidates.at(-1); assert.ok(card, `a visible ${disabled ? 'disabled' : 'playable'} card can begin the drag`);
  const fromX = card.left + 12, toX = small ? fromX - 22 : box.left + 12, y = Math.max(box.top + 12, card.top + 28);
  assert.ok(Math.abs(fromX - toX) > 8, 'the gesture crosses the drag threshold');
  await page.mouse.move(fromX, y); await page.mouse.down(); await page.mouse.move(toX, y, { steps: 12 }); await page.mouse.up();
  await settleHandScroll(page); return card.id;
}
function handEndpoint(layout, end, label) {
  assert.ok(Math.abs(layout.left - (end ? layout.maximum : 0)) <= 2, `${label}: internal scroll reaches its ${end ? 'end' : 'start'}`);
  assert.equal(layout.pageX, 0, `${label}: the page never shifts sideways`); assert.equal(layout.pageY, 0, `${label}: the page never shifts vertically`);
  const card = end ? layout.cards.at(-1) : layout.cards[0];
  assert.ok(card.left >= layout.viewport.left - 2 && card.right <= layout.viewport.right + 2, `${label}: endpoint card is fully inside the hand viewport`);
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
    const ids = playing ? ['onecard-app', 'game-table', 'hand-area', 'hand-scroll', 'hand-sort', 'sort-number', 'sort-color', 'game-controls', 'draw-button', 'onecard-button', 'status'] : ['setup', 'entry', 'entry-title', 'solo-mode', 'solo-start', 'online-open', 'entry-rules'];
    const scroller = document.querySelector('#hand-scroll'), style = scroller && getComputedStyle(scroller);
    return { viewport: { width: innerWidth, height: innerHeight }, document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, x: scrollX, y: scrollY }, boxes: Object.fromEntries(ids.map(id => [id, rect(document.getElementById(id))])), hand: [...document.querySelectorAll('#hand .hand-card')].map(rect), overflow: style && { x: style.overflowX, y: style.overflowY, overscroll: style.overscrollBehaviorX } };
  }, { playing });
  assert.ok(report.document.width <= report.viewport.width + 1, `${label}: document must not scroll sideways`);
  assert.ok(report.document.height <= report.viewport.height + 1, `${label}: document must fit one screen`);
  assert.equal(report.document.x, 0, `${label}: horizontal page offset remains zero`);
  assert.equal(report.document.y, 0, `${label}: vertical page offset remains zero`);
  for (const [id, box] of Object.entries(report.boxes)) {
    assert.ok(box.width > 0 && box.height > 0, `${label}: ${id} is visible`);
    assert.ok(box.left >= -1 && box.right <= report.viewport.width + 1 && box.top >= -1 && box.bottom <= report.viewport.height + 1, `${label}: ${id} fits viewport: ${JSON.stringify(box)}`);
  }
  if (playing) {
    const rail = report.boxes['hand-scroll'];
    assert.ok(['auto', 'scroll'].includes(report.overflow.x), `${label}: the hand owns horizontal scrolling`);
    assert.ok(['hidden', 'clip'].includes(report.overflow.y), `${label}: the hand cannot scroll vertically`);
    assert.ok(['contain', 'none'].includes(report.overflow.overscroll), `${label}: hand boundary gestures do not scroll the page`);
    // Offscreen cards intentionally stay in the DOM. Their clipping viewport
    // retains the original strict page bounds, and full card height still fits.
    for (const box of report.hand) {
      assert.ok(box.top >= rail.top - 4 && box.bottom <= rail.bottom + 4, `${label}: each complete card fits the hand's vertical bounds`);
      if (box.right > rail.left && box.left < rail.right) assert.ok(Math.max(box.left, rail.left) >= -1 && Math.min(box.right, rail.right) <= report.viewport.width + 1, `${label}: the visible part of every card stays in the screen`);
    }
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
    const rendered = await page.locator('#hand .hand-card').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.card, color: node.dataset.color, kind: node.dataset.kind, label: node.getAttribute('aria-label'), value: node.querySelector('.card-center .card-value, .card-center .card-action-label')?.textContent })));
    for (const card of rendered) {
      const info = engine.cardInfo(card.id);
      assert.equal(card.color, info.color); assert.equal(card.kind, info.displayKind); assert.equal(card.value, info.displayValue);
      assert.ok(card.label.startsWith(info.label), 'visible dedicated cards retain their color/action accessible name');
    }
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

  await scenario('color chooser cancels cleanly and applies the chosen color', async () => {
    const page = await pageFor({ saved: setup([['D-9', 'S-7'], ['H-3', 'H-6']]) });
    await resume(page); await pressCard(page, 'S-7');
    await page.locator('#sheet[open]').waitFor();
    assert.equal(await page.locator('#sheet-title').textContent(), '색을 골라 주세요');
    assert.equal(await page.locator('.suit-choice').count(), 4);
    assert.deepEqual(await page.locator('.suit-choice').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['파랑', '빨강', '노랑', '초록']);
    assert.equal(await page.locator('#draw-button').isDisabled(), true);
    assert.equal(await page.locator('#hand .hand-card:not(:disabled)').count(), 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.equal((await stored(page)).revision, 0, 'cancel does not consume a card');
    await pressCard(page, 'S-7'); await page.getByRole('button', { name: '빨강', exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).state.revision >= 1, STORAGE);
    assert.equal((await stored(page)).currentSuit, 'H');
    assert.equal(await page.locator('#suit-indicator').textContent(), '◆ 빨강');
    assert.equal((await stored(page)).players[0].hand.includes('S-7'), false);
    await page.context().close();
  });

  await scenario('reverse cards visibly change direction and pass the turn with two survivors', async () => {
    const saved = setup([['S-Q', 'D-5'], ['H-Q', 'S-6']]);
    for (const player of saved.state.players.slice(2)) {
      saved.state.deck.push(...player.hand); player.hand = []; player.active = false;
    }
    const page = await pageFor({ width: 390, height: 844, saved, animated: true });
    await resume(page);
    assert.match(await page.locator('#hand [data-card="S-Q"]').getAttribute('aria-label'), /방향 바꾸기/);
    assert.equal(await page.locator('#hand [data-card="S-Q"] .card-center > svg.card-action-icon').count(), 1);
    await page.locator('#onecard-button').click(); await pressCard(page, 'S-Q');
    await page.waitForFunction(key => {
      const state = JSON.parse(localStorage.getItem(key)).state;
      return state.revision === 1 && state.direction === -1 && state.turn === 1;
    }, STORAGE);
    await stableBoard(page);
    assert.match(await page.locator('#direction').textContent(), /반시계/);
    assert.equal(await page.locator('#draw-button').isDisabled(), true);
    await oneScreen(page, 'reverse direction with two survivors', true);
    await snapshot(page, 'reverse-two-survivors'); await page.context().close();
  });

  await scenario('matching reverse copies remain independently selectable and both finish in the discard pile', async () => {
    const saved = setup([['S-Q', 'S-Q-2'], ['H-Q', 'D-5']]);
    for (const player of saved.state.players.slice(2)) {
      saved.state.deck.push(...player.hand); player.hand = []; player.active = false;
    }
    const page = await pageFor({ width: 390, height: 844, saved, animated: true });
    await resume(page);
    const first = page.locator('#hand [data-card="S-Q"]'), second = page.locator('#hand [data-card="S-Q-2"]');
    assert.equal(await first.count(), 1); assert.equal(await second.count(), 1);
    assert.equal(await first.getAttribute('aria-label'), await second.getAttribute('aria-label'));
    await page.locator('#sort-color').click();
    assert.equal(await first.isEnabled(), true); assert.equal(await second.isEnabled(), true);
    await oneScreen(page, 'matching reverse cards', true);
    await snapshot(page, 'two-matching-reverse-cards');
    await page.locator('#onecard-button').click(); await second.click();
    await page.waitForFunction(key => {
      const state = JSON.parse(localStorage.getItem(key)).state;
      return state.revision === 1 && state.direction === -1;
    }, STORAGE);
    assert.deepEqual((await stored(page)).players[0].hand, ['S-Q']);
    assert.equal(await second.count(), 0); assert.equal(await first.count(), 1);
    await page.waitForFunction(key => {
      const state = JSON.parse(localStorage.getItem(key)).state;
      return state.revision === 2 && state.direction === 1 && !document.querySelector('#draw-button').disabled;
    }, STORAGE);
    await page.locator('#sort-number').click(); await pressCard(page, 'S-Q');
    await page.locator('#sheet[open]').waitFor();
    const finished = await stored(page);
    assert.equal(finished.winnerId, 'me'); assert.equal(finished.direction, -1);
    assert.deepEqual(finished.discard.slice(-3), ['S-Q-2', 'H-Q', 'S-Q']);
    assert.equal(await page.locator('#hand .hand-card').count(), 0);
    await visibleResultActions(page, 'matching reverse copies result');
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

  await scenario('mobile native swipes reach every held card, contain page scrolling and lock during draw motion', async () => {
    const mine = engine.makeDeck().filter(id => !['S-4', 'H-8', 'D-9'].includes(id)).slice(0, 18);
    const saved = setup([mine, ['H-8', 'D-9']]);
    const longName = '오쭈다원카드를함께즐기는친구'.repeat(3).slice(0, 32); saved.state.players[0].name = longName;
    const page = await pageFor({ width: 360, height: 640, animated: true, saved });
    await resume(page); assert.equal(await page.locator('#hand .hand-card').count(), 18);
    assert.equal(await page.locator('#hand-pager, #previous-cards, #next-cards, #hand-page').count(), 0);
    const original = JSON.stringify(await stored(page)), seen = new Set();
    const observe = async () => {
      const layout = await handLayout(page);
      for (const card of layout.cards) if (card.right > layout.viewport.left + 4 && card.left < layout.viewport.right - 4) seen.add(card.id);
      assert.equal(layout.pageX, 0); assert.equal(layout.pageY, 0); return layout;
    };
    let layout = await observe(); assert.ok(layout.maximum > 0);
    for (let i = 0; i < 8 && layout.maximum - layout.left > 2; i++) { await touchHand(page, 1); layout = await observe(); }
    handEndpoint(layout, true, 'touch hand end'); assert.equal(seen.size, 18, 'native swipes expose all eighteen cards');
    await touchHand(page, 1); handEndpoint(await observe(), true, 'touch overscroll at the end');
    await snapshot(page, 'mobile-full-hand-end');
    for (let i = 0; i < 8 && layout.left > 2; i++) { await touchHand(page, -1); layout = await observe(); }
    await touchHand(page, -1); handEndpoint(await observe(), false, 'touch overscroll at the start');
    assert.equal(JSON.stringify(await stored(page)), original, 'swipes and their synthesized clicks never play a card');
    const header = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, centerY: r.top + r.height / 2 }; };
      const name = document.querySelector('#my-name'), style = getComputedStyle(name), turn = document.querySelector('#turn-label');
      return { row: box('.hand-meta'), nameGroup: box('.my-name'), name: box('#my-name'), turn: box('#turn-label'), sort: box('#hand-sort'), number: box('#sort-number'), color: box('#sort-color'),
        nameText: name.textContent, nameWidth: name.clientWidth, nameScrollWidth: name.scrollWidth, nameOverflow: style.textOverflow, nameWhiteSpace: style.whiteSpace, turnWidth: turn.clientWidth, turnScrollWidth: turn.scrollWidth };
    });
    assert.equal(header.nameText, longName); assert.equal(header.nameOverflow, 'ellipsis'); assert.equal(header.nameWhiteSpace, 'nowrap');
    assert.ok(header.nameScrollWidth > header.nameWidth, 'the complete nickname stays in the DOM while its display is shortened');
    for (const key of ['nameGroup', 'name', 'turn', 'sort', 'number', 'color']) {
      assert.ok(header[key].width > 0 && header[key].left >= header.row.left - 1 && header[key].right <= header.row.right + 1, `${key} remains inside the hand header`);
      assert.ok(Math.abs(header[key].centerY - header.row.centerY) <= 1, `${key} remains on the shared header line`);
    }
    assert.ok(header.nameGroup.right <= header.turn.left + 1); assert.ok(header.turn.right <= header.sort.left + 1);
    assert.ok(header.turnScrollWidth <= header.turnWidth + 1, 'the turn label is fully readable');
    await oneScreen(page, 'eighteen-card scrollable hand', true);
    await page.locator('#draw-button').click(); await page.waitForFunction(() => document.querySelector('.flying-card'));
    await page.evaluate(() => document.getAnimations().forEach(animation => animation.pause()));
    assert.equal(await page.locator('#sort-number').isDisabled(), true); assert.equal(await page.locator('#sort-color').isDisabled(), true);
    const lockedLeft = await page.locator('#hand-scroll').evaluate(node => node.scrollLeft);
    // Native touch must not move the actual landing target during a card flight.
    const lock = await page.locator('#hand-scroll').evaluate(node => ({ overflow: getComputedStyle(node).overflowX, touch: getComputedStyle(node).touchAction }));
    assert.equal(lock.overflow, 'hidden'); assert.equal(lock.touch, 'none');
    await touchHand(page, 1);
    assert.equal(await page.locator('#hand-scroll').evaluate(node => node.scrollLeft), lockedLeft, 'a real touch gesture cannot move a paused in-flight target');
    await page.evaluate(() => document.getAnimations().forEach(animation => animation.play()));
    await stableBoard(page);
    assert.equal((await stored(page)).players[0].hand.length, 19); assert.equal(await page.locator('#hand .hand-card').count(), 19);
    assert.equal(await page.locator('#hand-scroll').evaluate(node => node.scrollLeft), lockedLeft);
    assert.ok(['auto', 'scroll'].includes(await page.locator('#hand-scroll').evaluate(node => getComputedStyle(node).overflowX)));
    await oneScreen(page, 'nineteen-card scrollable hand', true); await snapshot(page, 'mobile-nineteen-cards');
    await page.context().close(); return { seen: seen.size, header };
  });

  await scenario('mouse drags begin on disabled cards, reach both ends and never submit a playable card', async () => {
    const page = await pageFor({ saved: setup([handCases.hand]) }); await resume(page);
    const original = JSON.stringify(await stored(page));
    const disabledId = await dragHand(page, { disabled: true });
    assert.ok((await handLayout(page)).left > 0, 'dragging an unplayable card scrolls its parent');
    assert.equal(JSON.stringify(await stored(page)), original);
    await page.locator('#hand-scroll').focus(); await page.keyboard.press('End');
    handEndpoint(await handLayout(page), true, 'keyboard hand end');
    await page.keyboard.press('Home'); handEndpoint(await handLayout(page), false, 'keyboard hand start');
    const playableId = await dragHand(page, { small: true });
    assert.equal(JSON.stringify(await stored(page)), original, 'releasing a drag on a playable card is not a card action');
    let layout = await handLayout(page);
    for (let i = 0; i < 5 && layout.maximum - layout.left > 2; i++) {
      const { viewport } = layout, y = viewport.top + 32;
      await page.mouse.move(viewport.right - 25, y); await page.mouse.down();
      await page.mouse.move(viewport.left + 25, y, { steps: 12 }); await page.mouse.up(); await settleHandScroll(page);
      layout = await handLayout(page);
    }
    handEndpoint(layout, true, 'mouse hand end'); assert.equal(JSON.stringify(await stored(page)), original);
    await oneScreen(page, 'desktop all nineteen cards', true); await snapshot(page, 'desktop-hand-dragged-end');
    await page.context().close(); return { disabledId, playableId };
  });

  await scenario('number and color sorting follow visible values, preserve ties and never change game state', async () => {
    const page = await pageFor({ width: 390, height: 844, saved: setup([handCases.hand]) }); await resume(page);
    const ids = () => page.locator('#hand .hand-card').evaluateAll(nodes => nodes.map(node => node.dataset.card));
    const original = JSON.stringify(await stored(page)); assert.deepEqual(await ids(), handCases.numberOrder);
    await page.locator('#sort-color').click(); assert.deepEqual(await ids(), handCases.colorOrder);
    assert.equal(await page.locator('#sort-color').getAttribute('aria-pressed'), 'true');
    await page.locator('#sort-color').click(); assert.deepEqual(await ids(), handCases.colorOrder);
    await page.locator('#sort-number').click(); assert.deepEqual(await ids(), handCases.numberOrder, 'same-value ties retain original hand order');
    assert.equal(JSON.stringify(await stored(page)), original, 'hand, deck, RNG, turn and revision are byte-for-byte unchanged');
    await page.locator('#sort-color').click(); await page.reload({ waitUntil: 'networkidle' }); await resume(page);
    assert.equal(await page.locator('#sort-color').getAttribute('aria-pressed'), 'true'); assert.deepEqual(await ids(), handCases.colorOrder);
    assert.equal(JSON.stringify(await stored(page)), original, 'reopening a preferred sort does not rewrite game state');
    await oneScreen(page, 'color-sorted hand', true); await snapshot(page, 'mobile-color-sorted-hand'); await page.context().close();
  });

  await scenario('every animation frame keeps the previous discard visible until the played card lands', async () => {
    const page = await pageFor({ animated: true, saved: setup([['S-K', 'S-3', 'H-8']]) }); await resume(page);
    await page.evaluate(() => {
      const pile = document.querySelector('#discard-card');
      window.discardSamples = []; window.discardSampling = true;
      function sample() {
        if (!window.discardSampling) return;
        const card = pile.firstElementChild, style = getComputedStyle(pile), face = card && getComputedStyle(card);
        const rect = card?.getBoundingClientRect();
        window.discardSamples.push({ id: pile.dataset.card, faceId: card?.dataset.cardId, count: pile.children.length,
          visible: !!card && style.visibility !== 'hidden' && face.visibility !== 'hidden' && +style.opacity > 0 && +face.opacity > 0 && rect.width > 0 && rect.height > 0,
          flying: !!document.querySelector('.flying-card') }); requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await pressCard(page, 'S-K'); await page.waitForFunction(() => document.querySelector('.flying-card'));
    assert.equal(await page.locator('#discard-card').getAttribute('data-card'), 'S-4');
    assert.equal(await page.locator('#discard-card > .playing-card').getAttribute('data-card-id'), 'S-4');
    await snapshot(page, 'discard-old-card-during-flight');
    await stableBoard(page); await page.waitForFunction(() => !document.querySelector('#draw-button').disabled);
    assert.equal(await page.locator('#discard-card').getAttribute('data-card'), 'S-K');
    const samples = await page.evaluate(() => { window.discardSampling = false; return window.discardSamples; });
    assert.ok(samples.filter(sample => sample.flying && sample.id === 'S-4').length >= 3, 'several real rendered frames retain the stationary previous face');
    assert.ok(samples.every(sample => sample.visible && sample.count === 1 && sample.id === sample.faceId), 'the discard never becomes blank or inconsistent');
    assert.ok(samples.every(sample => ['S-4', 'S-K'].includes(sample.id)), 'no stale intermediate card appears');
    await snapshot(page, 'discard-new-card-after-landing'); await page.context().close(); return { sampledFrames: samples.length };
  });

  await scenario('the nineteenth held card is accessible and receiving a twentieth removes active hand controls', async () => {
    const page = await pageFor({ width: 360, height: 640, saved: setup([handCases.hand]) }); await resume(page);
    assert.equal(await page.locator('#hand .hand-card').count(), 19);
    await page.locator('#hand-scroll').focus(); await page.keyboard.press('End'); handEndpoint(await handLayout(page), true, 'nineteenth card');
    await page.locator('#draw-button').click();
    await page.waitForFunction(key => !JSON.parse(localStorage.getItem(key)).state.players[0].active, STORAGE);
    const state = await stored(page); assert.equal(state.players[0].eliminatedReason, 'too-many-cards'); assert.equal(state.players[0].hand.length, 0);
    assert.equal(await page.locator('#hand .hand-card').count(), 0); assert.equal(await page.locator('#draw-button').isDisabled(), true);
    assert.match(await page.locator('#status').textContent(), /20장/);
    await oneScreen(page, 'twentieth-card elimination', true); await snapshot(page, 'mobile-twentieth-card-elimination'); await page.context().close();
  });

  await scenario('attack defense controls reject lower strengths and compare the latest attack rather than the total', async () => {
    const high = await pageFor({ saved: setup([['S-2', 'H-A', 'X-R', 'S-3']], { top: 'X-B', currentSuit: 'S', pendingDraw: 12 }) }); await resume(high);
    for (const id of ['S-2', 'H-A', 'S-3']) assert.equal(await high.locator(`#hand [data-card="${id}"]`).isDisabled(), true, `${id} cannot defend against +5`);
    assert.equal(await high.locator('#hand [data-card="X-R"]').isDisabled(), false);
    assert.equal(await high.locator('#draw-button').textContent(), '12장 받기');
    await pressCard(high, 'X-R'); await high.locator('#sheet[open]').waitFor(); await high.keyboard.press('Escape');
    assert.equal((await stored(high)).revision, 0, 'canceling a legal high attack preserves the game'); await high.context().close();
    const equal = await pageFor({ saved: setup([['S-2', 'D-A', 'S-3']], { top: 'H-2', currentSuit: 'H', pendingDraw: 10 }) }); await resume(equal);
    assert.equal(await equal.locator('#hand [data-card="S-2"]').isDisabled(), false, 'a +2 still defends the latest +2 even with ten cards accumulated');
    assert.equal(await equal.locator('#hand [data-card="D-A"]').isDisabled(), false); assert.equal(await equal.locator('#hand [data-card="S-3"]').isDisabled(), true);
    await equal.context().close();
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

  await scenario('a signed-in computer game records once, restores its result and rematches explicitly', async () => {
    network = await fixture();
    const userId = network.users[0], page = await pageFor({ width: 390, height: 844, userId });
    await page.locator('#solo-start').click(); await stableBoard(page);
    await page.waitForFunction(() => document.querySelectorAll('#hand .hand-card').length === 7);
    let room = (await network.call(userId, { action: 'mine' })).room;
    assert.equal(room.mode, 'solo'); assert.equal(room.players.length, 1);
    assert.equal(room.game.players.filter(player => player.bot).length, 4);
    assert.equal(await page.locator('#lobby').isVisible(), false);
    assert.match(await page.locator('#game-record-mode').textContent(), /연승 기록 경기/);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE), null);
    await oneScreen(page, 'private ranked solo', true);
    await network.stageWin(room.id, userId);
    await page.waitForFunction(() => document.querySelector('#my-count').textContent === '1장' && !document.querySelector('#draw-button').disabled);
    await pressCard(page, 'S-3');
    await page.waitForFunction(() => document.querySelector('#sheet').open && document.querySelector('#onecard-ranking-record')?.textContent.includes('저장 완료'));
    assert.match(await page.locator('#onecard-ranking-record').textContent(), /현재 1연승.*이번 달 최고 1연승/s);
    assert.equal(new URL(await page.locator('#onecard-ranking-record a').getAttribute('href'), origin).searchParams.get('game'), 'onecard');
    await visibleResultActions(page, 'ranked solo mobile result'); await snapshot(page, 'ranked-solo-result-mobile');
    await resizePage(page, 750, 750); await visibleResultActions(page, 'ranked solo desktop result');
    await snapshot(page, 'ranked-solo-result-desktop');
    assert.equal((await network.db.query('select count(*)::int n from ojjuda_onecard_internal.results')).rows[0].n, 1);
    const id = room.id;
    await page.reload({ waitUntil: 'networkidle' }); await page.locator('#solo-start').click();
    await page.waitForFunction(() => document.querySelector('#sheet').open && document.querySelector('#onecard-ranking-record')?.textContent.includes('저장 완료'));
    room = (await network.call(userId, { action: 'mine' })).room;
    assert.equal(room.id, id); assert.equal(room.round, 1, 'reload shows the completed round without automatically rematching');
    assert.equal((await network.db.query('select count(*)::int n from ojjuda_onecard_internal.results')).rows[0].n, 1);
    await page.getByRole('button', { name: '다시 한 판', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#sheet').open && document.querySelectorAll('#hand .hand-card').length === 7);
    room = (await network.call(userId, { action: 'mine' })).room;
    assert.equal(room.round, 2); assert.equal(room.ranking, null);
    await page.context().close(); await network.close(); network = null;
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
    assert.ok([1, -1].includes(advanced.state.direction));
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
