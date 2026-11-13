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
        return {data:{ok:true,rooms:[genericRoom,stubRoom('updown','B95321')],mine:stubRoom('imagevote','D31332',true),can_matgo:false},error:null};
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
  assert.ok(begin>0&&end>begin,'world arcade render function');
  const data=JSON.stringify([stubRoom('fingers','D31111',true),stubRoom('king','D21111'),
    {...stubRoom('tank','D17777'),room_no:703,title:'온라인 탱크'}]);
  return `<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width"><div id="world"></div><div id="modal-root"></div>
    <script src="/features/arcade/arcade-rooms.js"></script><script>
    const g={place:{id:'arcade'},bdInvites:0},Pt={arcade:{chat:true,arcade:true}},_r={},D={online:true};
    const worldArcadeAdultMarkup=()=>'',worldPlacePresenceText=()=>'';
    ${source.slice(begin,end)}
    document.getElementById('world').innerHTML=Df();
    const client={rpc:(name,args)=>window.qaRpc(name,args)};
    const rooms=window.OjjudaArcadeRooms.create({
      client,getUserId:()=>'host',extraRooms:async()=>${data},canOpen:()=>false,
      renderModal:html=>document.getElementById('modal-root').innerHTML=html,
      closeModal:()=>document.getElementById('modal-root').replaceChildren(),goArcade(){},
      notify:msg=>{window.lastNotice=msg},onCreateNative:()=>{throw Error('Unexpected direct room creation')},
      onOpen:async()=>{},onCancelNative:async()=>{}
    });rooms.sync();
    </script></html>`;
}
async function makePage(browser,mock,actor,errors){
  const context=await browser.newContext({viewport:{width:350,height:730},hasTouch:true,isMobile:true});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',err=>errors.push(String(err)));
  await page.exposeFunction('qaRpc',(name,args)=>mock.rpc(actor,name,args));
  await page.route(origin+'/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/world.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:worldShell()});
    if(pathname==='/config.js'){
      const session=JSON.stringify({user:{id:actor,is_anonymous:false}});
      const body=`(() => {
        const session=${session};
        const client={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
          rpc:(name,args)=>{const pending=window.qaRpc(name,args);pending.abortSignal=()=>pending;return pending;}};
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
  const grid=page.locator('[data-arcade-games=multi]'),hub=grid.locator('a[href="/games/drinking/"]');
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
  await filter.selectOption('drinking');await page.locator('a[data-drinking-hub][href="/games/drinking/"]').first().waitFor();
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
  const choose=form.locator('a[data-drinking-hub][href="/games/drinking/"]');
  await choose.waitFor();assert.equal((await choose.innerText()).trim(),'술게임 입장');
  assert.equal(mock.calls.filter(call=>call.args.p_action==='create').length,0);
  await choose.click();await page.waitForURL('**/games/drinking/');
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
  await guest.goto(root);
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
  await guest.goto(root);
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
async function main(){
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const mock=mockClient(),errors=[];
  try{
    const host=await makePage(browser,mock,'host',errors),guest=await makePage(browser,mock,'guest',errors);
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
