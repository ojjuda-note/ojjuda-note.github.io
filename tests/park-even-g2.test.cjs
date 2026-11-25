const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {setTimeout:delay}=require('node:timers/promises');
const root=path.resolve(__dirname,'..');
const row=(id,body,band,extra={})=>({id,body,distance_band:band,kind:'memo',tags:[],...extra});
const cards=[row('a','첫 카드','근처'),row('b','둘째 카드','2km'),row('c','먼 카드','12km'),row('z','숨김','근처',{tags:['19금']})];

async function setup({granted=false,user='member',replies,weather,nearby=cards}={}) {
  const elements=new Map(), window=new EventTarget();
  const get=id=>{
    if(!elements.has(id))elements.set(id,Object.assign(new EventTarget(),{parentElement:{},textContent:'',focus(){},hidden:false}));
    return elements.get(id);
  };
  const document=Object.assign(new EventTarget(),{getElementById:get,hidden:false});
  const perm=Object.assign(new EventTarget(),{state:granted?'granted':'prompt'});
  let clock=Date.now(),tick,pref,auth;
  class Clock extends Date {static now(){return clock;}}
  const calls=[];
  const db={auth:{onAuthStateChange(cb){
    auth=cb;cb('INITIAL_SESSION',user?{user:{id:user}}:null);return {data:{subscription:{unsubscribe(){}}}};
  }},schema(){return {rpc(name,params){calls.push({name,params});return {abortSignal(){
    if(name==='list_cards')return Promise.resolve({data:nearby});
    return replies ? replies(params) : Promise.resolve({data:{items:[],total:0,next:null}});
  }};}};}};
  window.OjjudaGetClient=async()=>db;
  window.OJJUDA_CONFIG={supabaseUrl:'https://example.test',supabaseKey:'test'};
  window.OjjudaLocation={preference:async()=>({enabled:true}),authorizePosition:async()=>({}),
    observe(_db,_acct,cb){pref=cb;return ()=>{};},weatherCell:()=>({nx:60,ny:127}),
    readPosition:async()=>({latitude:37,longitude:127,accuracy:5,speed:3,capturedAt:clock})};
  const ctx={window,document,location:{href:'https://ojjuda.kr/park/glasses.html'},URL,URLSearchParams,Date:Clock,
    navigator:{permissions:{query:async()=>perm}},Intl,AbortController,CustomEvent,setInterval:cb=>(tick=cb,1),clearInterval(){},clearTimeout,
    setTimeout:(cb,ms)=>{const t=setTimeout(cb,ms);t.unref();return t;},
    fetch:weather || (async()=>({ok:true,json:async()=>({source:'kma',temperature:-2,label:'눈',expiresAt:clock+40000})}))};
  vm.runInNewContext(readFileSync(path.join(root,'note/glasses.js'),'utf8'),ctx);
  await delay(20);
  return {window,document,perm,get,calls,hud:window.OJJUDA_GLASS_PREVIEW,
    revoke:()=>pref({enabled:false}),signOut:()=>auth('SIGNED_OUT',null),advance:ms=>{clock+=ms;tick();}};
}

