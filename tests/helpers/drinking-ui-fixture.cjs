'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const root = path.join(__dirname, '../..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check, label, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw Error('Timed out: ' + label);
}
function rpcArgs(name, args = {}) {
  if (name === 'party_live_multiplayer' || name === 'party_vote_multiplayer') {
    return [args.p_kind, args.p_action, args.p_code || '', args.p_options || {}];
  }
  return [args.p_action, args.p_code || '', args.p_options || {}];
}

async function screen({url = '/games/drinking/?mode=multi', actor = 'member-a', rpc, gate = false, scripts, prepare} = {}) {
  const pageUrl = new URL(url, 'https://fixture.test');
  const pathname = pageUrl.pathname.endsWith('/') ? pageUrl.pathname + 'index.html' : pageUrl.pathname;
  const errors = [], navigations = [], calls = [], timers = new Map(), authListeners = new Set();
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (/Not implemented: navigation/.test(error.message)) navigations.push(error);
    else errors.push(error);
  });
  const dom = new JSDOM(fs.readFileSync(path.join(root, pathname), 'utf8'), {
    url: pageUrl.href, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
  });
  const w = dom.window;
  await tick();
  let now = 100000, hidden = false, online = true, serial = 0, closed = false;
  let currentActor = actor, identityError = null;
  const accessListeners = new Set();
  Object.defineProperty(w.document, 'hidden', {get: () => hidden, configurable: true});
  Object.defineProperty(w.navigator, 'onLine', {get: () => online, configurable: true});
  Object.defineProperty(w.performance, 'now', {value: () => now, configurable: true});
  w.Date.now = () => 1800000000000 + now;
  w.Math.random = () => .5;
  w.setTimeout = (callback, delay) => {
    const id = ++serial;
    timers.set(id, {callback, at: now + Number(delay || 0)});
    return id;
  };
  w.clearTimeout = id => timers.delete(id);
  w.requestAnimationFrame = callback => w.setTimeout(() => callback(now), 16);
  w.cancelAnimationFrame = id => w.clearTimeout(id);
  w.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  // JSDOM has no audio device; sound playback is outside these network tests.
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.confirm = () => true;
  w.structuredClone = structuredClone;
  const session = () => currentActor ? {user: {id: currentActor, is_anonymous: false}} : null;
  const client = {
    auth: {
      getSession: async () => ({data: {session: session()}, error: null}),
      getUser: async () => ({data: {user: session()?.user || null}, error: null}),
      onAuthStateChange(listener) { authListeners.add(listener); return {data: {subscription: {unsubscribe: () => authListeners.delete(listener)}}}; }
    },
    rpc(name, args) {
      let request;
      function execute(signal) {
        if (request) return request;
        const call = {name, args, signal, actor: currentActor, started: now, settled: false};
        calls.push(call);
        request = Promise.resolve().then(() => rpc ? rpc(name, args || {}, call) : {data: {}, error: null})
          .then(result => result && (Object.hasOwn(result, 'data') || Object.hasOwn(result, 'error')) ? result : {data: result, error: null})
          .finally(() => { call.settled = true; });
        // The fake transport intentionally ignores abort, exercising the real
        // connection manager's stale-result defense as well as its signal.
        return request;
      }
      return {abortSignal: execute, then: (yes, no) => execute().then(yes, no)};
    }
  };
  w.OjjudaGetClient = async () => client;
  w.OjjudaMatgoAccess = {
    configure() {},
    subscribe(listener) { accessListeners.add(listener); return () => accessListeners.delete(listener); },
    async check() {
      if (identityError) {
        for (const listener of accessListeners) listener(identityError);
        throw identityError;
      }
      return {userId: currentActor, age: 25};
    }
  };
  if (prepare) prepare(w);
  function evaluate(src) {
    const file = new URL(src, pageUrl).pathname;
    w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  if (gate) {
    // Execute dynamic scripts in the same realm as the actual gate would. The
    // network and age service are controlled; the gate and room code are real.
    const append = w.document.head.append.bind(w.document.head);
    w.document.head.append = (...nodes) => {
      append(...nodes);
      for (const node of nodes) if (node.tagName === 'SCRIPT' && node.src) {
        Promise.resolve().then(() => { evaluate(node.src); node.onload?.(); }).catch(error => { errors.push(error); node.onerror?.(); });
      }
    };
    evaluate('/games/drinking/access.js');
  } else {
    const content = w.document.getElementById('access-content');
    const template = w.document.getElementById('access-page');
    if (template.dataset.kind) w.document.documentElement.dataset.game = template.dataset.kind;
    content.replaceChildren(template.content.cloneNode(true)); content.hidden = false;
    w.document.getElementById('access-screen').hidden = true;
    const sources = scripts || [...content.querySelectorAll('[data-module]')].map(node => node.dataset.module);
    content.querySelectorAll('[data-module]').forEach(node => node.remove());
    if (!sources.some(src => src.includes('connection.js'))) evaluate('/games/drinking/connection.js');
    for (const src of sources) evaluate(src);
  }
  async function advance(duration) {
    const end = now + duration;
    for (let count = 0; count < 2000; count++) {
      const due = [...timers].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) { now = end; await tick(); return; }
      now = due[1].at; timers.delete(due[0]); due[1].callback();
      await tick(); await tick();
    }
    throw Error('Unexpected timer loop in ' + url);
  }
  const find = selector => w.document.querySelector(selector);
  return {
    w, client, calls, errors, navigations, timers, find, advance,
    get now() { return now; },
    click(selector) { const node = find(selector); assert.ok(node, selector); assert.equal(node.disabled, false, selector); node.click(); },
    submit(selector) { const node = find(selector); assert.ok(node, selector); node.dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true})); },
    async wake() { w.dispatchEvent(new w.Event('focus')); await advance(0); await tick(); },
    async hidden(value) { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); await advance(0); },
    async online(value) { online = value; w.dispatchEvent(new w.Event(value ? 'online' : 'offline')); await advance(0); },
    async event(name) { w.dispatchEvent(new w.Event(name)); await advance(0); },
    async account(id) {
      currentActor = id;
      for (const listener of authListeners) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT', session());
      await tick();
    },
    identityFailure(code) { identityError = code ? Object.assign(Error(code), {code}) : null; },
    close() { if (!closed) { closed = true; w.dispatchEvent(new w.Event('pagehide')); w.close(); timers.clear(); } }
  };
}

module.exports = {screen, until, tick, rpcArgs, root};
