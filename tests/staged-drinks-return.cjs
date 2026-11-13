'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const origin='https://ojjuda.kr';
const kinds=['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown'];
const otherKinds=['bang','tank','tour','ttang','janggi','chess','carom4'];
const names=['다은','하늘'];
function stubRoom(kind,code,member=false){
  return {kind,code,room_no:kind+'-'+code,native:true,match_id:code,title:kind+' 테스트 방',host_name:'다은',
    capacity:4,players:member?4:2,status:member?'playing':'waiting',is_host:member,is_member:member};
}
const genericRoom={room_no:701,kind:'chess',status:'waiting',title:'친구와 체스',host_name:'별이',players:1,capacity:2,is_host:false,is_member:false};
function mockClient(){
  const calls=[],issues=[];
  let revision=0,round=0,kind=null,child=null,phase='lobby',created=false;
  let guessPhase='guess',guessRevision=1;
  const parent='B518DA',members=[];
  function snapshot(actor){
    return {code:parent,title:'우리 술게임방',capacity:3,players:members.map(id=>names[id==='host'?0:1]),me:members.indexOf(actor),phase,kind,child,round,revision};
  }
  function rpc(actor,name,args){
    try{
      calls.push({actor,name,args});
      const action=args.p_action,opts=args.p_options||{};
      if(name==='arcade_room_service'){
        assert.equal(action,'list');
        return {data:{ok:true,rooms:[genericRoom,stubRoom('updown','B95321')],mine:stubRoom('imagevote','D31332',true),can_matgo:actor==='host'||actor==='guest'},error:null};
      }
      if(name==='drinking_room'){
        const ok=data=>({data,error:null}),reject=message=>({data:null,error:{message}});
        if(action==='mine')return ok({room:created&&members.includes(actor)?snapshot(actor):null});
        if(action==='list')return ok({rooms:created?[{code:parent,title:'우리 술게임방',capacity:3,players:members.length,host:names[0],phase,mine:members.includes(actor)}]:[]});
        if(action==='create'){
          assert.equal(created,false);assert.equal(actor,'host');assert.equal(opts.capacity,3);
          assert.equal(opts.title,'우리 술게임방');assert.equal(opts.password,'test1234');
          created=true;members.push(actor);revision++;return ok(snapshot(actor));
        }
        if(!created||args.p_code!==parent)return reject('room_unavailable');
        if(action==='join'){
          if(opts.password!=='test1234')return ok({error:'wrong_password'});
          assert.equal(actor,'guest');assert.ok(!members.includes(actor));
          members.push(actor);revision++;return ok(snapshot(actor));
        }
        if(!members.includes(actor))return reject('not_room_member');
        if(action==='state')return ok(snapshot(actor));
        assert.equal(actor,'host');assert.equal(opts.revision,revision);assert.match(opts.request_id,/^[\da-f-]{36}$/i);
        if(action==='select'){
          assert.equal(phase,'lobby');assert.ok(kinds.includes(opts.kind));kind=opts.kind;
        }else if(action==='start'){
          assert.equal(phase,'lobby');kind=opts.kind||kind;assert.ok(['updown','bomb'].includes(kind));
          assert.deepEqual(members,['host','guest']);round++;child=round===1?'C632BA':'C792BF';phase='playing';guessPhase='guess';guessRevision=1;
        }else if(action==='return'){assert.equal(phase,'playing');phase='lobby';child=null;}
        else assert.fail('Unexpected parent action '+action);
        revision++;return ok(snapshot(actor));
      }
      assert.equal(name,'party_live_multiplayer');assert.deepEqual(members,['host','guest']);
      if(args.p_code!==child||!child)return {data:null,error:{message:'room_unavailable'}};
      assert.equal(args.p_kind,kind);
      if(action==='updown_guess'){
        assert.equal(kind,'updown');assert.equal(actor,'host');assert.equal(opts.guess,50);
        guessPhase='done';guessRevision++;
      }else assert.equal(action,'state','Linked children use membership provisioned by parent');
      const game=kind==='bomb'?{phase:'setup',baseSeconds:20}:
        {phase:guessPhase,turn:guessPhase==='done'?1:0,current:0,low:1,high:100,
         ...(guessPhase==='done'?{answer:50,winner:0,hint:'hit',lastSeat:0,lastGuess:50}:{})};
      return {data:{kind,code:child,title:'우리 술게임방',players:names,capacity:2,revision:guessRevision,
        round:1,me:members.indexOf(actor),phase:game.phase,game,serverMs:Date.now()},error:null};
    }catch(err){issues.push(err.message);throw err;}
  }
  return {rpc,calls,issues,parent};
}
// Render the public world's actual multiplayer catalog template with isolated identity and room services.
function worldShell(){
  const source=fs.readFileSync('world.html','utf8');
  const begin=source.indexOf('function Df(){'),end=source.indexOf('function eo(){',begin);
  const ageStart=source.indexOf('function worldMatgoButton(){'),ageEnd=source.indexOf('function syncWorldArcadeAdultGames(){',ageStart);
  assert.ok(begin>0&&end>begin&&ageStart>0&&ageEnd>ageStart,'world arcade template and adult gate');
  const data=JSON.stringify([stubRoom('fingers','D31111',true),stubRoom('king','D21111'),
    {...stubRoom('tank','D17777'),room_no:703,title:'온라인 탱크'}]);
  return `<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><div id="world"></div><div id="modal-root"></div>
    <script src="/config.js"></script><script src="/games/matgo/matgo-access.js"></script><script src="/features/arcade/arcade-rooms.js"></script><script>
    const g={place:{id:'arcade'},bdInvites:0},Pt={arcade:{chat:true,arcade:true}},_r={},D={online:false,user:null};
    const worldPlacePresenceText=()=>'';
    ${source.slice(ageStart,ageEnd)}
    ${source.slice(begin,end)}
    (async()=>{
      const client=await window.OjjudaGetClient();
      const {data}=await client.auth.getSession();
      D.user=data.session?.user?.is_anonymous?null:data.session?.user||null;D.online=!!D.user;
      const access=window.OjjudaMatgoAccess;access.configure(client);
      const rebuild=()=>{document.getElementById('world').innerHTML=Df();};
      rebuild();
      const rooms=window.OjjudaArcadeRooms.create({
        client,getUserId:()=>D.user?.id||null,matgoAllowed:()=>access.visible(19),
        extraRooms:async()=>${data},canOpen:()=>false,
        renderModal:html=>document.getElementById('modal-root').innerHTML=html,
        closeModal:()=>document.getElementById('modal-root').replaceChildren(),goArcade(){},
        notify:msg=>{window.lastNotice=msg},onCreateNative:()=>{throw Error('Unexpected direct room creation')},
        onOpen:async()=>{},onCancelNative:async()=>{}
      });rooms.sync();
      window.qaSwitchWorld=async user=>{
        window.qaChangeAuth(user);D.user=user;D.online=!!user;
        // Account changes invalidate the helper synchronously before the controller resync.
        rebuild();rooms.sync();try{await access.check();}catch(_){}rebuild();rooms.sync();
      };
      try{await access.check();}catch(_){}
      rebuild();rooms.sync();window.qaWorldReady=true;
    })();
    </script></html>`;
}
const rights=mode=>({
  adult:{data:{locked:true,age:19},error:null},
  minor:{data:{locked:true,age:18},error:null},
  unregistered:{data:null,error:null},
  error:{data:null,error:{message:'offline'}},
  unlocked:{data:{locked:false,age:30},error:null}
})[mode]||{data:null,error:{message:'unknown'}};
async function makePage(browser,mock,actor,errors,mode='adult',gate){
  const context=await browser.newContext({viewport:{width:350,height:730},hasTouch:true,isMobile:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',err=>errors.push(String(err)));
  const identity={actor,mode};
  const records=[];
  page.qa={records,identity};
  await page.exposeFunction('qaRpc',async(name,args={})=>{
    records.push([name,args,identity.actor]);
    if(name==='get_my_member_identity'){
      const recordedMode=identity.mode;
      if(gate)await gate.promise;
      return rights(recordedMode);
    }
    if(name!=='arcade_room_service'&&identity.mode!=='adult'){
      const detail='Game RPC before adult approval: '+name;
      errors.push(detail);return {data:null,error:{message:'adult_required'}};
    }
    return mock.rpc(identity.actor,name,args);
  });
  await page.route(origin+'/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/world.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:worldShell()});
    if(pathname==='/config.js'){
      const user=identity.mode==='signedout'?null:{id:identity.actor,is_anonymous:identity.mode==='anonymous',user_metadata:{age:35,adult:true}};
      const body=`(() => {
        let user=${JSON.stringify(user)};
        const listeners=new Set();
        window.qaChangeAuth=next=>{
          user=next;for(const listener of [...listeners])listener(next?'SIGNED_IN':'SIGNED_OUT',next?{user:next}:null);
        };
        const client={auth:{getSession:async()=>({data:{session:user?{user}:null},error:null}),
          getUser:async()=>({data:{user},error:null}),onAuthStateChange:fn=>{
            listeners.add(fn);queueMicrotask(()=>{if(listeners.has(fn))fn('INITIAL_SESSION',user?{user}:null);});return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};
          }},
          rpc:(name,args)=>{const pending=window.qaRpc(name,args||{});pending.abortSignal=()=>pending;return pending;}};
        window.OjjudaGetClient=async()=>client;
      })();`;
      return route.fulfill({contentType:'text/javascript; charset=utf-8',body});
    }
    const file=path.join(process.cwd(),pathname.slice(1),pathname.endsWith('/')?'index.html':'');
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'missing'});
    const contentType={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({contentType,body:fs.readFileSync(file)});
  });
  return page;
}
async function verifyLobby(page,mock){
  await page.goto(origin+'/world.html?tab=arcade');
  await page.waitForFunction(()=>window.qaWorldReady);
  const grid=page.locator('[data-arcade-games=multi]'),hub=page.locator('[data-arcade-games=adult] a[href="/games/drinking/"]');
  assert.equal(await grid.locator('a[href="/games/drinking/"]').count(),0);
  assert.equal(await page.locator('.arcade-card a[href="/games/drinking/"]').count(),1);
  await hub.waitFor();assert.equal(await hub.count(),1);assert.match(await hub.innerText(),/술게임/);
  for(const kind of otherKinds)assert.equal(await grid.locator('[data-v="'+kind+'"]').count(),1);
  for(const kind of kinds)assert.equal(await grid.locator('[data-v="'+kind+'"],a[href^="/games/'+kind+'/"]').count(),0);
  const filter=page.locator('[data-room-filter]'),feed=page.locator('[data-room-list]');
  await feed.getByText(genericRoom.title).waitFor();await feed.getByText('온라인 탱크').waitFor();
  for(const kind of kinds)assert.ok(!(await feed.innerText()).includes(kind+' 테스트 방'));
  assert.equal(await filter.locator('option[value=drinking]').count(),1);
  assert.equal((await filter.locator('option[value=drinking]').innerText()).trim(),'술게임');
  for(const k of kinds)assert.equal(await filter.locator('option[value="'+k+'"]').count(),0);
  await filter.selectOption('chess');
  await feed.getByText(genericRoom.title).waitFor();assert.equal(await feed.getByText('온라인 탱크').count(),0);
  await filter.selectOption('drinking');await page.locator('a[data-drinking-hub][href="/games/drinking/?mode=multi"]').first().waitFor();
  assert.equal(await feed.getByText(genericRoom.title).count(),0);
  await filter.selectOption('');
  await page.locator('[data-arcade-action=create]').first().click();
  const form=page.locator('#arcade-room-form'),select=form.locator('select[name=kind]');
  await select.waitFor();assert.equal(await select.locator('option[value=drinking]').count(),1);
  for(const k of kinds)assert.equal(await select.locator('option[value="'+k+'"]').count(),0);
  await select.selectOption('drinking');
  await select.selectOption('janggi');
  await form.locator('[name=title]').fill('장기 약속');
  await select.selectOption('drinking');await select.selectOption('janggi');
  assert.equal(await form.locator('[name=title]').inputValue(),'장기 약속');
  await select.selectOption('drinking');
  const choose=form.locator('a[data-drinking-hub][href="/games/drinking/?mode=multi"]');
  await choose.waitFor();assert.equal((await choose.innerText()).trim(),'술게임 입장');
  assert.equal(mock.calls.filter(call=>call.args.p_action==='create').length,0);
  await choose.click();await page.waitForURL('**/games/drinking/?mode=multi');
}
async function testParentRoom(host,guest,mock){
  const root=origin+'/games/drinking/';
  const parentUrl=root+'?room='+mock.parent;
  const create=host.locator('#create-form'),join=guest.locator('#join-form');
  await create.waitFor();
  assert.equal(await host.locator('#games button:visible').count(),0);
  await create.locator('[name=title]').fill('우리 술게임방');
  await create.locator('[name=password]').fill('test1234');
  await create.locator('[name=capacity]').selectOption('3');
  await create.locator('[type=submit]').click();
  await host.waitForURL(parentUrl);
  await host.getByText(mock.parent,{exact:false}).first().waitFor();
  assert.equal(await host.locator('#members li').count(),1);
  const cards=host.locator('#games button[data-game]');
  assert.deepEqual((await cards.evaluateAll(nodes=>nodes.map(b=>b.dataset.game))).sort(),[...kinds].sort());
  await host.locator('#invite').waitFor();
  await guest.goto(root+'?mode=multi');
  await join.waitFor();
  const before=mock.calls.length;
  await join.locator('[name=code]').fill('XY');await join.locator('[name=password]').fill('test1234');
  await join.locator('[type=submit]').click();
  assert.ok(!mock.calls.slice(before).some(c=>c.args.p_action==='join'&&c.args.p_code==='XY'));
  await guest.locator('#notice').filter({hasText:'6자리'}).waitFor();
  await join.locator('[name=code]').fill('EEAA12');
  await join.locator('[type=submit]').click();
  await guest.locator('#notice').filter({hasText:'방이 닫혔거나 만료됐어요.'}).waitFor();
  assert.ok(mock.calls.some(c=>c.actor==='guest'&&c.args.p_action==='join'&&c.args.p_code==='EEAA12'));
  assert.equal(await guest.locator('#lobby:visible').count(),0);
  await guest.goto(root+'?mode=multi');
  const roomLink=guest.locator('#room-list [data-room="'+mock.parent+'"]');
  await roomLink.waitFor();await roomLink.click();
  await guest.waitForURL(parentUrl);await join.waitFor();
  await join.locator('[name=password]').fill('wrong123');
  await join.locator('[type=submit]').click();
  await guest.getByText(/비밀번호.*(?:맞지|틀|확인|다시)/).first().waitFor();
  await join.locator('[name=password]').fill('test1234');
  await join.locator('[type=submit]').click();
  for(const p of [guest,host]){
    await p.locator('#members li').filter({hasText:'하늘'}).waitFor();
    assert.equal(await p.locator('#members li').count(),2);
  }
  await guest.reload();await guest.locator('#members li').filter({hasText:'다은'}).waitFor();
  assert.equal(await guest.locator('#games button[data-game]:visible:enabled').count(),0);
  assert.equal(await guest.locator('#start:visible:enabled').count(),0);

  const choose=async(kind,child)=>{
    await host.locator('#games [data-game="'+kind+'"]').click();
    await host.locator('#games [data-game="'+kind+'"][aria-pressed=true]').waitFor();
    await host.locator('#start').click();
    for(const p of [guest,host]){
      await p.waitForURL(url=>url.pathname==='/games/'+kind+'/'&&url.searchParams.get('room')===child&&url.searchParams.get('party')===mock.parent);
      await p.locator('#game').waitFor();
      assert.equal(await p.locator('#entry').count(),0);
      assert.equal(await p.locator('[data-do=leave],[data-do=again]').count(),0);
    }
  };
  await choose('updown','C632BA');
  await guest.reload();await guest.locator('#updown-range').waitFor();assert.equal(await guest.locator('#updown-form').count(),0);
  await host.locator('#updown-guess').fill('50');await host.locator('#updown-form [type=submit]').click();
  for(const p of [guest,host])await p.locator('[data-result]').filter({hasText:'다은'}).waitFor();
  await guest.locator('[data-party-wait]').waitFor();
  assert.equal(await guest.locator('[data-party-return]').count(),0);
  await host.locator('[data-party-return]').click();
  for(const p of [guest,host]){
    await p.waitForURL(parentUrl);
    await p.locator('#members li').filter({hasText:'하늘'}).waitFor();
    assert.equal(await p.locator('#members li').count(),2);
  }
  await choose('bomb','C792BF');
  await guest.goto(origin+'/games/updown/?room=C632BA&party='+mock.parent);
  await guest.waitForURL(url=>url.pathname==='/games/bomb/'&&url.searchParams.get('room')==='C792BF'&&url.searchParams.get('party')===mock.parent);
  await guest.locator('#game').waitFor();
  for(const p of [guest,host])assert.equal(await p.locator('#entry').count(),0);
  const parentCalls=mock.calls.filter(c=>c.name==='drinking_room');
  assert.equal(parentCalls.filter(c=>c.args.p_action==='create').length,1);
  assert.equal(parentCalls.filter(c=>c.args.p_action==='join'&&c.args.p_code===mock.parent&&c.args.p_options.password==='test1234').length,1);
  assert.equal(parentCalls.filter(c=>c.args.p_action==='start').length,2);
  assert.equal(parentCalls.filter(c=>c.args.p_action==='return').length,1);
  assert.equal(mock.calls.filter(c=>c.name!=='drinking_room'&&c.args.p_action==='join').length,0);
}
const gameContent='#create-form,#join-form,#lobby,#members,#view,#game,#entry,[data-game],[data-game-action]';
function deferred(){
  let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};
}
async function assertNoGame(page){
  assert.equal(await page.locator(gameContent).count(),0,'restricted DOM must not be mounted: '+page.url());
  assert.equal(await page.title(),'오쭈다');
  assert.doesNotMatch(await page.locator('body').innerText(),/우리 술게임방|손병호 게임|악어 이빨|시간폭탄|라이어 찾기|업앤다운/);
}
async function blockedWorld(browser,mock,errors,mode){
  const gate=deferred(),page=await makePage(browser,mock,'scope-'+mode,errors,mode,gate);
  try{
    await page.goto(origin+'/world.html?tab=arcade');
    const general=page.locator('[data-arcade-games=multi]'),filter=page.locator('[data-room-filter]');
    await general.waitFor();await filter.waitFor();
    for(const k of otherKinds)assert.equal(await general.locator('[data-v="'+k+'"]').count(),1);
    const hidden=async()=>{
      assert.equal(await page.locator('.arcade-card a[href="/games/drinking/"],[data-arcade-adult]').count(),0);
      assert.equal(await filter.locator('option[value=drinking]').count(),0);
    };
    await hidden();gate.release();await page.waitForFunction(()=>window.qaWorldReady);await hidden();
    assert.equal(await page.evaluate(()=>['drinking','king'].some(k=>OjjudaArcadeRooms.shortcut(k).includes('/games/drinking/'))),false);
    if(mode==='signedout'||mode==='anonymous'){
      assert.equal(await page.locator('[data-arcade-action=create]').first().isDisabled(),true);
    }else{
      await page.locator('[data-arcade-action=create]').first().click();
      const select=page.locator('#arcade-room-form select[name=kind]');await select.waitFor();
      assert.equal(await select.locator('option[value=drinking]').count(),0);
      assert.equal(await select.locator('option[value=chess]').count(),1);
      assert.equal(await page.locator('a[data-drinking-hub]').count(),0);
    }
  }finally{gate.release();await page.context().close();}
}
async function blockedDirect(browser,mock,errors,mode,urls){
  const page=await makePage(browser,mock,'blocked-'+mode,errors,mode);
  try{
    for(const subpath of urls){
      await page.goto(origin+subpath);
      const state={signedout:'login',anonymous:'login',unregistered:'identity',minor:'underage',unlocked:'unavailable',error:'unavailable'}[mode];
      await page.locator('#access-screen').waitFor();
      // Wait for the eligibility response to settle, including the active-account lookup.
      await page.locator('#access-screen[data-state="'+state+'"]').waitFor();
      if(state==='login')await page.locator('#access-login').waitFor();
      await assertNoGame(page);
    }
    assert.equal(page.qa.records.filter(([name])=>name!=='get_my_member_identity').length,0);
    if(mode==='signedout'||mode==='anonymous')assert.equal(page.qa.records.length,0);
  }finally{await page.context().close();}
}
async function changedWorld(browser,mock,errors){
  const page=await makePage(browser,mock,'host',errors);
  try{
    await page.goto(origin+'/world.html?tab=arcade');await page.waitForFunction(()=>window.qaWorldReady);
    assert.ok(await page.evaluate(()=>OjjudaArcadeRooms.shortcut('king').includes('/games/drinking/')));
    await page.locator('[data-arcade-action=create]').first().click();
    const select=page.locator('#arcade-room-form [name=kind]');await select.selectOption('drinking');
    await page.locator('#arcade-room-form a[data-drinking-hub]').waitFor();
    page.qa.identity.actor='minor-lobby';page.qa.identity.mode='minor';
    await page.evaluate(()=>window.qaSwitchWorld({id:'minor-lobby',is_anonymous:false}));
    assert.equal(await page.locator('a[data-drinking-hub],option[value=drinking],.arcade-card a[href="/games/drinking/"]').count(),0);
    assert.ok(await page.evaluate(()=>!OjjudaArcadeRooms.shortcut('drinking').includes('/games/drinking/')));
  }finally{await page.context().close();}
}
async function pendingAndSwitch(browser,mock,errors){
  const gate=deferred(),page=await makePage(browser,mock,'signed-adult',errors,'adult',gate);
  try{
    await page.goto(origin+'/games/drinking/');
    await page.locator('#access-screen').waitFor();await assertNoGame(page);
    assert.equal(page.qa.records.filter(([name])=>name==='drinking_room').length,0);
    gate.release();
    await page.locator('#play-modes').waitFor();
    page.qa.identity.actor='minor-switch';page.qa.identity.mode='minor';
    await page.evaluate(()=>window.qaChangeAuth({id:'minor-switch',is_anonymous:false,user_metadata:{age:40}})).catch(e=>{
      if(!/context was destroyed|navigation/.test(String(e)))throw e;
    });
    await page.locator('#access-screen').waitFor();
    await page.locator('#access-screen[data-state=underage]').waitFor();
    await assertNoGame(page);
    assert.ok(!page.qa.records.some(([name,args,actor])=>actor==='minor-switch'&&name!=='get_my_member_identity'));
  }finally{gate.release();await page.context().close();}

  // A late result from the former adult account cannot unlock a newly signed-in minor's managed invitation.
  const delayed=deferred(),race=await makePage(browser,mock,'prior-adult',errors,'adult',delayed);
  try{
    await race.goto(origin+'/games/updown/?room=C632BA&party='+mock.parent);
    await race.locator('#access-screen').waitFor();
    const limit=Date.now()+7000;
    while(!race.qa.records.some(([name])=>name==='get_my_member_identity')){
      assert.ok(Date.now()<limit,'identity request pending');await new Promise(resolve=>setTimeout(resolve,25));
    }
    await assertNoGame(race);
    race.qa.identity.actor='minor-race';race.qa.identity.mode='minor';
    await race.evaluate(()=>window.qaChangeAuth({id:'minor-race',is_anonymous:false})).catch(e=>{
      if(!/context was destroyed|navigation/.test(String(e)))throw e;
    });
    delayed.release();await race.locator('#access-screen[data-state=underage]').waitFor();
    await assertNoGame(race);assert.equal(race.qa.records.filter(([name])=>name!=='get_my_member_identity').length,0);
  }finally{delayed.release();await race.context().close();}
}

