const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const dom = new JSDOM('<main id="host"></main>', { url:'https://ojjuda.kr/world.html?admin=visitors', runScripts:'outside-only' });
  const w = dom.window, host = w.document.getElementById('host');
  w.eval(fs.readFileSync(path.join(__dirname,'../admin/visitors.js'),'utf8'));
  const calls = [];
  let owner='admin', authChanged;
  const visitor = { today:3,month:3,total:3,started_at:'2026-11-01T00:00:00Z',daily:[],monthly:[] };
  const client = { rpc:async name => {
    calls.push(name);
    return name === 'admin_guest_visit_stats' ? {data:visitor} : {error:{message:'unavailable'}};
  },auth:{onAuthStateChange(fn){authChanged=fn;return {data:{subscription:{unsubscribe(){}}}}}}};
  const control = w.OjjudaAdminVisitors.mount({container:host,client,getAdminId:()=>owner});
  await settle();await settle();
  assert.equal(host.querySelector('.visitor-growth'),null,'the obsolete challenge/share UI is removed');
  assert.doesNotMatch(host.textContent,/게임 도전·공유 상세|도전 링크/);
  assert.equal(calls.includes('admin_game_growth_stats'),false,'the obsolete admin RPC is not requested');
  assert.match(host.textContent,/3회/,'the existing guest count is preserved');
  owner=null;authChanged('SIGNED_OUT',null);
  assert.equal(host.querySelectorAll('.visitor-card').length,0,'sign out removes sensitive statistics');
  control.destroy();dom.window.close();
  console.log('PASS: removed obsolete challenge/share admin tables and RPC, kept guest history and logout protection');
})().catch(error=>{console.error(error);process.exitCode=1});
