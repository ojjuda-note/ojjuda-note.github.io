const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..'), origin = 'https://world-fresh.test';
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
D.online=false;D.isAdmin=false;S={};g.tab='arcade';qt=true;H();
const freshIds=new WeakMap();let freshId=0;function freshIdentity(value){if(!freshIds.has(value))freshIds.set(value,++freshId);return freshIds.get(value);}
window.freshFixture={
 openBoard:vn,startBoard:(kind,mode='local')=>zp(kind,mode),
 moveBoard:()=>Ka(Xe[E.kind].moves(E.s)[0]),
 board:()=>E?{kind:E.kind,moves:E.moves.length,identity:freshIdentity(E),board:JSON.stringify(E.s.b),thinking:E.thinking}:null,
 closeBoard:closeWorldGameModal,
 openBilliards:xn,startBilliards:kind=>ep(kind,'local'),
 shot:()=>rl({dx:k.aim.dx,dy:k.aim.dy,v:1200,top:0,side:0}),
 billiards:()=>k?{kind:k.kind,score:k.st.score,identity:freshIdentity(k),balls:JSON.stringify(k.st.balls),turn:k.st.turn}:null,
 closeBilliards:exitWorldBilliards,
 openArcade:Al,arcade:()=>R?{score:R.score,running:R.running}:null
};
` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/world.html') return route.fulfill({ contentType: 'text/html', body: world });
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({ path: file });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(origin + '/world.html');
    await page.waitForFunction(() => window.freshFixture);
    for (const kind of ['chess', 'janggi']) {
      await page.evaluate(kind => freshFixture.openBoard(kind), kind);
      assert.equal(await page.locator('[data-act="bd-resume"]').count(), 0);
      await page.evaluate(kind => freshFixture.startBoard(kind), kind);
      const initial = await page.evaluate(() => freshFixture.board());
      await page.evaluate(() => freshFixture.moveBoard());
      assert.equal((await page.evaluate(() => freshFixture.board())).moves, 1);
      await page.evaluate(() => freshFixture.closeBoard());
      assert.equal(await page.evaluate(() => freshFixture.board()), null);
      await page.evaluate(kind => freshFixture.openBoard(kind), kind);
      assert.equal(await page.locator('[data-act="bd-resume"]').count(), 0);
      await page.evaluate(kind => freshFixture.startBoard(kind), kind);
      const next = await page.evaluate(() => freshFixture.board());
      assert.equal(next.moves, 0); assert.equal(next.board, initial.board);
      assert.notEqual(next.identity, initial.identity, 'a fresh board cannot reuse the previous session');
      await page.evaluate(() => freshFixture.closeBoard());
    }

    // Leave while the old AI is thinking; its timer must not move or reopen the
    // newly created local board after the next entry.
    await page.evaluate(() => { freshFixture.startBoard('chess', 'ai'); freshFixture.moveBoard(); });
    assert.equal((await page.evaluate(() => freshFixture.board())).thinking, true);
    await page.evaluate(() => { freshFixture.closeBoard(); freshFixture.startBoard('janggi'); });
    await page.waitForTimeout(400);
    assert.equal((await page.evaluate(() => freshFixture.board())).kind, 'janggi');
    assert.equal((await page.evaluate(() => freshFixture.board())).moves, 0);
    await page.evaluate(() => freshFixture.closeBoard());

    for (const kind of ['carom4', 'carom3', 'pool8']) {
      await page.evaluate(kind => freshFixture.openBilliards(kind), kind);
      assert.equal(await page.locator('[data-act="bl-resume"]').count(), 0);
      await page.evaluate(kind => freshFixture.startBilliards(kind), kind);
      const initial = await page.evaluate(() => freshFixture.billiards());
      await page.evaluate(() => freshFixture.shot());
      const moved = await page.evaluate(() => freshFixture.billiards());
      assert.notEqual(moved.balls, initial.balls, 'a real shot changes the current table');
      await page.evaluate(() => freshFixture.closeBilliards());
      assert.equal(await page.evaluate(() => freshFixture.billiards()), null);
      await page.evaluate(kind => freshFixture.openBilliards(kind), kind);
      assert.equal(await page.locator('[data-act="bl-resume"]').count(), 0);
      await page.evaluate(kind => freshFixture.startBilliards(kind), kind);
      const next = await page.evaluate(() => freshFixture.billiards());
      assert.equal(next.balls, initial.balls); assert.deepEqual(next.score, { p1: 0, p2: 0 });
      assert.notEqual(next.identity, initial.identity);
      await page.evaluate(() => freshFixture.closeBilliards());
    }

    await page.evaluate(() => freshFixture.openArcade('stacker'));
    await page.locator('#gov [data-g="start"]').click();
    assert.equal((await page.evaluate(() => freshFixture.arcade())).running, true);
    await page.locator('#gov .ghead [data-g="close"]').click();
    await page.evaluate(() => freshFixture.openArcade('stacker'));
    assert.deepEqual(await page.evaluate(() => freshFixture.arcade()), { score: 0, running: false });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: real chess, Janggi, all three billiards tables and stacker open fresh; late AI never alters the next game.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
