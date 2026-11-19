const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {JSDOM,VirtualConsole}=require('jsdom');

// Exercise the built React member program with real DOM/history events. The
// network boundary is an in-memory member fixture, never a live user account.
function fixture(t,url='https://ojjuda.test/features/pajang/station.html',{admin=false}={}){
  const errors=[];
  const console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><div id="station"></div>',{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window;
  t.after(()=>dom.window.close());
  w.scrollTo=(_x,y)=>{w.scrollY=y;w.dispatchEvent(new w.Event('scroll'));};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const me={id:'me',name:'보리',interest:'book',body:'내 답변',at:1};
  const peer={id:'peer',name:'라온',interest:'walk',body:'함께 걸어요.',at:1};
  const state={day:'2026-11-19',slot:'am',question:{id:1,q:['오늘은 무엇을 하고 싶나요?']},nextAt:new Date(Date.now()+3600000).toISOString(),
    me,people:[peer],signals:[{src:'me',dst:'peer'},{src:'peer',dst:'me'}],messages:[],remaining:3,authenticated:true,
    locationEnabled:false,locationVersion:0};
  const row={...peer,peer:peer.id,day:state.day,slot:state.slot,question:'오늘은 무엇을 하고 싶나요?',own:false,sent:true,received:true};
  w.pajangState=state;w.pajangArt={};
  w.OjjudaLocation={acceptPreference(){},subscribe(){return ()=>{};}};
  const calls=[],authListeners=new Set();
  let session={access_token:'test-member-token',user:{id:'auth-member',is_anonymous:false}};
  const db={auth:{
    getSession:async()=>({data:{session}}),
    getUser:async()=>({data:{user:session?.user||null}}),
    onAuthStateChange(listener){authListeners.add(listener);return {data:{subscription:{unsubscribe(){authListeners.delete(listener);}}}};}
  },rpc:(name,params)=>{
    calls.push({name,params});let data;
    if(name==='pajang_member')data=params.p_action==='thread'?[]:state;
    else if(name==='pajang_discovery_feed')data={items:[row],nextCursor:null,total:1,remaining:3};
    else if(name==='pajang_exchange')data={myCount:0,peerCount:0,eligible:false,profile:'none',photos:'none'};
    else if(name==='is_admin')data=admin;
    else throw Error('Unexpected member operation '+name);
    const result=Promise.resolve({data:structuredClone(data)});result.abortSignal=()=>result;return result;
  }};
  w.OjjudaGetClient=async()=>db;
  w.eval(fs.readFileSync(path.join(__dirname,'../features/pajang/assets/station.js'),'utf8'));
  const byText=(selector,text)=>[...w.document.querySelectorAll(selector)].find(el=>el.textContent.trim()===text);
  async function until(check){
    for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}
    assert.fail('DOM condition not reached: '+check.toString()+'\n'+w.document.body.textContent);
  }
  async function click(selector,text){const element=byText(selector,text);assert.ok(element,'control '+text);element.click();await new Promise(resolve=>setTimeout(resolve,10));}
  function signOut(){session=null;for(const listener of authListeners)listener('SIGNED_OUT',null);}
  return {w,errors,calls,authListeners,signOut,byText,until,click,menu:label=>click('nav a',label),modal:()=>w.document.querySelector('dialog[open]')};
}

test('the React app closes its popup first and restores real tabs, including button-close and Forward',async t=>{
  const f=fixture(t),{w}=f;
  await f.until(()=>f.byText('nav a','오늘'));
  await f.menu('마음함');await f.menu('내 파장');
  await f.click('.account-settings button .ojjuda-settings-label','사용법');
  await f.until(()=>f.modal());
  w.history.back();await f.until(()=>!f.modal());
  assert.equal(new URL(w.location.href).searchParams.get('tab'),'profile');
  w.history.back();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='inbox');
  w.history.forward();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='profile');
  await f.click('.account-settings button .ojjuda-settings-label','공개 소개 수정');
  await f.until(()=>f.modal());
  f.modal().querySelector('[aria-label="닫기"]').click();await f.until(()=>!f.modal());
  w.history.back();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='inbox');
  w.history.forward();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='profile');
  w.history.forward();await f.until(()=>f.modal());
  assert.equal(f.modal().getAttribute('aria-label'),'프로필 수정');
  assert.deepEqual(f.errors,[]);
});

test('opening a chat from a feed profile returns to that feed instead of a fixed list or closed popup',async t=>{
  const f=fixture(t),{w}=f;
  await f.until(()=>f.byText('#answers .person strong','라온'));
  await f.click('#answers .person strong','라온');await f.until(()=>f.modal());
  await f.click('dialog button','대화 열기');
  await f.until(()=>w.document.querySelector('.composer'));
  assert.equal(new URL(w.location.href).searchParams.get('chat'),'peer');
  w.document.querySelector('.chatheader [aria-label="뒤로가기"]').click();
  await f.until(()=>!new URL(w.location.href).searchParams.has('tab'));
  assert.equal(f.modal(),null);assert.equal(w.document.querySelector('.composer'),null);
  w.history.forward();await f.until(()=>w.document.querySelector('.composer'));
  assert.equal(new URL(w.location.href).searchParams.get('chat'),'peer');
  assert.deepEqual(f.errors,[]);
});

test('a directly opened chat replaces itself with its list and legal pages stay in the same tab',async t=>{
  const f=fixture(t,'https://ojjuda.test/features/pajang/station.html?tab=chat&chat=peer'),{w}=f;
  await f.until(()=>w.document.querySelector('.composer'));
  w.document.querySelector('.chatheader [aria-label="뒤로가기"]').click();
  await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='inbox');
  assert.equal(w.history.length,1);
  await f.menu('내 파장');
  for(const name of ['이용약관','개인정보처리방침'])assert.equal(f.byText('.account-settings a .ojjuda-settings-label',name).closest('a').target,'');
  assert.deepEqual(f.errors,[]);
});

test('administrator access stays tied to the current account through popup and tab history',async t=>{
  const f=fixture(t,undefined,{admin:true}),{w}=f;
  const adminEntry=()=>w.document.querySelector('.account-settings a[href="/world.html?admin=pajang-answers&from=pajang"]');
  await f.until(()=>f.byText('nav a','오늘'));
  await f.menu('내 파장');await f.until(adminEntry);
  assert.equal(adminEntry().target,'_top');
  assert.equal(f.authListeners.size,1);
  const checks=f.calls.filter(call=>call.name==='is_admin').length;

  await f.click('.account-settings button .ojjuda-settings-label','사용법');
  await f.until(()=>f.modal());
  w.history.back();await f.until(()=>!f.modal());
  assert.ok(adminEntry(),'closing a popup keeps the current settings and permission check');
  assert.equal(f.calls.filter(call=>call.name==='is_admin').length,checks);

  await f.menu('오늘');await f.until(()=>f.authListeners.size===0);
  w.history.back();await f.until(adminEntry);
  assert.equal(new URL(w.location.href).searchParams.get('tab'),'profile');
  assert.equal(f.authListeners.size,1);
  assert.equal(f.calls.filter(call=>call.name==='is_admin').length,checks+1,'restored settings check the live account again');
  f.signOut();await f.until(()=>!adminEntry());
  assert.deepEqual(f.errors,[]);
});
