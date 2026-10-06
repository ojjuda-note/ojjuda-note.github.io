const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');

// Run the real World module, shell and wallet callback. Only Auth/data transport
// is replaced, so delayed responses cannot contact or change a real account.
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0, 'World boot is available');
world = world.slice(0, boot) + `
const walletJobs=new Map(),walletTasks=new Map();let walletJobId=0;
S={from(table){
 if(table!=='user_private')throw Error('Unexpected data request: '+table);
 let owner;const query={select(columns){if(columns!=='coins')throw Error('Unexpected columns');return query;},eq(key,value){if(key!=='user_id')throw Error('Unexpected filter');owner=value;return query;},maybeSingle(){const id=++walletJobId;return new Promise((resolve,reject)=>walletJobs.set(id,{owner,resolve,reject}));}};return query;
}};
D.online=true;D.user={id:'owner-a'};D.isAdmin=false;D.doorReady=true;xd(false);$.coins=111;g.tab='my';H();
const walletWrites={save:0,render:0},originalWalletSave=I,originalWalletRender=H;
I=()=>{walletWrites.save++;originalWalletSave();};H=()=>{walletWrites.render++;originalWalletRender();};
window.walletTest={
 start(){const task=OjjudaMatgoWalletChanged(),id=walletJobId;walletTasks.set(id,task);return id;},
 async finish(id,coins,failure){const job=walletJobs.get(id);if(!job)throw Error('Missing request');if(failure==='reject')job.reject(Error('fixture network failure'));else job.resolve({data:{coins},error:failure?Error('fixture query failure'):null});await walletTasks.get(id);walletJobs.delete(id);walletTasks.delete(id);},
 switchAccount(owner,coins,online=true){D.user=owner?{id:owner}:null;D.online=online;$.coins=coins;originalWalletRender();},
 snapshot(){return{user:D.user?.id||null,online:D.online,coins:$.coins,visible:document.querySelector('.coinpill').textContent,...walletWrites};},
 requestOwner(id){return walletJobs.get(id)?.owner;}
};
` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).pathname === '/world.html'
      ? route.fulfill({ contentType: 'text/html', body: world }) : route.abort());
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(() => window.walletTest);
    const start = () => page.evaluate(() => walletTest.start());
    const snapshot = () => page.evaluate(() => walletTest.snapshot());
    const finish = (id, coins, failure) => page.evaluate(args => walletTest.finish(...args), [id, coins, failure]);
    const switchAccount = (owner, coins, online = true) => page.evaluate(args => walletTest.switchAccount(...args), [owner, coins, online]);

    const oldAccount = await start();
    assert.equal(await page.evaluate(id => walletTest.requestOwner(id), oldAccount), 'owner-a');
    await switchAccount('owner-b', 900);
    const accountB = await snapshot();
    await finish(oldAccount, 7);
    assert.deepEqual(await snapshot(), accountB, 'account A’s late balance cannot change account B’s model, display or save state');

    const older = await start(), newer = await start();
    const beforeCurrent = await snapshot();
    await finish(newer, 850);
    const current = await snapshot();
    assert.equal(current.coins, 850);
    assert.equal(current.visible, 'ZU850');
    assert.equal(current.save, beforeCurrent.save + 1, 'a current response saves once');
    assert.equal(current.render, beforeCurrent.render + 1, 'a current response repaints once');
    await finish(older, 880);
    assert.deepEqual(await snapshot(), current, 'an older response cannot roll back a newer balance for the same account');

    const priorFailure = await start(), latest = await start();
    await finish(latest, 840);
    const beforeStaleFailure = await snapshot();
    await finish(priorFailure, 0, 'reject');
    assert.deepEqual(await snapshot(), beforeStaleFailure, 'a stale rejected query cannot disturb the current account');

    const loggedOut = await start();
    await switchAccount(null, 0, false);
    const guest = await snapshot();
    await finish(loggedOut, 830);
    assert.deepEqual(await snapshot(), guest, 'a response after logout cannot revive the old account balance');

    await switchAccount('owner-c', 500);
    for (const failure of ['reject', 'query']) {
      const id = await start(), before = await snapshot();
      await finish(id, 123, failure);
      assert.deepEqual(await snapshot(), before, 'failed balance reads never save or repaint');
    }
    for (const balance of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, '12']) {
      const id = await start(), before = await snapshot();
      await finish(id, balance);
      assert.deepEqual(await snapshot(), before, 'invalid balances never replace the wallet');
    }
    const emptyWallet = await start(), beforeZero = await snapshot();
    await finish(emptyWallet, 0);
    const zero = await snapshot();
    assert.equal(zero.coins, 0);
    assert.equal(zero.visible, 'ZU0');
    assert.equal(zero.save, beforeZero.save + 1);
    assert.equal(zero.render, beforeZero.render + 1);
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: Matgo wallet responses preserve account isolation, newest-request order, logout state and valid balances; stale/failed reads never save or repaint.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
