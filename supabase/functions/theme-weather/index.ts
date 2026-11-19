// Read-only coarse weather summary with project publishable-key authentication.
// Deploy with verify_jwt = false; this handler validates the apikey itself.
// MET Norway Locationforecast: https://docs.api.met.no/doc/locationforecast/HowTO
// CC BY 4.0: https://docs.api.met.no/doc/License.html
type Kind = 'rain' | 'snow' | null;
type RecordHour = { at: number; kind: Kind };
type Forecast = { hours: RecordHour[]; updatedAt: number; cacheUntil: number; modified: string };
const HOUR=3600000,MAX_BYTES=524288;
const ORIGINS=new Set(['https://ojjuda.kr','https://www.ojjuda.kr']);
const UPSTREAM='https://api.met.no/weatherapi/locationforecast/2.0/compact';
const AGENT='ojjuda.kr weather-theme/1.0 (+https://ojjuda.kr/features/guide/creator.html)';

export function weatherKind(symbol: unknown): Kind {
  if(typeof symbol!=='string'||symbol.length>80||!/^[a-z]+(?:_(?:day|night|polartwilight))?$/.test(symbol))throw Error('Invalid symbol');
  if(symbol.includes('snow')||symbol.includes('sleet'))return 'snow';
  return symbol.includes('rain')?'rain':null;
}
function configuredKeys(): string[]{
  try{
    const values=JSON.parse(typeof Deno!=='undefined'?Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}':'{}');
    if(!values||typeof values!=='object'||Array.isArray(values))return [];
    return Object.values(values).filter((value): value is string=>typeof value==='string'&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)&&value.length<=256);
  }catch{return [];}
}
function keyMatches(received: string,keys: string[]){
  if(!received||received.length>256)return false;
  let matched=0;
  for(const expected of keys){
    let different=received.length^expected.length;
    for(let i=0;i<256;i++)different|=(received.charCodeAt(i)||0)^(expected.charCodeAt(i)||0);
    matched|=Number(different===0);
  }
  return matched!==0;
}
function cacheDeadline(headers: Headers,now: number){
  const expires=Date.parse(headers.get('expires')||'');
  return Number.isFinite(expires)&&expires>now?Math.min(expires,now+6*HOUR):now+30*60*1000;
}
function parseForecast(value: any,headers: Headers,now: number): Forecast {
  const updatedAt=Date.parse(value?.properties?.meta?.updated_at||'');
  const series=value?.properties?.timeseries;
  if(!Number.isFinite(updatedAt)||updatedAt>now+10*60*1000||now-updatedAt>12*HOUR||!Array.isArray(series)||series.length>1000)throw Error('Stale forecast');
  const hours: RecordHour[]=[];
  for(const row of series){
    const at=Date.parse(row?.time||'');
    const symbol=row?.data?.next_1_hours?.summary?.symbol_code;
    if(!Number.isFinite(at)||at<now-HOUR||at>now+8*HOUR||typeof symbol!=='string')continue;
    hours.push({at,kind:weatherKind(symbol)});
  }
  if(!hours.length)throw Error('Missing hourly forecast');
  return {hours,updatedAt,cacheUntil:cacheDeadline(headers,now),modified:headers.get('last-modified')||''};
}
function summarize(forecast: Forecast,now: number){
  if(now-forecast.updatedAt>12*HOUR)throw Error('Stale forecast');
  // Prefer the current hourly interval. A just-published first period may start
  // a few minutes ahead; never reuse an expired or distant forecast period.
  const row=forecast.hours.filter(h=>h.at<=now&&h.at+HOUR>now).sort((a,b)=>b.at-a.at)[0]||
    forecast.hours.filter(h=>h.at>now&&h.at-now<=15*60*1000).sort((a,b)=>a.at-b.at)[0];
  if(!row)throw Error('No current forecast');
  return {kind:row.kind,expiresAt:Math.min(now+15*60*1000,row.at+HOUR)};
}

