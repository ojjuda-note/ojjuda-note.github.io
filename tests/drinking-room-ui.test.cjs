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

test('room directory filters titles only and keeps rooms with identical names distinct',async t=>{
  const rooms=['ROOM01','ROOM02','ROOM03'].map((code,i)=>({
    code,title:i===2?'다른 방':'금요일 Café',host:'친구',players:1,capacity:4,phase:'lobby'
  }));
  const f=await screen({rpc:(_name,args)=>args.p_action==='mine'?{room:null}:{rooms}});
  t.after(()=>f.close());
  await until(()=>f.find('#room-list').children.length===3,'directory loaded');
  assert.ok(f.find('#create-form').hidden && f.find('#join-form').hidden);
  assert.equal(f.find('#open-create').search,'?mode=multi&view=create');
  const search=f.find('#room-search');
  const filter=value=>{search.value=value;search.dispatchEvent(new f.w.Event('input'));};
  filter('  CAFE\u0301 ');
  const results=[...f.find('#room-list').querySelectorAll('a')];
  assert.deepEqual(results.map(a=>new URL(a.href).searchParams.get('room')),['ROOM01','ROOM02']);
  assert.ok(results.every(a=>a.querySelector('strong').textContent==='금요일 Café'));
  for(const word of ['ROOM01','친구']){
    filter(word);assert.equal(f.find('#room-list').children.length,0);
    assert.match(f.find('#room-message').textContent,/검색 결과가 없어요/);
  }
  filter('');assert.equal(f.find('#room-list').children.length,3);
  assert.equal(f.find('[name="code"]'),null);
});

test('random start draws from every multiplayer game the joined players can play',async t=>{
  const threeRequired=['liar','king','minority','mission'];
  for(const size of [1,2,3,12]){
    const current=hub({players:Array.from({length:size},(_,i)=>'참가자 '+(i+1))});
    const f=await screen({rpc:(_name,args)=>args.p_action==='mine'?{room:{...current}}:{...current}});
    t.after(()=>f.close());
    await until(()=>!f.find('#lobby').hidden);
    const all=Array.from(f.find('#games').children,tile=>tile.dataset.game);
    const pool=size<2?[]:all.filter(kind=>size>=3||!threeRequired.includes(kind));
    const button=f.find('#random-start');
    assert.equal(button.hidden,false);assert.equal(button.disabled,size===1);
    if(size===1){button.click();assert.ok(!f.calls.some(c=>c.args.p_action==='start'));continue;}
    for(let i=0;i<pool.length;i++){
      f.w.Math.random=()=>(i+0.5)/pool.length;
      button.click();button.click();
      await until(()=>!button.disabled);
      const starts=f.calls.filter(c=>c.args.p_action==='start');
      assert.equal(starts.length,i+1);
      assert.equal(starts[i].args.p_options.kind,pool[i]);
      // Move to a fresh lobby revision for the next independent draw.
      current.revision++;
      await f.wake();await until(()=>f.calls.at(-1).settled);
    }
  }
});

test('retrying a random start after a lost reply reuses the draw and request ID',async t=>{
  const current=hub();
  const f=await screen({rpc:(_name,args)=>{
    if(args.p_action==='start')return {error:{message:'Failed to fetch'}};
    return args.p_action==='mine'?{room:current}:current;
  }});
  t.after(()=>f.close());
  await until(()=>!f.find('#lobby').hidden);
  const button=f.find('#random-start');
  f.w.Math.random=()=>0;button.click();await until(()=>!button.disabled);
  f.w.Math.random=()=>0.99;button.click();await until(()=>!button.disabled);
  const starts=f.calls.filter(c=>c.args.p_action==='start');
  assert.equal(starts.length,2);
  assert.deepEqual(starts[1].args.p_options,starts[0].args.p_options);
});

