import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import * as rules from '../games/yut/rules.mjs';
import * as results from '../games/yut/results.mjs';
import {ANIMALS,animalFor} from '../games/yut/zodiac.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const publicCard=(patch={})=>({room_no:1842,kind:'yut',native:true,title:'친구와 윷놀이',host_name:'민준',players:1,capacity:4,status:'waiting',is_host:false,is_member:false,match_id:'public-yut',code:'1842',...patch});

// Canvas and transport are deliberately isolated; entrance, shared room cards,
// form events and page lifecycle run the production code in the same DOM.
function fixture(t,{actor='member-a',url='https://example.test/games/yut/',cards=[],enterGate=null,createGate=null,joinGate=null,storage=null}={}){
  const dom=new JSDOM(source('../games/yut/index.html'),{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,doc=w.document,calls={enter:0,list:0,create:[],join:[],cancel:[],start:0,close:0,legacy:0,directoryCreated:0,directoryClosed:0};
  const state={actor,cards,room:null,onUpdate:null,onAuthChange:null,startGate:null,startError:null};
  const noop=()=>{};
  const board=new Proxy({},{get:()=>noop});
  w.matchMedia=()=>({matches:true,addEventListener:noop});
  w.HTMLCanvasElement.prototype.getContext=()=>null;
  w.HTMLElement.prototype.scrollIntoView=noop;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  if(storage)for(const [key,value] of Object.entries(storage))w.sessionStorage.setItem(key,JSON.stringify(value));
  function view(patch={}){
    return {host:'host-key',isHost:true,seats:['host-key'],seat:0,setup:{count:4,mode:'easy',counts:[4,4,4,4],animals:[11,9,5,8],offset:11},game:null,status:'',connected:true,
      directory:true,room_no:1842,title:'친구와 윷놀이',names:{'host-key':'민준'},players:[{key:'host-key',name:'민준',seat:0,is_host:true}],...patch};
  }
  async function open(update,patch={}){
    state.onUpdate=update;state.room=view(patch);update(state.room);
    return {view:()=>state.room,async start(){
      calls.start++;if(state.startGate)await state.startGate.promise;
      if(state.startError)throw state.startError;
      state.room={...state.room,game:rules.newGame(state.room.setup.count)};update(state.room);
    },opening:noop,computerAction:noop,action:noop,async close(){calls.close++;}};
  }
  const directory={
    get userId(){return state.actor;},
    async enter(){calls.enter++;if(enterGate)await enterGate.promise;return state.actor;},
    async list(){calls.list++;return {ok:true,rooms:state.cards,mine:state.cards.find(card=>card.is_member)||null};},
    async create(params,setup,update){calls.create.push({params,setup});if(createGate)await createGate.promise;return open(update,{title:params.title,setup:{...setup,count:params.capacity}});},
    async join(roomNo,update){calls.join.push(roomNo);if(joinGate)await joinGate.promise;return open(update,{room_no:Number(roomNo),isHost:false,seat:1,seats:['host-key','guest-key'],names:{'host-key':'민준','guest-key':'다온'},players:[{key:'host-key',name:'민준',seat:0,is_host:true},{key:'guest-key',name:'다온',seat:1,is_host:false}]});},
    async cancel(card){calls.cancel.push(card);},close:noop
  };
  const client={auth:{async getSession(){return {data:{session:state.actor?{user:{id:state.actor}}:null}};}}};
  w.OjjudaGetClient=async()=>client;
  const modules={
    './results.mjs':results,
    './rules.mjs':rules,
    './board.mjs':{createBoard:()=>board,PAWN_HOP_MS:0},
    './toss.mjs':{createToss:()=>({cancel:noop,shuffle:noop,play:async()=>{}}),drawRack:noop,drawFirstSeatStick:noop},
    './sound.mjs':{createTableSounds:()=>({enabled:true,unlock:noop,stop:noop,land:noop,applaud:noop,quickThrow:noop,spinFirstSeat:noop,throwSticks:noop,setEnabled:noop})},
    './room.mjs':{roomCode:value=>/^B[A-Za-z0-9_-]{86}$/.test(value)?value:null,openRoom:async()=>{calls.legacy++;throw Error('unexpected legacy invite');}},
    './lobby.mjs':{createYutLobby:(_client,options={})=>{
      state.onAuthChange=options.onAuthChange;calls.directoryCreated++;let closed=false;
      return Object.assign(Object.create(directory),{
        enter(){if(closed)throw Error('closed');return directory.enter();},
        list(){if(closed)throw Error('closed');return directory.list();},
        close(){if(!closed){closed=true;calls.directoryClosed++;}}
      });
    }},
    './zodiac.mjs':{ANIMALS,animalFor,drawZodiac:noop}
  };
  w.__yutModules=modules;
  w.eval(source('../features/arcade/arcade-rooms.js'));
  const play=source('../games/yut/play.mjs').replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?$/gm,(_line,names,path)=>`const {${names}}=window.__yutModules[${JSON.stringify(path.split('?')[0])}];`);
  w.eval(play);
  t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});
  const button=(text,scope=doc)=>[...scope.querySelectorAll('button')].find(el=>el.textContent.trim()===text&&!el.closest('[hidden]'));
  const settle=async()=>{for(let i=0;i<8;i++)await tick();};
  const online=async()=>{const tab=button('온라인 대전');assert.ok(tab,'online entry tab');tab.click();await settle();};
  return {w,doc,calls,state,directory,button,settle,online,emit(patch){state.room={...state.room,...patch};state.onUpdate(state.room);},async auth(next){state.actor=next;state.onAuthChange?.(next);await settle();}};
}

