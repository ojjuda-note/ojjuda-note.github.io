'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {screen, until, tick, rpcArgs} = require('./helpers/drinking-ui-fixture.cjs');
const {fixture} = require('./drinking-room-fixture.cjs');

const hub = patch => ({code:'ROOM01', title:'친구들 방', players:['하나','둘'], me:0, capacity:12,
  phase:'lobby', kind:null, child:null, revision:1, round:0, ...patch});
const liar = patch => ({code:'LIAR01', title:'라이어 방', players:['하나','둘','셋'], me:0, capacity:3,
  phase:'hints', revision:1, round:1, turn:0, hints:[], role:'citizen', word:'사과', ...patch});
const quiet = () => ({data:null,error:null});

test('a delayed lobby read cannot roll back a newer game selection or duplicate the action', async t => {
  let current = hub(), answerRead;
  const f = await screen({rpc(name, args) {
    if (args.p_action === 'mine') return {room: current};
    if (args.p_action === 'state' && !answerRead) return new Promise(resolve => { answerRead = resolve; });
    if (args.p_action === 'select') { current = hub({revision:3, kind:'bottle'}); return current; }
    return current;
  }});
  t.after(() => f.close());
  await until(() => f.find('#lobby-code')?.textContent === 'ROOM01', 'initial lobby');
  await f.wake(); await until(() => answerRead, 'delayed poll');
  f.click('[data-game="bottle"]');
  f.find('[data-game="bottle"]').click();
  await until(() => /술병/.test(f.find('#selected-game').textContent), 'new selection');
  answerRead(hub({revision:2,kind:'king'})); await tick(); await tick();
  assert.match(f.find('#selected-game').textContent, /술병/);
  assert.equal(f.calls.filter(c => c.args.p_action === 'select').length, 1);
  assert.equal(f.find('#notice').textContent, '');
  assert.deepEqual(f.errors, []);
});

test('lobby read failures retain the roster and recover once after offline/online', async t => {
  let current = hub(), failing = false, holdRecovery = false, finishRecovery;
  const f = await screen({rpc(name, args) {
    if (failing) return {data:null,error:{message:'Failed to fetch'}};
    if (holdRecovery) return new Promise(resolve => {finishRecovery=resolve;});
    return args.p_action === 'mine' ? {room:current} : current;
  }});
  t.after(() => f.close());
  await until(() => f.find('#lobby-code')?.textContent === 'ROOM01', 'initial lobby');
  const roster = f.find('#members');
  failing = true; await f.wake();
  await until(() => f.find('#notice').textContent, 'temporary network message');
  assert.equal(f.find('#members'), roster);
  assert.match(roster.textContent, /하나/);
  await f.online(false);
  const before = f.calls.length;
  await f.advance(60000);
  assert.equal(f.calls.length, before, 'offline clients make no polling requests');
  failing = false; holdRecovery = true; current = hub({revision:2,players:['하나','둘','셋']});
  await f.online(true); await until(()=>finishRecovery,'recovery read'); await f.wake();
  holdRecovery=false;finishRecovery(current);
  await until(() => f.find('#members').children.length === 3, 'recovered roster');
  assert.equal(f.find('#notice').textContent, '');
  assert.equal(f.calls.length, before+1, 'wake events share one read while it is pending');
  assert.equal(f.navigations.length, 0);
});

test('a departed lobby never renders its late response or restarts polling', async t => {
  let resolveState;
  const f = await screen({rpc(name,args) {
    if (args.p_action === 'mine') return {room:hub()};
    return new Promise(resolve => {resolveState=resolve;});
  }});
  t.after(() => f.close());
  await until(() => f.find('#lobby-code').textContent === 'ROOM01', 'lobby');
  await f.wake(); await until(() => resolveState, 'poll');
  await f.event('pagehide');
  const before = f.calls.length;
  resolveState(hub({revision:5,title:'이전 화면의 응답'}));
  await tick(); await f.advance(60000);
  assert.equal(f.find('#room-title').textContent, '친구들 방');
  assert.equal(f.calls.length, before);
});