async function testLocal(browser,mock,errors) {
  const adult=await makePage(browser,mock,'local-user',errors);
  try {
    await adult.goto(origin+'/world.html?tab=arcade');
    const tile=adult.locator('[data-arcade-games=adult] a[data-v=drinking]');
    await tile.waitFor();
    assert.ok(await tile.locator('img').evaluate(img=>img.decode().then(()=>img.naturalWidth>0)));
    await tile.click();
    await adult.locator('#play-modes').waitFor();
    assert.equal(await adult.locator('#create-form:visible,#join-form:visible').count(),0);
    await adult.getByRole('link',{name:/한 대로 플레이/}).click();
    const cards=adult.locator('.game-card');
    await cards.first().waitFor();
    assert.equal(await cards.count(),13);
    await adult.getByRole('button',{name:'참가자 설정'}).click();
    await adult.getByLabel('1번 참가자 이름').fill('다은');
    await adult.getByRole('button',{name:'설정 완료'}).click();
    await adult.locator('.main-roster').getByText(/다은/).waitFor();
    await cards.filter({hasText:'악어 이빨'}).click();
    await adult.locator('[data-action=start]').click();
    await adult.locator('[data-action=tooth]').first().waitFor();
    assert.equal(await adult.locator('[data-action=tooth]').count(),24);
    await adult.locator('[data-action=tooth]').first().click();
    const exit = adult.getByRole('link',{name:'오쭈다 오락실로',exact:true});
    const arcadeUrl = origin+'/world.html?tab=arcade';
    assert.equal(await exit.count(),1);
    assert.equal(await exit.getAttribute('href'),'/world.html?tab=arcade');
    await exit.click();
    await adult.waitForURL(arcadeUrl);
    await adult.locator('[data-arcade-games=multi]').waitFor();
    for(const width of [320,390,820]) {
      await adult.setViewportSize({width,height:730});
      await adult.goto(origin+'/games/drinking/local/');
      await exit.waitFor();
      const box = await exit.boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y<160 && box.height>=44,'visible and tappable at '+width);
      assert.equal(await adult.getByRole('link',{name:'방식 선택'}).isVisible(),true);
      await exit.click();
      await adult.waitForURL(arcadeUrl);
      await adult.locator('[data-arcade-games=multi]').waitFor();
    }
    console.log('Direct arcade return passed from an active round and the game menu at 320, 390 and 820 px.');
    assert.ok(!adult.qa.records.some(([name])=>name!=='get_my_member_identity'&&name!=='arcade_room_service'));
    await adult.goto(origin+'/games/drinking/local/');
    await adult.locator('.main-roster').getByText(/다은/).waitFor();
    await adult.getByRole('link',{name:'방식 선택'}).click();
    await adult.getByRole('link',{name:/멀티플레이/}).click();
    await adult.locator('#create-form').waitFor();
  } finally {await adult.context().close();}
  for(const mode of ['minor','signedout','unregistered']){
    const page=await makePage(browser,mock,'blocked-local',errors,mode);
    try{
      await page.goto(origin+'/games/drinking/local/#croc');
      await page.waitForFunction(()=>document.querySelector('#access-screen')?.dataset.state!=='pending');
      assert.equal(await page.locator('#app,#settings,.game-card,[data-action=tooth]').count(),0);
      assert.equal(await page.title(),'오쭈다');
    }finally {await page.context().close();}
  }
}
async function main(){
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const mock=mockClient(),errors=[];
  try{
    for(const mode of ['minor','unregistered','signedout','anonymous','error'])await blockedWorld(browser,mock,errors,mode);
    console.log('World catalog + room chooser hide drinking for pending, guest, minor and unknown members.');
    await blockedDirect(browser,mock,errors,'minor',['/games/drinking/?room='+mock.parent,...kinds.map(kind=>'/games/'+kind+'/'),'/games/updown/?room=C632BA&party='+mock.parent]);
    await blockedDirect(browser,mock,errors,'unregistered',['/games/drinking/','/games/croc/']);
    await blockedDirect(browser,mock,errors,'unlocked',['/games/king/']);
    await blockedDirect(browser,mock,errors,'signedout',['/games/drinking/','/games/liar/']);
    await blockedDirect(browser,mock,errors,'anonymous',['/games/drinking/','/games/mission/?room=B51611&party='+mock.parent]);
    await blockedDirect(browser,mock,errors,'error',['/games/drinking/','/games/bomb/?room=C792BF&party='+mock.parent]);
    await pendingAndSwitch(browser,mock,errors);
    await changedWorld(browser,mock,errors);
    console.log('13 direct routes, group invitations, age lookup failures, account changes and late responses fail closed.');
    const host=await makePage(browser,mock,'host',errors),guest=await makePage(browser,mock,'guest',errors);
    await testLocal(browser,mock,errors);
    await verifyLobby(host,mock);
    console.log('Public multiplayer grid, room filter, ordinary game feed and grouped create passed.');
    await testParentRoom(host,guest,mock);
    console.log('Shared password room, all 13 games, host selection, automatic entry, reconnection and same roster next game passed.');
    const standalone=await makePage(browser,mock,'host',errors);
    await standalone.goto(origin+'/games/updown/');await standalone.locator('#entry').waitFor();
    assert.equal(await standalone.locator('[data-party-return]').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(mock.issues,[]);
    console.log('Standalone direct game entry passed.');
  }catch(error){
    console.error('Requests',mock.calls.map(c=>[c.actor,c.name,c.args.p_action]),'Errors',errors,mock.issues);
    throw error;
  }finally{await browser.close();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
