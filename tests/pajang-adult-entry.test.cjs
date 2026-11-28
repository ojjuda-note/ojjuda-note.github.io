const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../features/pajang/member.mjs'), 'utf8');
const adult = {id:'member',is_anonymous:false};
const accepted = {data:{joined:true,body:'보호되는 답변'}};

function fixture(t, rpc, getUser = async () => ({data:{user:adult}})) {
  const dom = new JSDOM('<main id="gate"></main><main id="welcome" hidden></main><main id="station" hidden></main>',
    {url:'https://ojjuda.kr/features/pajang/station.html?tab=inbox',runScripts:'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window;
  const db = {
    auth:{
      getSession: async () => ({data:{session:{user:adult}}}),
      getUser,
      onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}})
    },
    rpc
  };
  w.OjjudaGetClient = async () => db;
  const {sameMember,requireMember} = vm.runInContext(
    source.replace(/^export /gm,'') + '\n;({sameMember,requireMember})', dom.getInternalVMContext());
  return {w,db,requireMember,verified:() => sameMember(db)};
}

test('registered youth denied by the server cannot warm or mount Pajang member content',async t=>{
  const app=fixture(t,async () => ({error:{code:'42501',message:'파장은 만 19세 이상 회원만 이용할 수 있어요.'}}));
  let warmed=0,rendered=0;
  assert.equal(await app.requireMember('state',()=>warmed++,()=>rendered++),undefined);
  assert.equal(await app.verified(),false);
  assert.equal(warmed,0);
  assert.equal(rendered,0);
  assert.equal(app.w.document.querySelector('#station').hidden,true);
  assert.match(app.w.document.querySelector('#gate').textContent,/19세/);
});

test('adult data waits for the same server-confirmed identity, including on a deep link',async t=>{
  let resolveIdentity;
  const app=fixture(t,async () => accepted,()=>new Promise(resolve=>{resolveIdentity=resolve;}));
  let warmed=0,rendered=0;
  const loading=app.requireMember('state',()=>warmed++,()=>rendered++);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(warmed,0);
  assert.equal(rendered,0);
  resolveIdentity({data:{user:{...adult,id:'other-account'}}});
  assert.equal(await loading,undefined);
  assert.equal(await app.verified(),false);
  assert.equal(warmed,0);
  assert.equal(rendered,0);
});

test('going back hides adult content before a cached document is restored',async t=>{
  const app=fixture(t,async () => accepted);
  assert.equal((await app.requireMember()).joined,true);
  assert.equal(await app.verified(),true);
  app.w.document.querySelector('#station').hidden=false;
  const pagehide=new app.w.Event('pagehide');
  Object.defineProperty(pagehide,'persisted',{value:true});
  app.w.dispatchEvent(pagehide);
  assert.equal(app.w.document.querySelector('#station').hidden,true);
  assert.equal(await app.verified(),false);
});

test('old answered-round hint only admits an unjoined account after a fresh successful entry check',async t=>{
  const missing={error:{code:'42501',message:'먼저 파장에 참여해 주세요.'}};
  const calls=[];
  const app=fixture(t,async (name,args)=>{
    calls.push(args.p_action);
    return args.p_action==='state'?missing:{data:{joined:false}};
  });
  assert.equal((await app.requireMember('state')).joined,false);
  assert.equal(await app.verified(),true);
  assert.deepEqual(calls,['state','entry']);
});

test('temporary account lookup failures do not present the signed-out entrance', async t => {
  const error = {status:503, message:'Service unavailable'};
  for (const stage of ['session', 'user']) {
    const app = fixture(t, async () => accepted);
    if (stage === 'session') app.db.auth.getSession = async () => ({data:{session:null}, error});
    else app.db.auth.getUser = async () => ({data:{user:null}, error});
    assert.equal(await app.requireMember(), undefined);
    const gate = app.w.document.querySelector('#gate');
    assert.equal(gate.querySelector('[data-guest-account]'), null);
    assert.match(gate.textContent, /다시/);
    assert.equal(app.w.document.querySelector('#station').hidden, true);
  }
});
