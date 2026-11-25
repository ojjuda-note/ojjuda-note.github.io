// Current KMA observations for one 5 km weather grid. No forecast or fallback city.
// Public source used by weather.go.kr's current-weather panel (app-index.js).
// Deploy with verify_jwt = false; this handler validates the project apikey.
import {districtCells} from './districts.ts';
type Kind = 'rain' | 'snow' | null;
type Observation = { temperature: number | null; label: string; kind: Kind; observedAt: number; cacheUntil: number };
type Grid = { nx: number; ny: number };
const MINUTE=60000,MAX_AGE=30*MINUTE,MAX_BYTES=262144;
const ORIGINS=new Set(['https://ojjuda.kr','https://www.ojjuda.kr']);
const UPSTREAM='https://www.weather.go.kr/w/wnuri-fct2021/main/current-weather.do';
const AGENT='ojjuda.kr current-weather/2.0 (+https://ojjuda.kr/features/guide/creator.html)';
// KMA's Lambert conformal conic grid: 5 km, 30/60 degree standard parallels.
const RAD=Math.PI/180,RE=6371.00877/5,OLON=126*RAD;
const SN=Math.log(Math.cos(30*RAD)/Math.cos(60*RAD))/
  Math.log(Math.tan(Math.PI/4+60*RAD/2)/Math.tan(Math.PI/4+30*RAD/2));
