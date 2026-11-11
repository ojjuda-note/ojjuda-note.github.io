const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const browser = new JSDOM('<button data-tab="arcade">오락실</button><button data-act="agit-daily" data-v="group">그룹</button><div data-arcade-games="solo"><button class="gbtn" data-v="stacker">탑 쌓기</button></div>',{
    url:'https://ojjuda.kr/world.html?tab=hub',referrer:'https://search.naver.com/search.naver?query=anything',
    runScripts:'outside-only',pretendToBeVisual:true
  });
  const w = browser.window;
  Object.defineProperty(w.crypto,'randomUUID',{value:randomUUID,configurable:true});
  const calls = [];
  const client = {rpc:async(name,args)=>{
    calls.push({name,args});return {data:{ok:true,day:new Date(Date.now()+9*3600000).toISOString().slice(0,10),server_now:new Date().toISOString()}};
  }};
  w.eval(read('shared/analytics/site-usage.js'));
  w.OjjudaSiteUsage.configure({client});
  await settle(); await settle();
  assert.deepEqual(calls.slice(0,2).map(call=>call.args.p_event),['visit','feature']);
  assert.equal(calls[0].args.p_source,'naver');
  assert.equal(calls[1].args.p_feature,'agit');
  assert.equal(Object.keys(calls[0].args).length,4,'no referrer, URL, account or IP is transmitted');
  w.document.querySelector('[data-tab=arcade]').click();
  w.document.querySelector('[data-act=agit-daily]').click();
  w.document.querySelector('[data-arcade-games] .gbtn').click();
  await settle(); await settle();
  assert.deepEqual(calls.map(call=>call.args.p_feature).filter(Boolean),['agit','arcade','group','game_stacker']);
  const before = calls.length;
  w.document.querySelector('[data-tab=arcade]').click();
  await settle();
  assert.equal(calls.length,before,'same browser/day/feature is counted only once');
  w.eval(read('shared/analytics/site-usage.js'));w.OjjudaSiteUsage.configure({client});
  await settle(); await settle();
  assert.equal(calls.length,before,'reloading does not resubmit recorded events');
  Object.defineProperty(w.navigator,'doNotTrack',{value:'1',configurable:true});
  w.OjjudaSiteUsage.track('feature','park');await settle();
  assert.equal(calls.length,before,'Do Not Track prevents new telemetry');
  browser.window.close();

  const ui = new JSDOM('<main id="host"></main>',{url:'https://ojjuda.kr/world.html?admin=visitors',runScripts:'outside-only'});
  const v = ui.window,host = v.document.querySelector('#host');v.eval(read('admin/visitors.js'));
  const visitor = {today:1,month:2,total:3,started_at:'2026-10-27T00:00:00Z',daily:[],monthly:[]};
  const growthRows = ['stacker','mole'].flatMap(game=>['challenge','direct'].map(source=>({game,source,visits:1,starts:1,completes:1,shares:0})));
  const growth = {started_at:'2026-11-01T00:00:00Z',today_date:'2026-11-11',today:growthRows,month:growthRows};
  const insights = {
    started_at:'2026-11-11T00:00:00Z',today_date:'2026-11-11',today:2,month:2,total:2,
    daily:Array.from({length:30},(_,i)=>({period:new Date(Date.UTC(2026,9,13+i)).toISOString().slice(0,10),visits:i===29?2:0})),
    hourly:Array.from({length:24},(_,hour)=>({hour,visits:hour===9?2:0})),
    weekday:Array.from({length:7},(_,i)=>({day:i+1,visits:i===2?2:0})),
    features:[{feature:'arcade',uses:2},{feature:'game_stacker',uses:1}],
    sources:['direct','naver','google','search','social','external','internal','campaign'].map(source=>({source,visits:source==='naver'?2:0}))
  };
  let owner='admin',authChange,insightsError=false;
  const called = [];
  const adminClient = {rpc:async name=>{
    called.push(name);
    if(name==='admin_guest_visit_stats')return {data:visitor};
    if(name==='admin_game_growth_stats')return {data:growth};
    return insightsError?{error:{message:'offline'}}:{data:insights};
  },auth:{onAuthStateChange(fn){authChange=fn;return{data:{subscription:{unsubscribe(){}}}}}}};
  const control = v.OjjudaAdminVisitors.mount({container:host,client:adminClient,getAdminId:()=>owner});
  await settle();await settle();
  assert.equal(host.querySelector('.visitor-insights h3').textContent,'사이트 방문·이용 분석');
  assert.equal(host.querySelectorAll('.visitor-chart-card').length,5);
  assert.equal(host.querySelectorAll('.visitor-chart-col').length,61,'30 dates + 24 hours + 7 weekdays');
  assert.match(host.querySelector('.visitor-insights').textContent,/네이버 검색/);
  assert.match(host.querySelector('.visitor-insights').textContent,/탑 쌓기/);
  assert.equal(host.querySelectorAll('.visitor-site-cards .visitor-card').length,3);
  assert.equal(host.querySelector('.visitor-growth h3').textContent,'게임 도전·공유 상세');
  assert.equal(host.querySelectorAll('.visitor-growth details[open]').length,0,'specialized detail tables default closed');
  insightsError=true;await control.refresh();
  assert.match(host.querySelector('.visitor-insights').textContent,/불러오지 못했어요/);
  assert.equal(host.querySelectorAll('.visitor-body .visitor-card').length,3,'insight errors do not erase guest totals');
  insightsError=false;await control.refresh();owner=null;authChange('SIGNED_OUT',null);
  assert.equal(host.querySelector('.visitor-insights').childElementCount,0,'logout removes private graphs');
  control.destroy();owner='admin';
  called.length=0;
  const compact = v.OjjudaAdminVisitors.mount({container:host,client:adminClient,getAdminId:()=>owner,compact:true});
  await settle();assert.equal(called.includes('admin_site_usage_stats'),false,'overview does not load heavy charts');
  compact.destroy();ui.window.close();
  assert.match(read('world.html'),/OjjudaSiteUsage\?\.configure\(\{client:S\}\)/);
  assert.match(read('admin/world-admin-loader.js'),/visitors-charts\.css/);
  console.log('PASS: anonymous analytics, browser dedup, privacy opt-out, five responsive charts, independent errors and admin logout isolation');
})().catch(error=>{console.error(error);process.exitCode=1});
