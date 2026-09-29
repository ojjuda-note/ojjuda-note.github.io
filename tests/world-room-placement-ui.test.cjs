const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
// Run the complete production renderer/actions offline; replace only auth/app boot
// and external scripts. No fixture can contact a real account or buy an item.
world = world.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
window.roomTest={get model(){return $},get state(){return g},get catalog(){return q},get shop(){return W},get auth(){return D},
 actions:sr,render:H,refresh:ut,save:Ti,storageKey:gr,draft:roomPlacementDraft,items:roomPlacementItems,serverModel:()=>mi($),
 select(id){g.sel=id;ut()},setBuyer(fn){Fc=fn}};
g.tab="deco";H();` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const context = await browser.newContext({viewport: {width: 660, height: 768}, hasTouch: true, reducedMotion: 'reduce'});
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'fixture.test') return route.abort();
      if (url.pathname === '/world.html') return route.fulfill({contentType: 'text/html', body: world});
      const file = path.join(root, url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({path: file});
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(() => window.roomTest && document.querySelector('#room-svg'));
    const reset = async () => page.evaluate(() => {
      const t = roomTest, m = t.model, g = t.state;
      clearTimeout(g.saveT);
      m.roomIdx = 0;
      m.rooms[0] = {...m.rooms[0], items: [
        {id: 'desk-test', type: 'desk', gx: 2, gy: 2, r: 0},
        {id: 'wall-test', type: 'window', wall: 'L', t: 4, z: 90}
      ]};
      m.room = m.rooms[0]; m.petBank = {}; m.coins = 500;
      g.roomPlacement = null; g.sel = null; g.drag = null; g.tryOn = null; g.zoom = null;
      g.tab = 'deco'; g.decoMode = 'room'; t.auth.user = null;
      t.render(); window.scrollTo(0, 0);
    });
    const click = action => page.locator(`[data-act="${action}"]`).first().click();
    const snapshot = () => page.evaluate(() => JSON.stringify(roomTest.model.room.items));
    await reset();
    const initial = await snapshot();
    const box = await page.locator('[data-item="desk-test"]').boundingBox();
    // Trusted touch events exercise production pointer capture, hit testing and drag.
    const cdp = await context.newCDPSession(page);
    const start = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...start, id: 1}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: start.x + 55, y: start.y + 28, id: 1}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    assert.ok(await page.evaluate(() => roomTest.draft()), 'touch drag creates a preview');
    assert.notEqual(await page.evaluate(() => JSON.stringify(roomTest.items())), initial);
    assert.equal(await snapshot(), initial, 'touch release must not save');
    await page.getByRole('button', {name: '확인', exact: true}).waitFor({state: 'visible'});
    assert.equal(await page.locator('#placement-actions').evaluate(el => el.getBoundingClientRect().bottom < innerHeight - 55), true, 'confirmation is revealed above phone navigation');
    const unconfirmed = await page.evaluate(() => {
      // Both pagehide and an unrelated save must serialize the committed room only.
      window.dispatchEvent(new Event('pagehide'));
      roomTest.model.room.wall = '#abcdef'; roomTest.save();
      return {stored: JSON.parse(localStorage.getItem(roomTest.storageKey)).rooms[0].items,
        server: roomTest.serverModel().profile.room, live: roomTest.model.room.items};
    });
    assert.equal(JSON.stringify(unconfirmed.stored), initial);
    assert.equal(JSON.stringify(unconfirmed.live), initial);
    assert.equal(JSON.stringify(unconfirmed.server).includes('roomPlacement'), false);
    const serverBefore = await page.evaluate(() => JSON.stringify(roomTest.serverModel().profile.room));
    // Rotation, recoloring and wall operations also remain draft-only.
    await click('rot'); await click('recolor');
    await page.evaluate(() => roomTest.select('wall-test'));
    await click('wmv'); await click('wswap');
    assert.equal(await snapshot(), initial);
    assert.equal(await page.evaluate(() => JSON.stringify(roomTest.serverModel().profile.room)), serverBefore);
    const expected = await page.evaluate(() => JSON.stringify(roomTest.items()));
    await page.screenshot({path: '/tmp/ojjuda-room-confirm-large-phone.png'});
    await click('placement-confirm');
    assert.equal(await snapshot(), expected);
    assert.equal(await page.evaluate(() => roomTest.model.room.wall), '#abcdef', 'confirm preserves unrelated room changes');
    assert.equal(await page.locator('#placement-actions').count(), 0);
    await page.waitForFunction(() => JSON.stringify(JSON.parse(localStorage.getItem(roomTest.storageKey)).rooms[0].items) === JSON.stringify(roomTest.model.room.items));

    await reset();
    await page.evaluate(() => roomTest.actions['add-item']({type: 'desk'}));
    assert.equal(await page.evaluate(() => roomTest.model.room.items.length), 2);
    assert.equal(await page.evaluate(() => roomTest.items().length), 3);
    await click('remove');
    assert.equal(await page.locator('#placement-actions').count(), 1, 'deselecting/removing keeps confirm and cancel available');
    await click('placement-cancel');
    assert.equal(await snapshot(), initial);
    await page.evaluate(() => {roomTest.select('desk-test'); roomTest.actions.remove()});
    assert.equal(await page.evaluate(() => roomTest.items().length), 1);
    await click('placement-confirm');
    assert.equal(await page.evaluate(() => roomTest.model.room.items.length), 1);

    await reset();
    await page.evaluate(() => {roomTest.select('desk-test'); roomTest.actions.mv({dx: 1, dy: 0})});
    await click('room-next');
    assert.equal(await page.evaluate(() => roomTest.model.roomIdx), 0, 'room switch cannot silently commit or discard');
    await page.evaluate(() => {roomTest.actions.tab({tab: 'home'}); roomTest.actions.decomode({v: 'avatar'})});
    assert.equal(await page.evaluate(() => roomTest.state.tab + ':' + roomTest.state.decoMode), 'deco:room');
    await click('placement-cancel');
    await click('room-next');
    assert.equal(await page.evaluate(() => roomTest.model.roomIdx), 1);

    await reset();
    const pet = await page.evaluate(() => {
      const type = Object.keys(roomTest.catalog).find(k => roomTest.catalog[k].pet);
      roomTest.model.owned.push('item:' + type);
      roomTest.model.petBank[type] = [{name: '콩이', love: 73, from: 'original'}];
      roomTest.actions['add-item']({type}); return type;
    });
    assert.equal(await page.evaluate(type => roomTest.model.petBank[type][0].love, pet), 73);
    await click('placement-cancel');
    assert.equal(await page.evaluate(type => roomTest.model.petBank[type][0].name, pet), '콩이');
    await page.evaluate(type => roomTest.actions['add-item']({type}), pet);
    await click('placement-confirm');
    assert.equal(await page.evaluate(type => roomTest.model.room.items.find(i => i.type === type).pet.love, pet), 73);
    await page.evaluate(type => {roomTest.select(roomTest.items().find(i => i.type === type).id); roomTest.actions.remove()}, pet);
    assert.equal(await page.evaluate(type => roomTest.model.petBank[type] || null, pet), null);
    await click('placement-cancel');
    assert.ok(await page.evaluate(type => roomTest.model.room.items.some(i => i.type === type), pet));
    await page.evaluate(type => {roomTest.select(roomTest.items().find(i => i.type === type).id); roomTest.actions.remove()}, pet);
    await click('placement-confirm');
    assert.equal(await page.evaluate(type => roomTest.model.petBank[type][0].love, pet), 73);

    // A different account/room or concurrent model replacement cannot receive an old draft.
    for (const change of ['account', 'room', 'items']) {
      await reset();
      await page.evaluate(change => {
        roomTest.select('desk-test'); roomTest.actions.mv({dx: 1, dy: 0});
        if (change === 'account') roomTest.auth.user = {id: 'another-user'};
        if (change === 'room') {roomTest.model.roomIdx = 1; roomTest.model.room = roomTest.model.rooms[1]}
        if (change === 'items') roomTest.model.room.items[0].gx = 6;
        window.expectedRoom = JSON.stringify(roomTest.model.room.items);
        roomTest.actions['placement-confirm']();
      }, change);
      assert.equal(await snapshot(), await page.evaluate(() => expectedRoom));
      assert.equal(await page.evaluate(() => roomTest.draft()), null);
    }

    await reset();
    const paid = await page.evaluate(() => {
      const type = Object.keys(roomTest.catalog).find(k => roomTest.shop['item:' + k] && !roomTest.catalog[k].prize && !roomTest.catalog[k].place);
      roomTest.model.owned = roomTest.model.owned.filter(k => k !== 'item:' + type);
      roomTest.setBuyer(async key => {roomTest.model.owned.push(key); return true});
      roomTest.actions['add-item']({type}); return type;
    });
    await click('try-buy');
    assert.equal(await page.evaluate(() => roomTest.model.room.items.length), 2, 'purchase does not bypass placement confirmation');
    assert.equal(await page.evaluate(() => roomTest.items().length), 3);
    await click('placement-cancel');
    assert.ok(await page.evaluate(type => roomTest.model.owned.includes('item:' + type), paid), 'canceling placement preserves purchased ownership');
    await page.evaluate(type => {
      roomTest.model.owned = roomTest.model.owned.filter(k => k !== 'item:' + type);
      roomTest.setBuyer(() => new Promise(resolve => window.finishPurchase = resolve));
      roomTest.actions['add-item']({type}); roomTest.actions['try-buy']();
      roomTest.actions.tab({tab: 'home'}); window.finishPurchase(true);
    }, paid);
    assert.equal(await page.evaluate(() => roomTest.draft()), null, 'a purchase resolving after navigation does not place in a hidden editor');
    assert.equal(await page.evaluate(() => roomTest.model.room.items.length), 2);

    // Large phones gain useful space; small/landscape screens retain scroll access
    // to the furniture palette and confirmation controls without pinned obstruction.
    for (const [width, height] of [[320,740], [390,844], [660,768], [840,900], [844,390], [1280,900]]) {
      await page.setViewportSize({width, height}); await reset();
      const size = await page.locator('#room-svg').boundingBox();
      if (width === 660) assert.ok(size.width >= 550, 'large-phone room is almost twice the old 40vh width');
      if (width <= 390) assert.ok(size.width >= width - 35, 'narrow phone uses available width');
      const overflow = await page.evaluate(() => ({page:document.documentElement.scrollWidth,viewport:innerWidth,elements:[...document.querySelectorAll('body > *, #app, .shell, .col, main, .deco-grid, .deco-grid > *')].map(el=>({id:el.id,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))}));
      assert.ok(overflow.page <= overflow.viewport, `${width}px has no horizontal overflow: ${JSON.stringify(overflow)}`);
      await page.evaluate(() => roomTest.actions['add-item']({type: 'desk'}));
      await page.getByRole('button', {name: '확인', exact: true}).click();
      assert.equal(await page.evaluate(() => roomTest.model.room.items.length), 3);
      const palette = page.locator('.room-deco-grid > .panel');
      await palette.scrollIntoViewIfNeeded();
      assert.equal(await palette.evaluate(el => {
        const r = el.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, Math.max(1, r.top + 25));
        return el.contains(target);
      }), true, `${width}px palette remains reachable`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: real World touch drag, explicit confirm/cancel, autosave/pagehide isolation, wall/floor changes, pet stash, purchases, navigation/conflict guards and six responsive sizes.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1});
