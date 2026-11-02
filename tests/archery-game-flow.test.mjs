/** Integration checks for the actual app handlers/state. No browser or browser driver. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const SAVE_KEY = 'forest-archer-progress-v2';
const SERVER_EPOCH = Date.parse('2026-11-02T12:00:00.000Z');
const engineSource = await readFile(new URL('../games/forest-archer/engine.mjs', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../games/forest-archer/view.mjs', import.meta.url), 'utf8');
const cinematicSource = await readFile(new URL('../games/forest-archer/cinematic.mjs', import.meta.url), 'utf8');
const coachSource = await readFile(new URL('../games/forest-archer/coach.mjs', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../games/forest-archer/game.mjs', import.meta.url), 'utf8');
const ammoSource = await readFile(new URL('../games/forest-archer/ammo-client.mjs', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
let harnessSequence = 0;

async function appHarness(saved = null, ammoOptions = {}) {
  let now = 0, nextFrame = null, frameId = 0, timerId = 0;
  let viewport = { width: 1000, height: 600 }, canvasOrigin = { left: 0, top: 0 }, sceneryFrame, firstPersonFrame;
  const timers = new Map(), canvasText = [], canvasArcs = [], bullseyeFrames = [], vignetteFrames = [];
  const speech = {utterances: [], times: [], cancellations: 0, overlaps: 0, activeUntil: 0};
  const elements = new Map(), store = ammoOptions.store || new Map(saved ? [[SAVE_KEY, JSON.stringify(saved)]] : []);
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const drawing = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    if (key === 'measureText') return () => ({ width: 20 });
    if (key === 'fillText' || key === 'strokeText') return value => canvasText.push(String(value));
    if (key === 'arc') return (x, y, radius) => canvasArcs.push({x, y, radius});
    return noop;
  }, set(target, key, value) { target[key] = value; return true; } });
  let document, api;
  const makeElement = id => {
    const classes = new Set(), listeners = new Map(), attributes = new Map(), pointerPositions = new Map(), capturedPointers = new Set();
    const el = {
      id, tagName: 'DIV', textContent: '', innerHTML: '', style: {}, dataset: {}, width: 420, height: 180,
      classList: { add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)), contains: v => classes.has(v), toggle(v, force) { const add = force ?? !classes.has(v); add ? classes.add(v) : classes.delete(v); return add; } },
      addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
      emit(type, properties = {}) {
        // A new omitted touch starts in the lower input area. Moves and releases
        // keep the finger's last screen position, including captured movement.
        const pointerId = properties.pointerId ?? 1;
        const point = (type !== 'pointerdown' && pointerPositions.get(pointerId)) || {
          clientX: canvasOrigin.left + viewport.width * .35,
          clientY: canvasOrigin.top + viewport.height * .8
        };
        const event = { button: 0, pointerId, ...point, currentTarget: el, target: el, preventDefault: noop, ...properties };
        if (type.startsWith('pointer')) pointerPositions.set(pointerId, { clientX: event.clientX, clientY: event.clientY });
        for (const fn of listeners.get(type) || []) fn(event);
      },
      getContext: () => drawing,
      getBoundingClientRect: () => id === 'aimTouchpad'
        ? { width: viewport.width, height: viewport.height / 3, left: canvasOrigin.left, top: canvasOrigin.top + viewport.height * 2 / 3 }
        : { ...viewport, ...canvasOrigin },
      setPointerCapture: pointerId => capturedPointers.add(pointerId), releasePointerCapture: pointerId => capturedPointers.delete(pointerId), hasPointerCapture: pointerId => capturedPointers.has(pointerId),
      setAttribute(name, value) { attributes.set(name, String(value)); }, getAttribute(name) { return attributes.get(name) ?? null; },
      querySelectorAll: () => [], focus() { document.activeElement = el; }, closest() { return el.tagName === 'BUTTON' ? el : null; }
    };
    return el;
  };
  const getElement = id => { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); };
  const eventHub = () => {
    const listeners = new Map();
    return { addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); }, removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(value => value !== fn)); }, emit(type, properties = {}) { for (const fn of listeners.get(type) || []) fn({ preventDefault: noop, ...properties }); } };
  };
  document = { ...eventHub(), hidden: false, activeElement: null, body: { style: {} }, getElementById: getElement, querySelectorAll: () => [] };
  const window = eventHub();
  window.matchMedia = query => ({ media: query, matches: query === '(prefers-reduced-motion: reduce)' && !!ammoOptions.reducedMotion,
    addEventListener: noop, removeEventListener: noop });
  if (ammoOptions.speechAvailable !== false) {
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    window.speechSynthesis = {getVoices: () => [{lang: 'ko-KR', name: 'Korean test voice'}],
      speak: utterance => {
        if (now < speech.activeUntil) speech.overlaps++;
        speech.activeUntil = now + 350;speech.utterances.push(utterance);speech.times.push(now);
      }, cancel: () => { speech.cancellations++;speech.activeUntil = now; }};
  }
  let requestSequence = 0;
  const harnessId = ++harnessSequence;
  const uuid = () => `00000000-0000-4000-8000-${String(harnessId * 100000 + ++requestSequence).padStart(12, '0')}`;
  const owner = '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222222222', origin = 'https://ojjuda.test';
  const ammoRequests = [], heldActions = new Set(ammoOptions.hold || []), receipts = ammoOptions.server?.receipts || new Map(), runs = ammoOptions.server?.runs || new Map();
  const account = ammoOptions.server?.account || { remaining: ammoOptions.remaining ?? 10000, coins: ammoOptions.coins ?? 100, main_rounds: saved?.mainRounds || 0, revision: 1,
    coach_expires_at: ammoOptions.coachExpiresAt ?? (ammoOptions.coachActive ? new Date(SERVER_EPOCH + 86400000).toISOString() : null) };
  const accountSnapshot = extra => ({ ok: true, ...account, free_remaining: account.remaining, paid_remaining: 0, milestones_granted: Math.min(10, Math.floor(account.main_rounds / 5)), daily_eligible: true, day: '2026-11-02', daily_checked: true, pack_ammo: 10, pack_price: 5,
    server_now: new Date(SERVER_EPOCH + now).toISOString(), coach_expires_at: account.coach_expires_at ?? null,
    coach_active: Date.parse(account.coach_expires_at) > SERVER_EPOCH + now, coach_price: 10, coach_duration_seconds: 86400, ...extra });
  const executeAmmo = request => {
    if (request.action === 'status') return accountSnapshot();
    if (request.action === 'receipt') return accountSnapshot({ found: receipts.has(request.receiptId), receipt: receipts.get(request.receiptId) || null });
    if (receipts.has(request.requestId)) return receipts.get(request.requestId);
    let extra = {};
    if (request.action === 'round-start') { const run_id = uuid();runs.set(run_id, { stage: request.stage, complete: false });extra.run_id = run_id; }
    else if (request.action === 'round-complete') {
      const run = runs.get(request.runId);
      if (!run || run.stage !== request.stage) return accountSnapshot({ ok: false, reason: 'run_not_found' });
      if (!run.complete) { run.complete = true;account.main_rounds++;if (account.main_rounds % 5 === 0 && account.main_rounds <= 50) account.remaining += 20; }
    } else if (request.action === 'spend') { if (!account.remaining) return accountSnapshot({ ok: false, reason: 'ammo_empty' });account.remaining--; }
    else if (request.action === 'buy') { if (account.coins < 5) return accountSnapshot({ ok: false, reason: 'coins' });account.coins -= 5;account.remaining += 10; }
    else if (request.action === 'coach-buy') {
      if (accountSnapshot().coach_active) return accountSnapshot({ok: false, reason: 'coach_active'});
      if (account.coins < 10) return accountSnapshot({ok: false, reason: 'coins'});
      account.coins -= 10;account.coach_expires_at = new Date(SERVER_EPOCH + now + 86400000).toISOString();
    }
    account.revision++;const result = accountSnapshot(extra);receipts.set(request.requestId, result);return result;
  };
  const replyAmmo = (request, result = executeAmmo(request)) => window.emit('message', { source: parentBridge, origin, data: { source: 'ojjuda-archery-world', type: 'ammo-response', owner, sessionId, requestId: request.requestId, action: request.action, result } });
  const parentBridge = { postMessage(data, targetOrigin) {
    assert.equal(targetOrigin, origin);
    if (data.type === 'ready') Promise.resolve().then(() => window.emit('message', { source: parentBridge, origin, data: { source: 'ojjuda-archery-world', type: 'init', owner, sessionId, available: true } }));
    if (data.type === 'ammo-request') { ammoRequests.push(data);if (!heldActions.has(data.action)) Promise.resolve().then(() => replyAmmo(data)); }
  } };
  window.parent = parentBridge;window.location = { origin };
  const fakeMath = Object.create(Math); fakeMath.random = () => 0.5;
  const context = vm.createContext({
    document, Math: fakeMath, console, performance: { now: () => now }, devicePixelRatio: 1, crypto: { randomUUID: uuid },
    navigator: { vibrate: noop }, window, matchMedia: window.matchMedia,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
    requestAnimationFrame(fn) { nextFrame = fn; return ++frameId; },
    setTimeout(fn, delay = 0) { const id = ++timerId; timers.set(id, { due: now + Math.max(0, delay), fn }); return id; }, clearTimeout: id => timers.delete(id),
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe() {} }
  });
  const engine = new vm.SourceTextModule(engineSource, { context, identifier: 'engine.mjs' });
  const view = new vm.SourceTextModule(viewSource, { context, identifier: 'view.mjs' });
  const cinematic = new vm.SourceTextModule(cinematicSource, { context, identifier: 'cinematic.mjs' });
  const coach = new vm.SourceTextModule(coachSource, { context, identifier: 'coach.mjs' });
  const ammoModule = new vm.SourceTextModule(ammoSource, { context, identifier: 'ammo-client.mjs' });
  const sceneryNames = ['drawScenery', 'drawAnimal', 'drawClay', 'drawUfo', 'drawObstacle', 'drawPasser', 'drawEquipmentIcon', 'drawFirstPersonBow', 'drawBullseyeImpact', 'drawBullseyeVignette'];
  const scenery = new vm.SyntheticModule(sceneryNames, function () {
    for (const name of sceneryNames) this.setExport(name, name === 'drawScenery' ? (_ctx, _w, _h, options) => { sceneryFrame = options; } : name === 'drawFirstPersonBow' ? (_ctx, _w, _h, options) => { firstPersonFrame = options; } : name === 'drawBullseyeImpact' ? (...args) => bullseyeFrames.push(args.slice(1)) : name === 'drawBullseyeVignette' ? (...args) => vignetteFrames.push(args.slice(1)) : noop);
  }, { context });
  const game = new vm.SourceTextModule(gameSource + '\nexport const testApi = { state, get progress(){return progress;}, get ammo(){return ammo;}, startStage, resetRound, enterEvent, exitEvent, finishRound, showShop, equipItem, installScope, closeModal, activeBow, activeArrow, aimAngles, effectiveSway, isSteady, get camera(){return camera;}, sceneItems, resize, project, onImpact, onEventImpact, showAmmoShop, buyAmmo, retryAmmo, showStabilizers, buyStabilizer, useStabilizer, aimBounds, cinematicFrame, renderTime, get coachRemaining(){return coachRemaining;}, get pointer(){return pointer;} };', { context, identifier: 'game.mjs' });
  await game.link(specifier => specifier.startsWith('./engine.mjs') ? engine : specifier.startsWith('./view.mjs') ? view : specifier.startsWith('./cinematic.mjs') ? cinematic : specifier.startsWith('./coach.mjs') ? coach : specifier.startsWith('./ammo-client.mjs') ? ammoModule : scenery);
  await game.evaluate();
  await flush();
  api = game.namespace.testApi;
  return {
    api, engine: engine.namespace, view: view.namespace, cinematic: cinematic.namespace, coach: coach.namespace, getElement, store, document, window, canvasText, canvasArcs, bullseyeFrames, vignetteFrames, speech, flush,
    ammo: { account, receipts, runs, requests: ammoRequests, held: heldActions, reply: replyAmmo, execute: executeAmmo, snapshot: accountSnapshot },
    get viewport() { return { ...viewport }; },
    get sceneryFrame() { return sceneryFrame; },
    get firstPersonFrame() { return firstPersonFrame; },
    resize(width, height, origin = { left: 0, top: 0 }) { viewport = { width, height }; canvasOrigin = origin;api.resize(); },
    get now() { return now; },
    setRandom(fn) { fakeMath.random = fn; },
    advanceTo(target, { frame = true, runTimers = true } = {}) {
      assert.ok(target >= now, 'test clock is monotonic');
      if (runTimers) {
        for (;;) {
          const next = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
          if (!next) break;
          now = Math.max(now, next[1].due); timers.delete(next[0]); next[1].fn();
        }
      }
      now = target;
      if (frame) { const callback = nextFrame; nextFrame = null; assert.ok(callback, 'app should schedule its next frame'); callback(now); }
    },
    frames(count = 1) { for (let i = 0; i < count; i++) this.advanceTo(now + 1000 / 60); },
    until(predicate, maxFrames = 1000) { for (let i = 0; i < maxFrames && !predicate(); i++) this.frames(); assert.ok(predicate(), 'app must reach its expected state'); },
    snapshot: () => JSON.parse(store.get(SAVE_KEY))
  };
}

function holdFor(app, milliseconds, frameMs = 1000 / 60) {
  const end = app.now + milliseconds;
  while (app.now < end - 1e-9) app.advanceTo(Math.min(end, app.now + frameMs));
}

function baseAimScreen(app, angles = app.api.state.aim) {
  const shot = app.engine.launchArrow({ ...angles, bow: app.api.activeBow(), arrow: app.api.activeArrow(), charge: 1, velocityBias: 0 });
  return app.api.project({ x: shot.velocity.x, y: app.engine.PLAYER.y + shot.velocity.y, z: shot.velocity.z });
}

function moveHeldAim(app, yaw, pitch) {
  const { state, pointer } = app.api;
  assert.ok(pointer && state.mode === 'drawing', 'an actual held lower-area touch is required');
  const pad = app.getElement('aimTouchpad'), current = baseAimScreen(app), target = baseAimScreen(app, { yaw, pitch });
  const coordinates = { clientX: pointer.x + target.x - current.x, clientY: pointer.y + target.y - current.y };
  pad.emit('pointermove', coordinates);
  assert.ok(Math.abs(state.aim.yaw - yaw) < 1e-9 && Math.abs(state.aim.pitch - pitch) < 1e-9,
    `relative touch reaches ${yaw},${pitch}; actual ${state.aim.yaw},${state.aim.pitch}`);
  return coordinates;
}

function startCenteredDraw(app) {
  const { api, engine } = app, state = api.state;
  const speed = engine.getSpeed({ charge: 1, bow: api.activeBow(), arrow: api.activeArrow(), velocityBias: 0 });
  const target = engine.targetAt(state.stage, state.time), d = target.z, dy = target.y - engine.PLAYER.y;
  const pitch = Math.atan((speed ** 2 - Math.sqrt(speed ** 4 - engine.GRAVITY * (engine.GRAVITY * d ** 2 + 2 * dy * speed ** 2))) / (engine.GRAVITY * d));
  const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');
  const coords = moveHeldAim(app, 0, pitch);
  app.frames(78);
  return { pad, coords };
}

async function enterScene(app, scene) {
  const chapters = { static: 1, moving: 2, wall: 3, pillar: 6 };
  const stage = app.engine.STAGES.find(entry => chapters[scene] ? entry.chapterId === chapters[scene] : entry.kind === scene);
  assert.ok(stage, `${scene} scene is available in the learning progression`);
  app.api.startStage(stage.id);
  await app.flush();
}

async function centeredShot(app) {
  const { pad, coords } = startCenteredDraw(app);
  const before = app.api.state.used;
  assert.equal(app.api.state.mode, 'drawing');
  assert.equal(app.api.state.used, before);
  pad.emit('pointerup', coords);await app.flush();
  assert.equal(app.api.state.mode, 'flight');
  assert.equal(app.api.state.used, before + 1);
  app.until(() => ['ready', 'finished'].includes(app.api.state.mode));
  await app.flush();
}

// Solve one ordinary damped shot at the current release time. This also gives
// moving-target replay tests an actual centre hit without injecting a result.
function preciseMainDraw(app, offset = { x: 0, y: 0 }, {missDuringHold = false} = {}) {
  const { api, engine } = app, { state } = api, pad = app.getElement('aimTouchpad');
  pad.emit('pointerdown');
  if (missDuringHold) moveHeldAim(app, .4, .5);
  holdFor(app, 1300);
  const probe = engine.launchArrow({bow: api.activeBow(), arrow: api.activeArrow(), charge: 1, velocityBias: state.velocityBias});
  const drag = probe.dragRate, wind = state.stage.wind * engine.WIND_RESPONSE * probe.windFactor;
  const velocityForTime = time => {
    const target = engine.targetAt(state.stage, state.time + time);
    const a = drag ? -Math.expm1(-drag * time) / drag : time;
    const b = drag ? (time - a) / drag : time * time / 2;
    return {x: (target.x + offset.x * target.rx - engine.PLAYER.x - wind * b) / a,
      y: (target.y + offset.y * target.ry - engine.PLAYER.y + engine.GRAVITY * b) / a,
      z: (target.z - engine.PLAYER.z) / a};
  };
  let lo = .001, hi = 2;
  assert.ok(Math.hypot(...Object.values(velocityForTime(hi))) < probe.speed, 'fixture has a reachable low trajectory');
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (Math.hypot(...Object.values(velocityForTime(mid))) > probe.speed) lo = mid;else hi = mid;
  }
  const v = velocityForTime((lo + hi) / 2), sway = api.effectiveSway();
  const coords = moveHeldAim(app, Math.atan2(v.x, v.z) - sway.x, Math.atan2(v.y, Math.hypot(v.x, v.z)) - sway.y);
  return {pad, coords};
}

const shotAccounting = app => [app.api.state.used, app.api.state.score, app.api.state.hits,
  app.api.progress.shots, app.api.progress.hits, app.api.progress.coins, app.ammo.account.remaining];

function modalAction(app, action) {
  const button = app.getElement(`action-${action}`);
  button.tagName = 'BUTTON';button.dataset.action = action;
  const tag = app.getElement('modalContent').innerHTML.match(new RegExp('<button\\b[^>]*data-action="' + action + '"[^>]*>'))?.[0];
  button.disabled = !!tag && /\bdisabled\b/.test(tag);
  app.document.emit('click', { target: button });
}

async function resolvedEventShot(app, kind = 'clay') {
  const { state } = app.api, pad = app.getElement('aimTouchpad');
  app.until(() => state.fireCooldown === 0 && state.reloadRemaining === 0);
  const target = kind === 'miss' ? null : app.engine.eventTargetsAt(state.stage, state.time).find(item => item.kind === kind && item.active);
  if (kind !== 'miss') assert.ok(target, `an active ${kind} is available`);
  pad.emit('pointerdown');pad.emit('pointerup');await app.flush();
  const shot = state.shot;
  assert.equal(shot.projectileType, 'bullet');assert.equal(!!shot.handled, false);
  const point = target ? { x: target.x, y: target.y, z: target.z } : { x: 20, y: 3, z: 30 };
  shot.position = point;shot.active = false;
  shot.result = { type: target ? 'hit' : 'miss', point, targetCenter: target, score: target ? 10 : 0, flightTime: shot.elapsed, zone: target ? '접시 명중' : '표적을 지나쳤어요' };
  app.api.onEventImpact(shot);app.api.onEventImpact(shot);
  return shot;
}

test('the reordered game starts fresh once and never restores the previous journey or pending shot', async () => {
  const old = { version: 1, coins: 99999, ownedBows: [0, 3, 19, 24], ownedArrows: [0, 11],
    bow: 19, arrow: 11, eventGun: 24, scopedBows: [19, 24], lastStage: 50,
    best: { 1: 50, 50: 50 }, eventBest: 300, eventBestByLevel: { 10: 300 },
    eventPlays: 8, mainRounds: 50, shots: 250, hits: 230 };
  const owner = '11111111-1111-4111-8111-111111111111';
  const store = new Map([
    ['forest-archer-progress-v1', JSON.stringify(old)],
    ['forest-archer-ammo-pending-v1:' + owner, JSON.stringify({ version: 1, owner, action: 'spend',
      requestId: '33333333-3333-4333-8333-333333333333', payload: {} })]
  ]);
  const app = await appHarness(null, { store, remaining: 0 });
  const progress = app.api.progress;
  assert.deepEqual([progress.coins, progress.bow, progress.arrow, progress.eventGun, progress.lastStage], [0, 0, 0, 20, 1]);
  assert.deepEqual([...progress.ownedBows], [0, 20]);
  assert.deepEqual([...progress.ownedArrows], [0]);
  assert.deepEqual([...progress.scopedBows], []);
  assert.deepEqual([progress.mainRounds, progress.eventPlays, progress.eventBest, progress.shots, progress.hits], [0, 0, 0, 0, 0]);
  assert.equal(Object.keys(progress.best).length, 0);
  assert.equal(Object.keys(progress.eventBestByLevel).length, 0);
  assert.equal(app.api.ammo.pending, null);
  assert.equal(app.ammo.requests.some(request => request.action === 'spend' || request.action === 'receipt'), false,
    'an old journey request must not spend a new journey bullet');
  progress.coins = 600;
  const upgrade = app.engine.BOWS.find(item => item.shopRank === 2 && item.weaponType === 'bow');
  app.api.showShop('bow');app.api.equipItem(upgrade.id);
  const resumed = await appHarness(null, { store, remaining: 0 });
  assert.equal(resumed.api.progress.coins, 600 - upgrade.price);
  assert.equal(resumed.api.progress.bow, upgrade.id, 'only the release transition resets progress, not every visit');
  assert.deepEqual(JSON.parse(store.get('forest-archer-progress-v1')), old);
});

test('pointer hold waits for release and pointer cancellation never consumes an arrow', async () => {
  const app = await appHarness();
  const { pad, coords } = startCenteredDraw(app);
  assert.equal(app.api.state.mode, 'drawing');
  assert.equal(app.api.state.shot, null);
  assert.equal(app.api.state.used, 0);
  pad.emit('pointercancel');
  assert.equal(app.api.state.mode, 'ready');
  assert.equal(app.api.state.used, 0);
  pad.emit('pointerup', coords);await app.flush();
  assert.equal(app.api.state.shot, null);
  await centeredShot(app);
  assert.equal(app.api.state.score, 10);
  assert.equal(app.api.progress.shots, 1);
  assert.equal(Number(app.getElement('scoreCount').textContent), 10);
});

test('only the lower-third touchpad can start a shot, and captured bottom gestures steer the upper view', async () => {
  for (const [width, height, left, top] of [[390, 480, 17, 83], [844, 235, 9, 48], [1000, 600, 55, 137]]) {
    const app = await appHarness({ version: 1, ownedBows: [0, 20], eventGun: 20, sound: false });
    app.api.enterEvent(1);await app.flush();app.resize(width, height, { left, top });
    const pad = app.getElement('aimTouchpad'), canvas = app.getElement('gameCanvas'), state = app.api.state;
    const boundary = top + height * 2 / 3;
    const lower = { clientX: left + width * .4, clientY: top + height * .85 };
    const before = { ...state.aim };
    canvas.emit('pointerdown', lower);canvas.emit('pointermove', lower);canvas.emit('pointerup', lower);
    assert.equal(state.mode, 'ready', 'the canvas is rendering only and cannot start a shot');
    for (const point of [
      { ...lower, clientY: top + height * .35 },
      { ...lower, clientY: boundary - .01 },
      { ...lower, clientX: left - 1 },
      { ...lower, clientX: left + width + 1 },
      { ...lower, clientY: top + height + 1 }
    ]) {
      pad.emit('pointerdown', point);pad.emit('pointermove', lower);pad.emit('pointerup', lower);
      assert.equal(app.api.pointer, null, 'an invalid starting position cannot acquire a gesture by moving into the lower area');
      assert.equal(state.mode, 'ready');assert.equal(state.used, 0);
    }
    app.advanceTo(app.now + 11000, { frame: false });await app.flush();
    assert.deepEqual({ ...state.aim }, before);assert.equal(state.shot, null);
    assert.equal(app.ammo.requests.filter(request => request.action === 'spend').length, 0, 'upper taps never start an auto-fire timer or consume ammunition');
    for (const y of [boundary, boundary + .01]) {
      pad.emit('pointerdown', { ...lower, clientY: y });
      assert.equal(state.mode, 'drawing', 'the exact lower-third boundary and the area below it accept a gesture');
      assert.ok(pad.hasPointerCapture(1));pad.emit('pointercancel');
      assert.equal(app.api.pointer, null);assert.equal(pad.hasPointerCapture(1), false);
    }
    pad.emit('pointerdown', { ...lower, clientY: boundary });
    const initialPitch = state.aim.pitch;
    pad.emit('pointermove', { ...lower, clientY: boundary - 12 });holdFor(app, 200);
    assert.ok(state.aim.pitch > initialPitch, 'a captured gesture keeps steering even when the finger crosses above the input area');
    const shot = app.engine.launchArrow({ ...state.aim, bow: app.api.activeBow(), charge: 1, velocityBias: 0 });
    const reticle = app.api.project({ x: shot.velocity.x, y: app.engine.PLAYER.y + shot.velocity.y, z: shot.velocity.z });
    assert.ok(reticle.y > 0 && reticle.y < height * 2 / 3, 'the aiming ray stays in the upper two-thirds');
    pad.emit('pointerup', { ...lower, clientY: top - 10 });await app.flush();
    assert.equal(state.used, 1, 'releasing outside the lower area still fires the captured gesture once');
    assert.equal(app.api.pointer, null);assert.equal(pad.hasPointerCapture(1), false);
    assert.equal(app.ammo.requests.filter(request => request.action === 'spend').length, 1);
  }
});

test('the invisible lower touchpad anchors at the touched point without jumping aim and keeps reticle and bullet ray aligned at every zoom', async () => {
  for (const [width, height] of [[1000, 600], [390, 480], [844, 235]]) for (const zoom of [1, 2, 3]) {
    const app = await appHarness({ version: 1, ownedBows: [0, 20, 22], scopedBows: [22], eventGun: 22, sound: false });
    const origin = { left: 17, top: 83 };
    app.resize(width, height, origin);app.api.enterEvent(1);await app.flush();
    for (let i = 0; i < 3 && app.api.state.zoom !== zoom; i++) app.getElement('zoomBtn').emit('click');
    assert.equal(app.api.state.zoom, zoom);
    const canvas = app.getElement('aimTouchpad'), state = app.api.state, before = { ...state.aim };
    const local = { x: zoom === 3 ? width - 2 : width * .26, y: height * .73 };
    const down = { clientX: origin.left + local.x, clientY: origin.top + local.y };
    canvas.emit('pointerdown', down);
    assert.equal(state.mode, 'drawing');assert.equal(state.used, 0);
    assert.deepEqual({ ...state.aim }, before, 'touch location anchors the control without teleporting the aim');
    assert.equal(app.api.pointer.el, canvas);
    assert.equal(app.api.pointer.x, down.clientX);assert.equal(app.api.pointer.y, down.clientY);
    assert.ok(canvas.hasPointerCapture(1));
    const beforeScreen = baseAimScreen(app), coordinates = { clientX: down.clientX + 20, clientY: down.clientY - 16 };
    canvas.emit('pointermove', coordinates);
    const moved = baseAimScreen(app), held = { ...state.aim };
    assert.ok(Math.abs(moved.x - beforeScreen.x - 20) < 1e-9 && Math.abs(moved.y - beforeScreen.y + 16) < 1e-9,
      'finger and aiming direction move by the same CSS pixel distance at every zoom and viewport size');
    holdFor(app, 240);
    assert.deepEqual({ ...state.aim }, held, 'holding the moved finger still does not continue aiming');
    app.canvasArcs.length = 0;app.frames();
    const reticle = app.canvasArcs.filter(arc => arc.radius === 1.7).at(-1);
    assert.ok(reticle, 'the real renderer draws the current aiming centre');
    const frozen = { ...state.aim }, pan = [state.panX, state.panY];
    canvas.emit('pointerup', coordinates);await app.flush();
    const velocity = state.shot.velocity;
    const ray = app.api.project({ x: velocity.x, y: app.engine.PLAYER.y + velocity.y, z: velocity.z });
    assert.ok(Math.abs(ray.x - reticle.x) < 1e-9 && Math.abs(ray.y - reticle.y) < 1e-9,
      'the real bullet leaves along the rendered aiming ray, independently of the joystick position');
    assert.deepEqual({ ...state.aim }, frozen);assert.deepEqual([state.panX, state.panY], pan);
    assert.equal(state.shot.projectileType, 'bullet');assert.equal(state.used, 1);
    assert.equal(app.api.pointer, null);assert.equal(canvas.hasPointerCapture(1), false);
    assert.equal(app.ammo.requests.filter(request => request.action === 'spend').length, 1);
  }
});

test('touch movement follows every small relative pixel delta and holding a finger still never drifts', async () => {
  for (const zoom of [1, 2, 3]) {
    const app = await appHarness({ version: 1, ownedBows: [0, 20, 22], scopedBows: [22], eventGun: 22, sound: false });
    app.resize(390, 480);app.api.enterEvent(1);await app.flush();
    for (let i = 0; i < 3 && app.api.state.zoom !== zoom; i++) app.getElement('zoomBtn').emit('click');
    const pad = app.getElement('aimTouchpad'), state = app.api.state;
    let coordinates = { clientX: 120, clientY: 400 };
    pad.emit('pointerdown', coordinates);const original = { ...state.aim };
    for (const [dx, dy] of [[1, .5], [-.25, -.25], [6, -5], [-2, 1], [-4.75, 3.75]]) {
      const before = baseAimScreen(app);
      coordinates = { clientX: coordinates.clientX + dx, clientY: coordinates.clientY + dy };
      pad.emit('pointermove', coordinates);const after = baseAimScreen(app);
      assert.ok(Math.abs(after.x - before.x - dx) < 1e-9 && Math.abs(after.y - before.y - dy) < 1e-9,
        `${zoom}x follows ${dx},${dy}px exactly, including subpixel movement without a deadzone`);
      const held = { ...state.aim };holdFor(app, 250);
      assert.deepEqual({ ...state.aim }, held, 'elapsed time cannot add movement when the finger stays still');
    }
    assert.ok(Math.abs(state.aim.yaw - original.yaw) < 1e-9 && Math.abs(state.aim.pitch - original.pitch) < 1e-9,
      'reversing the same displacement returns to the original physical direction');
    pad.emit('pointercancel');assert.equal(state.used, 0);
  }
});

test('relative touch movement pans continuously at the upper aiming area edges without a 24px view jump', async () => {
  for (const [width, height] of [[390, 480], [1000, 600]]) for (const zoom of [1, 3]) {
    const directions = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, ...(zoom === 3 ? [{ x: 0, y: 1 }] : [])];
    for (const direction of directions) {
      const app = await appHarness({ version: 1, ownedBows: [0, 20, 22], scopedBows: [22], eventGun: 22, sound: false });
      app.resize(width, height);app.api.enterEvent(1);await app.flush();
      for (let i = 0; i < 3 && app.api.state.zoom !== zoom; i++) app.getElement('zoomBtn').emit('click');
      const canvas = app.getElement('aimTouchpad'), state = app.api.state;
      const screenPoint = () => {
        const shot = app.engine.launchArrow({ ...state.aim, bow: app.api.activeBow(), charge: 1, velocityBias: 0 });
        return app.api.project({ x: shot.velocity.x, y: app.engine.PLAYER.y + shot.velocity.y, z: shot.velocity.z });
      };
      const camera = app.api.camera, current = screenPoint(), bounds = app.api.aimBounds();
      const x = direction.x < 0 ? bounds.left + .01 : direction.x > 0 ? bounds.right - .01 : current.x;
      const y = direction.y < 0 ? bounds.top + .01 : direction.y > 0 ? bounds.bottom - .01 : current.y;
      const yaw = Math.atan2(x - camera.cx, camera.focal);
      const pitch = Math.atan((camera.horizon - y) / camera.focal * Math.cos(yaw));
      canvas.emit('pointerdown');const origin = moveHeldAim(app, yaw, pitch);
      const before = screenPoint(), cameraBefore = { ...app.api.camera };
      canvas.emit('pointermove', { clientX: origin.clientX + direction.x * .5, clientY: origin.clientY + direction.y * .5 });
      holdFor(app, 200);
      const after = screenPoint(), cameraAfter = app.api.camera;
      const pan = Math.hypot(cameraAfter.cx - cameraBefore.cx, cameraAfter.horizon - cameraBefore.horizon);
      assert.ok(Math.abs(pan - .49) < 1e-8, `${width}px ${zoom}x ${JSON.stringify(direction)}: edge pans by just the tiny overflow (${pan}px)`);
      assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < .2, 'reticle stays at the edge while the view moves smoothly');
      assert.ok(after.y < height * 2 / 3, 'the aiming area remains above the invisible touch area');
      const stopped = { ...app.api.camera };holdFor(app, 200);
      assert.deepEqual({ ...app.api.camera }, stopped, 'edge panning stops immediately when the finger stops moving');
      canvas.emit('pointercancel');assert.equal(state.used, 0);
    }
  }
});

test('release applies the last relative touch delta exactly once and preserves its direction and sway through ammo authorization', async () => {
  const app = await appHarness({ version: 1, ownedBows: [0, 20], eventGun: 20, sound: false }, { hold: ['spend'] });
  app.resize(390, 480, { left: 9, top: 74 });app.api.enterEvent(1);await app.flush();
  const canvas = app.getElement('aimTouchpad'), state = app.api.state, before = baseAimScreen(app);
  const down = { clientX: 120, clientY: 460 };
  canvas.emit('pointerdown', down);canvas.emit('pointermove', { clientX: down.clientX + 12, clientY: down.clientY - 6 });
  state.sway.x = .012;state.sway.y = -.009;
  app.advanceTo(app.now + 300, { frame: false });
  const release = { clientX: down.clientX + 16, clientY: down.clientY - 10 };
  canvas.emit('pointerup', release);await app.flush();
  const after = baseAimScreen(app), { yaw, pitch } = state.aim;
  const pending = state.pendingAmmoShot.shot, velocity = pending.velocity;
  assert.ok(Math.abs(after.x - before.x - 16) < 1e-9 && Math.abs(after.y - before.y + 10) < 1e-9,
    'the release includes exactly the final four right and four upward pixels');
  assert.ok(Math.abs(Math.atan2(velocity.x, velocity.z) - yaw - .012 * .68) < 1e-12);
  assert.ok(Math.abs(Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) - pitch + .009 * .68) < 1e-12);
  assert.equal(app.api.pointer, null);
  const request = app.ammo.requests.filter(item => item.action === 'spend').at(-1);
  app.advanceTo(app.now + 500);app.ammo.reply(request);await app.flush();
  assert.equal(state.shot, pending, 'waiting for ammo preserves the released direction');
  canvas.emit('pointerup', release);canvas.emit('lostpointercapture');await app.flush();
  assert.equal(state.used, 1);assert.equal(app.ammo.requests.filter(item => item.action === 'spend').length, 1);
});

test('other fingers cannot move or release the active lower touch and cancellation paths clear it without consuming a shot', async () => {
  for (const reason of ['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'modal', 'stage', 'event', 'resize']) {
    const app = await appHarness(), canvas = app.getElement('aimTouchpad'), state = app.api.state;
    const down = { clientX: 230, clientY: 420, pointerId: 7 };
    canvas.emit('pointerdown', { ...down, pointerId: 8, isPrimary: false });
    assert.equal(state.mode, 'ready', 'a secondary finger cannot start the joystick');
    assert.equal(app.api.pointer, null);
    canvas.emit('pointerdown', down);
    const original = { ...state.aim }, origin = [app.api.pointer.x, app.api.pointer.y];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) canvas.emit(type, { pointerId: 8, clientX: 800, clientY: 10 });
    app.document.emit('keyup', { code: 'Space' });
    assert.equal(state.mode, 'drawing', 'an unrelated keyboard release cannot fire the held touch');assert.deepEqual({ ...state.aim }, original);
    assert.deepEqual([app.api.pointer.x, app.api.pointer.y], origin);
    assert.ok(app.api.pointer);
    if (reason === 'pointercancel' || reason === 'lostpointercapture') canvas.emit(reason, down);
    if (reason === 'blur') app.window.emit('blur');
    if (reason === 'hidden') { app.document.hidden = true;app.document.emit('visibilitychange'); }
    if (reason === 'modal') app.getElement('menuBtn').emit('click');
    if (reason === 'stage') app.api.startStage(2);
    if (reason === 'event') app.api.enterEvent(1);
    if (reason === 'resize') app.resize(390, 480);
    await app.flush();
    assert.equal(app.api.pointer, null, `${reason} clears the invisible touch control`);
    canvas.emit('pointerup', down);app.advanceTo(app.now + 11000);await app.flush();
    assert.equal(state.used, 0, `${reason} must never release or auto-fire the cancelled gesture`);
    assert.equal(state.shot, null);assert.equal(app.ammo.requests.filter(item => item.action === 'spend').length, 0);
  }
});

test('five actual shots complete the stage, award coins and restore the next selected stage', async () => {
  const app = await appHarness();
  for (let shot = 0; shot < 5; shot++) await centeredShot(app);
  assert.equal(app.api.state.mode, 'finished');
  assert.equal(app.api.state.score, 50);
  assert.equal(app.api.progress.coins, 75);
  assert.equal(app.api.progress.unlocked, 50);
  assert.equal(app.api.progress.best[1], 50);
  assert.equal(app.api.state.modal, 'result');
  assert.match(app.getElement('modalContent').innerHTML, /data-action="next-stage"/);
  assert.equal(app.api.progress.mainRounds, 1, 'five arrows complete one main round, not five rounds');
  assert.equal(app.api.state.isEvent, false);
  app.api.startStage(2);await app.flush();
  const saved = app.snapshot();
  assert.equal(saved.lastStage, 2);
  assert.equal(saved.shots, 5);
  assert.equal(saved.hits, 5);
  const reloaded = await appHarness(saved);
  assert.equal(reloaded.api.state.stage.id, 2);
  assert.equal(reloaded.api.progress.coins, 75);
  assert.equal(reloaded.api.progress.best[1], 50);
});

test('purchase charges once, equips permanently and survives reload', async () => {
  const initialCoins = 10000;
  const app = await appHarness({ version: 1, coins: initialCoins, ownedBows: [0], ownedArrows: [0], unlocked: 1, lastStage: 1, sound: false });
  const afterBow = initialCoins - app.engine.BOWS[1].price;
  app.api.showShop('bow');
  app.api.equipItem(1);
  assert.equal(app.api.progress.coins, afterBow);
  assert.equal(app.api.progress.bow, 1);
  assert.equal(app.api.progress.ownedBows.filter(id => id === 1).length, 1);
  app.api.equipItem(0);
  app.api.equipItem(1);
  assert.equal(app.api.progress.coins, afterBow);
  app.api.showShop('arrow');
  app.api.equipItem(1);
  const afterArrow = afterBow - app.engine.ARROWS[1].price;
  assert.equal(app.api.progress.coins, afterArrow);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.bow, 1);
  assert.equal(reloaded.api.progress.arrow, 1);
  assert.equal(reloaded.api.progress.coins, afterArrow);
});

test('both special arrows can be compared, bought once and equipped again after reload', async () => {
  const app = await appHarness({ version: 1, coins: 20000, ownedArrows: [0, 11], arrow: 11, sound: false });
  let balance = 20000;
  for (const id of [12, 13]) {
    const item = app.engine.ARROWS[id];
    app.api.showShop('arrow');
    const card = Array.from(app.getElement('modalContent').innerHTML.matchAll(/<article\b[\s\S]*?<\/article>/g), match => match[0])
      .find(html => html.includes(`data-equipment-id="${id}"`));
    assert.ok(card.includes(item.name) && card.includes(item.ability.label));
    assert.match(card, id === 12 ? /과녁 앞 · 1회/ : /중심 5m 이내/);
    app.api.equipItem(id);balance -= item.price;
    assert.equal(app.api.progress.coins, balance);
    assert.equal(app.api.activeArrow().id, id);
    app.api.equipItem(11);app.api.equipItem(id);
    assert.equal(app.api.progress.coins, balance, 'owned special arrows have no repeat purchase cost');
  }
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.coins, balance);
  assert.equal(reloaded.api.activeArrow().id, 13);
  assert.deepEqual(Array.from(reloaded.api.progress.ownedArrows), [0, 11, 12, 13]);
  reloaded.api.showShop('arrow');reloaded.api.equipItem(12);
  assert.equal(reloaded.api.activeArrow().id, 12);
  assert.match(reloaded.getElement('arrowStat').textContent, /한 번 튕김/);
});

for (const fixture of [
  { id: 12, stage: 3, charge: .30, yaw: 0, pitch: .13, effect: '1회 튕김' },
  { id: 13, stage: 2, charge: 1, yaw: .07, pitch: .04, effect: '근접 유도' }
]) test(`special arrow ${fixture.id} keeps one touch, one flight and one reward through its physical effect`, async () => {
  const app = await appHarness({ version: 1, coins: 100, ownedArrows: [0, fixture.id], arrow: fixture.id, lastStage: fixture.stage, sound: false });
  const { state } = app.api, pad = app.getElement('aimTouchpad');
  pad.emit('pointerdown');holdFor(app, fixture.charge * 1250);
  const sway = app.api.effectiveSway();
  const coords = moveHeldAim(app, fixture.yaw - sway.x, fixture.pitch - sway.y);
  pad.emit('pointerup', coords);await app.flush();
  assert.equal(state.mode, 'flight');assert.equal(state.used, 1);
  const shot = state.shot;
  app.until(() => fixture.id === 12 ? shot.bounceCount === 1 : shot.magnetActive);
  assert.equal(state.mode, 'flight');assert.equal(shot.active, true);
  assert.equal(shot.result, null, 'the special effect does not terminate the shot');
  assert.equal(state.used, 1);assert.equal(state.score, 0);assert.equal(state.stuck.length, 0);
  assert.equal(app.api.progress.shots, 0);assert.equal(app.api.progress.coins, 100);
  assert.match(app.getElement('flightBadge').textContent, new RegExp(fixture.effect));
  assert.ok(app.api.camera.z > 0, 'the slow-motion camera keeps following the actual arrow');
  if (fixture.id === 12) {
    assert.ok(shot.trail.some(point => Math.abs(point.y) < 1e-9 && Math.abs(point.z - shot.bouncePoint.z) < 1e-9), 'the visible trail includes the actual ground contact');
    assert.ok(shot.velocity.y > 0);
  }
  app.until(() => state.mode === 'settling');
  assert.equal(shot.result.type, 'hit');assert.equal(shot.result.score, 2);
  assert.equal(state.score, 2);assert.equal(state.hits, 1);assert.equal(state.used, 1);
  assert.equal(app.api.progress.shots, 1);assert.equal(app.api.progress.coins, 104);
  assert.equal(state.targetMarks.length, 1);assert.ok(shot.attachment);
  app.api.onImpact();
  assert.equal(app.api.progress.shots, 1);assert.equal(app.api.progress.coins, 104, 'a repeated final impact cannot award a second reward');
  app.until(() => state.mode === 'ready');
  assert.equal(state.used, 1);assert.equal(app.api.progress.shots, 1);
});

test('a real bullseye replays recorded flight once, holds impact, and restores aim without a second score', async () => {
  const app = await appHarness({version: 1, coins: 100, sound: false});
  const {pad, coords} = preciseMainDraw(app), {state} = app.api;
  const originalAim = {...state.aim}, originalCamera = {...app.api.camera};
  pad.emit('pointerup', coords);await app.flush();
  app.until(() => state.mode === 'settling');
  const shot = state.shot, replay = state.cinematic;
  assert.equal(shot.result.score, 10);assert.ok(replay);
  assert.equal(replay.shot, shot);assert.ok(shot.replayFrames.length > 2);
  assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'flight');
  assert.deepEqual(shotAccounting(app), [1, 10, 1, 1, 1, 110, 10000]);
  const accounting = shotAccounting(app), physics = JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result});
  const worldTime = state.time;
  app.api.onImpact();app.api.onImpact();
  assert.equal(state.cinematic, replay, 'a repeated impact cannot restart the same replay');
  app.frames(18);
  assert.equal(state.mode, 'settling');assert.equal(app.api.cinematicFrame().phase, 'flight');
  assert.equal(state.time, worldTime, 'the replay has its own presentation clock');
  assert.equal(JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result}), physics);
  assert.deepEqual(shotAccounting(app), accounting);
  const sample = app.api.cinematicFrame(), target = app.engine.targetAt(state.stage, app.api.renderTime());
  const tips = app.api.sceneItems(target).filter(item => item.kind === 'tip');
  assert.equal(tips.length, 1, 'the final attachment is hidden until replay impact');
  assert.equal(tips[0].flying, true);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(tips[0].point[axis] - sample.point[axis]) < 1e-9);
  assert.equal(app.sceneryFrame.time, sample.time, 'wind leaves and targets use the recorded scene time');
  app.until(() => app.getElement('gameCanvas').dataset.cinematic === 'impact');
  assert.equal(state.time, worldTime);assert.ok(app.bullseyeFrames.length > 0);
  assertAttachedArrows(app, [{x: shot.attachment.x, y: shot.attachment.y}], [shot.velocity]);
  app.until(() => app.getElement('gameCanvas').dataset.cinematic === 'return');
  app.until(() => state.mode === 'ready');
  assert.equal(state.cinematic, null);assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'none');
  assert.deepEqual(shotAccounting(app), accounting);
  assert.deepEqual({...state.aim}, originalAim);assert.deepEqual({...app.api.camera}, originalCamera);
  app.frames(4);assert.ok(state.time > worldTime, 'normal scene time resumes when the replay is complete');
});

test('eight-point hits, misses, event guns and animal hits do not start the circular-target bullseye replay', async () => {
  for (const outcome of ['eight', 'miss']) {
    const app = await appHarness(), {state} = app.api;
    const {pad, coords} = outcome === 'eight' ? preciseMainDraw(app, {x: .3, y: 0}) : startHighMiss(app);
    pad.emit('pointerup', coords);await app.flush();app.until(() => state.mode === 'settling');
    assert.equal(state.shot.result.score, outcome === 'eight' ? 8 : 0);
    assert.equal(state.cinematic, null);app.frames(5);
    assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'none');
    assert.equal(app.bullseyeFrames.length, 0);assert.equal(app.vignetteFrames.length, 0);
  }
  const event = await appHarness();event.api.enterEvent(1);await event.flush();
  await resolvedEventShot(event);
  assert.equal(event.api.state.cinematic, null);assert.equal(event.api.state.score, 10);
  const animal = await appHarness();await enterScene(animal, 'rabbit');
  resolveTestHit(animal, {x: 0, y: 0}, {x: 0, y: -2, z: 30}, 10);
  assert.equal(animal.api.state.cinematic, null);assert.equal(animal.api.state.score, 10);
});

test('moving-target replay follows recorded time through resizing and preserves the real impact attachment', async () => {
  const app = await appHarness();await enterScene(app, 'moving');
  const {pad, coords} = preciseMainDraw(app), {state} = app.api;
  pad.emit('pointerup', coords);await app.flush();app.until(() => state.mode === 'settling');
  const shot = state.shot, worldTime = state.time, elapsed = shot.elapsed;
  assert.equal(shot.result.score, 10);assert.ok(state.cinematic);
  app.frames(16);
  for (const [width, height] of [[390, 640], [844, 290], [1000, 600]]) {
    app.resize(width, height);app.frames(1);
    const frame = app.api.cinematicFrame(), target = app.engine.targetAt(state.stage, frame.time);
    const items = app.api.sceneItems(target), displayedTarget = items.find(item => item.kind === 'target').target;
    assert.equal(displayedTarget.x, target.x);assert.equal(displayedTarget.y, target.y);
    assert.equal(app.sceneryFrame.time, frame.time);
    assert.ok(Object.values(app.api.camera).every(Number.isFinite));
    const visible = app.api.project(frame.point);
    assert.equal(visible.visible, true);assert.ok(visible.x >= 0 && visible.x <= width && visible.y >= 0 && visible.y <= height);
    assert.equal(shot.elapsed, elapsed);assert.equal(state.time, worldTime);
  }
  app.until(() => app.getElement('gameCanvas').dataset.cinematic === 'impact');
  const offset = {x: shot.attachment.x, y: shot.attachment.y};
  assertAttachedArrows(app, [offset], [shot.velocity]);
  app.until(() => state.mode === 'ready');app.frames(90);
  const moved = assertAttachedArrows(app, [offset], [shot.velocity]);
  assert.ok(Math.abs(moved.x - shot.result.targetCenter.x) > .01);
  assert.deepEqual(shotAccounting(app).slice(0, 5), [1, 10, 1, 1, 1]);
});

for (const fixture of [{id: 12, stage: 4, charge: .225, pitch: .558}, {id: 13, stage: 2, charge: 1, pitch: .066}]) {
  test(`a genuine special-arrow ${fixture.id} bullseye replays its resolved path without repeating its ability`, async () => {
    const app = await appHarness({version: 1, coins: 100, ownedArrows: [0, fixture.id], arrow: fixture.id, lastStage: fixture.stage, sound: false});
    const {state} = app.api, pad = app.getElement('aimTouchpad');
    pad.emit('pointerdown');holdFor(app, fixture.charge * 1250);
    const sway = app.api.effectiveSway(), coords = moveHeldAim(app, -sway.x, fixture.pitch - sway.y);
    pad.emit('pointerup', coords);await app.flush();app.until(() => state.mode === 'settling');
    const shot = state.shot;
    assert.equal(shot.result.score, 10);assert.ok(state.cinematic);
    if (fixture.id === 12) assert.equal(shot.bounceCount, 1);else assert.equal(shot.magnetSteered, true);
    const counters = [shot.elapsed, shot.bounceCount, shot.bouncesRemaining, shot.magnetTurn, shot.magnetCorrection];
    const accounting = shotAccounting(app);
    app.until(() => state.mode === 'ready');
    assert.deepEqual([shot.elapsed, shot.bounceCount, shot.bouncesRemaining, shot.magnetTurn, shot.magnetCorrection], counters);
    assert.deepEqual(shotAccounting(app), accounting);
  });
}

test('reduced-motion bullseyes skip replay flight and pass the preference to impact rendering', async () => {
  const app = await appHarness(null, {reducedMotion: true}), {state} = app.api;
  const {pad, coords} = preciseMainDraw(app), baseCamera = {...app.api.camera};pad.emit('pointerup', coords);await app.flush();
  app.until(() => state.mode === 'settling');
  assert.ok(state.cinematic?.reducedMotion);assert.equal(state.cinematic.flightDuration, 0);
  assert.equal(app.api.cinematicFrame().phase, 'impact');
  app.resize(1000, 600);
  assert.deepEqual({...app.api.camera}, {...app.view.desiredFollowCamera(state.shot.position, baseCamera, {w: 1000, h: 600})},
    'reduced motion retains the ordinary impact view without the cinematic camera move');
  const accounting = shotAccounting(app);app.frames(10);
  assert.ok(app.bullseyeFrames.length > 0);
  assert.ok(app.bullseyeFrames.every(frame => frame.at(-1).reducedMotion));
  assert.ok(app.vignetteFrames.every(frame => frame.at(-1).reducedMotion));
  app.until(() => state.mode === 'ready');assert.deepEqual(shotAccounting(app), accounting);
});

test('a new round discards an active replay and old recorded frames without replaying its award', async () => {
  const app = await appHarness(), {state} = app.api;
  const {pad, coords} = preciseMainDraw(app);pad.emit('pointerup', coords);await app.flush();
  app.until(() => state.mode === 'settling');assert.ok(state.cinematic);
  const old = state.shot, coins = app.api.progress.coins;
  app.api.resetRound(app.engine.STAGES[0]);await app.flush();app.frames(3);
  assert.equal(state.cinematic, null);assert.equal(state.shot, null);assert.equal(state.mode, 'ready');
  assert.equal(state.targetMarks.length, 0);assert.equal(state.effects.length, 0);assert.equal(state.used, 0);
  assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'none');
  assert.equal(app.api.progress.coins, coins);assert.equal(app.api.progress.shots, 1);
  assert.equal(old.handled, true);
});

test('a moving-target burst starts one replay after the last arrival using the chosen arrow’s actual impact time', async () => {
  const app = await appHarness({version: 1, coins: 100, ownedBows: [0, 19], bow: 19, lastStage: 5, sound: false});
  const {state} = app.api, {pad, coords} = preciseMainDraw(app);
  pad.emit('pointerup', coords);await app.flush();
  const volley = state.volley;assert.equal(volley.shots.length, 3);
  app.until(() => volley.shots.some(shot => shot.result) && volley.shots.some(shot => shot.active));
  assert.equal(state.cinematic, null);assert.equal(state.score, 0);
  app.until(() => state.mode === 'settling');
  assert.ok(volley.shots.every(shot => !shot.active));
  const replay = state.cinematic, shot = state.shot;
  assert.ok(replay);assert.equal(replay.shot, shot);assert.equal(shot.result.score, 10);
  assert.equal(replay.impactTime, shot.targetMark.born);
  assert.ok(replay.impactTime < state.time, 'the best first arrival predates the last burst arrow');
  const accounting = shotAccounting(app);app.api.onImpact();assert.equal(state.cinematic, replay);
  app.until(() => app.getElement('gameCanvas').dataset.cinematic === 'impact');
  const time = app.api.renderTime(), target = app.engine.targetAt(state.stage, time);
  assert.ok(Math.abs(time - shot.targetMark.born) < 1e-9);
  assert.ok(Math.abs(target.x - shot.result.targetCenter.x) < 1e-9);
  assert.ok(Math.abs(target.y - shot.result.targetCenter.y) < 1e-9);
  app.until(() => state.mode === 'ready');
  assert.deepEqual(shotAccounting(app), accounting);assert.equal(state.targetMarks.length, 3);
});

test('the coach rents for twenty-four server hours and ten 쭈 while its on/off preference survives reload', async () => {
  const app = await appHarness({version: 1, coins: 10000, sound: false}, {coins: 20});
  assert.equal(app.api.coachRemaining(), 0);
  app.api.showShop('bow');assert.match(app.getElement('modalContent').innerHTML, /data-shop-tab="coach"/);
  app.api.showShop('coach');assert.match(app.getElement('modalContent').innerHTML, /10\s*쭈/);assert.match(app.getElement('modalContent').innerHTML, /24시간/);
  modalAction(app, 'buy-coach');modalAction(app, 'buy-coach');await app.flush();
  assert.equal(app.api.progress.coins, 10000);assert.equal(app.ammo.account.coins, 10);
  assert.equal(app.api.coachRemaining(), 86400);assert.equal(app.api.progress.coachEnabled, true);
  assert.equal(app.ammo.requests.filter(request => request.action === 'coach-buy').length, 1);
  const expiry = app.ammo.account.coach_expires_at;
  modalAction(app, 'buy-coach');await app.flush();assert.equal(app.ammo.account.coins, 10);assert.equal(app.ammo.account.coach_expires_at, expiry);
  modalAction(app, 'toggle-coach');assert.equal(app.api.progress.coachEnabled, false);
  const loaded = await appHarness(app.snapshot(), {server: app.ammo});
  assert.equal(loaded.api.progress.coachEnabled, false);assert.ok(loaded.api.coachRemaining() > 0);
  assert.equal(loaded.api.progress.coins, 10000);assert.equal(loaded.ammo.account.coins, 10);
  loaded.api.showShop('coach');modalAction(loaded, 'toggle-coach');
  assert.equal(loaded.api.progress.coachEnabled, true);assert.equal(loaded.ammo.account.coins, 10);
  assert.equal(loaded.snapshot().coachEnabled, true);
  assert.equal(Object.hasOwn(loaded.snapshot(), 'coachOwned'), false, 'local storage cannot grant a rental');
  const poor = await appHarness({version: 1, coins: 99999, coachOwned: true, coachEnabled: true}, {coins: 9});
  assert.equal(poor.api.coachRemaining(), 0, 'a legacy local ownership flag grants no access');
  poor.api.showShop('coach');modalAction(poor, 'buy-coach');await poor.flush();
  assert.equal(poor.api.coachRemaining(), 0);assert.equal(poor.ammo.account.coins, 9);assert.equal(poor.api.progress.coins, 99999);
});

test('an uncertain coach purchase retries one receipt without a second ten-쭈 charge or a longer rental', async () => {
  const app = await appHarness({version: 1, coins: 777, sound: false}, {coins: 20, hold: ['coach-buy']});
  app.api.showShop('coach');modalAction(app, 'buy-coach');modalAction(app, 'buy-coach');await app.flush();
  const requests = app.ammo.requests.filter(request => request.action === 'coach-buy');assert.equal(requests.length, 1);
  const original = requests[0];app.ammo.execute(original);
  const expires = app.ammo.account.coach_expires_at;
  app.ammo.reply(original, {ok: false, reason: 'pending'});await app.flush();
  assert.equal(app.api.coachRemaining(), 0, 'an uncertain local result cannot grant rental access');
  assert.equal(app.ammo.account.coins, 10);assert.equal(app.api.progress.coins, 777);
  modalAction(app, 'buy-coach');await app.flush();
  assert.equal(app.ammo.requests.filter(request => request.action === 'coach-buy').length, 1);
  app.ammo.held.delete('coach-buy');await app.api.retryAmmo();await app.flush();
  const attempts = app.ammo.requests.filter(request => request.action === 'coach-buy');
  assert.equal(attempts.length, 2);assert.equal(attempts[1].requestId, original.requestId);
  assert.equal(app.ammo.account.coins, 10);assert.equal(app.ammo.account.coach_expires_at, expires);
  assert.equal(app.api.coachRemaining(), 86400);assert.equal(app.api.ammo.pending, null);
});

test('coach access expires while the player is drawing without firing or silently renewing it', async () => {
  const app = await appHarness({version: 1, coachEnabled: true, sound: true},
    {coachExpiresAt: new Date(SERVER_EPOCH + 1800).toISOString()});
  const {pad} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  app.until(() => app.api.state.coachSaid, 20);assert.equal(app.speech.utterances.length, 1);
  holdFor(app, 700);
  assert.equal(app.api.coachRemaining(), 0);assert.equal(app.api.state.mode, 'drawing');
  assert.doesNotMatch(app.getElement('powerLabel').textContent, /쏴!/);assert.equal(app.api.state.used, 0);
  pad.emit('pointercancel');
  preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});app.frames(15);
  assert.equal(app.api.state.coachSaid, false);assert.equal(app.speech.utterances.length, 1);
  assert.equal(app.ammo.requests.filter(request => request.action === 'coach-buy').length, 0);
  app.getElement('aimTouchpad').emit('pointercancel');
});

test('resuming a paused clock waits for fresh coach access and never revives the old rental after a failed refresh', async () => {
  for (const failed of [false, true]) {
    const app = await appHarness({version: 1, coachEnabled: true, sound: true}, {coachActive: true});
    const {state} = app.api, expires = app.ammo.account.coach_expires_at;
    assert.equal(app.api.coachRemaining(), 86400);
    app.ammo.held.add('status');
    app.document.hidden = true;app.document.emit('visibilitychange');
    app.document.hidden = false;app.document.emit('visibilitychange');await app.flush();
    const refresh = app.ammo.requests.filter(request => request.action === 'status').at(-1);
    assert.equal(state.coachRefreshing, true);assert.equal(app.api.coachRemaining(), 0);
    preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});app.frames(8);
    assert.equal(state.coachSaid, false);assert.equal(app.speech.utterances.length, 0);
    app.ammo.reply(refresh, failed ? {ok: false, reason: 'unavailable'} : app.ammo.snapshot({
      server_now: new Date(Date.parse(expires) + 1).toISOString(), coach_active: false
    }));
    await app.flush();app.frames(8);
    assert.equal(state.coachRefreshing, false);assert.equal(app.api.coachRemaining(), 0);
    assert.equal(state.coachSaid, false);assert.equal(app.speech.utterances.length, 0);
    assert.doesNotMatch(app.getElement('powerLabel').textContent, /쏴!/);
    app.getElement('aimTouchpad').emit('pointercancel');
    if (failed) {
      const retry = app.api.retryAmmo();await app.flush();
      const request = app.ammo.requests.filter(item => item.action === 'status').at(-1);
      assert.notEqual(request.requestId, refresh.requestId);
      app.ammo.reply(request, app.ammo.snapshot({server_now: new Date(SERVER_EPOCH + 3600000).toISOString(), coach_active: true}));
      await retry;await app.flush();
      assert.equal(app.api.coachRemaining(), 82800, 'a later valid server confirmation can restore the still-active rental');
    }
    assert.ok(app.now < 10000, 'server elapsed hours are independent of the short local performance clock');
    assert.equal(state.used, 0);assert.equal(app.ammo.requests.filter(request => request.action === 'coach-buy').length, 0);
  }
});

test('the rented coach keeps good timing visible and repeats each new opportunity without overlapping voices or firing', async () => {
  const app = await appHarness({version: 1, coins: 100, coachEnabled: true, sound: true}, {coachActive: true});
  const {state} = app.api, {pad} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  assert.equal(state.coachSaid, false);assert.equal(state.coachReady, false);
  const goodAim = {...state.aim}, before = shotAccounting(app);
  app.until(() => app.speech.utterances.length === 1, 20);
  assert.equal(state.coachReady, true);assert.equal(state.coachSaid, true);
  const firstVoice = app.speech.times[0];
  while (app.now - firstVoice < 1100) {
    app.frames(1);
    assert.match(app.getElement('powerLabel').textContent, /코치 · 쏴!/, 'a continuous good window keeps its visual cue');
    assert.equal(app.speech.utterances.length, 1, 'continuous speech does not flood each prediction check');
  }
  app.until(() => app.speech.utterances.length === 2, 30);
  assert.ok(app.speech.times[1] - firstVoice >= 1400 - 1e-8);
  assert.ok(app.speech.times[1] - firstVoice <= 1480);
  assert.deepEqual({...state.aim}, goodAim, 'coach checks never adjust the player’s aim');

  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);
  assert.equal(state.coachCueUntil, 0);assert.doesNotMatch(app.getElement('powerLabel').textContent, /쏴!/);
  assert.equal(state.coachSaid, true, 'having spoken before does not disable later opportunities');
  moveHeldAim(app, goodAim.yaw, goodAim.pitch);app.until(() => state.coachReady, 8);
  assert.ok(app.now - app.speech.times[1] < 450);
  assert.equal(app.speech.utterances.length, 2, 'a quick re-entry respects the minimum voice interval');
  assert.match(app.getElement('powerLabel').textContent, /코치 · 쏴!/);
  app.until(() => app.speech.utterances.length === 3, 30);
  assert.ok(app.speech.times[2] - app.speech.times[1] >= 450 - 1e-8);
  assert.ok(app.speech.times[2] - app.speech.times[1] <= 530, 'a still-good new window speaks after cooldown without waiting for the long repeat');

  // A short good window that disappears during voice cooldown must not leave a
  // delayed command queued for the now-bad aim.
  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);
  moveHeldAim(app, goodAim.yaw, goodAim.pitch);app.until(() => state.coachReady, 8);
  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);holdFor(app, 600);
  assert.equal(app.speech.utterances.length, 3);assert.doesNotMatch(app.getElement('powerLabel').textContent, /쏴!/);
  moveHeldAim(app, goodAim.yaw, goodAim.pitch);app.until(() => app.speech.utterances.length === 4, 8);
  assert.equal(state.mode, 'drawing');assert.equal(state.shot, null);assert.deepEqual(shotAccounting(app), before);
  assert.equal(app.speech.overlaps, 0);
  for (let i = 1; i < app.speech.times.length; i++) assert.ok(app.speech.times[i] - app.speech.times[i - 1] >= 450 - 1e-8);
  assert.ok(app.speech.utterances.every(utterance => utterance.text === '쏴!' && utterance.lang === 'ko-KR'));

  pad.emit('pointercancel');assert.equal(state.coachReady, false);assert.equal(state.coachCueUntil, 0);
  const nextDraw = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  assert.equal(state.coachSaid, false);app.until(() => app.speech.utterances.length === 5, 20);
  assert.equal(state.mode, 'drawing');assert.equal(state.used, 0);
  nextDraw.pad.emit('pointerup', nextDraw.coords);await app.flush();
  assert.equal(state.used, 1);assert.equal(state.mode, 'flight', 'only the player’s release fires the arrow');
});

test('coach evaluates up to sixteen times per second and remains absent when disabled or in gun events', async () => {
  const app = await appHarness({version: 1, coachEnabled: true, sound: true}, {coachActive: true});
  const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');moveHeldAim(app, .4, .5);
  const checks = [];let previous = app.api.state.coachLastCheck;
  for (let i = 0; i < 120; i++) {
    app.frames(1);const next = app.api.state.coachLastCheck;
    if (next !== previous) checks.push(next);previous = next;
  }
  assert.ok(checks.length >= 24 && checks.length <= 32, 'a two-second draw samples promptly without exceeding sixteen checks per second');
  for (let i = 1; i < checks.length; i++) assert.ok(checks[i] - checks[i - 1] >= 62.5 - 1e-8);
  assert.equal(app.speech.utterances.length, 0);pad.emit('pointercancel');
  for (const event of [false, true]) {
    const quiet = await appHarness({version: 1, coachEnabled: event, sound: true}, {coachActive: true});
    if (event) {quiet.api.enterEvent(1);await quiet.flush();}
    const input = quiet.getElement('aimTouchpad');input.emit('pointerdown');holdFor(quiet, 1500);
    assert.equal(quiet.api.state.mode, 'drawing');assert.equal(quiet.api.state.coachSaid, false);
    assert.equal(quiet.api.state.coachLastCheck, -Infinity);assert.equal(quiet.speech.utterances.length, 0);
    assert.equal(quiet.api.state.used, 0);assert.equal(quiet.ammo.requests.filter(request => request.action === 'spend').length, 0);
    input.emit('pointercancel');
    if (event) {quiet.api.showShop('coach');assert.doesNotMatch(quiet.getElement('modalContent').innerHTML, /data-action="buy-coach"|data-action="toggle-coach"/);}
  }
});

test('muted or speech-unavailable coaching still gives the upper cue without firing', async () => {
  for (const options of [{sound: false, speechAvailable: true}, {sound: true, speechAvailable: false}]) {
    const app = await appHarness({version: 1, coachEnabled: true, sound: options.sound}, {speechAvailable: options.speechAvailable, coachActive: true});
    preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});app.until(() => app.api.state.coachSaid, 20);
    assert.match(app.getElement('powerLabel').textContent, /코치 · 쏴!/);
    assert.equal(app.speech.utterances.length, 0);assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.used, 0);
    app.getElement('aimTouchpad').emit('pointercancel');assert.equal(app.api.state.coachCueUntil, 0);
  }
});

test('shop stat choices reorder actual cards while purchases still use stable equipment IDs', async () => {
  const app = await appHarness({ version: 1, coins: 60000, ownedBows: [0], ownedArrows: [0], bow: 0, arrow: 0, sound: false });
  const displayedIds = () => Array.from(app.getElement('modalContent').innerHTML.matchAll(/data-equip="(\d+)"/g), match => Number(match[1]));
  const sort = value => { const select = app.getElement('shopSort');select.tagName = 'SELECT';select.value = value;app.document.emit('change', { target: select }); };
  const filter = value => { const button = app.getElement('weaponFilter');button.tagName = 'BUTTON';button.dataset.weaponFilter = value;app.document.emit('click', { target: button }); };
  const clickBuy = id => { const button = app.getElement('sortedPurchase');button.tagName = 'BUTTON';button.dataset.equip = String(id);app.document.emit('click', { target: button }); };
  const main = app.engine.BOWS.filter(item => item.weaponType !== 'gun');
  app.api.showShop('bow');
  assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(main), item => item.id));
  assert.match(app.getElement('modalContent').innerHTML, /id="shopSort"/);
  assert.match(app.getElement('modalContent').innerHTML, /활 10종 → 일반 단발 석궁 5종 → 레어 3연발 석궁 5종/);
  assert.ok(displayedIds().slice(0, 10).every(id => app.engine.BOWS[id].weaponType === 'bow'));
  assert.ok(displayedIds().slice(10, 15).every(id => app.engine.BOWS[id].weaponType === 'crossbow' && app.engine.BOWS[id].burstCount === 1));
  assert.ok(displayedIds().slice(15).every(id => app.engine.BOWS[id].burstCount === 3));
  filter('crossbow-single');
  assert.equal(displayedIds().length, 5);
  assert.ok(displayedIds().every(id => app.engine.BOWS[id].weaponType === 'crossbow' && app.engine.BOWS[id].burstCount === 1));
  filter('crossbow-burst');
  assert.equal(displayedIds().length, 5);
  assert.ok(displayedIds().every(id => app.engine.BOWS[id].rarity === '레어' && app.engine.BOWS[id].burstCount === 3));
  filter('all');
  sort('steady');
  const durations = displayedIds().map(id => app.engine.BOWS[id].steadyDuration);
  assert.equal(durations[0], 2);assert.equal(durations.at(-1), .5);
  assert.ok(durations.every((duration, index) => index === 0 || duration <= durations[index - 1]));
  assert.match(app.getElement('modalContent').innerHTML, /조준 안정 시간이 긴 순서/);
  sort('grouping');
  assert.deepEqual(displayedIds().slice(0, 5), [19, 18, 17, 16, 15], 'only three-arrow bursts have a grouping comparison; single-shot internal values never outrank them');
  assert.ok(displayedIds().slice(5).every(id => app.engine.BOWS[id].burstCount === 1));
  sort('grip');
  assert.equal(displayedIds()[0], 10);
  assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(main, 'grip'), item => item.id));
  assert.equal(app.api.progress.bow, 0, 'browsing a stat order does not equip or spend');
  assert.equal(app.api.progress.coins, 60000);
  const chosenBow = displayedIds()[0], afterBow = 60000 - app.engine.BOWS[chosenBow].price;
  const chosenCard = Array.from(app.getElement('modalContent').innerHTML.matchAll(/<article\b[\s\S]*?<\/article>/g), match => match[0]).find(card => card.includes(`data-equipment-id="${chosenBow}"`));
  assert.ok(chosenCard.includes(app.engine.BOWS[chosenBow].price.toLocaleString('ko-KR')), 'large prices stay readable in the card for that ID');
  clickBuy(chosenBow);
  assert.equal(app.api.progress.bow, chosenBow);
  assert.equal(app.api.progress.coins, afterBow);
  assert.ok(app.api.progress.ownedBows.includes(chosenBow));
  assert.ok(!app.api.progress.ownedBows.includes(1), 'the first rendered position is not mistaken for a legacy array index');
  sort('elasticity');
  assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(main, 'elasticity'), item => item.id));
  assert.equal(app.api.progress.coins, afterBow);
  app.api.showShop('arrow');
  assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(app.engine.ARROWS), item => item.id), 'an incompatible weapon sort resets when viewing arrows');
  for (const key of ['wind', 'stability', 'tip-light', 'tip-heavy']) {
    sort(key);
    assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(app.engine.ARROWS, key), item => item.id));
    const explanations = {wind: '나무 화살을 100%', stability: '속도 편차가 작아요', 'tip-light': '촉이 가벼운 순서', 'tip-heavy': '촉이 무거운 순서'};
    assert.ok(app.getElement('modalContent').innerHTML.includes(explanations[key]), 'the selected stat explains what the order means');
    assert.equal(app.api.progress.arrow, 0);
    assert.equal(app.api.progress.coins, afterBow);
  }
  sort('wind');
  assert.equal(displayedIds()[0], 11);
  clickBuy(11);
  const afterArrow = afterBow - app.engine.ARROWS[11].price;
  assert.equal(app.api.progress.arrow, 11);
  assert.equal(app.api.progress.coins, afterArrow);
  clickBuy(11);assert.equal(app.api.progress.coins, afterArrow, 're-equipping a bought arrow never charges again');
  app.api.showShop('bow');
  assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(main), item => item.id));
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.bow, chosenBow);assert.equal(reloaded.api.progress.arrow, 11);
  assert.equal(reloaded.api.progress.coins, afterArrow);
  app.api.closeModal();app.api.enterEvent(1);await app.flush();app.api.showShop('bow');sort('progression');
  assert.deepEqual(displayedIds(), [20, 21, 22, 23, 24], 'event guns follow the requested magazine and reload sequence');
  const gunHtml = app.getElement('modalContent').innerHTML;
  assert.doesNotMatch(gunHtml, /출력/);
  assert.doesNotMatch(gunHtml, /value="elasticity"/);
  for (const label of ['2발 · 느림', '2발 · 빠름', '4발 · 느림', '4발 · 빠름', '10발 탄창']) assert.ok(gunHtml.includes(label), `${label} is visible on its functional tag`);
  sort('magazine');assert.deepEqual(displayedIds(), [24, 22, 23, 20, 21]);
  sort('reload');assert.deepEqual(displayedIds(), [21, 23, 24, 20, 22]);
  sort('grip');assert.deepEqual(displayedIds(), [24, 22, 23, 20, 21]);
  assert.equal(app.api.progress.eventGun, 20, 'sorting gun functions never changes the selected gun');
  assert.equal(app.api.progress.bow, chosenBow);assert.equal(app.api.progress.arrow, 11);
  assert.equal(app.api.progress.coins, afterArrow, 'all new filters and function sorts only change the shop view');
});

test('current-journey saves retain bought gear, selected IDs and bound scopes', async () => {
  const app = await appHarness({ version: 1, coins: 5, ownedBows: [0, 3, 19], ownedArrows: [0, 11], bow: 19, arrow: 11, scopedBows: [19], lastStage: 23, best: { 12: 41 }, sound: false });
  assert.equal(app.api.activeBow().id, 19);assert.equal(app.api.activeArrow().id, 11);
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [19]);
  assert.equal(app.api.progress.coins, 5);
  app.api.showShop('bow');app.api.equipItem(3);app.api.equipItem(19);
  app.api.showShop('arrow');app.api.equipItem(0);app.api.equipItem(11);
  assert.equal(app.api.progress.coins, 5, 'owned equipment does not require the newly increased price');
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.activeBow().id, 19);assert.equal(reloaded.api.activeArrow().id, 11);
  assert.deepEqual(Array.from(reloaded.api.progress.scopedBows), [19]);
  assert.equal(reloaded.api.progress.coins, 5);assert.equal(reloaded.api.progress.lastStage, 23);
  assert.deepEqual({ ...reloaded.api.progress.best }, { 12: 41 });
});

test('new equipment purchases survive reload within the fresh journey', async () => {
  const app = await appHarness({
    version: 1, coins: 100000, ownedBows: [0, 1, 3], ownedArrows: [0, 2, 3], bow: 3, arrow: 2,
    unlocked: 7, lastStage: 5, best: { 1: 50, 4: 38 }, shots: 29, hits: 20, sound: false
  });
  assert.equal(app.api.activeBow().id, 3);assert.equal(app.api.activeArrow().id, 2);
  assert.equal(app.engine.BOWS.filter(item => item.weaponType === 'bow').length, 10);
  assert.equal(app.engine.BOWS.filter(item => item.weaponType === 'crossbow').length, 10);
  assert.equal(app.engine.BOWS.filter(item => item.weaponType === 'gun').length, 5);
  const mainWeapons = app.engine.BOWS.filter(item => item.weaponType !== 'gun');
  let expectedCoins = 100000;
  for (const [kind, catalog, ownedKey] of [
    ['bow', mainWeapons, 'ownedBows'], ['arrow', app.engine.ARROWS, 'ownedArrows']
  ]) {
    assert.equal(catalog.length, kind === 'bow' ? 20 : 14, `all ${kind} choices must be available`);
    app.api.showShop(kind);
    for (const id of [...new Set([4, 11, catalog.at(-1).id])]) {
      const item = catalog.find(item => item.id === id);
      assert.ok(item, `${kind} ${id} exists beyond the original four items`);
      app.api.equipItem(id);expectedCoins -= item.price;
      assert.equal(app.api.progress[kind], id);
      assert.equal(app.api.progress.coins, expectedCoins);
      app.api.equipItem(0);app.api.equipItem(id);
      assert.equal(app.api.progress.coins, expectedCoins, 'owned equipment never charges again');
      assert.equal(app.api.progress[ownedKey].filter(value => value === id).length, 1);
    }
  }
  const reloaded = await appHarness(app.snapshot());
  assert.deepEqual(Array.from(reloaded.api.progress.ownedBows).sort((a,b) => a-b), [0, 1, 3, 4, 11, mainWeapons.at(-1).id, 20]);
  assert.deepEqual(Array.from(reloaded.api.progress.ownedArrows), [0, 2, 3, 4, 11, 13]);
  assert.equal(reloaded.api.activeBow().id, mainWeapons.at(-1).id);assert.equal(reloaded.api.activeArrow().id, 13);
  assert.equal(reloaded.api.progress.coins, expectedCoins);
  assert.equal(reloaded.api.progress.unlocked, 50);assert.equal(reloaded.api.state.stage.id, 5);
  assert.deepEqual({ ...reloaded.api.progress.best }, { 1: 50, 4: 38 });
  assert.equal(reloaded.api.progress.shots, 29);assert.equal(reloaded.api.progress.hits, 20);
});

test('expanded save validation accepts real catalog IDs and rejects invalid or unowned equipment', async () => {
  const app = await appHarness({
    version: 1, coins: 456, ownedBows: [0, 4, 11, 14, 14, -1, 999, 1.5, '14', null],
    ownedArrows: [0, 5, 10, 12, 13, -1, 14, '10'], bow: 14, arrow: 11, unlocked: 3, lastStage: 2
  });
  assert.deepEqual(Array.from(app.api.progress.ownedBows), [0, 4, 11, 14, 20]);
  assert.deepEqual(Array.from(app.api.progress.ownedArrows), [0, 5, 10, 12, 13]);
  assert.equal(app.api.activeBow().id, 14);
  assert.equal(app.api.activeArrow().id, 0, 'a real but unowned arrow cannot be restored');
  for (const kind of ['bow', 'arrow']) {
    app.api.showShop(kind);
    const before = app.api.progress[kind];
    const catalog = kind === 'bow' ? app.engine.BOWS : app.engine.ARROWS;
    for (const id of [-1, catalog.length, 999, NaN]) app.api.equipItem(id);
    assert.equal(app.api.progress[kind], before);
    assert.equal(app.api.progress.coins, 456);
  }
  assert.equal(app.api.progress.unlocked, 50);assert.equal(app.api.state.stage.id, 2);
});

test('all fifty stages are freely selectable while current-journey coins and records survive', async () => {
  const app = await appHarness({ version: 1, coins: 375, unlocked: 12, lastStage: 12, best: { 1: 50, 12: 42 }, shots: 80, hits: 63 });
  assert.equal(app.engine.STAGES.length, 50);
  const ids = html => Array.from(html.matchAll(/data-stage="(\d+)"/g), match => Number(match[1]));
  const expected = Array.from({ length: 50 }, (_, i) => i + 1);
  assert.deepEqual(ids(app.getElement('journeySteps').innerHTML), expected);
  assert.doesNotMatch(app.getElement('journeyCaption').textContent, /마지막 사격장까지 열린/, 'the former final stage is no longer the end of the journey');
  app.getElement('menuBtn').emit('click');modalAction(app, 'stages');
  assert.equal(app.api.state.modal, 'stages');
  const html = app.getElement('modalContent').innerHTML;
  assert.deepEqual(ids(html), expected);
  const expectedChapters = ['고정', '움직이는', '벽', '기둥', '토끼', '살쾡이', '사슴', '비둘기', '독수리', '치타'];
  for (const label of expectedChapters) assert.ok(html.includes(label), `${label} practice is recognizable in the stage picker`);
  assert.equal((html.match(/class="stage-section-title"/g) || []).length, 13, 'each learned type has its own section plus advanced practice');
  assert.deepEqual(Array.from(html.matchAll(/data-stage-range="(\d+)"/g), match => Number(match[1])), [1, 5, 9, 21, 25, 49]);
  for (const match of html.matchAll(/<button\b[^>]*data-stage="(\d+)"[^>]*>/g)) {
    assert.equal(/\bdisabled\b/.test(match[0]), false, `stage ${match[1]} is available without a passing score`);
  }
  const button = app.getElement('selectorStage');button.tagName = 'BUTTON';
  button.dataset.stage = '13';app.document.emit('click', { target: button });
  assert.equal(app.api.state.stage.id, 13, 'a formerly locked selection is now accepted by the handler');
  await app.flush();app.getElement('menuBtn').emit('click');modalAction(app, 'stages');
  button.dataset.stage = '11';app.document.emit('click', { target: button });
  assert.equal(app.api.state.stage.id, 11);assert.equal(app.snapshot().lastStage, 11);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.unlocked, 50);assert.equal(reloaded.api.state.stage.id, 11);
  assert.equal(reloaded.api.progress.coins, 375);
  assert.deepEqual({ ...reloaded.api.progress.best }, { 1: 50, 12: 42 });
  assert.equal(reloaded.api.progress.shots, 80);assert.equal(reloaded.api.progress.hits, 63);
});

test('the Next button reaches stage fifty and final-stage records survive reload without creating stage fifty-one', async () => {
  const app = await appHarness({ version: 1, coins: 500, ownedBows: [0, 11], ownedArrows: [0, 11], scopedBows: [11], bow: 11, arrow: 11, unlocked: 49, lastStage: 49, best: { 12: 44 } });
  const complete = async () => {
    app.api.state.score = 50;app.api.state.used = 5;app.api.state.hits = 5;
    app.api.finishRound();await app.flush();
    assert.equal(app.api.state.mode, 'finished');
  };
  assert.equal(app.api.state.stage.id, 49);await complete();
  assert.equal(app.api.progress.unlocked, 50);
  assert.equal(app.api.progress.best[49], 50);
  assert.match(app.getElement('modalContent').innerHTML, /data-action="next-stage"/);
  const next = app.getElement('nextStage');next.tagName = 'BUTTON';next.dataset.action = 'next-stage';
  app.document.emit('click', { target: next });
  assert.equal(app.api.state.stage.id, 50, 'the actual Next button must advance beyond the former twelve-stage cap');
  assert.equal(app.snapshot().lastStage, 50);
  app.api.startStage(51);await app.flush();assert.equal(app.api.state.stage.id, 50);
  await complete();
  assert.equal(app.api.progress.unlocked, 50, 'the final clear never creates stage fifty-one');
  assert.equal(app.api.progress.best[50], 50);
  assert.match(app.getElement('modalContent').innerHTML, /data-action="next-stage" disabled/);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.unlocked, 50);assert.equal(reloaded.api.state.stage.id, 50);
  assert.equal(reloaded.api.progress.coins, 550, 'both newly cleared stages retain their completion bonuses');
  assert.deepEqual({ ...reloaded.api.progress.best }, { 12: 44, 49: 50, 50: 50 });
  assert.equal(reloaded.api.activeBow().id, 11);assert.equal(reloaded.api.activeArrow().id, 11);
  assert.deepEqual(Array.from(reloaded.api.progress.scopedBows), [11]);
});

test('main results offer previous, current and next with safe first and last boundaries and exactly one new registration', async () => {
  for (const stage of [1, 25, 50]) for (const [action, delta] of [['previous-stage', -1], ['retry', 0], ['next-stage', 1]]) {
    const app = await appHarness({ version: 1, coins: 345, lastStage: stage, mainRounds: 2, sound: false });
    const state = app.api.state;
    state.score = 0;state.used = 5;app.api.finishRound();await app.flush();
    assert.equal(state.mode, 'finished');assert.equal(state.modal, 'result');
    assert.equal(app.api.progress.mainRounds, 3);
    const html = app.getElement('modalContent').innerHTML;
    const choices = Array.from(html.matchAll(/<button\b[^>]*data-action="(previous-stage|retry|next-stage)"[^>]*>/g), match => [match[1], match[0]]);
    assert.deepEqual(choices.map(([name]) => name), ['previous-stage', 'retry', 'next-stage']);
    assert.match(html, /이전 단계/);assert.match(html, /지금 단계/);assert.match(html, /다음 단계/);
    const disabled = stage + delta < 1 || stage + delta > 50;
    assert.equal(/\bdisabled\b/.test(choices.find(([name]) => name === action)[1]), disabled);
    const starts = app.ammo.requests.filter(request => request.action === 'round-start').length, epoch = state.roundEpoch;
    modalAction(app, action);modalAction(app, action);await app.flush();
    if (disabled) {
      assert.equal(state.stage.id, stage);assert.equal(state.mode, 'finished');assert.equal(state.modal, 'result');
      assert.equal(state.roundEpoch, epoch);assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts);
    } else {
      assert.equal(state.isEvent, false);assert.equal(state.stage.id, stage + delta);
      assert.equal(state.used, 0);assert.equal(state.score, 0);assert.equal(state.modal, null);
      assert.equal(state.roundEpoch, epoch + 1);
      assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts + 1,
        'a repeated click on the old result registers only the explicitly selected round');
      assert.equal(app.snapshot().lastStage, stage + delta);
    }
    assert.equal(app.api.progress.mainRounds, 3);assert.equal(app.api.progress.coins, 345);
  }
});

test('event result choices return to the completed MAIN stage and never replay or navigate event levels', async () => {
  for (const [stage, action, expected] of [[17, 'previous-stage', 16], [17, 'retry', 17], [17, 'next-stage', 18], [1, 'previous-stage', 1], [50, 'next-stage', 50]]) {
    const app = await appHarness({ version: 1, coins: 123, lastStage: stage, mainRounds: 5, sound: false });
    const state = app.api.state;
    app.api.enterEvent(3);await app.flush();state.time = state.stage.eventDuration - .001;app.frames();
    assert.equal(state.mode, 'finished');assert.equal(state.hits, 0);assert.equal(state.score, 0);
    assert.equal(Number(app.getElement('scoreCount').textContent), 0);assert.equal(app.getElement('scoreUnit').textContent, '개');
    const html = app.getElement('modalContent').innerHTML;
    assert.match(html, /표적 0개 격파/);
    assert.deepEqual(Array.from(html.matchAll(/data-action="(previous-stage|retry|next-stage)"/g), match => match[1]), ['previous-stage', 'retry', 'next-stage']);
    assert.doesNotMatch(html, /data-action="(?:event-next|next-event|retry-event|enter-event)"/);
    const tag = html.match(new RegExp('<button\\b[^>]*data-action="' + action + '"[^>]*>'))?.[0];
    assert.ok(tag);
    const disabled = stage === 1 && action === 'previous-stage' || stage === 50 && action === 'next-stage';
    assert.equal(/\bdisabled\b/.test(tag), disabled);
    const starts = app.ammo.requests.filter(request => request.action === 'round-start').length;
    modalAction(app, action);modalAction(app, action);await app.flush();
    if (disabled) {
      assert.equal(state.isEvent, true);assert.equal(state.mode, 'finished');assert.equal(state.modal, 'result');
      assert.equal(state.stage.eventLevel, 3);
      assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts);
    } else {
      assert.equal(state.isEvent, false);assert.equal(state.stage.id, expected);assert.equal(state.modal, null);
      assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts + 1);
    }
    assert.equal(app.api.progress.eventPlays, 1);assert.equal(app.api.progress.mainRounds, 5);assert.equal(app.api.progress.coins, 123);
  }
});

test('results survive shop, menu and help visits and all dismissal paths without an accidental replay', async () => {
  for (const event of [false, true]) {
    const app = await appHarness({ version: 1, coins: 123, lastStage: 17, mainRounds: 2, sound: false });
    const state = app.api.state;
    if (event) { app.api.enterEvent(3);await app.flush(); }
    state.score = 0;state.used = 5;app.api.finishRound();await app.flush();
    const summary = { ...state.resultSummary }, original = { epoch: state.roundEpoch, used: state.used, score: state.score, earned: state.earned, mainRounds: app.api.progress.mainRounds, eventPlays: app.api.progress.eventPlays };
    const starts = app.ammo.requests.filter(request => request.action === 'round-start').length;
    assert.ok(state.resultSummary, 'a completed result has a retained summary');
    const unchanged = () => {
      assert.equal(state.mode, 'finished');assert.equal(state.modal, 'result');assert.deepEqual({ ...state.resultSummary }, summary);
      assert.deepEqual({ epoch: state.roundEpoch, used: state.used, score: state.score, earned: state.earned, mainRounds: app.api.progress.mainRounds, eventPlays: app.api.progress.eventPlays }, original);
      assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts);
      assert.deepEqual(Array.from(app.getElement('modalContent').innerHTML.matchAll(/data-action="(previous-stage|retry|next-stage)"/g), match => match[1]), ['previous-stage', 'retry', 'next-stage']);
    };
    for (const close of [() => app.getElement('modalClose').emit('click'), () => app.getElement('modalBackdrop').emit('click'), () => app.document.emit('keydown', { code: 'Escape' }), () => modalAction(app, 'close')]) {
      close();await app.flush();unchanged();
      modalAction(app, 'result-shop');assert.equal(state.modal, 'shop');assert.equal(state.mode, 'finished');
      close();await app.flush();unchanged();
    }
    const shop = app.getElement('visibleWeaponShop');shop.tagName = 'BUTTON';shop.classList.add('shop-open');
    app.document.emit('click', { target: shop });assert.equal(state.modal, 'shop');app.api.closeModal();await app.flush();unchanged();
    for (const [action, modal] of event ? [['help', 'help'], ['ammo-shop', 'ammo']] : [['help', 'help'], ['stages', 'stages']]) {
      app.getElement('menuBtn').emit('click');assert.equal(state.modal, 'menu');modalAction(app, action);
      assert.equal(state.modal, modal);app.document.emit('keydown', { code: 'Escape' });await app.flush();unchanged();
    }
    app.getElement('menuBtn').emit('click');assert.equal(state.modal, 'menu');
    assert.doesNotMatch(app.getElement('modalContent').innerHTML, /data-action="(?:enter-event|start-event|event-start|event-next|next-event|retry-event)"/);
    const sound = app.api.progress.sound;modalAction(app, 'toggle-sound');
    assert.equal(state.modal, 'menu');assert.equal(app.api.progress.sound, !sound);assert.equal(state.mode, 'finished');
    app.api.closeModal();await app.flush();unchanged();
  }
});

test('both equipment shops show independent traits and speeds for the currently equipped combination', async () => {
  const app = await appHarness({ version: 1, coins: 0, ownedBows: [0, 1, 2, 11], ownedArrows: [0, 1, 2, 11], bow: 1, arrow: 0 });
  const clean = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const cards = html => Array.from(html.matchAll(/<article\b[\s\S]*?<\/article>/g), match => clean(match[0]));
  const speed = (bow, arrow) => app.engine.getSpeed({ bow, arrow, charge: 1, velocityBias: 0 }).toFixed(1) + ' m/s';
  const mainWeapons = app.engine.BOWS.filter(item => item.weaponType !== 'gun');
  for (const [kind, catalog] of [['bow', mainWeapons], ['arrow', app.engine.ARROWS]]) {
    app.api.showShop(kind);
    const html = app.getElement('modalContent').innerHTML, displayed = cards(html);
    assert.equal(displayed.length, catalog.length, 'every catalog entry is reachable in the shop');
    assert.equal((html.match(/data-equip="\d+"/g) || []).length, catalog.length);
    assert.match(clean(html), new RegExp(`무기\\s*${mainWeapons.length}\\s*종?`));
    assert.ok(clean(html).includes(`화살 ${app.engine.ARROWS.length}종`));
    const combination = clean(html.match(/<div class="shop-loadout">[\s\S]*?<\/div>/)?.[0] || '');
    assert.ok(combination.includes(app.api.activeBow().name) && combination.includes(app.api.activeArrow().name));
    assert.ok(combination.includes(speed(app.api.activeBow(), app.api.activeArrow())), 'the shop identifies the current comparison loadout');
    for (const item of catalog) {
      const card = displayed.find(text => text.includes(item.name));
      assert.ok(card, `${item.name} has a shop card`);
      if (kind === 'bow') {
        assert.match(card, new RegExp(`그립감\\s*${item.grip}(?:\\s|/)`));
        assert.match(card, new RegExp(`탄성\\s*${item.elasticity}(?:\\s|/)`));
        assert.ok(card.includes(speed(item, app.api.activeArrow())), 'bow speed uses the equipped arrow mass');
      } else {
        assert.match(card, new RegExp(`촉\\s*무게\\s*${item.tipMass}\\s*g`));
        assert.ok(card.includes(item.fletching.name));
        assert.ok(card.includes(`바람 영향 ${Math.round(app.engine.getWindResponse(item) * 100)}%`), 'wind comparison reflects both the point mass and wing resistance');
        const nominal = app.engine.getSpeed({ bow: app.api.activeBow(), arrow: item, charge: 1, velocityBias: 0 });
        const high = app.engine.getSpeed({ bow: app.api.activeBow(), arrow: item, charge: 1, velocityBias: 1 });
        const variancePercent = Math.round((high / nominal - 1) * 1000) / 10;
        assert.ok(card.includes(`속도 편차 ±${variancePercent}%`), 'the shown variation matches the actual launch-speed spread');
        assert.ok(card.includes(speed(app.api.activeBow(), item)), 'arrow speed uses the equipped bow elasticity');
      }
    }
  }
  const firstSpeed = app.getElement('loadoutSpeed').textContent;
  app.api.equipItem(1);
  assert.notEqual(app.getElement('loadoutSpeed').textContent, firstSpeed, 'changing the point mass changes the displayed combination speed');
  assert.ok(app.getElement('loadoutSpeed').textContent.includes(speed(app.api.activeBow(), app.api.activeArrow())));
  assert.equal(app.getElement('bowStat').textContent, `그립감 ${app.api.activeBow().grip} · 탄성 ${app.api.activeBow().elasticity}`);
  assert.equal(app.getElement('arrowStat').textContent, `촉 ${app.api.activeArrow().tipMass}g · ${app.api.activeArrow().fletching.name}`);
  app.api.closeModal();await app.flush();
  const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');app.frames(78);pad.emit('pointerup');await app.flush();
  assert.equal(app.api.state.shot.speed.toFixed(1) + ' m/s', speed(app.api.activeBow(), app.api.activeArrow()), 'the released arrow uses the same selected equipment as the displayed speed');
});

test('scope purchases charge once for each owned compatible bow and stay bound across reload', async () => {
  const app = await appHarness({ version: 1, coins: 10000, ownedBows: [0, 3, 7, 10], ownedArrows: [0], bow: 3, arrow: 0 });
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [], 'legacy saves have no scopes installed');
  app.api.showShop('bow');
  for (const id of [0, 9, -1, 12, '3']) app.api.installScope(id);
  assert.equal(app.api.progress.coins, 10000, 'incompatible, unowned and invalid bows cannot receive a scope');
  assert.deepEqual(Array.from(app.api.progress.scopedBows), []);
  let coins = 10000;
  for (const id of [3, 7, 10]) {
    app.api.equipItem(id);
    assert.ok(!app.api.progress.scopedBows.includes(id), 'another bow must purchase its own scope');
    assert.match(app.getElement('modalContent').innerHTML, new RegExp(`data-install-scope="${id}"`));
    app.api.installScope(id);coins -= app.engine.BOWS[id].scopePrice;
    assert.equal(app.api.progress.coins, coins);
    assert.equal(app.api.progress.bow, id, 'mounting a scope keeps the selected bow');
    assert.equal(app.api.state.zoom, 3, 'buying a scope immediately activates its threefold view');
    assert.equal(app.getElement('zoomBtn').textContent, '조준경 3×');
    const html = app.getElement('modalContent').innerHTML;
    const card = Array.from(html.matchAll(/<article\b[\s\S]*?<\/article>/g), match => match[0]).find(card => card.includes(app.engine.BOWS[id].name));
    assert.match(card, /이 장비에 장착됨/);
    assert.doesNotMatch(card, /data-install-scope=/, 'an installed scope cannot be purchased twice');
    app.api.installScope(id);
    assert.equal(app.api.progress.coins, coins);
    assert.equal(app.api.progress.scopedBows.filter(value => value === id).length, 1);
  }
  const saved = app.snapshot(), reloaded = await appHarness(saved);
  assert.deepEqual(Array.from(reloaded.api.progress.scopedBows), [3, 7, 10]);
  assert.equal(reloaded.api.progress.coins, coins);assert.equal(reloaded.api.activeBow().id, 10);
  assert.equal(reloaded.api.state.zoom, 3, 'a saved scoped weapon starts with the scope active');
  const sanitized = await appHarness({ ...saved, scopedBows: [0, 3, 7, 10, 10, 9, 11, -1, 12, '3', null] });
  assert.deepEqual(Array.from(sanitized.api.progress.scopedBows), [3, 7, 10], 'invalid and unowned scope bindings are discarded');
  const poor = await appHarness({ version: 1, coins: app.engine.BOWS[10].scopePrice - 1, ownedBows: [0, 10], bow: 10 });
  poor.api.installScope(10);
  assert.deepEqual(Array.from(poor.api.progress.scopedBows), []);
  assert.equal(poor.api.progress.coins, app.engine.BOWS[10].scopePrice - 1, 'insufficient coins never install or partly charge for a scope');
});

test('mounted scopes provide real threefold zoom only on the bow that owns them', async () => {
  const app = await appHarness({ version: 1, coins: 0, ownedBows: [0, 3, 7, 10], ownedArrows: [0], bow: 3, scopedBows: [3, 10] });
  const zoom = app.getElement('zoomBtn'), baseFocal = Math.min(app.viewport.width * 1.08, app.viewport.height * 1.5);
  const clickZoom = expected => {
    zoom.emit('click');app.frames();
    assert.equal(app.api.state.zoom, expected);
    assert.equal(app.api.camera.focal, baseFocal * expected, 'zoom changes the actual perspective focal length');
  };
  app.frames();assert.equal(app.api.state.zoom, 3);
  assert.equal(app.api.camera.focal, baseFocal * 3);
  assert.equal(zoom.textContent, '조준경 3×');
  assert.equal(app.getElement('gameCanvas').dataset.scope, 'active');
  clickZoom(1);clickZoom(2);clickZoom(3);
  app.api.showShop('bow');
  zoom.emit('click');assert.equal(app.api.state.zoom, 3, 'shop interactions cannot change the aiming zoom');
  app.api.equipItem(7);app.frames();
  assert.equal(app.api.state.zoom, 2, 'equipping an unscoped bow clamps a previous 3× view');
  assert.equal(app.api.camera.focal, baseFocal * 2);
  assert.equal(app.getElement('gameCanvas').dataset.scope, 'none');
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [3, 10], 'the scope does not move with equipment selection');
  app.api.closeModal();await app.flush();clickZoom(1);clickZoom(2);clickZoom(1);
  app.api.showShop('bow');app.api.equipItem(10);app.api.closeModal();await app.flush();
  app.frames();assert.equal(app.api.state.zoom, 3);
  assert.equal(app.api.camera.focal, baseFocal * 3);
  assert.equal(app.getElement('gameCanvas').dataset.scope, 'active', 'a separately scoped crossbow restores its own 3× view');
  app.api.showShop('bow');app.api.equipItem(0);app.api.closeModal();await app.flush();
  assert.equal(app.api.state.zoom, 2);
  clickZoom(1);clickZoom(2);clickZoom(1);
});

for (const [width, height] of [[1000, 600], [390, 410], [844, 280]]) {
  test(`scope purchase triples the visible target radius and preserves aim and controls in a ${width}×${height} view`, async () => {
    const app = await appHarness({ version: 1, coins: 10000, ownedBows: [0, 3], ownedArrows: [0, 1], bow: 3 });
    const staticStage = app.engine.STAGES.find(stage => stage.kind === 'target' && !stage.motion?.amplitudeX && !stage.motion?.amplitudeY && !stage.obstacles.length && stage.distance >= 28);
    assert.ok(staticStage, 'the range includes an unobstructed static target for checking magnification');
    app.resize(width, height);app.api.startStage(staticStage.id);await app.flush();
    const {state} = app.api, originalAim = {...state.aim};
    const target = app.engine.targetAt(state.stage, state.time);
    const dimensions = () => {
      const center = app.api.project(target);
      return {
        ...center,
        rx: app.api.project({...target, x: target.x + target.radius}).x - center.x,
        ry: center.y - app.api.project({...target, y: target.y + target.radius}).y
      };
    };
    const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} versus ${expected}`);
    const original = dimensions();
    app.api.showShop('bow');app.api.installScope(3);
    const enlarged = dimensions();
    assert.equal(state.zoom, 3);
    close(enlarged.rx, original.rx * 3, 'the target is three times wider on the screen');
    close(enlarged.ry, original.ry * 3, 'the target is three times taller on the screen');
    close(enlarged.x, original.x, 'the aimed target stays at the same horizontal point');
    close(enlarged.y, original.y, 'the aimed target stays at the same vertical point');
    assert.deepEqual({...state.aim}, originalAim, 'magnification never changes the physical firing direction');
    assert.ok(enlarged.x - enlarged.rx > 0 && enlarged.x + enlarged.rx < width);
    assert.ok(enlarged.y - enlarged.ry > 0 && enlarged.y + enlarged.ry < height);
    app.api.closeModal();await app.flush();
    const pad = app.getElement('aimTouchpad'), expectedYaw = state.aim.yaw + .04, expectedPitch = state.aim.pitch + .02;
    pad.emit('pointerdown', { clientX: width * .51, clientY: height * .68 });
    moveHeldAim(app, expectedYaw, expectedPitch);pad.emit('pointercancel');
    close(state.aim.yaw, expectedYaw, 'the scoped joystick preserves horizontal control');
    close(state.aim.pitch, expectedPitch, 'the scoped joystick preserves vertical control');
    const aimPoint = {x: Math.tan(state.aim.yaw) * target.z, y: app.engine.PLAYER.y + Math.tan(state.aim.pitch) / Math.cos(state.aim.yaw) * target.z, z: target.z};
    const anchor = app.api.project(aimPoint), zoom = app.getElement('zoomBtn');
    for (const value of [1, 2, 3]) {
      zoom.emit('click');
      assert.equal(state.zoom, value, 'manual onefold, twofold and threefold views remain available');
      const point = app.api.project(aimPoint);
      close(point.x, anchor.x, 'zoom keeps the current aim at its horizontal screen position');
      close(point.y, anchor.y, 'zoom keeps the current aim at its vertical screen position');
    }
    app.getElement('recenterBtn').emit('click');
    close(dimensions().x, original.x, 'recentring restores the target horizontally at threefold zoom');
    close(dimensions().y, original.y, 'recentring restores the target vertically at threefold zoom');
    zoom.emit('click');app.api.showShop('arrow');app.api.equipItem(1);
    assert.equal(state.zoom, 1, 'changing an arrow preserves a manually selected zoom');
    app.api.showShop('bow');app.api.equipItem(3);
    assert.equal(state.zoom, 3, 'selecting the scoped weapon again activates its scope');
    assert.equal(state.used, 0, 'scope and drag-cancel interactions never consume a shot');
  });
}

test('installing a scope on an unequipped weapon leaves the current weapon and view unchanged', async () => {
  const app = await appHarness({ version: 1, coins: 10000, ownedBows: [0, 3, 7], ownedArrows: [0], bow: 0 });
  const originalCamera = {...app.api.camera};
  app.api.showShop('bow');app.api.installScope(3);
  assert.equal(app.api.activeBow().id, 0);assert.equal(app.api.state.zoom, 1);
  assert.deepEqual({...app.api.camera}, originalCamera);
  app.api.equipItem(7);assert.equal(app.api.state.zoom, 1, 'an unscoped weapon cannot borrow another weapon’s scope');
  app.api.equipItem(3);assert.equal(app.api.state.zoom, 3);
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [3]);
});

test('new main rounds and event rounds automatically activate only their equipped weapon’s bound scope', async () => {
  const app = await appHarness({ version: 1, coins: 0, ownedBows: [0, 3, 22], ownedArrows: [0], bow: 3, eventGun: 22, scopedBows: [3, 22] });
  app.getElement('zoomBtn').emit('click');assert.equal(app.api.state.zoom, 1);
  app.api.startStage(3);await app.flush();assert.equal(app.api.state.zoom, 3);
  app.api.enterEvent(1);await app.flush();assert.equal(app.api.state.zoom, 3);
  app.getElement('zoomBtn').emit('click');assert.equal(app.api.state.zoom, 1);
  app.api.enterEvent(2);await app.flush();assert.equal(app.api.state.zoom, 3);
  app.api.exitEvent();await app.flush();assert.equal(app.api.state.zoom, 3);
  assert.equal(app.api.activeBow().id, 3);
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [3, 22], 'round changes never transfer or duplicate a scope');
});

test('only rare crossbows burst, with delayed arrows and one score, reward and round slot per trigger', async () => {
  const ordinary = await appHarness({ version: 1, coins: 100000, sound: false });
  const single = ordinary.engine.BOWS.find(item => item.weaponType === 'crossbow' && item.burstCount === 1);
  ordinary.api.showShop('bow');ordinary.api.equipItem(single.id);ordinary.api.closeModal();await ordinary.flush();
  const ordinaryDraw = startCenteredDraw(ordinary);ordinaryDraw.pad.emit('pointerup', ordinaryDraw.coords);await ordinary.flush();
  assert.equal(ordinary.api.state.volley, null, 'an ordinary crossbow fires one physical arrow');
  assert.equal(ordinary.api.state.used, 1);
  ordinary.until(() => ordinary.api.state.mode === 'ready');
  assert.equal(ordinary.api.state.targetMarks.length, 1);assert.equal(ordinary.api.state.score, 10);

  const app = await appHarness({ version: 1, coins: 100000, sound: false });
  const rare = app.engine.BOWS.filter(item => item.weaponType === 'crossbow' && item.burstCount === 3).at(-1);
  app.api.showShop('bow');app.api.equipItem(rare.id);app.api.closeModal();await app.flush();
  const initialCoins = app.api.progress.coins;
  assert.equal(app.getElement('shotCountLabel').textContent, '5회 남음 · 3연발');
  const { pad, coords } = startCenteredDraw(app), state = app.api.state;
  app.advanceTo(state.drawStarted + 10000, { frame: false });
  const volley = state.volley;
  assert.equal(state.mode, 'flight');assert.equal(state.used, 1);assert.equal(volley.shots.length, 3);
  assert.equal(new Set(volley.shots).size, 3, 'each projectile has independent physics state');
  assert.deepEqual(Array.from(volley.shots, shot => shot.launchDelay), [0, rare.burstInterval, 2 * rare.burstInterval]);
  assert.deepEqual(Array.from(volley.shots, shot => shot.launched), [true, false, false]);
  assert.ok(volley.shots.every(shot => shot.automatic));
  pad.emit('pointerup', coords);await app.flush();
  assert.equal(state.volley, volley);assert.equal(state.used, 1, 'releasing after the deadline cannot create another burst');
  app.until(() => volley.elapsed > rare.burstInterval * 1.25);
  assert.deepEqual(Array.from(volley.shots, shot => shot.launched), [true, true, false]);
  assert.ok(volley.shots[0].position.z > volley.shots[1].position.z && volley.shots[1].position.z > 0);
  assert.equal(volley.shots[2].elapsed, 0, 'the third arrow stays unlaunched until its own delay');
  app.until(() => volley.shots.some(shot => shot.result) && volley.shots.some(shot => shot.active));
  assert.equal(state.mode, 'flight');assert.equal(state.score, 0);
  assert.equal(app.api.progress.shots, 0);assert.equal(app.api.progress.coins, initialCoins, 'partial arrivals cannot award a trigger twice');
  app.until(() => state.mode === 'ready');
  assert.ok(volley.shots.every(shot => !shot.active && shot.result.type === 'hit'));
  assert.equal(state.score, Math.max(...volley.shots.map(shot => shot.result.score)));
  assert.equal(state.score, 10);assert.equal(state.targetMarks.length, 3);
  assertAttachedArrows(app, state.targetMarks.map(mark => ({ x: mark.x, y: mark.y })), state.targetMarks.map(mark => mark.velocity));
  assert.equal(app.api.progress.shots, 1);assert.equal(app.api.progress.hits, 1);
  assert.equal(app.api.progress.coins, initialCoins + 10);assert.equal(app.api.progress.unlocked, 50);
  app.api.onImpact();pad.emit('pointerup', coords);await app.flush();
  assert.equal(state.used, 1);assert.equal(app.api.progress.coins, initialCoins + 10);
  for (let trigger = 1; trigger < 5; trigger++) await centeredShot(app);
  assert.equal(state.mode, 'finished');assert.equal(state.used, 5);assert.equal(state.score, 50);
  assert.equal(state.targetMarks.length, 15, 'all three impacts from every trigger stay attached');
  assert.equal(app.api.progress.shots, 5);assert.equal(app.api.progress.hits, 5);
  assert.equal(app.api.progress.coins, initialCoins + 75);assert.equal(app.api.progress.unlocked, 50);
});

test('the separate clay event keeps guns, bullets and records independent of the main fifty-stage journey', async () => {
  const app = await appHarness({ version: 1, coins: 100000, ownedBows: [0, 19], ownedArrows: [0, 2], bow: 19, arrow: 2, scopedBows: [19], unlocked: 50, lastStage: 50, mainRounds: 50, best: { 1: 50, 12: 42, 50: 35 }, sound: false });
  const mainProgress = () => ({ unlocked: app.api.progress.unlocked, lastStage: app.api.progress.lastStage, mainRounds: app.api.progress.mainRounds, bow: app.api.progress.bow, arrow: app.api.progress.arrow, best: { ...app.api.progress.best } });
  const before = mainProgress(), guns = app.engine.BOWS.filter(item => item.weaponType === 'gun'), top = guns.at(-1);
  assert.equal(guns.length, 5);assert.equal(top.id, 24);
  assert.ok(app.api.progress.ownedBows.includes(20), 'legacy players receive the free event gun');
  app.api.enterEvent();await app.flush();
  assert.equal(app.api.state.isEvent, true);assert.equal(app.api.state.stage.kind, 'clay');
  assert.equal(app.api.state.stage.eventLevel, 10);assert.equal(app.api.state.stage.targetsPerWave, 10);
  assert.equal(app.api.state.stage.maxScore, 300);
  assert.equal(app.api.activeBow().id, 20);assert.equal(app.api.progress.eventBest, 0);
  app.api.showShop('bow');
  const shop = app.getElement('modalContent').innerHTML;
  assert.deepEqual(Array.from(shop.matchAll(/data-equip="(\d+)"/g), match => Number(match[1])), Array.from(guns, item => item.id));
  assert.doesNotMatch(shop, /data-shop-tab="arrow"/);
  for (const gun of guns) assert.ok(shop.includes(gun.name) && shop.includes(gun.ammo.name));
  app.api.equipItem(top.id);const afterPurchase = 100000 - top.price;
  assert.equal(app.api.progress.coins, afterPurchase);assert.equal(app.api.progress.eventGun, top.id);
  app.api.equipItem(20);app.api.equipItem(top.id);
  assert.equal(app.api.progress.coins, afterPurchase, 'owned event guns charge only once');
  app.api.showShop('arrow');app.api.equipItem(11);
  assert.equal(app.api.progress.eventGun, top.id);assert.equal(app.api.progress.coins, afterPurchase);
  assert.deepEqual(Array.from(app.api.progress.ownedArrows), [0, 2]);assert.deepEqual(mainProgress(), before);
  assert.equal(app.getElement('arrowStat').textContent, `탄창 ${top.magazineSize}발 · 장전 ${top.reloadSeconds}초`);
  app.api.closeModal();await app.flush();
  const state = app.api.state, pad = app.getElement('aimTouchpad');
  state.time = .2;pad.emit('pointerdown');pad.emit('pointerup');await app.flush();
  assert.equal(state.shot.projectileType, 'bullet');assert.equal(state.volley, null);
  assert.equal(state.mode, 'ready', 'event shooting stays interactive while bullets fly');
  assert.equal(state.shot.speed, app.engine.getSpeed({ bow: top, arrow: app.api.activeArrow(), charge: 0, velocityBias: 0 }));
  app.frames();
  let items = app.api.sceneItems(app.engine.targetAt(state.stage, state.time));
  assert.equal(items.filter(item => item.kind === 'target').length, 10);
  assert.ok(items.some(item => item.kind === 'target' && item.target.kind === 'ufo'));
  assert.equal(items.filter(item => item.kind === 'bullet').length, 1);
  assert.equal(items.filter(item => item.kind === 'feather' || item.kind === 'shaft').length, 0, 'bullets do not inherit arrow shafts or feathers');
  // Resolve distinct simultaneous targets after the real release handler. The
  // engine suite separately checks plate/UFO motion and swept hit detection.
  const hitKinds = new Set();
  for (let attempt = 0; attempt < 15; attempt++) {
    if (attempt) { app.until(() => state.fireCooldown === 0 && state.reloadRemaining === 0);pad.emit('pointerdown');pad.emit('pointerup');await app.flush(); }
    const clay = app.engine.eventTargetsAt(state.stage, state.time)[0], shot = state.shot;
    assert.ok(clay?.active);hitKinds.add(clay.kind);
    const point = { x: clay.x, y: clay.y, z: clay.z };
    shot.position = point;shot.active = false;shot.result = { type: 'hit', point, targetCenter: clay, score: 10, flightTime: shot.elapsed, zone: '접시 명중' };
    app.api.onEventImpact(shot);app.api.onEventImpact(shot);
    assert.ok(state.stage.brokenPasses.includes(clay.passId));
    assert.equal(app.engine.targetAt(state.stage, state.time, clay.passId).active, false, 'only the plate actually hit is removed');
    assert.equal(new Set(state.stage.brokenPasses).size, attempt + 1);
    assert.equal(state.score, (attempt + 1) * 10, 'reprocessing a resolved bullet cannot award the target twice');
    assert.equal(state.targetMarks.length, 0);assert.equal(shot.attachment, undefined);
    assert.equal(state.effects.at(-1).kind, clay.kind);assert.equal(state.mode, 'ready');
  }
  assert.deepEqual([...hitKinds].sort(), ['clay', 'ufo']);
  assert.equal(state.used, 15, 'the timed event is not limited to five trigger pulls');
  assert.equal(app.engine.eventTargetsAt(state.stage, state.time).length, 5);
  assert.equal(app.api.progress.eventPlays, 0, 'reaching the former score goal does not end a still-running event');
  state.time = state.stage.eventDuration - .01;app.frames();
  assert.equal(state.mode, 'finished');assert.equal(state.score, 150);
  assert.equal(app.api.progress.eventBest, 150);assert.equal(app.api.progress.eventBestByLevel[10], 150);assert.equal(app.api.progress.eventPlays, 1);
  assert.equal(Number(app.getElement('scoreCount').textContent), 15);assert.equal(app.getElement('scoreUnit').textContent, '개');
  assert.match(app.getElement('modalContent').innerHTML, /표적 15개 격파/);
  assert.equal(app.api.progress.coins, afterPurchase + 150, 'events award ten coins per hit with no goal-dependent completion bonus');assert.deepEqual(mainProgress(), before);
  app.api.exitEvent();await app.flush();
  assert.equal(state.isEvent, false);assert.equal(state.stage.id, 50);assert.equal(app.api.activeBow().id, before.bow);
  app.api.showShop('bow');app.api.equipItem(top.id);
  assert.equal(app.api.activeBow().id, before.bow, 'even an owned gun cannot be equipped in the main game');
  assert.equal(app.api.progress.coins, afterPurchase + 150);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.state.stage.id, 50);assert.equal(reloaded.api.activeBow().id, before.bow);
  assert.equal(reloaded.api.progress.eventGun, top.id);assert.equal(reloaded.api.progress.eventBest, 150);assert.equal(reloaded.api.progress.eventBestByLevel[10], 150);assert.equal(reloaded.api.progress.eventPlays, 1);
  assert.equal(reloaded.api.progress.mainRounds, 50);assert.equal(reloaded.api.progress.coins, afterPurchase + 150);
  assert.deepEqual({ ...reloaded.api.progress.best }, before.best);
  reloaded.api.enterEvent();await reloaded.flush();assert.equal(reloaded.api.activeBow().id, top.id);
  assert.equal(reloaded.api.state.stage.brokenPasses.length, 0, 'a new event has fresh clay targets');
});

test('resolved clay and UFO hits each save one stabilizer credit without replay, miss or completion awards', async () => {
  const app = await appHarness({ version: 1, sound: false, mainRounds: 50 });
  await centeredShot(app);
  assert.equal(app.api.progress.clayCredits, 0, 'ordinary archery scores are not event credits');
  app.api.enterEvent(10);await app.flush();app.api.state.time = .2;
  const beforeCoins = app.api.progress.coins, beforeAmmo = app.ammo.account.remaining;
  await resolvedEventShot(app, 'clay');
  assert.equal(app.api.progress.clayCredits, 1);assert.equal(app.snapshot().clayCredits, 1, 'a hit is saved before the event ends');
  await resolvedEventShot(app, 'ufo');
  assert.equal(app.api.progress.clayCredits, 2);assert.equal(app.snapshot().clayCredits, 2);
  await resolvedEventShot(app, 'miss');
  assert.equal(app.api.progress.clayCredits, 2);assert.equal(app.api.state.score, 20, 'ten-point event scoring remains separate from two broken-target credits');
  assert.equal(app.api.progress.coins, beforeCoins + 20);assert.equal(app.ammo.account.remaining, beforeAmmo - 3);
  app.api.state.time = app.api.state.stage.eventDuration - .01;app.frames();
  assert.equal(app.api.state.mode, 'finished');assert.equal(app.api.progress.eventPlays, 1);
  app.api.finishRound();
  assert.equal(app.api.progress.clayCredits, 2, 'completion and repeated callbacks cannot mint the credits again');
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.clayCredits, 2);assert.equal(reloaded.api.progress.stabilizers, 0);
});

test('stabilizers cost exactly five saved clay credits and leave game coins, 쭈 and bullets unchanged', async () => {
  for (const credits of [4, 5, 12]) {
    const app = await appHarness({ version: 1, sound: false, coins: 375, clayCredits: credits, stabilizers: 0 }, { remaining: 17, coins: 23 });
    assert.equal(app.api.buyStabilizer(), false, 'a stale action outside the stabilizer modal cannot buy an item');
    app.getElement('stabilizerBtn').emit('click');
    assert.equal(app.api.state.modal, 'stabilizer');
    const html = app.getElement('modalContent').innerHTML;
    assert.match(html, /접시 점수/);assert.match(html, /data-action="buy-stabilizer"/);assert.match(html, /data-action="use-stabilizer"/);
    for (let attempt = 0; attempt < 3; attempt++) modalAction(app, 'buy-stabilizer');
    const bought = Math.floor(credits / 5);
    assert.equal(app.api.progress.stabilizers, bought);assert.equal(app.api.progress.clayCredits, credits - bought * 5);
    assert.equal(app.api.progress.coins, 375);assert.equal(app.ammo.account.coins, 23);assert.equal(app.ammo.account.remaining, 17);
    assert.equal(app.ammo.requests.filter(request => request.action === 'buy' || request.action === 'spend').length, 0);
    assert.equal(app.getElement('stabilizerCount').textContent, String(bought));
    const reloaded = await appHarness(app.snapshot());
    assert.equal(reloaded.api.progress.stabilizers, bought);assert.equal(reloaded.api.progress.clayCredits, credits - bought * 5);
    assert.equal(reloaded.api.progress.coins, 375);
  }
});

test('existing saves preserve progress while stabilizer balances normalize safely and compact counts stay readable', async () => {
  const cases = [
    { values: {}, credits: 0, inventory: 0 },
    { values: { clayCredits: 7.9, stabilizers: 2.9 }, credits: 7, inventory: 2 },
    { values: { clayCredits: -5, stabilizers: -1 }, credits: 0, inventory: 0 },
    { values: { clayCredits: '9', stabilizers: '3' }, credits: 0, inventory: 0 },
    { values: { clayCredits: null, stabilizers: null }, credits: 0, inventory: 0 },
    { values: { clayCredits: 1e12, stabilizers: 1e12 }, credits: 1e8, inventory: 1e8 }
  ];
  for (const { values, credits, inventory } of cases) {
    const app = await appHarness({ version: 1, coins: 456, lastStage: 2, ownedBows: [0, 10], ownedArrows: [0, 2], bow: 10, arrow: 2, best: { 1: 42 }, mainRounds: 3, sound: false, ...values });
    assert.equal(app.api.progress.clayCredits, credits);assert.equal(app.api.progress.stabilizers, inventory);
    assert.equal(app.snapshot().clayCredits, credits);assert.equal(app.snapshot().stabilizers, inventory);
    assert.equal(app.api.progress.coins, 456);assert.equal(app.api.state.stage.id, 2);assert.equal(app.api.activeBow().id, 10);assert.equal(app.api.activeArrow().id, 2);
    assert.equal(app.api.progress.best[1], 42);assert.equal(app.api.progress.mainRounds, 3);
    assert.equal(app.getElement('stabilizerCount').textContent, inventory > 99 ? '99+' : String(inventory));
    assert.ok(app.getElement('stabilizerBtn').getAttribute('aria-label').includes(inventory.toLocaleString('ko-KR')));
  }
});

test('one stabilizer can cover the remaining shots, cannot stack and expires on retry, stage, event and reload transitions', async () => {
  const app = await appHarness({ version: 1, stabilizers: 5, clayCredits: 3, sound: false });
  await centeredShot(app);
  assert.equal(app.api.state.used, 1);assert.equal(app.api.state.mode, 'ready');
  app.api.showStabilizers();modalAction(app, 'use-stabilizer');
  assert.equal(app.api.state.stabilizerActive, true);assert.equal(app.api.progress.stabilizers, 4);assert.equal(app.api.state.modal, null);
  assert.equal(app.getElement('stabilizerBadge').classList.contains('hidden'), false);
  app.api.showStabilizers();assert.equal(app.api.useStabilizer(), false);
  assert.equal(app.api.progress.stabilizers, 4, 'a second use in the same round never consumes inventory');app.api.closeModal();
  await centeredShot(app);
  assert.equal(app.api.state.stabilizerActive, true, 'the effect survives individual shots in its round');assert.equal(app.api.state.used, 2);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.stabilizers, 4);assert.equal(reloaded.api.state.stabilizerActive, false, 'reloading cannot restore an already consumed effect');
  assert.equal(reloaded.getElement('stabilizerBadge').classList.contains('hidden'), true);
  app.api.startStage(2);await app.flush();
  assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.api.progress.stabilizers, 4);
  app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
  app.getElement('menuBtn').emit('click');modalAction(app, 'retry');await app.flush();
  assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.api.progress.stabilizers, 3);
  app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
  app.api.enterEvent();await app.flush();
  assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.api.progress.stabilizers, 2);
  app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
  app.api.exitEvent();await app.flush();
  assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.api.progress.stabilizers, 1);
  assert.equal(app.snapshot().stabilizers, 1);assert.equal(app.snapshot().clayCredits, 3);
});

test('bows, crossbows and guns use 68 percent sway, stabilizers halve it again and steady windows remain exactly still', async () => {
  for (const id of [0, 10, 20]) {
    const app = await appHarness({ version: 1, ownedBows: [0, 10, 20], bow: id === 20 ? 0 : id, eventGun: 20, stabilizers: 1, sound: false });
    if (id === 20) { app.api.enterEvent();await app.flush(); }
    app.setRandom(() => .8);app.frames(3);
    const original = { ...app.api.state.sway };
    assert.ok(Math.hypot(original.x, original.y) > 0);
    assert.equal(app.api.effectiveSway().x, original.x * .68);assert.equal(app.api.effectiveSway().y, original.y * .68);
    assert.equal(app.firstPersonFrame.swayX, original.x * .68);assert.equal(app.firstPersonFrame.swayY, original.y * .68);
    app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
    assert.equal(app.api.state.sway.x, original.x);assert.equal(app.api.state.sway.y, original.y, 'consumption must not mutate the underlying random-motion process');
    assert.equal(app.api.effectiveSway().x, original.x * .34);assert.equal(app.api.effectiveSway().y, original.y * .34);
    const pad = app.getElement('aimTouchpad'), sequence = [.5, 0];app.setRandom(() => sequence.length ? sequence.shift() : .8);
    pad.emit('pointerdown');
    const { state } = app.api, start = state.drawStarted + state.steadyStart * 1000, end = start + state.steadyDuration * 1000;
    app.advanceTo(state.drawStarted + 300);
    assert.equal(app.api.isSteady(), false);
    assert.equal(app.firstPersonFrame.swayX, state.sway.x * .34);assert.equal(app.firstPersonFrame.swayY, state.sway.y * .34);
    app.advanceTo(start + 1);
    assert.equal(app.api.isSteady(), true);assert.ok(Math.hypot(state.sway.x, state.sway.y) > 0);
    assert.equal(app.api.effectiveSway().x, 0);assert.equal(app.api.effectiveSway().y, 0);
    assert.equal(app.firstPersonFrame.swayX, 0);assert.equal(app.firstPersonFrame.swayY, 0);
    assert.equal(app.api.aimAngles().yaw, state.aim.yaw);assert.equal(app.api.aimAngles().pitch, state.aim.pitch);
    app.advanceTo(end + 1);
    assert.equal(app.api.isSteady(), false);
    const expectedYaw = state.aim.yaw + state.sway.x * .34, expectedPitch = state.aim.pitch + state.sway.y * .34;
    assert.equal(app.firstPersonFrame.swayX, state.sway.x * .34);assert.equal(app.firstPersonFrame.swayY, state.sway.y * .34);
    assert.equal(app.api.aimAngles().yaw, expectedYaw);assert.equal(app.api.aimAngles().pitch, expectedPitch);
    pad.emit('pointerup');await app.flush();
    const velocity = state.shot.velocity;
    assert.ok(Math.abs(Math.atan2(velocity.x, velocity.z) - expectedYaw) < 1e-12, `weapon ${id} launches with the displayed horizontal half sway`);
    assert.ok(Math.abs(Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) - expectedPitch) < 1e-12, `weapon ${id} launches with the displayed vertical half sway`);
    assert.equal(state.used, 1);assert.equal(app.api.progress.stabilizers, 0);
  }
});

test('stabilizers never consume stock while flight, preview, results, account actions or an earlier event bullet are unresolved', async () => {
  const cases = [
    { name: 'main arrow flight', prepare: async app => { app.getElement('aimTouchpad').emit('pointerdown');app.getElement('aimTouchpad').emit('pointerup');await app.flush();assert.equal(app.api.state.mode, 'flight'); } },
    { name: 'target preview', prepare: async app => { app.api.startStage(app.engine.STAGES.find(stage => stage.obstacles.length).id);await app.flush();assert.equal(app.api.state.mode, 'preview'); } },
    { name: 'finished round', prepare: async app => { app.api.state.used = 5;app.api.finishRound();await app.flush();assert.equal(app.api.state.mode, 'finished'); } },
    { name: 'round save', hold: ['round-complete'], prepare: async app => { app.api.state.used = 5;app.api.finishRound();await app.flush();assert.equal(app.api.state.roundSaving, true); } },
    { name: 'round registration', hold: ['round-start'], prepare: async app => { assert.equal(app.api.state.registering, true); } },
    { name: 'pending bullet debit', hold: ['spend'], prepare: async app => { app.api.enterEvent();await app.flush();app.getElement('aimTouchpad').emit('pointerdown');app.getElement('aimTouchpad').emit('pointerup');await app.flush();assert.ok(app.api.state.pendingAmmoShot); } },
    { name: 'live event bullet', prepare: async app => { app.api.enterEvent();await app.flush();app.getElement('aimTouchpad').emit('pointerdown');app.getElement('aimTouchpad').emit('pointerup');await app.flush();assert.equal(app.api.state.mode, 'ready');assert.ok(app.api.state.eventShots.some(shot => shot.active)); } }
  ];
  for (const { name, hold, prepare } of cases) {
    const app = await appHarness({ version: 1, stabilizers: 1, sound: false }, { hold });
    await prepare(app);app.api.showStabilizers();
    assert.equal(app.api.useStabilizer(), false, name);
    assert.equal(app.api.progress.stabilizers, 1, name);assert.equal(app.api.state.stabilizerActive, false, name);assert.equal(app.snapshot().stabilizers, 1, name);
  }
  const empty = await appHarness({ version: 1, sound: false });
  empty.api.showStabilizers();assert.equal(empty.api.useStabilizer(), false);assert.equal(empty.api.progress.stabilizers, 0);assert.equal(empty.api.state.stabilizerActive, false);
});

test('failed stabilizer saves roll back both purchases and consumption so retry charges exactly once', async () => {
  const app = await appHarness({ version: 1, clayCredits: 7, stabilizers: 1, coins: 400, sound: false });
  const write = app.store.set.bind(app.store);let fail = true;
  app.store.set = (key, value) => { if (fail && key === SAVE_KEY) throw new Error('storage unavailable');return write(key, value); };
  app.api.showStabilizers();assert.equal(app.api.buyStabilizer(), false);
  assert.equal(app.api.progress.clayCredits, 7);assert.equal(app.api.progress.stabilizers, 1);
  assert.equal(app.snapshot().clayCredits, 7);assert.equal(app.snapshot().stabilizers, 1);
  fail = false;app.api.showStabilizers();assert.equal(app.api.buyStabilizer(), true);
  assert.equal(app.api.progress.clayCredits, 2);assert.equal(app.api.progress.stabilizers, 2);
  assert.equal(app.snapshot().clayCredits, 2);assert.equal(app.snapshot().stabilizers, 2);
  fail = true;app.api.showStabilizers();assert.equal(app.api.useStabilizer(), false);
  assert.equal(app.api.progress.stabilizers, 2);assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.snapshot().stabilizers, 2);
  fail = false;app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
  assert.equal(app.api.progress.stabilizers, 1);assert.equal(app.api.state.stabilizerActive, true);
  assert.equal(app.snapshot().stabilizers, 1);assert.equal(app.snapshot().clayCredits, 2);assert.equal(app.api.progress.coins, 400);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.stabilizers, 1);assert.equal(reloaded.api.progress.clayCredits, 2);assert.equal(reloaded.api.state.stabilizerActive, false);
});

test('all event guns hit promptly after authorization without slow motion or duplicate ammo consumption', async () => {
  for (const gunId of [20, 21, 22, 23, 24]) {
    const app = await appHarness({ version: 1, ownedBows: [0, 20, 21, 22, 23, 24], eventGun: gunId, sound: false }, { remaining: 20, hold: ['spend'] });
    app.api.enterEvent(10);await app.flush();
    const state = app.api.state, engine = app.engine, pad = app.getElement('aimTouchpad'), gun = app.api.activeBow();
    state.stage = engine.prepareStage(engine.createClayEvent(10), 42);state.time = 0;
    let planned;
    for (let fireTime = .2; fireTime <= 4; fireTime += .05) {
      const target = engine.targetAt(state.stage, fireTime + state.stage.distance / gun.muzzleSpeed, 0);
      const yaw = Math.atan2(target.x, target.z), pitch = Math.atan2(target.y - engine.PLAYER.y, Math.hypot(target.x, target.z));
      if (target.active && Math.abs(yaw) < .48 && pitch > -.22 && pitch < .58) {
        planned = { yaw, pitch, fireTime };break;
      }
    }
    assert.ok(planned, 'the moving UFO has a reachable interception window for relative touch aiming');
    pad.emit('pointerdown');const coords = moveHeldAim(app, planned.yaw, planned.pitch);
    holdFor(app, Math.max(0, planned.fireTime - state.time) * 1000);
    const releasedAtWorld = state.time;
    pad.emit('pointerup', coords);await app.flush();
    const request = app.ammo.requests.filter(item => item.action === 'spend').at(-1);
    assert.equal(state.mode, 'ammo-pending');assert.equal(state.eventShots.length, 0);assert.equal(state.used, 0);
    app.advanceTo(app.now + 750);
    assert.equal(state.time, releasedAtWorld);assert.equal(state.magazine, gun.magazineSize);
    app.ammo.reply(request);await app.flush();
    const shot = state.shot, firedAt = app.now;
    assert.equal(shot.elapsed, 0);assert.equal(shot.position.z, 0);
    assert.equal(shot.speed, engine.MAX_MAIN_PROJECTILE_SPEED * 2);
    assert.equal(state.mode, 'ready');assert.equal(state.used, 1);assert.equal(state.magazine, gun.magazineSize - 1);
    app.until(() => !shot.active, 12);
    assert.equal(shot.result.type, 'hit');assert.equal(shot.result.targetCenter.passId, 0);
    assert.equal(shot.result.targetCenter.kind, 'ufo');assert.equal(state.score, 10);
    const shownFlightTime = (app.now - firedAt) / 1000;
    assert.ok(shownFlightTime <= .2, `${gun.name} was shown flying for ${shownFlightTime}s`);
    assert.ok(Math.abs(shownFlightTime - shot.elapsed) < 1 / 60 + 1e-9, 'event bullets use real time, without the archery slow-motion multiplier');
    app.ammo.reply(request, app.ammo.snapshot());pad.emit('pointerup');await app.flush();
    assert.equal(state.used, 1);assert.equal(app.ammo.account.remaining, 19);
    assert.equal(app.ammo.requests.filter(item => item.action === 'spend').length, 1);
    assert.equal(new Set(state.stage.brokenPasses).size, 1);

    app.until(() => state.fireCooldown === 0);app.ammo.held.delete('spend');
    pad.emit('pointerdown');const missCoords = moveHeldAim(app, .48, .58);
    pad.emit('pointerup', missCoords);await app.flush();
    const missed = state.shot, missedAt = app.now;
    app.until(() => !missed.active, 15);
    assert.equal(missed.result.type, 'miss');assert.ok((app.now - missedAt) / 1000 <= .25);
    assert.equal(state.stuck.length, 0, 'a missed bullet does not become a permanent mark floating at the target plane');
    assert.equal(state.used, 2);assert.equal(app.ammo.account.remaining, 18);assert.equal(state.hits, 1);
    assert.equal(app.ammo.requests.filter(item => item.action === 'spend').length, 2);
  }
});

test('concurrent event bullets resolve by arrival time and trajectory probes do not mutate their trails', async () => {
  for (const reverse of [false, true]) {
    const app = await appHarness({ version: 1, ownedBows: [0, 20, 24], eventGun: 20, sound: false });
    app.api.enterEvent(1);await app.flush();
    const state = app.api.state, engine = app.engine;
    state.stage = engine.prepareStage(engine.createClayEvent(1), 42);state.time = 1;
    const slower = engine.launchArrow({ bow: engine.BOWS[20], charge: 1, velocityBias: 0, yaw: .16462808852539185, pitch: .08702375344862975 });
    const faster = engine.launchArrow({ bow: engine.BOWS[24], charge: 1, velocityBias: 0, yaw: .1647624914719859, pitch: .08695233774951504 });
    engine.stepArrow(slower, .08, state.stage, .92);engine.stepArrow(faster, .0795, state.stage, .9205);
    for (const shot of [slower, faster]) { assert.equal(shot.active, true);shot.startedAt = app.now - 1000;shot.handled = false;shot.launched = true; }
    state.eventShots = reverse ? [faster, slower] : [slower, faster];state.shot = faster;state.used = 2;
    app.advanceTo(app.now + 250);
    assert.equal(faster.result?.type, 'hit', 'the later bullet with less drag reaches this plate first');
    assert.ok(Math.abs(faster.resolvedAt - 1.0848430054397302) < 1e-8);
    assert.equal(slower.result.type, 'miss', 'the later arrival cannot also hit the already broken plate');
    assert.equal(slower.result.score, 0);
    assert.equal(state.score, 10);assert.equal(state.hits, 1);assert.equal(app.api.progress.coins, 10);
    assert.deepEqual(Array.from(state.stage.brokenPasses), [0]);
    assert.equal(slower.trail.length, 3);assert.equal(faster.trail.length, 3, 'collision probes must not append to the actual projectile trails');
  }
});

test('all five event guns consume their magazines, reload automatically and pause their clocks in the shop', async () => {
  const capacities = [2, 2, 4, 4, 10], observedReloads = [];
  for (let index = 0; index < capacities.length; index++) {
    const app = await appHarness({ version: 1, ownedBows: [0, 20, 21, 22, 23, 24], eventGun: 20 + index, sound: false });
    const reload = app.getElement('gunReload'), progress = app.getElement('gunReloadProgress'), fill = app.getElement('gunReloadFill');
    assert.equal(reload.classList.contains('hidden'), true, 'the gun reload HUD stays hidden in the main archery game');
    app.api.enterEvent();await app.flush();
    const state = app.api.state, gun = app.api.activeBow(), pad = app.getElement('aimTouchpad');
    assert.equal(gun.magazineSize, capacities[index]);assert.equal(state.magazine, capacities[index]);
    assert.equal(reload.classList.contains('hidden'), false);assert.equal(reload.classList.contains('reloading'), false);
    assert.equal(progress.getAttribute('aria-valuenow'), '100');assert.equal(fill.style.width, '100%');
    assert.equal(app.getElement('gunReloadLabel').textContent, '사격 준비');
    assert.equal(app.getElement('gunReloadTime').textContent, `탄창 ${capacities[index]} / ${capacities[index]}발`);
    for (let fired = 0; fired < capacities[index]; fired++) {
      app.until(() => state.fireCooldown === 0);
      pad.emit('pointerdown');pad.emit('pointerup');await app.flush();
      assert.equal(state.mode, 'ready');assert.equal(state.used, fired + 1);
      assert.equal(state.magazine, capacities[index] - fired - 1);
      pad.emit('pointerdown');pad.emit('pointerup');await app.flush();
      assert.equal(state.used, fired + 1, 'cooldown prevents two bullets from one immediate repeat');
    }
    assert.equal(state.magazine, 0);assert.equal(state.reloadRemaining, gun.reloadSeconds);
    assert.equal(reload.classList.contains('reloading'), true);assert.equal(app.getElement('gunReloadLabel').textContent, '장전 중');
    assert.equal(progress.getAttribute('aria-valuenow'), '0');assert.equal(fill.style.width, '0%');
    assert.equal(app.getElement('gunReloadTime').textContent, `${gun.reloadSeconds.toFixed(1)}초`);
    const clock = state.time, remaining = state.reloadRemaining;
    const elapsed = Array.from(state.eventShots, shot => shot.elapsed);
    app.api.showShop('bow');app.api.equipItem(20 + (index + 1) % capacities.length);app.api.equipItem(gun.id);app.api.equipItem(gun.id);
    assert.equal(state.magazine, 0);assert.equal(state.reloadRemaining, remaining, 'switching away and back or reselecting a gun cannot refill its empty magazine');
    app.advanceTo(app.now + 5000);
    assert.equal(state.time, clock);assert.equal(state.reloadRemaining, remaining);
    assert.deepEqual(Array.from(state.eventShots, shot => shot.elapsed), elapsed, 'the shop pauses flying bullets as well as reloads');
    app.api.closeModal();await app.flush();
    app.until(() => state.reloadRemaining <= gun.reloadSeconds / 2);
    const halfway = Number(progress.getAttribute('aria-valuenow'));
    assert.ok(halfway >= 50 && halfway < 60, 'the upper HUD progresses with the actual magazine reload');
    assert.equal(fill.style.width, `${halfway}%`);
    assert.equal(app.getElement('gunReloadTime').textContent, `${state.reloadRemaining.toFixed(1)}초`);
    app.until(() => state.reloadRemaining < .04);
    assert.ok(state.reloadRemaining > 0);assert.equal(state.magazine, 0, 'an unfinished reload cannot supply early ammunition');
    pad.emit('pointerdown');pad.emit('pointerup');await app.flush();assert.equal(state.used, capacities[index]);
    app.until(() => state.reloadRemaining === 0);
    const duration = state.time - clock;observedReloads.push(duration);
    assert.ok(Math.abs(duration - gun.reloadSeconds) <= 1 / 60 + 1e-9, 'reload duration follows real event time within one frame');
    assert.equal(state.magazine, capacities[index]);
    assert.equal(reload.classList.contains('reloading'), false);assert.equal(app.getElement('gunReloadLabel').textContent, '사격 준비');
    assert.equal(progress.getAttribute('aria-valuenow'), '100');assert.equal(fill.style.width, '100%');
    assert.equal(app.getElement('gunReloadTime').textContent, `탄창 ${capacities[index]} / ${capacities[index]}발`);
    pad.emit('pointerdown');pad.emit('pointerup');await app.flush();
    assert.equal(state.used, capacities[index] + 1);assert.equal(state.magazine, capacities[index] - 1);
    app.api.exitEvent();await app.flush();assert.equal(reload.classList.contains('hidden'), true, 'returning to main stages hides the gun-only HUD');
  }
  assert.ok(observedReloads[0] > observedReloads[1], 'the second two-round gun reloads faster');
  assert.ok(observedReloads[2] > observedReloads[3], 'the second four-round gun reloads faster');
  assert.ok(observedReloads[4] > 0, 'the ten-round gun also has a real reload');
});

test('pending shot authorization freezes the event and commits a single bullet only after the server agrees', async () => {
  const app = await appHarness({ version: 1, ownedBows: [0, 20, 21], sound: false }, { remaining: 5, hold: ['spend'] });
  app.api.enterEvent();await app.flush();
  const state = app.api.state, pad = app.getElement('aimTouchpad');
  state.aim.yaw = .48;state.aim.pitch = .58; // Keep the first real bullet airborne past the .14-second firing interval.
  pad.emit('pointerdown');pad.emit('pointerup');await app.flush();
  const first = app.ammo.requests.filter(request => request.action === 'spend').at(-1);
  assert.equal(state.mode, 'ammo-pending');assert.equal(state.used, 0);assert.equal(state.magazine, 2);assert.equal(state.eventShots.length, 0);
  app.ammo.reply(first);await app.flush();assert.equal(state.used, 1);assert.equal(state.magazine, 1);
  app.advanceTo(app.now + 150);const flying = state.eventShots.find(shot => shot.active);assert.ok(flying);
  pad.emit('pointerdown');pad.emit('pointerup');await app.flush();
  const second = app.ammo.requests.filter(request => request.action === 'spend').at(-1);
  const frozen = { time: state.time, elapsed: flying.elapsed, position: { ...flying.position }, reload: state.reloadRemaining, cooldown: state.fireCooldown };
  app.getElement('menuBtn').emit('click');modalAction(app, 'next-stage');await app.flush();app.api.exitEvent();app.api.equipItem(21);app.api.showShop('bow');app.getElement('zoomBtn').emit('click');
  assert.equal(state.isEvent, true);assert.equal(state.stage.eventLevel, 1);assert.equal(app.api.activeBow().id, 20);assert.equal(state.modal, 'menu');assert.equal(state.zoom, 1);
  app.advanceTo(app.now + 1000);
  assert.deepEqual({ time: state.time, elapsed: flying.elapsed, position: { ...flying.position }, reload: state.reloadRemaining, cooldown: state.fireCooldown }, frozen);
  assert.equal(state.used, 1);assert.equal(state.magazine, 1);assert.equal(app.ammo.account.remaining, 4);
  app.ammo.reply(second);await app.flush();
  assert.equal(state.mode, 'ready');assert.equal(state.used, 2);assert.equal(state.magazine, 0);
  assert.equal(state.reloadRemaining, app.api.activeBow().reloadSeconds);assert.equal(app.ammo.account.remaining, 3);
  app.ammo.reply(second, app.ammo.snapshot());pad.emit('pointerup');await app.flush();
  assert.equal(state.used, 2);assert.equal(app.ammo.requests.filter(request => request.action === 'spend').length, 2);
  modalAction(app, 'close');assert.equal(state.modal, null);
  app.frames();assert.ok(Math.abs(state.time - frozen.time - 1 / 60) < 1e-9, 'approval latency is not replayed into the event clock');
});

test('a lost spend response retries the same receipt and an exhausted server balance never creates a projectile', async () => {
  const app = await appHarness({ version: 1, sound: false }, { remaining: 2, hold: ['spend'] });
  app.api.enterEvent();await app.flush();const state = app.api.state, pad = app.getElement('aimTouchpad');
  pad.emit('pointerdown');pad.emit('pointerup');await app.flush();const request = app.ammo.requests.at(-1);
  app.ammo.execute(request);app.ammo.reply(request, { ok: false, reason: 'pending' });await app.flush();
  assert.equal(state.used, 0);assert.equal(state.eventShots.length, 0);assert.equal(state.magazine, 2);assert.equal(app.ammo.account.remaining, 1);
  app.ammo.held.delete('spend');await app.api.retryAmmo();await app.flush();
  const attempts = app.ammo.requests.filter(item => item.action === 'spend');
  assert.equal(attempts.length, 2);assert.equal(attempts[0].requestId, attempts[1].requestId);
  assert.equal(state.used, 1);assert.equal(state.eventShots.length, 1);assert.equal(app.ammo.account.remaining, 1);
  await app.api.retryAmmo();assert.equal(state.used, 1, 'refreshing an acknowledged receipt cannot launch it twice');
  app.until(() => state.fireCooldown === 0);app.ammo.held.add('spend');
  pad.emit('pointerdown');pad.emit('pointerup');await app.flush();const declined = app.ammo.requests.at(-1);
  app.ammo.account.remaining = 0;app.ammo.reply(declined);await app.flush();
  assert.equal(state.mode, 'ready');assert.equal(state.used, 1);assert.equal(state.pendingAmmoShot, null);assert.equal(app.api.ammo.snapshot.remaining, 0);
  const count = app.ammo.requests.length;pad.emit('pointerdown');pad.emit('pointerup');await app.flush();
  assert.equal(state.used, 1);assert.equal(app.ammo.requests.length, count, 'known-empty ammunition cannot submit another spend');
});

test('ammo purchases require a deliberate click, reject insufficient 쭈 and reconcile a lost reply without a second debit', async () => {
  const app = await appHarness({ version: 1, coins: 777, sound: false }, { remaining: 0, coins: 5, hold: ['buy'] });
  app.api.enterEvent();await app.flush();app.api.showAmmoShop();
  assert.equal(app.ammo.requests.filter(request => request.action === 'buy').length, 0);
  const buying = app.api.buyAmmo();const duplicate = app.api.buyAmmo();await app.flush();
  let purchases = app.ammo.requests.filter(request => request.action === 'buy');assert.equal(purchases.length, 1);
  app.ammo.account.coins = 0;app.ammo.reply(purchases[0]);await buying;await duplicate;
  assert.equal(app.api.ammo.pending, null);assert.equal(app.api.ammo.snapshot.remaining, 0);assert.equal(app.api.ammo.snapshot.coins, 0);
  assert.equal(app.api.progress.coins, 777, 'platform 쭈 and ordinary game coins are separate balances');
  app.ammo.account.coins = 10;app.ammo.account.revision++;await app.api.retryAmmo();
  const retryBuy = app.api.buyAmmo();await app.flush();purchases = app.ammo.requests.filter(request => request.action === 'buy');
  const request = purchases.at(-1);app.ammo.execute(request);app.ammo.reply(request, { ok: false, reason: 'pending' });await retryBuy;
  await app.api.buyAmmo();assert.equal(app.ammo.requests.filter(item => item.action === 'buy').length, 2);
  app.ammo.held.delete('buy');await app.api.retryAmmo();await app.flush();
  purchases = app.ammo.requests.filter(item => item.action === 'buy');
  assert.equal(purchases.length, 3);assert.equal(purchases[1].requestId, purchases[2].requestId);
  assert.equal(app.ammo.account.coins, 5);assert.equal(app.ammo.account.remaining, 10);assert.equal(app.api.progress.coins, 777);
});

test('rejected and unknown main-round saves never advance cadence or duplicate a milestone before confirmation', async () => {
  for (const unknown of [false, true]) {
    const app = await appHarness({ version: 1, mainRounds: 4, sound: false }, { hold: ['round-complete'] });
    app.api.state.score = 50;app.api.state.used = 5;app.api.finishRound();await app.flush();
    const request = app.ammo.requests.filter(item => item.action === 'round-complete').at(-1);assert.ok(request);
    assert.equal(app.api.state.roundSaving, true);assert.equal(app.api.progress.mainRounds, 4);
    if (unknown) app.ammo.execute(request);
    app.ammo.reply(request, { ok: false, reason: unknown ? 'pending' : 'round_too_soon' });await app.flush();
    assert.equal(app.api.progress.mainRounds, 4);assert.equal(app.api.state.isEvent, false);assert.equal(app.api.progress.coins, 25);
    if (!unknown) { assert.equal(app.api.ammo.pending, null);assert.equal(app.ammo.account.main_rounds, 4);continue; }
    app.ammo.held.delete('round-complete');await app.api.retryAmmo();await app.flush();
    const attempts = app.ammo.requests.filter(item => item.action === 'round-complete');
    assert.equal(attempts.length, 2);assert.equal(attempts[0].requestId, attempts[1].requestId);
    assert.equal(app.api.progress.mainRounds, 5);assert.equal(app.ammo.account.main_rounds, 5);assert.equal(app.ammo.account.remaining, 10020);
    assert.equal(app.api.state.isEvent, true);assert.equal(app.api.state.stage.eventLevel, 1);assert.equal(app.api.progress.lastStage, 2);
    assert.equal(app.api.progress.coins, 25, 'retrying the confirmed main-round receipt cannot award the game bonus again');
  }
});

test('an unknown round registration can be retried before completing that same saved main round', async () => {
  const app = await appHarness({ version: 1, mainRounds: 4, sound: false }, { hold: ['round-start'] });
  const start = app.ammo.requests.find(request => request.action === 'round-start');assert.ok(start);
  app.api.state.score = 50;app.api.state.used = 5;app.api.finishRound();await app.flush();
  app.ammo.execute(start);app.ammo.reply(start, { ok: false, reason: 'pending' });await app.flush();
  assert.equal(app.api.progress.mainRounds, 4);assert.ok(app.api.state.awaitingRoundSave);
  app.ammo.held.delete('round-start');await app.api.retryAmmo();await app.flush();
  const starts = app.ammo.requests.filter(request => request.action === 'round-start');
  assert.equal(starts.length, 2);assert.equal(starts[0].requestId, starts[1].requestId);
  assert.equal(app.ammo.requests.filter(request => request.action === 'round-complete').length, 1);
  assert.equal(app.api.progress.mainRounds, 5);assert.equal(app.api.progress.coins, 25);assert.equal(app.api.state.isEvent, true);
});

test('connected main play waits for its server run and recovered intents cannot strand the next registration', async () => {
  const waiting = await appHarness({ version: 1, sound: false }, { hold: ['round-start'] });
  const pad = waiting.getElement('aimTouchpad');pad.emit('pointerdown');waiting.frames(12);pad.emit('pointerup');await waiting.flush();
  assert.equal(waiting.api.state.mode, 'ready');assert.equal(waiting.api.state.used, 0);assert.equal(waiting.api.state.shot, null);
  const registration = waiting.ammo.requests.find(request => request.action === 'round-start');waiting.ammo.reply(registration);await waiting.flush();
  assert.ok(waiting.api.state.serverRunId);
  const draw = startCenteredDraw(waiting);draw.pad.emit('pointerup', draw.coords);
  assert.equal(waiting.api.state.mode, 'flight');assert.equal(waiting.api.state.used, 1);

  for (const action of ['spend', 'buy']) {
    const original = await appHarness({ version: 1, sound: false }, { remaining: 2, hold: [action] });
    let request;
    if (action === 'spend') {
      original.api.enterEvent();await original.flush();const firing = original.getElement('aimTouchpad');firing.emit('pointerdown');firing.emit('pointerup');await original.flush();request = original.ammo.requests.at(-1);
    } else {
      original.api.showAmmoShop();original.api.buyAmmo();await original.flush();request = original.ammo.requests.at(-1);original.ammo.execute(request);
    }
    original.ammo.reply(request, { ok: false, reason: 'pending' });await original.flush();original.api.ammo.dispose();
    const reopened = await appHarness(original.snapshot(), { store: new Map(original.store), server: original.ammo });
    assert.ok(reopened.ammo.requests.some(item => item.action === 'receipt'));
    assert.equal(reopened.ammo.requests.filter(item => item.action === action).length, 0, 'reopening cannot replay a shot or purchase');
    if (action === 'buy') { assert.equal(reopened.api.ammo.pending.status, 'confirmed');await reopened.api.retryAmmo();await reopened.flush(); }
    assert.equal(reopened.api.ammo.pending, null);assert.ok(reopened.api.state.serverRunId, 'clearing the old intent resumes registration of the current main round');
    assert.equal(reopened.ammo.requests.filter(item => item.action === 'round-start').length, 1, `${action} recovery sent duplicate round-start envelopes: ${JSON.stringify(reopened.ammo.requests.map(({ action, requestId }) => ({ action, requestId })))}`);
    assert.equal(reopened.ammo.account.remaining, action === 'buy' ? 12 : 2);
  }
});

test('every fifth completed main round opens a timed event and event play never advances that cadence', async () => {
  const app = await appHarness({ version: 1, sound: false });
  for (let round = 1; round <= 5; round++) {
    app.api.state.score = round === 5 ? 50 : 0;app.api.state.used = 5;app.api.state.hits = round === 5 ? 5 : 0;
    app.api.finishRound();await app.flush();
    assert.equal(app.api.progress.mainRounds, round, 'completed failed rounds count toward the five-round interval');
    if (round < 5) { assert.equal(app.api.state.isEvent, false);assert.equal(app.api.state.mode, 'finished');modalAction(app, 'retry');await app.flush(); }
  }
  const state = app.api.state;
  assert.equal(state.isEvent, true);assert.equal(state.stage.eventLevel, 1);assert.equal(state.stage.targetsPerWave, 2);
  assert.equal(app.api.progress.lastStage, 2);assert.equal(app.api.progress.unlocked, 50, 'a fifth round resumes at the next freely available stage');
  assert.equal(app.snapshot().mainRounds, 5);assert.equal(app.snapshot().lastStage, 2);
  const pad = app.getElement('aimTouchpad');
  state.time = state.stage.eventDuration - .001;pad.emit('pointerdown');pad.emit('pointerup');await app.flush();app.frames();
  assert.ok(state.time >= state.stage.eventDuration && state.eventShots.some(shot => shot.active));
  assert.equal(state.mode, 'ready', 'the event waits for a bullet already in flight when time expires');
  const shots = state.used;pad.emit('pointerdown');pad.emit('pointerup');await app.flush();assert.equal(state.used, shots, 'the expired event accepts no new shots');
  app.until(() => state.mode === 'finished');
  assert.ok(!state.eventShots.some(shot => shot.active));
  assert.equal(app.api.progress.eventPlays, 1);assert.equal(app.api.progress.mainRounds, 5);
  assert.equal(state.eventReturnStage, 1, 'event choices remember the completed main stage, not its preselected successor');
  app.api.finishRound();await app.flush();
  assert.equal(app.api.progress.eventPlays, 1, 'a completed event cannot be counted twice');
  modalAction(app, 'next-stage');await app.flush();assert.equal(state.stage.id, 2);assert.equal(state.isEvent, false);
  app.getElement('menuBtn').emit('click');
  assert.doesNotMatch(app.getElement('modalContent').innerHTML, /data-action="(?:enter-event|start-event|event-start|event-next|next-event|retry-event)"/);
  app.api.closeModal();await app.flush();
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.mainRounds, 5);assert.equal(reloaded.api.progress.eventPlays, 1);assert.equal(reloaded.api.state.stage.id, 2);
  for (let round = 6; round <= 10; round++) {
    reloaded.api.state.score = 0;reloaded.api.state.used = 5;reloaded.api.finishRound();await reloaded.flush();
    assert.equal(reloaded.api.progress.mainRounds, round);
    if (round < 10) { assert.equal(reloaded.api.state.isEvent, false);modalAction(reloaded, 'retry');await reloaded.flush(); }
  }
  assert.equal(reloaded.api.state.isEvent, true);assert.equal(reloaded.api.state.stage.eventLevel, 2);
  assert.equal(reloaded.api.state.stage.targetsPerWave, 3);
  assert.equal(reloaded.api.progress.lastStage, 3, 'a fifth round advances the saved resume stage even without reaching its reference goal');
});

test('unowned equipment cannot be used without purchase and normal rounds remain five shots', async () => {
  const app = await appHarness();
  for (const kind of ['bow', 'arrow']) {
    app.api.showShop(kind);
    app.api.equipItem(3);app.api.equipItem((kind === 'bow' ? app.engine.BOWS.filter(item => item.weaponType !== 'gun') : app.engine.ARROWS).at(-1).id);
    assert.equal(app.api.progress[kind], 0);
    assert.equal(app.api.progress.coins, 0);
    assert.equal(kind === 'bow' ? app.api.activeBow().id : app.api.activeArrow().id, 0);
    const owned = kind === 'bow' ? app.api.progress.ownedBows.filter(id => app.engine.BOWS[id].weaponType !== 'gun') : app.api.progress.ownedArrows;
    assert.equal(owned.length, 1);
    assert.match(app.getElement('modalContent').innerHTML, /data-equip="3" disabled/);
  }
  app.api.closeModal();await app.flush();
  assert.equal(app.getElement('shotCountLabel').textContent, '5발 남음');
  for (let shot = 0; shot < 5; shot++) await centeredShot(app);
  assert.equal(app.api.state.used, 5);
  assert.equal(app.api.state.mode, 'finished');
  assert.equal(app.api.state.score, 50);
  assert.equal(app.api.progress.coins, 75);
  assert.equal(app.api.progress.bow, 0);
  assert.equal(app.api.progress.arrow, 0);
  for (const kind of ['bow', 'arrow']) {
    const catalog = kind === 'bow' ? app.engine.BOWS.filter(item => item.weaponType !== 'gun') : app.engine.ARROWS;
    const firstPaid = app.engine.sortEquipment(catalog).find(item => item.price > 0);
    app.api.showShop(kind);app.api.equipItem(firstPaid.id);
    assert.equal(app.api.progress[kind], 0, 'even a perfect first game must save for a paid upgrade');
    assert.equal(app.api.progress.coins, 75);
    const card = Array.from(app.getElement('modalContent').innerHTML.matchAll(/<article\b[\s\S]*?<\/article>/g), match => match[0]).find(card => card.includes(`data-equipment-id="${firstPaid.id}"`));
    assert.match(card, new RegExp(`data-equip="${firstPaid.id}" disabled`));
    assert.ok(card.includes((firstPaid.price - 75).toLocaleString('ko-KR')), 'the unaffordable card shows how many more coins are needed');
  }
  const saved = app.snapshot();
  saved.bow = 3; saved.arrow = 3;
  const reloaded = await appHarness(saved);
  assert.equal(reloaded.api.activeBow().id, 0);
  assert.equal(reloaded.api.activeArrow().id, 0);
  assert.equal(reloaded.api.progress.coins, 75);
});

test('real-time deadline waits through 9.9 seconds, auto-fires once at ten and ignores later releases', async () => {
  const app = await appHarness(), pad = app.getElement('aimTouchpad');
  pad.emit('pointerdown');
  const pointer = app.api.pointer;
  pad.emit('pointermove', { clientX: pointer.x + 8, clientY: pointer.y });
  const aimed = { ...app.api.state.aim };
  assert.ok(app.api.pointer);
  app.advanceTo(9900);
  assert.deepEqual({ ...app.api.state.aim }, aimed, 'a stationary finger keeps the same aim through9.9seconds');
  assert.equal(app.api.state.mode, 'drawing');
  assert.equal(app.api.state.used, 0);
  assert.equal(app.api.state.shot, null);
  assert.equal(app.getElement('autoReleaseLabel').textContent, '자동발사까지 0.1초');
  app.advanceTo(10000, { frame: false });
  const shot = app.api.state.shot;
  assert.equal(app.api.state.mode, 'flight');
  assert.equal(app.api.state.used, 1);
  assert.equal(shot.startedAt, 10000);
  assert.equal(shot.automatic, true);
  assert.equal(app.api.pointer, null);
  assert.deepEqual({ ...app.api.state.aim }, aimed, 'automatic fire uses the held direction without time-based drift');
  assert.equal(app.api.state.held, 10);
  assert.equal(app.api.state.charge, 1);
  pad.emit('pointerup');await app.flush();pad.emit('lostpointercapture');
  app.document.emit('keyup', { code: 'Space' });
  assert.equal(app.api.state.shot, shot);
  assert.equal(app.api.state.used, 1);
  app.until(() => app.api.state.mode === 'ready');
  pad.emit('pointerup');await app.flush();
  assert.equal(app.api.state.used, 1);
});

test('frame fallback uses elapsed time when timer delivery is delayed', async () => {
  const app = await appHarness(), pad = app.getElement('aimTouchpad');
  pad.emit('pointerdown');
  app.advanceTo(9900, { runTimers: false });
  assert.equal(app.api.state.used, 0);
  app.advanceTo(10000, { runTimers: false });
  assert.equal(app.api.state.used, 1);
  assert.equal(app.api.pointer, null);
  assert.equal(app.api.state.shot.startedAt, 10000);
  assert.equal(app.api.state.shot.elapsed, 0, 'a new shot cannot simulate time before it was fired');
  const sceneAtRelease = app.api.state.time;
  app.advanceTo(10100);
  assert.ok(Math.abs(app.api.state.shot.elapsed - 0.032) < 1e-12, 'the first auto-shot frame is already at 0.32 speed');
  assert.ok(Math.abs(app.api.state.time - sceneAtRelease - 0.032) < 1e-12, 'moving scenery shares the first slowed frame');
  pad.emit('pointerup');await app.flush();
  assert.equal(app.api.state.used, 1);
});

test('a fresh random steady window lasts exactly 0.5 seconds while normal sway continues outside it', async () => {
  const app = await appHarness(), pad = app.getElement('aimTouchpad');
  let sequence = [0.5, 0.4];app.setRandom(() => sequence.length ? sequence.shift() : 0.9);
  pad.emit('pointerdown');
  assert.equal(app.api.state.steadyStart, 4.4);
  const start = app.api.state.steadyStart * 1000, end = start + 500;
  app.advanceTo(start - 1);
  assert.equal(app.api.isSteady(), false);
  assert.ok(Math.hypot(app.api.effectiveSway().x, app.api.effectiveSway().y) > 0);
  app.advanceTo(start);
  assert.equal(app.api.isSteady(), true);
  assert.equal(app.api.effectiveSway().x, 0);assert.equal(app.api.effectiveSway().y, 0);
  assert.equal(app.api.aimAngles().yaw, app.api.state.aim.yaw);
  assert.equal(app.api.aimAngles().pitch, app.api.state.aim.pitch);
  assert.ok(app.getElement('drawTiming').classList.contains('steady'));
  app.advanceTo(end - 0.01);
  assert.equal(app.api.isSteady(), true);
  assert.equal(app.api.effectiveSway().x, 0);
  app.advanceTo(end);
  assert.equal(app.api.isSteady(), false);
  assert.ok(Math.hypot(app.api.effectiveSway().x, app.api.effectiveSway().y) > 0);
  assert.ok(!app.getElement('drawTiming').classList.contains('steady'));
  pad.emit('pointercancel');
  sequence = [0.5, 0.8];pad.emit('pointerdown');
  assert.equal(app.api.state.steadyStart, 7.800000000000001);
  assert.ok(app.api.state.steadyStart >= 1 && app.api.state.steadyStart + 0.5 <= 10);
});

for (const { id, duration, input } of [{ id: 3, duration: 1.21, input: 'pointer' }, { id: 19, duration: 2, input: 'keyboard' }]) {
  test(`${input} aiming uses the equipped ${duration}-second steady interval and still auto-fires once at ten seconds`, async () => {
    const app = await appHarness({ version: 1, ownedBows: [0, id], ownedArrows: [0], bow: id, sound: false });
    const pad = app.getElement('aimTouchpad'), sequence = [.5, .4];
    app.setRandom(() => sequence.length ? sequence.shift() : .9);
    assert.ok(app.getElement('loadoutSteady').textContent.includes(`${duration}초`));
    if (input === 'pointer') pad.emit('pointerdown');
    else app.document.emit('keydown', { code: 'Space', repeat: false });
    assert.equal(app.api.state.mode, 'drawing');
    assert.equal(app.api.state.steadyDuration, duration);
    assert.ok(pad.getAttribute('aria-label').includes(`${duration}초간`), 'accessible aiming instructions describe the equipped weapon');
    const start = app.api.state.steadyStart * 1000, end = start + duration * 1000;
    assert.ok(start >= 1000 && end <= 10000);
    app.advanceTo(start - 1);
    assert.equal(app.api.isSteady(), false);
    assert.ok(Math.hypot(app.api.effectiveSway().x, app.api.effectiveSway().y) > 0);
    app.advanceTo(start + .001);
    assert.equal(app.api.isSteady(), true);
    assert.equal(app.api.effectiveSway().x, 0);assert.equal(app.api.effectiveSway().y, 0);
    assert.ok(app.getElement('steadyLabel').textContent.includes(`${duration}초 조준 안정`));
    app.advanceTo(end - 1);
    assert.equal(app.api.isSteady(), true, 'the upgraded opportunity remains stable beyond the old half-second limit');
    assert.equal(app.api.aimAngles().yaw, app.api.state.aim.yaw);
    assert.equal(app.api.aimAngles().pitch, app.api.state.aim.pitch);
    app.advanceTo(end + .001);
    assert.equal(app.api.isSteady(), false);
    assert.ok(Math.hypot(app.api.effectiveSway().x, app.api.effectiveSway().y) > 0);
    assert.equal(app.getElement('drawTiming').classList.contains('steady'), false);
    assert.match(app.getElement('steadyLabel').textContent, /안정 구간 끝/);
    app.advanceTo(9999);
    assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.used, 0);
    app.advanceTo(10000, { frame: false });
    const shot = app.api.state.shot;
    assert.equal(app.api.state.mode, 'flight');assert.equal(app.api.state.used, 1);
    assert.equal(shot.startedAt, 10000);assert.equal(shot.automatic, true);
    if (id === 19) {
      assert.equal(app.api.state.volley.shots.length, 3, 'the top rare crossbow still consumes one trigger for its volley');
      assert.ok(app.api.state.volley.shots.every(projectile => projectile.automatic && projectile.startedAt === 10000));
    }
    if (input === 'pointer') pad.emit('pointerup');
    else app.document.emit('keyup', { code: 'Space' });
    await app.flush();
    assert.equal(app.api.state.used, 1);assert.equal(app.api.state.shot, shot, 'a late release never fires a second time');
  });
}

test('the longest steady opportunity starts randomly between one and eight seconds and survives equipment reselection', async () => {
  const app = await appHarness({ version: 1, coins: 0, ownedBows: [0, 19], ownedArrows: [0], bow: 19, sound: false });
  const pad = app.getElement('aimTouchpad'), starts = [];
  for (const fraction of [0, .5, 1 - Number.EPSILON]) {
    const sequence = [.5, fraction];app.setRandom(() => sequence.length ? sequence.shift() : .9);
    pad.emit('pointerdown');
    starts.push(app.api.state.steadyStart);
    assert.equal(app.api.state.steadyDuration, 2);
    assert.ok(app.api.state.steadyStart >= 1 && app.api.state.steadyStart <= 8);
    assert.ok(app.api.state.steadyStart + app.api.state.steadyDuration <= 10, 'the full two seconds fit before mandatory release');
    pad.emit('pointercancel');
  }
  assert.equal(starts[0], 1);assert.equal(starts[1], 4.5);assert.ok(starts[2] > 7.99);
  assert.equal(new Set(starts).size, 3, 'each new hold chooses another random opportunity');
  app.api.showShop('bow');app.api.equipItem(0);app.api.closeModal();
  pad.emit('pointerdown');assert.equal(app.api.state.steadyDuration, .5);pad.emit('pointercancel');
  app.api.showShop('bow');app.api.equipItem(19);app.api.closeModal();
  pad.emit('pointerdown');assert.equal(app.api.state.steadyDuration, 2);pad.emit('pointercancel');
  app.advanceTo(10000);
  assert.equal(app.api.state.used, 0, 'cancelling or changing equipment clears every old automatic timer');
  assert.equal(app.api.progress.coins, 0);
});

test('manual aiming still moves during stability and release uses the exact stable direction', async () => {
  const app = await appHarness(), pad = app.getElement('aimTouchpad');
  const sequence = [0.5, 0];app.setRandom(() => sequence.length ? sequence.shift() : 0.8);
  pad.emit('pointerdown');app.advanceTo(1200);
  assert.equal(app.api.isSteady(), true);
  assert.ok(Math.hypot(app.api.state.sway.x, app.api.state.sway.y) > 0, 'underlying random motion is present');
  const originalYaw = app.api.state.aim.yaw;
  const coordinates = moveHeldAim(app, originalYaw + .06, app.api.state.aim.pitch + .02);
  assert.ok(app.api.state.aim.yaw > originalYaw);
  const aim = { ...app.api.aimAngles() };
  pad.emit('pointerup', coordinates);await app.flush();
  const v = app.api.state.shot.velocity;
  assert.ok(Math.abs(Math.atan2(v.x, v.z) - aim.yaw) < 1e-12);
  assert.ok(Math.abs(Math.atan2(v.y, Math.hypot(v.x, v.z)) - aim.pitch) < 1e-12);
  assert.equal(app.api.state.shot.automatic, false);
  app.advanceTo(10000);
  assert.equal(app.api.state.used, 1, 'manual release must clear the automatic timer');
});

test('cancel, blur and a hidden document clear the ten-second deadline safely', async () => {
  for (const reason of ['pointercancel', 'blur', 'hidden']) {
    const app = await appHarness(), pad = app.getElement('aimTouchpad');
    pad.emit('pointerdown');app.advanceTo(9900);
    if (reason === 'pointercancel') pad.emit('pointercancel');
    if (reason === 'blur') app.window.emit('blur');
    if (reason === 'hidden') { app.document.hidden = true; app.document.emit('visibilitychange'); }
    app.advanceTo(12000);
    assert.equal(app.api.state.used, 0, reason);
    assert.equal(app.api.state.shot, null, reason);
    assert.equal(app.api.state.mode, 'ready', reason);
  }
});

test('every stage shares 0.32-speed arrow, target and scenery time from the first flight frame', async () => {
  const first = await appHarness({ version: 1, unlocked: 50, lastStage: 1, sound: false });
  for (const stage of first.engine.STAGES) {
    // Each fixture starts independently; real navigation now waits for a shot to land.
    const app = stage.id === 1 ? first : await appHarness({ version: 1, unlocked: 50, lastStage: stage.id, sound: false });
    app.until(() => app.api.state.mode === 'ready');
    const pad = app.getElement('aimTouchpad');
    pad.emit('pointerdown');app.frames(78);pad.emit('pointerup');await app.flush();
    const before = app.api.state.time, realStart = app.now;
    app.advanceTo(realStart + 100);
    assert.equal(app.api.state.mode, 'flight', `stage ${stage.id} must still be in flight`);
    assert.ok(Math.abs(app.api.state.shot.elapsed - .032) < 1e-10, `stage ${stage.id} arrow speed`);
    assert.ok(Math.abs(app.api.state.time - before - .032) < 1e-10, `stage ${stage.id} scene speed`);
    assert.ok(Math.abs(app.sceneryFrame.time - before - .032) < 1e-10, `stage ${stage.id} leaves receive the same clock`);
    assert.equal(app.getElement('flightBadge').classList.contains('hidden'), false, 'early stages also show the full-screen flight state');
    const movingTarget = app.api.sceneItems(app.engine.targetAt(stage, app.api.state.time)).find(item => item.kind === 'target').target;
    const expected = app.engine.targetAt(stage, before + .032);
    assert.ok(Math.abs(movingTarget.x - expected.x) < 1e-10);
    assert.ok(Math.abs(movingTarget.y - expected.y) < 1e-10);
  }
});

function startHighMiss(app) {
  const { api } = app, state = api.state, pad = app.getElement('aimTouchpad');
  pad.emit('pointerdown');const coords = moveHeldAim(app, .18, .44);app.frames(78);
  return { pad, coords };
}

function assertVisibleFlight(app) {
  const projected = app.api.project(app.api.state.shot.position), { width, height } = app.viewport;
  assert.ok(Object.values(app.api.camera).every(Number.isFinite), 'the moving camera stays finite');
  assert.equal(projected.visible, true, 'the camera stays behind the arrow');
  assert.ok(projected.x >= 0 && projected.x <= width, `arrow x ${projected.x} is inside ${width}`);
  assert.ok(projected.y >= 0 && projected.y <= height, `arrow y ${projected.y} is inside ${height}`);
}

for (const outcome of ['hit', 'ground']) {
  test(`main view follows a ${outcome}, holds its landing, then restores the saved aim and zoom`, async () => {
    const app = await appHarness();
    app.getElement('zoomBtn').emit('click');
    assert.equal(app.api.state.zoom, 2);
    const { pad, coords } = outcome === 'hit' ? preciseMainDraw(app, {x: .3, y: 0}) : startHighMiss(app);
    const originalCamera = { ...app.api.camera }, originalAim = { ...app.api.state.aim };
    const originalPan = [app.api.state.panX, app.api.state.panY], releaseTime = app.now;
    pad.emit('pointerup', coords);await app.flush();
    app.until(() => app.api.state.shot.position.z > 9);
    assert.equal(app.api.state.mode, 'flight');
    assert.ok(app.api.camera.z > 0, 'the main camera moves forward through the range');
    assert.ok(app.api.camera.z < app.api.state.shot.position.z);
    assert.equal(app.getElement('gameCanvas').dataset.camera, 'follow');
    assertVisibleFlight(app);
    app.until(() => app.api.state.mode === 'settling');
    const shot = app.api.state.shot;
    assert.equal(shot.result.type, outcome);
    if (outcome === 'hit') assert.equal(shot.result.score, 8, 'ordinary impact-camera behavior is separate from the bullseye replay');
    assert.ok(Math.abs((app.now - releaseTime) / 1000 - shot.elapsed / .32) < .02, 'slow motion changes presentation time, not the ballistic flight duration');
    if (outcome === 'ground') {
      assert.ok(shot.position.z > app.api.state.stage.distance + 20, 'a long miss keeps flying well beyond the target');
      assert.ok(app.api.camera.z > app.api.state.stage.distance, 'the view follows the miss beyond the target until it lands');
      assert.ok(Math.abs(shot.position.y) < 1e-9);
    }
    assertVisibleFlight(app);
    app.frames(20);
    assert.equal(app.api.state.mode, 'settling');
    assert.equal(app.getElement('gameCanvas').dataset.camera, 'impact', 'landing is held before returning');
    assert.ok(app.api.camera.z > 0);
    app.until(() => app.getElement('gameCanvas').dataset.camera === 'return');
    app.until(() => app.api.state.mode === 'ready');
    assert.deepEqual({ ...app.api.camera }, originalCamera, 'the exact original pan and focal length are restored');
    assert.deepEqual({ ...app.api.state.aim }, originalAim, 'view motion never changes the next aiming direction');
    assert.deepEqual([app.api.state.panX, app.api.state.panY], originalPan);
    assert.equal(app.api.state.zoom, 2);
    assert.equal(app.getElement('flightBadge').classList.contains('hidden'), true);
  });
}

test('resizing between desktop and mobile during flight preserves a visible arrow and finishes normally', async () => {
  const app = await appHarness(), { pad, coords } = startHighMiss(app);
  pad.emit('pointerup', coords);await app.flush();
  app.until(() => app.api.state.shot.position.z > 12);
  for (const [width, height] of [[390, 640], [844, 390], [1000, 600]]) {
    const elapsed = app.api.state.shot.elapsed;
    app.resize(width, height);
    assert.equal(app.api.state.shot.elapsed, elapsed, 'layout changes do not advance physics');
    assertVisibleFlight(app);
    app.frames(6);
    assertVisibleFlight(app);
    assert.equal(app.getElement('gameCanvas').dataset.camera, 'follow');
  }
  app.until(() => app.api.state.mode === 'ready');
  assert.equal(app.api.state.shot.result.type, 'ground');
  assert.equal(app.api.camera.z, 0);
  assert.equal(app.api.camera.cx, app.viewport.width / 2 + app.api.state.panX);
});

test('scene composition hides only rear shaft/trail pieces and also depth-orders landed arrows', async () => {
  for (const [scene, blockerKind] of [['static', 'target'], ['wall', 'wall']]) {
    const app = await appHarness({ version: 1, unlocked: 50, lastStage: 1, sound: false });
    await enterScene(app, scene);
    app.until(() => app.api.state.mode === 'ready');
    const state = app.api.state, target = app.engine.targetAt(state.stage, state.time);
    const plane = blockerKind === 'target' ? target.z : state.stage.obstacles[0].z - state.stage.obstacles[0].depth / 2;
    state.mode = 'flight';
    state.shot = {
      active: true,
      position: { x: 0, y: 2, z: plane + .2 }, velocity: { x: 0, y: 0, z: 30 },
      trail: [{ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: plane + .1 }]
    };
    const rearStuck = { x: 8, y: 0, z: target.z + 12, velocity: { x: 0, y: -10, z: 30 } };
    state.stuck = [rearStuck];
    const items = app.api.sceneItems(target), blocker = items.findIndex(item => item.kind === blockerKind);
    for (const kind of ['shaft', 'trail']) {
      const front = items.filter(item => item.kind === kind && item.z < plane);
      const rear = items.filter(item => item.kind === kind && item.z > plane);
      assert.ok(front.length > 0 && rear.length > 0, `${kind} is split across the ${blockerKind}`);
      for (const fragment of rear) assert.ok(items.indexOf(fragment) < blocker, `rear ${kind} is painted underneath the ${blockerKind}`);
      for (const fragment of front) assert.ok(items.indexOf(fragment) > blocker, `foreground ${kind} remains above the ${blockerKind}`);
      for (const fragment of [...front, ...rear]) {
        assert.ok(fragment.a.z >= app.api.camera.z + app.view.NEAR_PLANE - 1e-9);
        assert.ok(fragment.b.z >= app.api.camera.z + app.view.NEAR_PLANE - 1e-9);
        assert.ok((fragment.a.z - plane) * (fragment.b.z - plane) >= -1e-8, 'no fragment crosses an opaque depth');
      }
    }
    const landedTip = items.find(item => item.kind === 'tip' && item.point === rearStuck);
    assert.ok(landedTip, 'passing the target does not globally remove an arrow outside its silhouette');
    assert.ok(items.indexOf(landedTip) < items.findIndex(item => item.kind === 'target'), 'a ground arrow behind the target is painted below its silhouette');
  }
});

test('a shaft clearing the masonry top stays visible while trail behind its back plane remains occluded', async () => {
  const app = await appHarness({ version: 1, unlocked: 50, lastStage: 1, sound: false });
  await enterScene(app, 'wall');
  app.until(() => app.api.state.mode === 'ready');
  const state = app.api.state, wall = state.stage.obstacles[0], target = app.engine.targetAt(state.stage, state.time);
  const front = wall.z - wall.depth / 2, back = wall.z + wall.depth / 2, height = wall.height + .12;
  state.mode = 'flight';
  state.shot = {
    active: true,
    position: { x: wall.x, y: height, z: wall.z }, velocity: { x: 0, y: 0, z: 30 },
    trail: [{ x: wall.x, y: height, z: front - 2 }, { x: wall.x, y: height, z: front }]
  };
  let items = app.api.sceneItems(target), wallIndex = items.findIndex(item => item.kind === 'wall');
  const tip = items.find(item => item.kind === 'tip');
  const topShaft = items.filter(item => item.kind === 'shaft' && Math.min(item.a.z, item.b.z) >= front - 1e-9);
  assert.ok(tip.point.z > front && tip.point.z < back, 'the arrow is currently over the wall’s thickness');
  assert.ok(topShaft.length > 0, 'part of its shaft is also above the top face');
  assert.ok(items.indexOf(tip) > wallIndex, 'the wall top cannot paint over the arrow tip clearing it');
  for (const fragment of topShaft) assert.ok(items.indexOf(fragment) > wallIndex, 'the visible shaft over the top is painted after the wall');

  // As the same arrow passes beyond the masonry, only the segment over the
  // top is promoted to its visible surface; the genuinely rear trail is not.
  state.shot.position = { x: wall.x, y: height, z: back + 2 };
  state.shot.trail = [{ x: wall.x, y: height, z: front - 1 }, { x: wall.x, y: height, z: back + 1 }];
  items = app.api.sceneItems(target);wallIndex = items.findIndex(item => item.kind === 'wall');
  const overTop = items.filter(item => item.kind === 'trail' && Math.min(item.a.z, item.b.z) >= front - 1e-9 && Math.max(item.a.z, item.b.z) <= back + 1e-9);
  const behindWall = items.filter(item => item.kind === 'trail' && Math.min(item.a.z, item.b.z) >= back - 1e-9);
  assert.ok(overTop.length > 0 && behindWall.length > 0, 'the trail is split at both wall faces');
  for (const fragment of overTop) assert.ok(items.indexOf(fragment) > wallIndex, 'the trail over masonry remains visible');
  for (const fragment of behindWall) assert.ok(items.indexOf(fragment) < wallIndex, 'the wall still masks trail beyond its rear face');
});

// Inject the already-resolved contact, then exercise the actual impact handler,
// animation ticks and render composition. Ballistic hit resolution is covered
// separately by engine.test.mjs; these checks focus on persistent attachments.
function resolveTestHit(app, offset, velocity = { x: 2, y: -3, z: 38 }, score = 8) {
  const { state } = app.api, target = app.engine.targetAt(state.stage, state.time);
  const point = { x: target.x + offset.x, y: target.y + offset.y, z: target.z };
  state.shot = {
    ...app.engine.launchArrow(), position: { ...point }, velocity: { ...velocity }, elapsed: .9,
    active: false, handled: false, trail: [{ ...app.engine.PLAYER }, { ...point }],
    result: { type: 'hit', point, targetCenter: target, score, flightTime: .9, zone: '명중' }
  };
  state.mode = 'flight';state.used++;
  app.api.onImpact();
  return target;
}

function assertAttachedArrows(app, offsets, velocities) {
  const { state } = app.api, target = app.engine.targetAt(state.stage, state.time);
  const items = app.api.sceneItems(target), tips = items.filter(item => item.kind === 'tip');
  assert.equal(tips.length, offsets.length, 'every previous hit remains rendered once');
  offsets.forEach((offset, index) => {
    const tip = tips.find(item => Math.abs(item.point.x - target.x - offset.x) < 1e-9 && Math.abs(item.point.y - target.y - offset.y) < 1e-9);
    assert.ok(tip, `arrow ${index + 1} keeps its own target-local impact point`);
    assert.ok(Math.abs(tip.point.z - target.z) < .01);
    const shaft = items.find(item => item.kind === 'shaft' && Math.abs(item.b.x - tip.point.x) < 1e-9 && Math.abs(item.b.y - tip.point.y) < 1e-9 && Math.abs(item.b.z - tip.point.z) < 1e-9);
    assert.ok(shaft, 'the attached arrow keeps its complete shaft');
    const direction = { x: shaft.b.x - shaft.a.x, y: shaft.b.y - shaft.a.y, z: shaft.b.z - shaft.a.z };
    const speed = Math.hypot(...Object.values(velocities[index])), length = Math.hypot(...Object.values(direction));
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(direction[axis] / length - velocities[index][axis] / speed) < 1e-9, 'the original entry angle is retained');
    assert.ok(items.indexOf(tip) > items.findIndex(item => item.kind === 'target'), 'embedded arrow tips remain on the visible target face');
  });
  return target;
}

test('static and moving targets plus all six animal species carry arrows at the impact spot through hold and ready', async () => {
  for (const scene of ['static', 'moving', 'rabbit', 'wildcat', 'deer', 'pigeon', 'eagle', 'cheetah']) {
    const app = await appHarness({ version: 1, unlocked: 50, lastStage: 1, sound: false });
    await enterScene(app, scene);
    app.api.state.time = 1.7;
    const offset = { x: .27, y: -.18 }, velocity = { x: 2, y: -3, z: 38 };
    const originalTarget = resolveTestHit(app, offset, velocity);
    assert.equal(app.api.state.targetMarks.length, 1);
    assertAttachedArrows(app, [offset], [velocity]);
    app.frames(20);
    const heldTarget = assertAttachedArrows(app, [offset], [velocity]);
    assert.ok(Math.abs(app.api.state.shot.position.x - heldTarget.x - offset.x) < 1e-9);
    assert.ok(Math.abs(app.api.state.shot.position.y - heldTarget.y - offset.y) < 1e-9);
    assert.equal(app.getElement('gameCanvas').dataset.camera, 'impact');
    app.until(() => app.api.state.mode === 'ready');app.frames(120);
    const movedTarget = assertAttachedArrows(app, [offset], [velocity]);
    if (scene !== 'static') assert.ok(Math.abs(movedTarget.x - originalTarget.x) > .1, 'the target has actually moved after impact');
    assert.equal(app.api.state.targetMarks.length, 1, 'returning the camera does not erase the attachment');
  }
});

test('arrows remain on the animal they hit when a new pass enters during the impact hold', async () => {
  for (const scene of ['rabbit', 'wildcat', 'deer', 'pigeon', 'eagle', 'cheetah']) {
    const app = await appHarness({ version: 1, unlocked: 50, lastStage: 1, sound: false });
    await enterScene(app, scene);
    const state = app.api.state, duration = app.engine.targetAt(state.stage, 0).passDuration;
    state.time = duration - .02;
    const offset = { x: .27, y: -.18 }, original = resolveTestHit(app, offset);
    assert.equal(state.targetMarks[0].passId, original.passId);
    assert.equal(state.shot.attachment.passId, original.passId);
    app.frames(20);
    assert.equal(state.mode, 'settling');
    const assertOriginalAnimal = () => {
      const current = app.engine.targetAt(state.stage, state.time);
      const originalNow = app.engine.targetAt(state.stage, state.time, original.passId);
      assert.notEqual(current.passId, original.passId, 'a genuinely new animal has entered');
      const items = app.api.sceneItems(current), tips = items.filter(item => item.kind === 'tip');
      assert.equal(tips.length, 1, 'an old hit is neither duplicated nor erased by the next pass');
      assert.ok(Math.abs(tips[0].point.x - originalNow.x - offset.x) < 1e-9);
      assert.ok(Math.abs(tips[0].point.y - originalNow.y - offset.y) < 1e-9);
      assert.ok(Math.hypot(tips[0].point.x - current.x - offset.x, tips[0].point.y - current.y - offset.y) > .1, 'the next animal does not inherit an old arrow');
      assert.equal(items.filter(item => item.kind === 'target' && item.target.passId === original.passId).length, 1);
      assert.equal(items.filter(item => item.kind === 'target' && item.target.passId === current.passId).length, 1);
      return originalNow;
    };
    const held = assertOriginalAnimal();
    assert.ok(Math.abs(state.shot.position.x - held.x - offset.x) < 1e-9, 'the impact camera also follows the original animal');
    assert.ok(Math.abs(state.shot.position.y - held.y - offset.y) < 1e-9);
    app.until(() => state.mode === 'ready');app.frames(60);
    assertOriginalAnimal();assert.equal(state.targetMarks[0].passId, original.passId);
  }
});

test('a passing person blocks the shot without awarding a target hit or leaving an attached arrow', async () => {
  const app = await appHarness({ version: 1, unlocked: 50, lastStage: 50, sound: false });
  const state = app.api.state, target = app.engine.targetAt(state.stage, state.time);
  const point = { x: target.x, y: 1.3, z: target.z * .8 };
  state.shot = {
    ...app.engine.launchArrow(), position: { ...point }, elapsed: .9, active: false, handled: false,
    trail: [{ ...app.engine.PLAYER }, { ...point }],
    result: { type: 'person', point, score: 0, flightTime: .9, zone: '행인에 막힘' }
  };
  state.mode = 'flight';state.used = 1;
  app.api.onImpact();app.api.onImpact();
  assert.equal(state.mode, 'settling');assert.equal(state.score, 0);assert.equal(state.hits, 0);
  assert.equal(state.targetMarks.length, 0);assert.equal(state.stuck.length, 0);
  assert.equal(state.shot.attachment, undefined);
  assert.equal(app.api.progress.shots, 1);assert.equal(app.api.progress.hits, 0);
  assert.equal(app.api.progress.coins, 1, 'a blocked shot receives the normal miss reward only once');
  assert.equal(app.api.sceneItems(target).filter(item => item.kind === 'tip').length, 0);
  app.until(() => state.mode === 'ready');
  assert.equal(state.used, 1);assert.equal(state.targetMarks.length, 0);assert.equal(state.stuck.length, 0);
});

test('multiple arrows on a moving target preserve separate impact offsets and entry angles', async () => {
  const app = await appHarness({ version: 1, unlocked: 50, lastStage: 5, sound: false });
  const offsets = [{ x: .27, y: -.18 }, { x: -.33, y: .22 }];
  const velocities = [{ x: 2, y: -3, z: 38 }, { x: -1, y: 2, z: 42 }];
  resolveTestHit(app, offsets[0], velocities[0]);
  app.until(() => app.api.state.mode === 'ready');app.frames(45);
  resolveTestHit(app, offsets[1], velocities[1]);
  assert.equal(app.api.state.hits, 2);
  assert.equal(app.api.state.targetMarks.length, 2);
  assertAttachedArrows(app, offsets, velocities);
  app.until(() => app.api.state.mode === 'ready');app.frames(150);
  assertAttachedArrows(app, offsets, velocities);
  app.api.startStage(6);await app.flush();
  assert.equal(app.api.state.targetMarks.length, 0, 'a new stage clears only the previous target’s attachments');
});

test('obstacle stages automatically reveal the real target above every wall, ignore shots, then restore aim', async () => {
  const app = await appHarness({ version: 1, unlocked: 50, lastStage: 1, sound: false });
  for (const template of app.engine.STAGES.filter(stage => stage.obstacles.length)) {
    app.api.startStage(template.id);await app.flush();
    const stageId = app.api.state.stage.id;
    const { state } = app.api, baseCamera = { ...app.api.camera }, originalAim = { ...state.aim }, previewStart = app.now;
    const preview = app.getElement('previewBtn'), pad = app.getElement('aimTouchpad');
    assert.equal(state.mode, 'preview', `stage ${stageId} starts with its overview`);
    assert.equal(preview.classList.contains('hidden'), false);
    assert.equal(preview.textContent, '조준하기');
    pad.emit('pointerdown');pad.emit('pointermove', { clientX: 500, clientY: 200 });pad.emit('pointerup');await app.flush();
    app.document.emit('keydown', { code: 'Space', repeat: false });app.frames(12);
    app.document.emit('keyup', { code: 'Space' });
    assert.equal(state.mode, 'preview');assert.equal(state.used, 0);assert.equal(state.shot, null);
    assert.deepEqual({ ...state.aim }, originalAim, 'overview input cannot move the shooting aim');
    app.until(() => state.previewElapsed >= .6);
    assert.equal(app.getElement('gameCanvas').dataset.camera, 'preview');
    assert.ok(app.api.camera.y > baseCamera.y, 'the actual viewpoint rises above the range');
    const target = app.engine.targetAt(state.stage, state.time), center = app.api.project(target);
    const bottom = app.api.project({ x: target.x, y: target.y - target.ry, z: target.z });
    assert.ok(center.x - target.rx * center.scale >= 0 && center.x + target.rx * center.scale <= app.viewport.width, 'the whole target fits horizontally');
    assert.ok(center.y - target.ry * center.scale >= 0 && bottom.y <= app.viewport.height, 'the whole target fits vertically');
    for (const wall of state.stage.obstacles) {
      for (const z of [wall.z - wall.depth / 2, wall.z + wall.depth / 2]) {
        const wallTop = app.api.project({ x: target.x, y: wall.height, z });
        assert.ok(bottom.y < wallTop.y, `stage ${stageId} target clears both edges of the wall at ${wall.z} m`);
      }
    }
    const targets = app.api.sceneItems(target).filter(item => item.kind === 'target');
    assert.equal(targets.length, 1, 'one real target is rendered, without a duplicate wall marker');
    assert.equal(targets[0].target, target);
    assert.ok(!app.canvasText.some(text => text.includes('과녁 위치')), 'the canvas draws no ghost position label on masonry');
    app.until(() => state.mode === 'ready');
    assert.ok((app.now - previewStart) / 1000 >= 2.55 - 1e-9 && (app.now - previewStart) / 1000 < 2.57, 'the automatic overview completes in 2.55 seconds within one frame');
    assert.deepEqual({ ...app.api.camera }, baseCamera, 'the overview returns to the exact original aiming camera');
    assert.deepEqual({ ...state.aim }, originalAim);
    assert.equal(state.used, 0);
    assert.equal(preview.textContent, '과녁 보기');assert.equal(preview.disabled, false);
    assert.equal(app.getElement('flightBadge').classList.contains('hidden'), true);
  }
});

test('stages without obstacles stay immediately playable and do not expose an overview button', async () => {
  const app = await appHarness({ version: 1, unlocked: 50, lastStage: 1, sound: false });
  for (const stage of app.engine.STAGES.filter(stage => stage.obstacles.length === 0)) {
    app.api.startStage(stage.id);await app.flush();
    assert.equal(app.api.state.mode, 'ready');
    assert.equal(app.getElement('previewBtn').classList.contains('hidden'), true);
    app.getElement('previewBtn').emit('click');
    assert.equal(app.api.state.mode, 'ready', 'a hidden control cannot start an irrelevant preview');
    const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');
    assert.equal(app.api.state.mode, 'drawing');pad.emit('pointercancel');
    assert.equal(app.api.state.used, 0);
  }
});

test('manual overview cancels a drawn arrow, allows an early return, preserves pan/zoom and is disabled in flight', async () => {
  const app = await appHarness({ version: 1, unlocked: 50, lastStage: 1, sound: false });
  await enterScene(app, 'wall');
  app.until(() => app.api.state.mode === 'ready');
  app.getElement('zoomBtn').emit('click');
  const pad = app.getElement('aimTouchpad'), preview = app.getElement('previewBtn');
  pad.emit('pointerdown');moveHeldAim(app, .4, .3);app.frames(18);
  assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.zoom, 2);
  assert.ok(app.api.state.panX !== 0 || app.api.state.panY !== 0, 'the saved view includes actual aiming pan');
  const baseCamera = { ...app.api.camera }, originalAim = { ...app.api.state.aim };
  const originalPan = [app.api.state.panX, app.api.state.panY];
  preview.emit('click');
  assert.equal(app.api.state.mode, 'preview');assert.equal(app.api.state.used, 0);assert.equal(app.api.state.shot, null);
  pad.emit('pointerup');await app.flush();app.frames(9);
  assert.equal(app.api.state.mode, 'preview');
  assert.equal(preview.textContent, '조준하기');
  preview.emit('click');
  app.frames(6);
  assert.equal(app.api.state.mode, 'preview', 'early exit eases back rather than abruptly changing the view');
  app.until(() => app.api.state.mode === 'ready', 60);
  assert.deepEqual({ ...app.api.camera }, baseCamera);
  assert.deepEqual({ ...app.api.state.aim }, originalAim);
  assert.deepEqual([app.api.state.panX, app.api.state.panY], originalPan);
  assert.equal(app.api.state.zoom, 2);assert.equal(app.api.state.used, 0);
  app.advanceTo(app.now + 11000);
  assert.equal(app.api.state.shot, null, 'the cancelled draw deadline cannot fire during or after the overview');
  pad.emit('pointerdown');app.frames(10);pad.emit('pointerup');await app.flush();
  assert.equal(app.api.state.mode, 'flight');assert.equal(preview.disabled, true);
  preview.emit('click');assert.equal(app.api.state.mode, 'flight');
  app.until(() => app.api.state.mode === 'settling');
  assert.equal(preview.disabled, true);preview.emit('click');assert.equal(app.api.state.mode, 'settling');
  app.until(() => app.api.state.mode === 'ready');
  assert.equal(preview.disabled, false);
});
