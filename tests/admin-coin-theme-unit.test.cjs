const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const world = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

{
  const start = world.indexOf('$0["adm-coins-open"]=');
  const end = world.indexOf('function mountAdminModule()', start);
  assert.ok(start > 0 && end > start);
  const inputs = {'#am-amount':{value:'200'},'#am-operation':{value:'subtract'},'#am-reason':{value:''}};
  const messages = [],calls = [];
  let modal = '',confirm;
  const context = vm.createContext({
    $0: {}, w:escapeHtml, Number,
    ct(markup) { modal = markup; },
    z: id => inputs[id],
    M: message => messages.push(message),
    Tt: (text,label,callback) => {confirm = {text,label,callback};},
    Oa: async (_element, task, message) => { await task(); messages.push(message); },
    U: { adjustCoins: async (...args) => {calls.push(args);return 800;} }
  });
  vm.runInContext(world.slice(start,end), context);
  const member = {uid:'member-1',name:'<회원>',coins:'1000'};
  assert.match(context.adminCoinAction({id:'member-1',nickname:'<회원>',coins:1000}),/data-act="adm-coins-open"/);
  context.$0['adm-coins-open'](member);
  assert.match(modal,/현재 보유/);
  assert.ok(!modal.includes('<회원>'), 'a member nickname is escaped in the edit dialog');
  context.$0['adm-coins'](member);
  assert.match(messages.at(-1),/사유/);
  assert.equal(calls.length,0, 'an edit without a reason cannot be saved');

  inputs['#am-reason'].value='관리자 확인 정정';
  inputs['#am-amount'].value='1001';context.$0['adm-coins'](member);
  assert.match(messages.at(-1),/보유 쭈/);
  inputs['#am-amount'].value='200.5';context.$0['adm-coins'](member);
  assert.match(messages.at(-1),/정수/);
  inputs['#am-amount'].value='200';context.$0['adm-coins'](member);
  assert.match(confirm.text,/200 ZU 차감/);
  assert.equal(calls.length,0, 'a valid edit still requires confirmation');
  Promise.resolve(confirm.callback()).then(() => {
    assert.deepEqual(Array.from(calls[0]),['member-1',-200,'관리자 확인 정정']);
    inputs['#am-operation'].value='add';
    context.$0['adm-coins'](member);
    return Promise.resolve(confirm.callback());
  }).then(() => {
    assert.deepEqual(Array.from(calls[1]),['member-1',200,'관리자 확인 정정']);
    console.log('PASS: administrator wallet edit requires reason, valid integer, balance and confirmation');
  }).catch(error => { console.error(error); process.exitCode = 1; });
}

{
  const start = world.indexOf('function worldNoticeMarkup()');
  const end = world.indexOf('function Zg()', start);
  assert.ok(start > 0 && end > start);
  const handlers = {};
  const context = vm.createContext({
    window: { OjjudaThemes: {getCurrent:()=> 'autumn',catalog:{autumn:{name:'가을',copy:'차 한 잔 같은 여유.'},christmas:{name:'크리스마스',copy:'따뜻한 마음이 모이는 날.'}}},addEventListener(name,fn){handlers[name]=fn;} },
    document: {}, g:{tab:'arcade'},D:{online:true},wt:{notice:'서비스 <공지>'},w:escapeHtml,Ts(){}
  });
  vm.runInContext(world.slice(start,end),context);
  const first=context.worldNoticeMarkup();
  assert.equal((first.match(/class="nb-announcement"/g)||[]).length,2,'the seamless marquee has two copies');
  assert.ok(first.indexOf('nb-announcement') < first.indexOf('nb-season'),'announcement precedes the seasonal line');
  assert.ok(first.includes('가을 · 차 한 잔 같은 여유.'));
  assert.ok(first.includes('서비스 &lt;공지&gt;'));
  context.window.OjjudaThemes.getCurrent=()=> 'christmas';
  const holiday=context.worldNoticeMarkup();
  assert.ok(holiday.includes('크리스마스 · 따뜻한 마음이 모이는 날.'));
  assert.equal(typeof handlers['ojjuda:themechange'],'function');
  context.g.tab='admin';assert.equal(context.worldNoticeMarkup(),'');
  console.log('PASS: seasons and holidays follow the notice in both ticker copies; admin screens stay clear');
}

{
  const source=fs.readFileSync(path.join(root,'app/world/world-themes.js'),'utf8');
  let now=Date.parse('2026-11-03T03:00:00Z');
  const changes=[],greeting={textContent:''};
  class Clock extends Date {
    constructor(...args){super(...(args.length?args:[now]));}
    static now(){return now;}
  }
  const rootElement={dataset:{}};
  const context={Date:Clock,Event:class{constructor(type){this.type=type;}},document:{documentElement:rootElement,querySelectorAll:()=>[greeting],addEventListener(){}},localStorage:{removeItem(){}},setTimeout:()=>1,clearTimeout(){},console};
  context.window=context;context.matchMedia=()=>({matches:false,addEventListener(){}});
  context.addEventListener=()=>{};context.dispatchEvent=e=>changes.push(e.type);
  vm.runInNewContext(source,context);
  assert.equal(context.OjjudaThemes.getCurrent(),'autumn');
  assert.equal(greeting.textContent,'오쭈다에서 가을빛 안부를 천천히 나눠요.');
  now=Date.parse('2026-11-04T03:00:00Z');context.OjjudaThemes.sync();
  assert.equal(context.OjjudaThemes.getCurrent(),'pepero');
  assert.equal(changes.length,2,'the script announces the one-week-early event change');
  now=Date.parse('2026-11-11T03:00:00Z');context.OjjudaThemes.sync();
  assert.equal(context.OjjudaThemes.getCurrent(),'pepero');
  assert.equal(changes.length,2,'the event day does not repeat an unchanged theme notification');
  console.log('PASS: Korean seasonal/event themes change the greeting and emit the ticker update event');
}
