const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
// JSDOM does not load styles here. Preload the actual helper URLs so changing
// a cache key cannot leave support waiting for a stylesheet load event forever.
const supportSource=fs.readFileSync(path.join(root,'features/pajang/src/lib/account-support.mjs'),'utf8');
const supportStyles=[...supportSource.matchAll(/\bloadStyle\(\s*(['"])([^'"]+)\1\s*\)/g)].map(match=>match[2]);
const supportPaths=supportStyles.map(href=>new URL(href,'https://ojjuda.test').pathname);
assert.deepEqual(supportPaths,['/note/support.css','/features/pajang/support.css'],'preload both actual support styles');
for(const pathname of supportPaths)assert.ok(fs.statSync(path.join(root,pathname)).isFile(),'support stylesheet exists: '+pathname);

// Exercise the built React member program with real DOM/history events. The
// network boundary is an in-memory member fixture, never a live user account.
function fixture(t,url='https://ojjuda.test/features/pajang/station.html',{admin=false,radar=false,hidden=false}={}){
  const errors=[];
  const console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><div id="station"></div>',{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window;
  t.after(()=>dom.window.close());
  w.scrollTo=(_x,y)=>{w.scrollY=y;w.dispatchEvent(new w.Event('scroll'));};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  for(const href of supportStyles){
    const link=w.document.createElement('link');link.rel='stylesheet';link.href=href;
    Object.defineProperty(link,'sheet',{value:{}});w.document.head.append(link);
  }
  const me={id:'me',name:'보리',gender:'male',avatarId:200,interest:'book',body:'내 답변',at:1};
  const peer={id:'peer',name:'라온',avatarId:9,interest:'walk',body:'함께 걸어요.',at:1,range:3,bearing:315};
  if(hidden){
    Object.assign(me,{gender:null,avatarId:201});
    Object.assign(peer,{gender:null,avatarId:201});
  }
  const sameCell=radar?['도담','소담'].map((name,i)=>({id:'nearby'+i,name,interest:'book',body:'같은 동네에서 책을 읽어요.',range:1,sameCell:true})):[];
  const state={day:'2026-11-19',slot:'am',question:{id:1,q:['오늘은 무엇을 하고 싶나요?']},nextAt:new Date(Date.now()+3600000).toISOString(),
    me,people:[peer,...sameCell],signals:[{src:'me',dst:'peer'},{src:'peer',dst:'me'}],messages:[],remaining:3,authenticated:true,
    locationEnabled:radar,locationVersion:0,locationChecked:radar,radarOn:radar};
  const row={...peer,peer:peer.id,day:state.day,slot:state.slot,question:'오늘은 무엇을 하고 싶나요?',own:false,sent:true,received:true};
  w.pajangState=state;w.pajangArt={};
  w.OjjudaLocation={acceptPreference(){},subscribe(){return ()=>{};}};
  const calls=[],authListeners=new Set();
  let finishInquiry,session={access_token:'test-member-token',user:{id:'auth-member',is_anonymous:false}};
  const db={auth:{
    getSession:async()=>({data:{session}}),
    getUser:async()=>({data:{user:session?.user||null}}),
    onAuthStateChange(listener){authListeners.add(listener);return {data:{subscription:{unsubscribe(){authListeners.delete(listener);}}}};}
  },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{nickname:'보리'}})})})}),
  schema:()=>({rpc:(name,params)=>{
    const call={name,params,headers:{}};calls.push(call);
    let result;
    if(name==='get_note_state')result=Promise.resolve({data:{}});
    else if(name==='list_my_inquiries')result=Promise.resolve({data:[]});
    else if(name==='submit_inquiry')result=new Promise(resolve=>{finishInquiry=()=>resolve({data:params.p_request_id});});
    else throw Error('Unexpected support operation '+name);
    result.setHeader=(key,value)=>{call.headers[key]=value;return result;};
    result.abortSignal=()=>result;
    return result;
  }}),rpc:(name,params)=>{
    calls.push({name,params});let data;
    if(name==='pajang_member')data=params.p_action==='thread'?state.messages:state;
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
  return {w,errors,calls,authListeners,signOut,messages:state.messages,finishInquiry:()=>finishInquiry(),byText,until,click,menu:label=>click('nav a',label),modal:()=>w.document.querySelector('dialog[open]')};
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
  await f.click('.account-settings button .ojjuda-settings-label','내 프로필 수정');
  await f.until(()=>f.modal());
  f.modal().querySelector('[aria-label="닫기"]').click();await f.until(()=>!f.modal());
  w.history.back();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='inbox');
  w.history.forward();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='profile');
  w.history.forward();await f.until(()=>f.modal());
  assert.equal(f.modal().getAttribute('aria-label'),'내 프로필 수정');
  assert.deepEqual(f.errors,[]);
});

