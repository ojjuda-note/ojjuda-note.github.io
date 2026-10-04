const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const helper = ['world-navigation.js','world-pull-refresh.js','world-places.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
world = world.replace('<script type="module">', `<script>${helper}</script><script type="module">`);
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
window.worldTest={state:g,auth:D,actions:sr,render:H,model:$,modal:ct,setClient:client=>{S=client}};
gm(()=>{g.tab="friends";g.visiting=null;g.visitData=null;H();window.scrollTo(0,0)});
g.tab="friends";H();` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'fixture.test') return route.abort();
      if (url.pathname === '/note/') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Note destination</title><main>오쭈다 노트</main>'});
      if (url.pathname === '/world.html') return route.fulfill({contentType:'text/html',body:world});
      const file = path.join(root,url.pathname);
      if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({path:file});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(()=>window.worldTest && history.state?.ojjudaWorld==='main');
    await page.evaluate(()=>{const model=worldTest.model;Object.assign(model,{coins:321,avatar:{hair:'bob'},room:{items:[{type:'cat'}]},rooms:[{items:[{type:'sofa'}]}],friends:[{id:'f1',room:{items:[]}}],petBank:{cat:[{}]},themeBackup:{room:{items:[]}},diary:[{id:'saved-note',title:'내 기록',body:'보존',vis:'all',at:Date.now()}]});localStorage.setItem('ojjuda-world-v1',JSON.stringify(model));localStorage.setItem('ojjuda-pet-talk','old');localStorage.setItem('ojjuda-pet-mem','old');});
    await page.reload();await page.waitForFunction(()=>window.worldTest && history.state?.ojjudaWorld==='main');
    assert.deepEqual(await page.evaluate(()=>{const m=worldTest.model;return [m.coins,m.diary[0].id,m.room.items,m.avatar,m.friends,m.petBank||null,m.themeBackup||null,localStorage.getItem('ojjuda-pet-talk'),localStorage.getItem('ojjuda-pet-mem')]}),[321,'saved-note',[],{},[],null,null,null,null],'reload clears retired assets while preserving balance and writing');
    const current=()=>page.evaluate(()=>worldTest.state.tab);
    const main=async()=>{
      await page.evaluate(()=>worldTest.actions.tab({tab:'friends'}));
      await page.waitForFunction(()=>history.state?.ojjudaWorld==='main' && worldTest.state.tab==='friends');
    };
    const back=async()=>{
      await page.evaluate(()=>history.back());
      await page.waitForFunction(()=>worldTest.state.tab==='friends' && history.state?.ojjudaWorld==='main');
      assert.equal(page.url(),'https://fixture.test/world.html');
    };
    assert.equal(await page.locator('[data-tab="shop"]').count(),0,'store entries are removed');
    await page.evaluate(()=>worldTest.actions.tab({tab:'shop'}));
    assert.equal(await current(),'friends','old store action returns to the main screen');
    await page.evaluate(()=>{worldTest.state.tab='shop';worldTest.render();});
    assert.equal(await current(),'friends','restored store state cannot reopen the store');
    assert.notEqual(await page.locator('.wd-home').getAttribute('aria-disabled'),'true');
    assert.equal(await page.locator('.wd-home').getAttribute('aria-label'),'우리집 들어가기');
    await page.locator('.wd-home').click();
    assert.equal(await current(),'home');
    assert.equal(await page.locator('[data-house-entry]').count(),1,'signed-out members get the house entry panel');
    assert.equal(await page.locator('iframe').count(),0,'signed-out navigation does not open an ownerless room');
    await main();
    for(const tab of ['home','deco']){
      await page.evaluate(tab=>worldTest.actions.tab({tab}),tab);
      assert.equal(await page.locator('[data-house-entry]').count(),1);
      assert.equal(await page.locator('#stage,#av-preview,.room3d-frame').count(),0);
      await main();
    }
    await main();
    for(const tab of ['home','board','life','my']) {
      await page.locator(`.bottomnav [data-tab="${tab}"]`).click();
      assert.equal(await current(),tab);
      await back();
    }
    for(const place of ['cafe','arcade','library','park']) {
      await page.locator(`.world-destination[data-id="${place}"]`).click();
      await page.waitForFunction(()=>worldTest.state.tab==='place');
      await back();
    }
    const length=await page.evaluate(()=>history.length);
    for(let i=0;i<3;i++){
      await page.evaluate(()=>worldTest.actions.tab({tab:'my'}));
      await main();
    }
    assert.equal(await page.evaluate(()=>history.length),length,'menu visits do not pile up history entries');
    await page.evaluate(()=>{worldTest.actions.tab({tab:'my'});worldTest.modal('<button data-act="close">닫기</button>','테스트')});
    await page.evaluate(()=>history.back());
    await page.waitForFunction(()=>!document.querySelector('#modal-root').innerHTML);
    assert.equal(await current(),'my','back closes the top dialog before leaving its menu');
    await back();
    assert.deepEqual(await page.evaluate(()=>Object.keys(worldTest.actions).filter(key=>/^(pet-|npc-|adm-item|adm-price|adm-sync|set-buy|try-|placement-|add-item$|mv$)/.test(key))),[],'retired controls cannot be invoked');
    await page.evaluate(()=>{const t=worldTest;t.auth.isAdmin=true;t.actions.tab({tab:'deco'});});
    await back();

    const cdp=await context.newCDPSession(page);
    await page.evaluate(()=>{const dialog=document.createElement('div');dialog.role='dialog';dialog.hidden=true;document.body.append(dialog)});
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=1])=>({x,y,id}))});
    const swipe=async(dx,dy=0,{cancel=false,second=false,hold=false}={})=>{
      await page.evaluate(()=>scrollTo(0,0));
      const box=await page.locator('.world-scene').boundingBox();
      const x=box.x+box.width*(dx<0?.75:.25),y=box.y+100;
      await touch('touchStart',[[x,y]]);
      for(let i=1;i<=6;i++)await touch('touchMove',[[x+dx*i/6,y+dy*i/6]]);
      if(hold){
        assert.ok(await page.locator('.main').evaluate(el=>getComputedStyle(el).transform!=='none'));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'drag does not create a sideways scrollbar');
      }
      if(second)await touch('touchStart',[[x+dx,y+dy],[x,y+60,2]]);
      await touch(cancel?'touchCancel':'touchEnd',[]);
    };
    await swipe(-150,0,{hold:true});assert.equal(await current(),'home');await back();
    await swipe(150);assert.equal(await current(),'friends','right swipe stops at the first main menu');
    await swipe(-30);assert.equal(await current(),'friends');
    await swipe(-150,0,{cancel:true});assert.equal(await current(),'friends');
    await swipe(-80,0,{second:true});assert.equal(await current(),'friends');
    // The full main scene must extend below the viewport to test scrolling;
    // installed fallback fonts differ between local Chromium and CI.
    await page.setViewportSize({width:390,height:650});
    await swipe(4,-150);assert.equal(await current(),'friends');
    await page.waitForFunction(()=>scrollY>20);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>scrollTo(0,0));
    await page.locator('.world-destination[data-id="cafe"]').click();
    assert.equal(await current(),'place','a normal building tap still enters it');await back();
    const navigate=async tab=>{
      await page.evaluate(tab=>worldTest.actions.tab({tab}),tab);
      if(tab==='friends')await page.waitForFunction(()=>history.state?.ojjudaWorld==='main');
      await page.evaluate(()=>scrollTo(0,0));
    };
    const touchDrag=async(selector,dx,dy=0)=>{
      const target=page.locator(selector).first();
      // Native scrollIntoViewIfNeeded can leave the palette behind the fixed
      // bottom navigation, so center the surface before sending real touches.
      await target.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
      const box=await target.boundingBox();
      const x=box.x+box.width*(dx<0?.8:.2),y=dy?box.y+box.height*.8:Math.max(5,box.y)+20;
      assert.ok(await target.evaluate((el,{x,y})=>el.contains(document.elementFromPoint(x,y)),{x,y}),'the gesture starts on its intended surface');
      await touch('touchStart',[[x,y]]);
      for(let i=1;i<=6;i++)await touch('touchMove',[[x+dx*i/6,y+dy*i/6]]);
      await touch('touchEnd',[]);
    };
    const tabs=['friends','home','board','life','my'];
    for(let i=0;i<tabs.length;i++){
      for(const dx of [-150,150]){
        await navigate(tabs[i]);
        // Start in ordinary page content, away from the bottom navigation.
        const box=await page.locator('.main').boundingBox();
        const x=box.x+box.width*(dx<0?.8:.2),y=box.y+20;
        await touch('touchStart',[[x,y]]);
        for(let j=1;j<=6;j++)await touch('touchMove',[[x+dx*j/6,y]]);
        if((i===0 && dx>0)||(i===tabs.length-1 && dx<0)){
          const shift=await page.locator('.main').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41);
          assert.ok(Math.sign(shift)===Math.sign(dx) && Math.abs(shift)<=32,'the first and last menus resist dragging past the end');
        }
        await touch('touchEnd',[]);
        const next=Math.max(0,Math.min(tabs.length-1,i+(dx<0?1:-1)));
        assert.equal(await current(),tabs[next],`${tabs[i]} content supports ${dx<0?'left':'right'} swipe without wrapping`);
      }
    }
    const places=['cafe','arcade','library','park'];
    const currentPlace=()=>page.evaluate(()=>worldTest.state.tab==='place' && worldTest.state.place?.id);
    const enterPlace=async id=>{
      await navigate('friends');
      await page.locator(`.world-destination[data-id="${id}"]`).click();
      assert.equal(await currentPlace(),id);
    };
    for(let i=0;i<places.length;i++){
      for(const dx of [-150,150]){
        await enterPlace(places[i]);
        await touchDrag('.visit-banner',dx);
        const next=Math.max(0,Math.min(places.length-1,i+(dx<0?1:-1)));
        assert.equal(await currentPlace(),places[next],`${places[i]} drag stays in the neighborhood order and stops at its ends`);
        assert.equal(await page.locator('.bottomnav [aria-current="page"]').getAttribute('data-tab'),'friends','place swipes keep the neighborhood tab active');
      }
    }
    await enterPlace('cafe');
    const placeHistoryLength=await page.evaluate(()=>history.length);
    for(const id of places.slice(1)){
      await touchDrag('.visit-banner',-150);
      assert.equal(await currentPlace(),id,'left drags follow cafe, arcade, library, park');
    }
    for(const id of places.slice(0,-1).reverse()){
      await touchDrag('.visit-banner',150);
      assert.equal(await currentPlace(),id,'right drags follow the same place order in reverse');
    }
    assert.equal(await page.evaluate(()=>history.length),placeHistoryLength,'moving between places does not stack navigation history');
    await back();
    await enterPlace('cafe');
    await page.waitForSelector('.place-art-ready');
    await touchDrag('.place-art-viewport',-150);
    assert.equal(await currentPlace(),'arcade','touch dragging the normal place illustration changes to the next place');
    await page.waitForSelector('.place-art-ready');
    await page.locator('[aria-label="공간 확대"]').click();
    await touchDrag('.place-art-viewport',-150);
    assert.equal(await currentPlace(),'arcade','dragging an enlarged illustration stays in the current place');
    assert.ok(await page.locator('.place-art-image').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41<0),'an enlarged illustration still pans with touch');
    await page.locator('[aria-label="공간 맞춤"]').click();
    await touchDrag('.place-art-viewport',150);
    assert.equal(await currentPlace(),'cafe','returning the illustration to normal size restores place swipes');
    await main();
    // Desktop uses the same gesture through actual mouse events.
    await page.setViewportSize({width:1280,height:900});
    let box=await page.locator('.world-scene').boundingBox();
    await page.mouse.move(box.x+box.width*.7,box.y+100);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.7-180,box.y+100,{steps:8});await page.mouse.up();
    assert.equal(await current(),'home');await back();
    const mouseDrag=async(selector,dx,{slow=false}={})=>{
      const target=page.locator(selector).first();
      await target.scrollIntoViewIfNeeded();
      const bounds=await target.boundingBox();
      const x=bounds.x+bounds.width*(dx<0?.7:.3),y=bounds.y+bounds.height/2;
      await page.mouse.move(x,y);await page.mouse.down();
      if(slow){
        // A deliberate drag over 1.4 seconds must work like a quick swipe.
        // Keep sending real pointer moves rather than altering the app clock.
        for(let step=1;step<=6;step++){
          await new Promise(resolve=>setTimeout(resolve,240));
          await page.mouse.move(x+dx*step/6,y);
        }
      }else await page.mouse.move(x+dx,y,{steps:8});
      await page.mouse.up();
    };
    await mouseDrag('.world-scene',180);
    assert.equal(await current(),'friends','mouse drag cannot leave the start of the main menu');
    await mouseDrag('.world-scene',-180,{slow:true});
    assert.equal(await current(),'home','a deliberate mouse drag longer than 1.4 seconds still moves to the next main menu');
    await back();
    await enterPlace('cafe');
    await mouseDrag('.visit-banner',180);
    assert.equal(await currentPlace(),'cafe','mouse drag stops at cafe');
    await mouseDrag('.visit-banner',-180);
    assert.equal(await currentPlace(),'arcade','mouse drag changes places instead of entering our house');
    await page.waitForSelector('.place-art-ready');
    await mouseDrag('.place-art-viewport',-180);
    assert.equal(await currentPlace(),'library','mouse dragging the normal place illustration changes places');
    await page.waitForSelector('.place-art-ready');
    await page.locator('[aria-label="공간 확대"]').click();
    await mouseDrag('.place-art-viewport',-180);
    assert.equal(await currentPlace(),'library','mouse dragging an enlarged illustration preserves the current place');
    assert.ok(await page.locator('.place-art-image').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41<0),'an enlarged illustration still pans with the mouse');
    await enterPlace('park');
    await mouseDrag('.visit-banner',-180);
    assert.equal(await currentPlace(),'park','mouse drag stops at park');
    await mouseDrag('.visit-banner',180);
    assert.equal(await currentPlace(),'library','mouse drag returns from park to library');
    assert.deepEqual(errors,[]);
    await context.close();

    // Exercise the real board -> World opener boundary; game engines and remote
    // iframe contents have separate suites, and this fixture cannot reach a server.
    const boardScripts=['world-board.js','world-spot-game.js','matgo-access.js','matgo-bridge.js']
      .map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
    const boardWorld=world.replace('<script type="module">',`<script>${boardScripts}</script><script type="module">`);
    const games=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await games.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='fixture.test')return route.abort();
      if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:boardWorld});
      if(['/games/spot-difference/index.html','/games/matgo-online.html'].includes(url.pathname))
        return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated game destination</title>'});
      const file=path.join(root,url.pathname);
      return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
    });
    const gp=await games.newPage(),gameErrors=[];
    gp.on('pageerror',error=>gameErrors.push(error.message));
    await gp.goto('https://fixture.test/world.html');
    await gp.waitForFunction(()=>window.worldTest);
    await gp.evaluate(()=>{
      window.gameFixture={calls:[],age:25,screwModes:[],destroyed:[]};
      const fixture=gameFixture;
      function query(table){
        let single=false;const result=()=>({data:table==='user_private'?{coins:321}:single?null:[],error:null});
        const q=new Proxy({}, {get(target,key){
          if(key==='then')return (resolve,reject)=>Promise.resolve(result()).then(resolve,reject);
          return (...args)=>{fixture.calls.push({table,method:key,args});if(key==='maybeSingle'||key==='single')single=true;return q;};
        }});return q;
      }
      const client={from:query,schema:()=>({rpc:async()=>({data:[],error:null})}),
        auth:{getUser:async()=>({data:{user:{id:'board-member'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
        rpc:async(name,args)=>{fixture.calls.push({rpc:name,args});return {data:name==='get_my_member_identity'?{locked:true,age:fixture.age}:[],error:null};}};
      worldTest.setClient(client);Object.assign(worldTest.auth,{online:true,user:{id:'board-member'}});
      OjjudaMatgoAccess.configure(client);
      window.OjjudaScrewLoader={menuHTML:()=>'<p>종류 선택</p>',load:async mode=>{
        fixture.screwModes.push(mode);return ()=>({controls:'',update(){},draw(){},destroy(){fixture.destroyed.push(mode);}});
      }};
      worldTest.actions.tab({tab:'board'});
    });
    await gp.locator('.board-game-open').first().waitFor();
    assert.equal(await gp.locator('.board-game-open').count(),12,'all public ranking names lead to games, including every variant');
    assert.equal(await gp.locator('[data-game="matgo"]').count(),0,'unverified Matgo access is not advertised');
    await gp.locator('[data-board-root]').evaluate(el=>el.dataset.retained='original-board');
    const gameButton=id=>gp.locator(`[data-game="${id}"] .board-game-open`);
    const openGame=async id=>{
      const slide=await gameButton(id).evaluate(el=>[...el.closest('.board-rank-track').children].indexOf(el.closest('.board-rank-page')));
      while(Number(await gp.locator('.board-leaders').getAttribute('data-rank-page'))!==slide)
        await gp.getByRole('button',{name:'다음 게임순위',exact:true}).click();
      await gameButton(id).click();
    };
    const stillBoard=async(id,close)=>{
      const slide=await gp.locator('.board-leaders').getAttribute('data-rank-page');
      await gp.locator(close).click();
      assert.equal(await gp.evaluate(()=>worldTest.state.tab),'board',id+': closing returns to the board');
      assert.equal(await gp.locator('[data-board-root]').getAttribute('data-retained'),'original-board',id+': opening does not remount the board');
      assert.equal(await gp.locator('.board-leaders').getAttribute('data-rank-page'),slide,id+': ranking page is preserved');
      assert.equal(gp.url(),'https://fixture.test/world.html');
    };
    for(const id of ['carom4','carom3','pool8']){
      await openGame(id);
      await gp.locator(`#bd-menu [data-act="bl-kind"][data-v="${id}"][aria-pressed="true"]`).waitFor();
      assert.equal(await gp.locator('#bd-menu [data-act="bl-kind"][aria-pressed="true"]').count(),1,id+': correct billiards variant selected');
      await stillBoard(id,'#modal-root [data-act="close"]');
    }
    for(const [id,mode,label] of [['screw_box','box','박스형'],['screw_flat','flat','평면형']]){
      await openGame(id);await gp.locator(`#gov[data-screw-mode="${mode}"]`).waitFor();
      assert.ok((await gp.locator('#gov .gt').innerText()).includes(label));
      await stillBoard(id,'#gov [data-g="close"]');
    }
    assert.deepEqual(await gp.evaluate(()=>[gameFixture.screwModes,gameFixture.destroyed]),[['box','flat'],['box','flat']],'each screw row loads and closes its own selected engine');
    await openGame('spot');await gp.locator('.spot-game-dialog[open]').waitFor();
    assert.equal(new URL(await gp.locator('.spot-game-dialog iframe').getAttribute('src'),gp.url()).pathname,'/games/spot-difference/index.html');
    await stillBoard('spot','.spot-game-dialog button');
    for(const [id,label] of [['mole','두더지 잡기'],['runner','쭈 달리기'],['stacker','탑 쌓기'],['breakout','벽돌깨기']]){
      await openGame(id);await gp.locator('#gov').waitFor();
      assert.equal(await gp.locator('#gov').getAttribute('aria-label'),label,id+': matching arcade game opens');
      await stillBoard(id,'#gov [data-g="close"]');
    }
    for(const [id,label] of [['janggi','장기'],['chess','체스']]){
      await openGame(id);await gp.locator(`#bd-menu [data-act="bd-start"][data-k="${id}"]`).first().waitFor();
      assert.equal(await gp.locator('#modal-root [role="dialog"]').getAttribute('aria-label'),label);
      await stillBoard(id,'#modal-root [data-act="close"]');
    }
    // Use the real Matgo gate: an already visible row must recheck server age.
    await gp.evaluate(async()=>{await OjjudaMatgoAccess.check();worldTest.render();gameFixture.age=18;});
    assert.equal(await gp.locator('[data-game="matgo"] .board-game-open').count(),1);
    await openGame('matgo');
    await gp.waitForFunction(()=>document.querySelector('#toast').textContent.includes('만 19세 생일부터'));
    assert.equal(await gp.locator('#matgo-overlay').count(),0,'a rejected fresh age check cannot open Matgo');
    assert.equal(await gp.evaluate(()=>worldTest.state.tab),'board');
    const checks=await gp.evaluate(()=>gameFixture.calls.filter(call=>call.rpc==='get_my_member_identity').length);
    await gameButton('matgo').click();
    assert.equal(await gp.evaluate(()=>gameFixture.calls.filter(call=>call.rpc==='get_my_member_identity').length),checks,'a stale Matgo row cannot bypass revoked visibility');
    await gp.evaluate(async()=>{gameFixture.age=25;await OjjudaMatgoAccess.check();worldTest.render();});
    await gp.locator('[data-board-root]').evaluate(el=>el.dataset.retained='original-board');
    await openGame('matgo');await gp.locator('#matgo-overlay iframe').waitFor();
    assert.equal(new URL(await gp.locator('#matgo-overlay iframe').getAttribute('src'),gp.url()).pathname,'/games/matgo-online.html');
    await stillBoard('matgo','#matgo-overlay [aria-label="맞고 닫기"]');
    assert.deepEqual(await gp.evaluate(()=>gameFixture.calls.filter(call=>['insert','update','delete','upsert'].includes(call.method)||call.rpc&&call.rpc!=='get_my_member_identity'&&call.rpc!=='game_ranking'&&call.rpc!=='billiards_ping')),[],'opening game menus never writes scores or purchases');
    assert.deepEqual(gameErrors,[]);
    await games.close();

    const native=await browser.newContext({viewport:{width:390,height:844}});
    await native.addInitScript(()=>{
      window.nativeExited=0;
      window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{
        addListener:async(name,cb)=>{window.nativeBack=cb;return{remove(){}}},
        exitApp:()=>window.nativeExited++}}};
    });
    await native.route('**/*',route=>route.request().url()==='https://fixture.test/world.html'
      ?route.fulfill({contentType:'text/html',body:world}):route.abort());
    const np=await native.newPage();await np.goto('https://fixture.test/world.html');
    await np.waitForFunction(()=>window.nativeBack && window.worldTest);
    for(const tab of ['home','deco','board','life','my']){
      await np.evaluate(tab=>{worldTest.actions.tab({tab});nativeBack({canGoBack:false})},tab);
      await np.waitForFunction(()=>worldTest.state.tab==='friends' && history.state?.ojjudaWorld==='main');
      assert.equal(await np.evaluate(()=>nativeExited),0,'native back from menus never exits the app');
    }
    await native.close();
    console.log('PASS: browser/native menu back, modal protection and retired-state cleanup, separate five-tab and four-place swipe orders, touch/mouse input, real board game routes and variants, board preservation on close, and fresh Matgo access checks.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
