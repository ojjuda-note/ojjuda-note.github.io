const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{fixture}=require('./poker-online-fixture.cjs'),{screen,until,pause}=require('./poker-ui-fixture.cjs');
const root=path.join(__dirname,'..');
(async()=>{
 const f=await fixture(),worlds=[],frames=[];
 function world(actor,adult=true){
  const dom=new JSDOM('<div data-arcade-rooms></div><div id="modal-root"></div><div id="ranks"></div>',{url:'https://ojjuda.kr/world.html',runScripts:'outside-only',pretendToBeVisual:true});worlds.push(dom);
  const w=dom.window,opened=[],notices=[];w.ResizeObserver=class{observe(){}disconnect(){}};w.matchMedia=()=>({matches:true,addEventListener(){}});
  w.__actor=actor;w.__adult=adult;w.__open=(kind,options)=>opened.push({kind,options});w.__notice=s=>notices.push(s);
  w.__client={rpc:async(name,args)=>{
   if(name==='arcade_room_service')return {data:{ok:true,rooms:[],mine:null,can_matgo:adult}};
   if(name==='arcade_extra_rooms')return {data:await f.publicRpc(actor,name)};
   if(name==='community_game_monthly_leaders'){const result={};for(const game of args.p_games)result[game]=(await f.publicRpc(actor,'community_game_monthly_ranking',[game]))[0]||null;return {data:result};}
   throw Error(name);
  },functions:{invoke:async(name,{body})=>{assert.equal(name,'poker');const data=await f.call(actor,body);return {data,error:data.error?{context:{json:async()=>data}}:null};}}};
  w.eval(fs.readFileSync(path.join(root,'arcade-rooms.js'),'utf8'));
  const html=fs.readFileSync(path.join(root,'world.html'),'utf8'),part=html.slice(html.indexOf('var worldArcadeRooms=null'),html.indexOf('window.OjjudaArcadeRoomCreated='));
  w.eval(`const D={online:true,user:{id:window.__actor}},S=window.__client,g={tab:'place',place:{id:'arcade'}},M=window.__notice,Al=window.__open;function dt(){document.querySelector('#modal-root').innerHTML=''}function ct(html){document.querySelector('#modal-root').innerHTML=html}function xf(){};window.OjjudaMatgoAccess={visible:()=>window.__adult};`+part+';window.__rooms={sync:syncWorldArcadeRooms,get controller(){return worldArcadeRooms}};');
  w.__rooms.sync();
  const find=s=>w.document.querySelector(s),click=s=>{assert.ok(find(s),s);find(s).click();};
  return {w,find,click,opened,notices,refresh:()=>w.__rooms.controller.refresh()};
 }
 try{
  const a=world(f.users[0]),b=world(f.users[1]),minor=world(f.users[4],false);await pause();
  a.click('[data-arcade-action=create]');const form=a.find('#arcade-room-form');form.elements.kind.value='poker';form.elements.kind.dispatchEvent(new a.w.Event('change'));
  assert.deepEqual([...form.elements.capacity.options].map(x=>x.value),['2','3','4']);form.elements.title.value='포커 공개방';form.elements.capacity.value='4';form.dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>a.opened.length===1,'world creates poker room');assert.equal(a.opened[0].kind,'poker');const code=a.opened[0].options.joinCode;assert.match(code,/^[A-F0-9]{8}$/);
  await b.refresh();assert.match(b.find('.arcade-room-card').textContent,/세븐포커/);assert.match(b.find('.arcade-room-card').textContent,/1\/4명/);
  b.click('[data-arcade-action=join]');await until(()=>b.opened.length===1,'world room join route');assert.equal(b.opened[0].options.joinCode,code);
  const guest=await screen(f,f.users[1],{joinCode:code});frames.push(guest);await until(()=>guest.last?.room?.names.length===2,'room entry joins correct poker table');
  await a.refresh();assert.match(a.find('.arcade-room-card').textContent,/2\/4명/);
  await minor.refresh();assert.equal(minor.find('.arcade-room-card'),null);minor.click('[data-arcade-action=create]');assert.equal(minor.find('option[value=poker]'),null,'minors cannot select poker');
  for(const actor of [f.users[0],f.users[1]]){const r=(await f.call(actor,{action:'mine'})).room;await f.call(actor,{action:'leave',room_id:r.id,version:r.version,request_id:crypto.randomUUID()});}
  await b.refresh();assert.equal(b.find('.arcade-room-card'),null,'room disappears after the members leave');
  // Exercise the actual World cancellation handler, including its versioned leave request.
  await f.call(f.users[0],{action:'create',request_id:crypto.randomUUID(),options:{title:'취소할 포커방',capacity:2}});await a.refresh();a.click('[data-arcade-action=cancel]');await until(()=>a.notices.includes('대전방을 닫았어요.'),'world cancels poker room');await b.refresh();assert.equal(b.find('.arcade-room-card'),null);
  await f.db.query('update ojjuda_poker_internal.wallets set gold=12345,rounds=2,updated_at=now() where user_id=$1',[f.users[0]]);
  a.w.eval(fs.readFileSync(path.join(root,'world-game-rankings.js'),'utf8'));
  a.w.OjjudaGameRankings.mount(a.find('#ranks'),{client:a.w.__client,owner:f.users[0],games:{poker:{name:'세븐포커',unit:'G',rankingBasis:'current_gold'}},onOpenGame:id=>a.opened.push({kind:id}),authorized:()=>true});
  await until(()=>a.find('[data-game=poker] .board-leader-score')?.textContent==='12,345G','poker gold ranking');
  a.click('[data-game=poker] button');await until(()=>a.opened.at(-1).kind==='poker','ranking game opens');
  await f.db.query('update ojjuda_poker_internal.wallets set gold=13000 where user_id=$1',[f.users[0]]);await a.w.OjjudaGameRankings.refresh();assert.equal(a.find('[data-game=poker] .board-leader-score').textContent,'13,000G');
  console.log('PASS: actual World create/join/cancel routes, public poker card/count, joining from arcade, minor hiding, current-gold ranking render/refresh and game launch');
 }finally{frames.forEach(s=>s.close());for(const d of worlds){d.window.__rooms.controller.dispose();d.window.OjjudaGameRankings?.mount(null);d.window.close();}await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
