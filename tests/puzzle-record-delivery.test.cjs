const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const monthEnd='2026-11-30T15:59:59.000Z',monthStart='2026-11-30T16:00:00.000Z';

function browser(t,body=''){
 const dom=new JSDOM(body,{url:'https://fixture.test/game',runScripts:'outside-only'}),w=dom.window;
 t.after(()=>w.close());w.eval(read('shared/games/puzzle-record-queue.js'));
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 return w;
}
function send(w,source,data){w.dispatchEvent(new w.MessageEvent('message',{source,data,origin:w.location.origin}));}

test('both picture routes retry the original stage and month after offline close, keeping the guest and other members separate',async t=>{
 for(const game of ['spot','photo_ttang']){
  const w=browser(t),d=w.document,calls=[],confirmed=[];
  let online=false,account=user;
  const result=(stage,when,owner)=>{
   calls.push({stage,when,owner});
   if(!online)throw Error('offline');
   confirmed.push({stage,when,owner});return {ok:true,score:1,previous_period:when===monthEnd};
  };
  const spot=game==='spot';
  w.eval(read(spot?'games/spot-difference/world-spot-game.js':'games/photo-ttang/photo-ttang-ranking.js'));
  const open=owner=>{
   account=owner;
   if(spot){
    w.OjjudaSpotGame.open({owner,authorized:()=>account===owner,onClear:(stage,who,when)=>result(stage,when,who)});
    const frame=d.querySelector('iframe');
    return {notify:when=>send(w,frame.contentWindow,{type:'ojjuda:spot-clear',stage:182,owner,completedAt:when}),close:()=>d.querySelector('.arcade-return').click()};
   }
   d.body.innerHTML='<iframe></iframe><button></button>';
   const frame=d.querySelector('iframe'),status=d.querySelector('button');
   const close=w.OjjudaPhotoRanking.bind({owner,frame,status,authorized:()=>account===owner,client:{
    auth:{getUser:async()=>({data:{user:{id:account}}})},rpc:async(name,args)=>{
     assert.equal(name,'record_photo_ttang_clear_at');assert.equal(args.p_expected_owner,owner);
     return {data:result(args.p_stage_id,args.p_finished_at,owner)};
    }
   }});
   return {notify:when=>send(w,frame.contentWindow,{type:'ojjuda:photottang:clear',stage:'39',completedAt:when}),close};
  };
  const first=open(user);first.notify(monthEnd);await settle();first.notify(monthStart);await settle();first.close();
  const store=w.OjjudaPuzzleRecords.open(game,user);
  assert.equal(store.list().length,2);
  online=true;
  for(const wrong of (spot?[other,null]:[other])){const wrongWindow=open(wrong);await settle();wrongWindow.close();}
  assert.equal(confirmed.length,0);
  const back=open(user);await settle();w.dispatchEvent(new w.Event('online'));await settle();
  assert.deepEqual(confirmed.map(x=>x.when),[monthEnd,monthStart]);assert.equal(store.list().length,0);
  back.close();
 }
});

test('a guest ranking token change and another open game cannot claim outstanding completions',t=>{
 const w=browser(t);
 const first=w.OjjudaPuzzleRecords.open('mines','guest');
 first.put({id:'first',completedAt:monthEnd});const second=w.OjjudaPuzzleRecords.open('mines','guest');
 second.put({id:'second',completedAt:monthStart});first.remove('first');
 assert.deepEqual(Array.from(second.list(),r=>r.id),['second']);
 w.localStorage.setItem('ojjuda.guest-ranking.v1','ab'.repeat(32));
 assert.equal(first.current(),false);assert.equal(w.OjjudaPuzzleRecords.open('mines','guest').list().length,0);
});

test('the 101st Mahjong clear survives reopening alongside unacknowledged legacy records',t=>{
 function mount(storage={}){
  const w=browser(t,'<p id="server-note"></p><button id="retry-records"></button><button id="online-ranking"></button>');
  for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,value);
  const messages=[],parent={postMessage:data=>messages.push(data)};
  Object.defineProperty(w,'parent',{value:parent});
  const receive=data=>send(w,parent,{source:'ojjuda-sacheonseong-world',...data});
  w.eval(read('games/sacheonseong/ranking.js'));w.eval(read('games/sacheonseong/server.js'));
  receive({type:'init',owner:user});
  return {w,messages,receive};
 }
 const legacyId='33333333-3333-4333-8333-333333333333';
 const original=mount({'ojjuda-sacheonseong-pending-v1':JSON.stringify([{id:legacyId,owner:user,stage:1,duration:12000}])});
 let {w,messages,receive}=original;
 assert.equal(messages.find(m=>m.type==='record').id,legacyId);
 for(let i=1;i<=101;i++)w.OjjudaSacheonseongOnline.record(i,{duration:12000+i*20});
 const snapshot=Object.fromEntries(Object.entries(w.localStorage));w.close();
 ({w,messages,receive}=mount(snapshot));
 const store=w.OjjudaPuzzleRecords.open('sacheonseong',user);
 assert.equal(store.list().length,102);
 const first=store.list().find(r=>r.id===legacyId);assert.ok(Number.isFinite(Date.parse(first.completedAt)));
 receive({type:'record',id:legacyId,ok:false});
 w.dispatchEvent(new w.Event('online'));
 assert.equal(messages.filter(m=>m.type==='record').at(-1).completedAt,first.completedAt);
 for(let i=0;i<102;i++){const m=messages.filter(m=>m.type==='record').at(-1);receive({type:'record',id:m.id,ok:true});}
 assert.equal(store.list().length,0);
 assert.equal(new Set(messages.filter(m=>m.type==='record').map(r=>r.id)).size,102);
});