test('returning to a cached lobby resumes state reads after the main-link departure', async t => {
  let current=hub();
  const f=await screen({rpc(name,args){return args.p_action==='mine'?{room:current}:current;}});
  t.after(()=>f.close());
  await until(()=>f.find('#lobby-code').textContent==='ROOM01','lobby before departure');
  f.find('#hub-back').click();
  await f.event('pagehide');
  const before=f.calls.length;
  current=hub({revision:2,kind:'liar'});
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));
  await f.advance(0);
  await until(()=>/라이어/.test(f.find('#selected-game').textContent),'cached lobby refreshed');
  assert.ok(f.calls.length>before);
});

for(const action of ['create','join']) {
  test('a committed '+action+' with a lost response is recovered by reading membership on return', async t=>{
    let member=false,reply;
    const f=await screen({url:action==='join'?'/games/drinking/?room=ROOM01':'/games/drinking/?mode=multi',
      rpc(name,args){
        if(args.p_action===action){member=true;return new Promise(resolve=>{reply=resolve;});}
        if(args.p_action==='mine')return {room:member?hub():null};
        if(args.p_action==='state')return member?hub():{data:null,error:{message:'not_room_member'}};
        if(args.p_action==='list')return {rooms:[]};
        return quiet();
      }
    });
    t.after(()=>f.close());
    await until(()=>!f.find('#entry').hidden,'entry before '+action);
    const form=f.find(action==='create'?'#create-form':'#join-form');
    form.elements.password.value='room-pass';
    if(action==='join')form.elements.code.value='ROOM01';
    f.submit(action==='create'?'#create-form':'#join-form');
    await until(()=>reply,'server committed '+action);
    await f.hidden(true);await f.hidden(false);
    await until(()=>!f.find('#lobby').hidden&&f.find('#lobby-code').textContent==='ROOM01','membership readback');
    assert.equal(f.calls.filter(c=>c.args.p_action===action).length,1,'no blind re-submission');
    assert.ok(f.calls.some(c=>c.args.p_action==='mine'&&c.settled));
    reply(hub());await tick();
    assert.equal(f.find('#members').children.length,2);
  });
}

for(const game of ['croc','liar','king','bomb','mission']) {
  test(game+' restores a committed native-room join after its response is interrupted', async t=>{
    let joined=false,reply;
    const state={code:'NATIVE',title:'친구의 방',players:['방장','참가자'],me:1,capacity:3,
      phase:'waiting',revision:2,round:0,turn:0,hints:[],game:{}};
    const f=await screen({url:'/games/'+game+'/?room=NATIVE',rpc(name,args){
      if(args.p_action==='join'){joined=true;return new Promise(resolve=>{reply=resolve;});}
      if(args.p_action==='state')return joined?state:{data:null,error:{message:'not_room_member'}};
      return quiet();
    }});
    t.after(()=>f.close());
    await until(()=>f.find('form#entry'),'native join form');
    f.find('form#entry').elements.password.value='room-pass';
    f.submit('form#entry');
    await until(()=>reply,'native join committed');
    await f.hidden(true);await f.hidden(false);
    await until(()=>f.find('#view .members')?.children.length===2,'native membership restored');
    assert.equal(f.calls.filter(c=>c.args.p_action==='join').length,1);
    reply(state);await tick();
    assert.deepEqual(f.errors,[]);
  });
}

