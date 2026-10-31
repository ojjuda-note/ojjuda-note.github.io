const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createFixture } = require('./board-takeover-fixture.cjs');
const root = path.join(__dirname, '..'), origin = 'https://board-handoff.test';
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '');
const boot = world.indexOf('j1(()=>H());gm('); assert.ok(boot > 0);
world = world.slice(0, boot) + `
D.online=false;S={};g.tab='arcade';qt=true;H();
const fixtureActor=new URL(location.href).searchParams.get('actor');
const channels=new Set();
S={
 from(table){return {select(){return this;},eq(_key,id){this.id=id;return this;},maybeSingle(){return table==='board_games'?window.boardRead(this.id).then(data=>({data,error:null})):Promise.resolve({data:null,error:null});}};},
 rpc(name,args){return window.boardRpc(name,args);},
 functions:{invoke(_name,{body}){return window.boardCall(body);}},
 channel(){const channel={on(_event,_filter,receive){channel.receive=receive;return channel;},subscribe(){channels.add(channel);return channel;}};return channel;},
 removeChannel(channel){channels.delete(channel);}
};
D.online=true;D.user={id:fixtureActor};P.loaded=true;P.at=Date.now();
Xs=async()=>true;xh=async()=>true;jgOnlineReady=async()=>true;$h=async()=>[];
window.multiFixture={
 deliver:record=>{for(const channel of channels)channel.receive({new:record});},
 open:record=>['chess','janggi'].includes(record.kind)?kl(record):dp(record),
 close:()=>E?closeWorldGameModal():exitWorldBilliards(),
 fresh:kind=>['chess','janggi'].includes(kind)?vn(kind):xn(kind),
 practice:kind=>['chess','janggi'].includes(kind)?zp(kind,'local'):ep(kind,'local'),
 state:()=>E?{kind:E.kind,mode:E.mode,moves:E.moves.length,computer:E.online?.computerSeats||[],id:E.online?.id}:k?{kind:k.kind,mode:k.mode,moves:k.moveCount,shots:k.st.shots,computer:k.online?.computerSeats||[],id:k.online?.id}:null
};
` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const service = await createFixture();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ viewport: { width: 430, height: 900 }, reducedMotion: 'reduce' });
    const actors = new Map(), pages = [], errors = [], broadcasts = new Set();
    const broadcast = async id => {
      if (!id) return;
      await Promise.all(pages.map(async page => {
        if (page.isClosed()) return;
        const row = await service.read(actors.get(page), id);
        if (row) await page.evaluate(record => multiFixture.deliver(record), row);
      }));
    };
    const signal = id => {
      const job = broadcast(id).catch(error => errors.push(error.message));
      broadcasts.add(job); void job.finally(() => broadcasts.delete(job));
    };
    await context.exposeBinding('boardRead', ({ page }, id) => service.read(actors.get(page), id));
    await context.exposeBinding('boardRpc', async ({ page }, name, args) => {
      if (!['game_leave', 'game_resign', 'game_undo_request', 'game_undo_answer'].includes(name)) return { data: [], error: null };
      const result = await service.rpc(actors.get(page), name, args); if (!result.error) signal(args.p_id); return result;
    });
    await context.exposeBinding('boardCall', async ({ page }, body) => {
      const result = await service.call(actors.get(page), body); if (!result.error) signal(body.p_id); return result;
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort();
      if (url.pathname === '/world.html') return route.fulfill({ contentType: 'text/html', body: world });
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({ path: file });
    });
    for (const actor of service.ids) {
      const page = await context.newPage(); actors.set(page, actor); pages.push(page);
      page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
      await page.goto(origin + '/world.html?actor=' + actor); await page.waitForFunction(() => window.multiFixture);
    }
    for (const kind of ['chess', 'janggi', 'carom4', 'carom3', 'pool8']) {
      const game = await service.create(kind);
      await Promise.all(pages.map(page => page.evaluate(record => multiFixture.open(record), game)));
      await pages[0].evaluate(() => multiFixture.close());
      assert.equal(await service.read(service.ids[0], game.id), null, 'the departed player cannot resume the previous match');
      assert.equal(await pages[0].evaluate(() => multiFixture.state()), null);
      await pages[1].waitForFunction(id => multiFixture.state()?.id === id && multiFixture.state().moves >= 1, game.id);
      assert.ok(await pages[1].getByText(/첫 회원 · 컴퓨터/).count(), kind + ' visibly identifies the inherited computer seat');
      const continuing = await service.read(service.ids[1], game.id);
      assert.ok(continuing.moves.length >= 1); assert.deepEqual(continuing.computer_seats, ['p1']);
      if (['chess', 'janggi'].includes(kind)) assert.equal(await pages[1].locator('[data-act="bd-undo"]').isDisabled(), true, 'no undo request waits on a departed person');
      await pages[0].evaluate(kind => multiFixture.fresh(kind), kind);
      assert.equal(await pages[0].locator('[data-act="bd-resume"],[data-act="bl-resume"]').count(), 0);
      await pages[0].evaluate(kind => multiFixture.practice(kind), kind);
      const fresh = await pages[0].evaluate(() => multiFixture.state());
      assert.equal(fresh.mode, 'local'); assert.equal(fresh.moves, 0);
      await Promise.all(pages.map(page => page.evaluate(() => multiFixture.close())));
      await Promise.all([...broadcasts]);
      console.log('PASS: two World browsers preserve ' + kind + ', display server AI and reopen a fresh game for the leaver.');
    }
    assert.deepEqual(errors, []); await context.close();
  } finally { await browser.close(); await service.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
