const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const read=name=>readFileSync(join(__dirname,'../features/pajang',name),'utf8');
const setup=t=>{
  const dom=new JSDOM('<main id="gate"></main><main id="welcome" hidden></main><div id="station" hidden></div>',
    {url:'https://ojjuda.kr/pajang/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  let rpc=0;
  dom.window.fetch=()=>{throw Error('guest example must not use network');};
  dom.window.OjjudaGetClient=async()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:()=>rpc++});
  const scope=vm.runInContext([read('member.mjs'),read('entry-design.mjs')]
    .map(s=>s.replace(/^export /gm,'')).join('\n')+'\n;({requireMember,showGate,enhanceGuestGate})',dom.getInternalVMContext());
  return {scope,document:dom.window.document,rpc:()=>rpc};
};
test('guest example is marked fictional, folded, independent of private data, with working auth routes',async t=>{
  const {scope,document,rpc}=setup(t);
  assert.equal(await scope.requireMember(),undefined);
  assert.equal(scope.enhanceGuestGate(),true);
  const example=document.querySelector('.pajang-guest-example');
  assert.equal(example.open,false);
  assert.equal(example.querySelector('summary').textContent,'예시 답변 보기');
  assert.match(example.textContent,/실제 회원 답변이 아니에요/);
  assert.equal(example.querySelector('button,input,form,a'),null);
  assert.equal(document.querySelector('.ojjuda-guest-account-signup').getAttribute('href'),'/?auth=signup&next=pajang');
  assert.equal(document.querySelector('.ojjuda-guest-account-login').getAttribute('href'),'/?auth=login&next=pajang');
  assert.equal(document.querySelector('#welcome').hidden,true);
  assert.equal(document.querySelector('#station').hidden,true);
  assert.equal(rpc(),0);
});
test('a denied/non-login gate does not expose the example or member view',t=>{
  const {scope,document}=setup(t);
  scope.showGate('만 19세 이상 회원 전용이에요.');
  assert.equal(scope.enhanceGuestGate(),false);
  assert.equal(document.querySelector('.pajang-guest-example'),null);
  assert.equal(document.querySelector('#station').hidden,true);
});