test('opening a chat from a feed profile returns to that feed instead of a fixed list or closed popup',async t=>{
  const f=fixture(t),{w}=f;
  await f.until(()=>f.byText('#answers .person strong','라온'));
  assert.match(w.document.querySelector('#answers .person .pj-character-portrait').style.backgroundImage,/avatars-20261125-03\.webp/);
  await f.click('#answers .person strong','라온');await f.until(()=>f.modal());
  const expanded=f.modal().querySelector('.pj-character-preview');
  assert.match(expanded.getAttribute('aria-label'),/대두형/);
  assert.match(expanded.querySelector('.pj-character-preview-art').style.backgroundImage,/avatars-20261125-03\.webp/);
  await f.click('dialog button','대화 열기');
  await f.until(()=>w.document.querySelector('.composer'));
  assert.match(w.document.querySelector('.chatheader .pj-character-portrait').style.backgroundImage,/avatars-20261125-03\.webp/);
  assert.equal(new URL(w.location.href).searchParams.get('chat'),'peer');
  w.document.querySelector('.chatheader [aria-label="뒤로가기"]').click();
  await f.until(()=>!new URL(w.location.href).searchParams.has('tab'));
  assert.equal(f.modal(),null);assert.equal(w.document.querySelector('.composer'),null);
  w.history.forward();await f.until(()=>w.document.querySelector('.composer'));
  assert.equal(new URL(w.location.href).searchParams.get('chat'),'peer');
  assert.deepEqual(f.errors,[]);
});

test('own portrait and matched chat reuse selected outfits with a fresh scene on each entry', async t => {
  const f=fixture(t), {w}=f, doc=w.document;
  await f.until(()=>f.byText('nav a','내 파장'));
  await f.menu('내 파장');
  const portrait=doc.querySelector('.account-heading [role="img"]');
  assert.equal(portrait.dataset.genderTone,'male');
  assert.match(portrait.style.backgroundImage,/avatars-male-20261125-25\.webp/);

  w.Math.random=()=>0;
  await f.menu('마음함');
  assert.match(doc.querySelector('.listperson .pj-character-portrait').style.backgroundImage,/avatars-20261125-03\.webp/);
  await f.click('button','대화 열기');
  const scenery=()=>doc.querySelector('.pj-chat-scenery');
  const backdrop=()=>scenery()?.querySelector('.pj-chat-backdrop')?.style.backgroundImage;
  await f.until(backdrop);
  const firstScene=backdrop();
  assert.match(firstScene,/avatar-bg-20261125-[1-8]\.webp/);
  assert.equal(scenery().getAttribute('aria-hidden'),'true');
  assert.match(scenery().querySelector('.pj-chat-peer .full').style.backgroundImage,/avatars-20261125-03\.webp/);
  assert.match(scenery().querySelector('.pj-chat-self .full').style.backgroundImage,/avatars-male-20261125-25\.webp/);
  assert.equal(doc.querySelector('.chatlog').contains(scenery()),false);

  w.Math.random=()=>.999;
  f.messages.push({id:'reply',src:'peer',dst:'me',body:'테스트 답장',at:123456789});
  doc.dispatchEvent(new w.Event('visibilitychange'));
  await f.until(()=>f.byText('.bubbleline p','테스트 답장'));
  assert.equal(backdrop(),firstScene,'a message refresh keeps the room background');
  await f.menu('마음함');
  await f.click('button','대화 열기');
  await f.until(backdrop);
  assert.notEqual(backdrop(),firstScene,'reopening the same room draws another scene');
  assert.deepEqual(f.errors,[]);
});

