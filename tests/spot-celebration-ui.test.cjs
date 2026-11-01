const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const gameUrl='https://fixture.test/games/spot-difference/index.html';
  async function fixture(viewport={width:390,height:844}){
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],imageGates=[];
   function holdImages(matches=()=>true){
    let release,seen;const waiting=new Promise(resolve=>release=resolve),started=new Promise(resolve=>seen=resolve);
    const gate={matches,active:true,waiting,requests:[],release:()=>{gate.active=false;release();},seen,waitForRequest:async()=>{
     let timeout;try{await Promise.race([started,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('chosen picture did not request its image')),10000);})]);}finally{clearTimeout(timeout);}
    }};
    imageGates.push(gate);return gate;
   }
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.spotScores=[];window.JjudaWallet={getState:()=>({ready:true,userId:'member-a',coins:0}),subscribe:fn=>fn({ready:true,userId:'member-a',coins:0}),recordClear:async(owner,stage)=>{spotScores.push({owner,stage});return {ok:true}},refresh:async()=>{},buy:()=>{throw Error('unexpected payment')}};});
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='https://fixture.test'||/\/(wallet|supabase)\.js$/.test(url.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
    if(url.pathname==='/korean.ttf'&&fs.existsSync('/tmp/ojjuda-visitor-proof.ttf'))return route.fulfill({path:'/tmp/ojjuda-visitor-proof.ttf'});
    const file=path.join(root,decodeURIComponent(url.pathname));
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    if(/\.(webp|jpg|png)$/.test(url.pathname)){
     const gates=imageGates.filter(gate=>gate.active&&gate.matches(url.pathname));
     for(const gate of gates){gate.requests.push(url.pathname);gate.seen();}
     await Promise.all(gates.map(gate=>gate.waiting));
    }
    return route.fulfill({path:file,contentType:/\.js$/.test(file)?'text/javascript':undefined});
   });
   await page.goto(gameUrl);
   if(fs.existsSync('/tmp/ojjuda-visitor-proof.ttf'))await page.addStyleTag({content:"@font-face{font-family:ProofKR;src:url('/korean.ttf')}body,button{font-family:ProofKR,sans-serif}"});
   await page.waitForFunction(()=>!document.querySelector('#start').disabled);
   return {page,context,errors,holdImages};
  }
  const current=page=>page.evaluate(()=>{const index=Number(document.querySelector('#stage-picker').value),p=JJUDA_PUZZLES[index];return {index,id:p.id,title:p.title,difficulty:p.difficulty||'normal',targets:p.spots.length};});
  const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('jjuda-spot-six-v1')));
  async function freshMenu(page,id){
   await page.waitForFunction(()=>!document.querySelector('#start').disabled);
   assert.equal((await current(page)).id,id,'entry remembers the last actual picture');
   assert.equal(await page.locator('#start').isVisible(),true);
   assert.equal(await page.locator('#start').innerText(),'시작하기');
   assert.equal(await page.locator('#found-count').innerText(),'0');
   assert.equal(await page.locator('#hearts .empty').count(),0);
   assert.equal(await page.locator('#time-left').innerText(),'60');
   assert.equal(await page.locator('#celebration').evaluate(dialog=>dialog.open),false);
   assert.equal(await page.locator('#celebration-level,#retry-level').count(),0,'entry and results have no select-and-confirm controls');
   for(const prefix of ['celebration','retry'])for(const choice of ['previous','current','next'])assert.equal(await page.locator(`#${prefix}-${choice}`).isVisible(),false,'picture choices appear only after a round');
   const state=await saved(page),picture=await current(page);
   assert.equal(state.current,picture.index);assert.deepEqual(state.found[id],[]);
   assert.equal(state.rounds[id].status,'ready');assert.equal(state.rounds[id].remainingMs,60000);assert.equal(state.rounds[id].hearts,3);
  }
  async function started(page,id){
   await page.waitForFunction(id=>{
    const p=JJUDA_PUZZLES[Number(document.querySelector('#stage-picker').value)],state=JSON.parse(localStorage.getItem('jjuda-spot-six-v1'));
    return p.id===id&&document.querySelector('#board-curtain').hidden&&state.rounds[p.id]?.status==='playing';
   },id);
   assert.equal(await page.locator('#start').isVisible(),false,'one end-button click starts without a second confirmation');
   assert.equal(await page.locator('#found-count').innerText(),'0');
   assert.equal(await page.locator('#hearts .empty').count(),0);
   assert.ok(Number(await page.locator('#time-left').innerText())>=58,'a chosen picture starts with a full minute');
   assert.equal(await page.locator('#celebration').evaluate(dialog=>dialog.open),false);
   assert.equal((await saved(page)).current,(await current(page)).index,'the chosen picture is saved');
  }
  async function choose(page,prefix,choice,id){
   await page.locator(`#${prefix}-${choice}`).click();await started(page,id);
  }
  async function pointClicks(page,points,selector='#original'){
   // Use the same pointer/click coordinates as touch hit-testing, including
   // offscreen coordinates in the scrollable zoom view.
   await page.locator(selector).evaluate((image,points)=>{
    const surface=image.parentElement;
    for(const point of points){
     const rect=surface.getBoundingClientRect(),init={bubbles:true,clientX:rect.x+rect.width*point.x/100,clientY:rect.y+rect.height*point.y/100};
     surface.dispatchEvent(new PointerEvent('pointerdown',init));surface.dispatchEvent(new MouseEvent('click',init));
    }
   },points);
  }
  async function solve(page,zoom=false){
   if(await page.locator('#start').isVisible())await page.locator('#start').click();
   if(zoom)await page.locator('#zoom').click();
   const selector=zoom?'#zoom-original':'#original';
   const spots=await page.evaluate(()=>JJUDA_PUZZLES[Number(document.querySelector('#stage-picker').value)].spots);
   await pointClicks(page,spots,selector);
   await page.locator('#celebration[open]').waitFor();
  }
  async function wrongPoint(page){
   return page.evaluate(()=>{
    const p=JJUDA_PUZZLES[Number(document.querySelector('#stage-picker').value)];
    for(let y=2;y<100;y+=4)for(let x=2;x<100;x+=4)if(!JjudaGame.hitTest(p,x,y))return {x,y};
    throw Error('fixture has no empty picture location');
   });
  }
  async function lose(page){
   if(await page.locator('#start').isVisible())await page.locator('#start').click();
   const miss=await wrongPoint(page);await pointClicks(page,[miss,miss,miss]);
   await page.locator('#retry-current').waitFor();
   assert.equal(await page.locator('#hearts .empty').count(),3);
   assert.equal(await page.locator('#start').isVisible(),false,'failure offers direct picture buttons without Start');
  }
  async function choiceLayout(page,prefix,position,total=82){
   const viewport=page.viewportSize(),labels=['이전 그림','지금 그림','다음 그림'],choices=['previous','current','next'];
   const rects=[];
   for(let i=0;i<choices.length;i++){
    const button=page.locator(`#${prefix}-${choices[i]}`);await button.waitFor();
    assert.match(await button.innerText(),new RegExp(labels[i]));
    assert.equal(await button.getAttribute('aria-pressed'),null,'picture buttons are actions, not a pending selection');
    assert.equal(await button.isDisabled(),(i===0&&position===1)||(i===2&&position===total));
    const rect=await button.boundingBox();rects.push(rect);
    assert.ok(rect.width>=44&&rect.height>=44,`${prefix}-${choices[i]} has a 44px touch target at ${viewport.width}x${viewport.height}`);
    assert.ok(rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=viewport.width+1&&rect.y+rect.height<=viewport.height+1,`${prefix}-${choices[i]} stays inside the viewport: ${JSON.stringify(rect)}`);
   }
   assert.ok(rects[0].x+rects[0].width<=rects[1].x+1&&rects[1].x+rects[1].width<=rects[2].x+1,'previous/current/next remain ordered side by side');
   const container=page.locator(prefix==='celebration'?'#celebration':'#retry-level-choice');
   assert.equal(await container.locator('button').count(),3,'a result contains exactly three immediate picture actions');
   if(prefix==='celebration')assert.equal(await container.locator('select').count(),0);
  }
  // Existing artwork assets and hit targets retain their original data IDs.
  const photos=await fixture(),totalStages=await photos.page.evaluate(()=>JJUDA_PUZZLES.length);
  assert.equal(totalStages,82);
  assert.deepEqual(await photos.page.evaluate(()=>JJUDA_PUZZLES.map(p=>p.id)),Array.from({length:82},(_,i)=>i+1));
  for(let id=49;id<=62;id++){
   // Enter the round before using the HUD behind the full-screen start menu.
   if(await photos.page.locator('#start').isVisible())await photos.page.locator('#start').click();
   await photos.page.locator('#wallet-menu > summary').click();
   const index=await photos.page.evaluate(id=>JJUDA_PUZZLES.findIndex(p=>p.id===id),id);
   await photos.page.locator('#stage-picker').selectOption(String(index));
   await photos.page.waitForFunction(()=>!document.querySelector('#start').disabled);
   assert.match(await photos.page.locator('#stage-label').innerText(),new RegExp(`${totalStages}.*어려움`));
   // Stage 53 also has a separate car-color layer in both normal and zoom views.
   const layers=id===53?2:1;
   assert.equal(await photos.page.locator('.picture:not(.zoom-picture) .contrast-overlay').count(),layers);
   assert.equal(await photos.page.locator('.zoom-picture .contrast-overlay').count(),layers);
   assert.deepEqual(await photos.page.locator('#original,#difference,.contrast-overlay').evaluateAll(images=>images.map(im=>[im.naturalWidth,im.naturalHeight])),Array.from({length:2+layers*2},()=>[1536,1024]));
  }
  assert.deepEqual(photos.errors,[]);await photos.context.close();
  const f=await fixture(),p=f.page;
  await freshMenu(p,1);
  const before=await p.locator('#stage-picker').inputValue();
  const first=await current(p),targetCount=first.targets;
  await solve(p,true);
  assert.match(await p.locator('#celebration-title').innerText(),/축하/);
  assert.equal(await p.locator('#celebration-confetti i').count(),20);
  assert.equal(await p.locator('#zoom-dialog').evaluate(d=>d.open),false);
  assert.equal(await p.locator('#solved-total').innerText(),'1');
  assert.equal(await p.locator('#found-count').innerText(),String(targetCount));
  assert.equal(await p.locator('#celebration-count').innerText(),`${targetCount} / ${targetCount}`);
  assert.deepEqual(await p.evaluate(()=>spotScores),[{owner:'member-a',stage:first.id}],'completed puzzle saves its original data ID for the starting member');
  await p.waitForTimeout(350);
  const box=await p.locator('#celebration').boundingBox();assert.ok(box.height<500,'celebration stays compact on a phone');assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);
  await choiceLayout(p,'celebration',1);
  await p.screenshot({path:'/tmp/spot-celebration-mobile.png'});
  await p.waitForTimeout(2600);
  assert.equal(await p.locator('#stage-picker').inputValue(),before,'completed round waits for an explicit level choice');
  assert.equal((await saved(p)).current,first.index,'finishing alone does not advance saved progress');
  const loading=f.holdImages();
  await p.locator('#celebration-next').click();
  await loading.waitForRequest();
  await p.waitForFunction(before=>document.querySelector('#stage-picker').value!==before,before);
  assert.equal(await p.locator('#start').isDisabled(),true,'wait for the next picture to load');
  assert.equal(await p.locator('#time-left').innerText(),'60','loading does not consume the next round');
  loading.release();await started(p,2);
  // Dismissing the result never navigates to another level.
  await solve(p);const currentValue=await p.locator('#stage-picker').inputValue();
  await choiceLayout(p,'celebration',2);
  await p.keyboard.press('Escape');await p.waitForTimeout(2600);
  assert.equal(await p.locator('#stage-picker').inputValue(),currentValue);
  assert.equal((await saved(p)).current,Number(currentValue),'closing a result keeps that picture');
  await p.reload();await freshMenu(p,2);
  assert.equal(await p.locator('#solved-total').innerText(),'2','fresh reentry retains completed picture history');
  await p.locator('#start').click();
  await pointClicks(p,[await p.evaluate(()=>JJUDA_PUZZLES[Number(document.querySelector('#stage-picker').value)].spots[0])]);
  await pointClicks(p,[await wrongPoint(p)]);
  assert.equal(await p.locator('#found-count').innerText(),'1');assert.equal(await p.locator('#hearts .empty').count(),1);
  await p.goto('about:blank');await p.goto(gameUrl);await freshMenu(p,2);
  await solve(p);await choose(p,'celebration','current',2);
  await lose(p);await choiceLayout(p,'retry',2);await choose(p,'retry','previous',1);
  await lose(p);await choiceLayout(p,'retry',1);await choose(p,'retry','next',2);
  await lose(p);await choose(p,'retry','current',2);
  await solve(p);await choose(p,'celebration','next',3);
  await solve(p);await choose(p,'celebration','previous',2);
  await p.reload();await freshMenu(p,2);
  assert.deepEqual(f.errors,[]);await f.context.close();

  // Loading callbacks from an abandoned picture cannot enable or start a newer
  // picture. Navigation uses the existing menu event, without progress injection.
  const stale=await fixture(),sp=stale.page;
  await solve(sp);
  const assetPaths=async id=>sp.evaluate(id=>{
   const p=JJUDA_PUZZLES.find(p=>p.id===id),layers=p.layers||(p.contrast?[p.contrast]:[]);
   return [...new Set([p.original,p.difference,...layers.map(layer=>layer.image)].map(src=>new URL(src,location.href).pathname))];
  },id);
  const secondAssets=await assetPaths(2),thirdAssets=await assetPaths(3);
  const abandoned=stale.holdImages(url=>secondAssets.includes(url));
  await sp.locator('#celebration-next').click();await abandoned.waitForRequest();
  await sp.evaluate(()=>{window.abandonedImageEvents=[...document.querySelectorAll('#original,#difference,.picture:not(.zoom-picture) .contrast-overlay')].map(image=>({load:image.onload,error:image.onerror}));});
  const latest=stale.holdImages(url=>thirdAssets.includes(url));
  await sp.locator('#stage-picker').evaluate(select=>{select.value=String(JJUDA_PUZZLES.findIndex(p=>p.id===3));select.dispatchEvent(new Event('change',{bubbles:true}));});
  await latest.waitForRequest();
  await sp.evaluate(()=>abandonedImageEvents.forEach(events=>events.load?.(new Event('load'))));
  abandoned.release();
  assert.equal((await current(sp)).id,3);assert.equal(await sp.locator('#start').isDisabled(),true,'old onload cannot mark a new picture ready');
  assert.equal(await sp.locator('#time-left').innerText(),'60');assert.equal((await saved(sp)).rounds[3].status,'ready');
  latest.release();await sp.waitForFunction(()=>!document.querySelector('#start').disabled);
  await sp.evaluate(()=>abandonedImageEvents.forEach(events=>events.error?.(new Event('error'))));
  assert.equal(await sp.locator('#load-error').isVisible(),false,'old image errors cannot replace the latest image');
  assert.equal(await sp.locator('#start').isVisible(),true,'superseded auto-start is cancelled');
  await sp.locator('#start').click();await started(sp,3);
  assert.deepEqual(stale.errors,[]);await stale.context.close();

  // Clear every real picture and click Next, proving the complete difficulty/ID
  // sequence and the last boundary without rewriting storage or game helpers.
  const final=await fixture(),fp=final.page;await fp.emulateMedia({reducedMotion:'reduce'});
  const catalog=await fp.evaluate(()=>JJUDA_PUZZLES.map((p,index)=>({index,id:p.id,difficulty:p.difficulty||'normal',targets:p.spots.length})));
  assert.deepEqual(catalog.reduce((groups,p)=>(groups[p.difficulty]=(groups[p.difficulty]||0)+1,groups),{}),{normal:48,hard:14,'very-hard':20});
  const ranks={normal:0,hard:1,'very-hard':2},sequence=[...catalog].sort((a,b)=>ranks[a.difficulty]-ranks[b.difficulty]||a.id-b.id);
  const expectedOrder=sequence.map(p=>p.index);
  assert.deepEqual(await fp.locator('#stage-picker option').evaluateAll(options=>options.map(option=>Number(option.value))),expectedOrder,'menu order matches normal, hard and very-hard, then ascending ID');
  assert.deepEqual((await saved(fp)).order,expectedOrder,'saved order is deterministic');
  for(let position=0;position<sequence.length;position++){
   const expected=sequence[position],picture=await current(fp);
   assert.equal(picture.id,expected.id,`picture ${position+1} follows the specified sequence`);
   assert.match(await fp.locator('#stage-label').innerText(),new RegExp(`${String(position+1).padStart(2,'0')} / 82.*${{normal:'보통',hard:'어려움','very-hard':'매우 어려움'}[expected.difficulty]}`));
   await solve(fp);
   assert.equal(await fp.locator('#found-count').innerText(),String(expected.targets));
   assert.equal(await fp.locator('#celebration-count').innerText(),`${expected.targets} / ${expected.targets}`);
   assert.equal(await fp.locator('.picture:not(.zoom-picture)[data-side=original] .mark').count(),expected.targets,'all original hit coordinates remain valid');
   assert.equal((await saved(fp)).current,expected.index);
   if(position<sequence.length-1)await choose(fp,'celebration','next',sequence[position+1].id);
  }
  assert.match(await final.page.locator('#celebration-title').innerText(),/모든 그림/);
  assert.equal(await final.page.locator('#solved-total').innerText(),String(totalStages));
  assert.equal(await final.page.locator('#celebration-confetti').isVisible(),false);
  const last=await final.page.locator('#stage-picker').inputValue();await final.page.waitForTimeout(2600);
  assert.equal(await final.page.locator('#stage-picker').inputValue(),last,'last stage has no invalid or repeated next stage');
  await choiceLayout(fp,'celebration',82);
  assert.deepEqual(await fp.evaluate(()=>spotScores),sequence.map(p=>({owner:'member-a',stage:p.id})),'every server clear keeps the original data ID');
  assert.deepEqual((await saved(fp)).completed,[...catalog.map(p=>p.id)],'completed history stores real IDs');
  await choose(fp,'celebration','current',82);
  assert.equal(await fp.locator('#solved-total').innerText(),'82','replaying does not erase completed history');
  await fp.reload();await freshMenu(fp,82);
  await lose(fp);await choiceLayout(fp,'retry',82);await choose(fp,'retry','previous',81);
  assert.deepEqual(final.errors,[]);await final.context.close();

  // The phone layout is checked above; include small phones, landscape and desktop.
  for(const viewport of [{width:320,height:568},{width:844,height:390},{width:1280,height:900}]){
   const screen=await fixture(viewport),page=screen.page;await page.emulateMedia({reducedMotion:'reduce'});
   await freshMenu(page,1);await solve(page);await choiceLayout(page,'celebration',1);
   await choose(page,'celebration','next',2);await lose(page);await choiceLayout(page,'retry',2);
   await choose(page,'retry','previous',1);assert.deepEqual(screen.errors,[]);await screen.context.close();
  }
  // Purchased help must not disqualify the completed round from rankings.
  for(const kind of ['hint','time']){
   const paid=await fixture(),page=paid.page;
   await page.evaluate(()=>{
    JjudaWallet.getState=()=>({ready:true,userId:'member-a',coins:100});
    window.purchases=[];
    JjudaWallet.buy=async(request,stage)=>{purchases.push(request.kind);return {ok:true,kind:request.kind,stage,spot:request.spot,price:1,extend_ms:60000};};
   });
   page.on('dialog',dialog=>dialog.accept());
   if(kind==='time')await page.clock.install();
   await page.locator('#start').click();
   if(kind==='time')await page.clock.runFor(51000);
   await page.locator('#zoom').click();await page.locator('#zoom-more').click();await page.locator('#zoom-level').selectOption('2');
   // Let resize scroll events finish before panning, then observe both panes.
   if(kind==='time')await page.clock.runFor(100);else await page.waitForTimeout(100);
   const pan=await page.locator('#zoom-scroll-a').evaluate(el=>{const panes=[...document.querySelectorAll('.zoom-scroll')],x=Math.min(213,...panes.map(p=>p.scrollWidth-p.clientWidth)),y=Math.min(167,...panes.map(p=>p.scrollHeight-p.clientHeight));el.scrollLeft=x;el.scrollTop=y;return {x,y};});
   if(kind==='time')await page.clock.runFor(100);
   await page.waitForFunction(({x,y})=>[...document.querySelectorAll('.zoom-scroll')].every(el=>el.scrollLeft===x&&el.scrollTop===y),pan);
   const zoomState=()=>page.evaluate(()=>({level:document.querySelector('#zoom-level').value,panes:[...document.querySelectorAll('.zoom-scroll')].map(el=>[el.scrollLeft,el.scrollTop,el.clientWidth,el.clientHeight]),pictures:[...document.querySelectorAll('.zoom-picture')].map(el=>[el.getBoundingClientRect().width,el.getBoundingClientRect().height])}));
   const beforePayment=await zoomState();
   await page.locator(kind==='hint'?'#zoom-hint':'#zoom-extend').click();
   await page.waitForFunction(()=>{const saved=JSON.parse(localStorage.getItem('jjuda-spot-six-v1'));return Object.values(saved.rounds).some(r=>r.assisted&&!r.pending);});
   assert.deepEqual(await page.evaluate(()=>purchases),[kind]);
   assert.equal(await page.locator('#zoom-dialog').evaluate(d=>d.open),true,'paying keeps the enlarged view open');
   assert.deepEqual(await zoomState(),beforePayment,'payment preserves zoom scale, picture dimensions and pan');
   if(kind==='hint'){
    assert.equal(await page.locator('.hint-mark').count(),4,'paid hint automatically appears in both views');
    await page.waitForTimeout(3800);assert.equal(await page.locator('.hint-mark').count(),4,'hint ring persists beyond the old expiry');
    assert.equal(await page.locator('.hint-mark').first().evaluate(el=>getComputedStyle(el).borderStyle),'dashed');
    assert.equal(await page.locator('.hint-mark').first().evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.width-r.height)<1;}),true,'hint stays circular');
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.hint-mark').first().evaluate(el=>getComputedStyle(el).animationName),'none');
   }
   await page.locator('#close-zoom').click();
   const completedStage=(await current(page)).id;await solve(page);
   assert.equal(await page.locator('.hint-mark').count(),0,'found answers leave no hint effects');
   assert.deepEqual(await page.evaluate(()=>spotScores),[{owner:'member-a',stage:completedStage}],kind+' purchase still records the completed score');
   assert.doesNotMatch(await page.locator('#message').innerText(),/순위에 반영하지/);
   assert.deepEqual(paid.errors,[]);await paid.context.close();
  }
  const host=await browser.newPage();await host.route('**/*',route=>route.fulfill({body:'<!doctype html><body></body>',contentType:'text/html'}));await host.goto('https://fixture.test/');
  await host.addScriptTag({path:path.join(root,'world-spot-game.js')});
  await host.evaluate(()=>{window.recorded=[];window.hostFail=false;OjjudaSpotGame.open({onClear:async(stage,owner)=>{if(hostFail)throw Error('offline');recorded.push({stage,owner})}});window.scoreMessage=(stage,origin=location.origin,fromFrame=true)=>dispatchEvent(new MessageEvent('message',{origin,source:fromFrame?document.querySelector('iframe').contentWindow:window,data:{type:'ojjuda:spot-clear',stage,owner:'member-a'}}));for(const invalid of [0,83,82.5,'82'])scoreMessage(invalid);scoreMessage(6,'https://other.test');scoreMessage(6,location.origin,false);for(const stage of [62,63,82])scoreMessage(stage);});
  await host.waitForFunction(()=>recorded.length===3);assert.deepEqual(await host.evaluate(()=>recorded),[62,63,82].map(stage=>({stage,owner:'member-a'})),'only valid old/new scores from the same-origin game frame are accepted');
  await host.evaluate(()=>{hostFail=true;scoreMessage(6)});await host.getByRole('button',{name:'완료 기록 다시 저장',exact:true}).waitFor();await host.evaluate(()=>hostFail=false);await host.getByRole('button',{name:'완료 기록 다시 저장',exact:true}).click();await host.waitForFunction(()=>recorded.length===4);assert.equal(await host.evaluate(()=>recorded[3].stage),6);
  await host.evaluate(()=>{window.rpcScores=[];window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'member-a'}}}}),onAuthStateChange(fn){window.walletAuth=fn}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{coins:0}})})})}),rpc:(name,args)=>({abortSignal:async()=>{rpcScores.push({name,...args});return{data:{ok:true}}}})})};});
  await host.addScriptTag({path:path.join(root,'games/spot-difference/wallet.js')});await host.waitForFunction(()=>JjudaWallet.getState().coins===0);
  assert.equal(await host.evaluate(async()=>{try{await JjudaWallet.recordClear('other-member',6);return false}catch{return true}}),true,'standalone score rejects another account');
  for(const stage of [0,83,82.5,'82'])assert.equal(await host.evaluate(async stage=>{try{await JjudaWallet.recordClear('member-a',stage);return false}catch{return true}},stage),true,'standalone score rejects invalid stage bounds');
  await host.evaluate(async()=>{for(const stage of [62,63,82])await JjudaWallet.recordClear('member-a',stage);});assert.deepEqual(await host.evaluate(()=>rpcScores),[62,63,82].map(stage=>({name:'record_spot_clear',p_stage:stage})));
  await host.close();
  console.log('PASS: fixed 82-picture difficulty/ID sequence, fresh last-picture reentry, direct result choices, four responsive layouts, image loading races, celebrations, zoom/payment safeguards and original server IDs');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
