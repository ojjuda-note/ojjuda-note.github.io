// Run the real room RPCs and embedded-game bridges together, without a browser server.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{JSDOM}=require('jsdom');
const {fixture,A,B,C,MINOR}=require('./arcade-rooms-fixture.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const wait=async check=>{for(let i=0;i<300;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw Error('condition timed out');};
(async()=>{
 const f=await fixture(),db=f.db,windows=[],channels=new Set();
 const auth=(actor,sql,params=[])=>db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor||'']);await tx.exec('set local role authenticated');
  return (await tx.query(sql,params)).rows[0]?.value;
 });
 try{
  const migrations=fs.readdirSync(path.join(root,'supabase/migrations'));
  for(const suffix of ['_tank_online_rooms.sql','_tank_solo_mode.sql','_tank_healing_shell.sql','_marble_online_rooms.sql','_arcade_complete_game_catalog.sql'])await db.exec(read('supabase/migrations/'+migrations.find(n=>n.endsWith(suffix))));
  await db.exec(`alter table public.user_private add column if not exists coins integer default 100;
   create table public.friendships(a uuid,b uuid);
   create function public.is_friend(a uuid,b uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.friendships f where(f.a=$1 and f.b=$2)or(f.b=$1 and f.a=$2))$$;`);
  await db.query('insert into public.friendships values($1,$2),($1,$3),($2,$3)',[A,B,C]);
  for(const suffix of ['_arcade_friend_invites.sql','_arcade_invite_popup.sql','_marble_friend_invites.sql','_tank_friend_invites.sql'])await db.exec(read('supabase/migrations/'+migrations.find(n=>n.endsWith(suffix))));
  const handlers={};
  for(const kind of ['tank','marble']){
   const {createHandler}=await import(path.join(root,'supabase/functions',kind,'handler.mjs'));
   handlers[kind]=createHandler({env:n=>({SUPABASE_URL:'https://backend.test',SUPABASE_SERVICE_ROLE_KEY:'fixture',SUPABASE_ANON_KEY:'fixture'})[n],seed:()=>123456,fetchImpl:async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:options.headers.authorization.slice(7),is_anonymous:false}));
    const v=JSON.parse(options.body);assert.ok(url.endsWith('/rpc/'+kind+'_online_service'));
    try{const data=await db.transaction(async tx=>{await tx.exec('set local role service_role');return (await tx.query(`select public.${kind}_online_service($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) as value`,[v.p_actor,v.p_action,v.p_room??null,v.p_code??null,v.p_request??null,v.p_expected??null,JSON.stringify(v.p_options??{}),v.p_next===undefined?null:JSON.stringify(v.p_next)])).rows[0].value;});return new Response(JSON.stringify(data));}
    catch(error){return new Response(JSON.stringify({message:error.message}),{status:400});}
   }});
  }
  const native=async(kind,actor,body)=>{const response=await handlers[kind](new Request('https://edge.test/'+kind,{method:'POST',headers:{authorization:'Bearer '+actor,'content-type':'application/json',origin:'https://ojjuda.kr'},body:JSON.stringify(body)}));return response.json();};
  const directory=actor=>auth(actor,'select public.arcade_extra_rooms() as value');
  const rpc=async(actor,name,args)=>{
   try{
    const data=name==='arcade_publish_marble'?await auth(actor,'select public.arcade_publish_marble($1) as value',[args.p_room]):name==='arcade_ttang_room'?await auth(actor,'select public.arcade_ttang_room($1,$2,$3,$4) as value',[args.p_action,args.p_room??null,args.p_title??null,args.p_request??null]):await auth(actor,'select public.arcade_friend_invite($1,$2,$3,$4,$5) as value',[args.p_action,args.p_to??null,args.p_kind??null,args.p_code??null,args.p_id??null]);
    return {data};
   }catch(error){return {error:{message:error.message}};}
  };
  const client=actor=>({rpc:(name,args)=>rpc(actor,name,args),functions:{invoke:async(kind,{body})=>({data:await native(kind,actor,body)})},
   channel(name){const ch={name,callback:null,on(_event,_filter,callback){ch.callback=callback;return ch;},subscribe(callback){channels.add(ch);queueMicrotask(()=>callback('SUBSCRIBED'));return ch;},send({payload}){for(const other of channels)if(other!==ch&&other.name===name)queueMicrotask(()=>{if(channels.has(other))other.callback({payload:structuredClone(payload)});});}};return ch;},removeChannel:ch=>channels.delete(ch)});
  function host(script,actor){
   const dom=new JSDOM('<body><button>오락실</button></body>',{url:'https://ojjuda.kr/world.html',runScripts:'outside-only'}),w=dom.window;windows.push(w);
   w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
   w.eval(read(script));return w;
  }
  function messenger(w,source,type){
   const child=w.document.querySelector('iframe').contentWindow,received=[];child.postMessage=data=>received.push(data);
   return async body=>{const requestId=randomUUID();w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:child,data:{source,type,requestId,body}}));await wait(()=>received.some(r=>r.replyTo===requestId));return received.find(r=>r.replyTo===requestId).result;};
  }
  // In-game Marble creation publishes the actual room, including retries after a lost publish response.
  const marble=host('world-tour-game.js',A),mc=client(A);let publishAttempts=0;
  const realRpc=mc.rpc;mc.rpc=async(name,args)=>name==='arcade_publish_marble'&&publishAttempts++===0?{error:{message:'offline'}}:realRpc(name,args);
  marble.OjjudaTourGame.open({owner:A,client:mc});const sendMarble=messenger(marble,'ojjuda-tour','ojjuda-marble-request');
  const createMarble={action:'create',request_id:randomUUID(),options:{capacity:3,title:'게임에서 만든 마블',maxRound:25}};
  assert.equal((await sendMarble(createMarble)).error,'unavailable');assert.equal((await directory(B)).rooms.some(r=>r.kind==='tour'),false);
  const mr=await sendMarble(createMarble);assert.equal(mr.ok,true);assert.ok((await directory(B)).rooms.some(r=>r.match_id===mr.room.id));
  assert.equal(Number((await db.query('select count(*) as n from ojjuda_marble_internal.rooms')).rows[0].n),1);
  assert.equal((await native('marble',B,{action:'join',code:mr.room.code})).ok,true);
  assert.equal((await sendMarble({action:'start',room_id:mr.room.id,version:1,request_id:randomUUID()})).ok,true);
  marble.OjjudaTourGame.close();
  // Tank's host picker, server invitation and acceptance all refer to the same real public room.
  const tank=host('world-tank-game.js',A);let picker;
  tank.OjjudaFriendInvites={available:()=>true,pick:async options=>{picker=options;return true;}};
  tank.OjjudaTankGame.open({owner:A,client:client(A)});const sendTank=messenger(tank,'ojjuda-tank','request');
  const created=await sendTank({action:'create',request_id:randomUUID(),options:{capacity:3,title:'게임에서 만든 탱크'}});assert.equal(created.ok,true);
  assert.ok((await directory(B)).rooms.some(r=>r.match_id===created.room.id));
  assert.equal((await sendTank({action:'invite',room_id:created.room.id})).ok,true);assert.equal(picker.kind,'tank');
  const prepared=await picker.prepare();assert.equal(prepared.code,created.room.code);
  const invite=(actor,args)=>rpc(actor,'arcade_friend_invite',args);
  const send=(actor,to,code=prepared.code)=>invite(actor,{p_action:'send',p_kind:'tank',p_to:to,p_code:code});
  assert.match((await send(B,C)).error.message,/room_unavailable/);assert.match((await send(A,MINOR)).error.message,/friend_required/);
  const sent=await send(A,B);assert.ok(sent.data?.id);assert.equal((await send(A,B)).data.id,sent.data.id);
  const accepted=await invite(B,{p_action:'accept',p_id:sent.data.id});assert.equal(accepted.data.kind,'tank');assert.equal(accepted.data.code,prepared.code);
  assert.equal((await native('tank',B,{action:'join',code:accepted.data.code})).ok,true);
  const forC=await send(A,C);assert.ok(forC.data?.id);
  await native('tank',MINOR,{action:'join',code:prepared.code});assert.match((await invite(C,{p_action:'accept',p_id:forC.data.id})).error.message,/room_full/);
  assert.equal((await sendTank({action:'invite',room_id:created.room.id})).error,'room_full');
  await native('tank',MINOR,{action:'leave',room_id:created.room.id});
  await db.query('insert into public.blocks values($1,$2)',[A,C]);assert.match((await invite(C,{p_action:'accept',p_id:forC.data.id})).error.message,/invite_expired/);await db.exec('delete from public.blocks');
  await db.query("update public.arcade_friend_invites set expires_at=now()-interval '1 second' where id=$1",[forC.data.id]);assert.match((await invite(C,{p_action:'accept',p_id:forC.data.id})).error.message,/invite_expired/);
  const beforeStart=await send(A,C),latest=await native('tank',A,{action:'read',room_id:created.room.id});
  assert.equal((await sendTank({action:'start',room_id:created.room.id,version:latest.room.version,request_id:randomUUID()})).ok,true);
  assert.match((await invite(C,{p_action:'accept',p_id:beforeStart.data.id})).error.message,/room_unavailable/);
  tank.OjjudaTankGame.close();assert.equal(picker.signal.aborted,true);
  const solo=await native('tank',C,{action:'create',request_id:randomUUID(),options:{mode:'solo',capacity:2,title:'혼자'}});
  assert.match((await send(C,B,solo.room.code)).error.message,/room_unavailable/);assert.ok(!(await directory(B)).rooms.some(r=>r.match_id===solo.room.id));
  // Two real territory game documents communicate over a deterministic realtime channel fixture.
  function territory(actor,entry={}){
   const w=host('ttang-bridge.js',actor);w.OjjudaTtangBridge.open({owner:actor,client:client(actor),...entry});
   const frame=w.document.querySelector('iframe'),game=new JSDOM(read('games/ttang.html'),{url:'https://ojjuda.kr/games/ttang.html',runScripts:'outside-only'}).window;windows.push(game);
   w.postMessage=data=>queueMicrotask(()=>{if(w.document)w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:game,data}));});Object.defineProperty(game,'parent',{value:w});Object.defineProperty(frame,'contentWindow',{value:game});
   game.requestAnimationFrame=()=>1;game.matchMedia=()=>({matches:false});
   game.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
   for(const script of game.document.querySelectorAll('script:not([src])'))game.eval(script.textContent+'\nwindow.territoryState=()=>({mode,role});');
   frame.dispatchEvent(new w.Event('load'));return {w,game,frame};
  }
  const h=territory(A);h.game.document.getElementById('publicRoomBtn').click();
  await wait(async()=> (await directory(B)).rooms.some(r=>r.kind==='ttang'));
  const card=(await directory(B)).rooms.find(r=>r.kind==='ttang');assert.equal(card.code,null);assert.equal(card.players,1);
  const admission=await rpc(B,'arcade_ttang_room',{p_action:'join',p_room:card.match_id});assert.ok(admission.data?.ok);
  const guest=territory(B,{arcadeRoom:card.match_id,joinCode:admission.data.room.code});
  await wait(()=>h.game.territoryState().mode==='net'&&guest.game.territoryState().mode==='net');
  assert.equal(h.game.territoryState().role,'host');assert.equal(guest.game.territoryState().role,'guest');assert.equal(h.game.document.getElementById('menu').style.display,'none');
  assert.equal((await directory(B)).rooms.find(r=>r.match_id===card.match_id).status,'playing');
  guest.w.OjjudaTtangBridge.close();await wait(async()=>!(await directory(A)).rooms.some(r=>r.match_id===card.match_id));h.w.OjjudaTtangBridge.close();
  const cancel=territory(C);cancel.game.document.getElementById('publicRoomBtn').click();
  await wait(async()=> (await directory(B)).rooms.some(r=>r.kind==='ttang'));
  cancel.game.document.getElementById('cancel').click();await wait(async()=>!(await directory(B)).rooms.some(r=>r.kind==='ttang'));cancel.w.OjjudaTtangBridge.close();
  assert.equal(channels.size,0,'leaving and cancelling release all realtime channels');
  console.log('PASS: real in-game Tank/Marble/Ttang creation, public directory visibility, idempotent publication retry, invitations/acceptance, room capacity, expiry/blocks, private solo, two territory players and cancellation cleanup');
 }finally{channels.clear();for(const w of windows)w.close();await db.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