async function createRoom(f,title='저녁에 한 판',capacity=6){
  await f.online();f.doc.querySelector('[data-arcade-action="create"]').click();await f.settle();
  const form=f.doc.getElementById('arcade-room-form');assert.ok(form);
  form.elements.title.value=title;form.elements.capacity.value=String(capacity);
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await f.settle();
}

test('online guests see the shared room entry and login without creating a room',async t=>{
  const f=fixture(t,{actor:null});await f.online();
  const create=f.doc.querySelector('[data-arcade-action="create"]');
  assert.ok(create,'the standard public-room control is present');assert.equal(create.disabled,true);
  assert.match(f.doc.getElementById('entry-controls').textContent,/로그인/);
  assert.ok([...f.doc.querySelectorAll('a')].some(link=>!link.closest('[hidden]')&&/로그인/.test(link.textContent)));
  assert.equal(f.calls.create.length,0);assert.equal(f.calls.join.length,0);assert.equal(f.calls.legacy,0);
});

test('a member picks a public room and the named waiting room stays open',async t=>{
  const f=fixture(t,{cards:[publicCard()]});await f.online();
  const card=f.doc.querySelector('.arcade-room-card');assert.ok(card);
  assert.match(card.textContent,/#1842/);assert.match(card.textContent,/민준/);assert.match(card.textContent,/1\/4명/);
  card.querySelector('[data-arcade-action="join"]').click();await f.settle();
  assert.deepEqual(f.calls.join,[1842]);assert.equal(f.calls.legacy,0);
  assert.equal(f.doc.getElementById('online-lobby').hidden,false);
  assert.match(f.doc.getElementById('online-lobby-body').textContent,/민준/);assert.match(f.doc.getElementById('online-lobby-body').textContent,/다온/);
  assert.equal(f.w.location.hash,'');assert.equal(new URL(f.w.location.href).searchParams.get('room'),'1842');
  assert.equal(f.button('게임 시작'),undefined,'a guest cannot start the host room');
  assert.deepEqual([...f.doc.querySelectorAll('#online-lobby .room-actions > button')].map(button=>button.textContent), ['방 나가기']);
});

test('creating a room uses the common title and capacity form and preserves the new lobby',async t=>{
  const f=fixture(t);await createRoom(f);
  assert.equal(f.calls.create.length,1);assert.equal(f.calls.create[0].params.title,'저녁에 한 판');assert.equal(f.calls.create[0].params.capacity,6);
  assert.equal(f.doc.getElementById('online-lobby').hidden,false,'the completed create callback must preserve its replacement lobby');
  assert.match(f.doc.getElementById('online-lobby').textContent,/저녁에 한 판/);
  assert.match(f.doc.getElementById('online-lobby-body').textContent,/6/);
  assert.equal(f.doc.getElementById('arcade-room-form'),null);assert.equal(f.calls.legacy,0);
  assert.deepEqual([...f.doc.querySelectorAll('#online-lobby .room-actions > button')].map(button=>button.textContent), ['방 나가기','게임 시작']);
});

test('a delayed online entry does not replace a computer game selection',async t=>{
  const gate=deferred(),f=fixture(t,{enterGate:gate});
  f.button('온라인 대전').click();await tick();
  f.button('컴퓨터 대전').click();gate.resolve();await f.settle();
  assert.equal(f.doc.querySelector('#entry-controls [aria-pressed="true"]').textContent,'컴퓨터 대전');
  assert.equal(f.calls.list,0,'an abandoned entrance must not start lobby polling');
  assert.ok(f.button('게임 시작하기'));assert.equal(f.calls.create.length,0);assert.equal(f.calls.join.length,0);
});

test('a numeric invite opens the public room without exposing the legacy signing code',async t=>{
  const f=fixture(t,{url:'https://example.test/games/yut/?room=1842'});await f.settle();
  assert.deepEqual(f.calls.join,[1842]);assert.equal(f.calls.legacy,0);
  assert.equal(f.doc.getElementById('online-lobby').hidden,false);assert.match(f.doc.getElementById('online-lobby').textContent,/1842/);
});

test('starting a public room waits for the server and ignores repeated clicks',async t=>{
  const f=fixture(t);await createRoom(f);f.state.startGate=deferred();
  f.button('게임 시작').click();await f.settle();
  assert.equal(f.calls.start,1);assert.equal(f.doc.getElementById('tabletop').hidden,true);
  const pending=f.button('시작하는 중…');assert.ok(pending);assert.equal(pending.disabled,true);
  pending.click();await f.settle();assert.equal(f.calls.start,1);
  f.state.startGate.resolve();await f.settle();
  assert.equal(f.doc.getElementById('setup').hidden,true);assert.equal(f.doc.getElementById('tabletop').hidden,false);
  assert.equal(f.doc.body.dataset.mpEntry,'false');
});

test('a failed start remains readable and the host can retry',async t=>{
  const f=fixture(t);await createRoom(f);f.state.startError=Error('연결이 늦어졌어요. 다시 시작해 주세요.');
  f.button('게임 시작').click();await f.settle();
  assert.equal(f.doc.getElementById('online-lobby').hidden,false);
  assert.match(f.doc.getElementById('online-lobby-body').textContent,/연결이 늦어졌어요/);
  assert.equal(f.button('게임 시작').disabled,false);
  f.state.startError=null;f.button('게임 시작').click();await f.settle();
  assert.equal(f.calls.start,2);assert.equal(f.doc.getElementById('tabletop').hidden,false);
});

test('leaving a public room restores the online list and ignores late room updates',async t=>{
  const f=fixture(t,{cards:[publicCard()]});await f.online();
  f.doc.querySelector('[data-arcade-action="join"]').click();await f.settle();
  const staleUpdate=f.state.onUpdate,staleRoom=f.state.room;
  f.button('방 나가기').click();await f.settle();
  assert.equal(f.calls.close,1);assert.equal(f.doc.getElementById('online-lobby').hidden,true);
  assert.equal(f.doc.getElementById('setup').hidden,false);assert.equal(f.doc.getElementById('tabletop').hidden,true);
  assert.equal(f.doc.querySelector('#entry-controls [aria-pressed="true"]').textContent,'온라인 대전');
  assert.equal(new URL(f.w.location.href).searchParams.has('room'),false);assert.equal(f.w.location.hash,'');
  assert.ok(f.doc.querySelector('.arcade-room-card'));
  staleUpdate({...staleRoom,game:rules.newGame(4)});await f.settle();
  assert.equal(f.doc.getElementById('online-lobby').hidden,true);assert.equal(f.doc.getElementById('tabletop').hidden,true);
});

test('signing out clears the named waiting room and disables new public entries',async t=>{
  const f=fixture(t,{cards:[publicCard()]});await f.online();
  f.doc.querySelector('[data-arcade-action="join"]').click();await f.settle();
  await f.auth(null);
  assert.equal(f.calls.close,1);assert.equal(f.doc.getElementById('online-lobby').hidden,true);
  assert.equal(f.doc.getElementById('login-link').hidden,false);
  assert.equal(f.doc.querySelector('[data-arcade-action="create"]').disabled,true);
  assert.equal(f.doc.querySelector('.arcade-room-card'),null);
});

test('a handoff from the arcade creates only the current member’s recent requested room',async t=>{
  const request={owner:'member-a',title:'오락실에서 만든 방',capacity:3,request_id:'same-request',createdAt:Date.now()};
  const f=fixture(t,{url:'https://example.test/games/yut/?mode=online&create=1',storage:{'ojjuda-yut-create':request}});await f.settle();
  assert.equal(f.calls.create.length,1);assert.equal(f.calls.create[0].params.title,request.title);assert.equal(f.calls.create[0].params.request_id,request.request_id);
  assert.equal(f.doc.getElementById('online-lobby').hidden,false);
  assert.equal(f.w.sessionStorage.getItem('ojjuda-yut-create'),null);
  assert.equal(new URL(f.w.location.href).searchParams.has('create'),false);
});

for(const request of [{owner:'other-member',createdAt:Date.now()},{owner:'member-a',createdAt:Date.now()-360000}])test(`a stale arcade create handoff is ignored (${request.owner})`,async t=>{
  const f=fixture(t,{url:'https://example.test/games/yut/?mode=online&create=1',storage:{'ojjuda-yut-create':{title:'지난 요청',capacity:3,request_id:'old-request',...request}}});await f.settle();
  assert.equal(f.calls.create.length,0);assert.equal(f.doc.getElementById('online-lobby').hidden,true);
  assert.ok(f.doc.querySelector('[data-arcade-action="create"]'));
});

test('a BFCache return creates a fresh directory and restores the public room list',async t=>{
  const f=fixture(t,{cards:[publicCard()]});await f.online();
  f.doc.querySelector('[data-arcade-action="join"]').click();await f.settle();
  assert.equal(f.doc.getElementById('online-lobby').hidden,false);assert.equal(f.calls.directoryCreated,1);
  const staleUpdate=f.state.onUpdate,staleRoom=f.state.room,previousLists=f.calls.list;
  const transition=type=>{const event=new f.w.Event(type);Object.defineProperty(event,'persisted',{value:true});f.w.dispatchEvent(event);};
  transition('pagehide');await f.settle();
  assert.equal(f.calls.close,1);assert.equal(f.calls.directoryClosed,1);
  f.state.cards=[];transition('pageshow');await f.settle();
  assert.equal(f.calls.directoryCreated,2,'the closed directory must not be reused after browser Back');
  assert.ok(f.calls.list>previousLists,'the restored screen reads the current public rooms');
  assert.equal(f.doc.getElementById('online-lobby').hidden,true);assert.equal(f.doc.getElementById('setup').hidden,false);
  assert.equal(f.doc.querySelector('#entry-controls [aria-pressed="true"]').textContent,'온라인 대전');
  assert.equal(f.doc.querySelector('[data-arcade-action="create"]').disabled,false);
  assert.equal(f.doc.querySelector('.arcade-room-card'),null);assert.equal(new URL(f.w.location.href).searchParams.has('room'),false);
  staleUpdate({...staleRoom,game:rules.newGame(4)});await f.settle();
  assert.equal(f.doc.getElementById('tabletop').hidden,true);assert.equal(f.doc.getElementById('online-lobby').hidden,true);
});
