const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'');
world=world.replace('<script type="module">','<script src="/screw-loader.js"></script><script src="/world-navigation.js"></script><script type="module">');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`window.screwWorld={open:Al,close:El,current:()=>R};g.tab='friends';H();`+world.slice(world.indexOf('</script>',boot));
const qa=process.env.SCREW_MODES_QA_DIR;if(qa)fs.mkdirSync(qa,{recursive:true});
const font=process.env.SCREW_QA_FONT;
if(font)world=world.replace('</head>','<style>@font-face{font-family:"Noto Sans KR";src:url("/fixture-korean.ttf")}body,button{font-family:"Noto Sans KR",sans-serif}</style></head>');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
   if(u.pathname==='/fixture-korean.ttf'&&font)return route.fulfill({contentType:'font/ttf',path:font});
   const file=path.join(root,u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const engineRequests=[];page.on('request',request=>{const file=new URL(request.url()).pathname;if(/(?:matter-0|screw3d|screw-flat(?:-physics|-pictures)?\.js)/.test(file))engineRequests.push(file);});
  await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.screwWorld);
  assert.deepEqual(engineRequests,[],'the World does not request game engines before play');
  if(font)await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{localStorage.setItem('ojjuda-screw-stage','5');localStorage.removeItem('ojjuda-screw-flat-stage-v1');localStorage.removeItem('ojjuda-screw-flat-pictures-v1')});
  for(const size of [{width:320,height:568},{width:390,height:844},{width:1280,height:900}]){
   await page.setViewportSize(size);await page.evaluate(()=>screwWorld.open('screw'));
   assert.equal(await page.locator('[data-g=screw-start]').count(),2,'the existing game opens exactly two version choices');
   assert.equal(await page.evaluate(()=>screwWorld.current().running),false,'the chooser does not start a game');
   assert.equal(await page.locator('[data-g=screw-modes]').isVisible(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   for(const mode of ['box','flat']){
    const button=page.locator(`[data-g=screw-start][data-mode=${mode}]`);await button.scrollIntoViewIfNeeded();
    const b=await button.boundingBox();assert.ok(b.width>150 && b.height>80,'both version choices are substantial touch targets');
    assert.ok(b.x>=0 && b.x+b.width<=size.width && b.y>=0 && b.y+b.height<=size.height,'both choices remain reachable on the screen');
   }
   if(qa&&size.width===390)await page.locator('#gov').screenshot({path:path.join(qa,'screw-version-menu.png')});
   if(!engineRequests.length){
    await page.route('**/vendor/matter-0.20.0.min.js',route=>route.abort(),{times:1});
    await page.locator('[data-mode=flat]').click();
    await page.getByRole('button',{name:'다시 시도',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>screwWorld.current().running),false);
    await page.getByRole('button',{name:'다시 시도',exact:true}).click();
   }else await page.locator('[data-mode=flat]').click();
   await page.waitForFunction(()=>screwWorld.current()?.game?.state);
   await page.waitForFunction(()=>{const img=OjjudaFlatPictures.preload(screwWorld.current().game.state.level.picture).img;return img.complete&&img.naturalWidth>0;});
   assert.deepEqual(await page.evaluate(()=>screwWorld.current().game.state.level.holes.filter(h=>h.owner===null).map(h=>h.y)),[100,100,100],'only the three top spare holes appear; none flank the picture');
   assert.equal(await page.locator('#gov').getAttribute('data-screw-mode'),'flat');
   assert.match(await page.locator('.ghead .gt').innerText(),/평면형/);
   assert.equal(await page.locator('.ghead').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'mode title, score and controls fit the phone header');
   assert.equal(await page.locator('[data-g=screw-modes]').isVisible(),true);
   const counter=await page.evaluate(()=>{
    const r=screwWorld.current(),original=r.ctx.fillText;let label;
    r.ctx.fillText=function(text,x,y,...args){if(String(text).startsWith('남은 이동 '))label={text,font:this.font,color:this.fillStyle,x,y};return original.call(this,text,x,y,...args);};
    try{r.game.draw(r.ctx);}finally{r.ctx.fillText=original;}return label;
   });
   assert.equal(counter.text,'남은 이동 8회');assert.ok(parseFloat(counter.font.match(/([\d.]+)px/)[1])>=18,'the remaining moves use large type');
   assert.equal(counter.x,180);assert.ok(counter.y<68,'the remaining counter sits above the spare holes');assert.equal(counter.color,'#ffffff');
   if(qa&&[320,390].includes(size.width))await page.locator('#gov').screenshot({path:path.join(qa,`screw-flat-covered-${size.width}.png`)});
   await page.locator('[data-g=screw-modes]').click();
   if(size.width===320)assert.equal(engineRequests.includes('/screw3d.js'),false,'flat play does not download the box engine');
   await page.locator('[data-mode=box]').click();
   await page.waitForFunction(()=>screwWorld.current()?.running&&window.__ojjScrew3d);
   assert.equal(await page.evaluate(()=>window.__ojjScrew3d.L),5,'the box version keeps the pre-existing stage');
   assert.match(await page.locator('.ghead .gt').innerText(),/박스형/);
   assert.equal(await page.locator('.ghead').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   await page.locator('[data-g=screw-modes]').click();await page.locator('[data-mode=flat]').click();
   assert.equal(await page.evaluate(()=>screwWorld.current().game.state.L),1,'switching versions never overwrites flat progress');
   let exitPrompt;page.once('dialog',async dialog=>{exitPrompt=dialog.message();await dialog.accept();});
   await page.locator('[data-g=close]').click();assert.match(exitPrompt,/게임을 나갈까요/);assert.equal(await page.locator('#gov').count(),0);
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{localStorage.setItem(OjjudaScrewGames.STAGE_KEY,'4');screwWorld.open('screw');});await page.locator('[data-mode=flat]').click();
  const canvas=page.locator('#gcv');
  const touch=async q=>{const b=await canvas.boundingBox();await page.touchscreen.tap(b.x+q.x*b.width/360,b.y+q.y*b.height/540);};
  const drawnText=()=>page.evaluate(()=>{
   const r=screwWorld.current(),original=r.ctx.fillText,labels=[];
   r.ctx.fillText=function(text,...args){labels.push(String(text));return original.call(this,text,...args);};
   try{r.game.draw(r.ctx);}finally{r.ctx.fillText=original;}return labels.join(' ');
  });
  // Releasing the upper piece first leaves it resting on the lower piece.
  for(const [id,to] of [[0,0],[1,1]]){
   const points=await page.evaluate(({id,to})=>{const level=screwWorld.current().game.state.level;return[OjjudaScrewGames.screwPoint(level.screws[id]),{x:level.holes[to].x,y:level.holes[to].y}];},{id,to});
   for(const q of points)await touch(q);
   await page.evaluate(()=>{const r=screwWorld.current();for(let n=0;n<180;n++)r.game.update(.05);r.game.draw(r.ctx);});
  }
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.plates[0].state),'loose','the released top plate remains supported by another metal plate');
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.score),0,'a supported plate never clears on a timer');
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.physics.engine.pairs.list.some(pair=>pair.isActive)),true);
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-supported.png')});
  assert.equal((await drawnText()).includes('되돌리기'),false,'the flat game has no undo button');
  await touch({x:82,y:514});assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.plates[0].state),'loose','the former undo area cannot restore its pivot');
  await touch({x:297,y:514});
  // Park the bottom screws back on the empty board, then swing the middle plate onto one.
  const bottom=await page.evaluate(()=>screwWorld.current().game.state.level.screws.slice(4).map(s=>s.startHole));
  const touchMove=async(id,to)=>{
   const points=await page.evaluate(({id,to})=>{const level=screwWorld.current().game.state.level;const game=screwWorld.current().game;return[game.screenPoint(level.screws[id].hole),game.screenPoint(level.holes[to])];},{id,to});
   for(const q of points)await touch(q);
   await page.evaluate(()=>{const r=screwWorld.current();for(let n=0;n<180;n++)r.game.update(.05);r.game.draw(r.ctx);});
   assert.equal(await page.evaluate(id=>screwWorld.current().game.state.level.screws[id].hole.id,id),to);
  };
  for(const [id,to] of [[4,0],[5,1],[4,bottom[0]],[5,bottom[1]],[2,0]])await touchMove(id,to);
  const caught=await page.evaluate(()=>{
   const st=screwWorld.current().game.state,p=st.level.plates[1];
   return{angle:p.angle,state:p.state,contact:st.physics.engine.pairs.list.some(pair=>pair.isActive&&[pair.bodyA.label,pair.bodyB.label].includes('screw-4'))};
  });
  assert.equal(caught.state,'hinged');assert.ok(caught.contact,'the middle plate hits a screw below, even after its original plate has gone');
  assert.ok(Math.abs(caught.angle)<.2,'a parked screw blocks the swinging plate');
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-caught-by-screw.png')});
  await touchMove(4,2);
  assert.ok(await page.evaluate(()=>Math.abs(screwWorld.current().game.state.level.plates[1].angle)>.8),'moving the supporting screw lets the plate swing down');
  await touch({x:82,y:514});
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.screws[4].hole.id),2,'a removed undo control cannot move a screw back');
  await touch({x:297,y:514});
  const order=await page.evaluate(()=>screwWorld.current().game.state.level.order.slice());
  for(const [index,id] of order.entries()){
   const move=await page.evaluate(id=>{
    const level=screwWorld.current().game.state.level,s=level.screws[id];
    if(!OjjudaScrewGames.canUnscrew(level,s))throw Error('Blocked solution screw');
    const to=level.holes.find(h=>h.screw===null&&OjjudaScrewGames.bareHole(level,h));
    if(!to)throw Error('No free board hole');return{screw:id,to:to.id,q:OjjudaScrewGames.screwPoint(s),target:{x:to.x,y:to.y}};
   },id);
   const b=await canvas.boundingBox();await page.touchscreen.tap(b.x+move.q.x*b.width/360,b.y+move.q.y*b.height/540);
   assert.equal(await page.evaluate(()=>screwWorld.current().game.state.selected),move.screw,'the first phone tap selects a screw');
   if(qa&&index===0)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-selected.png')});
   await page.touchscreen.tap(b.x+move.target.x*b.width/360,b.y+move.target.y*b.height/540);
   await page.evaluate(()=>{const r=screwWorld.current();for(let n=0;n<60;n++)r.game.update(.05);r.game.draw(r.ctx)});
   assert.equal(await page.evaluate(move=>screwWorld.current().game.state.level.screws[move.screw].hole.id,move),move.to,'the second tap inserts the screw into the empty hole');
   if(qa&&index===0)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-hinged.png')});
  }
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.complete),true,'touch relocation removes every plate and reveals the picture');
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-revealed.png')});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem(OjjudaFlatPictures.COLLECTION_KEY))),['puppy-beach'],'a real puzzle completion earns its picture');
  await touch({x:311,y:26});assert.equal(await page.evaluate(()=>screwWorld.current().game.state.albumOpen),true);
  const lockedNames=await page.evaluate(()=>OjjudaFlatPictures.PICTURES.filter(p=>!screwWorld.current().game.state.collection.has(p.id)).map(p=>p.name));
  const albumLabels=await drawnText();for(const name of lockedNames)assert.equal(albumLabels.includes(name),false,'the locked album does not spoil picture subjects');
  await touch({x:240,y:130});assert.equal(await page.evaluate(()=>screwWorld.current().game.state.albumPicture),null,'locked pictures cannot be previewed');
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-album-first.png')});
  await touch({x:240,y:264});assert.equal(await page.evaluate(()=>screwWorld.current().game.state.albumPicture),3);
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-album-picture.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#gov').count(),1,'Escape returns from artwork without closing the game');
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.albumPicture),null);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>screwWorld.current().game.state.albumOpen),false);
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>screwWorld.current().game.state.L),5);
  await page.locator('[data-g=screw-modes]').click();await page.locator('[data-mode=flat]').click();
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.L),5,'reopening continues the flat version independently');
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.collection.has('puppy-beach')),true,'the earned artwork survives reopening');
  const outlines=[];
  for(let stage=11;stage<=17;stage++){
   await page.setViewportSize({width:390,height:844});
   await page.evaluate(stage=>localStorage.setItem(OjjudaScrewGames.STAGE_KEY,String(stage)),stage);
   await page.locator('[data-g=screw-modes]').click();await page.locator('[data-mode=flat]').click();
   outlines.push(await page.evaluate(()=>screwWorld.current().game.state.level.shape));
   await page.evaluate(()=>new Promise(requestAnimationFrame));
   if(qa)await page.locator('#gov').screenshot({path:path.join(qa,`screw-flat-shape-${stage}.png`)});
   if(stage===11){
    await page.waitForFunction(()=>{const img=OjjudaFlatPictures.preload(screwWorld.current().game.state.level.picture).img;return img.complete&&img.naturalWidth>0;});
    const title=await drawnText();assert.ok(title.includes('숨은 그림'));assert.equal(title.includes('별바다 고래'),false,'the stage title keeps the surprise');
    const masking=await page.evaluate(()=>{
     const r=screwWorld.current(),st=r.game.state,P=OjjudaFlatPhysics;
     let point;
     for(let y=174;y<450&&!point;y+=9)for(let x=55;x<305;x+=9)if(st.level.silhouette.every(poly=>P.polygonDistance(poly,x,y)>18)){point={x,y};break;}
     if(!point)throw Error('No outside sample');
     const pixel=()=>{const t=r.ctx.getTransform();return [...r.ctx.getImageData(Math.round(t.a*point.x+t.c*point.y+t.e),Math.round(t.b*point.x+t.d*point.y+t.f),1,1).data];};
     r.game.draw(r.ctx);const before=pixel();st.complete=true;r.game.draw(r.ctx);const after=pixel();st.complete=false;r.game.draw(r.ctx);
     return{before,after,order:st.level.order.slice(0,2)};
    });
    assert.deepEqual(masking.before,[222,211,199,255],'picture pixels never leak outside the covered silhouette');
    assert.notDeepEqual(masking.after,masking.before,'finishing reveals the full picture outside the silhouette too');
    for(const [index,id] of masking.order.entries())await touchMove(id,index);
    assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.plates.filter(p=>p.state==='gone').length),1,'a flower petal drops using real phone taps');
    if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-flower-partly-revealed.png')});
   }
  }
  assert.equal(new Set(outlines).size,7,'seven different outer metal shapes render on mobile');
  for(const [stage,name] of [[80,'별'],[140,'나비'],[220,'구름'],[320,'초승달'],[450,'로켓'],[650,'십자']]){
   await page.evaluate(stage=>localStorage.setItem(OjjudaScrewGames.STAGE_KEY,String(stage)),stage);
   await page.locator('[data-g=screw-modes]').click();await page.locator('[data-mode=flat]').click();
   assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.shape),name);
   await page.evaluate(()=>new Promise(requestAnimationFrame));
   if(qa)await page.locator('#gov').screenshot({path:path.join(qa,`screw-flat-new-shape-${stage}.png`)});
   const first=await page.evaluate(()=>screwWorld.current().game.state.level.order.slice(0,2));
   for(const [index,id] of first.entries())await touchMove(id,index);
   assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.plates.filter(p=>p.state==='gone').length),1,'each new outline releases a real metal piece');
  }
  for(const [stage,width,pieces] of [[501,320,28],[1000,390,50]]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(stage=>localStorage.setItem(OjjudaScrewGames.STAGE_KEY,String(stage)),stage);
   await page.locator('[data-g=screw-modes]').click();await page.locator('[data-mode=flat]').click();
   const advanced=await page.evaluate(()=>{
    const r=screwWorld.current(),st=r.game.state;r.ctx.save();r.ctx.font='700 16px "Noto Sans KR",sans-serif';
    const titleWidth=r.ctx.measureText(`${st.L}/${OjjudaScrewGames.LAST_STAGE}단계 · ${st.level.name}`).width;r.ctx.restore();
    return{stage:st.L,pieces:st.level.plates.length,spares:st.level.holes.filter(h=>h.owner===null).length,titleWidth,order:st.level.order.slice(0,2)};
   });
   assert.equal(advanced.stage,stage);assert.equal(advanced.pieces,pieces);assert.equal(advanced.spares,3);
   assert.ok(advanced.titleWidth<251,'the full stage counter fits beside the album button');
   if(qa)await page.locator('#gov').screenshot({path:path.join(qa,`screw-flat-stage-${stage}.png`)});
   for(const [index,id] of advanced.order.entries())await touchMove(id,index);
   assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.plates.filter(p=>p.state==='gone').length),1,'small advanced pieces can be selected and released by phone taps');
   await touch({x:297,y:514});
   assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.plates.filter(p=>p.state==='gone').length),0,'retry starts the advanced stage again');
   if(stage===1000){
    await touch({x:240,y:26});assert.ok(await page.evaluate(()=>screwWorld.current().game.state.view.zoom>2),'dense puzzles can enlarge the screws');
    const beforePan=await page.evaluate(()=>{const s=screwWorld.current().game.state;return{...s.view,moves:s.moves};}),box=await canvas.boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.45,{steps:8});await page.mouse.up();
    const afterPan=await page.evaluate(()=>{const s=screwWorld.current().game.state;return{...s.view,moves:s.moves};});
    assert.notEqual(afterPan.x,beforePan.x);assert.notEqual(afterPan.y,beforePan.y);assert.equal(afterPan.moves,beforePan.moves,'panning never spends a move');
    const visible=await page.evaluate(()=>{const g=screwWorld.current().game;return g.state.level.screws.find(s=>{const q=g.screenPoint(s.hole);return q.x>50&&q.x<310&&q.y>180&&q.y<460&&OjjudaScrewGames.canUnscrew(g.state.level,s);}).id;});
    await touchMove(visible,0);assert.equal(await page.evaluate(()=>screwWorld.current().game.state.moves),1,'an enlarged screw relocates through real phone taps');
    if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-stage-1000-zoom.png')});
    await touch({x:240,y:26});assert.equal(await page.evaluate(()=>screwWorld.current().game.state.view.zoom),1);
   }
  }
  if(qa){
   await page.evaluate(()=>{const r=screwWorld.current();r.game.destroy();localStorage.setItem(OjjudaScrewGames.STAGE_KEY,'34');r.game=OjjudaScrewGames.flat({setScore(){},end(){}});r.game.draw(r.ctx);});
   await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-mosaic.png')});
  }
  // Decode and display every shipped artwork, then exercise the small-phone album.
  for(let stage=1;stage<=6;stage++){
   await page.evaluate(stage=>{
    const r=screwWorld.current();r.game.destroy();localStorage.setItem(OjjudaScrewGames.STAGE_KEY,String(stage));
    r.game=OjjudaScrewGames.flat({setScore(){},end(){}});r.game.state.level.plates.forEach(p=>p.state='gone');r.game.update(.05);
   },stage);
   await page.waitForFunction(()=>{const img=OjjudaFlatPictures.preload(screwWorld.current().game.state.level.picture).img;return img.complete&&img.naturalWidth>0;});
   await page.evaluate(()=>{const r=screwWorld.current();r.game.draw(r.ctx);});
   if(qa)await page.locator('#gov').screenshot({path:path.join(qa,`screw-flat-picture-${stage}.png`)});
  }
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.collection.size),6);
  await page.setViewportSize({width:320,height:568});await touch({x:311,y:26});
  await page.evaluate(()=>{const r=screwWorld.current();r.game.draw(r.ctx);});
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-album-320.png')});
  await touch({x:90,y:410});assert.equal(await page.evaluate(()=>screwWorld.current().game.state.albumPicture),4,'the final album row is reachable on a small phone');
  await touch({x:180,y:511});assert.equal(await page.evaluate(()=>screwWorld.current().game.state.albumOpen),false);
  // Exercise the paid-hole control with a test wallet on a small phone.
  await page.evaluate(()=>{
   const r=screwWorld.current();r.game.destroy();localStorage.setItem(OjjudaScrewGames.STAGE_KEY,'5');
   const wallet=window.flatHoleWallet={coins:5,buys:0,count:0,moves:0};
   r.game=OjjudaScrewGames.flat({setScore(){},end(){},getUserId:()=> 'flat-ui-fixture',getCoins:()=>wallet.coins,buyScrew:async(kind,id,stage,verify)=>{
    if(!['flat_hole','flat_moves'].includes(kind))throw Error('Wrong upgrade kind');
    if(!verify){wallet.buys++;wallet.coins--;if(kind==='flat_hole')wallet.count++;else wallet.moves++;}
    return{ok:true,stage,count:kind==='flat_hole'?wallet.count:wallet.moves,extra_moves:wallet.moves*3,coins:wallet.coins,price:1};
   }});
  });
  await page.waitForFunction(()=>screwWorld.current().game.state.shopReady);
  assert.ok((await drawnText()).includes('1 ZU'),'the purchase price is visible before tapping');
  for(let count=1;count<=3;count++){
   await touch({x:106,y:514});await page.waitForFunction(n=>screwWorld.current().game.state.extraHoles===n,count);
   assert.equal(await page.evaluate(()=>flatHoleWallet.coins),5-count);
  }
  await touch({x:106,y:514});assert.equal(await page.evaluate(()=>flatHoleWallet.buys),3,'the fourth phone tap cannot make another payment');
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.holes.filter(h=>h.owner===null).length),6);
  await page.evaluate(()=>{const r=screwWorld.current();r.game.draw(r.ctx);});
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-extra-holes-320.png')});
  const paidMove=await page.evaluate(()=>{const l=screwWorld.current().game.state.level;return{id:l.order[0],to:l.holes.find(h=>h.extra).id};});
  await touchMove(paidMove.id,paidMove.to);
  await touch({x:297,y:514});await page.waitForFunction(()=>screwWorld.current().game.state.shopReady);
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.extraHoles),3,'retry retains the paid holes');
  assert.equal(await page.evaluate(()=>flatHoleWallet.buys),3,'restoring holes never charges');
  await page.evaluate(()=>{const s=screwWorld.current().game.state;s.moves=s.moveLimit;});
  assert.ok((await drawnText()).includes('남은 이동 0회'));assert.ok((await drawnText()).includes('+ 이동 3회 · 1 ZU'));
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-no-moves-320.png')});
  await touch({x:206,y:514});await page.waitForFunction(()=>screwWorld.current().game.state.extraMoves===3);
  assert.equal(await page.evaluate(()=>flatHoleWallet.coins),1);assert.ok((await drawnText()).includes('남은 이동 3회'));
  const moveAfterPurchase=await page.evaluate(()=>{const s=screwWorld.current().game.state;return{id:s.level.order[0],to:s.level.holes[0].id};});
  await touchMove(moveAfterPurchase.id,moveAfterPurchase.to);assert.ok((await drawnText()).includes('남은 이동 2회'));
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-moves-added-320.png')});
  assert.equal(engineRequests.filter(p=>p==='/screw3d.js').length,1,'reopening box reuses its module');
  assert.equal(engineRequests.filter(p=>p==='/screw-flat.js').length,1,'reopening flat reuses its engine');
  // A pending download must not reopen a closed game or replace another session.
  const cancelled=await context.newPage();let release,requested;
  const pending=new Promise(resolve=>requested=resolve);
  await cancelled.route('**/screw3d.js?*',async route=>{requested();await new Promise(resolve=>release=resolve);await route.fulfill({path:path.join(root,'screw3d.js'),contentType:'text/javascript'});});
  await cancelled.goto('https://fixture.test/world.html');await cancelled.waitForFunction(()=>window.screwWorld);
  await cancelled.evaluate(()=>screwWorld.open('screw'));await cancelled.locator('[data-mode=box]').click();await pending;
  await cancelled.locator('[data-g=close]').click();release();
  await cancelled.evaluate(()=>OjjudaScrewLoader.load('box'));
  assert.equal(await cancelled.evaluate(()=>screwWorld.current()),null);assert.equal(await cancelled.locator('#gov').count(),0);
  await cancelled.close();
  // Missing artwork must never block screw input or scoring.
  const broken=await context.newPage();await broken.route('**/assets/screw-flat/*.webp',route=>route.abort());
  await broken.goto('https://fixture.test/world.html');await broken.waitForFunction(()=>window.screwWorld);
  await broken.evaluate(()=>{localStorage.setItem('ojjuda-screw-flat-stage-v1','1');screwWorld.open('screw');});await broken.locator('[data-mode=flat]').click();
  await broken.waitForFunction(()=>window.OjjudaFlatPictures?.preload(0).failed&&screwWorld.current()?.running);
  assert.equal(await broken.evaluate(()=>{
   const g=screwWorld.current().game,s=g.state.level.screws[g.state.level.order[0]],h=g.state.level.holes[0];
   for(const q of [s.hole,h]){g.onDown(q.x,q.y);g.onUp(q.x,q.y);}for(let i=0;i<20;i++)g.update(.05);return g.state.moves;
  }),1,'image failure leaves the game playable');await broken.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: six decoded illustrations, earned album and 320px controls, image failure fallback, thirteen outlines, 100-screw phone input and zoom/pan, stage persistence, screw collisions, retry, removed undo and preserved box progress.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
