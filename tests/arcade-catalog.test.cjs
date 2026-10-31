const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{JSDOM}=require('jsdom');
const {fixture,A,B,C}=require('./arcade-rooms-fixture.cjs');
const root=path.join(__dirname,'..');
(async()=>{
 const f=await fixture(),{db}=f;
 const rpc=(actor,sql,values=[])=>db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role authenticated');
  return (await tx.query(sql,values)).rows[0]?.value;
 });
 const rooms=actor=>rpc(actor,'select public.arcade_extra_rooms() as value');
 const ttang=(actor,action,id=null,title=null,request=null)=>rpc(actor,'select public.arcade_ttang_room($1,$2,$3,$4) as value',[action,id,title,request]);
 try{
  for(const file of ['20261018061119_tank_online_rooms.sql','20261018063442_tank_solo_mode.sql','20261018072709_tank_healing_shell.sql','20261012024936_marble_online_rooms.sql','20261018072717_arcade_complete_game_catalog.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  const tank=randomUUID(),solo=randomUUID(),marble=randomUUID();
  await db.query("insert into ojjuda_tank_internal.rooms(id,code,host_id,members,names,title,capacity,create_request,mode) values($1,'ABCD0001',$2,array[$2::uuid],array['봄고래'],'탱크방',12,$3,'online'),($4,'ABCD0002',$2,array[$2::uuid],array['봄고래'],'비공개 혼자',4,$5,'solo')",[tank,A,randomUUID(),solo,randomUUID()]);
  await db.query("insert into ojjuda_marble_internal.rooms(id,code,host_id,members,names,title,capacity,max_round,create_request) values($1,'ABCD0003',$2,array[$2::uuid],array['봄고래'],'마블방',8,25,$3)",[marble,A,randomUUID()]);
  assert.deepEqual((await rooms(B)).rooms.map(r=>r.kind),['tank'],'private Marble invitations stay private');
  await assert.rejects(()=>rpc(B,'select public.arcade_publish_marble($1) as value',[marble]),/not_room_owner/);
  await rpc(A,'select public.arcade_publish_marble($1) as value',[marble]);
  let listed=await rooms(B);assert.deepEqual(listed.rooms.map(r=>r.kind).sort(),['tank','tour']);
  assert.equal(listed.rooms.find(r=>r.kind==='tank').capacity,12);assert.equal(listed.rooms.find(r=>r.kind==='tour').capacity,8);
  assert.ok(!JSON.stringify(listed).includes(A));assert.ok(!JSON.stringify(listed).includes('state'));
  await db.query('insert into public.blocks values($1,$2)',[A,B]);assert.equal((await rooms(B)).rooms.length,0);await db.exec('delete from public.blocks');
  const request=randomUUID(),created=await ttang(A,'create',null,'땅따먹기 <친구>',request),id=created.room.id;
  assert.equal((await ttang(A,'create',null,'땅따먹기 <친구>',request)).room.id,id);
  assert.equal((await rooms(B)).rooms.length,2,'do not advertise until transport is ready');
  await ttang(A,'heartbeat',id);listed=await rooms(B);const card=listed.rooms.find(r=>r.kind==='ttang');
  assert.equal(card.players,1);assert.equal(card.capacity,2);assert.equal(card.code,null,'transport capability stays private until admission');
  const joined=await ttang(B,'join',id);assert.equal(joined.room.code,created.room.code);
  await assert.rejects(()=>ttang(C,'join',id),/room_full/);
  await assert.rejects(()=>ttang(C,'heartbeat',id),/not_room_owner/);
  await assert.rejects(()=>ttang(C,'leave',id),/not_room_owner/);
  assert.equal((await rooms(B)).rooms.find(r=>r.kind==='ttang').is_member,true);
  await ttang(B,'leave',id);assert.equal((await rooms(A)).rooms.some(r=>r.kind==='ttang'),false);
  const expired=await ttang(C,'create',null,'종료',randomUUID());await ttang(C,'heartbeat',expired.room.id);
  await db.query("update ojjuda_arcade_internal.ttang_rooms set expires_at=clock_timestamp()-interval '1 second' where id=$1",[expired.room.id]);
  assert.equal((await rooms(A)).rooms.some(r=>r.kind==='ttang'),false);
  await assert.rejects(()=>rooms(null),/not_signed_in/);
  for(const table of ['ojjuda_arcade_internal.ttang_rooms','ojjuda_tank_internal.wins'])await assert.rejects(()=>rpc(B,'select * from '+table),/permission denied/);
  await db.query('insert into ojjuda_tank_internal.wins(room_id,user_id) values($1,$2),($3,$2),($4,$5)',[randomUUID(),A,randomUUID(),randomUUID(),B]);
  const rankings=await rpc(B,"select public.community_game_monthly_ranking('tank') as value");assert.equal(rankings[0].score,2);assert.equal(rankings[0].nick,'봄고래');
  await db.query('insert into public.blocks values($1,$2)',[B,A]);assert.equal((await rpc(B,"select public.community_game_monthly_ranking('tank') as value")).length,1);
  console.log('PASS: full native room directory, actual schemas, privacy, solo exclusion, ttang admission/capacity/expiry, and authoritative monthly win rankings');
 }finally{await db.close();}
 const dom=new JSDOM('<div data-arcade-rooms></div><div data-arcade-room-feed></div><div id="modal"></div>',{url:'https://ojjuda.kr',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const opened=[],created=[],cancelled=[];
 w.eval(fs.readFileSync(path.join(root,'arcade-rooms.js'),'utf8'));
 const cards=['tank','tour','ttang'].map((kind,i)=>({kind,native:true,room_no:kind+'-ABCD',match_id:randomUUID(),code:'ABCD0001',title:'같이 <script>',host_name:'친구',status:'waiting',players:1,capacity:kind==='tank'?12:kind==='tour'?8:2,is_host:false,is_member:false}));
 const controller=w.OjjudaArcadeRooms.create({client:{rpc:async()=>({data:{ok:true,rooms:[],mine:null,can_matgo:true}})},getUserId:()=>A,matgoAllowed:()=>true,extraRooms:async()=>cards,
  notify:()=>{},canOpen:()=>false,goArcade:()=>{},renderModal:html=>w.document.getElementById('modal').innerHTML=html,closeModal:()=>w.document.getElementById('modal').replaceChildren(),
  onOpen:async room=>opened.push(room.kind),onCreateNative:async(kind,params)=>created.push({kind,...params}),onCancelNative:async room=>cancelled.push(room.kind)});
 try{
  controller.sync();await new Promise(r=>setTimeout(r,0));await controller.refresh();
  const choices=[...w.document.querySelector('[data-room-filter]').options].map(o=>o.value);
  for(const game of ['tank','tour','ttang','janggi','chess','carom4','carom3','pool8','matgo'])assert.ok(choices.includes(game));
  assert.equal(w.document.querySelectorAll('.arcade-room-card').length,3);assert.equal(w.document.querySelectorAll('script').length,0);
  for(const b of w.document.querySelectorAll('[data-arcade-action="join"]'))b.click();assert.deepEqual(opened,['tank','tour','ttang']);
  controller.openCreate('tank');let form=w.document.getElementById('arcade-room-form');assert.equal(form.elements.capacity.options.length,11);form.elements.capacity.value='12';
  await form.onsubmit({preventDefault(){}});assert.equal(created[0].kind,'tank');assert.equal(created[0].capacity,12);
  controller.openCreate('tour');form=w.document.getElementById('arcade-room-form');assert.equal(form.elements.capacity.options.length,7);await form.onsubmit({preventDefault(){}});
  controller.openCreate('ttang');form=w.document.getElementById('arcade-room-form');assert.equal(form.elements.capacity.value,'2');await form.onsubmit({preventDefault(){}});
  assert.deepEqual(created.map(r=>r.kind),['tank','tour','ttang']);
  const world=fs.readFileSync(path.join(root,'world.html'),'utf8');
  const rankSource=world.slice(world.indexOf('function worldRankGames(){'),world.indexOf('function openWorldBoardGame'));
  const registrySource=world.slice(world.indexOf('var _r='),world.indexOf(',Z=360,he=540'))+';';
  w.eval(registrySource+rankSource);w.OjjudaMatgoAccess={visible:()=>true};const catalog=w.worldRankGames();
  for(const game of w.eval('Object.keys(_r)'))assert.ok(game==='screw'?catalog.screw_box&&catalog.screw_flat:catalog[game],game+' must be in board rankings');
  assert.equal(catalog.tank.unit,'연승');assert.ok(catalog.tour);
  w.eval(fs.readFileSync(path.join(root,'ttang-bridge.js'),'utf8'));
  const lifecycle=[],code='a'.repeat(24),roomId=randomUUID();
  w.OjjudaTtangBridge.open({owner:A,client:{rpc:async(_,body)=>{lifecycle.push(body.p_action);return {data:{ok:true}};}},hostCode:code,arcadeRoom:roomId});
  const frame=w.document.querySelector('#ttang-overlay iframe');let hosted=null;
  frame.contentWindow.OjjudaTtang={host:async value=>{hosted=value;return value;},menu:()=>{}};
  frame.dispatchEvent(new w.Event('load'));await new Promise(r=>setTimeout(r,0));
  assert.equal(hosted,code);assert.deepEqual(lifecycle,['heartbeat']);
  w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:frame.contentWindow,data:{type:'ojjuda:ttang:network-end'}}));
  await new Promise(r=>setTimeout(r,0));w.OjjudaTtangBridge.close();assert.deepEqual(lifecycle,['heartbeat','leave']);
  console.log('PASS: all multiplayer choices, native room buttons/create limits, escaped room titles, and complete board game catalog');
 }finally{controller.dispose();w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
