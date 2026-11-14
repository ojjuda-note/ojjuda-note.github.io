'use strict';

// Run in CI after `playwright install --with-deps chromium`. The site scripts,
// browser DOM and PostgreSQL game functions are real; Auth and HTTP transport
// are deliberately isolated from production accounts and services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {chromium} = require('playwright');
const {fixture} = require('./drinking-room-fixture.cjs');
const {rpcArgs, root} = require('./helpers/drinking-ui-fixture.cjs');

const origin = 'https://drinking-fixture.test';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};

function configSource(actor) {
  return `(() => {
    const actor = ${JSON.stringify(actor)};
    const user = {id: actor, is_anonymous: false};
    const listeners = new Set();
    const client = {
      auth: {
        getSession: async () => ({data:{session:{user}},error:null}),
        getUser: async () => navigator.onLine
          ? ({data:{user},error:null})
          : ({data:{user:null},error:{name:'AuthRetryableFetchError',status:0}}),
        onAuthStateChange(listener) {
          listeners.add(listener);
          return {data:{subscription:{unsubscribe:()=>listeners.delete(listener)}}};
        }
      },
      rpc(name,args) {
        let request;
        function execute(signal) {
          if (request) return request;
          request = new Promise((resolve,reject) => {
            if (!navigator.onLine) {resolve({data:null,error:{message:'Failed to fetch'}});return;}
            const cancel = () => reject(new DOMException('Aborted','AbortError'));
            if (signal?.aborted) {cancel();return;}
            signal?.addEventListener('abort',cancel,{once:true});
            window.__fixtureRpc({name,args:args||{}}).then(resolve,reject)
              .finally(()=>signal?.removeEventListener('abort',cancel));
          });
          return request;
        }
        return {abortSignal:execute,then:(yes,no)=>execute().then(yes,no)};
      }
    };
    window.OjjudaGetClient = async () => client;
  })();`;
}

