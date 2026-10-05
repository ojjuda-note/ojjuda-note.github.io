const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{fixture,A,B,C,MINOR}=require('./arcade-rooms-fixture.cjs');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
S=window.fixtureClient;Pa=async()=>{};P.loaded=true;P.friends=[];
D.online=true;D.user={id:window.fixtureActor};D.doorReady=true;D.boardReady=true;D.billiardsReady=true;D.janggiLayoutReady=true;
window.arcadeTest={actions:sr,render:H,auth:D,state:g,client:S,rooms:()=>worldArcadeRooms,chat:text=>{g.place.log.push({sys:true,text});eo();},redraw:Bf,
 switchActor:id=>{D.user={id};window.fixtureActor=id;worldArcadeRooms.sync()}};
g.tab='friends';H();
`+world.slice(world.indexOf('</script>',boot));
world=world.replace('</head>','<script src="/arcade-rooms.js"></script><script src="/matgo-access.js"></script><script src="/matgo-bridge.js"></script></head>');
(async()=>{
 const f=await fixture();const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const errors=[];
 async function screen(actor,width=390){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.exposeBinding('roomFixture',async(_,type,actor,params)=>{
    if(type==='arcade')return f.roomRpc(actor,params);
    if(type==='matgo')return {data:await f.call(actor,params)};
    if(type==='from'){
      let rows=params.table==='board_games'?(await f.db.query('select * from public.board_games')).rows:[];
      for(const [field,value] of params.eq)rows=rows.filter(r=>r[field]===value);
      for(const [field,values] of params.in)rows=rows.filter(r=>values.includes(r[field]));
      if(params.table==='board_games')rows=rows.filter(r=>r.p1===actor||r.p2===actor);
      return {data:params.single?rows[0]||null:rows,error:null};
    }
  });
  await context.addInitScript(({actor,minor})=>{
    window.fixtureActor=actor;
    window.OJJUDA_CONFIG={supabaseUrl:'https://mock.invalid',supabaseKey:'public'};
    const channel={on(){return this},subscribe(){return this},unsubscribe(){}};
    const client={auth:{getUser:async()=>({data:{user:{id:fixtureActor}}}),getSession:async()=>({data:{session:{access_token:fixtureActor}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      rpc:(name,params)=>name==='arcade_room_service'?roomFixture('arcade',fixtureActor,params):Promise.resolve({data:{age:minor?11:36,locked:true}}),
      functions:{invoke:(_,{body})=>roomFixture('matgo',fixtureActor,body)},channel:()=>channel,removeChannel(){},
      from(table){const p={table,eq:[],in:[],single:false};const q={select(){return q},eq(k,v){p.eq.push([k,v]);return q},in(k,v){p.in.push([k,v]);return q},order(){return q},limit(){return q},or(){return q},maybeSingle(){p.single=true;return q},then(resolve,reject){return roomFixture('from',fixtureActor,p).then(resolve,reject)}};return q;}};
    window.fixtureClient=client;window.supabase={createClient:()=>client};
  },{actor,minor:actor===MINOR});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='https://mock.invalid'&&url.pathname==='/functions/v1/matgo')return route.fulfill({contentType:'application/json',body:JSON.stringify(await f.call(actor,route.request().postDataJSON()))});
    if(url.origin!=='https://fixture.test')return route.fulfill({body:''});
    if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
    if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:''});
    const file=path.join(root,decodeURIComponent(url.pathname));
    return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file,contentType:/\.(js|mjs)$/.test(file)?'text/javascript':url.pathname.endsWith('.css')?'text/css':undefined}):route.fulfill({status:404,body:''});
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);
  await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.arcadeTest);
  await page.evaluate(async()=>{OjjudaMatgoAccess.configure(arcadeTest.client);await OjjudaMatgoAccess.check().catch(()=>{});arcadeTest.actions['enter-place']({id:'arcade'});await arcadeTest.rooms().refresh();});
  return {page,context};
 }
 const refresh=page=>page.evaluate(()=>arcadeTest.rooms().refresh());
 try{
  // Exercise every game menu and the actual board engines using two authenticated browser contexts.
  for(const kind of ['chess','janggi','carom4','carom3','pool8','matgo']){
    const a=await screen(A),b=await screen(B);
    const title=kind+' 초보 <b> & 친구들';
    await a.page.locator('#pmsg').fill('보내기 전 채팅');
    if(kind==='matgo'){
      await a.page.locator('[data-act=matgo-open]').click();
      const frame=a.page.frameLocator('#matgo-overlay iframe');
      await frame.locator('#create').click();await frame.locator('#public-room-title').fill(title);
      await frame.locator('#public-room-form button[type=submit]').click();
      await a.page.locator('#matgo-overlay').waitFor({state:'detached'});
    }else{
      await a.page.evaluate(kind=>arcadeTest.actions[/^(carom|pool)/.test(kind)?'bl-open':'bd-open']({v:kind}),kind);
      await a.page.locator('[data-arcade-action=create][data-kind="'+kind+'"]').click();
      await a.page.locator('#arcade-room-form select[name=kind]').selectOption(kind);
      await a.page.locator('#arcade-room-form input[name=title]').fill(title);
      if(kind==='janggi')await a.page.locator('#arcade-room-form select[name=layout]').selectOption('heeh');
      await a.page.locator('#arcade-room-form button[type=submit]').click();
    }
    await a.page.locator('#plog .arcade-room-card.mine').waitFor();
    await b.page.locator('#plog .arcade-room-card').waitFor();
    assert.equal(await a.page.locator('[data-arcade-rooms] .arcade-room-card').count(),0,'room is inside the chat, not a separate list');
    await a.page.evaluate(()=>arcadeTest.chat('일반 채팅을 새로 받아요'));
    assert.equal(await a.page.locator('#plog .arcade-room-card').count(),1,'normal chat refresh preserves the room post');
    assert.equal(await a.page.locator('#pmsg').inputValue(),'보내기 전 채팅','room publishing preserves chat input');
    assert.equal(await b.page.locator('.arcade-room-copy h4').textContent(),title,'untrusted title is rendered as text');
    const room=(await f.arcade(A,'list')).mine;
    if(kind==='matgo'){
      // Returning to chat must keep the waiting match, including after resuming it.
      await a.page.locator('[data-act=matgo-open]').click();
      await a.page.frameLocator('#matgo-overlay iframe').locator('#wait-in-chat').click();
      await a.page.locator('#matgo-overlay').waitFor({state:'detached'});
      assert.equal((await f.db.query('select status from ojjuda_matgo_internal.rooms where id=$1',[room.match_id])).rows[0].status,'waiting');
    }
    await b.page.locator('[data-room-search]').fill(String(room.room_no));await refresh(b.page);
    assert.equal(await b.page.locator('[data-room-search]').inputValue(),String(room.room_no));
    if(kind==='chess'){
      for(const width of [320,390,1280]){await b.page.setViewportSize({width,height:844});assert.equal(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
      await b.page.setViewportSize({width:390,height:844});await b.page.screenshot({path:'/tmp/arcade-rooms-mobile.png',fullPage:true});
      await a.page.evaluate(()=>arcadeTest.actions.tab({tab:'friends'}));
    }
    await b.page.locator('[data-arcade-action=join][data-room="'+room.room_no+'"]').click();
    if(kind==='janggi'){await b.page.locator('#arcade-join-form select[name=layout]').selectOption('ehhe');await b.page.locator('#arcade-join-form button[type=submit]').click();}
    const target=kind==='matgo'?'#matgo-overlay':['chess','janggi'].includes(kind)?'#bd-root':'#gov';
    try{await b.page.locator(target).waitFor();await refresh(a.page);await a.page.locator(target).waitFor();}
    catch(error){console.error({kind,errors,guest:await b.page.locator('#toast').textContent(),host:await a.page.locator('#toast').textContent(),mine:(await f.arcade(B,'list')).mine,guestDialogs:await b.page.locator('[role=dialog]').allTextContents()});throw error;}
    assert.equal(await a.page.locator(target).count(),1);await refresh(a.page);assert.equal(await a.page.locator(target).count(),1,'refresh does not duplicate the game');
    const joined=(await f.arcade(B,'list')).mine;assert.equal(joined.match_id,(await f.arcade(A,'list')).mine.match_id);
    if(kind==='matgo'){
      const af=a.page.frameLocator('#matgo-overlay iframe'),bf=b.page.frameLocator('#matgo-overlay iframe');
      await af.locator('#hand').waitFor();await bf.locator('#hand').waitFor();
      assert.equal(await af.locator('#room-label').textContent(),`방 #${room.room_no} · ${title}`);
      assert.equal(await af.locator('.op-hand svg[aria-label="화투 뒷면"]').count(),10);
      await f.call(A,{action:'online_leave',room_id:joined.match_id});await f.call(B,{action:'online_leave',room_id:joined.match_id});
    }else{
      assert.match(await a.page.locator(target+' .arcade-match-caption').textContent(),new RegExp(String(room.room_no)));
      if(kind==='janggi')assert.deepEqual((await f.db.query('select janggi_layout from public.board_games where id=$1',[joined.match_id])).rows[0].janggi_layout,{c:'heeh',h:'ehhe'});
      await f.db.query("update public.board_games set status='done' where id=$1",[joined.match_id]);
    }
    await a.context.close();await b.context.close();await f.db.exec("update ojjuda_arcade_internal.rooms set created_at=created_at-interval '2 minutes'");
  }
  const a=await screen(A),b=await screen(B),minor=await screen(MINOR);
  await minor.page.locator('[data-arcade-action=create]').click();assert.equal(await minor.page.locator('#arcade-room-form option[value=matgo]').count(),0);await minor.context.close();
  await a.page.locator('[data-arcade-action=create]').click();await a.page.locator('#arcade-room-form select[name=kind]').selectOption('chess');await a.page.locator('#arcade-room-form input[name=title]').fill('취소할 방');await a.page.locator('#arcade-room-form button[type=submit]').click();await a.page.locator('.arcade-room-card.mine').waitFor();
  await refresh(b.page);await a.page.locator('[data-arcade-action=cancel]').click();await a.page.locator('.arcade-room-card').waitFor({state:'detached'});await refresh(b.page);assert.equal(await b.page.locator('.arcade-room-card').count(),0);
  await a.page.evaluate(()=>arcadeTest.switchActor(null));assert.equal(await a.page.locator('[data-arcade-action=create]').isDisabled(),true);assert.equal(await a.page.locator('.arcade-room-card').count(),0);
  await a.context.close();await b.context.close();assert.deepEqual(errors,[]);
  console.log('PASS: all 6 game rooms appear inside chat automatically, messages preserve posts, Matgo creation/return keeps waiting room, two browsers launch the same game, responsive widths, drafts, filters, cancellation, age and logout.');
 }finally{await browser.close();await f.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
