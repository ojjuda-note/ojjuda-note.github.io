const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const world=read('world.html');
function between(start,end){
  const from=world.indexOf(start),to=world.indexOf(end,from);
  assert.ok(from>=0&&to>from,`load real World code: ${start}`);
  return world.slice(from,to);
}
const registry='var '+between('adminAreas=[',',Ku=')+';';
const stateCode=between('var adminRetiredTabs=','let adminMenuSummary=');
const noteRoutes=between('function syncAdminContentFilters()','var Zr=');
const loaderCode=between('var Zr=','function js()');
const navigationCode=between('function adminIsHome()','document.addEventListener("DOMContentLoaded",mountAdminModule');
const actionCode=between('sr["adm-back"]','sr["adm-folder"]');
const renderHelpers=between('var wr=','function y0(){');
const renderCode=between('function y0(){','function ch(t)');
const viewKey='ojjuda.world.admin-view';
const userId='synthetic-admin-a';
const services=['agit','park','pajang'];

function fixture({query='',navigation='navigate',saved,identity=userId,isAdmin=true,online=true}={}){
  const storage=new Map(saved===undefined?[]:[[viewKey,typeof saved==='string'?saved:JSON.stringify(saved)]]);
  const local=new Map(),redirects=[],park=[],calls=[];
  let canLeave=true,renders=0;
  const document={addEventListener(){}};
  const window={document,scrollTo(){},localStorage:{getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value)}};
  const location={href:'https://fixture.invalid/world.html'+query,assign:url=>redirects.push(url)};
  const history={state:null,replaceState(state,_title,url){this.state=state;location.href=new URL(url,location.href).href;}};
  const g={tab:'hub'},D={online,isAdmin,user:identity?{id:identity,user_metadata:{is_admin:true}}:null};
  const L={area:'account',tab:'overview',noteTab:'cards',reportSource:'world',q:'',cache:{},loading:null};
  const values={overview:{users:17,reports_open:3},users:[{id:'synthetic-member'}],words:{words:[],allow:[],off:[]},errors:[]};
  const U=Object.fromEntries([['overview','overview'],['findUsers','users'],['bannedList','words'],['errors','errors']].map(([method,key])=>[method,async(...args)=>{calls.push({method,args});return values[key];}]));
  const context=vm.createContext({window,document,location,history,URL,g,D,L,U,S:null,
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    performance:{getEntriesByType:()=>[{type:navigation}]},worldVisitRequest:0,adminLeavingDocument:false,
    adminMenuSummary:{owner:null,data:null,pending:false},ensureAdminMenuSummary(){},adminCanLeave:()=>canLeave,
    H(){renders++;context.saveWorldAdminView();},bt(){renders++;},w:String,
    wt:{first_visit_ju:15,beta_free_charge:true,beta_charge_daily_limit:5},Io:{profanity:[],sexual:[],drugs:[]},
    ph:()=>'<div id="synthetic-shared-log"></div>',
    sr:{tab({tab}){g.tab=tab;}},worldParkNotes:{open(tab){park.push(tab);g.tab='place';g.place={id:'park'};}}
  });
  for(const code of [read('admin/service-scope.js'),read('admin/navigation.js'),registry,stateCode,noteRoutes,loaderCode,navigationCode,actionCode,renderHelpers,renderCode])vm.runInContext(code,context);
  return {context,g,D,L,storage,location,redirects,park,calls,values,scope:window.OjjudaAdminScope,
    canLeave:value=>{canLeave=value;},get renders(){return renders;},
    snapshot:()=>({service:context.worldAdminService,screen:g.tab,area:L.area,tab:L.tab})};
}

test('every current tab is either shared by all services or dedicated to exactly one service',()=>{
  const f=fixture(),scope=f.scope;
  const expected={
    agit:['messages','groups','photo-stages','drinking-prompts','fortune-purchases','trash-messages'],
    park:['cards','risk','map','note-users','spam','trash-cards'],
    pajang:['pajang-answers','pajang-questions','pajang-chats']
  };
  const registered=new Set(Object.values(f.context.adminTabsByArea).flatMap(tabs=>tabs.map(([tab])=>tab)));
  const classified=new Set([...scope.common,...Object.values(scope.dedicated).flat()]);
  assert.deepEqual([...classified].sort(),[...registered].sort(),'new registry tabs must be assigned a service scope');
  for(const service of services){
    assert.deepEqual(Array.from(scope.dedicated[service]),expected[service]);
    for(const tab of registered){
      const allowed=services.filter(candidate=>scope.allows(candidate,tab));
      assert.deepEqual(allowed,scope.common.includes(tab)?services:[scope.owner(tab)],tab);
    }
  }
  for(const invalid of ['',null,undefined,'constructor','__proto__',{},['park']]){
    assert.equal(scope.valid(invalid),false);
    assert.equal(scope.normalize(invalid),'agit');
  }
});

