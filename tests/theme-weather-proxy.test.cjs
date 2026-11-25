const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=import('../supabase/functions/theme-weather/index.ts');
const KEY='sb_publishable_weather_test_key',MINUTE=60000;
const NOW=Date.parse('2026-11-19T03:15:00Z');
const url='https://project.supabase.co/functions/v1/theme-weather';
const get=(query='nx=60&ny=127',headers={},method='GET')=>new Request(url+'?'+query,{method,headers:{Origin:'https://ojjuda.kr',apikey:KEY,...headers}});
// Shape of KMA's public current-weather panel, observed 2026-11-19. Snow variants
// below are synthetic parser fixtures; live dry/rain panels were checked separately.
function observation(code='DB05',label='비',at='11.19.(목) 12:10'){
  return `<div class="cmp-cmn-para odam-updated"><a href="#refresh" class="updated-at" title="정보 기준 시간, 클릭하여 새로고침"><span>${at}</span> 현재</a></div>
<div class="cmp-cur-weather wbg wbg-type2 BG${code}"><h3 class="hid">현재 날씨</h3><ul class="wrap-1"><li class="w-icon w-temp${code==='DB00'?' no-w':''}"><span class="hid">날씨: </span><span class="wic ${code} large">${label}</span><span class="hid">기온: </span><span class="tmp">3.5<small>℃</small></span></li></ul></div>`;
}
const response=(...args)=>new Response(observation(...args),{headers:{'Content-Type':'text/html;charset=UTF-8'}});

test('installed G2 WebViews can read only named public district cells with the project key',async()=>{
  const {createHandler}=await api;
  const handler=createHandler({now:()=>NOW,publishableKeys:[KEY],fetch:async()=>response()});
  const origin={Origin:'https://installed.example'};
  const valid=await handler(get('district=60%2C127',origin));
  assert.equal(valid.status,200); assert.equal(valid.headers.get('Access-Control-Allow-Origin'),'*');
  assert.equal((await handler(get('district=60%2C127',{...origin,apikey:''}))).status,401);
  for (const query of ['nx=60&ny=127','district=1,253','district=60,127&lat=37.5']) {
    assert.equal((await handler(get(query,origin))).status,403);
  }
});

test('only KMA current precipitation codes select rain/snow; missing and conflicting values are rejected',async()=>{
  const {weatherKind}=await api;
  for(const [code,label] of [['DB05','비'],['DB09','소나기'],['DB10','빗방울']])assert.equal(weatherKind(label,code),'rain');
  for(const [code,label] of [['DB06','비 또는 눈'],['DB07','눈 또는 비'],['DB08','눈'],['DB11','빗방울/눈날림'],['DB12','눈날림']])assert.equal(weatherKind(label,code),'snow');
  for(const [code,label] of [['DB00',''],['DB01','맑음'],['DB03','구름많음'],['DB04','흐림']])assert.equal(weatherKind(label,code),null);
  for(const [code,label] of [['',''],['DB99','눈'],['DB00','눈'],['DB08',''],['DB05','<script>비</script>']])assert.throws(()=>weatherKind(label,code));
});

test('KMA 5 km conversion uses the actual grid and round-trips grid centers without a fallback city',async()=>{
  const {toGrid,gridCenter}=await api;
  assert.deepEqual(toGrid(37.5665,126.978),{nx:60,ny:127});
  assert.deepEqual(toGrid(35.1796,129.0756),{nx:98,ny:76});
  assert.deepEqual(toGrid(33.4996,126.5312),{nx:53,ny:38});
  for(const grid of [{nx:60,ny:127},{nx:98,ny:76},{nx:53,ny:38},{nx:1,ny:1},{nx:149,ny:253}]){
    const {latitude,longitude}=gridCenter(grid);assert.deepEqual(toGrid(latitude,longitude),grid);
  }
  for(const [lat,lon] of [[NaN,127],[91,127],[0,0],[40,-74]])assert.throws(()=>toGrid(lat,lon));
});

test('current observation timestamps use KST, handle year rollover and reject stale, future or invalid dates',async()=>{
  const {observationTime,parseObservation}=await api;
  assert.equal(observationTime('11.19.(목) 12:10',NOW),Date.parse('2026-11-19T03:10:00Z'));
  assert.equal(observationTime('12.31.(목) 23:50',Date.parse('2026-12-31T15:05:00Z')),Date.parse('2026-12-31T14:50:00Z'));
  assert.equal(observationTime('01.01.(금) 00:00',Date.parse('2026-12-31T15:05:00Z')),Date.parse('2026-12-31T15:00:00Z'));
  for(const at of ['11.19.(목) 11:40','11.19.(목) 12:20','11.18.(수) 12:10','02.30.(월) 12:10','11.19.(목) 25:10','12:10'])assert.throws(()=>observationTime(at,NOW));
  assert.equal(parseObservation(observation('DB08','눈'),NOW).kind,'snow');
  assert.equal(parseObservation(observation('DB00',''),NOW).kind,null);
  const forecastNoise='<div class="forecast"><span class="wic DB08 large">눈</span></div>';
  assert.equal(parseObservation(observation('DB00','')+forecastNoise,NOW).kind,null,'future forecast labels cannot become current weather');
  for(const html of [forecastNoise,observation().replace('odam-updated','air-updated'),observation().replace('wic DB05','icon DB05'),observation('DB99','눈'),observation('DB00','눈')])assert.throws(()=>parseObservation(html,NOW));
});