export function createHandler({fetch:request=fetch,now=Date.now,publishableKeys=configuredKeys()}: {fetch?: typeof fetch;now?:()=>number;publishableKeys?:string[]}={}){
  const cache=new Map<string,Forecast>();
  const inflight=new Map<string,Promise<Forecast>>();
  const failedUntil=new Map<string,number>();
  const upstreamStarts: number[]=[];
  async function forecastFor(lat: string,lon: string){
    const key=lat+','+lon,time=now(),previous=cache.get(key);
    if(previous&&previous.cacheUntil>time)return previous;
    if((failedUntil.get(key)||0)>time)throw Error('Weather unavailable');
    if(inflight.has(key))return inflight.get(key)!;
    while(upstreamStarts.length&&upstreamStarts[0]<=time-1000)upstreamStarts.shift();
    if(inflight.size>=8||upstreamStarts.length>=10)throw Error('Weather busy');
    upstreamStarts.push(time);
    const job=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
      try{
        const headers: Record<string,string>={'User-Agent':AGENT,Accept:'application/json'};
        if(previous?.modified)headers['If-Modified-Since']=previous.modified;
        const response=await request(UPSTREAM+'?lat='+lat+'&lon='+lon,{headers,signal:controller.signal,redirect:'error'});
        let forecast: Forecast;
        if(response.status===304&&previous){forecast={...previous,cacheUntil:cacheDeadline(response.headers,now())};}
        else{
          if(!response.ok)throw Error('Weather unavailable');
          const declared=Number(response.headers.get('content-length')||0);
          if(declared>MAX_BYTES)throw Error('Oversized forecast');
          const raw=await response.text();
          if(raw.length>MAX_BYTES)throw Error('Oversized forecast');
          forecast=parseForecast(JSON.parse(raw),response.headers,now());
        }
        summarize(forecast,now());
        if(cache.size>=128&&!cache.has(key))cache.delete(cache.keys().next().value!);
        cache.set(key,forecast);failedUntil.delete(key);return forecast;
      }catch(error){
        if(failedUntil.size>=128)failedUntil.delete(failedUntil.keys().next().value!);
        failedUntil.set(key,now()+60000);throw error;
      }finally{clearTimeout(timer);inflight.delete(key);}
    })();
    inflight.set(key,job);return job;
  }
  return async function handler(req: Request): Promise<Response>{
    const origin=req.headers.get('origin')||'';
    const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin, apikey'});
    if(origin&&!ORIGINS.has(origin))return new Response('{"error":"Origin not allowed"}',{status:403,headers});
    if(origin)headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Access-Control-Allow-Methods','GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers','accept, apikey, authorization');
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='GET'){headers.set('Allow','GET, OPTIONS');return new Response('{"error":"Method not allowed"}',{status:405,headers});}
    if(!publishableKeys.length)return new Response('{"error":"Weather unavailable"}',{status:503,headers});
    if(!keyMatches(req.headers.get('apikey')||'',publishableKeys))return new Response('{"error":"Unauthorized"}',{status:401,headers});
    const url=new URL(req.url),params=url.searchParams;
    const lat=params.get('lat')||'',lon=params.get('lon')||'';
    if(url.search.length>80||[...params.keys()].some(k=>k!=='lat'&&k!=='lon')||params.getAll('lat').length!==1||params.getAll('lon').length!==1||
      !/^-?\d{1,3}(?:\.\d)?$/.test(lat)||!/^-?\d{1,3}(?:\.\d)?$/.test(lon)||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)
      return new Response('{"error":"Coarse latitude and longitude required"}',{status:400,headers});
    try{
      const forecast=await forecastFor(Number(lat).toFixed(1),Number(lon).toFixed(1));
      const summary=summarize(forecast,now());
      headers.set('Cache-Control','public, max-age='+Math.max(0,Math.floor((summary.expiresAt-now())/1000)));
      headers.set('Link','<https://www.met.no/>; rel="author", <https://creativecommons.org/licenses/by/4.0/>; rel="license"');
      return new Response(JSON.stringify(summary),{headers});
    }catch{return new Response('{"error":"Weather unavailable"}',{status:503,headers});}
  };
}
if(typeof Deno!=='undefined')Deno.serve(createHandler());