test('outgoing signal and its result show the same member portrait',async t=>{
  const f=fixture(t),{w}=f;
  await f.until(()=>f.byText('nav a','마음함'));
  w.pajangState.signals=[{src:'me',dst:'peer'}];
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  await f.menu('마음함');await f.click('button','보낸 신호 1');
  await f.until(()=>f.byText('button','상태 보기'));
  const listPortrait=w.document.querySelector('.listperson .pj-character-portrait');
  assert.match(listPortrait.style.backgroundImage,/avatars-20261125-03\.webp/);
  await f.click('button','상태 보기');await f.until(()=>f.modal());
  assert.equal(f.modal().querySelector('.resultart .pj-character-portrait').style.backgroundImage,listPortrait.style.backgroundImage);
  assert.deepEqual(f.errors,[]);
});

test('members who hide gender wear the neutral tree on every public surface',async t=>{
  const f=fixture(t,undefined,{radar:true,hidden:true}),doc=f.w.document;
  function treePortrait(scope){
    const portrait=doc.querySelector(scope+' .pj-character-portrait');
    assert.ok(portrait,scope+' has a portrait');
    assert.match(portrait.getAttribute('aria-label'),/나무/);
    assert.equal(portrait.getAttribute('data-gender-tone'),null);
    assert.match(portrait.style.backgroundImage,/tree/i);
  }
  await f.until(()=>f.byText('#answers .person strong','라온'));
  treePortrait('#answers .person');
  await f.click('#answers .person strong','라온');await f.until(()=>f.modal());
  const expanded=f.modal().querySelector('.pj-character-preview');
  assert.match(expanded.getAttribute('aria-label'),/나무/);
  assert.equal(expanded.getAttribute('data-gender-tone'),null);
  assert.match(expanded.querySelector('.pj-character-preview-art').style.backgroundImage,/avatar-tree-20261125\.webp/);
  await f.click('dialog button','대화 열기');
  await f.until(()=>doc.querySelector('.composer'));
  treePortrait('.chatheader');
  for(const side of ['peer','self']){
    const full=doc.querySelector('.pj-chat-'+side+' .pj-character-figure.full');
    assert.ok(full,'the neutral full-height costume is rendered on the '+side+' side');
    assert.match(full.style.backgroundImage,/tree/i);
  }
  await f.menu('마음함');treePortrait('.listperson');
  await f.menu('내 파장');treePortrait('.account-heading');
  await f.menu('오늘');await f.click('button','내 주변');
  await f.until(()=>doc.querySelector('.scope-person'));
  treePortrait('.scope-self');
  const marker=doc.querySelector('.scope-person[aria-label^="라온"]');
  assert.equal(marker.getAttribute('data-gender-tone'),null);
  marker.click();await f.until(()=>f.byText('.radar-identity h2','라온'));
  treePortrait('.radar-identity');
});

test('a directly opened chat replaces itself with its list and legal pages stay in the same tab',async t=>{
  const f=fixture(t,'https://ojjuda.test/features/pajang/station.html?tab=chat&chat=peer'),{w}=f;
  await f.until(()=>w.document.querySelector('.composer'));
  w.document.querySelector('.chatheader [aria-label="뒤로가기"]').click();
  await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='inbox');
  assert.equal(w.history.length,1);
  w.eval(fs.readFileSync(path.join(root,'shared/brand/service-banners.js'),'utf8'));
  await f.menu('내 파장');
  const agitLinks=[...w.document.querySelectorAll('a[href]')].filter(link=>new URL(link.href).pathname==='/world.html');
  assert.equal(agitLinks.length,1);
  assert.ok(agitLinks[0].matches('ojjuda-service-banners[current="pajang"] [data-service="agit"]'));
  for(const name of ['이용약관','개인정보처리방침'])assert.equal(f.byText('.account-settings a .ojjuda-settings-label',name).closest('a').target,'');
  assert.deepEqual(f.errors,[]);
});

