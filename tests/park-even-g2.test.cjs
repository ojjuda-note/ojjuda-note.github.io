const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {setTimeout:delay}=require('node:timers/promises');
const root=path.resolve(__dirname,'..');
const row=(id,body,band,extra={})=>({id,body,distance_band:band,kind:'memo',tags:[],...extra});
const cards=[row('a','첫 카드','근처'),row('b','둘째 카드','2km'),row('c','먼 카드','12km'),row('z','숨김','근처',{tags:['19금']})];

async function setup({granted=false,user='member',installed=false,guestFix,nativeFix,replies,weather,nearby=cards,recent=[row('pub','공개 원글',null)],publicItems=[]}={}) {
  const elements=new Map(), window=new EventTarget();
  const get=id=>{
    if(!elements.has(id))elements.set(id,Object.assign(new EventTarget(),{parentElement:{},textContent:'',focus(){},hidden:false}));
    return elements.get(id);
  };
  const document=Object.assign(new EventTarget(),{getElementById:get,hidden:false,documentElement:{dataset:installed?{evenApp:'1'}:{}}});
  const perm=Object.assign(new EventTarget(),{state:granted?'granted':'prompt'});
  let clock=Date.now(),tick,pref,auth;
  class Clock extends Date {static now(){return clock;}}
  const calls=[];
  const db={auth:{onAuthStateChange(cb){
    auth=cb;cb('INITIAL_SESSION',user?{user:{id:user}}:null);return {data:{subscription:{unsubscribe(){}}}};
  }},schema(){return {from(table){
    assert.equal(table,'public_cards');
    const query={select(){return query;},eq(){return query;},not(){return query;},lte(){return query;},
      order(){return query;},limit(){return query;},abortSignal(){return Promise.resolve({data:publicItems,count:publicItems.length});}};
    return query;
  },rpc(name,params){calls.push({name,params});return {abortSignal(){
    if(name==='list_cards')return Promise.resolve({data:params.p_sort==='recent' ? recent : nearby});
    if(name==='get_card')return Promise.resolve({data:{kind:'memo',tags:[]}});
    return replies ? replies(params) : Promise.resolve({data:{items:[],total:0,next:null}});
  }};}};}};
  window.OjjudaGetClient=async()=>db;
  window.OJJUDA_CONFIG={supabaseUrl:'https://example.test',supabaseKey:'test'};
  window.OjjudaLocation={preference:async()=>({enabled:true}),authorizePosition:async()=>({}),
    readGuestPosition:guestFix || (async()=>({latitude:37.56654,longitude:126.9781,accuracy:12,capturedAt:clock})),
    weatherGrid:()=>({nx:60,ny:127}),
    observe(_db,_acct,cb){pref=cb;return ()=>{};},weatherCell:()=>({nx:60,ny:127}),
    readPosition:async()=>({latitude:37.5665,longitude:126.978,accuracy:5,speed:3,capturedAt:clock})};
  window.OjjudaEvenG2={readPhonePosition:nativeFix};
  const ctx={window,document,location:{href:'https://ojjuda.kr/park/glasses.html'},URL,URLSearchParams,Date:Clock,
    navigator:{permissions:{query:async()=>perm}},Intl,AbortController,CustomEvent,setInterval:cb=>(tick=cb,1),clearInterval(){},clearTimeout,
    setTimeout:(cb,ms)=>{const t=setTimeout(cb,ms);t.unref();return t;},
    fetch:weather || (async()=>({ok:true,json:async()=>({source:'kma',temperature:-2,label:'눈',expiresAt:clock+40000})}))};
  const {createSpeedMeter} = await import('../note/rokid-agent/lib/speed.js');
  ctx.createSpeedMeter = createSpeedMeter;
  ctx.cityAt=(await import('../note/glasses-city.mjs')).cityAt;
  vm.runInNewContext(readFileSync(path.join(root,'note/glasses.js'),'utf8').replace(/^import .*?;\r?\n/gm,''),ctx);
  await delay(20);
  return {window,document,perm,get,calls,hud:window.OJJUDA_GLASS_PREVIEW,
    revoke:()=>pref({enabled:false}),signOut:()=>auth('SIGNED_OUT',null),advance:ms=>{clock+=ms;tick();}};
}

