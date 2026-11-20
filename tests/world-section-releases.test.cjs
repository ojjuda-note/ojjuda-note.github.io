const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'world.html'),'utf8');
const slice=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const source=[
  slice('function worldMainTab()', '// The Agit hub'),
  slice('var Go="','var ce='),
  slice('function sectionUpdateMarkup()', 'function Zg()'),
  slice('const sectionChecks=', 'var O1=')
].join('\n');

function fixture(storage=new Map(),options={}){
  const href=options.href||'https://ojjuda.kr/world.html?tab=hub';
  const dom=new JSDOM('<main class="main"><textarea></textarea><div data-game-friend-invite-slot></div></main>',{url:href});
  dom.window.document.body.id='app';
  const requests=[],routes=[];
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const location={href,replace:url=>routes.push(new URL(url))};
  const history={state:null,replaceState(state,title,url){this.state=state;location.href=new URL(url,location.href).href;}};
  const c=vm.createContext({URL,Date,window:dom.window,document:dom.window.document,w:String,g:{tab:'hub'},
    localStorage,location,history,setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},clearInterval(){},
    worldParkNotes:{canLeave:()=>true},
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,reply:body=>resolve({ok:true,json:async()=>body}),fail:reject}))});
  let loadedSource=source;
  if(options.versions?.hub)loadedSource=loadedSource.replace(/var Go="[^"]+"/,()=>`var Go=${JSON.stringify(options.versions.hub)}`);
  for(const id of ['arcade','park'])if(options.versions?.[id]){
    loadedSource=loadedSource.replace(new RegExp(`(${id}:\\{name:'[^']+',version:')[^']+`),(_,prefix)=>prefix+options.versions[id]);
  }
  vm.runInContext(loadedSource,c);
  function enter(id){
    c.g.tab=['park','arcade'].includes(id)?'place':id;
    c.g.place=c.g.tab==='place'?{id}:null;
    c.enterReleaseSection();
    c.showSectionUpdate();
  }
  function storageEvent(key,newValue=storage.get(key)??null){
    const event=new dom.window.Event('storage');
    Object.defineProperties(event,{key:{value:key},newValue:{value:newValue},storageArea:{value:localStorage}});
    dom.window.dispatchEvent(event);
  }
  return {c,requests,routes,enter,storageEvent,document:dom.window.document};
}
async function release(f,version,force=false){
  const pending=f.c.checkSectionRelease(undefined,force);
  f.requests.at(-1).reply({version});await pending;
}
test('installed versions match three independent release files and appear in settings',()=>{
  const {c}=fixture();
  const sections=vm.runInContext('sectionReleases',c);
  for(const [id,manifest] of Object.entries({hub:'/version.json',arcade:'/features/arcade/version.json',park:'/park/version.json'})){
    assert.equal(sections[id].manifest,manifest);
    const published=JSON.parse(fs.readFileSync(path.join(root,manifest),'utf8')).version;
    assert.equal(sections[id].version,published);
  }
  assert.ok(html.includes('data-section-versions><h3>버전 정보</h3>'));
});
test('late checks stay with their section, preserve drafts and do not change installed versions',async()=>{
  const {c,requests,enter,document}=fixture();
  const text=document.querySelector('textarea');text.value='작성 중';
  enter('hub');const hub=c.checkSectionRelease();
  enter('arcade');const arcade=c.checkSectionRelease();
  enter('park');const park=c.checkSectionRelease();
  assert.deepEqual(requests.map(r=>r.url.split('?')[0]),['/version.json','/features/arcade/version.json','/park/version.json']);
  assert.ok(requests.every(r=>r.options.cache==='no-store'));
  requests[1].reply({version:'8.0.0'});await arcade;
  requests[0].reply({version:'9.0.0-beta'});await hub;
  assert.equal(document.querySelector('[data-section-update]'),null);
  const installed=c.installedSectionVersion();requests[2].reply({version:installed});await park;
  enter('arcade');assert.match(document.querySelector('[data-section-update]').textContent,/오락실 8\.0\.0/);
  assert.notEqual(c.installedSectionVersion(),'8.0.0');
  assert.equal(document.querySelector('textarea'),text);assert.equal(text.value,'작성 중');
  enter('my');assert.match(document.querySelector('[data-section-update]').textContent,/아지트 9\.0\.0-beta/);
  assert.equal(requests.length,3);
  enter('park');assert.equal(document.querySelector('[data-section-update]'),null);
});
test('applying a Park update keeps the Park route and respects an unfinished edit',async()=>{
  const {c,requests,routes,enter}=fixture();
  c.location.href='https://ojjuda.kr/world.html?tab=arcade&game=yut&card=12#saved';
  enter('park');
  const done=c.checkSectionRelease();requests[0].reply({version:'7.0.0'});await done;
  c.worldParkNotes.canLeave=()=>false;c.I1();assert.equal(routes.length,0);
  c.worldParkNotes.canLeave=()=>true;c.I1();
  assert.equal(routes[0].searchParams.get('tab'),'park');
  assert.equal(routes[0].searchParams.get('place'),'park');
  assert.equal(routes[0].searchParams.get('game'),null);
  assert.equal(routes[0].searchParams.get('card'),'12');
  assert.equal(routes[0].hash,'#saved');
});
test('release checks respect prerelease ordering and ignore malformed responses',()=>{
 const {c}=fixture();
 for(const [next,current,answer] of [
  ['0.67.0-beta','0.66.1-beta',true],['1.2.0','1.2.0-beta',true],
  ['1.2.0-beta.11','1.2.0-beta.9',true],['1.2.0-alpha','1.2.0',false],
  ['1.2.0','1.2.0',false],['0.72.14-beta','0.72.14-beta',false],
  ['0.72.14-beta+build.2','0.72.14-beta',false],
  ['1.2.0+build.4','1.2.0',false],[['1.2.0'],'1.0.0',null],['<bad>','1.0.0',null]
 ])assert.equal(c.newerSectionVersion(next,current),answer);
});
test('closing a release notice persists across visits without hiding the next release or another section',async()=>{
 const storage=new Map(),first=fixture(storage);
 first.enter('hub');const pending=first.c.checkSectionRelease();first.requests[0].reply({version:'9.0.0'});await pending;
 const input=first.document.querySelector('textarea');input.value='작성 중';
 assert.ok(first.document.querySelector('[data-act="app-update-dismiss"]'));
 first.c.dismissSectionUpdate();assert.equal(first.document.querySelector('[data-section-update]'),null);
 first.enter('arcade');const arcade=first.c.checkSectionRelease();first.requests[1].reply({version:'9.0.0'});await arcade;
 assert.match(first.document.querySelector('[data-section-update]').textContent,/오락실/);
 first.enter('hub');assert.equal(first.document.querySelector('[data-section-update]'),null);
 assert.equal(first.document.querySelector('textarea'),input);assert.equal(input.value,'작성 중');
 const again=fixture(storage);again.enter('hub');const repeated=again.c.checkSectionRelease();again.requests[0].reply({version:'9.0.0'});await repeated;
 assert.equal(again.document.querySelector('[data-section-update]'),null,'same dismissed release stays closed after reopening');
 assert.notEqual(again.c.installedSectionVersion(),'9.0.0','dismissing never pretends the update is installed');
 const fresh=again.c.checkSectionRelease(undefined,true);again.requests[1].reply({version:'10.0.0'});await fresh;
 assert.match(again.document.querySelector('[data-section-update]').textContent,/10\.0\.0/);
});
test('an installed release does not reappear as an update in any section',async()=>{
 const {c,enter,requests,document,routes}=fixture();
 for(const id of ['hub','arcade','park']){
  enter(id);const pending=c.checkSectionRelease();requests.at(-1).reply({version:c.installedSectionVersion()});await pending;
  assert.equal(document.querySelector('[data-section-update]'),null);c.I1();
 }
 assert.equal(routes.length,0);
});
test('applying an update bypasses a previously cached attempt and ignores repeated taps',async()=>{
 const {c,enter,requests,document,routes}=fixture();
 c.location.href='https://ojjuda.kr/world.html?tab=hub&v=hub-9.0.0&update_nonce=old#home';
 enter('hub');const pending=c.checkSectionRelease();requests[0].reply({version:'9.0.0'});await pending;
 c.I1();c.I1();assert.equal(routes.length,1);
 assert.equal(routes[0].searchParams.get('v'),'hub-9.0.0');
 assert.match(routes[0].searchParams.get('update_nonce'),/^\d+$/);
 assert.equal(routes[0].hash,'#home');assert.ok(document.querySelector('[data-act="app-update"]').disabled);
 assert.notEqual(c.installedSectionVersion(),'9.0.0');
});
test('a dismissed notice stays closed in memory when device storage is unavailable',async()=>{
 const blocked={get(){throw Error('storage blocked');},set(){throw Error('storage blocked');}};
 const {c,enter,requests,document}=fixture(blocked);
 enter('hub');const pending=c.checkSectionRelease();requests[0].reply({version:'9.0.0'});await pending;
 c.dismissSectionUpdate();c.showSectionUpdate();assert.equal(document.querySelector('[data-section-update]'),null);
});
test('closing an update synchronizes an already open tab without replacing its draft',async()=>{
 const storage=new Map(),first=fixture(storage),second=fixture(storage);
 first.c.j1();second.c.j1();
 first.enter('hub');second.enter('hub');await release(first,'9.0.0');await release(second,'9.0.0');
 const draft=second.document.querySelector('textarea');draft.value='작성 중';
 first.c.dismissSectionUpdate();second.storageEvent('ojjuda:dismissed-update:hub');
 assert.equal(second.document.querySelector('[data-section-update]'),null,'the other tab closes immediately');
 await release(second,'9.0.0',true);second.c.showSectionUpdate();
 assert.equal(second.document.querySelector('[data-section-update]'),null,'a repeated manifest cannot reopen it');
 assert.equal(second.document.querySelector('textarea'),draft);assert.equal(draft.value,'작성 중');
 second.enter('arcade');await release(second,'9.0.0');
 assert.match(second.document.querySelector('[data-section-update]').textContent,/오락실/,'another service keeps its own notice');
});
test('an older tab cannot overwrite a newer dismissal or revive an older release',async()=>{
 const storage=new Map(),older=fixture(storage),newer=fixture(storage);
 older.enter('hub');newer.enter('hub');await release(older,'9.0.0');await release(newer,'10.0.0');
 newer.c.dismissSectionUpdate();older.c.dismissSectionUpdate();
 assert.equal(storage.get('ojjuda:dismissed-update:hub'),'10.0.0','dismissed version never moves backwards');
 const reopened=fixture(storage);reopened.enter('hub');await release(reopened,'9.0.0');
 assert.equal(reopened.document.querySelector('[data-section-update]'),null,'a lower manifest is also already dismissed');
 await release(reopened,'10.0.0',true);assert.equal(reopened.document.querySelector('[data-section-update]'),null);
 await release(reopened,'11.0.0',true);assert.match(reopened.document.querySelector('[data-section-update]').textContent,/11\.0\.0/);
});
test('a delayed storage event restores the higher dismissal after a competing older write',async()=>{
 const key='ojjuda:dismissed-update:hub',storage=new Map([[key,'9.0.0']]),f=fixture(storage);
 f.c.j1();f.enter('hub');await release(f,'10.0.0');
 assert.ok(f.document.querySelector('[data-section-update]'));
 // Two other tabs write before this tab receives the first queued event.
 // The tab that wrote 10.0.0 can already be closed when the event is delivered.
 storage.set(key,'10.0.0');storage.set(key,'9.0.0');
 f.storageEvent(key,'10.0.0');
 assert.equal(storage.get(key),'10.0.0','the event preserves information newer than the current storage value');
 assert.equal(f.document.querySelector('[data-section-update]'),null);
 f.storageEvent(key,'9.0.0');
 assert.equal(storage.get(key),'10.0.0','a later stale event cannot lower the recovered version');
 assert.equal(f.document.querySelector('[data-section-update]'),null);
});
test('old HTML after an update shows a retry state without claiming the release is installed',async()=>{
 const storage=new Map(),first=fixture(storage);first.enter('hub');await release(first,'9.0.0');
 const installed=first.c.installedSectionVersion();first.c.I1();
 const savedAttempt=storage.get('ojjuda:update-attempt:hub');assert.ok(savedAttempt,'the update target survives navigation');
 const attempt=JSON.parse(savedAttempt);
 assert.equal(attempt.version,'9.0.0');assert.ok(Number.isFinite(attempt.at));
 const returned=fixture(storage,{href:first.routes[0].href});returned.c.j1();returned.enter('hub');await release(returned,'9.0.0');
 const banner=returned.document.querySelector('[data-section-update-failed]');assert.ok(banner);
 assert.match(banner.textContent,/다시 불러오기/);assert.doesNotMatch(banner.textContent,/업데이트가 있어요/);
 assert.equal(returned.c.installedSectionVersion(),installed);
 assert.equal(returned.c.sectionCheck('hub').failedVersion,'9.0.0');
 assert.equal(new URL(returned.c.location.href).searchParams.has('v'),false);
 assert.equal(new URL(returned.c.location.href).searchParams.has('update_nonce'),false);
 const later=fixture(storage);later.c.j1();later.enter('hub');await release(later,'9.0.0');
 assert.ok(later.document.querySelector('[data-section-update-failed]'),'the retry state survives a later visit without URL flags');
 assert.equal(later.routes.length,0,'a failed update never starts a navigation loop');
 later.c.I1();assert.equal(later.routes.length,1,'retry remains an explicit action');
});
test('a known failed update stays retryable when the release manifest cannot be fetched',async()=>{
 const storage=new Map([['ojjuda:update-attempt:hub',JSON.stringify({version:'9.0.0',at:Date.now()})]]),f=fixture(storage);
 const installed=f.c.installedSectionVersion();f.c.j1();f.enter('hub');
 const pending=f.c.checkSectionRelease();f.requests.at(-1).fail(Error('offline'));await pending;
 const banner=f.document.querySelector('[data-section-update-failed]');assert.ok(banner,'a failed manifest fetch cannot hide the known retry target');
 assert.match(banner.textContent,/다시 불러오기/);assert.doesNotMatch(banner.textContent,/업데이트가 있어요/);
 assert.equal(f.c.installedSectionVersion(),installed);assert.equal(f.routes.length,0);
 f.c.I1();assert.equal(f.routes.length,1);assert.equal(f.routes[0].searchParams.get('v'),'hub-9.0.0');
});
test('loading the requested release or newer finishes only that service update',async()=>{
 for(const loaded of ['9.0.0','9.1.0']){
  const storage=new Map([
   ['ojjuda:update-attempt:hub',JSON.stringify({version:'9.0.0',at:Date.now()})],
   ['ojjuda:update-attempt:park',JSON.stringify({version:'8.0.0',at:Date.now()})],
   ['fixture:account-state','unchanged']
  ]);
  const f=fixture(storage,{href:'https://ojjuda.kr/world.html?tab=hub&v=hub-9.0.0&update_nonce=123#saved',versions:{hub:loaded}});
  f.c.j1();f.enter('hub');await release(f,loaded);
  assert.equal(f.c.installedSectionVersion(),loaded);
  assert.equal(f.document.querySelector('[data-section-update],[data-section-update-failed]'),null);
  assert.equal(storage.has('ojjuda:update-attempt:hub'),false,'a verified installed update clears its attempt');
  assert.equal(JSON.parse(storage.get('ojjuda:update-attempt:park')).version,'8.0.0');
  assert.equal(storage.get('fixture:account-state'),'unchanged');
  assert.equal(new URL(f.c.location.href).hash,'#saved');assert.equal(f.routes.length,0);
 }
});
test('the update URL retains its target when browser storage is unavailable',async()=>{
 const blocked={get(){throw Error('storage blocked');},set(){throw Error('storage blocked');},delete(){throw Error('storage blocked');}};
 const first=fixture(blocked);first.enter('hub');await release(first,'9.0.0');first.c.I1();
 assert.equal(first.routes.length,1);assert.equal(first.routes[0].searchParams.get('v'),'hub-9.0.0');
 const returned=fixture(blocked,{href:first.routes[0].href});returned.c.j1();returned.enter('hub');await release(returned,'9.0.0');
 assert.ok(returned.document.querySelector('[data-section-update-failed]'));
 assert.notEqual(returned.c.installedSectionVersion(),'9.0.0');
 const installed=fixture(blocked,{href:first.routes[0].href,versions:{hub:'9.0.0'}});
 installed.c.j1();installed.enter('hub');await release(installed,'9.0.0');
 assert.equal(installed.document.querySelector('[data-section-update],[data-section-update-failed]'),null);
 assert.equal(new URL(installed.c.location.href).searchParams.has('v'),false,'a genuinely installed release tidies its target even without storage');
});
test('reloading a failed update keeps the retry state when browser storage is unavailable',async()=>{
 const blocked={get(){throw Error('storage blocked');},set(){throw Error('storage blocked');},delete(){throw Error('storage blocked');}};
 const first=fixture(blocked);first.enter('hub');await release(first,'9.0.0');first.c.I1();
 const failed=fixture(blocked,{href:first.routes[0].href});failed.c.j1();failed.enter('hub');await release(failed,'9.0.0');
 assert.ok(failed.document.querySelector('[data-section-update-failed]'));
 const refreshed=fixture(blocked,{href:failed.c.location.href});refreshed.c.j1();refreshed.enter('hub');await release(refreshed,'9.0.0');
 const banner=refreshed.document.querySelector('[data-section-update-failed]');assert.ok(banner,'another reload must retain the unfulfilled target');
 assert.match(banner.textContent,/다시 불러오기/);assert.doesNotMatch(banner.textContent,/업데이트가 있어요/);
 assert.notEqual(refreshed.c.installedSectionVersion(),'9.0.0');assert.equal(refreshed.routes.length,0);
});
test('a withdrawn update target is removed without losing auth parameters or another service target',async()=>{
 const blocked={get(){throw Error('storage blocked');},set(){throw Error('storage blocked');},delete(){throw Error('storage blocked');}};
 const href='https://ojjuda.kr/world.html?tab=hub&v=hub-9.0.0&update_nonce=123&code=fixture-auth-code&state=fixture-auth-state#saved';
 const returned=fixture(blocked,{href});returned.c.j1();returned.enter('hub');await release(returned,'8.0.0');
 const cleaned=new URL(returned.c.location.href);
 assert.equal(cleaned.searchParams.has('v'),false);assert.equal(cleaned.searchParams.has('update_nonce'),false);
 assert.equal(cleaned.searchParams.get('code'),'fixture-auth-code');assert.equal(cleaned.searchParams.get('state'),'fixture-auth-state');
 assert.equal(cleaned.hash,'#saved');assert.equal(returned.c.sectionCheck('hub').failedVersion,null);
 assert.equal(returned.document.querySelector('[data-section-update-failed]'),null);
 assert.match(returned.document.querySelector('[data-section-update]').textContent,/8\.0\.0/,'the valid manifest replaces the withdrawn target');
 const refreshed=fixture(blocked,{href:cleaned.href});refreshed.c.j1();refreshed.enter('hub');
 const pending=refreshed.c.checkSectionRelease();refreshed.requests.at(-1).fail(Error('offline'));await pending;
 assert.equal(refreshed.document.querySelector('[data-section-update],[data-section-update-failed]'),null,'a later network failure cannot revive the withdrawn release');
 assert.equal(refreshed.c.sectionCheck('hub').failedVersion,null);assert.equal(refreshed.routes.length,0);
 assert.equal(new URL(refreshed.c.location.href).searchParams.get('code'),'fixture-auth-code');
 assert.equal(new URL(refreshed.c.location.href).hash,'#saved');
 const other=fixture(blocked,{href});other.c.j1();other.enter('hub');
 const otherTarget=new URL(href);otherTarget.searchParams.set('v','park-9.0.0');otherTarget.searchParams.set('update_nonce','456');
 other.c.location.href=otherTarget.href;
 await release(other,'8.0.0');
 assert.equal(other.c.location.href,otherTarget.href,'a late Hub manifest must preserve Park recovery, auth parameters and the hash');
});
test('publishing a Park-only bump stamps just the Park version into the shell',t=>{
 const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ojjuda-sections-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 for(const file of ['version.json','features/arcade/version.json','park/version.json','world.html']){
  fs.mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(temp,file));
 }
 const {execFileSync}=require('node:child_process');
 const stamp=()=>execFileSync(process.execPath,[path.join(root,'scripts/sync-section-versions.mjs'),temp]);
 stamp();assert.equal(fs.readFileSync(path.join(temp,'world.html'),'utf8'),html);
 fs.writeFileSync(path.join(temp,'park/version.json'),'{"version":"25.1.8"}');stamp();
 assert.equal(fs.readFileSync(path.join(temp,'world.html'),'utf8'),html.replace(/(park:\{name:'공원',version:')[^']+/,(_,prefix)=>prefix+'25.1.8'));
});