test('a delayed lobby read cannot roll back a newer game selection or duplicate the action', async t => {
  let current = hub(), answerRead;
  const f = await screen({rpc(name, args) {
    if (args.p_action === 'mine') return {room: current};
    if (args.p_action === 'state' && !answerRead) return new Promise(resolve => { answerRead = resolve; });
    if (args.p_action === 'select') { current = hub({revision:3, kind:'bottle'}); return current; }
    return current;
  }});
  t.after(() => f.close());
  await until(() => f.find('#room-title')?.textContent === '친구들 방', 'initial lobby');
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
  await until(() => f.find('#room-title')?.textContent === '친구들 방', 'initial lobby');
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
  await until(() => f.find('#room-title').textContent === '친구들 방', 'lobby');
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
  await until(()=>f.find('#room-title').textContent === '친구들 방','lobby before departure');
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
    const f=await screen({url:action==='join'?'/games/drinking/?room=ROOM01':'/games/drinking/?mode=multi&view=create',
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
    const suggestedTitle=form.elements.title?.value;
    if(action==='create'){
      assert.ok(suggestedTitle.trim());
      form.elements.title.value='  ';
    }
    f.submit(action==='create'?'#create-form':'#join-form');
    await until(()=>reply,'server committed '+action);
    if(action==='create')assert.equal(f.calls.find(c=>c.args.p_action==='create').args.p_options.title,suggestedTitle);
    await f.hidden(true);await f.hidden(false);
    await until(()=>!f.find('#lobby').hidden&&f.find('#room-title').textContent === '친구들 방','membership readback');
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
  const f = await screen({url:'/games/drinking/?mode=multi&view=create',gate:true,rpc(name,args) {
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
  await until(() => !f.find('#access-content').hidden && f.find('#room-title').textContent === '친구들 방', 'old account room');
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
  f.click('[data-drinking-dialog="guide"] [data-drinking-close]');
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
  const host=await open(db.users[0],'/games/drinking/?mode=multi&view=create');
  await until(()=>!host.find('#entry').hidden,'host entry');
  const create=host.find('#create-form');
  create.elements.title.value='열두 명 연결 검사'; create.elements.capacity.value='12';create.elements.password.value='room-pass';
  host.submit('#create-form');host.submit('#create-form');
  await until(()=>!host.find('#lobby').hidden,'created room');
  const code=new URL(host.w.location.href).searchParams.get('room');
  assert.equal(host.calls.filter(c=>c.args.p_action==='create').length,1);
  const guests=await Promise.all(db.users.slice(1,12).map(user=>open(user,'/games/drinking/?room='+code)));
  await Promise.all(guests.map(async f=>{
    await until(()=>!f.find('#entry').hidden,'guest entry');
    f.find('#join-form').elements.password.value='room-pass';
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

test('one-device fingers uses topic menus and keeps an independent custom draft through a failed catalog load',async t=>{
  const bank=['목걸이 한 사람 접어','흰 티 입은 사람 접어','소개팅한 사람 접어','아침에 일찍 일어난 사람 접어'];
  let available=false;
  const ui=await screen({url:'/games/drinking/local/#fingers',
    prepare(w){w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};},
    rpc(name,args){
      if(name==='drinking_content'){
        assert.equal(args.p_options.round_mix,false);
        if(!available)throw Error('offline');
        return {banks:{fingers:bank}};
      }
      return {ok:true};
    }});t.after(()=>ui.close());
  ui.click('[data-action="start"]');
  await until(()=>ui.find('[data-finger-retry]')?.hidden===false,'retry list');
  ui.click('[data-finger-mode="write"]');
  const field=ui.find('[data-finger-panel="write"] textarea');
  field.value='   ';field.dispatchEvent(new ui.w.Event('input',{bubbles:true}));
  assert.equal(ui.find('#party-prompt [type="submit"]').disabled,true);
  field.value='오늘 산책한 사람 접어';field.dispatchEvent(new ui.w.Event('input',{bubbles:true}));
  ui.click('[data-finger-mode="list"]');available=true;ui.click('[data-finger-retry]');
  const topic=ui.find('[data-finger-topic]'),choice=ui.find('[data-finger-choice]');
  await until(()=>choice.options.length===bank.length,'all current instructions');
  topic.value='옷·액세서리';topic.dispatchEvent(new ui.w.Event('change'));
  assert.deepEqual([...choice.options].map(o=>o.value),bank.slice(0,2));
  ui.click('[data-finger-mode="write"]');assert.equal(field.value,'오늘 산책한 사람 접어');
  ui.submit('#party-prompt');assert.equal(ui.find('.play-body h2').textContent,field.value);
  ui.submit('#fold-form');await until(()=>ui.find('[data-finger-choice]')?.options.length===bank.length,'next turn');
  const next=ui.find('[data-finger-choice]');next.value=bank[2];next.dispatchEvent(new ui.w.Event('change'));
  ui.submit('#party-prompt');assert.equal(ui.find('.play-body h2').textContent,bank[2]);
});

test('sentence menus filter mild and spicy, alternate mixed recommendations and preserve the written question',async t=>{
  const items=['누가 산책을 좋아할까요?','친구와 캠핑을 간 사람은?','첫 키스의 기억은?','연인과 스킨십을 먼저 제안할 사람은?'];
  const ui=await screen({url:'/games/drinking/local/#imagevote',prepare(w){w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};},rpc(name){return name==='drinking_content'?{banks:{imagevote:items}}:{ok:true};}});t.after(()=>ui.close());
  ui.click('[data-action="start"]');ui.click('[data-action="question-menu"]');
  const menu=()=>ui.find('.party-question-dialog[open]'),selector=menu().querySelector('[data-question]'),flavor=menu().querySelector('[data-prompt-flavor]');
  const change=el=>el.dispatchEvent(new ui.w.Event('change',{bubbles:true}));
  await until(()=>selector.options.length===4);
  const before=menu().querySelector('[data-selected]').textContent.split(' · ')[0];menu().querySelector('[data-another]').click();
  assert.notEqual(menu().querySelector('[data-selected]').textContent.split(' · ')[0],before);
  flavor.value='mild';change(flavor);await until(()=>selector.options.length===2);assert.deepEqual([...selector.options].map(o=>o.text),items.slice(0,2));
  flavor.value='spicy';change(flavor);await until(()=>selector.options.length===2);assert.deepEqual([...selector.options].map(o=>o.text),items.slice(2));
  menu().querySelector('[data-mode="write"]').click();const field=menu().querySelector('textarea');field.value='선물로 받고 싶은 것은?';field.dispatchEvent(new ui.w.Event('input'));
  menu().querySelector('[data-mode="list"]').click();menu().querySelector('[data-mode="write"]').click();assert.equal(field.value,'선물로 받고 싶은 것은?');
  ui.submit('.party-question-dialog form');assert.equal(ui.find('#party-question').value,field.value);
});

test('the lobby invites an eligible friend and accepting the notification joins that exact room',async t=>{
  const fs=require('node:fs'), path=require('node:path');
  const migration=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');
  const db=await fixture();
  t.after(()=>db.close());
  const [host,friend,other]=db.users;
  await db.db.exec(`
    create schema ojjuda_matgo_internal;
    create table ojjuda_matgo_internal.rooms(host_id uuid, code text, status text);
    create table public.friendships(requester uuid,addressee uuid,status text);
    create function public.is_friend(uuid,uuid) returns boolean language sql stable as $$
      select exists(select 1 from public.friendships where status='accepted'
        and (requester=$1 and addressee=$2 or requester=$2 and addressee=$1)) $$;
    create function ojjuda_roulette_internal.arcade_eligible(uuid) returns boolean language sql as $$ select true $$;
  `);
  await db.db.query("insert into public.friendships values ($1,$2,'accepted')",[host,friend]);
  await db.db.exec(migration('20261009062933_arcade_friend_invites.sql'));
  await db.db.exec(migration('20261010134600_arcade_invite_popup.sql'));
  const roulette=migration('20261031123640_roulette_arcade_integration.sql');
  const service=roulette.match(/create or replace function ojjuda_arcade_internal\.friend_invite_service\([\s\S]*?end;\$\$;/i);
  await db.db.exec(service[0]);
  await db.db.exec(migration('20261115013320_drinking_room_directory.sql'));
  await db.db.exec(migration('20261115013328_drinking_friend_invitations.sql'));
  const room=await db.publicRpc(host,'drinking_room',['create','',{title:'친구들 테이블',capacity:4,password:'private-pass',request_id:crypto.randomUUID()}]);
  const invite=(actor,action,id=null)=>db.publicRpc(actor,'arcade_friend_invite',[action,null,null,null,id]);
  const f=await screen({actor:host,rpc:async(name,args)=>{
    const values=name==='arcade_friend_invite'?[args.p_action,args.p_to,args.p_kind,args.p_code,null]:rpcArgs(name,args);
    return db.publicRpc(host,name,values);
  }});
  t.after(()=>f.close());
  await until(()=>!f.find('#lobby').hidden,'lobby');
  f.click('#invite');
  await until(()=>f.find('#invite-list button'),'friend options');
  assert.equal(f.find('#invite-list').children.length,1);
  f.click('#invite-list button');
  await until(()=>f.find('#invite-status').textContent.includes('보냈어요'),'notification sent');
  assert.equal((await invite(other,'list')).invites.length,0);
  const [pending]=(await invite(friend,'list')).invites;
  assert.equal(pending.room_title,room.title);
  await assert.rejects(invite(other,'accept',pending.id),/invite_unavailable/);
  const joined=await invite(friend,'accept',pending.id);
  assert.equal(joined.code,room.code);
  assert.equal((await db.publicRpc(friend,'drinking_room',['state',room.code,{}])).me,1);
  assert.equal((await invite(friend,'list')).invites.length,0);
});