test('temporary access failures preserve mounted drafts and require fresh approval to expose them', async t => {
  const f = await screen({gate:true,rpc(name,args) {
    if (args.p_action === 'mine') return {room:null};
    if (args.p_action === 'list') return {rooms:[]};
    return quiet();
  }});
  t.after(() => f.close());
  await until(() => !f.find('#access-content').hidden && f.find('#create-form'), 'approved entry');
  const field = f.find('#create-form [name="title"]');
  field.value = '입력하던 방 이름'; field.focus(); field.setSelectionRange(3,6);
  await f.online(false);
  assert.equal(f.find('#access-content').hidden, true);
  assert.equal(f.w.OjjudaDrinkingAccessReady, false);
  assert.equal(f.find('#create-form [name="title"]'), field);
  f.identityFailure('unavailable');
  await f.online(true);
  await until(() => f.find('#access-screen').dataset.state === 'unavailable', 'failed recheck');
  assert.equal(f.find('#access-content').hidden, true);
  assert.equal(f.navigations.length, 0, 'a temporary outage does not reload and discard the draft');
  f.identityFailure(null);
  await f.advance(16000);
  await until(() => !f.find('#access-content').hidden, 'automatic reapproval');
  assert.equal(f.find('#create-form [name="title"]'), field);
  assert.equal(field.value, '입력하던 방 이름');
  assert.equal(f.w.OjjudaDrinkingAccessReady, true);
  assert.equal(f.navigations.length, 0);
});

test('an account change conceals the old room before a delayed answer can be applied', async t => {
  let resolveState;
  const f = await screen({gate:true,rpc(name,args) {
    if (args.p_action === 'mine') return {room:hub()};
    if (args.p_action === 'state') return new Promise(resolve => {resolveState=resolve;});
    return quiet();
  }});
  t.after(() => f.close());
  await until(() => !f.find('#access-content').hidden && f.find('#lobby-code').textContent==='ROOM01', 'old account room');
  await f.wake(); await until(() => resolveState, 'old account poll');
  await f.account('member-b');
  assert.equal(f.find('#access-content').hidden, true);
  assert.equal(f.w.OjjudaDrinkingAccessReady, false);
  const before = f.calls.length;
  resolveState(hub({revision:9,title:'다른 계정에 보이면 안 되는 방'}));
  await tick(); await f.advance(30000);
  assert.equal(f.find('#room-title').textContent, '친구들 방');
  assert.equal(f.calls.length, before);
  assert.ok(f.navigations.length > 0, 'a different account starts a clean document');
});

test('liar hints retain focus, selection and Korean composition across same-turn updates', async t => {
  let state = liar();
  const f = await screen({url:'/games/liar/?room=LIAR01',rpc:() => state});
  t.after(() => f.close());
  await until(() => f.find('[name="hint"]'), 'hint field');
  const first = f.find('[name="hint"]');
  first.value='내가 적던 한글 힌트'; first.focus(); first.setSelectionRange(3,7);
  first.dispatchEvent(new f.w.CompositionEvent('compositionstart',{bubbles:true,data:'힌'}));
  state=liar({revision:2}); await f.wake(); await tick();
  assert.equal(f.find('[name="hint"]'),first,'do not replace a field during an active Korean composition');
  first.dispatchEvent(new f.w.CompositionEvent('compositionend',{bubbles:true,data:'힌트'}));
  await tick();
  const field=f.find('[name="hint"]');
  assert.equal(field.value,'내가 적던 한글 힌트');
  assert.equal(f.w.document.activeElement,field);
  assert.equal(field.selectionStart,3); assert.equal(field.selectionEnd,7);
  assert.equal(f.navigations.length,0);
});

test('a slow clock sample cannot jump a live countdown backward or forward', async t => {
  let state={code:'BOMB01',title:'폭탄 방',players:['하나','둘'],me:0,capacity:2,
    phase:'playing',round:1,revision:1,serverMs:1800000100000,game:{}}, resolveState, reads=0;
  const f = await screen({url:'/games/bomb/?room=BOMB01',
    scripts:['/games/drinking/connection.js','/games/drinking/child.js','/games/party-live/room.js'],
    prepare(w) { w.PartyLiveGame={view(s,ui){w.__clock=ui.now;return '<p data-clock>진행 중</p>';}}; },
    rpc() { if(++reads===1)return state;return new Promise(resolve=>{resolveState=resolve;}); }
  });
  t.after(()=>f.close());
  await until(()=>f.w.__clock,'initial clock');
  await f.wake(); await until(()=>resolveState,'slow read');
  await f.advance(4000);
  const before=f.w.__clock();
  resolveState({...state,revision:2,serverMs:state.serverMs-20000});
  await tick(); await tick();
  const after=f.w.__clock();
  assert.ok(after>=before,'server clock does not run backward');
  assert.ok(after-before<100,'a multi-second delayed packet cannot abruptly move the displayed clock');
});

