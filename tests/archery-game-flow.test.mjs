/** Integration checks for the actual app handlers/state. No browser or browser driver. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const SAVE_KEY = 'forest-archer-progress-v1';
const engineSource = await readFile(new URL('../games/forest-archer/engine.mjs', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../games/forest-archer/game.mjs', import.meta.url), 'utf8');

async function appHarness(saved = null) {
  let now = 0, nextFrame = null, frameId = 0, timerId = 0;
  const timers = new Map();
  const elements = new Map(), store = new Map(saved ? [[SAVE_KEY, JSON.stringify(saved)]] : []);
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const drawing = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    if (key === 'measureText') return () => ({ width: 20 });
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
      getContext: () => drawing, getBoundingClientRect: () => ({ width: 1000, height: 600, left: 0, top: 0 }),
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
  const sceneryNames = ['drawScenery', 'drawAnimal', 'drawEquipmentIcon', 'drawFirstPersonBow'];
  const scenery = new vm.SyntheticModule(sceneryNames, function () { for (const name of sceneryNames) this.setExport(name, noop); }, { context });
  const game = new vm.SourceTextModule(gameSource + '\nexport const testApi = { state, get progress(){return progress;}, startStage, showShop, equipItem, closeModal, activeBow, activeArrow, aimAngles, effectiveSway, isSteady, get camera(){return camera;} };', { context, identifier: 'game.mjs' });
  await game.link(specifier => specifier.startsWith('./engine.mjs') ? engine : scenery);
  await game.evaluate();
  const api = game.namespace.testApi;
  return {
    api, engine: engine.namespace, getElement, store, document, window,
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
  app.advanceTo(10100);
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