test('administrator access stays tied to the current account through popup and tab history',async t=>{
  const f=fixture(t,undefined,{admin:true}),{w}=f;
  const adminEntry=()=>w.document.querySelector('.account-settings a[href="/admin/?from=pajang&admin=pajang-answers"]');
  await f.until(()=>f.byText('nav a','오늘')&&w.document.querySelector('.answer-like')?.disabled===false);
  // Likes watch the member for the lifetime of the app. Settings must add and
  // dispose its own permission watcher without replacing or leaking that one.
  const memberListeners=new Set(f.authListeners);
  assert.equal(memberListeners.size,1,'the mounted member app owns one likes account watcher');
  const permissionListeners=()=>[...f.authListeners].filter(listener=>!memberListeners.has(listener));
  await f.menu('내 파장');await f.until(adminEntry);
  assert.equal(adminEntry().target,'_top');
  assert.equal(permissionListeners().length,1,'settings adds exactly one administrator watcher');
  const firstPermissionListener=permissionListeners()[0];
  assert.deepEqual(f.authListeners,new Set([...memberListeners,firstPermissionListener]));
  const checks=f.calls.filter(call=>call.name==='is_admin').length;

  await f.click('.account-settings button .ojjuda-settings-label','사용법');
  await f.until(()=>f.modal());
  w.history.back();await f.until(()=>!f.modal());
  assert.ok(adminEntry(),'closing a popup keeps the current settings and permission check');
  assert.equal(f.calls.filter(call=>call.name==='is_admin').length,checks);
  assert.deepEqual(f.authListeners,new Set([...memberListeners,firstPermissionListener]),'popup history neither replaces nor duplicates auth watchers');

  await f.menu('오늘');await f.until(()=>permissionListeners().length===0);
  assert.deepEqual(f.authListeners,memberListeners,'leaving settings disposes only its administrator watcher');
  w.history.back();await f.until(adminEntry);
  assert.equal(new URL(w.location.href).searchParams.get('tab'),'profile');
  assert.equal(permissionListeners().length,1,'restored settings owns exactly one permission watcher');
  const restoredPermissionListener=permissionListeners()[0];
  assert.notEqual(restoredPermissionListener,firstPermissionListener,'the old settings watcher was disposed');
  assert.deepEqual(f.authListeners,new Set([...memberListeners,restoredPermissionListener]));
  assert.equal(f.calls.filter(call=>call.name==='is_admin').length,checks+1,'restored settings check the live account again');
  f.signOut();await f.until(()=>!adminEntry());
  await f.until(()=>w.document.querySelector('.answer-like')?.disabled===true);
  assert.deepEqual(f.authListeners,new Set([restoredPermissionListener]),'sign-out invalidates and disposes the likes account watcher');
  await f.menu('오늘');await f.until(()=>f.authListeners.size===0);
  assert.deepEqual(f.errors,[]);
});

