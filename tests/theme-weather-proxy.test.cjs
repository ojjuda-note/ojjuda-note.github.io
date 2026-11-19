const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=import('../supabase/functions/theme-weather/index.ts');
const KEY='sb_publishable_weather_test_key';
const now=Date.parse('2026-11-19T03:15:00Z');
const url='https://project.supabase.co/functions/v1/theme-weather';
const get=(query='lat=37.5&lon=127.0',headers={},method='GET')=>new Request(url+'?'+query,{method,headers:{Origin:'https://ojjuda.kr',apikey:KEY,...headers}});
function forecast(symbol='rain',at='2026-11-19T03:00:00Z',updatedAt='2026-11-19T02:00:00Z'){
  return {properties:{meta:{updated_at:updatedAt},timeseries:[{time:at,data:{next_1_hours:{summary:{symbol_code:symbol}}}}]}};
}

test('proxy classifies only rain and snow, includes sleet as snow, and caps current-hour validity',async()=>{
  const {createHandler,weatherKind}=await api;
  for(const symbol of ['rain','heavyrainandthunder','lightrainshowers_day'])assert.equal(weatherKind(symbol),'rain');
  for(const symbol of ['snow','sleet','heavysnowshowers_night'])assert.equal(weatherKind(symbol),'snow');
  for(const symbol of ['clearsky_day','fog','cloudy'])assert.equal(weatherKind(symbol),null);
  assert.throws(()=>weatherKind('<script>rain</script>'));
  let requests=0;
  const handler=createHandler({now:()=>now,publishableKeys:[KEY],fetch:async(input,options)=>{
    requests++;assert.equal(input,'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=37.5&lon=127.0');
    assert.match(options.headers['User-Agent'],/ojjuda\.kr/);assert.equal(options.headers.apikey,undefined,'project key stays at our edge');
    return Response.json(forecast('sleet'),{headers:{Expires:new Date(now+HOUR).toUTCString()}});
  }});
  const first=await handler(get()),data=await first.json();assert.deepEqual(data,{kind:'snow',expiresAt:now+900000});
  assert.equal(first.headers.get('Access-Control-Allow-Origin'),'https://ojjuda.kr');assert.match(first.headers.get('Link'),/creativecommons/);
  assert.equal((await handler(get())).status,200);assert.equal(requests,1,'cache is shared by identical coarse cells');
});
const HOUR=3600000;

test('API key authentication fails closed and OPTIONS is limited to allowed origins',async()=>{
  const {createHandler}=await api;
  let requests=0;
  const handler=createHandler({now:()=>now,publishableKeys:[KEY],fetch:async()=>{requests++;return Response.json(forecast());}});
  assert.equal((await handler(get('',{apikey:''}))).status,401);
  assert.equal((await handler(get('',{apikey:'sb_publishable_wrong'}))).status,401);
  assert.equal((await handler(get('',{apikey:'',Authorization:'Bearer '+KEY}))).status,401);
  assert.equal((await handler(get('',{},'OPTIONS'))).status,204);
  assert.equal((await handler(get('',{Origin:'https://evil.test'},'OPTIONS'))).status,403);
  assert.equal((await handler(get('',{},'POST'))).status,405);
  assert.equal((await createHandler({publishableKeys:[]})(get())).status,503);
  assert.equal(requests,0);
});

test('invalid precision, duplicate metadata, arbitrary URLs and bounds are rejected before upstream',async()=>{
  const {createHandler}=await api;
  let requests=0;
  const handler=createHandler({now:()=>now,publishableKeys:[KEY],fetch:async()=>{requests++;return Response.json(forecast());}});
  for(const query of ['lat=37.566&lon=127','lat=91&lon=127','lat=0&lon=181','lat=NaN&lon=127','lat=1e2&lon=127',
    'lat=37.5&lat=38&lon=127','lat=37.5&lon=127&url=https://evil.test','lat=37.5&lon=127&account_id=secret'])
    assert.equal((await handler(get(query))).status,400,query);
  assert.equal((await handler(get(undefined,{Origin:'https://evil.test'}))).status,403);assert.equal(requests,0);
  const server=new Request(url+'?lat=37.5&lon=127.0',{headers:{apikey:KEY}});
  assert.equal((await handler(server)).status,200,'server GET without Origin is supported with project key');
});

test('missing hourly data, old forecasts and upstream failures return fallback without stale data',async()=>{
  const {createHandler}=await api;
  for(const data of [forecast('snow','2026-11-19T01:00:00Z'),forecast('rain',undefined,'2026-11-18T00:00:00Z'),
    {properties:{meta:{updated_at:'2026-11-19T02:00:00Z'},timeseries:[{time:'2026-11-19T03:00:00Z',data:{next_6_hours:{summary:{symbol_code:'rain'}}}}]}}]){
    const handler=createHandler({now:()=>now,publishableKeys:[KEY],fetch:async()=>Response.json(data)});
    const result=await handler(get());assert.equal(result.status,503);assert.equal(result.headers.get('Cache-Control'),'no-store');
  }
  let calls=0;
  const failing=createHandler({now:()=>now,publishableKeys:[KEY],fetch:async()=>{calls++;throw Error('upstream down');}});
  assert.equal((await failing(get())).status,503);assert.equal((await failing(get())).status,503);assert.equal(calls,1,'failure cooldown avoids a request loop');
});

test('concurrent same-cell requests share one upstream fetch and honor its cache expiry',async()=>{
  const {createHandler}=await api;
  let resolve,calls=0;
  const handler=createHandler({now:()=>now,publishableKeys:[KEY],fetch:async()=>{calls++;return new Promise(done=>resolve=done);}});
  const first=handler(get()),second=handler(get());assert.equal(calls,1);
  resolve(Response.json(forecast(),{headers:{Expires:new Date(now+HOUR).toUTCString()}}));
  assert.equal((await first).status,200);assert.equal((await second).status,200);assert.equal(calls,1);
});
