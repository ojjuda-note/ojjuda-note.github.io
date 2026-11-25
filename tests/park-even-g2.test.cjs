const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {setTimeout:delay} = require('node:timers/promises');
const root = path.resolve(__dirname,'..');

test('G2 HUD keeps two visible cards and removes stale location and battery values', async () => {
  const elements = new Map();
  function get(id) {
    if (!elements.has(id)) elements.set(id,Object.assign(new EventTarget(),{
      parentElement:{},textContent:'',focus(){},hidden:false
    }));
    return elements.get(id);
  }
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(),{getElementById:get, hidden:false});
  const row = (id,body,extra={}) => ({kind:'memo',tags:[],id,body,...extra});
  const rows = [row('a','하나'),row('b','둘'),row('c','셋'),row('z','숨김',{tags:['19금']})];
  let slow, tick, sessionCB, preferenceCB, clock = Date.now();
  class Clock extends Date { static now() { return clock; } }
  const calls=[];
  const db = {auth:{onAuthStateChange(cb) {
    sessionCB=cb; cb('INITIAL_SESSION',{user:{id:'member'}});
    return {data:{subscription:{unsubscribe(){}}}};
  }}, schema(){return {rpc(name,params) {
    calls.push(params);
    if (params.p_sort==='nearby') return new Promise(resolve=>{slow=resolve;});
    return Promise.resolve({data:rows});
  }}}};
  window.OjjudaGetClient = async()=>db;
  window.OJJUDA_CONFIG={supabaseUrl:'https://example.test',supabaseKey:'test'};
  window.OjjudaLocation={preference:async()=>({enabled:true}),authorizePosition:async()=>({}),
    observe(_db,_owner,cb){ preferenceCB=cb; return ()=>{}; },weatherCell:()=>({nx:60,ny:127}),
    readPosition:async()=>({latitude:37,longitude:127,accuracy:5,speed:3,capturedAt:clock})};
  const ctx={window,document,location:{href:'https://ojjuda.kr/park/glasses.html'},URL,URLSearchParams,Date:Clock,
    Intl,AbortController,CustomEvent,setInterval:cb=>(tick=cb,1),clearInterval(){},clearTimeout,
    setTimeout:(cb,ms)=>{const t=setTimeout(cb,ms);t.unref();return t;},
    fetch:async()=>({ok:true,json:async()=>({source:'kma',temperature:-2,label:'눈',expiresAt:clock+40000})})};
  vm.runInNewContext(readFileSync(path.join(root,'note/glasses.js'),'utf8'),ctx);
  await delay(20);
  const hud=window.OJJUDA_GLASS_PREVIEW;
  assert.equal(get('glass-first').textContent,'하나');
  assert.equal(get('glass-second').textContent,'둘');
  assert.equal(get('glass-battery').textContent,'—%');
  hud.setBattery(0,true);
  assert.equal(get('glass-battery').textContent,'0% ⚡');
  hud.setBattery(null); assert.equal(get('glass-battery').textContent,'—%');
  get('glass-second').onclick();assert.equal(get('glass-full').textContent,'둘');
  get('glass-full').onclick(); get('glass-next').onclick();assert.equal(get('glass-second').disabled,true);
  assert.equal(hud.getView().card.count,3);
  await get('glass-locate').onclick();await delay(0);
  assert.equal(get('glass-speed').textContent,'10.8 km/h');
  assert.equal(get('glass-weather').textContent,'-2° · 눈');
  assert.deepEqual(Object.keys(hud.getView()).filter(k=>/longitude|latitude/i.test(k)),[]);
  clock+=16000;tick();assert.equal(get('glass-speed').textContent,'— km/h');
  preferenceCB({enabled:false});
  slow({data:[row('old','이전 위치')]});await delay(0);
  assert.equal(get('glass-first').textContent,'하나');
  assert.equal(get('glass-weather').textContent,'—° · 날씨 —');
  get('glass-sample').onclick();assert.equal(hud.getView().sample,true);
  get('glass-sample').onclick();await delay(0);assert.equal(get('glass-first').textContent,'하나');
  sessionCB('SIGNED_OUT',null);await delay(10);
  const before=calls.length;await get('glass-locate').onclick();assert.equal(calls.length,before);
});

test('native G2 fields fit 576 by 288 with exactly one gesture target', async () => {
  const file=readFileSync(path.join(root,'note/glasses-even-g2.mjs'),'utf8');
  const source=file.replace(/^import [^;]+;/,'');
  const {g2Page}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const model={time:'18:00',battery:83,charging:true,speed:0,weather:'2° · 흐림',cards:[
    {oneLine:'첫 카드',body:'첫 카드 전문'},{oneLine:'둘째 카드',body:'둘째 카드 전문'}]};
  for(const expanded of [false,true]){
    const page=g2Page({...model,expanded});
    assert.equal(page.containerTotalNum,expanded?5:6);
    assert.equal(page.textObject.filter(x=>x.isEventCapture===1).length,1);
    for(const item of page.textObject){
      assert.ok(item.xPosition>=0 && item.xPosition+item.width<=576);
      assert.ok(item.yPosition>=0 && item.yPosition+item.height<=288);
    }
    assert.equal(page.textObject[1].content,'83% ⚡');
    assert.equal(page.textObject[3].content,'0 km/h');
    assert.equal(page.textObject[4].content,expanded?'첫 카드 전문':'첫 카드');
    if(!expanded)assert.equal(page.textObject[5].content,'둘째 카드');
  }
});