test('individual radar markers preserve person selection through popup Back and the chat returns to the radar',async t=>{
  const f=fixture(t,'https://ojjuda.test/features/pajang/station.html?view=radar',{radar:true}),{w}=f;
  const markers=()=>[...w.document.querySelectorAll('.scope-person')];
  const select=async name=>{markers().find(node=>node.getAttribute('aria-label').startsWith(name+',')).click();await f.until(()=>f.byText('.radar-identity h2',name));};
  await f.until(()=>markers().length===3);
  assert.match(w.document.querySelector('.scope-self .pj-character-portrait').style.backgroundImage,/avatars-male-20261125-25\.webp/);
  const separate=markers().find(node=>node.getAttribute('aria-label').startsWith('라온,'));
  assert.match(separate.querySelector('.pj-character-portrait').style.backgroundImage,/avatars-20261125-03\.webp/);
  assert.deepEqual(markers().map(node=>node.querySelector('.scope-person-name').textContent).sort(),['도','라','소']);
  assert.equal(w.document.querySelectorAll('.scope-person.scope-same-cell').length,2);
  assert.equal(w.document.querySelectorAll('.scope-person.scope-same-cell .scope-person-dot').length,2);
  assert.ok(markers().filter(node=>node.classList.contains('scope-same-cell')).every(node=>node.querySelector('.scope-person-name').hidden),'crowded same-cell dots retain their full accessible names while hiding initials');
  assert.equal(w.document.querySelectorAll('.radar-links line').length,1,'same-cell markers never receive an invented bearing');
  await select('소담');
  assert.match(w.document.querySelector('.radar-identity .pj-character-portrait').style.backgroundImage,/avatars-20261125-01\.webp/,'older member data uses the white-shirt portrait');
  const positions=markers().map(node=>[node.style.left,node.style.top]);
  await f.click('button','공개 정보 보기');await f.until(()=>f.modal());
  assert.ok(f.byText('dialog h2','소담'));
  w.history.back();await f.until(()=>!f.modal());
  assert.ok(f.byText('.radar-identity h2','소담'));
  assert.deepEqual(markers().map(node=>[node.style.left,node.style.top]),positions);
  await select('라온');await f.click('button','공개 정보 보기');await f.until(()=>f.modal());
  await f.click('dialog button','대화 열기');await f.until(()=>w.document.querySelector('.composer'));
  w.document.querySelector('.chatheader [aria-label="뒤로가기"]').click();
  await f.until(()=>markers().length===3);
  assert.equal(new URL(w.location.href).searchParams.get('view'),'radar');
  assert.equal(f.modal(),null);
  w.history.forward();await f.until(()=>w.document.querySelector('.composer'));
  assert.equal(new URL(w.location.href).searchParams.get('chat'),'peer');
  assert.deepEqual(f.errors,[]);
});

test('support closes before the visited tab and withdrawal replaces it without resurrecting private support',async t=>{
  const f=fixture(t),{w}=f;
  const support=()=>w.document.querySelector('.note-support-layer:not([hidden])');
  await f.until(()=>f.byText('nav a','오늘'));await f.menu('마음함');await f.menu('내 파장');
  assert.equal(f.byText('.account-settings button .ojjuda-settings-label','회원 탈퇴'),undefined);
  await f.click('.account-settings button .ojjuda-settings-label','문의·의견');
  await f.until(()=>w.document.querySelector('#note-inquiry-body'));
  w.history.back();await f.until(()=>!support());
  assert.equal(new URL(w.location.href).searchParams.get('tab'),'profile');
  w.history.forward();await f.until(()=>support());
  await f.click('.note-support-layer button','닫기');await f.until(()=>!support());
  await f.until(()=>w.history.state.pajangNavigation.modal===null);
  w.history.back();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='inbox');
  w.history.forward();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='profile');
  w.history.forward();await new Promise(resolve=>setTimeout(resolve,30));await f.until(()=>w.history.state.pajangNavigation.modal===null);
  assert.equal(support(),null,'Forward cannot reopen support owned by the previous settings mount');
  await f.click('.account-settings button .ojjuda-settings-label','문의·의견');
  await f.until(()=>w.document.querySelector('#note-inquiry-body'));
  const disclosure=w.document.querySelector('[data-support-account]');
  assert.equal(disclosure.open,false);
  await f.click('.note-support-layer button','회원 탈퇴 안내');
  assert.equal(f.modal(),null,'collapsed account guidance cannot open withdrawal');
  w.document.querySelector('[data-support-account-toggle]').click();
  assert.equal(disclosure.open,true);
  await f.click('.note-support-layer button','회원 탈퇴 안내');
  await f.until(()=>f.modal()?.getAttribute('aria-label')==='오쭈다 회원탈퇴');
  assert.equal(support(),null);
  await f.click('dialog button','취소');await f.until(()=>!f.modal());
  w.history.back();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='inbox');
  assert.equal(support(),null);assert.deepEqual(f.errors,[]);
});

