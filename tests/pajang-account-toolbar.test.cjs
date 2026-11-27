const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const esbuild=require(require.resolve('esbuild',{paths:[path.join(root,'features/pajang')]}));
const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,0));await new Promise(setImmediate);};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
let bundle;
function toolbarBundle(){
  return bundle||=esbuild.build({entryPoints:[path.join(root,'features/pajang/account-toolbar.mjs')],
    bundle:true,write:false,format:'iife',globalName:'PajangToolbar',platform:'browser',logLevel:'silent'
  }).then(result=>result.outputFiles[0].text);
}

async function fixture(t,{user='member-a',anonymous=false,readBalance,getSession,embedPath,items=[],retention=[],getInquiry}={}){
  const html=fs.readFileSync(path.join(root,'features/pajang/station.html'),'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const dom=new JSDOM(html,{url:'https://ojjuda.kr/features/pajang/station.html'+(embedPath?'?embed=1':''),
    runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,callbacks=[],calls=[],reads=[],balanceEvents=[];
  let session=user?{user:{id:user,is_anonymous:anonymous}}:null,coins=70,hostCalls=0,localCalls=0;
  const db={
    auth:{
      getSession:async()=>getSession?getSession():{data:{session},error:null},
      onAuthStateChange(callback){callbacks.push(callback);return {data:{subscription:{unsubscribe(){}}}};}
    },
    from(table){assert.equal(table,'user_private');return {select(columns){assert.equal(columns,'coins');return {eq(column,owner){
      assert.equal(column,'user_id');return {maybeSingle:async()=>{reads.push(owner);return readBalance?readBalance(owner,reads.length):{data:{coins},error:null};}};
    }};}};},
    async rpc(name,args){
      calls.push({name,args,user:session?.user?.id});
      if(name==='app_notification_summary')return {data:{notifications:2,retention:0}};
      if(name==='list_app_notifications')return {data:{items:args.p_app==='pajang'
        ? items.filter(item=>['inquiry_reply','broadcast_update','daily_update','visit_gift'].includes(item.kind)) : items,unread_count:2,as_of:'2026-11-19T00:00:00Z',has_more:false,next_cursor:null}};
      if(name==='get_my_inquiry')return getInquiry(args.p_id);
      if(name==='list_retention_alerts')return {data:retention};
      if(name==='beta_charge_status')return {data:{ok:true,enabled:true,coins,left:5,limit:5}};
      if(name==='beta_charge'){assert.deepEqual(Object.keys(args),['pack']);assert.equal(args.pack,'p1000');coins+=10;return {data:{ok:true,coins,added:10,bonus:0}};}
      throw Error('unexpected_rpc:'+name);
    },
    schema(){return {rpc:(name,args)=>db.rpc(name,args)};}
  };
  w.OjjudaGetClient=async()=>{localCalls++;return db;};
  if(embedPath){
    const dialog=w.document.createElement('dialog');dialog.className='agit-pajang-dialog';dialog.open=true;
    const frame=w.document.createElement('iframe');dialog.append(frame);w.document.body.append(dialog);
    Object.defineProperty(w,'frameElement',{configurable:true,value:frame});
    Object.defineProperty(w,'parent',{configurable:true,value:{location:{origin:'https://ojjuda.kr',pathname:embedPath},OjjudaGetClient:async()=>{hostCalls++;return db;}}});
  }
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){if(!this.open)return;this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.addEventListener('pajang:balance',event=>balanceEvents.push(event.detail));
  w.eval(await toolbarBundle());
  w.PajangToolbar.installPajangToolbar();
  t.after(()=>w.close());
  await settle();
  return {w,db,calls,reads,balanceEvents,
    amount:()=>w.document.querySelector('[data-pajang-balance]').textContent,
    wallet:()=>w.document.querySelector('.pajang-mast [data-ju-charge-open]'),
    bell:()=>w.document.querySelector('[data-notifications-open]'),
    counts:()=>({hostCalls,localCalls}),
    async auth(next,isAnonymous=false){session=next?{user:{id:next,is_anonymous:isAnonymous}}:null;for(const callback of callbacks)callback(next?'SIGNED_IN':'SIGNED_OUT',session);await settle();},
    balance(owner,value){w.dispatchEvent(new w.CustomEvent('pajang:balance',{detail:{userId:owner,coins:value}}));},
  };
}

test('both public Pajang entries share the brand and the real wallet/notification controls',()=>{
  for(const filename of ['index.html','station.html']){
    const dom=new JSDOM(fs.readFileSync(path.join(root,'features/pajang',filename),'utf8'));
    const document=dom.window.document;
    const home = filename === 'index.html' ? '/pajang/' : './';
    assert.equal(document.querySelector('.ojjuda-service-home').getAttribute('href'),home);
    assert.equal(document.querySelector('.ojjuda-service-name').textContent,'파장');
    assert.equal(document.querySelector('.ojjuda-service-logo').getAttribute('viewBox'),'-16 -16 544 544');
    assert.equal(document.querySelectorAll('.pajang-mast [data-notifications-open]').length,1);
    assert.equal(document.querySelectorAll('.pajang-mast [data-ju-charge-open]').length,1);
    const invitations=document.querySelectorAll('.pajang-mast [data-share-page="pajang"]');
    assert.equal(invitations.length,1);assert.equal(invitations[0].textContent.trim(),'초대');
    assert.equal(invitations[0].getAttribute('aria-label'),'파장 초대 링크 공유');
    assert.ok(document.querySelector('script[src^="/shared/share/page-share.js?v="]'));
    assert.ok(document.querySelector('link[href^="/shared/share/page-share.css?v="]'));
    assert.equal(document.querySelector('[data-pajang-balance]').textContent,'…');
    assert.match([...document.querySelectorAll('link[rel="stylesheet"]')].at(-1).href,/shared\/brand\/service-header\.css/);
    if(filename==='index.html')assert.equal(document.querySelector('input[name="consent"]').required,true);
    dom.window.close();
  }
});

test('the guest and denied gates keep their return destination in Pajang',async t=>{
  const dom=new JSDOM('<section id="gate"></section>',{url:'https://ojjuda.kr/features/pajang/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const {window:w}=dom;
  const gate=await esbuild.build({entryPoints:[path.join(root,'features/pajang/member.mjs')],bundle:true,write:false,format:'iife',globalName:'Gate'});
  w.eval(gate.outputFiles[0].text);
  w.Gate.showGate('로그인이 필요해요',true);
  const links=()=>[...w.document.querySelectorAll('#gate a')].map(link=>link.getAttribute('href'));
  assert.deepEqual(links(),['/?auth=signup&next=pajang','/?auth=login&next=pajang']);
  w.Gate.showGate('다시 확인해 주세요');
  assert.deepEqual(links(),['/features/pajang/']);
  for(const name of ['index.html','station.html','feed.html']){
    const page=new JSDOM(fs.readFileSync(path.join(root,'features/pajang',name),'utf8'));
    assert.equal(page.window.document.querySelector('script[data-return-to="hub"],a[href^="/world.html"]'),null);
    page.window.close();
  }
});

test('member toolbar shows server balance, opens the shared inbox and charges from a settings control',async t=>{
  const f=await fixture(t);
  assert.equal(f.amount(),'70');
  assert.equal(f.w.document.querySelector('[data-notification-dot]').hidden,false);
  f.bell().click();await settle();
  assert.equal(f.w.document.querySelector('#note-notification-backdrop').hidden,false);
  assert.ok(f.calls.some(call=>call.name==='list_app_notifications'));
  f.w.document.querySelector('.nn-heading button').click();
  const settings=f.w.document.createElement('button');settings.setAttribute('data-ju-charge-open','');f.w.document.body.append(settings);
  settings.click();await settle();
  assert.equal(f.w.document.querySelector('.ju-charge-dialog').open,true);
  assert.equal(f.w.document.querySelector('[data-ju-balance]').textContent,'70 ZU');
  const checkout=f.w.document.querySelector('.ju-charge-checkout');checkout.click();checkout.click();await settle();
  assert.equal(f.calls.filter(call=>call.name==='beta_charge').length,1);
  assert.equal(f.amount(),'80');
  assert.ok(f.balanceEvents.some(event=>event.userId==='member-a'&&event.coins===80));
});

test('Pajang requests only its own inbox and skips Park retention',async t=>{
  const created='2026-11-19T00:00:00Z',card='a0000000-0000-4000-8000-000000000001';
  const notice='b0000000-0000-4000-8000-000000000001',retention='c0000000-0000-4000-8000-000000000001';
  const f=await fixture(t,{
    items:[{id:notice,kind:'reply',card_id:card,created_at:created}],
    retention:[{id:retention,kind:'memo',card_id:card,created_at:created,archive_due_at:created}]
  });
  f.bell().click();await settle();
  assert.equal(f.w.document.querySelector('[data-notification-id]'),null);
  assert.equal(f.calls.some(call=>call.name==='list_retention_alerts'),false);
  for(const name of ['list_app_notifications','app_notification_summary']){
    assert.equal(f.calls.find(call=>call.name===name)?.args.p_app,'pajang');
  }
  assert.equal(f.w.location.pathname,'/features/pajang/station.html');
});

test('inquiry replies open inside Pajang and an account switch clears a pending reply',async t=>{
  const replyId='b0000000-0000-4000-8000-000000000001',worldId='b0000000-0000-4000-8000-000000000002';
  const inquiry='a0000000-0000-4000-8000-000000000001',created='2026-11-19T00:00:00Z';
  const items=[
    {id:replyId,kind:'inquiry_reply',inquiry_id:inquiry,created_at:created,read_at:created},
    {id:worldId,kind:'world_message',source:'world',target_type:'message',target_id:inquiry,created_at:created}
  ];
  const pending=deferred();let reads=0;
  const f=await fixture(t,{items,getInquiry:id=>{
    assert.equal(id,inquiry);
    return ++reads===1?{data:{id,body:'내 문의',reply:'운영팀 답변'}}:pending.promise;
  }});
  const {document}=f.w;
  const open=async()=>{
    f.bell().click();await settle();
    const world=document.querySelector('[data-notification-id="'+worldId+'"]');
    assert.equal(world,null);
    document.querySelector('[data-notification-open="'+replyId+'"]').click();await settle();
    return document.querySelector('dialog.pajang-inquiry-dialog');
  };
  const dialog=await open();assert.ok(dialog.open);
  assert.match(dialog.textContent,/내 문의운영팀 답변/);
  dialog.querySelector('button').click();await settle();
  assert.doesNotMatch(dialog.textContent,/내 문의|운영팀 답변/);
  await open();await f.auth('member-b');
  pending.resolve({data:{id:inquiry,body:'이전 계정',reply:'보호되는 답변'}});await settle();
  assert.equal(dialog.open,false);assert.doesNotMatch(dialog.textContent,/이전 계정|보호되는 답변/);
  assert.equal(f.w.location.pathname,'/features/pajang/station.html');
});

test('account changes clear old balances and reject late responses from the previous account',async t=>{
  const old=deferred();
  const f=await fixture(t,{readBalance:owner=>owner==='member-a'?old.promise:{data:{coins:19}}});
  assert.equal(f.amount(),'…');
  await f.auth('member-b');assert.equal(f.amount(),'19');
  old.resolve({data:{coins:9000}});await settle();assert.equal(f.amount(),'19');
  f.wallet().click();await settle();
  assert.equal(f.w.document.querySelector('.ju-charge-dialog').open,true);
  await f.auth(null);
  assert.equal(f.amount(),'—');assert.match(f.wallet().getAttribute('aria-label'),/로그인/);
  assert.equal(f.w.document.querySelector('.ju-charge-dialog').open,false);
  f.balance('member-a',8000);assert.equal(f.amount(),'—');
});

test('signed-out and anonymous sessions make no private wallet or inbox requests',async t=>{
  for(const options of [{user:null},{user:'anonymous-user',anonymous:true}]){
    const f=await fixture(t,options);
    assert.equal(f.amount(),'—');assert.deepEqual(f.reads,[]);assert.deepEqual(f.calls,[]);
    f.bell().click();await settle();
    assert.match(f.w.document.querySelector('.nn-list').textContent,/로그인/);
    f.w.document.querySelector('.nn-heading button').click();
    f.wallet().click();await settle();
    assert.equal(f.w.document.querySelector('[data-ju-balance]').textContent,'로그인 후 확인');
    assert.equal(f.w.document.querySelector('.ju-charge-checkout').disabled,true);
    assert.deepEqual(f.reads,[]);assert.deepEqual(f.calls,[]);
  }
});

test('failed or malformed balance reads stay unknown and can recover on focus',async t=>{
  for(const failure of [{error:{message:'offline'}},{data:{coins:null}},{data:{coins:-1}}]){
    let fail=true;
    const f=await fixture(t,{readBalance:()=>fail?failure:{data:{coins:35}}});
    assert.equal(f.amount(),'—');assert.match(f.wallet().title,/확인 불가/);
    fail=false;f.w.dispatchEvent(new f.w.Event('focus'));await settle();assert.equal(f.amount(),'35');
  }
});

test('purchase events update only the current account and supersede an older balance read',async t=>{
  const old=deferred();const f=await fixture(t,{readBalance:()=>old.promise});
  f.balance('member-a',55);assert.equal(f.amount(),'55');
  old.resolve({data:{coins:70}});await settle();assert.equal(f.amount(),'55');
  for(const [owner,value] of [['member-b',999],['member-a',-1],['member-a','45'],['member-a',1.2]])f.balance(owner,value);
  assert.equal(f.amount(),'55');
  f.balance('member-a',0);assert.equal(f.amount(),'0');
});

test('a late initial session cannot replace an account delivered by the auth callback',async t=>{
  const initial=deferred();const f=await fixture(t,{getSession:()=>initial.promise,readBalance:owner=>({data:{coins:owner==='member-b'?42:99}})});
  await f.auth('member-b');
  initial.resolve({data:{session:{user:{id:'member-a'}}}});await settle();
  assert.equal(f.amount(),'42');assert.deepEqual(f.reads,['member-b']);
});

test('only the genuine same-origin Agit dialog supplies the embedded client',async t=>{
  const accepted=await fixture(t,{embedPath:'/world.html'});
  assert.deepEqual(accepted.counts(),{hostCalls:1,localCalls:0});assert.equal(accepted.amount(),'70');
  const rejected=await fixture(t,{embedPath:'/another-host.html'});
  assert.deepEqual(rejected.counts(),{hostCalls:0,localCalls:1});assert.equal(rejected.amount(),'70');
});


test('member-only CSS does not block the entry gate and is ready before the station is shown',()=>{
  const entry=fs.readFileSync(path.join(root,'features/pajang/index.html'),'utf8');
  const direct=fs.readFileSync(path.join(root,'features/pajang/station.html'),'utf8');
  const load=fs.readFileSync(path.join(root,'features/pajang/load-station.mjs'),'utf8');
  const handoff=fs.readFileSync(path.join(root,'features/pajang/entry.mjs'),'utf8');
  const entryDom=new JSDOM(entry).window.document;
  const directDom=new JSDOM(direct).window.document;
  assert.equal(entryDom.querySelector('link[rel="preload"][href^="./station.css"]'),null,
    'public gate must not download the private member sheet early');
  for(const [document,name] of [[entryDom,'entry'],[directDom,'direct']]){
    const letter=document.querySelector('link[data-pajang-station-style="letterroom"]');
    assert.ok(letter,name+' must load letterroom styles without blocking the gate');
    assert.equal(letter.media,'print');
    assert.match(letter.getAttribute('onload'),/media='all'/);
  }
  const main=directDom.querySelector('link[data-pajang-station-style="main"]');
  assert.ok(main);assert.equal(main.media,'print');
  assert.match(load,/await import\(script\);\s*await waitForStationStyles\(\);/);
  assert.match(load,/link\.dataset\.pajangStyleError/);
  assert.match(handoff,/style\.dataset\.pajangStationStyle='main'/);
});

test('Pajang standalone entry defers shared inbox and charging code until first paint or first tap',()=>{
  const shell=fs.readFileSync(path.join(root,'features/pajang/shell.mjs'),'utf8');
  assert.doesNotMatch(shell,/^import\s*\{installPajangToolbar\}/m,
    'entry must not eagerly download wallet and inbox scripts');
  assert.match(shell,/requestAnimationFrame\(\(\)=>setTimeout\(\(\)=>void prepareToolbar\(\),0\)\)/);
  assert.match(shell,/event\.target\.closest\?\.\('\[data-ju-charge-open\],\[data-notifications-open\]'\)/);
  assert.match(shell,/earlyControl=\{node:control,href:location\.href\};/);
  assert.match(shell,/if\(pending\?\.node\.isConnected && pending\.href===location\.href/);
  assert.match(shell,/window\.OjjudaPajangHistory\?\.canLeave\?\.\(\)!==false/);
  for(const file of ['index.html','station.html']){
    const html=fs.readFileSync(path.join(root,'features/pajang',file),'utf8');
    assert.match(html,/shell\.mjs\?v=20261127-app-inbox1/);
  }
});


function deferredToolbarHarness(t){
  const dom=new JSDOM('<button data-ju-charge-open>충전</button><button data-notifications-open>알림</button>',{
    url:'https://ojjuda.kr/features/pajang/station.html',pretendToBeVisual:true
  });
  const w=dom.window;
  t.after(()=>w.close());
  let resolveImport, count=0, loads=0;
  const requested=new Promise(resolve=>{resolveImport=resolve;});
  const source=fs.readFileSync(path.join(root,'features/pajang/shell.mjs'),'utf8')
    .split('// Optional measurement never delays')[0]
    .replace(/import\('\.\/account-toolbar\.mjs\?v=[\w-]+'\)/,'loadToolbar()');
  const run=new Function('window','document','location','requestAnimationFrame','setTimeout','loadToolbar',source);
  run(w,w.document,w.location,()=>0,()=>0,()=>{loads++;return requested;});
  return {
    w,
    charge:w.document.querySelector('[data-ju-charge-open]'),
    bell:w.document.querySelector('[data-notifications-open]'),
    count:()=>count,
    loads:()=>loads,
    async loaded(){
      resolveImport({installPajangToolbar(){
        w.document.addEventListener('click',event=>{
          if(event.target.closest?.('[data-ju-charge-open],[data-notifications-open]'))count++;
        });
      }});
      await settle();
    }
  };
}

test('deferred Pajang toolbar does not replay stale clicks after navigation or form locking',async t=>{
  const successful=deferredToolbarHarness(t);
  successful.charge.click();assert.equal(successful.count(),0);
  await successful.loaded();assert.equal(successful.count(),1,'one valid early tap is replayed once');

  const moved=deferredToolbarHarness(t);
  moved.bell.click();moved.w.history.pushState({},'', '?tab=profile');
  await moved.loaded();assert.equal(moved.count(),0,'the previous route cannot open a dialog');

  const blockedBefore=deferredToolbarHarness(t);
  blockedBefore.w.OjjudaPajangHistory={canLeave:()=>false};
  blockedBefore.charge.click();assert.equal(blockedBefore.loads(),0,'an unsaved form blocks the early tap');

  const blockedAfter=deferredToolbarHarness(t);
  let locked=false;blockedAfter.w.OjjudaPajangHistory={canLeave:()=>!locked};
  blockedAfter.charge.click();locked=true;
  await blockedAfter.loaded();assert.equal(blockedAfter.count(),0,'a form locked during load stays closed');

  const left=deferredToolbarHarness(t);
  left.charge.click();left.w.dispatchEvent(new left.w.Event('pagehide'));
  await left.loaded();assert.equal(left.count(),0,'leaving cancels a pending tap');
});