test('proxy fetches KMA at the requested grid center and returns a short-lived observation with provenance',async()=>{
  const {createHandler,gridCenter}=await api;
  let requests=0;
  const handler=createHandler({now:()=>NOW,publishableKeys:[KEY],fetch:async(input,options)=>{
    requests++;const target=new URL(input),center=gridCenter({nx:60,ny:127});
    assert.equal(target.origin,'https://www.weather.go.kr');
    assert.equal(target.pathname,'/w/wnuri-fct2021/main/current-weather.do');
    assert.equal(target.searchParams.get('lat'),center.latitude.toFixed(6));
    assert.equal(target.searchParams.get('lon'),center.longitude.toFixed(6));
    assert.equal(target.searchParams.get('aws'),'N');assert.equal(target.searchParams.has('code'),false,'no default district is supplied');
    assert.equal(options.headers.apikey,undefined,'project key stays at our edge');
    assert.match(options.headers['User-Agent'],/ojjuda\.kr/);assert.equal(options.redirect,'error');
    return response('DB08','눈');
  }});
  const first=await handler(get());assert.equal(first.status,200);
  assert.deepEqual(await first.json(),{temperature:3.5,label:'눈',kind:'snow',expiresAt:NOW+10*MINUTE,source:'kma',observedAt:Date.parse('2026-11-19T03:10:00Z')});
  assert.equal(first.headers.get('Access-Control-Allow-Origin'),'https://ojjuda.kr');assert.match(first.headers.get('Link'),/weather\.go\.kr/);
  assert.equal((await handler(get())).status,200);assert.equal(requests,1,'same grid shares one current observation');
});

test('API key authentication, origin restrictions and method checks remain intact',async()=>{
  const {createHandler}=await api;let requests=0;
  const handler=createHandler({now:()=>NOW,publishableKeys:[KEY],fetch:async()=>{requests++;return response();}});
  for(const headers of [{apikey:''},{apikey:'sb_publishable_wrong'},{apikey:'',Authorization:'Bearer '+KEY}])assert.equal((await handler(get('',headers))).status,401);
  assert.equal((await handler(get('',{},'OPTIONS'))).status,204);
  assert.equal((await handler(get('',{Origin:'https://evil.test'},'OPTIONS'))).status,403);
  assert.equal((await handler(get('',{},'POST'))).status,405);
  assert.equal((await createHandler({publishableKeys:[]})(get())).status,503);assert.equal(requests,0);
});

test('invalid grids, excess precision, mixed parameters and arbitrary upstream URLs fail before fetch',async()=>{
  const {createHandler}=await api;let requests=0;
  const handler=createHandler({now:()=>NOW,publishableKeys:[KEY],fetch:async()=>{requests++;return response();}});
  for(const query of ['nx=0&ny=127','nx=150&ny=127','nx=60&ny=254','nx=60.2&ny=127','nx=60&nx=61&ny=127','nx=60&ny=127&lat=37.5',
    'nx=60&ny=127&url=https://evil.test','nx=60&ny=127&account_id=secret','lat=37.566&lon=127','lat=91&lon=127','lat=0&lon=0',
    'lat=1e2&lon=127','lat=37.5&lat=38&lon=127','lat=37.5&lon=127&url=https://evil.test'])assert.equal((await handler(get(query))).status,400,query);
  assert.equal((await handler(get(undefined,{Origin:'https://evil.test'}))).status,403);assert.equal(requests,0);
  assert.equal((await handler(get('lat=37.5&lon=127.0'))).status,200,'already-open coarse-coordinate clients remain compatible');
  assert.equal((await handler(new Request(url+'?nx=60&ny=127',{headers:{apikey:KEY}}))).status,200);
});

test('stale, missing, malformed and oversized upstream data never become a current theme',async()=>{
  const {createHandler}=await api;
  for(const html of [observation('DB08','눈','11.19.(목) 11:40'),observation('DB08','눈','11.19.(목) 12:20'),'<html>maintenance</html>',observation('DB99','눈'),'x'.repeat(262145)]){
    const handler=createHandler({now:()=>NOW,publishableKeys:[KEY],fetch:async()=>new Response(html)});
    const result=await handler(get());assert.equal(result.status,503);assert.equal(result.headers.get('Cache-Control'),'no-store');
  }
});

test('shared cache refreshes current weather after two minutes and failures can recover after cooldown',async()=>{
  const {createHandler}=await api;let now=NOW,calls=0,resolve;
  const handler=createHandler({now:()=>now,publishableKeys:[KEY],fetch:async()=>{calls++;return new Promise(done=>resolve=done);}});
  const first=handler(get()),second=handler(get());assert.equal(calls,1);
  resolve(response());assert.equal((await first).status,200);assert.equal((await second).status,200);
  assert.equal((await handler(get())).status,200);assert.equal(calls,1);
  now+=2*MINUTE+1;const fresh=handler(get());assert.equal(calls,2);resolve(response('DB00',''));
  assert.equal((await (await fresh).json()).kind,null);
  let fail=true,attempts=0;
  const recovering=createHandler({now:()=>now,publishableKeys:[KEY],fetch:async()=>{attempts++;if(fail)throw Error('offline');return response('DB08','눈');}});
  assert.equal((await recovering(get())).status,503);fail=false;
  assert.equal((await recovering(get())).status,503);assert.equal(attempts,1);
  now+=MINUTE+1;const recovered=await recovering(get());assert.equal(recovered.status,200);assert.equal((await recovered.json()).kind,'snow');assert.equal(attempts,2);
});