for(const service of services){
  test(`${service} deep links, explicit entry and stale foreign links remain within that service`,()=>{
    const f=fixture({query:'?from='+service}),home=f.scope.services[service].home;
    assert.equal(f.context.restoreWorldAdminView(home),true);
    assert.deepEqual(f.snapshot(),{service,screen:'admin',area:service==='agit'?'account':'content',tab:home});
    for(const tab of f.scope.dedicated[service]){
      assert.equal(f.context.openWorldAdmin(tab,service),true);
      assert.equal(f.L.tab,tab);
    }
    for(const other of services.filter(value=>value!==service)){
      for(const tab of f.scope.dedicated[other]){
        assert.equal(f.context.openWorldAdmin(tab,service),true);
        assert.equal(f.L.tab,home,'explicit service entry resets a foreign tab to its own home');
        const before=f.snapshot();
        f.context.sr['adm-open']({area:f.context.adminAreaForTab(tab),v:tab});
        assert.deepEqual(f.snapshot(),before,'a stale menu event cannot select a different service’s tab');
      }
    }
    f.context.sr['adm-open']({area:'support',v:'reports'});
    assert.deepEqual(f.snapshot(),{service,screen:'admin',area:'support',tab:'reports'});
    const before=f.snapshot();f.canLeave(false);
    assert.equal(f.context.openWorldAdmin('overview','agit'),false);
    assert.deepEqual(f.snapshot(),before,'unsaved work blocks switching services');
  });
}

test('direct links infer the owning service while an explicit different service resets the tab',()=>{
  for(const [tab,service] of [['messages','agit'],['risk','park'],['pajang-chats','pajang'],['pajang-questions','pajang']]){
    const f=fixture();assert.equal(f.context.restoreWorldAdminView(tab),true);
    assert.equal(f.context.worldAdminService,service);assert.equal(f.L.tab,tab);
  }
  const f=fixture({query:'?admin=cards&from=pajang'});
  assert.equal(f.context.restoreWorldAdminView('cards'),true);
  assert.deepEqual(f.snapshot(),{service:'pajang',screen:'admin',area:'content',tab:'pajang-answers'});
});

test('common menu destinations render the same existing data views in all three services',()=>{
  const f=fixture();
  const common=f.context.window.OjjudaAdminNavigation.GROUPS.flatMap(group=>group.items)
    .filter(([,tab])=>f.scope.common.includes(tab));
  common.push(['content','rewards']);
  Object.assign(f.L.cache,{overview:f.values.overview,words:f.values.words,errors:f.values.errors});
  f.g.tab='admin';
  for(const [area,tab] of common){
    const bodies=services.map(service=>{
      f.context.worldAdminService=service;f.L.area=area;f.L.tab=tab;
      const html=f.context.y0();
      assert.ok(html.includes(f.scope.services[service].label+' 관리자모드'));
      assert.equal(f.context.adminDataTab(),tab);
      const parts=html.split('<!--adm-main-->');
      assert.equal(parts.length,2,'render the real shared navigation and workspace');
      // Shared operations keep identical content; their external Back link remembers the current service.
      return tab==='rewards'?parts[1].replace(/\/admin\/rewards\.html\?from=(?:park|pajang)/g,'/admin/rewards.html'):parts[1];
    });
    assert.equal(bodies[1],bodies[0],`${area}/${tab} keeps the same Park data view`);
    assert.equal(bodies[2],bodies[0],`${area}/${tab} keeps the same Pajang data view`);
  }
});

test('the reward-registration workspace link preserves the administrator service',()=>{
  for(const service of services){
    const f=fixture({query:'?admin=rewards&from='+service});
    assert.equal(f.context.restoreWorldAdminView('rewards'),true);
    const html=f.context.y0();
    const href=html.match(/href="([^"]+)"[^>]*>상품권 등록 화면 열기<\/a>/)?.[1];
    assert.equal(href,'/admin/rewards.html'+(service==='agit'?'':'?from='+service));
  }
});

test('common loaders reuse their existing API calls and results independently of service',async()=>{
  const f=fixture();
  for(const service of services){
    f.context.worldAdminService=service;
    for(const [tab,method,key,args] of [['overview','overview','overview',[]],['users','findUsers','users',['fixture query']],['words','bannedList','words',[]],['errors','errors','errors',[]]]){
      f.L.tab=tab;f.L.q='fixture query';f.L.cache={};f.context.th(true);
      await new Promise(setImmediate);
      assert.deepEqual(f.calls.at(-1),{method,args});
      assert.equal(f.L.cache[f.context.Zr()],f.values[key],'all services read the same shared result');
    }
  }
});

