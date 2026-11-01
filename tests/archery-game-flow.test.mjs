/** Integration checks for the actual app handlers/state. No browser or browser driver. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const SAVE_KEY = 'forest-archer-progress-v1';
const engineSource = await readFile(new URL('../games/forest-archer/engine.mjs', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../games/forest-archer/view.mjs', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../games/forest-archer/game.mjs', import.meta.url), 'utf8');

async function appHarness(saved = null) {
  let now = 0, nextFrame = null, frameId = 0, timerId = 0;
  let viewport = { width: 1000, height: 600 }, sceneryFrame;
  const timers = new Map(), canvasText = [];
  const elements = new Map(), store = new Map(saved ? [[SAVE_KEY, JSON.stringify(saved)]] : []);
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const drawing = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    if (key === 'measureText') return () => ({ width: 20 });
    if (key === 'fillText' || key === 'strokeText') return value => canvasText.push(String(value));
    return noop;
  }, set(target, key, value) { target[key] = value; return true; } });
  let document;
  const makeElement = id => {
    const classes = new Set(), listeners = new Map();
    const el = {
      id, tagName: 'DIV', textContent: '', innerHTML: '', style: {}, dataset: {}, width: 420, height: 180,
      classList: { add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)), contains: v => classes.has(v), toggle(v, force) { const add = force ?? !classes.has(v); add ? classes.add(v) : classes.delete(v); return add; } },
      addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
      emit(type, properties = {}) { const event = { button: 0, pointerId: 1, clientX: 300, clientY: 400, currentTarget: el, target: el, preventDefault: noop, ...properties }; for (const fn of listeners.get(type) || []) fn(event); },
      getContext: () => drawing, getBoundingClientRect: () => ({ ...viewport, left: 0, top: 0 }),
      setPointerCapture: noop, releasePointerCapture: noop, setAttribute: noop,
      querySelectorAll: () => [], focus() { document.activeElement = el; }, closest() { return el.tagName === 'BUTTON' ? el : null; }
    };
    return el;
  };
  const getElement = id => { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); };
  const eventHub = () => {
    const listeners = new Map();
    return { addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); }, emit(type, properties = {}) { for (const fn of listeners.get(type) || []) fn({ preventDefault: noop, ...properties }); } };
  };
  document = { ...eventHub(), hidden: false, activeElement: null, body: { style: {} }, getElementById: getElement, querySelectorAll: () => [] };
  const window = eventHub();
  const fakeMath = Object.create(Math); fakeMath.random = () => 0.5;
  const context = vm.createContext({
    document, Math: fakeMath, console, performance: { now: () => now }, devicePixelRatio: 1,
    navigator: { vibrate: noop }, window,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) },
    requestAnimationFrame(fn) { nextFrame = fn; return ++frameId; },
    setTimeout(fn, delay = 0) { const id = ++timerId; timers.set(id, { due: now + Math.max(0, delay), fn }); return id; }, clearTimeout: id => timers.delete(id),
    ResizeObserver: class { constructor(fn) { this.fn = fn; } observe() {} }
  });
  const engine = new vm.SourceTextModule(engineSource, { context, identifier: 'engine.mjs' });
  const view = new vm.SourceTextModule(viewSource, { context, identifier: 'view.mjs' });
  const sceneryNames = ['drawScenery', 'drawAnimal', 'drawEquipmentIcon', 'drawFirstPersonBow'];
  const scenery = new vm.SyntheticModule(sceneryNames, function () { for (const name of sceneryNames) this.setExport(name, name === 'drawScenery' ? (_ctx, _w, _h, options) => { sceneryFrame = options; } : noop); }, { context });
  const game = new vm.SourceTextModule(gameSource + '\nexport const testApi = { state, get progress(){return progress;}, startStage, showShop, equipItem, closeModal, activeBow, activeArrow, aimAngles, effectiveSway, isSteady, get camera(){return camera;}, sceneItems, resize, project, onImpact };', { context, identifier: 'game.mjs' });
  await game.link(specifier => specifier.startsWith('./engine.mjs') ? engine : specifier.startsWith('./view.mjs') ? view : scenery);
  await game.evaluate();
  const api = game.namespace.testApi;
  return {
    api, engine: engine.namespace, view: view.namespace, getElement, store, document, window, canvasText,
    get viewport() { return { ...viewport }; },
    get sceneryFrame() { return sceneryFrame; },
    resize(width, height) { viewport = { width, height }; api.resize(); },
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

function startCenteredDraw(app) {
  const { api, engine } = app, state = api.state;
  const speed = engine.getSpeed({ charge: 1, bow: api.activeBow(), arrow: api.activeArrow(), velocityBias: 0 });
  const target = engine.targetAt(state.stage, state.time), d = target.z, dy = target.y - engine.PLAYER.y;
  const pitch = Math.atan((speed ** 2 - Math.sqrt(speed ** 4 - engine.GRAVITY * (engine.GRAVITY * d ** 2 + 2 * dy * speed ** 2))) / (engine.GRAVITY * d));
  const sensitivity = 1.05 / api.camera.focal;
  const coords = { clientX: 300 - state.aim.yaw / sensitivity, clientY: 400 - (pitch - state.aim.pitch) / sensitivity };
  const pad = app.getElement('drawPad');
  pad.emit('pointerdown');
  pad.emit('pointermove', coords);
  app.frames(78);
  return { pad, coords };
}

function centeredShot(app) {
  const { pad, coords } = startCenteredDraw(app);
  const before = app.api.state.used;
  assert.equal(app.api.state.mode, 'drawing');
  assert.equal(app.api.state.used, before);
  pad.emit('pointerup', coords);
  assert.equal(app.api.state.mode, 'flight');
  assert.equal(app.api.state.used, before + 1);
  app.until(() => ['ready', 'finished'].includes(app.api.state.mode));
}

test('pointer hold waits for release and pointer cancellation never consumes an arrow', async () => {
  const app = await appHarness();
  const { pad, coords } = startCenteredDraw(app);
  assert.equal(app.api.state.mode, 'drawing');
  assert.equal(app.api.state.shot, null);
  assert.equal(app.api.state.used, 0);
  pad.emit('pointercancel');
  assert.equal(app.api.state.mode, 'ready');
  assert.equal(app.api.state.used, 0);
  pad.emit('pointerup', coords);
  assert.equal(app.api.state.shot, null);
  centeredShot(app);
  assert.equal(app.api.state.score, 10);
  assert.equal(app.api.progress.shots, 1);
  assert.equal(Number(app.getElement('scoreCount').textContent), 10);
});

test('five actual shots complete the stage, award coins, unlock and restore the next selected stage', async () => {
  const app = await appHarness();
  for (let shot = 0; shot < 5; shot++) centeredShot(app);
  assert.equal(app.api.state.mode, 'finished');
  assert.equal(app.api.state.score, 50);
  assert.equal(app.api.progress.coins, 75);
  assert.equal(app.api.progress.unlocked, 2);
  assert.equal(app.api.progress.best[1], 50);
  assert.equal(app.api.state.modal, 'result');
  assert.match(app.getElement('modalContent').innerHTML, /다음 숲길이 열렸어요/);
  app.api.startStage(2);
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
  const app = await appHarness({ version: 1, coins: 220, ownedBows: [0], ownedArrows: [0], unlocked: 1, lastStage: 1, sound: false });
  app.api.showShop('bow');
  app.api.equipItem(1);
  assert.equal(app.api.progress.coins, 120);
  assert.equal(app.api.progress.bow, 1);
  assert.equal(app.api.progress.ownedBows.filter(id => id === 1).length, 1);
  app.api.equipItem(0);
  app.api.equipItem(1);
  assert.equal(app.api.progress.coins, 120);
  app.api.showShop('arrow');
  app.api.equipItem(1);
  assert.equal(app.api.progress.coins, 45);
  const reloaded = await appHarness(app.snapshot());
  assert.equal(reloaded.api.progress.bow, 1);
  assert.equal(reloaded.api.progress.arrow, 1);
  assert.equal(reloaded.api.progress.coins, 45);
});

test('unowned equipment cannot be used without purchase and normal rounds remain five shots', async () => {
  const app = await appHarness();
  for (const kind of ['bow', 'arrow']) {
    app.api.showShop(kind);
    app.api.equipItem(3);
    assert.equal(app.api.progress[kind], 0);
    assert.equal(app.api.progress.coins, 0);
    assert.equal(kind === 'bow' ? app.api.activeBow().id : app.api.activeArrow().id, 0);
    assert.equal(app.api.progress[kind === 'bow' ? 'ownedBows' : 'ownedArrows'].length, 1);
    assert.match(app.getElement('modalContent').innerHTML, /data-equip="3" disabled/);
  }
  app.api.closeModal();
  assert.equal(app.getElement('shotCountLabel').textContent, '5발 남음');
  for (let shot = 0; shot < 5; shot++) centeredShot(app);
  assert.equal(app.api.state.used, 5);
  assert.equal(app.api.state.mode, 'finished');
  assert.equal(app.api.state.score, 50);
  assert.equal(app.api.progress.coins, 75);
  assert.equal(app.api.progress.bow, 0);
  assert.equal(app.api.progress.arrow, 0);
  const saved = app.snapshot();
  saved.bow = 3; saved.arrow = 3;
  const reloaded = await appHarness(saved);
  assert.equal(reloaded.api.activeBow().id, 0);
  assert.equal(reloaded.api.activeArrow().id, 0);
  assert.equal(reloaded.api.progress.coins, 75);
});

test('real-time deadline waits through 9.9 seconds, auto-fires once at ten and ignores later releases', async () => {
  const app = await appHarness(), pad = app.getElement('drawPad');
  pad.emit('pointerdown');
  app.advanceTo(9900);
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
  assert.equal(app.api.state.held, 10);
  assert.equal(app.api.state.charge, 1);
  pad.emit('pointerup');pad.emit('lostpointercapture');
  app.document.emit('keyup', { code: 'Space' });
  assert.equal(app.api.state.shot, shot);
  assert.equal(app.api.state.used, 1);
  app.until(() => app.api.state.mode === 'ready');
  pad.emit('pointerup');
  assert.equal(app.api.state.used, 1);
});

test('frame fallback uses elapsed time when timer delivery is delayed', async () => {
  const app = await appHarness(), pad = app.getElement('drawPad');
  pad.emit('pointerdown');
  app.advanceTo(9900, { runTimers: false });
  assert.equal(app.api.state.used, 0);
  app.advanceTo(10000, { runTimers: false });
  assert.equal(app.api.state.used, 1);
  assert.equal(app.api.state.shot.startedAt, 10000);
  assert.equal(app.api.state.shot.elapsed, 0, 'a new shot cannot simulate time before it was fired');
  const sceneAtRelease = app.api.state.time;
  app.advanceTo(10100);
  assert.ok(Math.abs(app.api.state.shot.elapsed - 0.032) < 1e-12, 'the first auto-shot frame is already at 0.32 speed');
  assert.ok(Math.abs(app.api.state.time - sceneAtRelease - 0.032) < 1e-12, 'moving scenery shares the first slowed frame');
  pad.emit('pointerup');
  assert.equal(app.api.state.used, 1);
});

test('a fresh random steady window lasts exactly 0.5 seconds while normal sway continues outside it', async () => {
  const app = await appHarness(), pad = app.getElement('drawPad');
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

test('manual aiming still moves during stability and release uses the exact stable direction', async () => {
  const app = await appHarness(), pad = app.getElement('drawPad');
  const sequence = [0.5, 0];app.setRandom(() => sequence.length ? sequence.shift() : 0.8);
  pad.emit('pointerdown');app.advanceTo(1200);
  assert.equal(app.api.isSteady(), true);
  assert.ok(Math.hypot(app.api.state.sway.x, app.api.state.sway.y) > 0, 'underlying random motion is present');
  const originalYaw = app.api.state.aim.yaw;
  const coordinates = { clientX: 360, clientY: 380 };
  pad.emit('pointermove', coordinates);
  assert.ok(app.api.state.aim.yaw > originalYaw);
  const aim = { ...app.api.aimAngles() };
  pad.emit('pointerup', coordinates);
  const v = app.api.state.shot.velocity;
  assert.ok(Math.abs(Math.atan2(v.x, v.z) - aim.yaw) < 1e-12);
  assert.ok(Math.abs(Math.atan2(v.y, Math.hypot(v.x, v.z)) - aim.pitch) < 1e-12);
  assert.equal(app.api.state.shot.automatic, false);
  app.advanceTo(10000);
  assert.equal(app.api.state.used, 1, 'manual release must clear the automatic timer');
});

test('cancel, blur and a hidden document clear the ten-second deadline safely', async () => {
  for (const reason of ['pointercancel', 'blur', 'hidden']) {
    const app = await appHarness(), pad = app.getElement('drawPad');
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
  const app = await appHarness({ version: 1, unlocked: 12, lastStage: 1, sound: false });
  for (const stage of app.engine.STAGES) {
    app.api.startStage(stage.id);
    app.until(() => app.api.state.mode === 'ready');
    const pad = app.getElement('drawPad');
    pad.emit('pointerdown');app.frames(78);pad.emit('pointerup');
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
  const { api } = app, state = api.state, pad = app.getElement('drawPad');
  const sensitivity = (app.viewport.width < 500 ? 1.35 : 1.05) / api.camera.focal;
  const coords = { clientX: 300 + (.18 - state.aim.yaw) / sensitivity, clientY: 400 - (.44 - state.aim.pitch) / sensitivity };
  pad.emit('pointerdown');pad.emit('pointermove', coords);app.frames(78);
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
    const { pad, coords } = outcome === 'hit' ? startCenteredDraw(app) : startHighMiss(app);
    const originalCamera = { ...app.api.camera }, originalAim = { ...app.api.state.aim };
    const originalPan = [app.api.state.panX, app.api.state.panY], releaseTime = app.now;
    pad.emit('pointerup', coords);
    app.until(() => app.api.state.shot.position.z > 9);
    assert.equal(app.api.state.mode, 'flight');
    assert.ok(app.api.camera.z > 0, 'the main camera moves forward through the range');
    assert.ok(app.api.camera.z < app.api.state.shot.position.z);
    assert.equal(app.getElement('gameCanvas').dataset.camera, 'follow');
    assertVisibleFlight(app);
    app.until(() => app.api.state.mode === 'settling');
    const shot = app.api.state.shot;
    assert.equal(shot.result.type, outcome);
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
  pad.emit('pointerup', coords);
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
  const app = await appHarness({ version: 1, unlocked: 12, lastStage: 1, sound: false });
  for (const [stageId, blockerKind] of [[1, 'target'], [8, 'wall']]) {
    app.api.startStage(stageId);
    app.until(() => app.api.state.mode === 'ready');
    const state = app.api.state, target = app.engine.targetAt(state.stage, state.time);
    const plane = blockerKind === 'target' ? target.z : state.stage.obstacles[0].z - state.stage.obstacles[0].depth / 2;
    state.mode = 'flight';
    state.shot = {
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
  const app = await appHarness({ version: 1, unlocked: 12, lastStage: 8, sound: false });
  app.until(() => app.api.state.mode === 'ready');
  const state = app.api.state, wall = state.stage.obstacles[0], target = app.engine.targetAt(state.stage, state.time);
  const front = wall.z - wall.depth / 2, back = wall.z + wall.depth / 2, height = wall.height + .12;
  state.mode = 'flight';
  state.shot = {
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
function resolveTestHit(app, offset, velocity = { x: 2, y: -3, z: 38 }) {
  const { state } = app.api, target = app.engine.targetAt(state.stage, state.time);
  const point = { x: target.x + offset.x, y: target.y + offset.y, z: target.z };
  state.shot = {
    ...app.engine.launchArrow(), position: { ...point }, velocity: { ...velocity }, elapsed: .9,
    active: false, handled: false, trail: [{ ...app.engine.PLAYER }, { ...point }],
    result: { type: 'hit', point, targetCenter: target, score: 8, flightTime: .9, zone: '명중' }
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

test('static targets, moving targets, birds and deer carry their arrows at the impact spot through hold and ready', async () => {
  for (const stageId of [1, 5, 6, 7]) {
    const app = await appHarness({ version: 1, unlocked: 12, lastStage: stageId, sound: false });
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
    if (stageId !== 1) assert.ok(Math.abs(movedTarget.x - originalTarget.x) > .1, 'the target has actually moved after impact');
    assert.equal(app.api.state.targetMarks.length, 1, 'returning the camera does not erase the attachment');
  }
});

test('multiple arrows on a moving target preserve separate impact offsets and entry angles', async () => {
  const app = await appHarness({ version: 1, unlocked: 12, lastStage: 5, sound: false });
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
  app.api.startStage(6);
  assert.equal(app.api.state.targetMarks.length, 0, 'a new stage clears only the previous target’s attachments');
});

test('obstacle stages automatically reveal the real target above every wall, ignore shots, then restore aim', async () => {
  const app = await appHarness({ version: 1, unlocked: 12, lastStage: 1, sound: false });
  for (const stageId of [8, 9, 11, 12]) {
    app.api.startStage(stageId);
    const { state } = app.api, baseCamera = { ...app.api.camera }, originalAim = { ...state.aim }, previewStart = app.now;
    const preview = app.getElement('previewBtn'), pad = app.getElement('drawPad');
    assert.equal(state.mode, 'preview', `stage ${stageId} starts with its overview`);
    assert.equal(preview.classList.contains('hidden'), false);
    assert.equal(preview.textContent, '조준하기');
    pad.emit('pointerdown');pad.emit('pointermove', { clientX: 500, clientY: 200 });pad.emit('pointerup');
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
  const app = await appHarness({ version: 1, unlocked: 12, lastStage: 1, sound: false });
  for (const stage of app.engine.STAGES.filter(stage => stage.obstacles.length === 0)) {
    app.api.startStage(stage.id);
    assert.equal(app.api.state.mode, 'ready');
    assert.equal(app.getElement('previewBtn').classList.contains('hidden'), true);
    app.getElement('previewBtn').emit('click');
    assert.equal(app.api.state.mode, 'ready', 'a hidden control cannot start an irrelevant preview');
    const pad = app.getElement('drawPad');pad.emit('pointerdown');
    assert.equal(app.api.state.mode, 'drawing');pad.emit('pointercancel');
    assert.equal(app.api.state.used, 0);
  }
});

test('manual overview cancels a drawn arrow, allows an early return, preserves pan/zoom and is disabled in flight', async () => {
  const app = await appHarness({ version: 1, unlocked: 12, lastStage: 8, sound: false });
  app.until(() => app.api.state.mode === 'ready');
  app.getElement('zoomBtn').emit('click');
  const pad = app.getElement('drawPad'), preview = app.getElement('previewBtn');
  pad.emit('pointerdown');pad.emit('pointermove', { clientX: 850, clientY: 50 });app.frames(18);
  assert.equal(app.api.state.mode, 'drawing');assert.equal(app.api.state.zoom, 2);
  assert.ok(app.api.state.panX !== 0 || app.api.state.panY !== 0, 'the saved view includes actual aiming pan');
  const baseCamera = { ...app.api.camera }, originalAim = { ...app.api.state.aim };
  const originalPan = [app.api.state.panX, app.api.state.panY];
  preview.emit('click');
  assert.equal(app.api.state.mode, 'preview');assert.equal(app.api.state.used, 0);assert.equal(app.api.state.shot, null);
  pad.emit('pointerup');app.frames(9);
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
  pad.emit('pointerdown');app.frames(10);pad.emit('pointerup');
  assert.equal(app.api.state.mode, 'flight');assert.equal(preview.disabled, true);
  preview.emit('click');assert.equal(app.api.state.mode, 'flight');
  app.until(() => app.api.state.mode === 'settling');
  assert.equal(preview.disabled, true);preview.emit('click');assert.equal(app.api.state.mode, 'settling');
  app.until(() => app.api.state.mode === 'ready');
  assert.equal(preview.disabled, false);
});
