/** Integration checks for the actual app handlers/state. No browser or browser driver. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DISTANCE_STAGES as STAGE_FIXTURES } from '../games/forest-archer/engine.mjs';
import { drawPasser } from '../games/forest-archer/scenery.mjs';

const SAVE_KEY = 'forest-archer-progress-distance-v5';
const PREVIOUS_SAVE_KEY = 'forest-archer-progress-v3';
const LEGACY_SAVE_KEY = 'forest-archer-progress-v2';
const STAGE_CATALOG = 'missions-220-distance-v1';
const FIREARM_CATALOG = 'snipers-bullets-v1';
const PREVIOUS_STAGE_CATALOG = 'missions-120-v1';
const REORDERED_STAGE_CATALOG = 'missions-120-v2';
const PREVIOUS_STAGE_COUNT = 120;
const STAGE_COUNT = 220;
const SERVER_EPOCH = Date.parse('2026-11-02T12:00:00.000Z');
const engineSource = await readFile(new URL('../games/forest-archer/engine.mjs', import.meta.url), 'utf8');
const animalSource = await readFile(new URL('../games/forest-archer/animal-zones.mjs', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../games/forest-archer/view.mjs', import.meta.url), 'utf8');
const cinematicSource = await readFile(new URL('../games/forest-archer/cinematic.mjs', import.meta.url), 'utf8');
const bulletCinematicSource = await readFile(new URL('../games/forest-archer/bullet-cinematic.mjs', import.meta.url), 'utf8');
const coachSource = await readFile(new URL('../games/forest-archer/coach.mjs', import.meta.url), 'utf8');
const laserSource = await readFile(new URL('../games/forest-archer/laser.mjs', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../games/forest-archer/game.mjs', import.meta.url), 'utf8');
const coinExchangeSource = await readFile(new URL('../games/forest-archer/coin-exchange.mjs', import.meta.url), 'utf8');
const ammoSource = await readFile(new URL('../games/forest-archer/ammo-client.mjs', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
let harnessSequence = 0;

function lessonStageId(lessonKey, distance) {
  const stage = STAGE_FIXTURES.find(candidate => candidate.lessonKey === lessonKey && candidate.distance === distance);
  assert.ok(stage, `${lessonKey} has a ${distance}m lesson`);
  return stage.id;
}

// Physics and equipment fixtures start at a chosen mission with genuine
// prerequisite clears. Progression regressions below pass raw saves instead.
const clearsBefore = stage => Object.fromEntries(STAGE_FIXTURES.filter(entry => entry.id < stage).map(entry => [entry.id, entry.goal]));
const progressForStage = saved => ({...saved, best: {...clearsBefore(saved.lastStage), ...saved.best}});
function clearFixtureBefore(app, stage) {
  for (const entry of STAGE_FIXTURES) if (entry.id < stage)
    app.api.progress.best[entry.id] = Math.max(app.api.progress.best[entry.id] || 0, entry.goal);
  app.api.progress.unlocked = Math.max(app.api.progress.unlocked, Math.min(STAGE_COUNT, stage));
}

async function appHarness(saved = null, ammoOptions = {}) {
  let now = 0, nextFrame = null, frameId = 0, timerId = 0;
  let viewport = { width: 1000, height: 600 }, canvasOrigin = { left: 0, top: 0 }, sceneryFrame, firstPersonFrame;
  const timers = new Map(), canvasText = [], canvasArcs = [], bullseyeFrames = [], vignetteFrames = [], animalFrames = [], storageOperations = [];
  const bulletFlightFrames = [], bulletMarkFrames = [], bulletImpactFrames = [], bulletVignetteFrames = [];
  const speech = {utterances: [], times: [], cancellations: 0, overlaps: 0, activeUntil: 0};
  const elements = new Map(), store = ammoOptions.store || new Map(saved ? [[SAVE_KEY, JSON.stringify({launchEpoch: 5, stageCatalog: STAGE_CATALOG, ...saved})]] : []);
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
        const event = { button: 0, pointerId, ...point, currentTarget: el, target: el, preventDefault: noop, stopPropagation: noop, ...properties };
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
  document = { ...eventHub(), hidden: false, activeElement: null, body: getElement('body'), documentElement: getElement('html'), getElementById: getElement, querySelectorAll: () => [] };
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
  const owner = ammoOptions.guest ? null : '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222222222', origin = 'https://ojjuda.test';
  const ammoRequests = [], finishedRounds = [], heldActions = new Set(ammoOptions.hold || []), receipts = ammoOptions.server?.receipts || new Map(), runs = ammoOptions.server?.runs || new Map();
  const account = ammoOptions.server?.account || { remaining: ammoOptions.remaining ?? 10000, coins: ammoOptions.coins ?? 100, main_rounds: ammoOptions.mainRounds ?? saved?.mainRounds ?? 0, revision: 1,
    coach_expires_at: ammoOptions.coachExpiresAt ?? (ammoOptions.coachActive ? new Date(SERVER_EPOCH + 86400000).toISOString() : null) };
  const accountSnapshot = extra => ({ ok: true, launch_epoch: 5, ...account, free_remaining: account.remaining, paid_remaining: 0, milestones_granted: Math.min(10, Math.floor(account.main_rounds / 5)), daily_eligible: true, day: '2026-11-02', daily_checked: true, pack_ammo: 10, pack_price: 5,
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
  const sendInit = (fields = {}, overrides = {}) => window.emit('message', { source: parentBridge, origin,
    data: { source: 'ojjuda-archery-world', type: 'init', launchEpoch: 5, owner, sessionId,
      available: !ammoOptions.guest && !ammoOptions.adminTrial, adminTrial: !!ammoOptions.adminTrial, ...fields }, ...overrides });
  const parentBridge = { postMessage(data, targetOrigin) {
    assert.equal(targetOrigin, origin);
    if (data.type === 'ready' && !ammoOptions.holdInit) Promise.resolve().then(() => sendInit());
    if (data.type === 'ammo-request') { ammoRequests.push(data);if (!heldActions.has(data.action)) Promise.resolve().then(() => replyAmmo(data)); }
    if (data.type === 'round-finished') finishedRounds.push(JSON.parse(JSON.stringify(data)));
  } };
  window.parent = ammoOptions.offline ? window : parentBridge;window.location = { origin, search: ammoOptions.adminTrial ? '?v=test&adminTrial=1' : '' };
  const fakeMath = Object.create(Math); fakeMath.random = () => 0.5;
  const context = vm.createContext({
    document, Math: fakeMath, console, performance: { now: () => now }, devicePixelRatio: 1, crypto: { randomUUID: uuid },
    navigator: { vibrate: noop }, window, matchMedia: window.matchMedia,
    localStorage: { get length(){storageOperations.push(['length']);return store.size;}, key: i => {storageOperations.push(['key', i]);return [...store.keys()][i] ?? null;}, getItem: key => {storageOperations.push(['get', key]);return store.get(key) ?? null;}, setItem: (key, value) => {storageOperations.push(['set', key]);return store.set(key, String(value));}, removeItem: key => {storageOperations.push(['remove', key]);return store.delete(key);} },
    requestAnimationFrame(fn) { nextFrame = fn; return ++frameId; },
    setTimeout(fn, delay = 0) { const id = ++timerId; timers.set(id, { due: now + Math.max(0, delay), fn }); return id; }, clearTimeout: id => timers.delete(id),
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe() {} }
  });
  const engine = new vm.SourceTextModule(engineSource, { context, identifier: 'engine.mjs' });
  const animals = new vm.SourceTextModule(animalSource, { context, identifier: 'animal-zones.mjs' });
  const view = new vm.SourceTextModule(viewSource, { context, identifier: 'view.mjs' });
  const cinematic = new vm.SourceTextModule(cinematicSource, { context, identifier: 'cinematic.mjs' });
  const bulletCinematic = new vm.SourceTextModule(bulletCinematicSource, { context, identifier: 'bullet-cinematic.mjs' });
  const coach = new vm.SourceTextModule(coachSource, { context, identifier: 'coach.mjs' });
  const laser = new vm.SourceTextModule(laserSource, { context, identifier: 'laser.mjs' });
  const coinExchangeModule = new vm.SourceTextModule(coinExchangeSource, { context, identifier: 'coin-exchange.mjs' });
  const ammoModule = new vm.SourceTextModule(ammoSource, { context, identifier: 'ammo-client.mjs' });
  const sceneryNames = ['drawScenery', 'drawAnimal', 'drawClay', 'drawUfo', 'drawObstacle', 'drawPasser', 'drawEquipmentIcon', 'drawFirstPersonBow', 'drawBullseyeImpact', 'drawBullseyeVignette'];
  const scenery = new vm.SyntheticModule(sceneryNames, function () {
    for (const name of sceneryNames) this.setExport(name, name === 'drawScenery' ? (_ctx, _w, _h, options) => { sceneryFrame = options; } : name === 'drawFirstPersonBow' ? (_ctx, _w, _h, options) => { firstPersonFrame = options; } : name === 'drawAnimal' ? (...args) => animalFrames.push(args.slice(1)) : name === 'drawBullseyeImpact' ? (...args) => bullseyeFrames.push(args.slice(1)) : name === 'drawBullseyeVignette' ? (...args) => vignetteFrames.push(args.slice(1)) : noop);
  }, { context });
  const bulletEffectFrames = {drawCinematicBullet: bulletFlightFrames, drawBulletMark: bulletMarkFrames,
    drawBulletImpact: bulletImpactFrames, drawBulletVignette: bulletVignetteFrames};
  const bulletEffects = new vm.SyntheticModule(Object.keys(bulletEffectFrames), function () {
    for (const [name, frames] of Object.entries(bulletEffectFrames)) this.setExport(name, (...args) => frames.push(args.slice(1)));
  }, { context });
  const game = new vm.SourceTextModule(gameSource + '\nexport const testApi = { state, get progress(){return progress;}, get ammo(){return ammo;}, startStage, resetRound, finishRound, showShop, equipItem, installScope, equippedScope, hasScope, maximumZoom, setAimZoom, installLaser, activeLaser, laserEnabled, setLaserSettings, adjustLaser, resetLaser, toggleLaser, setLaserStep, laserFrame, openLaserAdjustments, closeLaserAdjustments, save, closeModal, activeBow, activeArrow, activeBullet, aimAngles, shotParams, effectiveSway, isSteady, get camera(){return camera;}, sceneItems, resize, project, onImpact, retryAmmo, showStabilizers, buyStabilizer, useStabilizer, aimBounds, cinematicFrame, renderTime, adminTrialRequested:false, adminTrialActive:false, get pointer(){return pointer;} };', { context, identifier: 'game.mjs' });
  await game.link(specifier => specifier.startsWith('./engine.mjs') ? engine : specifier.startsWith('./animal-zones.mjs') ? animals : specifier.startsWith('./view.mjs') ? view : specifier.startsWith('./cinematic.mjs') ? cinematic : specifier.startsWith('./bullet-cinematic.mjs') ? bulletCinematic : specifier.startsWith('./bullet-effects.mjs') ? bulletEffects : specifier.startsWith('./coach.mjs') ? coach : specifier.startsWith('./laser.mjs') ? laser : specifier.startsWith('./ammo-client.mjs') ? ammoModule : specifier.startsWith('./coin-exchange.mjs') ? coinExchangeModule : scenery);
  await game.evaluate();
  await flush();
  api = game.namespace.testApi;
  return {
    api, engine: engine.namespace, animals: animals.namespace, view: view.namespace, cinematic: cinematic.namespace, bulletCinematic: bulletCinematic.namespace, coach: coach.namespace, laser: laser.namespace, getElement, store, document, window, canvasText, canvasArcs, bullseyeFrames, vignetteFrames, bulletFlightFrames, bulletMarkFrames, bulletImpactFrames, bulletVignetteFrames, animalFrames, speech, flush,
    ammo: { account, receipts, runs, requests: ammoRequests, held: heldActions, reply: replyAmmo, execute: executeAmmo, snapshot: accountSnapshot },
    finishedRounds, storageOperations, sendInit,
    get animationScheduled() { return !!nextFrame; },
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
  const shot = app.engine.launchArrow({ ...angles, bow: app.api.activeBow(), arrow: app.api.activeArrow(), bullet: app.api.activeBullet(), charge: 1, velocityBias: 0 });
  return app.api.project({ x: shot.velocity.x, y: app.engine.PLAYER.y + shot.velocity.y, z: shot.velocity.z });
}

function assertRenderedLaserAt(app, expected, message = 'the laser is drawn at the requested visible point') {
  app.canvasArcs.length = 0;app.advanceTo(app.now);
  const frame = app.api.laserFrame(), canvas = app.getElement('gameCanvas');
  assert.ok(frame, message);
  const point = app.api.project(frame.point), {width, height} = app.viewport;
  assert.ok(point.visible && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height,
    message + '; point=' + JSON.stringify(point) + ', mode=' + app.api.state.mode);
  assert.ok(Math.hypot(point.x - expected.x, point.y - expected.y) < 1e-8,
    message + '; expected=' + JSON.stringify(expected) + ', point=' + JSON.stringify(point) + ', zoom=' + app.api.state.zoom);
  assert.equal(canvas.dataset.laser, 'drawing');
  assert.ok(Math.abs(Number(canvas.dataset.laserScreenX) - point.x) < 1e-8);
  assert.ok(Math.abs(Number(canvas.dataset.laserScreenY) - point.y) < 1e-8);
  for (const radius of [4, 1.4, 7]) {
    assert.ok(app.canvasArcs.some(arc => arc.radius === radius && Math.hypot(arc.x - expected.x, arc.y - expected.y) < 1e-8),
      'the renderer paints the red spot, light core and halo inside the canvas instead of only publishing offscreen coordinates');
  }
  return point;
}

function moveHeldAim(app, yaw, pitch) {
  const { state, pointer } = app.api;
  assert.ok(pointer && state.mode === 'drawing', 'an actual held lower-area touch is required');
  const zero = app.api.laserEnabled() ? app.api.activeLaser() : null;
  const toSight = angles => ({ yaw: angles.yaw - (zero?.horizontalClicks || 0) * .05 * Math.PI / 180,
    pitch: angles.pitch - (zero?.verticalClicks || 0) * .05 * Math.PI / 180 });
  const pad = app.getElement('aimTouchpad'), current = baseAimScreen(app, toSight(state.aim)), target = baseAimScreen(app, toSight({ yaw, pitch }));
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
  const sceneMatches = {
    static: entry => entry.kind === 'target' && !entry.motion.speed && !entry.obstacles.length,
    moving: entry => entry.kind === 'target' && entry.motion.speed > 0 && !entry.obstacles.length,
    wall: entry => entry.coverageMode === 'side-walls' && !entry.motion.speed,
    pillar: entry => entry.coverageMode === 'pillars' && entry.motion.speed > 0
  };
  const stage = app.engine.DISTANCE_STAGES.find(entry => sceneMatches[scene] ? sceneMatches[scene](entry) : entry.kind === scene);
  assert.ok(stage, `${scene} scene is available in the learning progression`);
  clearFixtureBefore(app, stage.id);app.api.startStage(stage.id);
  await app.flush();
}

function prepareAnimalCrossing(app) {
  const { state } = app.api, target = app.engine.targetAt(state.stage, 0);
  assert.ok(app.animals.isAnimalKind(target.kind));
  let lo = 0, hi = target.passDuration;
  for (let step = 0; step < 50; step++) {
    const mid = (lo + hi) / 2, position = app.engine.targetAt(state.stage, mid, target.passId);
    if ((position.x - (state.stage.targetX || 0)) * target.direction < 0) lo = mid;else hi = mid;
  }
  const speed = app.engine.getSpeed({ bow: app.api.activeBow(), arrow: app.api.activeArrow(), charge: 1, velocityBias: 0 });
  state.time = (lo + hi) / 2 - 1.3 - state.stage.distance / speed;
  assert.ok(state.time >= 0, 'the first visible crossing leaves enough time for a full draw');
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

// Independent damped-trajectory interception. Arrow replay and main-gun
// fixtures keep their intended target as equipment speeds change.
function targetIntercept(engine, params, stage, worldTime, offset = {x: 0, y: 0}, passId,
  aimAt = target => engine.getAnimalAimPoint(target) || target) {
  const probe = engine.launchArrow(params);
  const drag = probe.dragRate, wind = stage.wind * engine.WIND_RESPONSE * probe.windFactor;
  const gravity = engine.GRAVITY * (probe.gravityScale ?? 1);
  const velocityForTime = time => {
    const target = engine.targetAt(stage, worldTime + time, passId);
    const aim = aimAt(target);
    const a = drag ? -Math.expm1(-drag * time) / drag : time;
    const b = drag ? (time - a) / drag : time * time / 2;
    return {x: (aim.x + offset.x * target.rx - engine.PLAYER.x - wind * b) / a,
      y: (aim.y + offset.y * target.ry - engine.PLAYER.y + gravity * b) / a,
      z: (aim.z - engine.PLAYER.z) / a};
  };
  let lo = .001, hi = 2;
  while (hi < 8 && Math.hypot(...Object.values(velocityForTime(hi))) >= probe.speed) {
    lo = hi;hi = Math.min(8, hi * 1.25);
  }
  assert.ok(Math.hypot(...Object.values(velocityForTime(hi))) < probe.speed, 'fixture has a reachable low trajectory');
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (Math.hypot(...Object.values(velocityForTime(mid))) > probe.speed) lo = mid;else hi = mid;
  }
  const flightTime = (lo + hi) / 2, v = velocityForTime(flightTime);
  return {...params, yaw: Math.atan2(v.x, v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)), flightTime};
}

function preciseMainDraw(app, offset = { x: 0, y: 0 }, {missDuringHold = false, aimAt} = {}) {
  const { api, engine } = app, { state } = api, pad = app.getElement('aimTouchpad');
  if (api.activeBow().weaponType === 'gun') app.until(() => state.mode === 'ready' && state.reloadRemaining === 0);
  pad.emit('pointerdown');
  if (missDuringHold) moveHeldAim(app, .4, .5);
  holdFor(app, 1300);
  const aim = targetIntercept(engine, {bow: api.activeBow(), arrow: api.activeArrow(), bullet: api.activeBullet(), charge: 1, velocityBias: state.velocityBias}, state.stage, state.time, offset, undefined, aimAt);
  const sway = api.effectiveSway();
  const coords = moveHeldAim(app, aim.yaw - sway.x, aim.pitch - sway.y);
  return {pad, coords};
}

// Solve a static, windless penetration fixture independently of the app's
// collision/prediction routines, then move the actual held touch to that aim.
function coveredGunAim(app) {
  const {engine, api} = app, stage = api.state.stage;
  const params = {bow: api.activeBow(), bullet: api.activeBullet(), charge: 1, yaw: 0};
  const heightAtTarget = pitch => {
    const shot = engine.launchArrow({...params, pitch});
    let point = {...engine.PLAYER}, velocity = {...shot.velocity}, drag = shot.dragRate;
    let gravity = engine.GRAVITY * shot.gravityScale, speedRatio = 1, dropRatio = 1;
    const planes = stage.obstacles.map(wall => ({z: wall.z - wall.depth / 2, material: wall.material})).sort((a, b) => a.z - b.z);
    for (const plane of [...planes, {z: stage.distance}]) {
      const dz = plane.z - point.z, dt = drag ? -Math.log1p(-drag * dz / velocity.z) / drag : dz / velocity.z;
      const decay = Math.exp(-drag * dt), a = drag ? -Math.expm1(-drag * dt) / drag : dt;
      const b = drag ? (dt - a) / drag : dt * dt / 2;
      point = {x: point.x + velocity.x * a, y: point.y + velocity.y * a - gravity * b, z: plane.z};
      velocity = {x: velocity.x * decay, y: velocity.y * decay - gravity * a, z: velocity.z * decay};
      if (plane.material) {
        const retention = plane.material === 'wood' ? .8 : .5, drop = plane.material === 'wood' ? 1.2 : 1.5;
        velocity = Object.fromEntries(Object.entries(velocity).map(([axis, value]) => [axis, value * retention]));
        drag *= retention;speedRatio *= retention;dropRatio *= drop;
        gravity = shot.gravityScale === 0
          ? engine.GRAVITY * engine.BULLET_GRAVITY_SCALE * 9 * speedRatio**2 * (dropRatio-1)
          : gravity * retention * retention * drop;
      }
    }
    return point.y;
  };
  const target = engine.targetAt(stage, api.state.time);let lo = -.05, hi = .4;
  for (let i = 0; i < 60; i++) {
    const pitch = (lo + hi) / 2;
    if (heightAtTarget(pitch) < target.y) lo = pitch;else hi = pitch;
  }
  return {yaw: 0, pitch: (lo + hi) / 2};
}

function setCoveredGunFixture(app, materials, distance = 150) {
  Object.assign(app.api.state.stage, {distance, height: 2.3, radius: .06, wind: 0, motion: {}, passers: [],
    retiredPasserIds: [], obstacles: materials.map((material, index) => ({
      x: 0, z: (distance < 20 ? 4 + index * 2 : 25 + index * 45) + .4,
      width: 30, height: 30, depth: .8, material, type: material === 'wood' ? 'timber' : 'stone'
    }))});
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

function modalActionDisabled(app, action) {
  const tag = app.getElement('modalContent').innerHTML.match(new RegExp('<button\\b[^>]*data-action="' + action + '"[^>]*>'))?.[0];
  assert.ok(tag, `the visible modal offers ${action}`);
  return /\bdisabled\b/.test(tag);
}

function staleModalAction(app, action) {
  // An enabled button retained by an older result must still pass the real
  // delegated click handler's current-round checks.
  const button = app.getElement(`stale-action-${action}`);
  button.tagName = 'BUTTON';button.dataset.action = action;button.disabled = false;
  app.document.emit('click', { target: button });
}

// Probe the actual painted walker paths at a target's perspective position.
// Curves are sampled independently; a collider box alone cannot satisfy this.
function paintedPersonBlocks(person, target, time, player) {
  const front = person.z - person.depth / 2, ratio = (front - player.z) / (target.z - player.z);
  const point = { x: (player.x + (target.x - player.x) * ratio - person.x) / person.width * (person.direction < 0 ? -1 : 1),
    y: (person.y - player.y - (target.y - player.y) * ratio) / person.height };
  if (point.x < -.5 || point.x > .5 || point.y < -1 || point.y > 0) return false;
  let path = [], covered = false;
  const inside = polygon => {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };
  const ctx = {
    save() {}, restore() {}, translate() {}, scale() {}, clip() {}, stroke() {}, closePath() {},
    beginPath() { path = []; }, moveTo(x, y) { path.push({ x, y }); }, lineTo(x, y) { path.push({ x, y }); },
    rect(x, y, width, height) { path = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]; },
    quadraticCurveTo(cx, cy, x, y) {
      const start = path.at(-1);
      for (let i = 1; i <= 20; i++) { const t = i / 20, s = 1 - t;
        path.push({ x: s * s * start.x + 2 * s * t * cx + t * t * x, y: s * s * start.y + 2 * s * t * cy + t * t * y }); }
    },
    ellipse(x, y, rx, ry, rotation, start, end) {
      for (let i = 0; i <= 48; i++) { const angle = start + (end - start) * i / 48, c = Math.cos(angle) * rx, s = Math.sin(angle) * ry;
        path.push({ x: x + c * Math.cos(rotation) - s * Math.sin(rotation), y: y + c * Math.sin(rotation) + s * Math.cos(rotation) }); }
    },
    fill() { covered ||= inside(path); }
  };
  // The query is already in the walker's local coordinates, so no further
  // canvas transform is necessary. All clothing/limb geometry is real code.
  drawPasser(ctx, person, { project: () => ({ x: 0, y: 0, scale: 1 }), time });
  return covered;
}

async function equipMainGun(app, id = 20) {
  const stageId = app.api.state.stage.id;
  assert.ok(app.api.progress.ownedBows.includes(id), 'the gun fixture owns its selected equipment');
  app.api.showShop('bow');app.api.equipItem(id);app.api.closeModal();await app.flush();
  assert.equal(app.api.activeBow().id, id);assert.equal(app.api.activeBow().weaponType, 'gun');
  assert.equal(!!app.api.state.isEvent, false);assert.equal(app.api.state.stage.id, stageId);
  app.until(() => app.api.state.reloadRemaining === 0);
}

async function preciseMainShot(app, offset = {x: 0, y: 0}) {
  const {state} = app.api;
  app.until(() => state.mode === 'ready' && state.reloadRemaining === 0);
  const draw = preciseMainDraw(app, offset);draw.pad.emit('pointerup', draw.coords);await app.flush();
  assert.equal(state.mode, 'flight');
  const shot = state.shot;
  app.until(() => ['ready', 'finished'].includes(state.mode));await app.flush();
  return shot;
}

test('the single launch starts fresh once and never restores the previous journey or pending shot', async () => {
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
  assert.deepEqual([...progress.ownedBows], [0]);
  assert.deepEqual([...progress.ownedArrows], [0]);
  assert.deepEqual([...progress.scopedBows], []);
  assert.deepEqual([progress.mainRounds, progress.eventPlays, progress.eventBest, progress.shots, progress.hits], [0, 0, 0, 0, 0]);
  assert.equal(Object.keys(progress.best).length, 0);
  assert.equal(Object.keys(progress.eventBestByLevel).length, 0);
  assert.equal(app.api.ammo.pending, null);
  assert.equal(app.ammo.requests.some(request => request.action === 'spend' || request.action === 'receipt'), false,
    'an old journey request must not spend a new journey bullet');
  progress.coins = 1200;
  const upgrade = app.engine.BOWS.find(item => item.shopRank === 2 && item.weaponType === 'bow');
  app.api.showShop('bow');app.api.equipItem(upgrade.id);
  const resumed = await appHarness(null, { store, remaining: 0 });
  assert.equal(resumed.api.progress.coins, 1200 - upgrade.price);
  assert.equal(resumed.api.progress.bow, upgrade.id, 'only the release transition resets progress, not every visit');
  assert.equal(store.has('forest-archer-progress-v1'), false);
});

const preResetProgress = () => ({version: 1, stageCatalog: PREVIOUS_STAGE_CATALOG, coins: 7654,
  clayCredits: 12, stabilizers: 3, coachEnabled: false, sound: false,
  ownedBows: [0, 3, 19, 20, 24], ownedArrows: [0, 11, 12, 13],
  bow: 19, arrow: 13, eventGun: 24, scopedBows: [3, 19, 24],
  lastStage: 120, unlocked: 120, best: {1: 50, 50: 42, 120: 48},
  eventBest: 280, eventBestByLevel: {2: 60, 10: 280}, eventPlays: 14,
  mainRounds: 70, shots: 420, hits: 330});
test('the single launch clears every test-era record, purchased item, local currency and abandoned operation', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  for (const version of [1, 2, 3, 4]) for (const stageCatalog of [undefined, PREVIOUS_STAGE_CATALOG, REORDERED_STAGE_CATALOG, STAGE_CATALOG]) {
    const old = {...preResetProgress(), stageCatalog, lastStage: 120};
    const oldKey = `forest-archer-progress-v${version}`;
    const pendingKey = `forest-archer-ammo-pending-v2:${owner}`;
    const otherKey = 'forest-archer-ammo-pending-v2:other-account';
    const recoveryKey = `forest-archer-ammo-recovery-v2:${owner}`;
    const store = new Map([[oldKey, JSON.stringify(old)], [pendingKey, JSON.stringify({version: 1, owner, action: 'buy', requestId: owner, payload: {}})],
      [otherKey, 'old request'], [recoveryKey, 'old receipts'], ['another-game-progress', 'unrelated-record']]);
    const app = await appHarness(null, {store, remaining: 0, mainRounds: 0, coins: 23});
    const saved = app.snapshot();
    assert.deepEqual({lastStage: saved.lastStage, best: saved.best, eventBest: saved.eventBest,
      eventBestByLevel: saved.eventBestByLevel, eventPlays: saved.eventPlays, mainRounds: saved.mainRounds,
      shots: saved.shots, hits: saved.hits, coins: saved.coins, clayCredits: saved.clayCredits,
      stabilizers: saved.stabilizers, bow: saved.bow, arrow: saved.arrow, eventGun: saved.eventGun,
      ownedBows: saved.ownedBows, ownedArrows: saved.ownedArrows, scopedBows: saved.scopedBows},
    {lastStage: 1, best: {}, eventBest: 0, eventBestByLevel: {}, eventPlays: 0, mainRounds: 0,
      shots: 0, hits: 0, coins: 0, clayCredits: 0, stabilizers: 0, bow: 0, arrow: 0, eventGun: 20,
      ownedBows: [0], ownedArrows: [0], scopedBows: []});
    assert.equal(saved.launchEpoch, 5);assert.equal(saved.stageCatalog, STAGE_CATALOG);
    assert.equal(app.api.state.stage.id, 1);assert.equal(app.api.progress.unlocked, 1);
    for (const key of [oldKey, pendingKey, otherKey, recoveryKey]) assert.equal(store.has(key), false);
    assert.equal(app.api.ammo.pending, null);assert.equal(app.api.ammo.snapshot.remaining, 0);
    assert.equal(app.ammo.account.coins, 23, 'the shared 쭈 wallet is untouched');
    assert.equal(store.get('another-game-progress'), 'unrelated-record');
    assert.equal(app.ammo.requests.some(request => ['buy', 'spend', 'receipt', 'round-complete'].includes(request.action)), false);
  }
});

test('new scores, equipment and selected stage survive reopening after the one-time launch reset', async () => {
  const store = new Map([[PREVIOUS_SAVE_KEY, JSON.stringify(preResetProgress())]]);
  const app = await appHarness(null, {store, remaining: 0});
  for (let shot = 0; shot < 5; shot++) await centeredShot(app);
  app.api.progress.coins += 1200;
  const upgrade = app.engine.BOWS.find(item => item.shopRank === 2 && item.weaponType === 'bow');
  app.api.showShop('bow');app.api.equipItem(upgrade.id);
  app.api.startStage(2);await app.flush();
  const saved = app.snapshot();
  assert.deepEqual([saved.lastStage, saved.mainRounds, saved.shots, saved.hits], [2, 1, 5, 5]);
  assert.deepEqual(saved.best, {1: 50});assert.equal(saved.coins, 1275 - upgrade.price);
  assert.equal(saved.bow, upgrade.id);
  const completion = app.ammo.requests.filter(request => request.action === 'round-complete');
  assert.equal(completion.length, 1);assert.equal(completion[0].score, 50);assert.equal(completion[0].stage, 1);
  store.set('forest-archer-progress-v4', JSON.stringify({...preResetProgress(), coins: 99999, mainRounds: 999}));
  const resumed = await appHarness(null, {store, server: app.ammo});
  assert.deepEqual(resumed.snapshot(), saved, 'a still-open test tab cannot restore old records or items');
  assert.equal(resumed.api.state.stage.id, 2);assert.equal(store.has('forest-archer-progress-v4'), false);
});

test('a denied local save keeps fresh practice state and never imports test inventory on retry', async () => {
  const store = new Map([[PREVIOUS_SAVE_KEY, JSON.stringify(preResetProgress())]]), write = store.set.bind(store);
  let fail = true;
  store.set = (key, value) => {if (fail && key === SAVE_KEY) throw new Error('storage unavailable');return write(key, value);};
  const app = await appHarness(null, {store, offline: true});
  assert.equal(app.api.progress.coins, 0);assert.equal(app.api.progress.lastStage, 1);
  assert.deepEqual(Array.from(app.api.progress.ownedBows), [0]);assert.equal(store.has(SAVE_KEY), false);
  fail = false;
  const reopened = await appHarness(null, {store, offline: true});
  assert.equal(reopened.snapshot().coins, 0);assert.deepEqual(reopened.snapshot().best, {});
  assert.equal(reopened.snapshot().launchEpoch, 5);
});

test('the wind HUD distinguishes calm, either direction and tiny nonzero wind without rounding to zero', async () => {
  const app = await appHarness();
  for (const [wind, label] of [
    [0, '바람 없음'], [1, '→ 오른쪽 바람 1'], [-1.2, '← 왼쪽 바람 1.2'],
    [.038, '→ 오른쪽 바람 0.038'], [-.038, '← 왼쪽 바람 0.038'],
    [.0004, '→ 오른쪽 바람 0.0004'], [-.0004, '← 왼쪽 바람 0.0004']
  ]) {
    app.api.resetRound({...app.engine.DISTANCE_STAGES[0], wind});await app.flush();
    assert.equal(app.api.state.stage.wind, wind, 'formatting never changes the real wind');
    assert.equal(app.getElement('windLabel').textContent, label);
    if (wind) assert.doesNotMatch(label, /바람 0(?:\.0+)?$/, 'a real breeze must never appear as zero');
  }
});

test('all four wind lessons retain their real wind and readable direction through retry, next stage and reload', async () => {
  const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, lastStage: lessonStageId('wind-intro', 10), sound: false}));
  const lessons = [[10, 1, '→ 오른쪽 바람 1'], [20, -1.1, '← 왼쪽 바람 1.1'],
    [30, -1.2, '← 왼쪽 바람 1.2'], [50, 1.3, '→ 오른쪽 바람 1.3']]
    .map(([distance, wind, label]) => [lessonStageId('wind-intro', distance), wind, label]);
  for (const [id, wind, label] of lessons) {
    clearFixtureBefore(app, id);app.api.startStage(id);await app.flush();
    assert.equal(app.api.state.stage.id, id);assert.equal(app.api.state.stage.wind, wind);
    assert.equal(app.getElement('windLabel').textContent, label);
    app.getElement('menuBtn').emit('click');modalAction(app, 'retry');await app.flush();
    assert.equal(app.api.state.stage.id, id);assert.equal(app.api.state.stage.wind, wind);
    assert.equal(app.getElement('windLabel').textContent, label, 'a new layout keeps the same lesson wind');
    if (id < lessons.at(-1)[0]) {
      app.api.state.score = app.api.state.stage.goal;app.api.state.used = 5;
      app.api.finishRound();await app.flush();
      assert.equal(modalActionDisabled(app, 'next-stage'), false);
      modalAction(app, 'next-stage');await app.flush();
      assert.equal(app.api.state.stage.id, id + 1);
    }
  }
  const resumed = await appHarness(app.snapshot());
  assert.equal(resumed.api.state.stage.id, lessonStageId('wind-intro', 50));assert.equal(resumed.api.state.stage.wind, 1.3);
  assert.equal(resumed.getElement('windLabel').textContent, '→ 오른쪽 바람 1.3');
});

test('writes from an old v2 tab cannot resurrect old records or erase the current v4 journey', async () => {
  const store = new Map([[LEGACY_SAVE_KEY, JSON.stringify(preResetProgress())]]);
  const app = await appHarness(null, {store});
  clearFixtureBefore(app, 8);app.api.startStage(8);await app.flush();
  app.api.state.score = 42;app.api.finishRound();await app.flush();
  const saved = app.snapshot();
  assert.deepEqual(saved.best, {...clearsBefore(8), 8: 42});assert.equal(saved.mainRounds, 1);
  store.set(LEGACY_SAVE_KEY, JSON.stringify({...preResetProgress(), coins: 99999,
    lastStage: 119, best: {119: 50}, mainRounds: 999, shots: 9999}));
  const resumed = await appHarness(null, {store, server: app.ammo});
  assert.deepEqual(resumed.snapshot(), saved, 'v4 always wins after its first successful save');
  assert.equal(resumed.api.state.stage.id, 8);
});

test('a corrupt or incompatible current save never falls back to pre-reset records or inventory', async () => {
  const backup = JSON.stringify(preResetProgress());
  for (const corrupt of ['{broken', 'null', '', JSON.stringify({version: 99, coins: 123})]) {
    const store = new Map([[SAVE_KEY, corrupt], [PREVIOUS_SAVE_KEY, backup], [LEGACY_SAVE_KEY, backup]]);
    const app = await appHarness(null, {store});
    const saved = app.snapshot();
    assert.deepEqual([saved.lastStage, saved.coins, saved.mainRounds, saved.shots, saved.hits], [1, 0, 0, 0, 0]);
    assert.deepEqual(saved.best, {});assert.deepEqual(saved.ownedBows, [0]);
    assert.deepEqual(saved.ownedArrows, [0]);assert.equal(store.has(PREVIOUS_SAVE_KEY), false);assert.equal(store.has(LEGACY_SAVE_KEY), false);
  }
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
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], eventGun: 20, sound: false });
    await equipMainGun(app, 20);app.resize(width, height, { left, top });
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
    assert.equal(app.ammo.requests.filter(request => request.action === 'spend').length, 0);
  }
});

test('the invisible lower touchpad anchors at the touched point without jumping aim and keeps reticle and bullet ray aligned at every zoom', async () => {
  for (const [width, height] of [[1000, 600], [390, 480], [844, 235]]) for (const zoom of [1, 3]) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], scopeLoadouts: {20: {owned: [3], equipped: 3}}, bow: 20, sound: false });
    const origin = { left: 17, top: 83 };
    app.resize(width, height, origin);await equipMainGun(app, 20);
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
    assert.equal(app.ammo.requests.filter(request => request.action === 'spend').length, 0);
  }
});

test('touch movement follows every small relative pixel delta and holding a finger still never drifts', async () => {
  for (const zoom of [1, 3]) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], scopeLoadouts: {20: {owned: [3], equipped: 3}}, bow: 20, sound: false });
    app.resize(390, 480);await equipMainGun(app, 20);
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

test('horizontal touch movement pans continuously at the aiming area edges without a 24px view jump', async () => {
  for (const [width, height] of [[390, 480], [1000, 600]]) for (const zoom of [1, 3]) {
    const directions = [{ x: -1, y: 0 }, { x: 1, y: 0 }];
    for (const direction of directions) {
      const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], scopeLoadouts: {20: {owned: [3], equipped: 3}}, bow: 20, sound: false });
      app.resize(width, height);await equipMainGun(app, 20);
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

test('elevation touch and arrow keys change pitch without raising the view in normal play or administrator trials', async () => {
  for (const adminTrial of [false]) for (const enabled of [false, true]) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      ownedBows: [0, 13], bow: 13, laserLoadouts: { 13: { enabled } } }, { adminTrial });
    if (adminTrial) {
      app.api.showShop('bow');app.api.equipItem(13);app.api.closeModal();await app.flush();
      assert.equal(app.api.setLaserSettings({ enabled }), true);
    }
    assert.equal(app.api.setAimZoom(1), true);
    const state = app.api.state, pad = app.getElement('aimTouchpad');
    for (const [width, height] of [[390, 480], [844, 235]]) {
      app.resize(width, height);app.getElement('recenterBtn').emit('click');app.frames();
      const panY = state.panY, horizon = app.api.camera.horizon;
      const target = app.engine.targetAt(state.stage, state.time), targetScreen = app.api.project(target);
      const fixedView = () => {
        assert.equal(state.panY, panY);assert.equal(app.api.camera.horizon, horizon);
        assert.deepEqual(app.api.project(target), targetScreen, 'the actual target stays at the same screen height');
      };
      const down = {clientX: width * .4, clientY: height * .85};
      const before = enabled ? app.api.laserFrame().point.y : null;
      pad.emit('pointerdown', down);
      pad.emit('pointermove', {...down, clientY: down.clientY - 10000});app.frames();
      assert.ok(Math.abs(state.aim.pitch - Math.PI / 3) < 1e-12, 'main weapons can be raised to a real sixty-degree launch angle');fixedView();
      if (enabled) assert.ok(app.api.laserFrame().point.y > before, 'only the aiming ray rises');
      pad.emit('pointermove', {...down, clientY: down.clientY + 10000});app.frames();
      assert.ok(Math.abs(state.aim.pitch + .22) < 1e-12, 'the full low launch angle remains available');fixedView();
      if (enabled) assert.ok(app.api.laserFrame().point.y < before, 'only the aiming ray drops');
      pad.emit('pointercancel');assert.equal(state.mode, 'ready');
      for (const [code, pitch] of [['ArrowUp', Math.PI / 3], ['ArrowDown', -.22]]) {
        app.document.emit('keydown', {code});
        for (let step = 0; step < 30; step++) app.advanceTo(app.now + 250);
        app.document.emit('keyup', {code});
        assert.ok(Math.abs(state.aim.pitch - pitch) < 1e-12);fixedView();
      }
      assert.equal(state.used, 0);assert.equal(state.shot, null);
    }
  }
});

test('gun release applies the last relative touch delta exactly once without an ammunition authorization step', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], bow: 20, sound: false},
    {remaining: 0, coins: 0, hold: ['spend', 'buy']});
  app.resize(390, 480, {left: 9, top: 74});app.until(() => app.api.state.reloadRemaining === 0);
  const pad = app.getElement('aimTouchpad'), state = app.api.state, before = baseAimScreen(app);
  const down = {clientX: 120, clientY: 460};
  pad.emit('pointerdown', down);pad.emit('pointermove', {clientX: down.clientX + 12, clientY: down.clientY - 6});
  state.sway.x = .012;state.sway.y = -.009;
  app.advanceTo(app.now + 300, {frame: false});
  const release = {clientX: down.clientX + 16, clientY: down.clientY - 10};
  pad.emit('pointerup', release);
  const after = baseAimScreen(app), {yaw, pitch} = state.aim, shot = state.shot;
  assert.equal(state.mode, 'flight', 'the local trigger launches synchronously');
  assert.ok(Math.abs(after.x - before.x - 16) < 1e-9 && Math.abs(after.y - before.y + 10) < 1e-9);
  assert.ok(Math.abs(Math.atan2(shot.velocity.x, shot.velocity.z) - yaw - .012 * .68) < 1e-12);
  assert.ok(Math.abs(Math.atan2(shot.velocity.y, Math.hypot(shot.velocity.x, shot.velocity.z)) - pitch + .009 * .68) < 1e-12);
  assert.equal(app.api.pointer, null);assert.equal(state.magazine, 9);
  pad.emit('pointerup', release);pad.emit('lostpointercapture');await app.flush();
  assert.equal(state.shot, shot);assert.equal(state.used, 1);
  assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
  assert.equal(app.ammo.account.remaining, 0);assert.equal(app.ammo.account.coins, 0);
});

test('other fingers cannot move or release the active lower touch and cancellation paths clear it without consuming a shot', async () => {
  for (const reason of ['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'modal', 'stage', 'resize']) {
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
    if (reason === 'stage') {clearFixtureBefore(app, 2);app.api.startStage(2);}
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
  assert.equal(app.api.progress.unlocked, 2);
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
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: initialCoins, ownedBows: [0], ownedArrows: [0], unlocked: 1, lastStage: 1, sound: false }));
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
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 40000, ownedArrows: [0, 11], arrow: 11, sound: false });
  let balance = 40000;
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
  // Aim at the physical 1.22m face, rather than the former oversized rim.
  { id: 12, stage: lessonStageId('fixed-intro', 30), charge: 1, yaw: 0, pitch: -.201, effect: '1회 튕김' },
  { id: 13, stage: lessonStageId('fixed-intro', 20), charge: 1, yaw: .0275, pitch: .048, effect: '근접 유도' }
]) test(`special arrow ${fixture.id} keeps one touch, one flight and one reward through its physical effect`, async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100, ownedArrows: [0, fixture.id], arrow: fixture.id, lastStage: fixture.stage, sound: false }));
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
  assert.ok(app.api.camera.z > 0, 'the camera keeps following the actual arrow');
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
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 100, sound: false});
  const {pad, coords} = preciseMainDraw(app), {state} = app.api;
  const originalAim = {...state.aim}, originalCamera = {...app.api.camera};
  pad.emit('pointerup', coords);await app.flush();
  app.until(() => state.mode === 'settling');
  const shot = state.shot, replay = state.cinematic;
  assert.equal(shot.result.score, 10);assert.ok(replay);
  assert.equal(replay.shot, shot);assert.ok(shot.replayFrames.length > 2);
  assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'flight');
  assert.equal(app.getElement('shotFeedback').classList.contains('hidden'), true, 'the replay does not reveal its impact message before contact');
  assert.deepEqual(shotAccounting(app), [1, 10, 1, 1, 1, 100 + app.engine.getScoreCoinReward(10, app.api.state.stage.id), 10000]);
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
  assert.equal(app.vignetteFrames.at(-1).at(-1).impactAge, -1);
  app.until(() => app.getElement('gameCanvas').dataset.cinematic === 'impact');
  assert.equal(state.time, worldTime);assert.ok(app.bullseyeFrames.length > 0);
  assert.equal(app.getElement('shotFeedback').classList.contains('hidden'), false);
  assert.match(app.getElement('flightBadge').textContent, /10점/);
  assert.equal(app.vignetteFrames.at(-1).at(-1).impactAge, app.api.cinematicFrame().impactAge);
  const offsets = [{x: shot.attachment.x, y: shot.attachment.y}], markVelocity = JSON.stringify(shot.targetMark.velocity);
  assertAttachedArrows(app, offsets, [shot.velocity], .12);
  let largestWobble = 0;
  for (const age of [.04, .09, .17, .28, .43, .64]) {
    app.until(() => app.api.cinematicFrame().impactAge >= age);
    const target = app.engine.targetAt(state.stage, app.api.renderTime());
    const tip = app.api.sceneItems(target).find(item => item.kind === 'tip');
    const direction = ['x', 'y', 'z'].map(axis => (tip.point[axis] - tip.tail[axis]) / .85);
    const speed = Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z);
    const deviation = Math.hypot(...['x', 'y', 'z'].map((axis, index) => direction[index] - shot.velocity[axis] / speed));
    largestWobble = Math.max(largestWobble, deviation);
    assertAttachedArrows(app, offsets, [shot.velocity], age < .6 ? .12 : 0);
    assert.equal(JSON.stringify(shot.targetMark.velocity), markVelocity, 'visual recoil never edits the saved attachment direction');
    assert.equal(JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result}), physics);
  }
  assert.ok(largestWobble > .005, 'the shaft visibly vibrates around its fixed impact tip before settling');
  app.until(() => app.getElement('gameCanvas').dataset.cinematic === 'return');
  app.until(() => state.mode === 'ready');
  assert.equal(state.cinematic, null);assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'none');
  assert.deepEqual(shotAccounting(app), accounting);
  assert.deepEqual({...state.aim}, originalAim);assert.deepEqual({...app.api.camera}, originalCamera);
  app.frames(4);assert.ok(state.time > worldTime, 'normal scene time resumes when the replay is complete');
});

test('eight-point hits, misses and animal hits do not start either circular-target celebration', async () => {
  for (const bow of [0, 22]) for (const outcome of ['eight', 'miss']) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
      ownedBows: bow ? [0, bow] : [0], bow, ownedBullets: bow ? [0, 3] : [], bullet: 3, sound: false});
    const {state} = app.api;app.until(() => state.mode === 'ready' && state.reloadRemaining === 0);
    const {pad, coords} = outcome === 'eight' ? preciseMainDraw(app, {x: .3, y: 0}) : startHighMiss(app);
    pad.emit('pointerup', coords);await app.flush();app.until(() => state.mode === 'settling');
    assert.equal(state.shot.result.score, outcome === 'eight' ? 8 : 0);
    assert.equal(state.cinematic, null);app.frames(5);
    assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'none');
    assert.equal(app.bullseyeFrames.length, 0);assert.equal(app.vignetteFrames.length, 0);
    assert.equal(app.bulletFlightFrames.length, 0);assert.equal(app.bulletImpactFrames.length, 0);assert.equal(app.bulletVignetteFrames.length, 0);
  }
  const animal = await appHarness();await enterScene(animal, 'rabbit');
  resolveTestHit(animal, {x: 0, y: 0}, {x: 0, y: -2, z: 30}, 10);
  assert.equal(animal.api.state.cinematic, null);assert.equal(animal.api.state.score, 10);
});

test('every gun and bullet type plays a separate rotating-bullet celebration without replaying physics or awarding twice', async () => {
  for (const bow of [20, 21, 22]) for (const bullet of [0, 1, 2, 3]) {
    const distance = [10, 50, 150, 10][bullet];
    const stage = STAGE_FIXTURES.find(entry => entry.kind === 'target' && entry.distance === distance && !entry.motion.speed && !entry.obstacles.length && !entry.passers.length);
    const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
      ownedBows: [0, bow], bow, ownedBullets: [0, 1, 2, 3], bullet, coins: 100, lastStage: stage.id, sound: false}), {remaining: 0});
    const {state} = app.api, {pad, coords} = preciseMainDraw(app);
    const aim = {...state.aim}, baseCamera = {...app.api.camera};
    pad.emit('pointerup', coords);await app.flush();
    // The fastest bullet can resolve inside one rendered frame. Its launch and
    // real impact still provide the two endpoints needed for its own replay.
    if (bullet === 3) {
      app.advanceTo(app.now + 1000 / 30);
      assert.equal(state.mode, 'settling', 'a fastest close-range hit resolves within one rendered frame');
    }
    app.until(() => state.mode === 'settling');
    const shot = state.shot, replay = state.cinematic, worldTime = state.time;
    assert.equal(shot.projectileType, 'bullet');assert.equal(shot.bulletId, bullet);assert.equal(shot.result.score, 10);
    assert.equal(replay?.kind, 'bullet');assert.equal(replay.shot, shot);assert.ok(shot.replayFrames.length >= 2);
    assert.equal(app.cinematic.createBullseyeCinematic(shot, worldTime), null, 'a bullet uses its own presentation instead of the arrow animation');
    assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'flight');
    assert.equal(app.getElement('shotFeedback').classList.contains('hidden'), true);
    const physics = JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result});
    const accounting = shotAccounting(app);assert.deepEqual(accounting, [1, 10, 1, 1, 1, 100 + app.engine.getScoreCoinReward(10, app.api.state.stage.id), 0]);
    app.api.onImpact();app.api.onImpact();assert.equal(state.cinematic, replay);
    app.frames(12);
    const frame = app.api.cinematicFrame(), target = app.engine.targetAt(state.stage, app.api.renderTime());
    assert.equal(frame.phase, 'flight');assert.equal(frame.kind, 'bullet');assert.equal(frame.projectileType, 'bullet');
    const items = app.api.sceneItems(target), projectiles = items.filter(item => item.kind === 'bullet');
    assert.equal(projectiles.length, 1);assert.equal(projectiles[0].flying, true);
    assert.ok(items.every(item => !['shaft', 'tip', 'feather'].includes(item.kind)), 'a bullet never grows an arrow shaft or feathers');
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(projectiles[0].point[axis] - frame.point[axis]) < 1e-9);
    assert.ok(app.bulletFlightFrames.length > 0);assert.equal(app.bulletImpactFrames.length, 0);
    const rendered = app.bulletFlightFrames.at(-1).at(-1), projected = app.api.project(frame.point);
    assert.ok(Math.hypot(rendered.tip.x - projected.x, rendered.tip.y - projected.y) < 1e-8, 'the new rotating projectile is drawn at its measured position');
    assert.ok(Number.isFinite(rendered.spin));const spin = rendered.spin;app.frames(6);
    assert.notEqual(app.bulletFlightFrames.at(-1).at(-1).spin, spin, 'the bullet visibly rotates during slow motion');
    pad.emit('pointerdown');pad.emit('pointerup');
    assert.equal(state.shot, shot);assert.equal(state.used, 1);assert.equal(state.magazine, 9, 'input during replay cannot spend a second shot');
    app.until(() => app.api.cinematicFrame()?.phase === 'impact');
    assert.equal(state.time, worldTime);assert.equal(JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result}), physics);
    assert.equal(app.getElement('shotFeedback').classList.contains('hidden'), false);assert.match(app.getElement('flightBadge').textContent, /10점/);
    assert.ok(app.bulletImpactFrames.length > 0);assert.ok(app.bulletMarkFrames.length > 0);
    assert.equal(app.bullseyeFrames.length, 0);assert.equal(app.vignetteFrames.length, 0, 'bullet effects never call the arrow celebration renderer');
    const impact = app.bulletImpactFrames.at(-1).at(-1), point = app.api.project({...shot.result.point, z: shot.result.point.z - .002});
    assert.ok(Math.hypot(impact.x - point.x, impact.y - point.y) < 1e-8, 'the impact effect remains at the actual ten-point hit');
    assert.deepEqual(shotAccounting(app), accounting);
    app.until(() => app.api.cinematicFrame()?.phase === 'return');
    app.until(() => state.mode === 'ready');
    assert.equal(state.cinematic, null);assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'none');
    assert.equal(state.targetMarks.length, 1);assert.equal(state.targetMarks[0].projectileType, 'bullet');
    assert.deepEqual(shotAccounting(app), accounting);assert.equal(state.magazine, 9);
    assert.deepEqual({...state.aim}, aim);assert.deepEqual({...app.api.camera}, baseCamera);
    assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
  }
});

test('real bullet releases compound wall losses, preserve exact replay entries and award each ten-point hit once', async () => {
  for (const fixture of [
    {materials: ['wood'], speed: .8, drop: 1.2},
    {materials: ['stone'], speed: .5, drop: 1.5},
    {materials: ['wood', 'wood'], speed: .64, drop: 1.44},
    {materials: ['stone', 'stone'], speed: .25, drop: 2.25},
    {materials: ['wood', 'stone'], speed: .4, drop: 1.8},
    {materials: ['stone', 'wood'], speed: .4, drop: 1.8},
    {materials: ['wood', 'stone'], speed: .4, drop: 1.8, bullet: 3, distance: 10},
    {materials: ['wood', 'stone'], speed: .4, drop: 1.8, bullet: 3, distance: 150}
  ]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
      ownedBows: [0, 22], bow: 22, ownedBullets: [0, 3], bullet: fixture.bullet || 0, coins: 100,
      coachEnabled: true, sound: false}, {remaining: 0});
    setCoveredGunFixture(app, fixture.materials, fixture.distance || 150);
    const {state} = app.api, draw = preciseMainDraw(app), aim = coveredGunAim(app);
    draw.coords = moveHeldAim(app, aim.yaw, aim.pitch);
    app.until(() => state.coachReady, 8);
    const originalAim = {...state.aim}, originalCamera = {...app.api.camera};
    const walls = JSON.stringify(state.stage.obstacles), best = JSON.stringify(app.api.progress.best);
    draw.pad.emit('pointerup', draw.coords);await app.flush();
    assert.equal(state.used, 1);assert.equal(state.magazine, 9);
    assert.equal(state.shot.penetrations.length, 0, 'a newly released bullet starts without another shot\'s penalties');
    const badges = new Set();
    if (fixture.bullet === 3) app.advanceTo(app.now + 100);
    while (state.mode === 'flight') {badges.add(app.getElement('flightBadge').textContent);app.frames();}
    assert.equal(state.mode, 'settling');
    const shot = state.shot, replay = state.cinematic, accounting = shotAccounting(app);
    assert.equal(shot.result.type, 'hit');assert.equal(shot.result.score, 10);assert.equal(replay?.kind, 'bullet');
    assert.deepEqual(accounting, [1, 10, 1, 1, 1, 100 + app.engine.getScoreCoinReward(10, app.api.state.stage.id), 0]);
    assert.equal(shot.penetrations.length, fixture.materials.length);
    assert.ok(Math.abs(shot.penetrationSpeedRatio - fixture.speed) < 1e-12);
    assert.ok(Math.abs(shot.penetrationDropRatio - fixture.drop) < 1e-12);
    for (const [index, entry] of shot.penetrations.entries()) {
      assert.equal(entry.material, fixture.materials[index]);assert.equal(entry.obstacleIndex, index);
      assert.ok(Math.abs(entry.point.z - (state.stage.obstacles[index].z - .4)) < 1e-8);
      const frame = shot.replayFrames.find(value => Math.abs(value.time - entry.time) < 1e-10);
      assert.ok(frame, 'the real contact clock is recorded even between rendered frames');
      assert.deepEqual({...frame.point}, {...entry.point});
      assert.deepEqual({...frame.incomingVelocity}, {...entry.velocityBefore});
      assert.deepEqual({...frame.velocity}, {...entry.velocityAfter});
      assert.ok(entry.time > shot.replayFrames[0].time && entry.time < shot.replayFrames.at(-1).time);
      if (fixture.distance === 10) assert.ok(replay.frames.some(value => Math.abs(value.time - entry.time) < 1e-10),
        'both close walls remain at their exact entry locations in the short cinematic');
    }
    if (fixture.bullet !== 3) assert.ok([...badges].some(value => /관통/.test(value)), 'the live HUD acknowledges penetration');
    const feedback = app.getElement('feedbackDetail').textContent;
    assert.match(feedback, new RegExp(`${fixture.materials.length}회 관통`));
    assert.match(feedback, new RegExp(`속도 ${Math.round(fixture.speed * 100)}%`));
    assert.match(feedback, fixture.bullet === 3 ? /기본탄 대비 낙차 80%/ : new RegExp(`낙차 ${Math.round(fixture.drop * 100)}%`));
    const physics = JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed,
      result: shot.result, entries: shot.penetrations, frames: shot.replayFrames});
    const saved = JSON.stringify(app.snapshot()), saveCount = app.storageOperations.filter(([action]) => action === 'set').length;
    app.api.onImpact();app.api.onImpact();draw.pad.emit('pointerdown');draw.pad.emit('pointerup');
    assert.equal(state.shot, shot);assert.equal(state.cinematic, replay);assert.equal(state.magazine, 9);
    app.until(() => app.api.cinematicFrame()?.phase === 'impact');
    assert.ok(app.bulletImpactFrames.length > 0);assert.equal(app.bullseyeFrames.length, 0);
    app.until(() => state.mode === 'ready' && state.reloadRemaining === 0);
    assert.equal(JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed,
      result: shot.result, entries: shot.penetrations, frames: shot.replayFrames}), physics);
    assert.deepEqual(shotAccounting(app), accounting);assert.equal(state.targetMarks.length, 1);
    assert.equal(JSON.stringify(app.snapshot()), saved);
    assert.equal(app.storageOperations.filter(([action]) => action === 'set').length, saveCount);
    assert.deepEqual({...state.aim}, originalAim);assert.deepEqual({...app.api.camera}, originalCamera);
    assert.equal(JSON.stringify(state.stage.obstacles), walls);assert.equal(JSON.stringify(app.api.progress.best), best);
    assert.equal(app.api.progress.unlocked, 1, 'passing walls and the cinematic do not unlock another stage');
    assert.equal(app.finishedRounds.length, 0);assert.equal(app.ammo.requests.filter(request => ['spend', 'buy', 'coach-buy', 'round-complete'].includes(request.action)).length, 0);
    draw.pad.emit('pointerdown');holdFor(app, 250);draw.pad.emit('pointerup');
    assert.notEqual(state.shot, shot);assert.equal(state.shot.penetrations.length, 0);
    assert.equal(state.shot.penetrationSpeedRatio, 1);assert.equal(state.shot.penetrationDropRatio, 1);
    assert.equal(state.used, 2);assert.equal(state.magazine, 8);assert.equal(state.score, 10);
    assert.equal(app.api.progress.shots, 1, 'the next pending shot does not replay or re-award the first impact');
  }
});

test('a real bullet hits a person behind two walls and removes that person only for the following shot', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
    ownedBows: [0, 22], bow: 22, coins: 100, coachEnabled: true, sound: false}, {remaining: 0});
  setCoveredGunFixture(app, ['wood', 'stone']);
  const {state} = app.api;
  state.stage.passers = [{id: 7, z: 100, width: 30, height: 10, depth: .1, passDuration: 1e6, phase: .5}];
  const draw = preciseMainDraw(app), aim = coveredGunAim(app);draw.coords = moveHeldAim(app, aim.yaw, aim.pitch);
  holdFor(app, 200);assert.equal(state.coachReady, false);
  assert.equal(state.stage.retiredPasserIds.length, 0, 'a coach forecast cannot retire the person');
  draw.pad.emit('pointerup', draw.coords);await app.flush();app.until(() => state.mode === 'settling');
  const shot = state.shot;assert.equal(shot.penetrations.length, 2);
  assert.equal(shot.result.type, 'person');assert.equal(shot.result.personId, 7);assert.equal(shot.result.score, 0);
  assert.equal(state.cinematic, null);assert.equal(state.targetMarks.length, 0);
  assert.deepEqual(shotAccounting(app), [1, 0, 0, 1, 0, 101, 0]);assert.equal(state.magazine, 9);
  assert.match(app.getElement('feedbackDetail').textContent, /이번 발사 0점/);
  assert.match(app.getElement('feedbackDetail').textContent, /다음 발사부터 빠져요/);
  assert.match(app.getElement('feedbackDetail').textContent, /2회 관통/);
  app.until(() => state.mode === 'ready' && state.reloadRemaining === 0);
  assert.ok(state.stage.retiredPasserIds.includes(7));
  const again = preciseMainDraw(app), corrected = coveredGunAim(app);
  again.coords = moveHeldAim(app, corrected.yaw, corrected.pitch);app.until(() => state.coachReady, 8);
  again.pad.emit('pointerup', again.coords);await app.flush();app.until(() => state.mode === 'settling');
  assert.equal(state.shot.result.type, 'hit');assert.equal(state.shot.result.score, 10);
  assert.equal(state.shot.penetrations.length, 2);assert.equal(state.used, 2);assert.equal(state.magazine, 8);
  assert.deepEqual(shotAccounting(app), [2, 10, 1, 2, 1, 101 + app.engine.getScoreCoinReward(10, app.api.state.stage.id), 0]);
});

test('normal arrows remain stopped by either wall material in the actual release flow', async () => {
  for (const material of ['wood', 'stone']) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false, coachEnabled: true});
    setCoveredGunFixture(app, [material], 10);
    const {state} = app.api, {pad, coords} = preciseMainDraw(app);
    assert.equal(state.coachReady, false);pad.emit('pointerup', coords);await app.flush();
    app.until(() => state.mode === 'settling');
    assert.equal(state.shot.projectileType, 'arrow');assert.equal(state.shot.result.type, 'obstacle');
    assert.equal(state.shot.result.score, 0);assert.equal(state.shot.penetrations?.length || 0, 0);
    assert.equal(state.cinematic, null);assert.equal(state.used, 1);assert.equal(state.score, 0);
    assert.doesNotMatch(app.getElement('feedbackDetail').textContent, /관통/);
  }
});

test('moving-target bullet celebration keeps the real impact and remains visible through phone and landscape resizing', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
    ownedBows: [0, 22], bow: 22, ownedBullets: [0, 3], bullet: 3, sound: false});
  await enterScene(app, 'moving');
  const {state} = app.api, {pad, coords} = preciseMainDraw(app);pad.emit('pointerup', coords);await app.flush();
  app.until(() => state.mode === 'settling');const shot = state.shot, worldTime = state.time, accounting = shotAccounting(app);
  assert.equal(state.cinematic?.kind, 'bullet');assert.equal(shot.result.score, 10);app.frames(12);
  const physics = JSON.stringify({velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result, attachment: shot.attachment, mark: shot.targetMark});
  for (const [width, height] of [[390, 640], [844, 290], [1000, 600]]) {
    app.resize(width, height);app.frames();
    const frame = app.api.cinematicFrame(), target = app.engine.targetAt(state.stage, frame.time);
    const items = app.api.sceneItems(target), displayed = items.find(item => item.kind === 'target').target;
    assert.equal(displayed.x, target.x);assert.equal(displayed.y, target.y);assert.equal(app.sceneryFrame.time, frame.time);
    const point = app.api.project(frame.point);
    assert.ok(Object.values(app.api.camera).every(Number.isFinite));assert.equal(point.visible, true);
    assert.ok(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
    assert.equal(state.time, worldTime);assert.deepEqual(shotAccounting(app), accounting);
  }
  app.until(() => app.api.cinematicFrame()?.phase === 'impact');
  assert.equal(JSON.stringify({velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result, attachment: shot.attachment, mark: shot.targetMark}), physics);
  const impactTarget = app.engine.targetAt(state.stage, app.api.renderTime()), effect = app.bulletImpactFrames.at(-1).at(-1);
  const impact = app.api.project({x: impactTarget.x + shot.attachment.x, y: impactTarget.y + shot.attachment.y, z: impactTarget.z - .002});
  assert.ok(Math.hypot(effect.x - impact.x, effect.y - impact.y) < 1e-8);
  app.until(() => state.mode === 'ready');app.frames(90);
  const moved = app.engine.targetAt(state.stage, state.time), mark = app.bulletMarkFrames.at(-1).at(-1);
  assert.ok(Math.abs(moved.x - shot.result.targetCenter.x) > .01, 'the marked target resumes its real movement after the animation');
  const attached = app.api.project({x: moved.x + shot.attachment.x, y: moved.y + shot.attachment.y, z: moved.z - .002});
  assert.ok(Math.hypot(mark.point.x - attached.x, mark.point.y - attached.y) < 1e-8, 'the bullet hole travels with the moving target');
  assert.equal(JSON.stringify({velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result, attachment: shot.attachment, mark: shot.targetMark}), physics);
  assert.deepEqual(shotAccounting(app), accounting);
});

test('reduced-motion bullet bullseyes retain the ordinary impact view and skip the spinning flight', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
    ownedBows: [0, 22], bow: 22, ownedBullets: [0, 3], bullet: 3, sound: false}, {reducedMotion: true});
  const {state} = app.api, {pad, coords} = preciseMainDraw(app), baseCamera = {...app.api.camera};
  pad.emit('pointerup', coords);await app.flush();app.until(() => state.mode === 'settling');
  const replay = state.cinematic, accounting = shotAccounting(app), frame = app.api.cinematicFrame();
  assert.equal(replay?.kind, 'bullet');assert.equal(replay.reducedMotion, true);assert.equal(replay.flightDuration, 0);
  assert.equal(frame.phase, 'impact');assert.equal(frame.entryMask, 0);assert.equal(frame.impactPulse, 0);
  app.resize(1000, 600);
  assert.deepEqual({...app.api.camera}, {...app.view.desiredFollowCamera(state.shot.position, baseCamera, {w: 1000, h: 600})},
    'motion preference prevents the special close-up camera');
  app.frames(10);assert.equal(app.bulletFlightFrames.length, 0);assert.ok(app.bulletImpactFrames.length > 0);
  assert.ok(app.bulletImpactFrames.every(entry => entry.at(-1).reducedMotion));
  assert.ok(app.bulletVignetteFrames.every(entry => entry.at(-1).reducedMotion));
  assert.equal(app.bullseyeFrames.length, 0);assert.equal(app.vignetteFrames.length, 0);
  app.until(() => state.mode === 'ready');assert.deepEqual(shotAccounting(app), accounting);assert.equal(state.magazine, 9);
});

test('bullet celebration pauses and resumes through hidden-page and menu interruptions without replaying a shot or award', async () => {
  for (const phase of ['flight', 'impact', 'return']) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
      ownedBows: [0, 22], bow: 22, ownedBullets: [0, 3], bullet: 3, coins: 100, sound: false});
    const {state} = app.api, {pad, coords} = preciseMainDraw(app);pad.emit('pointerup', coords);await app.flush();
    app.until(() => state.mode === 'settling' && app.api.cinematicFrame()?.phase === phase && app.api.cinematicFrame().progress >= .2);
    const replay = state.cinematic, shot = state.shot, accounting = shotAccounting(app);
    const physics = JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result, frames: shot.replayFrames});
    for (const reason of ['hidden', 'menu']) {
      const frozen = {time: state.time, settle: state.settle, magazine: state.magazine, soundPlayed: replay.soundPlayed};
      if (reason === 'hidden') {app.document.hidden = true;app.document.emit('visibilitychange');}
      else {app.getElement('menuBtn').emit('click');assert.equal(state.modal, 'menu');}
      pad.emit('pointerdown');pad.emit('pointerup');app.advanceTo(app.now + 8000);
      assert.deepEqual({time: state.time, settle: state.settle, magazine: state.magazine, soundPlayed: replay.soundPlayed}, frozen,
        `${reason} pauses both the resolved-shot clock and the ${phase} presentation`);
      assert.equal(state.cinematic, replay);assert.equal(state.shot, shot);assert.deepEqual(shotAccounting(app), accounting);
      assert.equal(JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result, frames: shot.replayFrames}), physics);
      if (reason === 'hidden') {app.document.hidden = false;app.document.emit('visibilitychange');}
      else app.api.closeModal();
      await app.flush();app.frames();
      assert.ok(Math.abs(state.settle - frozen.settle - 1 / 60) < 1e-8, 'resuming continues from the held frame without catching up the pause');
      assert.equal(app.api.cinematicFrame().phase, phase);assert.deepEqual(shotAccounting(app), accounting);
    }
    app.api.onImpact();assert.equal(state.cinematic, replay);app.until(() => state.mode === 'ready');
    assert.equal(state.cinematic, null);assert.equal(state.targetMarks.length, 1);assert.equal(state.magazine, 9);
    assert.deepEqual(shotAccounting(app), accounting);
    assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
  }
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
  assertAttachedArrows(app, [offset], [shot.velocity], .12);
  app.until(() => state.mode === 'ready');app.frames(90);
  const moved = assertAttachedArrows(app, [offset], [shot.velocity]);
  assert.ok(Math.abs(moved.x - shot.result.targetCenter.x) > .01);
  assert.deepEqual(shotAccounting(app).slice(0, 5), [1, 10, 1, 1, 1]);
});

for (const fixture of [{id: 12, bow: 11, stage: lessonStageId('fixed-intro', 50), charge: 1, pitch: -.1959}, {id: 13, bow: 0, stage: lessonStageId('fixed-intro', 20), charge: 1, pitch: .066}]) {
  test(`a genuine special-arrow ${fixture.id} bullseye replays its resolved path without repeating its ability`, async () => {
    const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, coins: 100, ownedBows: fixture.bow ? [0, fixture.bow] : [0], bow: fixture.bow, ownedArrows: [0, fixture.id], arrow: fixture.id, lastStage: fixture.stage, sound: false}));
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
  assertAttachedArrows(app, [{x: state.shot.attachment.x, y: state.shot.attachment.y}], [state.shot.velocity]);
  app.until(() => state.mode === 'ready');assert.deepEqual(shotAccounting(app), accounting);
});

test('a new round discards an active replay and old recorded frames without replaying its award', async () => {
  const app = await appHarness(), {state} = app.api;
  const {pad, coords} = preciseMainDraw(app);pad.emit('pointerup', coords);await app.flush();
  app.until(() => state.mode === 'settling');assert.ok(state.cinematic);
  const old = state.shot, coins = app.api.progress.coins;
  app.api.resetRound(app.engine.DISTANCE_STAGES[0]);await app.flush();app.frames(3);
  assert.equal(state.cinematic, null);assert.equal(state.shot, null);assert.equal(state.mode, 'ready');
  assert.equal(state.targetMarks.length, 0);assert.equal(state.effects.length, 0);assert.equal(state.used, 0);
  assert.equal(app.getElement('gameCanvas').dataset.cinematic, 'none');
  assert.equal(app.api.progress.coins, coins);assert.equal(app.api.progress.shots, 1);
  assert.equal(old.handled, true);
});

test('a moving-target burst starts one replay after the last arrival using the chosen arrow’s actual impact time', async () => {
  const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, coins: 100, ownedBows: [0, 19], bow: 19,
    lastStage: lessonStageId('tracking-intro', 10), sound: false}));
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
  const savedEffect = JSON.stringify(shot.impactEffect), savedMark = JSON.stringify(shot.targetMark);
  app.until(() => app.api.cinematicFrame()?.phase === 'return' && app.api.cinematicFrame().progress >= .5);
  const resumedTarget = app.engine.targetAt(state.stage, app.api.renderTime(), shot.targetMark.passId);
  assert.ok(Math.abs(resumedTarget.x - shot.result.targetCenter.x) > 1e-5, 'the return blends toward the later completed-volley scene time');
  const expectedGlow = app.api.project({x: resumedTarget.x + shot.targetMark.x, y: resumedTarget.y + shot.targetMark.y, z: resumedTarget.z - .002});
  const glow = app.bullseyeFrames.at(-1).at(-1);
  assert.ok(Math.abs(glow.x - expectedGlow.x) < 1e-9 && Math.abs(glow.y - expectedGlow.y) < 1e-9,
    'the lingering impact light stays on the same moving-target attachment during return');
  assert.equal(JSON.stringify(shot.impactEffect), savedEffect);assert.equal(JSON.stringify(shot.targetMark), savedMark);
  app.until(() => state.mode === 'ready');
  assert.deepEqual(shotAccounting(app), accounting);assert.equal(state.targetMarks.length, 3);
});

function assertCoachCue(app, visible, message = 'the speech bubble follows the current coaching opportunity') {
  const cue = app.getElement('coachCue');
  assert.equal(cue.classList.contains('hidden'), !visible, message);
  assert.equal(cue.classList.contains('is-ready'), visible, message);
  assert.equal(cue.getAttribute('aria-hidden'), String(!visible), 'assistive visibility matches the displayed cue');
}

const coachingLoadouts = [
  {bow: 0, ownedBows: [0]},
  {bow: 20, ownedBows: [0, 20]},
  {firearmCatalog: FIREARM_CATALOG, bow: 22, ownedBows: [0, 22], bullet: 3, ownedBullets: [0, 3]},
  {bow: 13, ownedBows: [0, 13], laserLoadouts: {13: {enabled: true}}}
];

test('basic coaching is on by default for every aiming mode and its menu preference survives reload without a purchase', async () => {
  for (const loadout of coachingLoadouts) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 10000, ...loadout, sound: false}, {coins: 0});
    assert.equal(app.api.progress.coachEnabled, true);
    app.api.showShop('bow');
    assert.doesNotMatch(app.getElement('modalContent').innerHTML, /data-shop-tab="coach"|data-action="buy-coach"/);
    app.getElement('menuBtn').emit('click');
    assert.match(app.getElement('modalContent').innerHTML, /무료 기본 기능/);
    assert.match(app.getElement('modalContent').innerHTML, /data-action="toggle-coach" aria-pressed="true"/);
    modalAction(app, 'toggle-coach');assert.equal(app.api.progress.coachEnabled, false);assertCoachCue(app, false);
    assert.match(app.getElement('modalContent').innerHTML, /data-action="toggle-coach" aria-pressed="false"/);
    assert.equal(app.snapshot().coachEnabled, false);
    const loaded = await appHarness(app.snapshot(), {server: app.ammo});
    assert.equal(loaded.api.activeBow().id, loadout.bow);
    assert.equal(loaded.api.progress.coachEnabled, false);assertCoachCue(loaded, false);
    loaded.getElement('menuBtn').emit('click');modalAction(loaded, 'toggle-coach');
    assert.equal(loaded.api.progress.coachEnabled, true);assert.equal(loaded.snapshot().coachEnabled, true);
    assert.equal(loaded.api.progress.coins, 10000);assert.equal(loaded.ammo.account.coins, 0);
    assert.equal(loaded.ammo.requests.filter(request => request.action === 'coach-buy').length, 0);
    modalAction(loaded, 'help');
    assert.match(loaded.getElement('modalContent').innerHTML, /무료로 쓰는 기본 기능/);
    assert.doesNotMatch(loaded.getElement('modalContent').innerHTML, /24시간|10쭈|코치 이용 기간/);
  }
});

test('basic coaching in every aiming mode works with no rental, an empty wallet, expired legacy access or no account connection', async () => {
  for (const loadout of coachingLoadouts) for (const options of [{coins: 0}, {coachExpiresAt: new Date(SERVER_EPOCH - 1).toISOString()}, {offline: true}]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ...loadout}, options), beforeCoins = app.ammo.account.coins;
    assert.equal(app.api.progress.coachEnabled, true);
    if (options.offline) assert.equal(app.api.ammo.connection, 'unavailable');
    preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});app.until(() => app.api.state.coachReady, 20);
    assertCoachCue(app, true);assert.equal(app.speech.utterances.length, 1);
    assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.used, 0);
    assert.equal(app.ammo.account.coins, beforeCoins);
    assert.equal(app.ammo.requests.filter(request => ['coach-buy', 'spend', 'buy'].includes(request.action)).length, 0);
    app.getElement('aimTouchpad').emit('pointercancel');assertCoachCue(app, false);
  }
});

test('a saved coach purchase reconciles by receipt without another charge, a gameplay lock or changing an off preference', async () => {
  const original = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 777, coachEnabled: false, sound: false}, {coins: 20});
  const owner = '11111111-1111-4111-8111-111111111111', requestId = '33333333-3333-4333-8333-333333333333';
  const purchased = original.ammo.execute({action: 'coach-buy', requestId});
  assert.equal(purchased.coins, 10);
  original.store.set('forest-archer-ammo-pending-v5:' + owner, JSON.stringify({version: 1, launchEpoch: 5, owner, action: 'coach-buy', requestId, payload: {}, localRunId: null}));
  const app = await appHarness(original.snapshot(), {store: new Map(original.store), server: original.ammo});
  await app.flush();assert.equal(app.api.ammo.pending, null);
  const receipts = app.ammo.requests.filter(request => request.action === 'receipt');
  assert.equal(receipts.length, 1);assert.equal(receipts[0].receiptId, requestId);assert.equal(receipts[0].originalAction, 'coach-buy');
  const recovered = JSON.parse(app.store.get('forest-archer-ammo-recovery-v5:' + owner));
  assert.deepEqual(recovered, [{requestId, action: 'coach-buy', retired: true, receiptFound: true, confirmed: true}]);
  await app.api.retryAmmo();await app.flush();
  assert.equal(app.api.ammo.pending, null);assert.equal(app.ammo.account.coins, 10);
  assert.equal(app.api.ammo.snapshot.coins, 10);assert.equal(app.api.progress.coins, 777);
  assert.equal(app.ammo.account.coach_expires_at, purchased.coach_expires_at);
  assert.equal(app.api.progress.coachEnabled, false);
  assert.equal(app.api.state.registering, false);assert.ok(app.api.state.serverRunId);
  const {pad} = startCenteredDraw(app);assert.equal(app.api.state.mode, 'drawing');pad.emit('pointercancel');
  assert.equal(app.api.state.used, 0);assert.equal(app.api.progress.coachEnabled, false);
  assert.equal(app.ammo.requests.filter(request => ['coach-buy', 'spend', 'buy'].includes(request.action)).length, 0);
});

test('legacy rental expiry never stops basic coaching during a held draw or purchases an extension', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: true},
    {coachExpiresAt: new Date(SERVER_EPOCH + 1800).toISOString()});
  const {pad} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  app.until(() => app.api.state.coachSaid, 20);assertCoachCue(app, true);
  holdFor(app, 700);
  assert.ok(SERVER_EPOCH + app.now > Date.parse(app.ammo.account.coach_expires_at));
  assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.used, 0);
  assertCoachCue(app, true, 'the legacy expiration no longer controls the default coaching cue');
  pad.emit('pointercancel');
  preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});app.until(() => app.api.state.coachSaid, 20);
  assertCoachCue(app, true);assert.equal(app.ammo.requests.filter(request => request.action === 'coach-buy').length, 0);
  app.getElement('aimTouchpad').emit('pointercancel');
});

test('resuming the game and a failed account refresh do not interrupt basic coaching', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: true});
  app.ammo.held.add('status');
  app.document.hidden = true;app.document.emit('visibilitychange');
  app.document.hidden = false;app.document.emit('visibilitychange');await app.flush();
  const refresh = app.ammo.requests.filter(request => request.action === 'status').at(-1);
  assert.equal(app.api.state.ammoRefreshing, true);
  preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});app.until(() => app.api.state.coachReady, 20);
  assertCoachCue(app, true, 'coaching is available while account status is still being checked');
  app.ammo.reply(refresh, {ok: false, reason: 'unavailable'});await app.flush();app.frames(8);
  assert.equal(app.api.state.ammoRefreshing, false);assertCoachCue(app, true);
  assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.used, 0);
  assert.equal(app.ammo.requests.filter(request => request.action === 'coach-buy').length, 0);
  app.getElement('aimTouchpad').emit('pointercancel');
});

test('the basic coach keeps good timing visible and repeats each new opportunity without overlapping voices or firing', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 100, coachEnabled: true, sound: true});
  const {state} = app.api, {pad} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  assert.equal(state.coachSaid, false);assert.equal(state.coachReady, false);
  assertCoachCue(app, false);
  const goodAim = {...state.aim}, before = shotAccounting(app);
  app.until(() => app.speech.utterances.length === 1, 20);
  assert.equal(state.coachReady, true);assert.equal(state.coachSaid, true);
  assertCoachCue(app, true);
  assert.doesNotMatch(app.getElement('powerLabel').textContent, /코치 · 쏴!/, 'the draw gauge retains its own label when the coach bubble appears');
  const firstVoice = app.speech.times[0];
  while (app.now - firstVoice < 1100) {
    app.frames(1);
    assertCoachCue(app, true, 'a continuous good window keeps its visual cue');
    assert.equal(app.speech.utterances.length, 1, 'continuous speech does not flood each prediction check');
  }
  app.until(() => app.speech.utterances.length === 2, 30);
  assert.ok(app.speech.times[1] - firstVoice >= 1400 - 1e-8);
  assert.ok(app.speech.times[1] - firstVoice <= 1480);
  assert.deepEqual({...state.aim}, goodAim, 'coach checks never adjust the player’s aim');

  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);
  assert.equal(state.coachCueUntil, 0);assertCoachCue(app, false, 'bad aim hides the bubble at the next coaching check');
  assert.equal(state.coachSaid, true, 'having spoken before does not disable later opportunities');
  moveHeldAim(app, goodAim.yaw, goodAim.pitch);app.until(() => state.coachReady, 8);
  assert.ok(app.now - app.speech.times[1] < 450);
  assert.equal(app.speech.utterances.length, 2, 'a quick re-entry respects the minimum voice interval');
  assertCoachCue(app, true, 'a new good window is visible during the voice cooldown');
  app.until(() => app.speech.utterances.length === 3, 30);
  assert.ok(app.speech.times[2] - app.speech.times[1] >= 450 - 1e-8);
  assert.ok(app.speech.times[2] - app.speech.times[1] <= 530, 'a still-good new window speaks after cooldown without waiting for the long repeat');

  // A short good window that disappears during voice cooldown must not leave a
  // delayed command queued for the now-bad aim.
  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);
  moveHeldAim(app, goodAim.yaw, goodAim.pitch);app.until(() => state.coachReady, 8);
  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);holdFor(app, 600);
  assert.equal(app.speech.utterances.length, 3);assertCoachCue(app, false);
  moveHeldAim(app, goodAim.yaw, goodAim.pitch);app.until(() => app.speech.utterances.length === 4, 8);
  assert.equal(state.mode, 'drawing');assert.equal(state.shot, null);assert.deepEqual(shotAccounting(app), before);
  assert.equal(app.speech.overlaps, 0);
  for (let i = 1; i < app.speech.times.length; i++) assert.ok(app.speech.times[i] - app.speech.times[i - 1] >= 450 - 1e-8);
  assert.ok(app.speech.utterances.every(utterance => utterance.text === '쏴!' && utterance.lang === 'ko-KR'));

  pad.emit('pointercancel');assert.equal(state.coachReady, false);assert.equal(state.coachCueUntil, 0);assertCoachCue(app, false, 'cancelling a draw immediately removes its cue');
  preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  assert.equal(state.coachSaid, false);app.until(() => app.speech.utterances.length === 5, 20);
  assertCoachCue(app, true);
  app.getElement('menuBtn').emit('click');assertCoachCue(app, false, 'opening a menu cancels and hides the live cue');
  app.api.closeModal();
  const nextDraw = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  assert.equal(state.coachSaid, false);app.until(() => app.speech.utterances.length === 6, 20);
  assertCoachCue(app, true);
  assert.equal(state.mode, 'drawing');assert.equal(state.used, 0);
  nextDraw.pad.emit('pointerup', nextDraw.coords);await app.flush();
  assert.equal(state.used, 1);assert.equal(state.mode, 'flight', 'only the player’s release fires the arrow');
  assertCoachCue(app, false, 'releasing the arrow immediately removes the firing cue');
  assert.equal(app.speech.overlaps, 0);
});

test('coach evaluates every aiming mode up to sixteen times per second and remains absent when disabled', async () => {
  for (const loadout of coachingLoadouts) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ...loadout, coachEnabled: true, sound: true});
    if (app.api.activeBow().weaponType === 'gun') app.until(() => app.api.state.reloadRemaining === 0);
    const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');moveHeldAim(app, .4, .5);
    const checks = [];let previous = app.api.state.coachLastCheck;
    for (let i = 0; i < 120; i++) {
      app.frames(1);const next = app.api.state.coachLastCheck;
      if (next !== previous) checks.push(next);previous = next;
    }
    assert.ok(checks.length >= 24 && checks.length <= 32, 'a two-second draw samples promptly without exceeding sixteen checks per second');
    for (let i = 1; i < checks.length; i++) assert.ok(checks[i] - checks[i - 1] >= 62.5 - 1e-8);
    assert.equal(app.speech.utterances.length, 0);assertCoachCue(app, false);pad.emit('pointercancel');
    const quiet = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coachEnabled: false, sound: true, ...loadout});
    const {pad: input} = preciseMainDraw(quiet, {x: 0, y: 0}, {missDuringHold: true});holdFor(quiet, 150);
    assert.equal(quiet.engine.predictTrajectory(quiet.api.shotParams(), quiet.api.state.stage, quiet.api.state.time).result.score, 10,
      'the saved off preference suppresses a real high-quality opportunity');
    assert.equal(quiet.api.state.mode, 'drawing');assert.equal(quiet.api.state.coachSaid, false);
    assert.equal(quiet.api.state.coachLastCheck, -Infinity);assert.equal(quiet.speech.utterances.length, 0);
    assertCoachCue(quiet, false, 'disabled coaching never displays the bubble in any aiming mode');
    assert.equal(quiet.api.state.used, 0);assert.equal(quiet.ammo.requests.filter(request => request.action === 'spend').length, 0);
    input.emit('pointercancel');
    quiet.getElement('menuBtn').emit('click');assert.match(quiet.getElement('modalContent').innerHTML, /data-action="toggle-coach" aria-pressed="false"/);
  }
});

test('gun coaching follows the changed wall trajectory without firing, moving aim or using account ammunition', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG, ownedBows: [0, 22], bow: 22,
    coachEnabled: true, sound: true}, {remaining: 0, coins: 0});
  setCoveredGunFixture(app, []);
  const {state} = app.api, {pad} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  const goodAim = {...state.aim}, before = shotAccounting(app), beforeMagazine = state.magazine;
  app.until(() => state.coachReady, 20);assertCoachCue(app, true);
  assert.equal(app.speech.utterances.length, 1);assert.equal(app.speech.utterances[0].text, '쏴!');
  assert.deepEqual({...state.aim}, goodAim);
  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);assertCoachCue(app, false);
  holdFor(app, 500);assert.equal(app.speech.utterances.length, 1);
  moveHeldAim(app, goodAim.yaw, goodAim.pitch);app.until(() => state.coachReady, 8);assertCoachCue(app, true);
  assert.equal(app.speech.utterances.length, 2);
  setCoveredGunFixture(app, ['wood', 'stone']);
  const oldAimShot = app.engine.launchArrow(app.api.shotParams());
  app.engine.stepArrow(oldAimShot, 16, state.stage, state.time);
  assert.equal(oldAimShot.penetrations.length, 2);
  assert.notEqual(oldAimShot.result.type, 'hit', 'increased drop makes the former open-lane aim miss');
  app.until(() => !state.coachReady, 8);assertCoachCue(app, false);holdFor(app, 500);
  assert.equal(app.speech.utterances.length, 2, 'the obsolete trajectory cannot queue a delayed firing command');
  assert.deepEqual({...state.aim}, goodAim, 'the coach does not silently adjust the gun for penetration');
  const corrected = coveredGunAim(app);moveHeldAim(app, corrected.yaw, corrected.pitch);
  app.until(() => state.coachReady, 8);assertCoachCue(app, true);
  assert.equal(app.speech.utterances.length, 3);
  assert.equal(state.mode, 'drawing');assert.equal(state.shot, null);assert.equal(state.magazine, beforeMagazine);
  assert.ok(Math.abs(state.aim.pitch - corrected.pitch) < 1e-9);assert.deepEqual(shotAccounting(app), before);
  assert.equal(app.ammo.requests.filter(request => ['coach-buy', 'spend', 'buy'].includes(request.action)).length, 0);
  assert.equal(app.speech.overlaps, 0);
  pad.emit('pointercancel');assertCoachCue(app, false);
});

test('a rare-crossbow draw keeps its coaching spread seed through release and renews it on the next draw', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 19], bow: 19, coachEnabled: true, sound: false});
  app.setRandom(() => .25);
  const {state} = app.api, {pad, coords} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  const seed = state.burstSeed;
  assert.equal(seed, 0x40000000);
  app.setRandom(() => .875);
  app.until(() => state.coachReady, 8);assertCoachCue(app, true);
  const params = app.api.shotParams(app.now);
  assert.equal(params.burstSeed, seed, 'the current coaching input retains the draw seed');
  const expected = app.engine.launchVolley(params);
  pad.emit('pointerup', coords);await app.flush();
  assert.equal(state.mode, 'flight');assert.equal(state.burstSeed, seed);
  for (const [index, shot] of state.volley.shots.entries()) {
    assert.equal(shot.launchDelay, expected[index].launchDelay);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(shot.velocity[axis] - expected[index].velocity[axis]) < 1e-9,
      'the released arrows use the same directions that the coach could forecast');
  }
  app.until(() => state.mode === 'ready');
  pad.emit('pointerdown');
  assert.equal(state.burstSeed, 0xe0000000);assert.notEqual(state.burstSeed, seed);
  pad.emit('pointercancel');assert.equal(state.used, 1);
});

test('muted or speech-unavailable coaching still gives every aiming mode the speech bubble without firing', async () => {
  for (const loadout of coachingLoadouts) for (const options of [{sound: false, speechAvailable: true}, {sound: true, speechAvailable: false}]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ...loadout,
      coachEnabled: true, sound: options.sound}, {speechAvailable: options.speechAvailable});
    preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});app.until(() => app.api.state.coachSaid, 20);
    assertCoachCue(app, true);
    assert.equal(app.speech.utterances.length, 0);assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.used, 0);
    app.getElement('aimTouchpad').emit('pointercancel');assert.equal(app.api.state.coachCueUntil, 0);assertCoachCue(app, false);
  }
});

test('shop stat choices reorder actual cards while purchases still use stable equipment IDs', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 120000, ownedBows: [0], ownedArrows: [0], bow: 0, arrow: 0, sound: false });
  const displayedIds = () => Array.from(app.getElement('modalContent').innerHTML.matchAll(/data-equip="(\d+)"/g), match => Number(match[1]));
  const sort = value => { const select = app.getElement('shopSort');select.tagName = 'SELECT';select.value = value;app.document.emit('change', { target: select }); };
  const filter = value => { const button = app.getElement('weaponFilter');button.tagName = 'BUTTON';button.dataset.weaponFilter = value;app.document.emit('click', { target: button }); };
  const clickBuy = id => { const button = app.getElement('sortedPurchase');button.tagName = 'BUTTON';button.dataset.equip = String(id);app.document.emit('click', { target: button }); };
  const main = app.engine.BOWS;
  app.api.showShop('bow');
  assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(main), item => item.id));
  assert.match(app.getElement('modalContent').innerHTML, /id="shopSort"/);
  assert.match(app.getElement('modalContent').innerHTML, /활 10종 → 일반 단발 석궁 5종 → 레어 3연발 석궁 5종/);
  assert.ok(displayedIds().slice(0, 10).every(id => app.engine.BOWS[id].weaponType === 'bow'));
  assert.ok(displayedIds().slice(10, 15).every(id => app.engine.BOWS[id].weaponType === 'crossbow' && app.engine.BOWS[id].burstCount === 1));
  assert.ok(displayedIds().slice(15, 20).every(id => app.engine.BOWS[id].burstCount === 3));
  filter('crossbow-single');
  assert.equal(displayedIds().length, 5);
  assert.ok(displayedIds().every(id => app.engine.BOWS[id].weaponType === 'crossbow' && app.engine.BOWS[id].burstCount === 1));
  filter('crossbow-burst');
  assert.equal(displayedIds().length, 5);
  assert.ok(displayedIds().every(id => app.engine.BOWS[id].rarity === '레어' && app.engine.BOWS[id].burstCount === 3));
  filter('all');
  sort('steady');
  const durations = displayedIds().map(id => app.engine.BOWS[id].steadyDuration);
  assert.equal(displayedIds()[0], 22, 'the zero-shake rifle ranks ahead of finite steady windows');
  assert.equal(durations[0], 2);assert.equal(durations.at(-1), .5);
  assert.ok(durations.every((duration, index) => index === 0 || duration <= durations[index - 1]));
  assert.match(app.getElement('modalContent').innerHTML, /조준 안정 시간이 긴 순/);
  sort('grouping');
  assert.deepEqual(displayedIds().slice(0, 5), [19, 18, 17, 16, 15], 'only three-arrow bursts have a grouping comparison; single-shot internal values never outrank them');
  assert.ok(displayedIds().slice(5).every(id => app.engine.BOWS[id].burstCount === 1));
  sort('grip');
  assert.equal(displayedIds()[0], 19);
  assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(main, 'grip'), item => item.id));
  assert.equal(app.api.progress.bow, 0, 'browsing a stat order does not equip or spend');
  assert.equal(app.api.progress.coins, 120000);
  const chosenBow = displayedIds()[0], afterBow = 120000 - app.engine.BOWS[chosenBow].price;
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
  assert.equal(displayedIds()[0], 18, 'the finest long-range arrow leads the wind comparison');
  clickBuy(18);
  const afterArrow = afterBow - app.engine.ARROWS[18].price;
  assert.equal(app.api.progress.arrow, 18);
  assert.equal(app.api.progress.coins, afterArrow);
  clickBuy(18);assert.equal(app.api.progress.coins, afterArrow, 're-equipping a bought arrow never charges again');
  app.api.showShop('bow');
  assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(main), item => item.id));
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.bow, chosenBow);assert.equal(reloaded.api.progress.arrow, 18);
  assert.equal(reloaded.api.progress.coins, afterArrow);

  app.api.showShop('bow');sort('progression');filter('gun');
  assert.deepEqual(displayedIds(), [20, 21, 22], 'the original gun and both sniper rifles follow all crossbows');
  const gunHtml = app.getElement('modalContent').innerHTML;
  assert.doesNotMatch(gunHtml, /접시|UFO|총알 충전/);
  assert.ok(gunHtml.includes('10발'), 'every gun advertises its ten-round magazine');
  const guns = app.engine.BOWS.filter(item => item.weaponType === 'gun');
  sort('reload');assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(guns, 'reload'), item => item.id));
  sort('grip');assert.deepEqual(displayedIds(), Array.from(app.engine.sortEquipment(guns, 'grip'), item => item.id), 'all three guns keep their stable equipment IDs');
  assert.equal(app.api.progress.bow, chosenBow);assert.equal(app.api.progress.arrow, 18);
  assert.equal(app.api.progress.coins, afterArrow, 'browsing guns cannot equip or spend');
});

test('current-journey saves retain bought gear, selected IDs and bound scopes', async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 5, ownedBows: [0, 3, 19], ownedArrows: [0, 11], bow: 19, arrow: 11, scopedBows: [19], lastStage: 23, best: { 12: 41 }, sound: false }));
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
  assert.deepEqual({ ...reloaded.api.progress.best }, {...clearsBefore(23), 12: 41});
});

test('new equipment purchases survive reload within the fresh journey', async () => {
  const app = await appHarness(progressForStage({
    version: 1, stageCatalog: STAGE_CATALOG, coins: 200000, ownedBows: [0, 1, 3], ownedArrows: [0, 2, 3], bow: 3, arrow: 2,
    unlocked: 7, lastStage: 5, best: { 1: 50, 4: 38 }, shots: 29, hits: 20, sound: false
  }));
  assert.equal(app.api.activeBow().id, 3);assert.equal(app.api.activeArrow().id, 2);
  assert.equal(app.engine.BOWS.filter(item => item.weaponType === 'bow').length, 10);
  assert.equal(app.engine.BOWS.filter(item => item.weaponType === 'crossbow').length, 10);
  assert.equal(app.engine.BOWS.filter(item => item.weaponType === 'gun').length, 3);
  const mainWeapons = app.engine.BOWS;
  let expectedCoins = 200000;
  for (const [kind, catalog, ownedKey] of [
    ['bow', mainWeapons, 'ownedBows'], ['arrow', app.engine.ARROWS, 'ownedArrows']
  ]) {
    assert.equal(catalog.length, kind === 'bow' ? 23 : 19, `all ${kind} choices must be available`);
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
  assert.deepEqual(Array.from(reloaded.api.progress.ownedBows).sort((a,b) => a-b), [0, 1, 3, 4, 11, mainWeapons.at(-1).id]);
  assert.deepEqual(Array.from(reloaded.api.progress.ownedArrows), [0, 2, 3, 4, 11, 18]);
  assert.equal(reloaded.api.activeBow().id, mainWeapons.at(-1).id);assert.equal(reloaded.api.activeArrow().id, 18);
  assert.equal(reloaded.api.progress.coins, expectedCoins);
  assert.equal(reloaded.api.progress.unlocked, 5);assert.equal(reloaded.api.state.stage.id, 5);
  assert.deepEqual({ ...reloaded.api.progress.best }, {...clearsBefore(5), 1: 50, 4: 38});
  assert.equal(reloaded.api.progress.shots, 29);assert.equal(reloaded.api.progress.hits, 20);
});

test('expanded save validation accepts real catalog IDs and rejects invalid or unowned equipment', async () => {
  const app = await appHarness(progressForStage({
    version: 1, stageCatalog: STAGE_CATALOG, coins: 456, ownedBows: [0, 4, 11, 14, 14, -1, 999, 1.5, '14', null],
    ownedArrows: [0, 5, 10, 12, 13, 14, 18, -1, 19, '10'], bow: 14, arrow: 11, unlocked: 3, lastStage: 2
  }));
  assert.deepEqual(Array.from(app.api.progress.ownedBows), [0, 4, 11, 14]);
  assert.deepEqual(Array.from(app.api.progress.ownedArrows), [0, 5, 10, 12, 13, 14, 18]);
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
  assert.equal(app.api.progress.unlocked, 2);assert.equal(app.api.state.stage.id, 2);
});

test('the distance course imports released mission scores and equipment once and resumes the right target', async () => {
  const old = {version:1, launchEpoch:5, stageCatalog:'missions-220-v1', coins:537,
    firearmCatalog:FIREARM_CATALOG, ownedBows:[0,4], bow:4, lastStage:2, best:{1:32,2:21,3:5}};
  const store = new Map([['forest-archer-progress-single-v5', JSON.stringify(old)]]);
  const app = await appHarness(null, {store});
  const selected = lessonStageId('fixed-intro', 20);
  assert.equal(app.api.state.stage.id, selected);
  assert.equal(app.api.state.stage.distance, 20);
  assert.equal(app.api.progress.unlocked, 2);
  assert.deepEqual({...app.api.progress.best}, {1:32, [selected]:21, [lessonStageId('fixed-intro',30)]:5});
  assert.equal(app.api.progress.coins, 537);
  assert.equal(app.api.activeBow().id, 4);
  const first = app.snapshot();
  store.set('forest-archer-progress-single-v5', JSON.stringify({...old,coins:0,best:{}}));
  const reopened = await appHarness(null, {store});
  assert.deepEqual(reopened.snapshot().best, first.best);
  assert.equal(reopened.api.progress.coins, 537);
  assert.equal(reopened.api.state.stage.id, selected);
});

test('sequential stage locks cover the full picker, journey buttons, forged selections and direct round entry', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 201,
    coins: 375, shots: 80, hits: 63});
  assert.equal(app.api.state.stage.id, 1, 'a formerly free selection is not a clear');
  assert.equal(app.api.progress.unlocked, 1);assert.equal(app.snapshot().lastStage, 1);
  const ids = html => Array.from(html.matchAll(/data-stage="(\d+)"/g), match => Number(match[1]));
  const expected = Array.from({length: STAGE_COUNT}, (_, index) => index + 1);
  const journey = app.getElement('journeySteps').innerHTML;
  assert.deepEqual(ids(journey), expected);
  app.getElement('menuBtn').emit('click');modalAction(app, 'stages');
  assert.equal(app.api.state.modal, 'stages');
  const html = app.getElement('modalContent').innerHTML;
  assert.deepEqual(ids(html), expected);
  for (const label of ['고정', '움직이는', '벽', '기둥', '토끼', '살쾡이', '사슴', '비둘기', '독수리', '치타'])
    assert.ok(html.includes(label), `${label} lessons remain identifiable while locked`);
  assert.equal((html.match(/class="stage-section-title"/g) || []).length, app.engine.DISTANCE_GROUPS.length);
  assert.deepEqual(Array.from(html.matchAll(/data-stage-range="(\d+)"/g), match => Number(match[1])), Array.from(app.engine.DISTANCE_GROUPS, group => group.first));
  for (const content of [journey, html]) for (const match of content.matchAll(/<button\b[^>]*data-stage="(\d+)"[^>]*>/g))
    assert.equal(/\bdisabled\b/.test(match[0]), Number(match[1]) !== 1, `only stage 1 starts open; checked ${match[1]}`);
  for (const card of html.matchAll(/<button\b[^>]*data-stage="(\d+)"[^>]*>[\s\S]*?<\/button>/g))
    assert.ok(card[0].includes(`목표 점수 ${app.engine.DISTANCE_STAGES[Number(card[1])-1].goal}점`));
  assert.doesNotMatch(html, /모든 단계를 자유롭게/);
  const starts = app.ammo.requests.filter(request => request.action === 'round-start').length;
  const button = app.getElement('forgedStage');button.tagName = 'BUTTON';
  for (const id of [2, 150, 201, STAGE_COUNT, 0, -1, 1.5, NaN, STAGE_COUNT + 1]) {
    button.dataset.stage = String(id);app.document.emit('click', {target: button});app.api.startStage(id);
    if (Number.isInteger(id) && id > 0 && id <= STAGE_COUNT) app.api.resetRound(app.engine.DISTANCE_STAGES[id - 1]);
    await app.flush();assert.equal(app.api.state.stage.id, 1);assert.equal(app.snapshot().lastStage, 1);
  }
  assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts);
  assert.equal(app.api.progress.coins, 375);assert.equal(app.api.progress.shots, 80);assert.equal(app.api.progress.hits, 63);
  assert.deepEqual({...app.api.progress.best}, {});
});

test('sequential stage locks ignore failed scores, event points, round counts and obsolete unlock flags on reload', async () => {
  const best = {1: STAGE_FIXTURES[0].goal - 1, 2: STAGE_FIXTURES[1].goal - 1, 150: STAGE_FIXTURES[149].goal - 1};
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, unlocked: 220, lastStage: 150,
    best, mainRounds: 999, eventBest: 300, eventBestByLevel: {10: 300}, eventPlays: 999,
    coins: 1234, ownedBows: [0, 3, 20], bow: 3, ownedArrows: [0, 2], arrow: 2, stabilizers: 7, sound: false});
  assert.equal(app.api.progress.unlocked, 1);assert.equal(app.api.state.stage.id, 1);
  assert.deepEqual({...app.api.progress.best}, best);
  assert.deepEqual([app.api.progress.coins, app.api.progress.bow, app.api.progress.arrow, app.api.progress.stabilizers], [1234, 3, 2, 7]);
  app.api.startStage(2);await app.flush();assert.equal(app.api.state.stage.id, 1);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.unlocked, 1);assert.equal(reloaded.api.state.stage.id, 1);
  assert.deepEqual({...reloaded.api.progress.best}, best);
});

test('sequential stage locks preserve genuine out-of-order clears for replay without opening uncleared gaps', async () => {
  const best = {...clearsBefore(4), 4: STAGE_FIXTURES[3].goal - 1, 150: STAGE_FIXTURES[149].goal};
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, unlocked: 220, lastStage: 151, best, sound: false});
  assert.equal(app.api.progress.unlocked, 4);assert.equal(app.api.state.stage.id, 4);
  app.api.startStage(150);await app.flush();assert.equal(app.api.state.stage.id, 150);
  app.api.state.score = app.api.state.stage.goal;app.api.state.used = 5;app.api.finishRound();await app.flush();
  assert.equal(app.api.progress.unlocked, 4);
  assert.equal(modalActionDisabled(app, 'previous-stage'), true, 'an uncleared earlier gap stays closed');
  assert.equal(modalActionDisabled(app, 'next-stage'), true, 'a legacy replay cannot open a later uncleared mission');
  modalAction(app, 'next-stage');app.api.startStage(151);await app.flush();assert.equal(app.api.state.stage.id, 150);
  const restored = await appHarness(app.snapshot());
  assert.equal(restored.api.state.stage.id, 150, 'the genuine cleared mission remains replayable on return');
  assert.equal(restored.api.progress.unlocked, 4);assert.deepEqual({...restored.api.progress.best}, best);
  restored.api.startStage(4);await restored.flush();assert.equal(restored.api.state.stage.id, 4);
});

test('sequential stage locks open only after completed passing play and retain the new frontier on reload', async () => {
  const app = await appHarness();
  const finish = async score => {app.api.state.score = score;app.api.state.used = 5;app.api.finishRound();await app.flush();};
  app.api.state.score = app.api.state.stage.goal;app.api.startStage(2);await app.flush();
  assert.equal(app.api.state.stage.id, 1);assert.equal(app.api.progress.unlocked, 1, 'reaching the score before finishing does not unlock');
  await finish(app.api.state.stage.goal - 1);
  assert.equal(app.api.progress.unlocked, 1);assert.equal(modalActionDisabled(app, 'next-stage'), true);
  app.api.startStage(2);await app.flush();assert.equal(app.api.state.stage.id, 1);
  modalAction(app, 'retry');await app.flush();await finish(app.api.state.stage.goal);
  assert.equal(app.api.progress.unlocked, 2);assert.equal(modalActionDisabled(app, 'next-stage'), false);
  app.api.startStage(3);await app.flush();assert.equal(app.api.state.stage.id, 1);
  modalAction(app, 'next-stage');await app.flush();assert.equal(app.api.state.stage.id, 2);
  const restored = await appHarness(app.snapshot());
  assert.equal(restored.api.state.stage.id, 2);assert.equal(restored.api.progress.unlocked, 2);
  restored.api.startStage(1);await restored.flush();assert.equal(restored.api.state.stage.id, 1);
});

test('sequential stage locks advance past preserved real clears when their earlier gap is completed', async () => {
  const best = {2: STAGE_FIXTURES[1].goal, 3: STAGE_FIXTURES[2].goal};
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, best, lastStage: 1});
  assert.equal(app.api.progress.unlocked, 1);
  app.api.state.score = app.api.state.stage.goal;app.api.state.used = 5;app.api.finishRound();await app.flush();
  assert.equal(app.api.progress.unlocked, 4);assert.equal(app.api.progress.best[4], undefined);
  app.api.startStage(4);await app.flush();assert.equal(app.api.state.stage.id, 4);
  app.api.startStage(5);await app.flush();assert.equal(app.api.state.stage.id, 4);
});

test('mission 120 continues into mission 121 and both records survive another visit', async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 400,
    lastStage: 120, mainRounds: 2, best: { 5: 32, 120: 46 }, sound: false }));
  const { state } = app.api;
  state.score = 50;state.used = 5;state.hits = 5;app.api.finishRound();await app.flush();
  assert.equal(state.stage.id, 120);assert.equal(state.modal, 'result');assert.equal(modalActionDisabled(app, 'next-stage'), false);
  const starts = app.ammo.requests.filter(request => request.action === 'round-start').length;
  modalAction(app, 'next-stage');modalAction(app, 'next-stage');await app.flush();
  assert.equal(state.isEvent, false);assert.equal(state.stage.id, 121);assert.equal(state.modal, null);
  assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts + 1);
  assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').at(-1).stage, STAGE_FIXTURES[120].recordId);
  assert.equal(app.api.progress.best[121], undefined, 'entering a new mission does not fabricate a completion record');
  state.score = 50;state.used = 5;state.hits = 5;app.api.finishRound();await app.flush();
  assert.equal(app.api.progress.mainRounds, 4);assert.equal(app.api.progress.coins, 437,
    'the replayed old mission keeps its 12-coin bonus and the newly cleared mission awards 25');
  const reloaded = await appHarness(app.snapshot(), { server: app.ammo });
  assert.equal(reloaded.api.state.stage.id, 121);assert.equal(reloaded.api.progress.unlocked, 122);
  assert.deepEqual({ ...reloaded.api.progress.best }, {...clearsBefore(120), 5: 32, 120: 50, 121: 50});
  assert.equal(reloaded.ammo.requests.filter(request => request.action === 'round-start').at(-1).stage, STAGE_FIXTURES[120].recordId);
});

test('the Next button reaches mission 220 and final records survive reload without creating mission 221', async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 500, ownedBows: [0, 11], ownedArrows: [0, 11], scopedBows: [11], bow: 11, arrow: 11, unlocked: STAGE_COUNT - 1, lastStage: STAGE_COUNT - 1, best: { 12: 44 } }));
  let completed = 0;
  const complete = async () => {
    app.api.state.score = 50;app.api.state.used = 5;app.api.state.hits = 5;
    app.api.finishRound();await app.flush();
    assert.equal(app.api.state.mode, 'finished');
    completed++;assert.equal(app.api.progress.mainRounds, completed);assert.equal(app.ammo.account.main_rounds, completed);
  };
  assert.equal(app.api.state.stage.id, STAGE_COUNT - 1);await complete();
  assert.equal(app.api.progress.unlocked, STAGE_COUNT);
  assert.equal(app.api.progress.best[STAGE_COUNT - 1], 50);
  assert.match(app.getElement('modalContent').innerHTML, /data-action="next-stage"/);
  const next = app.getElement('nextStage');next.tagName = 'BUTTON';next.dataset.action = 'next-stage';
  app.document.emit('click', { target: next });
  assert.equal(app.api.state.stage.id, STAGE_COUNT, 'the actual Next button reaches the last mission beyond one hundred');
  assert.equal(app.snapshot().lastStage, STAGE_COUNT);
  app.api.startStage(STAGE_COUNT + 1);await app.flush();assert.equal(app.api.state.stage.id, STAGE_COUNT);
  await complete();
  assert.equal(app.api.progress.unlocked, STAGE_COUNT, 'the final clear never creates mission 221');
  assert.equal(app.api.progress.best[STAGE_COUNT], 50);
  assert.deepEqual(app.ammo.requests.filter(request => request.action === 'round-complete').map(request => request.stage), STAGE_FIXTURES.slice(-2).map(stage => stage.recordId));
  assert.match(app.getElement('modalContent').innerHTML, /data-action="next-stage"[^>]*\bdisabled\b/);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.unlocked, STAGE_COUNT);assert.equal(reloaded.api.state.stage.id, STAGE_COUNT);
  assert.equal(reloaded.api.progress.coins, 550, 'both newly cleared stages retain their completion bonuses');
  assert.deepEqual({ ...reloaded.api.progress.best }, {...clearsBefore(STAGE_COUNT - 1), 12: 44, [STAGE_COUNT - 1]: 50, [STAGE_COUNT]: 50});
  assert.equal(reloaded.api.activeBow().id, 11);assert.equal(reloaded.api.activeArrow().id, 11);
  assert.deepEqual(Array.from(reloaded.api.progress.scopedBows), [11]);
});

test('main results require this round to reach its goal for Next and retain safe boundaries and one new registration', async () => {
  for (const stage of [1, 50, 101, STAGE_COUNT]) for (const passed of [false, true]) for (const [action, delta] of [['previous-stage', -1], ['retry', 0], ['next-stage', 1]]) {
    const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 345, lastStage: stage,
      best: { [stage]: 50 }, mainRounds: 2, sound: false }));
    const state = app.api.state;
    state.score = state.stage.goal - (passed ? 0 : 1);state.used = 5;app.api.finishRound();await app.flush();
    assert.equal(state.mode, 'finished');assert.equal(state.modal, 'result');
    assert.equal(app.api.progress.mainRounds, 3);
    assert.equal(app.api.progress.best[stage], 50, 'a better historical score does not grant the current clear');
    const html = app.getElement('modalContent').innerHTML;
    const choices = Array.from(html.matchAll(/<button\b[^>]*data-action="(previous-stage|retry|next-stage)"[^>]*>/g), match => [match[1], match[0]]);
    assert.deepEqual(choices.map(([name]) => name), ['previous-stage', 'retry', 'next-stage']);
    assert.match(html, /이전 단계/);assert.match(html, /지금 단계/);assert.match(html, /다음 단계/);
    assert.match(html, passed ? /목표를 달성했어요/ : /도달하지 못했어요/);
    const disabled = stage + delta < 1 || stage + delta > STAGE_COUNT || delta > 0 && !passed;
    assert.equal(/\bdisabled\b/.test(choices.find(([name]) => name === action)[1]), disabled);
    const starts = app.ammo.requests.filter(request => request.action === 'round-start').length, epoch = state.roundEpoch;
    const saved = app.snapshot();
    modalAction(app, action);modalAction(app, action);await app.flush();
    if (disabled) {
      if (delta > 0) for (const stale of ['next-stage', 'next']) staleModalAction(app, stale);
      await app.flush();
      assert.equal(state.stage.id, stage);assert.equal(state.mode, 'finished');assert.equal(state.modal, 'result');
      assert.equal(state.roundEpoch, epoch);assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts);
      assert.deepEqual(app.snapshot(), saved, 'a stale enabled Next cannot alter saves or begin another round');
    } else {
      assert.equal(state.isEvent, false);assert.equal(state.stage.id, stage + delta);
      assert.equal(state.used, 0);assert.equal(state.score, 0);assert.equal(state.modal, null);
      assert.equal(state.roundEpoch, epoch + 1);
      assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts + 1,
        'a repeated click on the old result registers only the explicitly selected round');
      assert.equal(app.snapshot().lastStage, stage + delta);
    }
    assert.equal(app.api.progress.mainRounds, 3);assert.equal(app.api.progress.coins, 345 + (passed ? 12 : 0));
  }
});

test('an unfinished main round cannot use a stale Next even after reaching the score or clearing the previous round', async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, lastStage: 17,
    best: { 17: 50, 18: 50 }, mainRounds: 2, sound: false }));
  const { state } = app.api;
  assert.equal(app.getElement('goalLabel').textContent, '현재 점수 / 목표 점수');
  assert.ok(app.getElement('missionState').textContent.includes(`${state.stage.goal}점`));
  assert.doesNotMatch(app.getElement('missionState').textContent, /점수와 관계없이|참고/);
  const assertUnfinishedBlocked = async () => {
    state.score = state.stage.goal;state.used = 1;
    app.getElement('menuBtn').emit('click');
    assert.equal(modalActionDisabled(app, 'next-stage'), true);
    const before = { stage: state.stage.id, epoch: state.roundEpoch, requests: app.ammo.requests.length, saved: app.snapshot() };
    for (const action of ['next-stage', 'next']) staleModalAction(app, action);
    await app.flush();
    assert.equal(state.stage.id, before.stage);assert.equal(state.roundEpoch, before.epoch);
    assert.equal(state.used, 1);assert.equal(state.mode, 'ready');assert.equal(state.modal, 'menu');
    assert.equal(app.ammo.requests.length, before.requests);assert.deepEqual(app.snapshot(), before.saved);
    app.api.closeModal();
  };
  await assertUnfinishedBlocked();
  state.used = 5;app.api.finishRound();await app.flush();
  assert.equal(modalActionDisabled(app, 'next-stage'), false, 'the exact goal unlocks Next after the round finishes');
  modalAction(app, 'next-stage');modalAction(app, 'next-stage');await app.flush();
  assert.equal(state.stage.id, 18);assert.equal(app.api.progress.mainRounds, 3);
  await assertUnfinishedBlocked();
  assert.equal(app.api.progress.best[17], 50);assert.equal(app.api.progress.best[18], 50);
});

test('fifth-round main results preserve their real clear through gun shopping without a plate interstitial', async () => {
  for (const [stage, passed] of [[17, false], [17, true], [STAGE_COUNT, true]]) {
    const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, lastStage: stage,
      best: {[stage]: 50}, mainRounds: 4, coins: 100000, clayCredits: 10, stabilizers: 2, sound: false}));
    const {state} = app.api, goal = state.stage.goal;
    state.score = goal - (passed ? 0 : 1);state.used = 5;app.api.finishRound();await app.flush();
    const blocked = !passed || stage === STAGE_COUNT, epoch = state.roundEpoch, score = state.score;
    const assertResult = () => {
      assert.equal(!!state.isEvent, false);assert.equal(state.modal, 'result');assert.equal(state.mode, 'finished');
      assert.equal(state.roundEpoch, epoch);assert.equal(state.stage.id, stage);assert.equal(state.score, score);
      assert.equal(state.resultSummary.passed, passed);assert.equal(modalActionDisabled(app, 'next-stage'), blocked);
      assert.equal(app.api.progress.mainRounds, 5);assert.equal(app.snapshot().lastStage, stage);
      assert.doesNotMatch(app.getElement('modalContent').innerHTML, /continue-event|접시 사격|event-ready/);
      assert.equal(app.ammo.requests.filter(request => request.action === 'round-complete').length, 1);
    };
    assertResult();modalAction(app, 'result-shop');app.api.equipItem(20);app.api.equipItem(20);
    assert.equal(app.api.activeBow().id, 20);app.api.closeModal();await app.flush();assertResult();
    assert.equal(app.api.progress.coins, 100000 + (passed ? 12 : 0) - app.engine.BOWS[20].price);
    assert.equal(app.api.progress.clayCredits, 10);assert.equal(app.api.progress.stabilizers, 2);
    for (const close of [() => app.getElement('modalClose').emit('click'), () => app.getElement('modalBackdrop').emit('click'),
      () => app.document.emit('keydown', {code: 'Escape'}), () => modalAction(app, 'close')]) {close();assertResult();}
    app.api.finishRound();assertResult();
    const starts = app.ammo.requests.filter(request => request.action === 'round-start').length;
    if (blocked) {staleModalAction(app, 'next-stage');staleModalAction(app, 'next');await app.flush();assertResult();}
    const action = blocked ? 'retry' : 'next-stage';modalAction(app, action);modalAction(app, action);await app.flush();
    assert.equal(state.stage.id, blocked ? stage : stage + 1);assert.equal(!!state.isEvent, false);
    assert.equal(app.api.activeBow().id, 20);assert.equal(state.used, 0);
    assert.equal(app.ammo.requests.filter(request => request.action === 'round-start').length, starts + 1);
  }
});

test('changing to a gun never clears an unfinished mission or accepts obsolete event navigation', async () => {
  const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, lastStage: 17,
    best: {17: 50}, ownedBows: [0, 20], mainRounds: 5, sound: false}));
  const {state} = app.api, epoch = state.roundEpoch;
  await equipMainGun(app);state.score = state.stage.goal;
  app.getElement('menuBtn').emit('click');assert.equal(modalActionDisabled(app, 'next-stage'), true);
  const before = app.snapshot();
  for (const action of ['next-stage', 'next', 'enter-event', 'continue-event', 'start-event', 'event-next', 'trial-events'])
    staleModalAction(app, action);
  await app.flush();
  assert.equal(state.stage.id, 17);assert.equal(state.roundEpoch, epoch);assert.equal(state.used, 0);
  assert.equal(!!state.isEvent, false);assert.deepEqual(app.snapshot(), before);
  assert.equal(app.ammo.requests.filter(request => request.action === 'round-complete').length, 0);
});

test('results survive shop, menu and help visits and all dismissal paths without an accidental replay', async () => {
  for (const gun of [false, true]) {
    const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 123, lastStage: 17, mainRounds: 2, sound: false, ownedBows: [0, 20] }));
    const state = app.api.state;
    if (gun) { await equipMainGun(app); }
    state.score = 0;state.used = gun ? 10 : 5;app.api.finishRound();await app.flush();
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
    for (const [action, modal] of [['help', 'help'], ['stages', 'stages']]) {
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

test('all three equipment shops show progressive traits and speeds for the currently equipped combination', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 0, ownedBows: [0, 1, 2, 11], ownedArrows: [0, 1, 2, 11], bow: 1, arrow: 0 });
  const clean = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const cards = html => Array.from(html.matchAll(/<article\b[\s\S]*?<\/article>/g), match => clean(match[0]));
  const speed = (bow, arrow) => app.engine.getSpeed({ bow, arrow, charge: 1, velocityBias: 0 }).toFixed(1) + ' m/s';
  const mainWeapons = app.engine.BOWS;
  for (const [kind, catalog] of [['bow', mainWeapons], ['arrow', app.engine.ARROWS], ['bullet', app.engine.BULLETS]]) {
    app.api.showShop(kind);
    const html = app.getElement('modalContent').innerHTML, displayed = cards(html);
    assert.equal(displayed.length, catalog.length, 'every catalog entry is reachable in the shop');
    assert.equal((html.match(/data-equip="\d+"/g) || []).length, catalog.length);
    assert.deepEqual([...html.matchAll(/data-shop-tab="([^"]+)"/g)].map(match => match[1]), ['bow', 'arrow', 'scope', 'coin']);
    if (kind !== 'bow') {
      assert.ok(clean(html).includes(`화살 ${app.engine.ARROWS.length}종`));
      assert.ok(clean(html).includes(`총알 ${app.engine.BULLETS.length}종`));
    }
    const combination = clean(html.match(/<details\b[^>]*class="shop-loadout"[^>]*>[\s\S]*?<\/details>/)?.[0] || '');
    assert.ok(combination.includes(app.api.activeBow().name) && combination.includes(app.api.activeArrow().name));
    assert.ok(combination.includes(speed(app.api.activeBow(), app.api.activeArrow())), 'the shop identifies the current comparison loadout');
    for (const item of catalog) {
      const card = displayed.find(text => text.includes(item.name));
      assert.ok(card, `${item.name} has a shop card`);
      if (kind === 'bow') {
        assert.match(card, new RegExp(`그립감\\s*${item.grip}(?:\\s|/)`));
        if (item.weaponType !== 'gun') assert.match(card, new RegExp(`탄성\\s*${item.elasticity}(?:\\s|/)`));
        else {
          assert.ok(card.includes(`선택한 탄환 ${app.api.activeBullet().name}`));
          assert.match(card, /한 판\s*10발/);assert.match(card, /장전\s*1\.0초/);
          const shake = item.handSwayFactor === 0 ? '없음' : `기본 총의 ${Math.round(item.handSwayFactor * 100)}%`;
          assert.ok(card.includes(`손떨림 ${shake}`));
          if (item.handSwayFactor === 0) assert.ok(card.includes('항상 안정'));
        }
        assert.ok(card.includes(speed(item, app.api.activeArrow())), 'bow speed uses the equipped arrow mass');
      } else if (kind === 'bullet') {
        assert.ok(card.includes(item.muzzleSpeed.toFixed(1) + ' m/s'));
        assert.ok(card.includes(`기본 탄환 대비 속도 ${item.speedRatio}배`));
        assert.ok(card.includes(`같은 거리의 낙하량 ${item.dropRatio === 0 ? '없음 · 직선' : `${Math.round(item.dropRatio * 100)}%`}`));
        assert.ok(card.includes('총 3종 공용'));assert.ok(card.includes('영구 보유'));
      } else {
        assert.match(card, new RegExp(`촉\\s*무게\\s*${item.tipMass}\\s*g`));
        assert.ok(card.includes(`촉 ${item.tip.material} · ${item.tip.shape}`));
        assert.ok(card.includes(`몸통 ${item.shaft.material} · ${Number(item.shaft.diameter.toFixed(2))} mm`));
        assert.ok(card.includes(`몸통 무게 ${Number(item.shaftMass.toFixed(2))} g`));
        assert.ok(card.includes(`깃 ${item.fletching.material} · ${item.fletching.name}`));
        assert.ok(card.includes(`깃 무게 ${Number(item.fletching.mass.toFixed(2))} g`));
        const totalMass = item.tipMass + item.shaftMass + item.fletching.mass;
        assert.ok(card.includes(`총 무게 ${Number(totalMass.toFixed(2))} g`), 'the card includes all three component masses without floating-point noise');
        assert.ok(card.includes(`일관성 ${Number(app.engine.getArrowConsistency(item).toFixed(2))} / 100`), 'consistency includes the point and shaft precision as well as fletching control');
        assert.ok(card.includes(`바람 영향 ${Math.round(app.engine.getWindResponse(item) * 100)}%`), 'wind comparison reflects shaft and fletching resistance at the complete mass');
        assert.ok(card.includes(`감속 영향 ${Math.round(app.engine.getArrowDragRate(item) / app.engine.getArrowDragRate(app.engine.ARROWS[0]) * 100)}%`));
        const nominal = app.engine.getSpeed({ bow: app.api.activeBow(), arrow: item, charge: 1, velocityBias: 0 });
        const high = app.engine.getSpeed({ bow: app.api.activeBow(), arrow: item, charge: 1, velocityBias: 1 });
        const variancePercent = Math.round((high / nominal - 1) * 1000) / 10;
        assert.ok(card.includes(`속도 편차 ±${variancePercent}%`), 'the shown variation matches the actual launch-speed spread');
        assert.ok(card.includes(speed(app.api.activeBow(), item)), 'arrow speed uses the equipped bow elasticity');
      }
    }
  }
  app.api.showShop('arrow');
  const firstSpeed = app.getElement('loadoutSpeed').textContent;
  const firstMass = app.engine.getArrowMass(app.api.activeArrow());
  const firstNominal = app.engine.getSpeed({bow: app.api.activeBow(), arrow: app.api.activeArrow(), charge: 1, velocityBias: 0});
  app.api.equipItem(1);
  const selectedMass = app.engine.getArrowMass(app.api.activeArrow());
  const selectedNominal = app.engine.getSpeed({bow: app.api.activeBow(), arrow: app.api.activeArrow(), charge: 1, velocityBias: 0});
  assert.ok(selectedMass < firstMass);assert.ok(selectedNominal > firstNominal);
  assert.ok(Math.abs(selectedNominal / firstNominal - Math.sqrt(firstMass / selectedMass)) < 1e-10, 'the same bow gains nominal speed from the selected complete arrow mass');
  assert.notEqual(app.getElement('loadoutSpeed').textContent, firstSpeed, 'equipping the lighter completed arrow updates the displayed combination speed');
  assert.ok(app.getElement('loadoutSpeed').textContent.includes(speed(app.api.activeBow(), app.api.activeArrow())));
  assert.equal(app.getElement('bowStat').textContent, `그립감 ${app.api.activeBow().grip} · 탄성 ${app.api.activeBow().elasticity}`);
  assert.equal(app.getElement('arrowStat').textContent, `촉 ${app.api.activeArrow().tipMass}g · ${app.api.activeArrow().fletching.name}`);
  app.api.closeModal();await app.flush();
  const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');app.frames(78);pad.emit('pointerup');await app.flush();
  assert.equal(app.api.state.shot.speed.toFixed(1) + ' m/s', speed(app.api.activeBow(), app.api.activeArrow()), 'the released arrow uses the same selected equipment as the displayed speed');
  assert.equal(app.api.state.shot.mass, selectedMass, 'the real shot uses the complete selected arrow mass');
});

test('scope purchases charge once for each owned compatible bow and stay bound across reload', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 20000, ownedBows: [0, 3, 7, 10], ownedArrows: [0], bow: 3, arrow: 0 });
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [], 'legacy saves have no scopes installed');
  app.api.showShop('bow');
  for (const [id, zoom] of [[0, 3], [9, 2], [-1, 2], [12, 6], ['3', 3], [3, undefined], [3, '3'], [3, 4], [3, 5], [3, 7]]) app.api.installScope(id, zoom);
  assert.equal(app.api.progress.coins, 20000, 'incompatible, unowned and invalid bows cannot receive a scope');
  assert.deepEqual(Array.from(app.api.progress.scopedBows), []);
  let coins = 20000;
  for (const id of [3, 7, 10]) {
    app.api.showShop('bow');app.api.equipItem(id);app.api.showShop('scope');
    assert.ok(!app.api.progress.scopedBows.includes(id), 'another bow must purchase its own scope');
    assert.match(app.getElement('modalContent').innerHTML, new RegExp(`data-install-scope="${id}"`));
    app.api.installScope(id, 3);coins -= app.engine.BOWS[id].scopePrice;
    assert.equal(app.api.progress.coins, coins);
    assert.equal(app.api.progress.bow, id, 'mounting a scope keeps the selected bow');
    assert.equal(app.api.state.zoom, 3, 'buying a scope immediately activates its threefold view');
    assert.equal(app.getElement('zoomBtn').textContent, '조준경 3×');
    const html = app.getElement('modalContent').innerHTML;
    assert.match(html, /장착 중/);
    assert.match(html, /data-shop-tab="scope" aria-pressed="true"/);
    app.api.installScope(id, 3);
    assert.equal(app.api.progress.coins, coins);
    assert.equal(app.api.progress.scopedBows.filter(value => value === id).length, 1);
  }
  const saved = app.snapshot(), reloaded = await appHarness(saved);
  assert.deepEqual(Array.from(reloaded.api.progress.scopedBows), [3, 7, 10]);
  assert.equal(reloaded.api.progress.coins, coins);assert.equal(reloaded.api.activeBow().id, 10);
  assert.equal(reloaded.api.state.zoom, 3, 'a saved scoped weapon starts with the scope active');
  const sanitized = await appHarness({ ...saved, scopedBows: [0, 3, 7, 10, 10, 9, 11, -1, 12, '3', null] });
  assert.deepEqual(Array.from(sanitized.api.progress.scopedBows), [3, 7, 10], 'the canonical scope map never imports the legacy summary again');
  const poor = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: app.engine.BOWS[10].scopePrice - 1, ownedBows: [0, 10], bow: 10 });
  poor.api.installScope(10, 3);
  assert.deepEqual(Array.from(poor.api.progress.scopedBows), []);
  assert.equal(poor.api.progress.coins, app.engine.BOWS[10].scopePrice - 1, 'insufficient coins never install or partly charge for a scope');
});

test('all four scope lenses can be bought once, switched for free through shop buttons and restored after reload', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100000, ownedBows: [0, 19], bow: 19 });
  const select = zoom => {
    const button = app.getElement(`scope-19-${zoom}`);button.tagName = 'BUTTON';
    button.dataset.installScope = '19';button.dataset.scopeZoom = String(zoom);
    app.document.emit('click', { target: button });
  };
  let coins = 100000;
  for (const zoom of [2, 3, 6, 8]) {
    app.api.showShop('scope');
    const card = app.getElement('modalContent').innerHTML;
    assert.deepEqual(Array.from(card.matchAll(/data-scope-zoom="(\d+)"/g), match => Number(match[1])), [2, 3, 6, 8]);
    select(zoom);coins -= app.engine.getScopePrice(19, zoom);
    assert.equal(app.api.progress.coins, coins);assert.equal(app.api.equippedScope(19), zoom);
    assert.equal(app.api.state.zoom, zoom);assert.equal(app.getElement('zoomBtn').textContent, `조준경 ${zoom}×`);
    select(zoom);assert.equal(app.api.progress.coins, coins, 'the same lens is never charged twice');
    if (zoom === 2) {
      const firstReload = await appHarness(app.snapshot());
      assert.deepEqual([...firstReload.api.progress.scopeLoadouts[19].owned], [2], 'a newly saved summary must not grant an unbought legacy 3× scope');
      assert.equal(firstReload.api.equippedScope(), 2);
    }
  }
  assert.deepEqual([...app.api.progress.scopeLoadouts[19].owned], [2, 3, 6, 8]);
  assert.deepEqual([...app.api.progress.scopedBows], [19]);
  for (const zoom of [3, 8, 2, 6]) {
    select(zoom);assert.equal(app.api.progress.coins, coins);
    assert.equal(app.api.state.zoom, zoom);assert.equal(app.api.maximumZoom(), zoom);
    app.api.closeModal();await app.flush();
    const aim = { ...app.api.state.aim };
    for (const invalid of [0, 4, 5, 7, '6', NaN, ...[2, 3, 6, 8].filter(value => value !== zoom)]) {
      assert.equal(app.api.setAimZoom(invalid), false, 'only the equipped lens can magnify the view');
      assert.equal(app.api.state.zoom, zoom);
    }
    app.getElement('zoomBtn').emit('click');assert.equal(app.api.state.zoom, 1);
    app.getElement('zoomBtn').emit('click');assert.equal(app.api.state.zoom, zoom);
    assert.deepEqual({ ...app.api.state.aim }, aim);
  }
  const reloaded = await appHarness(app.snapshot());
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.api.progress.scopeLoadouts)), { 19: { owned: [2, 3, 6, 8], equipped: 6 } });
  assert.equal(reloaded.api.state.zoom, 6);assert.equal(reloaded.api.progress.coins, coins);
});

test('legacy scope purchases migrate once without granting scopes to starter, newly compatible or unowned weapons', async () => {
  const legacy = { version: 1, stageCatalog: STAGE_CATALOG, coins: 37, ownedBows: [0, 2, 3, 19, 20, 21, 22], bow: 19,
    scopedBows: [0, 2, 3, 3, 19, 20, 21, 22, 24, -1, '3', null] };
  const app = await appHarness(legacy);
  const expected = { 3: { owned: [3], equipped: 3 }, 19: { owned: [3], equipped: 3 }, 20: { owned: [3], equipped: 3 } };
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.progress.scopeLoadouts)), expected);
  assert.deepEqual([...app.api.progress.scopedBows], [3, 19, 20]);assert.equal(app.api.progress.coins, 37);
  assert.equal(app.api.equippedScope(0), 1);assert.equal(app.api.equippedScope(2), 1);
  const reloaded = await appHarness(app.snapshot());
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.api.progress.scopeLoadouts)), expected);
  for (const scopeLoadouts of [{}, null, [], 'invalid']) {
    const canonical = await appHarness({ ...legacy, scopeLoadouts });
    assert.deepEqual([...canonical.api.progress.scopedBows], [], 'an existing new-format field must never re-import the legacy summary');
    assert.equal(canonical.api.state.zoom, 1);
  }
});

test('saved scope loadouts discard invalid magnifications and ownership while preserving each valid equipped lens', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 5, ownedBows: [0, 2, 3, 19, 20, 22], bow: 19,
    scopedBows: [3, 24], scopeLoadouts: {
      0: { owned: [2, 2, 3, 6, '2', null], equipped: 8 },
      2: { owned: [3, 2, 2, 6], equipped: 3 },
      3: { owned: [4, 5, 7], equipped: 3 },
      19: { owned: [8, 6, 3, 2, 5, '6'], equipped: 6 },
      20: { owned: [3], equipped: 3 },
      22: { owned: [2, 3, 6, 8], equipped: 8 },
      24: { owned: [3], equipped: 3 },
      '03': { owned: [3], equipped: 3 },
      bad: { owned: [8], equipped: 8 }
    } });
  const expected = { 0: { owned: [2], equipped: 2 }, 2: { owned: [2, 3], equipped: 3 }, 19: { owned: [2, 3, 6, 8], equipped: 6 }, 20: { owned: [3], equipped: 3 } };
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.progress.scopeLoadouts)), expected);
  assert.deepEqual([...app.api.progress.scopedBows], [0, 2, 19, 20]);
  assert.equal(app.api.state.zoom, 6);assert.equal(app.api.progress.coins, 5);
  const reloaded = await appHarness(app.snapshot());
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.api.progress.scopeLoadouts)), expected);
});

test('a failed scope save leaves both the coin balance and equipped optics unchanged', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 10000, ownedBows: [0, 3], bow: 3,
    scopeLoadouts: { 3: { owned: [2], equipped: 2 } } });
  const before = app.snapshot(), camera = { ...app.api.camera };
  app.store.set = () => { throw new Error('storage denied'); };
  assert.equal(app.api.installScope(3, 3), false);
  assert.equal(app.api.progress.coins, 10000);assert.equal(app.api.state.zoom, 2);
  assert.deepEqual([...app.api.progress.scopeLoadouts[3].owned], [2]);assert.equal(app.api.equippedScope(), 2);
  assert.deepEqual(app.snapshot(), before);assert.deepEqual({ ...app.api.camera }, camera);
});

test('mounted scopes provide real threefold zoom only on the bow that owns them', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 0, ownedBows: [0, 3, 7, 10], ownedArrows: [0], bow: 3, scopedBows: [3, 10] });
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
  clickZoom(1);clickZoom(3);
  app.api.showShop('bow');
  zoom.emit('click');assert.equal(app.api.state.zoom, 3, 'shop interactions cannot change the aiming zoom');
  app.api.equipItem(7);app.frames();
  assert.equal(app.api.state.zoom, 1, 'equipping an unscoped bow restores the unaided view');
  assert.equal(app.api.camera.focal, baseFocal);
  assert.equal(app.getElement('gameCanvas').dataset.scope, 'none');
  assert.equal(app.getElement('gameCanvas').dataset.scopeMagnification, '1');
  assert.equal(app.getElement('zoomBtn').disabled, true);
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [3, 10], 'the scope does not move with equipment selection');
  app.api.closeModal();await app.flush();clickZoom(1);clickZoom(1);
  app.api.showShop('bow');app.api.equipItem(10);app.api.closeModal();await app.flush();
  app.frames();assert.equal(app.api.state.zoom, 3);
  assert.equal(app.api.camera.focal, baseFocal * 3);
  assert.equal(app.getElement('gameCanvas').dataset.scope, 'active', 'a separately scoped crossbow restores its own 3× view');
  app.api.showShop('bow');app.api.equipItem(0);app.api.closeModal();await app.flush();
  assert.equal(app.api.state.zoom, 1);
  clickZoom(1);clickZoom(1);
});

for (const [width, height] of [[1000, 600], [390, 410], [844, 280]]) for (const magnification of [2, 3, 6, 8]) {
  test(`a ${magnification}× scope enlarges the target and preserves aim, reticle and controls in a ${width}×${height} view`, async () => {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100000, ownedBows: [0, 19], ownedArrows: [0, 1], bow: 19 });
    const staticStage = app.engine.DISTANCE_STAGES.find(stage => stage.kind === 'target' && !stage.motion?.amplitudeX && !stage.motion?.amplitudeY && !stage.obstacles.length && stage.distance >= 150);
    assert.ok(staticStage, 'the range includes an unobstructed static target for checking magnification');
    app.resize(width, height);clearFixtureBefore(app, staticStage.id);app.api.startStage(staticStage.id);await app.flush();
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
    app.api.showShop('bow');app.api.installScope(19, magnification);
    const enlarged = dimensions();
    assert.equal(state.zoom, magnification);
    close(enlarged.rx, original.rx * magnification, 'the target width matches the mounted magnification');
    close(enlarged.ry, original.ry * magnification, 'the target height matches the mounted magnification');
    close(enlarged.x, original.x, 'the aimed target stays at the same horizontal point');
    close(enlarged.y, original.y, 'the aimed target stays at the same vertical point');
    assert.deepEqual({...state.aim}, originalAim, 'magnification never changes the physical firing direction');
    assert.ok(enlarged.x - enlarged.rx > 0 && enlarged.x + enlarged.rx < width);
    assert.ok(enlarged.y - enlarged.ry > 0 && enlarged.y + enlarged.ry < height);
    app.api.closeModal();await app.flush();
    app.canvasText.length = 0;app.canvasArcs.length = 0;app.frames();
    assert.equal(app.getElement('zoomBtn').textContent, `조준경 ${magnification}×`);
    assert.equal(app.getElement('gameCanvas').dataset.scope, 'active');
    assert.equal(app.getElement('gameCanvas').dataset.scopeMagnification, String(magnification));
    assert.equal(app.getElement('gameCanvas').dataset.scopeZoom, String(magnification));
    assert.ok(app.canvasText.includes(`${magnification}×`), 'the drawn scope reticle labels its actual magnification');
    assert.ok(app.canvasArcs.some(arc => arc.radius === 43), 'every mounted magnification draws the scope ring');
    const pad = app.getElement('aimTouchpad'), expectedYaw = state.aim.yaw + .04, expectedPitch = state.aim.pitch + .02;
    pad.emit('pointerdown', { clientX: width * .51, clientY: height * .68 });
    moveHeldAim(app, expectedYaw, expectedPitch);pad.emit('pointercancel');
    close(state.aim.yaw, expectedYaw, 'the scoped joystick preserves horizontal control');
    close(state.aim.pitch, expectedPitch, 'the scoped joystick preserves vertical control');
    const aimPoint = {x: Math.tan(state.aim.yaw) * target.z, y: app.engine.PLAYER.y + Math.tan(state.aim.pitch) / Math.cos(state.aim.yaw) * target.z, z: target.z};
    const anchor = app.api.project(aimPoint), zoom = app.getElement('zoomBtn');
    for (const value of [1, magnification]) {
      zoom.emit('click');
      assert.equal(state.zoom, value, 'the control toggles between the unaided view and the mounted scope');
      app.canvasText.length = 0;app.frames();
      assert.equal(app.getElement('gameCanvas').dataset.scopeZoom, String(value));
      assert.equal(app.getElement('gameCanvas').dataset.scopeMagnification, String(magnification));
      assert.equal(app.getElement('gameCanvas').dataset.scope, value === 1 ? 'mounted' : 'active');
      assert.equal(app.canvasText.includes(`${magnification}×`), value === magnification);
      const point = app.api.project(aimPoint);
      close(point.x, anchor.x, 'zoom keeps the current aim at its horizontal screen position');
      close(point.y, anchor.y, 'zoom keeps the current aim at its vertical screen position');
    }
    app.getElement('recenterBtn').emit('click');
    close(dimensions().x, original.x, 'recentring restores the target horizontally at the mounted zoom');
    close(dimensions().y, original.y, 'recentring restores the target vertically at the mounted zoom');
    zoom.emit('click');app.api.showShop('arrow');app.api.equipItem(1);
    assert.equal(state.zoom, 1, 'changing an arrow preserves a manually selected zoom');
    app.api.showShop('bow');app.api.equipItem(19);
    assert.equal(state.zoom, magnification, 'selecting the scoped weapon again activates its scope');
    assert.equal(state.used, 0, 'scope and drag-cancel interactions never consume a shot');
  });
}

test('installing a scope on an unequipped weapon leaves the current weapon and view unchanged', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 10000, ownedBows: [0, 3, 7], ownedArrows: [0], bow: 0 });
  const originalCamera = {...app.api.camera};
  app.api.showShop('bow');app.api.installScope(3, 3);
  assert.equal(app.api.activeBow().id, 0);assert.equal(app.api.state.zoom, 1);
  assert.deepEqual({...app.api.camera}, originalCamera);
  app.api.showShop('bow');app.api.equipItem(7);assert.equal(app.api.state.zoom, 1, 'an unscoped weapon cannot borrow another weapon’s scope');
  app.api.equipItem(3);assert.equal(app.api.state.zoom, 3);
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [3]);
});

test('new rounds restore only the selected bow or gun scope without transferring purchased lenses', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 0,
    ownedBows: [0, 3, 22], ownedArrows: [0], bow: 3, scopedBows: [3, 22]});
  app.getElement('zoomBtn').emit('click');assert.equal(app.api.state.zoom, 1);
  clearFixtureBefore(app, 3);app.api.startStage(3);await app.flush();assert.equal(app.api.state.zoom, 3);
  await equipMainGun(app, 20);assert.equal(app.api.state.zoom, 3);
  app.getElement('zoomBtn').emit('click');assert.equal(app.api.state.zoom, 1);
  app.api.resetRound();await app.flush();assert.equal(app.api.state.zoom, 3);assert.equal(app.api.activeBow().id, 20);
  app.api.showShop('bow');app.api.equipItem(3);app.api.closeModal();await app.flush();
  assert.equal(app.api.state.zoom, 3);assert.equal(app.api.activeBow().id, 3);
  assert.deepEqual(Array.from(app.api.progress.scopedBows), [3, 20]);
  const reloaded = await appHarness({...app.snapshot(), bow: 20});
  assert.equal(reloaded.api.activeBow().id, 20);assert.equal(reloaded.api.state.zoom, 3);
});

test('laser purchases start with the first crossbow and charge once per eligible weapon and preserve independent manual settings across reload', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 2000, ownedBows: [0, 3, 13, 14, 20, 22], bow: 13 });
  assert.equal(app.api.activeLaser(), null);assert.equal(app.getElement('laserPanel').classList.contains('hidden'), true);
  for (const id of [-1, 25, '13', 0, 3, 10, 20, 22]) assert.equal(app.api.installLaser(id), false);
  assert.equal(app.api.progress.coins, 2000);
  const buy = id => {
    app.api.showShop('scope', id);
    const available = [...app.getElement('modalContent').innerHTML.matchAll(/data-install-laser="(\d+)"/g)].map(match => Number(match[1])).sort((a,b) => a-b);
    assert.deepEqual(available, [id], 'the selected owned crossbow offers its own laser');
    const button = app.getElement(`buy-laser-${id}`);button.tagName = 'BUTTON';button.dataset.installLaser = String(id);
    app.document.emit('click', { target: button });
  };
  buy(13);assert.equal(app.api.progress.coins, 1000);assert.equal(app.api.activeBow().id, 13);
  assert.equal(app.api.state.laserAdjustOpen, false, 'a newly purchased laser keeps the play area unobstructed');
  assert.equal(app.api.setLaserSettings({ horizontalClicks: 12, verticalClicks: -7 }), true);
  assert.equal(app.api.installLaser(13), true);assert.equal(app.api.progress.coins, 1000);
  assert.equal(app.api.state.laserAdjustOpen, true, 'the owned laser adjustment action opens its controls without another purchase');
  assert.deepEqual({ ...app.api.activeLaser() }, { enabled: true, horizontalClicks: 12, verticalClicks: -7 });
  buy(14);assert.equal(app.api.progress.coins, 0);assert.equal(app.api.activeBow().id, 14);
  assert.equal(app.api.setLaserSettings({ enabled: false, horizontalClicks: -30, verticalClicks: 9, autoFire: true, targetId: 1 }), true);
  assert.equal(app.api.setLaserSettings({ horizontalClicks: 99 }, 13), false, 'a callback cannot change an unequipped weapon');
  const expected = { 13: { enabled: true, horizontalClicks: 12, verticalClicks: -7 }, 14: { enabled: false, horizontalClicks: -30, verticalClicks: 9 } };
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.progress.laserLoadouts)), expected);
  const reloaded = await appHarness(app.snapshot());
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.api.progress.laserLoadouts)), expected);
  assert.equal(reloaded.api.progress.coins, 0);assert.equal(reloaded.api.laserEnabled(), false);
  reloaded.api.showShop('bow');reloaded.api.equipItem(13);reloaded.api.closeModal();await reloaded.flush();
  assert.deepEqual({ ...reloaded.api.activeLaser() }, expected[13]);assert.equal(reloaded.api.laserEnabled(), true);
  assert.ok(reloaded.api.laserFrame(), 'the enabled sight is visible before drawing so its zero can be adjusted');
  const poor = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 13], bow: 13, coins: 999 });
  assert.equal(poor.api.installLaser(13), false);assert.equal(poor.api.progress.coins, 999);assert.equal(poor.api.activeLaser(), null);
});

test('laser save loading keeps only owned crossbows and finite manual zeroing values', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 13, 14, 20, 22], bow: 14,
    laserLoadouts: {
      13: { enabled: false, horizontalClicks: 2000, verticalClicks: -2000, autoFire: true },
      14: { horizontalClicks: '20', verticalClicks: 3.6, targetPoint: { x: 0, y: 0, z: 10 } },
      19: { enabled: true }, 20: { enabled: true }, 22: { enabled: true }, '014': { enabled: true }, bad: {}, '-1': {}
    } });
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.progress.laserLoadouts)), {
    13: { enabled: false, horizontalClicks: 1200, verticalClicks: -1200 },
    14: { enabled: true, horizontalClicks: 0, verticalClicks: 4 }
  });
  for (const id of [19, 20, 22]) assert.equal(app.api.activeLaser(id), null);
  const original = app.snapshot(), settings = { ...app.api.activeLaser() };
  app.store.set = () => { throw new Error('storage denied'); };
  assert.equal(app.api.setLaserSettings({ horizontalClicks: 44 }), false);
  assert.deepEqual({ ...app.api.activeLaser() }, settings);assert.deepEqual(app.snapshot(), original);
});

test('old owned bow lasers refund once while crossbow settings and the rest of the saved journey survive', async () => {
  const original = { version: 1, launchEpoch: 5, stageCatalog: STAGE_CATALOG, coins: 321, bow: 3, arrow: 2,
    ownedBows: [0, 3, 13, 20, 22], ownedArrows: [0, 2], stabilizers: 4, clayCredits: 9,
    lastStage: 17, best: { 17: 30 }, mainRounds: 7, shots: 42, hits: 31, sound: false, coachEnabled: false,
    scopeLoadouts: { 3: { owned: [2, 3], equipped: 3 } },
    laserLoadouts: { 0: { enabled: false }, 3: { enabled: true, horizontalClicks: 7 },
      13: { enabled: true, horizontalClicks: 12, verticalClicks: -7 },
      4: { enabled: true }, 20: {}, 22: {}, '03': {}, bad: {}, '-1': {}, 9: null } };
  const app = await appHarness(original);
  assert.equal(app.api.progress.coins, 1321, 'the two previously owned bow lasers return their full purchase prices');
  assert.equal(app.snapshot().coins, 1321, 'normal startup commits the refund immediately');
  assert.deepEqual(app.snapshot().laserLoadouts, { 13: { enabled: true, horizontalClicks: 12, verticalClicks: -7 } });
  for (const key of ['bow', 'arrow', 'stabilizers', 'clayCredits', 'lastStage', 'best', 'mainRounds', 'shots', 'hits', 'sound', 'coachEnabled', 'scopeLoadouts']) {
    assert.deepEqual(app.snapshot()[key], original[key], `${key} survives the compatibility migration`);
  }
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.coins, 1321, 'removed bow records cannot be refunded again after reopening');
  assert.deepEqual(reloaded.snapshot().laserLoadouts, app.snapshot().laserLoadouts);
  const forged = await appHarness({ version: 1, coins: 100, laserLoadouts: { 0: { enabled: true } } });
  assert.equal(forged.api.progress.coins, 100, 'the default starter weapon is not evidence of a previous purchase');
  assert.deepEqual(forged.snapshot().laserLoadouts, {});

  const store = new Map([[SAVE_KEY, JSON.stringify(original)]]), before = new Map(store);

});

test('a failed bow laser refund preserves the original save and commits its credit exactly once on retry', async () => {
  const original = { version: 1, launchEpoch: 5, stageCatalog: STAGE_CATALOG, coins: 123, ownedBows: [0, 13], bow: 13,
    best: { 1: 44 }, laserLoadouts: { 0: { enabled: true }, 13: { enabled: false, horizontalClicks: 3, verticalClicks: -2 } } };
  const store = new Map([[SAVE_KEY, JSON.stringify(original)]]), write = store.set.bind(store);let failed = true;
  store.set = (key, value) => { if (failed && key === SAVE_KEY) throw new Error('storage unavailable');return write(key, value); };
  const app = await appHarness(null, { store, offline: true });
  assert.equal(app.api.progress.coins, 123, 'an uncommitted credit is not spendable');
  assert.deepEqual(app.snapshot(), original, 'failed writes retain the purchased bow record and all original progress');
  assert.equal(app.getElement('saveFooter').classList.contains('save-error'), true);
  assert.equal(app.getElement('saveFooter').classList.contains('visually-hidden'), false);
  assert.equal(app.api.setLaserSettings({ horizontalClicks: 99 }), false);
  assert.equal(app.api.activeLaser().horizontalClicks, 3, 'a failed setting transaction still rolls back');
  assert.equal(app.api.progress.coins, 123);assert.deepEqual(app.snapshot(), original);
  failed = false;
  assert.equal(app.api.save(), true);
  assert.equal(app.api.progress.coins, 623);assert.equal(app.snapshot().coins, 623);
  assert.deepEqual(app.snapshot().laserLoadouts, { 13: { enabled: false, horizontalClicks: 3, verticalClicks: -2 } });
  assert.deepEqual(app.snapshot().best, original.best);
  assert.equal(app.getElement('saveFooter').classList.contains('visually-hidden'), true);
  assert.equal(app.api.save(), true);assert.equal(app.api.progress.coins, 623);
  const reopened = await appHarness(null, { store, offline: true });assert.equal(reopened.api.progress.coins, 623);
});

test('forged bow laser ownership cannot show a sight, disable the coach or accept manual calibration', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 2000, coachEnabled: true, sound: true });
  app.api.progress.laserLoadouts[0] = { enabled: true, horizontalClicks: 40, verticalClicks: 40 };
  assert.equal(app.api.activeLaser(), null);assert.equal(app.api.laserEnabled(), false);
  assert.equal(app.api.installLaser(0), false);assert.equal(app.api.setLaserSettings({ enabled: true }), false);
  assert.equal(app.api.openLaserAdjustments(), false);assert.equal(app.api.progress.coins, 2000);
  preciseMainDraw(app, { x: 0, y: 0 }, { missDuringHold: true });
  app.until(() => app.speech.utterances.length === 1, 20);
  assertCoachCue(app, true);assert.equal(app.api.laserFrame(), null);
  assert.equal(app.getElement('laserPanel').classList.contains('hidden'), true);
  assert.equal(app.api.progress.coachEnabled, true);
});

test('laser calibration starts collapsed and closes on Escape, menu, reset and aiming without changing saved settings', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 13], bow: 13,
    laserLoadouts: { 13: { enabled: true, horizontalClicks: 8, verticalClicks: -4 } } });
  const popup = app.getElement('laserPopover'), adjust = app.getElement('laserAdjustBtn'), close = app.getElement('laserCloseBtn');
  adjust.tagName = close.tagName = 'BUTTON';adjust.dataset.laserAction = 'open';close.dataset.laserAction = 'close';
  const saved = app.snapshot(), horizontal = app.getElement('laserHorizontalGear');
  const assertClosed = () => {
    assert.equal(app.api.state.laserAdjustOpen, false);assert.equal(popup.hidden, true);
    assert.equal(popup.classList.contains('hidden'), true);assert.equal(adjust.getAttribute('aria-expanded'), 'false');
    assert.equal(horizontal.disabled, true);
  };
  const open = () => {
    app.document.emit('click', { target: adjust });
    assert.equal(app.api.state.laserAdjustOpen, true);assert.equal(popup.hidden, false);
    assert.equal(adjust.getAttribute('aria-expanded'), 'true');assert.equal(horizontal.disabled, false);
    assert.equal(app.document.activeElement, horizontal);
  };
  assertClosed();horizontal.emit('wheel', { deltaY: -1 });horizontal.emit('keydown', { code: 'ArrowRight' });
  assert.equal(app.api.activeLaser().horizontalClicks, 8, 'closed controls cannot change the saved calibration');
  open();app.document.emit('click', { target: close });assertClosed();assert.equal(app.document.activeElement, adjust);
  open();app.document.emit('keydown', { code: 'Escape' });assertClosed();assert.equal(app.document.activeElement, adjust);
  open();app.getElement('menuBtn').emit('click');assertClosed();app.api.closeModal();await app.flush();
  open();app.api.resetRound(app.engine.DISTANCE_STAGES[0]);await app.flush();assertClosed();
  open();const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');app.frames(20);assertClosed();
  assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.openLaserAdjustments(), false);
  const forged = app.getElement('forged-open-laser');forged.tagName = 'BUTTON';forged.dataset.laserAction = 'open';
  app.document.emit('click', { target: forged });assertClosed();
  assert.deepEqual(app.snapshot().laserLoadouts, saved.laserLoadouts);assert.equal(app.api.state.used, 0);
  pad.emit('pointercancel');app.frames();assertClosed();
  assert.equal(app.api.state.mode, 'ready');assert.equal(adjust.disabled, false);assert.equal(app.api.state.used, 0);
});

test('laser rotary gears use fifteen-degree detents and one or ten-click steps without aiming or firing', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 13], bow: 13, laserLoadouts: { 13: { enabled: true } } });
  assert.equal(app.api.openLaserAdjustments(), true);
  const aim = { ...app.api.state.aim }, horizontal = app.getElement('laserHorizontalGear'), vertical = app.getElement('laserVerticalGear');
  for (const gear of [horizontal, vertical]) gear.getBoundingClientRect = () => ({ left: 100, top: 60, width: 80, height: 80 });
  horizontal.emit('pointerdown', { pointerId: 81, clientX: 140, clientY: 60 });
  horizontal.emit('pointermove', { pointerId: 81, clientX: 180, clientY: 100 });
  horizontal.emit('pointerup', { pointerId: 81, clientX: 180, clientY: 100 });
  assert.equal(app.api.activeLaser().horizontalClicks, 6, 'a clockwise quarter turn advances six 15-degree detents');
  assert.equal(app.getElement('laserHorizontalValue').dataset.value, '6');
  assert.equal(horizontal.getAttribute('aria-valuenow'), '0.3', 'the accessible slider reports degrees rather than click counts');
  assert.equal(app.getElement('laserHorizontalRotor').style.transform, 'rotate(90deg)');
  const step = app.getElement('laserStep10Btn');step.tagName = 'BUTTON';step.dataset.laserStep = '10';
  app.document.emit('click', { target: step });assert.equal(app.api.state.laserStep, 10);
  vertical.emit('pointerdown', { pointerId: 82, clientX: 140, clientY: 60 });
  vertical.emit('pointermove', { pointerId: 82, clientX: 180, clientY: 100 });
  vertical.emit('pointerup', { pointerId: 82, clientX: 180, clientY: 100 });
  assert.equal(app.api.activeLaser().verticalClicks, 60, 'clockwise upper gear motion raises the zeroing value');
  assert.equal(app.getElement('laserVerticalValue').dataset.value, '60');
  horizontal.emit('keydown', { key: 'ArrowRight', code: 'ArrowRight' });assert.equal(app.api.activeLaser().horizontalClicks, 16);
  vertical.emit('wheel', { deltaY: -1 });assert.equal(app.api.activeLaser().verticalClicks, 70);
  assert.deepEqual({ ...app.api.state.aim }, aim);assert.equal(app.api.state.mode, 'ready');assert.equal(app.api.state.used, 0);
  assert.equal(app.api.state.shot, null);assert.ok(app.api.laserFrame(), 'the adjusted sight remains visible while the gears are available');
  const reloaded = await appHarness(app.snapshot());
  assert.deepEqual({ ...reloaded.api.activeLaser() }, { enabled: true, horizontalClicks: 16, verticalClicks: 70 });
});

test('setting a forty-five-degree zero through the gears starts each new laser touch at the visible canvas centre', async () => {
  for (const adminTrial of [false]) for (const [width, height] of [[390, 480], [844, 235]]) for (const zoom of [1, 8]) for (const horizontalClicks of [0, 300]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      ownedBows: [0, 19], bow: 19, scopeLoadouts: {19: {owned: [8], equipped: 8}},
      laserLoadouts: {19: {enabled: true}}}, {adminTrial});
    if (adminTrial) {
      app.api.showShop('bow');app.api.equipItem(19);app.api.closeModal();await app.flush();
    }
    const origin = {left: 17, top: 83};
    app.resize(width, height, origin);assert.equal(app.api.setAimZoom(zoom), true);app.advanceTo(app.now);
    const state = app.api.state, pad = app.getElement('aimTouchpad'), aimBeforeZero = {...state.aim};
    const adjust = app.getElement('laserAdjustBtn'), close = app.getElement('laserCloseBtn'), step = app.getElement('laserStep10Btn');
    for (const button of [adjust, close, step]) button.tagName = 'BUTTON';
    adjust.dataset.laserAction = 'open';close.dataset.laserAction = 'close';step.dataset.laserStep = '10';
    app.document.emit('click', {target: adjust});
    assert.equal(state.laserAdjustOpen, true, 'the calibration button opens before real gear input: ' + JSON.stringify({adminTrial, width, zoom, mode: state.mode, modal: state.modal, disabled: adjust.disabled}));
    app.document.emit('click', {target: step});assert.equal(state.laserStep, 10);
    for (let turn = 0; turn < 90; turn++) app.getElement('laserVerticalGear').emit('keydown', {code: 'ArrowUp'});
    for (let turn = 0; turn < horizontalClicks / 10; turn++) app.getElement('laserHorizontalGear').emit('keydown', {code: 'ArrowRight'});
    assert.equal(app.api.activeLaser().verticalClicks, 900);
    assert.equal(app.api.activeLaser().horizontalClicks, horizontalClicks);
    assert.equal(app.getElement('laserVerticalValue').dataset.degrees, '45.00');
    assert.deepEqual({...state.aim}, aimBeforeZero, 'setting the sight never secretly raises the physical weapon');
    assert.equal(state.mode, 'ready');assert.equal(state.used, 0);assert.equal(state.shot, null);
    const beforeTouch = app.api.project(app.api.laserFrame().point);
    assert.ok(beforeTouch.y > height, 'this reproduces the reported zero-change sequence without preparing a matching physical aim');
    app.document.emit('click', {target: close});assert.equal(state.laserAdjustOpen, false);
    const beforeZoom = {...app.api.camera}, distance = state.stage.distance;
    const centreWorld = {x: (width / 2 - beforeZoom.cx) * distance / beforeZoom.focal,
      y: app.engine.PLAYER.y + (beforeZoom.horizon - height / 2) * distance / beforeZoom.focal, z: distance};
    for (const nextZoom of [zoom === 1 ? 8 : 1, zoom]) {
      app.getElement('zoomBtn').emit('click');assert.equal(state.zoom, nextZoom);
      const centre = app.api.project(centreWorld);
      assert.ok(Math.hypot(centre.x - width / 2, centre.y - height / 2) < 1e-8,
        'zooming with an offscreen 45-degree sight stays anchored to the visible field centre');
      assert.deepEqual({...state.aim}, aimBeforeZero, 'zooming never supplies a new firing angle');
      assert.equal(app.api.activeLaser().verticalClicks, 900);
    }
    const camera = {...app.api.camera}, pan = [state.panX, state.panY], settings = {...app.api.activeLaser()};
    const saved = app.snapshot(), operations = app.storageOperations.length, requests = app.ammo.requests.length;
    const down = {clientX: origin.left + width * .23, clientY: origin.top + height * .87};
    app.canvasArcs.length = 0;
    pad.emit('pointerdown', down);
    assert.equal(state.mode, 'drawing');assert.ok(pad.hasPointerCapture(1));
    assert.equal(app.getElement('gameCanvas').dataset.laser, 'drawing', 'the initial press paints immediately before another animation frame');
    assert.ok(app.canvasArcs.some(arc => arc.radius === 4 && Math.hypot(arc.x - width / 2, arc.y - height / 2) < 1e-8),
      'the initial press immediately paints the actual red centre spot');
    assertRenderedLaserAt(app, {x: width / 2, y: height / 2}, 'the first press after selecting 45 degrees shows the red laser in the canvas centre');
    assert.deepEqual({...app.api.camera}, camera);assert.deepEqual([state.panX, state.panY], pan);assert.equal(state.zoom, zoom);
    assert.deepEqual({...app.api.activeLaser()}, settings);assert.equal(state.used, 0);assert.equal(state.shot, null);
    const moved = {clientX: down.clientX + 19, clientY: down.clientY + 13};
    pad.emit('pointermove', moved);
    assertRenderedLaserAt(app, {x: width / 2 + 19, y: height / 2 + 13}, 'dragging after the centred start follows the finger pixel for pixel');
    const heldAim = {...state.aim};
    pad.emit('pointerdown', {pointerId: 2, isPrimary: false, clientX: origin.left + width * .8, clientY: down.clientY});
    assert.deepEqual({...state.aim}, heldAim, 'another finger cannot recenter an active shot');
    pad.emit('pointercancel');assert.equal(state.mode, 'ready');assert.equal(state.used, 0);
    for (const row of [.12, .5, .87]) {
      pad.emit('pointerdown', {clientX: origin.left + width * .76, clientY: origin.top + height * row});
      assertRenderedLaserAt(app, {x: width / 2, y: height / 2}, 'upper, middle and lower laser touches all start the new sight in the centre');
      pad.emit('pointercancel');
    }
    assert.deepEqual({...app.api.camera}, camera);assert.deepEqual([state.panX, state.panY], pan);
    assert.deepEqual(app.snapshot(), saved);assert.equal(app.storageOperations.length, operations);
    assert.equal(app.ammo.requests.length, requests, 'centering and cancellation do not spend ammunition or register another round');
    if (adminTrial) assert.deepEqual(app.storageOperations, []);
  }
});

test('zero- and sixty-degree laser touches clear old sway and recenter within the current zoomed and horizontally panned view', async () => {
  for (const adminTrial of [false]) for (const verticalClicks of [0, 1200]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      ownedBows: [0, 19], bow: 19, scopeLoadouts: {19: {owned: [8], equipped: 8}},
      laserLoadouts: {19: {enabled: true, horizontalClicks: 100, verticalClicks}}}, {adminTrial});
    if (adminTrial) {
      app.api.showShop('bow');app.api.equipItem(19);app.api.closeModal();await app.flush();
      assert.equal(app.api.setLaserSettings({horizontalClicks: 100, verticalClicks}), true);
    }
    app.resize(390, 480);assert.equal(app.api.setAimZoom(8), true);app.getElement('recenterBtn').emit('click');
    const state = app.api.state, pad = app.getElement('aimTouchpad'), centre = {x: 195, y: 240};
    Object.assign(state.sway, {x: .08, y: -.07, vx: .04, vy: -.05});
    const settings = {...app.api.activeLaser()}, before = {...app.api.camera}, panY = state.panY;
    pad.emit('pointerdown');assert.equal(state.mode, 'drawing', 'the allowed zero can start a shot: ' + verticalClicks + ', admin=' + adminTrial);
    assertRenderedLaserAt(app, centre, 'old idle or cancelled-shot sway cannot put the new laser off centre');
    assert.deepEqual({...app.api.effectiveSway()}, {x: 0, y: 0});
    assert.deepEqual({...app.api.camera}, before);assert.equal(state.panY, panY);assert.equal(state.zoom, 8);
    const move = {clientX: app.api.pointer.x + 240, clientY: app.api.pointer.y};
    pad.emit('pointermove', move);
    assert.notEqual(state.panX, 0, 'the first drag establishes a real horizontal camera offset');
    pad.emit('pointercancel');
    const panned = {...app.api.camera}, pan = [state.panX, state.panY], saved = app.snapshot();
    Object.assign(state.sway, {x: -.06, y: .05, vx: -.03, vy: .02});
    pad.emit('pointerdown');
    assertRenderedLaserAt(app, centre, 'centering uses the existing panned camera instead of moving the scene back');
    assert.deepEqual({...app.api.camera}, panned);assert.deepEqual([state.panX, state.panY], pan);
    assert.deepEqual({...app.api.activeLaser()}, settings);assert.deepEqual(app.snapshot(), saved);
    assert.equal(state.used, 0);assert.equal(state.shot, null);pad.emit('pointercancel');
  }
});

test('an impossible laser centre or a blocked draw never changes aim, view, calibration or shot state', async () => {
  const snapshot = app => ({aim: {...app.api.state.aim}, sway: {...app.api.state.sway}, camera: {...app.api.camera},
    pan: [app.api.state.panX, app.api.state.panY], settings: {...app.api.activeLaser()}, used: app.api.state.used,
    mode: app.api.state.mode, shot: app.api.state.shot, popup: app.api.state.laserAdjustOpen, saved: app.snapshot()});
  for (const settings of [{horizontalClicks: 0, verticalClicks: -1200}, {horizontalClicks: 1200, verticalClicks: 900}]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      ownedBows: [0, 19], bow: 19, laserLoadouts: {19: {enabled: true}}});
    app.resize(390, 480);assert.equal(app.api.setAimZoom(1), true);
    assert.equal(app.api.openLaserAdjustments(), true);assert.equal(app.api.setLaserSettings(settings), true);
    Object.assign(app.api.state.sway, {x: .05, y: -.03, vx: .01, vy: .02});
    const before = snapshot(app), requests = app.ammo.requests.length, operations = app.storageOperations.length;
    app.getElement('aimTouchpad').emit('pointerdown');
    assert.equal(app.api.pointer, null);assert.deepEqual(snapshot(app), before, 'a physically unreachable centre rejects the draw without clamping to an invisible point');
    assert.equal(app.ammo.requests.length, requests);assert.equal(app.storageOperations.length, operations);
  }
  for (const blocked of ['modal', 'hidden', 'finished', 'flight', 'invalid-touch', 'secondary-touch']) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      ownedBows: [0, 19], bow: 19, laserLoadouts: {19: {enabled: true, verticalClicks: 900}}});
    if (blocked === 'modal') app.getElement('menuBtn').emit('click');
    if (blocked === 'hidden') app.document.hidden = true;
    if (blocked === 'finished' || blocked === 'flight') app.api.state.mode = blocked;
    const before = snapshot(app);
    app.getElement('aimTouchpad').emit('pointerdown', blocked === 'invalid-touch' ? {clientY: -1} : blocked === 'secondary-touch' ? {isPrimary: false} : {});
    assert.equal(app.api.pointer, null);assert.deepEqual(snapshot(app), before, blocked + ' cannot trigger the centering action');
  }
});

test('centred laser starts still require release to fire and leave ordinary aiming untouched', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
    ownedBows: [0, 19], bow: 19, laserLoadouts: {19: {enabled: true, verticalClicks: 900}}});
  app.resize(390, 480);assert.equal(app.api.setAimZoom(1), true);
  const pad = app.getElement('aimTouchpad'), state = app.api.state, saved = app.snapshot();
  pad.emit('pointerdown');assertRenderedLaserAt(app, {x: 195, y: 240});
  const initial = {...state.aim};holdFor(app, 11000);await app.flush();
  assert.equal(state.mode, 'drawing');assert.equal(state.used, 0);assert.equal(state.shot, null);
  assert.deepEqual({...state.aim}, initial);assert.deepEqual(app.snapshot(), saved);
  const aim = app.api.shotParams();pad.emit('pointerup');await app.flush();
  assert.equal(state.mode, 'flight');assert.equal(state.used, 1);assert.equal(state.volley.shots.length, 3);
  const v = state.shot.velocity;
  assert.ok(Math.abs(Math.atan2(v.y, Math.hypot(v.x, v.z)) - aim.pitch) < 1e-12, 'release uses the actual manually steered elevation');
  pad.emit('pointerup');assert.equal(state.used, 1);
  for (const bow of [0, 19]) {
    const ordinary = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      ownedBows: [0, 19], bow, laserLoadouts: {19: {enabled: false, verticalClicks: 900}}});
    ordinary.api.state.aim = {yaw: .12, pitch: .18};
    Object.assign(ordinary.api.state.sway, {x: .02, y: -.01});
    const before = {aim: {...ordinary.api.state.aim}, sway: {...ordinary.api.state.sway}, camera: {...ordinary.api.camera}};
    ordinary.getElement('aimTouchpad').emit('pointerdown', {clientY: ordinary.viewport.height * .1});
    assert.equal(ordinary.api.state.mode, 'ready', 'ordinary and laser-off aiming still ignores the upper view');
    assert.equal(ordinary.api.pointer, null);
    ordinary.getElement('aimTouchpad').emit('pointerdown');
    assert.equal(ordinary.api.state.mode, 'drawing');
    assert.deepEqual({aim: {...ordinary.api.state.aim}, sway: {...ordinary.api.state.sway}, camera: {...ordinary.api.camera}}, before,
      'ordinary bows and a switched-off laser retain their existing manual direction on touch');
    ordinary.getElement('aimTouchpad').emit('pointercancel');
  }
});

test('laser degree readouts preserve saved clicks and never confuse sight correction with actual launch elevation', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, sound: false,
    ownedBows: [0, 19], bow: 19, laserLoadouts: { 19: { enabled: true, horizontalClicks: -6, verticalClicks: 150 } } });
  const state = app.api.state;
  state.aim.pitch = Math.PI / 4;app.frames();
  assert.equal(app.api.openLaserAdjustments(), true);
  const aim = {...state.aim}, pan = [state.panX, state.panY], requests = app.ammo.requests.length;
  const horizontal = app.getElement('laserHorizontalValue');
  assert.equal(horizontal.dataset.value, '-6');assert.equal(horizontal.dataset.degrees, '-0.30');
  assert.equal(app.getElement('laserHorizontalSign').textContent, '−');
  assert.equal(app.getElement('laserHorizontalGear').getAttribute('aria-valuenow'), '-0.3');
  for (const [clicks, degrees, digits] of [[150, '7.50', [0, 7, 5, 0]], [900, '45.00', [4, 5, 0, 0]], [-150, '-7.50', [0, 7, 5, 0]]]) {
    assert.equal(app.api.setLaserSettings({ verticalClicks: clicks }), true);
    const display = app.getElement('laserVerticalValue'), gear = app.getElement('laserVerticalGear');
    assert.equal(display.dataset.value, String(clicks), 'stored detents retain their previous physical calibration');
    assert.equal(display.dataset.degrees, degrees);
    for (const [index, digit] of digits.entries())
      assert.equal(app.getElement(`laserVerticalDigit${index}`).style.transform, `translateY(-${digit * 10}%)`, 'the visible drum digits show degrees');
    assert.equal(gear.getAttribute('aria-valuenow'), String(Number(degrees)));
    assert.equal(gear.getAttribute('aria-valuemin'), '-60');assert.equal(gear.getAttribute('aria-valuemax'), '60');
    assert.match(gear.getAttribute('aria-valuetext'), new RegExp(`${degrees.replace('-', '[−-]').replace('.', '\\.')}도`));
    assert.deepEqual({...state.aim}, aim);assert.deepEqual([state.panX, state.panY], pan);
    const actual = (app.api.shotParams().pitch * 180 / Math.PI).toFixed(2);
    assert.equal(app.getElement('launchAngleValue').textContent, `${actual}°`, 'the separate HUD follows the physical bow, not the zeroing dial');
    assert.equal(app.getElement('laserLaunchAngleValue').textContent, `${actual}°`, 'the open calibration panel keeps the same actual angle visible on small screens');
    assert.equal(app.getElement('launchAngleHud').classList.contains('hidden'), false);
    assert.equal(app.snapshot().laserLoadouts[19].verticalClicks, clicks);
  }
  assert.equal(app.api.setLaserSettings({ verticalClicks: 150 }), true);
  app.getElement('laserVerticalGear').emit('keydown', {code: 'ArrowUp'});
  assert.equal(app.api.activeLaser().verticalClicks, 151);assert.equal(app.getElement('laserVerticalValue').dataset.degrees, '7.55');
  assert.equal(app.api.setLaserStep(10), true);
  app.getElement('laserVerticalGear').emit('wheel', {deltaY: -1});
  assert.equal(app.api.activeLaser().verticalClicks, 161);assert.equal(app.getElement('laserVerticalValue').dataset.degrees, '8.05');
  assert.equal(state.used, 0);assert.equal(state.shot, null);assert.equal(app.ammo.requests.length, requests);
  const reloaded = await appHarness(app.snapshot());
  assert.deepEqual({...reloaded.api.activeLaser()}, {enabled: true, horizontalClicks: -6, verticalClicks: 161});
  assert.equal(reloaded.getElement('laserVerticalValue').dataset.degrees, '8.05');
});

test('visible launch degrees match real forty-five-degree releases for ordinary bows and laser crossbows in both play modes', async () => {
  for (const adminTrial of [false]) for (const loadout of [{bow: 3, laser: false}, {bow: 19, laser: false}, {bow: 19, laser: true}]) {
    const fixture = {version: 1, stageCatalog: STAGE_CATALOG, sound: false, bow: loadout.bow,
      ownedBows: [0, loadout.bow], laserLoadouts: loadout.bow === 19 ? {19: {enabled: loadout.laser, verticalClicks: 900}} : {}};
    const app = await appHarness(fixture, {adminTrial});
    if (adminTrial) {
      app.api.showShop('bow');app.api.equipItem(loadout.bow);app.api.closeModal();await app.flush();
      if (loadout.bow === 19) assert.equal(app.api.setLaserSettings({enabled: loadout.laser, verticalClicks: 900}), true);
    }
    app.resize(390, 480);assert.equal(app.api.setAimZoom(1), true);
    const state = app.api.state, pad = app.getElement('aimTouchpad');
    const target = app.engine.targetAt(state.stage, state.time), targetScreen = app.api.project(target);
    const panY = state.panY, horizon = app.api.camera.horizon;
    pad.emit('pointerdown');const coordinates = moveHeldAim(app, 0, Math.PI / 4);
    holdFor(app, 1300);
    assert.ok(Math.abs(state.aim.pitch - Math.PI / 4) < 1e-12, 'the held touch reaches a physical forty-five-degree bow angle');
    assert.equal(state.panY, panY);assert.equal(app.api.camera.horizon, horizon);
    assert.deepEqual(app.api.project(target), targetScreen, 'raising the weapon never raises the aiming camera or fixed target');
    const hud = app.getElement('launchAngleHud'), value = app.getElement('launchAngleValue');
    const expectedDegrees = app.api.shotParams().pitch * 180 / Math.PI;
    assert.equal(hud.classList.contains('hidden'), false);
    assert.equal(value.textContent, `${expectedDegrees.toFixed(2)}°`);
    assert.equal(value.dataset.degrees, expectedDegrees.toFixed(2));
    const displayed = Number.parseFloat(value.textContent);
    pad.emit('pointerup', coordinates);await app.flush();
    const velocity = state.shot.velocity, launched = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) * 180 / Math.PI;
    assert.ok(Math.abs(launched - displayed) <= .00500001, 'the visible angle matches the released arrow to the displayed precision');
    assert.equal(state.mode, 'flight');assert.equal(state.used, 1);
    assert.equal(hud.classList.contains('hidden'), true, 'a falling arrow cannot be misreported as a new launch angle');
    app.frames(15);assert.equal(hud.classList.contains('hidden'), true);
    if (adminTrial) assert.deepEqual(app.storageOperations, [], 'angle display and trial releases never write normal progress');
  }
});

test('launch degree display depends on the physical angle rather than a ten- or hundred-fifty-metre mission', async () => {
  const values = [];
  for (const stage of [1, lessonStageId('long-fixed-intro', 150)]) {
    const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      lastStage: stage, bow: 19, ownedBows: [0, 19], laserLoadouts: {19: {enabled: true, verticalClicks: 150}}}));
    assert.equal(app.api.setAimZoom(1), true);
    app.api.state.aim.pitch = Math.PI / 4;app.frames();
    const displayed = app.getElement('launchAngleValue').textContent;
    assert.equal(displayed, `${(app.api.shotParams().pitch * 180 / Math.PI).toFixed(2)}°`);
    assert.equal(app.getElement('laserVerticalValue').dataset.degrees, '7.50');
    assert.notEqual(displayed, `${app.api.state.stage.distance.toFixed(2)}°`);
    values.push(displayed);
  }
  assert.equal(values[0], values[1], 'changing target distance does not turn distance into a launch angle');
});

test('a forty-five-degree laser zero keeps touch tracking, scope zoom and horizontal edge panning on the visible sight', async () => {
  for (const adminTrial of [false]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      bow: 19, ownedBows: [0, 19], scopeLoadouts: {19: {owned: [8], equipped: 8}},
      laserLoadouts: {19: {enabled: true, horizontalClicks: 200, verticalClicks: 900}}}, {adminTrial});
    if (adminTrial) {
      app.api.showShop('bow');app.api.equipItem(19);app.api.closeModal();await app.flush();
      assert.equal(app.api.setLaserSettings({horizontalClicks: 200, verticalClicks: 900}), true);
    }
    app.resize(390, 480);const state = app.api.state, pad = app.getElement('aimTouchpad');
    const sight = () => app.api.project(app.api.laserFrame().point);
    for (const zoom of [1, 8]) {
      assert.equal(app.api.setAimZoom(zoom), true);app.getElement('recenterBtn').emit('click');
      pad.emit('pointerdown');state.sway.x = state.sway.y = 0;
      const before = sight(), panY = state.panY, horizon = app.api.camera.horizon;
      let coordinates = {clientX: app.api.pointer.x, clientY: app.api.pointer.y};
      for (const [dx, dy] of [[18, -12], [-7, 5], [-11, 7]]) {
        const prior = sight();coordinates = {clientX: coordinates.clientX + dx, clientY: coordinates.clientY + dy};
        pad.emit('pointermove', coordinates);const after = sight();
        assert.ok(Math.abs(after.x - prior.x - dx) < 1e-8 && Math.abs(after.y - prior.y - dy) < 1e-8,
          `${zoom}x: the high-angle red dot follows each finger displacement in both axes`);
        assert.equal(state.panY, panY);assert.equal(app.api.camera.horizon, horizon);
      }
      assert.ok(Math.hypot(sight().x - before.x, sight().y - before.y) < 1e-8);
      assert.ok(state.aim.pitch > Math.PI / 5, 'the sight remains near the target while the real bow is elevated');
      pad.emit('pointercancel');state.sway.x = state.sway.y = 0;
      const point = sight(), aim = {...state.aim};
      assert.equal(app.api.setAimZoom(zoom === 1 ? 8 : 1), true);
      assert.ok(Math.hypot(sight().x - point.x, sight().y - point.y) < 1e-8, 'explicit scope zoom is anchored at the red sight, not the offscreen bow axis');
      assert.deepEqual({...state.aim}, aim);
    }
    assert.equal(app.api.setAimZoom(8), true);app.getElement('recenterBtn').emit('click');
    pad.emit('pointerdown');state.sway.x = state.sway.y = 0;
    const bounds = app.api.aimBounds(), camera = app.api.camera, current = sight();
    const sightYaw = Math.atan2(bounds.right - .01 - camera.cx, camera.focal);
    const sightPitch = Math.atan((camera.horizon - current.y) / camera.focal * Math.cos(sightYaw));
    const coordinates = moveHeldAim(app, sightYaw + 10 * Math.PI / 180, sightPitch + Math.PI / 4);
    const before = sight(), cameraBefore = {...app.api.camera};
    pad.emit('pointermove', {clientX: coordinates.clientX + .5, clientY: coordinates.clientY});
    const after = sight();
    assert.ok(Math.abs(app.api.camera.cx - cameraBefore.cx + .49) < 1e-8, 'horizontal edge overflow pans by its exact subpixel amount');
    assert.ok(Math.abs(after.x - before.x) < .02);assert.equal(app.api.camera.horizon, cameraBefore.horizon);
    pad.emit('pointercancel');assert.equal(state.used, 0);assert.equal(state.shot, null);
    if (adminTrial) assert.deepEqual(app.storageOperations, []);
  }
});

test('saved forty-five-degree laser calibration remains visible on recenter, new missions and reload without a distance preset', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false,
    best: {1: STAGE_FIXTURES[0].goal}, bow: 19, ownedBows: [0, 19],
    laserLoadouts: {19: {enabled: true, horizontalClicks: 100, verticalClicks: 900}}});
  const centered = instance => {
    const state = instance.api.state;state.sway.x = state.sway.y = 0;
    const target = instance.engine.targetAt(state.stage, state.time), ray = instance.api.laserFrame();
    assert.ok(ray && !ray.blocked);
    assert.ok(Math.hypot(ray.point.x - target.x, ray.point.y - target.y, ray.point.z - target.z) < 1e-8,
      'recenter applies the stored sight offset while the red point remains on the visible target');
    assert.ok(Math.abs(state.aim.pitch - Math.atan2(target.y - instance.engine.PLAYER.y, Math.hypot(target.x, target.z)) - Math.PI / 4) < 1e-12);
    assert.deepEqual({...instance.api.activeLaser()}, {enabled: true, horizontalClicks: 100, verticalClicks: 900});
    assert.equal(state.used, 0);assert.equal(state.shot, null);
  };
  centered(app);
  app.api.state.aim.pitch = .15;app.getElement('recenterBtn').emit('click');centered(app);
  app.api.startStage(2);await app.flush();centered(app);
  const saved = app.snapshot(), reloaded = await appHarness(saved);centered(reloaded);
  assert.deepEqual(reloaded.snapshot().laserLoadouts, saved.laserLoadouts, 'opening another distance never computes or replaces the user zero');
});

test('the main gun shares real sixty-degree elevation without moving the view or spending account stock', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], bow: 20, sound: false}, {remaining: 0});
  app.until(() => app.api.state.reloadRemaining === 0);
  const {state} = app.api, pad = app.getElement('aimTouchpad'), horizon = app.api.camera.horizon;
  pad.emit('pointerdown');pad.emit('pointermove', {clientX: app.api.pointer.x, clientY: app.api.pointer.y - 100000});
  assert.ok(Math.abs(state.aim.pitch - Math.PI / 3) < 1e-12);assert.equal(app.api.camera.horizon, horizon);
  pad.emit('pointercancel');assert.equal(state.used, 0);assert.equal(state.magazine, 10);
  pad.emit('pointerdown');const coords = moveHeldAim(app, 0, Math.PI / 4);pad.emit('pointerup', coords);await app.flush();
  assert.equal(state.mode, 'flight');assert.equal(state.shot.projectileType, 'bullet');
  assert.ok(Math.abs(Math.atan2(state.shot.velocity.y, Math.hypot(state.shot.velocity.x, state.shot.velocity.z)) - Math.PI / 4) < 1e-12);
  assert.equal(state.used, 1);assert.equal(state.magazine, 9);assert.equal(app.ammo.account.remaining, 0);
  assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
});

test('enabled laser zeroing stays visible before, during and after adjustment without steering or firing in either play mode', async () => {
  for (const adminTrial of [false]) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, sound: false,
      ownedBows: [0, 13], bow: 13, laserLoadouts: { 13: { enabled: true } } }, {adminTrial});
    if (adminTrial) { app.api.showShop('bow');app.api.equipItem(13);app.api.closeModal();await app.flush(); }
    app.frames();
    const state = app.api.state, canvas = app.getElement('gameCanvas');
    const aim = {...state.aim}, view = {...app.api.camera}, pan = [state.panX, state.panY], requests = app.ammo.requests.length;
    const visible = () => {
      const frame = app.api.laserFrame();assert.ok(frame);assert.equal(canvas.dataset.laser, 'ready');
      for (const axis of ['x', 'y', 'z'])
        assert.ok(Math.abs(Number(canvas.dataset[`laser${axis.toUpperCase()}`]) - frame.point[axis]) < 1e-8);
      const projected = app.api.project(frame.point);
      assert.ok(Math.abs(Number(canvas.dataset.laserScreenX) - projected.x) < 1e-8);
      assert.ok(Math.abs(Number(canvas.dataset.laserScreenY) - projected.y) < 1e-8);
      return frame.point;
    };
    const original = visible();assert.equal(state.laserAdjustOpen, false);
    assert.equal(app.api.openLaserAdjustments(), true);visible();
    const popup = app.getElement('laserPopover'), placement = {...popup.style};
    app.getElement('laserHorizontalGear').emit('keydown', {code: 'ArrowRight'});
    const horizontal = visible();assert.ok(horizontal.x < original.x, 'the visible point responds immediately to the horizontal correction');
    app.getElement('laserVerticalGear').emit('wheel', {deltaY: -1});
    const vertical = visible();assert.ok(vertical.y < horizontal.y, 'the visible point responds immediately to the vertical correction');
    assert.deepEqual({...popup.style}, placement, 'adjusting the sight never moves the controls under the finger');
    assert.deepEqual({...state.aim}, aim);assert.deepEqual({...app.api.camera}, view);assert.deepEqual([state.panX, state.panY], pan);
    app.api.closeLaserAdjustments();visible();app.frames();visible();
    assert.equal(app.api.toggleLaser(), true);assert.equal(app.api.laserFrame(), null);assert.equal(canvas.dataset.laser, 'off');
    assert.equal(canvas.dataset.laserScreenX, undefined);
    assert.equal(app.api.toggleLaser(), true);visible();
    app.getElement('menuBtn').emit('click');app.frames();
    assert.equal(app.api.laserFrame(), null);assert.equal(canvas.dataset.laser, 'off');
    app.api.closeModal();await app.flush();app.frames();visible();
    assert.equal(state.mode, 'ready');assert.equal(state.used, 0);assert.equal(state.shot, null);
    assert.equal(app.ammo.requests.length, requests, 'calibrating the visible dot does not perform an account action');
    if (adminTrial) assert.deepEqual(app.storageOperations, [], 'trial zeroing never writes normal saves');
  }
});

test('a held laser follows manual aim, never fires on target overlap or after ten seconds and fires once on release', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, sound: false,
    ownedBows: [0, 13], bow: 13, laserLoadouts: { 13: { enabled: true } }, scopeLoadouts: { 13: { owned: [2], equipped: 2 } } });
  const { state } = app.api, pad = app.getElement('aimTouchpad');
  app.frames();assert.equal(app.getElement('gameCanvas').dataset.laser, 'ready');
  pad.emit('pointerdown');app.frames(90);
  const target = app.engine.targetAt(state.stage, state.time), angles = app.api.aimAngles();
  const desiredYaw = Math.atan2(target.x, target.z), desiredPitch = Math.atan2(target.y - app.engine.PLAYER.y, Math.hypot(target.x, target.z));
  moveHeldAim(app, state.aim.yaw + desiredYaw - angles.yaw, state.aim.pitch + desiredPitch - angles.pitch);
  const point = app.api.laserFrame().point, aim = { ...state.aim };
  assert.ok(Math.hypot(point.x - target.x, point.y - target.y, point.z - target.z) < 1e-8, 'the visible dot really overlaps the target centre');
  assert.equal(state.mode, 'drawing');assert.equal(state.used, 0);assert.equal(state.shot, null);
  app.canvasText.length = 0;app.frames();
  assert.equal(app.getElement('gameCanvas').dataset.laser, 'drawing');
  assert.equal(app.canvasText.includes('2×'), false, 'the laser replaces the ordinary scope reticle during the hold');
  const rendered = app.api.laserFrame().point;
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(Number(app.getElement('gameCanvas').dataset[`laser${axis.toUpperCase()}`]) - rendered[axis]) < .001);
  holdFor(app, 12000);await app.flush();
  assert.equal(state.mode, 'drawing');assert.equal(state.used, 0);assert.equal(state.shot, null);
  assert.deepEqual({ ...state.aim }, aim, 'holding the laser never steers the real firing direction toward a target');
  pad.emit('pointerup');await app.flush();
  assert.equal(state.mode, 'flight');assert.equal(state.used, 1);assert.ok(state.shot);assert.equal(app.api.laserFrame(), null);
  pad.emit('pointerup');await app.flush();assert.equal(state.used, 1);
  app.until(() => state.mode === 'ready');pad.emit('pointerup');await app.flush();assert.equal(state.used, 1);
});

test('laser zeroing controls and forged callbacks stay locked throughout a drawn or flying shot', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 1000,
    ownedBows: [0, 13], bow: 13, laserLoadouts: { 13: { enabled: true, horizontalClicks: 8, verticalClicks: -4 } } });
  const pad = app.getElement('aimTouchpad'), horizontal = app.getElement('laserHorizontalGear');
  const settings = { ...app.api.activeLaser() }, saved = app.snapshot();
  pad.emit('pointerdown');app.frames(30);
  const assertLocked = () => {
    assert.equal(app.getElement('laserPanel').dataset.locked, 'true');assert.equal(horizontal.disabled, true);
    for (const call of [() => app.api.setLaserSettings({ horizontalClicks: 500 }), () => app.api.adjustLaser('verticalClicks', 10),
      () => app.api.toggleLaser(), () => app.api.resetLaser(), () => app.api.setLaserStep(10), () => app.api.installLaser(13)]) assert.equal(call(), false);
    for (const action of ['toggle', 'reset']) {
      const button = app.getElement(`forged-laser-${action}`);button.tagName = 'BUTTON';button.dataset.laserAction = action;
      app.document.emit('click', { target: button });
    }
    horizontal.emit('pointerdown', { pointerId: 82, clientX: 100, clientY: 100 });
    horizontal.emit('pointermove', { pointerId: 82, clientX: 200, clientY: 200 });horizontal.emit('pointerup', { pointerId: 82 });
    horizontal.emit('wheel', { deltaY: -1 });horizontal.emit('keydown', { key: 'ArrowRight', code: 'ArrowRight' });
    assert.deepEqual({ ...app.api.activeLaser() }, settings);assert.equal(app.api.state.laserStep, 1);
  };
  assertLocked();assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.used, 0);
  assert.deepEqual(app.snapshot(), saved, 'forged calibration does not write during a held shot');
  pad.emit('pointerup');await app.flush();assert.equal(app.api.state.used, 1);assertLocked();
});

test('laser cancellation, lost capture, blur and hidden-page recovery never release an arrow', async () => {
  for (const action of ['cancel', 'lost-capture', 'blur', 'hidden']) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 13], bow: 13, laserLoadouts: { 13: { enabled: true } } });
    const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');app.frames(20);
    if (action === 'cancel') pad.emit('pointercancel');
    if (action === 'lost-capture') pad.emit('lostpointercapture');
    if (action === 'blur') app.window.emit('blur');
    if (action === 'hidden') { app.document.hidden = true;app.document.emit('visibilitychange'); }
    app.advanceTo(app.now + 12000);await app.flush();pad.emit('pointerup');await app.flush();
    assert.equal(app.api.state.used, 0, action);assert.equal(app.api.state.shot, null, action);
    if (action === 'hidden') assert.equal(app.api.laserFrame(), null, 'a hidden page has no visible sight');
    else assert.ok(app.api.laserFrame(), 'canceling a draw returns to the visible ready sight without firing');
    if (action === 'hidden') { app.document.hidden = false;app.document.emit('visibilitychange');await app.flush(); }
    assert.equal(app.api.state.mode, 'ready');assert.equal(app.api.state.used, 0);
  }
});

test('incorrect laser zeroing moves only the sight and leaves the real arrow trajectory and score unchanged', async () => {
  const fixture = { version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 13], bow: 13, sound: false };
  const ordinary = await appHarness(fixture), laser = await appHarness({ ...fixture,
    ownedBows: [0, 13], bow: 13, laserLoadouts: { 13: { enabled: true, horizontalClicks: 400, verticalClicks: 80 } } });
  const shots = [];
  for (const app of [ordinary, laser]) {
    const { pad, coords } = preciseMainDraw(app), { state } = app.api;
    if (app === laser) {
      const dot = app.api.laserFrame().targetPoint, target = app.engine.targetAt(state.stage, state.time);
      assert.ok(Math.abs(dot.x - target.x) > target.radius * 2, 'a deliberately wrong zero places the sight well away from the actual aim');
    }
    const aim = { ...state.aim };pad.emit('pointerup', coords);await app.flush();
    const velocity = { ...state.shot.velocity };
    app.until(() => state.mode === 'settling');
    shots.push({ aim, velocity, result: JSON.parse(JSON.stringify(state.shot.result)), score: state.score });
  }
  const [ordinaryShot, sightShot] = shots;
  assert.equal(ordinaryShot.score, 10);assert.equal(sightShot.score, ordinaryShot.score);
  // Returning a rotated sight to the same aim adds round-off at machine
  // precision. Compare physical directions/positions tightly, while retaining
  // exact scoring and target metadata checks.
  for (const axis of ['yaw', 'pitch']) assert.ok(Math.abs(sightShot.aim[axis] - ordinaryShot.aim[axis]) < 1e-12);
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(sightShot.velocity[axis] - ordinaryShot.velocity[axis]) < 1e-10);
    assert.ok(Math.abs(sightShot.result.point[axis] - ordinaryShot.result.point[axis]) < 1e-10);
  }
  assert.ok(Math.abs(sightShot.result.flightTime - ordinaryShot.result.flightTime) < 1e-12);
  assert.deepEqual({...sightShot.result, point: ordinaryShot.result.point, flightTime: ordinaryShot.result.flightTime}, ordinaryShot.result,
    'the sight must never supply a ballistic correction or change a real result');
});

test('an enabled laser keeps coaching the actual arrow while preserving the centered sight and manual zero', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coachEnabled: true, sound: true,
    ownedBows: [0, 13], bow: 13, laserLoadouts: { 13: { enabled: false, horizontalClicks: 400, verticalClicks: 80 } } });
  const { state } = app.api;
  let draw = preciseMainDraw(app, { x: 0, y: 0 }, { missDuringHold: true });
  app.until(() => app.speech.utterances.length === 1, 20);assertCoachCue(app, true);
  draw.pad.emit('pointercancel');assert.equal(app.api.setLaserSettings({ enabled: true }), true);
  assertCoachCue(app, false);assert.equal(state.coachReady, false);assert.equal(state.coachCueUntil, 0);
  const zero = {...app.api.activeLaser()};
  app.getElement('menuBtn').emit('click');
  const coachButton = app.getElement('modalContent').innerHTML.match(/<button\b[^>]*data-action="toggle-coach"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(coachButton);assert.doesNotMatch(coachButton, /\bdisabled\b/);assert.match(coachButton, /aria-pressed="true"/);
  app.api.closeModal();await app.flush();
  const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');
  assertRenderedLaserAt(app, {x: app.viewport.width / 2, y: app.viewport.height / 2});
  assertCoachCue(app, false, 'the coach does not cue before the minimum hold');pad.emit('pointercancel');
  draw = preciseMainDraw(app, { x: 0, y: 0 }, { missDuringHold: true });
  const before = shotAccounting(app), goodAim = {...state.aim};
  app.until(() => app.speech.utterances.length === 2, 20);assertCoachCue(app, true);
  assert.equal(state.coachReady, true);assert.ok(Number.isFinite(state.coachLastCheck));
  const target = app.engine.targetAt(state.stage, state.time), dot = app.api.laserFrame().targetPoint;
  assert.ok(Math.abs(dot.x - target.x) > target.radius * 2, 'the deliberately wrong zero keeps the laser away from the true impact');
  assert.equal(app.engine.predictTrajectory(app.api.shotParams(), state.stage, state.time).result.score, 10,
    'the coach evaluates the actual arrow rather than laser-dot overlap');
  assert.deepEqual({...state.aim}, goodAim);assert.deepEqual({...app.api.activeLaser()}, zero);
  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);assertCoachCue(app, false);holdFor(app, 500);
  assert.equal(app.speech.utterances.length, 2);
  moveHeldAim(app, goodAim.yaw, goodAim.pitch);app.until(() => state.coachReady, 8);assertCoachCue(app, true);
  assert.equal(app.speech.utterances.length, 3);assert.deepEqual(shotAccounting(app), before);
  assert.deepEqual({...app.api.activeLaser()}, zero);assert.equal(state.mode, 'drawing');assert.equal(state.shot, null);
  draw.pad.emit('pointerup');await app.flush();
  assert.equal(state.used, 1);assert.equal(state.mode, 'flight');assertCoachCue(app, false);
  assert.equal(state.shot.automatic, false);app.until(() => state.mode === 'settling');
  assert.equal(state.shot.result.type, 'hit');assert.equal(state.shot.result.score, 10);
  assert.equal(app.api.progress.coachEnabled, true);assert.equal(app.snapshot().coachEnabled, true);
  assert.equal(app.ammo.requests.filter(request => ['coach-buy', 'spend', 'buy'].includes(request.action)).length, 0);
  assert.equal(app.speech.overlaps, 0);
});

test('laser coaching still gives a real firing opportunity after a manual hold exceeds ten seconds without auto-firing', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coachEnabled: true, sound: true,
    ownedBows: [0, 13], bow: 13, laserLoadouts: {13: {enabled: true, horizontalClicks: 12, verticalClicks: -7}}});
  const {state} = app.api, {pad} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
  app.until(() => state.coachReady, 20);assertCoachCue(app, true);
  const zero = {...app.api.activeLaser()}, before = shotAccounting(app);
  moveHeldAim(app, .4, .5);app.until(() => !state.coachReady, 8);assertCoachCue(app, false);
  holdFor(app, 11000);
  assert.ok(app.now - state.drawStarted > 10000);assert.equal(state.mode, 'drawing');assert.equal(state.shot, null);
  assert.deepEqual(shotAccounting(app), before);assert.equal(app.speech.utterances.length, 1);
  const aim = targetIntercept(app.engine, {bow: app.api.activeBow(), arrow: app.api.activeArrow(), charge: 1,
    velocityBias: state.velocityBias}, state.stage, state.time), sway = app.api.effectiveSway();
  moveHeldAim(app, aim.yaw - sway.x, aim.pitch - sway.y);
  const goodAim = {...state.aim};app.until(() => state.coachReady, 20);assertCoachCue(app, true);
  assert.equal(app.speech.utterances.length, 2);assert.equal(state.mode, 'drawing');assert.equal(state.used, 0);
  assert.deepEqual({...state.aim}, goodAim);assert.deepEqual({...app.api.activeLaser()}, zero);
  assert.equal(app.engine.predictTrajectory(app.api.shotParams(), state.stage, state.time).result.score, 10);
  pad.emit('pointerup');await app.flush();assert.equal(state.used, 1);assertCoachCue(app, false);
  assert.equal(state.shot.automatic, false);app.until(() => state.mode === 'settling');
  assert.equal(state.shot.result.type, 'hit');assert.equal(state.shot.result.score, 10);
  assert.equal(app.ammo.requests.filter(request => ['coach-buy', 'spend', 'buy'].includes(request.action)).length, 0);
});

test('rare crossbows sum all three delayed arrow scores while retaining one reward and round slot per trigger', async () => {
  const ordinary = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100000, sound: false });
  const single = ordinary.engine.BOWS.find(item => item.weaponType === 'crossbow' && item.burstCount === 1);
  ordinary.api.showShop('bow');ordinary.api.equipItem(single.id);ordinary.api.closeModal();await ordinary.flush();
  const ordinaryDraw = startCenteredDraw(ordinary);ordinaryDraw.pad.emit('pointerup', ordinaryDraw.coords);await ordinary.flush();
  assert.equal(ordinary.api.state.volley, null, 'an ordinary crossbow fires one physical arrow');
  assert.equal(ordinary.api.state.used, 1);
  ordinary.until(() => ordinary.api.state.mode === 'ready');
  assert.equal(ordinary.api.state.targetMarks.length, 1);assert.equal(ordinary.api.state.score, 10);

  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100000, sound: false });
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
  assert.equal(state.score, volley.shots.reduce((total,shot) => total + shot.result.score,0));
  assert.equal(state.score, 30);assert.equal(state.targetMarks.length, 3);
  assert.deepEqual(Array.from(volley.shots,shot=>shot.result.score),[10,10,10],'each physical hit stays on its original ten-point scale');
  assert.equal(state.shot.result.score,10);assert.equal(state.cinematic?.shot.result.score??10,10);
  assert.match(app.getElement('feedbackTitle').textContent,/합계.*30점/);
  assertAttachedArrows(app, state.targetMarks.map(mark => ({ x: mark.x, y: mark.y })), state.targetMarks.map(mark => mark.velocity));
  assert.equal(app.api.progress.shots, 1);assert.equal(app.api.progress.hits, 1);
  assert.equal(app.api.progress.coins, initialCoins + 30);assert.equal(app.api.progress.unlocked, 1);
  app.api.onImpact();pad.emit('pointerup', coords);await app.flush();
  assert.equal(state.used, 1);assert.equal(app.api.progress.coins, initialCoins + 30);
  for (let trigger = 1; trigger < 5; trigger++) await centeredShot(app);
  assert.equal(state.mode, 'finished');assert.equal(state.used, 5);assert.equal(state.score, 150);
  assert.equal(state.targetMarks.length, 15, 'all three impacts from every trigger stay attached');
  assert.equal(state.arrowHits,15);assert.deepEqual([...state.shotMaxScores],[30,30,30,30,30]);
  assert.equal(app.api.progress.shots, 5);assert.equal(app.api.progress.hits, 5);
  assert.equal(app.api.progress.coins, initialCoins + 175);assert.equal(app.api.progress.unlocked, 2);
  assert.equal(app.api.progress.best[1],150);assert.equal(app.snapshot().best[1],150);
  const completions=()=>app.ammo.requests.filter(request=>request.action==='round-complete');
  assert.equal(completions().length,1);assert.equal(completions()[0].score,150);
  app.api.onImpact();app.api.finishRound();await app.flush();
  assert.equal(completions().length,1);assert.equal(app.api.progress.coins,initialCoins+175,'duplicate finishes cannot duplicate score rewards or bonus');
  app.api.showShop('bow');app.api.equipItem(0);app.api.closeModal();
  assert.match(app.getElement('modalContent').innerHTML,/<strong>150<\/strong><em>\/ 150<\/em>/,'changing to a normal bow keeps the completed burst maximum');
  assert.match(app.getElement('modalContent').innerHTML,/<strong>15<\/strong><em>\/ 15발<\/em>/);
  const resumed=await appHarness(app.snapshot(),{server:app.ammo});
  assert.equal(resumed.api.progress.bow,0);assert.equal(resumed.api.progress.best[1],150);assert.equal(resumed.snapshot().best[1],150,'a real burst record is not clamped back to fifty on reload');
});

test('plate games have no menu, result, administrator or stale-button entry after removal', async () => {
  for (const adminTrial of [false]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, mainRounds: 4, sound: false}, {adminTrial});
    const {state} = app.api;
    app.getElement('menuBtn').emit('click');
    const menu = app.getElement('modalContent').innerHTML;
    assert.doesNotMatch(menu, /data-trial-event|trial-events|enter-event|접시|UFO|총알 충전/);
    assert.doesNotMatch(app.getElement('journeyCaption').textContent, /이벤트|접시/);
    app.api.closeModal();state.used = 5;state.score = state.stage.goal;app.api.finishRound();await app.flush();
    const before = {epoch: state.roundEpoch, stage: state.stage.id, used: state.used, score: state.score, modal: state.modal};
    assert.doesNotMatch(app.getElement('modalContent').innerHTML, /continue-event|start-event|접시|UFO/);
    for (const action of ['enter-event', 'continue-event', 'start-event', 'event-start', 'next-event', 'event-next', 'retry-event', 'trial-events'])
      staleModalAction(app, action);
    const oldTrial = app.getElement('retiredTrialEvent');oldTrial.tagName = 'BUTTON';oldTrial.dataset.trialEvent = '10';
    app.document.emit('click', {target: oldTrial});await app.flush();
    assert.deepEqual({epoch: state.roundEpoch, stage: state.stage.id, used: state.used, score: state.score, modal: state.modal}, before);
    assert.equal(!!state.isEvent, false);assert.equal(state.stage.kind, 'target');
    app.api.resetRound(app.engine.createClayEvent(10));await app.flush();
    assert.equal(state.roundEpoch, before.epoch, 'retired event data cannot restart the active game');
    assert.equal(state.stage.id, before.stage);assert.equal(!!state.isEvent, false);
  }
});

test('the gun fires with empty or unavailable account stock and has no reserve charging controls', async () => {
  for (const options of [{remaining: 0, coins: 0}, {guest: true, remaining: 0}, {offline: true, remaining: 0}]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], bow: 20, sound: false}, options);
    app.frames(30);await app.flush();
    const {state} = app.api;
    assert.equal(app.api.activeBow().id, 20);app.until(() => state.reloadRemaining === 0);assert.equal(state.magazine, 10);
    const shot = await preciseMainShot(app);
    assert.equal(shot.projectileType, 'bullet');assert.equal(shot.result.score, 10);
    assert.equal(state.used, 1);assert.equal(state.magazine, 9);assert.equal(state.score, 10);
    assert.equal(app.ammo.account.remaining, 0);
    assert.equal(app.ammo.requests.filter(request => ['spend', 'buy', 'coach-buy'].includes(request.action)).length, 0);
    app.getElement('menuBtn').emit('click');
    assert.doesNotMatch(app.getElement('modalContent').innerHTML, /ammo-shop|총알 충전|잔여 총알|일일 보충/);
    staleModalAction(app, 'ammo-shop');staleModalAction(app, 'buy-ammo');await app.flush();
    assert.equal(state.modal, 'menu');assert.equal(state.used, 1);
    assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
  }
});

test('three main guns follow the crossbows and paid legacy guns migrate without losing owned optics or balances', async () => {
  const fresh = await appHarness();
  assert.deepEqual(Array.from(fresh.api.progress.ownedBows), [0]);
  assert.deepEqual(Array.from(fresh.api.progress.ownedBullets), []);assert.equal(fresh.api.progress.bullet, 0);
  assert.equal(fresh.snapshot().firearmCatalog, FIREARM_CATALOG);
  fresh.api.showShop('bow');
  const visible = Array.from(fresh.getElement('modalContent').innerHTML.matchAll(/data-equip="(\d+)"/g), match => Number(match[1]));
  assert.equal(visible.length, 23);assert.deepEqual(visible.slice(-3), [20, 21, 22]);
  assert.deepEqual(Array.from(fresh.engine.BOWS.filter(item => item.weaponType === 'gun'), item => item.id), [20, 21, 22]);
  for (const id of [20, 21, 22, 23, 24]) fresh.api.equipItem(id);
  assert.equal(fresh.api.activeBow().id, 0);assert.equal(fresh.api.progress.coins, 0);
  assert.deepEqual(Array.from(fresh.api.progress.ownedBows), [0]);assert.deepEqual(Array.from(fresh.api.progress.ownedBullets), []);

  for (const gunId of [20, 21, 22]) {
    const buyer = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 1000000, ownedBows: [0, 19], bow: 19, sound: false});
    buyer.api.showShop('bow');buyer.api.equipItem(gunId);
    let coins = 1000000 - buyer.engine.BOWS[gunId].price;
    assert.equal(buyer.api.activeBow().id, gunId);assert.equal(buyer.api.progress.coins, coins);
    assert.deepEqual(Array.from(buyer.api.progress.ownedBullets), [0]);assert.equal(buyer.api.activeBullet().id, 0);
    buyer.api.equipItem(gunId);assert.equal(buyer.api.progress.coins, coins);
    assert.equal(buyer.api.progress.ownedBows.filter(id => id === gunId).length, 1);
    assert.deepEqual(Array.from(buyer.api.progress.ownedBullets), [0], 'buying or re-equipping a gun grants the basic type only once');
    for (const zoom of [2, 3, 6, 8]) {
      assert.equal(buyer.api.installScope(gunId, zoom), true);coins -= buyer.engine.getScopePrice(gunId, zoom);
      assert.equal(buyer.api.state.zoom, zoom);assert.equal(buyer.api.progress.coins, coins);
      assert.equal(buyer.api.installScope(gunId, zoom), true);assert.equal(buyer.api.progress.coins, coins);
    }
    const bought = await appHarness(buyer.snapshot());
    assert.equal(bought.api.activeBow().id, gunId);assert.equal(bought.api.progress.coins, coins);
    assert.equal(bought.snapshot().firearmCatalog, FIREARM_CATALOG);
    assert.deepEqual(Array.from(bought.api.progress.ownedBows), [0, 19, gunId], 'new sniper IDs do not collapse into the old gun on reload');
    assert.deepEqual(Array.from(bought.api.progress.ownedBullets), [0]);assert.equal(bought.api.activeBullet().id, 0);
    assert.deepEqual(Array.from(bought.api.progress.scopeLoadouts[gunId].owned), [2, 3, 6, 8]);assert.equal(bought.api.state.zoom, 8);
  }

  for (const oldGunId of [20, 21, 22, 23, 24]) {
    const old = {version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 19, oldGunId], ownedArrows: [0, 18],
      bow: oldGunId, arrow: 18, eventGun: oldGunId, coins: 777, clayCredits: 7, stabilizers: 3, sound: false,
      ownedBullets: [0, 3], bullet: 3, scopeLoadouts: oldGunId >= 22 ? {[oldGunId]: {owned: [3], equipped: 3}} : {}};
    const app = await appHarness(old, {remaining: 17, coins: 23});
    assert.equal(app.api.activeBow().id, 20);assert.match(app.api.activeBow().name, /정밀\s*사격총/);
    assert.deepEqual(Array.from(app.api.progress.ownedBows), [0, 19, 20], 'unmarked historical gun IDs never grant the new snipers');
    assert.equal(app.api.progress.coins, 777);assert.equal(app.api.progress.arrow, 18);
    assert.equal(app.api.progress.clayCredits, 7);assert.equal(app.api.progress.stabilizers, 3);
    assert.equal(app.api.equippedScope(20), oldGunId >= 22 ? 3 : 1);
    assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0]);assert.equal(app.api.activeBullet().id, 0);
    assert.equal(app.snapshot().firearmCatalog, FIREARM_CATALOG, 'the completed migration is marked before later purchases');
    app.api.showShop('bow');app.api.equipItem(20);assert.equal(app.api.progress.coins, 777, 'old ownership never pays the new price');
    for (const unavailableId of [21, 22, 23, 24]) app.api.equipItem(unavailableId);
    assert.equal(app.api.activeBow().id, 20);assert.equal(app.api.progress.coins, 777);
    const resumed = await appHarness(app.snapshot(), {server: app.ammo});
    assert.equal(resumed.api.activeBow().id, 20);assert.deepEqual(Array.from(resumed.api.progress.ownedBows), [0, 19, 20]);
    assert.equal(resumed.api.equippedScope(20), oldGunId >= 22 ? 3 : 1);
    assert.deepEqual(Array.from(resumed.api.progress.ownedBullets), [0]);assert.equal(resumed.api.activeBullet().id, 0);
    assert.equal(app.ammo.account.coins, 23);assert.equal(app.ammo.account.remaining, 17);
    assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
  }
  const merged = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20, 22, 23, 24], bow: 24, coins: 37,
    scopeLoadouts: {20: {owned: [2, 6, 8], equipped: 6}, 22: {owned: [3], equipped: 3}, 24: {owned: [3], equipped: 3}}});
  assert.deepEqual(Array.from(merged.api.progress.scopeLoadouts[20].owned), [2, 3, 6, 8]);
  assert.equal(merged.api.equippedScope(20), 3, 'the selected old gun keeps its equipped lens');
  assert.equal(merged.api.progress.coins, 37);assert.equal(merged.api.progress.ownedBows.filter(id => id === 20).length, 1);
  assert.deepEqual(Array.from(merged.api.progress.ownedBullets), [0]);
});

test('the new firearm marker preserves distinct sniper optics and valid permanent bullet ownership across reload', async () => {
  const saved = {version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG, coins: 321,
    ownedBows: [0, 21, 22], bow: 22, ownedBullets: [3, 1, 3, -1, 4, '2', null, 1.5], bullet: 3,
    scopeLoadouts: {21: {owned: [2, 6], equipped: 6}, 22: {owned: [3, 8], equipped: 8}}, sound: false};
  const app = await appHarness(saved);
  assert.deepEqual(Array.from(app.api.progress.ownedBows), [0, 21, 22]);assert.equal(app.api.activeBow().id, 22);
  assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0, 3, 1]);assert.equal(app.api.activeBullet().id, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(app.api.progress.scopeLoadouts)), saved.scopeLoadouts);
  assert.equal(app.api.state.zoom, 8);assert.equal(app.api.progress.coins, 321);
  const restored = await appHarness(app.snapshot());
  assert.deepEqual(Array.from(restored.api.progress.ownedBows), [0, 21, 22]);assert.equal(restored.api.activeBow().id, 22);
  assert.deepEqual(Array.from(restored.api.progress.ownedBullets), [0, 3, 1]);assert.equal(restored.api.activeBullet().id, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.api.progress.scopeLoadouts)), saved.scopeLoadouts);
  const unowned = await appHarness({...saved, bullet: 2});
  assert.equal(unowned.api.activeBullet().id, 0, 'an unowned selected type falls back to the gun’s free basic bullet');
  assert.deepEqual(Array.from(unowned.api.progress.ownedBullets), [0, 3, 1]);assert.equal(unowned.api.progress.coins, 321);
});

test('bullet types require an owned gun and are bought once, shared by every gun and preserved across reload without account stock', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 1000000, sound: false}, {remaining: 0, coins: 23});
  const choose = id => {
    const button = app.getElement(`bullet-equip-${id}`);button.tagName = 'BUTTON';button.dataset.equip = String(id);
    app.document.emit('click', {target: button});
  };
  const ids = () => Array.from(app.getElement('modalContent').innerHTML.matchAll(/data-equipment="bullet" data-equipment-id="(\d+)"/g), match => Number(match[1]));
  app.api.showShop('bullet');assert.deepEqual(ids(), [0, 1, 2, 3]);
  assert.match(app.getElement('modalContent').innerHTML, /data-projectile-tab="bullet"/);
  for (const id of [0, 1, 2, 3]) choose(id);
  assert.deepEqual(Array.from(app.api.progress.ownedBullets), []);assert.equal(app.api.progress.coins, 1000000);
  assert.equal(app.api.activeBow().id, 0, 'the bullet tab never grants or auto-equips a gun');
  app.api.showShop('bow');app.api.equipItem(20);
  let coins = 1000000 - app.engine.BOWS[20].price;
  assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0]);assert.equal(app.api.activeBullet().id, 0);
  app.api.showShop('bullet');
  for (const id of [1, 2, 3]) {
    choose(id);coins -= app.engine.BULLETS[id].price;
    assert.equal(app.api.progress.coins, coins);assert.equal(app.api.activeBullet().id, id);
    choose(id);assert.equal(app.api.progress.coins, coins, 'an owned bullet type never charges again');
    assert.equal(app.api.progress.ownedBullets.filter(owned => owned === id).length, 1);
  }
  assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0, 1, 2, 3]);
  app.api.showShop('bow');app.api.equipItem(0);app.api.showShop('bullet');choose(2);choose(3);
  assert.equal(app.api.activeBow().id, 0);assert.equal(app.api.state.roundShotLimit, 5);
  assert.equal(app.api.activeBullet().id, 3);assert.equal(app.api.progress.coins, coins);
  for (const gunId of [21, 22]) {
    app.api.showShop('bow');app.api.equipItem(gunId);coins -= app.engine.BOWS[gunId].price;
    assert.equal(app.api.activeBow().id, gunId);assert.equal(app.api.activeBullet().id, 3, 'a new gun preserves the chosen shared bullet');
    assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0, 1, 2, 3]);assert.equal(app.api.progress.coins, coins);
  }
  for (const [index, gunId] of [20, 21, 22].entries()) {
    app.api.showShop('bow');app.api.equipItem(gunId);app.api.closeModal();await app.flush();
    if (index) assert.equal(app.api.state.magazine, 10 - index, 'switching gun models cannot refill the current round');
    const shot = await preciseMainShot(app);coins += 10;
    assert.equal(shot.bulletId, 3);assert.equal(shot.result.score, 10);
    assert.equal(app.api.state.used, index + 1);assert.equal(app.api.state.magazine, 9 - index);
    assert.equal(app.api.progress.coins, coins);assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0, 1, 2, 3]);
  }
  const restored = await appHarness(app.snapshot(), {server: app.ammo});
  assert.deepEqual(Array.from(restored.api.progress.ownedBows), [0, 20, 21, 22]);assert.equal(restored.api.activeBow().id, 22);
  assert.deepEqual(Array.from(restored.api.progress.ownedBullets), [0, 1, 2, 3]);assert.equal(restored.api.activeBullet().id, 3);
  assert.equal(restored.api.progress.coins, coins);assert.equal(restored.snapshot().firearmCatalog, FIREARM_CATALOG);
  assert.equal(app.ammo.account.remaining, 0);assert.equal(app.ammo.account.coins, 23);
  assert.equal(app.ammo.requests.filter(request => ['spend', 'buy', 'coach-buy'].includes(request.action)).length, 0);
});

test('failed gun and bullet purchases roll back the free basic grant, selection and coins before a single successful retry', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 1000000, sound: false});
  const persist = app.store.set.bind(app.store);app.api.showShop('bow');
  const beforeGun = app.snapshot();app.store.set = () => {throw new Error('storage denied');};
  app.api.equipItem(21);
  assert.equal(app.api.activeBow().id, 0);assert.deepEqual(Array.from(app.api.progress.ownedBows), [0]);
  assert.deepEqual(Array.from(app.api.progress.ownedBullets), []);assert.equal(app.api.progress.bullet, 0);
  assert.equal(app.api.progress.coins, 1000000);assert.equal(app.api.state.roundShotLimit, 5);assert.deepEqual(app.snapshot(), beforeGun);
  app.store.set = persist;app.api.equipItem(21);
  const gunCoins = 1000000 - app.engine.BOWS[21].price;
  assert.equal(app.api.activeBow().id, 21);assert.equal(app.api.progress.coins, gunCoins);
  assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0]);assert.equal(app.api.state.roundShotLimit, 10);
  app.api.showShop('bullet');const beforeBullet = app.snapshot();
  app.store.set = () => {throw new Error('storage denied');};app.api.equipItem(3);
  assert.equal(app.api.progress.coins, gunCoins);assert.equal(app.api.activeBullet().id, 0);
  assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0]);assert.deepEqual(app.snapshot(), beforeBullet);
  assert.equal(app.api.activeBow().id, 21);assert.equal(app.api.state.roundShotLimit, 10);
  app.store.set = persist;app.api.equipItem(3);const bulletCoins = gunCoins - app.engine.BULLETS[3].price;
  assert.equal(app.api.progress.coins, bulletCoins);assert.equal(app.api.activeBullet().id, 3);
  assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0, 3]);
  app.api.equipItem(0);app.api.equipItem(3);assert.equal(app.api.progress.coins, bulletCoins);
  const restored = await appHarness(app.snapshot());
  assert.equal(restored.api.activeBow().id, 21);assert.equal(restored.api.activeBullet().id, 3);
  assert.equal(restored.api.progress.coins, bulletCoins);assert.deepEqual(Array.from(restored.api.progress.ownedBullets), [0, 3]);
});

test('each selected bullet type reaches the real shot with its configured speed and drop and straight misses finish promptly', async () => {
  const template = STAGE_FIXTURES.find(stage => stage.kind === 'target' && stage.distance === 150 && !stage.motion.speed && !stage.obstacles.length && !(stage.passers?.length));
  assert.ok(template);
  for (const bullet of [0, 1, 2, 3]) {
    const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
      ownedBows: [0, 22], bow: 22, ownedBullets: [0, 1, 2, 3], bullet, ownedArrows: [0, 13], arrow: 13,
      lastStage: template.id, sound: false}), {remaining: 0});
    const {state} = app.api;state.stage.wind = 8;
    const {pad, coords} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
    app.until(() => state.coachReady, 20);assertCoachCue(app, true);
    assert.equal(app.api.shotParams().bullet.id, bullet);pad.emit('pointerup', coords);await app.flush();
    const shot = state.shot, velocity = {...shot.velocity};
    assert.equal(shot.bulletId, bullet);assert.equal(shot.ability, null);
    assert.equal(shot.speed, app.engine.BULLET_SPEED * [1, 1.5, 2, 3][bullet]);
    assert.equal(shot.gravityScale, app.engine.BULLETS[bullet].gravityScale);
    app.frames(2);assert.ok(shot.position.z > 0);
    const along = (shot.position.z - app.engine.PLAYER.z) / velocity.z;
    const rayY = app.engine.PLAYER.y + velocity.y * along;
    if (bullet === 3) {
      assert.equal(shot.gravityScale, 0);assert.equal(shot.windFactor, 0);
      assert.ok(Math.abs(shot.position.y - rayY) < 1e-10);
      assert.ok(Math.abs(shot.position.x - app.engine.PLAYER.x - velocity.x * along) < 1e-10, 'the highest bullet stays on its ray even in crosswind');
    } else assert.ok(shot.position.y < rayY, 'ordinary bullet tiers retain their real gravity drop');
    app.until(() => state.mode === 'ready');assert.equal(shot.result.type, 'hit');assert.equal(shot.result.score, 10);
    assert.equal(state.magazine, 9);assert.deepEqual(Array.from(app.api.progress.ownedBullets), [0, 1, 2, 3]);
    if (bullet === 3) {
      pad.emit('pointerdown');moveHeldAim(app, .4, .5);holdFor(app, 300);pad.emit('pointerup');await app.flush();
      const miss = state.shot;app.until(() => state.mode === 'ready', 300);
      assert.equal(miss.result.type, 'miss');assert.ok(miss.elapsed < 1, 'a straight miss ends when it passes the real target plane');
      assert.equal(state.used, 2);assert.equal(state.magazine, 8);assert.equal(state.score, 10);
    }
    assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
  }
});

test('ten real gun shots finish each gun model at one hundred points and cannot fire an eleventh', async () => {
  for (const [gunId, bullet] of [[20, 0], [21, 1], [22, 3]]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
      ownedBows: [0, gunId], bow: gunId, ownedBullets: [0, bullet], bullet,
      ownedArrows: [0, 13], arrow: 13, clayCredits: 7, stabilizers: 3, sound: false}, {remaining: 0});
    const {state} = app.api;
    assert.equal(state.magazine, 0);assert.equal(state.reloadRemaining, 1);
    assertCoachCue(app, false);assert.equal(state.coachLastCheck, -Infinity);
    for (let turn = 1; turn <= 10; turn++) {
      const {pad, coords} = preciseMainDraw(app, {x: 0, y: 0}, {missDuringHold: true});
      app.until(() => state.coachReady, 20);assertCoachCue(app, true);
      assert.equal(state.used, turn - 1);assert.equal(state.magazine, 11 - turn, 'the coach never consumes a shot');
      pad.emit('pointerup', coords);await app.flush();
      const shot = state.shot;
      assert.equal(state.mode, 'flight');assertCoachCue(app, false, 'releasing each bullet immediately hides the cue');
      app.until(() => state.mode === 'settling');
      assert.equal(state.cinematic?.kind, 'bullet');assert.equal(state.mode, 'settling');
      assert.equal(state.modal, null, 'the round result waits for the final bullet celebration');
      assert.equal(app.ammo.requests.filter(request => request.action === 'round-complete').length, 0);
      const replayAccounting = shotAccounting(app);
      pad.emit('pointerdown');pad.emit('pointerup');app.frames(3);
      assert.equal(state.shot, shot);assert.equal(state.used, turn);assert.equal(state.magazine, 10 - turn);
      assert.deepEqual(shotAccounting(app), replayAccounting, 'input during the celebration cannot fire or score again');
      app.until(() => ['ready', 'finished'].includes(state.mode));await app.flush();
      assertCoachCue(app, false, 'the coach stays hidden between shots and after the final result');
      assert.equal(shot.projectileType, 'bullet');assert.equal(shot.bulletId, bullet);assert.equal(shot.ability, null);
      assert.equal(shot.result.type, 'hit');assert.equal(shot.result.score, 10);
      assert.equal(state.used, turn);assert.equal(state.score, turn * 10);assert.equal(state.magazine, 10 - turn);
      assert.equal(state.mode, turn === 10 ? 'finished' : 'ready');assert.equal(!!state.isEvent, false);
      if (turn === 5) assert.equal(app.ammo.requests.filter(request => request.action === 'round-complete').length, 0, 'five bullets are only half a gun round');
    }
    assert.equal(state.modal, 'result');assert.equal(state.shotScores.length, 10);assert.equal(state.hits, 10);
    assert.equal(app.api.progress.best[1], 100);assert.equal(app.api.progress.unlocked, 2);assert.equal(app.api.progress.mainRounds, 1);
    assert.equal(app.api.progress.shots, 10);assert.equal(app.api.progress.hits, 10);assert.equal(app.api.progress.coins, 125);
    assert.equal(app.api.progress.clayCredits, 7);assert.equal(app.api.progress.stabilizers, 3);
    const completions = app.ammo.requests.filter(request => request.action === 'round-complete');
    assert.equal(completions.length, 1);assert.equal(completions[0].stage, 1);assert.equal(completions[0].score, 100);
    assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
    const lastShot = state.shot;app.getElement('aimTouchpad').emit('pointerdown');app.getElement('aimTouchpad').emit('pointerup');
    app.frames(180);app.api.finishRound();app.api.closeModal();await app.flush();
    assert.equal(state.used, 10);assert.equal(state.shot, lastShot);assert.equal(state.magazine, 0);assert.equal(state.reloadRemaining, 0);
    assertCoachCue(app, false);assert.equal(app.speech.utterances.length, 0);
    assert.equal(app.api.progress.coins, 125);assert.equal(state.mode, 'finished');
    assert.equal(modalActionDisabled(app, 'next-stage'), false);modalAction(app, 'next-stage');await app.flush();
    assert.equal(state.stage.id, 2);assert.equal(state.used, 0);assert.equal(state.magazine, 0);assert.equal(state.reloadRemaining, 1);
    app.until(() => state.reloadRemaining === 0);assert.equal(state.magazine, 10);assert.equal(app.api.activeBow().id, gunId);
  }
});

test('stabilizers redeem legacy credits first and otherwise cost one hundred game coins without account purchases', async () => {
  for (const credits of [0, 4, 5, 12]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false, coins: 375, clayCredits: credits, stabilizers: 0}, {remaining: 17, coins: 23});
    assert.equal(app.api.buyStabilizer(), false, 'a stale action outside the modal cannot buy an item');
    app.getElement('stabilizerBtn').emit('click');assert.equal(app.api.state.modal, 'stabilizer');
    assert.doesNotMatch(app.getElement('modalContent').innerHTML, /접시|UFO/);
    for (let attempt = 0; attempt < 3; attempt++) modalAction(app, 'buy-stabilizer');
    const redeemed = Math.min(3, Math.floor(credits / 5)), coins = 375 - (3 - redeemed) * 100;
    assert.equal(app.api.progress.stabilizers, 3);assert.equal(app.api.progress.clayCredits, credits - redeemed * 5);
    assert.equal(app.api.progress.coins, coins);assert.equal(app.ammo.account.coins, 23);assert.equal(app.ammo.account.remaining, 17);
    assert.equal(app.ammo.requests.filter(request => ['buy', 'spend'].includes(request.action)).length, 0);
    const reloaded = await appHarness(app.snapshot());
    assert.equal(reloaded.api.progress.stabilizers, 3);assert.equal(reloaded.api.progress.clayCredits, credits - redeemed * 5);assert.equal(reloaded.api.progress.coins, coins);
  }
  const poor = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, coins: 49, clayCredits: 4, sound: false});
  poor.api.showStabilizers();assert.equal(poor.api.buyStabilizer(), false);
  assert.equal(poor.api.progress.coins, 49);assert.equal(poor.api.progress.clayCredits, 4);assert.equal(poor.api.progress.stabilizers, 0);
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
    const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 456, lastStage: 2, ownedBows: [0, 10], ownedArrows: [0, 2], bow: 10, arrow: 2, best: { 1: 42 }, mainRounds: 3, sound: false, ...values }));
    assert.equal(app.api.progress.clayCredits, credits);assert.equal(app.api.progress.stabilizers, inventory);
    assert.equal(app.snapshot().clayCredits, credits);assert.equal(app.snapshot().stabilizers, inventory);
    assert.equal(app.api.progress.coins, 456);assert.equal(app.api.state.stage.id, 2);assert.equal(app.api.activeBow().id, 10);assert.equal(app.api.activeArrow().id, 2);
    assert.equal(app.api.progress.best[1], 42);assert.equal(app.api.progress.mainRounds, 3);
    assert.equal(app.getElement('stabilizerCount').textContent, inventory > 99 ? '99+' : String(inventory));
    assert.ok(app.getElement('stabilizerBtn').getAttribute('aria-label').includes(inventory.toLocaleString('ko-KR')));
  }
});

test('one stabilizer covers the current round across weapon changes and expires on retry, stage or reload', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, stabilizers: 5, clayCredits: 3, sound: false, ownedBows: [0, 10, 20] });
  await centeredShot(app);
  assert.equal(app.api.state.used, 1);assert.equal(app.api.state.mode, 'ready');
  app.api.showStabilizers();modalAction(app, 'use-stabilizer');
  assert.equal(app.api.state.stabilizerActive, true);assert.equal(app.api.progress.stabilizers, 4);assert.equal(app.api.state.modal, null);
  assert.equal(app.getElement('stabilizerBadge').classList.contains('hidden'), false);
  app.api.showStabilizers();assert.equal(app.api.useStabilizer(), false);
  assert.equal(app.api.progress.stabilizers, 4, 'a second use in the same round never consumes inventory');app.api.closeModal();
  app.api.showShop('bow');app.api.equipItem(10);app.api.closeModal();
  assert.equal(app.api.activeBow().id, 10);assert.equal(app.api.state.stabilizerActive, true);
  await centeredShot(app);
  assert.equal(app.api.state.stabilizerActive, true, 'the effect survives individual shots in its round');assert.equal(app.api.state.used, 2);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.stabilizers, 4);assert.equal(reloaded.api.state.stabilizerActive, false, 'reloading cannot restore an already consumed effect');
  assert.equal(reloaded.getElement('stabilizerBadge').classList.contains('hidden'), true);
  clearFixtureBefore(app, 2);app.api.startStage(2);await app.flush();
  assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.api.progress.stabilizers, 4);
  app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
  app.getElement('menuBtn').emit('click');modalAction(app, 'retry');await app.flush();
  assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.api.progress.stabilizers, 3);
  app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
  await equipMainGun(app);
  assert.equal(app.api.state.stabilizerActive, true);assert.equal(app.api.progress.stabilizers, 2);
  app.api.resetRound();await app.flush();assert.equal(app.api.state.stabilizerActive, false);
  app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
  app.api.startStage(1);await app.flush();
  assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.api.progress.stabilizers, 1);
  assert.equal(app.snapshot().stabilizers, 1);assert.equal(app.snapshot().clayCredits, 3);
});

test('bows, crossbows and guns ease into stillness, retain half sway with stabilizers and immediately resume full sway', async () => {
  for (const id of [0, 10, 20]) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 10, 20], bow: id === 20 ? 0 : id, eventGun: 20, stabilizers: 1, sound: false });
    if (id === 20) { await equipMainGun(app); }
    app.setRandom(() => .8);app.frames(3);app.until(() => Math.hypot(app.api.state.sway.x, app.api.state.sway.y) > 0, 20);
    app.advanceTo(Math.ceil(app.now / 100) * 100);
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
    // Inspect the envelope against one unchanged random-motion vector. Its
    // shape must ease continuously; it must not rewrite the motion process.
    const raw = {x: state.sway.x, y: state.sway.y}, full = Math.hypot(raw.x, raw.y) * .34;
    const ratioAt = time => { const sway = app.api.effectiveSway(time);return Math.hypot(sway.x, sway.y) / full; };
    const settleStart = start - 600;
    assert.ok(Math.abs(ratioAt(settleStart - .001) - 1) < 1e-12);
    assert.ok(Math.abs(ratioAt(settleStart + .001) - 1) < 1e-8, 'settling begins without an amplitude jump');
    const ratios = [0, 150, 300, 450, 599, 600].map(elapsed => ratioAt(settleStart + elapsed));
    assert.ok(Math.abs(ratios[2] - .5) < 1e-12, 'halfway through settling the remaining sway is half strength');
    for (let i = 1; i < ratios.length; i++) assert.ok(ratios[i] < ratios[i - 1], 'the sway envelope decreases smoothly before stillness');
    assert.ok(ratioAt(start - .001) < 1e-8, 'the final approach is already imperceptibly close to stillness');
    assert.equal(ratioAt(start), 0);assert.equal(ratioAt(end - .001), 0);
    assert.ok(Math.abs(ratioAt(end) - 1) < 1e-12, 'the exact end of the steady window restores normal half-strength sway immediately');
    assert.deepEqual({x: state.sway.x, y: state.sway.y}, raw);
    app.advanceTo(start - 300);
    assert.equal(app.api.isSteady(), false, 'settling does not start the timed stillness interval early');
    assert.equal(app.getElement('drawTiming').classList.contains('steady'), false);
    assert.match(app.getElement('steadyLabel').textContent, /서서히 안정/);
    assert.ok(Math.abs(app.firstPersonFrame.swayX - state.sway.x * .17) < 1e-12);
    assert.ok(Math.abs(app.firstPersonFrame.swayY - state.sway.y * .17) < 1e-12);
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

test('sniper hand shake matches its reduced or zero factor in the visible aim and real release throughout the draw', async () => {
  for (const [gunId, factor] of [[20, 1], [21, .25], [22, 0]]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
      ownedBows: [0, gunId], bow: gunId, stabilizers: 1, sound: false});
    const {state} = app.api;app.until(() => state.reloadRemaining === 0);
    app.setRandom(() => .8);app.until(() => Math.hypot(state.sway.x, state.sway.y) > 0, 120);
    const original = {...state.sway};assert.ok(Math.hypot(original.x, original.y) > 0);
    const scaled = (value, strength) => factor === 0 ? 0 : value * strength * factor;
    assert.equal(app.api.effectiveSway().x, scaled(original.x, .68));
    assert.equal(app.api.effectiveSway().y, scaled(original.y, .68));
    assert.equal(app.firstPersonFrame.swayX, scaled(original.x, .68));
    assert.equal(app.firstPersonFrame.swayY, scaled(original.y, .68));
    app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
    assert.deepEqual({...state.sway}, original);
    assert.equal(app.api.effectiveSway().x, scaled(original.x, .34));
    assert.equal(app.api.effectiveSway().y, scaled(original.y, .34));
    app.setRandom(() => .5);const pad = app.getElement('aimTouchpad');pad.emit('pointerdown');
    moveHeldAim(app, .1, .15);const heldAim = {...state.aim};
    const times = factor === 0 ? [300, 2500, 7000, 9900] : [300, (state.steadyStart + state.steadyDuration + .5) * 1000];
    for (const milliseconds of times) {
      app.advanceTo(state.drawStarted + milliseconds);assert.equal(state.mode, 'drawing');
      assert.deepEqual({...state.aim}, heldAim, 'stability changes never move the player’s deliberate aim');
      assert.equal(app.api.isSteady(), factor === 0);
      assert.equal(app.api.effectiveSway().x, scaled(state.sway.x, .34));
      assert.equal(app.api.effectiveSway().y, scaled(state.sway.y, .34));
      assert.equal(app.firstPersonFrame.swayX, app.api.effectiveSway().x);
      assert.equal(app.firstPersonFrame.swayY, app.api.effectiveSway().y);
      if (factor === 0) assert.match(app.getElement('steadyLabel').textContent, /손떨림 없음|흔들림 없음|항상 안정/);
    }
    const aim = {...app.api.aimAngles()};pad.emit('pointerup');await app.flush();
    assert.equal(state.mode, 'flight');assert.equal(state.used, 1);assert.equal(state.magazine, 9);
    const {velocity} = state.shot;
    assert.ok(Math.abs(Math.atan2(velocity.x, velocity.z) - aim.yaw) < 1e-12);
    assert.ok(Math.abs(Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) - aim.pitch) < 1e-12);
    if (factor === 0) assert.deepEqual(aim, heldAim, 'the zero-shake rifle fires exactly along the hand-selected direction');
  }
});

test('manual touch remains direct while settling and every weapon fires along the same damped ray that was rendered', async () => {
  for (const id of [0, 10, 20]) for (const stabilized of [false, true]) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 10, 20],
      bow: id === 20 ? 0 : id, eventGun: 20, stabilizers: 1, sound: false});
    if (id === 20) { await equipMainGun(app); }
    if (stabilized) { app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true); }
    const sequence = [.5, 0];app.setRandom(() => sequence.length ? sequence.shift() : .8);
    const pad = app.getElement('aimTouchpad'), {state} = app.api;
    pad.emit('pointerdown');
    const midpoint = state.drawStarted + state.steadyStart * 1000 - 300;
    app.advanceTo(midpoint - 20);
    const beforeScreen = baseAimScreen(app), beforePointer = {...app.api.pointer};
    const coordinates = moveHeldAim(app, state.aim.yaw + .06, state.aim.pitch + .02);
    const afterScreen = baseAimScreen(app), heldAim = {...state.aim};
    assert.ok(Math.abs(afterScreen.x - beforeScreen.x - (coordinates.clientX - beforePointer.x)) < 1e-9);
    assert.ok(Math.abs(afterScreen.y - beforeScreen.y - (coordinates.clientY - beforePointer.y)) < 1e-9,
      'settling reduces random sway without slowing or multiplying a deliberate touch movement');
    app.canvasArcs.length = 0;app.advanceTo(midpoint);
    assert.deepEqual({...state.aim}, heldAim, 'holding a finger still never alters the chosen base aim');
    assert.equal(app.api.isSteady(), false);
    const sway = app.api.effectiveSway(), factor = stabilized ? .17 : .34;
    assert.ok(Math.hypot(state.sway.x, state.sway.y) > 0);
    assert.ok(Math.abs(sway.x - state.sway.x * factor) < 1e-12);
    assert.ok(Math.abs(sway.y - state.sway.y * factor) < 1e-12);
    assert.equal(app.firstPersonFrame.swayX, sway.x);assert.equal(app.firstPersonFrame.swayY, sway.y);
    const aim = {...app.api.aimAngles()}, reticle = app.canvasArcs.filter(arc => arc.radius === 1.7).at(-1);
    assert.ok(reticle, 'the rendered aiming centre is present during settling');
    assert.equal(aim.yaw, state.aim.yaw + sway.x);assert.equal(aim.pitch, state.aim.pitch + sway.y);
    pad.emit('pointerup', coordinates);await app.flush();
    const {velocity} = state.shot;
    assert.ok(Math.abs(Math.atan2(velocity.x, velocity.z) - aim.yaw) < 1e-12);
    assert.ok(Math.abs(Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) - aim.pitch) < 1e-12);
    const ray = app.api.project({x: velocity.x, y: app.engine.PLAYER.y + velocity.y, z: velocity.z});
    assert.ok(Math.abs(ray.x - reticle.x) < 1e-9 && Math.abs(ray.y - reticle.y) < 1e-9,
      `weapon ${id} keeps its reticle and actual release direction aligned during settling`);
    assert.equal(state.used, 1);assert.equal(state.shot.automatic, false);
    assert.equal(app.ammo.requests.filter(request => request.action === 'spend').length, 0);
  }
});

test('stabilizers never consume stock during arrow or bullet flight, previews, results or record synchronization', async () => {
  const cases = [
    {name: 'arrow flight', prepare: async app => {app.getElement('aimTouchpad').emit('pointerdown');app.getElement('aimTouchpad').emit('pointerup');assert.equal(app.api.state.mode, 'flight');}},
    {name: 'bullet flight', prepare: async app => {await equipMainGun(app);app.getElement('aimTouchpad').emit('pointerdown');app.getElement('aimTouchpad').emit('pointerup');assert.equal(app.api.state.mode, 'flight');assert.equal(app.api.state.shot.projectileType, 'bullet');}},
    {name: 'preview', prepare: async app => {const id = app.engine.DISTANCE_STAGES.find(stage => stage.obstacles.length).id;clearFixtureBefore(app, id);app.api.startStage(id);await app.flush();assert.equal(app.api.state.mode, 'preview');}},
    {name: 'result', prepare: async app => {app.api.state.used = 5;app.api.finishRound();await app.flush();assert.equal(app.api.state.mode, 'finished');}},
    {name: 'record save', hold: ['round-complete'], prepare: async app => {app.api.state.used = 5;app.api.finishRound();await app.flush();assert.equal(app.api.state.roundSaving, true);}},
    {name: 'registration', hold: ['round-start'], prepare: async app => assert.equal(app.api.state.registering, true)},
  ];
  for (const {name, hold, prepare} of cases) {
    const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], stabilizers: 1, sound: false}, {hold});
    await prepare(app);app.api.showStabilizers();assert.equal(app.api.useStabilizer(), false, name);
    assert.equal(app.api.progress.stabilizers, 1, name);assert.equal(app.api.state.stabilizerActive, false, name);assert.equal(app.snapshot().stabilizers, 1, name);
  }
  const empty = await appHarness();empty.api.showStabilizers();assert.equal(empty.api.useStabilizer(), false);
  assert.equal(empty.api.progress.stabilizers, 0);assert.equal(empty.api.state.stabilizerActive, false);
});

test('failed stabilizer saves roll back both purchases and consumption so retry charges exactly once', async () => {
  for (const credits of [2, 7]) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, clayCredits: credits, stabilizers: 1, coins: 400, sound: false });
    const coinsAfter = credits >= 5 ? 400 : 300, creditsAfter = credits >= 5 ? credits - 5 : credits;
    const write = app.store.set.bind(app.store);let fail = true;
    app.store.set = (key, value) => { if (fail && key === SAVE_KEY) throw new Error('storage unavailable');return write(key, value); };
    app.api.showStabilizers();assert.equal(app.api.buyStabilizer(), false);
    assert.equal(app.api.progress.clayCredits, credits);assert.equal(app.api.progress.stabilizers, 1);assert.equal(app.api.progress.coins, 400);
    assert.equal(app.snapshot().clayCredits, credits);assert.equal(app.snapshot().stabilizers, 1);assert.equal(app.snapshot().coins, 400);
    fail = false;app.api.showStabilizers();assert.equal(app.api.buyStabilizer(), true);
    assert.equal(app.api.progress.clayCredits, creditsAfter);assert.equal(app.api.progress.stabilizers, 2);assert.equal(app.api.progress.coins, coinsAfter);
    assert.equal(app.snapshot().clayCredits, creditsAfter);assert.equal(app.snapshot().stabilizers, 2);assert.equal(app.snapshot().coins, coinsAfter);
    fail = true;app.api.showStabilizers();assert.equal(app.api.useStabilizer(), false);
    assert.equal(app.api.progress.stabilizers, 2);assert.equal(app.api.state.stabilizerActive, false);assert.equal(app.snapshot().stabilizers, 2);
    fail = false;app.api.showStabilizers();assert.equal(app.api.useStabilizer(), true);
    assert.equal(app.api.progress.stabilizers, 1);assert.equal(app.api.state.stabilizerActive, true);
    assert.equal(app.snapshot().stabilizers, 1);assert.equal(app.snapshot().clayCredits, creditsAfter);assert.equal(app.api.progress.coins, coinsAfter);
    const reloaded = await appHarness(app.snapshot());
    assert.equal(reloaded.api.progress.stabilizers, 1);assert.equal(reloaded.api.progress.clayCredits, creditsAfter);assert.equal(reloaded.api.state.stabilizerActive, false);
    assert.equal(reloaded.api.progress.coins, coinsAfter);
  }
});

test('all three main guns follow real-time trajectories and hit near and distant targets without ammo RPCs', async () => {
  for (const gunId of [20, 21, 22]) for (const distance of [10, 50, 150]) {
    const template = STAGE_FIXTURES.find(stage => stage.kind === 'target' && stage.distance === distance && !stage.motion.speed && !stage.obstacles.length);
    const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG, ownedBows: [0, gunId], bow: gunId,
      lastStage: template.id, ownedArrows: [0, 13, 18], arrow: 13, sound: false}), {remaining: 0, hold: ['spend']});
    assert.equal(app.api.activeBow().id, gunId);assert.equal(app.api.activeBullet().id, 0);
    const {state} = app.api, draw = preciseMainDraw(app), planned = app.engine.predictTrajectory(app.api.shotParams(), state.stage, state.time).result;
    assert.equal(planned.type, 'hit');assert.equal(planned.score, 10);
    draw.pad.emit('pointerup', draw.coords);const shot = state.shot, firedAt = app.now;
    assert.equal(state.mode, 'flight');assert.equal(shot.projectileType, 'bullet');assert.equal(shot.elapsed, 0);
    assert.equal(shot.speed, app.engine.MAX_MAIN_PROJECTILE_SPEED * 2);assert.equal(shot.gravityScale, 2);
    assert.equal(state.used, 1);assert.equal(state.magazine, 9);assert.equal(shot.ability, null);
    app.until(() => state.mode === 'settling', Math.ceil(planned.flightTime * 60) + 2);
    assert.equal(shot.result.type, 'hit');assert.equal(shot.result.targetCenter.kind, 'target');assert.equal(shot.result.score, 10);
    assert.ok(Math.abs(shot.elapsed - planned.flightTime) < 1e-8);
    assert.ok(Math.abs((app.now - firedAt) / 1000 - shot.elapsed) < 1 / 60 + 1e-9, 'the bullet uses real scene time');
    assert.equal(state.score, 10);assert.equal(state.cinematic?.kind, 'bullet');assert.equal(state.targetMarks[0].projectileType, 'bullet');
    assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
    draw.pad.emit('pointerup', draw.coords);await app.flush();assert.equal(state.used, 1);assert.equal(state.magazine, 9);
    app.until(() => state.mode === 'ready');assert.equal(state.score, 10);assert.equal(app.api.progress.shots, 1);
  }
});

test('a new gun round prepares for one second then provides exactly ten shots with no mid-round reload', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], bow: 20, sound: false}, {remaining: 0});
  const {state} = app.api, gun = app.api.activeBow(), pad = app.getElement('aimTouchpad'), reload = app.getElement('gunReload');
  assert.equal(gun.magazineSize, 10);assert.equal(gun.reloadSeconds, 1);
  assert.equal(state.magazine, 0);assert.equal(state.reloadRemaining, 1);assert.equal(reload.classList.contains('hidden'), false);
  assert.equal(reload.classList.contains('reloading'), true);assert.equal(app.getElement('gunReloadProgress').getAttribute('aria-valuenow'), '0');
  pad.emit('pointerdown');pad.emit('pointerup');assert.equal(state.used, 0);assert.equal(state.shot, null);
  app.frames(30);assert.ok(Math.abs(state.reloadRemaining - .5) < 1e-9);assert.equal(state.magazine, 0);
  assertCoachCue(app, false);assert.equal(state.coachLastCheck, -Infinity);assert.equal(state.coachReady, false);
  const frozen = {time: state.time, reload: state.reloadRemaining};
  app.getElement('menuBtn').emit('click');app.advanceTo(app.now + 5000);
  assert.deepEqual({time: state.time, reload: state.reloadRemaining}, frozen, 'a modal pauses the preparation clock');
  app.api.closeModal();await app.flush();
  app.frames(29);assert.ok(state.reloadRemaining > 0);assert.equal(state.magazine, 0);
  pad.emit('pointerdown');pad.emit('pointerup');assert.equal(state.used, 0);
  assertCoachCue(app, false);assert.equal(state.coachLastCheck, -Infinity);
  const elapsedBefore = state.time;app.until(() => state.reloadRemaining === 0, 3);
  assert.ok(state.time - elapsedBefore <= 2 / 60 + 1e-9);assert.equal(state.magazine, 10);
  assert.equal(reload.classList.contains('reloading'), false);assert.equal(app.getElement('gunReloadProgress').getAttribute('aria-valuenow'), '100');
  assert.equal(app.getElement('shotCountLabel').textContent, '10발 남음');
  await preciseMainShot(app);assert.equal(state.magazine, 9);assert.equal(state.reloadRemaining, 0);
  app.getElement('menuBtn').emit('click');modalAction(app, 'retry');await app.flush();
  assert.equal(state.used, 0);assert.equal(state.magazine, 0);assert.equal(state.reloadRemaining, 1);
  app.until(() => state.reloadRemaining === 0);assert.equal(state.magazine, 10);
  assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
});

test('round length follows the first weapon family and prevents extra gun or crossbow turns through equipment changes', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
    ownedBows: [0, 13, 19, 20, 21, 22], ownedBullets: [0, 3], bow: 0, coins: 100000, sound: false}, {remaining: 0});
  const {state} = app.api;
  assert.equal(app.getElement('shotCountLabel').textContent, '5발 남음');
  await equipMainGun(app);assert.equal(app.getElement('shotCountLabel').textContent, '10발 남음');
  app.api.showShop('bow');assert.equal(app.api.installLaser(19), true);
  assert.equal(app.api.activeBow().id, 19);assert.equal(state.roundShotLimit, 5);
  const afterLaserPurchase = app.api.progress.coins;
  assert.equal(afterLaserPurchase, 100000 - app.laser.LASER_PRICE);
  app.api.showShop('bow');app.api.equipItem(0);app.api.closeModal();await app.flush();
  assert.equal(app.getElement('shotCountLabel').textContent, '5발 남음');
  await centeredShot(app);assert.equal(state.used, 1);
  app.api.showShop('bow');for (const gunId of [20, 21, 22]) app.api.equipItem(gunId);
  assert.equal(app.api.activeBow().id, 0);assert.equal(state.used, 1);assert.equal(app.api.progress.coins, afterLaserPurchase + 10);
  app.api.equipItem(19);assert.equal(app.api.activeBow().id, 19, 'bows and crossbows share the five-turn family');
  app.api.closeModal();await app.flush();assert.match(app.getElement('shotCountLabel').textContent, /^4회 남음/);
  app.api.resetRound();await app.flush();await equipMainGun(app);
  const first = preciseMainDraw(app);first.pad.emit('pointerup', first.coords);
  assert.equal(state.mode, 'flight');const bullet = state.shot;
  for (let i = 0; i < 3; i++) {first.pad.emit('pointerdown');first.pad.emit('pointerup');first.pad.emit('lostpointercapture');}
  assert.equal(state.used, 1);assert.equal(state.magazine, 9);assert.equal(state.shot, bullet);
  app.until(() => state.mode === 'ready');
  app.api.showShop('bow');app.api.equipItem(19);app.api.equipItem(0);
  assert.equal(app.api.activeBow().id, 20);assert.equal(state.used, 1);assert.equal(state.magazine, 9);
  for (const gunId of [21, 22]) {
    app.api.equipItem(gunId);assert.equal(app.api.activeBow().id, gunId);
    assert.equal(state.roundShotLimit, 10);assert.equal(state.used, 1);assert.equal(state.magazine, 9);
    assert.equal(state.reloadRemaining, 0, 'switching between guns does not restart preparation or refill shots');
  }
  app.api.showShop('bullet');app.api.equipItem(3);
  assert.equal(app.api.activeBow().id, 22);assert.equal(app.api.activeBullet().id, 3);
  assert.equal(state.used, 1);assert.equal(state.magazine, 9);app.api.showShop('bow');
  const lockedCoins = app.api.progress.coins, lockedSave = app.snapshot();
  for (const id of [13, 19]) assert.equal(app.api.installLaser(id), false);
  const laserButton = app.getElement('locked-laser-install');laserButton.tagName = 'BUTTON';laserButton.dataset.installLaser = '13';
  app.document.emit('click', {target: laserButton});
  assert.equal(app.api.activeBow().id, 22);assert.equal(state.roundShotLimit, 10);
  assert.equal(app.api.progress.coins, lockedCoins);assert.deepEqual(app.snapshot(), lockedSave);
  assert.equal(app.api.activeLaser(13), null, 'a laser purchase cannot bypass the in-progress gun round');
  app.api.closeModal();await app.flush();
  for (let turn = 2; turn <= 10; turn++) await preciseMainShot(app);
  assert.equal(state.mode, 'finished');assert.equal(state.used, 10);assert.equal(state.score, 100);
  const result = JSON.stringify(state.resultSummary);
  modalAction(app, 'result-shop');app.api.equipItem(19);app.api.closeModal();await app.flush();
  assert.equal(app.api.activeBow().id, 19);assert.equal(JSON.stringify(state.resultSummary), result, 'shopping after completion does not rewrite the completed ten-shot result');
  modalAction(app, 'retry');await app.flush();assert.match(app.getElement('shotCountLabel').textContent, /^5회 남음/);
  assert.equal(state.used, 0);assert.equal(app.ammo.requests.filter(request => ['spend', 'buy'].includes(request.action)).length, 0);
});

test('rejected and unknown main-round saves never advance cadence or duplicate a milestone before confirmation', async () => {
  for (const unknown of [false, true]) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, mainRounds: 4, sound: false }, { hold: ['round-complete'] });
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
    assert.equal(!!app.api.state.isEvent, false);assert.equal(app.api.state.mode, 'finished');assert.equal(app.api.progress.lastStage, 1);
    assert.doesNotMatch(app.getElement('modalContent').innerHTML, /continue-event|접시 사격/);
    assert.equal(app.api.progress.coins, 25, 'retrying the confirmed main-round receipt cannot award the game bonus again');
  }
});

test('an unknown round registration can be retried before completing that same saved main round', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, mainRounds: 4, sound: false }, { hold: ['round-start'] });
  const start = app.ammo.requests.find(request => request.action === 'round-start');assert.ok(start);
  app.api.state.score = 50;app.api.state.used = 5;app.api.finishRound();await app.flush();
  app.ammo.execute(start);app.ammo.reply(start, { ok: false, reason: 'pending' });await app.flush();
  assert.equal(app.api.progress.mainRounds, 4);assert.ok(app.api.state.awaitingRoundSave);
  app.ammo.held.delete('round-start');await app.api.retryAmmo();await app.flush();
  const starts = app.ammo.requests.filter(request => request.action === 'round-start');
  assert.equal(starts.length, 2);assert.equal(starts[0].requestId, starts[1].requestId);
  assert.equal(app.ammo.requests.filter(request => request.action === 'round-complete').length, 1);
  assert.equal(app.api.progress.mainRounds, 5);assert.equal(app.api.progress.coins, 25);assert.equal(!!app.api.state.isEvent, false);assert.equal(app.api.state.mode, 'finished');
});

test('connected main play waits for its authoritative server run before firing', async () => {
  const waiting = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, sound: false }, { hold: ['round-start'] });
  const pad = waiting.getElement('aimTouchpad');pad.emit('pointerdown');waiting.frames(12);pad.emit('pointerup');await waiting.flush();
  assert.equal(waiting.api.state.mode, 'ready');assert.equal(waiting.api.state.used, 0);assert.equal(waiting.api.state.shot, null);
  const registration = waiting.ammo.requests.find(request => request.action === 'round-start');waiting.ammo.reply(registration);await waiting.flush();
  assert.ok(waiting.api.state.serverRunId);
  const draw = startCenteredDraw(waiting);draw.pad.emit('pointerup', draw.coords);
  assert.equal(waiting.api.state.mode, 'flight');assert.equal(waiting.api.state.used, 1);

});

test('guest main completion reports once before replay and leaves the finished result available', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, sound: false }, { guest: true });
  app.frames(30);assert.equal(app.api.ammo.connection, 'unavailable');assert.equal(app.finishedRounds.length, 0,
    'entry, guidance and target previews are not finished rounds');
  const { state } = app.api, runId = state.runId;
  state.score = 0;state.used = 5;app.api.finishRound();app.api.finishRound();await app.flush();
  assert.equal(state.mode, 'finished');assert.equal(state.modal, 'result');assert.equal(app.finishedRounds.length, 1);
  assert.deepEqual(app.finishedRounds[0], { source: 'ojjuda-archery-game', type: 'round-finished', kind: 'main', owner: null,
    sessionId: '22222222-2222-4222-8222-222222222222', runId, stage: 1 });
  assert.equal(app.ammo.requests.length, 0, 'guest completion cannot submit a paid or server reward request');
  const completedEpoch = state.roundEpoch;
  app.window.OjjudaGameResults = { canPlay: () => false };
  modalAction(app, 'retry');modalAction(app, 'previous-stage');modalAction(app, 'next-stage');
  app.api.startStage(2);staleModalAction(app, 'enter-event');
  assert.equal(state.roundEpoch, completedEpoch);assert.equal(state.modal, 'result');assert.equal(state.isEvent, false);
  assert.equal(app.finishedRounds.length, 1, 'blocked replay keeps the current popup and does not consume again');
});

test('ten-shot gun completion and result redraws report the ordinary round exactly once', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 20], bow: 20, sound: false}, {guest: true, remaining: 0});
  app.frames(30);await app.flush();
  for (let shot = 0; shot < 10; shot++) await preciseMainShot(app);
  assert.equal(app.finishedRounds.length, 1);assert.equal(app.finishedRounds[0].kind, 'main');assert.equal(app.finishedRounds[0].stage, 1);
  app.api.finishRound();app.api.closeModal();assert.equal(app.finishedRounds.length, 1);
  modalAction(app, 'result-shop');app.api.closeModal();assert.equal(app.finishedRounds.length, 1);
  assert.deepEqual(app.ammo.requests, []);assert.equal(app.api.state.mode, 'finished');
  assert.equal(app.api.state.magazine, 0);assert.equal(app.api.progress.best[1], 100);
});

test('a late completion retains its original account and iframe session identity', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, sound: false }, { guest: true });
  app.window.emit('message', { source: app.window.parent, origin: app.window.location.origin,
    data: { source: 'ojjuda-archery-world', type: 'init', launchEpoch: 5, owner: 'another-owner', sessionId: '33333333-3333-4333-8333-333333333333', available: false } });
  app.api.state.used = 5;app.api.finishRound();await app.flush();
  assert.equal(app.finishedRounds.length, 1);assert.equal(app.finishedRounds[0].owner, null);
  assert.equal(app.finishedRounds[0].sessionId, '22222222-2222-4222-8222-222222222222',
    'the parent can reject an old account/session without attributing its result to the new owner');
});

test('five and ten completed main rounds continue normally without introducing a plate game', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, sound: false});
  for (let round = 1; round <= 10; round++) {
    const {state} = app.api;state.score = round % 5 === 0 ? 50 : 0;state.used = 5;state.hits = state.score / 10;
    app.api.finishRound();await app.flush();
    assert.equal(app.api.progress.mainRounds, round);assert.equal(!!state.isEvent, false);assert.equal(state.mode, 'finished');
    assert.equal(state.modal, 'result');assert.equal(state.stage.kind, 'target');
    assert.doesNotMatch(app.getElement('modalContent').innerHTML, /continue-event|접시|UFO/);
    assert.doesNotMatch(app.getElement('journeyCaption').textContent, /이벤트/);
    assert.equal(app.ammo.requests.filter(request => request.action === 'round-complete').length, round);
    if (round < 10) {modalAction(app, round === 5 ? 'next-stage' : 'retry');await app.flush();}
  }
  assert.equal(app.api.state.stage.id, 2);assert.equal(app.api.progress.unlocked, 3);
  const resumed = await appHarness(app.snapshot(), {server: app.ammo});
  assert.equal(resumed.api.progress.mainRounds, 10);assert.equal(resumed.api.state.stage.id, 2);
  assert.equal(!!resumed.api.state.isEvent, false);assert.equal(resumed.api.state.mode, 'ready');
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
  assert.ok(Math.abs(app.api.state.shot.elapsed - 0.1) < 1e-12, 'the first auto-shot frame advances at real-time speed');
  assert.ok(Math.abs(app.api.state.time - sceneAtRelease - 0.1) < 1e-12, 'moving scenery shares the first real-time frame');
  pad.emit('pointerup');await app.flush();
  assert.equal(app.api.state.used, 1);
});

test('a fresh random steady window settles gradually, stays still for exactly 0.5 seconds and then resumes immediately', async () => {
  const app = await appHarness(), pad = app.getElement('aimTouchpad');
  let sequence = [0.5, 0.4];app.setRandom(() => sequence.length ? sequence.shift() : 0.9);
  pad.emit('pointerdown');
  assert.equal(app.api.state.steadyStart, 4.4);
  const start = app.api.state.steadyStart * 1000, end = start + 500;
  app.advanceTo(start - 1);
  assert.equal(app.api.isSteady(), false);
  const approaching = Math.hypot(app.api.effectiveSway().x, app.api.effectiveSway().y);
  assert.ok(approaching > 0 && approaching < Math.hypot(app.api.state.sway.x, app.api.state.sway.y) * .68 * 1e-4,
    'one millisecond before stillness the sway has already eased almost completely away');
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
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, id], ownedArrows: [0], bow: id, sound: false });
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
    const approaching = Math.hypot(app.api.effectiveSway().x, app.api.effectiveSway().y);
    assert.ok(approaching > 0 && approaching < Math.hypot(app.api.state.sway.x, app.api.state.sway.y) * .68 * 1e-4,
      'longer equipment-specific windows have the same gradual approach before their full duration begins');
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
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 0, ownedBows: [0, 19], ownedArrows: [0], bow: 19, sound: false });
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

test('every stage shares real-time arrow, target and scenery time from the first flight frame', async () => {
  const first = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 1, sound: false }));
  for (const stage of first.engine.DISTANCE_STAGES) {
    // Each fixture starts independently; real navigation now waits for a shot to land.
    const app = stage.id === 1 ? first : await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: stage.id, sound: false }));
    app.until(() => app.api.state.mode === 'ready');
    const pad = app.getElement('aimTouchpad');
    pad.emit('pointerdown');app.frames(78);pad.emit('pointerup');await app.flush();
    const before = app.api.state.time, realStart = app.now;
    app.advanceTo(realStart + 100);
    assert.equal(app.api.state.mode, 'flight', `stage ${stage.id} must still be in flight`);
    assert.ok(Math.abs(app.api.state.shot.elapsed - .1) < 1e-10, `stage ${stage.id} arrow speed`);
    assert.ok(Math.abs(app.api.state.time - before - .1) < 1e-10, `stage ${stage.id} scene speed`);
    assert.ok(Math.abs(app.sceneryFrame.time - before - .1) < 1e-10, `stage ${stage.id} leaves receive the same clock`);
    assert.equal(app.getElement('flightBadge').classList.contains('hidden'), false, 'early stages also show the full-screen flight state');
    const movingTarget = app.api.sceneItems(app.engine.targetAt(stage, app.api.state.time)).find(item => item.kind === 'target').target;
    const expected = app.engine.targetAt(stage, before + .1);
    assert.ok(Math.abs(movingTarget.x - expected.x) < 1e-10);
    assert.ok(Math.abs(movingTarget.y - expected.y) < 1e-10);
  }
});

for (const bow of [0, 19]) test(`live ${bow === 0 ? 'single-arrow' : 'three-arrow'} flight keeps the moving target and painted scene on real time`, async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100,
    ownedBows: [...new Set([0, bow])], bow, lastStage: lessonStageId('tracking-intro', 10), sound: false }));
  const { state } = app.api, { pad, coords } = preciseMainDraw(app);
  const sceneAtRelease = state.time, releasedAt = app.now;
  const targetAtRelease = app.engine.targetAt(state.stage, sceneAtRelease);
  pad.emit('pointerup', coords);await app.flush();
  const shots = Array.from(state.volley?.shots || [state.shot]);
  assert.equal(shots.length, bow === 0 ? 1 : 3);
  assert.doesNotMatch(app.getElement('flightBadge').textContent, /슬로모션/);
  let frames = 0, moved = false;
  while (state.mode === 'flight' && frames < 90) {
    const frameMs = [17, 31, 13, 23][frames % 4], before = state.time, firstArc = app.canvasArcs.length;
    app.advanceTo(app.now + frameMs);frames++;
    const delta = state.time - before;
    assert.ok(delta > 0 && delta <= frameMs / 1000 + 1e-10, 'the final collision frame consumes only the time before impact');
    if (state.mode !== 'flight') break;
    assert.ok(Math.abs(delta - frameMs / 1000) < 1e-10, 'a live frame never slows or freezes the scene clock');
    assert.ok(Math.abs(state.time - sceneAtRelease - (app.now - releasedAt) / 1000) < 1e-10);
    assert.equal(app.sceneryFrame.time, state.time);
    for (const shot of shots.filter(candidate => candidate.active)) {
      const elapsed = Math.max(0, state.time - sceneAtRelease - (shot.launchDelay || 0));
      assert.ok(Math.abs(shot.elapsed - elapsed) < 1e-10, 'each delayed arrow advances on the same clock as its target');
    }
    const target = app.engine.targetAt(state.stage, state.time), painted = app.api.project(target);
    const arcs = app.canvasArcs.slice(firstArc), radius = target.radius * painted.scale * 1.055;
    assert.ok(arcs.some(arc => Math.abs(arc.x - painted.x) < 1e-9 && Math.abs(arc.y - painted.y) < 1e-9 && Math.abs(arc.radius - radius) < 1e-9),
      'the actual canvas target rim is drawn at its current world position');
    const distance = Math.hypot(target.x - targetAtRelease.x, target.y - targetAtRelease.y);
    if (distance > .01) {
      moved = true;
      const old = app.api.project(targetAtRelease);
      assert.ok(Math.hypot(painted.x - old.x, painted.y - old.y) > .01, 'the drawing does not retain the release-position snapshot');
    }
  }
  assert.equal(state.mode, 'settling');assert.ok(moved);assert.ok(frames > 2);
  const finalElapsed = Math.max(...shots.map(shot => (shot.launchDelay || 0) + shot.elapsed));
  assert.ok(Math.abs(state.time - sceneAtRelease - finalElapsed) < 1e-9, 'the last impact, including burst delays, fixes the exact completed scene time');
  assert.equal(shots[0].result.type, 'hit');assert.equal(shots[0].result.score, 10);
  for (const shot of shots.filter(candidate => candidate.result.type === 'hit')) {
    const impactTime = sceneAtRelease + (shot.launchDelay || 0) + shot.result.flightTime;
    const current = app.engine.targetAt(state.stage, impactTime), actual = shot.result.targetCenter;
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(actual[axis] - current[axis]) < 1e-9, 'collision uses the current target at exact arrival');
  }
  assert.ok(Math.hypot(shots[0].result.targetCenter.x - targetAtRelease.x, shots[0].result.targetCenter.y - targetAtRelease.y) > .01);
  const worldTime = state.time, accounting = shotAccounting(app), replay = state.cinematic;
  const physics = JSON.stringify(shots.map(shot => shot.result));
  assert.ok(replay, 'a resolved ten-point hit still starts its separate replay');
  app.frames(12);
  assert.equal(app.api.cinematicFrame().phase, 'flight');assert.equal(state.time, worldTime);
  app.until(() => app.api.cinematicFrame()?.phase === 'impact', 30);
  assert.equal(app.api.renderTime(), replay.impactTime);
  assert.equal(JSON.stringify(shots.map(shot => shot.result)), physics);
  assert.deepEqual(shotAccounting(app), accounting);
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

// Independent slab intersection: a point being on-screen does not establish
// that a solid wall is absent between the camera and the displayed shaft.
function sightlineCrossesWall(camera, point, wall) {
  let near = 0, far = 1;
  const bounds = [
    ['x', wall.x - wall.width / 2, wall.x + wall.width / 2],
    ['y', wall.y || 0, (wall.y || 0) + wall.height],
    ['z', wall.z - wall.depth / 2, wall.z + wall.depth / 2]
  ];
  for (const [axis, low, high] of bounds) {
    const delta = point[axis] - camera[axis];
    if (Math.abs(delta) < 1e-12) {
      if (camera[axis] < low || camera[axis] > high) return false;
    } else {
      const first = (low - camera[axis]) / delta, last = (high - camera[axis]) / delta;
      near = Math.max(near, Math.min(first, last));far = Math.min(far, Math.max(first, last));
      if (near > far) return false;
    }
  }
  return far >= 0 && near <= 1;
}

function assertClearDisplayedArrow(app) {
  const { state } = app.api, replay = app.api.cinematicFrame(), shot = state.shot;
  const time = app.api.renderTime(), target = app.engine.targetAt(state.stage, time, shot.attachment?.passId);
  const expected = replay?.phase === 'flight' ? replay.point : shot.attachment
    ? { x: target.x + shot.attachment.x, y: target.y + shot.attachment.y, z: target.z - .002 }
    : shot.position;
  const tip = app.api.sceneItems(target).find(item => item.kind === 'tip' &&
    Math.hypot(item.point.x - expected.x, item.point.y - expected.y, item.point.z - expected.z) < 1e-8);
  assert.ok(tip?.tail, 'the followed arrow is actually rendered with its shaft');
  assert.ok(Object.values(app.api.camera).every(Number.isFinite));
  for (const [name, point] of [['tip', tip.point], ['tail', tip.tail]]) {
    const screen = app.api.project(point), { width, height } = app.viewport;
    assert.equal(screen.visible, true, `stage ${state.stage.id} ${name} stays in front of the near plane`);
    assert.ok(screen.x >= 0 && screen.x <= width && screen.y >= 0 && screen.y <= height,
      `stage ${state.stage.id} ${name} (${screen.x}, ${screen.y}) fits ${width}×${height}`);
    for (const wall of state.stage.obstacles) assert.equal(sightlineCrossesWall(app.api.camera, point, wall), false,
      `stage ${state.stage.id} ${replay?.phase || state.mode} ${name} is hidden by the wall at ${wall.z}m`);
  }
  return tip;
}

function assertClearDisplayedBullet(app) {
  const {state} = app.api, replay = app.api.cinematicFrame(), shot = state.shot;
  const target = app.engine.targetAt(state.stage, app.api.renderTime(), shot.attachment?.passId);
  const expected = replay?.phase === 'flight' ? replay.point : shot.attachment
    ? {x: target.x + shot.attachment.x, y: target.y + shot.attachment.y, z: target.z - .002} : shot.position;
  const item = app.api.sceneItems(target).find(entry => entry.kind === 'bullet' &&
    Math.hypot(entry.point.x - expected.x, entry.point.y - expected.y, entry.point.z - expected.z) < 1e-8);
  assert.ok(item, 'the real bullet or its target-local hole is part of the rendered scene');
  const points = [['contact', item.point]];
  if (item.flying) {
    const velocity = item.velocity, speed = Math.hypot(velocity.x, velocity.y, velocity.z), length = shot.shaftLength;
    points.push(['bullet base', Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, item.point[axis] - velocity[axis] / speed * length]))]);
  }
  assert.ok(Object.values(app.api.camera).every(Number.isFinite));
  for (const [name, point] of points) {
    const screen = app.api.project(point), {width, height} = app.viewport;
    assert.equal(screen.visible, true, `stage ${state.stage.id} ${name} is ahead of the near plane`);
    assert.ok(screen.x >= 0 && screen.x <= width && screen.y >= 0 && screen.y <= height,
      `stage ${state.stage.id} ${name} (${screen.x}, ${screen.y}) fits ${width}×${height}`);
    for (const wall of state.stage.obstacles) assert.equal(sightlineCrossesWall(app.api.camera, point, wall), false,
      `stage ${state.stage.id} ${replay?.phase || state.mode} ${name} is hidden behind the wall at ${wall.z}m`);
  }
  return points.map(([, point]) => point);
}

for (const fixture of [
  {lessonKey: 'fixed-gap-1/3', distance: 20, bullet: 0},
  {lessonKey: 'pillars-regular', distance: 20, bullet: 1},
  {lessonKey: 'low-wall-arc', distance: 10, bullet: 3}
]) test(`bullet bullseye on ${fixture.lessonKey} keeps the short projectile and actual impact clear of cover and restores aim`, async () => {
  const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: FIREARM_CATALOG,
    ownedBows: [0, 22], bow: 22, ownedBullets: [0, fixture.bullet], bullet: fixture.bullet, coins: 100,
    scopeLoadouts: {22: {owned: [3], equipped: 3}}, lastStage: lessonStageId(fixture.lessonKey, fixture.distance), sound: false}));
  const {state} = app.api, draw = preciseMainDraw(app);
  // For moving pillars, wait while holding and follow the real target until
  // its centre reaches a physical opening. Walls and target are never moved.
  const clearBullseye = () => {
    const shot = app.engine.launchArrow(app.api.shotParams());
    app.engine.stepArrow(shot, 16, state.stage, state.time);
    return shot.result?.score === 10 && shot.penetrations.length === 0;
  };
  for (let attempt = 0; attempt < 40 && !clearBullseye(); attempt++) {
    holdFor(app, 50);
    const aim = targetIntercept(app.engine, app.api.shotParams(), state.stage, state.time);
    draw.coords = moveHeldAim(app, aim.yaw, aim.pitch);
  }
  assert.equal(clearBullseye(), true, 'the fixture uses a real ten-point opening without entering a wall');
  const originalCamera = {...app.api.camera}, originalAim = {...state.aim}, originalPan = [state.panX, state.panY];
  const walls = JSON.stringify(state.stage.obstacles);assert.ok(state.stage.obstacles.length > 0);
  draw.pad.emit('pointerup', draw.coords);await app.flush();
  let liveFrames = 0;
  while (state.mode === 'flight') {
    if (state.shot.position.z > .8) {assertClearDisplayedBullet(app);liveFrames++;}
    app.advanceTo(app.now + 1000 / 240);
  }
  assert.ok(liveFrames > 0);assert.equal(state.mode, 'settling');assert.equal(state.shot.result.score, 10);
  assert.equal(state.cinematic?.kind, 'bullet');const shot = state.shot, replay = state.cinematic, accounting = shotAccounting(app);
  const physics = JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result, frames: shot.replayFrames});
  const phases = new Set();let frames = 0;
  while (state.mode === 'settling' && app.api.cinematicFrame()?.phase !== 'return') {
    phases.add(app.api.cinematicFrame().phase);assertClearDisplayedBullet(app);
    if ([10, 30, 55].includes(frames)) {
      for (const [width, height] of [[390, 640], [844, 290], [1000, 600]]) {app.resize(width, height);assertClearDisplayedBullet(app);}
    }
    assert.equal(JSON.stringify({position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result, frames: shot.replayFrames}), physics);
    assert.deepEqual(shotAccounting(app), accounting);app.frames();frames++;
  }
  assert.ok(frames > 70);assert.deepEqual([...phases], ['flight', 'impact']);
  assert.ok(app.bulletFlightFrames.length > 0 && app.bulletImpactFrames.length > 0);
  assert.equal(app.bullseyeFrames.length, 0);assert.equal(state.cinematic, replay);app.api.onImpact();
  app.until(() => state.mode === 'ready');
  assert.equal(state.targetMarks.length, 1);assert.equal(state.magazine, 9);assert.deepEqual(shotAccounting(app), accounting);
  assert.deepEqual({...app.api.camera}, originalCamera);assert.deepEqual({...state.aim}, originalAim);
  assert.deepEqual([state.panX, state.panY], originalPan);assert.equal(state.zoom, 3);assert.equal(JSON.stringify(state.stage.obstacles), walls);
});

function inspectFinalApproach(app, baseCamera) {
  const { state } = app.api;
  let checked = 0, formerlyBlocked = 0;
  for (let frame = 0; frame < 1500 && state.mode === 'flight'; frame++) {
    if (state.shot.position.z >= state.stage.distance - 4) {
      const tip = assertClearDisplayedArrow(app), { width: w, height: h } = app.viewport;
      const oldView = app.view.desiredFollowCamera(state.shot.position, baseCamera, { w, h });
      if ([tip.point, tip.tail].some(point => state.stage.obstacles.some(wall => sightlineCrossesWall(oldView, point, wall)))) formerlyBlocked++;
      checked++;
    }
    app.frames();
  }
  assert.equal(state.mode, 'settling');assert.ok(checked > 0, 'the real final four metres were inspected');
  return formerlyBlocked;
}

for (const fixture of [
  { lessonKey: 'fixed-gap-3/4', distance: 30, bow: 6, arrow: 5 },
  { lessonKey: 'fixed-gap-1/2', distance: 10, bow: 6, arrow: 5, resize: true },
  { lessonKey: 'fixed-gap-1/2', distance: 30, bow: 6, arrow: 5 },
  { lessonKey: 'fixed-gap-1/3', distance: 10, bow: 6, arrow: 5, offset: { x: -.1, y: .3 }, resize: true },
  { lessonKey: 'moving-half-gap', distance: 20, bow: 8, arrow: 2, time: 3.2, resize: true },
  // The narrow real face requires placing the whole spread inside the gap.
  { lessonKey: 'fixed-gap-1/2', distance: 30, bow: 19, arrow: 2, offset: { x: -.19, y: -.14 } }
]) test(`a real eight-point ${fixture.bow === 19 ? 'burst' : 'hit'} on ${fixture.lessonKey} at ${fixture.distance}m stays visible through approach and impact without changing its award`, async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100,
    lastStage: lessonStageId(fixture.lessonKey, fixture.distance),
    ownedBows: [0, fixture.bow], bow: fixture.bow, scopeLoadouts: { [fixture.bow]: { owned: [2], equipped: 2 } },
    ownedArrows: [0, fixture.arrow], arrow: fixture.arrow, sound: false }));
  const { state } = app.api;
  app.api.setAimZoom(1);
  app.until(() => state.mode === 'ready');
  if (fixture.time !== undefined) state.time = fixture.time;
  app.getElement('zoomBtn').emit('click');assert.equal(state.zoom, 2);
  const walls = JSON.stringify(state.stage.obstacles), { pad, coords } = preciseMainDraw(app, fixture.offset || { x: -.3, y: 0 });
  const originalCamera = { ...app.api.camera }, originalAim = { ...state.aim }, originalPan = [state.panX, state.panY];
  pad.emit('pointerup', coords);await app.flush();
  const formerlyBlocked = inspectFinalApproach(app, originalCamera), shot = state.shot;
  assert.equal(shot.result.type, 'hit');assert.equal(shot.result.score, 8);assert.equal(state.cinematic, null);
  assert.ok(formerlyBlocked > 0, 'the fixture genuinely exposes the old wall-obstructed follow view');
  const arrows = state.volley?.shots || [shot], count = fixture.bow === 19 ? 3 : 1;
  assert.equal(arrows.length, count);assert.ok(arrows.every(arrow => arrow.result.type === 'hit' && arrow.result.score === 8));
  assert.equal(state.targetMarks.length, count);
  const accounting = shotAccounting(app), physics = arrows.map(arrow => JSON.stringify({ velocity: arrow.velocity, elapsed: arrow.elapsed, result: arrow.result }));
  const marks = JSON.stringify(state.targetMarks), firstTarget = app.engine.targetAt(state.stage, state.time);
  assert.deepEqual(accounting, [1, 8 * count, 1, 1, 1, 100 + count * app.engine.getScoreCoinReward(8, state.stage.id), 10000]);
  let heldFrames = 0;
  while (state.mode === 'settling' && state.settle <= app.view.IMPACT_HOLD) {
    assertClearDisplayedArrow(app);
    if (fixture.resize && heldFrames === 4) {
      const beforeResize = JSON.stringify({ position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result });
      for (const [width, height] of [[390, 640], [844, 290], [1000, 600]]) {
        app.resize(width, height);assertClearDisplayedArrow(app);
        assert.equal(JSON.stringify({ position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result }), beforeResize,
          'resizing and camera clearance never move the resolved arrow');
      }
    }
    app.frames();heldFrames++;
  }
  assert.ok(heldFrames >= 30, 'the whole ordinary impact hold remains visible');
  assert.equal(JSON.stringify(state.targetMarks), marks);
  for (const [index, arrow] of arrows.entries()) assert.equal(JSON.stringify({ velocity: arrow.velocity, elapsed: arrow.elapsed, result: arrow.result }), physics[index]);
  assertAttachedArrows(app, arrows.map(arrow => ({ x: arrow.attachment.x, y: arrow.attachment.y })), arrows.map(arrow => arrow.velocity));
  if (fixture.lessonKey === 'moving-half-gap') {
    const movedTarget = app.engine.targetAt(state.stage, state.time);
    assert.ok(Math.abs(movedTarget.x - firstTarget.x) > 1e-4, 'the obscured target actually moved during the hold');
    assert.ok(Math.abs(shot.position.x - movedTarget.x - shot.attachment.x) < 1e-9);
  }
  if (fixture.resize) {
    assert.equal(app.getElement('gameCanvas').dataset.camera, 'return');
    const beforeResize = JSON.stringify({ position: shot.position, elapsed: shot.elapsed, settle: state.settle });
    for (const [width, height] of [[390, 640], [844, 290], [1000, 600]]) {
      app.resize(width, height);
      assert.ok(Object.values(app.api.camera).every(Number.isFinite));
      assert.equal(JSON.stringify({ position: shot.position, elapsed: shot.elapsed, settle: state.settle }), beforeResize,
        'resizing the return view preserves its physics and presentation clocks');
    }
  }
  app.api.onImpact();app.api.onImpact();app.until(() => state.mode === 'ready');
  assert.deepEqual(shotAccounting(app), accounting);assert.equal(state.targetMarks.length, count);
  assert.deepEqual({ ...app.api.camera }, originalCamera);assert.deepEqual({ ...state.aim }, originalAim);
  assert.deepEqual([state.panX, state.panY], originalPan);assert.equal(state.zoom, 2);
  assert.equal(JSON.stringify(state.stage.obstacles), walls, 'the walls retain their real positions and dimensions');
  assert.equal(app.getElement('flightBadge').classList.contains('hidden'), true);
});

for (const reducedMotion of [false, true]) test(`a wall-stage bullseye keeps its real shaft visible with reduced motion ${reducedMotion} and restores the exact aim`, async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100, lastStage: lessonStageId('fixed-gap-1/3', 20),
    ownedBows: [0, 8], bow: 8, scopeLoadouts: { 8: { owned: [2], equipped: 2 } }, ownedArrows: [0, 2], arrow: 2, sound: false }), { reducedMotion });
  const { state } = app.api;
  app.until(() => state.mode === 'ready');assert.equal(state.zoom, 2);
  const { pad, coords } = preciseMainDraw(app), originalCamera = { ...app.api.camera }, originalAim = { ...state.aim };
  const originalPan = [state.panX, state.panY], walls = JSON.stringify(state.stage.obstacles);
  pad.emit('pointerup', coords);await app.flush();inspectFinalApproach(app, originalCamera);
  const shot = state.shot, replay = state.cinematic, accounting = shotAccounting(app);
  assert.equal(shot.result.score, 10);assert.ok(replay);assert.equal(replay.reducedMotion, reducedMotion);
  assert.equal(replay.flightDuration === 0, reducedMotion);
  assert.deepEqual(accounting, [1, 10, 1, 1, 1, 100 + app.engine.getScoreCoinReward(10, app.api.state.stage.id), 10000]);
  const worldTime = state.time, physics = JSON.stringify({ position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result });
  const phases = new Set();let shownFrames = 0;
  while (state.mode === 'settling' && app.api.cinematicFrame()?.phase !== 'return') {
    const frame = app.api.cinematicFrame();phases.add(frame.phase);assertClearDisplayedArrow(app);
    if (shownFrames === 8) {
      for (const [width, height] of [[390, 640], [844, 290], [1000, 600]]) {
        app.resize(width, height);assertClearDisplayedArrow(app);
        assert.equal(JSON.stringify({ position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result }), physics);
      }
    }
    app.frames();shownFrames++;
  }
  assert.ok(shownFrames >= (reducedMotion ? 20 : 70));
  assert.equal(phases.has('flight'), !reducedMotion);assert.ok(phases.has('impact'));
  assert.equal(state.time, worldTime);assert.equal(JSON.stringify({ position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result }), physics);
  for (const [width, height] of [[390, 640], [844, 290], [1000, 600]]) {
    app.resize(width, height);assert.ok(Object.values(app.api.camera).every(Number.isFinite));
    assert.equal(state.time, worldTime);assert.equal(JSON.stringify({ position: shot.position, velocity: shot.velocity, elapsed: shot.elapsed, result: shot.result }), physics);
  }
  app.api.onImpact();assert.equal(state.cinematic, replay);app.until(() => state.mode === 'ready');
  assert.deepEqual(shotAccounting(app), accounting);assert.equal(state.targetMarks.length, 1);assert.equal(state.cinematic, null);
  assert.deepEqual({ ...app.api.camera }, originalCamera);assert.deepEqual({ ...state.aim }, originalAim);
  assert.deepEqual([state.panX, state.panY], originalPan);assert.equal(state.zoom, 2);
  assert.equal(JSON.stringify(state.stage.obstacles), walls);
});

test('near-target walkers and crowds visibly cover the real target while preserving timed shooting gaps at every distance', async () => {
  const app = await appHarness(), engine = app.engine;
  const lessons = engine.DISTANCE_STAGES.filter(stage => stage.passers.length);
  assert.deepEqual([...new Set(Array.from(lessons, stage => stage.distance))].sort((a, b) => a - b), [10, 20, 30, 50, 60, 80, 100, 120, 150]);
  const boxBlocks = (person, target) => {
    const fraction = (person.z - person.depth / 2) / target.z;
    const x = target.x * fraction, y = engine.PLAYER.y + (target.y - engine.PLAYER.y) * fraction;
    return Math.abs(x - person.x) <= person.width / 2 && y >= person.y && y <= person.y + person.height;
  };
  for (const template of lessons) for (const seed of [1, 42, 0x80000000]) {
    const stage = engine.prepareStage(template, seed), crowd = stage.passers.length > 1;
    assert.ok(crowd ? stage.passers.length >= 4 && stage.passers.length <= 6 : stage.passers.length === 1);
    let blocked = 0, painted = 0, face = 0, openRun = 0, longestOpen = 0;
    // People keep their own speed, so a fixed 20-second window can bias the
    // coverage ratio against the doubled target pace. Measure more relative
    // phases while still requiring a usable shooting gap in the first 20 seconds.
    const step = .025, openingSamples = 800, samples = openingSamples * 6;
    for (let index = 0; index < samples; index++) {
      const time = index * step, target = engine.targetAt(stage, time), people = engine.passersAt(stage, time);
      const covered = people.some(person => boxBlocks(person, target));
      blocked += covered;
      if (covered) openRun = 0;else { openRun += step;if (index < openingSamples) longestOpen = Math.max(longestOpen, openRun); }
      painted += people.some(person => paintedPersonBlocks(person, target, time, engine.PLAYER));
      if (index % 8 === 0) for (const [x, y] of [[-.25, 0], [.25, 0], [0, -.25], [0, .25]]) {
        const point = { ...target, x: target.x + x * target.rx, y: target.y + y * target.ry };
        face += people.some(person => paintedPersonBlocks(person, point, time, engine.PLAYER));
      }
      if (index === 0) {
        assert.equal(covered, true, `${stage.id} begins with a person directly in front of the target`);
        for (const person of people) {
          assert.ok(person.z - person.depth / 2 >= stage.distance * .9 && person.z + person.depth / 2 < stage.distance);
          assert.ok(person.speed / person.width >= 1, 'motion stays quick relative to the visible body at long range');
        }
      }
    }
    const label = `stage ${stage.id}, seed ${seed}`;
    assert.ok(painted / samples >= (crowd ? .55 : .20), `${label}: the actual painted bodies must obscure the centre, not just their boxes`);
    assert.ok(face / (samples / 8 * 4) >= (crowd ? .40 : .12), `${label}: real clothing also crosses the scoring face around the centre`);
    assert.ok(blocked / samples >= (crowd ? .63 : .40), `${label}: people remain meaningful blockers while the turn leaves room for a complete burst`);
    assert.ok(blocked / samples < .94 && longestOpen >= .25, `${label}: a usable clear interval always exists`);
    assert.deepEqual(engine.passersAt({ ...stage, targetSpeedScale: 99 }, 2.37), engine.passersAt(stage, 2.37),
      'the separately tuned people never inherit the animal/target speed multiplier');
  }
  for (const stage of lessons.filter(stage => stage.longRange)) {
    const source = lessons.find(candidate => candidate.lessonKey === stage.sourceLessonKey && candidate.distance === 50);
    const near = engine.passersAt(source, 0), far = engine.passersAt(stage, 0);
    for (let index = 0; index < near.length; index++) {
      assert.equal(far[index].passDuration, near[index].passDuration);
      assert.ok(Math.abs(far[index].speed / far[index].width - near[index].speed / near[index].width) < 1e-10);
    }
  }
});

test('a walker reverses continuously and swept collision remains exact before, across and after its turn', async () => {
  const app = await appHarness(), engine = app.engine;
  const stage = engine.prepareStage({ ...engine.DISTANCE_STAGES[0], distance: 20, radius: 8, height: 2, wind: 0,
    obstacles: [], passers: [{ id: 9, behavior: 'shuttle', z: 12, width: .03, height: 3, depth: .02, span: 2, passDuration: .6, phase: .5 }] }, 42);
  const first = engine.passersAt(stage, 0)[0], turn = first.passEnd, epsilon = 1e-6;
  const before = engine.passersAt(stage, turn - epsilon)[0], after = engine.passersAt(stage, turn + epsilon)[0];
  assert.ok(Math.abs(after.x - before.x) < 1e-8, 'both sides of the turn meet at the same point');
  assert.equal(after.velocityX, -before.velocityX);assert.equal(after.passId, before.passId + 1);
  for (const impactTime of [turn - .08, turn + .0005, turn + .07]) {
    const person = engine.passersAt(stage, impactTime)[0];
    const shot = engine.launchArrow({ bow: 11, arrow: 11 }), drag = shot.dragRate;
    const gravity = engine.GRAVITY * (shot.gravityScale ?? 1);
    const a = -Math.expm1(-drag * impactTime) / drag, b = (impactTime - a) / drag;
    shot.velocity = { x: person.x / a, y: (1.3 - engine.PLAYER.y + gravity * b) / a, z: person.z / a };
    const clone = () => ({ ...shot, position: { ...shot.position }, velocity: { ...shot.velocity }, trail: [] });
    const whole = clone(), result = engine.stepArrow(whole, 1, stage, 0);
    assert.equal(result.type, 'person');assert.equal(result.score, 0);assert.equal(result.personId, 9);
    for (const step of [1 / 61, 1 / 240]) {
      const pieces = clone();let time = 0;
      while (pieces.active && time < 1) { engine.stepArrow(pieces, step, stage, time);time += step; }
      assert.equal(pieces.result.type, 'person');assert.equal(pieces.result.passId, result.passId);
      assert.ok(Math.abs(pieces.result.flightTime - result.flightTime) < 1e-8);
      for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(pieces.position[axis] - whole.position[axis]) < 1e-8);
    }
    assert.equal(engine.stepArrow(clone(), 1, { ...stage, passers: [] }, 0).type, 'hit', 'the same trajectory reaches the target when the walker is absent');
  }
});

test('real shots at 10, 50 and 150 metres must wait for a walker gap and retain a usable release-time margin', async () => {
  const cases = [['one-passer', 10], ['two-passers', 50], ['long-passers-tracking', 150]];
  for (const [lessonKey, distance] of cases) for (const outcome of ['person', 'hit']) {
    const template = STAGE_FIXTURES.find(stage => stage.lessonKey === lessonKey && stage.distance === distance);
    const loadout = template.referenceLoadouts[0];
    const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, lastStage: template.id,
      ownedBows: [...new Set([0, loadout.bow])], ownedArrows: [...new Set([0, loadout.arrow])],
      bow: loadout.bow, arrow: loadout.arrow, coins: 100, sound: false }));
    const { state } = app.api, engine = app.engine;
    const params = { bow: app.api.activeBow(), arrow: app.api.activeArrow(), charge: 1, velocityBias: 0 };
    const cycle = state.stage.passers[0].passDuration * 2;
    let chosen;
    for (let time = 1.3; time < 1.3 + cycle; time += .025) {
      const aim = targetIntercept(engine, params, state.stage, time);
      const result = engine.predictTrajectory(aim, state.stage, time).result;
      if (result?.type !== outcome) continue;
      if (outcome === 'hit' && (result.score !== 10 || ![-.08, .08].every(offset => {
        const edge = engine.predictTrajectory(aim, state.stage, time + offset).result;
        return edge?.type === 'hit' && edge.score >= 8;
      }))) continue;
      chosen = { time, aim };break;
    }
    assert.ok(chosen, `${lessonKey} ${distance}m offers ${outcome === 'hit' ? 'an open 160ms release window' : 'a real blocked shot'} within one cycle`);
    state.time = chosen.time - 1.3;
    const draw = preciseMainDraw(app);draw.pad.emit('pointerup', draw.coords);await app.flush();
    app.until(() => state.mode === 'settling');
    assert.equal(state.shot.result.type, outcome);assert.equal(state.used, 1);assert.equal(app.api.progress.shots, 1);
    if (outcome === 'hit') {
      assert.equal(state.score, 10);assert.equal(state.hits, 1);assert.equal(state.targetMarks.length, 1);assert.equal(app.api.progress.coins, 100 + app.engine.getScoreCoinReward(10, state.stage.id));
    } else {
      assert.equal(state.score, 0);assert.equal(state.hits, 0);assert.equal(state.targetMarks.length, 0);
      assert.equal(state.shot.attachment, undefined);assert.equal(app.api.progress.coins, 101);
    }
    app.api.onImpact();assert.equal(app.api.progress.shots, 1);assert.equal(app.ammo.account.remaining, 10000);
  }
});

test('real arrow and bullet crowd hits remove only that walker from the next shot and restore everyone on retry or reload', async () => {
  for (const bowId of [8, 20]) {
    const template = STAGE_FIXTURES.find(stage => stage.lessonKey === 'two-passers' && stage.distance === 10);
    const app = await appHarness(progressForStage({version: 1, stageCatalog: STAGE_CATALOG, lastStage: template.id,
      ownedBows: [0, bowId], bow: bowId, ownedArrows: [0, 2], arrow: 2, coins: 100, sound: false}));
    const {state} = app.api, engine = app.engine, definitions = JSON.stringify(state.stage.passers);
    if (bowId === 20) app.until(() => state.reloadRemaining === 0);
    const allIds = Array.from(state.stage.passers, person => person.id);
    const visibleIds = () => Array.from(app.api.sceneItems(engine.targetAt(state.stage, state.time)))
      .filter(item => item.kind === 'person').map(item => item.person.id).sort((a, b) => a - b);
    const params = {bow: app.api.activeBow(), arrow: app.api.activeArrow(), charge: 1, velocityBias: 0};
    const cycle = state.stage.passers[0].passDuration * 2;
    let chosen;
    for (let time = 1.3; time < 1.3 + cycle; time += .025) {
      const aim = targetIntercept(engine, params, state.stage, time);
      const result = engine.predictTrajectory(aim, state.stage, time).result;
      if (result?.type !== 'person' || result.personId !== 0) continue;
      const withoutHitWalker = {...state.stage, passers: state.stage.passers.filter(person => person.id !== result.personId)};
      const clear = engine.predictTrajectory(aim, withoutHitWalker, time).result;
      if (clear?.type === 'hit' && clear.score === 10) { chosen = {time, personId: result.personId};break; }
    }
    assert.ok(chosen, 'a real crowd edge exposes the target once its struck walker is absent');
    assert.deepEqual(visibleIds(), allIds, 'trajectory and coach probes cannot remove a person');
    state.time = chosen.time - 1.3;
    const draw = preciseMainDraw(app);draw.pad.emit('pointerup', draw.coords);await app.flush();
    app.until(() => state.mode === 'settling');
    assert.equal(state.shot.result.type, 'person');assert.equal(state.shot.result.personId, chosen.personId);
    assert.equal(state.shot.projectileType, bowId === 20 ? 'bullet' : 'arrow');
    assert.deepEqual(shotAccounting(app), [1, 0, 0, 1, 0, 101, 10000]);
    assert.equal(state.targetMarks.length, 0);assert.equal(state.stuck.length, 0);
    assert.deepEqual(visibleIds(), allIds, 'the hit stays visible for its current impact view');
    assert.match(app.getElement('feedbackDetail').textContent, /이번 발사 0점.*다음 발사부터 빠져요/);
    app.api.onImpact();app.api.onImpact();
    assert.deepEqual(shotAccounting(app), [1, 0, 0, 1, 0, 101, 10000]);
    app.until(() => state.mode === 'ready');
    const remainingIds = allIds.filter(id => id !== chosen.personId);
    assert.deepEqual(visibleIds(), remainingIds);
    assert.equal(JSON.stringify(state.stage.passers), definitions, 'round state preserves every original person for a fresh attempt');
    for (const time of [state.time, state.time + cycle / 2, state.time + cycle, state.time + cycle * 10])
      assert.deepEqual(Array.from(engine.passersAt(state.stage, time), person => person.id), remainingIds,
        'changing walking legs cannot bring the same person back during this round');

    // Return to the same walking phase at a later time. The other people still
    // move, but the actual next arrow must pass through the removed person's gap.
    const nextRelease = chosen.time + Math.ceil((state.time + 1.3 - chosen.time) / cycle) * cycle;
    state.time = nextRelease - 1.3;
    const next = preciseMainDraw(app);next.pad.emit('pointerup', next.coords);await app.flush();
    app.until(() => state.mode === 'settling');
    assert.equal(state.shot.result.type, 'hit');assert.equal(state.shot.result.score, 10);
    assert.deepEqual(shotAccounting(app), [2, 10, 1, 2, 1, 101 + app.engine.getScoreCoinReward(10, app.api.state.stage.id), 10000]);
    app.until(() => state.mode === 'ready');assert.deepEqual(visibleIds(), remainingIds);
    const saved = app.snapshot();
    app.getElement('menuBtn').emit('click');modalAction(app, 'retry');await app.flush();
    assert.equal(state.used, 0);assert.equal(state.score, 0);assert.deepEqual(visibleIds(), allIds);
    assert.equal(JSON.stringify(STAGE_FIXTURES[template.id - 1].passers), definitions, 'the shared stage catalog never loses people');
    const resumed = await appHarness(saved);
    assert.deepEqual(Array.from(resumed.engine.passersAt(resumed.api.state.stage, 0), person => person.id), allIds,
      'a saved account does not retain a previous round’s removals');
  }
});

test('a three-arrow trigger keeps every struck walker through settling and removes all hit IDs for the next trigger', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 15], bow: 15, coins: 100, sound: false});
  const {state} = app.api, engine = app.engine;
  const draw = preciseMainDraw(app), params = app.api.shotParams(), probes = engine.launchVolley(params), z = 5;
  const crossingX = shot => {
    const time = -Math.log1p(-shot.dragRate * z / shot.velocity.z) / shot.dragRate;
    return shot.velocity.x * -Math.expm1(-shot.dragRate * time) / shot.dragRate;
  };
  const [firstX, secondX, thirdX] = Array.from(probes, crossingX);
  const walker = (id, centerX, width) => ({id, behavior: 'shuttle', centerX, z, width, height: 10, depth: .01,
    span: 1, passDuration: 1e6, phase: .5});
  state.stage.passers = [walker(0, (firstX + thirdX) / 2, .06), walker(7, secondX, .02), walker(9, 2, .2)];
  const definitions = JSON.stringify(state.stage.passers);
  const visibleIds = () => Array.from(app.api.sceneItems(engine.targetAt(state.stage, state.time)))
    .filter(item => item.kind === 'person').map(item => item.person.id).sort((a, b) => a - b);
  const expected = Array.from(engine.launchVolley(params), shot => engine.stepArrow(shot, 8, state.stage, state.time + shot.launchDelay));
  assert.deepEqual(expected.map(result => [result.type, result.personId]), [['person', 0], ['person', 7], ['person', 0]],
    'the delayed third arrow really meets the same person as the first');
  assert.deepEqual(visibleIds(), [0, 7, 9], 'speculative collisions never retire people');
  draw.pad.emit('pointerup', draw.coords);await app.flush();
  app.until(() => !!state.volley.shots[0].result);
  assert.equal(state.mode, 'flight');assert.ok(state.volley.shots.slice(1).some(shot => shot.active));
  assert.deepEqual(visibleIds(), [0, 7, 9], 'the first impact cannot open a gap for later arrows of this trigger');
  app.until(() => !!state.volley.shots[1].result);
  assert.equal(state.mode, 'flight');assert.equal(state.volley.shots[2].active, true);
  assert.deepEqual(visibleIds(), [0, 7, 9], 'a second struck person also remains until the trigger finishes');
  app.until(() => state.mode === 'settling');
  assert.deepEqual(Array.from(state.volley.shots, shot => [shot.result.type, shot.result.personId]),
    [['person', 0], ['person', 7], ['person', 0]]);
  assert.deepEqual(visibleIds(), [0, 7, 9]);assert.deepEqual(shotAccounting(app), [1, 0, 0, 1, 0, 101, 10000]);
  assert.equal(state.arrowHits, 0);assert.equal(state.targetMarks.length, 0);assert.equal(state.stuck.length, 0);
  app.api.onImpact();app.api.onImpact();
  app.until(() => state.mode === 'ready');
  assert.deepEqual(visibleIds(), [9], 'every actually hit ID is removed together, including nonrepresentative arrows');
  assert.deepEqual(shotAccounting(app), [1, 0, 0, 1, 0, 101, 10000]);
  assert.equal(JSON.stringify(state.stage.passers), definitions);

  const next = preciseMainDraw(app);next.pad.emit('pointerup', next.coords);await app.flush();
  app.until(() => state.mode === 'settling');
  assert.ok(state.volley.shots.every(shot => shot.result.type === 'hit'), 'the next trigger has no invisible body blockers');
  assert.equal(state.score, state.volley.shots.reduce((total, shot) => total + shot.result.score, 0));
  assert.equal(state.used, 2);assert.equal(app.api.progress.shots, 2);assert.equal(state.hits, 1);assert.equal(state.arrowHits, 3);
  app.until(() => state.mode === 'ready');assert.deepEqual(visibleIds(), [9]);
  app.api.resetRound();await app.flush();
  assert.deepEqual(visibleIds(), [0, 7, 9], 'restarting the already prepared round restores its full roster');
  assert.equal(state.used, 0);assert.equal(state.score, 0);
  app.api.startStage(1);await app.flush();
  assert.deepEqual(visibleIds(), [], 'a new stage uses only its own roster');
});

test('the close pillar crowd leaves a real opening through the last burst arrow and release-time error', async () => {
  const id = lessonStageId('pillars-passers', 10);
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, lastStage: id,
    ownedBows: [0, 19], bow: 19, ownedArrows: [0, 11], arrow: 11, coins: 100, sound: false }));
  const { state } = app.api, engine = app.engine;
  app.until(() => state.mode === 'ready');
  const params = { bow: app.api.activeBow(), arrow: app.api.activeArrow(), charge: 1, velocityBias: 0 };
  const resultsAt = (aim, time, burstSeed) => engine.launchVolley({ ...aim, burstSeed }).map(shot =>
    engine.stepArrow(shot, 8, state.stage, time + shot.launchDelay));
  let chosen;
  for (let time = 1.3; time < 1.3 + state.stage.passers[0].passDuration * 4; time += .025) {
    const aim = targetIntercept(engine, params, state.stage, time);
    if (!resultsAt(aim, time, 0).every(result => result?.type === 'hit')) continue;
    const open = [0, 1, 17, 91, 0x80000000].every(seed => [-.08, 0, .08].every(offset => {
      const results = resultsAt(aim, time + offset, seed);
      return results.every(result => result?.type === 'hit') && Math.max(...results.map(result => result.score)) >= 8;
    }));
    if (open) { chosen = { time, aim };break; }
  }
  assert.ok(chosen, 'the actual pillars and painted crowd leave a usable opening for every delayed arrow');
  state.time = chosen.time - 1.3;
  const draw = preciseMainDraw(app), chosenSeed = state.burstSeed;
  assert.equal(chosenSeed, 0x80000000);
  draw.pad.emit('pointerup', draw.coords);await app.flush();
  assert.deepEqual(Array.from(state.volley.shots, shot => shot.launchDelay), [0, .08, .16]);
  app.until(() => state.mode === 'settling');
  assert.ok(state.volley.shots.every(shot => shot.result.type === 'hit'));
  assert.equal(state.used, 1);assert.equal(state.score,30);assert.equal(state.hits, 1);
  assert.equal(state.arrowHits,3);assert.equal(state.shot.result.score,10);
  assert.equal(state.targetMarks.length, 3);assert.equal(app.api.progress.coins, 100 + 3 * app.engine.getScoreCoinReward(10, state.stage.id));assert.equal(app.api.progress.shots, 1);
  app.api.onImpact();assert.equal(app.api.progress.coins, 100 + 3 * app.engine.getScoreCoinReward(10, state.stage.id));assert.equal(app.api.progress.shots, 1);
});

test('real wall and person collisions keep the ordinary failure camera and never reveal or award a target hit', async () => {
  for (const fixture of [{ lessonKey: 'moving-half-gap', distance: 30, time: 0, result: 'obstacle' },
    { lessonKey: 'pillars-passers', distance: 20, time: 2, result: 'person' }]) {
    const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100, lastStage: lessonStageId(fixture.lessonKey, fixture.distance),
      ownedBows: [0, 8], bow: 8, ownedArrows: [0, 2], arrow: 2, sound: false }));
    const { state } = app.api;
    app.until(() => state.mode === 'ready');if (fixture.time !== undefined) state.time = fixture.time;
    const { pad, coords } = preciseMainDraw(app), baseCamera = { ...app.api.camera }, aim = { ...state.aim };
    pad.emit('pointerup', coords);await app.flush();app.until(() => state.mode === 'settling');
    assert.equal(state.shot.result.type, fixture.result);assert.equal(state.cinematic, null);
    assert.equal(state.targetMarks.length, 0);assert.equal(state.shot.attachment, undefined);
    assert.equal(state.stuck.length, fixture.result === 'obstacle' ? 1 : 0);
    assert.deepEqual(shotAccounting(app), [1, 0, 0, 1, 0, 101, 10000]);
    app.resize(1000, 600);
    assert.deepEqual({ ...app.api.camera }, { ...app.view.desiredFollowCamera(state.shot.position, baseCamera, { w: 1000, h: 600 }) },
      'a blocked shot retains the actual failure location instead of a camera intended to expose a successful hit');
    const physics = JSON.stringify({ position: state.shot.position, velocity: state.shot.velocity, elapsed: state.shot.elapsed, result: state.shot.result });
    app.api.onImpact();app.api.onImpact();app.until(() => state.mode === 'ready');
    assert.deepEqual(shotAccounting(app), [1, 0, 0, 1, 0, 101, 10000]);assert.equal(state.targetMarks.length, 0);
    assert.equal(JSON.stringify({ position: state.shot.position, velocity: state.shot.velocity, elapsed: state.shot.elapsed, result: state.shot.result }), physics);
    assert.deepEqual({ ...app.api.camera }, baseCamera);assert.deepEqual({ ...state.aim }, aim);
  }
});

for (const outcome of ['hit', 'ground']) {
  test(`main view follows a ${outcome}, holds its landing, then restores the saved aim and zoom`, async () => {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, scopeLoadouts: { 0: { owned: [2], equipped: 2 } } });
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
    assert.ok(Math.abs((app.now - releaseTime) / 1000 - shot.elapsed) < .02, 'live presentation and ballistic flight use the same real-time duration');
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
    const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 1, sound: false }));
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
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 1, sound: false }));
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

// Pick an interior point on the real painted part, then deliver that resolved
// contact through the app's handler. These cumulative-damage fixtures need the
// same animal pass for several hits; real flight/part scoring is checked below.
function resolveAnimalContact(app, score) {
  const { state } = app.api, target = app.engine.targetAt(state.stage, state.time);
  const parts = { 10: ['heart'], 8: ['head'], 5: ['body'], 3: ['leg', 'ear'] }[score];
  const geometry = app.animals.getAnimalGeometry(target.kind, target.poseTime);
  let point, contact;
  outer: for (const primitive of geometry.primitives) {
    if (!parts.includes(primitive.part)) continue;
    for (const path of primitive.paths) {
      const points = path.points;
      const candidates = path.ellipse ? [{ x: path.ellipse.x, y: path.ellipse.y }] : [
        { x: points.reduce((sum, value) => sum + value.x, 0) / points.length,
          y: points.reduce((sum, value) => sum + value.y, 0) / points.length },
        ...points.slice(1).map((value, index) => ({ x: (points[index].x + value.x) / 2, y: (points[index].y + value.y) / 2 }))
      ];
      for (const candidate of candidates) {
        const m = primitive.matrix, local = { x: m[0] * candidate.x + m[2] * candidate.y + m[4],
          y: m[1] * candidate.x + m[3] * candidate.y + m[5] };
        const world = { x: target.x + local.x * target.radius * (target.direction < 0 ? -1 : 1),
          y: target.y - local.y * target.radius, z: target.z };
        const result = app.animals.scoreAnimalPoint(world, target);
        if (result?.score === score && result.animalAttachment) { point = world;contact = result;break outer; }
      }
    }
  }
  assert.ok(contact, `${target.kind} has a painted ${score}-point contact in its current pose`);
  state.shot = { ...app.engine.launchArrow({ bow: app.api.activeBow(), arrow: app.api.activeArrow() }),
    position: { ...point }, velocity: { x: 2, y: -3, z: 38 }, elapsed: .2, active: false, handled: false,
    trail: [{ ...app.engine.PLAYER }, { ...point }],
    result: { type: 'hit', point, targetCenter: target, flightTime: .2, ...contact } };
  state.mode = 'flight';state.used++;app.api.onImpact();
  return state.shot;
}

function assertAttachedArrows(app, offsets, velocities, maximumVisualAngle = 0) {
  const { state } = app.api, target = app.engine.targetAt(state.stage, state.time);
  const items = app.api.sceneItems(target), tips = items.filter(item => item.kind === 'tip');
  assert.equal(tips.length, offsets.length, 'every previous hit remains rendered once');
  offsets.forEach((offset, index) => {
    const mark = state.targetMarks.find(value => Math.abs(value.x - offset.x) < 1e-9 && Math.abs(value.y - offset.y) < 1e-9);
    assert.ok(mark, 'the expected impact mark is retained');
    const subject = app.engine.targetAt(state.stage, state.time, mark.passId);
    const tip = tips.find(item => Math.abs(item.point.x - subject.x - offset.x) < 1e-9 && Math.abs(item.point.y - subject.y - offset.y) < 1e-9);
    assert.ok(tip, `arrow ${index + 1} keeps its own target-local impact point`);
    assert.ok(Math.abs(tip.point.z - subject.z) < .01);
    if (Number.isInteger(mark.passId) && mark.passId !== target.passId) {
      assert.ok(items.some(item => item.kind === 'target' && item.target.passId === mark.passId), 'the original animal is still rendered');
      assert.ok(Math.hypot(tip.point.x - target.x - offset.x, tip.point.y - target.y - offset.y) > .1, 'the next animal does not inherit an old arrow');
    }
    const shaft = items.find(item => item.kind === 'shaft' && Math.abs(item.b.x - tip.point.x) < 1e-9 && Math.abs(item.b.y - tip.point.y) < 1e-9 && Math.abs(item.b.z - tip.point.z) < 1e-9);
    assert.ok(shaft, 'the attached arrow keeps its complete shaft');
    const direction = { x: shaft.b.x - shaft.a.x, y: shaft.b.y - shaft.a.y, z: shaft.b.z - shaft.a.z };
    const speed = Math.hypot(...Object.values(velocities[index])), length = Math.hypot(...Object.values(direction));
    if (maximumVisualAngle) {
      const dot = ['x', 'y', 'z'].reduce((sum, axis) => sum + direction[axis] / length * velocities[index][axis] / speed, 0);
      assert.ok(Math.acos(Math.min(1, Math.max(-1, dot))) <= maximumVisualAngle, 'impact vibration stays close to the real entry angle');
      assert.ok(Math.abs(length - .85) < 1e-9, 'visual vibration preserves the shaft length');
    } else {
      for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(direction[axis] / length - velocities[index][axis] / speed) < 1e-9, 'the original entry angle is retained');
    }
    assert.ok(items.indexOf(tip) > items.findIndex(item => item.kind === 'target'), 'embedded arrow tips remain on the visible target face');
  });
  return target;
}

test('actual animal heart hits keep their ten-point award, anatomy feedback and attachments without the circular-target replay', async () => {
  for (const scene of ['rabbit', 'wildcat', 'deer', 'pigeon', 'eagle', 'cheetah']) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG,
      ownedBows: [0, 11], ownedArrows: [0, 11], bow: 11, arrow: 11, coins: 100, sound: false });
    await enterScene(app, scene);
    prepareAnimalCrossing(app);
    const { state } = app.api, draw = preciseMainDraw(app);
    draw.pad.emit('pointerup', draw.coords);await app.flush();
    assert.equal(state.mode, 'flight');app.until(() => state.mode === 'settling');
    const result = state.shot.result;
    assert.equal(result.type, 'hit', scene);assert.equal(result.part, 'heart', scene);assert.equal(result.score, 10);
    assert.equal(state.cinematic, null);assert.match(app.getElement('feedbackTitle').textContent, /심장 명중.*\+10점/);
    assert.equal(state.score, 10);assert.equal(state.hits, 1);assert.equal(app.api.progress.coins, 100 + app.engine.getScoreCoinReward(10, state.stage.id));
    assert.equal(app.api.progress.shots, 1);assert.equal(app.api.progress.hits, 1);assert.equal(state.targetMarks.length, 1);
    assert.ok(result.animalAttachment);app.api.onImpact();app.frames(20);
    const target = app.engine.targetAt(state.stage, state.time, result.targetCenter.passId);
    const expected = app.engine.getAnimalAttachmentPoint(target, result.animalAttachment);
    const tips = app.api.sceneItems(app.engine.targetAt(state.stage, state.time)).filter(item => item.kind === 'tip');
    assert.equal(tips.length, 1);
    for (const axis of ['x', 'y']) {
      assert.ok(Math.abs(tips[0].point[axis] - expected[axis]) < 1e-8, `${scene} keeps its arrow on the moving heart`);
      assert.ok(Math.abs(state.shot.position[axis] - expected[axis]) < 1e-8, 'the impact camera follows that same contact');
    }
    assert.equal(state.score, 10);assert.equal(app.api.progress.coins, 100 + app.engine.getScoreCoinReward(10, state.stage.id));assert.equal(app.api.progress.shots, 1);
  }
});

test('real rabbit head, body, ear and leg hits show their own points and follow the struck animated body part', async () => {
  const samples = [
    { part: 'head', zone: '머리', score: 8, x: .59, y: -.1302 },
    { part: 'body', zone: '몸통', score: 5, x: -.30, y: .084 },
    { part: 'ear', zone: '귀', score: 3, x: .58, y: -.546 },
    { part: 'leg', zone: '다리', score: 3, x: .38, y: .4116 }
  ];
  for (const sample of samples) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG,
      ownedBows: [0, 11], ownedArrows: [0, 11], bow: 11, arrow: 11, coins: 100, sound: false });
    await enterScene(app, 'rabbit');
    prepareAnimalCrossing(app);
    const { state } = app.api, initial = app.engine.targetAt(state.stage, 0);
    const point = { x: initial.x + sample.x * initial.radius * (initial.direction < 0 ? -1 : 1),
      y: initial.y - sample.y * initial.radius, z: initial.z };
    const contact = app.animals.scoreAnimalPoint(point, initial, 0);
    assert.equal(contact?.part, sample.part);assert.equal(contact.score, sample.score);assert.ok(contact.animalAttachment);
    const aimAt = target => app.engine.getAnimalAttachmentPoint(target, contact.animalAttachment);
    const draw = preciseMainDraw(app, { x: 0, y: 0 }, { aimAt });
    draw.pad.emit('pointerup', draw.coords);await app.flush();app.until(() => state.mode === 'settling');
    const result = state.shot.result, reward = app.engine.getScoreCoinReward(sample.score, state.stage.id);
    assert.equal(result.type, 'hit');assert.equal(result.part, sample.part);assert.equal(result.score, sample.score);
    assert.equal(state.score, sample.score);assert.equal(state.hits, 1);assert.equal(app.api.progress.coins, 100 + reward);
    assert.match(app.getElement('feedbackTitle').textContent, new RegExp(`${sample.zone} 명중.*\\+${sample.score}점`));
    assert.equal(state.cinematic, null);assert.ok(result.animalAttachment);
    const oldLocal = { x: result.point.x - result.targetCenter.x, y: result.point.y - result.targetCenter.y };
    app.api.onImpact();app.frames(20);
    const target = app.engine.targetAt(state.stage, state.time, result.targetCenter.passId);
    const expected = app.engine.getAnimalAttachmentPoint(target, result.animalAttachment);
    const tips = app.api.sceneItems(app.engine.targetAt(state.stage, state.time)).filter(item => item.kind === 'tip');
    assert.equal(tips.length, 1);assert.equal(state.targetMarks.length, 1);
    for (const axis of ['x', 'y']) {
      assert.ok(Math.abs(tips[0].point[axis] - expected[axis]) < 1e-8, `${sample.part} attachment follows the visible anatomy`);
      assert.ok(Math.abs(state.shot.position[axis] - expected[axis]) < 1e-8);
    }
    if (['ear', 'leg'].includes(sample.part)) {
      assert.ok(Math.hypot(expected.x - target.x - oldLocal.x, expected.y - target.y - oldLocal.y) > .001,
        'the moving limb has changed its local position, so a rigid centre offset cannot pass this check');
    }
    assert.equal(state.score, sample.score);assert.equal(app.api.progress.coins, 100 + reward);assert.equal(app.api.progress.shots, 1);
  }
});

test('animal damage accumulates to each species threshold once and the next pass starts with fresh health', async () => {
  const names = { rabbit: '토끼', wildcat: '살쾡이', deer: '사슴', pigeon: '비둘기', eagle: '독수리', cheetah: '치타' };
  const cases = [
    { kind: 'rabbit', health: 5, hits: [3, 3] },
    { kind: 'wildcat', health: 8, hits: [5, 3] },
    { kind: 'deer', health: 10, hits: [10] },
    { kind: 'pigeon', health: 12, hits: [5, 5, 3] },
    { kind: 'eagle', health: 15, hits: [10, 5] },
    { kind: 'cheetah', health: 18, hits: [10, 8] }
  ];
  for (const fixture of cases) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, coins: 100, sound: false });
    await enterScene(app, fixture.kind);prepareAnimalCrossing(app);
    const { state } = app.api, stageId = state.stage.id, initial = app.engine.targetAt(state.stage, state.time);
    assert.equal(initial.maxHealth, fixture.health);assert.equal(initial.health, fixture.health);assert.equal(!!initial.dead, false);
    let total = 0, earned = 0;
    const shots = [];
    for (const score of fixture.hits) {
      const shot = resolveAnimalContact(app, score);shots.push(shot);total += score;earned += app.engine.getScoreCoinReward(score, state.stage.id);
      const target = app.engine.targetAt(state.stage, state.time, initial.passId);
      assert.equal(target.health, Math.max(0, fixture.health - total));assert.equal(target.maxHealth, fixture.health);
      assert.equal(!!target.dead, total >= fixture.health, `${fixture.kind} dies only after its cumulative threshold`);
      assert.equal(shot.animalHit?.applied, true);assert.equal(shot.animalHit.damage, total);
      assert.equal(shot.animalHit.justKilled, total >= fixture.health);
      assert.ok(app.getElement('feedbackDetail').textContent.includes(target.dead ? `${names[fixture.kind]} 쓰러짐` :
        `${names[fixture.kind]} 체력 ${target.health}/${fixture.health}`), 'the player sees the remaining health or the final fall');
      assert.equal(state.score, total);assert.equal(state.hits, shots.length);assert.equal(app.api.progress.coins, 100 + earned);
      assert.equal(app.api.progress.shots, shots.length);assert.equal(app.api.progress.hits, shots.length);
      const saved = app.snapshot(), health = target.health;
      app.api.onImpact();app.api.onImpact();
      assert.deepEqual(app.snapshot(), saved);assert.equal(app.engine.targetAt(state.stage, state.time, initial.passId).health, health,
        'reprocessing one resolved shot cannot apply damage or pay its hit again');
      app.frames(3);
    }
    const death = app.engine.targetAt(state.stage, state.time, initial.passId);
    assert.equal(death.dead, true);assert.equal(death.health, 0);assert.ok(Number.isFinite(death.deathTime));
    assert.equal(state.targetMarks.length, shots.length);
    app.frames(24);
    const corpse = app.engine.targetAt(state.stage, state.time, initial.passId);
    assert.equal(corpse.x, death.x);assert.ok(corpse.y <= death.y, 'the frozen running pose may fall toward the ground');assert.equal(corpse.poseTime, death.poseTime);
    const restingTime = corpse.deathTime + 3;
    assert.equal(app.engine.targetAt(state.stage, restingTime, initial.passId).y,
      app.engine.targetAt(state.stage, restingTime + 1, initial.passId).y, 'the fallen body rests on the ground instead of continuing to sink');
    assert.ok(corpse.deathAge > death.deathAge, 'the falling pose advances while the old running pose stays frozen');
    const rendered = app.animalFrames.findLast(frame => frame[6]?.passId === initial.passId);
    assert.ok(rendered);assert.equal(rendered[6].dead, true);assert.equal(rendered[4], corpse.poseTime);
    assert.equal(rendered[6].deathAge, corpse.deathAge, 'the drawing receives the same frozen and falling state as the arrow attachment');
    const items = app.api.sceneItems(app.engine.targetAt(state.stage, state.time));
    const tips = items.filter(item => item.kind === 'tip');assert.equal(tips.length, shots.length);
    for (const shot of shots) {
      const expected = app.engine.getAnimalAttachmentPoint(corpse, shot.result.animalAttachment);
      assert.ok(tips.some(item => Math.hypot(item.point.x - expected.x, item.point.y - expected.y) < 1e-8),
        `${fixture.kind} keeps every embedded arrow on its fallen body`);
    }
    const lastContact = app.engine.getAnimalAttachmentPoint(corpse, shots.at(-1).result.animalAttachment);
    assert.ok(Math.hypot(state.shot.position.x - lastContact.x, state.shot.position.y - lastContact.y) < 1e-8,
      'the impact camera follows the same falling contact as the rendered arrow');
    app.until(() => state.mode === 'ready');
    state.time = (initial.passId + 1) * initial.passDuration + .2;
    const next = app.engine.targetAt(state.stage, state.time), previous = app.engine.targetAt(state.stage, state.time, initial.passId);
    assert.equal(next.passId, initial.passId + 1);assert.equal(!!next.dead, false);
    assert.equal(next.health, fixture.health);assert.equal(next.maxHealth, fixture.health);
    assert.equal(previous.dead, true);assert.equal(previous.health, 0);assert.equal(previous.x, death.x);
    const nextItems = app.api.sceneItems(next);
    assert.equal(nextItems.filter(item => item.kind === 'target' && item.target.passId === initial.passId).length, 1);
    assert.equal(nextItems.filter(item => item.kind === 'target' && item.target.passId === next.passId).length, 1);
    assert.equal(nextItems.filter(item => item.kind === 'tip').length, shots.length, 'a new animal does not inherit or erase the previous animal’s arrows');
    assert.equal(state.score, total);assert.equal(app.api.progress.coins, 100 + earned);
    app.api.startStage(stageId);await app.flush();
    const fresh = app.engine.targetAt(state.stage, 0);
    assert.equal(fresh.health, fixture.health);assert.equal(!!fresh.dead, false);assert.equal(state.targetMarks.length, 0);
  }
});

test('a fatal first burst arrow disables that animal so only its actual hit contributes to the sum', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 19], ownedArrows: [0, 11],
    bow: 19, arrow: 11, coins: 100, sound: false });
  await enterScene(app, 'rabbit');prepareAnimalCrossing(app);
  const { state } = app.api, draw = preciseMainDraw(app);
  draw.pad.emit('pointerup', draw.coords);await app.flush();
  const volley = state.volley;assert.equal(volley.shots.length, 3);
  app.until(() => !!volley.shots[0].result);
  const first = volley.shots[0], passId = first.result.targetCenter.passId;
  assert.equal(first.result.type, 'hit');assert.equal(first.result.part, 'heart');assert.equal(first.result.score, 10);
  assert.equal(first.animalHit.justKilled, true);assert.equal(first.animalHit.damage, 10);
  assert.equal(app.engine.targetAt(state.stage, state.time, passId).dead, true);
  assert.equal(state.mode, 'flight');assert.equal(state.targetMarks.length, 1);
  assert.equal(app.api.progress.shots, 0, 'the trigger waits for all of its arrows before awarding one result');
  app.until(() => state.mode === 'settling');
  for (const extra of volley.shots.slice(1)) {
    assert.notEqual(extra.result.type, 'hit');assert.equal(extra.result.score, 0);assert.equal(extra.attachment, undefined);
    assert.equal(extra.animalHit, undefined, 'later arrows cannot apply another hit to the newly dead animal');
  }
  assert.equal(state.targetMarks.length, 1);assert.equal(state.used, 1);assert.equal(state.score, 10);assert.equal(state.hits, 1);
  assert.equal(app.api.progress.shots, 1);assert.equal(app.api.progress.hits, 1);assert.equal(app.api.progress.coins, 100 + app.engine.getScoreCoinReward(10, state.stage.id));
  app.api.onImpact();assert.equal(app.api.progress.coins, 100 + app.engine.getScoreCoinReward(10, state.stage.id));assert.equal(app.api.progress.shots, 1);
});

test('shooting an already dead animal cannot score again or attach another arrow to its empty hit area', async () => {
  const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG, ownedBows: [0, 11], ownedArrows: [0, 11],
    bow: 11, arrow: 11, coins: 100, sound: false });
  await enterScene(app, 'rabbit');prepareAnimalCrossing(app);
  const { state } = app.api;
  resolveAnimalContact(app, 3);const fatal = resolveAnimalContact(app, 3);
  const passId = fatal.result.targetCenter.passId;
  assert.equal(app.engine.targetAt(state.stage, state.time, passId).dead, true);
  assert.equal(state.score, 6);assert.equal(state.hits, 2);assert.equal(app.api.progress.coins, 110);
  app.until(() => state.mode === 'ready');
  const anchor = fatal.result.animalAttachment;
  const aimAt = target => app.engine.getAnimalAttachmentPoint(target, anchor);
  const draw = preciseMainDraw(app, { x: 0, y: 0 }, { aimAt });
  const corpse = app.engine.targetAt(state.stage, state.time);
  assert.equal(corpse.passId, passId);assert.equal(corpse.dead, true);
  assert.equal(app.animals.scoreAnimalPoint(aimAt(corpse), corpse), null, 'painted corpse anatomy is no longer a scoring target');
  draw.pad.emit('pointerup', draw.coords);await app.flush();app.until(() => state.mode === 'settling');
  assert.notEqual(state.shot.result.type, 'hit');assert.equal(state.shot.result.score, 0);
  assert.equal(state.shot.attachment, undefined);assert.equal(state.targetMarks.length, 2);
  assert.equal(state.score, 6);assert.equal(state.hits, 2);assert.equal(app.api.progress.hits, 2);
  assert.equal(app.api.progress.shots, 3);assert.equal(app.api.progress.coins, 111, 'an expired target grants no extra hit award');
  assert.equal(app.engine.targetAt(state.stage, state.time, passId).health, 0);
  app.api.onImpact();assert.equal(app.api.progress.shots, 3);assert.equal(app.api.progress.coins, 111);
});

test('a real arrow through empty space inside the former animal ellipse keeps flying and never attaches or awards a hit', async () => {
  // All three spaces were inside the former ellipse; the actual painted parts
  // remain clear there while the ears and legs animate.
  const gaps = [{ name: 'above the tail', x: -.9, y: -.25 },
    { name: 'between the ears', x: .47, y: -.58 }, { name: 'between the legs', x: .06, y: .4032 }];
  for (const gapSample of gaps) {
    const app = await appHarness({ version: 1, stageCatalog: STAGE_CATALOG,
      ownedBows: [0, 11], ownedArrows: [0, 11], bow: 11, arrow: 11, coins: 100, sound: false });
    await enterScene(app, 'rabbit');prepareAnimalCrossing(app);
    const { state } = app.api;
    const aimAt = target => ({ x: target.x + gapSample.x * target.radius * (target.direction < 0 ? -1 : 1),
      y: target.y - gapSample.y * target.radius, z: target.z });
    const draw = preciseMainDraw(app, { x: 0, y: 0 }, { aimAt });
    const params = app.api.shotParams(), forecast = targetIntercept(app.engine, params, state.stage, state.time, undefined, undefined, aimAt);
    const target = app.engine.targetAt(state.stage, state.time + forecast.flightTime), gap = aimAt(target);
    assert.ok(Math.hypot((gap.x - target.x) / target.rx, (gap.y - target.y) / target.ry) < 1,
      'the old ellipse would incorrectly have scored this exact blank-space shot');
    assert.equal(app.animals.scoreAnimalPoint(gap, target), null, gapSample.name);
    draw.pad.emit('pointerup', draw.coords);await app.flush();
    app.until(() => state.shot.targetPassed);
    assert.equal(state.mode, 'flight');assert.equal(state.shot.active, true);assert.equal(state.shot.result, null);
    assert.equal(state.shot.attachment, undefined);assert.equal(state.targetMarks.length, 0);
    assert.equal(state.score, 0);assert.equal(state.hits, 0);assert.equal(app.api.progress.coins, 100);
    const crossedZ = state.shot.position.z;app.frames(5);
    assert.ok(state.shot.position.z > crossedZ, 'the arrow travels beyond the animal instead of sticking in its empty bounding area');
    app.until(() => state.mode === 'settling');
    assert.equal(state.shot.result.type, 'ground');assert.equal(state.shot.result.score, 0);
    assert.equal(state.shot.attachment, undefined);assert.equal(state.shot.result.animalAttachment, undefined);
    assert.equal(state.targetMarks.length, 0);assert.equal(state.score, 0);assert.equal(state.hits, 0);
    assert.equal(app.api.progress.hits, 0);assert.equal(app.api.progress.shots, 1);assert.equal(app.api.progress.coins, 101,
      'only the established one-coin miss award applies, with no animal-hit award');
    assert.equal(state.stuck.length, 1);assert.ok(state.stuck[0].z > state.stage.distance);assert.ok(Math.abs(state.stuck[0].y) < 1e-8);
    app.api.onImpact();app.until(() => state.mode === 'ready');app.frames(30);
    assert.equal(state.targetMarks.length, 0);assert.equal(app.api.progress.hits, 0);assert.equal(app.api.progress.coins, 101);
  }
});

test('static and moving targets plus all six animal species carry arrows at the impact spot through hold and ready', async () => {
  for (const scene of ['static', 'moving', 'rabbit', 'wildcat', 'deer', 'pigeon', 'eagle', 'cheetah']) {
    const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 1, sound: false }));
    await enterScene(app, scene);
    app.api.state.time = 1.7;
    const offset = { x: .27, y: -.18 }, velocity = { x: 2, y: -3, z: 38 };
    const originalTarget = resolveTestHit(app, offset, velocity, app.animals.isAnimalKind(scene) ? 3 : 8);
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
    const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 1, sound: false }));
    await enterScene(app, scene);
    const state = app.api.state, duration = app.engine.targetAt(state.stage, 0).passDuration;
    state.time = duration - .02;
    const offset = { x: .27, y: -.18 }, original = resolveTestHit(app, offset, undefined, 3);
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
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 50, sound: false }));
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
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT,
    lastStage: lessonStageId('tracking-intro', 10), sound: false }));
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
  clearFixtureBefore(app, lessonStageId('tracking-intro', 20));app.api.startStage(lessonStageId('tracking-intro', 20));await app.flush();
  assert.equal(app.api.state.targetMarks.length, 0, 'a new stage clears only the previous target’s attachments');
});

test('obstacle stages automatically reveal the real target above every wall, ignore shots, then restore aim', async () => {
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 1, sound: false }));
  for (const template of app.engine.DISTANCE_STAGES.filter(stage => stage.obstacles.length)) {
    clearFixtureBefore(app, template.id);app.api.startStage(template.id);await app.flush();
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
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 1, sound: false }));
  for (const stage of app.engine.DISTANCE_STAGES.filter(stage => stage.obstacles.length === 0)) {
    clearFixtureBefore(app, stage.id);app.api.startStage(stage.id);await app.flush();
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
  const app = await appHarness(progressForStage({ version: 1, stageCatalog: STAGE_CATALOG, unlocked: STAGE_COUNT, lastStage: 1, sound: false,
    scopeLoadouts: { 0: { owned: [2], equipped: 2 } } }));
  await enterScene(app, 'wall');
  app.until(() => app.api.state.mode === 'ready');
  assert.equal(app.api.state.zoom, 2);
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

test('a real partial burst adds ten and eight while a single person collision invalidates the entire trigger',async()=>{
  for(const blocker of ['obstacle','person']){
    const app=await appHarness({version:1,stageCatalog:STAGE_CATALOG,ownedBows:[0,15],bow:15,coins:100,sound:false});
    const {state}=app.api,engine=app.engine;
    app.api.resetRound({...engine.DISTANCE_STAGES[0],radius:.6,obstacles:[],passers:[]});await app.flush();
    const draw=preciseMainDraw(app),params=app.api.shotParams(),side=engine.launchVolley(params)[2],z=5;
    const flightTime=-Math.log1p(-side.dragRate*z/side.velocity.z)/side.dragRate;
    const sideX=side.velocity.x*-Math.expm1(-side.dragRate*flightTime)/side.dragRate;
    if(blocker==='obstacle')state.stage.obstacles=[{x:sideX,z,width:.02,height:10,depth:.01}];
    else{
      const config={id:0,z,width:.02,height:10,depth:.01,passDuration:1e6,phase:.5};
      const person=engine.passersAt({...state.stage,passers:[config]},state.time+side.launchDelay+flightTime)[0];
      config.phase+=(sideX-person.x)/(person.velocityX*config.passDuration);state.stage.passers=[config];
    }
    const expected=Array.from(engine.launchVolley(params),shot=>engine.stepArrow(shot,8,state.stage,state.time+shot.launchDelay));
    assert.deepEqual(expected.map(result=>[result.type,result.score]),[['hit',10],['hit',8],[blocker,0]],'the fixture uses actual distinct collision trajectories');
    draw.pad.emit('pointerup',draw.coords);await app.flush();app.until(()=>state.mode==='settling');
    assert.deepEqual(Array.from(state.volley.shots,shot=>[shot.result.type,shot.result.score]),[['hit',10],['hit',8],[blocker,0]]);
    assert.equal(state.score,blocker==='person'?0:18);assert.deepEqual([...state.shotScores],[blocker==='person'?0:18]);
    assert.equal(state.used,1);assert.equal(state.arrowHits,2);assert.equal(state.hits,blocker==='person'?0:1);
    assert.equal(app.api.progress.coins,blocker==='person'?101:119,'each hit receives its score reward once, unless a person voids the trigger');
    if(blocker==='person'){assert.equal(state.shot.result.type,'person');assert.equal(state.cinematic,null);}
    else{assert.equal(state.shot.result.score,10);assert.ok(state.cinematic);assert.match(app.getElement('feedbackTitle').textContent,/합계.*18점/);}
    const results=JSON.stringify(Array.from(state.volley.shots,shot=>shot.result)),accounting=shotAccounting(app);
    app.api.onImpact();app.api.onImpact();assert.equal(JSON.stringify(Array.from(state.volley.shots,shot=>shot.result)),results);
    assert.deepEqual(shotAccounting(app),accounting,'a second impact callback cannot add any score or reward');
  }
});

test('mixing normal and three-arrow weapons keeps the actual 110-point maximum after equipment changes',async()=>{
  const app=await appHarness({version:1,stageCatalog:STAGE_CATALOG,ownedBows:[0,19],coins:100,sound:false});
  const {state}=app.api;
  for(const weapon of [19,0,19,0,19]){
    app.api.showShop('bow');app.api.equipItem(weapon);app.api.closeModal();await centeredShot(app);
  }
  assert.equal(state.mode,'finished');assert.equal(state.score,110);assert.equal(state.arrowHits,11);
  assert.deepEqual([...state.shotMaxScores],[30,10,30,10,30]);
  assert.equal(app.api.progress.coins,235);assert.equal(app.api.progress.best[1],110);
  const completion=app.ammo.requests.filter(request=>request.action==='round-complete');
  assert.equal(completion.length,1);assert.equal(completion[0].score,110);
  app.api.showShop('bow');app.api.equipItem(0);app.api.closeModal();
  assert.match(app.getElement('modalContent').innerHTML,/<strong>110<\/strong><em>\/ 110<\/em>/);
  assert.match(app.getElement('modalContent').innerHTML,/<strong>11<\/strong><em>\/ 11발<\/em>/);
  const resumed=await appHarness(app.snapshot(),{server:app.ammo});
  assert.equal(resumed.api.progress.bow,0);assert.equal(resumed.api.progress.best[1],110);
});

test('shop category buttons keep weapon, projectile and scope purchases in the correct inventories', async () => {
  const app = await appHarness({version: 1, stageCatalog: STAGE_CATALOG, firearmCatalog: 'snipers-bullets-v1',
    coins: 1000000, ownedBows: [0, 13, 22], bow: 0, ownedBullets: [0]});
  const click = (data, value) => {
    const button = app.getElement(`shop-${data}-${value}`);button.tagName = 'BUTTON';button.dataset[data] = String(value);
    app.document.emit('click', {target: button});
  };
  const html = () => app.getElement('modalContent').innerHTML;
  app.api.showShop('bow');
  assert.deepEqual([...html().matchAll(/data-shop-tab="([^"]+)"/g)].map(match => match[1]), ['bow', 'arrow', 'scope', 'coin']);
  assert.doesNotMatch(html(), /data-install-scope|data-install-laser/);
  assert.match(html(), /data-scope-weapon="13"/);
  click('shopTab', 'scope');
  assert.match(html(), /<option value="0" selected>/);
  assert.deepEqual([...html().matchAll(/data-scope-zoom="(\d+)"/g)].map(match => Number(match[1])), [2]);
  assert.deepEqual([...html().matchAll(/<option value="(\d+)"/g)].map(match => Number(match[1])), [0, 13, 22]);
  const before = app.snapshot(), selector = app.getElement('shopScopeWeapon');selector.tagName = 'SELECT';selector.value = '13';
  app.document.emit('change', {target: selector});
  assert.deepEqual(app.snapshot(), before, 'browsing another weapon never equips it or charges coins');
  assert.equal(app.document.activeElement, selector);
  assert.match(html(), /data-install-laser="13"/);
  const buy = app.getElement('shop-scope-buy');buy.tagName = 'BUTTON';buy.dataset.installScope = '13';buy.dataset.scopeZoom = '3';
  app.document.emit('click', {target: buy});
  assert.equal(app.api.progress.bow, 0);assert.equal(app.api.state.zoom, 1);
  assert.equal(app.api.progress.coins, before.coins - app.engine.getScopePrice(13, 3));
  assert.equal(app.api.equippedScope(13), 3);
  assert.match(html(), /data-shop-tab="scope" aria-pressed="true"/);
  assert.match(html(), /<option value="13" selected>/);
  click('shopTab', 'bow');click('scopeWeapon', 22);
  assert.match(html(), /<option value="22" selected>/);assert.doesNotMatch(html(), /data-install-laser/);
  assert.deepEqual([...html().matchAll(/data-scope-zoom="(\d+)"/g)].map(match => Number(match[1])), [2, 3, 6, 8]);
  click('shopTab', 'arrow');assert.match(html(), /data-equipment="arrow"/);
  const coins = app.api.progress.coins;click('equip', 1);
  assert.equal(app.api.progress.arrow, 1);assert.equal(app.api.progress.coins, coins - app.engine.ARROWS[1].price);
  click('projectileTab', 'bullet');click('equip', 3);
  assert.equal(app.api.progress.bullet, 3);assert.equal(app.api.progress.arrow, 1);
  assert.equal(app.api.progress.coins, coins - app.engine.ARROWS[1].price - app.engine.BULLETS[3].price);
  assert.match(html(), /data-shop-tab="arrow" aria-pressed="true"/);
  click('shopTab', 'bow');click('equip', 22);click('shopTab', 'arrow');
  assert.match(html(), /data-projectile-tab="bullet" aria-pressed="true"/, 'a gun opens its ammunition directly');
  click('projectileTab', 'arrow');assert.match(html(), /data-equipment="arrow"/);
  const restored = await appHarness(app.snapshot());
  assert.equal(restored.api.progress.arrow, 1);assert.equal(restored.api.progress.bullet, 3);assert.equal(restored.api.equippedScope(13), 3);
  const poor = await appHarness();poor.api.showShop('scope');
  assert.match(poor.getElement('modalContent').innerHTML, /data-install-scope="0"[^>]*disabled/);
  const unchanged = poor.snapshot();poor.api.installScope(0, 2);assert.deepEqual(poor.snapshot(), unchanged);
});

test('real ten- and eight-point shots pay the requested stage rewards once and save them', async () => {
  for (const [stage,score,coins] of [[1,10,10],[2,10,11],[3,10,12],[4,10,13],[11,10,20],[11,8,9],[12,10,21],[12,8,10],[13,10,22],[13,8,11]]) {
    const app=await appHarness(progressForStage({version:1,stageCatalog:STAGE_CATALOG,coins:100,lastStage:stage,sound:false}));
    const {state}=app.api;app.until(()=>state.mode==='ready');
    let offset = score===8 ? {x:-.3,y:0} : {x:0,y:0}, aimAt;
    if (state.stage.kind === 'rabbit') {
      prepareAnimalCrossing(app);
      offset = {x:0,y:0};
      if (score===8) {
        const target = app.engine.targetAt(state.stage,0);
        const head = app.animals.scoreAnimalPoint({x:target.x + .59*target.radius*target.direction,
          y:target.y + .1302*target.radius, z:target.z},target,0);
        aimAt = arriving => app.engine.getAnimalAttachmentPoint(arriving,head.animalAttachment);
      }
    }
    const draw = preciseMainDraw(app,offset,{aimAt});
    draw.pad.emit('pointerup',draw.coords);await app.flush();app.until(()=>state.mode==='settling');
    assert.equal(state.shot.result.score,score,`stage ${stage} actual hit`);
    assert.equal(app.api.progress.coins,100+coins,`stage ${stage}, score ${score}`);
    assert.equal(app.snapshot().coins,100+coins);assert.equal(state.earned,coins);
    app.api.onImpact();assert.equal(app.api.progress.coins,100+coins,'impact replay cannot pay twice');
  }
});


test('a stale game window cannot erase a coin exchange committed in another window', async () => {
 const app=await appHarness({version:1,stageCatalog:STAGE_CATALOG,coins:100,sound:false});
 const receipt='11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222';
 const credited={...app.snapshot(),coins:1100,coinExchangeReceipts:[receipt]};app.store.set(SAVE_KEY,JSON.stringify(credited));
 app.api.progress.coins+=10;assert.equal(app.api.save(),false);assert.deepEqual(app.snapshot(),credited);
 app.api.progress.sound=true;assert.equal(app.api.save(),false);assert.deepEqual(app.snapshot(),credited);
 const reopened=await appHarness(null,{store:app.store});assert.equal(reopened.api.progress.coins,1100);assert.equal(reopened.api.save(),true);
 assert.deepEqual([...reopened.api.progress.coinExchangeReceipts],[receipt]);
});


test('epoch 5 clears all former points, coins, equipment and purchase recovery once without reviving stale saves',async()=>{
  const owner='11111111-1111-4111-8111-111111111111',old=JSON.stringify({version:1,launchEpoch:4,stageCatalog:STAGE_CATALOG,firearmCatalog:FIREARM_CATALOG,coins:99999,bow:22,ownedBows:[0,20,21,22],ownedArrows:[0,18],ownedBullets:[0,3],lastStage:220,best:clearsBefore(221),mainRounds:99,shots:100,hits:80,coinExchangeReceipts:[owner+':22222222-2222-4222-8222-222222222222']});
  const store=new Map([['forest-archer-progress-single-v4',old],['forest-archer-ammo-pending-v4:'+owner,'{}'],['forest-archer-ammo-recovery-v4:'+owner,'{}'],['forest-archer-coin-exchange-v1:'+owner,JSON.stringify({requestId:'22222222-2222-4222-8222-222222222222',zu:10})],['another-game-progress','keep']]);
  const app=await appHarness(null,{store,guest:true});const saved=app.snapshot();
  assert.equal(saved.launchEpoch,5);assert.deepEqual([saved.coins,saved.mainRounds,saved.shots,saved.hits,saved.lastStage],[0,0,0,0,1]);
  assert.deepEqual(saved.ownedBows,[0]);assert.deepEqual(saved.ownedArrows,[0]);assert.deepEqual(saved.ownedBullets,[]);assert.deepEqual(saved.best,{});assert.deepEqual(saved.coinExchangeReceipts,[]);
  assert.equal(store.has('forest-archer-progress-single-v4'),false);assert.equal(store.has('forest-archer-coin-exchange-v1:'+owner),false);assert.equal(store.has('forest-archer-ammo-pending-v4:'+owner),false);assert.equal(store.has('forest-archer-ammo-recovery-v4:'+owner),false);assert.equal(store.get('another-game-progress'),'keep');
  app.api.showShop('bow');for(const id of [20,21,22])app.api.equipItem(id);assert.equal(app.api.activeBow().id,0);
  app.api.progress.coins=app.engine.BOWS[20].price;app.api.equipItem(20);assert.equal(app.api.activeBow().id,20);assert.equal(app.api.progress.coins,0);
  store.set('forest-archer-progress-single-v4',old);
  const reopened=await appHarness(null,{store,guest:true});assert.equal(reopened.api.activeBow().id,20);assert.equal(reopened.api.progress.coins,0);assert.equal(reopened.api.progress.lastStage,1);assert.equal(store.has('forest-archer-progress-single-v4'),false);
});

test('retired item-trial URLs cannot create equipment, open every stage or avoid paid purchases',async()=>{
  const app=await appHarness(null,{adminTrial:true,guest:true});
  assert.deepEqual(Array.from(app.api.progress.ownedBows),[0]);assert.deepEqual(Array.from(app.api.progress.ownedBullets),[]);
  assert.equal(app.api.progress.coins,0);app.api.startStage(220);assert.equal(app.api.state.stage.id,1);
  app.api.showShop('bow');for(const id of [20,21,22])app.api.equipItem(id);assert.equal(app.api.activeBow().id,0);
  assert.doesNotMatch(gameSource,/startAdminTrial|createTrialAmmoClient|모든 장비 무료 체험/);
});
