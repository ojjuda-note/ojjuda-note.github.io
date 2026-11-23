const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const html = read('world.html');
const start = html.indexOf('function captureWorldRoute()');
const end = html.indexOf('async function gm(t)',start);
assert.ok(start !== -1 && end > start);

async function fixture(){
 const dom=new JSDOM('<!doctype html><main class="main"></main>',{url:'https://world.test/world.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,observers=[],Observer=w.MutationObserver;
 w.MutationObserver=class extends Observer{constructor(callback){super(callback);observers.push(this);}};
 w.scrollTo=()=>{};
 w.worldAdminService='agit';w.worldParkNotes=null;w.g={tab:'hub'};w.D={online:true,isAdmin:true,user:{id:'admin-a'}};w.L={area:'account',tab:'overview'};w.P={};
 const registryStart=html.indexOf('adminAreas=['),registryEnd=html.indexOf(',Ku=',registryStart);
 w.eval('var '+html.slice(registryStart,registryEnd)+';');
 w.eval(read('admin/service-scope.js'));
 w.worldMainTab=()=>w.g.tab;
 w.syncAdminContentFilters=()=>{};
 w.H=()=>w.navigation?.sync();
 w.sr={tab({tab}){w.g.tab=tab;w.H();}};
 w.eval(read('app/world/world-navigation.js'));
 w.eval(html.slice(start,end));
 let allow=true,leaveChecks=0;
 w.adminCanLeave=()=>{leaveChecks++;return allow;};
 const guarded=w.sr.tab;w.sr.tab=(...args)=>{if(w.worldRouteRestoring||w.adminCanLeave())return guarded(...args);};
 w.navigation=w.OjjudaWorldNavigation.install({
  currentTab:w.worldMainTab,isMain:()=>w.g.tab==='hub',hasOverlay:()=>false,closeOverlay:()=>false,
  captureRoute:w.captureWorldRoute,restoreRoute:w.restoreWorldRoute,routeUrl:w.worldRouteUrl,
  canLeave:w.adminCanLeave,tabs:['hub','my'],changeTab:tab=>w.sr.tab({tab})
 });
 const visible=html.match(/sr\["adm-back"\]=([^;]+);/)[1];
 w.worldNavigation=w.navigation;w.eval('sr["adm-back"]='+visible+';');
 w.navigation.sync();
 const settle=()=>new Promise(resolve=>w.setTimeout(resolve,15));
 return {w,settle,
  state:()=>[w.g.tab,w.L.area,w.L.tab],get service(){return w.worldAdminService;},get leaveChecks(){return leaveChecks;},
  allow(value){allow=value;},
  async visit(area,tab,service){w.worldAdminService=service||w.OjjudaAdminScope.owner(tab)||w.worldAdminService;w.g.tab='admin';w.L.area=area;w.L.tab=tab;w.H();await settle();},
  async back(){w.history.back();await settle();await settle();},
  async forward(){w.history.forward();await settle();await settle();},
  async button(){w.sr['adm-back']();await settle();await settle();},
  close(){for(const observer of observers)observer.disconnect();dom.window.close();}
 };
}

test('administrator Back returns through visited sections instead of jumping to overview',async()=>{
 const f=await fixture();try{
  await f.visit('account','overview');await f.visit('account','users');await f.visit('content','cards');
  await f.back();assert.deepEqual(f.state(),['admin','account','users']);
  await f.back();assert.deepEqual(f.state(),['admin','account','overview']);
  await f.back();assert.equal(f.w.g.tab,'hub');
 }finally{f.close();}
});

test('unsaved administrator work blocks Back, retaining the exact current view',async()=>{
 const f=await fixture();try{
  await f.visit('account','overview');await f.visit('support','reports');f.allow(false);
  await f.back();assert.deepEqual(f.state(),['admin','support','reports']);
  f.allow(true);await f.back();assert.deepEqual(f.state(),['admin','account','overview']);
 }finally{f.close();}
});

test('the visible administrator Back button uses the same previous visit as browser Back',async()=>{
 const f=await fixture();try{
  await f.visit('content','cards');await f.visit('support','reports');
  await f.button();assert.deepEqual(f.state(),['admin','content','cards']);
 }finally{f.close();}
});

test('restoring a protected administrator route never restores administrator access',async()=>{
 const f=await fixture();try{
  await f.visit('content','cards');await f.visit('support','reports');f.w.D.isAdmin=false;
  await f.back();assert.equal(f.w.g.tab,'my');
  assert.equal(f.w.history.state.ojjudaWorldHistory.route.tab,'my');
  assert.equal(new URL(f.w.location.href).searchParams.has('admin'),false);
 }finally{f.close();}
});

test('the separate reward tool delegates Back to the shared history-aware service fallback',()=>{
 const dom=new JSDOM('<!doctype html><head></head>',{url:'https://world.test/admin/rewards.html',runScripts:'outside-only'});
 try{
  dom.window.eval(read('admin/back-navigation.js'));
  const script=dom.window.document.querySelector('script');
  assert.equal(new URL(script.src).pathname,'/shared/navigation/section-back.js');
  assert.equal(script.dataset.returnTo,'admin');
 }finally{dom.window.close();}
});


test('leaving administrator mode asks the pending/draft guard only once',async()=>{
 const f=await fixture();try{
  await f.visit('content','cards');const before=f.leaveChecks;
  await f.button();assert.equal(f.w.g.tab,'hub');
  assert.equal(f.leaveChecks-before,1);
 }finally{f.close();}
});


for(const service of ['park','pajang']){
 test(service+' administrator Back and Forward retain the selected service on common views',async()=>{
  const f=await fixture();try{
   const home=f.w.OjjudaAdminScope.services[service].home;
   await f.visit('content',home,service);await f.visit('account','users',service);
   await f.visit('support','reports',service);
   await f.back();assert.equal(f.service,service);assert.deepEqual(f.state(),['admin','account','users']);
   assert.equal(new URL(f.w.location.href).searchParams.get('from'),service);
   await f.back();assert.equal(f.service,service);assert.equal(f.w.L.tab,home);
   await f.forward();assert.equal(f.service,service);assert.equal(f.w.L.tab,'users');
  }finally{f.close();}
 });
}

test('switching services on a shared view remains a distinct navigation visit',async()=>{
 const f=await fixture();try{
  for(const service of ['agit','park','pajang'])await f.visit('account','users',service);
  await f.back();assert.equal(f.service,'park');assert.equal(f.w.L.tab,'users');
  await f.back();assert.equal(f.service,'agit');assert.equal(f.w.L.tab,'users');
  await f.forward();assert.equal(f.service,'park');
 }finally{f.close();}
});

test('restoring a foreign dedicated tab uses the chosen service home and never grants authority',async()=>{
 const f=await fixture();try{
  await f.visit('content','pajang-answers','pajang');
  f.w.restoreWorldRoute({tab:'admin',service:'pajang',area:'content',section:'cards',owner:'admin-a'});
  assert.equal(f.service,'pajang');assert.equal(f.w.L.tab,'pajang-answers');
  await f.visit('support','reports','pajang');f.w.D.user={id:'admin-b'};
  await f.back();assert.equal(f.w.g.tab,'my');
  assert.equal(f.w.history.state.ojjudaWorldHistory.route.tab,'my');
 }finally{f.close();}
});