test('three Chromium sessions keep one SQL room through reconnection, a game and host handoff', {timeout:120000}, async t => {
  const db=await fixture();
  let browser;
  t.after(async()=>{await browser?.close();await db.close();});
  browser=await chromium.launch({headless:true,
    ...(process.env.OJJUDA_CHROMIUM_PATH ? {executablePath:process.env.OJJUDA_CHROMIUM_PATH} : {})});
  const sessions=[], errors=[];
  async function open(actor) {
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const calls=[];
    await context.exposeBinding('__fixtureRpc',async(_source,{name,args})=>{
      calls.push({name,args});
      if(name==='get_my_member_identity')return {data:{age:25,locked:true},error:null};
      try{return {data:await db.publicRpc(actor,name,rpcArgs(name,args)),error:null};}
      catch(error){return {data:null,error:{message:error.message}};}
    });
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin){await route.abort();return;}
      if(url.pathname==='/config.js'){
        await route.fulfill({status:200,contentType:mime['.js'],body:configSource(actor)});return;
      }
      const relative=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
      const filename=path.resolve(root,'.'+relative);
      if(!filename.startsWith(root+path.sep)){await route.fulfill({status:403,body:''});return;}
      if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){
        await route.fulfill({status:204,body:''});return;
      }
      await route.fulfill({status:200,contentType:mime[path.extname(filename)]||'application/octet-stream',body:fs.readFileSync(filename)});
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin+'/games/drinking/?mode=multi');
    await page.locator('#entry').waitFor({state:'visible'});
    const value={context,page,actor,calls};sessions.push(value);return value;
  }
  const [host,first,second]=await Promise.all(db.users.slice(0,3).map(open));
  await host.page.locator('#create-form [name="title"]').fill('브라우저 연결 검사');
  await host.page.locator('#create-form [name="capacity"]').selectOption('3');
  await host.page.locator('#create-form [name="password"]').fill('browser-pass');
  await host.page.locator('#create-form [type="submit"]').click();
  await host.page.locator('#lobby').waitFor({state:'visible'});
  const code=await host.page.locator('#lobby-code').textContent();
  assert.match(code,/^[A-Z0-9]{6}$/);
  await Promise.all([first,second].map(async s=>{
    await s.page.locator('#join-form [name="code"]').fill(code);
    await s.page.locator('#join-form [name="password"]').fill('browser-pass');
    await s.page.locator('#join-form [type="submit"]').click();
    await s.page.locator('#lobby').waitFor({state:'visible'});
  }));
  await Promise.all(sessions.map(s=>s.page.waitForFunction(()=>document.querySelectorAll('#members li').length===3)));
  assert.equal(host.calls.filter(c=>c.args.p_action==='create').length,1);
  assert.equal(first.calls.filter(c=>c.args.p_action==='join').length,1);
  assert.equal(second.calls.filter(c=>c.args.p_action==='join').length,1);
  const joined=await Promise.all(sessions.map(s=>db.publicRpc(s.actor,'drinking_room',['state',code,{}])));
  const nextHinter=sessions[joined.findIndex(state=>state.me===1)];

  await first.page.evaluate(()=>{window.__sameDocument='lobby-survives';});
  await first.context.setOffline(true);
  await first.page.waitForFunction(()=>document.getElementById('access-content').hidden===true);
  const offlineCalls=first.calls.length;
  await host.page.locator('[data-game="liar"]').click();
  await host.page.waitForFunction(()=>document.getElementById('selected-game').textContent.includes('라이어'));
  assert.equal(first.calls.length,offlineCalls,'offline clients do not keep issuing RPCs');
  await first.context.setOffline(false);
  await first.page.locator('#lobby').waitFor({state:'visible'});
  await first.page.waitForFunction(()=>document.getElementById('selected-game').textContent.includes('라이어'));
  assert.equal(await first.page.evaluate(()=>window.__sameDocument),'lobby-survives');

  await host.page.locator('#start').click();
  await Promise.all(sessions.map(s=>s.page.waitForURL(url=>url.pathname==='/games/liar/'&&url.searchParams.get('party')===code)));
  await Promise.all(sessions.map(s=>s.page.locator('#access-content [data-do="reveal"]').waitFor({state:'visible'})));
  await Promise.all(sessions.map(s=>s.page.locator('[data-do="reveal"]').click()));
  const secrets=await Promise.all(sessions.map(s=>s.page.locator('#view .secret').textContent()));
  assert.equal(secrets.filter(text=>text.includes('당신은 라이어')).length,1,'the server gives exactly one session the liar role');
  const words=secrets.filter(text=>text.includes('제시어'));
  assert.equal(words.length,2);assert.equal(new Set(words).size,1);
  assert.equal(secrets.filter(text=>text.includes('당신은 라이어')&&text.includes('제시어')).length,0);

  const hint=host.page.locator('#hint [name="hint"]');
  await hint.waitFor({state:'visible'});
  await hint.fill('연결 전에 적던 힌트');
  await host.page.evaluate(()=>{window.__sameDocument='game-survives';});
  await host.context.setOffline(true);
  await host.page.waitForFunction(()=>document.getElementById('access-content').hidden);
  assert.equal(await hint.inputValue(),'연결 전에 적던 힌트');
  await host.context.setOffline(false);
  await hint.waitFor({state:'visible'});
  assert.equal(await host.page.evaluate(()=>window.__sameDocument),'game-survives');
  assert.equal(await hint.inputValue(),'연결 전에 적던 힌트');
  assert.equal(await host.page.locator('#view .secret').count(),0,'returning from a hidden state keeps the personal card covered');
  await host.page.locator('#hint [type="submit"]').click();
  await nextHinter.page.locator('#hint [name="hint"]').waitFor({state:'visible'});
  assert.equal(host.calls.filter(c=>c.name==='liar_multiplayer'&&c.args.p_action==='hint').length,1);

  await host.page.locator('[data-party-leave]').click();
  await host.page.waitForURL(url=>url.pathname==='/games/drinking/'&&url.searchParams.get('mode')==='multi');
  await Promise.all([first,second].map(s=>s.page.waitForURL(url=>url.pathname==='/games/drinking/'&&url.searchParams.get('room')===code)));
  await Promise.all([first,second].map(s=>s.page.waitForFunction(()=>document.querySelectorAll('#members li').length===2)));
  const states=await Promise.all([first,second].map(s=>db.publicRpc(s.actor,'drinking_room',['state',code,{}])));
  assert.equal(states.filter(s=>s.me===0).length,1);
  assert.ok(states.every(s=>s.code===code&&s.phase==='lobby'&&s.players.length===2));
  assert.equal(states[0].revision,states[1].revision);
  assert.deepEqual(errors,[]);
  t.diagnostic('Three independent Chromium contexts and actual SQL game functions passed; RPC delay/offline is controlled locally, not a production network/load measurement.');
});