const SF=Math.pow(Math.tan(Math.PI/4+30*RAD/2),SN)*Math.cos(30*RAD)/SN;
const RO=RE*SF/Math.pow(Math.tan(Math.PI/4+38*RAD/2),SN);
function validGrid(nx: number,ny: number){return Number.isInteger(nx)&&Number.isInteger(ny)&&nx>=1&&nx<=149&&ny>=1&&ny<=253;}
export function toGrid(lat: number,lon: number): Grid {
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<=-90||lat>=90||Math.abs(lon)>180)throw Error('Outside KMA grid');
  const ra=RE*SF/Math.pow(Math.tan(Math.PI/4+lat*RAD/2),SN);
  let angle=lon*RAD-OLON;
  if(angle>Math.PI)angle-=2*Math.PI;
  if(angle<-Math.PI)angle+=2*Math.PI;
  const nx=Math.floor(ra*Math.sin(angle*SN)+43.5),ny=Math.floor(RO-ra*Math.cos(angle*SN)+136.5);
  if(!validGrid(nx,ny))throw Error('Outside KMA grid');
  return {nx,ny};
}
export function gridCenter({nx,ny}: Grid){
  if(!validGrid(nx,ny))throw Error('Outside KMA grid');
  const x=nx-43,y=RO-ny+136,radius=Math.hypot(x,y);
  return {latitude:(2*Math.atan(Math.pow(RE*SF/radius,1/SN))-Math.PI/2)/RAD,
    longitude:(Math.atan2(x,y)/SN+OLON)/RAD};
}
export function weatherKind(label: string,code: string): Kind {
  // Codes and labels come from KMA's public current-weather legend. Do not
  // interpret a missing icon, unknown code or mismatched label as dry weather.
  const labels: Record<string,string[]>={
    DB00:[''],DB01:['맑음'],DB02:['구름조금'],DB03:['구름많음'],DB04:['흐림'],
    DB05:['비'],DB06:['비 또는 눈','비/눈'],DB07:['눈 또는 비'],DB08:['눈'],
    DB09:['소나기'],DB10:['빗방울'],DB11:['빗방울/눈날림'],DB12:['눈날림']
  };
  if(!labels[code]?.includes(label))throw Error('Unknown current weather');
  if(['DB06','DB07','DB08','DB11','DB12'].includes(code))return 'snow';
  return ['DB05','DB09','DB10'].includes(code)?'rain':null;
}
export function observationTime(label: string,now: number){
  const match=/^(\d{1,2})\.(\d{1,2})\.\([일월화수목금토]\)\s+(\d{2}):(\d{2})$/.exec(label.trim());
  if(!match)throw Error('Missing observation time');
  const [,m,d,h,min]=match.map(Number),year=new Date(now+9*60*MINUTE).getUTCFullYear();
  if(m<1||m>12||d<1||d>31||h>23||min>59)throw Error('Invalid observation time');
  const candidates=[year-1,year,year+1].map(y=>{
    const local=Date.UTC(y,m-1,d,h,min),date=new Date(local);
    return date.getUTCMonth()===m-1&&date.getUTCDate()===d?local-9*60*MINUTE:NaN;
  }).filter(at=>Number.isFinite(at)&&at<=now+2*MINUTE&&now-at<=MAX_AGE);
  if(!candidates.length)throw Error('Stale observation');
  return Math.max(...candidates);
}
export function parseObservation(html: string,now: number): Observation {
  if(html.length>MAX_BYTES)throw Error('Oversized observation');
  const timeBlock=/<div\b[^>]*class=["'][^"']*\bodam-updated\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  const timeLabel=timeBlock&&/<a\b[^>]*class=["'][^"']*\bupdated-at\b[^"']*["'][^>]*>\s*<span[^>]*>([^<]+)<\/span>/i.exec(timeBlock)?.[1];
  const weatherBlock=/<div\b[^>]*class=["'][^"']*\bcmp-cur-weather\b[^"']*\bwbg\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  const iconBlock=weatherBlock&&/<li\b[^>]*class=["'][^"']*\bw-icon\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/i.exec(weatherBlock)?.[1];
  const icon=iconBlock&&/<span\b[^>]*class=["'][^"']*\bwic\s+(DB\d{2})\b[^"']*["'][^>]*>([^<>]*)<\/span>/i.exec(iconBlock);
  if(!timeLabel||!icon)throw Error('Missing current observation');
  const label=icon[2].replace(/&nbsp;|&#160;/g,' ').trim();
  const observedAt=observationTime(timeLabel,now),kind=weatherKind(label,icon[1]);
  const degrees=iconBlock?.match(/<span\b[^>]*class=["'][^"']*\btmp\b[^"']*["'][^>]*>\s*([+-]?\d{1,2}(?:\.\d+)?)\s*(?:<small\b|℃|<\/span>)/i);
  const temperature=degrees?Number(degrees[1]):null;
  return {temperature,label,kind,observedAt,cacheUntil:Math.min(now+2*MINUTE,observedAt+MAX_AGE)};
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
function requestedGrid(url: URL): Grid {
  const p=url.searchParams;
  if(url.search.length>80)throw Error('Invalid grid');
  if(p.has('nx')||p.has('ny')){
    if([...p.keys()].some(k=>k!=='nx'&&k!=='ny')||p.getAll('nx').length!==1||p.getAll('ny').length!==1||
      !/^\d{1,3}$/.test(p.get('nx')||'')||!/^\d{1,3}$/.test(p.get('ny')||''))throw Error('Invalid grid');
    const nx=Number(p.get('nx')),ny=Number(p.get('ny'));
    if(!validGrid(nx,ny))throw Error('Invalid grid');
    return {nx,ny};
  }
  // Keep already-open clients working while new pages switch to grid-only requests.
  const lat=p.get('lat')||'',lon=p.get('lon')||'';
  if([...p.keys()].some(k=>k!=='lat'&&k!=='lon')||p.getAll('lat').length!==1||p.getAll('lon').length!==1||
    !/^-?\d{1,3}(?:\.\d)?$/.test(lat)||!/^-?\d{1,3}(?:\.\d)?$/.test(lon))throw Error('Invalid grid');
  return toGrid(Number(lat),Number(lon));
}
function summarize(value: Observation,now: number){
  if(value.observedAt>now+2*MINUTE||now-value.observedAt>=MAX_AGE)throw Error('Stale observation');
  return {temperature:value.temperature,label:value.label,kind:value.kind,expiresAt:Math.min(now+10*MINUTE,value.observedAt+MAX_AGE),source:'kma',observedAt:value.observedAt};
}
export function createHandler({fetch:request=fetch,now=Date.now,publishableKeys=configuredKeys()}: {fetch?: typeof fetch;now?:()=>number;publishableKeys?:string[]}={}){
  const cache=new Map<string,Observation>(),inflight=new Map<string,Promise<Observation>>(),failedUntil=new Map<string,number>();
  const upstreamStarts: number[]=[];
  async function currentFor(grid: Grid){
    const key=grid.nx+','+grid.ny,time=now(),previous=cache.get(key);
    if(previous&&previous.cacheUntil>time)return previous;
    if((failedUntil.get(key)||0)>time)throw Error('Weather unavailable');
    if(inflight.has(key))return inflight.get(key)!;
    while(upstreamStarts.length&&upstreamStarts[0]<=time-1000)upstreamStarts.shift();
    if(inflight.size>=8||upstreamStarts.length>=10)throw Error('Weather busy');
    upstreamStarts.push(time);
    const job=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
      try{
        const center=gridCenter(grid),url=new URL(UPSTREAM);
        url.search=new URLSearchParams({lat:center.latitude.toFixed(6),lon:center.longitude.toFixed(6),unit:'m/s',aws:'N'}).toString();
        const response=await request(url.toString(),{headers:{'User-Agent':AGENT,Accept:'text/html'},signal:controller.signal,redirect:'error'});
        if(!response.ok)throw Error('Weather unavailable');
        const declared=Number(response.headers.get('content-length')||0);
        if(declared>MAX_BYTES)throw Error('Oversized observation');
        const value=parseObservation(await response.text(),now());
        summarize(value,now());
        if(cache.size>=128&&!cache.has(key))cache.delete(cache.keys().next().value!);
        cache.set(key,value);failedUntil.delete(key);return value;
      }catch(error){
        if(failedUntil.size>=128)failedUntil.delete(failedUntil.keys().next().value!);
        failedUntil.set(key,now()+MINUTE);throw error;
      }finally{clearTimeout(timer);inflight.delete(key);}
    })();
    inflight.set(key,job);return job;
  }
  return async function handler(req: Request): Promise<Response>{
    const origin=req.headers.get('origin')||'';
    const url=new URL(req.url);
    const district=url.searchParams.get('district')||'';
    const publicDistrict=url.searchParams.size===1 && districtCells.has(district);
    // Installed WebViews have no fixed Origin. This route accepts a KMA grid only.
    const cell=url.searchParams.get('cell')||'';
    const [cx,cy]=cell.split(',').map(Number);
    const publicCell=url.searchParams.size===1 && /^\d{1,3},\d{1,3}$/.test(cell) && validGrid(cx,cy);
    const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin, apikey'});
    if(origin&&!publicDistrict&&!publicCell&&!ORIGINS.has(origin))return new Response('{"error":"Origin not allowed"}',{status:403,headers});
    if(publicDistrict||publicCell)headers.set('Access-Control-Allow-Origin','*');
    else if(origin)headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Access-Control-Allow-Methods','GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers','accept, apikey, authorization');
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='GET'){headers.set('Allow','GET, OPTIONS');return new Response('{"error":"Method not allowed"}',{status:405,headers});}
    if(!publishableKeys.length)return new Response('{"error":"Weather unavailable"}',{status:503,headers});
    if(!keyMatches(req.headers.get('apikey')||'',publishableKeys))return new Response('{"error":"Unauthorized"}',{status:401,headers});
    let grid: Grid;
    if(publicCell) grid={nx:cx,ny:cy};
    else if(publicDistrict) {
      const [nx,ny]=district.split(',').map(Number); grid={nx,ny};
    } else {
      try{grid=requestedGrid(url);}catch{return new Response('{"error":"KMA weather grid required"}',{status:400,headers});}
    }
    try{
      const summary=summarize(await currentFor(grid),now());
      headers.set('Cache-Control','public, max-age='+Math.max(0,Math.min(120,Math.floor((summary.expiresAt-now())/1000))));
      headers.set('Link','<https://www.weather.go.kr/w/index.do>; rel="author"');
      return new Response(JSON.stringify(summary),{headers});
    }catch{return new Response('{"error":"Weather unavailable"}',{status:503,headers});}
  };
}
if(typeof Deno!=='undefined')Deno.serve(createHandler());