test('Back during an inquiry send preserves its form and exact history entry until the request finishes',async t=>{
  const f=fixture(t),{w}=f;
  await f.until(()=>f.byText('nav a','오늘'));await f.menu('내 파장');
  await f.click('.account-settings button .ojjuda-settings-label','문의·의견');
  await f.until(()=>w.document.querySelector('#note-inquiry-body'));
  const field=w.document.querySelector('#note-inquiry-body'),state=structuredClone(w.history.state),length=w.history.length;
  field.value='작성 중 문의';field.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await f.until(()=>!w.OjjudaNoteSupport.canLeave());
  w.history.back();
  await new Promise(resolve=>setTimeout(resolve,30));
  await f.until(()=>JSON.stringify(w.history.state)===JSON.stringify(state));
  assert.equal(JSON.stringify(w.history.state),JSON.stringify(state));assert.equal(w.history.length,length);
  assert.equal(w.document.querySelector('#note-inquiry-body'),field);assert.equal(field.value,'작성 중 문의');
  assert.equal(w.OjjudaNoteSupport.isOpen(),true);
  f.finishInquiry();await f.until(()=>w.OjjudaNoteSupport.canLeave());
  await f.click('.note-support-layer button','닫기');await f.until(()=>w.history.state.pajangNavigation.modal===null);
  w.history.back();await f.until(()=>!new URL(w.location.href).searchParams.has('tab'));
  assert.deepEqual(f.errors,[]);
});

test('question suggestions use one popup entry and pending submission keeps the form until confirmed',async t=>{
  const f=fixture(t),{w}=f;
  await f.until(()=>f.byText('nav a','오늘'));
  await f.menu('마음함');await f.menu('오늘');
  await f.until(()=>!w.document.querySelector('.question-suggest').disabled);
  await f.click('button','이 질문 어때요?');await f.until(()=>f.modal());
  const length=w.history.length;
  assert.equal(w.history.state.pajangNavigation.resume,'suggestion');
  w.history.back();await f.until(()=>!f.modal());
  assert.equal(new URL(w.location.href).searchParams.get('tab'),null);
  w.history.forward();await f.until(()=>f.modal());
  const field=w.document.getElementById('question-suggestion-body');
  assert.equal(field.value,'');
  Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(field,'함께 나누고 싶은 행복은?');
  field.dispatchEvent(new w.Event('input',{bubbles:true}));
  await f.until(()=>!f.byText('dialog button','질문 보내기').disabled);
  await f.click('dialog button','질문 보내기');
  await f.until(()=>f.calls.some(call=>call.name==='submit_inquiry'));
  const state=JSON.stringify(w.history.state);
  assert.equal(f.modal().querySelector('[aria-label="닫기"]').disabled,true);
  w.history.back();await new Promise(resolve=>setTimeout(resolve,30));
  await f.until(()=>JSON.stringify(w.history.state)===state);
  assert.equal(w.document.getElementById('question-suggestion-body'),field);
  assert.equal(w.history.length,length);
  const submitted=f.calls.find(call=>call.name==='submit_inquiry');
  assert.equal(submitted.headers.Authorization,'Bearer test-member-token');
  assert.ok(!state.includes('함께 나누고 싶은 행복'));
  f.finishInquiry();await f.until(()=>!f.modal());
  w.history.back();await f.until(()=>new URL(w.location.href).searchParams.get('tab')==='inbox');
  assert.deepEqual(f.errors,[]);
});