for(const service of services){
  test(`${service} reload restores navigation for the same verified administrator only`,()=>{
    const f=fixture({query:'?from='+service}),tab=service==='agit'?'messages':service==='park'?'risk':'pajang-chats';
    assert.equal(f.context.restoreWorldAdminView(tab),true);
    f.L.cache.sensitiveFixture='must not be saved';f.context.saveWorldAdminView();
    const saved=JSON.parse(f.storage.get(viewKey));
    assert.equal(saved.service,service);assert.equal(saved.userId,userId);assert.equal(saved.tab,tab);
    assert.equal(JSON.stringify(saved).includes('must not be saved'),false);
    assert.equal(Object.hasOwn(saved,'isAdmin'),false,'stored navigation cannot authorize an account');
    const reload=fixture({saved,navigation:'reload'});
    assert.equal(reload.context.restoreWorldAdminView(null),true);
    assert.deepEqual(reload.snapshot(),f.snapshot());
    for(const options of [{identity:'synthetic-admin-b'},{isAdmin:false},{identity:null},{online:false}]){
      const denied=fixture({saved:{...saved,isAdmin:true},navigation:'reload',...options});
      assert.equal(denied.context.restoreWorldAdminView(null),false);
      assert.equal(denied.g.tab,'hub');assert.equal(denied.storage.has(viewKey),false);
      assert.equal(denied.context.worldAdminService,'agit');
    }
    const ordinary=fixture({saved});
    assert.equal(ordinary.context.restoreWorldAdminView(null),false,'normal entry never restores an old administrator screen');
    assert.equal(ordinary.storage.has(viewKey),false);
  });
}

test('a stored foreign tab resets to the chosen service home and corrupt storage is rejected',()=>{
  const f=fixture({navigation:'reload',saved:{userId,service:'pajang',area:'content',tab:'cards'}});
  assert.equal(f.context.restoreWorldAdminView(null),true);
  assert.deepEqual(f.snapshot(),{service:'pajang',screen:'admin',area:'content',tab:'pajang-answers'});
  for(const saved of ['invalid JSON',{userId,service:'park',area:'content',tab:'unknown'}]){
    const broken=fixture({navigation:'reload',saved});
    assert.equal(broken.context.restoreWorldAdminView(null),false);
    assert.equal(broken.storage.has(viewKey),false);
  }
});

for(const service of services){
  test(`${service} exits to its own settings and unsaved work blocks the exit`,()=>{
    const f=fixture({query:'?admin=reports&from='+service+'&place=park&card=synthetic&keep=yes&compose=yes&view=legacy&retained=yes#section'});
    f.context.restoreWorldAdminView('reports');f.context.saveWorldAdminView();
    f.canLeave(false);f.context.exitWorldAdmin();
    assert.equal(f.g.tab,'admin');assert.deepEqual(f.redirects,[]);assert.deepEqual(f.park,[]);
    f.canLeave(true);f.context.exitWorldAdmin();
    if(service==='pajang'){
      assert.deepEqual(f.redirects,['/features/pajang/station.html?tab=profile']);
      assert.equal(f.context.adminLeavingDocument,true);
    }else{
      const url=new URL(f.location.href);
      assert.equal(url.searchParams.get('tab'),service==='park'?'park':'my');
      for(const key of ['admin','from','place','card','keep','compose','view'])assert.equal(url.searchParams.has(key),false);
      assert.equal(url.searchParams.get('retained'),'yes');assert.equal(url.hash,'#section');
      assert.equal(f.storage.has(viewKey),false);
      if(service==='park')assert.deepEqual(f.park,['settings']);
      else assert.equal(f.g.tab,'my');
    }
  });
}

test('service selection cannot grant permission and losing the role clears saved navigation',()=>{
  for(const options of [{isAdmin:false},{online:false},{identity:null}]){
    const f=fixture(options);
    for(const service of services){
      assert.equal(f.context.openWorldAdmin(f.scope.services[service].home,service),false);
      assert.equal(f.g.tab,'hub');assert.equal(f.renders,0);
      assert.equal(f.context.restoreWorldAdminView(f.scope.services[service].home),false);
    }
  }
  const f=fixture({query:'?from=pajang'});f.context.restoreWorldAdminView('pajang-answers');f.context.saveWorldAdminView();
  f.D.isAdmin=false;f.context.saveWorldAdminView();
  assert.equal(f.storage.has(viewKey),false);assert.equal(f.context.worldAdminService,'agit');
  assert.match(f.context.y0(),/관리자 계정으로 로그인해야/);
  assert.equal(f.context.y0().includes('data-admin-service'),false);
});

test('late shared data is discarded after an account or administrator role changes',async()=>{
  for(const change of [f=>{f.D.user={id:'synthetic-admin-b'};},f=>{f.D.isAdmin=false;}]){
    const f=fixture({query:'?from=pajang'});let release;
    f.context.U.overview=()=>new Promise(resolve=>{release=resolve;});
    f.L.tab='overview';f.context.th(true);change(f);release({users:999});
    await new Promise(setImmediate);
    assert.equal(Object.hasOwn(f.L.cache,'overview'),false,'another identity cannot receive a pending common result');
  }
});
