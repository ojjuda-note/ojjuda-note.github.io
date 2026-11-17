const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const script = name => readFileSync(path.join(__dirname,'..',name),'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function host(t, owner) {
  const dom = new JSDOM('<body></body>',{url:'https://fixture.test/world.html',runScripts:'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function() {};
  w.HTMLDialogElement.prototype.close = function() {};
  const calls = [], clients = [], replies = [];
  let authorized = true, answer = async () => ({data:true,error:null});
  const api = role => ({
    rpc(name,args) {
      return {abortSignal(signal) {
        calls.push({role,name,args:{...args},signal});
        return answer(signal);
      }};
    }
  });
  w.OJJUDA_CONFIG = {supabaseUrl:'https://fixture.test',supabaseKey:'test'};
  w.supabase = {createClient(url,key,options) { clients.push(options); return api('guest'); }};
  w.eval(script('shared/games/guest-game-scores.js'));
  w.eval(script('games/saetbyeol/world-saetbyeol-game.js'));
  w.OjjudaSaetbyeolGame.open({owner,client:api('member'),authorized:() => authorized});
  const frame = w.document.querySelector('iframe').contentWindow;
  frame.postMessage = (data,origin) => replies.push({...data,origin});
  const receive = (type,requestId,origin=w.location.origin,sender=frame) => w.dispatchEvent(new w.MessageEvent('message',{
    origin,source:sender,data:{source:'ojjuda-saetbyeol',type,requestId}
  }));
  const ready = () => receive('ojjuda-game-ready');
  const check = (id,...source) => receive('ojjuda-saetbyeol-legacy-food-check',id,...source);
  return {w,calls,clients,replies,ready,check,answer:fn => { answer=fn; },changeOwner:() => { authorized=false; }};
}

test('the initialized star frame gets only its member eligibility or an indeterminate response',async t => {
  const h = host(t,randomUUID()), id = randomUUID();
  h.check(id);
  h.ready();
  h.check(id,'https://other.test');
  h.check(id,h.w.location.origin,h.w);
  h.check('wrong-id');
  assert.equal(h.calls.length,0);
  for (const [payload,expected] of [[{data:true},true],[{data:false},false],[{error:'offline'},null],[{data:'invalid'},null]]) {
    h.answer(async () => payload);
    const requestId = randomUUID();
    h.check(requestId);
    await settle();
    assert.deepEqual(h.replies.at(-1),{source:'ojjuda-world',type:'ojjuda-saetbyeol-legacy-food',requestId,eligible:expected,origin:h.w.location.origin});
  }
  assert.ok(h.calls.every(c => c.role==='member' && c.name==='saetbyeol_legacy_food_eligible' && Object.keys(c.args).length===0));
  assert.equal(h.clients.length,0);
  const deadline = new h.w.AbortController();
  h.w.AbortSignal.timeout = ms => { assert.equal(ms,10000); return deadline.signal; };
  h.answer(signal => new Promise((resolve,reject) => signal.addEventListener('abort',() => reject(signal.reason),{once:true})));
  h.check(id); deadline.abort(); await settle();
  assert.equal(h.replies.at(-1).eligible,null);
  assert.equal(h.replies.at(-1).requestId,id);
});

test('guest history uses the existing browser token and an anonymous non-persistent client',async t => {
  const h = host(t,null), token = 'ab'.repeat(32);
  h.w.localStorage.setItem('ojjuda.guest-ranking.v1',token);
  h.ready(); h.check(randomUUID()); await settle();
  assert.deepEqual(h.calls.map(({role,name,args}) => ({role,name,args})),[
    {role:'guest',name:'saetbyeol_legacy_food_eligible',args:{p_guest_token:token}}
  ]);
  assert.equal(h.clients[0].auth.persistSession,false);
  assert.equal(h.clients[0].auth.autoRefreshToken,false);
  assert.equal(h.replies.at(-1).eligible,true);
  assert.ok(!JSON.stringify(h.replies).includes(token));
  h.answer(async () => { throw Error('offline'); });
  h.check(randomUUID()); await settle();
  assert.equal(h.replies.at(-1).eligible,null);
});

test('closing the game or switching the active account discards an outstanding answer',async t => {
  for (const leave of [h => h.changeOwner(),h => h.w.OjjudaSaetbyeolGame.close()]) {
    const h = host(t,randomUUID());
    let finish;
    h.answer(() => new Promise(resolve => { finish=resolve; }));
    h.ready(); h.check(randomUUID());
    leave(h); finish({data:true}); await settle();
    h.check(randomUUID()); await settle();
    assert.equal(h.calls.length,1);
    assert.ok(h.replies.every(r => r.type==='ojjuda-saetbyeol-init'));
  }
});
