'use strict';

// Run in CI after `playwright install --with-deps chromium`. The site scripts,
// browser DOM and PostgreSQL game functions are real; Auth and HTTP transport
// are deliberately isolated from production accounts and services.
const assert = require('node:assert/strict');
const test = require('node:test');
const {chromium} = require('playwright');
const {fixture} = require('./drinking-room-fixture.cjs');
const {browserSession, dismissGuide, origin} = require('./helpers/drinking-browser-fixture.cjs');

test('three Chromium sessions keep one SQL room through reconnection, a game and host handoff', {timeout:120000}, async t => {
  const db=await fixture();
  let browser;
  t.after(async()=>{await browser?.close();await db.close();});
  browser=await chromium.launch({headless:true,
    ...(process.env.OJJUDA_CHROMIUM_PATH ? {executablePath:process.env.OJJUDA_CHROMIUM_PATH} : {})});
  const sessions=[], errors=[];
  async function open(actor) {
    const value=await browserSession(browser,{db,actor,errors});
    const {page}=value;
    await page.goto(origin+'/games/drinking/?mode=multi');
    await page.locator('#entry').waitFor({state:'visible'});
    sessions.push(value);return value;
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
  await Promise.all(sessions.map(s=>dismissGuide(s.page)));
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
  const remaining=[first,second];
  const elected=remaining[states.findIndex(s=>s.me===0)];
  const guest=remaining.find(s=>s!==elected);
  assert.equal(await guest.page.locator('#random-start').isVisible(),false);
  await elected.page.locator('#random-start').click();
  await Promise.all(remaining.map(s=>s.page.waitForURL(url=>url.pathname!=='/games/drinking/'&&url.searchParams.get('party')===code)));
  assert.equal(first.page.url(),second.page.url(),'a single draw takes both phones to the same child room');
  const picked=await db.publicRpc(elected.actor,'drinking_room',['state',code,{}]);
  assert.equal(picked.phase,'playing');
  for(const client of remaining){
    const url=new URL(client.page.url());
    assert.equal(url.pathname,'/games/'+picked.kind+'/');
    assert.equal(url.searchParams.get('room'),picked.child);
    await dismissGuide(client.page);
  }
  assert.equal(elected.calls.filter(c=>c.args.p_action==='start').length,1);
  assert.deepEqual(errors,[]);
  t.diagnostic('Three independent Chromium contexts and actual SQL game functions passed; RPC delay/offline is controlled locally, not a production network/load measurement.');
});
