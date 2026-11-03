const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
let source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
source = source.replaceAll('import.meta.env', '({})').replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
source = source.slice(0, source.indexOf('j1(()=>H());gm('));
source += '\nwindow.recommendationEntry={auth:D,actions:sr,open:openWorldGameLink,close:El,setupNavigation:gm,setClient:client=>S=client};';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture() {
  const dom = new JSDOM('<div id="app"></div><div id="modal-root"></div><div id="toast"></div>', { url: 'https://ojjuda.kr/world.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  w.OjjudaGameAssets = { ready: () => true, load: async () => {} };
  w.eval(source);
  const created = [], events = [];
  let canClose = true, opened = false, navigation;
  w.OjjudaRecommendedRestaurants = { create(options) {
    created.push(options);
    return {
      open() { opened = true; events.push(['open', options.getUser()?.id || null]); },
      close() { events.push(['close']); if (canClose) opened = false; return canClose; },
      destroy() { events.push(['destroy']); opened = false; },
      isOpen: () => opened,
      back() { events.push(['back']); return true; }
    };
  } };
  w.OjjudaWorldNavigation = { install(options) { navigation = options; return {}; } };
  return { dom, w, api: w.recommendationEntry, created, events, blockClose: () => { canClose = false; }, navigation: () => navigation };
}

(async () => {
  const f = fixture();
  try {
    const client = { rpc() { throw Error('Entry must not make member requests'); } };
    f.api.setClient(client);
    f.api.auth.online = false; f.api.auth.user = null;
    f.api.open('recommendations');
    assert.equal(f.created.length, 1, 'the menu lazily creates one recommendation module');
    assert.equal(f.created[0].client, client);
    assert.deepEqual(f.events.at(-1), ['open', null], 'a guest reaches the module login state without a fabricated identity');
    let logins = 0;
    f.api.actions['account-login'] = () => { logins++; };
    f.created[0].onLogin();
    assert.equal(logins, 1, 'the member prompt uses the established account login action');
    f.api.auth.online = true; f.api.auth.user = { id: 'member-a' };
    f.api.open('recommendations');
    assert.equal(f.created.length, 1, 'reentry reuses the current client instance');
    assert.deepEqual(f.events.at(-1), ['open', 'member-a']);
    f.api.auth.user = { id: 'member-b' };
    assert.equal(f.created[0].getUser().id, 'member-b', 'the module receives the current identity, not a captured account');
    const nextClient = {};
    f.api.setClient(nextClient); f.api.open('recommendations');
    assert.equal(f.created.length, 2); assert.equal(f.created[1].client, nextClient);
    assert.ok(f.events.some(event => event[0] === 'destroy'), 'replacing the client destroys the old module');
    await f.api.setupNavigation(() => {});
    assert.equal(f.navigation().closeOverlay(), true);
    assert.deepEqual(f.events.at(-1), ['back'], 'browser and Android Back delegate to the module view history');
    f.blockClose();
    let others = 0;
    f.w.OjjudaRestaurantGuide = { open() { others++; } };
    f.api.open('restaurants');
    assert.equal(others, 0, 'a protected pending editor cannot be discarded by launching another menu');
    assert.equal(f.api.close(), false);
  } finally { f.dom.window.close(); }

  const race = fixture();
  try {
    let release, ready = false;
    race.w.OjjudaGameAssets = { ready: () => ready, load: () => new Promise(resolve => { release = resolve; }) };
    race.api.auth.online = true; race.api.auth.user = { id: 'member-a' };
    race.api.open('recommendations');
    assert.equal(race.created.length, 0);
    race.api.auth.user = { id: 'member-b' }; ready = true; release();
    await tick(); await tick();
    assert.equal(race.created.length, 0, 'an asset response for the previous account cannot open the menu');
    race.api.open('recommendations');
    assert.deepEqual(race.events.at(-1), ['open', 'member-b']);
  } finally { race.dom.window.close(); }
  console.log('PASS: recommendation route, guest login handoff, current identity, client replacement, native/browser Back, pending-editor protection and asset/account race');
})().catch(error => { console.error(error); process.exitCode = 1; });