test('current location on entry, nearby cards, consented weather, stale speed and location off',async()=>{
  const {get,hud,calls,revoke,advance,signOut}=await setup();
  assert.deepEqual(calls.map(c=>c.params.p_sort),['recent','nearby']);
  assert.equal(get('glass-first-body').textContent,'첫 카드');
  assert.equal(get('glass-selected').hidden,false);
  assert.equal(get('glass-first-distance').textContent,'1km 이내');
  assert.equal(get('glass-second-distance').textContent,'2km 이내');
  assert.equal(get('glass-speed').textContent,'10.8 km/h');
  assert.equal(get('glass-weather').textContent,'서울 · -2°C · 눈');
  assert.equal(hud.getView().card.count,3);
  hud.setBattery(0,true);assert.equal(get('glass-battery').textContent,'0% ⚡');
  hud.setBattery(null);assert.equal(get('glass-battery').textContent,'—%');
  advance(16000);assert.equal(get('glass-speed').textContent,'— km/h');
  revoke();assert.equal(hud.getView().card,null);assert.equal(get('glass-first-distance').textContent,'');
  get('glass-sample').onclick();assert.equal(hud.getView().sample,true);
  signOut();assert.equal(hud.getView().card,null);assert.equal(get('glass-weather').textContent,'날씨 · 현재 위치');
});
test('existing permission starts nearby cards and preserves a temperature-only KMA observation',async()=>{
  const {get,hud,calls,perm}=await setup({granted:true,weather:async()=>({ok:true,json:async()=>({source:'kma',temperature:0,label:'',expiresAt:Date.now()+60000})})});
  assert.deepEqual(calls.map(c=>c.params.p_sort),['recent','nearby']);assert.equal(get('glass-weather').textContent,'서울 · 0°C');
  perm.state='denied';perm.dispatchEvent(new Event('change'));assert.equal(hud.getView().card,null);
  const guest=await setup({user:null,granted:true});
  assert.deepEqual(guest.calls.map(c=>[c.params.p_sort,c.params.p_lat]),[['recent',null],['nearby',37.567]]);
});

test('guest GPS retains public replies and switches off without retaining distances',async()=>{
  const {get,hud,calls}=await setup({user:null,publicItems:[row('r','공개 답카드',null)]});
  assert.equal(get('glass-locate').hidden,false);
  assert.equal(get('glass-first-distance').textContent,'1km 이내');
  hud.select();await delay(0);hud.move(1);
  assert.equal(hud.getView().reader.body,'공개 답카드');
  hud.select();
  assert.equal(get('glass-status').textContent,'서울 · 가까운 순');
  assert.ok(!calls.some(c=>c.name==='glasses_replies'));
  get('glass-locate').onclick();await delay(0);
  assert.equal(get('glass-first-body').textContent,'공개 원글');
  assert.equal(get('glass-weather').textContent,'날씨 · 위치 꺼짐');
});

test('a location without nearby cards keeps its weather and shows clearly marked recent cards',async()=>{
  const {get}=await setup({user:null,nearby:[]});
  assert.match(get('glass-status').textContent,/30km 이내 카드 없음.*최신순/);
  assert.equal(get('glass-first-distance').textContent,'');
  assert.match(get('glass-weather').textContent,/서울/);
});
test('installed guest uses phone GPS independently of the glasses display and sends only a weather grid',async()=>{
  const urls=[];
  const {get,calls}=await setup({installed:true,user:null,guestFix:()=>assert.fail('unexpected web GPS'),
    nativeFix:async()=>({latitude:37.56654,longitude:126.9781,timestamp:Date.now()}),
    weather:async url=>{urls.push(url.toString());return {ok:true,json:async()=>({source:'kma',temperature:5,expiresAt:Date.now()+60000})};}});
  assert.equal(get('glass-weather').textContent,'서울 · 5°C');
  assert.equal(new URL(urls[0]).searchParams.get('cell'),'60,127');
  assert.ok(!urls[0].includes('37.56'));
  assert.equal(calls.at(-1).params.p_lat,37.567);
});
test('denied location keeps public cards, and a fix arriving after power off is discarded',async()=>{
  let finish;
  const denied=await setup({user:null,guestFix:async()=>{throw Error('위치 권한 거부');}});
  assert.match(denied.get('glass-status').textContent,/위치 권한 거부/);
  assert.equal(denied.get('glass-first-body').textContent,'공개 원글');
  const pending=await setup({user:null,guestFix:()=>new Promise(r=>{finish=r;})});
  pending.get('glass-power').onclick();
  finish({latitude:37,longitude:127,accuracy:10});await delay(0);
  assert.ok(!pending.calls.some(c=>c.params.p_sort==='nearby'));
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
    else{assert.equal(xs[4].content,'▶ 첫째');assert.equal(xs[5].content,'둘째');inside(xs[4],xs[6]);inside(xs[5],xs[7]);assert.equal(xs[7].content,'2km 이내');}
  }
});

