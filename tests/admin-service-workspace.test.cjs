const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('independent administrators mount the authorized service controller and clear its content on sign-out', async () => {
  const {mountWorkspace} = await import('../admin/service-workspace.mjs');
  for (const [service, tab, rpcName] of [['park','cards','admin_cards'],['pajang','pajang-answers','admin_pajang_answers'],['pajang','pajang-chats','admin_pajang_chats'],['pajang','pajang-questions','admin_pajang_question_suggestions']]) {
    const dom = new JSDOM(read('admin/index.html'),{url:'https://ojjuda.test/admin/?from='+service+'&admin='+tab,runScripts:'outside-only'});
    const {window} = dom, {document} = window;
    window.requestAnimationFrame = fn => setTimeout(fn, 0);
    window.HTMLElement.prototype.scrollIntoView = () => {};
    const globals = {window, document, location:window.location};
    for(const key of Object.keys(globals)) global[key]=globals[key];
    try {
      for(const file of ['admin/service-scope.js','admin/navigation.js','note/admin.js','admin/pajang-moderation.js','note/operations.js']) window.eval(read(file));
      const calls = [], owner = '11111111-1111-4111-8111-111111111111';
      const rpc = async name => {calls.push(name);return {data:name==='is_note_moderator'?true:name==='admin_pajang_answers'||name==='admin_pajang_chats'?{items:[],total_count:0}:[]};};
      const client = {rpc, schema:()=>({rpc}),auth:{getSession:async()=>({data:{session:{user:{id:owner}}}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
      const controller = mountWorkspace({client, service, tab, owner, getAdminId:()=>owner});
      await new Promise(setImmediate);
      const content = document.getElementById('admin-panel');
      assert.ok(calls.includes(rpcName),tab+': '+calls.join(','));
      assert.equal(document.querySelectorAll('#workspace a[href^="/world.html"]').length,0);
      assert.equal(document.querySelector('[data-act="adm-open"][data-v="'+(service==='park'?'pajang-answers':'cards')+'"]'),null);
      assert.ok(content.textContent.trim(),tab);
      controller.destroy();
      assert.equal(content.textContent,'');
      assert.equal(document.getElementById('service-menu').textContent,'');
    } finally {
      for (const key of Object.keys(globals)) delete global[key];
      dom.window.close();
    }
  }
});
