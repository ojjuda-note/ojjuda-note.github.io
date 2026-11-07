'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 55));
const fixture = html => new JSDOM(`<!doctype html><body>${html}</body>`, {
  url: 'https://ojjuda.kr/world.html', runScripts: 'outside-only', pretendToBeVisual: true
});

test('ordinary World redraws do not reinitialize game-entry icons', async () => {
  const dom = fixture('<main id="app"></main>');
  const w = dom.window;
  const original = w.document.querySelectorAll.bind(w.document);
  let scans = 0;
  w.document.querySelectorAll = selector => {
    if (selector.includes('.game-entry')) scans++;
    return original(selector);
  };
  try {
    w.eval(source('shared/games/game-entry.js'));
    await settle();
    const initial = scans;
    const app = w.document.getElementById('app');
    for (let i = 0; i < 20; i++) app.append(w.document.createElement('aside'));
    await settle();
    assert.equal(scans, initial, 'unrelated child nodes must not trigger a document-wide game scan');

    app.insertAdjacentHTML('beforeend', '<div class="game-entry" data-entry-key="screw"><span class="ge-icon">🔩</span></div>');
    await settle();
    const entry = app.querySelector('.game-entry');
    assert.equal(entry.dataset.entryReady, 'true');
    assert.equal(entry.querySelector('.ge-icon').dataset.iconReady, 'true');
    assert.ok(scans > initial, 'new game markup still initializes normally');
  } finally { w.close(); }
});

test('arcade sorting ignores unrelated DOM changes but reacts to cards and visibility', async () => {
  const dom = fixture('<div id="app"><div data-arcade-games="solo"><button class="gbtn" data-v="runner"><span class="ge"></span></button></div></div>');
  const w = dom.window;
  const observers = [], OriginalObserver = w.MutationObserver;
  w.MutationObserver = class extends OriginalObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  const frames = [], originalFrame = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = callback => {
    const id = originalFrame(callback); frames.push(id); return id;
  };
  const original = w.getComputedStyle.bind(w);
  let layouts = 0;
  w.getComputedStyle = (...args) => { layouts++; return original(...args); };
  try {
    w.eval(source('features/arcade/arcade-promotions.js'));
    await settle();
    const initial = layouts, app = w.document.getElementById('app');
    for (let i = 0; i < 20; i++) {
      const node = w.document.createElement('aside');
      app.append(node);
      node.className = 'unrelated';
    }
    await settle();
    assert.equal(layouts, initial, 'unrelated activity must not recalculate every game card layout');

    const list = app.querySelector('[data-arcade-games]');
    list.insertAdjacentHTML('beforeend', '<button class="gbtn" data-v="mole"><span class="ge"></span></button>');
    await settle();
    assert.ok(layouts > initial, 'a new card is ordered');
    const afterInsert = layouts;
    list.querySelector('[data-v="mole"]').hidden = true;
    await settle();
    assert.ok(layouts > afterInsert, 'visibility changes still update the catalog');
  } finally {
    observers.forEach(observer => observer.disconnect());
    frames.forEach(id => w.cancelAnimationFrame(id));
    await settle();
    w.close();
  }
});

test('multiplayer entrances ignore unrelated DOM churn and retain their close controls', async () => {
  const dom = fixture('<main id="app"></main>');
  const w = dom.window;
  const original = w.document.querySelectorAll.bind(w.document);
  let scans = 0;
  w.document.querySelectorAll = selector => {
    if (selector.includes('.mp-board-host')) scans++;
    return original(selector);
  };
  try {
    w.eval(source('shared/games/multiplayer-entry.js'));
    await settle();
    const initial = scans, app = w.document.getElementById('app');
    for (let i = 0; i < 20; i++) app.append(w.document.createElement('aside'));
    await settle();
    assert.equal(scans, initial, 'unrelated World activity must not rescan game hosts');

    app.insertAdjacentHTML('beforeend', '<div class="modal-bg"><div class="ge-board-entry"><button data-act="close">닫기</button></div></div>');
    await settle();
    const host = app.querySelector('.modal-bg');
    assert.equal(host.querySelectorAll('.mp-entry-bar').length, 1);
    assert.ok(scans > initial);
    host.querySelector('.ge-board-entry').remove();
    await settle();
    assert.equal(host.querySelector('.mp-entry-bar'), null, 'closed entries still clean up');
  } finally { w.close(); }
});