test('public nested replies open from their parent and return to the same sibling',async()=>{
  const {get,hud}=await setup({user:null});
  get('glass-sample').onclick();hud.select();hud.move(1);
  assert.equal(hud.getView().reader.hasReplies,true);
  get('glass-children').onclick();
  assert.match(hud.getView().reader.title,/2단계 답카드 1\/1/);
  assert.equal(hud.getView().reader.body,'은행나무 옆 벤치도 좋아요.');
  hud.move(-1);assert.equal(hud.getView().reader.body,'저도 이 길을 좋아해요.');
  hud.move(1);assert.equal(get('glass-children').hidden,true);
  get('glass-power').onclick();assert.equal(hud.getView().paused,true);
  hud.select();assert.equal(hud.getView().paused,false);
});

test('nearby grandchildren and great-grandchildren retain distance, parent and sibling order',async()=>{
  const tree={a:[['one','첫 답',true],['two','다음 답',false]],one:[['child','속 답',true]],child:[['deep','더 깊은 답',false]]};
  const {hud}=await setup({granted:true,replies:async p=>{
    const items=(tree[p.p_parent]||[]).map(([id,body,has_replies])=>({id,body,has_replies,distance_band:'2km'}));
    return {data:{items,total:items.length,next:null}};
  }});
  hud.select();await delay(0);hud.move(1);hud.select();await delay(0);hud.select();await delay(0);
  assert.equal(hud.getView().reader.body,'더 깊은 답');
  assert.equal(hud.getView().reader.distance,'2km 이내');
  hud.move(-1);assert.equal(hud.getView().reader.body,'속 답');
  hud.move(-1);hud.move(1);assert.equal(hud.getView().reader.body,'다음 답');
});

test('G2 startup waits for a connected device, opens a simple page and retains cards when a full rebuild is rejected',async()=>{
  const bridge={connected:false,starts:[],updates:[],
    async getDeviceInfo(){return {status:{connectType:this.connected?'connected':'disconnected'}};},
    async createStartUpPageContainer(page){this.starts.push(page);return 0;},
    async rebuildPageContainer(){return false;},
    async textContainerUpgrade(update){this.updates.push(update);return true;},
    onEvenHubEvent(){return ()=>{};}
  };
  const code=readFileSync(path.join(root,'note/glasses-even-g2.mjs'),'utf8')
    .replace(/^import [^;]+;/,'').replaceAll('export ', '');
  const attach=vm.runInNewContext(code+'\nattachEvenG2',{window:new EventTarget(),setTimeout,clearTimeout,
    waitForEvenAppBridge:async()=>bridge});
  const hud={setBattery(){},getView(){return {time:'19:43',cards:[{oneLine:'공원 카드',distance:''}],weather:'4°C'};}};
  await assert.rejects(attach(hud),/DEVICE/);assert.equal(bridge.starts.length,0);
  bridge.connected=true;
  const device=await attach(hud);
  await delay(0);
  assert.equal(bridge.starts.length,1);
  assert.equal(bridge.starts[0].containerTotalNum,1);
  assert.match(bridge.starts[0].textObject[0].content,/공원 카드/);
  assert.match(bridge.updates.at(-1).content,/공원 카드/);
  device.dispose();
});

test('resolves city boundaries locally including counties and islands', async()=>{
  const {cityAt}=await import('../note/glasses-city.mjs');
  for(const [lat,lon,expected] of [[37.5665,126.978,'서울'],[37.2636,127.0286,'수원시'],[35.1796,129.0756,'부산'],[33.4996,126.5312,'제주시'],[33.2541,126.5601,'서귀포시'],[37.8315,127.5095,'가평군'],[34.8118,126.3922,'목포시'],[35.1595,126.8526,'광주'],[35,132,''],[0,0,'']]){
    assert.equal(cityAt(lat,lon),expected);
  }
  const manifest=JSON.parse(readFileSync(path.join(root,'note/even-app/app.json'),'utf8'));
  assert.deepEqual(manifest.permissions.map(x=>x.name).sort(),['location','network']);
  const sdk=readFileSync(path.join(root,'note/glasses-even-g2.mjs'),'utf8');
  assert.doesNotMatch(sdk,/audioControl|voiceMenu|startVoice/);
});