test('twelve isolated pages share one actual SQL room through joins, outage, updates and host handoff', {timeout:60000}, async t => {
  const db = await fixture(), windows=[];
  t.after(async()=>{windows.forEach(f=>f.close());await db.close();});
  async function open(actor,url='/games/drinking/?mode=multi') {
    const f=await screen({actor,url,async rpc(name,args) {
      try{return {data:await db.publicRpc(actor,name,rpcArgs(name,args)),error:null};}
      catch(error){return {data:null,error:{message:error.message}};}
    }});
    windows.push(f); return f;
  }
  const host=await open(db.users[0]);
  await until(()=>!host.find('#entry').hidden,'host entry');
  const create=host.find('#create-form');
  create.elements.title.value='열두 명 연결 검사'; create.elements.capacity.value='12';create.elements.password.value='room-pass';
  host.submit('#create-form');host.submit('#create-form');
  await until(()=>!host.find('#lobby').hidden,'created room');
  const code=host.find('#lobby-code').textContent;
  assert.equal(host.calls.filter(c=>c.args.p_action==='create').length,1);
  const guests=await Promise.all(db.users.slice(1,12).map(user=>open(user)));
  await Promise.all(guests.map(async f=>{
    await until(()=>!f.find('#entry').hidden,'guest entry');
    f.find('#join-form').elements.code.value=code;f.find('#join-form').elements.password.value='room-pass';
    f.submit('#join-form');
    await until(()=>!f.find('#lobby').hidden,'guest joined');
  }));
  await Promise.all(windows.map(f=>f.wake()));
  await until(()=>windows.every(f=>f.find('#members').children.length===12),'every roster has twelve participants');
  const roster=host.find('#members').textContent;
  assert.equal(new Set([...host.find('#members').children].map(n=>n.textContent.replace(/ \([^)]*\)/g,''))).size,12);
  assert.match(roster,/참가자 12/);
  const recovering=guests[3];
  await recovering.online(false);const pausedCalls=recovering.calls.length;
  await recovering.advance(30000);assert.equal(recovering.calls.length,pausedCalls);
  host.click('[data-game="liar"]');
  await until(()=>/라이어/.test(host.find('#selected-game').textContent),'host selects a game');
  await Promise.all(windows.filter(f=>f!==recovering).map(f=>f.wake()));
  await recovering.online(true);
  await until(()=>windows.every(f=>/라이어/.test(f.find('#selected-game').textContent)),'online return catches the latest game');
  assert.equal(recovering.find('#members').children.length,12);
  assert.equal(recovering.navigations.length,0);
  host.click('#leave');
  await until(()=>host.calls.some(c=>c.args.p_action==='leave'&&c.settled),'host departure');
  await Promise.all(guests.map(f=>f.wake()));
  await until(()=>guests.every(f=>f.find('#members').children.length===11),'remaining clients retain room');
  const snapshots=await Promise.all(db.users.slice(1,12).map(actor=>db.publicRpc(actor,'drinking_room',['state',code,{}])));
  assert.ok(snapshots.every(s=>s.code===code&&s.players.length===11));
  assert.equal(snapshots.filter(s=>s.me===0).length,1,'exactly one remaining participant owns the room');
  assert.equal(new Set(snapshots.map(s=>s.revision)).size,1);
  assert.equal(new Set(snapshots.map(s=>s.players.join('|'))).size,1);
  assert.ok(windows.every(f=>f.errors.length===0));
  t.diagnostic(`12 independent DOM/session realms, real ${db.migrations.length}-migration PostgreSQL fixture, overlapping member requests; PGlite serializes its single connection, so this is not a production load benchmark.`);
});
