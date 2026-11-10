const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

(async () => {
  const dom = new JSDOM('<main><div id="accounts"></div></main>', { url: 'https://ojjuda.kr/world.html', runScripts: 'outside-only' });
  try {
    dom.window.eval(fs.readFileSync(path.join(__dirname, '../admin/accounts.js'), 'utf8'));
    const calls = [];
    const user = { id:'member-a', nickname:'회원', email:'member@example.invalid', created_at:'2026-11-10T00:00:00Z',
      last_seen:'2026-11-10T01:00:00Z', last_active:'2026-11-10T01:30:00Z', last_active_kind:'game', last_active_title:'screw_box' };
    const client = { auth: { onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
      async rpc(name, args) {
        calls.push({name,args});
        if(name==='admin_list_member_accounts')return {data:{items:[user],total:1}};
        if(name==='admin_member_navigation_history')return {data:{items:[
          {kind:'page',title:'오락실',created_at:'2026-11-10T01:31:00Z'},
          {kind:'game',title:'<img src=x onerror=alert(1)>',created_at:'2026-11-10T01:30:00Z'}
        ],total:2}};
        throw Error('unexpected RPC '+name);
      } };
    const container = dom.window.document.querySelector('#accounts');
    const controller = dom.window.OjjudaAdminAccounts.mount({ container, client, getAdminId:()=> 'admin-a' });
    await new Promise(resolve=>setImmediate(resolve));
    assert.match(container.textContent,/마지막 활동.*게임.*나사 풀기 \(박스형\)/);
    const toggle=container.querySelector('.acct-history-toggle');
    assert.ok(toggle);
    toggle.click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(container.querySelectorAll('.acct-history-item').length,2);
    assert.match(container.textContent,/오락실/);
    assert.equal(container.querySelectorAll('.acct-history img').length,0);
    assert.equal(calls.find(x=>x.name==='admin_member_navigation_history').args.p_user_id,'member-a');
    toggle.click();
    assert.equal(container.querySelector('.acct-history').hidden,true);
    controller.destroy();
    console.log('PASS: latest named game, per-account page/game history, safe text, expand/collapse');
  } finally { dom.window.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