test('nearby only, no prompt on entry, consented weather, stale speed and location off',async()=>{
  const {get,hud,calls,revoke,advance,signOut}=await setup();
  assert.equal(calls.length,0);
  await get('glass-locate').onclick();await delay(0);
  assert.equal(calls[0].params.p_sort,'nearby');
  assert.deepEqual(calls.map(c=>c.params.p_sort),['nearby']);
  assert.equal(get('glass-first-body').textContent,'첫 카드');
  assert.equal(get('glass-first-distance').textContent,'1km 이내');
  assert.equal(get('glass-second-distance').textContent,'2km 이내');
  assert.equal(get('glass-speed').textContent,'10.8 km/h');
  assert.equal(get('glass-weather').textContent,'-2°C · 눈');
  assert.equal(hud.getView().card.count,3);
  hud.setBattery(0,true);assert.equal(get('glass-battery').textContent,'0% ⚡');
  hud.setBattery(null);assert.equal(get('glass-battery').textContent,'—%');
  advance(16000);assert.equal(get('glass-speed').textContent,'— km/h');
  revoke();assert.equal(hud.getView().card,null);assert.equal(get('glass-first-distance').textContent,'');
  get('glass-sample').onclick();assert.equal(hud.getView().sample,true);
  signOut();assert.equal(hud.getView().card,null);assert.equal(get('glass-weather').textContent,'날씨 · 로그인 필요');
});
test('existing permission starts nearby cards and preserves a temperature-only KMA observation',async()=>{
  const {get,hud,calls,perm}=await setup({granted:true,weather:async()=>({ok:true,json:async()=>({source:'kma',temperature:0,label:'',expiresAt:Date.now()+60000})})});
  assert.equal(calls.length,1);assert.equal(get('glass-weather').textContent,'0°C');
  perm.state='denied';perm.dispatchEvent(new Event('change'));assert.equal(hud.getView().card,null);
  const guest=await setup({user:null,granted:true});assert.equal(guest.calls.length,0);
});
test('visible replies use their own bands, paginate, retry and discard stale responses',async()=>{
  let mode='pages',finish,attempt=0;
  const {get,hud,calls}=await setup({granted:true,replies:async params=>{
    if(mode==='late')return new Promise(resolve=>{finish=resolve;});
    if(mode==='empty')return {data:{total:0,items:[],next:null}};
    if(!params.p_after && attempt++===0)return {error:{message:'temporary'}};
    const first=!params.p_after;
    return {data:{total:2,snapshot:'2026-11-25T01:00:00Z',next:first?'r1':null,
      items:first?[{id:'r1',body:'가까운 답',distance_band:'근처'}]:[{id:'r2',body:'다음 답',distance_band:null}]}};
  }});
  get('glass-second').onclick();await delay(0);
  assert.match(hud.getView().reader.title,/다시 시도/);
  get('glass-next').onclick();await delay(0);
  assert.equal(get('glass-reader-body').textContent,'가까운 답');
  assert.equal(get('glass-reader-distance').textContent,'1km 이내');
  get('glass-next').onclick();await delay(0);
  assert.equal(get('glass-reader-heading').textContent,'답카드 2/2');
  assert.equal(get('glass-reader-distance').textContent,'거리 미확인');
  assert.equal(calls.at(-1).params.p_parent,'b');assert.equal(calls.at(-1).params.p_after,'r1');
  assert.equal(get('glass-next').disabled,true);
  hud.move(-1);hud.move(-1);assert.equal(get('glass-reader-distance').textContent,'2km 이내');
  assert.match(hud.getView().reader.title,/답카드 2개/);
  hud.select();mode='late';hud.select();hud.select();hud.move(1);
  mode='empty';hud.select();await delay(0);
  finish({data:{items:[{id:'late',body:'늦은 답'}],total:1,next:null}});await delay(0);
  assert.equal(hud.getView().reader.title,'원글 · 답카드 없음');
  assert.equal(get('glass-reader-body').textContent,'먼 카드');
  assert.equal(JSON.stringify(hud.getView()).includes('latitude'),false);
});
test('the G2 renders distance inside the lower right of each message, within the container limit',async()=>{
  const file=readFileSync(path.join(root,'note/glasses-even-g2.mjs'),'utf8').replace(/^import [^;]+;/,'');
  const {g2Page}=await import('data:text/javascript;base64,'+Buffer.from(file).toString('base64'));
  const v={time:'18:00',battery:83,charging:true,speed:0,weather:'2°C',cards:[
    {oneLine:'첫째',distance:'1km 이내'},{oneLine:'둘째',distance:'2km 이내'}]};
  const inside=(frame,label)=>{
    assert.ok(label.xPosition>frame.xPosition+frame.width/3);
    assert.ok(label.yPosition>frame.yPosition+frame.height/2);
    assert.ok(label.xPosition+label.width<=frame.xPosition+frame.width);
    assert.ok(label.yPosition+label.height<=frame.yPosition+frame.height);
  };
  for(const reader of [null,{title:'답카드 1/1',body:'답',distance:'3km 이내'}]){
    const p=g2Page({...v,reader}),xs=p.textObject;
    assert.ok(p.containerTotalNum<=8);assert.equal(xs.filter(x=>x.isEventCapture===1).length,1);
    for(const x of xs)assert.ok(x.xPosition+x.width<=576&&x.yPosition+x.height<=288);
    assert.equal(xs[1].content,'83% ⚡');assert.equal(xs[3].content,'0 km/h');
    if(reader){inside(xs[4],xs[6]);assert.equal(xs[6].content,'3km 이내');assert.match(xs[5].content,/답카드 1\/1/);}
    else{inside(xs[4],xs[6]);inside(xs[5],xs[7]);assert.equal(xs[7].content,'2km 이내');}
  }
});
